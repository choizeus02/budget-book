from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Category
from schemas import CategoryCreate, CategoryGroup, CategoryUpdate, SubcategoryItem

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
            id=parent.id,
            name=parent.name,
            icon=parent.icon,
            subcategories=[SubcategoryItem(id=s.id, name=s.name) for s in subs],
        ))
    return groups


@router.post("", response_model=CategoryGroup | SubcategoryItem, status_code=201)
async def create_category(body: CategoryCreate, db: AsyncSession = Depends(get_db)):
    # sort_order: append at end
    max_result = await db.execute(
        select(func.max(Category.sort_order)).where(Category.parent_id == body.parent_id)
    )
    max_order = max_result.scalar() or 0

    cat = Category(name=body.name, icon=body.icon, parent_id=body.parent_id, sort_order=max_order + 1)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)

    if body.parent_id is None:
        return CategoryGroup(id=cat.id, name=cat.name, icon=cat.icon, subcategories=[])
    return SubcategoryItem(id=cat.id, name=cat.name)


@router.patch("/{category_id}", response_model=SubcategoryItem)
async def update_category(category_id: int, body: CategoryUpdate, db: AsyncSession = Depends(get_db)):
    cat = await db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if body.name is not None:
        cat.name = body.name
    if body.icon is not None:
        cat.icon = body.icon
    await db.commit()
    await db.refresh(cat)
    return SubcategoryItem(id=cat.id, name=cat.name)


@router.delete("/{category_id}", status_code=204)
async def delete_category(category_id: int, db: AsyncSession = Depends(get_db)):
    cat = await db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    # 대분류면 자식 먼저 삭제
    if cat.parent_id is None:
        children = await db.execute(select(Category).where(Category.parent_id == category_id))
        for child in children.scalars().all():
            await db.delete(child)
    await db.delete(cat)
    await db.commit()
