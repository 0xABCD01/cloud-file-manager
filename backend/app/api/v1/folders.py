from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.folder import Folder
from app.models.file import File
from app.models.user import User
from app.core.security import decode_token, TokenExpiredError, TokenInvalidError, TokenTypeMismatchError
from app.schemas.folders import (
    FolderCreateRequest,
    FolderUpdateRequest,
    FolderResponse,
    BreadcrumbItem,
    FolderContentsResponse,
    FolderTreeResponse,
    FolderTreeNode,
    TrashResponse,
    ContentItem,
)
from app.services.audit_service import audit_service
from app.services.permission_service import permission_service
from app.utils.path import sanitize_filename

router = APIRouter(prefix="/api/v1/folders", tags=["folders"])

MAX_DEPTH = 20


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


async def _get_folder_depth(db: AsyncSession, folder_id: str) -> int:
    depth = 0
    current_id = folder_id
    while current_id:
        result = await db.execute(
            select(Folder.parent_id).where(Folder.id == current_id)
        )
        parent_id = result.scalar_one_or_none()
        if parent_id is None:
            break
        current_id = parent_id
        depth += 1
        if depth > MAX_DEPTH:
            break
    return depth


async def _get_breadcrumb(db: AsyncSession, folder_id: str) -> list[BreadcrumbItem]:
    items = []
    current_id = folder_id
    seen = set()
    while current_id:
        if current_id in seen:
            break  # cycle protection
        seen.add(current_id)
        result = await db.execute(
            select(Folder.id, Folder.name).where(Folder.id == current_id)
        )
        row = result.first()
        if not row:
            break
        items.append(BreadcrumbItem(id=row.id, name=row.name))
        parent_result = await db.execute(
            select(Folder.parent_id).where(Folder.id == current_id)
        )
        current_id = parent_result.scalar_one_or_none()
    items.reverse()
    return items


async def _is_descendant(db: AsyncSession, ancestor_id: str, descendant_id: str) -> bool:
    current = descendant_id
    seen = set()
    while current:
        if current in seen:
            return False
        seen.add(current)
        if current == ancestor_id:
            return True
        result = await db.execute(
            select(Folder.parent_id).where(Folder.id == current)
        )
        current = result.scalar_one_or_none()
    return False


@router.post("/", response_model=FolderResponse, status_code=201)
async def create_folder(
    body: FolderCreateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    if body.parent_id:
        has_perm = await permission_service.check_permission(
            db, user.id, "folder", body.parent_id, "edit"
        )
        if not has_perm:
            raise HTTPException(status_code=403, detail="No edit permission on parent folder")

        depth = await _get_folder_depth(db, body.parent_id)
        if depth >= MAX_DEPTH:
            raise HTTPException(status_code=400, detail=f"Maximum folder depth ({MAX_DEPTH}) reached")

    name = sanitize_filename(body.name)
    if not name or name == "untitled":
        raise HTTPException(status_code=422, detail="Invalid folder name")

    query = select(Folder.id).where(
        Folder.owner_id == user.id,
        Folder.parent_id == body.parent_id,
        Folder.name == name,
        Folder.is_trashed == False,  # noqa: E712
    )
    existing = await db.execute(query)
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Folder with this name already exists")

    folder = Folder(name=name, owner_id=user.id, parent_id=body.parent_id)
    db.add(folder)
    await db.flush()

    await audit_service.log(
        db, action="folder.create", user_id=user.id,
        resource_type="folder", resource_id=folder.id,
        ip_address=request.client.host if request.client else None,
    )

    return folder


@router.get("/{folder_id}", response_model=dict)
async def get_folder(
    folder_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    has_perm = await permission_service.check_permission(
        db, user.id, "folder", folder_id, "view"
    )
    if not has_perm:
        raise HTTPException(status_code=403, detail="Access denied")

    breadcrumb = await _get_breadcrumb(db, folder_id)

    return {
        "folder": FolderResponse.model_validate(folder),
        "breadcrumb": [b.model_dump() for b in breadcrumb],
    }


@router.get("/{folder_id}/contents", response_model=dict)
async def get_folder_contents(
    folder_id: str,
    request: Request,
    sort: str = "name",
    include_trashed: bool = False,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    has_perm = await permission_service.check_permission(
        db, user.id, "folder", folder_id, "view"
    )
    if not has_perm:
        raise HTTPException(status_code=403, detail="Access denied")

    folder_query = select(Folder).where(Folder.parent_id == folder_id, Folder.owner_id == user.id)
    if not include_trashed:
        folder_query = folder_query.where(Folder.is_trashed == False)  # noqa: E712
    folder_query = folder_query.order_by(Folder.name)
    folder_result = await db.execute(folder_query)
    subfolders = folder_result.scalars().all()

    file_query = select(File).where(File.folder_id == folder_id, File.owner_id == user.id)
    if not include_trashed:
        file_query = file_query.where(File.is_trashed == False)  # noqa: E712

    sort_map = {
        "name": File.name, "-name": File.name.desc(),
        "size": File.size_bytes, "-size": File.size_bytes.desc(),
        "modified": File.updated_at, "-modified": File.updated_at.desc(),
    }
    file_query = file_query.order_by(sort_map.get(sort, File.name))
    file_result = await db.execute(file_query)
    files = file_result.scalars().all()

    return {
        "folders": [FolderResponse.model_validate(f).model_dump() for f in subfolders],
        "files": [
            {
                "type": "file",
                "id": f.id,
                "name": f.name,
                "mime_type": f.mime_type,
                "size_bytes": f.size_bytes,
                "created_at": f.created_at.isoformat(),
                "updated_at": f.updated_at.isoformat(),
            }
            for f in files
        ],
        "total_items": len(subfolders) + len(files),
    }


@router.patch("/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: str,
    body: FolderUpdateRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    has_perm = await permission_service.check_permission(
        db, user.id, "folder", folder_id, "edit"
    )
    if not has_perm:
        raise HTTPException(status_code=403, detail="Access denied")

    if body.name:
        folder.name = sanitize_filename(body.name)

    if body.parent_id is not None:
        if body.parent_id == folder_id:
            raise HTTPException(status_code=400, detail="Cannot move folder into itself")

        if await _is_descendant(db, folder_id, body.parent_id):
            raise HTTPException(
                status_code=400,
                detail="Cannot move a folder into its own descendants"
            )

        folder.parent_id = body.parent_id

    await db.flush()
    return folder


@router.delete("/{folder_id}", response_model=TrashResponse)
async def delete_folder(
    folder_id: str,
    request: Request,
    permanent: bool = False,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    result = await db.execute(select(Folder).where(Folder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")

    has_perm = await permission_service.check_permission(
        db, user.id, "folder", folder_id, "admin"
    )
    if not has_perm:
        raise HTTPException(status_code=403, detail="Access denied")

    now = datetime.now(timezone.utc)
    count = 0

    if permanent:
        if not folder.is_trashed:
            raise HTTPException(status_code=400, detail="Folder must be trashed first")

        # walk the tree to find all descendant folders
        descendant_folder_ids = [folder_id]
        current_level = [folder_id]
        while current_level:
            res = await db.execute(
                select(Folder.id).where(Folder.parent_id.in_(current_level))
            )
            next_level = list(res.scalars().all())
            descendant_folder_ids.extend(next_level)
            current_level = next_level

        files_result = await db.execute(
            select(File).where(File.folder_id.in_(descendant_folder_ids))
        )
        for f in files_result.scalars().all():
            from app.core.storage import StorageService
            svc = StorageService()
            await svc.delete_file(f.storage_key)
            user.storage_used_bytes = max(0, user.storage_used_bytes - f.size_bytes)
            await db.delete(f)
            count += 1

        await db.execute(
            Folder.__table__.delete().where(Folder.id.in_(descendant_folder_ids))
        )

        await audit_service.log(
            db, action="folder.delete_permanent", user_id=user.id,
            resource_type="folder", resource_id=folder_id,
            metadata={"items_deleted": count},
        )
        return TrashResponse(count=count, message="Folder permanently deleted")
    else:
        folder.is_trashed = True
        folder.trashed_at = now
        count = 1

        descendant_ids = [folder_id]
        current_level = [folder_id]
        while current_level:
            res = await db.execute(
                select(Folder.id).where(Folder.parent_id.in_(current_level))
            )
            next_level = list(res.scalars().all())
            descendant_ids.extend(next_level)
            current_level = next_level

        for fid in descendant_ids[1:]:
            f_res = await db.execute(select(Folder).where(Folder.id == fid))
            f = f_res.scalar_one_or_none()
            if f and not f.is_trashed:
                f.is_trashed = True
                f.trashed_at = now
                count += 1

        files_res = await db.execute(
            select(File).where(File.folder_id.in_(descendant_ids), File.is_trashed == False)
        )
        for f in files_res.scalars().all():
            f.is_trashed = True
            f.trashed_at = now
            count += 1

        await db.flush()

        await audit_service.log(
            db, action="folder.trash", user_id=user.id,
            resource_type="folder", resource_id=folder_id,
            metadata={"items_trashed": count},
        )
        return TrashResponse(count=count, message="Folder moved to trash")


@router.get("/tree", response_model=FolderTreeResponse)
async def get_folder_tree(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_current_user(request, db)

    result = await db.execute(
        select(Folder)
        .where(Folder.owner_id == user.id, Folder.is_trashed == False)  # noqa: E712
        .order_by(Folder.name)
        .limit(500)
    )
    all_folders = result.scalars().all()

    by_parent: dict[str | None, list] = {}
    for f in all_folders:
        by_parent.setdefault(f.parent_id, []).append(f)

    def build_tree(parent_id: str | None) -> list[FolderTreeNode]:
        nodes = []
        for f in by_parent.get(parent_id, []):
            nodes.append(FolderTreeNode(
                id=f.id,
                name=f.name,
                children=build_tree(f.id),
            ))
        return nodes

    tree = build_tree(None)
    truncated = len(all_folders) >= 500

    return FolderTreeResponse(tree=tree, truncated=truncated)
