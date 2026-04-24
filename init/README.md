# 초기 셋업 가이드

배포 전 한 번만 하면 되는 작업들. 순서대로 진행.

---

## 체크리스트

```
[ ] 1. NAS PostgreSQL — DB 유저/권한 설정
[ ] 2. Mac Mini — Ollama 설치 및 모델 준비
[ ] 3. Mac Mini IP 고정
[ ] 4. api/.env 작성
[ ] 5. K8s 네임스페이스 + Secret 배포
[ ] 6. GitHub 레포 생성 + GHCR 설정
[ ] 7. ArgoCD 앱 등록
```

각 항목의 상세 내용은 같은 폴더의 파일 참고:

| 파일 | 내용 |
|------|------|
| `01_nas_db.md` | PostgreSQL 유저 권한 설정 |
| `02_ollama.md` | Ollama 설치 + 모델 풀 + 서비스 설정 |
| `03_k8s.md` | namespace / secret / ArgoCD 등록 |
| `04_github.md` | 레포 생성 / GHCR / Actions secrets |
