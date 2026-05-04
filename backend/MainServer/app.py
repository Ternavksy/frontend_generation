from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqladmin import Admin

from server.core.middleware import auth_middleware
from server.core.lifespan import lifespan
from server.core.config import settings
from server.service.db.database import engine
from server.service.db.shemas.admin import add_custom_view
from server.service.application.admin.auth_admin import AdminAuth
from server.api.auth.router import router as auth_router
from server.api.user.router_data import router as user_router_data
from server.api.image.router import router as router_image
from server.api.annotation.router import router as router_annotation
from server.api.project.router import router as router_project
from server.api.model.router import router as router_model


def create_application() -> FastAPI:
    """
    Factory function for creating FastAPI application instance.
    Enables easy testing with dependency overrides.
    """
    app = FastAPI(
        title=settings.PROJECT_NAME,
        description="API for Detection and Segmentation Anything tasks",
        version="1.0.0",
        swagger_ui_parameters={"persistAuthorization": True},
        lifespan=lifespan,
    )
    
    # Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(auth_middleware)
    # app.middleware("http")(ip_whitelist_middleware)  # при необходимости
    
    # Admin Panel
    # authentication_backend = AdminAuth(
    #     secret_key=settings.AUTH_SECRET)
    # )
    authentication_backend = AdminAuth(secret_key="...")
    admin = Admin(app, engine, authentication_backend=authentication_backend)
    add_custom_view(admin)  # Регистрация кастомных представлений
    
    # Routes
    @app.get("/health", tags=["Health"])
    async def health_check():
        return {"status": "ok"}

    register_router(app=app)
    
    # Dependency Overrides (для тестов)
    # app.dependency_overrides[get_database] = test_get_db
    
    return app

def register_router(app: FastAPI):
    app.include_router(auth_router)
    app.include_router(user_router_data)
    app.include_router(router_image)
    app.include_router(router_annotation)
    app.include_router(router_project)
    app.include_router(router_model)

app = create_application()


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,  # Только для разработки
        log_level="info",
    )
    
    # E:\Conda\miniconda3\envs\dsa\python.exe

    # from server.service.integrations import MinIOService, HandleMaskService, load_image_from_bytes
    # import cv2

    # minio_services = MinIOService()
    # # image_bytes = minio_services.download_image("test3_build_sam2_standard.jpg")
    # image_bytes = minio_services.download_image("test3_car_sam2_standard.jpg")
    # image = load_image_from_bytes(image_bytes)
    # polygons = HandleMaskService.process_mask(image)
    # print(f"Найдено объектов: {len(polygons)}")
    # print(f"{polygons}")


    # original_images_bytes = minio_services.download_image(filename="test3.jpg", main_path=settings.MINIO.INPUT_ORIGINAL_PREFIX)
    # original_image = load_image_from_bytes(original_images_bytes)
    # result_image = HandleMaskService.draw_polygons_on_image(original_image, polygons, "./seg_test3_car.jpg")

    # cv2.imshow("Detected Polygons", result_image)
    # cv2.waitKey(0)
    # cv2.destroyAllWindows()
