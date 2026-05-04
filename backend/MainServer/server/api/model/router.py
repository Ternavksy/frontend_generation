import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from server.core.dependencies import get_database, get_token, search_check_user
from server.service.application.model_run_service import ModelRunService
from server.service.transport import AnnotationResponse, ModelRunRequest

router = APIRouter(prefix="/api/models", tags=["Models"])


@router.post("/{project_id}/images/{image_id}/run", response_model=List[AnnotationResponse])
async def run_models(
    project_id: UUID,
    image_id: UUID,
    data: ModelRunRequest,
    token: str = Depends(get_token),
    db: AsyncSession = Depends(get_database),
):
    logger = logging.getLogger("ModelRunRouter")
    user = await search_check_user(token, logger, db)
    return await ModelRunService.run_models(db, user, project_id, image_id, data, logger)
