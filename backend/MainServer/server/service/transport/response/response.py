from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from typing import Optional, Union, List, Dict, Any
from uuid import UUID
from datetime import datetime

class AnnotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    type: str = Field(description="Тип аннотации: 'detect' или 'segment'")
    class_name: str = Field(description="Класс объекта")
    data: Any = Field(description="Координаты/данные аннотации (JSONB)")

    @field_validator('type', mode='before')
    @classmethod
    def normalize_type(cls, v):
        if hasattr(v, 'value'):
            v = v.value
        return {
            'detection': 'detect',
            'segmentation': 'segment'
        }.get(v, v)


class ImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    file_path: Optional[str] = Field(default=None, description="Путь файла в хранилище")
    width: Optional[int] = Field(default=None, description="Ширина изображения")
    height: Optional[int] = Field(default=None, description="Высота изображения")
    format: Optional[str] = Field(default=None, description="Формат изображения")
    annotations: Dict[UUID, AnnotationResponse] = Field(
        default_factory=dict, 
        description="Ключ - uuid аннотации, значение - данные"
    )

    @model_validator(mode='before')
    @classmethod
    def _convert_annotations_to_dict(cls, data):
        """
        Безопасно преобразует List[Annotation] в Dict[UUID, Annotation]
        Работает как с ORM-объектами, так и с сырыми dict (например, при тестировании)
        """
        if isinstance(data, dict):
            ann_list = data.get('annotations')
            if isinstance(ann_list, list):
                data['annotations'] = {
                    (ann.get('id') if isinstance(ann, dict) else ann.id): ann
                    for ann in ann_list
                    if (ann.get('id') if isinstance(ann, dict) else ann.id) is not None
                }
        elif hasattr(data, 'annotations'):
            ann_list = getattr(data, 'annotations', [])
            if isinstance(ann_list, list):
                data = {
                    "id": data.id,
                    "file_path": getattr(data, "file_path", None),
                    "width": getattr(data, "width", None),
                    "height": getattr(data, "height", None),
                    "format": getattr(data, "format", None),
                    "annotations": {ann.id: ann for ann in ann_list if ann.id is not None},
                }
        return data


class ProjectResponse(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    model_config = {"from_attributes": True}


class ClassTypeResponse(BaseModel):
    id: UUID
    name_ru: str
    name_eng: str
    project_id: UUID
    model_config = {"from_attributes": True}


class UserSearchResponse(BaseModel):
    email: str
    login: str
    name_company: Optional[str] = None

    model_config = {"from_attributes": True}
