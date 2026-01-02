from __future__ import annotations
from datetime import datetime, timezone

from sqlalchemy import Boolean, ForeignKey, Index, String, text
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AdminRefreshToken(Base):
    __tablename__ = "admin_refresh_tokens"
    __table_args__ = (
        Index("idx_admin_refresh_tokens_admin_id", "admin_id"),
        Index("idx_admin_refresh_tokens_expires_at", "expires_at"),
        Index("uq_admin_refresh_tokens_rt_hash", "rt_hash", unique=True),
    )

    id: Mapped[int] = mapped_column(mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admin_users.id", ondelete="CASCADE"))
    rt_hash: Mapped[str] = mapped_column(String(64))
    device_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        mysql.DATETIME(fsp=3),
        default=utcnow,
        server_default=text("CURRENT_TIMESTAMP(3)"),
    )
    expires_at: Mapped[datetime] = mapped_column(mysql.DATETIME(fsp=3))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    admin_user = relationship("AdminUser", backref="refresh_tokens")


__all__ = ["AdminRefreshToken"]
