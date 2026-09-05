import uuid
import uuid6
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase

class Base(AsyncAttrs, DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass

def generate_uuid7() -> uuid.UUID:
    """
    Generates a time-ordered UUIDv7 per RFC 9562.
    Improves database B-Tree index performance by eliminating random insertion page-splits.
    """
    return uuid6.uuid7()
