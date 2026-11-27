import json
from pathlib import Path
import pytest

from app.core.contracts import ActionMessage, ActionPayload, ActionTarget, ScreenContext
from app.core.validators import validate_action_stream

ROOT = Path(__file__).resolve().parent.parent


def build_screen_context() -> ScreenContext:
    payload = json.loads((ROOT / "fixtures" / "screen_context.json").read_text(encoding="utf-8"))
    return ScreenContext.model_validate(payload)


def test_validate_action_stream_accepts_safe_actions():
    payloads = json.loads((ROOT / "fixtures" / "action_stream.json").read_text(encoding="utf-8"))
    actions = [ActionMessage.model_validate(p) for p in payloads]
    result = validate_action_stream(actions, build_screen_context(), ["solde", "42 500 FCFA"])
    assert len(result) == 3


def test_validate_action_stream_rejects_unsafe_text():
    scene = build_screen_context()
    unsafe = ActionMessage(
        type="action",
        session_id="s_9f2",
        turn_id="t_17",
        ts=1,
        seq=1,
        action=ActionPayload(
            t="speak",
            id="spk_unsafe",
            text="Montant aléatoire 77 000 FCFA",
            lang="fr",
            mode="bank",
        ),
    )

    with pytest.raises(ValueError, match="Texte ou montant financier non autorisé"):
        validate_action_stream([unsafe], scene, ["solde"])


def test_validate_action_stream_rejects_secondary_hallucinated_amount():
    scene = build_screen_context()
    # Contient le vrai montant 42 500 FCFA mais ajoute un faux montant de 5 000 FCFA
    unsafe = ActionMessage(
        type="action",
        session_id="s_9f2",
        turn_id="t_17",
        ts=1,
        seq=1,
        action=ActionPayload(
            t="speak",
            id="spk_unsafe",
            text="Votre solde est de 42 500 FCFA et les frais sont de 5 000 FCFA",
            lang="fr",
            mode="bank",
        ),
    )

    with pytest.raises(ValueError, match="Texte ou montant financier non autorisé"):
        validate_action_stream([unsafe], scene, ["solde", "frais"])


def test_validate_action_stream_rejects_unknown_node_id():
    scene = build_screen_context()
    unsafe = ActionMessage(
        type="action",
        session_id="s_9f2",
        turn_id="t_17",
        ts=1,
        seq=1,
        action=ActionPayload(
            t="circle",
            id="c_unsafe",
            target=ActionTarget(node_id="n_999_inexistant"),
            color="ink",
            duration_ms=700,
        ),
    )

    with pytest.raises(ValueError, match="node_id cible inconnu"):
        validate_action_stream([unsafe], scene)


def test_validate_action_stream_enforces_max_three_visual_actions():
    scene = build_screen_context()
    actions = [
        ActionMessage(
            type="action",
            session_id="s_1",
            turn_id="t_1",
            ts=1,
            seq=i,
            action=ActionPayload(
                t="circle",
                id=f"c_{i}",
                target=ActionTarget(node_id="n_01"),
                color="ink",
            ),
        )
        for i in range(1, 5)  # 4 marques visuelles
    ]

    with pytest.raises(ValueError, match="Dépassement du nombre maximal de marques visuelles"):
        validate_action_stream(actions, scene)


def test_validate_action_stream_clear_resets_visual_limit():
    scene = build_screen_context()
    actions = [
        # 3 premières marques
        ActionMessage(
            type="action",
            session_id="s_1",
            turn_id="t_1",
            ts=1,
            seq=1,
            action=ActionPayload(t="circle", id="c_1", target=ActionTarget(node_id="n_01")),
        ),
        ActionMessage(
            type="action",
            session_id="s_1",
            turn_id="t_1",
            ts=2,
            seq=2,
            action=ActionPayload(t="underline", id="u_1", target=ActionTarget(node_id="n_02")),
        ),
        # Effacement
        ActionMessage(
            type="action",
            session_id="s_1",
            turn_id="t_1",
            ts=3,
            seq=3,
            action=ActionPayload(t="clear"),
        ),
        # 2 nouvelles marques autorisées après clear
        ActionMessage(
            type="action",
            session_id="s_1",
            turn_id="t_1",
            ts=4,
            seq=4,
            action=ActionPayload(t="circle", id="c_2", target=ActionTarget(node_id="n_01")),
        ),
        ActionMessage(
            type="action",
            session_id="s_1",
            turn_id="t_1",
            ts=5,
            seq=5,
            action=ActionPayload(t="circle", id="c_3", target=ActionTarget(node_id="n_02")),
        ),
    ]

    validated = validate_action_stream(actions, scene)
    assert len(validated) == 5
