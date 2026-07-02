# 리포트 v2 + 통계 드릴다운 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데스크탑 우선 전용 리포트 페이지(`/report`, 통합 API + 자동 인사이트 + LLM 총평)와 통계 페이지 3단 드릴다운 구현.

**Architecture:** 백엔드는 신규 `GET /api/report` 통합 엔드포인트가 섹션별 함수를 병렬 실행(섹션마다 독립 세션, 실패 시 해당 필드만 null)해 한 번에 반환. LLM 총평은 `monthly_reviews` 테이블에 캐시(월 1회), 별도 GET/POST 엔드포인트. 프론트는 `/report` 라우트에 카드 그리드(`lg:grid-cols-12`), 드릴다운은 통계 페이지에서 월 거래를 1회 로드해 메모리 필터.

**Tech Stack:** FastAPI + SQLAlchemy async + alembic / React + recharts + Tailwind / Anthropic API (claude-sonnet-5)

**Spec:** `docs/superpowers/specs/2026-07-03-report-v2-drilldown-design.md`

## Global Constraints

- 금액은 KRW 원 단위 정수(BigInteger). 파이썬에서 `SUM(bigint)` 결과는 Decimal → `float()`/`int()` 변환 후 연산.
- 날짜 필터는 반드시 범위 조건(`date >= start AND date < end`). `extract()`를 WHERE에 쓰지 말 것 (인덱스 `ix_transactions_date` 활용). GROUP BY의 extract는 허용.
- 스키마 변경은 alembic 마이그레이션으로만 (`api/alembic/versions/`, revision 문자열 "0003"). `create_all` 없음.
- 운영 파드는 `TZ=Asia/Seoul` — `date.today()`/`datetime.now()`는 KST 기준으로 동작함을 전제.
- AsyncSession은 동시성 불가 → 병렬 실행 시 섹션마다 `AsyncSessionLocal()`로 새 세션 생성.
- 프론트 신규 npm 의존성 금지 (recharts/tailwind 기존 것 재사용). 색상 팔레트는 Stats.tsx의 `COLORS` 배열과 동일 계열.
- LLM: 분류는 기존 `claude-haiku-4-5-20251001` 유지. 총평은 `settings.review_model` (기본 `claude-sonnet-5`, env `REVIEW_MODEL`).
- anthropic SDK는 0.40.0 고정 — `thinking` 키워드 인자 없음. 필요 시 `extra_body`로 전달.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

```
api/
  alembic/versions/0003_monthly_reviews.py   # 신규 — monthly_reviews 테이블
  models.py                                   # 수정 — MonthlyReview 모델 추가
  config.py                                   # 수정 — review_model 설정
  schemas_report.py                           # 신규 — 리포트 응답 스키마 전체
  services/insights.py                        # 신규 — 순수 함수: 페이스/인사이트 규칙
  services/llm.py                             # 수정 — generate_monthly_review 추가
  routers/report.py                           # 신규 — /api/report + /api/report/review
  main.py                                     # 수정 — report 라우터 등록
  tests/test_insights.py                      # 신규 — 인사이트/페이스 단위 테스트
  requirements-dev.txt                        # 신규 — pytest
frontend/src/
  api/types.ts                                # 수정 — Report 타입 추가
  api/client.ts                               # 수정 — api.report.* 추가
  pages/Report.tsx                            # 신규 — 페이지 (월 네비 + 그리드)
  components/report/shared.tsx                # 신규 — Card, fmt, COLORS
  components/report/KpiRow.tsx                # 신규 — ① KPI + 페이스
  components/report/InsightsCard.tsx          # 신규 — ② 인사이트
  components/report/ReviewCard.tsx            # 신규 — ③ LLM 총평
  components/report/FlowCards.tsx             # 신규 — ④ 일별+누적, 히트맵
  components/report/TrendCards.tsx            # 신규 — ⑤ 12개월 3종
  components/report/CompositionCards.tsx      # 신규 — ⑥ 도넛/테이블/고정비
  components/report/PatternCards.tsx          # 신규 — ⑦ 요일/주차
  components/report/RecordCards.tsx           # 신규 — ⑧ TOP10/빈도
  components/report/BudgetCard.tsx            # 신규 — ⑨ 예산 게이지
  components/report/YtdCard.tsx               # 신규 — ⑩ YTD
  App.tsx                                     # 수정 — /report 라우트
  components/BottomNav.tsx                    # 수정 — 리포트 탭
  pages/Settings.tsx                          # 수정 — 리포트 탭 제거
  components/settings/ReportSection.tsx       # 삭제
  pages/Stats.tsx                             # 수정 — 3단 드릴다운
```

---

### Task 1: MonthlyReview 모델 + alembic 0003 + config

**Files:**
- Modify: `api/models.py` (import 줄, 파일 끝)
- Create: `api/alembic/versions/0003_monthly_reviews.py`
- Modify: `api/config.py:11` 부근

**Interfaces:**
- Produces: `models.MonthlyReview` (id, year, month, content, model, created_at) / `settings.review_model: str`

- [ ] **Step 1: models.py에 MonthlyReview 추가**

import 블록의 `String, UniqueConstraint, func,` 줄을 `String, Text, UniqueConstraint, func,`로 변경 후 파일 끝에 추가:

```python
class MonthlyReview(Base):
    __tablename__ = "monthly_reviews"
    __table_args__ = (UniqueConstraint("year", "month", name="uq_monthly_reviews_year_month"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
```

- [ ] **Step 2: 마이그레이션 0003 작성**

`api/alembic/versions/0003_monthly_reviews.py`:

```python
"""LLM 월간 총평 캐시 테이블

Revision ID: 0003
Revises: 0002
"""
import sqlalchemy as sa

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "monthly_reviews",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("month", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model", sa.String(50), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("year", "month", name="uq_monthly_reviews_year_month"),
    )


def downgrade() -> None:
    op.drop_table("monthly_reviews")
```

- [ ] **Step 3: config.py에 review_model 추가**

`anthropic_api_key: str = ""` 아래에:

```python
    review_model: str = "claude-sonnet-5"
```

- [ ] **Step 4: 마이그레이션 적용 검증**

```bash
cd /Users/choizeus/prj/budget-book && docker compose up -d --build api postgres
sleep 8 && docker compose logs api | grep -E '0003|Running upgrade'
docker compose exec postgres psql -U budget_book -d budget_db -c '\d monthly_reviews'
```
Expected: `Running upgrade 0002 -> 0003` 로그, 테이블 컬럼 6개 + unique 제약 표시.

- [ ] **Step 5: Commit**

```bash
git add api/models.py api/alembic/versions/0003_monthly_reviews.py api/config.py
git commit -m "feat: monthly_reviews table (alembic 0003) + REVIEW_MODEL setting"
```

---

### Task 2: 리포트 응답 스키마

**Files:**
- Create: `api/schemas_report.py`

**Interfaces:**
- Consumes: `schemas.TopTransaction`, `schemas.YearlySummary`
- Produces: `ReportResponse` 및 하위 모델 전부 (Task 4, 5에서 import)

- [ ] **Step 1: schemas_report.py 작성** (파일 전체)

```python
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from schemas import TopTransaction, YearlySummary


class SummaryBlock(BaseModel):
    income: float
    expense: float
    net: float
    savings_rate: Optional[float]


class ReportSummary(SummaryBlock):
    prev: SummaryBlock


class ReportPace(BaseModel):
    spent_so_far: float
    projected: Optional[float]   # 과거 달이면 None
    daily_avg: float
    prev_daily_avg: float


class Insight(BaseModel):
    type: str
    severity: str  # good | info | warn
    message: str


class ReportDaily(BaseModel):
    day: int
    total: float
    cumulative: float
    prev_cumulative: Optional[float]  # 전월에 없는 날짜(29~31일)는 None


class TrendMonth(BaseModel):
    year: int
    month: int
    income: float
    expense: float
    net: float
    savings_rate: Optional[float]


class CategoryTrend(BaseModel):
    categories: list[str]           # TOP 5 카테고리 이름
    series: list[dict]              # [{"ym": "2026-07", "<카테고리>": 금액, ...}]


class BreakdownSub(BaseModel):
    subcategory: str
    total: float
    count: int


class BreakdownRow(BaseModel):
    category: str
    total: float
    ratio: float                    # 이번 달 지출 대비 0~1
    prev_total: float
    diff_pct: Optional[float]       # 전월비 %, 전월 0이면 None
    budget: Optional[float]
    budget_used: Optional[float]    # %, 예산 없으면 None
    subcategories: list[BreakdownSub]


class FixedItem(BaseModel):
    name: str
    amount: float
    kind: str  # subscription | installment


class ReportFixedVariable(BaseModel):
    fixed_total: float
    variable_total: float
    fixed_ratio: float
    variable_ratio: float
    items: list[FixedItem]


class ReportDow(BaseModel):
    dow: int   # 0=일 ... 6=토
    total: float
    count: int
    avg: float


class ReportWeek(BaseModel):
    week: int  # 1~5
    total: float


class FrequentMerchant(BaseModel):
    description: str
    count: int
    total: float


class BudgetGauge(BaseModel):
    category: str
    budget: float
    spent: float
    used_pct: float
    ideal_pct: float   # 오늘 기준 이상적 소진률(월 진행률) %


class MonthlyReviewResponse(BaseModel):
    year: int
    month: int
    content: str
    model: str
    created_at: datetime

    model_config = {"from_attributes": True, "protected_namespaces": ()}


class ReportResponse(BaseModel):
    year: int
    month: int
    summary: Optional[ReportSummary]
    pace: Optional[ReportPace]
    insights: Optional[list[Insight]]
    daily: Optional[list[ReportDaily]]
    trends: Optional[list[TrendMonth]]
    category_trend: Optional[CategoryTrend]
    breakdown: Optional[list[BreakdownRow]]
    fixed_variable: Optional[ReportFixedVariable]
    dow: Optional[list[ReportDow]]
    weekly: Optional[list[ReportWeek]]
    top: Optional[list[TopTransaction]]
    frequent: Optional[list[FrequentMerchant]]
    budgets: Optional[list[BudgetGauge]]
    ytd: Optional[YearlySummary]
```

- [ ] **Step 2: import 확인**

```bash
docker compose exec api python -c "import schemas_report; print('ok')"
```
Expected: `ok` (컨테이너 미기동 시 `docker compose up -d --build api` 후 재시도)

- [ ] **Step 3: Commit**

```bash
git add api/schemas_report.py
git commit -m "feat: report response schemas"
```

---

### Task 3: 인사이트/페이스 순수 함수 (TDD)

**Files:**
- Create: `api/requirements-dev.txt`, `api/services/insights.py`, `api/tests/test_insights.py`

**Interfaces:**
- Produces:
  - `compute_pace(expense: float, year: int, month: int, today: date) -> dict` → keys: `spent_so_far, projected, daily_avg`
  - `month_progress(year: int, month: int, today: date) -> float` (0~1)
  - `InsightInput` dataclass (아래 필드 정의 참조)
  - `build_insights(d: InsightInput) -> list[dict]` → 각 dict: `{type, severity, message}`

- [ ] **Step 1: pytest 환경**

`api/requirements-dev.txt`:

```
pytest==8.3.4
```

```bash
cd /Users/choizeus/prj/budget-book/api && python3 -m venv .venv && .venv/bin/pip install -q pytest==8.3.4
```

- [ ] **Step 2: 실패하는 테스트 작성** — `api/tests/test_insights.py` (파일 전체)

```python
from datetime import date

from services.insights import InsightInput, build_insights, compute_pace, month_progress


def base_input(**over):
    d = dict(
        year=2026, month=7, today=date(2026, 7, 15),
        income=3_000_000, expense=1_500_000, net=1_500_000,
        prev_income=3_000_000, prev_expense=1_500_000, prev_net=1_500_000,
        breakdown=[], budgets=[], biggest_tx=None, new_merchants=[],
        no_spend_days=3, prev_no_spend_days=3,
        fixed_total=100_000, prev_fixed_total=100_000,
        uncategorized_ratio=0.0, expense_count=20,
        savings_rates_12m=[],
    )
    d.update(over)
    return InsightInput(**d)


def types_of(insights):
    return [i["type"] for i in insights]


# --- pace ---

def test_pace_current_month_projects_to_month_end():
    # 7/15까지 50만원 → 하루 평균 33,333 × 31일 ≈ 1,033,333
    p = compute_pace(500_000, 2026, 7, today=date(2026, 7, 15))
    assert p["spent_so_far"] == 500_000
    assert round(p["projected"]) == round(500_000 / 15 * 31)
    assert round(p["daily_avg"]) == round(500_000 / 15)


def test_pace_past_month_has_no_projection():
    p = compute_pace(930_000, 2026, 6, today=date(2026, 7, 15))
    assert p["projected"] is None
    assert p["daily_avg"] == 930_000 / 30


def test_month_progress():
    assert month_progress(2026, 7, date(2026, 7, 15)) == 15 / 31
    assert month_progress(2026, 6, date(2026, 7, 15)) == 1.0   # 과거 달
    assert month_progress(2026, 8, date(2026, 7, 15)) == 0.0   # 미래 달


# --- 인사이트 규칙 ---

def test_category_surge_triggers_warn():
    d = base_input(breakdown=[{"category": "먹거리", "total": 400_000, "prev_total": 250_000}])
    ins = build_insights(d)
    surge = [i for i in ins if i["type"] == "category_surge"]
    assert len(surge) == 1 and surge[0]["severity"] == "warn"
    assert "먹거리" in surge[0]["message"]


def test_category_small_change_no_insight():
    # 변화율 30% 미만 → 없음
    d = base_input(breakdown=[{"category": "먹거리", "total": 120_000, "prev_total": 100_000}])
    assert "category_surge" not in types_of(build_insights(d))
    # 금액 5만원 미만 → 없음 (비율은 100%지만)
    d = base_input(breakdown=[{"category": "커피", "total": 40_000, "prev_total": 20_000}])
    assert "category_surge" not in types_of(build_insights(d))


def test_category_drop_is_good():
    d = base_input(breakdown=[{"category": "쇼핑", "total": 100_000, "prev_total": 300_000}])
    drop = [i for i in build_insights(d) if i["type"] == "category_drop"]
    assert len(drop) == 1 and drop[0]["severity"] == "good"


def test_budget_over_and_fast_pace():
    d = base_input(budgets=[
        {"category": "먹거리", "budget": 300_000, "spent": 330_000, "used_pct": 110.0, "ideal_pct": 48.4},
        {"category": "교통", "budget": 100_000, "spent": 80_000, "used_pct": 80.0, "ideal_pct": 48.4},
        {"category": "취미", "budget": 100_000, "spent": 40_000, "used_pct": 40.0, "ideal_pct": 48.4},
    ])
    ins = build_insights(d)
    assert any(i["type"] == "budget_over" and "먹거리" in i["message"] for i in ins)
    assert any(i["type"] == "budget_fast" and "교통" in i["message"] for i in ins)
    assert not any("취미" in i["message"] for i in ins)


def test_biggest_tx_info():
    d = base_input(biggest_tx={"description": "노트북", "amount": 1_000_000})
    ins = [i for i in build_insights(d) if i["type"] == "biggest_tx"]
    assert len(ins) == 1 and "노트북" in ins[0]["message"]


def test_new_merchant():
    d = base_input(new_merchants=[{"description": "새헬스장", "total": 90_000}])
    assert any(i["type"] == "new_merchant" and "새헬스장" in i["message"] for i in build_insights(d))
    # 3만원 미만은 제외
    d = base_input(new_merchants=[{"description": "소액가게", "total": 10_000}])
    assert "new_merchant" not in types_of(build_insights(d))


def test_no_spend_days_improved():
    d = base_input(no_spend_days=8, prev_no_spend_days=3)
    ins = [i for i in build_insights(d) if i["type"] == "no_spend_days"]
    assert len(ins) == 1 and ins[0]["severity"] == "good"


def test_fixed_cost_change():
    d = base_input(fixed_total=150_000, prev_fixed_total=100_000)
    ins = [i for i in build_insights(d) if i["type"] == "fixed_change"]
    assert len(ins) == 1 and ins[0]["severity"] == "warn"
    d = base_input(fixed_total=80_000, prev_fixed_total=100_000)
    ins = [i for i in build_insights(d) if i["type"] == "fixed_change"]
    assert len(ins) == 1 and ins[0]["severity"] == "good"
    d = base_input(fixed_total=105_000, prev_fixed_total=100_000)  # 1만원 미만 변화
    assert "fixed_change" not in types_of(build_insights(d))


def test_uncategorized_warn():
    d = base_input(uncategorized_ratio=0.3, expense_count=10)
    assert "uncategorized" in types_of(build_insights(d))
    d = base_input(uncategorized_ratio=0.3, expense_count=3)  # 건수 부족
    assert "uncategorized" not in types_of(build_insights(d))


def test_savings_turnaround_and_record():
    d = base_input(net=200_000, prev_net=-50_000)
    assert any(i["type"] == "savings_turnaround" for i in build_insights(d))
    d = base_input(savings_rates_12m=[0.1, 0.2, 0.15, 0.5], income=3_000_000, expense=1_500_000)
    assert any(i["type"] == "savings_record" for i in build_insights(d))
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
cd /Users/choizeus/prj/budget-book/api && .venv/bin/pytest tests/test_insights.py -q
```
Expected: `ModuleNotFoundError: No module named 'services.insights'` 류의 collection error

- [ ] **Step 4: 구현** — `api/services/insights.py` (파일 전체)

```python
"""리포트 인사이트/페이스 계산 — DB 접근 없는 순수 함수 (단위 테스트 대상)."""
import calendar
from dataclasses import dataclass
from datetime import date

SURGE_PCT = 0.30          # 전월비 ±30% 이상
SURGE_MIN = 50_000        # 그리고 변화액 5만원 이상
BUDGET_FAST_MARGIN = 15   # 이상적 소진률보다 15%p 이상 빠르면 경고
BUDGET_FAST_FLOOR = 70    # 단, 소진률 70% 이상일 때만
NEW_MERCHANT_MIN = 30_000
FIXED_CHANGE_MIN = 10_000
UNCAT_RATIO = 0.20
UNCAT_MIN_COUNT = 5


def _fmt(n: float) -> str:
    return f"{round(n):,}"


def month_progress(year: int, month: int, today: date) -> float:
    """해당 월의 진행률 0~1. 과거 달=1, 미래 달=0."""
    if (year, month) < (today.year, today.month):
        return 1.0
    if (year, month) > (today.year, today.month):
        return 0.0
    return today.day / calendar.monthrange(year, month)[1]


def compute_pace(expense: float, year: int, month: int, today: date) -> dict:
    """월말 예상 지출. 이번 달이면 경과일 기준 프로젝션, 과거 달이면 일평균만."""
    last_day = calendar.monthrange(year, month)[1]
    is_current = (today.year, today.month) == (year, month)
    elapsed = today.day if is_current else last_day
    daily_avg = expense / elapsed if elapsed > 0 else 0.0
    projected = daily_avg * last_day if is_current else None
    return {"spent_so_far": expense, "projected": projected, "daily_avg": daily_avg}


@dataclass
class InsightInput:
    year: int
    month: int
    today: date
    income: float
    expense: float
    net: float
    prev_income: float
    prev_expense: float
    prev_net: float
    breakdown: list          # [{category, total, prev_total}]
    budgets: list            # [{category, budget, spent, used_pct, ideal_pct}]
    biggest_tx: dict | None  # {description, amount}
    new_merchants: list      # [{description, total}]
    no_spend_days: int
    prev_no_spend_days: int
    fixed_total: float
    prev_fixed_total: float
    uncategorized_ratio: float
    expense_count: int
    savings_rates_12m: list  # 이번 달이 마지막 원소. None 포함 가능


def build_insights(d: InsightInput) -> list[dict]:
    out: list[dict] = []

    def add(type_: str, severity: str, message: str):
        out.append({"type": type_, "severity": severity, "message": message})

    # 1. 카테고리 급증/급감
    for row in d.breakdown:
        prev = row.get("prev_total") or 0
        if prev <= 0:
            continue
        diff = row["total"] - prev
        if abs(diff) >= SURGE_MIN and abs(diff) / prev >= SURGE_PCT:
            pct = round(diff / prev * 100)
            if diff > 0:
                add("category_surge", "warn",
                    f"{row['category']} 지출이 전월 대비 {pct}% 증가했어요 ({_fmt(prev)}원 → {_fmt(row['total'])}원)")
            else:
                add("category_drop", "good",
                    f"{row['category']} 지출이 전월 대비 {abs(pct)}% 감소했어요 ({_fmt(prev)}원 → {_fmt(row['total'])}원)")

    # 2. 예산 초과 / 소진 페이스
    for b in d.budgets:
        if b["used_pct"] >= 100:
            add("budget_over", "warn",
                f"{b['category']} 예산을 초과했어요 ({_fmt(b['spent'])}원 / {_fmt(b['budget'])}원)")
        elif b["used_pct"] >= BUDGET_FAST_FLOOR and b["used_pct"] - b["ideal_pct"] >= BUDGET_FAST_MARGIN:
            add("budget_fast", "warn",
                f"{b['category']} 예산 소진이 빨라요 — 이미 {round(b['used_pct'])}% 사용 (월 진행률 {round(b['ideal_pct'])}%)")

    # 3. 최대 단건 지출
    if d.biggest_tx and d.biggest_tx.get("amount", 0) > 0:
        add("biggest_tx", "info",
            f"이번 달 최대 지출: {d.biggest_tx['description']} {_fmt(d.biggest_tx['amount'])}원")

    # 4. 신규 지출처
    for m in d.new_merchants:
        if m["total"] >= NEW_MERCHANT_MIN:
            add("new_merchant", "info",
                f"새로 등장한 지출처: {m['description']} ({_fmt(m['total'])}원)")

    # 5. 무지출일
    if d.no_spend_days > d.prev_no_spend_days:
        add("no_spend_days", "good",
            f"무지출일이 늘었어요 — 이번 달 {d.no_spend_days}일 (전월 {d.prev_no_spend_days}일)")

    # 6. 고정비 변화
    fixed_diff = d.fixed_total - d.prev_fixed_total
    if abs(fixed_diff) >= FIXED_CHANGE_MIN:
        if fixed_diff > 0:
            add("fixed_change", "warn",
                f"고정비(구독·할부)가 전월보다 {_fmt(fixed_diff)}원 늘었어요")
        else:
            add("fixed_change", "good",
                f"고정비(구독·할부)가 전월보다 {_fmt(abs(fixed_diff))}원 줄었어요")

    # 7. 미분류 경고
    if d.uncategorized_ratio >= UNCAT_RATIO and d.expense_count >= UNCAT_MIN_COUNT:
        add("uncategorized", "warn",
            f"지출의 {round(d.uncategorized_ratio * 100)}%가 미분류 상태예요 — 카테고리를 정리해보세요")

    # 8. 저축률 이벤트
    if d.net > 0 and d.prev_net <= 0 and (d.prev_income > 0 or d.prev_expense > 0):
        add("savings_turnaround", "good",
            f"흑자 전환! 이번 달 순저축 +{_fmt(d.net)}원 (전월 {_fmt(d.prev_net)}원)")
    rates = [r for r in d.savings_rates_12m if r is not None]
    if d.income > 0 and len(rates) >= 2:
        cur = rates[-1]
        if cur > 0 and cur >= max(rates):
            add("savings_record", "good",
                f"최근 12개월 중 최고 저축률이에요 ({round(cur * 100)}%)")

    return out
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd /Users/choizeus/prj/budget-book/api && .venv/bin/pytest tests/test_insights.py -q
```
Expected: `13 passed`

- [ ] **Step 6: Commit**

```bash
git add api/services/insights.py api/tests/test_insights.py api/requirements-dev.txt
git commit -m "feat: pure insight rules + pace calc with unit tests"
```

---

### Task 4: report 라우터 — GET /api/report

**Files:**
- Create: `api/routers/report.py`
- Modify: `api/main.py` (import + include_router)

**Interfaces:**
- Consumes: Task 2의 스키마 전부, Task 3의 `InsightInput/build_insights/compute_pace/month_progress`, `routers.stats.yearly_stats`
- Produces: `GET /api/report?year&month` → `ReportResponse`. 내부 함수 `_build_report(year, month) -> ReportResponse` (Task 5가 재사용)

- [ ] **Step 1: report.py 작성** (파일 전체 — review 엔드포인트는 Task 5에서 추가)

```python
import asyncio
import calendar
import logging
from collections import defaultdict
from datetime import date, datetime

from fastapi import APIRouter
from sqlalchemy import extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionLocal
from models import Budget, Installment, Subscription, Transaction, TransactionType
from routers.stats import yearly_stats
from schemas import TopTransaction
from schemas_report import (
    BreakdownRow, BreakdownSub, BudgetGauge, CategoryTrend, FixedItem,
    FrequentMerchant, Insight, ReportDaily, ReportDow, ReportFixedVariable,
    ReportPace, ReportResponse, ReportSummary, ReportWeek, SummaryBlock,
    TrendMonth,
)
from services.insights import InsightInput, build_insights, compute_pace, month_progress

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/report", tags=["report"])


# --- 날짜 헬퍼 ---

def _month_bounds(year: int, month: int) -> tuple[datetime, datetime]:
    start = datetime(year, month, 1)
    end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    return start, end


def _prev_ym(year: int, month: int) -> tuple[int, int]:
    return (year - 1, 12) if month == 1 else (year, month - 1)


def _shift_ym(year: int, month: int, delta: int) -> tuple[int, int]:
    idx = year * 12 + (month - 1) + delta
    return idx // 12, idx % 12 + 1


# --- 공통 쿼리 ---

async def _month_sums(db: AsyncSession, year: int, month: int) -> tuple[float, float]:
    """(income, expense) — expense는 양수."""
    start, end = _month_bounds(year, month)
    result = await db.execute(
        select(Transaction.type, func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date < end)
        .group_by(Transaction.type)
    )
    income = expense = 0.0
    for tx_type, total in result.all():
        if tx_type == TransactionType.income:
            income = float(total or 0)
        else:
            expense = abs(float(total or 0))
    return income, expense


def _savings_rate(income: float, expense: float) -> float | None:
    return (income - expense) / income if income > 0 else None


async def _day_totals(db: AsyncSession, year: int, month: int) -> dict[int, float]:
    start, end = _month_bounds(year, month)
    result = await db.execute(
        select(extract("day", Transaction.date).label("day"), func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense)
        .group_by(extract("day", Transaction.date))
    )
    return {int(d): abs(float(t or 0)) for d, t in result.all()}


async def _fixed_total(db: AsyncSession, year: int, month: int) -> float:
    start, end = _month_bounds(year, month)
    total = (await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.date >= start, Transaction.date < end,
            Transaction.type == TransactionType.expense,
            or_(Transaction.subscription_id.is_not(None), Transaction.installment_id.is_not(None)),
        )
    )).scalar()
    return abs(float(total or 0))


# --- 섹션 함수 (각자 자기 세션으로 실행됨) ---

async def _summary(db: AsyncSession, year: int, month: int) -> ReportSummary:
    income, expense = await _month_sums(db, year, month)
    py, pm = _prev_ym(year, month)
    p_income, p_expense = await _month_sums(db, py, pm)
    return ReportSummary(
        income=income, expense=expense, net=income - expense,
        savings_rate=_savings_rate(income, expense),
        prev=SummaryBlock(income=p_income, expense=p_expense, net=p_income - p_expense,
                          savings_rate=_savings_rate(p_income, p_expense)),
    )


async def _daily(db: AsyncSession, year: int, month: int) -> list[ReportDaily]:
    cur = await _day_totals(db, year, month)
    py, pm = _prev_ym(year, month)
    prev = await _day_totals(db, py, pm)
    last_day = calendar.monthrange(year, month)[1]
    prev_last = calendar.monthrange(py, pm)[1]
    out, cum, pcum = [], 0.0, 0.0
    for day in range(1, last_day + 1):
        cum += cur.get(day, 0.0)
        pc = None
        if day <= prev_last:
            pcum += prev.get(day, 0.0)
            pc = pcum
        out.append(ReportDaily(day=day, total=cur.get(day, 0.0), cumulative=cum, prev_cumulative=pc))
    return out


async def _trends(db: AsyncSession, year: int, month: int) -> list[TrendMonth]:
    sy, sm = _shift_ym(year, month, -11)
    start = _month_bounds(sy, sm)[0]
    end = _month_bounds(year, month)[1]
    result = await db.execute(
        select(
            extract("year", Transaction.date).label("y"),
            extract("month", Transaction.date).label("m"),
            Transaction.type,
            func.sum(Transaction.amount),
        )
        .where(Transaction.date >= start, Transaction.date < end)
        .group_by(extract("year", Transaction.date), extract("month", Transaction.date), Transaction.type)
    )
    data: dict[tuple[int, int], dict] = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for y, m, tx_type, total in result.all():
        key = (int(y), int(m))
        if tx_type == TransactionType.income:
            data[key]["income"] += float(total or 0)
        else:
            data[key]["expense"] += abs(float(total or 0))
    out = []
    for i in range(-11, 1):
        y, m = _shift_ym(year, month, i)
        d = data.get((y, m), {"income": 0.0, "expense": 0.0})
        out.append(TrendMonth(year=y, month=m, income=d["income"], expense=d["expense"],
                              net=d["income"] - d["expense"],
                              savings_rate=_savings_rate(d["income"], d["expense"])))
    return out


async def _category_trend(db: AsyncSession, year: int, month: int) -> CategoryTrend:
    sy, sm = _shift_ym(year, month, -11)
    start = _month_bounds(sy, sm)[0]
    end = _month_bounds(year, month)[1]
    result = await db.execute(
        select(
            extract("year", Transaction.date).label("y"),
            extract("month", Transaction.date).label("m"),
            Transaction.category,
            func.sum(Transaction.amount),
        )
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense)
        .group_by(extract("year", Transaction.date), extract("month", Transaction.date), Transaction.category)
    )
    totals: dict[str, float] = defaultdict(float)
    monthly: dict[tuple[int, int], dict[str, float]] = defaultdict(dict)
    for y, m, cat, total in result.all():
        name = cat or "기타"
        amt = abs(float(total or 0))
        totals[name] += amt
        monthly[(int(y), int(m))][name] = monthly[(int(y), int(m))].get(name, 0.0) + amt
    top5 = [c for c, _ in sorted(totals.items(), key=lambda x: -x[1])[:5]]
    series = []
    for i in range(-11, 1):
        y, m = _shift_ym(year, month, i)
        row: dict = {"ym": f"{y}-{m:02d}"}
        for c in top5:
            row[c] = monthly.get((y, m), {}).get(c, 0.0)
        series.append(row)
    return CategoryTrend(categories=top5, series=series)


async def _breakdown(db: AsyncSession, year: int, month: int) -> list[BreakdownRow]:
    start, end = _month_bounds(year, month)
    result = await db.execute(
        select(Transaction.category, Transaction.subcategory,
               func.sum(Transaction.amount), func.count(Transaction.id))
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense)
        .group_by(Transaction.category, Transaction.subcategory)
    )
    cat_map: dict[str, dict] = defaultdict(lambda: {"total": 0.0, "subs": []})
    for cat, sub, total, count in result.all():
        key = cat or "기타"
        amt = abs(float(total or 0))
        cat_map[key]["total"] += amt
        cat_map[key]["subs"].append(BreakdownSub(subcategory=sub or "기타", total=amt, count=count))

    py, pm = _prev_ym(year, month)
    pstart, pend = _month_bounds(py, pm)
    prev_result = await db.execute(
        select(Transaction.category, func.sum(Transaction.amount))
        .where(Transaction.date >= pstart, Transaction.date < pend,
               Transaction.type == TransactionType.expense)
        .group_by(Transaction.category)
    )
    prev_map = {(cat or "기타"): abs(float(t or 0)) for cat, t in prev_result.all()}

    budget_result = await db.execute(select(Budget))
    budget_map = {b.category: float(b.monthly_amount) for b in budget_result.scalars().all()}

    grand = sum(v["total"] for v in cat_map.values())
    rows = []
    for key, v in sorted(cat_map.items(), key=lambda x: -x[1]["total"]):
        prev_total = prev_map.get(key, 0.0)
        budget = budget_map.get(key)
        rows.append(BreakdownRow(
            category=key, total=v["total"],
            ratio=v["total"] / grand if grand > 0 else 0.0,
            prev_total=prev_total,
            diff_pct=(v["total"] - prev_total) / prev_total * 100 if prev_total > 0 else None,
            budget=budget,
            budget_used=v["total"] / budget * 100 if budget else None,
            subcategories=sorted(v["subs"], key=lambda s: -s.total),
        ))
    return rows


async def _fixed_variable(db: AsyncSession, year: int, month: int) -> ReportFixedVariable:
    start, end = _month_bounds(year, month)
    fixed = await _fixed_total(db, year, month)
    _, expense = await _month_sums(db, year, month)
    variable = max(expense - fixed, 0.0)
    grand = fixed + variable

    items: list[FixedItem] = []
    sub_rows = await db.execute(
        select(Subscription.name, func.sum(Transaction.amount))
        .join(Subscription, Transaction.subscription_id == Subscription.id)
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense)
        .group_by(Subscription.name)
    )
    items += [FixedItem(name=n, amount=abs(float(t or 0)), kind="subscription") for n, t in sub_rows.all()]
    inst_rows = await db.execute(
        select(Installment.name, func.sum(Transaction.amount))
        .join(Installment, Transaction.installment_id == Installment.id)
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense)
        .group_by(Installment.name)
    )
    items += [FixedItem(name=n, amount=abs(float(t or 0)), kind="installment") for n, t in inst_rows.all()]
    items.sort(key=lambda i: -i.amount)

    return ReportFixedVariable(
        fixed_total=fixed, variable_total=variable,
        fixed_ratio=fixed / grand if grand > 0 else 0.0,
        variable_ratio=variable / grand if grand > 0 else 0.0,
        items=items,
    )


async def _dow(db: AsyncSession, year: int, month: int) -> list[ReportDow]:
    start, end = _month_bounds(year, month)
    result = await db.execute(
        select(extract("dow", Transaction.date).label("dow"),
               func.sum(Transaction.amount), func.count(Transaction.id))
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense)
        .group_by(extract("dow", Transaction.date))
        .order_by(extract("dow", Transaction.date))
    )
    return [
        ReportDow(dow=int(d), total=abs(float(t or 0)), count=c,
                  avg=abs(float(t or 0)) / c if c else 0.0)
        for d, t, c in result.all()
    ]


async def _weekly(db: AsyncSession, year: int, month: int) -> list[ReportWeek]:
    totals = await _day_totals(db, year, month)
    weeks: dict[int, float] = defaultdict(float)
    for day, amt in totals.items():
        weeks[(day - 1) // 7 + 1] += amt
    last_week = (calendar.monthrange(year, month)[1] - 1) // 7 + 1
    return [ReportWeek(week=w, total=weeks.get(w, 0.0)) for w in range(1, last_week + 1)]


async def _top(db: AsyncSession, year: int, month: int) -> list[TopTransaction]:
    start, end = _month_bounds(year, month)
    result = await db.execute(
        select(Transaction)
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense)
        .order_by(Transaction.amount)   # 음수 → ASC가 큰 지출
        .limit(10)
    )
    return [
        TopTransaction(id=t.id, description=t.description, amount=abs(t.amount),
                       category=t.category, subcategory=t.subcategory, date=t.date)
        for t in result.scalars().all()
    ]


async def _frequent(db: AsyncSession, year: int, month: int) -> list[FrequentMerchant]:
    start, end = _month_bounds(year, month)
    result = await db.execute(
        select(Transaction.description, func.count(Transaction.id), func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense,
               Transaction.description != "")
        .group_by(Transaction.description)
        .having(func.count(Transaction.id) >= 2)
        .order_by(func.count(Transaction.id).desc())
        .limit(5)
    )
    return [FrequentMerchant(description=d, count=c, total=abs(float(t or 0)))
            for d, c, t in result.all()]


async def _budgets(db: AsyncSession, year: int, month: int) -> list[BudgetGauge]:
    start, end = _month_bounds(year, month)
    spent_result = await db.execute(
        select(Transaction.category, func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense)
        .group_by(Transaction.category)
    )
    spent_map = {(cat or "기타"): abs(float(t or 0)) for cat, t in spent_result.all()}
    budget_result = await db.execute(select(Budget).order_by(Budget.category))
    ideal = month_progress(year, month, date.today()) * 100
    out = []
    for b in budget_result.scalars().all():
        spent = spent_map.get(b.category, 0.0)
        budget = float(b.monthly_amount)
        out.append(BudgetGauge(category=b.category, budget=budget, spent=spent,
                               used_pct=spent / budget * 100 if budget > 0 else 0.0,
                               ideal_pct=ideal))
    return out


async def _ytd(db: AsyncSession, year: int, month: int):
    return await yearly_stats(year=year, db=db)


# --- 인사이트 (다른 섹션 결과 재활용 + 소규모 추가 쿼리) ---

async def _insights(year: int, month: int, summary, daily, trends, breakdown,
                    budgets, fixed_variable, top) -> list[Insight]:
    if summary is None:
        return []
    start, end = _month_bounds(year, month)
    py, pm = _prev_ym(year, month)
    pstart, pend = _month_bounds(py, pm)

    async with AsyncSessionLocal() as s:
        known = (
            select(Transaction.description)
            .where(Transaction.date < start, Transaction.description != "")
            .distinct()
        )
        rows = (await s.execute(
            select(Transaction.description, func.sum(Transaction.amount))
            .where(Transaction.date >= start, Transaction.date < end,
                   Transaction.type == TransactionType.expense,
                   Transaction.description != "",
                   Transaction.description.not_in(known))
            .group_by(Transaction.description)
            .order_by(func.sum(Transaction.amount))
            .limit(3)
        )).all()
        new_merchants = [{"description": d, "total": abs(float(t or 0))} for d, t in rows]

        base = [Transaction.date >= start, Transaction.date < end,
                Transaction.type == TransactionType.expense]
        expense_count = (await s.execute(select(func.count(Transaction.id)).where(*base))).scalar() or 0
        uncat_count = (await s.execute(
            select(func.count(Transaction.id)).where(*base, Transaction.category.is_(None))
        )).scalar() or 0

        prev_fixed = await _fixed_total(s, py, pm)

        prev_spend_days = (await s.execute(
            select(func.count(func.distinct(extract("day", Transaction.date))))
            .where(Transaction.date >= pstart, Transaction.date < pend,
                   Transaction.type == TransactionType.expense)
        )).scalar() or 0

    today = date.today()
    is_current = (today.year, today.month) == (year, month)
    elapsed = today.day if is_current else calendar.monthrange(year, month)[1]
    no_spend = sum(1 for d in (daily or []) if d.day <= elapsed and d.total == 0)
    prev_last = calendar.monthrange(py, pm)[1]
    prev_no_spend = prev_last - prev_spend_days

    inp = InsightInput(
        year=year, month=month, today=today,
        income=summary.income, expense=summary.expense, net=summary.net,
        prev_income=summary.prev.income, prev_expense=summary.prev.expense, prev_net=summary.prev.net,
        breakdown=[{"category": b.category, "total": b.total, "prev_total": b.prev_total}
                   for b in (breakdown or [])],
        budgets=[{"category": b.category, "budget": b.budget, "spent": b.spent,
                  "used_pct": b.used_pct, "ideal_pct": b.ideal_pct} for b in (budgets or [])],
        biggest_tx={"description": top[0].description, "amount": top[0].amount} if top else None,
        new_merchants=new_merchants,
        no_spend_days=no_spend, prev_no_spend_days=prev_no_spend,
        fixed_total=fixed_variable.fixed_total if fixed_variable else 0.0,
        prev_fixed_total=prev_fixed,
        uncategorized_ratio=uncat_count / expense_count if expense_count > 0 else 0.0,
        expense_count=expense_count,
        savings_rates_12m=[t.savings_rate for t in (trends or [])],
    )
    return [Insight(**i) for i in build_insights(inp)]


# --- 통합 빌드 + 엔드포인트 ---

async def _run_section(name: str, fn, year: int, month: int):
    """섹션마다 독립 세션으로 실행. 실패하면 None (전체 리포트는 생존)."""
    try:
        async with AsyncSessionLocal() as session:
            return await fn(session, year, month)
    except Exception:
        logger.warning(f"report section '{name}' failed", exc_info=True)
        return None


async def _build_report(year: int, month: int) -> ReportResponse:
    sections = {
        "summary": _summary, "daily": _daily, "trends": _trends,
        "category_trend": _category_trend, "breakdown": _breakdown,
        "fixed_variable": _fixed_variable, "dow": _dow, "weekly": _weekly,
        "top": _top, "frequent": _frequent, "budgets": _budgets, "ytd": _ytd,
    }
    results = await asyncio.gather(
        *(_run_section(name, fn, year, month) for name, fn in sections.items())
    )
    r = dict(zip(sections.keys(), results))

    pace = None
    if r["summary"] is not None:
        p = compute_pace(r["summary"].expense, year, month, date.today())
        py_avg = compute_pace(r["summary"].prev.expense, *_prev_ym(year, month), date.today())["daily_avg"]
        pace = ReportPace(**p, prev_daily_avg=py_avg)

    try:
        insights = await _insights(year, month, r["summary"], r["daily"], r["trends"],
                                   r["breakdown"], r["budgets"], r["fixed_variable"], r["top"])
    except Exception:
        logger.warning("report insights failed", exc_info=True)
        insights = None

    return ReportResponse(year=year, month=month, pace=pace, insights=insights, **r)


@router.get("", response_model=ReportResponse)
async def get_report(year: int, month: int):
    return await _build_report(year, month)
```

- [ ] **Step 2: main.py 등록**

`from routers import ...` 줄에 `report` 추가, include_router 블록에 추가:

```python
from routers import accounts, budgets, categories, installments, report, stats, subscriptions, transactions
```
```python
app.include_router(report.router, prefix="/api")
```

- [ ] **Step 3: 시드 데이터 넣고 검증**

```bash
cd /Users/choizeus/prj/budget-book && docker compose up -d --build api && sleep 6
B=http://localhost:8000/api
# 시드 (이미 이전 데이터가 있으면 생략 가능)
curl -s -X POST $B/categories -H 'Content-Type: application/json' -d '{"name":"먹거리","icon":"🍚"}' >/dev/null
curl -s -X POST $B/budgets -H 'Content-Type: application/json' -d '{"category":"먹거리","monthly_amount":300000}' >/dev/null
for d in 01 02 05 10 15; do curl -s -X POST $B/transactions -H 'Content-Type: application/json' \
  -d "{\"amount\":15000,\"description\":\"점심\",\"type\":\"expense\",\"date\":\"2026-07-${d}T12:00:00\"}" >/dev/null; done
curl -s -X POST $B/transactions -H 'Content-Type: application/json' \
  -d '{"amount":3000000,"description":"월급","type":"income","date":"2026-07-01T09:00:00"}' >/dev/null
# 리포트 전 필드 확인
curl -sf "$B/report?year=2026&month=7" | python3 -m json.tool | head -60
curl -sf "$B/report?year=2026&month=7" | python3 -c "
import json,sys; r=json.load(sys.stdin)
nulls=[k for k,v in r.items() if v is None]
print('null 섹션:', nulls or '없음')
assert r['summary']['expense'] > 0 and r['daily'] and r['trends'] and r['insights'] is not None
print('OK')"
```
Expected: `null 섹션: 없음`(또는 데이터 없는 섹션만) + `OK`

- [ ] **Step 4: Commit**

```bash
git add api/routers/report.py api/main.py
git commit -m "feat: unified GET /api/report with parallel sections and insights"
```

---

### Task 5: LLM 총평 — generate_monthly_review + review 엔드포인트

**Files:**
- Modify: `api/services/llm.py` (끝에 추가)
- Modify: `api/routers/report.py` (끝에 추가 + import 보강)
- Modify: `api/.env.example` (REVIEW_MODEL 주석)

**Interfaces:**
- Consumes: `_build_report` (Task 4), `models.MonthlyReview` (Task 1), `schemas_report.MonthlyReviewResponse`
- Produces: `generate_monthly_review(payload: str) -> str`, `GET/POST /api/report/review?year&month`

- [ ] **Step 1: llm.py에 추가**

```python
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
```

- [ ] **Step 2: report.py에 review 엔드포인트 추가**

import 보강:

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import AsyncSessionLocal, get_db
from models import Budget, Installment, MonthlyReview, Subscription, Transaction, TransactionType
from schemas_report import (..., MonthlyReviewResponse)   # 기존 import에 MonthlyReviewResponse 추가
from services.llm import generate_monthly_review
```

파일 끝에 추가:

```python
def _format_review_payload(r: ReportResponse) -> str:
    lines = [f"{r.year}년 {r.month}월 가계부"]
    s = r.summary
    lines.append(f"수입 {s.income:,.0f}원 / 지출 {s.expense:,.0f}원 / 순저축 {s.net:,.0f}원"
                 + (f" (저축률 {s.savings_rate*100:.0f}%)" if s.savings_rate is not None else ""))
    lines.append(f"전월: 수입 {s.prev.income:,.0f}원 / 지출 {s.prev.expense:,.0f}원 / 순저축 {s.prev.net:,.0f}원")
    if r.breakdown:
        lines.append("카테고리별 지출: " + ", ".join(
            f"{b.category} {b.total:,.0f}원(전월 {b.prev_total:,.0f}원)" for b in r.breakdown[:8]))
    if r.budgets:
        lines.append("예산: " + ", ".join(
            f"{b.category} {b.spent:,.0f}/{b.budget:,.0f}원({b.used_pct:.0f}%)" for b in r.budgets))
    if r.fixed_variable:
        lines.append(f"고정비 {r.fixed_variable.fixed_total:,.0f}원 / 변동비 {r.fixed_variable.variable_total:,.0f}원")
    if r.insights:
        lines.append("주요 관찰: " + " / ".join(i.message for i in r.insights[:6]))
    return "\n".join(lines)


@router.get("/review", response_model=MonthlyReviewResponse | None)
async def get_review(year: int, month: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MonthlyReview).where(MonthlyReview.year == year, MonthlyReview.month == month)
    )
    return result.scalar_one_or_none()


@router.post("/review", response_model=MonthlyReviewResponse)
async def create_review(year: int, month: int, db: AsyncSession = Depends(get_db)):
    report = await _build_report(year, month)
    if report.summary is None or (report.summary.income == 0 and report.summary.expense == 0):
        raise HTTPException(status_code=400, detail="해당 월에 데이터가 없습니다")

    try:
        content = await generate_monthly_review(_format_review_payload(report))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"총평 생성 실패: {e}")

    result = await db.execute(
        select(MonthlyReview).where(MonthlyReview.year == year, MonthlyReview.month == month)
    )
    row = result.scalar_one_or_none()
    if row:
        row.content = content
        row.model = settings.review_model
        row.created_at = datetime.now()
    else:
        row = MonthlyReview(year=year, month=month, content=content, model=settings.review_model)
        db.add(row)
    await db.commit()
    await db.refresh(row)
    return row
```

⚠️ `/review` 라우트가 `GET ""`(리포트 본문)보다 **아래에 있어도 무방** — FastAPI는 `""`와 `/review`를 경로로 구분.

- [ ] **Step 3: .env.example에 주석 추가**

```
# 월간 총평 모델 (기본 claude-sonnet-5)
# REVIEW_MODEL=claude-sonnet-5
```

- [ ] **Step 4: 검증**

```bash
docker compose up -d --build api && sleep 6
# 캐시 없음 → null
curl -s "http://localhost:8000/api/report/review?year=2026&month=7"     # → null
# 생성: 로컬 .env에 ANTHROPIC_API_KEY 없으면 502가 정상 (에러 경로 확인)
curl -s -X POST "http://localhost:8000/api/report/review?year=2026&month=7" | head -c 300
```
Expected: GET은 `null`. POST는 키가 있으면 `{"year":2026,...,"content":"..."}`, 없으면 `{"detail":"총평 생성 실패: ..."}` (502).

- [ ] **Step 5: Commit**

```bash
git add api/services/llm.py api/routers/report.py api/.env.example
git commit -m "feat: LLM monthly review with DB cache (sonnet 5)"
```

---

### Task 6: 프론트 타입 + API 클라이언트

**Files:**
- Modify: `frontend/src/api/types.ts` (끝에 추가)
- Modify: `frontend/src/api/client.ts` (import + `stats:` 블록 아래에 `report:` 추가)

**Interfaces:**
- Produces: `Report`, `MonthlyReview` 등 타입 / `api.report.get(y,m)`, `api.report.getReview(y,m)`, `api.report.generateReview(y,m)`

- [ ] **Step 1: types.ts에 추가**

```typescript
// --- Report v2 ---

export interface SummaryBlock {
  income: number; expense: number; net: number; savings_rate: number | null;
}
export interface ReportSummary extends SummaryBlock { prev: SummaryBlock; }
export interface ReportPace {
  spent_so_far: number; projected: number | null; daily_avg: number; prev_daily_avg: number;
}
export interface Insight { type: string; severity: "good" | "info" | "warn"; message: string; }
export interface ReportDaily {
  day: number; total: number; cumulative: number; prev_cumulative: number | null;
}
export interface TrendMonth {
  year: number; month: number; income: number; expense: number; net: number; savings_rate: number | null;
}
export interface CategoryTrend {
  categories: string[];
  series: Array<Record<string, number | string>>; // { ym: "2026-07", <카테고리>: 금액 }
}
export interface BreakdownSub { subcategory: string; total: number; count: number; }
export interface BreakdownRow {
  category: string; total: number; ratio: number; prev_total: number;
  diff_pct: number | null; budget: number | null; budget_used: number | null;
  subcategories: BreakdownSub[];
}
export interface FixedItem { name: string; amount: number; kind: "subscription" | "installment"; }
export interface ReportFixedVariable {
  fixed_total: number; variable_total: number; fixed_ratio: number; variable_ratio: number;
  items: FixedItem[];
}
export interface ReportDow { dow: number; total: number; count: number; avg: number; }
export interface ReportWeek { week: number; total: number; }
export interface FrequentMerchant { description: string; count: number; total: number; }
export interface BudgetGauge {
  category: string; budget: number; spent: number; used_pct: number; ideal_pct: number;
}
export interface MonthlyReview {
  year: number; month: number; content: string; model: string; created_at: string;
}
export interface Report {
  year: number; month: number;
  summary: ReportSummary | null;
  pace: ReportPace | null;
  insights: Insight[] | null;
  daily: ReportDaily[] | null;
  trends: TrendMonth[] | null;
  category_trend: CategoryTrend | null;
  breakdown: BreakdownRow[] | null;
  fixed_variable: ReportFixedVariable | null;
  dow: ReportDow[] | null;
  weekly: ReportWeek[] | null;
  top: TopTransaction[] | null;
  frequent: FrequentMerchant[] | null;
  budgets: BudgetGauge[] | null;
  ytd: YearlySummary | null;
}
```

- [ ] **Step 2: client.ts에 추가**

import 목록에 `MonthlyReview, Report` 추가. `stats: {...}` 블록 뒤에:

```typescript
  report: {
    get: (year: number, month: number) =>
      request<Report>(`/report?year=${year}&month=${month}`),
    getReview: (year: number, month: number) =>
      request<MonthlyReview | null>(`/report/review?year=${year}&month=${month}`),
    generateReview: (year: number, month: number) =>
      request<MonthlyReview>(`/report/review?year=${year}&month=${month}`, { method: "POST" }),
  },
```

- [ ] **Step 3: 빌드 확인**

```bash
cd /Users/choizeus/prj/budget-book/frontend && npm run build 2>&1 | grep -E 'error|✓ built'
```
Expected: `✓ built`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts
git commit -m "feat: report API types and client methods"
```

---

### Task 7: Report 페이지 뼈대 + 라우팅 + KPI/인사이트/총평 카드

**Files:**
- Create: `frontend/src/components/report/shared.tsx`
- Create: `frontend/src/components/report/KpiRow.tsx`
- Create: `frontend/src/components/report/InsightsCard.tsx`
- Create: `frontend/src/components/report/ReviewCard.tsx`
- Create: `frontend/src/pages/Report.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/components/BottomNav.tsx`

**Interfaces:**
- Produces: `<Card title span>` 래퍼, `fmt()`, `COLORS`, `DOW_LABELS` (report 카드 전체가 사용)
- Consumes: `api.report.*` (Task 6)

- [ ] **Step 1: shared.tsx**

```tsx
import type { ReactNode } from "react";

export const COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
  "#f97316", "#84cc16", "#94a3b8",
];

export const DOW_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function fmt(n: number) {
  return Math.abs(Math.round(n)).toLocaleString("ko-KR");
}

export function signed(n: number) {
  return `${n >= 0 ? "+" : "-"}${fmt(n)}`;
}

export function Card({ title, span = "lg:col-span-6", children }: {
  title?: string; span?: string; children: ReactNode;
}) {
  return (
    <div className={`bg-slate-800 rounded-2xl p-4 ${span}`}>
      {title && <h3 className="text-slate-300 text-sm font-semibold mb-3">{title}</h3>}
      {children}
    </div>
  );
}

export function Empty() {
  return <p className="text-slate-500 text-sm text-center py-8">데이터 없음</p>;
}

export const tooltipStyle = {
  background: "#1e293b", border: "none", borderRadius: 8, color: "#fff", fontSize: 12,
} as const;
```

- [ ] **Step 2: KpiRow.tsx**

```tsx
import type { ReactNode } from "react";
import type { ReportPace, ReportSummary } from "../../api/types";
import { fmt, signed } from "./shared";

function Delta({ cur, prev, invert = false }: { cur: number; prev: number; invert?: boolean }) {
  const diff = cur - prev;
  if (prev === 0 && cur === 0) return null;
  const good = invert ? diff < 0 : diff > 0;
  return (
    <span className={`text-xs ${diff === 0 ? "text-slate-500" : good ? "text-emerald-400" : "text-red-400"}`}>
      전월비 {signed(diff)}원
    </span>
  );
}

function Tile({ label, value, sub, color = "text-white" }: {
  label: string; value: string; sub?: ReactNode; color?: string;
}) {
  return (
    <div className="bg-slate-800 rounded-2xl p-4 flex flex-col gap-1 lg:col-span-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {sub}
    </div>
  );
}

export default function KpiRow({ summary, pace }: {
  summary: ReportSummary | null; pace: ReportPace | null;
}) {
  if (!summary) return null;
  const rate = summary.savings_rate;
  return (
    <>
      <Tile label="총지출" value={`${fmt(summary.expense)}원`} color="text-red-400"
            sub={<Delta cur={summary.expense} prev={summary.prev.expense} invert />} />
      <Tile label="총수입" value={`${fmt(summary.income)}원`} color="text-emerald-400"
            sub={<Delta cur={summary.income} prev={summary.prev.income} />} />
      <Tile label="순저축" value={`${signed(summary.net)}원`}
            color={summary.net >= 0 ? "text-white" : "text-red-400"}
            sub={<span className="text-xs text-slate-500">
              저축률 {rate !== null ? `${Math.round(rate * 100)}%` : "-"}
            </span>} />
      <Tile label={pace?.projected !== null && pace?.projected !== undefined ? "월말 예상 지출" : "일평균 지출"}
            value={pace ? `${fmt(pace.projected ?? pace.daily_avg)}원` : "-"}
            sub={pace ? <span className="text-xs text-slate-500">
              일평균 {fmt(pace.daily_avg)}원 (전월 {fmt(pace.prev_daily_avg)}원)
            </span> : undefined} />
    </>
  );
}
```

- [ ] **Step 3: InsightsCard.tsx**

```tsx
import type { Insight } from "../../api/types";
import { Card, Empty } from "./shared";

const ICON: Record<Insight["severity"], string> = { good: "✅", info: "💡", warn: "⚠️" };

export default function InsightsCard({ insights }: { insights: Insight[] | null }) {
  return (
    <Card title="자동 인사이트" span="lg:col-span-7">
      {!insights ? <Empty /> : insights.length === 0 ? (
        <p className="text-slate-500 text-sm py-4">특이사항이 없어요. 무난한 한 달이었습니다.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {insights.map((i, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm">
              <span>{ICON[i.severity]}</span>
              <span className={i.severity === "warn" ? "text-amber-300" : "text-slate-200"}>
                {i.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: ReviewCard.tsx**

```tsx
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { MonthlyReview } from "../../api/types";
import { Card } from "./shared";

export default function ReviewCard({ year, month }: { year: number; month: number }) {
  const [review, setReview] = useState<MonthlyReview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setReview(null); setError(null);
    api.report.getReview(year, month).then(setReview).catch(() => {});
  }, [year, month]);

  async function generate() {
    setLoading(true); setError(null);
    try {
      setReview(await api.report.generateReview(year, month));
    } catch {
      setError("총평 생성에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="AI 월간 총평" span="lg:col-span-5">
      {review ? (
        <div className="flex flex-col gap-3">
          <p className="text-slate-200 text-sm leading-relaxed">{review.content}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {new Date(review.created_at).toLocaleDateString("ko-KR")} 생성
            </span>
            <button onClick={generate} disabled={loading}
              className="text-xs text-indigo-400 disabled:text-slate-600">
              {loading ? "생성 중..." : "다시 생성"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-6">
          <p className="text-slate-500 text-sm">이번 달 총평이 아직 없어요</p>
          <button onClick={generate} disabled={loading}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm disabled:bg-slate-700">
            {loading ? "생성 중..." : "총평 생성"}
          </button>
        </div>
      )}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </Card>
  );
}
```

- [ ] **Step 5: Report.tsx** (④~⑩ 카드는 다음 태스크에서 채움 — 여기서는 자리만)

```tsx
import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Report } from "../api/types";
import InsightsCard from "../components/report/InsightsCard";
import KpiRow from "../components/report/KpiRow";
import ReviewCard from "../components/report/ReviewCard";

export default function ReportPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);

  function load(y: number, m: number) {
    setError(false); setReport(null);
    api.report.get(y, m).then(setReport).catch(() => setError(true));
  }
  useEffect(() => { load(year, month); }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1);
  }

  return (
    <div className="pb-20 bg-slate-950 min-h-svh">
      <div className="max-w-6xl mx-auto px-4"
           style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-white">리포트</h1>
          <div className="flex items-center gap-4">
            <button onClick={prevMonth} className="text-slate-400 text-xl px-2">‹</button>
            <span className="text-white font-medium">{year}년 {month}월</span>
            <button onClick={nextMonth} className="text-slate-400 text-xl px-2">›</button>
          </div>
        </div>

        {error && (
          <div className="text-center py-20">
            <p className="text-slate-400 mb-3">리포트를 불러오지 못했습니다</p>
            <button onClick={() => load(year, month)}
              className="px-4 py-2 rounded-xl bg-slate-800 text-white text-sm">다시 시도</button>
          </div>
        )}
        {!error && !report && <p className="text-slate-500 text-center py-20">불러오는 중...</p>}

        {report && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <KpiRow summary={report.summary} pace={report.pace} />
            <InsightsCard insights={report.insights} />
            <ReviewCard year={year} month={month} />
            {/* ④~⑩ 카드는 Task 8~9에서 추가 */}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: App.tsx 라우트 + BottomNav 탭**

App.tsx — import에 `import ReportPage from "./pages/Report";` 추가, 일반 레이아웃 Routes 안에:

```tsx
<Route path="/report" element={<ReportPage />} />
```

BottomNav.tsx — tabs 배열의 통계 다음에:

```tsx
  { to: "/report", label: "리포트", icon: "📈" },
```

- [ ] **Step 7: 빌드 + 화면 확인**

```bash
cd /Users/choizeus/prj/budget-book/frontend && npm run build 2>&1 | grep -E 'error|✓ built'
docker compose up -d --build frontend
```
브라우저 `http://localhost:5173/budget/report` → KPI 4타일 + 인사이트 + 총평 카드 렌더 확인.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/report/ frontend/src/pages/Report.tsx frontend/src/App.tsx frontend/src/components/BottomNav.tsx
git commit -m "feat: report page skeleton with KPI, insights, AI review cards"
```

---

### Task 8: 차트 카드 (④ 지출 흐름 + ⑤ 12개월 트렌드)

**Files:**
- Create: `frontend/src/components/report/FlowCards.tsx`
- Create: `frontend/src/components/report/TrendCards.tsx`
- Modify: `frontend/src/pages/Report.tsx` (카드 삽입)

**Interfaces:**
- Consumes: `shared.tsx`의 `Card/Empty/fmt/COLORS/DOW_LABELS/tooltipStyle`, `Report` 타입

- [ ] **Step 1: FlowCards.tsx** — 일별+누적 콤보 차트, 캘린더 히트맵

```tsx
import {
  Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { ReportDaily } from "../../api/types";
import { Card, DOW_LABELS, Empty, fmt, tooltipStyle } from "./shared";

export function DailyFlowCard({ daily }: { daily: ReportDaily[] | null }) {
  return (
    <Card title="일별 지출 · 누적 (점선=전월 누적)" span="lg:col-span-7">
      {!daily || daily.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={daily}>
            <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={tooltipStyle}
              formatter={(v: number, name: string) => [`${fmt(v)}원`,
                name === "total" ? "일별" : name === "cumulative" ? "누적" : "전월 누적"]} />
            <Bar dataKey="total" fill="#6366f1" radius={[2, 2, 0, 0]} />
            <Line dataKey="cumulative" stroke="#f59e0b" strokeWidth={2} dot={false} />
            <Line dataKey="prev_cumulative" stroke="#64748b" strokeWidth={1.5}
                  strokeDasharray="4 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function HeatmapCard({ daily, year, month }: {
  daily: ReportDaily[] | null; year: number; month: number;
}) {
  if (!daily || daily.length === 0) {
    return <Card title="지출 히트맵" span="lg:col-span-5"><Empty /></Card>;
  }
  const max = Math.max(...daily.map(d => d.total), 1);
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=일
  const cells: Array<ReportDaily | null> = [
    ...Array.from({ length: firstDow }, () => null), ...daily,
  ];
  return (
    <Card title="지출 히트맵" span="lg:col-span-5">
      <div className="grid grid-cols-7 gap-1 text-center">
        {DOW_LABELS.map(l => (
          <span key={l} className="text-[10px] text-slate-500">{l}</span>
        ))}
        {cells.map((d, i) => d === null ? <span key={`e${i}`} /> : (
          <div key={d.day} title={`${d.day}일 ${fmt(d.total)}원`}
            className="aspect-square rounded flex items-center justify-center text-[10px]"
            style={{
              backgroundColor: d.total === 0 ? "rgba(51,65,85,.5)"
                : `rgba(99,102,241,${0.25 + 0.75 * (d.total / max)})`,
              color: d.total / max > 0.5 ? "#fff" : "#94a3b8",
            }}>
            {d.day}
          </div>
        ))}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: TrendCards.tsx** — 수입/지출/순저축 콤보, 저축률 라인, 카테고리 멀티라인

```tsx
import {
  Bar, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { CategoryTrend, TrendMonth } from "../../api/types";
import { Card, COLORS, Empty, fmt, tooltipStyle } from "./shared";

const ymLabel = (t: TrendMonth) => `${String(t.month)}월`;

export function TrendsCard({ trends }: { trends: TrendMonth[] | null }) {
  return (
    <Card title="12개월 수입·지출·순저축" span="lg:col-span-5">
      {!trends ? <Empty /> : (
        <ResponsiveContainer width="100%" height={200}>
          <ComposedChart data={trends.map(t => ({ ...t, label: ymLabel(t) }))}>
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={tooltipStyle}
              formatter={(v: number, name: string) => [`${fmt(v)}원`,
                { income: "수입", expense: "지출", net: "순저축" }[name] ?? name]} />
            <Bar dataKey="income" fill="#10b981" radius={[2, 2, 0, 0]} />
            <Bar dataKey="expense" fill="#ef4444" radius={[2, 2, 0, 0]} />
            <Line dataKey="net" stroke="#f59e0b" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function SavingsRateCard({ trends }: { trends: TrendMonth[] | null }) {
  const data = (trends ?? []).map(t => ({
    label: ymLabel(t),
    rate: t.savings_rate !== null ? Math.round(t.savings_rate * 100) : null,
  }));
  return (
    <Card title="저축률 추이 (%)" span="lg:col-span-3">
      {!trends ? <Empty /> : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, "저축률"]} />
            <Line dataKey="rate" stroke="#10b981" strokeWidth={2} dot={{ r: 2 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function CategoryTrendCard({ trend }: { trend: CategoryTrend | null }) {
  return (
    <Card title="TOP 5 카테고리 월별 지출" span="lg:col-span-4">
      {!trend || trend.categories.length === 0 ? <Empty /> : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trend.series}>
              <XAxis dataKey="ym" tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false}
                     tickFormatter={(v: string) => `${Number(v.split("-")[1])}월`} />
              <YAxis hide />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${fmt(v)}원`} />
              {trend.categories.map((c, i) => (
                <Line key={c} dataKey={c} stroke={COLORS[i % COLORS.length]}
                      strokeWidth={1.5} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-2">
            {trend.categories.map((c, i) => (
              <span key={c} className="text-[10px] text-slate-400 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                {c}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: Report.tsx 그리드에 삽입** — `<ReviewCard ... />` 아래에:

```tsx
            <DailyFlowCard daily={report.daily} />
            <HeatmapCard daily={report.daily} year={year} month={month} />
            <TrendsCard trends={report.trends} />
            <SavingsRateCard trends={report.trends} />
            <CategoryTrendCard trend={report.category_trend} />
```

import 추가:

```tsx
import { DailyFlowCard, HeatmapCard } from "../components/report/FlowCards";
import { CategoryTrendCard, SavingsRateCard, TrendsCard } from "../components/report/TrendCards";
```

- [ ] **Step 4: 빌드 + 확인**

```bash
cd /Users/choizeus/prj/budget-book/frontend && npm run build 2>&1 | grep -E 'error|✓ built'
```
브라우저에서 차트 5개 렌더 확인 (시드 데이터 기준 7월).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/report/FlowCards.tsx frontend/src/components/report/TrendCards.tsx frontend/src/pages/Report.tsx
git commit -m "feat: report flow and trend chart cards"
```

---

### Task 9: 구성/패턴/기록/예산/YTD 카드 + 설정 리포트 탭 제거

**Files:**
- Create: `frontend/src/components/report/CompositionCards.tsx`, `PatternCards.tsx`, `RecordCards.tsx`, `BudgetCard.tsx`, `YtdCard.tsx`
- Modify: `frontend/src/pages/Report.tsx`
- Modify: `frontend/src/pages/Settings.tsx` (report 탭 제거)
- Delete: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: CompositionCards.tsx**

```tsx
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { BreakdownRow, ReportFixedVariable } from "../../api/types";
import { Card, COLORS, Empty, fmt, tooltipStyle } from "./shared";

export function DonutCard({ breakdown }: { breakdown: BreakdownRow[] | null }) {
  const data = (breakdown ?? []).map(b => ({ name: b.category, value: b.total }));
  return (
    <Card title="카테고리 구성" span="lg:col-span-4">
      {data.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                 paddingAngle={2} dataKey="value">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${fmt(v)}원`, ""]} />
          </PieChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function CategoryTableCard({ breakdown }: { breakdown: BreakdownRow[] | null }) {
  return (
    <Card title="카테고리 상세" span="lg:col-span-4">
      {!breakdown || breakdown.length === 0 ? <Empty /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-500 text-xs">
                <th className="text-left font-normal pb-2">카테고리</th>
                <th className="text-right font-normal pb-2">금액</th>
                <th className="text-right font-normal pb-2">비중</th>
                <th className="text-right font-normal pb-2">전월비</th>
                <th className="text-right font-normal pb-2">예산</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map(b => (
                <tr key={b.category} className="border-t border-slate-700/50">
                  <td className="py-1.5 text-slate-200">{b.category}</td>
                  <td className="py-1.5 text-right text-slate-200 tabular-nums">{fmt(b.total)}원</td>
                  <td className="py-1.5 text-right text-slate-400 tabular-nums">{Math.round(b.ratio * 100)}%</td>
                  <td className={`py-1.5 text-right tabular-nums ${
                    b.diff_pct === null ? "text-slate-600"
                    : b.diff_pct > 0 ? "text-red-400" : "text-emerald-400"}`}>
                    {b.diff_pct === null ? "-" : `${b.diff_pct > 0 ? "+" : ""}${Math.round(b.diff_pct)}%`}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums ${
                    b.budget_used === null ? "text-slate-600"
                    : b.budget_used > 100 ? "text-red-400" : "text-slate-400"}`}>
                    {b.budget_used === null ? "-" : `${Math.round(b.budget_used)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function FixedVarCard({ fv }: { fv: ReportFixedVariable | null }) {
  return (
    <Card title="고정비 vs 변동비" span="lg:col-span-4">
      {!fv ? <Empty /> : (
        <div className="flex flex-col gap-3">
          <div className="h-3 rounded-full overflow-hidden flex bg-slate-700">
            <div className="bg-indigo-500" style={{ width: `${fv.fixed_ratio * 100}%` }} />
            <div className="bg-pink-500" style={{ width: `${fv.variable_ratio * 100}%` }} />
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-indigo-400">고정 {fmt(fv.fixed_total)}원 ({Math.round(fv.fixed_ratio * 100)}%)</span>
            <span className="text-pink-400">변동 {fmt(fv.variable_total)}원 ({Math.round(fv.variable_ratio * 100)}%)</span>
          </div>
          {fv.items.length > 0 && (
            <ul className="flex flex-col gap-1.5 mt-1">
              {fv.items.map(item => (
                <li key={`${item.kind}-${item.name}`} className="flex justify-between text-sm">
                  <span className="text-slate-300">
                    {item.kind === "subscription" ? "🔁" : "💳"} {item.name}
                  </span>
                  <span className="text-slate-400 tabular-nums">{fmt(item.amount)}원</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: PatternCards.tsx**

```tsx
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ReportDow, ReportWeek } from "../../api/types";
import { Card, DOW_LABELS, Empty, fmt, tooltipStyle } from "./shared";

export function DowCard({ dow }: { dow: ReportDow[] | null }) {
  const data = (dow ?? []).map(d => ({ ...d, label: DOW_LABELS[d.dow] }));
  return (
    <Card title="요일별 지출" span="lg:col-span-6">
      {data.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data}>
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={tooltipStyle}
              formatter={(v: number, name: string) =>
                name === "total" ? [`${fmt(v)}원`, "합계"] : [`${fmt(v)}원`, "건당 평균"]} />
            <Bar dataKey="total" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

export function WeeklyCard({ weekly }: { weekly: ReportWeek[] | null }) {
  const data = (weekly ?? []).map(w => ({ ...w, label: `${w.week}주차` }));
  return (
    <Card title="주차별 지출" span="lg:col-span-6">
      {data.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data}>
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${fmt(v)}원`, "지출"]} />
            <Bar dataKey="total" fill="#14b8a6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
```

- [ ] **Step 3: RecordCards.tsx**

```tsx
import type { FrequentMerchant, TopTransaction } from "../../api/types";
import { Card, Empty, fmt } from "./shared";

export function TopCard({ top }: { top: TopTransaction[] | null }) {
  return (
    <Card title="TOP 10 지출" span="lg:col-span-7">
      {!top || top.length === 0 ? <Empty /> : (
        <ol className="flex flex-col gap-1.5">
          {top.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <span className="text-slate-500 w-5 text-right">{i + 1}</span>
              <span className="text-slate-200 flex-1 truncate">{t.description || "(설명 없음)"}</span>
              <span className="text-slate-500 text-xs">{t.category ?? "미분류"}</span>
              <span className="text-slate-500 text-xs">{new Date(t.date).getDate()}일</span>
              <span className="text-red-400 tabular-nums">{fmt(t.amount)}원</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function FrequentCard({ frequent }: { frequent: FrequentMerchant[] | null }) {
  return (
    <Card title="자주 간 곳 TOP 5" span="lg:col-span-5">
      {!frequent || frequent.length === 0 ? <Empty /> : (
        <ul className="flex flex-col gap-2">
          {frequent.map(m => (
            <li key={m.description} className="flex items-center justify-between text-sm">
              <span className="text-slate-200 truncate">{m.description}</span>
              <span className="text-slate-400 text-xs shrink-0 ml-2">
                {m.count}회 · {fmt(m.total)}원
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: BudgetCard.tsx + YtdCard.tsx**

BudgetCard.tsx:

```tsx
import type { BudgetGauge } from "../../api/types";
import { Card, Empty, fmt } from "./shared";

export default function BudgetCard({ budgets }: { budgets: BudgetGauge[] | null }) {
  return (
    <Card title="예산 소진 (세로선 = 오늘 기준 이상적 페이스)" span="lg:col-span-7">
      {!budgets || budgets.length === 0 ? <Empty /> : (
        <div className="flex flex-col gap-3">
          {budgets.map(b => (
            <div key={b.category}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">{b.category}</span>
                <span className={b.used_pct > 100 ? "text-red-400" : "text-slate-400"}>
                  {fmt(b.spent)} / {fmt(b.budget)}원 ({Math.round(b.used_pct)}%)
                </span>
              </div>
              <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${
                  b.used_pct > 100 ? "bg-red-500" : b.used_pct > b.ideal_pct + 15 ? "bg-amber-500" : "bg-emerald-500"}`}
                  style={{ width: `${Math.min(b.used_pct, 100)}%` }} />
                <div className="absolute top-0 bottom-0 w-px bg-white/60"
                  style={{ left: `${Math.min(b.ideal_pct, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
```

YtdCard.tsx:

```tsx
import type { YearlySummary } from "../../api/types";
import { Card, Empty, fmt, signed } from "./shared";

export default function YtdCard({ ytd }: { ytd: YearlySummary | null }) {
  return (
    <Card title={`연간 누적 (${ytd?.year ?? ""}년)`} span="lg:col-span-5">
      {!ytd ? <Empty /> : (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-xs text-slate-500">누적 수입</p>
            <p className="text-emerald-400 tabular-nums">{fmt(ytd.total_income)}원</p></div>
          <div><p className="text-xs text-slate-500">누적 지출</p>
            <p className="text-red-400 tabular-nums">{fmt(ytd.total_expense)}원</p></div>
          <div><p className="text-xs text-slate-500">누적 순저축</p>
            <p className="text-white tabular-nums">{signed(ytd.net)}원</p></div>
          <div><p className="text-xs text-slate-500">연 저축률</p>
            <p className="text-white tabular-nums">
              {ytd.savings_rate !== null ? `${Math.round(ytd.savings_rate * 100)}%` : "-"}
            </p></div>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 5: Report.tsx 그리드 완성** — `<CategoryTrendCard ... />` 아래에:

```tsx
            <DonutCard breakdown={report.breakdown} />
            <CategoryTableCard breakdown={report.breakdown} />
            <FixedVarCard fv={report.fixed_variable} />
            <DowCard dow={report.dow} />
            <WeeklyCard weekly={report.weekly} />
            <TopCard top={report.top} />
            <FrequentCard frequent={report.frequent} />
            <BudgetCard budgets={report.budgets} />
            <YtdCard ytd={report.ytd} />
```

import:

```tsx
import BudgetCard from "../components/report/BudgetCard";
import { CategoryTableCard, DonutCard, FixedVarCard } from "../components/report/CompositionCards";
import { DowCard, WeeklyCard } from "../components/report/PatternCards";
import { FrequentCard, TopCard } from "../components/report/RecordCards";
import YtdCard from "../components/report/YtdCard";
```

- [ ] **Step 6: 설정에서 리포트 탭 제거**

Settings.tsx: `import ReportSection ...` 줄 삭제, 324행 `TAB_LABELS`에서 `, report: "리포트"` 삭제, 351행 `{tab === "report" && <ReportSection />}` 삭제. 그리고:

```bash
rm frontend/src/components/settings/ReportSection.tsx
```

- [ ] **Step 7: 빌드 + 확인**

```bash
cd /Users/choizeus/prj/budget-book/frontend && npm run build 2>&1 | grep -E 'error|✓ built'
```
Expected: `✓ built` (ReportSection 참조 에러 없어야 함). 브라우저에서 전체 그리드 + 설정 페이지 탭 3개 확인.

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src
git commit -m "feat: complete report grid; move report out of settings"
```

---

### Task 10: 통계 드릴다운 (3단 아코디언)

**Files:**
- Modify: `frontend/src/pages/Stats.tsx`

**Interfaces:**
- Consumes: `api.transactions.list(year, month)` → `Transaction[]`

- [ ] **Step 1: 상태 + 로더 추가** — Stats.tsx 컴포넌트 상단 state 블록에:

```tsx
  const [monthTx, setMonthTx] = useState<Transaction[] | null>(null);
  const [openSub, setOpenSub] = useState<string | null>(null); // `${cat}|${sub}`
```

import에 `Transaction` 타입 추가:

```tsx
import type { CategoryStatDetail, MonthlySummary, Transaction } from "../api/types";
```

기존 useEffect의 `.then` 안에 초기화 추가 (`setExpanded(null);` 다음):

```tsx
      setMonthTx(null);
      setOpenSub(null);
```

컴포넌트 함수 안에 헬퍼 추가:

```tsx
  async function toggleSub(cat: string, sub: string) {
    const key = `${cat}|${sub}`;
    if (openSub === key) { setOpenSub(null); return; }
    setOpenSub(key);
    if (monthTx === null) {
      setMonthTx(await api.transactions.list(year, month));
    }
  }

  function subTransactions(cat: string, sub: string): Transaction[] {
    if (!monthTx) return [];
    return monthTx.filter(t => {
      if (t.type !== "expense") return false;
      const catMatch = cat === "기타"
        ? t.category === null || t.category === "기타"
        : t.category === cat;
      const subMatch = sub === "기타"
        ? t.subcategory === null || t.subcategory === "기타"
        : t.subcategory === sub;
      return catMatch && subMatch;
    });
  }
```

- [ ] **Step 2: 중분류 행을 버튼 + 펼침으로 변경**

기존 중분류 렌더 블록(`{cat.subcategories.map((sub) => {` 부분)을 다음으로 교체:

```tsx
                  {cat.subcategories.map((sub) => {
                    const subPercent = cat.total > 0 ? (sub.total / cat.total) * 100 : 0;
                    const key = `${cat.category}|${sub.subcategory}`;
                    const subOpen = openSub === key;
                    const txs = subOpen ? subTransactions(cat.category, sub.subcategory) : [];
                    return (
                      <div key={sub.subcategory}>
                        <button
                          className="w-full flex items-center gap-2 py-0.5 active:opacity-70"
                          onClick={() => toggleSub(cat.category, sub.subcategory)}
                        >
                          <span className="text-slate-400 text-xs w-16 shrink-0 text-left">
                            {sub.subcategory}
                          </span>
                          <div className="flex-1 h-1 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.min(subPercent, 100)}%`,
                                backgroundColor: COLORS[idx % COLORS.length] + "99",
                              }}
                            />
                          </div>
                          <span className="text-slate-300 text-xs shrink-0">{fmt(sub.total)}원</span>
                          <span className="text-slate-600 text-[10px]">{subOpen ? "▲" : "▼"}</span>
                        </button>
                        {subOpen && (
                          <div className="ml-4 my-1 border-l border-slate-700 pl-3 flex flex-col gap-1">
                            {monthTx === null ? (
                              <p className="text-slate-500 text-xs py-1">불러오는 중...</p>
                            ) : txs.length === 0 ? (
                              <p className="text-slate-500 text-xs py-1">거래 없음</p>
                            ) : (
                              txs.map(t => (
                                <div key={t.id} className="flex items-center gap-2 text-xs">
                                  <span className="text-slate-500 w-10 shrink-0">
                                    {new Date(t.date).getDate()}일
                                  </span>
                                  <span className="text-slate-300 flex-1 truncate">
                                    {t.description || "(설명 없음)"}
                                  </span>
                                  <span className="text-slate-400 tabular-nums">{fmt(t.amount)}원</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
```

- [ ] **Step 3: 빌드 + 동작 확인**

```bash
cd /Users/choizeus/prj/budget-book/frontend && npm run build 2>&1 | grep -E 'error|✓ built'
```
브라우저 통계 페이지: 대분류 펼침 → 중분류 탭 → 거래 목록 인라인 표시, 월 변경 시 닫힘 확인.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Stats.tsx
git commit -m "feat: stats 3-level drilldown to individual transactions"
```

---

### Task 11: e2e 검증 + 마무리

- [ ] **Step 1: 백엔드 회귀 확인**

```bash
cd /Users/choizeus/prj/budget-book/api && .venv/bin/pytest tests/ -q
cd /Users/choizeus/prj/budget-book && docker compose up -d --build && sleep 8
curl -sf http://localhost:8000/api/health
curl -sf "http://localhost:8000/api/report?year=2026&month=7" > /dev/null && echo "report OK"
curl -sf "http://localhost:8000/api/stats/monthly?year=2026&month=7" > /dev/null && echo "stats OK"
```
Expected: 테스트 전체 pass, `report OK`, `stats OK`

- [ ] **Step 2: 프론트 e2e**

브라우저 `http://localhost:5173/budget/`:
1. 하단 네비에 리포트 탭(📈) 존재, 클릭 → 그리드 전체 렌더
2. 월 이동(전월/다음월) 시 로딩 → 데이터 갱신
3. 총평 카드: (API 키 있으면) 생성 → 문구 표시 / (없으면) 실패 문구 + 재시도
4. 통계 → 드릴다운 3단 동작
5. 설정 → 리포트 탭 없음

- [ ] **Step 3: 마이그레이션 기존-DB 경로 확인** (운영 시뮬레이션)

```bash
# 로컬 DB는 이미 0002 상태에서 시작 → 재시작 시 0003만 적용되는지
docker compose restart api && sleep 6
docker compose logs api | grep -E 'upgrade|0003' | tail -3
docker compose exec postgres psql -U budget_book -d budget_db -c "SELECT version_num FROM alembic_version;"
```
Expected: `0003`

- [ ] **Step 4: 잔여 변경 커밋 + 사용자에게 push 여부 확인**

```bash
git status --short   # 남은 변경 없어야 함
git log --oneline -8
```
push는 CI → 운영 배포(마이그레이션 0003 자동 적용)를 유발하므로 **사용자 확인 후** 진행.
