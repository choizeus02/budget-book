from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Budget, Transaction, TransactionType
from schemas import CategoryStat, MonthlySummary

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
