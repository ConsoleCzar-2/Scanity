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
