import asyncio
import logging
import traceback
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.document import Document, DocumentChunk
from app.services.ingestion import IngestionPipeline
from app.services.storage import get_storage_service
from app.workers.celery_app import celery_app

logger = logging.getLogger("scanity.worker")


async def _async_process_pdf(document_id: str, storage_path: str) -> dict:
    """
    Asynchronous execution body for processing an uploaded PDF document.
    Transitions document state: pending -> processing -> ready (or failed).
    """
    doc_uuid = uuid.UUID(document_id)
    storage_service = get_storage_service()

    async with AsyncSessionLocal() as session:
        # 1. Fetch document record
        result = await session.execute(select(Document).where(Document.id == doc_uuid))
        document = result.scalar_one_or_none()

        if not document:
            error_msg = f"Document {document_id} not found in database."
            logger.error(error_msg)
            return {"status": "error", "message": error_msg}

        # 2. Transition state to processing
        document.status = "processing"
        await session.commit()
        logger.info(f"Document {document_id} ('{document.original_filename}') marked as 'processing'.")

        try:
            # 3. Read PDF bytes from storage service
            pdf_bytes = storage_service.read_bytes(storage_path)
            logger.info(f"Read {len(pdf_bytes)} bytes from storage path: {storage_path}")

            # 4. Execute Ingestion Pipeline (extract -> chunk -> embed)
            pipeline = IngestionPipeline()
            ingestion_result = pipeline.process_pdf(pdf_bytes, filename=document.original_filename)

            logger.info(
                f"Ingestion pipeline complete for {document_id}: "
                f"{ingestion_result.page_count} pages, {ingestion_result.total_chunks} embedded chunks."
            )

            # 5. Persist DocumentChunk records with 768-dim embeddings
            chunks_to_insert = [
                DocumentChunk(
                    document_id=document.id,
                    chunk_index=chunk.chunk_index,
                    page_number=chunk.page_number,
                    content=chunk.content,
                    token_count=chunk.token_count,
                    embedding=chunk.embedding,
                )
                for chunk in ingestion_result.chunks
            ]

            session.add_all(chunks_to_insert)

            # 6. Update document metadata and transition state to ready
            document.page_count = ingestion_result.page_count
            document.total_chunks = ingestion_result.total_chunks
            document.status = "ready"
            document.processed_at = datetime.now(timezone.utc)

            await session.commit()
            logger.info(f"Document {document_id} successfully indexed and marked as 'ready'.")

            return {
                "status": "ready",
                "document_id": str(document.id),
                "filename": document.original_filename,
                "page_count": ingestion_result.page_count,
                "total_chunks": ingestion_result.total_chunks,
            }

        except Exception as exc:
            await session.rollback()
            logger.error(f"Error processing document {document_id}: {exc}\n{traceback.format_exc()}")

            # Mark document as failed
            try:
                res_retry = await session.execute(select(Document).where(Document.id == doc_uuid))
                doc_retry = res_retry.scalar_one_or_none()
                if doc_retry:
                    doc_retry.status = "failed"
                    await session.commit()
                    logger.info(f"Document {document_id} marked as 'failed'.")
            except Exception as update_err:
                logger.error(f"Failed to update document status to 'failed': {update_err}")

            raise exc


@celery_app.task(bind=True, name="process_pdf_task", max_retries=3, default_retry_delay=5)
def process_pdf_task(self, document_id: str, storage_path: str) -> dict:
    """
    Celery task wrapper that runs the async PDF ingestion workflow.
    """
    logger.info(f"Executing process_pdf_task for document_id={document_id}, storage_path={storage_path}")
    try:
        return asyncio.run(_async_process_pdf(document_id, storage_path))
    except Exception as exc:
        logger.error(f"process_pdf_task encountered error: {exc}")
        raise exc
