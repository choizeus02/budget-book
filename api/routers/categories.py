from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Budget, Category, CategoryCache, Installment, Subscription, Transaction
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
            excluded_from_expense=parent.excluded_from_expense,
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
        return CategoryGroup(id=cat.id, name=cat.name, icon=cat.icon, excluded_from_expense=cat.excluded_from_expense, subcategories=[])
    return SubcategoryItem(id=cat.id, name=cat.name)


async def _cascade_rename(cat: Category, new_name: str, db: AsyncSession) -> None:
    """카테고리 이름 변경 시 문자열로 저장된 참조를 일괄 갱신."""
    old_name = cat.name
    if cat.parent_id is None:
        for model in (Transaction, Installment, Subscription, CategoryCache, Budget):
            await db.execute(
                update(model).where(model.category == old_name).values(category=new_name)
            )
    else:
        parent = await db.get(Category, cat.parent_id)
        for model in (Transaction, Installment, Subscription, CategoryCache):
            await db.execute(
                update(model)
                .where(model.category == parent.name, model.subcategory == old_name)
                .values(subcategory=new_name)
            )


@router.patch("/{category_id}", response_model=SubcategoryItem)
async def update_category(category_id: int, body: CategoryUpdate, db: AsyncSession = Depends(get_db)):
    cat = await db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    if body.name is not None and body.name != cat.name:
        await _cascade_rename(cat, body.name, db)
        cat.name = body.name
    if body.icon is not None:
        cat.icon = body.icon
    if body.excluded_from_expense is not None and cat.parent_id is None:
        cat.excluded_from_expense = body.excluded_from_expense
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
