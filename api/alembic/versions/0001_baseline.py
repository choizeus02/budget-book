"""baseline — 기존 create_all 스키마와 동일

기존 운영 DB(create_all로 생성)에는 적용하지 않고 stamp만 한다.
(database.py의 init_db가 alembic_version 부재 시 자동 stamp)

Revision ID: 0001
Revises:
Create Date: 2026-07-03
"""
import sqlalchemy as sa

from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

account_type = sa.Enum("cash", "checking", "savings", "credit", name="accounttype")
transaction_type = sa.Enum("income", "expense", name="transactiontype")


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column("icon", sa.String(10), nullable=False),
        sa.Column("parent_id", sa.Integer(), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
    )

    op.create_table(
        "accounts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("type", account_type, nullable=False),
        sa.Column("balance", sa.Float(), nullable=False),
        sa.Column("color", sa.String(20), nullable=False),
        sa.Column("icon", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "installments",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("total_months", sa.Integer(), nullable=False),
        sa.Column("annual_interest_rate", sa.Float(), nullable=True),
        sa.Column("start_year", sa.Integer(), nullable=False),
        sa.Column("start_month", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("subcategory", sa.String(50), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("cycle", sa.String(10), nullable=False),
        sa.Column("billing_day", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("subcategory", sa.String(50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("start_date", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "transactions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("account_id", sa.BigInteger(), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("subcategory", sa.String(50), nullable=True),
        sa.Column("category_confirmed", sa.Boolean(), nullable=False),
        sa.Column(
            "installment_id",
            sa.BigInteger(),
            sa.ForeignKey("installments.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "subscription_id",
            sa.BigInteger(),
            sa.ForeignKey("subscriptions.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("type", transaction_type, nullable=False),
        sa.Column("date", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "budgets",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("monthly_amount", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "category_cache",
        sa.Column("description_hash", sa.String(64), primary_key=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("subcategory", sa.String(50), nullable=True),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.Column("last_used", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("category_cache")
    op.drop_table("budgets")
    op.drop_table("transactions")
    op.drop_table("subscriptions")
    op.drop_table("installments")
    op.drop_table("accounts")
    op.drop_table("categories")
    transaction_type.drop(op.get_bind(), checkfirst=True)
    account_type.drop(op.get_bind(), checkfirst=True)
