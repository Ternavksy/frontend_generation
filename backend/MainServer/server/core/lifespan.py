from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
import asyncio
from sqlalchemy import select, text
import logging
from sqlalchemy.ext.asyncio import AsyncSession

from server.core.dependencies import close_task_runtime, get_database_context, get_task_manager
from server.service.db.database import engine
from server.service.db.shemas.models import Base
from server.service.dal.repositories.cache_repository import ModelConfigRepository
from server.core.config import settings
from server.service.db.shemas.admin import add_event_listen

logger = logging.getLogger(__name__)

async def _init_database_classes(db: AsyncSession):
    """Инициализация справочников классов в БД при старте"""
    try:
        result = await db.execute(select(ModelConfigRepository.model))
        existing = {
            (item.name, item.type): item
            for item in result.scalars().all()
        }

        for item in settings.MODEL_CONFIG_DEFAULT:
            key = (item.name, item.type)
            model = existing.get(key)
            if model:
                model.endpoint_url = item.endpoint_url
                model.is_active = item.is_active
            else:
                db.add(
                    ModelConfigRepository.model(
                        name=item.name,
                        type=item.type,
                        endpoint_url=item.endpoint_url,
                        is_active=item.is_active
                    )
                )

        if settings.MODEL_CONFIG_DEFAULT:
            await db.commit()
            
    except Exception as e:
        await db.rollback()
        raise  # Или return, если продолжить без справочника

async def wait_for_db(max_retries: int = 10, delay: float = 2.0):
    """Ожидание готовности базы данных с повторными попытками"""
    for attempt in range(max_retries):
        try:
            async with engine.begin() as conn:
                await conn.execute(text("SELECT 1"))
                logger.info("Database connection successful")
                return True
        except Exception as e:
            logger.warning(f"Database not ready (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                await asyncio.sleep(delay)
            else:
                logger.error("Failed to connect to database after all attempts")
                raise

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Управление жизненным циклом приложения.
    Выполняется при старте и остановке сервера.
    """

    await wait_for_db(max_retries=30, delay=2.0)

    # Создание таблиц (если не существуют)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # Инициализация моделей и ссылок на них
    async with get_database_context() as db:
        await _init_database_classes(db)
        await get_task_manager().initialize_from_repository(db)
    
    # Регистрация событий БД для инвалидации кэша
    add_event_listen()    
    
    yield
    
    # Корректное закрытие пула соединений
    await close_task_runtime()
    await engine.dispose()
