from typing import AsyncGenerator
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession

from server.service.db.database import AsyncSessionLocal
from server.service.application.user.utils import *
from server.service.integrations import TranslationService, HandleMaskService

async def get_database() -> AsyncGenerator[AsyncSession, None]:
    """Dependency для инъекции сессии БД"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


get_database_context = asynccontextmanager(get_database)

__all__ = [
    "get_database",
    "get_database_context",
    "get_token", 
    "validate_token",
    "get_auth_data",
    "cheack_password",
    "is_too_similar",
    "search_check_user",
    "get_definition_user",
    "TranslationService",
    "HandleMaskService",
]
