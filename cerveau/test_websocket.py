import json
from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.main import app

ROOT = Path(__file__).resolve().parent.parent
client = TestClient(app)


@pytest.fixture(autouse=True)
def mock_llm_network():
    with patch("app.llm.requests.post") as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "intent": "check_balance",
            "amount": "42 500 FCFA",
        }
        mock_post.return_value.raise_for_status = lambda: None
        yield


def test_websocket_handshake_hello():
    with client.websocket_connect("/ws/session/s_test_1") as ws:
        # 1. Envoi du handshake 'hello' (§2)
        ws.send_json({"type": "hello", "session_id": "s_test_1", "ts": 1699450000000})
        resp = ws.receive_json()

        assert resp["type"] == "hello_ack"
        assert resp["session_id"] == "s_test_1"
        assert resp["accepted"] is True


def test_websocket_turn_flow_and_turn_end():
    screen_payload = json.loads((ROOT / "fixtures" / "screen_context.json").read_text(encoding="utf-8"))
    transcript_payload = json.loads((ROOT / "fixtures" / "transcript.json").read_text(encoding="utf-8"))

    with client.websocket_connect("/ws/session/s_test_2") as ws:
        # 1. Handshake
        ws.send_json({"type": "hello", "session_id": "s_test_2", "ts": 1000})
        assert ws.receive_json()["type"] == "hello_ack"

        # 2. Contexte écran I5
        ws.send_json(screen_payload)

        # 3. Événement audio optionnel (ne doit pas faire crasher)
        ws.send_json({"type": "audio_start", "session_id": "s_test_2", "ts": 2000})

        # 4. Transcription vocale I1 -> déclenchement du tour M2
        ws.send_json(transcript_payload)

        # 5. Réception des actions M2 validées
        received_messages = []
        while True:
            msg = ws.receive_json()
            received_messages.append(msg)
            if msg["type"] == "turn_end":
                break

        # Vérifications strictes du contrat
        action_types = [m.get("action", {}).get("t") for m in received_messages if m["type"] == "action"]
        assert "speak" in action_types
        assert "circle" in action_types
        assert "write" in action_types

        # Le dernier message DOIT être turn_end (§2 du document d'architecture)
        assert received_messages[-1]["type"] == "turn_end"
        assert received_messages[-1]["session_id"] == "s_test_2"
        assert received_messages[-1]["turn_id"] == transcript_payload["turn_id"]


def test_websocket_transcript_without_screen_context_returns_error():
    transcript_payload = json.loads((ROOT / "fixtures" / "transcript.json").read_text(encoding="utf-8"))

    with client.websocket_connect("/ws/session/s_test_3") as ws:
        ws.send_json(transcript_payload)
        resp = ws.receive_json()

        assert resp["type"] == "error"
        assert resp["error"] == "screen_context_required_before_transcript"


def test_websocket_invalid_message_type_returns_error():
    with client.websocket_connect("/ws/session/s_test_4") as ws:
        ws.send_json({"type": "unknown_cmd", "session_id": "s_test_4"})
        resp = ws.receive_json()

        assert resp["type"] == "error"
        assert "unsupported_message_type" in resp["error"]
