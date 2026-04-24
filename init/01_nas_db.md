# 01. NAS PostgreSQL 설정

DB는 이미 생성됨 (`budget_db`). 유저 권한만 부여하면 됨.

## 접속

```bash
psql -h 192.168.45.147 -U postgres
```

## 유저 생성 + 권한 부여

```sql
-- 유저 생성 (이미 있으면 스킵)
CREATE USER budget_book WITH PASSWORD '여기에_비밀번호';

-- DB 소유권 또는 권한 부여
GRANT ALL PRIVILEGES ON DATABASE budget_db TO budget_book;

-- DB 접속 후 스키마 권한 (PostgreSQL 15+에서 필요)
\c budget_db
GRANT ALL ON SCHEMA public TO budget_book;
```

## 접속 확인

```bash
psql -h 192.168.45.147 -U budget_book -d budget_db
```

> 테이블은 FastAPI 앱 첫 실행 시 SQLAlchemy가 자동 생성함 (`init_db()` 호출).
