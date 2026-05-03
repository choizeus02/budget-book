import hashlib
import json
import logging
import re

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import Category, CategoryCache

logger = logging.getLogger(__name__)

_PROMPT_TEMPLATE = """한국어 가계부 카테고리 분류기입니다.
지출/수입 내용을 보고 아래 가이드를 참고하여 대분류(category)와 중분류(subcategory)를 선택하세요.
가이드는 참고용이며, 가장 유사한 항목을 선택하거나 맞는 것이 없으면 "기타"를 사용하세요.

카테고리 가이드:
{category_guide}

반드시 아래 JSON 형식으로만 응답하세요. 마크다운, 코드블록, 설명 금지:
{{"category": "대분류", "subcategory": "중분류"}}"""


def _hash(description: str) -> str:
    return hashlib.sha256(description.strip().lower().encode()).hexdigest()


async def _fetch_category_info(db: AsyncSession) -> tuple[str, set[str]]:
    parents_result = await db.execute(
        select(Category).where(Category.parent_id.is_(None)).order_by(Category.sort_order)
    )
    parents = parents_result.scalars().all()

    lines = []
    names: set[str] = set()
    for parent in parents:
        names.add(parent.name)
        subs_result = await db.execute(
            select(Category).where(Category.parent_id == parent.id).order_by(Category.sort_order)
        )
        subs = subs_result.scalars().all()
        lines.append(f"- {parent.name}: {', '.join(s.name for s in subs)}")

    return "\n".join(lines), names


async def classify_category(
    description: str, db: AsyncSession
) -> tuple[str | None, str | None]:
    """description으로 카테고리를 추론. 캐시 → Haiku 순서."""
    if not description.strip():
        return None, None

    key = _hash(description)

    cached = await db.get(CategoryCache, key)
    if cached:
        cached.count += 1
        await db.commit()
        return cached.category, cached.subcategory

    category_guide, valid_names = await _fetch_category_info(db)
    category, subcategory = await _call_haiku(description, category_guide, valid_names)
    if category is None:
        return "기타", None

    db.add(CategoryCache(
        description_hash=key,
        category=category,
        subcategory=subcategory,
    ))
    await db.commit()

    return category, subcategory


async def _call_haiku(
    description: str, category_guide: str, valid_names: set[str]
) -> tuple[str | None, str | None]:
    try:
        system_prompt = _PROMPT_TEMPLATE.format(category_guide=category_guide)
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=64,
            system=system_prompt,
            messages=[{"role": "user", "content": description}],
        )
        if not message.content:
            logger.warning("Haiku 응답에 content가 없음")
            return None, None
        block = message.content[0]
        if block.type != "text":
            logger.warning(f"Haiku 응답 타입 이상: {block.type!r}")
            return None, None
        raw = block.text.strip()
        if not raw:
            return None, None
        match = re.search(r'\{.*?\}', raw, re.DOTALL)
        if not match:
            logger.warning(f"Haiku 응답에서 JSON 못 찾음: {raw!r}")
            return None, None
        data = json.loads(match.group())
        category = data.get("category", "기타")
        subcategory = data.get("subcategory")
        if category not in valid_names:
            category = "기타"
        return category, subcategory
    except Exception as e:
        logger.warning(f"Haiku 호출 실패: {e}", exc_info=True)
        return None, None
