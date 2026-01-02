"""
Add finalized columns to diagnostic_versions

Revision ID: 0005
Revises: 0004
Create Date: 2025-09-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "diagnostic_versions",
        sa.Column(
            "finalized_by_admin_id",
            mysql.BIGINT(unsigned=True),
            nullable=True,
        ),
    )
    op.add_column(
        "diagnostic_versions",
        sa.Column(
            "finalized_at",
            mysql.DATETIME(fsp=3),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_diagnostic_versions_finalized_by",
        "diagnostic_versions",
        "admin_users",
        ["finalized_by_admin_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_diagnostic_versions_finalized_by",
        "diagnostic_versions",
        type_="foreignkey",
    )
    op.drop_column("diagnostic_versions", "finalized_at")
    op.drop_column("diagnostic_versions", "finalized_by_admin_id")

