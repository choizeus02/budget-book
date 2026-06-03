from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Budget, Transaction, TransactionType
from schemas import (
    CategoryStat, CategoryStatDetail, DailyStat, DowStat, FixedVsVariable,
    MonthlyEntry, MonthlySummary, SubcategoryStat, TopTransaction,
    UncategorizedStat, YearlySummary,
)

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("/monthly", response_model=MonthlySummary)
async def monthly_summary(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Transaction.type, func.sum(Transaction.amount))
        .where(extract("year", Transaction.date) == year)
        .where(extract("month", Transaction.date) == month)
        .group_by(Transaction.type)
    )
    result = await db.execute(stmt)
    rows = result.all()

    income = 0.0
    expense = 0.0
    for tx_type, total in rows:
        if tx_type == TransactionType.income:
            income = total or 0.0
        else:
            expense = abs(total or 0.0)

    return MonthlySummary(
        year=year,
        month=month,
        total_income=income,
        total_expense=expense,
        net=income - expense,
    )


@router.get("/by-category", response_model=list[CategoryStat])
async def by_category(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    # 카테고리별 지출 합계
    stmt = (
        select(Transaction.category, func.sum(Transaction.amount), func.count(Transaction.id))
        .where(extract("year", Transaction.date) == year)
        .where(extract("month", Transaction.date) == month)
        .where(Transaction.type == TransactionType.expense)
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount))
    )
    result = await db.execute(stmt)
    rows = result.all()

    # 예산 조회
    budget_result = await db.execute(select(Budget))
    budget_map = {b.category: b.monthly_amount for b in budget_result.scalars().all()}

    return [
        CategoryStat(
            category=category or "기타",
            total=abs(total or 0.0),
            count=count,
            budget=budget_map.get(category),
        )
        for category, total, count in rows
    ]


@router.get("/by-category-detail", response_model=list[CategoryStatDetail])
async def by_category_detail(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            Transaction.category,
            Transaction.subcategory,
            func.sum(Transaction.amount),
            func.count(Transaction.id),
        )
        .where(extract("year", Transaction.date) == year)
        .where(extract("month", Transaction.date) == month)
        .where(Transaction.type == TransactionType.expense)
        .group_by(Transaction.category, Transaction.subcategory)
        .order_by(func.sum(Transaction.amount))
    )
    result = await db.execute(stmt)
    rows = result.all()

    budget_result = await db.execute(select(Budget))
    budget_map = {b.category: b.monthly_amount for b in budget_result.scalars().all()}

    cat_map: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "count": 0, "subcategories": []})
    cat_order: list[str] = []

    for cat, subcat, total, count in rows:
        key = cat or "기타"
        if key not in cat_order:
            cat_order.append(key)
        amt = abs(total or 0.0)
        cat_map[key]["total"] += amt
        cat_map[key]["count"] += count
        cat_map[key]["subcategories"].append(
            SubcategoryStat(subcategory=subcat or "기타", total=amt, count=count)
        )

    return [
        CategoryStatDetail(
            category=key,
            total=cat_map[key]["total"],
            count=cat_map[key]["count"],
            budget=budget_map.get(key),
            subcategories=sorted(cat_map[key]["subcategories"], key=lambda x: -x.total),
        )
        for key in cat_order
    ]


@router.get("/daily", response_model=list[DailyStat])
async def daily_stats(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            extract("day", Transaction.date).label("day"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(extract("year", Transaction.date) == year)
        .where(extract("month", Transaction.date) == month)
        .where(Transaction.type == TransactionType.expense)
        .group_by(extract("day", Transaction.date))
        .order_by(extract("day", Transaction.date))
    )
    result = await db.execute(stmt)
    return [
        DailyStat(day=int(row.day), total=abs(row.total or 0.0))
        for row in result.all()
    ]


@router.get("/top-transactions", response_model=list[TopTransaction])
async def top_transactions(
    year: int,
    month: int,
    limit: int = Query(default=5, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Transaction)
        .where(extract("year", Transaction.date) == year)
        .where(extract("month", Transaction.date) == month)
        .where(Transaction.type == TransactionType.expense)
        .order_by(Transaction.amount)  # 음수이므로 ASC = 지출 큰 순
        .limit(limit)
    )
    result = await db.execute(stmt)
    txs = result.scalars().all()
    return [
        TopTransaction(
            id=tx.id,
            description=tx.description,
            amount=abs(tx.amount),
            category=tx.category,
            subcategory=tx.subcategory,
            date=tx.date,
        )
        for tx in txs
    ]


@router.get("/fixed-vs-variable", response_model=FixedVsVariable)
async def fixed_vs_variable(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    base_filter = [
        extract("year", Transaction.date) == year,
        extract("month", Transaction.date) == month,
        Transaction.type == TransactionType.expense,
    ]

    fixed_stmt = select(func.sum(Transaction.amount)).where(
        *base_filter,
        or_(
            Transaction.subscription_id.is_not(None),
            Transaction.installment_id.is_not(None),
        ),
    )
    variable_stmt = select(func.sum(Transaction.amount)).where(
        *base_filter,
        Transaction.subscription_id.is_(None),
        Transaction.installment_id.is_(None),
    )

    fixed_total = abs((await db.execute(fixed_stmt)).scalar() or 0.0)
    variable_total = abs((await db.execute(variable_stmt)).scalar() or 0.0)
    grand_total = fixed_total + variable_total

    if grand_total == 0:
        return FixedVsVariable(
            fixed_total=0.0, variable_total=0.0,
            fixed_ratio=0.0, variable_ratio=0.0,
        )

    return FixedVsVariable(
        fixed_total=fixed_total,
        variable_total=variable_total,
        fixed_ratio=round(fixed_total / grand_total, 4),
        variable_ratio=round(variable_total / grand_total, 4),
    )


@router.get("/yearly", response_model=YearlySummary)
async def yearly_stats(
    year: int,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            extract("month", Transaction.date).label("month"),
            Transaction.type,
            func.sum(Transaction.amount).label("total"),
        )
        .where(extract("year", Transaction.date) == year)
        .group_by(extract("month", Transaction.date), Transaction.type)
        .order_by(extract("month", Transaction.date))
    )
    result = await db.execute(stmt)
    rows = result.all()

    month_data: dict[int, dict] = {m: {"income": 0.0, "expense": 0.0} for m in range(1, 13)}
    for row in rows:
        m = int(row.month)
        if row.type == TransactionType.income:
            month_data[m]["income"] += row.total or 0.0
        else:
            month_data[m]["expense"] += abs(row.total or 0.0)

    total_income = sum(v["income"] for v in month_data.values())
    total_expense = sum(v["expense"] for v in month_data.values())
    net = total_income - total_expense
    savings_rate = round(net / total_income, 4) if total_income > 0 else None

    return YearlySummary(
        year=year,
        total_income=total_income,
        total_expense=total_expense,
        net=net,
        savings_rate=savings_rate,
        months=[
            MonthlyEntry(month=m, income=month_data[m]["income"], expense=month_data[m]["expense"])
            for m in range(1, 13)
        ],
    )


@router.get("/day-of-week", response_model=list[DowStat])
async def day_of_week_stats(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            extract("dow", Transaction.date).label("dow"),
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .where(extract("year", Transaction.date) == year)
        .where(extract("month", Transaction.date) == month)
        .where(Transaction.type == TransactionType.expense)
        .group_by(extract("dow", Transaction.date))
        .order_by(extract("dow", Transaction.date))
    )
    result = await db.execute(stmt)
    return [
        DowStat(dow=int(row.dow), total=abs(row.total or 0.0), count=row.count)
        for row in result.all()
    ]


@router.get("/uncategorized", response_model=UncategorizedStat)
async def uncategorized_stats(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    base_filter = [
        extract("year", Transaction.date) == year,
        extract("month", Transaction.date) == month,
        Transaction.type == TransactionType.expense,
    ]
    total_stmt = select(func.count(Transaction.id)).where(*base_filter)
    uncat_stmt = select(func.count(Transaction.id)).where(
        *base_filter,
        Transaction.category.is_(None),
    )

    total_count = (await db.execute(total_stmt)).scalar() or 0
    uncategorized_count = (await db.execute(uncat_stmt)).scalar() or 0
    ratio = round(uncategorized_count / total_count, 4) if total_count > 0 else 0.0

    return UncategorizedStat(
        total_count=total_count,
        uncategorized_count=uncategorized_count,
        ratio=ratio,
    )
