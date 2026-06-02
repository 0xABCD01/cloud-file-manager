"""Pydantic schemas for sharing."""

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, EmailStr, ConfigDict


class ShareLinkCreateRequest(BaseModel):
    resource_type: Literal["file", "folder"]
    resource_id: str
    permission: Literal["view", "edit"] = "view"
    expires_in_hours: int | None = None
    password: str | None = None


class ShareLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    token: str
    resource_type: str
    resource_id: str
    permission: str
    expires_at: datetime | None
    is_active: bool
    access_count: int
    created_at: datetime
    url: str = ""


class ShareLinkListResponse(BaseModel):
    items: list[ShareLinkResponse]
    total: int


class ShareResolveResponse(BaseModel):
    resource_type: str
    resource_id: str
    name: str
    mime_type: str | None = None
    size_bytes: int | None = None
    download_url: str
    permission: str
    owner_name: str = ""


class PermissionGrantRequest(BaseModel):
    resource_type: Literal["file", "folder"]
    resource_id: str
    user_email: EmailStr
    permission: Literal["view", "edit", "admin"] = "view"


class PermissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    resource_type: str
    resource_id: str
    user_id: str
    permission: str
    granted_by: str
    created_at: datetime
    # Enriched fields
    user_email: str = ""
    user_display_name: str = ""


class PermissionListResponse(BaseModel):
    items: list[PermissionResponse]
    total: int


class PermissionUpdateRequest(BaseModel):
    permission: Literal["view", "edit", "admin"]
