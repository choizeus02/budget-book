# 리포트 v2 (전용 페이지) + 통계 드릴다운 설계

**날짜:** 2026-07-03
**범위:** ① 리포트를 데스크탑 우선 전용 페이지로 확장 ② 통계 페이지에서 중분류 → 개별 거래 드릴다운

---

## 배경 / 결정 사항

- 리포트는 **데스크탑 위주 사용** 전제. 모바일은 그리드가 1열로 접히는 수준만 보장.
- 기존 설정 > 리포트 탭(10개 섹션)은 **전용 페이지 `/report`로 이전 후 제거**.
- 데이터는 **통합 엔드포인트 `GET /api/report`** 하나로 내려줌 (왕복 1회). 섹션별 계산 함수 분리 + 실패 격리(해당 필드만 null).
- LLM 총평: **Anthropic API 유지** (2026-04-30에 Ollama→API 전환된 상태 확인, 사용자 승인). 분류는 기존 Haiku, **총평은 `claude-sonnet-5`** (env `REVIEW_MODEL`로 오버라이드, 월 1회 + DB 캐시라 비용 무시 가능).
- 드릴다운은 백엔드 변경 없이 프론트 메모리 필터로 구현.

---

## 1. 리포트 화면 구성 (`/report`)

월 네비게이션(← YYYY년 M월 →) + 카드 그리드. `grid-cols-1 lg:grid-cols-12`.

| # | 섹션 | 내용 |
|---|------|------|
| ① | KPI 헤드라인 | 총지출·총수입·순저축(+저축률) 각각 전월비 증감, **월말 예상 지출**(이번 달: 지출÷경과일×말일, 과거 달: 일평균) |
| ② | 자동 인사이트 | 서버 규칙 기반 리스트. 규칙: 카테고리 급증/급감(전월비 ±30% & ±5만원), 예산 초과/소진 페이스 경고, 최대 단건 지출, 신규 지출처, 무지출일 수(전월비), 구독 고정비 변화, 미분류 비율 경고, 저축률 이벤트(흑자 전환, 12개월 최고). severity: good/info/warn |
| ③ | LLM 월간 총평 | 캐시된 총평 + 생성일. 없으면 "총평 생성" 버튼, 있으면 "다시 생성" |
| ④ | 지출 흐름 | 일별 지출 바 + 이번달/전월 누적 라인 오버레이 · 캘린더 히트맵(주×요일) |
| ⑤ | 12개월 트렌드 | 월별 수입/지출 바+순저축 라인 · 저축률 추이 라인 · TOP5 카테고리 월별 멀티라인 |
| ⑥ | 지출 구성 | 카테고리 도넛 · 카테고리 테이블(금액/비중/전월비/예산소진) · 고정vs변동 도넛 + 이번 달 고정비 내역(구독·할부 항목) |
| ⑦ | 패턴 | 요일별 평균 지출(건수 포함) · 주차별(1~5주) 지출 |
| ⑧ | 기록 | TOP 10 지출 테이블 · 최다 빈도 지출처 TOP 5(동일 description 그룹: 횟수×합계) |
| ⑨ | 예산 | 카테고리별 게이지 + "오늘 기준 이상적 소진률" 기준선 |
| ⑩ | 연간 누적(YTD) | 기존 yearly 재사용 |

계좌별 분포는 제외 (account_id 입력이 거의 없어 무의미).

---

## 2. 백엔드

### 신규 라우터 `api/routers/report.py`

```
GET  /api/report?year&month          → ReportResponse (아래 전체)
GET  /api/report/review?year&month   → 캐시된 총평 or null
POST /api/report/review?year&month   → 총평 (재)생성 후 저장·반환
```

### ReportResponse 필드 (섹션 실패 시 해당 필드만 null)

```
summary        { income, expense, net, savings_rate, prev: {...} }
pace           { spent_so_far, projected, daily_avg, prev_daily_avg }
insights       [ { type, severity: "good"|"info"|"warn", message } ]
daily          [ { day, total, cumulative, prev_cumulative } ]
trends         [ { year, month, income, expense, net, savings_rate } ]  # 12개월 롤링
category_trend { categories: [str]×5, series: [{ ym, <카테고리별 금액> }] }
breakdown      [ { category, total, ratio, prev_total, diff_pct, budget, budget_used, subcategories } ]
fixed_variable { fixed_total, variable_total, fixed_ratio, variable_ratio, items: [{name, amount, kind: "subscription"|"installment"}] }
dow            [ { dow, total, count, avg } ]
weekly         [ { week, total } ]
top            [ TOP 10 거래 ]
frequent       [ { description, count, total } ]  # TOP 5
budgets        [ { category, budget, spent, used_pct, ideal_pct } ]
ytd            YearlySummary (기존 재사용)
```

- 섹션별 async 함수로 분리, `asyncio.gather` 병렬 실행, 함수별 try/except.
- 인사이트는 이미 계산된 섹션 데이터를 재활용해 추가 쿼리 최소화.
- 금액 쿼리는 date 범위 조건 (extract 금지 — 0002에서 만든 인덱스 활용). SUM(bigint)→Decimal은 float/int 변환.
- 기존 `stats.py`는 통계 페이지용으로 유지.

### LLM 총평

- 신규 테이블: `monthly_reviews (id BIGINT PK, year INT, month INT, content TEXT, model VARCHAR(50), created_at, UNIQUE(year, month))` — **alembic 마이그레이션 0003**.
- `services/llm.py`에 `generate_monthly_review(year, month, report_data) -> str` 추가:
  - 모델 `claude-sonnet-5` (env `REVIEW_MODEL` 오버라이드, config.py에 추가)
  - 입력: 요약/전월비/카테고리 breakdown/인사이트 → 한국어 3~5문장 총평+조언, max_tokens 512
- POST는 upsert(재생성 시 덮어쓰기). GET은 조회만 (LLM 호출 없음).
- 실패 시 502 반환, 캐시는 변경하지 않음.

---

## 3. 프론트엔드

```
pages/Report.tsx               # 월 네비 + GET /api/report 1회 + 그리드 배치
components/report/*.tsx        # 카드 컴포넌트 (Kpi, Insights, Review, DailyFlow, Heatmap,
                               #   Trends, CategoryTable, FixedVar, Patterns, TopRecords, Budget, Ytd)
```

- App.tsx: `/report` 라우트 추가. BottomNav에 리포트 탭 추가.
- Settings의 리포트 탭 제거, `components/settings/ReportSection.tsx` 삭제.
- client.ts: `api.report.get(year, month)`, `api.report.getReview`, `api.report.generateReview` 추가.
- 차트는 기존 recharts 재사용. 캘린더 히트맵은 CSS grid로 직접 구현 (라이브러리 추가 없음).
- 총평 카드: GET review가 null이면 "총평 생성" 버튼 → POST → 표시. 생성 중 스피너.

---

## 4. 통계 드릴다운 (3단 아코디언)

- 백엔드 변경 없음.
- Stats.tsx: 중분류 행을 버튼화. 첫 드릴다운 시 `api.transactions.list(year, month)` 1회 호출해 상태에 캐시 → 카테고리/중분류로 메모리 필터.
- 펼침 내용: 날짜 · 설명 · 금액 리스트 (읽기 전용).
- "기타" 버킷 매칭: `category === null || category === "기타"` (집계 기준과 동일). 중분류 "기타"도 동일 규칙.
- 월 변경 시 캐시 초기화.

---

## 5. 에러 처리 / 검증

- `/api/report` 자체 실패: 프론트는 "리포트를 불러오지 못했습니다" + 재시도 버튼.
- 섹션 null: 해당 카드에 "데이터 없음" 표시, 나머지 정상 렌더.
- 총평 생성 실패: 카드에 오류 문구 + 재시도. 기존 캐시 유지.
- 검증: docker compose 로컬 스택에서 시드 데이터 넣고 `/api/report` 전 필드 확인, 총평 생성(실제 API 키 필요 — 없으면 502 경로 확인), 프론트 빌드 + 화면 확인, 드릴다운 동작 확인. 마이그레이션 0003은 로컬 fresh + 기존 DB 경로 둘 다 확인.

## 6. 구현 순서

1. alembic 0003 (monthly_reviews) + models/config
2. report 라우터 (섹션 함수 + 인사이트 규칙)
3. LLM 총평 (generate_monthly_review + review 엔드포인트)
4. 프론트: Report 페이지 + 카드 + 라우팅/네비 + 설정 탭 제거
5. 통계 드릴다운
6. e2e 검증 (compose) → 커밋 → push
