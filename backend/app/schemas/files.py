"""Pydantic schemas for file operations."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict


class FileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    mime_type: str
    size_bytes: int
    folder_id: str | None
    owner_id: str
    checksum_sha256: str
    version: int
    is_trashed: bool
    created_at: datetime
    updated_at: datetime


class FileListResponse(BaseModel):
    items: list[FileResponse]
    total: int
    page: int
    per_page: int


class FileRenameRequest(BaseModel):
    name: str


class FileMoveRequest(BaseModel):
    folder_id: str | None
