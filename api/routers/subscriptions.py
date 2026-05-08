import calendar
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Subscription, Transaction, TransactionType
from schemas import SubscriptionCreate, SubscriptionResponse, SubscriptionUpdate

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


async def _sync_transactions(sub: Subscription, db: AsyncSession) -> None:
    """start_date부터 이번 달까지 빠진 트랜잭션 자동 생성."""
    today = datetime.today()

    existing_result = await db.execute(
        select(Transaction.date).where(Transaction.subscription_id == sub.id)
    )
    existing_months = {(d.year, d.month) for d in existing_result.scalars().all() if d}

    y, m = sub.start_date.year, sub.start_date.month
    while (y, m) <= (today.year, today.month):
        should_generate = (
            sub.cycle == "monthly"
            or (sub.cycle == "yearly" and m == sub.start_date.month)
        )
        if should_generate and (y, m) not in existing_months:
            day = min(sub.billing_day, calendar.monthrange(y, m)[1])
            db.add(Transaction(
                subscription_id=sub.id,
                amount=-sub.amount,
                description=sub.name,
                type=TransactionType.expense,
                date=datetime(y, m, day),
                category=sub.category,
                subcategory=sub.subcategory,
                category_confirmed=True,
            ))
        m += 1
        if m > 12:
            m = 1
            y += 1


@router.get("", response_model=list[SubscriptionResponse])
async def list_subscriptions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Subscription).order_by(Subscription.created_at.desc()))
    subs = result.scalars().all()
    for sub in subs:
        if sub.is_active:
            await _sync_transactions(sub, db)
    await db.commit()
    return subs


@router.post("", response_model=SubscriptionResponse, status_code=201)
async def create_subscription(body: SubscriptionCreate, db: AsyncSession = Depends(get_db)):
    sub = Subscription(
        name=body.name,
        amount=body.amount,
        cycle=body.cycle,
        billing_day=body.billing_day,
        category=body.category,
        subcategory=body.subcategory,
        start_date=datetime(body.start_year, body.start_month, 1),
    )
    db.add(sub)
    await db.flush()
    await db.refresh(sub)
    await _sync_transactions(sub, db)
    await db.commit()
    await db.refresh(sub)
    return sub


@router.patch("/{subscription_id}", response_model=SubscriptionResponse)
async def update_subscription(
    subscription_id: int,
    body: SubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
):
    sub = await db.get(Subscription, subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(sub, field, value)

    # 금액/주기 변경 시 기존 트랜잭션 재생성
    if any(f in body.model_dump(exclude_none=True) for f in ["amount", "cycle", "billing_day"]):
        existing = await db.execute(
            select(Transaction).where(Transaction.subscription_id == subscription_id)
        )
        for tx in existing.scalars().all():
            await db.delete(tx)
        await db.flush()
        if sub.is_active:
            await _sync_transactions(sub, db)

    await db.commit()
    await db.refresh(sub)
    return sub


@router.delete("/{subscription_id}", status_code=204)
async def delete_subscription(subscription_id: int, db: AsyncSession = Depends(get_db)):
    sub = await db.get(Subscription, subscription_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    await db.delete(sub)
    await db.commit()
