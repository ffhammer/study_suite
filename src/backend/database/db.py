from typing import Literal, Type

from loguru import logger
from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, select

from src.backend.config import ApiConfig

from .models import *  # noqa: F401


class DataBase:
    """
    Handles all database operations related to chat requests using SQLModel.
    """

    def __init__(self, config: ApiConfig):
        self.engine = create_async_engine(config.DATABASE_URL)

        @event.listens_for(self.engine.sync_engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        self.session_maker = async_sessionmaker(self.engine, expire_on_commit=False)

    async def initialize_db(self) -> None:
        """
        Call this after creating an instance.
        """
        async with self.engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)
        logger.info("Database tables created (if they didn't exist)")

    async def save_all(self, data: list[Type[SQLModel]]) -> None:
        """
        Saves a list of SQLModel instances to the database.
        """

        async with self.session_maker() as sess:
            for obj in data:
                await sess.merge(obj)
            await sess.commit()

    async def save(self, obj: SQLModel) -> SQLModel:
        """
        Merges the object into a session, commits it, and returns the refreshed version.
        """
        async with self.session_maker() as sess:
            # merge 'attaches' your detached object to this session
            merged = await sess.merge(obj)
            await sess.commit()
            # refresh ensures we have the latest data (IDs, defaults, etc.)
            await sess.refresh(merged)
            return merged

    async def refresh_all(self):
        """
        Drops all tables and recreates them. Use with caution.
        """
        async with self.engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.drop_all)
            await conn.run_sync(SQLModel.metadata.create_all)
        logger.info("Database refreshed (all tables dropped and recreated).")

    async def check_health(self) -> bool:
        """
        Performs a simple database health check by executing a trivial query.
        """
        try:
            async with self.engine.connect() as conn:
                await conn.execute(select(1))
            return True
        except Exception as e:
            logger.error(f"DB health check failed: {e}")
            return False

    async def query_table(
        self,
        table_model: Type[SQLModel],
        where_clauses: list = None,
        order_by: list = None,
        limit: None | int = None,
        mode: Literal["all", "first"] = "all",
        options: list = None,
    ) -> list[SQLModel] | SQLModel | None:
        async with self.session_maker() as session:
            statement = select(table_model)
            if options:
                for opt in options:
                    statement = statement.options(opt)
            if where_clauses:
                for clause in where_clauses:
                    statement = statement.where(clause)
            if order_by:
                for order in order_by:
                    statement = statement.order_by(order)
            if limit:
                statement = statement.limit(limit)
            result = await session.execute(statement)
            if mode == "first":
                return result.scalars().first()
            return list(result.scalars().all())

    async def delete(self, obj: SQLModel) -> None:
        """
        Deletes the given object from the database if it exists.
        """
        async with self.session_maker() as sess:
            merged = await sess.merge(obj)
            await sess.delete(merged)
            await sess.commit()

    async def delete_all(self, objs: list[SQLModel]) -> None:
        """
        Deletes all given objects from the database if they exist.
        """
        async with self.session_maker() as sess:
            for obj in objs:
                merged = await sess.merge(obj)
                await sess.delete(merged)
            await sess.commit()
