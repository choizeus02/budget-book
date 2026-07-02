# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

개인 가계부 & 자산 관리 앱. 모바일 퍼스트 PWA.
핵심 UX: 금액 입력 → 메모(선택) → 저장. LLM이 카테고리 자동 추론 (백그라운드 비동기).

## Commands

### Local Development

```bash
# 전체 스택 (postgres + api + frontend) — 로컬 postgres 컨테이너 사용, NAS 운영 DB에 붙지 않음
docker compose up

# API 단독 개발 (docker compose up postgres 로 로컬 DB만 먼저 실행 후)
cd api && uvicorn main:app --reload

# Frontend 단독 개발 (vite dev server, /api → localhost:8000 proxy)
cd frontend && npm run dev

# Frontend 빌드
cd frontend && npm run build
```

### DB Migrations (alembic)

```bash
# 스키마 변경 절차: api/models.py 수정 → 마이그레이션 생성 → 검토 후 커밋
cd api && alembic revision --autogenerate -m "설명"

# 적용은 API 시작 시 자동 (database.py init_db가 alembic upgrade head 실행)
# 수동 적용: cd api && alembic upgrade head
```

- alembic 도입 이전(create_all) DB는 `init_db()`가 baseline(0001)을 자동 stamp 후 업그레이드.
- 금액 컬럼은 전부 **BigInteger (KRW 원 단위 정수)** — Float 금지.

### Kubernetes

```bash
# 최초 배포
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml  # 실제 값 채운 후
kubectl apply -f k8s/

# ArgoCD 앱 등록 후에는 k8s/ 변경이 git push로 자동 배포됨
```

### NAS DB 초기 설정 (최초 1회)

```sql
CREATE USER budget_book WITH PASSWORD '<password>';
CREATE DATABASE budget_book OWNER budget_book;
```

## Architecture

```
frontend (React PWA)  →  /api/*  →  api (FastAPI)  →  PostgreSQL (NAS 192.168.45.147)
                                          ↓
                                   Anthropic API (claude-haiku, 카테고리 분류)
```

- **Frontend**: `frontend/src/pages/` 페이지, `frontend/src/components/` 공통 컴포넌트
- **API client**: `frontend/src/api/client.ts` — 모든 fetch 호출은 여기서 관리
- **Backend routers**: `api/routers/` — transactions, accounts, budgets, stats, installments, subscriptions, categories
- **LLM 서비스**: `api/services/llm.py` — Anthropic Haiku 호출 + `category_cache` 테이블 캐시
- **DB 모델**: `api/models.py` — SQLAlchemy async ORM, 스키마는 `api/alembic/` 마이그레이션으로 관리

## Key Design Decisions

- **카테고리 비동기 추론**: `POST /api/transactions` 응답은 즉시 반환하고, BackgroundTask로 LLM 분류 후 DB 업데이트. 프론트는 `category: null` 상태를 "분류 중..." 배지로 표시.
- **캐시**: 동일 description(소문자 SHA256)이면 LLM 재호출 없이 캐시 반환. 사용자가 거래 카테고리를 직접 수정하면 캐시에 반영(학습).
- **amount 부호**: expense는 DB에 음수로 저장 (POST/PATCH 모두 정규화). stats API에서 `abs()` 처리.
- **금액 단위**: KRW 원 단위 정수(BigInteger). `SUM(bigint)`은 asyncpg에서 Decimal로 오므로 파이썬 연산 전 float/int 변환 필요.
- **구독 동기화**: `POST /api/subscriptions/sync`가 빠진 월 트랜잭션 생성. 앱 시작 시 프론트가 호출 + K8s CronJob(매일 00:10 KST)이 보조.
- **PWA**: `vite-plugin-pwa`로 manifest + service worker 자동 생성. Safari "홈 화면에 추가"로 설치.
- **nginx.conf**: K8s 배포 시 frontend nginx가 `/api/` → `budget-book-api:8000`으로 proxy_pass.

## Infrastructure

- MetalLB IP: `192.168.45.202` (budget-book 전용)
- Ingress: `/api` → api:8000, `/budget` → frontend:80
- CI/CD: `infra.md`의 GitHub Actions 패턴 그대로 적용 (paths-filter → GHCR push → k8s 태그 업데이트 → ArgoCD 자동 롤아웃)
- secret.yaml 필수 키: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `ANTHROPIC_API_KEY`
- api 파드는 `TZ=Asia/Seoul` (월 경계 계산이 KST 기준이어야 함)
- DB 백업: `k8s/db-backup-cronjob.yaml` — 매일 03:00 KST pg_dump → PVC, 30일 보관
