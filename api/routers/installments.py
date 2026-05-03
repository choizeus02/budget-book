from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Installment, Transaction, TransactionType
from schemas import InstallmentCreate, InstallmentResponse, InstallmentUpdate

router = APIRouter(prefix="/installments", tags=["installments"])


def _monthly_payment(total_amount: float, total_months: int, annual_rate: Optional[float]) -> float:
    if not annual_rate:
        return total_amount / total_months
    r = annual_rate / 12 / 100
    return total_amount * r * (1 + r) ** total_months / ((1 + r) ** total_months - 1)


def _make_response(inst: Installment) -> InstallmentResponse:
    return InstallmentResponse(
        **{c: getattr(inst, c) for c in ["id", "name", "total_amount", "total_months",
           "annual_interest_rate", "start_year", "start_month", "category", "subcategory", "created_at"]},
        monthly_amount=round(_monthly_payment(inst.total_amount, inst.total_months, inst.annual_interest_rate)),
    )


def _generate_transactions(inst: Installment) -> list[Transaction]:
    monthly = round(_monthly_payment(inst.total_amount, inst.total_months, inst.annual_interest_rate))
    txs = []
    year, month = inst.start_year, inst.start_month
    for i in range(inst.total_months):
        txs.append(Transaction(
            installment_id=inst.id,
            amount=-monthly,
            description=f"{inst.name} ({i + 1}/{inst.total_months})",
            type=TransactionType.expense,
            date=datetime(year, month, 1),
            category=inst.category,
            subcategory=inst.subcategory,
            category_confirmed=True,
        ))
        month += 1
        if month > 12:
            month = 1
            year += 1
    return txs


@router.get("", response_model=list[InstallmentResponse])
async def list_installments(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Installment).order_by(Installment.created_at.desc()))
    return [_make_response(i) for i in result.scalars().all()]


@router.post("", response_model=InstallmentResponse, status_code=201)
async def create_installment(body: InstallmentCreate, db: AsyncSession = Depends(get_db)):
    inst = Installment(**body.model_dump())
    db.add(inst)
    await db.flush()
    await db.refresh(inst)

    for tx in _generate_transactions(inst):
        db.add(tx)

    await db.commit()
    await db.refresh(inst)
    return _make_response(inst)


@router.patch("/{installment_id}", response_model=InstallmentResponse)
async def update_installment(
    installment_id: int,
    body: InstallmentUpdate,
    db: AsyncSession = Depends(get_db),
):
    inst = await db.get(Installment, installment_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Installment not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(inst, field, value)

    # 기존 트랜잭션 전체 삭제 후 재생성
    existing = await db.execute(
        select(Transaction).where(Transaction.installment_id == installment_id)
    )
    for tx in existing.scalars().all():
        await db.delete(tx)

    await db.flush()
    for tx in _generate_transactions(inst):
        db.add(tx)

    await db.commit()
    await db.refresh(inst)
    return _make_response(inst)


@router.delete("/{installment_id}", status_code=204)
async def delete_installment(installment_id: int, db: AsyncSession = Depends(get_db)):
    inst = await db.get(Installment, installment_id)
    if not inst:
        raise HTTPException(status_code=404, detail="Installment not found")
    await db.delete(inst)
    await db.commit()
