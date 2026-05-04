import asyncio
import logging
from typing import Any, Iterable
from urllib.parse import urlparse, urlunparse
from uuid import UUID

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from server.core.config import settings
from server.core.minio_client import minio_service
from server.service.application.annotation_service import AnnotationService
from server.service.application.class_type_service import ClassTypeService
from server.service.dal.repositories import AnnotationRepository, ImageRepository, ProjectRepository
from server.service.db.shemas.models import Annotation, ModelConfig, User
from server.service.transport.request.request import ModelRunRequest


class ModelRunService:
    @staticmethod
    async def _check_access(db: AsyncSession, user: User, project_id: UUID, image_id: UUID):
        is_member = await ProjectRepository.is_user_member(db, user.id, project_id)
        project = await ProjectRepository.find_one_or_none(db, id=project_id)
        if not project or (not is_member and project.created_by_id != user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Нет доступа к проекту")

        image = await ImageRepository.find_one_or_none(db, id=image_id, project_id=project_id)
        if not image:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Изображение не найдено")

        return image

    @staticmethod
    async def _find_models(db: AsyncSession, data: ModelRunRequest) -> list[ModelConfig]:
        filters = []
        if data.model_ids:
            filters.append(ModelConfig.id.in_(data.model_ids))
        if data.model_names:
            filters.append(ModelConfig.name.in_(data.model_names))

        if not filters:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Выберите хотя бы одну модель")

        stmt = select(ModelConfig).where(ModelConfig.is_active.is_(True))
        if len(filters) == 1:
            stmt = stmt.where(filters[0])
        else:
            from sqlalchemy import or_

            stmt = stmt.where(or_(*filters))

        result = await db.execute(stmt)
        models = list(result.scalars().all())
        if not models:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Выбранные модели не найдены")

        return models

    @staticmethod
    def _fallback_host_url(url: str) -> str | None:
        parsed = urlparse(url)
        if parsed.hostname not in {"localhost", "127.0.0.1"}:
            return None
        netloc = parsed.netloc.replace(parsed.hostname, "host.docker.internal", 1)
        return urlunparse(parsed._replace(netloc=netloc))

    @staticmethod
    async def _post_to_model(endpoint_url: str, image_bytes: bytes, filename: str, class_name: str) -> Any:
        urls = [endpoint_url]
        fallback = ModelRunService._fallback_host_url(endpoint_url)
        if fallback:
            urls.append(fallback)

        last_error: Exception | None = None
        for url in urls:
            try:
                async with httpx.AsyncClient(timeout=settings.MINIO.REQUEST_TIMEOUT) as client:
                    response = await client.post(
                        url,
                        data={"class_name": class_name, "prompt": class_name, "label": class_name},
                        files={"file": (filename, image_bytes, "image/jpeg"), "image": (filename, image_bytes, "image/jpeg")},
                    )
                response.raise_for_status()
                return response.json()
            except Exception as exc:
                last_error = exc

        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Модель недоступна: {last_error}",
        )

    @staticmethod
    def _iter_candidates(payload: Any) -> Iterable[dict[str, Any]]:
        if isinstance(payload, list):
            for item in payload:
                if isinstance(item, dict):
                    yield item
            return

        if not isinstance(payload, dict):
            return

        if any(key in payload for key in ("bbox", "box", "bounding_box", "polygon", "points", "mask")):
            yield payload

        for key in ("annotations", "detections", "objects", "results", "data", "boxes", "polygons", "masks"):
            value = payload.get(key)
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        yield item
                    elif key in {"boxes", "polygons", "masks"}:
                        singular_key = {"boxes": "box", "polygons": "polygon", "masks": "mask"}[key]
                        yield {singular_key: item}

    @staticmethod
    def _bbox_to_area(bbox: Any, image_width: int | None, image_height: int | None) -> dict[str, float] | None:
        if isinstance(bbox, dict):
            x = bbox.get("x") or bbox.get("left") or bbox.get("x1")
            y = bbox.get("y") or bbox.get("top") or bbox.get("y1")
            width = bbox.get("width") or bbox.get("w")
            height = bbox.get("height") or bbox.get("h")
            if width is None and bbox.get("x2") is not None and x is not None:
                width = bbox["x2"] - x
            if height is None and bbox.get("y2") is not None and y is not None:
                height = bbox["y2"] - y
        elif isinstance(bbox, list) and len(bbox) >= 4:
            x, y, third, fourth = bbox[:4]
            width = third - x if third > x else third
            height = fourth - y if fourth > y else fourth
        else:
            return None

        values = [x, y, width, height]
        if any(value is None for value in values):
            return None

        if image_width and image_height and max(values) <= 1:
            x *= image_width
            width *= image_width
            y *= image_height
            height *= image_height

        return {
            "x": round(float(x)),
            "y": round(float(y)),
            "width": round(float(width)),
            "height": round(float(height)),
        }

    @staticmethod
    def _points_to_polygon(points: Any, image_width: int | None, image_height: int | None) -> list[dict[str, float]] | None:
        if not isinstance(points, list) or len(points) < 3:
            return None

        polygon = []
        for point in points:
            if isinstance(point, dict):
                x, y = point.get("x"), point.get("y")
            elif isinstance(point, list) and len(point) >= 2:
                x, y = point[:2]
            else:
                return None

            if x is None or y is None:
                return None
            if image_width and image_height and max(abs(x), abs(y)) <= 1:
                x *= image_width
                y *= image_height
            polygon.append({"x": round(float(x)), "y": round(float(y))})

        return polygon

    @staticmethod
    def _polygon_bounds(points: list[dict[str, float]]) -> dict[str, float]:
        xs = [point["x"] for point in points]
        ys = [point["y"] for point in points]
        return {
            "x": min(xs),
            "y": min(ys),
            "width": max(xs) - min(xs),
            "height": max(ys) - min(ys),
        }

    @classmethod
    def _annotation_from_candidate(
        cls,
        candidate: dict[str, Any],
        model: ModelConfig,
        default_class_name: str,
        image_width: int | None,
        image_height: int | None,
    ) -> tuple[str, str, dict[str, Any]] | None:
        class_name = candidate.get("class_name") or candidate.get("label") or candidate.get("class") or default_class_name
        score = candidate.get("score") or candidate.get("confidence")
        bbox = candidate.get("bbox") or candidate.get("box") or candidate.get("bounding_box")
        polygon = candidate.get("polygon") or candidate.get("points") or candidate.get("mask")

        area = cls._bbox_to_area(bbox, image_width, image_height)
        if area:
            return (
                "detection",
                class_name,
                {
                    "version": 1,
                    "object": {
                        "label": class_name,
                        "color": "#7CFC8A",
                        "type": "box",
                        "source": "model",
                        "modelName": model.name,
                        "score": score,
                        "area": area,
                    },
                },
            )

        points = cls._points_to_polygon(polygon, image_width, image_height)
        if points:
            return (
                "segmentation",
                class_name,
                {
                    "version": 1,
                    "object": {
                        "label": class_name,
                        "color": "#7CFC8A",
                        "type": "polygon",
                        "source": "model",
                        "modelName": model.name,
                        "score": score,
                        "points": points,
                        "area": cls._polygon_bounds(points),
                    },
                },
            )

        return None

    @classmethod
    async def run_models(
        cls,
        db: AsyncSession,
        user: User,
        project_id: UUID,
        image_id: UUID,
        data: ModelRunRequest,
        logger: logging.Logger,
    ) -> list[Annotation]:
        image = await cls._check_access(db, user, project_id, image_id)
        models = await cls._find_models(db, data)
        class_name = data.class_name.strip() or "Object"
        await ClassTypeService.ensure_and_map_class_types(db, str(project_id), [class_name], logger)

        image_bytes = await asyncio.to_thread(
            minio_service.download_image,
            filename=image.file_path,
            main_path=settings.MINIO.INPUT_ORIGINAL_PREFIX,
        )
        if not image_bytes:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Файл изображения не найден в MinIO")

        created: list[Annotation] = []
        for model in models:
            raw_result = await cls._post_to_model(model.endpoint_url, image_bytes, image.file_path, class_name)
            for candidate in cls._iter_candidates(raw_result):
                normalized = cls._annotation_from_candidate(candidate, model, class_name, image.width, image.height)
                if not normalized:
                    continue

                ann_type, ann_class_name, ann_data = normalized
                await ClassTypeService.ensure_and_map_class_types(db, str(project_id), [ann_class_name], logger)
                annotation = Annotation(
                    image_id=image_id,
                    type=ann_type,
                    class_name=ann_class_name,
                    data=ann_data,
                )
                db.add(annotation)
                created.append(annotation)

        if not created:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Модель не вернула распознаваемую разметку")

        await AnnotationRepository.create_many(db, created)
        return created
