import asyncio
import os
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///test.db"
os.environ["S3_ENDPOINT_URL"] = "http://localhost:9000"
os.environ["S3_ACCESS_KEY"] = "test"
os.environ["S3_SECRET_KEY"] = "test"
os.environ["S3_BUCKET_NAME"] = "test-bucket"
os.environ["JWT_PRIVATE_KEY_PATH"] = "./keys/private.pem"
os.environ["JWT_PUBLIC_KEY_PATH"] = "./keys/public.pem"

from app.main import app
from app.api.deps import get_db, async_session_factory
from app.models.base import Base
from app.models.user import User
from app.core.security import hash_password
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import update


TEST_DB_URL = "sqlite+aiosqlite:///test.db"
test_engine = create_async_engine(TEST_DB_URL, echo=False)
test_session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def client():
    async def _override_db():
        async with test_session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def user_token(client: AsyncClient) -> str:
    await client.post("/api/v1/auth/register", json={
        "email": "test@example.com",
        "password": "SecureP@ss1",
        "display_name": "Test User",
    })

    async with test_session_factory() as session:
        await session.execute(
            update(User).where(User.email == "test@example.com").values(is_verified=True)
        )
        await session.commit()

    resp = await client.post("/api/v1/auth/login", json={
        "email": "test@example.com",
        "password": "SecureP@ss1",
    })
    return resp.json()["access_token"]
