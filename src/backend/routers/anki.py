from datetime import date, datetime, timedelta
from uuid import uuid4, UUID

from fastapi import APIRouter, HTTPException, Request
from loguru import logger

from src.backend.database.db import DataBase
from src.backend.database.models import AnkiCard, CourseConfig, SimpleAnkiCard

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
async def get_due(request: Request, course: str | None = None) -> list[AnkiCard]:
    db: DataBase = request.app.state.db
    logger.debug("anki due requested: course={}", course)

    where = [AnkiCard.next_date < datetime.now()]
    if course is not None:
        where.append(AnkiCard.course == course)

    cards = await db.query_table(AnkiCard, where_clauses=where)
    logger.info("anki due result: course={}, count={}", course, len(cards))
    return cards


@anki_router.get("/all")
async def get_all(request: Request, course: str | None = None) -> list[AnkiCard]:
    db: DataBase = request.app.state.db
    logger.debug("anki all requested: course={}", course)

    cards = await db.query_table(
        AnkiCard,
        where_clauses=[AnkiCard.course == course] if course is not None else [],
    )
    logger.info("anki all result: course={}, count={}", course, len(cards))
    return cards


@anki_router.post("/cards")
async def save_all(cards: list[SimpleAnkiCard], request: Request):
    db: DataBase = request.app.state.db
    logger.info("anki bulk save requested: count={}", len(cards))

    courses = {i.folder_name for i in await db.query_table(CourseConfig)}
    for card in cards:
        if card.course not in courses:
            raise HTTPException(404, f"Course {card.course} does not exist")

    cards = [AnkiCard(**card.model_dump(), id=uuid4()) for card in cards]

    await db.save_all(cards)
    logger.info("anki bulk save completed: count={}", len(cards))


@anki_router.put("/api/anki/{card_id}/review")
async def review_card(card_id: UUID, quality: int, request: Request):
    logger.info("anki review requested: card_id={}, quality={}", card_id, quality)
    if quality < 0 or quality > 5:
        raise HTTPException(400, detail=f"{quality} is invalid val")

    db: DataBase = request.app.state.db

    card = await db.query_table(
        AnkiCard, where_clauses=[AnkiCard.id == card_id], mode="first"
    )
    if card is None:
        raise HTTPException(404, detail="Card not found")

    inplace_update_anki_card_vals(card, quality)
    await db.save(card)
    logger.info(
        "anki review saved: card_id={}, next_date={}, interval={}, ef={}",
        card_id,
        card.next_date,
        card.interval,
        card.easiness_factor,
    )


@anki_router.put("/api/anki")
async def update_card(card: AnkiCard, request: Request):
    db: DataBase = request.app.state.db
    logger.info("anki card update requested: card_id={}", card.id)
    await db.save(card)
    logger.info("anki card update completed: card_id={}", card.id)


@anki_router.delete("/api/anki/{card_id}")
async def delete_card(card_id: UUID, request: Request):
    db: DataBase = request.app.state.db
    logger.info("anki card delete requested: card_id={}", card_id)
    card = await db.query_table(
        AnkiCard, where_clauses=[AnkiCard.id == card_id], mode="first"
    )
    if card is None:
        raise HTTPException(404, detail="Card not found")
    await db.delete(card)
    logger.info("anki card delete completed: card_id={}", card_id)
    return {"status": "success"}
