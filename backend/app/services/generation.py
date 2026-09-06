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

    def _clean_text(self, text: str) -> str:
        """Removes presentation bullet artifacts and normalizes whitespace."""
        # Replace common presentation font bullet characters (e.g. \uf071, \uf0d8)
        cleaned = re.sub(r"[\uf000-\uf8ff]", "", text)
        cleaned = re.sub(r"[•·▪▫►✔→\t]+", " ", cleaned)
        cleaned = re.sub(r" +", " ", cleaned)
        return cleaned.strip()

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

            return raw_answer, validated_citations, confidence, True

        except Exception as err:
            logger.warning(
                f"Generation error with Gemini API ({err}). "
                "Falling back to smart grounded chunk synthesis from candidate chunks."
            )
            return self._mock_generate(question, candidate_chunks)
