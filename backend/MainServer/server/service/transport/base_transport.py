from pydantic import BaseModel, ConfigDict
from enum import Enum
from typing import Any, Optional


class ModelConfigBase(BaseModel):
    id: int
    name: str
    type: str
    endpoint_url: str | None = None
    is_active: bool | None = None

    model_config = ConfigDict(from_attributes=True)


class WSCommand(str, Enum):
    PING = "ping"
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"
    START_ANALYSIS = "start_analysis"
    CANCEL_TASK = "cancel_task"


class CallbackPayload(BaseModel):
    task_id: str
    success: bool = True
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
