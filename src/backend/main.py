import asyncio
from fastapi import FastAPI
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from src.backend.database.db import DataBase
from src.backend.config import ApiConfig

from dotenv import load_dotenv


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Context manager for application startup and shutdown events.
    Initializes database, rate limiter, and observability tools.
    """
    load_dotenv(".env", override=False)
    app.config = ApiConfig()

    logger.info("Application startup: Initializing resources...")
    app.state.db = DataBase(config=app.config)
    assert await app.state.db.check_health()
    await app.state.db.initialize_db()
    yield

    logger.info("Application shutdown complete.")


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def get_health():
    return {"status": "healthy"}


@app.get("/")
def read_root():
    return {"Hello": "World"}
