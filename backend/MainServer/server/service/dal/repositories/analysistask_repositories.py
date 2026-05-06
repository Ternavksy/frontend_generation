from typing import List, Optional
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from server.service.dal.repositories.base_repository import BaseRepository
from server.service.db.shemas.models import AnalysisTask, Image, TaskStatus


class AnalysisTaskRepository(BaseRepository[AnalysisTask]):
    model = AnalysisTask

    @classmethod
    async def find_by_id_with_image(cls, db: AsyncSession, task_id: UUID) -> Optional[AnalysisTask]:
        stmt = (
            select(cls.model)
            .options(selectinload(cls.model.image))
            .join(Image, AnalysisTask.image_id == Image.id)
            .where(cls.model.id == task_id)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @classmethod
    async def create_with_token(
        cls,
        db: AsyncSession,
        task_id: UUID,
        image_id: UUID,
        model_config_id: int,
        callback_token: str,
        class_type_ids: List[UUID],
        ws_session_id: Optional[str] = None,
    ) -> AnalysisTask:
        task = cls.model(
            id=task_id,
            image_id=image_id,
            model_config_id=model_config_id,
            callback_token=callback_token,
            class_type_ids=[str(item) for item in class_type_ids or []],
            status=TaskStatus.queued,
            ws_session_id=ws_session_id,
        )
        db.add(task)
        return task

    @classmethod
    async def cancel_if_queued(cls, db: AsyncSession, task_id: UUID, user_id: UUID) -> bool:
        stmt = (
            update(cls.model)
            .where(
                cls.model.id == task_id,
                cls.model.status == TaskStatus.queued,
                cls.model.image_id.in_(select(Image.id).where(Image.user_id == user_id)),
            )
            .values(status=TaskStatus.cancelled, updated_at=func.now())
        )
        result = await db.execute(stmt)
        return result.rowcount > 0

    @classmethod
    async def update_status(
        cls,
        db: AsyncSession,
        task_id: UUID,
        new_status: TaskStatus,
        error_message: Optional[str] = None,
        result_data: Optional[dict] = None,
    ) -> bool:
        values = {"status": new_status, "updated_at": func.now()}
        if error_message is not None:
            values["error_message"] = error_message[:500]
        if result_data is not None:
            values["result_data"] = result_data
        if new_status in (TaskStatus.completed, TaskStatus.failed):
            values["completed_at"] = func.now()

        stmt = update(cls.model).where(cls.model.id == task_id).values(**values)
        result = await db.execute(stmt)
        return result.rowcount > 0

    @classmethod
    async def get_ws_session_and_image_id(cls, db: AsyncSession, task_id: UUID) -> Optional[tuple[str | None, UUID]]:
        stmt = select(cls.model.ws_session_id, cls.model.image_id).where(cls.model.id == task_id)
        result = await db.execute(stmt)
        row = result.first()
        return (row[0], row[1]) if row else None

    @classmethod
    async def finalize_with_result(
        cls,
        db: AsyncSession,
        task_id: UUID,
        success: bool,
        result_data: Optional[dict] = None,
        error_message: Optional[str] = None,
    ) -> bool:
        values = {
            "status": TaskStatus.completed if success else TaskStatus.failed,
            "updated_at": func.now(),
            "completed_at": func.now(),
        }
        if success:
            values["result_data"] = result_data
        else:
            values["error_message"] = (error_message or "Analysis failed")[:500]

        stmt = update(cls.model).where(cls.model.id == task_id).values(**values)
        result = await db.execute(stmt)
        return result.rowcount > 0

    @classmethod
    async def get_status_by_id(cls, db: AsyncSession, task_id: UUID) -> Optional[TaskStatus]:
        stmt = select(cls.model.status).where(cls.model.id == task_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
