import hashlib
import json
import logging

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import CATEGORIES, CategoryCache

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = f"""한국어 가계부 카테고리 분류기입니다.
지출 내용을 보고 가장 적합한 카테고리를 하나 선택하세요.

카테고리 목록: {', '.join(CATEGORIES)}

반드시 아래 JSON 형식으로만 응답하세요:
{{"category": "카테고리명"}}"""


def _hash(description: str) -> str:
    return hashlib.sha256(description.strip().lower().encode()).hexdigest()


async def classify_category(description: str, db: AsyncSession) -> str | None:
    """description으로 카테고리를 추론. 캐시 → Haiku 순서로 시도."""
    if not description.strip():
        return None

    key = _hash(description)

    cached = await db.get(CategoryCache, key)
    if cached:
        cached.count += 1
        await db.commit()
        return cached.category

    category = await _call_haiku(description)
    if category is None:
        return "기타"

    db.add(CategoryCache(description_hash=key, category=category))
    await db.commit()

    return category


async def _call_haiku(description: str) -> str | None:
    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        message = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=64,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": description}],
        )
        if not message.content:
            logger.warning("Haiku 응답에 content가 없음")
            return None
        block = message.content[0]
        if block.type != "text":
            logger.warning(f"Haiku 응답 타입 이상: {block.type!r}")
            return None
        raw = block.text.strip()
        logger.warning(f"Haiku raw response: {raw!r}")
        if not raw:
            return None
        data = json.loads(raw)
        category = data.get("category", "기타")
        if category not in CATEGORIES:
            return "기타"
        return category
    except Exception as e:
        logger.warning(f"Haiku 호출 실패: {e}", exc_info=True)
        return None
