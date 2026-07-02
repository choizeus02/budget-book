"""금액 컬럼 Float→BigInteger(KRW 원 단위), 인덱스/unique 제약 추가

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-03
"""
import sqlalchemy as sa

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# (table, column, nullable) — 모두 NOT NULL
_MONEY_COLUMNS = [
    ("accounts", "balance", False),
    ("transactions", "amount", False),
    ("budgets", "monthly_amount", False),
    ("installments", "total_amount", False),
    ("subscriptions", "amount", False),
]


def upgrade() -> None:
    for table, column, nullable in _MONEY_COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.BigInteger(),
            existing_type=sa.Float(),
            existing_nullable=nullable,
            postgresql_using=f"round({column})::bigint",
        )

    op.create_index("ix_transactions_date", "transactions", ["date"])

    # unique 제약 전에 중복 카테고리 예산 제거 (최신 행 유지)
    op.execute(
        "DELETE FROM budgets a USING budgets b "
        "WHERE a.category = b.category AND a.id < b.id"
    )
    op.create_unique_constraint("uq_budgets_category", "budgets", ["category"])


def downgrade() -> None:
    op.drop_constraint("uq_budgets_category", "budgets", type_="unique")
    op.drop_index("ix_transactions_date", table_name="transactions")
    for table, column, nullable in _MONEY_COLUMNS:
        op.alter_column(
            table,
            column,
            type_=sa.Float(),
            existing_type=sa.BigInteger(),
            existing_nullable=nullable,
        )
