from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.share import Permission
from app.models.file import File
from app.models.folder import Folder

# admin > edit > view
PERMISSION_RANK = {
    "view": 1,
    "edit": 2,
    "admin": 3,
}


class PermissionService:
    async def check_permission(
        self,
        db: AsyncSession,
        user_id: str,
        resource_type: str,
        resource_id: str,
        required_level: str,
    ) -> bool:
        # owners always have full access
        if resource_type == "file":
            result = await db.execute(
                select(File.id).where(File.id == resource_id, File.owner_id == user_id)
            )
            if result.scalar_one_or_none():
                return True
        elif resource_type == "folder":
            result = await db.execute(
                select(Folder.id).where(Folder.id == resource_id, Folder.owner_id == user_id)
            )
            if result.scalar_one_or_none():
                return True

        # check direct permission record
        result = await db.execute(
            select(Permission.permission).where(
                Permission.resource_type == resource_type,
                Permission.resource_id == resource_id,
                Permission.user_id == user_id,
            )
        )
        perm = result.scalar_one_or_none()
        if perm and PERMISSION_RANK.get(perm, 0) >= PERMISSION_RANK.get(required_level, 0):
            return True

        # walk up the folder tree checking inherited permissions
        if resource_type == "file":
            result = await db.execute(
                select(File.folder_id).where(File.id == resource_id)
            )
            folder_id = result.scalar_one_or_none()
        else:
            result = await db.execute(
                select(Folder.parent_id).where(Folder.id == resource_id)
            )
            folder_id = result.scalar_one_or_none()

        while folder_id:
            result = await db.execute(
                select(Permission.permission).where(
                    Permission.resource_type == "folder",
                    Permission.resource_id == folder_id,
                    Permission.user_id == user_id,
                )
            )
            perm = result.scalar_one_or_none()
            if perm and PERMISSION_RANK.get(perm, 0) >= PERMISSION_RANK.get(required_level, 0):
                return True

            result = await db.execute(
                select(Folder.parent_id).where(Folder.id == folder_id)
            )
            folder_id = result.scalar_one_or_none()

        return False

    async def get_effective_permission(
        self, db: AsyncSession, user_id: str, resource_type: str, resource_id: str
    ) -> str | None:
        if resource_type == "file":
            result = await db.execute(
                select(File.id).where(File.id == resource_id, File.owner_id == user_id)
            )
        else:
            result = await db.execute(
                select(Folder.id).where(Folder.id == resource_id, Folder.owner_id == user_id)
            )
        if result.scalar_one_or_none():
            return "admin"

        result = await db.execute(
            select(Permission.permission).where(
                Permission.resource_type == resource_type,
                Permission.resource_id == resource_id,
                Permission.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()


permission_service = PermissionService()
