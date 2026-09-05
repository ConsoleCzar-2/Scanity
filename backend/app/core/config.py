from pathlib import Path
import json
import os
from dotenv import load_dotenv

# Load root .env file
root_dir = Path(__file__).resolve().parents[3]
env_path = root_dir / ".env"
load_dotenv(dotenv_path=env_path)

class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "Scanity")
    APP_ENV: str = os.getenv("APP_ENV", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() in ("true", "1", "yes")

    # CORS
    _cors_raw = os.getenv("CORS_ORIGINS", '["http://localhost:3000"]')
    try:
        CORS_ORIGINS: list[str] = json.loads(_cors_raw)
    except Exception:
        CORS_ORIGINS: list[str] = ["http://localhost:3000"]
    CORS_ORIGINS_REGEX: str | None = os.getenv("CORS_ORIGINS_REGEX", r"^https://.*\.vercel\.app$")

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://scanity_user:scanity_password@localhost:5433/scanity"
    )
    # If DATABASE_URL points to localhost:5432, route to 5433 to reach Docker container
    # (avoids collision with native Windows PostgreSQL service on port 5432)
    if "@localhost:5432/" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("@localhost:5432/", "@localhost:5433/")
    elif "@127.0.0.1:5432/" in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace("@127.0.0.1:5432/", "@127.0.0.1:5433/")

    # Ensure DATABASE_URL uses asyncpg scheme for SQLAlchemy async engine
    if DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

    # Redis / Celery
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/0")

    # Storage Settings (Local / GCS)
    STORAGE_TYPE: str = os.getenv("STORAGE_TYPE", "local")  # 'local' or 'gcs'
    UPLOAD_DIR: Path = Path(os.getenv("UPLOAD_DIR", str(root_dir / "backend" / "uploads")))
    GCS_BUCKET_NAME: str | None = os.getenv("GCS_BUCKET_NAME", None)
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "25"))

    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "default-secret-key-change-in-production")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

    # Vector Embeddings & LLM
    VECTOR_DIMENSION: int = int(os.getenv("VECTOR_DIMENSION", "768"))
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY", None)
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
    CHUNK_SIZE_TOKENS: int = int(os.getenv("CHUNK_SIZE_TOKENS", "700"))
    CHUNK_OVERLAP_TOKENS: int = int(os.getenv("CHUNK_OVERLAP_TOKENS", "100"))

settings = Settings()
