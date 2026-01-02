"""
Add is_active flag to version_outcomes

Revision ID: 0004
Revises: 0003
Create Date: 2025-02-17
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "version_outcomes",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("1"),
        ),
    )
    op.execute("UPDATE version_outcomes SET is_active = 1")
    op.alter_column("version_outcomes", "is_active", server_default=None)


def downgrade() -> None:
    op.drop_column("version_outcomes", "is_active")
