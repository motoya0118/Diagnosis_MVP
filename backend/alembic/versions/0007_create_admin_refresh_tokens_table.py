"""create admin_refresh_tokens table

Revision ID: 0007_create_admin_refresh_tokens
Revises: 0006
Create Date: 2025-01-07 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = "0007_create_admin_refresh_tokens"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_refresh_tokens",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("admin_id", mysql.BIGINT(unsigned=True), sa.ForeignKey("admin_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rt_hash", sa.String(length=64), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=True),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.Column("expires_at", mysql.DATETIME(fsp=3), nullable=False),
        sa.Column("revoked", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index("idx_admin_refresh_tokens_admin_id", "admin_refresh_tokens", ["admin_id"])
    op.create_index("idx_admin_refresh_tokens_expires_at", "admin_refresh_tokens", ["expires_at"])
    op.create_index("uq_admin_refresh_tokens_rt_hash", "admin_refresh_tokens", ["rt_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("uq_admin_refresh_tokens_rt_hash", table_name="admin_refresh_tokens")
    op.drop_index("idx_admin_refresh_tokens_expires_at", table_name="admin_refresh_tokens")
    op.drop_index("idx_admin_refresh_tokens_admin_id", table_name="admin_refresh_tokens")
    op.drop_table("admin_refresh_tokens")
