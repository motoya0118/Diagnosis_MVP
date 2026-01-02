"""
Add q_code column to version_options

Revision ID: 0006
Revises: 0005
Create Date: 2025-09-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.exc import OperationalError


# revision identifiers, used by Alembic.
revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    try:
        op.add_column(
            "version_options",
            sa.Column("q_code", sa.String(length=64), nullable=True),
        )
    except OperationalError as exc:
        if getattr(getattr(exc, "orig", None), "args", [None])[0] != 1060:
            raise
    op.execute(
        """
        UPDATE version_options AS vo
        INNER JOIN version_questions AS vq
            ON vq.version_id = vo.version_id
           AND vq.question_id = vo.question_id
        SET vo.q_code = vq.q_code
        WHERE vo.q_code IS NULL
        """
    )
    op.alter_column(
        "version_options",
        "q_code",
        nullable=False,
        existing_type=sa.String(length=64),
    )


def downgrade() -> None:
    op.drop_column("version_options", "q_code")
