import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.file import File
from app.models.folder import Folder
from app.models.user import User
from app.models.share import ShareLink, Permission
from app.core.security import (
    hash_password,
    verify_password,
    decode_token,
    TokenExpiredError,
    TokenInvalidError,
    TokenTypeMismatchError,
)
from app.schemas.sharing import (
    ShareLinkCreateRequest,
    ShareLinkResponse,
    ShareLinkListResponse,
    ShareResolveResponse,
    PermissionGrantRequest,
    PermissionResponse,
    PermissionListResponse,
    PermissionUpdateRequest,
)
from app.services.audit_service import audit_service
from app.services.permission_service import permission_service

router = APIRouter(prefix="/api/v1/sharing", tags=["sharing"])


async def _get_current_user(request: Request, db: AsyncSession) -> User:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(auth[7:], expected_type="access")
    except TokenExpiredError:
        raise HTTPException(status_code=401, detail="Token expired")
    except (TokenInvalidError, TokenTypeMismatchError):
        raise HTTPException(status_code=401, detail="Invalid token")
    result = await db.execute(select(User).where(User.id == payload["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def _get_resource_name(db: AsyncSession, resource_type: str, resource_id: str) -> str:
    if resource_type == "file":
        r = await db.execute(select(File.name).where(File.id == resource_id))
    else:
        r = await db.execute(select(Folder.name).where(Folder.id == resource_id))
    name = r.scalar_one_or_none()
    return name or "Unknown"


@router.post("/links", response_model=ShareLinkResponse, status_code=201)
async def create_share_link(
    body: ShareLinkCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    has_perm = await permission_service.check_permission(
        db, user.id, body.resource_type, body.resource_id, "admin"
    )
    if not has_perm:
        raise HTTPException(status_code=403, detail="Must own or have admin permission")

    token = secrets.token_urlsafe(32)

    pw_hash = hash_password(body.password) if body.password else None

    expires_at = None
    if body.expires_in_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=body.expires_in_hours)

    link = ShareLink(
        token=token,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        permission=body.permission,
        created_by=user.id,
        expires_at=expires_at,
        password_hash=pw_hash,
    )
    db.add(link)
    await db.flush()

    await audit_service.log(
        db, action="share.create", user_id=user.id,
        resource_type=body.resource_type, resource_id=body.resource_id,
        metadata={"token_prefix": token[:8]},
    )

    base_url = str(request.base_url).rstrip("/")
    response = ShareLinkResponse.model_validate(link)
    response.url = f"{base_url}/api/v1/sharing/resolve/{token}"
    return response


@router.get("/links", response_model=ShareLinkListResponse)
async def list_share_links(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    result = await db.execute(
        select(ShareLink)
        .where(ShareLink.created_by == user.id)
        .order_by(ShareLink.created_at.desc())
    )
    links = result.scalars().all()
    return ShareLinkListResponse(items=links, total=len(links))


@router.delete("/links/{link_id}", status_code=200)
async def revoke_share_link(
    link_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    result = await db.execute(select(ShareLink).where(ShareLink.id == link_id))
    link = result.scalar_one_or_none()
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")

    if link.created_by != user.id:
        raise HTTPException(status_code=403, detail="Not your share link")

    link.is_active = False
    await db.flush()

    await audit_service.log(
        db, action="share.revoke", user_id=user.id,
        resource_type=link.resource_type, resource_id=link.resource_id,
    )

    return {"message": "Share link revoked"}


@router.get("/resolve/{token}", response_model=ShareResolveResponse)
async def resolve_share_link(
    token: str,
    request: Request,
    password: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ShareLink).where(ShareLink.token == token, ShareLink.is_active == True)  # noqa: E712
    )
    link = result.scalar_one_or_none()

    # don't reveal whether token exists
    if not link:
        raise HTTPException(status_code=404, detail="Link not found or expired")

    if link.expires_at and link.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=404, detail="Link not found or expired")

    if link.password_hash:
        if not password or not verify_password(password, link.password_hash):
            raise HTTPException(status_code=403, detail="Invalid password")

    link.access_count += 1
    await db.flush()

    resource_name = await _get_resource_name(db, link.resource_type, link.resource_id)
    mime_type = None
    size_bytes = None
    file = None

    if link.resource_type == "file":
        file_result = await db.execute(select(File).where(File.id == link.resource_id))
        file = file_result.scalar_one_or_none()
        if file:
            mime_type = file.mime_type
            size_bytes = file.size_bytes

    from app.core.storage import StorageService
    storage = StorageService()

    download_url = ""
    if link.resource_type == "file" and file:
        download_url = await storage.get_presigned_url(file.storage_key, expires_in=300)

    await audit_service.log(
        db, action="share.access",
        resource_type=link.resource_type, resource_id=link.resource_id,
        metadata={"token_prefix": token[:8]},
        ip_address=request.client.host if request.client else None,
    )

    return ShareResolveResponse(
        resource_type=link.resource_type,
        resource_id=link.resource_id,
        name=resource_name,
        mime_type=mime_type,
        size_bytes=size_bytes,
        download_url=download_url,
        permission=link.permission,
    )


@router.post("/permissions", response_model=PermissionResponse, status_code=201)
async def grant_permission(
    body: PermissionGrantRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    has_perm = await permission_service.check_permission(
        db, user.id, body.resource_type, body.resource_id, "admin"
    )
    if not has_perm:
        raise HTTPException(status_code=403, detail="Must have admin permission to share")

    target_result = await db.execute(
        select(User).where(User.email == body.user_email.lower().strip())
    )
    target = target_result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")

    existing = await db.execute(
        select(Permission).where(
            Permission.resource_type == body.resource_type,
            Permission.resource_id == body.resource_id,
            Permission.user_id == target.id,
        )
    )
    perm = existing.scalar_one_or_none()

    if perm:
        perm.permission = body.permission
        perm.granted_by = user.id
    else:
        perm = Permission(
            resource_type=body.resource_type,
            resource_id=body.resource_id,
            user_id=target.id,
            permission=body.permission,
            granted_by=user.id,
        )
        db.add(perm)

    await db.flush()

    await audit_service.log(
        db, action="permission.grant", user_id=user.id,
        resource_type=body.resource_type, resource_id=body.resource_id,
        metadata={"target_user": target.id, "level": body.permission},
    )

    response = PermissionResponse.model_validate(perm)
    response.user_email = target.email
    response.user_display_name = target.display_name
    return response


@router.get("/permissions/{resource_type}/{resource_id}", response_model=PermissionListResponse)
async def list_permissions(
    resource_type: str,
    resource_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    has_perm = await permission_service.check_permission(
        db, user.id, resource_type, resource_id, "view"
    )
    if not has_perm:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(Permission).where(
            Permission.resource_type == resource_type,
            Permission.resource_id == resource_id,
        )
    )
    perms = result.scalars().all()

    items = []
    for p in perms:
        user_r = await db.execute(select(User).where(User.id == p.user_id))
        u = user_r.scalar_one_or_none()
        item = PermissionResponse.model_validate(p)
        item.user_email = u.email if u else ""
        item.user_display_name = u.display_name if u else ""
        items.append(item)

    return PermissionListResponse(items=items, total=len(items))


@router.delete("/permissions/{permission_id}", status_code=200)
async def revoke_permission(
    permission_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    result = await db.execute(select(Permission).where(Permission.id == permission_id))
    perm = result.scalar_one_or_none()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")

    # can revoke if admin on resource or revoking own access
    is_admin = await permission_service.check_permission(
        db, user.id, perm.resource_type, perm.resource_id, "admin"
    )
    if not is_admin and perm.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    await db.delete(perm)
    await db.flush()

    await audit_service.log(
        db, action="permission.revoke", user_id=user.id,
        resource_type=perm.resource_type, resource_id=perm.resource_id,
    )

    return {"message": "Permission revoked"}
