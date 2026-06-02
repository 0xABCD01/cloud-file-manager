from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import get_settings

settings = get_settings()

# fall back to sqlite if asyncpg isn't installed
db_url = settings.database_url
if "postgresql" in db_url:
    try:
        import asyncpg  # noqa: F401
    except ImportError:
        db_url = "sqlite+aiosqlite:///./cloudvault.db"

engine = create_async_engine(
    db_url,
    echo=settings.debug,
    pool_pre_ping=True,
)

async_session_factory = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
