from server.service.integrations.minio_service import MinIOService


class LazyMinIOService:
    def __init__(self):
        self._instance = None

    def _get_instance(self) -> MinIOService:
        if self._instance is None:
            self._instance = MinIOService()
        return self._instance

    def __getattr__(self, name):
        return getattr(self._get_instance(), name)


minio_service = LazyMinIOService()
