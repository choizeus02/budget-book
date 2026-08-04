# 저축·투자 지출 분리 + 리포트 지출 구성 카드 개선

날짜: 2026-08-04
상태: 승인됨

## 배경 / 문제

1. "재테크 전환"(월 150만원대 투자 이체)이 일반 지출로 집계되어 통계·리포트의 소비 규모가 실제보다 크게 보인다. 소모성 지출이 아니라 자산으로 옮긴 돈이므로 분리해야 한다.
2. 리포트의 "고정비 vs 변동비" 카드가 숫자만 보여주고 인사이트가 없어 의미 전달이 안 된다.

## 결정 사항

- 표시 방식: 지출에서 완전히 제외하고 **별도 섹션(버킷)** 으로 표시.
- 명칭: **"저축·투자"** (새 대분류 카테고리).
- 범위: 재테크 전환만 분리. **대출상환은 지출 유지.**
- 식별 방식: 카테고리 플래그 (`excluded_from_expense`). 문자열 하드코딩 금지 — 카테고리 이름 변경이 거래에 연쇄 반영되는 구조이므로 DB 플래그가 안전.
- 리포트: 고정비/변동비 카드를 3버킷 "지출 구성" 카드로 재설계 + 자동 인사이트 문장.

## 1. 데이터 모델

### 스키마 마이그레이션 (alembic)

- `categories.excluded_from_expense` — boolean, NOT NULL, server_default false.

### 데이터 마이그레이션 (같은 리비전, 멱등)

1. 대분류 `저축·투자` 가 없으면 생성, `excluded_from_expense = true`. 하위 중분류 `투자` 생성.
2. `category = '자산' AND subcategory = '투자비 전환'` 인 행을 `category = '저축·투자', subcategory = '투자'` 로 이전. 대상 테이블: `transactions`, `subscriptions`, `installments`, `category_cache`, `budgets`.
3. `자산` 카테고리의 나머지(대출상환, 수입)는 변경하지 않음.
4. 해당 행이 없는 DB(로컬 초기 DB)에서는 no-op.

## 2. API

### 공용 필터 (`api/services/spending.py` 신설)

- `async def excluded_category_names(db) -> list[str]` — 플래그된 대분류 이름 목록.
- `def expense_filter(excluded: list[str])` — `Transaction.type == expense AND (category IS NULL OR category NOT IN excluded)` SQLAlchemy 조건 생성. `category IS NULL`(분류 중) 거래는 지출에 유지.
- `def invested_filter(excluded: list[str])` — `type == expense AND category IN excluded` (저축·투자 버킷 집계용).

현재 stats.py와 report.py에 지출 집계가 각각 중복 구현되어 있고 공용 모듈이 없다. 이 모듈이 유일한 진실 공급원이 된다.

### stats.py 변경 (지출 집계 ~9곳)

- `/stats/monthly`: `total_expense`에서 플래그 카테고리 제외, `total_invested` 필드 추가. **`net = income − expense − invested`** — 모든 유출 후 남은 돈. 숫자는 기존 net과 동일하므로 홈 화면 순수익 의미가 유지되고, 요약 카드에서 지출/저축·투자/순수익이 중복 없이 합산된다 (`income = expense + invested + net`).
- `/stats/yearly`: 동일하게 `total_invested`(연간), 월별 `months[].invested` 추가. `savings_rate = (income - expense) / income` 공식 유지 — expense가 순수 소비만 남으므로 자동으로 정확해짐.
- `by-category`, `by-category-detail`, `daily`, `top-transactions`, `day-of-week`, `uncategorized`: 플래그 카테고리 제외.
- `fixed-vs-variable`(stats 단독 endpoint): 고정비·변동비 쿼리 양쪽 모두 플래그 카테고리 제외.

### report.py 변경 (지출 집계 ~14곳)

- `_month_sums`: 지출에서 제외 + `invested` 반환 (3-tuple).
- `_fixed_variable`: 3버킷으로 확장. `fixed` 쿼리(`subscription_id/installment_id` 연결)에서도 플래그 카테고리 제외 — `variable = expense - fixed` 뺄셈 방식이므로 양쪽 정의가 일치해야 함. 스키마 `ReportFixedVariable`에 `invested_total`, `invested_ratio` 추가 (ratio 분모는 `fixed + variable + invested`).
- 나머지 섹션(`_daily`, `_trends`, `_category_trend`, `_breakdown`, `_dow`, `_weekly`, `_top`, `_frequent`, `_budgets`, `_insights` 데이터 수집): 지출 정의 일괄 교체.
- `_ytd`: stats의 `yearly_stats` 재사용이므로 자동 반영.
- `_format_review_payload` (LLM 총평 프롬프트): "저축·투자: N원 (수입의 M%)" 라인 추가. 누락 시 LLM이 지출 감소로 오해함.
- KPI(`ReportSummary`)에 `invested` / `prev_invested` 추가.

### insights.py 신규 규칙

`InsightInput`에 `invested`, `variable_total`, `variable_3mo_avg`, `fixed_item_changes` 추가 후:

1. **고정비 변화 + 원인**: 전월 대비 고정비 증감이 있으면 원인 항목명 포함. 기존 fixed-cost 규칙을 항목 diff 기반으로 강화 (구독/할부 이름별 전월 대비 비교).
2. **변동비 페이스**: 최근 3개월 평균 대비 ±10% 이상이면 문장 생성.
3. **저축·투자율**: `invested / income` 비율 문장 ("수입의 N%를 저축·투자로 이동").

## 3. 프론트엔드

- **통계 탭 (`Stats.tsx`)**: 요약 카드 4줄 — 지출 / 수입 / 저축·투자 / 순수익. 도넛·카테고리 목록은 서버 응답이 이미 제외된 상태이므로 변경 없음 (비율 분모는 자동 갱신).
- **리포트 (`CompositionCards.tsx`)**: `FixedVarCard` → "지출 구성" 카드.
  - 3분할 스택 막대: 고정비 / 변동비 / 저축·투자.
  - 각 버킷 아래 요약 줄: 고정비(전월 대비 증감 + 변경 항목), 변동비(3개월 평균 대비), 저축·투자(수입 대비 %).
  - 기존 구독/할부 항목 리스트 유지.
- **설정 > 카테고리**: 대분류 편집 UI에 "지출 통계에서 제외" 토글. `PATCH /api/categories/{id}`에 `excluded_from_expense` 필드 추가.
- **홈 (`Home.tsx`)**: 코드 변경 없음. 이번달 지출·소비율이 순수 소비 기준으로 자동 반영.
- 타입: `frontend/src/api/types.ts`의 `MonthlySummary`, `YearlySummary`, `ReportFixedVariable`, `ReportSummary`, `CategoryGroup` 갱신.

## 4. 테스트

- 마이그레이션: 대상 행 있음/없음(no-op) 케이스.
- spending.py 필터: 플래그 카테고리 제외, NULL category 유지, 플래그 없는 DB에서 전체 통과.
- stats: monthly/yearly에 invested 분리 검증, by-category에 저축·투자 미포함.
- report: fixed/variable/invested 3버킷 합계 = 기존 총지출, 구독 연결된 저축·투자 거래가 고정비에 새지 않는지.
- insights: 신규 규칙 3종 단위 테스트 (기존 `test_insights.py` 패턴).

## 5. 알려진 트레이드오프 / 비범위

- 과거 월의 LLM 총평 캐시(`monthly_reviews`)는 옛 숫자 기준 그대로. 재생성 시 갱신.
- 플래그 카테고리에 걸린 예산은 집행액 0으로 표시됨 — 저축·투자에 예산을 쓰지 않는 전제. 마이그레이션에서 `budgets` 행도 이전하므로 실제 발생 가능성 낮음.
- 대출상환 분리, 수입 흐름 워터폴 차트는 이번 범위에서 제외 (추후 확장).
