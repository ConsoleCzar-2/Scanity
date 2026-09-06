import pytest
from app.core.database import engine

@pytest.fixture(autouse=True)
async def dispose_db_engine():
    yield
    await engine.dispose()
