# K8s 배포 (GitHub Actions + ArgoCD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** budget-book 앱을 GitHub Actions로 GHCR에 빌드+push하고, ArgoCD가 K3s에 자동 배포하도록 GitOps 파이프라인을 구성한다.

**Architecture:** git push → GitHub Actions(이미지 빌드+push, k8s yaml 태그 업데이트) → ArgoCD(k8s/ 감지) → K3s rolling update. API는 ingress 미노출, frontend nginx가 클러스터 내부에서 직접 proxy_pass.

**Tech Stack:** GitHub Actions, GHCR, K3s, ArgoCD, nginx ingress (MetalLB 192.168.45.200)

---

## 파일 맵

| 파일 | 작업 |
|------|------|
| `frontend/vite.config.ts` | `base: '/budget/'`, PWA `start_url` 수정 |
| `frontend/src/App.tsx` | `basename="/budget"` 추가 |
| `frontend/nginx.conf` | `/budget/` SPA 라우팅으로 변경 |
| `k8s/ingress.yaml` | path `/budget` 하나만, API 라우팅 제거 |
| `k8s/secret.yaml` | 플레이스홀더 값 수정 (git에는 더미값) |
| `k8s/api-deployment.yaml` | image `GITHUB_ORG` → `choizeus02` |
| `k8s/frontend-deployment.yaml` | image `GITHUB_ORG` → `choizeus02` |
| `.github/workflows/deploy.yml` | 신규 생성 |
| `.gitignore` | `api/.env` 확인 |

---

## Task 1: Frontend base path 설정

**Files:**
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: vite.config.ts에 base 추가 및 PWA start_url 수정**

`frontend/vite.config.ts`를 아래와 같이 수정:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/budget/",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "가계부",
        short_name: "가계부",
        description: "개인 가계부 & 자산 관리",
        theme_color: "#6366f1",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "portrait",
        start_url: "/budget/",
        icons: [
          { src: "/budget/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/budget/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
```

- [ ] **Step 2: App.tsx에 basename 추가**

`frontend/src/App.tsx`의 `<BrowserRouter>`를 수정:

```tsx
<BrowserRouter basename="/budget">
```

- [ ] **Step 3: 로컬 빌드 확인**

```bash
cd frontend && npm run build 2>&1 | tail -5
```

Expected: `✓ built in ...` (에러 없음)

- [ ] **Step 4: Commit**

```bash
git add frontend/vite.config.ts frontend/src/App.tsx
git commit -m "feat: set base path /budget/ for k8s path-based routing"
```

---

## Task 2: nginx.conf 수정

**Files:**
- Modify: `frontend/nginx.conf`

- [ ] **Step 1: /budget/ 경로 SPA 처리로 변경**

`frontend/nginx.conf`를 아래 내용으로 교체:

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback for /budget/ path
    location /budget/ {
        try_files $uri $uri/ /budget/index.html;
    }

    # API reverse proxy → backend service (cluster internal)
    location /api/ {
        proxy_pass http://budget-book-api:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
}
```

> 주의: `location /` 는 제거한다. ingress가 `/budget/`으로만 라우팅하므로 루트 경로 처리 불필요.
> docker compose 로컬 접속 URL도 `http://localhost:5173/budget/`으로 변경됨.

- [ ] **Step 2: Commit**

```bash
git add frontend/nginx.conf
git commit -m "feat: update nginx for /budget/ base path"
```

---

## Task 3: K8s 매니페스트 수정

**Files:**
- Modify: `k8s/ingress.yaml`
- Modify: `k8s/secret.yaml`
- Modify: `k8s/api-deployment.yaml`
- Modify: `k8s/frontend-deployment.yaml`

- [ ] **Step 1: ingress.yaml 수정**

`k8s/ingress.yaml`을 아래 내용으로 교체:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: budget-book-ingress
  namespace: budget-book
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /budget(/|$)(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: budget-book-frontend
                port:
                  number: 80
```

> `rewrite-target`을 쓰지 않고 nginx가 full path를 그대로 받게 하므로, 실제로 rewrite annotation은 제거하고 아래처럼 단순하게 쓴다:

실제 최종 내용:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: budget-book-ingress
  namespace: budget-book
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /budget
            pathType: Prefix
            backend:
              service:
                name: budget-book-frontend
                port:
                  number: 80
```

- [ ] **Step 2: secret.yaml 더미값 업데이트**

`k8s/secret.yaml`의 플레이스홀더를 의미 있는 더미값으로 수정 (git 커밋용, 실제 값 아님):

```yaml
# 실제 배포 전 값을 채우고 kubectl apply -f k8s/secret.yaml 실행
# git에는 커밋하지 말 것 (더미값 유지)
apiVersion: v1
kind: Secret
metadata:
  name: budget-book-secret
  namespace: budget-book
type: Opaque
stringData:
  DB_HOST: "192.168.45.147"
  DB_PORT: "5432"
  DB_NAME: "budget_db"
  DB_USER: "CHANGE_ME"
  DB_PASSWORD: "CHANGE_ME"
  OLLAMA_URL: "http://192.168.45.85:11434"
  OLLAMA_MODEL: "qwen3:4b"
```

- [ ] **Step 3: api-deployment.yaml 이미지 수정**

`k8s/api-deployment.yaml`의 image 라인:

```yaml
image: ghcr.io/choizeus02/budget-book-api:latest
```

- [ ] **Step 4: frontend-deployment.yaml 이미지 수정**

`k8s/frontend-deployment.yaml`의 image 라인:

```yaml
image: ghcr.io/choizeus02/budget-book-frontend:latest
```

- [ ] **Step 5: Commit**

```bash
git add k8s/
git commit -m "feat: update k8s manifests for /budget path and choizeus02 registry"
```

---

## Task 4: GitHub Actions 워크플로우 작성

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: workflows 디렉토리 생성**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: deploy.yml 작성**

`.github/workflows/deploy.yml`:

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]
    paths-ignore:
      - "**.md"
      - "k8s/**"

permissions:
  contents: write
  packages: write

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          token: ${{ secrets.GITHUB_TOKEN }}

      - name: Check changed files
        id: changed
        uses: dorny/paths-filter@v3
        with:
          filters: |
            api:
              - 'api/**'
            frontend:
              - 'frontend/**'

      - name: Log in to GHCR
        if: steps.changed.outputs.api == 'true' || steps.changed.outputs.frontend == 'true'
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Docker Buildx
        if: steps.changed.outputs.api == 'true' || steps.changed.outputs.frontend == 'true'
        uses: docker/setup-buildx-action@v3

      - name: Build and push API
        if: steps.changed.outputs.api == 'true'
        uses: docker/build-push-action@v6
        with:
          context: ./api
          platforms: linux/amd64
          push: true
          tags: ghcr.io/${{ github.repository }}-api:${{ github.sha }}

      - name: Build and push Frontend
        if: steps.changed.outputs.frontend == 'true'
        uses: docker/build-push-action@v6
        with:
          context: ./frontend
          platforms: linux/amd64
          push: true
          tags: ghcr.io/${{ github.repository }}-frontend:${{ github.sha }}

      - name: Update k8s image tags
        if: steps.changed.outputs.api == 'true' || steps.changed.outputs.frontend == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

          if [ "${{ steps.changed.outputs.api }}" == "true" ]; then
            sed -i "s|image: ghcr.io/choizeus02/budget-book-api:.*|image: ghcr.io/choizeus02/budget-book-api:${{ github.sha }}|" k8s/api-deployment.yaml
            git add k8s/api-deployment.yaml
          fi

          if [ "${{ steps.changed.outputs.frontend }}" == "true" ]; then
            sed -i "s|image: ghcr.io/choizeus02/budget-book-frontend:.*|image: ghcr.io/choizeus02/budget-book-frontend:${{ github.sha }}|" k8s/frontend-deployment.yaml
            git add k8s/frontend-deployment.yaml
          fi

          git diff --staged --quiet || (
            git pull --rebase origin main
            git commit -m "ci: update image tags to ${{ github.sha }}"
            git push
          )
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Actions build and deploy workflow"
```

---

## Task 5: Git 초기화 및 GitHub push

**Files:**
- `.gitignore` 확인

- [ ] **Step 1: .gitignore에 api/.env 확인**

```bash
grep "api/.env\|\.env" .gitignore
```

Expected: `.env` 또는 `api/.env`가 포함되어 있어야 함. 없으면 추가:

```bash
echo "api/.env" >> .gitignore
git add .gitignore
git commit -m "chore: ensure api/.env is gitignored"
```

- [ ] **Step 2: git 초기화 및 remote 추가**

```bash
git init
git remote add origin https://github.com/choizeus02/budget-book.git
```

이미 init 되어 있다면 remote만:

```bash
git remote add origin https://github.com/choizeus02/budget-book.git
```

- [ ] **Step 3: 전체 커밋 확인**

```bash
git log --oneline
```

누락된 파일 없는지 확인:

```bash
git status
```

- [ ] **Step 4: main 브랜치로 push**

```bash
git branch -M main
git push -u origin main
```

- [ ] **Step 5: GitHub에서 Actions 탭 확인**

`https://github.com/choizeus02/budget-book/actions` 에서 워크플로우가 트리거되었는지 확인.
(첫 push이므로 api/와 frontend/ 모두 변경된 것으로 감지되어 빌드 시작)

---

## Task 6: GHCR 패키지 visibility 설정

- [ ] **Step 1: 빌드 완료 후 GHCR 패키지 public으로 전환**

GitHub Actions 빌드가 성공하면:

1. `https://github.com/choizeus02?tab=packages` 접속
2. `budget-book-api` 패키지 → Package settings → Change visibility → Public
3. `budget-book-frontend` 패키지 → 동일하게 Public

> K3s 노드에서 imagePullSecrets 없이 pull 가능하게 하기 위함.

---

## Task 7: K3s secret apply 및 namespace 생성

> 이 단계는 K3s master 노드 또는 kubectl 접근 가능한 머신에서 실행.

- [ ] **Step 1: namespace 생성**

```bash
kubectl apply -f k8s/namespace.yaml
```

Expected:
```
namespace/budget-book created
```

- [ ] **Step 2: secret.yaml에 실제 값 채우고 apply**

로컬에서 `k8s/secret.yaml`을 임시로 실제 값으로 수정 후 apply (git에는 커밋하지 않음):

```yaml
stringData:
  DB_HOST: "192.168.45.147"
  DB_PORT: "5432"
  DB_NAME: "budget_db"
  DB_USER: "choizeus"
  DB_PASSWORD: "Wodnsla99!"
  OLLAMA_URL: "http://192.168.45.85:11434"
  OLLAMA_MODEL: "qwen3:4b"
```

```bash
kubectl apply -f k8s/secret.yaml
```

Expected:
```
secret/budget-book-secret created
```

apply 후 즉시 git checkout으로 더미값 복원:

```bash
git checkout k8s/secret.yaml
```

---

## Task 8: ArgoCD 앱 등록

> ArgoCD UI: `http://192.168.45.201`

- [ ] **Step 1: ArgoCD UI 접속 후 New App 클릭**

| 항목 | 값 |
|------|----|
| Application Name | `budget-book` |
| Project | `default` |
| Sync Policy | `Automatic` |
| Repository URL | `https://github.com/choizeus02/budget-book` |
| Revision | `main` |
| Path | `k8s` |
| Cluster | `https://kubernetes.default.svc` (in-cluster) |
| Namespace | `budget-book` |

- [ ] **Step 2: Sync 확인**

ArgoCD가 k8s/ 폴더를 읽어 리소스를 배포하는지 확인.
모든 리소스가 `Synced` + `Healthy` 상태가 되어야 함.

```bash
kubectl get pods -n budget-book
```

Expected:
```
NAME                                    READY   STATUS    RESTARTS
budget-book-api-xxx                     1/1     Running   0
budget-book-frontend-xxx                1/1     Running   0
```

- [ ] **Step 3: 접속 확인**

브라우저에서 `http://192.168.45.200/budget` 접속.

홈 화면이 정상적으로 렌더링되면 완료.

---

## 이후 개발 워크플로우

```bash
# 코드 수정 후
git pull --rebase origin main   # 반드시 먼저 (Actions가 k8s yaml 수정했을 수 있음)
git add .
git commit -m "feat: ..."
git push
# → GitHub Actions 자동 빌드 → ArgoCD 자동 배포
```
