import asyncio
import logging
import traceback
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.pool import NullPool
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import settings
from app.models.document import Document, DocumentChunk
from app.services.ingestion import IngestionPipeline
from app.services.storage import get_storage_service
from app.workers.celery_app import celery_app

logger = logging.getLogger("scanity.worker")


async def _async_process_pdf(document_id: str, storage_path: str) -> dict:
    """
    Asynchronous execution body for processing an uploaded PDF document.
    Transitions document state: pending -> processing -> ready (or failed).
    Uses a NullPool engine scoped to the current event loop.
    """
    doc_uuid = uuid.UUID(document_id)
    storage_service = get_storage_service()

    worker_engine = create_async_engine(settings.DATABASE_URL, poolclass=NullPool)
    WorkerSessionLocal = async_sessionmaker(
        bind=worker_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )

    try:
        async with WorkerSessionLocal() as session:
            # 1. Fetch document record
            result = await session.execute(select(Document).where(Document.id == doc_uuid))
            document = result.scalar_one_or_none()

            if not document:
                error_msg = f"Document {document_id} not found in database."
                logger.error(error_msg)
                return {"status": "error", "message": error_msg}

            filename = document.original_filename

            # 2. Transition state to processing
            await session.execute(
                update(Document).where(Document.id == doc_uuid).values(status="processing")
            )
            await session.commit()
            logger.info(f"Document {document_id} ('{filename}') marked as 'processing'.")

            try:
                # 3. Read PDF bytes from storage service
                pdf_bytes = storage_service.read_bytes(storage_path)
                logger.info(f"Read {len(pdf_bytes)} bytes from storage path: {storage_path}")

                # 4. Execute Ingestion Pipeline (extract -> chunk -> embed)
                pipeline = IngestionPipeline()
                ingestion_result = pipeline.process_pdf(pdf_bytes, filename=filename)

                logger.info(
                    f"Ingestion pipeline complete for {document_id}: "
                    f"{ingestion_result.page_count} pages, {ingestion_result.total_chunks} embedded chunks."
                )

                # 5. Persist DocumentChunk records with 768-dim embeddings
                chunks_to_insert = [
                    DocumentChunk(
                        document_id=doc_uuid,
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
                await session.execute(
                    update(Document)
                    .where(Document.id == doc_uuid)
                    .values(
                        status="ready",
                        page_count=ingestion_result.page_count,
                        total_chunks=ingestion_result.total_chunks,
                        processed_at=datetime.now(timezone.utc),
                    )
                )
                await session.commit()
                logger.info(f"Document {document_id} successfully indexed and marked as 'ready'.")

                return {
                    "status": "ready",
                    "document_id": str(doc_uuid),
                    "filename": filename,
                    "page_count": ingestion_result.page_count,
                    "total_chunks": ingestion_result.total_chunks,
                }

            except Exception as exc:
                await session.rollback()
                logger.error(f"Error processing document {document_id}: {exc}\n{traceback.format_exc()}")

                # Mark document as failed
                try:
                    await session.execute(
                        update(Document).where(Document.id == doc_uuid).values(status="failed")
                    )
                    await session.commit()
                    logger.info(f"Document {document_id} marked as 'failed'.")
                except Exception as update_err:
                    logger.error(f"Failed to update document status to 'failed': {update_err}")

                raise exc
    finally:
        await worker_engine.dispose()


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
