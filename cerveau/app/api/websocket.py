from __future__ import annotations

import json
import logging
import time
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.core.contracts import (
    AudioOut,
    ErrorMessage,
    HelloAck,
    HelloMessage,
    ScreenContext,
    Transcript,
    TurnEnd,
)
from app.core.m2_service import M2Service

router = APIRouter(prefix="/ws", tags=["m2"])
service = M2Service(settings.kb_root)
logger = logging.getLogger("nkap.gateway")


try:
    from starlette.websockets import WebSocketDisconnected
except ImportError:
    WebSocketDisconnected = WebSocketDisconnect


def current_timestamp_ms() -> int:
    return int(time.time() * 1000)


@router.websocket("/session/{session_id}")
async def session_socket(websocket: WebSocket, session_id: str) -> None:
    await websocket.accept()
    last_screen: ScreenContext | None = None
    logger.info("Session connectée: %s", session_id)

    try:
        while True:
            message = await websocket.receive()

            if message["type"] == "websocket.disconnect":
                logger.info("Session déconnectée par le client: %s", session_id)
                break

            # Gestion des trames binaires (ex: audio_chunk de nkap-app vers le module M3)
            if "bytes" in message and message["bytes"] is not None:
                # Trame audio binaire reçue, disponible pour routage vers STT (M3)
                continue

            text_data = message.get("text")
            if not text_data:
                continue

            try:
                payload = json.loads(text_data)
            except json.JSONDecodeError:
                await websocket.send_json(
                    ErrorMessage(
                        session_id=session_id,
                        turn_id=None,
                        ts=current_timestamp_ms(),
                        error="invalid_json",
                        details="Le message envoyé n'est pas un JSON valide",
                    ).model_dump(mode="json")
                )
                continue

            msg_type = payload.get("type")

            # 1. Handshake : hello -> hello_ack (Section 2)
            if msg_type == "hello":
                hello_msg = HelloMessage.model_validate(payload)
                ack = HelloAck(
                    session_id=session_id,
                    turn_id=None,
                    ts=hello_msg.ts or current_timestamp_ms(),
                    accepted=True,
                )
                await websocket.send_json(ack.model_dump(mode="json"))
                continue

            # 2. Contexte écran : émis à chaque changement de fenêtre (I5)
            if msg_type == "screen_context":
                last_screen = ScreenContext.model_validate(payload)
                logger.info(
                    "Contexte écran mis à jour pour %s: %d nœuds",
                    session_id,
                    len(last_screen.nodes),
                )
                continue

            # 3. Événements audio (Section 2)
            if msg_type in {"audio_start", "audio_end"}:
                logger.debug("Événement audio reçu: %s", msg_type)
                continue

            if msg_type == "audio_out":
                audio_out = AudioOut.model_validate(payload)
                logger.info("AudioOut (I2) reçu: %s", audio_out.url)
                continue

            # 4. Transcription vocale : STT M3 -> M2 (I1 -> I3)
            if msg_type == "transcript":
                turn_id = payload.get("turn_id")
                if last_screen is None:
                    await websocket.send_json(
                        ErrorMessage(
                            session_id=session_id,
                            turn_id=turn_id,
                            ts=current_timestamp_ms(),
                            error="screen_context_required_before_transcript",
                            details="Aucun ScreenContext actif n'a été transmis avant ce tour.",
                        ).model_dump(mode="json")
                    )
                    continue

                try:
                    transcript = Transcript.model_validate(payload)
                    actions = await run_in_threadpool(
                        service.handle_turn,
                        transcript=transcript,
                        screen_context=last_screen,
                    )

                    # Émission du flux ActionStream validé (I3)
                    for action in actions:
                        await websocket.send_json(action.model_dump(mode="json", by_alias=True))
                        # Si l'action est un speak, émettre également l'audio_out correspondant (I2)
                        if action.action.t == "speak":
                            spk_id = action.action.id or "spk_1"
                            audio_out = AudioOut(
                                session_id=session_id,
                                turn_id=transcript.turn_id,
                                ts=current_timestamp_ms(),
                                url=f"/static/audio/{spk_id}.wav",
                                speak_id=spk_id,
                                duration_ms=1800,
                            )
                            await websocket.send_json(audio_out.model_dump(mode="json"))

                    # Signal de fin de tour pour rendre la main à l'UI (§2 turn_end)
                    turn_end = TurnEnd(
                        session_id=session_id,
                        turn_id=transcript.turn_id,
                        ts=current_timestamp_ms(),
                    )
                    await websocket.send_json(turn_end.model_dump(mode="json"))
                    continue

                except Exception as exc:
                    logger.error("Erreur lors du traitement du tour: %s", exc)
                    await websocket.send_json(
                        ErrorMessage(
                            session_id=session_id,
                            turn_id=turn_id,
                            ts=current_timestamp_ms(),
                            error="processing_error",
                            details=str(exc),
                        ).model_dump(mode="json")
                    )
                    continue

            # Message non reconnu
            await websocket.send_json(
                ErrorMessage(
                    session_id=session_id,
                    turn_id=payload.get("turn_id"),
                    ts=current_timestamp_ms(),
                    error=f"unsupported_message_type:{msg_type}",
                ).model_dump(mode="json")
            )

    except (WebSocketDisconnect, WebSocketDisconnected):
        logger.info("Session déconnectée: %s", session_id)
        return
