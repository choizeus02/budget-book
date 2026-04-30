import asyncio
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Transaction, TransactionType
from schemas import TransactionCreate, TransactionResponse, TransactionUpdate
from services.llm import classify_category

router = APIRouter(prefix="/transactions", tags=["transactions"])


async def _update_category(transaction_id: int, description: str, db_session):
    """백그라운드: LLM으로 카테고리 추론 후 저장."""
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        tx = await db.get(Transaction, transaction_id)
        if tx and not tx.category_confirmed:
            category = await classify_category(description, db)
            tx.category = category
            await db.commit()


@router.post("", response_model=TransactionResponse, status_code=201)
async def create_transaction(
    body: TransactionCreate,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    amount = body.amount
    if body.type == TransactionType.expense and amount > 0:
        amount = -amount

    tx = Transaction(
        account_id=body.account_id,
        amount=amount,
        description=body.description,
        type=body.type,
        date=body.date or datetime.now(),
    )
    db.add(tx)
    await db.flush()
    await db.refresh(tx)

    if body.description.strip():
        background_tasks.add_task(_update_category, tx.id, body.description, db)

    await db.commit()
    await db.refresh(tx)
    return tx


@router.get("", response_model=list[TransactionResponse])
async def list_transactions(
    year: Optional[int] = None,
    month: Optional[int] = None,
    account_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Transaction).order_by(Transaction.date.desc(), Transaction.created_at.desc())

    if year:
        stmt = stmt.where(extract("year", Transaction.date) == year)
    if month:
        stmt = stmt.where(extract("month", Transaction.date) == month)
    if account_id:
        stmt = stmt.where(Transaction.account_id == account_id)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.patch("/{transaction_id}", response_model=TransactionResponse)
async def update_transaction(
    transaction_id: int,
    body: TransactionUpdate,
    db: AsyncSession = Depends(get_db),
):
    tx = await db.get(Transaction, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(tx, field, value)

    await db.commit()
    await db.refresh(tx)
    return tx


@router.delete("/{transaction_id}", status_code=204)
async def delete_transaction(
    transaction_id: int,
    db: AsyncSession = Depends(get_db),
):
    tx = await db.get(Transaction, transaction_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    await db.delete(tx)
    await db.commit()
