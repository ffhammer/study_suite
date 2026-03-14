import os
import sys
import time
from contextlib import asynccontextmanager
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from src.backend.config import ApiConfig
from src.backend.database.db import DataBase
from src.backend.llm import DEFAULT_SYSTEM_PROMPT, load_agent
from src.backend.routers.anki import anki_router
from src.backend.routers.courses import courses
from src.backend.routers.files import file_router
from src.backend.routers.llm import chat_router


def configure_logging(config: ApiConfig) -> None:
    logger.remove()
    logger.add(
        sys.stderr,
        level=config.LOG_LEVEL.upper(),
        format=config.LOG_FORMAT,
        backtrace=False,
        diagnose=False,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Context manager for application startup and shutdown events.
    Initializes database, rate limiter, and observability tools.
    """
    load_dotenv(".env", override=False)
    app.state.config = ApiConfig()
    configure_logging(app.state.config)

    logger.info(
        "Application startup: Initializing resources (log_level={}, vault={})",
        app.state.config.LOG_LEVEL,
        app.state.config.VAULT_BASE_PATH,
    )

    os.makedirs(app.state.config.VAULT_BASE_PATH, exist_ok=True)
    app.state.db = DataBase(config=app.state.config)
    app.state.transcription_jobs = {}
    app.state.chat_settings = {
        "provider": app.state.config.LLM_PROVIDER,
        "model": app.state.config.LLM_DEFAULT_MODEL,
        "system_prompt": DEFAULT_SYSTEM_PROMPT,
    }
    try:
        app.state.agent = load_agent(app.state.config)
        logger.info(
            "LLM agent loaded successfully (provider={}, model={})",
            app.state.config.LLM_PROVIDER,
            app.state.config.LLM_DEFAULT_MODEL,
        )
    except ValueError as e:
        logger.warning(
            f"LLM agent disabled at startup: {e}. Set GEMINI_API_KEY or GOOGLE_API_KEY to enable /chat/."
        )
        app.state.agent = None

    assert await app.state.db.check_health()
    logger.debug("Database health check passed")
    await app.state.db.initialize_db()
    logger.info("Database initialized")
    yield

    logger.info("Application shutdown complete.")


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(anki_router)
app.include_router(courses)
app.include_router(file_router)
app.include_router(chat_router)


@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    request_id = str(uuid4())[:8]
    start = time.perf_counter()
    path = request.url.path
    method = request.method

    logger.debug("[{}] {} {} - start", request_id, method, path)
    try:
        response = await call_next(request)
    except Exception:
        duration_ms = (time.perf_counter() - start) * 1000
        logger.exception(
            "[{}] {} {} - unhandled error after {:.1f}ms",
            request_id,
            method,
            path,
            duration_ms,
        )
        raise

    duration_ms = (time.perf_counter() - start) * 1000
    logger.log(
        "INFO" if response.status_code < 400 else "WARNING",
        "[{}] {} {} -> {} in {:.1f}ms",
        request_id,
        method,
        path,
        response.status_code,
        duration_ms,
    )
    return response


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
