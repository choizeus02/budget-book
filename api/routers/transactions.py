import asyncio
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import extract, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import CategoryCache, Transaction, TransactionType
from schemas import TransactionCreate, TransactionResponse, TransactionUpdate
from services.llm import classify_category, hash_description

router = APIRouter(prefix="/transactions", tags=["transactions"])

# PATCH에서 null로 되돌릴 수 있는 필드 (나머지는 null 무시)
_NULLABLE_FIELDS = {"category", "subcategory", "account_id"}


async def _update_category(transaction_id: int, description: str):
    """백그라운드: LLM으로 카테고리 추론 후 저장."""
    from database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        tx = await db.get(Transaction, transaction_id)
        if tx and not tx.category_confirmed:
            category, subcategory = await classify_category(description, db)
            tx.category = category
            tx.subcategory = subcategory
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
        background_tasks.add_task(_update_category, tx.id, body.description)

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

    if year and month:
        start = datetime(year, month, 1)
        end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
        stmt = stmt.where(Transaction.date >= start, Transaction.date < end)
    elif year:
        stmt = stmt.where(
            Transaction.date >= datetime(year, 1, 1),
            Transaction.date < datetime(year + 1, 1, 1),
        )
    elif month:
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

    data = body.model_dump(exclude_unset=True)
    for field, value in data.items():
        if value is None and field not in _NULLABLE_FIELDS:
            continue
        setattr(tx, field, value)

    # POST와 동일한 부호 정규화 (지출은 음수 저장)
    if tx.type == TransactionType.expense and tx.amount > 0:
        tx.amount = -tx.amount

    # 사용자가 카테고리를 직접 지정하면 확정 처리 + 캐시에 학습
    if data.get("category") and tx.description.strip():
        tx.category_confirmed = True
        key = hash_description(tx.description)
        cached = await db.get(CategoryCache, key)
        if cached:
            cached.category = tx.category
            cached.subcategory = tx.subcategory
        else:
            db.add(CategoryCache(
                description_hash=key,
                category=tx.category,
                subcategory=tx.subcategory,
            ))

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
