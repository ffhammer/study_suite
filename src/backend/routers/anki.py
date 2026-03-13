from datetime import datetime

from fastapi import APIRouter, HTTPException, Request

from src.backend.database.db import DataBase
from src.backend.database.models import AnkiCard, SimpleAnkiCard, CourseConfig
from datetime import date, timedelta
from uuid import uuid4

anki_router = APIRouter(prefix="/anki", tags=["anki"])


def inplace_update_anki_card_vals(card: AnkiCard, quality: int) -> None:
    assert 0 <= quality <= 5
    if quality < 3:
        card.repetitions = 0
        card.interval = 1
    else:
        card.repetitions += 1
        if card.repetitions == 1:
            card.interval = 1
        elif card.repetitions == 2:
            card.interval = 6
        else:
            card.interval = int(round(card.interval * card.easiness_factor))
    card.easiness_factor = max(
        1.3,
        card.easiness_factor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
    )
    card.quality = quality
    card.next_date = date.today() + timedelta(days=card.interval)


@anki_router.get("/due")
async def get_due(request: Request) -> list[AnkiCard]:
    db: DataBase = request.app.state.db

    return await db.query_table(
        AnkiCard, where_clauses=[AnkiCard.next_date < datetime.now()]
    )


@anki_router.get("/all")
async def get_all(request: Request) -> list[AnkiCard]:
    db: DataBase = request.app.state.db

    return await db.query_table(
        AnkiCard,
    )


@anki_router.post("/cards")
async def save_all(cards: list[SimpleAnkiCard], request: Request):
    db: DataBase = request.app.state.db

    courses = set(await db.query_table(CourseConfig))
    for card in cards:
        if card.course not in courses:
            return HTTPException(404, f"Course {card.course } does not exist")

    cards = [AnkiCard(**card.model_dump(), id=uuid4()) for card in cards]

    await db.save_all(cards)


@anki_router.put("/api/anki/{card_id}/review")
async def review_card(card_id: int, quality: float, request: Request):
    if quality < 0 or quality > 5:
        return HTTPException(400, detail=f"{quality} is invalid val")

    db: DataBase = request.app.state.db

    card = await db.query_table(
        AnkiCard, where_clauses=[AnkiCard.id == card_id], mode="first"
    )
    if card is None:
        return HTTPException(404, detail="Card not found")

    inplace_update_anki_card_vals(card, quality)
    await db.save(card)


@anki_router.put("/api/anki")
async def update_card(card: AnkiCard, request: Request):

    db: DataBase = request.app.state.db
    await db.save(card)
