import hashlib
import logging
import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Tuple

from app.core.config import settings

logger = logging.getLogger("scanity.storage")


class BaseStorageService(ABC):
    """
    Abstract base class for document file storage.
    Enables pluggable storage backends (Local filesystem, Google Cloud Storage, S3).
    """

    @abstractmethod
    def save_file(self, file_content: bytes, original_filename: str, doc_id: str) -> Tuple[str, str]:
        """
        Saves file bytes to the storage backend.
        
        Args:
            file_content: Raw bytes of the uploaded file.
            original_filename: User-provided original filename.
            doc_id: UUID string of the document.
            
        Returns:
            Tuple[str, str]: (storage_path_or_uri, sha256_hash)
        """
        pass

    @abstractmethod
    def read_bytes(self, storage_path: str) -> bytes:
        """
        Reads raw file bytes from the storage backend.
        
        Args:
            storage_path: Path or URI returned by save_file.
            
        Returns:
            bytes: Raw binary file content.
        """
        pass

    @abstractmethod
    def delete_file(self, storage_path: str) -> bool:
        """
        Removes a file from the storage backend.
        
        Args:
            storage_path: Path or URI to delete.
            
        Returns:
            bool: True if deleted or did not exist, False on failure.
        """
        pass


class LocalStorageService(BaseStorageService):
    """
    Local filesystem storage provider.
    Stores files under the configured UPLOAD_DIR using {doc_id}.pdf naming.
    """

    def __init__(self, upload_dir: Path | str | None = None) -> None:
        self.upload_dir = Path(upload_dir or settings.UPLOAD_DIR)
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def save_file(self, file_content: bytes, original_filename: str, doc_id: str) -> Tuple[str, str]:
        # Compute SHA-256 digest
        sha256_hash = hashlib.sha256(file_content).hexdigest()

        # Determine extension from original filename, default to .pdf
        ext = Path(original_filename).suffix.lower() or ".pdf"
        target_path = self.upload_dir / f"{doc_id}{ext}"

        with open(target_path, "wb") as f:
            f.write(file_content)

        logger.info(f"Saved {len(file_content)} bytes to {target_path} (hash: {sha256_hash[:12]}...)")
        return str(target_path), sha256_hash

    def read_bytes(self, storage_path: str) -> bytes:
        path = Path(storage_path)
        if not path.is_absolute():
            path = self.upload_dir / path

        if not path.exists():
            raise FileNotFoundError(f"Stored document file not found: {storage_path}")

        with open(path, "rb") as f:
            return f.read()

    def delete_file(self, storage_path: str) -> bool:
        try:
            path = Path(storage_path)
            if not path.is_absolute():
                path = self.upload_dir / path

            if path.exists():
                path.unlink()
                logger.info(f"Deleted local storage file: {path}")
            return True
        except Exception as e:
            logger.error(f"Error deleting storage file {storage_path}: {e}")
            return False


class GCSStorageService(BaseStorageService):
    """
    Google Cloud Storage provider for future GCP deployment.
    Reads and writes blobs to gs://{bucket_name}/{doc_id}.pdf.
    """

    def __init__(self, bucket_name: str | None = None) -> None:
        self.bucket_name = bucket_name or settings.GCS_BUCKET_NAME or "scanity-documents"
        # In production GCP, google.cloud.storage.Client() is instantiated here

    def save_file(self, file_content: bytes, original_filename: str, doc_id: str) -> Tuple[str, str]:
        sha256_hash = hashlib.sha256(file_content).hexdigest()
        ext = Path(original_filename).suffix.lower() or ".pdf"
        gcs_uri = f"gs://{self.bucket_name}/documents/{doc_id}{ext}"
        # Production upload: blob.upload_from_string(file_content, content_type="application/pdf")
        logger.info(f"[GCS Stub] Would upload {len(file_content)} bytes to {gcs_uri}")
        return gcs_uri, sha256_hash

    def read_bytes(self, storage_path: str) -> bytes:
        # Production download: blob.download_as_bytes()
        raise NotImplementedError("GCSStorageService will be connected in Step 10 (GCP Deployment).")

    def delete_file(self, storage_path: str) -> bool:
        # Production delete: blob.delete()
        logger.info(f"[GCS Stub] Would delete blob at {storage_path}")
        return True


def get_storage_service() -> BaseStorageService:
    """
    Factory function providing the active storage provider.
    Defaults to LocalStorageService in development; selects GCSStorageService when configured.
    """
    if settings.STORAGE_TYPE.lower() == "gcs":
        return GCSStorageService(bucket_name=settings.GCS_BUCKET_NAME)
    return LocalStorageService(upload_dir=settings.UPLOAD_DIR)
