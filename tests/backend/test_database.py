from datetime import date
from uuid import uuid4

import pytest

from src.backend.database.models import AnkiCard, CourseConfig, ResourceMeta


@pytest.mark.asyncio
async def test_check_health_returns_true(db):
    assert await db.check_health() is True


@pytest.mark.asyncio
async def test_save_and_query_first(db):
    course = CourseConfig(folder_name="Algorithms", is_active=True)
    await db.save(course)

    found = await db.query_table(
        CourseConfig,
        where_clauses=[CourseConfig.folder_name == "Algorithms"],
        mode="first",
    )
    assert found is not None
    assert found.folder_name == "Algorithms"


@pytest.mark.asyncio
async def test_save_all_and_query_all_with_limit(db):
    await db.save_all(
        [
            CourseConfig(folder_name="A", is_active=True),
            CourseConfig(folder_name="B", is_active=False),
            CourseConfig(folder_name="C", is_active=True),
        ]
    )

    results = await db.query_table(
        CourseConfig,
        order_by=[CourseConfig.folder_name],
        limit=2,
        mode="all",
    )
    assert [r.folder_name for r in results] == ["A", "B"]


@pytest.mark.asyncio
async def test_delete_removes_row(db):
    course = await db.save(CourseConfig(folder_name="ToDelete", is_active=True))
    await db.delete(course)

    found = await db.query_table(
        CourseConfig,
        where_clauses=[CourseConfig.folder_name == "ToDelete"],
        mode="first",
    )
    assert found is None


@pytest.mark.asyncio
async def test_delete_all_removes_multiple_rows(db):
    cards = [
        AnkiCard(
            id=uuid4(),
            a_content="a1",
            b_content="b1",
            course="C1",
            next_date=date.today(),
        ),
        AnkiCard(
            id=uuid4(),
            a_content="a2",
            b_content="b2",
            course="C1",
            next_date=date.today(),
        ),
    ]
    await db.save_all(cards)

    existing = await db.query_table(AnkiCard, mode="all")
    assert len(existing) == 2

    await db.delete_all(existing)
    remaining = await db.query_table(AnkiCard, mode="all")
    assert remaining == []


@pytest.mark.asyncio
async def test_refresh_all_resets_tables(db):
    await db.save(CourseConfig(folder_name="BeforeRefresh", is_active=True))
    await db.refresh_all()

    rows = await db.query_table(CourseConfig, mode="all")
    assert rows == []


@pytest.mark.asyncio
async def test_query_with_multiple_filters(db):
    await db.save_all(
        [
            CourseConfig(folder_name="C", is_active=True),
            CourseConfig(folder_name="D", is_active=True),
        ]
    )

    await db.save_all(
        [
            ResourceMeta(course="C", relative_path="one.txt", is_transcribed=True),
            ResourceMeta(course="C", relative_path="two.txt", is_transcribed=False),
            ResourceMeta(course="D", relative_path="three.txt", is_transcribed=True),
        ]
    )

    rows = await db.query_table(
        ResourceMeta,
        where_clauses=[
            ResourceMeta.course == "C",
            ResourceMeta.is_transcribed.is_(True),
        ],
        mode="all",
    )
    assert len(rows) == 1
    assert rows[0].relative_path == "one.txt"
