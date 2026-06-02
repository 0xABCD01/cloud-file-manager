from datetime import datetime
from sqlalchemy import String, ForeignKey, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, _utcnow


class ShareLink(Base):
    __tablename__ = "share_link"

    token: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    resource_type: Mapped[str] = mapped_column(String(10), nullable=False)
    resource_id: Mapped[str] = mapped_column(nullable=False, index=True)
    permission: Mapped[str] = mapped_column(String(10), default="view")
    created_by: Mapped[str] = mapped_column(ForeignKey("user.id"), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    access_count: Mapped[int] = mapped_column(Integer, default=0)
    password_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)


class Permission(Base):
    __tablename__ = "permission"

    resource_type: Mapped[str] = mapped_column(String(10), nullable=False)
    resource_id: Mapped[str] = mapped_column(nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("user.id"), nullable=False, index=True)
    permission: Mapped[str] = mapped_column(String(10), default="view")
    granted_by: Mapped[str] = mapped_column(ForeignKey("user.id"), nullable=False)
