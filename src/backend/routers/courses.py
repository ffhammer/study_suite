import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from loguru import logger

from src.backend.config import ApiConfig
from src.backend.database.db import DataBase
from src.backend.database.models import CourseConfig, ResourceMeta

courses = APIRouter(prefix="/courses", tags=["courses"])


@courses.get("/list")
async def list_courses(request: Request) -> list[CourseConfig]:
    db: DataBase = request.app.state.db
    config: ApiConfig = request.app.state.config
    courses: list[CourseConfig] = await db.query_table(CourseConfig, mode="all")
    logger.debug("list courses requested")

    exist = []
    for course in courses:
        path = Path(config.VAULT_BASE_PATH) / course.folder_name
        if not path.exists():
            logger.error(f"{path} does not exist but should!!")
            continue
        exist.append(course)

    logger.info("list courses result: {} available", len(exist))
    return exist


@courses.put("/rename")
async def rename_course(course_name: str, new_name: str, request: Request):
    db: DataBase = request.app.state.db
    config: ApiConfig = request.app.state.config
    logger.info("rename course requested: {} -> {}", course_name, new_name)
    course: CourseConfig = await db.query_table(
        CourseConfig,
        mode="first",
        where_clauses=[CourseConfig.folder_name == course_name],
    )

    if (
        course is None
        or not (Path(config.VAULT_BASE_PATH) / course.folder_name).exists()
    ):
        raise HTTPException(status_code=404, detail="Course not found")

    new: CourseConfig = await db.query_table(
        CourseConfig,
        mode="first",
        where_clauses=[CourseConfig.folder_name == new_name],
    )

    old_path = Path(config.VAULT_BASE_PATH) / course.folder_name
    new_path = Path(config.VAULT_BASE_PATH) / new_name

    if new is not None or new_path.exists():
        raise HTTPException(status_code=404, detail="New Name Exists Already")

    try:
        shutil.move(old_path, new_path)
        course.folder_name = new_name
        try:
            course.folder_name = new_name
            await db.save(course)
        except Exception as db_e:
            shutil.move(new_path, old_path)  # Rollback disk move
            raise db_e
    except Exception as e:
        logger.exception(f"Rename Course Failed with {e}")
        raise HTTPException(status_code=500)


@courses.put("/course/{course_name}/toggle-activity")
async def togge_acticity(course_name: str, request: Request):
    db: DataBase = request.app.state.db
    logger.info("toggle course activity requested: {}", course_name)
    course: CourseConfig = await db.query_table(
        CourseConfig,
        mode="first",
        where_clauses=[CourseConfig.folder_name == course_name],
    )

    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    course.is_active = not course.is_active
    await db.save(course)


@courses.put("/create_course/")
async def create_course(course_name: str, request: Request):
    db: DataBase = request.app.state.db
    config: ApiConfig = request.app.state.config
    logger.info("create course requested: {}", course_name)

    course: CourseConfig = await db.query_table(
        CourseConfig,
        mode="first",
        where_clauses=[CourseConfig.folder_name == course_name],
    )

    path = Path(config.VAULT_BASE_PATH) / course_name

    if not course_name.strip():
        raise HTTPException(status_code=400, detail="course_name cannot be empty")

    if course is not None or path.exists():
        raise HTTPException(status_code=409, detail="Course already exists")

    path.mkdir(parents=True)
    await db.save(CourseConfig(folder_name=course_name, is_active=True))
    logger.info("course created: {}", course_name)


@courses.get("/course/{course_name}/tree")
async def course_tree(course_name, request: Request) -> list[ResourceMeta]:
    """Returns Folder Tree as a simple flat list, the UI can make a tree out of it easily based on real path"""
    db: DataBase = request.app.state.db
    config: ApiConfig = request.app.state.config
    logger.debug("course tree requested: {}", course_name)
    course: CourseConfig = await db.query_table(
        CourseConfig,
        mode="first",
        where_clauses=[CourseConfig.folder_name == course_name],
    )

    course_path: Path = Path(config.VAULT_BASE_PATH) / course_name

    if course is None or not course_path.exists():
        raise HTTPException(status_code=404, detail="Course not found")

    rel_to_metadata = {
        i.relative_path: i
        for i in await db.query_table(
            ResourceMeta, where_clauses=[ResourceMeta.course == course_name], mode="all"
        )
    }

    files = []
    for item_path in course_path.rglob("*"):
        if item_path.is_dir():
            continue

        rel_path = str(item_path.relative_to(course_path))
        meta: ResourceMeta = rel_to_metadata.get(
            rel_path,
            ResourceMeta(
                course=course_name,
                relative_path=rel_path,
            ),
        )

        # include metadata
        stat = item_path.stat()
        meta.last_processed = datetime.fromtimestamp(stat.st_mtime)
        meta.size = stat.st_size

        files.append(meta)
    logger.info("course tree built: course={}, files={}", course_name, len(files))
    return files
