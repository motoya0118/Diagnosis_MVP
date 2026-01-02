from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, Index, Integer, String, Text, text
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MstAiJob(Base):
    __tablename__ = "mst_ai_jobs"
    __table_args__ = (
        Index("uq_mst_ai_jobs__name", "name", unique=True),
    )

    id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True
    )
    name: Mapped[str] = mapped_column(String(191))
    category: Mapped[str | None] = mapped_column(String(191), nullable=True)
    role_summary: Mapped[str] = mapped_column(Text)
    main_role: Mapped[str | None] = mapped_column(Text, nullable=True)
    collaboration_style: Mapped[str | None] = mapped_column(Text, nullable=True)
    strength_areas: Mapped[str | None] = mapped_column(Text, nullable=True)
    description: Mapped[str] = mapped_column(Text)
    avg_salary_jpy: Mapped[str | None] = mapped_column(String(64), nullable=True)
    target_phase: Mapped[str | None] = mapped_column(Text, nullable=True)
    core_skills: Mapped[str | None] = mapped_column(Text, nullable=True)
    deliverables: Mapped[str | None] = mapped_column(Text, nullable=True)
    pathway_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_tools: Mapped[str | None] = mapped_column(Text, nullable=True)
    advice: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        mysql.DATETIME(fsp=3), default=utcnow, server_default=text("CURRENT_TIMESTAMP(3)")
    )
    updated_at: Mapped[datetime] = mapped_column(
        mysql.DATETIME(fsp=3),
        default=utcnow,
        onupdate=utcnow,
        server_default=text("CURRENT_TIMESTAMP(3)"),
        server_onupdate=text("CURRENT_TIMESTAMP(3)"),
    )


__all__ = ["MstAiJob"]
