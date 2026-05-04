from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, ClassVar, Dict
from sqlalchemy import select
import asyncio

from server.service.dal.repositories.base_repository import BaseRepository
from server.service.db.shemas.models import ModelConfig
from server.service.transport.base_transport import ModelConfigBase


class ModelConfigRepository(BaseRepository[ModelConfig]):
    model = ModelConfig

    @classmethod
    async def get_all_as_dicts(cls, db: AsyncSession) -> list[ModelConfigBase]:
        stmt = select(cls.model.id, cls.model.name, cls.model.type, cls.model.endpoint_url, cls.model.is_active)
        result = await db.execute(stmt)
        return [
            ModelConfigBase.model_validate(row._mapping) 
            for row in result
        ]


class CacheObjectClassesRepository:
    # Классовые переменные для кэша
    _base_classes_cache: ClassVar[Optional[list[ModelConfigBase]]] = None
    _cache_lock: ClassVar = asyncio.Lock()  # для async-безопасности

    @classmethod
    async def _ensure_cache_loaded(cls, db: AsyncSession) -> None:
        """Ленивая инициализация кэша — один раз на всё приложение."""
        if cls._base_classes_cache is not None:
            return  # уже загружено

        # Защита от гонки: только один вызов может инициализировать
        async with cls._cache_lock:
            # Повторная проверка — после получения лока
            if cls._base_classes_cache is not None:
                return

            # Загружаем один раз
            cls._base_classes_cache = await ModelConfigRepository.get_all_as_dicts(db)

    @classmethod
    def invalidate_cache(cls) -> None:
        # Для sync-контекста (SQLAdmin) — можно без await, просто сбросить
        cls._base_classes_cache = None

    @classmethod
    async def get_base_classes(cls, db: AsyncSession) -> list[ModelConfigBase]:
        await cls._ensure_cache_loaded(db=db)
        assert cls._base_classes_cache is not None, "Cache failed to load"
        return cls._base_classes_cache
    
    @classmethod
    async def get_dict_base_classes(cls, db: AsyncSession) -> Dict[str, str]:
        await cls._ensure_cache_loaded(db=db)
        assert cls._base_classes_cache is not None, "Cache failed to load"
        return {
            f"{row.name}_{row.type}": row.endpoint_url 
            for row in cls._base_classes_cache
        }
