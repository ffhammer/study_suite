from datetime import date, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException

from src.backend.database.models import AnkiCard, CourseConfig, SimpleAnkiCard
from src.backend.routers.anki import (
    delete_card,
    get_all,
    get_due,
    inplace_update_anki_card_vals,
    review_card,
    save_all,
    update_card,
)


def test_inplace_update_resets_for_low_quality():
    card = AnkiCard(
        id=uuid4(),
        a_content="Q",
        b_content="A",
        course="CourseA",
        repetitions=4,
        interval=20,
        quality=4,
    )
    inplace_update_anki_card_vals(card, quality=2)

    assert card.repetitions == 0
    assert card.interval == 1
    assert card.quality == 2
    assert card.next_date >= date.today()


def test_inplace_update_progresses_for_good_quality():
    card = AnkiCard(
        id=uuid4(),
        a_content="Q",
        b_content="A",
        course="CourseA",
        repetitions=2,
        interval=6,
        quality=4,
    )
    inplace_update_anki_card_vals(card, quality=5)

    assert card.repetitions == 3
    assert card.interval >= 6
    assert card.easiness_factor >= 1.3


@pytest.mark.asyncio
async def test_get_all_filters_by_course(db, request_with_state):
    await db.save_all(
        [
            AnkiCard(id=uuid4(), a_content="Q1", b_content="A1", course="A"),
            AnkiCard(id=uuid4(), a_content="Q2", b_content="A2", course="B"),
        ]
    )

    all_cards = await get_all(request_with_state)
    course_a = await get_all(request_with_state, course="A")

    assert len(all_cards) == 2
    assert len(course_a) == 1
    assert course_a[0].course == "A"


@pytest.mark.asyncio
async def test_get_due_returns_only_due_cards(db, request_with_state):
    due_card = AnkiCard(
        id=uuid4(),
        a_content="Old",
        b_content="Due",
        course="A",
        next_date=date.today() - timedelta(days=1),
    )
    future_card = AnkiCard(
        id=uuid4(),
        a_content="Future",
        b_content="Later",
        course="A",
        next_date=date.today() + timedelta(days=3),
    )
    await db.save_all([due_card, future_card])

    due_cards = await get_due(request_with_state, course="A")
    assert len(due_cards) == 1
    assert due_cards[0].a_content == "Old"


@pytest.mark.asyncio
async def test_save_all_requires_existing_course(db, request_with_state):
    payload = [SimpleAnkiCard(a_content="Q", b_content="A", course="Missing")]
    with pytest.raises(HTTPException) as err:
        await save_all(payload, request_with_state)
    assert err.value.status_code == 404


@pytest.mark.asyncio
async def test_save_all_persists_cards(db, request_with_state):
    await db.save(CourseConfig(folder_name="CourseA", is_active=True))
    payload = [
        SimpleAnkiCard(a_content="Q1", b_content="A1", course="CourseA"),
        SimpleAnkiCard(a_content="Q2", b_content="A2", course="CourseA"),
    ]

    await save_all(payload, request_with_state)
    saved = await db.query_table(AnkiCard, mode="all")
    assert len(saved) == 2


@pytest.mark.asyncio
async def test_review_card_validates_quality(request_with_state):
    with pytest.raises(HTTPException) as err:
        await review_card(uuid4(), quality=9, request=request_with_state)
    assert err.value.status_code == 400


@pytest.mark.asyncio
async def test_review_card_not_found(db, request_with_state):
    with pytest.raises(HTTPException) as err:
        await review_card(uuid4(), quality=4, request=request_with_state)
    assert err.value.status_code == 404


@pytest.mark.asyncio
async def test_review_card_updates_card(db, request_with_state):
    card = await db.save(
        AnkiCard(
            id=uuid4(),
            a_content="Q",
            b_content="A",
            course="CourseA",
            next_date=date.today(),
        )
    )

    await review_card(card.id, quality=5, request=request_with_state)
    updated = await db.query_table(
        AnkiCard, where_clauses=[AnkiCard.id == card.id], mode="first"
    )
    assert updated is not None
    assert updated.quality == 5
    assert updated.repetitions >= 1


@pytest.mark.asyncio
async def test_update_and_delete_card(db, request_with_state):
    card = await db.save(
        AnkiCard(id=uuid4(), a_content="Q", b_content="A", course="CourseA")
    )
    card.b_content = "A updated"

    await update_card(card, request_with_state)
    updated = await db.query_table(
        AnkiCard, where_clauses=[AnkiCard.id == card.id], mode="first"
    )
    assert updated.b_content == "A updated"

    result = await delete_card(card.id, request_with_state)
    assert result["status"] == "success"

    missing = await db.query_table(
        AnkiCard, where_clauses=[AnkiCard.id == card.id], mode="first"
    )
    assert missing is None
