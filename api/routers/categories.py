from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Category
from schemas import CategoryGroup

router = APIRouter(prefix="/categories", tags=["categories"])


@router.get("", response_model=list[CategoryGroup])
async def list_categories(db: AsyncSession = Depends(get_db)):
    parents_result = await db.execute(
        select(Category).where(Category.parent_id.is_(None)).order_by(Category.sort_order)
    )
    parents = parents_result.scalars().all()

    groups = []
    for parent in parents:
        subs_result = await db.execute(
            select(Category).where(Category.parent_id == parent.id).order_by(Category.sort_order)
        )
        subs = subs_result.scalars().all()
        groups.append(CategoryGroup(
            name=parent.name,
            icon=parent.icon,
            subcategories=[s.name for s in subs],
        ))
    return groups
