from typing import AsyncGenerator
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession

from server.service.db.database import AsyncSessionLocal
from server.service.application.user.utils import *
from server.service.integrations import TranslationService, HandleMaskService
import httpx
from server.service.application.tasks.manager import TaskAnalyzeManager
from server.service.integrations.websocket.websocket_manager import WebSocketManager

_websocket_manager = WebSocketManager()
_http_client = httpx.AsyncClient()
_task_manager = TaskAnalyzeManager(
    db_session_factory=AsyncSessionLocal,
    http_client=_http_client,
    ws_manager=_websocket_manager,
)

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


def get_websocket_manager() -> WebSocketManager:
    return _websocket_manager


def get_task_manager() -> TaskAnalyzeManager:
    return _task_manager


async def close_task_runtime() -> None:
    await _task_manager.shutdown()
    await _http_client.aclose()

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
    "WebSocketManager",
    "TaskAnalyzeManager",
    "get_websocket_manager",
    "get_task_manager",
    "close_task_runtime",
]
