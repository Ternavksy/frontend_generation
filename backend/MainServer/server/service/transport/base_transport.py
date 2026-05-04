from pydantic import BaseModel, ConfigDict


class ModelConfigBase(BaseModel):
    id: int
    name: str
    type: str
    endpoint_url: str | None = None
    is_active: bool | None = None

    model_config = ConfigDict(from_attributes=True)
