from sqladmin import ModelView, Admin

from server.service.db.shemas.models import *
from passlib.context import CryptContext
from sqlalchemy.orm import Mapper
from sqlalchemy import event


class UserAdmin(ModelView, model=User):
    name = "Пользователь"
    name_plural = "Пользователи"
    icon = "fa-solid fa-user"
    
    column_list = ["id", "login", "definition", "time_created_password"]
    column_searchable_list = ["id", "login", "time_created_password"]
    column_sortable_list = ["id", "login", "time_created_password"]
    
    # Разрешаем редактирование
    can_edit = True
    form_columns = ["hashed_password", "definition"]  # Добавляем поле password
    
    form_ajax_refs = {
        'definition': {
            'fields': ('name_company', 'definition'),
            'order_by': 'name_company',
        }
    }
    
    form_widget_args = {
        "login": {
            "readonly": True
        },
        "hashed_password": {
            "type": "hashed_password"  # Делаем поле пароля скрытым при вводе
        }
    }
    
    async def update_model(self, request, pk, data):
        """Переопределяем сохранение модели"""
        if "hashed_password" in data and data["hashed_password"]:
            pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
            data["hashed_password"] = pwd_context.hash(data["hashed_password"])
        
        return await super().update_model(request, pk, data)

class UserDefinitionAdmin(ModelView, model=UserDefinition):
    name = "Параметров Пользователя"
    name_plural = "Параметры Пользователя"
    
    column_list = ["id", "name_company", "definition", "user"]
    column_searchable_list = ["name_company", "id"]
    column_sortable_list = ["id"]
    
    form_ajax_refs = {
        'user': {
            'fields': ('login',),
            'order_by': 'login',
        }
    }

class ImageAdmin(ModelView, model=Image):
    name = "Изображение"
    name_plural = "Изображения"
    icon = "fa-solid fa-image"
    
    column_list = ["id", "file_path", "width", "height", "format"]
    column_searchable_list = ["id", "file_path", "format"]
    column_sortable_list = ["id", "width", "height"]
    
    can_edit = True
    can_create = True
    form_columns = ["file_path", "width", "height", "format"]

class ModelConfigAdmin(ModelView, model=ModelConfig):
    name = "ML Модель"
    name_plural = "ML Модели"
    icon = "fa-solid fa-robot"
    
    column_list = ["id", "name", "type", "endpoint_url", "is_active"]
    column_searchable_list = ["name", "type", "endpoint_url"]
    column_sortable_list = ["id", "name", "is_active"]
    
    can_edit = True
    can_create = True
    form_columns = ["name", "type", "endpoint_url", "is_active"]

class ProjectAdmin(ModelView, model=Project):
    name = "Проект"
    name_plural = "Проекты"
    icon = "fa-solid fa-folder"
    
    column_list = ["id", "name", "creator", "created_at"]
    column_searchable_list = ["name"]
    column_sortable_list = ["id", "name", "created_at"]
    
    can_edit = True
    can_create = True
    # created_at и created_by_id управляются автоматически или через creator
    form_columns = ["name", "creator"] 
    
    form_ajax_refs = {
        'creator': {'fields': ('login',), 'order_by': 'login'}
    }

class AnnotationAdmin(ModelView, model=Annotation):
    name = "Разметка"
    name_plural = "Разметки"
    icon = "fa-solid fa-tag"
    
    column_list = ["id", "image", "type", "class_name", "is_selected"]
    column_searchable_list = ["class_name", "type"]
    column_sortable_list = ["id", "class_name"]
    
    can_edit = True
    can_create = True
    form_columns = ["image", "type", "class_name", "data", "is_selected"]
    
    form_ajax_refs = {
        'image': {'fields': ('file_path',), 'order_by': 'file_path'}
    }

class MaskAdmin(ModelView, model=Mask):
    name = "Маска"
    name_plural = "Маски"
    icon = "fa-solid fa-mask"
    
    column_list = ["id", "image", "file_path", "width", "height", "format"]
    column_searchable_list = ["file_path", "format"]
    can_edit = True
    can_create = True
    form_columns = ["image", "file_path", "width", "height", "format"]
    
    form_ajax_refs = {
        'image': {'fields': ('file_path',), 'order_by': 'file_path'}
    }


def _on_class_table_change(mapper: Mapper, connection, target) -> None:
    """Сброс кэша при любом изменении в справочниках классов."""
    # импорт внутри, чтобы избежать циклической зависимости
    from server.service.dal.repositories.cache_repository import CacheObjectClassesRepository
    CacheObjectClassesRepository.invalidate_cache()


def add_custom_view(admin: Admin):
    admin.add_view(UserAdmin)
    admin.add_view(UserDefinitionAdmin)
    admin.add_view(ImageAdmin)
    admin.add_view(ModelConfigAdmin)
    admin.add_view(ProjectAdmin)
    admin.add_view(AnnotationAdmin)
    admin.add_view(MaskAdmin)


def add_event_listen():
    event.listen(ModelConfig, 'after_insert', _on_class_table_change)
    event.listen(ModelConfig, 'after_update', _on_class_table_change)
    event.listen(ModelConfig, 'after_delete', _on_class_table_change)
