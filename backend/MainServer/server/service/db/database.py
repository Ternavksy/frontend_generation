import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from server.core.config import settings

# Создание асинхронного engine
engine = create_async_engine(
    settings.DB.url,
    echo=False,  # Включить для отладки SQL-запросов
    pool_pre_ping=True,  # Проверка соединения перед использованием
    pool_recycle=3600,   # Пересоздание соединений каждые 1 час
)

# Фабрика сессий
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

# Экспорт для удобства импорта
__all__ = ["engine", "AsyncSessionLocal"]


"""
Миграции в бд:
alembic init alembic
alembic revision --autogenerate -m "Initial tables"
alembic upgrade head


Проверка миграций
alembic current
"""