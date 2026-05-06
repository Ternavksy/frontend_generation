import asyncio
import logging
from collections import defaultdict
from typing import Dict, Optional, Set

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self._user_connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._sessions: Dict[str, dict] = {}
        self._image_subscriptions: Dict[str, Set[str]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: str, session_id: str, image_id: Optional[str] = None):
        await websocket.accept()
        async with self._lock:
            self._sessions[session_id] = {
                "websocket": websocket,
                "user_id": user_id,
                "subscribed_images": {image_id} if image_id else set(),
            }
            self._user_connections[user_id].add(websocket)
            if image_id:
                self._image_subscriptions[image_id].add(session_id)
        logger.info("WebSocket connected: user=%s, session=%s, image=%s", user_id, session_id, image_id)

    async def disconnect(self, session_id: str):
        async with self._lock:
            session_data = self._sessions.pop(session_id, None)
            if not session_data:
                return

            websocket = session_data["websocket"]
            user_id = session_data["user_id"]
            subscribed_images = session_data["subscribed_images"]
            self._user_connections[user_id].discard(websocket)
            if not self._user_connections[user_id]:
                del self._user_connections[user_id]

            for image_id in subscribed_images:
                self._image_subscriptions[image_id].discard(session_id)
                if not self._image_subscriptions[image_id]:
                    del self._image_subscriptions[image_id]
        logger.info("WebSocket disconnected: session=%s", session_id)

    async def send_to_session(self, session_id: str, message: dict) -> bool:
        async with self._lock:
            session_data = self._sessions.get(session_id)
            if not session_data:
                logger.debug("Session %s not found for direct message", session_id)
                return False
            websocket = session_data["websocket"]

        try:
            await websocket.send_json(message)
            return True
        except (WebSocketDisconnect, RuntimeError) as exc:
            if "closed" in str(exc).lower() or isinstance(exc, WebSocketDisconnect):
                asyncio.create_task(self.disconnect(session_id), name=f"cleanup_{session_id}")
            else:
                logger.error("Error sending to session %s: %s", session_id, exc)
            return False

    async def broadcast_to_image(self, image_id: str, message: dict, exclude_session: Optional[str] = None):
        async with self._lock:
            session_ids = list(self._image_subscriptions.get(image_id, []))

        for session_id in session_ids:
            if session_id != exclude_session:
                await self.send_to_session(session_id, message)

    async def subscribe_to_image(self, session_id: str, image_id: str) -> bool:
        async with self._lock:
            if session_id not in self._sessions:
                return False
            self._sessions[session_id]["subscribed_images"].add(image_id)
            self._image_subscriptions[image_id].add(session_id)
        return True

    async def unsubscribe_from_image(self, session_id: str, image_id: str) -> bool:
        async with self._lock:
            if session_id not in self._sessions:
                return False
            self._sessions[session_id]["subscribed_images"].discard(image_id)
            self._image_subscriptions[image_id].discard(session_id)
            if not self._image_subscriptions[image_id]:
                del self._image_subscriptions[image_id]
        return True
