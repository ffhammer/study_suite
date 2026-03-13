import asyncio
from fastapi import FastAPI
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger
from src.backend.database.db import DataBase
from src.backend.config import ApiConfig
from src.backend.routers.anki import anki_router
import os

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

    os.makedirs(app.config.VAULT_BASE_PATH, exist_ok=True)
    app.state.db = DataBase(config=app.config)

    assert await app.state.db.check_health()
    await app.state.db.initialize_db()
    yield

    logger.info("Application shutdown complete.")


app = FastAPI(lifespan=lifespan)
app.include_router(anki_router)


@app.get("/health")
def get_health():
    return {"status": "healthy"}


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/info/supported-types")
def list_audio_files(request: Request) -> list[str]:
    """List of Supported Audio Files with keys audio,img,video"""

    config: ApiConfig = request.app.state.config
    return {
        "audio": config.AUDIO_SUFFIXES,
        "img": config.IMG_SUFFIXES,
        "video": config.VIDEO_SUFFIXES,
    }
