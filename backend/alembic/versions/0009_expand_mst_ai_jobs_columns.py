"""
Expand mst_ai_jobs columns for new AI job master definition

Revision ID: 0009_expand_mst_ai_jobs
Revises: 0008_link_version_options
Create Date: 2025-01-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
# revision identifiers, used by Alembic.
revision: str = "0009_expand_mst_ai_jobs"
down_revision: Union[str, None] = "0008_link_version_options"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "mst_ai_jobs",
        sa.Column("category", sa.String(length=191), nullable=True),
    )
    op.add_column(
        "mst_ai_jobs",
        sa.Column("main_role", sa.Text(), nullable=True),
    )
    op.add_column(
        "mst_ai_jobs",
        sa.Column("collaboration_style", sa.Text(), nullable=True),
    )
    op.add_column(
        "mst_ai_jobs",
        sa.Column("strength_areas", sa.Text(), nullable=True),
    )
    op.add_column(
        "mst_ai_jobs",
        sa.Column("target_phase", sa.Text(), nullable=True),
    )
    op.add_column(
        "mst_ai_jobs",
        sa.Column("deliverables", sa.Text(), nullable=True),
    )
    op.add_column(
        "mst_ai_jobs",
        sa.Column("ai_tools", sa.Text(), nullable=True),
    )
    op.add_column(
        "mst_ai_jobs",
        sa.Column("advice", sa.Text(), nullable=True),
    )

    bind = op.get_bind()
    if bind.dialect.name == "mysql":
        op.execute("ALTER TABLE mst_ai_jobs MODIFY COLUMN category VARCHAR(191) NULL AFTER name")
        op.execute("ALTER TABLE mst_ai_jobs MODIFY COLUMN main_role TEXT NULL AFTER role_summary")
        op.execute("ALTER TABLE mst_ai_jobs MODIFY COLUMN collaboration_style TEXT NULL AFTER main_role")
        op.execute("ALTER TABLE mst_ai_jobs MODIFY COLUMN strength_areas TEXT NULL AFTER collaboration_style")
        op.execute("ALTER TABLE mst_ai_jobs MODIFY COLUMN target_phase TEXT NULL AFTER avg_salary_jpy")
        op.execute("ALTER TABLE mst_ai_jobs MODIFY COLUMN deliverables TEXT NULL AFTER core_skills")
        op.execute("ALTER TABLE mst_ai_jobs MODIFY COLUMN ai_tools TEXT NULL AFTER pathway_detail")
        op.execute("ALTER TABLE mst_ai_jobs MODIFY COLUMN advice TEXT NULL AFTER ai_tools")


def downgrade() -> None:
    op.drop_column("mst_ai_jobs", "advice")
    op.drop_column("mst_ai_jobs", "ai_tools")
    op.drop_column("mst_ai_jobs", "deliverables")
    op.drop_column("mst_ai_jobs", "target_phase")
    op.drop_column("mst_ai_jobs", "strength_areas")
    op.drop_column("mst_ai_jobs", "collaboration_style")
    op.drop_column("mst_ai_jobs", "main_role")
    op.drop_column("mst_ai_jobs", "category")
