import logging
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from server.core.dependencies import TaskAnalyzeManager, WebSocketManager
from server.service.dal.repositories import AnalysisTaskRepository, ImageRepository

logger = logging.getLogger("AnalyzeWebSocketService")


class WebSocketService:
    @staticmethod
    async def send_error(session_id: str, ws_manager: WebSocketManager, message: str):
        await ws_manager.send_to_session(session_id, {"type": "error", "message": message})

    @staticmethod
    async def handle_start_analysis(
        session_id: str,
        data: dict,
        user_id: str,
        task_manager: TaskAnalyzeManager,
        ws_manager: WebSocketManager,
        db: AsyncSession,
    ):
        image_id = data.get("image_id")
        model_config_id = data.get("model_config_id")
        if not image_id or not model_config_id:
            await WebSocketService.send_error(session_id, ws_manager, "Missing image_id or model_config_id")
            return

        try:
            image_uuid = UUID(str(image_id))
            user_uuid = UUID(str(user_id))
        except (ValueError, TypeError):
            await WebSocketService.send_error(session_id, ws_manager, "Invalid image_id or user_id")
            return

        image = await ImageRepository.find_active_by_id_with_project_access(db=db, image_id=image_uuid, user_id=user_uuid)
        if not image:
            await WebSocketService.send_error(session_id, ws_manager, "Image not found or access denied")
            return

        class_type_ids = []
        for class_type_id in data.get("class_type_ids", []):
            try:
                class_type_ids.append(UUID(str(class_type_id)))
            except (ValueError, TypeError):
                logger.warning("Invalid class_type_id format: %s", class_type_id)

        try:
            task_id = await task_manager.enqueue_task(
                image_id=image_uuid,
                model_config_id=int(model_config_id),
                class_type_ids=class_type_ids,
                ws_session_id=session_id,
            )
        except ValueError as exc:
            await WebSocketService.send_error(session_id, ws_manager, str(exc))
            return
        except Exception as exc:
            logger.error("Failed to create task for session %s: %s", session_id, exc, exc_info=True)
            await WebSocketService.send_error(session_id, ws_manager, "Failed to create analysis task")
            return

        await ws_manager.subscribe_to_image(session_id, str(image_uuid))
        await ws_manager.send_to_session(
            session_id,
            {
                "type": "task_created",
                "task_id": str(task_id),
                "status": "queued",
                "message": "Task queued for processing",
            },
        )

    @staticmethod
    async def handle_cancel_task(
        session_id: str,
        task_id: str,
        user_id: str,
        ws_manager: WebSocketManager,
        db: AsyncSession,
    ):
        try:
            cancelled = await AnalysisTaskRepository.cancel_if_queued(
                db=db,
                task_id=UUID(str(task_id)),
                user_id=UUID(str(user_id)),
            )
            if not cancelled:
                await WebSocketService.send_error(session_id, ws_manager, "Task not found or already processing")
                return
            await ws_manager.send_to_session(
                session_id,
                {"type": "task_cancelled", "task_id": str(task_id), "message": "Task cancelled successfully"},
            )
        except Exception as exc:
            logger.error("Failed to cancel task %s: %s", task_id, exc, exc_info=True)
            await WebSocketService.send_error(session_id, ws_manager, "Failed to cancel task")
