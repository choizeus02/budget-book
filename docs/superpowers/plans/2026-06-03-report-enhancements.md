# Report Enhancements 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 월간 리포트에 6개 섹션 추가 — 카테고리별 전월 대비, 월말 지출 예측, 주간 지출 분포, 연간 누적(YTD), 요일별 지출 패턴, 미분류 거래 비율

**Architecture:** 백엔드에 신규 3개 엔드포인트(`/stats/yearly`, `/stats/day-of-week`, `/stats/uncategorized`)를 `api/routers/stats.py`에 추가하고, 프론트엔드 `ReportSection.tsx`에 새 상태 4개와 6개 JSX 섹션을 순차적으로 추가한다. 주간 분포와 월말 예측은 기존 API 데이터로 프론트에서 계산한다.

**Tech Stack:** FastAPI + SQLAlchemy async (백엔드), React + TypeScript + recharts (프론트엔드)

---

## 파일 구성

| 동작 | 파일 |
|------|------|
| 수정 | `api/schemas.py` — MonthlyEntry, YearlySummary, DowStat, UncategorizedStat 추가 |
| 수정 | `api/routers/stats.py` — 3개 엔드포인트 + 스키마 임포트 추가 |
| 수정 | `frontend/src/api/types.ts` — 4개 인터페이스 추가 |
| 수정 | `frontend/src/api/client.ts` — stats에 3개 메서드 추가 |
| 수정 | `frontend/src/components/settings/ReportSection.tsx` — 상태 4개 + 섹션 6개 추가 |

---

## Task 1: 백엔드 스키마 추가

**Files:**
- Modify: `api/schemas.py`

- [ ] **Step 1: `api/schemas.py` 맨 끝에 추가**

```python
class MonthlyEntry(BaseModel):
    month: int
    income: float
    expense: float


class YearlySummary(BaseModel):
    year: int
    total_income: float
    total_expense: float
    net: float
    savings_rate: Optional[float]
    months: list[MonthlyEntry]


class DowStat(BaseModel):
    dow: int      # PostgreSQL DOW: 0=일, 1=월, ..., 6=토
    total: float
    count: int


class UncategorizedStat(BaseModel):
    total_count: int
    uncategorized_count: int
    ratio: float
```

- [ ] **Step 2: 커밋**

```bash
git add api/schemas.py
git commit -m "feat: add MonthlyEntry, YearlySummary, DowStat, UncategorizedStat schemas"
```

---

## Task 2: `/stats/yearly` 엔드포인트

**Files:**
- Modify: `api/routers/stats.py`

- [ ] **Step 1: schemas 임포트 교체**

기존:
```python
from schemas import (
    CategoryStat, CategoryStatDetail, DailyStat, FixedVsVariable,
    MonthlySummary, SubcategoryStat, TopTransaction,
)
```

교체:
```python
from schemas import (
    CategoryStat, CategoryStatDetail, DailyStat, DowStat, FixedVsVariable,
    MonthlyEntry, MonthlySummary, SubcategoryStat, TopTransaction,
    UncategorizedStat, YearlySummary,
)
```

- [ ] **Step 2: 기존 `/stats/fixed-vs-variable` 함수 바로 아래에 추가**

```python
@router.get("/yearly", response_model=YearlySummary)
async def yearly_stats(
    year: int,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            extract("month", Transaction.date).label("month"),
            Transaction.type,
            func.sum(Transaction.amount).label("total"),
        )
        .where(extract("year", Transaction.date) == year)
        .group_by(extract("month", Transaction.date), Transaction.type)
        .order_by(extract("month", Transaction.date))
    )
    result = await db.execute(stmt)
    rows = result.all()

    month_data: dict[int, dict] = {m: {"income": 0.0, "expense": 0.0} for m in range(1, 13)}
    for row in rows:
        m = int(row.month)
        if row.type == TransactionType.income:
            month_data[m]["income"] += row.total or 0.0
        else:
            month_data[m]["expense"] += abs(row.total or 0.0)

    total_income = sum(v["income"] for v in month_data.values())
    total_expense = sum(v["expense"] for v in month_data.values())
    net = total_income - total_expense
    savings_rate = round(net / total_income, 4) if total_income > 0 else None

    return YearlySummary(
        year=year,
        total_income=total_income,
        total_expense=total_expense,
        net=net,
        savings_rate=savings_rate,
        months=[
            MonthlyEntry(month=m, income=month_data[m]["income"], expense=month_data[m]["expense"])
            for m in range(1, 13)
        ],
    )
```

- [ ] **Step 3: 서버 기동 후 확인**

```bash
cd api && uvicorn main:app --reload
```

```bash
curl "http://localhost:8000/api/stats/yearly?year=2026"
# 예상: {"year":2026,"total_income":...,"months":[{"month":1,...},...]}  (12개 항목)
```

- [ ] **Step 4: 커밋**

```bash
git add api/routers/stats.py
git commit -m "feat: add /stats/yearly endpoint"
```

---

## Task 3: `/stats/day-of-week` 엔드포인트

**Files:**
- Modify: `api/routers/stats.py`

- [ ] **Step 1: `/stats/yearly` 바로 아래에 추가**

```python
@router.get("/day-of-week", response_model=list[DowStat])
async def day_of_week_stats(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(
            extract("dow", Transaction.date).label("dow"),
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .where(extract("year", Transaction.date) == year)
        .where(extract("month", Transaction.date) == month)
        .where(Transaction.type == TransactionType.expense)
        .group_by(extract("dow", Transaction.date))
        .order_by(extract("dow", Transaction.date))
    )
    result = await db.execute(stmt)
    return [
        DowStat(dow=int(row.dow), total=abs(row.total or 0.0), count=row.count)
        for row in result.all()
    ]
```

- [ ] **Step 2: 확인**

```bash
curl "http://localhost:8000/api/stats/day-of-week?year=2026&month=6"
# 예상: [{"dow":0,"total":...,"count":...}, ...] (거래 있는 요일만)
```

- [ ] **Step 3: 커밋**

```bash
git add api/routers/stats.py
git commit -m "feat: add /stats/day-of-week endpoint"
```

---

## Task 4: `/stats/uncategorized` 엔드포인트

**Files:**
- Modify: `api/routers/stats.py`

- [ ] **Step 1: `/stats/day-of-week` 바로 아래에 추가**

```python
@router.get("/uncategorized", response_model=UncategorizedStat)
async def uncategorized_stats(
    year: int,
    month: int,
    db: AsyncSession = Depends(get_db),
):
    base_filter = [
        extract("year", Transaction.date) == year,
        extract("month", Transaction.date) == month,
        Transaction.type == TransactionType.expense,
    ]
    total_stmt = select(func.count(Transaction.id)).where(*base_filter)
    uncat_stmt = select(func.count(Transaction.id)).where(
        *base_filter,
        Transaction.category.is_(None),
    )

    total_count = (await db.execute(total_stmt)).scalar() or 0
    uncategorized_count = (await db.execute(uncat_stmt)).scalar() or 0
    ratio = round(uncategorized_count / total_count, 4) if total_count > 0 else 0.0

    return UncategorizedStat(
        total_count=total_count,
        uncategorized_count=uncategorized_count,
        ratio=ratio,
    )
```

- [ ] **Step 2: 확인**

```bash
curl "http://localhost:8000/api/stats/uncategorized?year=2026&month=6"
# 예상: {"total_count":15,"uncategorized_count":3,"ratio":0.2}
```

- [ ] **Step 3: 커밋**

```bash
git add api/routers/stats.py
git commit -m "feat: add /stats/uncategorized endpoint"
```

---

## Task 5: 프론트엔드 타입 + API 클라이언트

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`

- [ ] **Step 1: `types.ts` 맨 끝에 추가**

```ts
export interface MonthlyEntry {
  month: number;
  income: number;
  expense: number;
}

export interface YearlySummary {
  year: number;
  total_income: number;
  total_expense: number;
  net: number;
  savings_rate: number | null;
  months: MonthlyEntry[];
}

export interface DowStat {
  dow: number;   // PostgreSQL DOW: 0=일, 1=월, ..., 6=토
  total: number;
  count: number;
}

export interface UncategorizedStat {
  total_count: number;
  uncategorized_count: number;
  ratio: number;
}
```

- [ ] **Step 2: `client.ts` 상단 임포트 교체**

```ts
import type {
  Account,
  Budget,
  CategoryGroup,
  CategoryStat,
  CategoryStatDetail,
  DailyStat,
  DowStat,
  FixedVsVariable,
  Installment,
  MonthlyEntry,
  MonthlySummary,
  SubcategoryItem,
  Subscription,
  TopTransaction,
  Transaction,
  UncategorizedStat,
  YearlySummary,
} from "./types";
```

- [ ] **Step 3: `client.ts`의 `stats` 객체에 3개 메서드 추가**

기존 `fixedVsVariable` 메서드 뒤에 추가:

```ts
  yearly: (year: number) =>
    request<YearlySummary>(`/stats/yearly?year=${year}`),
  dayOfWeek: (year: number, month: number) =>
    request<DowStat[]>(`/stats/day-of-week?year=${year}&month=${month}`),
  uncategorized: (year: number, month: number) =>
    request<UncategorizedStat>(`/stats/uncategorized?year=${year}&month=${month}`),
```

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts
git commit -m "feat: add YearlySummary, DowStat, UncategorizedStat types and client methods"
```

---

## Task 6: ReportSection 데이터 레이어 확장

**Files:**
- Modify: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: import에 `MonthlyEntry` 타입 추가**

기존 타입 임포트를 교체한다:

```tsx
import type {
  CategoryStatDetail,
  DailyStat,
  DowStat,
  FixedVsVariable,
  MonthlySummary,
  TopTransaction,
  UncategorizedStat,
  YearlySummary,
} from "../../api/types";
```

(Note: `MonthlyEntry`는 `YearlySummary.months` 안에 포함되어 있으므로 별도 임포트 불필요)

- [ ] **Step 2: 컴포넌트 안 상태 4개 추가**

기존 `const [topTx, ...]` 바로 아래에 추가:

```tsx
  const [prevCategories, setPrevCategories] = useState<CategoryStatDetail[]>([]);
  const [yearlySummary, setYearlySummary] = useState<YearlySummary | null>(null);
  const [dowStats, setDowStats] = useState<DowStat[]>([]);
  const [uncategorized, setUncategorized] = useState<UncategorizedStat | null>(null);
```

- [ ] **Step 3: Promise.all 10개로 확장**

기존 6개짜리 `Promise.all` 블록 전체를 교체:

```tsx
    Promise.all([
      api.stats.monthly(year, month),
      api.stats.monthly(prevYear, prevMonth),
      api.stats.daily(year, month),
      api.stats.byCategoryDetail(year, month),
      api.stats.fixedVsVariable(year, month),
      api.stats.topTransactions(year, month, 5),
      api.stats.byCategoryDetail(prevYear, prevMonth),
      api.stats.yearly(year),
      api.stats.dayOfWeek(year, month),
      api.stats.uncategorized(year, month),
    ]).then(([s, ps, d, c, fv, t, pc, ys, dow, uc]) => {
      setSummary(s);
      setPrevSummary(ps);
      setDaily(d);
      setCategories(c);
      setFixedVar(fv);
      setTopTx(t);
      setPrevCategories(pc);
      setYearlySummary(ys);
      setDowStats(dow);
      setUncategorized(uc);
    }).catch(() => {
      setSummary({ year, month, total_income: 0, total_expense: 0, net: 0 });
      setDaily([]);
      setCategories([]);
      setTopTx([]);
      setPrevCategories([]);
      setYearlySummary(null);
      setDowStats([]);
      setUncategorized(null);
    });
```

- [ ] **Step 4: 기존 JSX 맨 끝 닫는 `</div>` 바로 전에 임시 placeholder 추가**

현재 파일 끝에서 `</div>` `</div>` 바로 위, 섹션 12 이전 위치에 추가 (sectoin 12 JSX는 다음 태스크에서 추가):

```tsx
      {/* 섹션 7-12: Task 7-12에서 추가 */}
      {prevCategories && yearlySummary && dowStats && uncategorized && null}
```

- [ ] **Step 5: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
# 예상: ✓ built in ...ms
```

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/components/settings/ReportSection.tsx
git commit -m "feat: expand ReportSection data layer for 6 new sections"
```

---

## Task 7: 섹션 7 — 카테고리별 전월 대비

**Files:**
- Modify: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: placeholder 교체**

`{/* 섹션 7-12: Task 7-12에서 추가 */}` 줄과 그 아래 `{prevCategories && ...}` 줄을 교체:

```tsx
      {/* 섹션 7: 카테고리별 전월 대비 */}
      {categories.length > 0 && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">카테고리별 전월 대비</p>
          <div className="flex flex-col gap-2">
            {categories.map((cat) => {
              const prev = prevCategories.find((c) => c.category === cat.category);
              const diff = prev && prev.total > 0
                ? ((cat.total - prev.total) / prev.total) * 100
                : null;
              const isGood = diff === null || diff === 0 ? null : diff < 0;
              const color = isGood === null ? "text-slate-500"
                : isGood ? "text-emerald-400" : "text-red-400";
              return (
                <div key={cat.category} className="flex items-center justify-between">
                  <span className="text-slate-300 text-xs">{iconOf(cat.category)} {cat.category}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-xs tabular-nums">{fmt(cat.total)}원</span>
                    <span className={`text-xs tabular-nums font-medium w-16 text-right ${color}`}>
                      {diff === null ? "--" : `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(1)}%`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 섹션 8-12: Task 8-12에서 추가 */}
      {yearlySummary && dowStats && uncategorized && null}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/settings/ReportSection.tsx
git commit -m "feat: add category month-over-month section to report"
```

---

## Task 8: 섹션 8 — 월말 지출 예측

**Files:**
- Modify: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: placeholder 교체**

`{/* 섹션 8-12 */}` 줄과 그 아래 줄을 교체:

```tsx
      {/* 섹션 8: 월말 지출 예측 (현재 달만 표시) */}
      {(() => {
        const today = new Date();
        const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;
        if (!isCurrentMonth || !summary || summary.total_expense === 0) return null;
        const todayDay = today.getDate();
        const projected = (summary.total_expense / todayDay) * daysInMonth;
        const totalBudget = categories.reduce((s, c) => s + (c.budget ?? 0), 0);
        const overBudget = totalBudget > 0 && projected > totalBudget;
        return (
          <div className="mx-4 rounded-2xl bg-slate-800 p-4">
            <p className="text-slate-500 text-xs mb-3">월말 지출 예측</p>
            <div className="flex items-end gap-1 mb-1">
              <p className={`text-xl font-semibold tabular-nums ${overBudget ? "text-red-400" : "text-white"}`}>
                {fmt(projected)}원
              </p>
              <p className="text-slate-500 text-xs mb-0.5">예상</p>
            </div>
            <p className="text-slate-500 text-xs">
              {todayDay}일 기준 일평균 {fmt(summary.total_expense / todayDay)}원
              {totalBudget > 0 && (
                <span className={overBudget ? " text-red-400" : " text-emerald-400"}>
                  {" · "}예산 {fmt(totalBudget)}원 {overBudget ? "초과 예상" : "이내 예상"}
                </span>
              )}
            </p>
          </div>
        );
      })()}

      {/* 섹션 9-12: Task 9-12에서 추가 */}
      {yearlySummary && dowStats && uncategorized && null}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/settings/ReportSection.tsx
git commit -m "feat: add end-of-month expense projection section to report"
```

---

## Task 9: 섹션 9 — 주간 지출 분포

**Files:**
- Modify: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: placeholder 교체**

`{/* 섹션 9-12 */}` 줄과 그 아래 줄을 교체:

```tsx
      {/* 섹션 9: 주간 지출 분포 */}
      {daily.length > 0 && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">주간 지출 분포</p>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart
              data={[
                { week: '1주', total: daily.filter(d => d.day <= 7).reduce((s, d) => s + d.total, 0) },
                { week: '2주', total: daily.filter(d => d.day > 7 && d.day <= 14).reduce((s, d) => s + d.total, 0) },
                { week: '3주', total: daily.filter(d => d.day > 14 && d.day <= 21).reduce((s, d) => s + d.total, 0) },
                { week: '4주', total: daily.filter(d => d.day > 21).reduce((s, d) => s + d.total, 0) },
              ]}
              barCategoryGap="30%"
            >
              <XAxis dataKey="week" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v) => [`${fmt(Number(v))}원`, "지출"]}
                contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
                cursor={{ fill: "#334155" }}
              />
              <Bar dataKey="total" fill="#6366f1" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 섹션 10-12: Task 10-12에서 추가 */}
      {yearlySummary && dowStats && uncategorized && null}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/settings/ReportSection.tsx
git commit -m "feat: add weekly expense distribution section to report"
```

---

## Task 10: 섹션 10 — 연간 누적 (YTD)

**Files:**
- Modify: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: recharts 임포트에 `Cell` 추가**

기존:
```tsx
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
```

교체:
```tsx
import { BarChart, Bar, Cell, XAxis, Tooltip, ResponsiveContainer } from "recharts";
```

- [ ] **Step 2: placeholder 교체**

`{/* 섹션 10-12 */}` 줄과 그 아래 줄을 교체:

```tsx
      {/* 섹션 10: 연간 누적 (YTD) */}
      {yearlySummary && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">{year}년 누적</p>
          <div className="flex justify-around mb-4">
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">수입</p>
              <p className="text-emerald-400 tabular-nums font-light text-sm">{fmt(yearlySummary.total_income)}원</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">지출</p>
              <p className="text-red-400 tabular-nums font-light text-sm">{fmt(yearlySummary.total_expense)}원</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400 mb-1">저축률</p>
              <p className="text-indigo-400 tabular-nums font-light text-sm">
                {yearlySummary.savings_rate !== null
                  ? `${(yearlySummary.savings_rate * 100).toFixed(1)}%`
                  : "--"}
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={60}>
            <BarChart data={yearlySummary.months} barCategoryGap="15%">
              <XAxis
                dataKey="month"
                tick={{ fill: "#475569", fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}월`}
              />
              <Tooltip
                formatter={(v) => [`${fmt(Number(v))}원`, "지출"]}
                contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
                cursor={{ fill: "#334155" }}
              />
              <Bar dataKey="expense" radius={[2, 2, 0, 0]}>
                {yearlySummary.months.map((entry) => (
                  <Cell
                    key={entry.month}
                    fill={entry.month === month ? "#6366f1" : "#6366f133"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 섹션 11-12: Task 11-12에서 추가 */}
      {dowStats && uncategorized && null}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/components/settings/ReportSection.tsx
git commit -m "feat: add yearly accumulated (YTD) section to report"
```

---

## Task 11: 섹션 11 — 요일별 지출 패턴

**Files:**
- Modify: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: placeholder 교체**

`{/* 섹션 11-12 */}` 줄과 그 아래 줄을 교체:

```tsx
      {/* 섹션 11: 요일별 지출 패턴 */}
      {dowStats.length > 0 && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">요일별 지출 패턴</p>
          {(() => {
            const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
            const dowMap = new Map(dowStats.map((d) => [d.dow, d.total]));
            // 월~일 순서: PG DOW [1,2,3,4,5,6,0]
            const chartData = [1, 2, 3, 4, 5, 6, 0].map((d) => ({
              name: DOW_LABELS[d],
              total: dowMap.get(d) ?? 0,
            }));
            const maxTotal = Math.max(...chartData.map((d) => d.total));
            return (
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={chartData} barCategoryGap="20%">
                  <XAxis dataKey="name" tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v) => [`${fmt(Number(v))}원`, "지출"]}
                    contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, color: "#fff", fontSize: 12 }}
                    cursor={{ fill: "#334155" }}
                  />
                  <Bar dataKey="total" radius={[2, 2, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={entry.total === maxTotal && maxTotal > 0 ? "#6366f1" : "#6366f133"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            );
          })()}
        </div>
      )}

      {/* 섹션 12: Task 12에서 추가 */}
      {uncategorized && null}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/settings/ReportSection.tsx
git commit -m "feat: add day-of-week expense pattern section to report"
```

---

## Task 12: 섹션 12 — 미분류 거래 비율

**Files:**
- Modify: `frontend/src/components/settings/ReportSection.tsx`

- [ ] **Step 1: placeholder 교체**

`{/* 섹션 12 */}` 줄과 `{uncategorized && null}` 줄을 교체:

```tsx
      {/* 섹션 12: 미분류 거래 비율 */}
      {uncategorized && uncategorized.total_count > 0 && (
        <div className="mx-4 rounded-2xl bg-slate-800 p-4">
          <p className="text-slate-500 text-xs mb-3">미분류 거래</p>
          {uncategorized.uncategorized_count === 0 ? (
            <p className="text-emerald-400 text-sm">모든 거래가 분류됨 ✓</p>
          ) : (
            <>
              <div className="flex justify-between items-center mb-2">
                <span className="text-white text-sm tabular-nums">
                  {uncategorized.uncategorized_count}건 미분류
                </span>
                <span className="text-slate-400 text-xs tabular-nums">
                  {uncategorized.total_count}건 중 {(uncategorized.ratio * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${uncategorized.ratio > 0.2 ? "bg-amber-400" : "bg-indigo-500"}`}
                  style={{ width: `${uncategorized.ratio * 100}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/components/settings/ReportSection.tsx
git commit -m "feat: add uncategorized transactions section to report"
```

- [ ] **Step 4: push**

```bash
git push origin main
```
