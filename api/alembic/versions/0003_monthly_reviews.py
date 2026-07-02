"""LLM 월간 총평 캐시 테이블

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "monthly_reviews",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("year", "month", name="uq_monthly_reviews_year_month"),
    )


def downgrade() -> None:
    op.drop_table("monthly_reviews")
