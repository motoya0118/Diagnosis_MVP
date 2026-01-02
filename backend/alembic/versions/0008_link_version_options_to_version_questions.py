"""
Link version_options to version_questions snapshot

Revision ID: 0008_link_version_options
Revises: 0007_create_admin_refresh_tokens
Create Date: 2025-09-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = "0008_link_version_options"
down_revision: Union[str, None] = "0007_create_admin_refresh_tokens"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "version_options",
        sa.Column("version_question_id", mysql.BIGINT(unsigned=True), nullable=True),
    )

    op.execute(
        """
        UPDATE version_options AS vo
        INNER JOIN version_questions AS vq
            ON vq.version_id = vo.version_id
           AND vq.question_id = vo.question_id
        SET vo.version_question_id = vq.id
        """
    )

    op.alter_column(
        "version_options",
        "version_question_id",
        existing_type=mysql.BIGINT(unsigned=True),
        nullable=False,
    )

    op.drop_constraint(
        "fk_version_options_question",
        "version_options",
        type_="foreignkey",
    )
    op.drop_constraint(
        "uq_version_options_version_question_opt",
        "version_options",
        type_="unique",
    )

    op.drop_column("version_options", "question_id")

    op.create_unique_constraint(
        "uq_version_options_version_question_opt",
        "version_options",
        ["version_id", "version_question_id", "opt_code"],
    )
    op.create_index(
        "idx_version_options_sort_new",
        "version_options",
        ["version_id", "version_question_id", "sort_order"],
        unique=False,
    )
    op.create_index(
        "idx_version_options_active_new",
        "version_options",
        ["version_id", "is_active", "version_question_id", "sort_order"],
        unique=False,
    )
    op.drop_index("idx_version_options_sort", table_name="version_options")
    op.drop_index("idx_version_options_active", table_name="version_options")
    op.execute(
        "ALTER TABLE version_options RENAME INDEX idx_version_options_sort_new TO idx_version_options_sort"
    )
    op.execute(
        "ALTER TABLE version_options RENAME INDEX idx_version_options_active_new TO idx_version_options_active"
    )
    op.create_foreign_key(
        "fk_version_options_version_question",
        "version_options",
        "version_questions",
        ["version_question_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.add_column(
        "version_options",
        sa.Column("question_id", mysql.BIGINT(unsigned=True), nullable=True),
    )

    op.execute(
        """
        UPDATE version_options AS vo
        INNER JOIN version_questions AS vq
            ON vq.id = vo.version_question_id
        SET vo.question_id = vq.question_id
        """
    )

    op.alter_column(
        "version_options",
        "question_id",
        existing_type=mysql.BIGINT(unsigned=True),
        nullable=False,
    )

    op.drop_constraint(
        "fk_version_options_version_question",
        "version_options",
        type_="foreignkey",
    )
    op.drop_constraint(
        "uq_version_options_version_question_opt",
        "version_options",
        type_="unique",
    )
    op.drop_index("idx_version_options_active", table_name="version_options")
    op.drop_index("idx_version_options_sort", table_name="version_options")

    op.drop_column("version_options", "version_question_id")

    op.create_unique_constraint(
        "uq_version_options_version_question_opt",
        "version_options",
        ["version_id", "question_id", "opt_code"],
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
    op.create_foreign_key(
        "fk_version_options_question",
        "version_options",
        "questions",
        ["question_id"],
        ["id"],
        ondelete="RESTRICT",
    )
