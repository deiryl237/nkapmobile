import json
from pathlib import Path
from unittest.mock import patch
import pytest

from app.core.contracts import ScreenContext, Transcript
from app.core.m2_service import M2Service

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(autouse=True)
def mock_llm_post():
    with patch("app.llm.requests.post") as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "intent": "check_balance",
            "amount": "42 500 FCFA",
        }
        mock_post.return_value.raise_for_status = lambda: None
        yield



def get_fixtures():
    screen = ScreenContext.model_validate(
        json.loads((ROOT / "fixtures" / "screen_context.json").read_text(encoding="utf-8"))
    )
    transcript = Transcript.model_validate(
        json.loads((ROOT / "fixtures" / "transcript.json").read_text(encoding="utf-8"))
    )
    return screen, transcript


def test_find_amount_node_identifies_precise_leaf_node():
    screen, _ = get_fixtures()
    service = M2Service(kb_root=ROOT / "m5_kb")

    amount, node_id = service._find_amount_node(screen)
    assert amount == "42 500 FCFA"
    # Vérifie que le ciblage pointe précisément sur n_02 (TextView du montant) et non n_01 (ViewGroup conteneur)
    assert node_id == "n_02"


def test_m2_service_handles_french_and_ewondo():
    screen, transcript = get_fixtures()
    service = M2Service(kb_root=ROOT / "m5_kb")

    # 1. Test en Ewondo
    transcript.lang = "ewo"
    actions_ewo = service.handle_turn(transcript, screen)
    speak_ewo = next(a for a in actions_ewo if a.action.t == "speak")
    assert "Solde wɔ́g á 42 500 FCFA." in speak_ewo.action.text

    # 2. Test en Français
    transcript.lang = "fr"
    actions_fr = service.handle_turn(transcript, screen)
    speak_fr = next(a for a in actions_fr if a.action.t == "speak")
    assert "Votre solde est de 42 500 FCFA." in speak_fr.action.text


def test_m2_service_targets_accurate_node_for_visual_actions():
    screen, transcript = get_fixtures()
    service = M2Service(kb_root=ROOT / "m5_kb")

    actions = service.handle_turn(transcript, screen)
    circle = next(a for a in actions if a.action.t == "circle")
    write = next(a for a in actions if a.action.t == "write")

    assert circle.action.target.node_id == "n_02"
    assert write.action.target.node_id == "n_02"
    assert write.action.target.dy == -66
