import hashlib
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile, Form, Request, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.file import File, FileVersion
from app.models.folder import Folder
from app.models.user import User
from app.core.security import decode_token, TokenExpiredError, TokenInvalidError, TokenTypeMismatchError
from app.core.storage import StorageService
from app.utils.path import sanitize_filename, generate_storage_key
from app.utils.mime import validate_upload, MAX_FILE_SIZE_BYTES
from app.schemas.files import FileResponse, FileListResponse, FileRenameRequest, FileMoveRequest
from app.services.audit_service import audit_service
from app.services.permission_service import permission_service

router = APIRouter(prefix="/api/v1/files", tags=["files"])

storage = StorageService()


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


@router.post("/upload", response_model=FileResponse, status_code=201)
async def upload_file(
    request: Request,
    file: UploadFile = FastAPIFile(...),
    folder_id: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    if folder_id:
        has_perm = await permission_service.check_permission(
            db, user.id, "folder", folder_id, "edit"
        )
        if not has_perm:
            raise HTTPException(status_code=403, detail="No edit permission on folder")

    # read first 8k for mime detection then rewind
    header = await file.read(8192)
    await file.seek(0)

    detected_mime, error = validate_upload(header, file.content_type)
    if error:
        raise HTTPException(status_code=422, detail=error)

    if user.storage_used_bytes + (file.size or 0) > user.storage_quota_bytes:
        raise HTTPException(status_code=413, detail="Storage quota exceeded")

    storage_key = generate_storage_key(file.filename or "upload", user.id)

    hasher = hashlib.sha256()
    content = await file.read()
    hasher.update(content)
    checksum = hasher.hexdigest()

    async def _content_iter():
        yield content

    result = await storage.upload_file(
        storage_key=storage_key,
        file_content=_content_iter(),
        content_type=detected_mime,
        metadata={"original_filename": file.filename or "upload"},
    )

    safe_name = sanitize_filename(file.filename or "upload")

    # append number if name already taken in this folder
    query = select(File.id).where(
        File.owner_id == user.id,
        File.folder_id == folder_id,
        File.name == safe_name,
        File.is_trashed == False,  # noqa: E712
    )
    existing = await db.execute(query)
    if existing.scalar_one_or_none():
        base = safe_name.rsplit(".", 1)
        counter = 1
        while True:
            candidate = f"{base[0]} ({counter}).{base[1]}" if len(base) > 1 else f"{base[0]} ({counter})"
            check = await db.execute(
                select(File.id).where(
                    File.owner_id == user.id,
                    File.folder_id == folder_id,
                    File.name == candidate,
                    File.is_trashed == False,
                )
            )
            if not check.scalar_one_or_none():
                safe_name = candidate
                break
            counter += 1

    db_file = File(
        name=safe_name,
        storage_key=storage_key,
        mime_type=detected_mime,
        size_bytes=result["size_bytes"],
        checksum_sha256=checksum,
        owner_id=user.id,
        folder_id=folder_id,
    )
    db.add(db_file)
    await db.flush()

    version = FileVersion(
        file_id=db_file.id,
        version_number=1,
        storage_key=storage_key,
        size_bytes=result["size_bytes"],
        checksum_sha256=checksum,
        uploaded_by=user.id,
    )
    db.add(version)

    user.storage_used_bytes += result["size_bytes"]
    await db.flush()

    await audit_service.log(
        db, action="file.upload", user_id=user.id,
        resource_type="file", resource_id=db_file.id,
        metadata={"name": safe_name, "size": result["size_bytes"], "mime": detected_mime},
        ip_address=request.client.host if request.client else None,
    )

    return db_file


@router.get("/", response_model=FileListResponse)
async def list_files(
    request: Request,
    folder_id: str | None = None,
    search: str | None = None,
    sort: str = "-created",
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100),
    trashed: bool = False,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    query = select(File).where(File.owner_id == user.id)

    if trashed:
        query = query.where(File.is_trashed == True)  # noqa: E712
    else:
        query = query.where(File.is_trashed == False)  # noqa: E712

    if folder_id is not None:
        query = query.where(File.folder_id == folder_id)
    if search:
        query = query.where(File.name.ilike(f"%{search}%"))

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    sort_map = {
        "name": File.name, "-name": File.name.desc(),
        "size": File.size_bytes, "-size": File.size_bytes.desc(),
        "created": File.created_at, "-created": File.created_at.desc(),
    }
    order = sort_map.get(sort, File.created_at.desc())
    query = query.order_by(order)

    query = query.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(query)
    files = result.scalars().all()

    return FileListResponse(items=files, total=total, page=page, per_page=per_page)


@router.get("/{file_id}", response_model=FileResponse)
async def get_file(
    file_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    result = await db.execute(select(File).where(File.id == file_id))
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    has_perm = await permission_service.check_permission(
        db, user.id, "file", file_id, "view"
    )
    if not has_perm:
        raise HTTPException(status_code=403, detail="Access denied")

    return file


@router.get("/{file_id}/download")
async def download_file(
    file_id: str,
    request: Request,
    preview: bool = False,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    result = await db.execute(select(File).where(File.id == file_id))
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    has_perm = await permission_service.check_permission(
        db, user.id, "file", file_id, "view"
    )
    if not has_perm:
        raise HTTPException(status_code=403, detail="Access denied")

    disposition = "attachment"
    if preview and file.mime_type in ("image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"):
        disposition = "inline"
    # SVG is always attachment to prevent XSS
    if "svg" in file.mime_type:
        disposition = "attachment"

    url = await storage.get_presigned_url(
        file.storage_key, expires_in=60, disposition=disposition
    )

    await audit_service.log(
        db, action="file.download", user_id=user.id,
        resource_type="file", resource_id=file_id,
        ip_address=request.client.host if request.client else None,
    )

    return {"download_url": url}


@router.patch("/{file_id}", response_model=FileResponse)
async def update_file(
    file_id: str,
    body: FileRenameRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    result = await db.execute(select(File).where(File.id == file_id))
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    has_perm = await permission_service.check_permission(
        db, user.id, "file", file_id, "edit"
    )
    if not has_perm:
        raise HTTPException(status_code=403, detail="Access denied")

    old_name = file.name
    file.name = sanitize_filename(body.name)
    await db.flush()

    await audit_service.log(
        db, action="file.rename", user_id=user.id,
        resource_type="file", resource_id=file_id,
        metadata={"old_name": old_name, "new_name": file.name},
    )

    return file


@router.delete("/{file_id}", status_code=200)
async def delete_file(
    file_id: str,
    request: Request,
    permanent: bool = False,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    result = await db.execute(select(File).where(File.id == file_id))
    file = result.scalar_one_or_none()
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    has_perm = await permission_service.check_permission(
        db, user.id, "file", file_id, "admin"
    )
    if not has_perm:
        raise HTTPException(status_code=403, detail="Access denied")

    if permanent:
        if not file.is_trashed:
            raise HTTPException(
                status_code=400,
                detail="File must be trashed before permanent deletion"
            )
        await storage.delete_file(file.storage_key)
        user.storage_used_bytes = max(0, user.storage_used_bytes - file.size_bytes)
        await db.delete(file)
        await db.flush()

        await audit_service.log(
            db, action="file.delete_permanent", user_id=user.id,
            resource_type="file", resource_id=file_id,
        )
        return {"message": "File permanently deleted"}
    else:
        file.is_trashed = True
        file.trashed_at = datetime.now(timezone.utc)
        await db.flush()

        await audit_service.log(
            db, action="file.trash", user_id=user.id,
            resource_type="file", resource_id=file_id,
        )
        return {"message": "File moved to trash"}
