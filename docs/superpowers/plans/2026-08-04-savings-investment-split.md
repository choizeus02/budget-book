# 저축·투자 지출 분리 + 리포트 지출 구성 카드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** "재테크 전환" 같은 저축·투자 이체를 지출 집계에서 분리해 별도 버킷으로 표시하고, 리포트의 고정비/변동비 카드를 인사이트가 담긴 3버킷 "지출 구성" 카드로 재설계한다.

**Architecture:** `categories.excluded_from_expense` 플래그(DB) + 공용 필터 모듈 `api/services/spending.py`가 유일한 진실 공급원. stats.py와 report.py의 모든 지출 집계에 이 필터를 적용하고, `total_invested`/`invested` 필드를 스키마 전반에 추가. 프론트는 통계 요약 4분할, 리포트 3분할 지출 구성 카드, 설정 토글.

**Tech Stack:** FastAPI + SQLAlchemy async + alembic / React + TypeScript + recharts / pytest

**Spec:** `docs/superpowers/specs/2026-08-04-savings-investment-split-design.md`

## Global Constraints

- 금액 컬럼은 전부 BigInteger (KRW 원 단위 정수). Float 금지. `SUM(bigint)`은 asyncpg에서 Decimal로 오므로 파이썬 연산 전 `float()` 변환 필수.
- expense는 DB에 음수 저장 — 집계 후 `abs()` 처리.
- **카테고리 문자열(`"저축·투자"`, `"자산"`, `"투자비 전환"`) 하드코딩은 마이그레이션 파일 안에서만 허용.** 런타임 코드는 반드시 `excluded_category_names(db)`로 DB에서 읽는다 (카테고리 rename이 거래에 연쇄 반영되는 구조이므로).
- `net = income − expense − invested` (모든 유출 후 남은 돈, 기존 net과 같은 숫자). `savings_rate = (income − expense) / income` (expense가 순수 소비만 남으므로 저축·투자가 저축률에 반영됨).
- 미분류 거래(`category IS NULL`)는 지출에 유지한다.
- API 테스트 실행: `cd api && uv run --with-requirements requirements.txt --with-requirements requirements-dev.txt pytest tests -q`
- 프론트 타입 체크: `cd frontend && npm run build`
- 커밋 메시지 끝: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## File Structure

| 파일 | 역할 |
|---|---|
| `api/alembic/versions/0004_excluded_from_expense.py` | 신규 — 스키마 + 데이터 마이그레이션 |
| `api/models.py` | Category에 플래그 컬럼 |
| `api/services/spending.py` | 신규 — 공용 지출/저축 필터 (유일한 진실 공급원) |
| `api/routers/stats.py` | 전 endpoint 필터 적용 + invested 필드 |
| `api/routers/report.py` | 전 섹션 필터 적용 + 3버킷 fixed_variable + LLM payload |
| `api/schemas.py` | MonthlySummary/YearlySummary/MonthlyEntry/CategoryGroup/CategoryUpdate |
| `api/schemas_report.py` | SummaryBlock/TrendMonth/ReportFixedVariable/FixedItemChange |
| `api/services/insights.py` | 신규 규칙 3종 |
| `api/routers/categories.py` | 플래그 노출/수정 |
| `api/tests/test_spending.py` | 신규 — 필터 단위 테스트 |
| `api/tests/test_insights.py` | 신규 규칙 테스트 추가 |
| `frontend/src/api/types.ts`, `client.ts` | 타입/클라이언트 갱신 |
| `frontend/src/pages/Stats.tsx` | 요약 4분할 |
| `frontend/src/components/report/CompositionCards.tsx` | "지출 구성" 카드 |
| `frontend/src/components/report/KpiRow.tsx` | 남은 돈 타일 |
| `frontend/src/components/report/ReportContent.tsx` | FixedVarCard에 income 전달 |
| `frontend/src/pages/Settings.tsx` | 카테고리 편집에 제외 토글 |

**스펙 대비 수정 1건:** 마이그레이션 대상 테이블에서 `budgets`는 제외한다. budgets는 대분류 단위(`category` 컬럼만 존재)라 `자산` 예산을 통째로 옮기면 대출상환 예산까지 딸려간다. `자산` 예산은 그대로 두는 것이 옳다.

---

### Task 1: Category 플래그 컬럼 + 데이터 마이그레이션

**Files:**
- Modify: `api/models.py:25-32` (Category 모델)
- Create: `api/alembic/versions/0004_excluded_from_expense.py`

**Interfaces:**
- Produces: `Category.excluded_from_expense: Mapped[bool]` — 이후 모든 태스크가 사용. DB에는 `저축·투자` 대분류(플래그 on) + `투자` 중분류가 존재하게 됨.

- [ ] **Step 1: models.py의 Category에 컬럼 추가**

`api/models.py`의 `Category` 클래스 (`sort_order` 줄 다음)에:

```python
class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    icon: Mapped[str] = mapped_column(String(10), nullable=False, default="📌")
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    excluded_from_expense: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
```

- [ ] **Step 2: 마이그레이션 파일 작성**

`api/alembic/versions/0004_excluded_from_expense.py` 전체 내용 (autogenerate 쓰지 말고 직접 작성 — 데이터 마이그레이션 포함이므로):

```python
"""카테고리 '지출 통계에서 제외' 플래그 + 저축·투자 카테고리 신설

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

# 데이터 이전 대상 (구 카테고리 → 신 카테고리). budgets는 대분류 단위 예산이므로 제외.
OLD_CAT, OLD_SUB = "자산", "투자비 전환"
NEW_CAT, NEW_SUB = "저축·투자", "투자"
TABLES_WITH_SUBCATEGORY = ("transactions", "subscriptions", "installments", "category_cache")


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column("excluded_from_expense", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    conn = op.get_bind()

    # 1. 저축·투자 대분류 (멱등: 있으면 플래그만 보장)
    parent = conn.execute(sa.text(
        "SELECT id FROM categories WHERE name = :n AND parent_id IS NULL"
    ), {"n": NEW_CAT}).first()
    if parent is None:
        max_order = conn.execute(sa.text(
            "SELECT COALESCE(MAX(sort_order), 0) FROM categories WHERE parent_id IS NULL"
        )).scalar()
        parent_id = conn.execute(sa.text(
            "INSERT INTO categories (name, icon, parent_id, sort_order, excluded_from_expense) "
            "VALUES (:n, '💰', NULL, :o, true) RETURNING id"
        ), {"n": NEW_CAT, "o": max_order + 1}).scalar()
    else:
        parent_id = parent[0]
        conn.execute(sa.text(
            "UPDATE categories SET excluded_from_expense = true WHERE id = :i"
        ), {"i": parent_id})

    # 2. 투자 중분류 (멱등)
    sub = conn.execute(sa.text(
        "SELECT id FROM categories WHERE name = :n AND parent_id = :p"
    ), {"n": NEW_SUB, "p": parent_id}).first()
    if sub is None:
        conn.execute(sa.text(
            "INSERT INTO categories (name, icon, parent_id, sort_order, excluded_from_expense) "
            "VALUES (:n, '💰', :p, 1, false)"
        ), {"n": NEW_SUB, "p": parent_id})

    # 3. 기존 자산/투자비 전환 데이터 이전 (해당 행이 없으면 no-op)
    for table in TABLES_WITH_SUBCATEGORY:
        conn.execute(sa.text(
            f"UPDATE {table} SET category = :nc, subcategory = :ns "
            f"WHERE category = :oc AND subcategory = :os"
        ), {"nc": NEW_CAT, "ns": NEW_SUB, "oc": OLD_CAT, "os": OLD_SUB})


def downgrade() -> None:
    conn = op.get_bind()
    for table in TABLES_WITH_SUBCATEGORY:
        conn.execute(sa.text(
            f"UPDATE {table} SET category = :oc, subcategory = :os "
            f"WHERE category = :nc AND subcategory = :ns"
        ), {"nc": NEW_CAT, "ns": NEW_SUB, "oc": OLD_CAT, "os": OLD_SUB})
    op.drop_column("categories", "excluded_from_expense")
```

- [ ] **Step 3: 로컬 postgres에 적용해서 검증**

```bash
docker compose up -d postgres
cd api && uv run --with-requirements requirements.txt alembic upgrade head
```

Expected: 에러 없이 `Running upgrade 0003 -> 0004` 출력. 이어서 확인:

```bash
cd api && uv run --with-requirements requirements.txt python -c "
import asyncio, asyncpg
async def main():
    conn = await asyncpg.connect(host='localhost', user='budget_book', password='local', database='budget_db')
    rows = await conn.fetch(\"SELECT name, parent_id, excluded_from_expense FROM categories WHERE name IN ('저축·투자','투자')\")
    print(rows)
    await conn.close()
asyncio.run(main())
"
```

Expected: `저축·투자` (parent_id NULL, excluded true), `투자` (parent_id 존재, excluded false) 2행.

- [ ] **Step 4: Commit**

```bash
git add api/models.py api/alembic/versions/0004_excluded_from_expense.py
git commit -m "feat: 카테고리 '지출 통계 제외' 플래그 + 저축·투자 카테고리 마이그레이션"
```

---

### Task 2: 공용 지출 필터 모듈 `spending.py`

**Files:**
- Create: `api/services/spending.py`
- Test: `api/tests/test_spending.py`

**Interfaces:**
- Consumes: Task 1의 `Category.excluded_from_expense`
- Produces (이후 모든 API 태스크가 사용):
  - `async def excluded_category_names(db: AsyncSession) -> list[str]`
  - `def not_excluded(excluded: list[str])` — 지출 집계 WHERE 조건 (미분류 유지)
  - `def only_excluded(excluded: list[str])` — 저축·투자 버킷 WHERE 조건

- [ ] **Step 1: 실패하는 테스트 작성** — `api/tests/test_spending.py`:

```python
from services.spending import not_excluded, only_excluded


def test_not_excluded_keeps_uncategorized():
    sql = str(not_excluded(["저축·투자"]))
    assert "transactions.category IS NULL" in sql
    assert "NOT IN" in sql


def test_only_excluded_matches_flagged():
    sql = str(only_excluded(["저축·투자"]))
    assert "transactions.category IN" in sql


def test_empty_excluded_list_is_passthrough():
    assert str(not_excluded([])) == "true"
    assert str(only_excluded([])) == "false"
```

- [ ] **Step 2: 실패 확인**

Run: `cd api && uv run --with-requirements requirements.txt --with-requirements requirements-dev.txt pytest tests/test_spending.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.spending'`

- [ ] **Step 3: 구현** — `api/services/spending.py` 전체:

```python
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd api && uv run --with-requirements requirements.txt --with-requirements requirements-dev.txt pytest tests/test_spending.py -q`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add api/services/spending.py api/tests/test_spending.py
git commit -m "feat: 지출 집계 공용 필터 모듈 (excluded_from_expense 기반)"
```

---

### Task 3: stats.py 전체 적용 + invested 필드

**Files:**
- Modify: `api/routers/stats.py` (모든 endpoint)
- Modify: `api/schemas.py:197-203` (MonthlySummary), `:249-261` (MonthlyEntry, YearlySummary)

**Interfaces:**
- Consumes: Task 2의 `excluded_category_names`, `not_excluded`, `only_excluded`
- Produces: `MonthlySummary.total_invested: float`, `YearlySummary.total_invested: float`, `MonthlyEntry.invested: float` — 프론트(Task 8)와 report `_ytd`가 사용. `yearly_stats`는 report.py가 import하므로 시그니처 유지.

- [ ] **Step 1: schemas.py 수정**

```python
class MonthlySummary(BaseModel):
    year: int
    month: int
    total_income: float
    total_expense: float
    total_invested: float
    net: float
```

```python
class MonthlyEntry(BaseModel):
    month: int
    income: float
    expense: float
    invested: float
```

```python
class YearlySummary(BaseModel):
    year: int
    total_income: float
    total_expense: float
    total_invested: float
    net: float
    savings_rate: Optional[float]
    months: list[MonthlyEntry]
```

- [ ] **Step 2: stats.py import 추가**

```python
from sqlalchemy import and_, case, extract, func, or_, select

from services.spending import excluded_category_names, not_excluded, only_excluded
```

- [ ] **Step 3: `monthly_summary` 재작성** (3버킷 case 집계):

```python
@router.get("/monthly", response_model=MonthlySummary)
async def monthly_summary(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    excluded = await excluded_category_names(db)
    bucket = case(
        (Transaction.type == TransactionType.income, "income"),
        (only_excluded(excluded), "invested"),
        else_="expense",
    ).label("bucket")
    stmt = (
        select(bucket, func.sum(Transaction.amount))
        .where(_month_filter(year, month))
        .group_by(bucket)
    )
    result = await db.execute(stmt)
    # SUM(bigint)은 Decimal로 반환되므로 float로 통일
    sums = {b: float(total or 0) for b, total in result.all()}

    income = sums.get("income", 0.0)
    expense = abs(sums.get("expense", 0.0))
    invested = abs(sums.get("invested", 0.0))

    return MonthlySummary(
        year=year,
        month=month,
        total_income=income,
        total_expense=expense,
        total_invested=invested,
        net=income - expense - invested,
    )
```

- [ ] **Step 4: 단순 지출 endpoint 5곳에 필터 추가**

`by_category`, `by_category_detail`, `daily_stats`, `top_transactions`, `day_of_week_stats` 각각: 함수 첫 줄에 `excluded = await excluded_category_names(db)` 추가하고, `.where(Transaction.type == TransactionType.expense)` 다음에 `.where(not_excluded(excluded))` 추가. 예 (`by_category`):

```python
    excluded = await excluded_category_names(db)
    stmt = (
        select(Transaction.category, func.sum(Transaction.amount), func.count(Transaction.id))
        .where(_month_filter(year, month))
        .where(Transaction.type == TransactionType.expense)
        .where(not_excluded(excluded))
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount))
    )
```

- [ ] **Step 5: `fixed_vs_variable`와 `uncategorized_stats`의 base_filter에 추가**

두 함수 모두:

```python
    excluded = await excluded_category_names(db)
    base_filter = [
        _month_filter(year, month),
        Transaction.type == TransactionType.expense,
        not_excluded(excluded),
    ]
```

(응답 스키마 `FixedVsVariable`, `UncategorizedStat`은 변경 없음.)

- [ ] **Step 6: `yearly_stats` 재작성**

```python
@router.get("/yearly", response_model=YearlySummary)
async def yearly_stats(
    year: int,
    db: AsyncSession = Depends(get_db),
):
    excluded = await excluded_category_names(db)
    bucket = case(
        (Transaction.type == TransactionType.income, "income"),
        (only_excluded(excluded), "invested"),
        else_="expense",
    ).label("bucket")
    stmt = (
        select(
            extract("month", Transaction.date).label("month"),
            bucket,
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.date >= datetime(year, 1, 1))
        .where(Transaction.date < datetime(year + 1, 1, 1))
        .group_by(extract("month", Transaction.date), bucket)
        .order_by(extract("month", Transaction.date))
    )
    result = await db.execute(stmt)
    rows = result.all()

    month_data: dict[int, dict] = {
        m: {"income": 0.0, "expense": 0.0, "invested": 0.0} for m in range(1, 13)
    }
    for row in rows:
        m = int(row.month)
        if row.bucket == "income":
            month_data[m]["income"] += float(row.total or 0)
        else:
            month_data[m][row.bucket] += abs(float(row.total or 0))

    total_income = sum(v["income"] for v in month_data.values())
    total_expense = sum(v["expense"] for v in month_data.values())
    total_invested = sum(v["invested"] for v in month_data.values())
    net = total_income - total_expense - total_invested
    savings_rate = round((total_income - total_expense) / total_income, 4) if total_income > 0 else None

    return YearlySummary(
        year=year,
        total_income=total_income,
        total_expense=total_expense,
        total_invested=total_invested,
        net=net,
        savings_rate=savings_rate,
        months=[
            MonthlyEntry(month=m, income=month_data[m]["income"],
                         expense=month_data[m]["expense"], invested=month_data[m]["invested"])
            for m in range(1, 13)
        ],
    )
```

- [ ] **Step 7: 전체 테스트 + import 확인**

Run: `cd api && uv run --with-requirements requirements.txt --with-requirements requirements-dev.txt pytest tests -q && uv run --with-requirements requirements.txt python -c "import routers.stats"`
Expected: 전부 passed, import 에러 없음

- [ ] **Step 8: Commit**

```bash
git add api/routers/stats.py api/schemas.py
git commit -m "feat: stats 전 endpoint에서 저축·투자 분리 (total_invested)"
```

---

### Task 4: report.py 전체 적용 + 3버킷 fixed_variable

**Files:**
- Modify: `api/routers/report.py` (전 섹션)
- Modify: `api/schemas_report.py` (SummaryBlock, TrendMonth, ReportFixedVariable, FixedItemChange 신설)

**Interfaces:**
- Consumes: Task 2 필터, Task 3의 `yearly_stats` (변경된 `_ytd` 자동 반영)
- Produces:
  - `SummaryBlock.invested: float` (ReportSummary/prev 모두)
  - `TrendMonth.invested: float`
  - `ReportFixedVariable`: `fixed_total, variable_total, invested_total, fixed_ratio, variable_ratio, invested_ratio, prev_fixed_total, variable_3mo_avg: Optional[float], fixed_changes: list[FixedItemChange], items`
  - `FixedItemChange`: `{name: str, diff: float}` (양수=증가)
  - `_month_sums`는 3-tuple `(income, expense, invested)` 반환
  - `_fixed_total(db, year, month, excluded)` — excluded 파라미터 추가
  - Task 5가 쓸 InsightInput 데이터: `invested`, `variable_total`, `variable_3mo_avg`, `fixed_changes`

- [ ] **Step 1: schemas_report.py 수정**

```python
class SummaryBlock(BaseModel):
    income: float
    expense: float
    invested: float
    net: float
    savings_rate: Optional[float]
```

```python
class TrendMonth(BaseModel):
    year: int
    month: int
    income: float
    expense: float
    invested: float
    net: float
    savings_rate: Optional[float]
```

`FixedItem` 아래에 추가:

```python
class FixedItemChange(BaseModel):
    name: str
    diff: float  # 양수 = 전월보다 증가


class ReportFixedVariable(BaseModel):
    fixed_total: float
    variable_total: float
    invested_total: float
    fixed_ratio: float
    variable_ratio: float
    invested_ratio: float
    prev_fixed_total: float
    variable_3mo_avg: Optional[float]   # 직전 3개월 변동비 평균. 데이터 없으면 None
    fixed_changes: list[FixedItemChange]
    items: list[FixedItem]
```

- [ ] **Step 2: report.py import 추가**

```python
from sqlalchemy import case, extract, func, or_, select

from schemas_report import (
    BreakdownRow, BreakdownSub, BudgetGauge, CategoryTrend, FixedItem,
    FixedItemChange, FrequentMerchant, Insight, MonthlyReviewResponse,
    ReportDaily, ReportDow, ReportFixedVariable, ReportPace, ReportResponse,
    ReportSummary, ReportWeek, SummaryBlock, TrendMonth,
)
from services.spending import excluded_category_names, not_excluded, only_excluded
```

- [ ] **Step 3: `_month_sums`를 3-tuple로 재작성**

```python
async def _month_sums(db: AsyncSession, year: int, month: int) -> tuple[float, float, float]:
    """(income, expense, invested) — expense/invested는 양수."""
    start, end = _month_bounds(year, month)
    excluded = await excluded_category_names(db)
    bucket = case(
        (Transaction.type == TransactionType.income, "income"),
        (only_excluded(excluded), "invested"),
        else_="expense",
    ).label("bucket")
    result = await db.execute(
        select(bucket, func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date < end)
        .group_by(bucket)
    )
    sums = {b: float(t or 0) for b, t in result.all()}
    return sums.get("income", 0.0), abs(sums.get("expense", 0.0)), abs(sums.get("invested", 0.0))
```

- [ ] **Step 4: `_day_totals`와 `_fixed_total` 수정**

`_day_totals`: 첫 줄에 `excluded = await excluded_category_names(db)`, WHERE에 `not_excluded(excluded)` 추가:

```python
async def _day_totals(db: AsyncSession, year: int, month: int) -> dict[int, float]:
    start, end = _month_bounds(year, month)
    excluded = await excluded_category_names(db)
    result = await db.execute(
        select(extract("day", Transaction.date).label("day"), func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense,
               not_excluded(excluded))
        .group_by(extract("day", Transaction.date))
    )
    return {int(d): abs(float(t or 0)) for d, t in result.all()}
```

`_fixed_total`: excluded 파라미터 추가 (호출부는 이후 Step에서 갱신):

```python
async def _fixed_total(db: AsyncSession, year: int, month: int, excluded: list[str]) -> float:
    start, end = _month_bounds(year, month)
    total = (await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.date >= start, Transaction.date < end,
            Transaction.type == TransactionType.expense,
            not_excluded(excluded),
            or_(Transaction.subscription_id.is_not(None), Transaction.installment_id.is_not(None)),
        )
    )).scalar()
    return abs(float(total or 0))
```

- [ ] **Step 5: `_summary` 수정**

```python
async def _summary(db: AsyncSession, year: int, month: int) -> ReportSummary:
    income, expense, invested = await _month_sums(db, year, month)
    py, pm = _prev_ym(year, month)
    p_income, p_expense, p_invested = await _month_sums(db, py, pm)
    return ReportSummary(
        income=income, expense=expense, invested=invested,
        net=income - expense - invested,
        savings_rate=_savings_rate(income, expense),
        prev=SummaryBlock(income=p_income, expense=p_expense, invested=p_invested,
                          net=p_income - p_expense - p_invested,
                          savings_rate=_savings_rate(p_income, p_expense)),
    )
```

- [ ] **Step 6: `_trends`를 3버킷으로 재작성**

```python
async def _trends(db: AsyncSession, year: int, month: int) -> list[TrendMonth]:
    sy, sm = _shift_ym(year, month, -11)
    start = _month_bounds(sy, sm)[0]
    end = _month_bounds(year, month)[1]
    excluded = await excluded_category_names(db)
    bucket = case(
        (Transaction.type == TransactionType.income, "income"),
        (only_excluded(excluded), "invested"),
        else_="expense",
    ).label("bucket")
    result = await db.execute(
        select(
            extract("year", Transaction.date).label("y"),
            extract("month", Transaction.date).label("m"),
            bucket,
            func.sum(Transaction.amount),
        )
        .where(Transaction.date >= start, Transaction.date < end)
        .group_by(extract("year", Transaction.date), extract("month", Transaction.date), bucket)
    )
    data: dict[tuple[int, int], dict] = defaultdict(lambda: {"income": 0.0, "expense": 0.0, "invested": 0.0})
    for y, m, b, total in result.all():
        key = (int(y), int(m))
        if b == "income":
            data[key]["income"] += float(total or 0)
        else:
            data[key][b] += abs(float(total or 0))
    out = []
    for i in range(-11, 1):
        y, m = _shift_ym(year, month, i)
        d = data.get((y, m), {"income": 0.0, "expense": 0.0, "invested": 0.0})
        out.append(TrendMonth(year=y, month=m, income=d["income"], expense=d["expense"],
                              invested=d["invested"],
                              net=d["income"] - d["expense"] - d["invested"],
                              savings_rate=_savings_rate(d["income"], d["expense"])))
    return out
```

- [ ] **Step 7: 단순 지출 섹션 5곳에 필터 추가**

`_category_trend`, `_breakdown`(현재월 쿼리와 전월 쿼리 둘 다), `_dow`, `_top`, `_frequent`, `_budgets` 각각: 함수 안에서 `excluded = await excluded_category_names(db)` 후 `Transaction.type == TransactionType.expense` 옆에 `not_excluded(excluded)` 추가. 예 (`_breakdown`의 두 쿼리):

```python
    excluded = await excluded_category_names(db)
    result = await db.execute(
        select(Transaction.category, Transaction.subcategory,
               func.sum(Transaction.amount), func.count(Transaction.id))
        .where(Transaction.date >= start, Transaction.date < end,
               Transaction.type == TransactionType.expense,
               not_excluded(excluded))
        .group_by(Transaction.category, Transaction.subcategory)
    )
```

(전월 `prev_result` 쿼리에도 동일하게 `not_excluded(excluded)` 추가 — excluded는 한 번만 조회해서 재사용.)

- [ ] **Step 8: `_fixed_variable`을 3버킷 + 변화 항목으로 재작성**

```python
async def _fixed_variable(db: AsyncSession, year: int, month: int) -> ReportFixedVariable:
    excluded = await excluded_category_names(db)
    _, expense, invested = await _month_sums(db, year, month)
    fixed = await _fixed_total(db, year, month, excluded)
    variable = max(expense - fixed, 0.0)
    grand = fixed + variable + invested

    py, pm = _prev_ym(year, month)
    prev_fixed = await _fixed_total(db, py, pm, excluded)

    # 직전 3개월 변동비 평균 (지출이 없는 달은 표본에서 제외)
    prev_vars = []
    for delta in (-3, -2, -1):
        yy, mm = _shift_ym(year, month, delta)
        _, e, _ = await _month_sums(db, yy, mm)
        if e > 0:
            f = await _fixed_total(db, yy, mm, excluded)
            prev_vars.append(max(e - f, 0.0))
    variable_3mo_avg = sum(prev_vars) / len(prev_vars) if prev_vars else None

    async def _items_for(y_: int, m_: int) -> dict[str, float]:
        s_, e_ = _month_bounds(y_, m_)
        out: dict[str, float] = {}
        sub_rows = await db.execute(
            select(Subscription.name, func.sum(Transaction.amount))
            .join(Subscription, Transaction.subscription_id == Subscription.id)
            .where(Transaction.date >= s_, Transaction.date < e_,
                   Transaction.type == TransactionType.expense,
                   not_excluded(excluded))
            .group_by(Subscription.name)
        )
        for n, t in sub_rows.all():
            out[f"subscription:{n}"] = abs(float(t or 0))
        inst_rows = await db.execute(
            select(Installment.name, func.sum(Transaction.amount))
            .join(Installment, Transaction.installment_id == Installment.id)
            .where(Transaction.date >= s_, Transaction.date < e_,
                   Transaction.type == TransactionType.expense,
                   not_excluded(excluded))
            .group_by(Installment.name)
        )
        for n, t in inst_rows.all():
            out[f"installment:{n}"] = abs(float(t or 0))
        return out

    cur_items = await _items_for(year, month)
    prev_items = await _items_for(py, pm)

    items = [FixedItem(name=k.split(":", 1)[1], amount=v, kind=k.split(":", 1)[0])
             for k, v in cur_items.items()]
    items.sort(key=lambda i: -i.amount)

    changes = [FixedItemChange(name=k.split(":", 1)[1], diff=cur_items.get(k, 0.0) - prev_items.get(k, 0.0))
               for k in set(cur_items) | set(prev_items)
               if abs(cur_items.get(k, 0.0) - prev_items.get(k, 0.0)) >= 1_000]
    changes.sort(key=lambda c: -abs(c.diff))

    return ReportFixedVariable(
        fixed_total=fixed, variable_total=variable, invested_total=invested,
        fixed_ratio=fixed / grand if grand > 0 else 0.0,
        variable_ratio=variable / grand if grand > 0 else 0.0,
        invested_ratio=invested / grand if grand > 0 else 0.0,
        prev_fixed_total=prev_fixed,
        variable_3mo_avg=variable_3mo_avg,
        fixed_changes=changes[:3],
        items=items,
    )
```

- [ ] **Step 9: `_insights` 내부 쿼리 + InsightInput 인자 수정**

`async with AsyncSessionLocal() as s:` 블록 첫 줄에 `excluded = await excluded_category_names(s)` 추가하고:
- `new_merchants` 쿼리 WHERE에 `not_excluded(excluded)` 추가
- `base` 리스트에 `not_excluded(excluded)` 추가
- `prev_fixed = await _fixed_total(s, py, pm, excluded)`
- `prev_spend_days` 쿼리 WHERE에 `not_excluded(excluded)` 추가

`InsightInput(...)` 생성부에 다음 인자 추가 (Task 5에서 필드 정의):

```python
        invested=summary.invested,
        variable_total=fixed_variable.variable_total if fixed_variable else 0.0,
        variable_3mo_avg=fixed_variable.variable_3mo_avg if fixed_variable else None,
        fixed_changes=[{"name": c.name, "diff": c.diff}
                       for c in (fixed_variable.fixed_changes if fixed_variable else [])],
```

**주의:** 이 Step 이후 Task 5가 완료될 때까지 `InsightInput`에 없는 필드를 넘기므로 report 모듈이 TypeError를 냅니다. Task 5와 같은 커밋 흐름 안에서 진행하고, 이 태스크의 검증(Step 11)은 Task 5 완료 후 실행해도 됩니다. (또는 Task 5를 먼저 해도 무방 — 두 태스크는 한 PR 단위.)

- [ ] **Step 10: `_format_review_payload`에 저축·투자 라인 추가**

```python
def _format_review_payload(r: ReportResponse) -> str:
    lines = [f"{r.year}년 {r.month}월 가계부"]
    s = r.summary
    lines.append(f"수입 {s.income:,.0f}원 / 지출 {s.expense:,.0f}원 / 저축·투자 {s.invested:,.0f}원 / 남은 돈 {s.net:,.0f}원"
                 + (f" (저축률 {s.savings_rate*100:.0f}%)" if s.savings_rate is not None else ""))
    lines.append(f"전월: 수입 {s.prev.income:,.0f}원 / 지출 {s.prev.expense:,.0f}원 / 저축·투자 {s.prev.invested:,.0f}원 / 남은 돈 {s.prev.net:,.0f}원")
```

고정비 라인도:

```python
    if r.fixed_variable:
        fv = r.fixed_variable
        lines.append(f"고정비 {fv.fixed_total:,.0f}원 / 변동비 {fv.variable_total:,.0f}원 / 저축·투자 {fv.invested_total:,.0f}원")
```

(나머지 라인은 그대로.)

- [ ] **Step 11: 검증 (Task 5 완료 후)**

Run: `cd api && uv run --with-requirements requirements.txt python -c "import routers.report" && uv run --with-requirements requirements.txt --with-requirements requirements-dev.txt pytest tests -q`
Expected: import 에러 없음, 전부 passed

- [ ] **Step 12: Commit**

```bash
git add api/routers/report.py api/schemas_report.py
git commit -m "feat: 리포트 전 섹션 저축·투자 분리 + 3버킷 지출 구성 데이터"
```

---

### Task 5: insights.py 신규 규칙 3종 (TDD)

**Files:**
- Modify: `api/services/insights.py`
- Test: `api/tests/test_insights.py`

**Interfaces:**
- Consumes: Task 4가 넘기는 `invested`, `variable_total`, `variable_3mo_avg`, `fixed_changes`
- Produces: `InsightInput`에 위 4개 필드 추가. 인사이트 타입 `variable_pace`, `invested` 신설, `fixed_change` 메시지에 주원인 항목 추가.

- [ ] **Step 1: test_insights.py 수정 — base_input에 신규 필드, 실패하는 테스트 추가**

`base_input`의 dict에 추가:

```python
        invested=0.0, variable_total=1_400_000, variable_3mo_avg=None,
        fixed_changes=[],
```

파일 끝에 테스트 추가:

```python
# --- 신규: 고정비 변화 주원인 / 변동비 페이스 / 저축·투자 ---

def test_fixed_change_includes_cause_item():
    d = base_input(fixed_total=150_000, prev_fixed_total=100_000,
                   fixed_changes=[{"name": "유튜브 프리미엄", "diff": 50_000}])
    msgs = [i["message"] for i in build_insights(d) if i["type"] == "fixed_change"]
    assert len(msgs) == 1
    assert "유튜브 프리미엄" in msgs[0]


def test_fixed_change_without_cause_still_works():
    d = base_input(fixed_total=150_000, prev_fixed_total=100_000, fixed_changes=[])
    assert "fixed_change" in types_of(build_insights(d))


def test_variable_pace_over_warns():
    # 7/15 → 진행률 15/31 ≈ 0.484, 기대치 = 1,000,000 × 0.484 ≈ 483,871
    d = base_input(variable_total=700_000, variable_3mo_avg=1_000_000)
    pace = [i for i in build_insights(d) if i["type"] == "variable_pace"]
    assert len(pace) == 1 and pace[0]["severity"] == "warn"


def test_variable_pace_under_is_good():
    d = base_input(variable_total=300_000, variable_3mo_avg=1_000_000)
    pace = [i for i in build_insights(d) if i["type"] == "variable_pace"]
    assert len(pace) == 1 and pace[0]["severity"] == "good"


def test_variable_pace_needs_history_and_progress():
    # 평균 없음 → 없음
    d = base_input(variable_total=700_000, variable_3mo_avg=None)
    assert "variable_pace" not in types_of(build_insights(d))
    # 월초(진행률 < 0.3) → 없음
    d = base_input(today=date(2026, 7, 3), variable_total=700_000, variable_3mo_avg=1_000_000)
    assert "variable_pace" not in types_of(build_insights(d))


def test_invested_ratio_message():
    d = base_input(invested=1_500_000, income=3_000_000)
    inv = [i for i in build_insights(d) if i["type"] == "invested"]
    assert len(inv) == 1 and inv[0]["severity"] == "good"
    assert "50%" in inv[0]["message"]


def test_no_invested_no_message():
    d = base_input(invested=0.0)
    assert "invested" not in types_of(build_insights(d))
```

- [ ] **Step 2: 실패 확인**

Run: `cd api && uv run --with-requirements requirements.txt --with-requirements requirements-dev.txt pytest tests/test_insights.py -q`
Expected: FAIL — `TypeError: InsightInput.__init__() got an unexpected keyword argument 'invested'`

- [ ] **Step 3: insights.py 구현**

상수 추가 (`UNCAT_MIN_COUNT` 아래):

```python
VARIABLE_PACE_PCT = 0.10       # 3개월 평균 페이스 대비 ±10% 이상
VARIABLE_MIN_PROGRESS = 0.3    # 월 진행률 30% 이후에만 (월초 노이즈 방지)
```

`InsightInput`에 필드 추가 (`savings_rates_12m` 아래):

```python
    invested: float          # 이번 달 저축·투자 이체액 (양수)
    variable_total: float
    variable_3mo_avg: float | None
    fixed_changes: list      # [{name, diff}] — |diff| 큰 순
```

기존 규칙 6(고정비 변화)을 주원인 포함으로 교체:

```python
    # 6. 고정비 변화 (주원인 항목 포함)
    fixed_diff = d.fixed_total - d.prev_fixed_total
    if abs(fixed_diff) >= FIXED_CHANGE_MIN:
        cause = ""
        if d.fixed_changes:
            top = d.fixed_changes[0]
            sign = "+" if top["diff"] > 0 else "−"
            cause = f" — 주원인: {top['name']} {sign}{_fmt(abs(top['diff']))}원"
        if fixed_diff > 0:
            add("fixed_change", "warn",
                f"고정비(구독·할부)가 전월보다 {_fmt(fixed_diff)}원 늘었어요{cause}")
        else:
            add("fixed_change", "good",
                f"고정비(구독·할부)가 전월보다 {_fmt(abs(fixed_diff))}원 줄었어요{cause}")
```

규칙 6 다음에 신규 규칙 2개 추가:

```python
    # 6-2. 변동비 페이스 (최근 3개월 평균을 월 진행률로 보정해서 비교)
    progress = month_progress(d.year, d.month, d.today)
    if d.variable_3mo_avg and d.variable_3mo_avg > 0 and progress >= VARIABLE_MIN_PROGRESS:
        expected = d.variable_3mo_avg * progress
        diff_ratio = (d.variable_total - expected) / expected
        if abs(diff_ratio) >= VARIABLE_PACE_PCT:
            pct = round(abs(diff_ratio) * 100)
            if diff_ratio > 0:
                add("variable_pace", "warn",
                    f"변동비가 최근 3개월 페이스보다 {pct}% 많아요 (기대 {_fmt(expected)}원 → 현재 {_fmt(d.variable_total)}원)")
            else:
                add("variable_pace", "good",
                    f"변동비가 최근 3개월 페이스보다 {pct}% 적어요 (기대 {_fmt(expected)}원 → 현재 {_fmt(d.variable_total)}원)")

    # 6-3. 저축·투자
    if d.income > 0 and d.invested > 0:
        add("invested", "good",
            f"수입의 {round(d.invested / d.income * 100)}%를 저축·투자로 옮겼어요 ({_fmt(d.invested)}원)")
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd api && uv run --with-requirements requirements.txt --with-requirements requirements-dev.txt pytest tests -q`
Expected: 전부 passed (Task 4 Step 11 검증도 이 시점에 함께 실행)

- [ ] **Step 5: Commit**

```bash
git add api/services/insights.py api/tests/test_insights.py
git commit -m "feat: 인사이트 규칙 추가 — 고정비 주원인, 변동비 페이스, 저축·투자율"
```

---

### Task 6: categories API에 플래그 노출

**Files:**
- Modify: `api/schemas.py:118-138` (CategoryGroup, CategoryUpdate)
- Modify: `api/routers/categories.py:12-31` (list), `:70-82` (update)

**Interfaces:**
- Consumes: Task 1의 컬럼
- Produces: `GET /categories` 응답에 `excluded_from_expense: bool`, `PATCH /categories/{id}` body에 `excluded_from_expense?: bool` — 프론트 Task 7/10이 사용

- [ ] **Step 1: schemas.py 수정**

```python
class CategoryGroup(BaseModel):
    id: int
    name: str
    icon: str
    excluded_from_expense: bool = False
    subcategories: list[SubcategoryItem]


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    excluded_from_expense: Optional[bool] = None
```

- [ ] **Step 2: categories.py 수정**

`list_categories`의 `CategoryGroup(...)` 생성부와 `create_category`의 대분류 반환부에 `excluded_from_expense=parent.excluded_from_expense` / `excluded_from_expense=cat.excluded_from_expense` 추가.

`update_category`의 `if body.icon is not None:` 다음에:

```python
    if body.excluded_from_expense is not None and cat.parent_id is None:
        cat.excluded_from_expense = body.excluded_from_expense
```

(중분류에는 플래그를 허용하지 않음 — 제외 판정이 대분류 이름 기준이므로.)

- [ ] **Step 3: 검증 + Commit**

Run: `cd api && uv run --with-requirements requirements.txt python -c "import routers.categories" && uv run --with-requirements requirements.txt --with-requirements requirements-dev.txt pytest tests -q`
Expected: 에러 없음, 전부 passed

```bash
git add api/schemas.py api/routers/categories.py
git commit -m "feat: 카테고리 API에 excluded_from_expense 노출"
```

---

### Task 7: 프론트 타입 + API 클라이언트

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts:113-114` (categories.update)

**Interfaces:**
- Consumes: Task 3/4/6 API 스키마
- Produces: Task 8/9/10이 쓰는 TS 타입. 필드명은 백엔드와 정확히 동일.

- [ ] **Step 1: types.ts 수정**

```ts
export interface MonthlySummary {
  year: number;
  month: number;
  total_income: number;
  total_expense: number;
  total_invested: number;
  net: number;
}
```

```ts
export interface CategoryGroup {
  id: number;
  name: string;
  icon: string;
  excluded_from_expense: boolean;
  subcategories: SubcategoryItem[];
}
```

```ts
export interface MonthlyEntry {
  month: number;
  income: number;
  expense: number;
  invested: number;
}

export interface YearlySummary {
  year: number;
  total_income: number;
  total_expense: number;
  total_invested: number;
  net: number;
  savings_rate: number | null;
  months: MonthlyEntry[];
}
```

```ts
export interface SummaryBlock {
  income: number; expense: number; invested: number; net: number; savings_rate: number | null;
}
```

```ts
export interface TrendMonth {
  year: number; month: number; income: number; expense: number; invested: number;
  net: number; savings_rate: number | null;
}
```

```ts
export interface FixedItemChange { name: string; diff: number; }
export interface ReportFixedVariable {
  fixed_total: number; variable_total: number; invested_total: number;
  fixed_ratio: number; variable_ratio: number; invested_ratio: number;
  prev_fixed_total: number; variable_3mo_avg: number | null;
  fixed_changes: FixedItemChange[];
  items: FixedItem[];
}
```

- [ ] **Step 2: client.ts categories.update 시그니처 확장**

```ts
    update: (id: number, body: { name?: string; icon?: string; excluded_from_expense?: boolean }) =>
      request<SubcategoryItem>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
```

- [ ] **Step 3: 빌드 확인 + Commit**

Run: `cd frontend && npm run build`
Expected: 타입 에러 없이 빌드 성공 (아직 UI 미사용이므로 통과해야 정상)

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts
git commit -m "feat: 프론트 타입 — total_invested / ReportFixedVariable 3버킷"
```

---

### Task 8: 통계 탭 요약 4분할

**Files:**
- Modify: `frontend/src/pages/Stats.tsx:101-119` (요약 카드)

**Interfaces:**
- Consumes: Task 7의 `MonthlySummary.total_invested`

- [ ] **Step 1: 요약 카드에 저축·투자 컬럼 추가**

기존 요약 div의 "수입"과 "순수익" 사이에:

```tsx
      {/* 요약 */}
      {summary && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4 flex justify-around mb-4">
          <div className="text-center">
            <p className="text-xs text-slate-400 mb-1">지출</p>
            <p className="text-red-400 tabular-nums font-light">{fmt(summary.total_expense)}원</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-400 mb-1">수입</p>
            <p className="text-emerald-400 tabular-nums font-light">{fmt(summary.total_income)}원</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-400 mb-1">저축·투자</p>
            <p className="text-indigo-400 tabular-nums font-light">{fmt(summary.total_invested)}원</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-slate-400 mb-1">순수익</p>
            <p className={`tabular-nums font-light ${summary.net >= 0 ? "text-white" : "text-red-400"}`}>
              {summary.net >= 0 ? "+" : ""}{fmt(summary.net)}원
            </p>
          </div>
        </div>
      )}
```

(도넛/카테고리 목록은 서버가 이미 제외한 데이터라 변경 없음.)

- [ ] **Step 2: 빌드 확인 + Commit**

Run: `cd frontend && npm run build`
Expected: 성공

```bash
git add frontend/src/pages/Stats.tsx
git commit -m "feat: 통계 요약에 저축·투자 표시"
```

---

### Task 9: 리포트 "지출 구성" 카드 + KPI 타일

**Files:**
- Modify: `frontend/src/components/report/CompositionCards.tsx:65-94` (FixedVarCard)
- Modify: `frontend/src/components/report/KpiRow.tsx:39-43` (순저축 타일)
- Modify: `frontend/src/components/report/ReportContent.tsx` (FixedVarCard 호출부)

**Interfaces:**
- Consumes: Task 7의 `ReportFixedVariable` 신형, `ReportSummary.invested`
- Produces: `FixedVarCard`의 props가 `{ fv, income }`으로 확장 — ReportContent 호출부 갱신 필수

- [ ] **Step 1: FixedVarCard를 "지출 구성" 카드로 재작성**

`CompositionCards.tsx`의 `FixedVarCard` 전체 교체 (import에 `signed`가 필요하면 `./shared`에서 추가):

```tsx
function BucketLine({ dotClass, label, value, note }: {
  dotClass: string; label: string; value: string; note: string | null;
}) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className={`w-2 h-2 rounded-full shrink-0 self-center ${dotClass}`} />
      <span className="text-slate-300 w-16 shrink-0">{label}</span>
      <span className="text-slate-200 tabular-nums">{value}</span>
      {note && <span className="text-xs text-slate-500 truncate">{note}</span>}
    </div>
  );
}

export function FixedVarCard({ fv, income }: { fv: ReportFixedVariable | null; income: number | null }) {
  if (!fv) return <Card title="지출 구성" span="lg:col-span-4"><Empty /></Card>;

  const fixedDiff = fv.fixed_total - fv.prev_fixed_total;
  const topChange = fv.fixed_changes[0];
  const fixedNote = Math.abs(fixedDiff) >= 1000
    ? `전월비 ${fixedDiff > 0 ? "+" : "−"}${fmt(Math.abs(fixedDiff))}원${topChange ? ` (${topChange.name})` : ""}`
    : "전월과 비슷";

  let variableNote: string | null = null;
  if (fv.variable_3mo_avg !== null && fv.variable_3mo_avg > 0) {
    const pct = Math.round(((fv.variable_total - fv.variable_3mo_avg) / fv.variable_3mo_avg) * 100);
    variableNote = `3개월 평균 ${fmt(fv.variable_3mo_avg)}원 대비 ${pct > 0 ? "+" : ""}${pct}%`;
  }

  const investedNote = income && income > 0 && fv.invested_total > 0
    ? `수입의 ${Math.round((fv.invested_total / income) * 100)}%`
    : null;

  return (
    <Card title="지출 구성" span="lg:col-span-4">
      <div className="flex flex-col gap-3">
        <div className="h-3 rounded-full overflow-hidden flex bg-slate-700">
          <div className="bg-indigo-500" style={{ width: `${fv.fixed_ratio * 100}%` }} />
          <div className="bg-pink-500" style={{ width: `${fv.variable_ratio * 100}%` }} />
          <div className="bg-emerald-500" style={{ width: `${fv.invested_ratio * 100}%` }} />
        </div>
        <div className="flex flex-col gap-1.5">
          <BucketLine dotClass="bg-indigo-500" label="고정비"
            value={`${fmt(fv.fixed_total)}원 (${Math.round(fv.fixed_ratio * 100)}%)`} note={fixedNote} />
          <BucketLine dotClass="bg-pink-500" label="변동비"
            value={`${fmt(fv.variable_total)}원 (${Math.round(fv.variable_ratio * 100)}%)`} note={variableNote} />
          <BucketLine dotClass="bg-emerald-500" label="저축·투자"
            value={`${fmt(fv.invested_total)}원 (${Math.round(fv.invested_ratio * 100)}%)`} note={investedNote} />
        </div>
        {fv.items.length > 0 && (
          <ul className="flex flex-col gap-1.5 mt-1 pt-2 border-t border-slate-700/50">
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
    </Card>
  );
}
```

- [ ] **Step 2: ReportContent.tsx 호출부에 income 전달**

`<FixedVarCard fv={report.fixed_variable} />` 형태의 호출을 찾아 (`report` 변수명은 실제 코드 기준으로 맞출 것):

```tsx
<FixedVarCard fv={report.fixed_variable} income={report.summary?.income ?? null} />
```

- [ ] **Step 3: KpiRow 순저축 타일 수정**

`KpiRow.tsx`의 순저축 Tile을:

```tsx
      <Tile label="남은 돈" value={`${signed(summary.net)}원`}
            color={summary.net >= 0 ? "text-white" : "text-red-400"}
            sub={<span className="text-xs text-slate-500">
              저축·투자 {fmt(summary.invested)}원{rate !== null ? ` · 저축률 ${Math.round(rate * 100)}%` : ""}
            </span>} />
```

- [ ] **Step 4: 빌드 확인 + Commit**

Run: `cd frontend && npm run build`
Expected: 성공

```bash
git add frontend/src/components/report/CompositionCards.tsx frontend/src/components/report/KpiRow.tsx frontend/src/components/report/ReportContent.tsx
git commit -m "feat: 리포트 지출 구성 카드 (고정/변동/저축·투자 + 인사이트 노트)"
```

---

### Task 10: 설정 > 카테고리 제외 토글

**Files:**
- Modify: `frontend/src/pages/Settings.tsx:126-243` (CategoriesSection)

**Interfaces:**
- Consumes: Task 6 PATCH API, Task 7 `CategoryGroup.excluded_from_expense`

- [ ] **Step 1: editForm에 excluded 추가 + 편집 UI에 체크박스**

`CategoriesSection`에서:

```tsx
  const [editForm, setEditForm] = useState({ name: "", icon: "", excluded: false });
```

수정 버튼의 onClick:

```tsx
              <button onClick={() => { setEditingId(cat.id); setEditForm({ name: cat.name, icon: cat.icon, excluded: cat.excluded_from_expense }); }}
                className="text-slate-500 text-xs active:text-indigo-400 px-2">수정</button>
```

`handleUpdateCategory`:

```tsx
  async function handleUpdateCategory(id: number) {
    await api.categories.update(id, {
      name: editForm.name, icon: editForm.icon, excluded_from_expense: editForm.excluded,
    });
    setEditingId(null);
    refresh();
  }
```

편집 모드 블록을 2행 구조로 교체 (기존 입력 행 아래에 체크박스 행):

```tsx
          {editingId === cat.id ? (
            <div className="px-4 py-3 flex flex-col gap-2">
              <div className="flex gap-2 items-center">
                <input value={editForm.icon} onChange={(e) => setEditForm((f) => ({ ...f, icon: e.target.value }))}
                  className="w-10 bg-slate-700 text-white text-center rounded-lg py-1.5 text-sm outline-none" />
                <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-1.5 text-sm outline-none" />
                <button onClick={() => handleUpdateCategory(cat.id)} className="text-indigo-400 text-sm">저장</button>
                <button onClick={() => setEditingId(null)} className="text-slate-500 text-sm">취소</button>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input type="checkbox" checked={editForm.excluded}
                  onChange={(e) => setEditForm((f) => ({ ...f, excluded: e.target.checked }))}
                  className="accent-indigo-500" />
                지출 통계에서 제외 (저축·투자처럼 소비가 아닌 이체)
              </label>
            </div>
          ) : (
```

일반 표시 행에는 배지 추가 (`cat.name` span 다음):

```tsx
              <span className="text-white text-sm font-medium flex-1">
                {cat.name}
                {cat.excluded_from_expense && (
                  <span className="ml-2 text-[10px] text-indigo-400 border border-indigo-500/40 rounded px-1 py-0.5">통계 제외</span>
                )}
              </span>
```

- [ ] **Step 2: 빌드 확인 + Commit**

Run: `cd frontend && npm run build`
Expected: 성공

```bash
git add frontend/src/pages/Settings.tsx
git commit -m "feat: 카테고리 설정에 '지출 통계에서 제외' 토글"
```

---

### Task 11: E2E 검증 (로컬 풀스택)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 테스트 재실행**

Run: `cd api && uv run --with-requirements requirements.txt --with-requirements requirements-dev.txt pytest tests -q && cd ../frontend && npm run build`
Expected: 전부 passed + 빌드 성공

- [ ] **Step 2: 로컬 스택 기동 + 시드**

```bash
docker compose up -d --build
sleep 10
# 수입 300만
curl -sS -X POST localhost:8000/api/transactions -H 'Content-Type: application/json' \
  -d '{"amount": 3000000, "description": "월급", "type": "income", "date": "2026-08-01T09:00:00"}'
# 소비 5만
TX1=$(curl -sS -X POST localhost:8000/api/transactions -H 'Content-Type: application/json' \
  -d '{"amount": 50000, "description": "장보기", "type": "expense", "date": "2026-08-02T12:00:00"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
# 저축·투자 150만 — 카테고리를 직접 지정
TX2=$(curl -sS -X POST localhost:8000/api/transactions -H 'Content-Type: application/json' \
  -d '{"amount": 1500000, "description": "재테크 전환", "type": "expense", "date": "2026-08-03T12:00:00"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
curl -sS -X PATCH localhost:8000/api/transactions/$TX2 -H 'Content-Type: application/json' \
  -d '{"category": "저축·투자", "subcategory": "투자", "category_confirmed": true}'
```

(API 포트가 compose에서 8000이 아니면 `docker compose ps`로 확인해서 맞출 것. LLM 백그라운드 분류가 TX1의 category를 채우기 전이어도 미분류는 지출에 유지되므로 아래 검증에 영향 없음.)

- [ ] **Step 3: 수치 검증**

```bash
curl -sS 'localhost:8000/api/stats/monthly?year=2026&month=8' | python3 -m json.tool
```

Expected: `total_expense == 50000.0`, `total_invested == 1500000.0`, `total_income == 3000000.0`, `net == 1450000.0`

```bash
curl -sS 'localhost:8000/api/stats/by-category?year=2026&month=8' | python3 -m json.tool
```

Expected: `저축·투자` 카테고리가 목록에 **없음**

```bash
curl -sS 'localhost:8000/api/report?year=2026&month=8' | python3 -c "
import json, sys
r = json.load(sys.stdin)
print('summary:', r['summary'])
print('fixed_variable:', r['fixed_variable'])
print('insights:', [i['message'] for i in (r['insights'] or [])])
"
```

Expected: `summary.invested == 1500000.0`, `fixed_variable.invested_total == 1500000.0`, ratio 합 ≈ 1.0, insights에 "수입의 50%를 저축·투자로 옮겼어요" 포함

```bash
curl -sS 'localhost:8000/api/stats/yearly?year=2026' | python3 -c "
import json, sys
r = json.load(sys.stdin)
print(r['total_expense'], r['total_invested'], r['savings_rate'])
"
```

Expected: `total_invested >= 1500000`, `savings_rate`가 (income−expense)/income 기준으로 계산됨

- [ ] **Step 4: 브라우저 확인 (선택)**

`cd frontend && npm run dev` 후 통계 탭(4분할 요약, 도넛에 저축·투자 없음), 설정 > 리포트(지출 구성 카드 3분할), 설정 > 카테고리(저축·투자에 "통계 제외" 배지, 편집 시 토글) 확인.

- [ ] **Step 5: 정리 + 최종 커밋**

```bash
docker compose down
git status   # 누락 파일 확인, 있으면 커밋
```

---

## 배포 후 확인 (운영)

- push 후 ArgoCD 롤아웃 → API 파드 시작 시 `alembic upgrade head`가 0004를 자동 적용 (기존 `자산/투자비 전환` 거래가 `저축·투자/투자`로 이전됨).
- 운영 확인 쿼리: `SELECT category, subcategory, count(*) FROM transactions WHERE category IN ('자산','저축·투자') GROUP BY 1,2;` — `자산/투자비 전환`이 0건이어야 함.
- 알려진 잔여 사항 (스펙 §5): 과거 월 LLM 총평 캐시는 옛 숫자 기준, 필요 시 리포트 탭에서 재생성.
