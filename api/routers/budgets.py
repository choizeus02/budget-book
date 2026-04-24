from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Budget
from schemas import BudgetCreate, BudgetResponse

router = APIRouter(prefix="/budgets", tags=["budgets"])


@router.get("", response_model=list[BudgetResponse])
async def list_budgets(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Budget).order_by(Budget.category))
    return result.scalars().all()


@router.post("", response_model=BudgetResponse, status_code=201)
async def upsert_budget(body: BudgetCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Budget).where(Budget.category == body.category))
    budget = result.scalar_one_or_none()

    if budget:
        budget.monthly_amount = body.monthly_amount
    else:
        budget = Budget(**body.model_dump())
        db.add(budget)

    await db.commit()
    await db.refresh(budget)
    return budget


@router.delete("/{budget_id}", status_code=204)
async def delete_budget(budget_id: int, db: AsyncSession = Depends(get_db)):
    budget = await db.get(Budget, budget_id)
    if not budget:
        raise HTTPException(status_code=404, detail="Budget not found")
    await db.delete(budget)
    await db.commit()
