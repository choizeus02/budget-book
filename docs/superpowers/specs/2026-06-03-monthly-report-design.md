# 월간 리포트 기능 설계

**날짜:** 2026-06-03  
**위치:** 설정 페이지 → "리포트" 탭 (자산/예산/카테고리 탭 우측에 추가)

---

## 개요

설정 페이지 내부 탭에 "리포트"를 추가한다. 월 네비게이션으로 원하는 달을 선택하면 6개 섹션이 순서대로 렌더링된다. 기존 Stats 페이지와 달리 "한 달을 어떻게 썼나" 요약/진단에 집중한다.

---

## 섹션 구성 (순서 고정)

| # | 섹션 | 데이터 출처 |
|---|------|------------|
| 1 | 이달 요약 (수입/지출/저축률) | 기존 `/stats/monthly` |
| 2 | 전월 대비 (지출·수입·저축률 변화) | 기존 `/stats/monthly` × 2 |
| 3 | 일별 지출 추이 (바 차트) | **신규** `/stats/daily` |
| 4 | 예산 달성률 (카테고리별 게이지) | 기존 `/stats/by-category-detail` |
| 5 | 고정비 vs 변동비 (비율 바) | **신규** `/stats/fixed-vs-variable` |
| 6 | TOP 5 지출 내역 | **신규** `/stats/top-transactions` |

---

## 백엔드

### 신규 엔드포인트 3개 (`api/routers/stats.py` 추가)

#### `GET /stats/daily`
```
Query: year: int, month: int
Response: list[DailyStat]
  DailyStat { day: int, total: float }  // total은 abs(지출합계), 수입 제외
```
- `SELECT DAY(date), SUM(amount) ... WHERE type=expense GROUP BY DAY(date)`
- 거래 없는 날은 응답에서 생략. 프론트에서 `1~말일` 배열을 만들어 응답 데이터를 merge해 0으로 채운 뒤 BarChart에 전달.

#### `GET /stats/top-transactions`
```
Query: year: int, month: int, limit: int = 5
Response: list[TopTransaction]
  TopTransaction { id: int, description: str, amount: float, category: str | None, subcategory: str | None, date: datetime }
```
- `WHERE type=expense ORDER BY amount ASC LIMIT limit`  (amount는 음수이므로 ASC = 큰 지출 먼저)

#### `GET /stats/fixed-vs-variable`
```
Query: year: int, month: int
Response: FixedVsVariable
  FixedVsVariable { fixed_total: float, variable_total: float, fixed_ratio: float, variable_ratio: float }
```
- 고정비: `subscription_id IS NOT NULL OR installment_id IS NOT NULL` 인 expense 거래 합계
- 변동비: 나머지 expense 합계
- `*_ratio`는 전체 지출 대비 비율 (0.0~1.0)

### 신규 스키마 (`api/schemas.py` 추가)
```python
class DailyStat(BaseModel):
    day: int
    total: float

class TopTransaction(BaseModel):
    id: int
    description: str
    amount: float
    category: str | None
    subcategory: str | None
    date: datetime

class FixedVsVariable(BaseModel):
    fixed_total: float
    variable_total: float
    fixed_ratio: float
    variable_ratio: float
```

---

## 프론트엔드

### 파일 구성

```
frontend/src/
  pages/Settings.tsx              # TAB_LABELS에 report:"리포트" 추가, ReportSection import
  components/settings/
    ReportSection.tsx             # 신규 — 리포트 탭 전체 컴포넌트
```

Settings.tsx가 이미 350줄이므로 ReportSection은 별도 파일로 분리한다.

### Settings.tsx 변경

```ts
// TAB_LABELS 변경
const TAB_LABELS = { assets: "자산", budget: "예산", categories: "카테고리", report: "리포트" } as const;
type Tab = keyof typeof TAB_LABELS;

// 렌더링 추가
{tab === "report" && <ReportSection />}
```

### ReportSection.tsx 구조

```
ReportSection
  ├─ 월 네비게이션 (← 년월 →)
  ├─ SummaryCard       섹션 1: 수입/지출/저축률
  ├─ MoMCard           섹션 2: 전월 대비 3개 지표
  ├─ DailyTrendCard    섹션 3: recharts BarChart
  ├─ BudgetCard        섹션 4: 카테고리별 예산 게이지 (기존 Stats 로직 재활용)
  ├─ FixedVsVarCard    섹션 5: 고정/변동 비율 바
  └─ TopExpensesCard   섹션 6: TOP 5 거래 목록
```

데이터 패칭: `useEffect([year, month])` 안에서 `Promise.all` 6개 병렬 호출.

```ts
const [prevYear, prevMonth] = month === 1 ? [year - 1, 12] : [year, month - 1];

Promise.all([
  api.stats.monthly(year, month),
  api.stats.monthly(prevYear, prevMonth),
  api.stats.daily(year, month),
  api.stats.byCategoryDetail(year, month),
  api.stats.fixedVsVariable(year, month),
  api.stats.topTransactions(year, month, 5),
])
```

### 신규 타입 추가 (`api/types.ts`)

```ts
export interface DailyStat { day: number; total: number; }
export interface TopTransaction {
  id: number; description: string; amount: number;
  category: string | null; subcategory: string | null; date: string;
}
export interface FixedVsVariable {
  fixed_total: number; variable_total: number;
  fixed_ratio: number; variable_ratio: number;
}
```

### API client 추가 (`api/client.ts`)

```ts
stats: {
  // 기존 유지
  monthly, byCategory, byCategoryDetail,
  // 신규
  daily: (year, month) => request<DailyStat[]>(`/stats/daily?year=${year}&month=${month}`),
  topTransactions: (year, month, limit = 5) =>
    request<TopTransaction[]>(`/stats/top-transactions?year=${year}&month=${month}&limit=${limit}`),
  fixedVsVariable: (year, month) =>
    request<FixedVsVariable>(`/stats/fixed-vs-variable?year=${year}&month=${month}`),
}
```

### 차트 라이브러리

기존 `recharts` (Stats.tsx에서 이미 사용 중) 그대로 활용.  
일별 추이: `BarChart` + `Bar` + `ResponsiveContainer`.

---

## 저축률 계산

```
savings_rate = (total_income - total_expense) / total_income * 100
```
수입이 0이면 `--` 표시 (나누기 0 방지).

---

## 전월 대비 계산

```
expense_diff_pct = (this_expense - prev_expense) / prev_expense * 100
```
전월 데이터가 없으면 해당 카드에 "데이터 없음" 표시.

---

## 엣지 케이스

| 상황 | 처리 |
|------|------|
| 해당 월 거래 없음 | 각 섹션에 "데이터 없음" 텍스트 표시, 빈 차트 렌더 안 함 |
| 수입 = 0 | 저축률 `--` 표시 |
| 전월 지출 = 0 | 전월 대비 `--` 표시 |
| 예산 미설정 카테고리 | 예산 섹션에서 게이지 숨기고 "예산 없음" 표시 |
| 고정비 = 0 | 비율 바에서 변동비 100% 표시 |
