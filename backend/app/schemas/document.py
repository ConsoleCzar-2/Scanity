import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict, Field

class ParsedPage(BaseModel):
    """Represents raw text extracted from a single PDF page."""
    page_number: int = Field(..., description="1-based page number")
    text: str = Field(..., description="Cleaned text content of the page")
    char_count: int = Field(..., description="Character count of the page text")

class TextChunk(BaseModel):
    """Represents an un-embedded text chunk sliced from document pages."""
    chunk_index: int = Field(..., description="0-based sequence index within document")
    page_number: int = Field(..., description="1-based page number of source page")
    content: str = Field(..., description="Raw text snippet of the chunk (~700 tokens)")
    token_count: int = Field(..., description="Estimated token count of this chunk")

class EmbeddedChunk(BaseModel):
    """Represents a text chunk paired with its high-dimensional vector embedding."""
    chunk_index: int
    page_number: int
    content: str
    token_count: int
    embedding: List[float] = Field(..., description="768-dimensional float embedding vector")

class IngestionResult(BaseModel):
    """Complete output payload from the IngestionPipeline."""
    filename: str
    page_count: int
    total_chunks: int
    chunks: List[EmbeddedChunk]

class DocumentResponse(BaseModel):
    """Schema for document status and metadata responses."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    original_filename: str
    status: str
    page_count: Optional[int] = None
    total_chunks: Optional[int] = None
    uploaded_at: datetime
    processed_at: Optional[datetime] = None


class DocumentUploadResponse(BaseModel):
    """Response returned upon successful file upload and task queuing."""
    document_id: uuid.UUID
    original_filename: str
    status: str
    message: str


class DocumentStatusResponse(BaseModel):
    """Detailed document status response for polling."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    original_filename: str
    status: str
    page_count: Optional[int] = None
    total_chunks: Optional[int] = None
    uploaded_at: datetime
    processed_at: Optional[datetime] = None


class DocumentListResponse(BaseModel):
    """Response schema for listing uploaded documents."""
    total: int
    documents: List[DocumentResponse]
