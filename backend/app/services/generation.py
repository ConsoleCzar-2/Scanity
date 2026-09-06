import json
import logging
import re
from typing import List, Optional, Tuple

from app.core.config import settings
from app.schemas.query import (
    CitationResponse,
    GroundedAnswerSchema,
    RawCitation,
    RetrievedChunk,
)

logger = logging.getLogger("scanity.generation")

FALLBACK_ANSWER = "Not found in the provided document(s)."


class GenerationService:
    """
    Orchestrates grounded response synthesis using Google Gemini (gemini-3.5-flash-lite)
    with strict JSON Structured Outputs and post-hoc citation integrity verification.
    """

    def __init__(
        self,
        model_name: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> None:
        self.model_name = model_name or settings.LLM_MODEL or "gemini-3.5-flash-lite"
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.client = None
        self.use_mock = False

        if not self.api_key or self.api_key.startswith("your_") or "mock" in self.api_key.lower():
            logger.warning(
                "No valid Gemini API key configured. "
                "GenerationService will run in deterministic mock fallback mode."
            )
            self.use_mock = True
        else:
            try:
                from google import genai

                self.client = genai.Client(api_key=self.api_key)
                logger.info(f"GenerationService initialized with model '{self.model_name}'.")
            except Exception as e:
                logger.warning(
                    f"Failed to initialize google-genai Client ({e}). Falling back to mock generation."
                )
                self.use_mock = True

    def build_prompt(
        self,
        question: str,
        chunks: List[RetrievedChunk],
    ) -> Tuple[str, str]:
        """
        Constructs the constrained system prompt and formatted excerpt context.

        Returns:
            Tuple[str, str]: (system_instruction, contents_payload)
        """
        system_instruction = (
            "You are an enterprise document question-answering assistant. "
            "Your task is to answer the user's question strictly and exclusively based on the provided document excerpts.\n\n"
            "CRITICAL CONSTRAINTS:\n"
            "1. Groundedness: Answer ONLY using facts directly mentioned in the excerpts below. Do NOT extrapolate, speculate, or bring in outside knowledge.\n"
            "2. Fallback: If the provided excerpts do not contain the answer, set 'answer' to 'Not found in the provided document(s).', set 'citations' to an empty list [], and set 'confidence' to 0.0.\n"
            "3. Citations: For every factual claim in your answer, cite the exact chunk_id and page_number from which the claim was obtained.\n"
            "4. Structured Format: You MUST output strictly valid JSON matching the specified schema."
        )

        excerpt_blocks = []
        for idx, chunk in enumerate(chunks, start=1):
            block = (
                f"--- BEGIN DOCUMENT EXCERPT [{idx}] ---\n"
                f"Chunk ID: {chunk.chunk_id}\n"
                f"Document: {chunk.document_filename}\n"
                f"Page: {chunk.page_number}\n"
                f"Content:\n{chunk.content}\n"
                f"--- END DOCUMENT EXCERPT [{idx}] ---"
            )
            excerpt_blocks.append(block)

        context_str = "\n\n".join(excerpt_blocks)
        user_content = (
            f"DOCUMENT EXCERPTS:\n\n{context_str}\n\n"
            f"USER QUESTION:\n{question}\n\n"
            "Produce a factual, grounded answer with exact chunk_id citations conforming strictly to the JSON schema."
        )

        return system_instruction, user_content

    def validate_citations(
        self,
        raw_citations: List[RawCitation],
        candidate_chunks: List[RetrievedChunk],
    ) -> List[CitationResponse]:
        """
        Post-Hoc Citation Integrity Validator:
        Ensures every cited chunk_id mathematically exists in the PostgreSQL candidate set
        retrieved for this specific query. Discards hallucinated citations and enriches
        verified citations with trusted database metadata.
        """
        candidate_map = {str(c.chunk_id): c for c in candidate_chunks}
        validated: List[CitationResponse] = []
        seen_chunks = set()

        for cit in raw_citations:
            cit_id = str(cit.chunk_id).strip()
            if cit_id in candidate_map and cit_id not in seen_chunks:
                seen_chunks.add(cit_id)
                chunk = candidate_map[cit_id]

                # Extract verbatim snippet (first 250 characters)
                raw_text = chunk.content.strip()
                snippet = raw_text[:250] + ("..." if len(raw_text) > 250 else "")

                validated.append(
                    CitationResponse(
                        chunk_id=chunk.chunk_id,
                        document_id=chunk.document_id,
                        original_filename=chunk.document_filename,
                        page_number=chunk.page_number,
                        snippet=snippet,
                        relevance_score=chunk.similarity_score,
                    )
                )
            else:
                logger.warning(
                    f"Post-Hoc Citation Validator discarded unverified or hallucinated chunk_id: '{cit_id}'."
                )

        return validated

    def _mock_generate(
        self,
        question: str,
        chunks: List[RetrievedChunk],
    ) -> Tuple[str, List[CitationResponse], float, bool]:
        """
        Deterministic mock generator for hermetic unit testing and offline development.
        Performs keyword matching against candidate chunks to generate a factual answer,
        valid citations, and realistic confidence scores.
        """
        question_words = set(re.findall(r"\b\w+\b", question.lower()))
        best_chunk: Optional[RetrievedChunk] = None
        best_overlap = 0

        stopwords = {
            "what", "was", "is", "are", "the", "in", "of", "and", "a", "an",
            "for", "to", "with", "by", "on", "at", "from", "how", "why"
        }
        content_query_words = question_words - stopwords

        for chunk in chunks:
            chunk_words = set(re.findall(r"\b\w+\b", chunk.content.lower()))
            overlap = len(content_query_words.intersection(chunk_words))
            if overlap > best_overlap:
                best_overlap = overlap
                best_chunk = chunk

        # If significant keyword overlap exists in candidate chunks
        if best_chunk and best_overlap >= 2:
            # Extract first substantive sentence from the chunk content
            lines = [line.strip() for line in best_chunk.content.split("\n") if line.strip() and not line.startswith("===")]
            answer_text = lines[0] if lines else best_chunk.content[:150]

            raw_citations = [RawCitation(chunk_id=str(best_chunk.chunk_id), page_number=best_chunk.page_number)]
            validated = self.validate_citations(raw_citations, chunks)

            return answer_text, validated, 0.92, True

        # Otherwise, query cannot be answered from candidate chunks
        return FALLBACK_ANSWER, [], 0.0, False

    async def generate_grounded_answer(
        self,
        question: str,
        candidate_chunks: List[RetrievedChunk],
    ) -> Tuple[str, List[CitationResponse], float, bool]:
        """
        Main generation entrypoint:
        1. Validates candidates.
        2. Prompts Gemini 3.5 Flash Lite with structured schema.
        3. Executes post-hoc citation validation.
        4. Applies groundedness fallback rules.

        Returns:
            Tuple[str, List[CitationResponse], float, bool]:
            (answer_text, validated_citations, confidence_score, is_grounded)
        """
        if not candidate_chunks:
            return FALLBACK_ANSWER, [], 0.0, False

        if self.use_mock or self.client is None:
            return self._mock_generate(question, candidate_chunks)

        system_instruction, user_content = self.build_prompt(question, candidate_chunks)

        try:
            from google.genai import types

            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=GroundedAnswerSchema,
                temperature=0.0,  # Zero temperature for maximum factual determinism
            )

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=user_content,
                config=config,
            )

            # Parse structured output from response
            raw_data = None
            if hasattr(response, "parsed") and response.parsed:
                raw_data = response.parsed
            elif hasattr(response, "text") and response.text:
                raw_data = json.loads(response.text)

            if not raw_data:
                logger.warning("Empty response received from Gemini API; returning fallback.")
                return FALLBACK_ANSWER, [], 0.0, False

            if isinstance(raw_data, dict):
                parsed_schema = GroundedAnswerSchema(**raw_data)
            else:
                parsed_schema = raw_data

            raw_answer = parsed_schema.answer.strip()
            raw_citations = parsed_schema.citations
            confidence = float(parsed_schema.confidence)

            # Check if model self-reported fallback
            if (
                FALLBACK_ANSWER.lower() in raw_answer.lower()
                or confidence == 0.0
                or not raw_citations
            ):
                return FALLBACK_ANSWER, [], 0.0, False

            # Execute Post-Hoc Citation Validation
            validated_citations = self.validate_citations(raw_citations, candidate_chunks)

            # Defense-in-depth: if all citations were discarded as hallucinated, reject answer
            if not validated_citations:
                logger.warning(
                    f"All citations failed validation for question '{question[:40]}'. "
                    "Suppressing ungrounded answer."
                )
                return FALLBACK_ANSWER, [], 0.0, False

            return raw_answer, validated_citations, confidence, True

        except Exception as err:
            logger.error(f"Generation error with Gemini API ({err}). Returning fallback.", exc_info=True)
            return FALLBACK_ANSWER, [], 0.0, False
