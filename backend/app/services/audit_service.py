import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


class AuditService:
    SECURITY_EVENTS = {
        "auth.login_success",
        "auth.login_fail",
        "auth.register",
        "auth.password_change",
        "auth.token_refresh",
        "file.upload",
        "file.download",
        "file.delete",
        "file.move",
        "share.create",
        "share.access",
        "share.revoke",
        "permission.grant",
        "permission.revoke",
    }

    async def log(
        self,
        db: AsyncSession,
        *,
        action: str,
        user_id: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        metadata: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata_json=json.dumps(metadata) if metadata else None,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(entry)
        await db.flush()
        return entry


audit_service = AuditService()
