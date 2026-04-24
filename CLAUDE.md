# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

개인 가계부 & 자산 관리 앱. 모바일 퍼스트 PWA.
핵심 UX: 금액 입력 → 메모(선택) → 저장. LLM이 카테고리 자동 추론 (백그라운드 비동기).

## Commands

### Local Development

```bash
# 전체 스택 (postgres + api + frontend)
docker compose up

# API 단독 개발 (postgres만 실행 후)
cd api && uvicorn main:app --reload

# Frontend 단독 개발 (vite dev server, /api → localhost:8000 proxy)
cd frontend && npm run dev

# Frontend 빌드
cd frontend && npm run build
```

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
                                   Ollama (Mac Mini :11434)
```

- **Frontend**: `frontend/src/pages/` 페이지, `frontend/src/components/` 공통 컴포넌트
- **API client**: `frontend/src/api/client.ts` — 모든 fetch 호출은 여기서 관리
- **Backend routers**: `api/routers/` — transactions, accounts, budgets, stats
- **LLM 서비스**: `api/services/llm.py` — Ollama 호출 + `category_cache` 테이블 캐시
- **DB 모델**: `api/models.py` — SQLAlchemy async ORM, `database.py`의 `init_db()`로 자동 테이블 생성

## Key Design Decisions

- **카테고리 비동기 추론**: `POST /api/transactions` 응답은 즉시 반환하고, BackgroundTask로 LLM 분류 후 DB 업데이트. 프론트는 `category: null` 상태를 "분류 중..." 배지로 표시.
- **캐시**: 동일 description(소문자 SHA256)이면 Ollama 재호출 없이 캐시 반환.
- **amount 부호**: expense는 DB에 음수로 저장. stats API에서 `abs()` 처리.
- **PWA**: `vite-plugin-pwa`로 manifest + service worker 자동 생성. Safari "홈 화면에 추가"로 설치.
- **nginx.conf**: K8s 배포 시 frontend nginx가 `/api/` → `budget-book-api:8000`으로 proxy_pass.

## Infrastructure

- MetalLB IP: `192.168.45.202` (budget-book 전용)
- Ingress: `/api` → api:8000, `/` → frontend:80
- CI/CD: `infra.md`의 GitHub Actions 패턴 그대로 적용 (paths-filter → GHCR push → k8s 태그 업데이트 → ArgoCD 자동 롤아웃)
- secret.yaml의 `OLLAMA_URL`에 Mac Mini의 실제 IP 입력 필요 (DHCP이므로 static IP 설정 권장)
