from fastapi import HTTPException
from typing import List

from server.service.transport.request.request import AnnotationCreate, AnnotationBatchUpdate
from server.service.db.shemas.models import Image, User, Annotation
from server.service.dal.repositories import AnnotationRepository, ProjectRepository, ClassTypeRepository, ImageRepository

class AnnotationService:
    @staticmethod
    async def _verify_access(db, user_id, project_id, image_id):
        """Проверяет участие в проекте и существование изображения в этом проекте."""
        is_member = await ProjectRepository.is_user_member(db, user_id, project_id)
        if not is_member:
            raise HTTPException(status_code=403, detail="Нет доступа к проекту")
            
        # Использует метод из BaseRepository, унаследованный ImageRepository
        image = await ImageRepository.find_one_or_none(db, id=image_id, project_id=project_id)
        if not image:
            raise HTTPException(status_code=404, detail="Изображение не найдено в данном проекте")
        return image

    @staticmethod
    async def _validate_classes(db, project_id, class_names):
        """Проверяет, что классы существуют в конфиге проекта."""
        if not class_names:
            return
        existing = await ClassTypeRepository.find_existing_by_names(db, project_id, list(set(class_names)))
        existing_names = {ct.name_ru for ct in existing} | {ct.name_eng for ct in existing}
        invalid = [name for name in set(class_names) if name not in existing_names]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Классы не найдены в проекте: {invalid}")

    @classmethod
    async def get_by_image(cls, db, user: User, project_id, image_id) -> List[Annotation]:
        await cls._verify_access(db, user.id, project_id, image_id)
        return await AnnotationRepository.get_by_image_id(db, image_id)

    @classmethod
    async def create(cls, db, user: User, project_id, image_id, data: AnnotationCreate) -> Annotation:
        await cls._verify_access(db, user.id, project_id, image_id)
        await cls._validate_classes(db, project_id, [data.class_name])
        
        new_ann = Annotation(
            image_id=image_id,
            type=data.type,
            class_name=data.class_name,
            data=data.data
        )
        db.add(new_ann)
        await db.flush()
        return new_ann

    @classmethod
    async def create_batch(cls, db, user: User, project_id, image_id, data_list: List[AnnotationCreate]) -> List[Annotation]:
        await cls._verify_access(db, user.id, project_id, image_id)
        await cls._validate_classes(db, project_id, [d.class_name for d in data_list])
        
        new_anns = [
            Annotation(image_id=image_id, type=d.type, class_name=d.class_name, data=d.data)
            for d in data_list
        ]
        return await AnnotationRepository.create_many(db, new_anns)

    @classmethod
    async def update_single(cls, db, user: User, project_id, image_id, ann_id, update_data: dict) -> Annotation:
        await cls._verify_access(db, user.id, project_id, image_id)
        
        # find_one_or_none берётся из BaseRepository
        ann = await AnnotationRepository.find_one_or_none(db, id=ann_id, image_id=image_id)
        if not ann:
            raise HTTPException(status_code=404, detail="Аннотация не найдена")
            
        if update_data.get('class_name'):
            await cls._validate_classes(db, project_id, [update_data['class_name']])
            
        for key, value in update_data.items():
            if value is not None:
                setattr(ann, key, value)
                
        await db.flush()
        return ann

    @classmethod
    async def update_batch(cls, db, user: User, project_id, image_id, updates: List[AnnotationBatchUpdate]) -> List[Annotation]:
        await cls._verify_access(db, user.id, project_id, image_id)
        
        ann_ids = [u.id for u in updates]
        existing_anns = await AnnotationRepository.find_many_by_ids_and_image(db, ann_ids, image_id)
        existing_map = {str(a.id): a for a in existing_anns}
        
        missing = [str(u.id) for u in updates if str(u.id) not in existing_map]
        if missing:
            raise HTTPException(status_code=404, detail=f"Аннотации не найдены: {missing}")
            
        classes_to_check = [u.class_name for u in updates if u.class_name]
        if classes_to_check:
            await cls._validate_classes(db, project_id, classes_to_check)
            
        for u in updates:
            ann = existing_map[str(u.id)]
            update_data = u.model_dump(exclude_unset=True)
            for key, val in update_data.items():
                setattr(ann, key, val)
                
        await db.flush()
        return list(existing_map.values())

    @classmethod
    async def delete_single(cls, db, user: User, project_id, image_id, ann_id) -> dict:
        await cls._verify_access(db, user.id, project_id, image_id)
        
        # Явная проверка принадлежности перед удалением
        ann = await AnnotationRepository.find_one_or_none(db, id=ann_id, image_id=image_id)
        if not ann:
            raise HTTPException(status_code=404, detail="Аннотация не найдена или не принадлежит изображению")
            
        deleted = await AnnotationRepository.delete_by_ids(db, [ann_id])
        return {"status": "success", "deleted_count": deleted}

    @classmethod
    async def delete_batch(cls, db, user: User, project_id, image_id, ann_ids: List) -> dict:
        await cls._verify_access(db, user.id, project_id, image_id)
        
        # Удаляем только те аннотации, которые реально принадлежат переданному изображению
        deleted_count = await AnnotationRepository.delete_by_ids_and_image(db, ann_ids, image_id)
        return {"status": "success", "deleted_count": deleted_count}