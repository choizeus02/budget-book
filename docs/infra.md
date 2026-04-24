# Homelab Infrastructure Guide

홈랩 공통 인프라 구성 가이드. 새 프로젝트 온보딩 시 이 문서를 참고하여 환경을 세팅한다.

---

## 1. 물리 인프라

### 노드 구성

| 역할 | CPU | IP | 용도 |
|------|-----|----|------|
| K3s master | Intel N100 | 192.168.45.158 | control plane + worker |
| K3s worker1 | Intel N100 | 192.168.45.46 | worker node |
| K3s worker2 | Intel N100 | 192.168.45.88 | worker node |
| NAS | AMD Ryzen 7 5825U, 14TB | 192.168.45.147 | DB, 오케스트레이션, 레지스트리 |
| 개발 머신 | Apple M4 32GB | (DHCP) | 개발, 수동 배포 |

### 네트워크

- 내부망: `192.168.45.0/24` (1Gbps 유선)
- 외부 인터넷 노출 없음 (홈랩 내부 전용)

---

## 2. K3s 클러스터

- 배포판: K3s (경량 Kubernetes)
- CNI: Flannel (기본값)
- 스토리지: local-path provisioner (기본값)

### 네임스페이스 관례

프로젝트마다 전용 네임스페이스를 생성한다.

```bash
kubectl create namespace <project-name>
# 또는 yaml로 관리
kubectl apply -f k8s/namespace.yaml
```

---

## 3. MetalLB

L2 모드 LoadBalancer. `type: LoadBalancer` Service에 실제 LAN IP를 할당한다.

- IP Pool: `192.168.45.200 – 192.168.45.210`

### 현재 IP 할당 현황

| IP | 서비스 |
|----|--------|
| 192.168.45.200 | ingress-nginx-controller |
| 192.168.45.201 | argocd-server |
| 192.168.45.202 ~ | 신규 프로젝트 할당 가능 |

### 설치

```bash
kubectl apply -f https://raw.githubusercontent.com/metallb/metallb/<version>/config/manifests/metallb-native.yaml
```

설치 후 IPAddressPool + L2Advertisement 적용:

```yaml
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: home-pool
  namespace: metallb-system
spec:
  addresses:
    - 192.168.45.200-192.168.45.210
---
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: home-l2
  namespace: metallb-system
spec:
  ipAddressPools:
    - home-pool
```

---

## 4. nginx Ingress Controller

- 설치: baremetal 배포판 (`controller-v1.10.1`)
- Service 타입: `LoadBalancer` → MetalLB에서 `192.168.45.200` 할당
- 진입점: `http://192.168.45.200`

### 설치

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.1/deploy/static/provider/baremetal/deploy.yaml
```

설치 후 Service를 LoadBalancer로 전환:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: ingress-nginx-controller
  namespace: ingress-nginx
spec:
  type: LoadBalancer
  selector:
    app.kubernetes.io/component: controller
    app.kubernetes.io/instance: ingress-nginx
    app.kubernetes.io/name: ingress-nginx
  ports:
    - name: http
      port: 80
      targetPort: http
    - name: https
      port: 443
      targetPort: https
```

### 신규 프로젝트에서 Ingress 사용

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: <project>-ingress
  namespace: <project>
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: <frontend-service>
                port:
                  number: 80
```

> `/api/*` 라우팅은 ingress에서 직접 하거나, frontend nginx.conf의 `proxy_pass`로 처리.

---

## 5. ArgoCD

- UI: `http://192.168.45.201`
- Service 타입: `LoadBalancer` → MetalLB에서 `192.168.45.201` 할당
- GitOps 방식: Git 레포의 `k8s/` 폴더를 감시 → 변경 시 자동 배포

### 설치

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Service를 LoadBalancer로 전환:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: argocd-server
  namespace: argocd
spec:
  type: LoadBalancer
  selector:
    app.kubernetes.io/name: argocd-server
  ports:
    - name: http
      port: 80
      targetPort: 8080
    - name: https
      port: 443
      targetPort: 8080
```

초기 admin 비밀번호:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

### 신규 프로젝트 등록

ArgoCD UI에서 `+ New App`:

| 항목 | 값 |
|------|----|
| Application Name | `<project-name>` |
| Repository URL | `https://github.com/<org>/<repo>` |
| Path | `k8s/` |
| Cluster | in-cluster |
| Namespace | `<project-name>` |
| Sync Policy | Automatic |

---

## 6. NAS 서비스 (192.168.45.147)

### PostgreSQL

- 실행 방식: NAS Docker 컨테이너
- 포트: `5432`
- 접속: `psql -h 192.168.45.147 -U <user> -d <database>`

새 프로젝트용 DB/유저 생성:

```sql
CREATE USER <user> WITH PASSWORD '<password>';
CREATE DATABASE <database> OWNER <user>;
```

TimescaleDB 사용 시:

```sql
\c <database>
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

### Prefect Server

- 실행 방식: NAS Docker 컨테이너
- UI: `http://192.168.45.147:4200`
- API: `http://192.168.45.147:4200/api`

Prefect profile 설정 (개발 머신):

```bash
prefect profile create nas
prefect profile use nas
prefect config set PREFECT_API_URL=http://192.168.45.147:4200/api
```

Work Pool 생성 (최초 1회):

```bash
prefect work-pool create <pool-name> --type process
```

Deployment 등록:

```bash
prefect deploy --all
```

---

## 7. CI/CD 패턴 (GitHub Actions + ArgoCD)

### 전체 흐름

```
git push (main)
  → GitHub Actions
      1. 변경된 컴포넌트만 선별 빌드 (paths-filter)
      2. GHCR에 이미지 push (sha 태그 + latest)
      3. k8s/*.yaml 이미지 태그 자동 업데이트
      4. git commit + push (git pull --rebase 후)
  → ArgoCD (k8s/ 변경 감지)
      → K3s 자동 rolling update
```

### 이미지 네이밍 관례

```
ghcr.io/<github-org>/<repo>:<commit-sha>          # worker / 단일 이미지
ghcr.io/<github-org>/<repo>-api:<commit-sha>      # FastAPI
ghcr.io/<github-org>/<repo>-frontend:<commit-sha> # React
```

### GitHub Actions 워크플로우 패턴

```yaml
- name: Check changed files
  id: changed
  uses: dorny/paths-filter@v3
  with:
    filters: |
      api:
        - 'api/**'

- name: Build and push
  if: steps.changed.outputs.api == 'true'
  uses: docker/build-push-action@v6
  with:
    context: ./api
    platforms: linux/amd64
    push: true
    tags: ghcr.io/${{ github.repository }}-api:${{ github.sha }}

- name: Update manifest
  if: steps.changed.outputs.api == 'true'
  run: |
    sed -i "s|image: ghcr.io/.*/.*-api:.*|image: ghcr.io/${{ github.repository }}-api:${{ github.sha }}|" k8s/api.yaml
    git config user.name "github-actions[bot]"
    git config user.email "github-actions[bot]@users.noreply.github.com"
    git add k8s/api.yaml
    git diff --staged --quiet || git commit -m "ci: update api image tag to ${{ github.sha }}"
    git pull --rebase origin main
    git push
```

> `k8s/**`, `**.md` 변경은 빌드 트리거에서 제외해야 무한 루프를 방지한다.

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - "**.md"
      - "k8s/**"
```

### 로컬 push 전 주의

GitHub Actions가 `k8s/*.yaml`에 태그를 자동 커밋하므로 로컬 push 전 항상:

```bash
git pull --rebase origin main
```

---

## 8. K8s 리소스 템플릿

### Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: <project>-secret
  namespace: <project>
type: Opaque
stringData:
  DB_HOST: "192.168.45.147"
  DB_PORT: "5432"
  DB_NAME: "<database>"
  DB_USER: "<user>"
  DB_PASSWORD: "<password>"
  PREFECT_API_URL: "http://192.168.45.147:4200/api"
  # 프로젝트 전용 키 추가
```

컨테이너에서 `envFrom`으로 전체 주입:

```yaml
envFrom:
  - secretRef:
      name: <project>-secret
```

### Deployment 리소스 기본값

| 컴포넌트 | CPU req/lim | Memory req/lim |
|----------|-------------|----------------|
| Frontend (nginx) | 50m / 200m | 64Mi / 128Mi |
| API (FastAPI) | 100m / 500m | 256Mi / 512Mi |
| Worker (Python) | 100m / 500m | 256Mi / 512Mi |

---

## 9. 접근 주소 요약

| 서비스 | 주소 |
|--------|------|
| nginx ingress (앱 진입점) | http://192.168.45.200 |
| ArgoCD UI | http://192.168.45.201 |
| Prefect UI | http://192.168.45.147:4200 |
| PostgreSQL | 192.168.45.147:5432 |
| GHCR | https://ghcr.io/<org>/<repo> |

---

## 10. 개발 머신 로컬 환경 (Mac Mini M4)

### 컨테이너 런타임: OrbStack

Docker Desktop 대신 **OrbStack** 사용. `docker` / `docker compose` CLI는 동일하게 동작한다.

```bash
# 설치 (Homebrew)
brew install orbstack

# 또는 https://orbstack.dev 에서 직접 다운로드
```

#### Docker Desktop과의 차이점

| 항목 | Docker Desktop | OrbStack |
|------|---------------|----------|
| `docker compose` 명령 | 동일 | 동일 |
| `host.docker.internal` | 지원 | 지원 (동일) |
| 컨테이너 도메인 | 없음 | `<name>.orb.local` 자동 할당 |
| Linux VM 접근 | 제한적 | `orb shell` 로 직접 접근 |
| 리소스 효율 | 보통 | 낮은 메모리/CPU 사용 |

#### 프로젝트에서 영향 없는 이유

`docker-compose.yml`의 `OLLAMA_URL: http://host.docker.internal:11434` 설정은 OrbStack에서도 동일하게 동작한다. 컨테이너 내부에서 Mac Mini 호스트(Ollama)에 접근하는 경로가 같다.

#### OrbStack 편의 기능

```bash
# 컨테이너에 도메인으로 직접 접근 (브라우저에서도 가능)
# docker compose up 후:
# http://budget-book-frontend.orb.local  → frontend
# http://budget-book-api.orb.local       → api

# Linux VM 셸 접근
orb shell

# 실행 중인 컨테이너 목록
orb list
```

#### Ollama 설정 (Mac Mini 호스트에서 실행)

OrbStack 컨테이너에서 호스트 Ollama에 접근하려면 Ollama가 모든 인터페이스에서 수신해야 한다.

```bash
# Ollama를 0.0.0.0으로 바인드 (launchd 서비스 override)
launchctl setenv OLLAMA_HOST "0.0.0.0"
# 또는 실행 시:
OLLAMA_HOST=0.0.0.0 ollama serve

# 모델 설치
ollama pull qwen2.5:7b
```

> K3s 배포 시 `k8s/secret.yaml`의 `OLLAMA_URL`에는 Mac Mini의 LAN IP를 직접 입력한다 (DHCP이므로 라우터에서 MAC 주소 기반 고정 IP 설정 권장).

---

## 12. 신규 프로젝트 온보딩 체크리스트

```
[ ] GitHub 레포 생성
[ ] NAS에 DB/유저 생성
[ ] k8s/namespace.yaml 작성 후 apply
[ ] k8s/secret.yaml 작성 후 apply (git에는 더미값 또는 제외)
[ ] k8s/deployment, service, ingress yaml 작성
[ ] GitHub Actions 워크플로우 작성 (.github/workflows/deploy.yml)
[ ] GHCR 패키지 visibility public으로 설정 (최초 push 후)
[ ] ArgoCD에 앱 등록 (k8s/ 경로 감시)
[ ] Prefect work pool 확인 및 prefect.yaml 작성
[ ] prefect deploy --all 실행
```
