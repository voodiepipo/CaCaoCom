from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import models  # noqa: F401  (registers tables on Base.metadata)
from app.config import get_settings
from app.database import Base, engine
from app.routers import baselines, farmers, plots, settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Sprint 1: create tables on startup. Switch to Alembic migrations before real data exists.
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title=get_settings().app_name, version="0.1.0", lifespan=lifespan)

for router in (farmers.router, plots.router, baselines.router, settings.router):
    app.include_router(router, prefix="/api/v1")


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}
