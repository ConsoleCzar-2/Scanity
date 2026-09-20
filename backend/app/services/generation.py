import asyncio
import json
import logging
import re
from typing import AsyncGenerator, List, Optional, Tuple

from app.core.config import settings
from app.schemas.query import (
    CitationResponse,
    CitationsExtractionSchema,
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
            "3. Citations: In the JSON citations list, provide the exact chunk_id and page_number. In the answer text, use clean bracketed numbers like [1], [2] referring to excerpt numbers. Do NOT write raw UUIDs in the answer text.\n"
            "4. Structured Format: You MUST output strictly valid JSON matching the specified schema."
        )

        excerpt_blocks = []
        for idx, chunk in enumerate(chunks, start=1):
            block = (
                f"--- BEGIN DOCUMENT EXCERPT [{idx}] ---\n"
                f"Excerpt Index: [{idx}]\n"
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
            "Produce a factual, grounded answer with clean bracketed numbered citations [1], [2] in the text, and exact chunk_ids in the citations list conforming strictly to the JSON schema."
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

                # Extract cleaned verbatim snippet (strip presentation bullet artifacts / PUA glyphs)
                clean_lines = [self._clean_text(line) for line in chunk.content.split("\n")]
                substantive_lines = [l for l in clean_lines if l.strip()]
                clean_text = "\n".join(substantive_lines)
                snippet = clean_text[:300] + ("..." if len(clean_text) > 300 else "")

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

    def _clean_text(self, text: str) -> str:
        """Removes presentation bullet artifacts and normalizes whitespace."""
        # Replace common presentation font bullet characters (e.g. \ue000-\uf8ff)
        cleaned = re.sub(r"[\ue000-\uf8ff]", "", text)
        cleaned = re.sub(r"[•·▪▫►✔→\t]+", " ", cleaned)
        cleaned = re.sub(r" +", " ", cleaned)
        return cleaned.strip()

    def _normalize_inline_citations(
        self, text: str, candidate_chunks: List[RetrievedChunk]
    ) -> str:
        """
        Normalizes any raw UUID citations [uuid] into clean numbered citations [1], [2].
        """
        chunk_map = {str(c.chunk_id).lower(): idx for idx, c in enumerate(candidate_chunks, start=1)}

        def replacer(match: re.Match) -> str:
            raw_id = match.group(1).lower()
            if raw_id in chunk_map:
                return f"[{chunk_map[raw_id]}]"
            return ""

        # Matches [uuid] or [chunk_id]
        cleaned = re.sub(
            r"\[([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]",
            replacer,
            text,
        )
        return re.sub(r" +", " ", cleaned).strip()

    def _mock_generate(
        self,
        question: str,
        chunks: List[RetrievedChunk],
    ) -> Tuple[str, List[CitationResponse], float, bool]:
        """
        Synthesizes a grounded, informative multi-sentence answer from retrieved chunks.
        Used for offline development, hermetic testing, or when external API calls fail.
        """
        if not chunks:
            return FALLBACK_ANSWER, [], 0.0, False

        question_words = set(re.findall(r"\b\w{3,}\b", question.lower()))
        stopwords = {
            "what", "was", "is", "are", "the", "in", "of", "and", "a", "an",
            "for", "to", "with", "by", "on", "at", "from", "how", "why",
            "does", "explain", "tell", "about", "which", "where", "can", "pdf",
            "document", "present", "isn't", "isnt", "there"
        }
        content_query_words = question_words - stopwords

        # Score candidate chunks based on similarity score + query keyword matches
        scored_chunks: List[Tuple[float, RetrievedChunk, List[str]]] = []
        for chunk in chunks:
            raw_lines = [self._clean_text(line) for line in chunk.content.split("\n")]
            substantive_lines = [l for l in raw_lines if len(l) > 3 and not l.startswith("===")]
            
            chunk_text = " ".join(substantive_lines).lower()
            chunk_words = set(re.findall(r"\b\w+\b", chunk_text))
            overlap = len(content_query_words.intersection(chunk_words)) if content_query_words else 1

            # Give bonus to chunks that have more than just a single title line
            substantive_bonus = 0.2 if len(substantive_lines) > 1 else -0.1
            score = (chunk.similarity_score or 0.5) + (overlap * 0.15) + substantive_bonus
            scored_chunks.append((score, chunk, substantive_lines))

        # Sort descending by score
        scored_chunks.sort(key=lambda x: x[0], reverse=True)

        # Collect substantive lines across the best matching chunks
        collected_claims: List[str] = []
        contributing_chunks: List[RetrievedChunk] = []

        for _, chunk, lines in scored_chunks:
            if not lines:
                continue
            
            # If chunk is just a 1-word slide title (e.g. "ALOHA"), skip as primary text if we have better lines
            if len(lines) == 1 and len(lines[0].split()) <= 2 and len(scored_chunks) > 1:
                continue

            contributing_chunks.append(chunk)
            for line in lines:
                if line not in collected_claims:
                    collected_claims.append(line)
            
            if len(collected_claims) >= 5:
                break

        # If nothing substantive collected, fall back to best chunk text
        if not collected_claims:
            best_chunk = chunks[0]
            cleaned = self._clean_text(best_chunk.content)
            collected_claims = [cleaned[:250]]
            contributing_chunks = [best_chunk]

        # Format answer text
        if len(collected_claims) == 1:
            answer_text = collected_claims[0]
        else:
            # Header + substantive points
            primary = collected_claims[0]
            details = collected_claims[1:5]
            if len(primary.split()) <= 4:
                answer_text = f"**{primary}**:\n" + "\n".join(f"- {d}" for d in details)
            else:
                answer_text = primary + "\n\n" + "\n".join(f"- {d}" for d in details)

        raw_citations = [
            RawCitation(chunk_id=str(c.chunk_id), page_number=c.page_number)
            for c in contributing_chunks
        ]
        validated = self.validate_citations(raw_citations, chunks)

        # Confidence bounded between 0.80 and 0.95
        top_sim = max([c.similarity_score for c in contributing_chunks if c.similarity_score is not None] or [0.85])
        confidence = min(max(top_sim, 0.80), 0.95)

        return answer_text, validated, confidence, True

    async def generate_grounded_answer(
        self,
        question: str,
        candidate_chunks: List[RetrievedChunk],
    ) -> Tuple[str, List[CitationResponse], float, bool]:
        """
        Main generation entrypoint:
        1. Validates candidates.
        2. Prompts Gemini with structured schema.
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
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
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
                logger.warning("Empty response received from Gemini API; falling back to grounded chunk synthesis.")
                return self._mock_generate(question, candidate_chunks)

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

            # Defense-in-depth: if all citations were discarded as hallucinated, fall back to chunk synthesis
            if not validated_citations:
                logger.warning(
                    f"All citations failed validation for question '{question[:40]}'. "
                    "Falling back to grounded chunk synthesis."
                )
                return self._mock_generate(question, candidate_chunks)

            clean_answer = self._normalize_inline_citations(raw_answer, candidate_chunks)
            return clean_answer, validated_citations, confidence, True

        except Exception as err:
            logger.warning(
                f"Generation error with Gemini API ({err}). "
                "Falling back to smart grounded chunk synthesis from candidate chunks."
            )
            return self._mock_generate(question, candidate_chunks)

    async def generate_answer_stream(
        self,
        question: str,
        candidate_chunks: List[RetrievedChunk],
    ) -> AsyncGenerator[str, None]:
        """
        Phase 1: Streams natural-language grounded answer tokens incrementally.
        Yields text deltas as they arrive from Gemini's streaming API, or word-by-word in mock mode.
        """
        if not candidate_chunks:
            yield FALLBACK_ANSWER
            return

        if self.use_mock or self.client is None:
            mock_answer, _, _, _ = self._mock_generate(question, candidate_chunks)
            words = mock_answer.split(" ")
            for i, word in enumerate(words):
                prefix = "" if i == 0 else " "
                yield prefix + word
                await asyncio.sleep(0.02)
            return

        _, context_str = self.build_prompt(question, candidate_chunks)
        streaming_instruction = (
            "You are an enterprise document question-answering assistant. "
            "Your task is to answer the user's question strictly and exclusively based on the provided document excerpts.\n\n"
            "CRITICAL CONSTRAINTS:\n"
            "1. Groundedness: Answer ONLY using facts directly mentioned in the excerpts below. Do NOT extrapolate, speculate, or bring in outside knowledge.\n"
            "2. Fallback: If the provided excerpts do not contain the answer, respond ONLY with 'Not found in the provided document(s).'\n"
            "3. Format: Provide a clear, well-structured, direct natural language answer. Do not output JSON or schema blocks.\n"
            "4. Inline Citations: Cite supporting excerpts with clean bracketed numbers like [1], [2] referencing the Excerpt Index at the end of relevant statements (e.g. '... developed in the 1970s [1]'). Never output raw UUID strings or chunk hashes."
        )

        streaming_user_content = (
            f"DOCUMENT EXCERPTS:\n\n{context_str}\n\n"
            f"USER QUESTION:\n{question}\n\n"
            "Provide a direct, factual natural-language answer grounded strictly in the excerpts above. "
            "Cite supporting excerpts using bracketed numbers like [1], [2]. Do NOT write raw UUID strings."
        )

        try:
            from google.genai import types

            config = types.GenerateContentConfig(
                system_instruction=streaming_instruction,
                temperature=0.0,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            )

            response_stream = self.client.models.generate_content_stream(
                model=self.model_name,
                contents=streaming_user_content,
                config=config,
            )

            for chunk in response_stream:
                if chunk.text:
                    yield chunk.text

        except Exception as err:
            logger.warning(
                f"Streaming error with Gemini API ({err}). "
                "Falling back to mock grounded streaming."
            )
            mock_answer, _, _, _ = self._mock_generate(question, candidate_chunks)
            words = mock_answer.split(" ")
            for i, word in enumerate(words):
                prefix = "" if i == 0 else " "
                yield prefix + word
                await asyncio.sleep(0.02)

    async def extract_structured_citations(
        self,
        question: str,
        answer_text: str,
        candidate_chunks: List[RetrievedChunk],
    ) -> Tuple[List[CitationResponse], float, bool]:
        """
        Phase 2: Extracts structured citations and confidence score for the streamed answer.
        Uses structured schema output and validates against retrieved candidate chunks.
        """
        if not candidate_chunks or FALLBACK_ANSWER.lower() in answer_text.lower():
            return [], 0.0, False

        if self.use_mock or self.client is None:
            _, citations, confidence, is_grounded = self._mock_generate(question, candidate_chunks)
            return citations, confidence, is_grounded

        _, context_str = self.build_prompt(question, candidate_chunks)
        extraction_prompt = (
            f"DOCUMENT EXCERPTS:\n\n{context_str}\n\n"
            f"USER QUESTION:\n{question}\n\n"
            f"GENERATED ANSWER:\n{answer_text}\n\n"
            "Extract all chunk_id citations and page numbers supporting claims in the generated answer. "
            "Assign an overall factual confidence score (0.0 to 1.0) indicating degree of support."
        )

        system_instruction = (
            "You are an expert citation validator. "
            "Given the document excerpts and an answer, identify which excerpts support the statements in the answer. "
            "Output strictly valid JSON matching the schema."
        )

        try:
            from google.genai import types

            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=CitationsExtractionSchema,
                temperature=0.0,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            )

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=extraction_prompt,
                config=config,
            )

            raw_data = None
            if hasattr(response, "parsed") and response.parsed:
                raw_data = response.parsed
            elif hasattr(response, "text") and response.text:
                raw_data = json.loads(response.text)

            if not raw_data:
                logger.warning("Empty citation response from Gemini API; using candidate chunk fallback.")
                _, citations, confidence, is_grounded = self._mock_generate(question, candidate_chunks)
                return citations, confidence, is_grounded

            if isinstance(raw_data, dict):
                parsed_schema = CitationsExtractionSchema(**raw_data)
            else:
                parsed_schema = raw_data

            raw_citations = parsed_schema.citations
            confidence = float(parsed_schema.confidence)

            validated_citations = self.validate_citations(raw_citations, candidate_chunks)
            if not validated_citations:
                logger.warning("Post-hoc validator discarded citations; using candidate chunk fallback.")
                _, citations, confidence, is_grounded = self._mock_generate(question, candidate_chunks)
                return citations, confidence, is_grounded

            return validated_citations, confidence, True

        except Exception as err:
            logger.warning(
                f"Citation extraction error with Gemini API ({err}). "
                "Falling back to candidate chunk citations."
            )
            _, citations, confidence, is_grounded = self._mock_generate(question, candidate_chunks)
            return citations, confidence, is_grounded

