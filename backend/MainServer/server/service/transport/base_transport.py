from pydantic import BaseModel, ConfigDict


class ModelConfigBase(BaseModel):
    id: int
    name: str
    type: str
    # endpoint_url: str
    # is_active: bool

    model_config = ConfigDict(from_attributes=True)
