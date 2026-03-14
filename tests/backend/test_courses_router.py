import pytest
from fastapi import HTTPException

from src.backend.database.models import CourseConfig, ResourceMeta
from src.backend.routers.courses import (
    course_tree,
    create_course,
    list_courses,
    rename_course,
    togge_acticity,
)


@pytest.mark.asyncio
async def test_create_course_persists_and_creates_dir(
    db, request_with_state, vault_dir
):
    await create_course("LinearAlgebra", request_with_state)

    in_db = await db.query_table(
        CourseConfig,
        where_clauses=[CourseConfig.folder_name == "LinearAlgebra"],
        mode="first",
    )
    assert in_db is not None
    assert (vault_dir / "LinearAlgebra").exists()


@pytest.mark.asyncio
async def test_create_course_rejects_blank_name(request_with_state):
    with pytest.raises(HTTPException) as err:
        await create_course("   ", request_with_state)
    assert err.value.status_code == 400


@pytest.mark.asyncio
async def test_create_course_rejects_duplicates(db, request_with_state, vault_dir):
    await db.save(CourseConfig(folder_name="Math", is_active=True))
    (vault_dir / "Math").mkdir(parents=True, exist_ok=True)

    with pytest.raises(HTTPException) as err:
        await create_course("Math", request_with_state)
    assert err.value.status_code == 409


@pytest.mark.asyncio
async def test_list_courses_filters_missing_directories(
    db, request_with_state, vault_dir
):
    await db.save_all(
        [
            CourseConfig(folder_name="Existing", is_active=True),
            CourseConfig(folder_name="Missing", is_active=True),
        ]
    )
    (vault_dir / "Existing").mkdir(parents=True, exist_ok=True)

    courses = await list_courses(request_with_state)
    names = {c.folder_name for c in courses}

    assert names == {"Existing"}


@pytest.mark.asyncio
async def test_toggle_activity_flips_boolean(db, request_with_state):
    await db.save(CourseConfig(folder_name="C1", is_active=True))

    await togge_acticity("C1", request_with_state)
    updated = await db.query_table(
        CourseConfig,
        where_clauses=[CourseConfig.folder_name == "C1"],
        mode="first",
    )
    assert updated.is_active is False


@pytest.mark.asyncio
async def test_toggle_activity_missing_course_raises(request_with_state):
    with pytest.raises(HTTPException) as err:
        await togge_acticity("Nope", request_with_state)
    assert err.value.status_code == 404


@pytest.mark.asyncio
async def test_rename_course_success(db, request_with_state, vault_dir):
    await db.save(CourseConfig(folder_name="OldName", is_active=True))
    (vault_dir / "OldName").mkdir(parents=True, exist_ok=True)

    await rename_course("OldName", "NewName", request_with_state)

    moved_path = vault_dir / "NewName"
    old_path = vault_dir / "OldName"
    in_db = await db.query_table(
        CourseConfig,
        where_clauses=[CourseConfig.folder_name == "NewName"],
        mode="first",
    )

    assert moved_path.exists()
    assert not old_path.exists()
    assert in_db is not None


@pytest.mark.asyncio
async def test_rename_course_missing_source_raises(request_with_state):
    with pytest.raises(HTTPException) as err:
        await rename_course("NoCourse", "SomeName", request_with_state)
    assert err.value.status_code == 404


@pytest.mark.asyncio
async def test_rename_course_conflict_raises(db, request_with_state, vault_dir):
    await db.save_all(
        [
            CourseConfig(folder_name="Src", is_active=True),
            CourseConfig(folder_name="Dst", is_active=True),
        ]
    )
    (vault_dir / "Src").mkdir(parents=True, exist_ok=True)
    (vault_dir / "Dst").mkdir(parents=True, exist_ok=True)

    with pytest.raises(HTTPException) as err:
        await rename_course("Src", "Dst", request_with_state)
    assert err.value.status_code == 404


@pytest.mark.asyncio
async def test_course_tree_returns_file_entries_with_metadata(
    db, request_with_state, vault_dir
):
    await db.save(CourseConfig(folder_name="CourseA", is_active=True))
    course_dir = vault_dir / "CourseA"
    course_dir.mkdir(parents=True, exist_ok=True)
    file_path = course_dir / "notes.txt"
    file_path.write_text("hello", encoding="utf-8")

    await db.save(ResourceMeta(course="CourseA", relative_path="notes.txt"))

    tree = await course_tree("CourseA", request_with_state)

    assert len(tree) == 1
    assert tree[0].relative_path == "notes.txt"
    assert tree[0].size == 5


@pytest.mark.asyncio
async def test_course_tree_missing_course_raises(request_with_state):
    with pytest.raises(HTTPException) as err:
        await course_tree("NoCourse", request_with_state)
    assert err.value.status_code == 404
