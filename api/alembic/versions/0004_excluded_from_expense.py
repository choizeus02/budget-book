"""카테고리 '지출 통계에서 제외' 플래그 + 저축·투자 카테고리 신설

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

# 데이터 이전 대상 (구 카테고리 → 신 카테고리). budgets는 대분류 단위 예산이므로 제외.
OLD_CAT, OLD_SUB = "자산", "투자비 전환"
NEW_CAT, NEW_SUB = "저축·투자", "투자"
TABLES_WITH_SUBCATEGORY = ("transactions", "subscriptions", "installments", "category_cache")


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("excluded_from_expense", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    conn = op.get_bind()

    # 1. 저축·투자 대분류 (멱등: 있으면 플래그만 보장)
    parent = conn.execute(sa.text(
        "SELECT id FROM categories WHERE name = :n AND parent_id IS NULL"
    ), {"n": NEW_CAT}).first()
    if parent is None:
        max_order = conn.execute(sa.text(
            "SELECT COALESCE(MAX(sort_order), 0) FROM categories WHERE parent_id IS NULL"
        )).scalar()
        parent_id = conn.execute(sa.text(
            "INSERT INTO categories (name, icon, parent_id, sort_order, excluded_from_expense) "
            "VALUES (:n, '💰', NULL, :o, true) RETURNING id"
        ), {"n": NEW_CAT, "o": max_order + 1}).scalar()
    else:
        parent_id = parent[0]
        conn.execute(sa.text(
            "UPDATE categories SET excluded_from_expense = true WHERE id = :i"
        ), {"i": parent_id})

    # 2. 투자 중분류 (멱등)
    sub = conn.execute(sa.text(
        "SELECT id FROM categories WHERE name = :n AND parent_id = :p"
    ), {"n": NEW_SUB, "p": parent_id}).first()
    if sub is None:
        conn.execute(sa.text(
            "INSERT INTO categories (name, icon, parent_id, sort_order, excluded_from_expense) "
            "VALUES (:n, '💰', :p, 1, false)"
        ), {"n": NEW_SUB, "p": parent_id})

    # 3. 기존 자산/투자비 전환 데이터 이전 (해당 행이 없으면 no-op)
    for table in TABLES_WITH_SUBCATEGORY:
        conn.execute(sa.text(
            f"UPDATE {table} SET category = :nc, subcategory = :ns "
            f"WHERE category = :oc AND subcategory = :os"
        ), {"nc": NEW_CAT, "ns": NEW_SUB, "oc": OLD_CAT, "os": OLD_SUB})


def downgrade() -> None:
    conn = op.get_bind()
    for table in TABLES_WITH_SUBCATEGORY:
        conn.execute(sa.text(
            f"UPDATE {table} SET category = :oc, subcategory = :os "
            f"WHERE category = :nc AND subcategory = :ns"
        ), {"nc": NEW_CAT, "ns": NEW_SUB, "oc": OLD_CAT, "os": OLD_SUB})
    op.drop_column("categories", "excluded_from_expense")
