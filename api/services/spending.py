"""지출 집계 공용 필터.

'지출 통계에서 제외' 플래그가 켜진 대분류(저축·투자 등)를 소비 지출에서 분리한다.
카테고리 이름은 rename될 수 있으므로 상수로 두지 않고 매번 DB에서 읽는다.
"""
from sqlalchemy import false, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from models import Category, Transaction


async def excluded_category_names(db: AsyncSession) -> list[str]:
    result = await db.execute(
        select(Category.name).where(
            Category.parent_id.is_(None),
            Category.excluded_from_expense.is_(True),
        )
    )
    return [name for (name,) in result.all()]


def not_excluded(excluded: list[str]):
    """소비 지출 조건. 미분류(category IS NULL)는 지출에 유지."""
    if not excluded:
        return true()
    return or_(Transaction.category.is_(None), Transaction.category.not_in(excluded))


def only_excluded(excluded: list[str]):
    """저축·투자 버킷 조건."""
    if not excluded:
        return false()
    return Transaction.category.in_(excluded)
