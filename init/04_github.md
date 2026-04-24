# 04. GitHub 레포 + CI/CD 설정

## 1. GitHub 레포 생성

```bash
gh repo create budget-book --private
git init && git add . && git commit -m "init"
git remote add origin https://github.com/<org>/budget-book.git
git push -u origin main
```

---

## 2. GHCR 패키지 visibility 설정

첫 GitHub Actions 빌드가 완료된 후:

1. GitHub → 본인 프로필 → Packages
2. `budget-book-api`, `budget-book-frontend` 각각 클릭
3. Package settings → Change visibility → **Public**

> K3s에서 imagePullSecrets 없이 pull하려면 public이어야 함.
> Private으로 유지하려면 K8s에 imagePullSecrets 추가 필요.

---

## 3. GitHub Actions Secrets 설정

레포 → Settings → Secrets and variables → Actions → New repository secret:

| Secret 이름 | 값 |
|------------|-----|
| (없음) | `GITHUB_TOKEN`은 Actions에서 자동 제공됨 |

별도 secret 불필요. `GITHUB_TOKEN`으로 GHCR push 가능.

---

## 4. 첫 배포 트리거

```bash
# 코드 변경 후 push → Actions 자동 실행
git push origin main

# Actions 진행 확인
gh run list
gh run watch
```

Actions 완료 후 ArgoCD가 k8s/*.yaml 변경을 감지해 자동 롤아웃.
