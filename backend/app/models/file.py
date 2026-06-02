from datetime import datetime
from sqlalchemy import String, BigInteger, Integer, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, _utcnow


class File(Base):
    __tablename__ = "file"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_key: Mapped[str] = mapped_column(
        String(512), unique=True, index=True, nullable=False
    )
    mime_type: Mapped[str] = mapped_column(String(127), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    owner_id: Mapped[str] = mapped_column(
        ForeignKey("user.id"), nullable=False, index=True
    )
    folder_id: Mapped[str | None] = mapped_column(
        ForeignKey("folder.id"), nullable=True, index=True
    )
    is_trashed: Mapped[bool] = mapped_column(default=False)
    trashed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(default=_utcnow, onupdate=_utcnow)

    owner = relationship("User", back_populates="owned_files", lazy="noload")
    folder = relationship("Folder", back_populates="files", lazy="noload")
    versions = relationship("FileVersion", back_populates="file", lazy="noload",
                            cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint("owner_id", "folder_id", "name", name="uq_file_name_in_folder"),
        Index("ix_file_owner_folder", "owner_id", "folder_id"),
    )


class FileVersion(Base):
    __tablename__ = "file_version"

    file_id: Mapped[str] = mapped_column(
        ForeignKey("file.id", ondelete="CASCADE"), nullable=False, index=True
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), unique=True, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    uploaded_by: Mapped[str] = mapped_column(ForeignKey("user.id"), nullable=False)

    file = relationship("File", back_populates="versions", lazy="noload")
