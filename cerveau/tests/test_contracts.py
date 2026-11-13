import json
from pathlib import Path

from app.core.contracts import ActionMessage, ScreenContext, Transcript


ROOT = Path(__file__).resolve().parent.parent


def test_screen_context_contract():
    payload = json.loads((ROOT / "fixtures" / "screen_context.json").read_text(encoding="utf-8"))
    model = ScreenContext.model_validate(payload)
    assert model.type == "screen_context"
    assert len(model.nodes) == 2
    assert model.nodes[0].node_id == "n_01"


def test_transcript_contract():
    payload = json.loads((ROOT / "fixtures" / "transcript.json").read_text(encoding="utf-8"))
    model = Transcript.model_validate(payload)
    assert model.is_final is True
    assert "solde" in model.text.lower()


def test_action_message_contract():
    payload = json.loads((ROOT / "fixtures" / "action_stream.json").read_text(encoding="utf-8"))[0]
    model = ActionMessage.model_validate(payload)
    assert model.action.t == "speak"
    assert model.action.id == "spk_1"
