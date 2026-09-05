import logging
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import settings
from app.models.base import generate_uuid7
from app.models.document import Document
from app.schemas.document import (
    DocumentListResponse,
    DocumentResponse,
    DocumentStatusResponse,
    DocumentUploadResponse,
)
from app.services.storage import get_storage_service
from app.workers.tasks import process_pdf_task

logger = logging.getLogger("scanity.api.documents")
router = APIRouter()


@router.post(
    "/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload PDF Document",
    description="Uploads a PDF file, persists it to storage, creates a database record, and queues background ingestion.",
)
async def upload_document(
    file: UploadFile = File(..., description="PDF file to upload"),
    db: AsyncSession = Depends(get_db),
) -> DocumentUploadResponse:
    # 1. Validate file extension
    filename = file.filename or "uploaded_document.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Only PDF documents (.pdf) are supported.",
        )

    # 2. Read file content and validate size limit
    content = await file.read()
    max_size_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    if len(content) > max_size_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File size ({len(content) / (1024 * 1024):.1f}MB) exceeds the allowed limit of {settings.MAX_UPLOAD_SIZE_MB}MB.",
        )

    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    # 3. Generate UUIDv7 and save to storage service
    doc_id = generate_uuid7()
    storage_service = get_storage_service()
    storage_path, file_hash = storage_service.save_file(
        file_content=content,
        original_filename=filename,
        doc_id=str(doc_id),
    )

    # 4. Insert Document record in database with status 'pending'
    document = Document(
        id=doc_id,
        original_filename=filename,
        storage_path=storage_path,
        file_hash=file_hash,
        status="pending",
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)

    # 5. Dispatch asynchronous Celery ingestion task
    try:
        process_pdf_task.delay(str(document.id), storage_path)
        logger.info(f"Enqueued process_pdf_task for doc_id={document.id}")
    except Exception as e:
        logger.warning(
            f"Failed to dispatch task to Celery/Redis ({e}). "
            "Task queue may be offline, document remains in 'pending' status."
        )

    return DocumentUploadResponse(
        document_id=document.id,
        original_filename=document.original_filename,
        status=document.status,
        message="Document uploaded successfully. Processing queued.",
    )


@router.get(
    "/{id}/status",
    response_model=DocumentStatusResponse,
    summary="Get Document Processing Status",
    description="Polls the ingestion and indexing state of an uploaded document.",
)
async def get_document_status(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> DocumentStatusResponse:
    result = await db.execute(select(Document).where(Document.id == id))
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with ID {id} not found.",
        )

    return DocumentStatusResponse.model_validate(document)


@router.get(
    "",
    response_model=DocumentListResponse,
    summary="List Uploaded Documents",
    description="Returns a paginated list of all uploaded documents ordered by upload timestamp descending.",
)
async def list_documents(
    skip: int = Query(0, ge=0, description="Records to skip"),
    limit: int = Query(50, ge=1, le=100, description="Maximum records to return"),
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    # Total count
    count_result = await db.execute(select(func.count()).select_from(Document))
    total = count_result.scalar_one()

    # Query documents
    result = await db.execute(
        select(Document)
        .order_by(Document.uploaded_at.desc())
        .offset(skip)
        .limit(limit)
    )
    documents = result.scalars().all()

    return DocumentListResponse(
        total=total,
        documents=[DocumentResponse.model_validate(doc) for doc in documents],
    )


@router.delete(
    "/{id}",
    summary="Delete Document",
    description="Deletes a document from the database (cascading to all chunks and embeddings) and removes it from storage.",
)
async def delete_document(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(select(Document).where(Document.id == id))
    document = result.scalar_one_or_none()

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document with ID {id} not found.",
        )

    # 1. Delete physical file from storage
    storage_service = get_storage_service()
    storage_service.delete_file(document.storage_path)

    # 2. Delete database record (cascades to chunks & citations in pgvector)
    await db.delete(document)
    await db.commit()

    logger.info(f"Deleted document {id} ('{document.original_filename}') and all associated chunks.")
    return {
        "status": "ok",
        "message": f"Document '{document.original_filename}' and all associated vector embeddings deleted successfully.",
    }
