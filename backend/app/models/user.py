from datetime import datetime
from sqlalchemy import String, BigInteger, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, _utcnow


class User(Base):
    __tablename__ = "user"

    email: Mapped[str] = mapped_column(
        String(320), unique=True, index=True, nullable=False
    )
    hashed_password: Mapped[str] = mapped_column(String(128), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    storage_quota_bytes: Mapped[int] = mapped_column(
        BigInteger, default=5 * 1024 * 1024 * 1024  # 5 GB
    )
    storage_used_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(default=_utcnow, onupdate=_utcnow)

    owned_files = relationship("File", back_populates="owner", lazy="noload")
    owned_folders = relationship("Folder", back_populates="owner", lazy="noload")
