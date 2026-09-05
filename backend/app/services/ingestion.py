import hashlib
import logging
import math
import re
from pathlib import Path
from typing import List, Sequence, Union

import pymupdf

from app.core.config import settings
from app.schemas.document import (
    EmbeddedChunk,
    IngestionResult,
    ParsedPage,
    TextChunk,
)

logger = logging.getLogger(__name__)


class PDFParser:
    """Extracts text content from PDF documents with page-number tracking."""

    @staticmethod
    def clean_text(raw_text: str) -> str:
        """Sanitizes raw extracted text by normalizing newlines and stripping extraneous spaces."""
        if not raw_text:
            return ""
        # Normalize CRLF to LF
        text = raw_text.replace("\r\n", "\n").replace("\r", "\n")
        # Replace multiple spaces/tabs with single space
        text = re.sub(r"[ \t]+", " ", text)
        # Collapse more than two consecutive newlines into two
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    def extract_pages(self, file_input: Union[str, Path, bytes]) -> List[ParsedPage]:
        """
        Parses a PDF from a filepath or in-memory byte buffer, extracting text page-by-page.
        Page numbers are 1-indexed.
        """
        parsed_pages: List[ParsedPage] = []

        if isinstance(file_input, bytes):
            doc = pymupdf.open(stream=file_input, filetype="pdf")
        else:
            doc = pymupdf.open(str(file_input))

        try:
            for page_idx, page in enumerate(doc, start=1):
                raw_text = page.get_text("text") or ""
                cleaned = self.clean_text(raw_text)
                if cleaned:
                    parsed_pages.append(
                        ParsedPage(
                            page_number=page_idx,
                            text=cleaned,
                            char_count=len(cleaned),
                        )
                    )
                else:
                    logger.debug(f"Page {page_idx} contained no extractable text; skipped.")
        finally:
            doc.close()

        logger.info(f"Extracted {len(parsed_pages)} non-empty pages from PDF.")
        return parsed_pages


class RecursiveTokenChunker:
    """
    Slices document text into discrete semantic segments targeted at ~700 tokens
    with ~100 tokens of sliding context overlap.
    """

    def __init__(
        self,
        target_tokens: int = 700,
        overlap_tokens: int = 100,
        approx_chars_per_token: int = 4,
    ):
        self.target_tokens = target_tokens
        self.overlap_tokens = overlap_tokens
        self.approx_chars_per_token = approx_chars_per_token

        self.max_chunk_chars = target_tokens * approx_chars_per_token  # ~2800 chars
        self.overlap_chars = overlap_tokens * approx_chars_per_token    # ~400 chars

        # Hierarchical separators for natural language splitting
        self.separators = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " "]

    def estimate_tokens(self, text: str) -> int:
        """Heuristic token count estimation (~4 characters per token)."""
        return max(1, math.ceil(len(text) / self.approx_chars_per_token))

    def _split_text(self, text: str, separators: List[str]) -> List[str]:
        """Recursively splits text until all fragments are under max_chunk_chars."""
        if len(text) <= self.max_chunk_chars:
            return [text]

        if not separators:
            # Fallback: hard character slice if no separators remain
            return [
                text[i : i + self.max_chunk_chars]
                for i in range(0, len(text), self.max_chunk_chars)
            ]

        separator = separators[0]
        remaining_separators = separators[1:]

        if separator not in text:
            return self._split_text(text, remaining_separators)

        splits = text.split(separator)
        chunks: List[str] = []
        current_chunk = ""

        for piece in splits:
            if not piece:
                continue

            test_piece = f"{current_chunk}{separator}{piece}" if current_chunk else piece
            if len(test_piece) <= self.max_chunk_chars:
                current_chunk = test_piece
            else:
                if current_chunk:
                    chunks.append(current_chunk)
                if len(piece) > self.max_chunk_chars:
                    sub_chunks = self._split_text(piece, remaining_separators)
                    chunks.extend(sub_chunks)
                    current_chunk = ""
                else:
                    current_chunk = piece

        if current_chunk:
            chunks.append(current_chunk)

        return chunks

    def chunk_page(self, page: ParsedPage, start_index: int = 0) -> List[TextChunk]:
        """
        Chunks a single page's text using recursive splitting and applies a sliding
        overlap window across adjacent chunks.
        """
        raw_chunks = self._split_text(page.text, self.separators)
        if not raw_chunks:
            return []

        chunks: List[TextChunk] = []
        accumulated_text = ""

        for idx, segment in enumerate(raw_chunks):
            if idx == 0:
                chunk_text = segment
            else:
                # Prepend overlap from previous segment if available
                prev_text = raw_chunks[idx - 1]
                overlap_seed = prev_text[-self.overlap_chars :] if len(prev_text) > self.overlap_chars else prev_text
                chunk_text = f"{overlap_seed.strip()} {segment}".strip()

            chunks.append(
                TextChunk(
                    chunk_index=start_index + len(chunks),
                    page_number=page.page_number,
                    content=chunk_text,
                    token_count=self.estimate_tokens(chunk_text),
                )
            )

        return chunks

    def chunk_pages(self, pages: Sequence[ParsedPage]) -> List[TextChunk]:
        """Chunks a sequence of parsed pages, assigning globally sequential chunk indices."""
        all_chunks: List[TextChunk] = []
        for page in pages:
            page_chunks = self.chunk_page(page, start_index=len(all_chunks))
            all_chunks.extend(page_chunks)
        logger.info(f"Generated {len(all_chunks)} chunks across {len(pages)} pages.")
        return all_chunks


class GeminiEmbeddingService:
    """
    Integrates with Google Gemini's embedding API (gemini-embedding-001) via google-genai SDK.
    Generates 768-dimensional float vectors with automatic batching and mock fallback.
    """

    def __init__(
        self,
        api_key: Union[str, None] = None,
        model_name: Union[str, None] = None,
        dimension: int = 768,
        batch_size: int = 50,
    ):
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.model_name = model_name or settings.EMBEDDING_MODEL or "gemini-embedding-001"
        self.dimension = dimension or settings.VECTOR_DIMENSION or 768
        self.batch_size = batch_size

        self.client = None
        self.use_mock = False

        # Detect whether real API key is available or fallback is needed
        if not self.api_key or self.api_key.startswith("your_") or "mock" in self.api_key.lower():
            logger.warning(
                "No valid Gemini API key configured. "
                "GeminiEmbeddingService will run in deterministic mock fallback mode."
            )
            self.use_mock = True
        else:
            try:
                from google import genai

                self.client = genai.Client(api_key=self.api_key)
                logger.info(f"GeminiEmbeddingService initialized with model '{self.model_name}'.")
            except Exception as e:
                logger.warning(
                    f"Failed to initialize google-genai Client ({e}). Falling back to mock embeddings."
                )
                self.use_mock = True

    def _generate_mock_vector(self, text: str) -> List[float]:
        """Generates a deterministic 768-dimensional normalized unit vector based on text content."""
        # Use SHA-256 hash of text to seed deterministic coordinates
        hasher = hashlib.sha256(text.encode("utf-8"))
        digest = hasher.digest()
        vector = []
        for i in range(self.dimension):
            byte_val = digest[i % len(digest)]
            val = ((byte_val + i) % 256) / 255.0 - 0.5
            vector.append(val)

        # Normalize to unit length for cosine similarity
        norm = math.sqrt(sum(x * x for x in vector)) or 1.0
        return [round(x / norm, 6) for x in vector]

    def embed_texts(self, texts: Sequence[str]) -> List[List[float]]:
        """Generates 768-dimensional embeddings for a sequence of text strings."""
        if not texts:
            return []

        if self.use_mock or self.client is None:
            return [self._generate_mock_vector(t) for t in texts]

        embeddings: List[List[float]] = []

        # Batch texts to respect Gemini API request limits
        for i in range(0, len(texts), self.batch_size):
            batch = list(texts[i : i + self.batch_size])
            try:
                # Try primary model name
                response = self.client.models.embed_content(
                    model=self.model_name,
                    contents=batch,
                )
                if hasattr(response, "embeddings") and response.embeddings:
                    for emb in response.embeddings:
                        embeddings.append(emb.values)
                else:
                    logger.warning("Empty embeddings returned from Gemini API, falling back to mock.")
                    embeddings.extend([self._generate_mock_vector(t) for t in batch])
            except Exception as e:
                logger.error(
                    f"Error invoking Gemini embedding model '{self.model_name}': {e}. "
                    "Falling back to mock embeddings for this batch."
                )
                embeddings.extend([self._generate_mock_vector(t) for t in batch])

        return embeddings

    def embed_chunks(self, chunks: Sequence[TextChunk]) -> List[EmbeddedChunk]:
        """Embeds a sequence of TextChunks, returning EmbeddedChunk objects with vector values."""
        if not chunks:
            return []

        texts = [chunk.content for chunk in chunks]
        vectors = self.embed_texts(texts)

        embedded_chunks: List[EmbeddedChunk] = []
        for chunk, vector in zip(chunks, vectors):
            embedded_chunks.append(
                EmbeddedChunk(
                    chunk_index=chunk.chunk_index,
                    page_number=chunk.page_number,
                    content=chunk.content,
                    token_count=chunk.token_count,
                    embedding=vector,
                )
            )

        logger.info(f"Successfully embedded {len(embedded_chunks)} chunks.")
        return embedded_chunks


class IngestionPipeline:
    """
    Unified Ingestion Pipeline Facade:
    Orchestrates PDF parsing, semantic overlapping chunking, and batch embedding.
    """

    def __init__(
        self,
        parser: Union[PDFParser, None] = None,
        chunker: Union[RecursiveTokenChunker, None] = None,
        embedder: Union[GeminiEmbeddingService, None] = None,
    ):
        self.parser = parser or PDFParser()
        self.chunker = chunker or RecursiveTokenChunker()
        self.embedder = embedder or GeminiEmbeddingService()

    def process_pdf(
        self,
        file_input: Union[str, Path, bytes],
        filename: str = "document.pdf",
    ) -> IngestionResult:
        """
        Executes the end-to-end ingestion pipeline:
        1. Extract text page-by-page.
        2. Chunk text into ~700 token segments with ~100 token overlap.
        3. Embed all chunks with Gemini 768-dimensional vectors.
        """
        logger.info(f"Starting ingestion for file: '{filename}'")

        pages = self.parser.extract_pages(file_input)
        if not pages:
            logger.warning(f"No pages extracted from '{filename}'.")
            return IngestionResult(
                filename=filename,
                page_count=0,
                total_chunks=0,
                chunks=[],
            )

        chunks = self.chunker.chunk_pages(pages)
        embedded_chunks = self.embedder.embed_chunks(chunks)

        result = IngestionResult(
            filename=filename,
            page_count=len(pages),
            total_chunks=len(embedded_chunks),
            chunks=embedded_chunks,
        )

        logger.info(
            f"Completed ingestion for '{filename}': {result.page_count} pages -> {result.total_chunks} embedded chunks."
        )
        return result
