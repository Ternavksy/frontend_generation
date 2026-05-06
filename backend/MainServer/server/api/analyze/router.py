import json
import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from server.core.dependencies import (
    TaskAnalyzeManager,
    WebSocketManager,
    get_database,
    get_task_manager,
    get_websocket_manager,
    search_check_user,
)
from server.service.integrations.websocket.websocker_service import WebSocketService
from server.service.transport.base_transport import CallbackPayload, WSCommand

logger = logging.getLogger("AnalyzeRouter")
router = APIRouter(prefix="/api/analyze", tags=["Analyze"])


@router.websocket("/analysis")
async def analysis_websocket(
    websocket: WebSocket,
    token: str,
    ws_manager: WebSocketManager = Depends(get_websocket_manager),
    task_manager: TaskAnalyzeManager = Depends(get_task_manager),
    db: AsyncSession = Depends(get_database),
):
    try:
        user = await search_check_user(token, logger, db)
        if not user:
            await websocket.close(code=4003, reason="Invalid or expired token")
            return
    except Exception as exc:
        logger.error("Auth error in WebSocket: %s", exc)
        await websocket.close(code=4003, reason="Authentication failed")
        return

    session_id = str(uuid.uuid4())
    user_id = str(user.id)
    await ws_manager.connect(websocket=websocket, user_id=user_id, session_id=session_id)

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError:
                await WebSocketService.send_error(session_id, ws_manager, "Invalid JSON format")
                continue

            cmd = data.get("cmd")
            if cmd == WSCommand.PING:
                await ws_manager.send_to_session(session_id, {"type": "pong"})
            elif cmd == WSCommand.SUBSCRIBE:
                image_id = data.get("image_id")
                if not image_id:
                    await WebSocketService.send_error(session_id, ws_manager, "Missing image_id")
                    continue
                await ws_manager.subscribe_to_image(session_id, str(image_id))
                await ws_manager.send_to_session(session_id, {"type": "subscribed", "image_id": image_id})
            elif cmd == WSCommand.UNSUBSCRIBE:
                image_id = data.get("image_id")
                if not image_id:
                    await WebSocketService.send_error(session_id, ws_manager, "Missing image_id")
                    continue
                await ws_manager.unsubscribe_from_image(session_id, str(image_id))
                await ws_manager.send_to_session(session_id, {"type": "unsubscribed", "image_id": image_id})
            elif cmd == WSCommand.START_ANALYSIS:
                await WebSocketService.handle_start_analysis(session_id, data, user_id, task_manager, ws_manager, db)
            elif cmd == WSCommand.CANCEL_TASK:
                task_id = data.get("task_id")
                if not task_id:
                    await WebSocketService.send_error(session_id, ws_manager, "Missing task_id")
                    continue
                await WebSocketService.handle_cancel_task(session_id, task_id, user_id, ws_manager, db)
            else:
                await WebSocketService.send_error(session_id, ws_manager, f"Unknown command: {cmd}")
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: session=%s", session_id)
    except Exception as exc:
        logger.error("WebSocket error for session %s: %s", session_id, exc, exc_info=True)
        await ws_manager.send_to_session(session_id, {"type": "error", "message": "Internal server error"})
    finally:
        await ws_manager.disconnect(session_id)


@router.post("/analysis")
async def analysis_callback(
    payload: CallbackPayload,
    background_tasks: BackgroundTasks,
    task_manager: TaskAnalyzeManager = Depends(get_task_manager),
):
    background_tasks.add_task(task_manager.handle_callback, payload=payload)
    return {"status": "accepted"}
