import hashlib
import os
from pathlib import Path
from typing import AsyncIterator

from app.core.config import get_settings


class StorageError(Exception):
    pass


class FileNotFoundError(StorageError):
    pass


class LocalStorageService:
    """Local filesystem backend — used when S3/MinIO isn't available."""

    def __init__(self, base_dir: str = "./uploads"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def ensure_bucket(self) -> None:
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def upload_file(
        self,
        storage_key: str,
        file_content: AsyncIterator[bytes],
        content_type: str,
        metadata: dict[str, str] | None = None,
    ) -> dict:
        hasher = hashlib.sha256()
        total_size = 0
        chunks: list[bytes] = []

        async for chunk in file_content:
            chunks.append(chunk)
            hasher.update(chunk)
            total_size += len(chunk)

        body = b"".join(chunks)
        checksum = hasher.hexdigest()

        dest = self.base_dir / storage_key
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(body)

        return {"storage_key": storage_key, "size_bytes": total_size, "checksum": checksum}

    async def download_file(self, storage_key: str) -> AsyncIterator[bytes]:
        path = self.base_dir / storage_key
        if not path.exists():
            raise FileNotFoundError(f"File not found: {storage_key}")
        data = path.read_bytes()
        for i in range(0, len(data), 65536):
            yield data[i : i + 65536]

    async def delete_file(self, storage_key: str) -> None:
        path = self.base_dir / storage_key
        if path.exists():
            path.unlink()

    async def copy_file(self, source_key: str, dest_key: str) -> str:
        src = self.base_dir / source_key
        dst = self.base_dir / dest_key
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.exists():
            dst.write_bytes(src.read_bytes())
        return dest_key

    async def get_presigned_url(
        self, storage_key: str, expires_in: int = 3600, disposition: str = "attachment"
    ) -> str:
        return f"/api/v1/files/download/{storage_key}"

    async def get_storage_usage(self, prefix: str) -> int:
        total = 0
        for f in self.base_dir.rglob("*"):
            if f.is_file() and str(f).startswith(str(self.base_dir / prefix)):
                total += f.stat().st_size
        return total

    async def delete_prefix(self, prefix: str) -> int:
        deleted = 0
        target = self.base_dir / prefix
        if target.exists():
            for f in target.rglob("*"):
                if f.is_file():
                    f.unlink()
                    deleted += 1
        return deleted


def get_storage_service():
    settings = get_settings()
    if settings.s3_endpoint_url and "localhost" in settings.s3_endpoint_url:
        return LocalStorageService()
    try:
        from app.core.storage_orig import StorageService
        return StorageService()
    except Exception:
        return LocalStorageService()


# backwards compat alias
StorageService = LocalStorageService

storage = get_storage_service()
