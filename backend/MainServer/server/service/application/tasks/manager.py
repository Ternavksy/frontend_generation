import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set
from uuid import UUID, uuid4

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from server.core.config import settings
from server.core.security import generate_callback_token, verify_callback_token
from server.service.dal.repositories import (
    AnalysisTaskRepository,
    CacheObjectClassesRepository,
    ClassTypeRepository,
)
from server.service.db.shemas.models import Annotation, ModelConfig, TaskStatus
from server.service.transport.base_transport import CallbackPayload

logger = logging.getLogger(__name__)


class TaskAnalyzeManager:
    def __init__(
        self,
        db_session_factory,
        http_client: httpx.AsyncClient,
        ws_manager,
        max_queue_size: int = settings.ANALYZE.MAX_QUEUE_SIZE,
    ):
        self.db_factory = db_session_factory
        self.http_client = http_client
        self.ws_manager = ws_manager
        self._max_queue_size = max_queue_size
        self._queues: Dict[str, asyncio.Queue] = {}
        self._queue_locks: Dict[str, asyncio.Lock] = {}
        self._busy_models: Set[str] = set()
        self._slot_lock = asyncio.Lock()
        self._processing_tasks: Dict[str, UUID] = {}
        self._processing_lock = asyncio.Lock()
        self._model_name_to_configs: Dict[str, Set[int]] = {}
        self._shutdown_event = asyncio.Event()

    async def initialize_from_repository(self, db: AsyncSession) -> None:
        configs_by_name = await CacheObjectClassesRepository.get_model_configs_by_name(db)
        async with self._slot_lock:
            for name, configs in configs_by_name.items():
                if name not in self._queues:
                    self._queues[name] = asyncio.Queue(maxsize=self._max_queue_size)
                    self._queue_locks[name] = asyncio.Lock()
                self._model_name_to_configs[name] = {cfg.id for cfg in configs}

            active_names = set(configs_by_name.keys())
            for name in set(self._queues.keys()) - active_names:
                self._queues.pop(name, None)
                self._queue_locks.pop(name, None)
                self._model_name_to_configs.pop(name, None)

    async def enqueue_task(
        self,
        image_id: UUID,
        model_config_id: int,
        class_type_ids: List[UUID],
        ws_session_id: Optional[str] = None,
    ) -> UUID:
        async with self.db_factory() as session:
            model_name = await self._get_model_name_by_config_id(model_config_id, session)
            if not model_name:
                CacheObjectClassesRepository.invalidate_cache()
                await CacheObjectClassesRepository._ensure_cache_loaded(session)
                model_name = await self._get_model_name_by_config_id(model_config_id, session)
            if not model_name:
                raise ValueError(f"Model config {model_config_id} not found or inactive")

            if model_name not in self._queues:
                await self.initialize_from_repository(session)

            queue = self._queues.get(model_name)
            if not queue:
                raise ValueError(f"Queue not available for model: {model_name}")

            task_id = uuid4()
            callback_token = generate_callback_token(task_id)
            await AnalysisTaskRepository.create_with_token(
                db=session,
                task_id=task_id,
                image_id=image_id,
                model_config_id=model_config_id,
                callback_token=callback_token,
                class_type_ids=class_type_ids,
                ws_session_id=ws_session_id,
            )
            await session.commit()

            if queue.full():
                await self._update_task_status(task_id, TaskStatus.failed, "Queue full")
                raise ValueError(f"Queue for model '{model_name}' is full")

            await queue.put(task_id)
            await self._try_dispatch_next(model_name)
            return task_id

    async def _try_dispatch_next(self, model_name: str):
        queue = self._queues.get(model_name)
        if not queue or queue.empty():
            return

        async with self._slot_lock:
            if model_name in self._busy_models:
                return
            async with self._queue_locks[model_name]:
                if queue.empty():
                    return
                task_id = await queue.get()
                self._busy_models.add(model_name)

        asyncio.create_task(self._process_task(task_id, model_name), name=f"process_{model_name}_{task_id}")

    async def _process_task(self, task_id: UUID, model_name: str):
        try:
            async with self._processing_lock:
                self._processing_tasks[model_name] = task_id

            async with self.db_factory() as session:
                task = await AnalysisTaskRepository.find_by_id_with_image(session, task_id)
                if not task:
                    raise RuntimeError(f"Task {task_id} not found")
                if task.status == TaskStatus.cancelled:
                    raise RuntimeError(f"Task {task_id} cancelled")
                image_path = task.image.file_path
                model_config_id = task.model_config_id
                callback_token = task.callback_token
                class_type_ids = [UUID(str(item)) for item in task.class_type_ids or []]

            texts = []
            if class_type_ids:
                async with self.db_factory() as session:
                    texts = await ClassTypeRepository.get_names_eng_by_ids(session, class_type_ids)
                if not texts:
                    raise RuntimeError("Selected class UUIDs were not found")

            endpoint_url = await self._get_endpoint_url(model_config_id)
            if not endpoint_url:
                raise RuntimeError(f"Endpoint not found for config {model_config_id}")

            payload = {
                "image_path": image_path,
                "texts": texts,
                "callback_url": settings.ANALYZE.CALLBACK_BASE_URL,
                "output_suffix": None,
                "task_id": callback_token,
            }

            if endpoint_url.startswith("mock://"):
                await self._complete_mock_task(
                    task_id=task_id,
                    model_name=model_name,
                    callback_token=callback_token,
                    class_names=texts,
                )
                return

            success = False
            start_time = asyncio.get_event_loop().time()
            retry_interval = 3.0
            while asyncio.get_event_loop().time() - start_time < settings.ANALYZE.DISPATCH_TIMEOUT_SECONDS:
                response = await self.http_client.post(endpoint_url, json=payload, timeout=settings.MINIO.REQUEST_TIMEOUT)
                if response.status_code == 200:
                    success = True
                    break
                if response.status_code == 503:
                    await asyncio.sleep(retry_interval)
                    continue
                raise RuntimeError(f"Unexpected status {response.status_code}: {response.text[:200]}")

            if success:
                await self._update_task_status(task_id, TaskStatus.processing)
            else:
                await self._handle_dispatch_error(task_id, model_name, RuntimeError("Model busy after retry timeout"))
        except Exception as exc:
            logger.error("Failed to process task %s: %s", task_id, exc, exc_info=True)
            await self._handle_dispatch_error(task_id, model_name, exc)

    async def _complete_mock_task(self, task_id: UUID, model_name: str, callback_token: str, class_names: list[str]):
        await self._update_task_status(task_id, TaskStatus.processing)
        await asyncio.sleep(0.3)

        async with self._processing_lock:
            self._processing_tasks.pop(model_name, None)
        async with self._slot_lock:
            self._busy_models.discard(model_name)

        label = class_names[0] if class_names else "Object"
        payload = CallbackPayload(
            task_id=callback_token,
            success=True,
            result={
                "mock": True,
                "result": {
                    "annotations": [
                        {
                            "class_name": label,
                            "bbox": {"x": 32, "y": 32, "width": 180, "height": 140},
                            "score": 0.99,
                        }
                    ]
                },
            },
        )
        await self._persist_callback_result(task_id, payload)
        await self._try_dispatch_next(model_name)

    async def _get_endpoint_url(self, config_id: int) -> Optional[str]:
        async with self.db_factory() as session:
            await CacheObjectClassesRepository._ensure_cache_loaded(session)
        return CacheObjectClassesRepository.get_endpoint_by_config_id(config_id)

    async def _get_model_name_by_config_id(self, config_id: int, db: AsyncSession) -> Optional[str]:
        configs = await CacheObjectClassesRepository.get_base_classes(db)
        for cfg in configs:
            if cfg.id == config_id and cfg.is_active:
                return cfg.name
        return None

    async def _handle_dispatch_error(self, task_id: UUID, model_name: str, error: Exception):
        async with self.db_factory() as session:
            ws_session_id, image_id = await AnalysisTaskRepository.get_ws_session_and_image_id(session, task_id) or (None, None)

        async with self._slot_lock:
            self._busy_models.discard(model_name)
        async with self._processing_lock:
            self._processing_tasks.pop(model_name, None)

        await self._update_task_status(task_id, TaskStatus.failed, str(error))
        if image_id:
            await self._notify_ws(task_id=task_id, image_id=image_id, event="failed", ws_session_id=ws_session_id, error=str(error))
        await self._try_dispatch_next(model_name)

    async def handle_callback(self, payload: CallbackPayload) -> None:
        task_id_str = verify_callback_token(payload.task_id)
        if not task_id_str:
            logger.warning("Invalid callback token")
            return

        task_id = UUID(task_id_str)
        model_name = None
        async with self._processing_lock:
            for name, processing_task_id in list(self._processing_tasks.items()):
                if processing_task_id == task_id:
                    model_name = name
                    del self._processing_tasks[name]
                    break

        if not model_name:
            logger.warning("Callback for task %s was not found in processing map", task_id)
            return

        async with self._slot_lock:
            self._busy_models.discard(model_name)

        asyncio.create_task(self._try_dispatch_next(model_name), name=f"dispatch_next_{model_name}")
        asyncio.create_task(self._persist_callback_result(task_id, payload), name=f"persist_result_{task_id}")

    async def _persist_callback_result(self, task_id: UUID, payload: CallbackPayload):
        try:
            async with self.db_factory() as session:
                task = await AnalysisTaskRepository.find_by_id_with_image(session, task_id)
                if not task:
                    return

                annotation_ids = []
                if payload.success and payload.result:
                    annotations = await self._create_annotations_from_result(session, task, payload.result)
                    annotation_ids = [str(annotation.id) for annotation in annotations]

                await AnalysisTaskRepository.finalize_with_result(
                    db=session,
                    task_id=task_id,
                    success=payload.success,
                    result_data=payload.result if payload.success else None,
                    error_message=payload.error if not payload.success else None,
                )
                await session.commit()

                result = dict(payload.result or {}) if payload.success else None
                if result is not None:
                    result["annotation_ids"] = annotation_ids

                await self._notify_ws(
                    task_id=task_id,
                    image_id=task.image_id,
                    event="completed" if payload.success else "failed",
                    ws_session_id=task.ws_session_id,
                    result=result,
                    error=payload.error if not payload.success else None,
                )
        except Exception as exc:
            logger.error("Failed to persist callback result for task %s: %s", task_id, exc, exc_info=True)

    async def _create_annotations_from_result(self, session: AsyncSession, task, result: dict) -> list[Annotation]:
        from server.service.application.model_run_service import ModelRunService

        model = await session.get(ModelConfig, task.model_config_id)
        if not model:
            return []

        created = []
        result_data = result.get("result", result)
        for candidate in ModelRunService._iter_candidates(result_data):
            normalized = ModelRunService._annotation_from_candidate(
                candidate,
                model,
                candidate.get("class_name") or candidate.get("label") or "Object",
                task.image.width,
                task.image.height,
            )
            if not normalized:
                continue
            ann_type, class_name, ann_data = normalized
            annotation = Annotation(image_id=task.image_id, type=ann_type, class_name=class_name, data=ann_data)
            session.add(annotation)
            created.append(annotation)

        await session.flush()
        return created

    async def _update_task_status(self, task_id: UUID, status: TaskStatus, error: Optional[str] = None):
        async with self.db_factory() as session:
            await AnalysisTaskRepository.update_status(session, task_id, status, error_message=error)
            await session.commit()

    async def _notify_ws(
        self,
        task_id: UUID,
        image_id: UUID,
        event: str,
        ws_session_id: Optional[str] = None,
        result: Optional[dict] = None,
        error: Optional[str] = None,
    ):
        async with self.db_factory() as session:
            status = await AnalysisTaskRepository.get_status_by_id(session, task_id)
        if not status:
            return

        message = {
            "type": "task_update",
            "task_id": str(task_id),
            "image_id": str(image_id),
            "event": event,
            "status": status.value,
            "result": result,
            "error": error,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if ws_session_id:
            await self.ws_manager.send_to_session(ws_session_id, message)
        else:
            await self.ws_manager.broadcast_to_image(str(image_id), message)

    async def shutdown(self):
        self._shutdown_event.set()
