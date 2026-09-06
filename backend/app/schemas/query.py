import uuid
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field


class RetrievedChunk(BaseModel):
    """Represents a document chunk retrieved via vector similarity search."""
    model_config = ConfigDict(from_attributes=True)

    chunk_id: uuid.UUID = Field(..., description="Unique UUIDv7 identifier of the chunk")
    document_id: uuid.UUID = Field(..., description="UUID of the parent document")
    document_filename: str = Field(..., description="Original human-readable filename of the source document")
    page_number: int = Field(..., description="1-based PDF source page number for citations")
    chunk_index: int = Field(..., description="0-based sequence order within document")
    content: str = Field(..., description="Text content of the retrieved chunk")
    similarity_score: float = Field(..., description="Cosine similarity score (0.0 to 1.0)")


class RetrievalResult(BaseModel):
    """Output payload from the vector retrieval and gating pipeline."""
    query_text: str = Field(..., description="Normalized user question")
    meets_threshold: bool = Field(..., description="True if top chunk similarity meets or exceeds relevance threshold")
    threshold: float = Field(..., description="Relevance threshold applied to this query")
    top_similarity: float = Field(..., description="Highest cosine similarity score among candidate chunks")
    total_retrieved: int = Field(..., description="Number of chunks returned (0 if gating rejects query)")
    chunks: List[RetrievedChunk] = Field(default_factory=list, description="Ranked list of relevant chunks")


class QuerySearchRequest(BaseModel):
    """Request payload for vector similarity search and inspection."""
    question: str = Field(..., min_length=2, max_length=2000, description="Natural-language question to search")
    document_ids: Optional[List[uuid.UUID]] = Field(
        default=None,
        description="Optional list of document UUIDs to scope search. If omitted, searches across all ready documents."
    )
    top_k: Optional[int] = Field(default=5, ge=1, le=20, description="Number of nearest neighbors to retrieve")
    threshold: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Optional custom relevance threshold override (defaults to environment setting, e.g. 0.70)"
    )


class CitationResponse(BaseModel):
    """Represents a validated citation linking a statement to a source PDF page."""
    model_config = ConfigDict(from_attributes=True)

    chunk_id: uuid.UUID = Field(..., description="UUID of the cited chunk")
    document_id: uuid.UUID = Field(..., description="UUID of the parent document")
    original_filename: str = Field(..., description="Human-readable filename of the source document")
    page_number: int = Field(..., description="1-indexed source PDF page number")
    snippet: str = Field(..., description="Verbatim text excerpt from the cited chunk")
    relevance_score: float = Field(..., description="Cosine similarity score of this chunk to the query")


class QueryRequest(BaseModel):
    """User prompt request for grounded document Q&A."""
    question: str = Field(..., min_length=2, max_length=2000, description="User question")
    document_ids: Optional[List[uuid.UUID]] = Field(
        default=None,
        description="Optional list of document UUIDs to scope retrieval. If omitted, searches across all documents."
    )
    top_k: Optional[int] = Field(
        default=None,
        ge=1,
        le=20,
        description="Optional maximum number of chunks to retrieve (defaults to DEFAULT_TOP_K in config)"
    )
    threshold: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Optional relevance threshold override (defaults to RELEVANCE_THRESHOLD in config)"
    )
    session_id: Optional[uuid.UUID] = Field(
        default=None,
        description="Optional client session identifier for grouping conversation threads"
    )


class QueryResponse(BaseModel):
    """Response payload containing grounded answer and verified citations."""
    model_config = ConfigDict(from_attributes=True)

    query_id: uuid.UUID = Field(..., description="Unique UUIDv7 identifier of the query record")
    question: str = Field(..., description="User question asked")
    answer: str = Field(..., description="Factual answer grounded in document excerpts or fallback string")
    confidence: float = Field(..., description="Confidence score of the answer (0.0 to 1.0)")
    is_grounded: bool = Field(..., description="True if answer is verified and supported by citations")
    citations: List[CitationResponse] = Field(default_factory=list, description="List of verified citations")
    created_at: Optional[str] = Field(default=None, description="ISO timestamp of query creation")


class RawCitation(BaseModel):
    """Internal schema for model output citation items."""
    chunk_id: str = Field(..., description="UUID string of the cited chunk")
    page_number: int = Field(..., description="Source page number")


class GroundedAnswerSchema(BaseModel):
    """Pydantic schema passed to Gemini API for JSON structured output."""
    answer: str = Field(..., description="Grounded answer to the question using ONLY provided excerpts")
    citations: List[RawCitation] = Field(
        default_factory=list,
        description="List of cited chunk_id and page_number tuples used to derive the answer"
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Confidence score from 0.0 to 1.0 indicating degree of support from excerpts"
    )

