"""Pydantic schemas for folder operations."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict
from typing import Literal


class FolderCreateRequest(BaseModel):
    name: str
    parent_id: str | None = None


class FolderUpdateRequest(BaseModel):
    name: str | None = None
    parent_id: str | None = None


class FolderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    owner_id: str
    parent_id: str | None
    is_trashed: bool
    created_at: datetime
    updated_at: datetime


class BreadcrumbItem(BaseModel):
    id: str
    name: str


class FolderContentsResponse(BaseModel):
    folders: list[FolderResponse]
    files: list  # FileResponse list
    total_items: int


class FolderTreeNode(BaseModel):
    id: str
    name: str
    children: list["FolderTreeNode"] = []


class FolderTreeResponse(BaseModel):
    tree: list[FolderTreeNode]
    truncated: bool


class TrashResponse(BaseModel):
    count: int
    message: str


class ContentItem(BaseModel):
    """Discriminated union for folder contents."""
    type: Literal["file", "folder"]
    id: str
    name: str
    # File-specific
    mime_type: str | None = None
    size_bytes: int | None = None
    # Common
    created_at: datetime
    updated_at: datetime
