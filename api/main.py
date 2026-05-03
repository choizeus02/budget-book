import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI  # noqa
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routers import accounts, budgets, stats, transactions

logging.getLogger("uvicorn.access").addFilter(
    type("HealthFilter", (logging.Filter,), {
        "filter": lambda self, r: "/api/health" not in r.getMessage()
    })()
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Budget Book API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(transactions.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(budgets.router, prefix="/api")
app.include_router(stats.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
