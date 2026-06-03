# 월간 리포트 확장 설계

**날짜:** 2026-06-03  
**위치:** 기존 `frontend/src/components/settings/ReportSection.tsx`에 6개 섹션 추가

---

## 개요

기존 6개 섹션에 더해 새로운 6개 섹션을 추가한다. 총 12개 섹션 순서는 아래와 같다.

| # | 섹션 | 상태 |
|---|------|------|
| 1 | 이달 요약 | 기존 |
| 2 | 전월 대비 | 기존 |
| 3 | 일별 지출 추이 | 기존 |
| 4 | 예산 달성률 | 기존 |
| 5 | 고정비 vs 변동비 | 기존 |
| 6 | TOP 5 지출 | 기존 |
| 7 | 카테고리별 전월 대비 | **신규** |
| 8 | 월말 지출 예측 | **신규** |
| 9 | 주간 지출 분포 | **신규** |
| 10 | 연간 누적 (YTD) | **신규** |
| 11 | 요일별 지출 패턴 | **신규** |
| 12 | 미분류 거래 비율 | **신규** |

---

## 백엔드

### 신규 엔드포인트 3개 (`api/routers/stats.py`)

#### `GET /stats/yearly`
```
Query: year: int
Response: YearlySummary
  YearlySummary {
    year: int,
    total_income: float,
    total_expense: float,
    net: float,
    savings_rate: float | None,   # net/income, None if income=0
    months: list[MonthlyEntry]    # 1~12월 각각의 요약 (거래 없는 달 포함, total=0)
  }
  MonthlyEntry { month: int, income: float, expense: float }
```
- `SELECT MONTH(date), type, SUM(amount)` GROUP BY month, type WHERE year=?
- 거래 없는 달은 income=0, expense=0으로 채워서 12개 항목 반환

#### `GET /stats/day-of-week`
```
Query: year: int, month: int
Response: list[DowStat]
  DowStat { dow: int, total: float, count: int }
  # dow: 0=월, 1=화, ..., 6=일 (Python weekday() 기준)
```
- `SELECT EXTRACT(DOW FROM date), SUM(amount), COUNT(*)` WHERE type=expense
- PostgreSQL DOW: 0=일~6=토 → 프론트에서 한국식(월~일)으로 매핑
- 거래 없는 요일은 응답에서 생략 (프론트에서 0으로 채움)

#### `GET /stats/uncategorized`
```
Query: year: int, month: int
Response: UncategorizedStat
  UncategorizedStat {
    total_count: int,
    uncategorized_count: int,
    ratio: float   # 0.0~1.0
  }
```
- `SELECT COUNT(*) WHERE type=expense` (전체)
- `SELECT COUNT(*) WHERE type=expense AND category IS NULL` (미분류)
- ratio = uncategorized_count / total_count (total=0이면 0.0)

### 신규 스키마 (`api/schemas.py`)

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
    savings_rate: float | None
    months: list[MonthlyEntry]

class DowStat(BaseModel):
    dow: int     # 0~6 (PostgreSQL: 0=일, 1=월, ..., 6=토)
    total: float
    count: int

class UncategorizedStat(BaseModel):
    total_count: int
    uncategorized_count: int
    ratio: float
```

---

## 프론트엔드

### 새 타입 (`api/types.ts`)

```ts
export interface MonthlyEntry { month: number; income: number; expense: number; }
export interface YearlySummary {
  year: number; total_income: number; total_expense: number;
  net: number; savings_rate: number | null; months: MonthlyEntry[];
}
export interface DowStat { dow: number; total: number; count: number; }
export interface UncategorizedStat {
  total_count: number; uncategorized_count: number; ratio: number;
}
```

### 새 API 클라이언트 메서드 (`api/client.ts`)

```ts
yearly: (year: number) =>
  request<YearlySummary>(`/stats/yearly?year=${year}`),
dayOfWeek: (year: number, month: number) =>
  request<DowStat[]>(`/stats/day-of-week?year=${year}&month=${month}`),
uncategorized: (year: number, month: number) =>
  request<UncategorizedStat>(`/stats/uncategorized?year=${year}&month=${month}`),
```

### ReportSection.tsx 변경

기존 `Promise.all` 6개에 4개 추가 (총 10개):

```ts
Promise.all([
  // 기존 6개
  api.stats.monthly(year, month),
  api.stats.monthly(prevYear, prevMonth),
  api.stats.daily(year, month),
  api.stats.byCategoryDetail(year, month),
  api.stats.fixedVsVariable(year, month),
  api.stats.topTransactions(year, month, 5),
  // 신규 3개
  api.stats.byCategoryDetail(prevYear, prevMonth),   // 카테고리별 전월 대비용
  api.stats.yearly(year),                             // YTD용
  api.stats.dayOfWeek(year, month),                   // 요일별 패턴용
  api.stats.uncategorized(year, month),               // 미분류 비율용
])
```

---

## 섹션별 상세 설계

### 섹션 7: 카테고리별 전월 대비

- **데이터:** `categories`(이번달) + `prevCategories`(저번달) — 둘 다 `CategoryStatDetail[]`
- **표시:** 카테고리 목록, 각 행에 `이번달 금액 / 전월 금액 / 변화율(▲▼%)`
- **엣지케이스:** 저번달에 없던 카테고리 → 변화율 `--` 표시

### 섹션 8: 월말 지출 예측

- **데이터:** `summary.total_expense` + 오늘 날짜 (프론트 계산)
- **계산:** `일평균 = total_expense / 오늘날짜`, `예상월말 = 일평균 × 말일`
- **표시:** "현재 페이스라면 이번 달 X원 지출 예상" + 예산 총합 대비 초과 여부
- **엣지케이스:** 현재 달(오늘 날짜 기준)일 때만 표시. 과거/미래 달 조회 시 섹션 숨김

### 섹션 9: 주간 지출 분포

- **데이터:** `daily` (기존 `DailyStat[]`)에서 프론트 계산
- **계산:** 1-7일=1주차, 8-14=2주차, 15-21=3주차, 22~말일=4주차
- **표시:** 4개 바 차트 (recharts BarChart, 가로축=주차)

### 섹션 10: 연간 누적 (YTD)

- **데이터:** `GET /stats/yearly` → `YearlySummary`
- **표시:** 올해 총 수입/지출/순저축 + 월별 지출 미니 바 차트 (12개 바, 해당 월 강조)
- **저축률:** `savings_rate`가 null이면 `--`

### 섹션 11: 요일별 지출 패턴

- **데이터:** `GET /stats/day-of-week` → `DowStat[]`
- **표시:** 월~일 7개 바 차트, 가장 많이 쓰는 요일 강조 (밝은 색)
- **매핑:** PostgreSQL DOW(0=일~6=토) → 한국식 표시 `['일','월','화','수','목','금','토']`

### 섹션 12: 미분류 거래 비율

- **데이터:** `GET /stats/uncategorized`
- **표시:** 원형 게이지 or 프로그레스 바 + "X건 중 Y건 미분류 (Z%)"
- **엣지케이스:** 거래 없으면 섹션 숨김

---

## 엣지케이스 정리

| 상황 | 처리 |
|------|------|
| 과거/미래 달 조회 | 섹션 8(월말 예측) 숨김 — 현재 달만 표시 |
| 전월 데이터 없음 | 섹션 7 변화율 `--` |
| 수입 = 0 | YTD 저축률 `--` |
| 거래 0건 | 섹션 12 숨김 |
| 요일 데이터 없음 | 해당 요일 0으로 표시 |
