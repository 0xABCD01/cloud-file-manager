FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libmagic1 curl && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir . 2>/dev/null || pip install --no-cache-dir \
    fastapi uvicorn[standard] sqlalchemy[asyncio] asyncpg alembic \
    pydantic pydantic-settings python-jose[cryptography] passlib[bcrypt] \
    python-multipart boto3 aiobotocore celery[redis] redis python-magic \
    aiofiles cryptography httpx

COPY . .

RUN mkdir -p /app/keys

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
