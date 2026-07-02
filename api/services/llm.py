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


def hash_description(description: str) -> str:
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

    key = hash_description(description)

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


_REVIEW_PROMPT = """당신은 개인 가계부의 재무 코치입니다. 아래 한 달 가계부 데이터를 보고 한국어 총평을 작성하세요.
규칙:
- 3~5문장, 부드러운 존댓말
- 잘한 점 1가지, 주의할 점 1가지, 다음 달 실천 조언 1가지를 포함
- 반드시 데이터의 수치를 근거로 구체적으로 쓸 것. "지출을 줄이세요" 같은 일반론 금지
- 마크다운/이모지/목록 없이 순수 문장으로만"""


async def generate_monthly_review(payload: str) -> str:
    """리포트 데이터 텍스트를 받아 월간 총평 생성. 실패 시 예외 전파."""
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    message = await client.messages.create(
        model=settings.review_model,
        max_tokens=1500,
        system=_REVIEW_PROMPT,
        messages=[{"role": "user", "content": payload}],
        extra_body={"thinking": {"type": "disabled"}},  # 단순 요약 — thinking 불필요 (SDK 0.40이라 extra_body 사용)
    )
    text = "".join(b.text for b in message.content if b.type == "text").strip()
    if not text:
        raise RuntimeError("LLM이 빈 응답을 반환했습니다")
    return text
