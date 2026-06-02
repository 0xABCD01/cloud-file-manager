from datetime import datetime
from sqlalchemy import String, ForeignKey, CheckConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, _utcnow


class Folder(Base):
    __tablename__ = "folder"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("user.id"), nullable=False, index=True
    )
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("folder.id"), nullable=True, index=True
    )
    is_trashed: Mapped[bool] = mapped_column(default=False)
    trashed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    updated_at: Mapped[datetime] = mapped_column(default=_utcnow, onupdate=_utcnow)

    owner = relationship("User", back_populates="owned_folders", lazy="noload")
    children = relationship("Folder", back_populates="parent", lazy="noload")
    parent = relationship("Folder", back_populates="children", remote_side="Folder.id", lazy="noload")
    files = relationship("File", back_populates="folder", lazy="noload")

    __table_args__ = (
        CheckConstraint("id != parent_id", name="no_self_reference"),
        Index("ix_folder_owner_parent", "owner_id", "parent_id"),
    )
