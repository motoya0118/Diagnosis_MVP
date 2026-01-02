"""
Create diagnostic module tables

Revision ID: 0003
Revises: 0002
Create Date: 2025-09-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "diagnostics",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("outcome_table_name", sa.String(length=64), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.Column(
            "updated_at",
            mysql.DATETIME(fsp=3),
            server_default=sa.text("CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_diagnostics"),
        sa.UniqueConstraint("code", name="uq_diagnostics_code"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index("idx_diagnostics_code", "diagnostics", ["code"], unique=False)

    op.create_table(
        "diagnostic_versions",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column(
            "diagnostic_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("diagnostics.id", ondelete="RESTRICT", name="fk_diagnostic_versions_diagnostic"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("system_prompt", sa.Text(), nullable=True),
        sa.Column("src_hash", sa.String(length=128), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "created_by_admin_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("admin_users.id", ondelete="RESTRICT", name="fk_diagnostic_versions_created_by"),
            nullable=False,
        ),
        sa.Column(
            "updated_by_admin_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("admin_users.id", ondelete="RESTRICT", name="fk_diagnostic_versions_updated_by"),
            nullable=False,
        ),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.Column(
            "updated_at",
            mysql.DATETIME(fsp=3),
            server_default=sa.text("CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_diagnostic_versions"),
        sa.UniqueConstraint("diagnostic_id", "name", name="uq_diagnostic_versions_diagnostic_name"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index(
        "idx_diagnostic_versions_diagnostic",
        "diagnostic_versions",
        ["diagnostic_id", "id"],
        unique=False,
    )
    op.create_index(
        "idx_diagnostic_versions_created_by",
        "diagnostic_versions",
        ["created_by_admin_id"],
        unique=False,
    )
    op.create_index(
        "idx_diagnostic_versions_updated_by",
        "diagnostic_versions",
        ["updated_by_admin_id"],
        unique=False,
    )

    op.create_table(
        "aud_diagnostic_version_logs",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column(
            "version_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("diagnostic_versions.id", ondelete="RESTRICT", name="fk_aud_dv_logs_version"),
            nullable=False,
        ),
        sa.Column(
            "admin_user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("admin_users.id", ondelete="RESTRICT", name="fk_aud_dv_logs_admin"),
            nullable=False,
        ),
        sa.Column("action", sa.String(length=32), nullable=False),
        sa.Column("field_name", sa.String(length=64), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_aud_diagnostic_version_logs"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index(
        "idx_aud_dv_logs_version",
        "aud_diagnostic_version_logs",
        ["version_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "idx_aud_dv_logs_admin",
        "aud_diagnostic_version_logs",
        ["admin_user_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "cfg_active_versions",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column(
            "diagnostic_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("diagnostics.id", ondelete="RESTRICT", name="fk_cfg_active_versions_diagnostic"),
            nullable=False,
        ),
        sa.Column(
            "version_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("diagnostic_versions.id", ondelete="RESTRICT", name="fk_cfg_active_versions_version"),
            nullable=False,
        ),
        sa.Column(
            "created_by_admin_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("admin_users.id", ondelete="RESTRICT", name="fk_cfg_active_versions_created_by"),
            nullable=False,
        ),
        sa.Column(
            "updated_by_admin_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("admin_users.id", ondelete="RESTRICT", name="fk_cfg_active_versions_updated_by"),
            nullable=False,
        ),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.Column(
            "updated_at",
            mysql.DATETIME(fsp=3),
            server_default=sa.text("CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_cfg_active_versions"),
        sa.UniqueConstraint("diagnostic_id", name="uq_cfg_active_versions_scope"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index(
        "idx_cfg_active_versions_version",
        "cfg_active_versions",
        ["diagnostic_id", "version_id"],
        unique=False,
    )

    op.create_table(
        "questions",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column(
            "diagnostic_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("diagnostics.id", ondelete="RESTRICT", name="fk_questions_diagnostic"),
            nullable=False,
        ),
        sa.Column("q_code", sa.String(length=64), nullable=False),
        sa.Column("display_text", sa.String(length=1000), nullable=False),
        sa.Column("multi", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.Column(
            "updated_at",
            mysql.DATETIME(fsp=3),
            server_default=sa.text("CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_questions"),
        sa.UniqueConstraint("diagnostic_id", "q_code", name="uq_questions_code"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index(
        "idx_questions_diagnostic_active_sort",
        "questions",
        ["diagnostic_id", "is_active", "sort_order", "id"],
        unique=False,
    )

    op.create_table(
        "options",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column(
            "question_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("questions.id", ondelete="RESTRICT", name="fk_options_question"),
            nullable=False,
        ),
        sa.Column("opt_code", sa.String(length=64), nullable=False),
        sa.Column("display_label", sa.String(length=500), nullable=False),
        sa.Column("llm_op", mysql.JSON(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.Column(
            "updated_at",
            mysql.DATETIME(fsp=3),
            server_default=sa.text("CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_options"),
        sa.UniqueConstraint("question_id", "opt_code", name="uq_options_code"),
        sa.UniqueConstraint("question_id", "sort_order", name="uq_options_question_sort"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index(
        "idx_options_question_sort_id",
        "options",
        ["question_id", "sort_order", "id"],
        unique=False,
    )

    op.create_table(
        "version_questions",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column(
            "version_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("diagnostic_versions.id", ondelete="RESTRICT", name="fk_version_questions_version"),
            nullable=False,
        ),
        sa.Column(
            "diagnostic_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("diagnostics.id", ondelete="RESTRICT", name="fk_version_questions_diagnostic"),
            nullable=False,
        ),
        sa.Column(
            "question_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("questions.id", ondelete="RESTRICT", name="fk_version_questions_question"),
            nullable=False,
        ),
        sa.Column("q_code", sa.String(length=64), nullable=False),
        sa.Column("display_text", sa.String(length=1000), nullable=False),
        sa.Column("multi", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column(
            "created_by_admin_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("admin_users.id", ondelete="RESTRICT", name="fk_version_questions_created_by"),
            nullable=False,
        ),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.Column(
            "updated_at",
            mysql.DATETIME(fsp=3),
            server_default=sa.text("CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_version_questions"),
        sa.UniqueConstraint("version_id", "question_id", name="uq_version_questions_version_question"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index(
        "idx_version_questions_sort",
        "version_questions",
        ["version_id", "sort_order", "question_id"],
        unique=False,
    )
    op.create_index(
        "idx_version_questions_active",
        "version_questions",
        ["version_id", "is_active", "sort_order"],
        unique=False,
    )

    op.create_table(
        "version_options",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column(
            "version_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("diagnostic_versions.id", ondelete="RESTRICT", name="fk_version_options_version"),
            nullable=False,
        ),
        sa.Column(
            "question_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("questions.id", ondelete="RESTRICT", name="fk_version_options_question"),
            nullable=False,
        ),
        sa.Column(
            "option_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("options.id", ondelete="RESTRICT", name="fk_version_options_option"),
            nullable=False,
        ),
        sa.Column("opt_code", sa.String(length=64), nullable=False),
        sa.Column("display_label", sa.String(length=500), nullable=False),
        sa.Column("llm_op", mysql.JSON(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column(
            "created_by_admin_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("admin_users.id", ondelete="RESTRICT", name="fk_version_options_created_by"),
            nullable=False,
        ),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.Column(
            "updated_at",
            mysql.DATETIME(fsp=3),
            server_default=sa.text("CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_version_options"),
        sa.UniqueConstraint(
            "version_id",
            "question_id",
            "opt_code",
            name="uq_version_options_version_question_opt",
        ),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index(
        "idx_version_options_sort",
        "version_options",
        ["version_id", "question_id", "sort_order"],
        unique=False,
    )
    op.create_index(
        "idx_version_options_active",
        "version_options",
        ["version_id", "is_active", "question_id", "sort_order"],
        unique=False,
    )

    op.create_table(
        "version_outcomes",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column(
            "version_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("diagnostic_versions.id", ondelete="RESTRICT", name="fk_version_outcomes_version"),
            nullable=False,
        ),
        sa.Column("outcome_id", mysql.BIGINT(unsigned=True), nullable=False),
        sa.Column("outcome_meta_json", mysql.JSON(), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "created_by_admin_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("admin_users.id", ondelete="RESTRICT", name="fk_version_outcomes_created_by"),
            nullable=False,
        ),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.Column(
            "updated_at",
            mysql.DATETIME(fsp=3),
            server_default=sa.text("CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_version_outcomes"),
        sa.UniqueConstraint("version_id", "outcome_id", name="uq_version_outcomes_version_outcome"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index(
        "idx_version_outcomes_sort",
        "version_outcomes",
        ["version_id", "sort_order", "outcome_id"],
        unique=False,
    )

    op.create_table(
        "sessions",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT", name="fk_sessions_user"),
            nullable=True,
        ),
        sa.Column("session_code", sa.String(length=64), nullable=False),
        sa.Column(
            "diagnostic_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("diagnostics.id", ondelete="RESTRICT", name="fk_sessions_diagnostic"),
            nullable=False,
        ),
        sa.Column(
            "version_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("diagnostic_versions.id", ondelete="RESTRICT", name="fk_sessions_version"),
            nullable=False,
        ),
        sa.Column("llm_result", mysql.JSON(), nullable=True),
        sa.Column("version_options_hash", sa.String(length=128), nullable=False),
        sa.Column("ended_at", mysql.DATETIME(fsp=3), nullable=True),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.Column(
            "updated_at",
            mysql.DATETIME(fsp=3),
            server_default=sa.text("CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_sessions"),
        sa.UniqueConstraint("session_code", name="uq_sessions_session_code"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index("idx_sessions_user", "sessions", ["user_id"], unique=False)
    op.create_index(
        "idx_sessions_diagnostic_version",
        "sessions",
        ["diagnostic_id", "version_id"],
        unique=False,
    )
    op.create_index("idx_sessions_ended_at", "sessions", ["ended_at"], unique=False)

    op.create_table(
        "answer_choices",
        sa.Column("id", mysql.BIGINT(unsigned=True), autoincrement=True, nullable=False),
        sa.Column(
            "session_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("sessions.id", ondelete="RESTRICT", name="fk_answer_choices_session"),
            nullable=False,
        ),
        sa.Column(
            "version_option_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("version_options.id", ondelete="RESTRICT", name="fk_answer_choices_version_option"),
            nullable=False,
        ),
        sa.Column("answered_at", mysql.DATETIME(fsp=3), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_answer_choices"),
        sa.UniqueConstraint("session_id", "version_option_id", name="uq_answer_choices_once"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index(
        "idx_answer_choices_session",
        "answer_choices",
        ["session_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_answer_choices_session", table_name="answer_choices")
    op.drop_constraint("uq_answer_choices_once", "answer_choices", type_="unique")
    op.drop_table("answer_choices")

    op.drop_index("idx_sessions_ended_at", table_name="sessions")
    op.drop_index("idx_sessions_diagnostic_version", table_name="sessions")
    op.drop_index("idx_sessions_user", table_name="sessions")
    op.drop_constraint("uq_sessions_session_code", "sessions", type_="unique")
    op.drop_table("sessions")

    op.drop_index("idx_version_outcomes_sort", table_name="version_outcomes")
    op.drop_constraint("uq_version_outcomes_version_outcome", "version_outcomes", type_="unique")
    op.drop_table("version_outcomes")

    op.drop_index("idx_version_options_active", table_name="version_options")
    op.drop_index("idx_version_options_sort", table_name="version_options")
    op.drop_constraint("uq_version_options_version_question_opt", "version_options", type_="unique")
    op.drop_table("version_options")

    op.drop_index("idx_version_questions_active", table_name="version_questions")
    op.drop_index("idx_version_questions_sort", table_name="version_questions")
    op.drop_constraint("uq_version_questions_version_question", "version_questions", type_="unique")
    op.drop_table("version_questions")

    op.drop_index("idx_options_question_sort_id", table_name="options")
    op.drop_constraint("uq_options_question_sort", "options", type_="unique")
    op.drop_constraint("uq_options_code", "options", type_="unique")
    op.drop_table("options")

    op.drop_index("idx_questions_diagnostic_active_sort", table_name="questions")
    op.drop_constraint("uq_questions_code", "questions", type_="unique")
    op.drop_table("questions")

    op.drop_index("idx_cfg_active_versions_version", table_name="cfg_active_versions")
    op.drop_constraint("uq_cfg_active_versions_scope", "cfg_active_versions", type_="unique")
    op.drop_table("cfg_active_versions")

    op.drop_index("idx_aud_dv_logs_admin", table_name="aud_diagnostic_version_logs")
    op.drop_index("idx_aud_dv_logs_version", table_name="aud_diagnostic_version_logs")
    op.drop_table("aud_diagnostic_version_logs")

    op.drop_index("idx_diagnostic_versions_updated_by", table_name="diagnostic_versions")
    op.drop_index("idx_diagnostic_versions_created_by", table_name="diagnostic_versions")
    op.drop_index("idx_diagnostic_versions_diagnostic", table_name="diagnostic_versions")
    op.drop_constraint("uq_diagnostic_versions_diagnostic_name", "diagnostic_versions", type_="unique")
    op.drop_table("diagnostic_versions")

    op.drop_index("idx_diagnostics_code", table_name="diagnostics")
    op.drop_constraint("uq_diagnostics_code", "diagnostics", type_="unique")
    op.drop_table("diagnostics")
