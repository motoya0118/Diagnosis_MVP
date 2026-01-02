from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.db.base import Base

if TYPE_CHECKING:  # pragma: no cover
    from app.models.admin_user import AdminUser
    from app.models.user import User


def utcnow() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(microsecond=(now.microsecond // 1000) * 1000)


class UTCDateTime(TypeDecorator[datetime]):
    """MySQL-compatible UTC-preserving datetime column."""

    impl = mysql.DATETIME(fsp=3)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class Diagnostic(Base):
    __tablename__ = "diagnostics"
    __table_args__ = (
        UniqueConstraint("code", name="uq_diagnostics_code"),
        Index("idx_diagnostics_code", "code"),
    )

    id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True
    )
    code: Mapped[str] = mapped_column(String(64))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome_table_name: Mapped[str] = mapped_column(String(64))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
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

    versions: Mapped[list[DiagnosticVersion]] = relationship(
        "DiagnosticVersion", back_populates="diagnostic"
    )
    questions: Mapped[list[Question]] = relationship("Question", back_populates="diagnostic")
    sessions: Mapped[list[DiagnosticSession]] = relationship(
        "DiagnosticSession", back_populates="diagnostic"
    )
    active_config: Mapped[CfgActiveVersion | None] = relationship(
        "CfgActiveVersion", back_populates="diagnostic", uselist=False
    )


class DiagnosticVersion(Base):
    __tablename__ = "diagnostic_versions"
    __table_args__ = (
        UniqueConstraint("diagnostic_id", "name", name="uq_diagnostic_versions_diagnostic_name"),
        Index("idx_diagnostic_versions_diagnostic", "diagnostic_id", "id"),
        Index("idx_diagnostic_versions_created_by", "created_by_admin_id"),
        Index("idx_diagnostic_versions_updated_by", "updated_by_admin_id"),
    )

    id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True
    )
    diagnostic_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("diagnostics.id", ondelete="RESTRICT"),
    )
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    src_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_admin_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("admin_users.id", ondelete="RESTRICT"),
    )
    updated_by_admin_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("admin_users.id", ondelete="RESTRICT"),
    )
    finalized_by_admin_id: Mapped[int | None] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("admin_users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    finalized_at: Mapped[datetime | None] = mapped_column(
        mysql.DATETIME(fsp=3),
        nullable=True,
    )
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

    diagnostic: Mapped[Diagnostic] = relationship("Diagnostic", back_populates="versions")
    created_by_admin: Mapped[AdminUser] = relationship(
        "AdminUser", foreign_keys=[created_by_admin_id]
    )
    updated_by_admin: Mapped[AdminUser] = relationship(
        "AdminUser", foreign_keys=[updated_by_admin_id]
    )
    finalized_by_admin: Mapped[AdminUser | None] = relationship(
        "AdminUser", foreign_keys=[finalized_by_admin_id]
    )
    audit_logs: Mapped[list[DiagnosticVersionAuditLog]] = relationship(
        "DiagnosticVersionAuditLog", back_populates="version"
    )
    active_config: Mapped[list[CfgActiveVersion]] = relationship(
        "CfgActiveVersion", back_populates="version"
    )
    version_questions: Mapped[list[VersionQuestion]] = relationship(
        "VersionQuestion", back_populates="version"
    )
    version_options: Mapped[list[VersionOption]] = relationship(
        "VersionOption", back_populates="version"
    )
    version_outcomes: Mapped[list[VersionOutcome]] = relationship(
        "VersionOutcome", back_populates="version"
    )
    sessions: Mapped[list[DiagnosticSession]] = relationship(
        "DiagnosticSession", back_populates="version"
    )


class DiagnosticVersionAuditLog(Base):
    __tablename__ = "aud_diagnostic_version_logs"
    __table_args__ = (
        Index("idx_aud_dv_logs_version", "version_id", "created_at"),
        Index("idx_aud_dv_logs_admin", "admin_user_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True
    )
    version_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("diagnostic_versions.id", ondelete="RESTRICT"),
    )
    admin_user_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("admin_users.id", ondelete="RESTRICT"),
    )
    action: Mapped[str] = mapped_column(String(32))
    field_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    old_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        mysql.DATETIME(fsp=3), default=utcnow, server_default=text("CURRENT_TIMESTAMP(3)")
    )

    version: Mapped[DiagnosticVersion] = relationship(
        "DiagnosticVersion", back_populates="audit_logs"
    )
    admin_user: Mapped[AdminUser] = relationship("AdminUser")


class CfgActiveVersion(Base):
    __tablename__ = "cfg_active_versions"
    __table_args__ = (
        UniqueConstraint("diagnostic_id", name="uq_cfg_active_versions_scope"),
        Index("idx_cfg_active_versions_version", "diagnostic_id", "version_id"),
    )

    id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True
    )
    diagnostic_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("diagnostics.id", ondelete="RESTRICT"),
    )
    version_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("diagnostic_versions.id", ondelete="RESTRICT"),
    )
    created_by_admin_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("admin_users.id", ondelete="RESTRICT"),
    )
    updated_by_admin_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("admin_users.id", ondelete="RESTRICT"),
    )
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

    diagnostic: Mapped[Diagnostic] = relationship(
        "Diagnostic", back_populates="active_config"
    )
    version: Mapped[DiagnosticVersion] = relationship(
        "DiagnosticVersion", back_populates="active_config"
    )
    created_by_admin: Mapped[AdminUser] = relationship(
        "AdminUser", foreign_keys=[created_by_admin_id]
    )
    updated_by_admin: Mapped[AdminUser] = relationship(
        "AdminUser", foreign_keys=[updated_by_admin_id]
    )


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        UniqueConstraint("diagnostic_id", "q_code", name="uq_questions_code"),
        Index(
            "idx_questions_diagnostic_active_sort",
            "diagnostic_id",
            "is_active",
            "sort_order",
            "id",
        ),
    )

    id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True
    )
    diagnostic_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("diagnostics.id", ondelete="RESTRICT"),
    )
    q_code: Mapped[str] = mapped_column(String(64))
    display_text: Mapped[str] = mapped_column(String(1000))
    multi: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
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

    diagnostic: Mapped[Diagnostic] = relationship("Diagnostic", back_populates="questions")
    options: Mapped[list[Option]] = relationship("Option", back_populates="question")
    version_questions: Mapped[list[VersionQuestion]] = relationship(
        "VersionQuestion", back_populates="question"
    )


class Option(Base):
    __tablename__ = "options"
    __table_args__ = (
        UniqueConstraint("question_id", "opt_code", name="uq_options_code"),
        UniqueConstraint("question_id", "sort_order", name="uq_options_question_sort"),
        Index("idx_options_question_sort_id", "question_id", "sort_order", "id"),
    )

    id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True
    )
    question_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("questions.id", ondelete="RESTRICT"),
    )
    opt_code: Mapped[str] = mapped_column(String(64))
    display_label: Mapped[str] = mapped_column(String(500))
    llm_op: Mapped[dict | None] = mapped_column(mysql.JSON(), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
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

    question: Mapped[Question] = relationship("Question", back_populates="options")
    version_options: Mapped[list[VersionOption]] = relationship(
        "VersionOption", back_populates="option"
    )


class VersionQuestion(Base):
    __tablename__ = "version_questions"
    __table_args__ = (
        UniqueConstraint("version_id", "question_id", name="uq_version_questions_version_question"),
        Index("idx_version_questions_sort", "version_id", "sort_order", "question_id"),
        Index("idx_version_questions_active", "version_id", "is_active", "sort_order"),
    )

    id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True
    )
    version_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("diagnostic_versions.id", ondelete="RESTRICT"),
    )
    diagnostic_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("diagnostics.id", ondelete="RESTRICT"),
    )
    question_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("questions.id", ondelete="RESTRICT"),
    )
    q_code: Mapped[str] = mapped_column(String(64))
    display_text: Mapped[str] = mapped_column(String(1000))
    multi: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    created_by_admin_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("admin_users.id", ondelete="RESTRICT"),
    )
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

    version: Mapped[DiagnosticVersion] = relationship(
        "DiagnosticVersion", back_populates="version_questions"
    )
    diagnostic: Mapped[Diagnostic] = relationship("Diagnostic")
    question: Mapped[Question] = relationship("Question", back_populates="version_questions")
    created_by_admin: Mapped[AdminUser] = relationship("AdminUser")
    version_options: Mapped[list["VersionOption"]] = relationship(
        "VersionOption", back_populates="version_question"
    )


class VersionOption(Base):
    __tablename__ = "version_options"
    __table_args__ = (
        UniqueConstraint(
            "version_id",
            "version_question_id",
            "opt_code",
            name="uq_version_options_version_question_opt",
        ),
        Index(
            "idx_version_options_sort",
            "version_id",
            "version_question_id",
            "sort_order",
        ),
        Index(
            "idx_version_options_active",
            "version_id",
            "is_active",
            "version_question_id",
            "sort_order",
        ),
    )

    id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True
    )
    version_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("diagnostic_versions.id", ondelete="RESTRICT"),
    )
    version_question_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey(
            "version_questions.id",
            ondelete="RESTRICT",
            name="fk_version_options_version_question",
        ),
    )
    option_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("options.id", ondelete="RESTRICT"),
    )
    q_code: Mapped[str] = mapped_column(String(64))
    opt_code: Mapped[str] = mapped_column(String(64))
    display_label: Mapped[str] = mapped_column(String(500))
    llm_op: Mapped[dict | None] = mapped_column(mysql.JSON(), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    created_by_admin_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("admin_users.id", ondelete="RESTRICT"),
    )
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

    version: Mapped[DiagnosticVersion] = relationship(
        "DiagnosticVersion", back_populates="version_options"
    )
    version_question: Mapped[VersionQuestion] = relationship(
        "VersionQuestion", back_populates="version_options"
    )
    option: Mapped[Option] = relationship("Option", back_populates="version_options")
    created_by_admin: Mapped[AdminUser] = relationship("AdminUser")
    answer_choices: Mapped[list[AnswerChoice]] = relationship(
        "AnswerChoice", back_populates="version_option"
    )


class VersionOutcome(Base):
    __tablename__ = "version_outcomes"
    __table_args__ = (
        UniqueConstraint("version_id", "outcome_id", name="uq_version_outcomes_version_outcome"),
        Index("idx_version_outcomes_sort", "version_id", "sort_order", "outcome_id"),
    )

    id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True
    )
    version_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("diagnostic_versions.id", ondelete="RESTRICT"),
    )
    outcome_id: Mapped[int] = mapped_column(mysql.BIGINT(unsigned=True))
    outcome_meta_json: Mapped[dict | None] = mapped_column(mysql.JSON(), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1")
    created_by_admin_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("admin_users.id", ondelete="RESTRICT"),
    )
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

    version: Mapped[DiagnosticVersion] = relationship(
        "DiagnosticVersion", back_populates="version_outcomes"
    )
    created_by_admin: Mapped[AdminUser] = relationship("AdminUser")


class DiagnosticSession(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint("session_code", name="uq_sessions_session_code"),
        Index("idx_sessions_user", "user_id"),
        Index("idx_sessions_diagnostic_version", "diagnostic_id", "version_id"),
        Index("idx_sessions_ended_at", "ended_at"),
    )

    id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True
    )
    user_id: Mapped[int | None] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
    )
    session_code: Mapped[str] = mapped_column(String(64))
    diagnostic_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("diagnostics.id", ondelete="RESTRICT"),
    )
    version_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("diagnostic_versions.id", ondelete="RESTRICT"),
    )
    llm_result: Mapped[dict | None] = mapped_column(mysql.JSON(), nullable=True)
    version_options_hash: Mapped[str] = mapped_column(String(128))
    ended_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, server_default=text("CURRENT_TIMESTAMP(3)")
    )
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(),
        default=utcnow,
        onupdate=utcnow,
        server_default=text("CURRENT_TIMESTAMP(3)"),
        server_onupdate=text("CURRENT_TIMESTAMP(3)"),
    )

    user: Mapped[User | None] = relationship("User")
    diagnostic: Mapped[Diagnostic] = relationship("Diagnostic", back_populates="sessions")
    version: Mapped[DiagnosticVersion] = relationship("DiagnosticVersion", back_populates="sessions")
    answer_choices: Mapped[list[AnswerChoice]] = relationship(
        "AnswerChoice", back_populates="session"
    )


class AnswerChoice(Base):
    __tablename__ = "answer_choices"
    __table_args__ = (
        UniqueConstraint("session_id", "version_option_id", name="uq_answer_choices_once"),
        Index("idx_answer_choices_session", "session_id"),
    )

    id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True
    )
    session_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("sessions.id", ondelete="RESTRICT"),
    )
    version_option_id: Mapped[int] = mapped_column(
        mysql.BIGINT(unsigned=True),
        ForeignKey("version_options.id", ondelete="RESTRICT"),
    )
    answered_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, server_default=text("CURRENT_TIMESTAMP(3)")
    )

    session: Mapped[DiagnosticSession] = relationship(
        "DiagnosticSession", back_populates="answer_choices"
    )
    version_option: Mapped[VersionOption] = relationship(
        "VersionOption", back_populates="answer_choices"
    )


__all__ = [
    "Diagnostic",
    "DiagnosticVersion",
    "DiagnosticVersionAuditLog",
    "CfgActiveVersion",
    "Question",
    "Option",
    "VersionQuestion",
    "VersionOption",
    "VersionOutcome",
    "DiagnosticSession",
    "AnswerChoice",
]
