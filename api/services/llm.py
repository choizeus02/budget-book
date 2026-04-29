import hashlib
import json
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import CATEGORIES, CategoryCache

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = f"""당신은 한국어 가계부 카테고리 분류기입니다.
사용자가 입력한 지출 내용(가게명, 메모 등)을 보고 가장 적합한 카테고리를 하나 선택하세요.

카테고리 목록: {', '.join(CATEGORIES)}

반드시 아래 JSON 형식으로만 응답하세요:
{{"category": "카테고리명", "confidence": 0.9}}

다른 텍스트는 절대 포함하지 마세요."""


def _hash(description: str) -> str:
    return hashlib.sha256(description.strip().lower().encode()).hexdigest()


async def classify_category(description: str, db: AsyncSession) -> str | None:
    """description으로 카테고리를 추론. 캐시 → Ollama 순서로 시도."""
    if not description.strip():
        return None

    key = _hash(description)

    # 1. 캐시 조회
    cached = await db.get(CategoryCache, key)
    if cached:
        cached.count += 1
        await db.commit()
        return cached.category

    # 2. Ollama 호출
    category = await _call_ollama(description)
    if category is None:
        return "기타"

    # 3. 캐시 저장
    db.add(CategoryCache(description_hash=key, category=category))
    await db.commit()

    return category


async def _call_ollama(description: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{settings.ollama_url}/api/chat",
                json={
                    "model": settings.ollama_model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": description},
                    ],
                    "stream": False,
                    "format": "json",
                    "think": False,
                },
            )
            resp.raise_for_status()
            content = resp.json()["message"]["content"]
            data = json.loads(content)
            category = data.get("category", "기타")
            if category not in CATEGORIES:
                return "기타"
            return category
    except Exception as e:
        logger.warning(f"Ollama 호출 실패: {e}")
        return None
