import asyncio
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from config import settings

engine = create_async_engine(settings.database_url, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


def _alembic_config():
    from alembic.config import Config

    base_dir = Path(__file__).resolve().parent
    cfg = Config(str(base_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(base_dir / "alembic"))
    return cfg


async def init_db():
    """스키마를 alembic 마이그레이션으로 최신화.

    alembic 도입 이전(create_all)에 만들어진 DB는 alembic_version이 없으므로
    baseline(0001)을 stamp한 뒤 이후 마이그레이션만 적용한다.
    """
    from alembic import command

    async with engine.connect() as conn:
        def _check(sync_conn):
            insp = inspect(sync_conn)
            return insp.has_table("alembic_version"), insp.has_table("transactions")

        has_version, has_tables = await conn.run_sync(_check)

    cfg = _alembic_config()
    # alembic env.py는 자체 이벤트 루프(asyncio.run)를 쓰므로 별도 스레드에서 실행
    if has_tables and not has_version:
        await asyncio.to_thread(command.stamp, cfg, "0001")
    await asyncio.to_thread(command.upgrade, cfg, "head")
