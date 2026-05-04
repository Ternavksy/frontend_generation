from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from typing import List
from uuid import UUID
import asyncio

from server.service.dal.repositories.base_repository import BaseRepository
from server.service.db.shemas.models import Image, Annotation, Mask, ImageType, ClassTypeProject

class ImageRepository(BaseRepository[Image]):
    model = Image

    @classmethod
    async def find_by_project_with_annotations(cls, db: AsyncSession, project_id: UUID) -> List[Image]:
        """
        Загружает активные изображения проекта вместе с их аннотациями.
        Использует selectinload для асинхронной загрузки отношений.
        """
        stmt = (
            select(cls.model)
            .options(selectinload(cls.model.annotations))
            .where(
                cls.model.project_id == project_id,
                cls.model.type_subscriptions == ImageType.active
            )
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    @classmethod
    async def find_by_ids_and_project(cls, db, project_id: UUID, image_ids: List[UUID]):
        from sqlalchemy import select
        stmt = select(cls.model).where(
            cls.model.project_id == project_id,
            cls.model.id.in_(image_ids),
            cls.model.type_subscriptions == ImageType.active
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())
