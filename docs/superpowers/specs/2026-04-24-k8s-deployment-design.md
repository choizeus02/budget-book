# K8s 배포 설계 (ArgoCD + GitHub Actions)

Date: 2026-04-24

## 목표

budget-book 앱을 홈랩 K3s 클러스터에 GitOps 방식으로 배포한다.

---

## 인프라 환경

| 항목 | 값 |
|------|----|
| K3s cluster | master: 192.168.45.158, worker1: 192.168.45.46, worker2: 192.168.45.88 |
| nginx ingress IP | 192.168.45.200 (MetalLB) |
| ArgoCD UI | 192.168.45.201 |
| NAS PostgreSQL | 192.168.45.147:5432 |
| Ollama (Mac Mini) | 192.168.45.85:11434 |
| Container Registry | ghcr.io/choizeus02/budget-book-{api,frontend} |
| GitHub Repo | https://github.com/choizeus02/budget-book |

---

## 라우팅 설계

기존 trading 앱이 `192.168.45.200/`을 사용 중이므로 path 기반으로 분리한다.

| URL | 서비스 |
|-----|--------|
| `http://192.168.45.200/budget` | budget-book frontend |
| (내부) `budget-book-api:8000` | budget-book API (외부 미노출) |

API는 ingress를 통해 외부에 노출하지 않는다. frontend nginx가 클러스터 내부에서 `budget-book-api:8000`으로 직접 proxy_pass한다.

---

## 코드 변경사항

### 1. `frontend/vite.config.ts`
```ts
base: '/budget/'
```

### 2. `frontend/src/App.tsx`
```tsx
<BrowserRouter basename="/budget">
```

### 3. `frontend/nginx.conf`
- `location /` → `/budget/` 경로에서 SPA fallback 처리
- `location /api/` → `budget-book-api:8000` proxy_pass 유지 (내부 통신)

---

## K8s 매니페스트 변경사항

### `k8s/ingress.yaml`
- path: `/budget` → frontend service (PathType: Prefix)
- API 라우팅 제거

### `k8s/secret.yaml`
```yaml
DB_HOST: "192.168.45.147"
DB_NAME: "budget_db"
DB_USER: "choizeus"
OLLAMA_URL: "http://192.168.45.85:11434"
OLLAMA_MODEL: "qwen3:4b"
```
- git에는 더미값 유지, 실제 값은 `kubectl apply`로 직접 적용

### `k8s/api-deployment.yaml` / `k8s/frontend-deployment.yaml`
- image: `ghcr.io/choizeus02/budget-book-{api,frontend}:SHA`

---

## CI/CD 흐름

```
git push → main
  → GitHub Actions (.github/workflows/deploy.yml)
      1. paths-filter: api/ 또는 frontend/ 변경 감지
      2. GHCR 로그인 (GITHUB_TOKEN)
      3. 변경된 컴포넌트만 이미지 빌드 + push
         - ghcr.io/choizeus02/budget-book-api:{sha}
         - ghcr.io/choizeus02/budget-book-frontend:{sha}
      4. k8s/*.yaml 이미지 태그 sed 업데이트
      5. git commit + pull --rebase + push
  → ArgoCD (k8s/ 변경 감지)
      → K3s rolling update
```

무한 루프 방지: `paths-ignore: ["**.md", "k8s/**"]`

---

## 배포 순서

1. 코드 변경 (vite base, BrowserRouter basename, nginx.conf)
2. k8s 매니페스트 수정 (image, secret, ingress)
3. GitHub Actions 워크플로우 작성
4. git init + remote 추가 + push
5. GHCR 패키지 visibility → public (최초 push 후)
6. `kubectl apply -f k8s/namespace.yaml`
7. `kubectl apply -f k8s/secret.yaml` (실제 값으로 수정 후)
8. ArgoCD UI에서 앱 등록 (repo: choizeus02/budget-book, path: k8s/, namespace: budget-book)

---

## 접속

`http://192.168.45.200/budget`
