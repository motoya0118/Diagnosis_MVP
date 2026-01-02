from __future__ import annotations
from datetime import datetime, timezone

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("idx_users_email", "email", unique=True),
    )

    id: Mapped[int] = mapped_column(mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(191))
    hashed_password: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        mysql.DATETIME(fsp=3),
        default=utcnow,
        server_default=text("CURRENT_TIMESTAMP(3)"),
    )

    oauth_accounts: Mapped[list[OAuthAccount]] = relationship(
        "OAuthAccount",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    refresh_tokens: Mapped[list[RefreshToken]] = relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_user_id",
            name="uq_oauth_accounts_provider_provider_user_id",
        ),
        Index("idx_oauth_accounts_user_id", "user_id"),
    )

    id: Mapped[int] = mapped_column(mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    provider: Mapped[str] = mapped_column(String(64))
    provider_user_id: Mapped[str] = mapped_column(String(191))

    user: Mapped[User] = relationship("User", back_populates="oauth_accounts")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (
        Index("idx_refresh_tokens_user_id", "user_id"),
        Index("idx_refresh_tokens_expires_at", "expires_at"),
        Index("uq_refresh_tokens_rt_hash", "rt_hash", unique=True),
    )

    id: Mapped[int] = mapped_column(mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rt_hash: Mapped[str] = mapped_column(String(64))
    device_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        mysql.DATETIME(fsp=3),
        default=utcnow,
        server_default=text("CURRENT_TIMESTAMP(3)"),
    )
    expires_at: Mapped[datetime] = mapped_column(mysql.DATETIME(fsp=3))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")

    user: Mapped[User] = relationship("User", back_populates="refresh_tokens")
