"""
Create auth tables and AI job master (squashed initial)

Revision ID: 0001
Revises: 
Create Date: 2025-09-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql


# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # users
    op.create_table(
        "users",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("email", sa.String(length=191), nullable=False),
        sa.Column("hashed_password", sa.Text(), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_index("idx_users_email", "users", ["email"], unique=True)

    # oauth_accounts
    op.create_table(
        "oauth_accounts",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_oauth_accounts_users"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(length=64), nullable=False),
        sa.Column("provider_user_id", sa.String(length=191), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_oauth_accounts"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_unique_constraint(
        "uq_oauth_accounts_provider_provider_user_id",
        "oauth_accounts",
        ["provider", "provider_user_id"],
    )
    op.create_index("idx_oauth_accounts_user_id", "oauth_accounts", ["user_id"], unique=False)

    # refresh_tokens
    op.create_table(
        "refresh_tokens",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            mysql.BIGINT(unsigned=True),
            sa.ForeignKey("users.id", ondelete="CASCADE", name="fk_refresh_tokens_users"),
            nullable=False,
        ),
        sa.Column("rt_hash", sa.String(length=64), nullable=False),
        sa.Column("device_id", sa.String(length=128), nullable=True),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.Column("expires_at", mysql.DATETIME(fsp=3), nullable=False),
        sa.Column("revoked", sa.Boolean(), server_default=sa.text("0"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_refresh_tokens"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_unique_constraint("uq_refresh_tokens_rt_hash", "refresh_tokens", ["rt_hash"])
    op.create_index("idx_refresh_tokens_user_id", "refresh_tokens", ["user_id"], unique=False)
    op.create_index("idx_refresh_tokens_expires_at", "refresh_tokens", ["expires_at"], unique=False)

    # mst_ai_jobs (master for AI job roles)
    op.create_table(
        "mst_ai_jobs",
        sa.Column("id", mysql.BIGINT(unsigned=True), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(length=191), nullable=False),  # 職種
        sa.Column("role_summary", sa.Text(), nullable=False),       # 主な役割・業務範囲
        sa.Column("description", sa.Text(), nullable=False),        # 詳細説明
        sa.Column("avg_salary_jpy", sa.String(length=64), nullable=True),  # 平均年収（日本）
        sa.Column("core_skills", sa.Text(), nullable=True),         # 必要スキル（主要）
        sa.Column("pathway_detail", sa.Text(), nullable=True),      # なるための経路（詳細）
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("1"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", mysql.DATETIME(fsp=3), server_default=sa.text("CURRENT_TIMESTAMP(3)"), nullable=False),
        sa.Column(
            "updated_at",
            mysql.DATETIME(fsp=3),
            server_default=sa.text("CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_mst_ai_jobs"),
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_0900_ai_ci",
    )
    op.create_unique_constraint("uq_mst_ai_jobs__name", "mst_ai_jobs", ["name"])


def downgrade() -> None:
    # refresh_tokens
    op.drop_index("idx_refresh_tokens_expires_at", table_name="refresh_tokens")
    op.drop_index("idx_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_constraint("uq_refresh_tokens_rt_hash", "refresh_tokens", type_="unique")
    op.drop_table("refresh_tokens")

    # oauth_accounts
    op.drop_index("idx_oauth_accounts_user_id", table_name="oauth_accounts")
    op.drop_constraint(
        "uq_oauth_accounts_provider_provider_user_id",
        "oauth_accounts",
        type_="unique",
    )
    op.drop_table("oauth_accounts")

    # users
    op.drop_index("idx_users_email", table_name="users")
    op.drop_table("users")
