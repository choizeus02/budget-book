# Monthly Report 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 설정 페이지에 "리포트" 탭을 추가하고, 6개 섹션(요약·전월비교·일별추이·예산달성률·고정vs변동·TOP5)으로 구성된 월간 리포트를 구현한다.

**Architecture:** 백엔드에 신규 3개 엔드포인트(`/stats/daily`, `/stats/top-transactions`, `/stats/fixed-vs-variable`)를 `api/routers/stats.py`에 추가하고, 프론트엔드는 `ReportSection.tsx` 신규 컴포넌트를 만들어 `Settings.tsx`에 탭으로 연결한다. 데이터는 `useEffect` 안에서 `Promise.all` 6개 병렬 호출로 패치한다.

**Tech Stack:** FastAPI + SQLAlchemy async (백엔드), React + TypeScript + recharts (프론트엔드), PostgreSQL

---

## 파일 구성

| 동작 | 파일 |
|------|------|
| 수정 | `api/schemas.py` — DailyStat, TopTransaction, FixedVsVariable 스키마 추가 |
| 수정 | `api/routers/stats.py` — 3개 엔드포인트 추가 |
| 수정 | `frontend/src/api/types.ts` — 3개 인터페이스 추가 |
| 수정 | `frontend/src/api/client.ts` — stats에 3개 메서드 추가 |
| **생성** | `frontend/src/components/settings/ReportSection.tsx` — 리포트 탭 전체 |
| 수정 | `frontend/src/pages/Settings.tsx` — report 탭 추가 |

---

## Task 1: 백엔드 스키마 추가

**Files:**
- Modify: `api/schemas.py`

- [ ] **Step 1: schemas.py 끝에 3개 클래스 추가**

`api/schemas.py` 파일 맨 아래에 다음을 추가한다:

```python
class DailyStat(BaseModel):
    day: int
    total: float


class TopTransaction(BaseModel):
    id: int
    description: str
    amount: float
    category: Optional[str]
    subcategory: Optional[str]
    date: datetime


class FixedVsVariable(BaseModel):
    fixed_total: float
    variable_total: float
    fixed_ratio: float
    variable_ratio: float
```

- [ ] **Step 2: 임포트 확인**

`schemas.py` 상단에 이미 `from datetime import datetime`과 `from typing import Optional`이 있는지 확인한다. 있으면 그대로 둔다.

- [ ] **Step 3: 커밋**

```bash
git add api/schemas.py
git commit -m "feat: add DailyStat, TopTransaction, FixedVsVariable schemas"
```

---

## Task 2: `/stats/daily` 엔드포인트

**Files:**
- Modify: `api/routers/stats.py`

- [ ] **Step 1: 임포트에 `or_` 추가 확인**

`stats.py` 상단의 `from sqlalchemy import ...` 줄에 `or_`가 없으면 추가한다 (Task 4에서 사용).

```python
from sqlalchemy import extract, func, or_, select
```

- [ ] **Step 2: schemas 임포트에 신규 3개 추가**

```python
from schemas import (
    CategoryStat, CategoryStatDetail, DailyStat, FixedVsVariable,
    MonthlySummary, SubcategoryStat, TopTransaction,
)
```

- [ ] **Step 3: `by_category_detail` 함수 바로 아래에 추가**

```python
@router.get("/daily", response_model=list[DailyStat])
async def daily_stats(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            extract("day", Transaction.date).label("day"),
            func.sum(Transaction.amount).label("total"),
        )
        .where(extract("year", Transaction.date) == year)
        .where(extract("month", Transaction.date) == month)
        .where(Transaction.type == TransactionType.expense)
        .group_by(extract("day", Transaction.date))
        .order_by(extract("day", Transaction.date))
    )
    result = await db.execute(stmt)
    return [
        DailyStat(day=int(row.day), total=abs(row.total or 0.0))
        for row in result.all()
    ]
```

- [ ] **Step 4: API 서버를 기동하고 동작 확인**

```bash
# postgres가 떠 있는 상태에서
cd api && uvicorn main:app --reload
```

```bash
curl "http://localhost:8000/api/stats/daily?year=2026&month=6"
# 예상: [{"day":1,"total":50000.0}, ...] 또는 []
```

- [ ] **Step 5: 커밋**

```bash
git add api/routers/stats.py
git commit -m "feat: add /stats/daily endpoint"
```

---

## Task 3: `/stats/top-transactions` 엔드포인트

**Files:**
- Modify: `api/routers/stats.py`

- [ ] **Step 1: `/stats/daily` 바로 아래에 추가**

```python
@router.get("/top-transactions", response_model=list[TopTransaction])
async def top_transactions(
    year: int,
    month: int,
    limit: int = 5,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Transaction)
        .where(extract("year", Transaction.date) == year)
        .where(extract("month", Transaction.date) == month)
        .where(Transaction.type == TransactionType.expense)
        .order_by(Transaction.amount)  # 음수이므로 ASC = 지출 큰 순
        .limit(limit)
    )
    result = await db.execute(stmt)
    txs = result.scalars().all()
    return [
        TopTransaction(
            id=tx.id,
            description=tx.description,
            amount=abs(tx.amount),
            category=tx.category,
            subcategory=tx.subcategory,
            date=tx.date,
        )
        for tx in txs
    ]
```

- [ ] **Step 2: 동작 확인**

```bash
curl "http://localhost:8000/api/stats/top-transactions?year=2026&month=6&limit=5"
# 예상: [{"id":1,"description":"...","amount":50000.0,"category":"식비",...}, ...]
```

- [ ] **Step 3: 커밋**

```bash
git add api/routers/stats.py
git commit -m "feat: add /stats/top-transactions endpoint"
```

---

## Task 4: `/stats/fixed-vs-variable` 엔드포인트

**Files:**
- Modify: `api/routers/stats.py`

- [ ] **Step 1: `/stats/top-transactions` 바로 아래에 추가**

```python
@router.get("/fixed-vs-variable", response_model=FixedVsVariable)
async def fixed_vs_variable(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    base_filter = [
        extract("year", Transaction.date) == year,
        extract("month", Transaction.date) == month,
        Transaction.type == TransactionType.expense,
    ]

    fixed_stmt = select(func.sum(Transaction.amount)).where(
        *base_filter,
        or_(
            Transaction.subscription_id.is_not(None),
            Transaction.installment_id.is_not(None),
        ),
    )
    variable_stmt = select(func.sum(Transaction.amount)).where(
        *base_filter,
        Transaction.subscription_id.is_(None),
        Transaction.installment_id.is_(None),
    )

    fixed_total = abs((await db.execute(fixed_stmt)).scalar() or 0.0)
    variable_total = abs((await db.execute(variable_stmt)).scalar() or 0.0)
    grand_total = fixed_total + variable_total

    if grand_total == 0:
        return FixedVsVariable(
            fixed_total=0.0, variable_total=0.0,
            fixed_ratio=0.0, variable_ratio=0.0,
        )

    return FixedVsVariable(
        fixed_total=fixed_total,
        variable_total=variable_total,
        fixed_ratio=round(fixed_total / grand_total, 4),
        variable_ratio=round(variable_total / grand_total, 4),
    )
```

- [ ] **Step 2: 동작 확인**

```bash
curl "http://localhost:8000/api/stats/fixed-vs-variable?year=2026&month=6"
# 예상: {"fixed_total":680000.0,"variable_total":2150000.0,"fixed_ratio":0.2404,"variable_ratio":0.7596}
```

- [ ] **Step 3: 커밋**

```bash
git add api/routers/stats.py
git commit -m "feat: add /stats/fixed-vs-variable endpoint"
```

---

## Task 5: 프론트엔드 타입 + API 클라이언트

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: `types.ts` 맨 끝에 3개 인터페이스 추가**

```ts
export interface DailyStat {
  day: number;
  total: number;
}

export interface TopTransaction {
  id: number;
  description: string;
  amount: number;
  category: string | null;
  subcategory: string | null;
  date: string;
}

export interface FixedVsVariable {
  fixed_total: number;
  variable_total: number;
  fixed_ratio: number;
  variable_ratio: number;
}
```

- [ ] **Step 2: `client.ts` 상단 import에 신규 타입 3개 추가**

기존 임포트 블록을 다음으로 교체한다:

```ts
import type {
  Account,
  Budget,
  CategoryGroup,
  CategoryStat,
  CategoryStatDetail,
  DailyStat,
  FixedVsVariable,
  Installment,
  MonthlySummary,
  SubcategoryItem,
  Subscription,
  TopTransaction,
  Transaction,
} from "./types";
```

- [ ] **Step 3: `client.ts`의 `stats` 객체에 메서드 3개 추가**

기존 `stats` 객체를 다음으로 교체한다:

```ts
stats: {
  monthly: (year: number, month: number) =>
    request<MonthlySummary>(`/stats/monthly?year=${year}&month=${month}`),
  byCategory: (year: number, month: number) =>
    request<CategoryStat[]>(`/stats/by-category?year=${year}&month=${month}`),
  byCategoryDetail: (year: number, month: number) =>
    request<CategoryStatDetail[]>(`/stats/by-category-detail?year=${year}&month=${month}`),
  daily: (year: number, month: number) =>
    request<DailyStat[]>(`/stats/daily?year=${year}&month=${month}`),
  topTransactions: (year: number, month: number, limit = 5) =>
    request<TopTransaction[]>(`/stats/top-transactions?year=${year}&month=${month}&limit=${limit}`),
  fixedVsVariable: (year: number, month: number) =>
    request<FixedVsVariable>(`/stats/fixed-vs-variable?year=${year}&month=${month}`),
},
```

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts
git commit -m "feat: add DailyStat, TopTransaction, FixedVsVariable types and api client methods"
```

---

## Task 6: ReportSection 스켈레톤 — 월 네비 + 데이터 패칭

**Files:**
- Create: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: 디렉토리 생성**

```bash
mkdir -p frontend/src/components/settings
```

- [ ] **Step 2: 파일 전체 내용 작성**

`frontend/src/components/settings/ReportSection.tsx` 를 다음 내용으로 생성한다:

```tsx
import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../../api/client";
import type {
  CategoryStatDetail,
  DailyStat,
  FixedVsVariable,
  MonthlySummary,
  TopTransaction,
} from "../../api/types";
import { useCategories } from "../../contexts/CategoriesContext";

function fmt(n: number) {
  return Math.abs(n).toLocaleString("ko-KR");
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export default function ReportSection() {
  const { iconOf } = useCategories();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<MonthlySummary | null>(null);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [categories, setCategories] = useState<CategoryStatDetail[]>([]);
  const [fixedVar, setFixedVar] = useState<FixedVsVariable | null>(null);
  const [topTx, setTopTx] = useState<TopTransaction[]>([]);

  useEffect(() => {
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;

    Promise.all([
      api.stats.monthly(year, month),
      api.stats.monthly(prevYear, prevMonth),
      api.stats.daily(year, month),
      api.stats.byCategoryDetail(year, month),
      api.stats.fixedVsVariable(year, month),
      api.stats.topTransactions(year, month, 5),
    ]).then(([s, ps, d, c, fv, t]) => {
      setSummary(s);
      setPrevSummary(ps);
      setDaily(d);
      setCategories(c);
      setFixedVar(fv);
      setTopTx(t);
    });
  }, [year, month]);

  function prevMonth() {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  }

  // 저축률 계산
  const savingsRate = summary && summary.total_income > 0
    ? ((summary.total_income - summary.total_expense) / summary.total_income) * 100
    : null;

  // 전월 대비 변화율
  const expenseDiff = summary && prevSummary && prevSummary.total_expense > 0
    ? ((summary.total_expense - prevSummary.total_expense) / prevSummary.total_expense) * 100
    : null;
  const incomeDiff = summary && prevSummary && prevSummary.total_income > 0
    ? ((summary.total_income - prevSummary.total_income) / prevSummary.total_income) * 100
    : null;
  const prevSavingsRate = prevSummary && prevSummary.total_income > 0
    ? ((prevSummary.total_income - prevSummary.total_expense) / prevSummary.total_income) * 100
    : null;
  const savingsDiff = savingsRate !== null && prevSavingsRate !== null
    ? savingsRate - prevSavingsRate
    : null;

  // 일별 바 차트 데이터 — 없는 날은 0
  const daysInMonth = new Date(year, month, 0).getDate();
  const dailyMap = new Map(daily.map((d) => [d.day, d.total]));
  const dailyChartData = Array.from({ length: daysInMonth }, (_, i) => ({
    day: i + 1,
    total: dailyMap.get(i + 1) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-3 pb-4">
      {/* 월 네비게이션 */}
      <div className="flex items-center gap-4 px-5">
        <button onClick={prevMonth} className="text-slate-400 text-xl px-2">‹</button>
        <span className="text-white font-medium">{year}년 {month}월</span>
        <button onClick={nextMonth} className="text-slate-400 text-xl px-2">›</button>
      </div>

      {/* 섹션들은 다음 태스크에서 추가 */}
      {!summary && (
        <p className="text-slate-500 text-sm text-center py-8">로딩 중...</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Settings.tsx에 임시로 탭 연결해서 렌더 확인**

`frontend/src/pages/Settings.tsx`에 다음 변경을 적용한다:

```ts
// 상단에 import 추가
import ReportSection from "../components/settings/ReportSection";

// TAB_LABELS 교체
const TAB_LABELS = { assets: "자산", budget: "예산", categories: "카테고리", report: "리포트" } as const;
type Tab = keyof typeof TAB_LABELS;

// 렌더링 블록 끝에 추가
{tab === "report" && <ReportSection />}
```

- [ ] **Step 4: 개발 서버 기동 후 브라우저에서 확인**

```bash
cd frontend && npm run dev
```

브라우저에서 설정 탭 → "리포트" 탭 클릭 → 월 네비게이션이 보이고 콘솔 에러 없으면 OK.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/settings/ReportSection.tsx frontend/src/pages/Settings.tsx
git commit -m "feat: add ReportSection skeleton and wire report tab in Settings"
```

---

## Task 7: 섹션 1 (이달 요약) + 섹션 2 (전월 대비)

**Files:**
- Modify: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: 로딩 placeholder를 섹션 1 카드로 교체**

`ReportSection.tsx`의 `{!summary && ...}` 블록을 다음으로 교체한다:

```tsx
      {/* 섹션 1: 이달 요약 */}
      {summary && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">이달 요약</p>
          <div className="flex justify-around">
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">수입</p>
              <p className="text-emerald-400 tabular-nums font-light text-sm">{fmt(summary.total_income)}원</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">지출</p>
              <p className="text-red-400 tabular-nums font-light text-sm">{fmt(summary.total_expense)}원</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">저축률</p>
              <p className="text-indigo-400 tabular-nums font-light text-sm">
                {savingsRate !== null ? `${savingsRate.toFixed(1)}%` : "--"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 섹션 2: 전월 대비 */}
      {summary && prevSummary && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">전월 대비</p>
          <div className="flex gap-2">
            {[
              { label: "지출", diff: expenseDiff, invert: true },
              { label: "수입", diff: incomeDiff, invert: false },
              { label: "저축률", diff: savingsDiff, invert: false, unit: "p" },
            ].map(({ label, diff, invert, unit = "" }) => {
              const isGood = diff === null ? null : invert ? diff < 0 : diff > 0;
              const color = diff === null ? "text-slate-500"
                : isGood ? "text-emerald-400" : "text-red-400";
              return (
                <div key={label} className="flex-1 bg-slate-900 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">{label}</p>
                  <p className={`text-sm font-semibold tabular-nums ${color}`}>
                    {diff === null ? "--" : `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(1)}%${unit}`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 2: 브라우저에서 확인**

설정 → 리포트 탭에서 "이달 요약"과 "전월 대비" 카드가 보이는지 확인한다. 데이터가 없으면 `--`가 표시되어야 한다.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/settings/ReportSection.tsx
git commit -m "feat: add summary and month-over-month sections to report"
```

---

## Task 8: 섹션 3 — 일별 지출 추이 (BarChart)

**Files:**
- Modify: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: 전월 대비 카드 바로 아래에 추가**

```tsx
      {/* 섹션 3: 일별 지출 추이 */}
      <div className="mx-4 rounded-2xl bg-slate-800 p-4">
        <p className="text-slate-500 text-xs mb-3">일별 지출 추이</p>
        {daily.length === 0 ? (
          <p className="text-slate-600 text-xs text-center py-4">데이터 없음</p>
        ) : (
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={dailyChartData} barCategoryGap="20%">
              <XAxis
                dataKey="day"
                tick={{ fill: "#475569", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                ticks={[1, Math.ceil(daysInMonth / 2), daysInMonth]}
              />
              <Tooltip
                formatter={(v) => [`${fmt(Number(v))}원`, "지출"]}
                contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
                cursor={{ fill: "#334155" }}
              />
              <Bar dataKey="total" fill="#6366f1" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
```

- [ ] **Step 2: 브라우저에서 확인**

바 차트가 렌더링되고, 바 위에 마우스 올리면 금액 툴팁이 표시되는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/settings/ReportSection.tsx
git commit -m "feat: add daily expense trend bar chart to report"
```

---

## Task 9: 섹션 4 — 예산 달성률

**Files:**
- Modify: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: 일별 차트 카드 아래에 추가**

```tsx
      {/* 섹션 4: 예산 달성률 */}
      {categories.length > 0 && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">예산 달성률</p>
          <div className="flex flex-col gap-3">
            {categories.map((cat) => {
              const pct = cat.budget ? (cat.total / cat.budget) * 100 : null;
              const over = pct !== null && pct > 100;
              return (
                <div key={cat.category}>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300 text-xs">
                      {iconOf(cat.category)} {cat.category}
                    </span>
                    {pct !== null ? (
                      <span className={`text-xs tabular-nums ${over ? "text-red-400" : "text-slate-400"}`}>
                        {fmt(cat.total)}원 / {fmt(cat.budget!)}원 ({pct.toFixed(0)}%)
                      </span>
                    ) : (
                      <span className="text-slate-600 text-xs">{fmt(cat.total)}원 · 예산 없음</span>
                    )}
                  </div>
                  {pct !== null && (
                    <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${over ? "bg-red-400" : "bg-indigo-500"}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
```

- [ ] **Step 2: 브라우저에서 확인**

카테고리별 게이지 바가 보이고, 예산 초과 시 빨간색으로 표시되는지 확인한다.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/settings/ReportSection.tsx
git commit -m "feat: add budget achievement section to report"
```

---

## Task 10: 섹션 5 (고정비 vs 변동비) + 섹션 6 (TOP 5)

**Files:**
- Modify: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: 예산 달성률 카드 아래에 섹션 5 추가**

```tsx
      {/* 섹션 5: 고정비 vs 변동비 */}
      {fixedVar && (fixedVar.fixed_total + fixedVar.variable_total) > 0 && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">고정비 vs 변동비</p>
          <div className="flex gap-2 mb-3">
            <div className="flex-1 bg-slate-900 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">고정비</p>
              <p className="text-amber-400 text-sm font-semibold tabular-nums">{fmt(fixedVar.fixed_total)}원</p>
              <p className="text-slate-600 text-xs">{(fixedVar.fixed_ratio * 100).toFixed(1)}%</p>
            </div>
            <div className="flex-1 bg-slate-900 rounded-xl p-3 text-center">
              <p className="text-xs text-slate-500 mb-1">변동비</p>
              <p className="text-indigo-400 text-sm font-semibold tabular-nums">{fmt(fixedVar.variable_total)}원</p>
              <p className="text-slate-600 text-xs">{(fixedVar.variable_ratio * 100).toFixed(1)}%</p>
            </div>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden">
            <div
              className="bg-amber-400"
              style={{ width: `${fixedVar.fixed_ratio * 100}%` }}
            />
            <div className="flex-1 bg-indigo-500" />
          </div>
        </div>
      )}
```

- [ ] **Step 2: 섹션 5 바로 아래에 섹션 6 추가**

```tsx
      {/* 섹션 6: TOP 5 지출 */}
      {topTx.length > 0 && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">TOP {topTx.length} 지출</p>
          <div className="flex flex-col">
            {topTx.map((tx, i) => (
              <div key={tx.id}>
                {i > 0 && <div className="h-px bg-slate-700 my-2" />}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm">{tx.description || "(메모 없음)"}</p>
                    <p className="text-slate-500 text-xs">
                      {tx.category ? `${iconOf(tx.category)} ${tx.category}` : "미분류"}
                      {tx.subcategory ? ` · ${tx.subcategory}` : ""}
                    </p>
                  </div>
                  <p className="text-red-400 text-sm font-semibold tabular-nums ml-3">
                    {fmt(tx.amount)}원
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Step 3: 브라우저에서 전체 리포트 확인**

6개 섹션이 모두 렌더링되는지, 월 네비게이션으로 이전 달로 이동 시 데이터가 갱신되는지 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/settings/ReportSection.tsx
git commit -m "feat: add fixed-vs-variable and top expenses sections to report"
```

---

## Task 11: 최종 정리 + 태그 추가 여부 확인

**Files:**
- Check: `frontend/src/pages/Settings.tsx`
- Check: `.gitignore`

- [ ] **Step 1: Settings.tsx 탭 바 렌더 확인**

현재 탭 바는 `flex` 기반으로 `flex-1`이 4개. 모바일(390px)에서 "카테고리" + "리포트"가 잘리지 않는지 브라우저 DevTools에서 iPhone 시뮬레이션으로 확인한다.

- [ ] **Step 2: `.gitignore`에 `.superpowers/` 추가**

```bash
grep -q '.superpowers' .gitignore || echo '.superpowers/' >> .gitignore
```

- [ ] **Step 3: 최종 커밋**

```bash
git add .gitignore
git commit -m "chore: ignore .superpowers brainstorm artifacts"
```

- [ ] **Step 4: 전체 동작 최종 확인**

`docker compose up` 으로 전체 스택 기동 후:
1. 설정 → 리포트 탭 클릭
2. 6개 섹션 렌더 확인
3. 이전 달/다음 달 네비게이션 동작 확인
4. 데이터 없는 달 이동 시 "데이터 없음" 표시 확인
5. 예산 초과 카테고리 있으면 빨간색 게이지 확인
