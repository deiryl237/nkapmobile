from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.core.contracts import ScreenContext
from app.main import app

client = TestClient(app)


def make_web_context_payload() -> dict:
    return {
        "type": "screen_context",
        "page": {
            "url": "https://safinum.cm/hackathon-test?jury=1",
            "title": "Safinum Pay — Démo",
        },
        "screen_hint": "home",
        "nodes": [
            {
                "node_id": "n_01",
                "tag": "p",
                "text": "Solde disponible",
                "clickable": False,
                "bounds": [40, 120, 180, 142],
                "tone": "dark",
            },
            {
                "node_id": "n_02",
                "tag": "p",
                "text": "250 000 FCFA",
                "clickable": False,
                "bounds": [40, 148, 210, 180],
                "tone": "dark",
            },
        ],
    }


def test_screen_context_accepts_i5_web_payload():
    model = ScreenContext.model_validate(make_web_context_payload())
    assert model.app is None
    assert model.page is not None
    assert "safinum.cm" in model.page.url
    assert model.nodes[1].tag == "p"
    assert model.nodes[1].path is None


def test_screen_context_requires_app_or_page():
    payload = make_web_context_payload()
    del payload["page"]
    with pytest.raises(ValueError, match="either 'app' .* or 'page'"):
        ScreenContext.model_validate(payload)


def test_http_answer_returns_validated_actions():
    with patch("app.llm.requests.post") as mock_post:
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {
            "intent": "check_balance",
            "amount": "250 000 FCFA",
        }
        mock_post.return_value.raise_for_status = lambda: None

        resp = client.post(
            "/answer",
            json={
                "transcript": "Quel est mon solde ?",
                "lang_hint": "fr",
                "context": make_web_context_payload(),
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["turn_id"].startswith("t_")
    action_types = [item["action"]["t"] for item in body["actions"]]
    assert action_types == ["speak", "circle", "write"]
    circle = next(item["action"] for item in body["actions"] if item["action"]["t"] == "circle")
    assert circle["target"]["node_id"] == "n_02"
    speak = next(item["action"] for item in body["actions"] if item["action"]["t"] == "speak")
    assert "250 000 FCFA" in speak["text"]


def test_http_answer_returns_422_harness_reject_on_unsafe_stream():
    with patch("app.main.service.handle_turn", side_effect=ValueError("Montant altéré")):
        resp = client.post(
            "/answer",
            json={
                "transcript": "Quel est mon solde ?",
                "lang_hint": "fr",
                "context": make_web_context_payload(),
            },
        )

    assert resp.status_code == 422
    assert resp.json()["error"] == "harness_reject"
    assert "Montant altéré" in resp.json()["reason"]


def test_http_answer_compiles_custom_llm_plan_and_guards_targets(monkeypatch):
    import json

    class _FakeResponse:
        def __init__(self, payload: dict):
            self._payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"message": {"content": json.dumps(self._payload, ensure_ascii=False)}}

    # 1. Schéma compact 6 clés : filtre les nœuds inventés et borne à <= 3 marques visuelles
    def fake_ollama_compact(url, json=None, timeout=None, **kwargs):
        return _FakeResponse(
            {
                "spoken": "Regarde l'encadré Musango : vérifie toujours le nom et le numéro avant d'envoyer.",
                "title": "Vérifier avant envoi",
                "points": [
                    "• Contrôle le nom et le numéro",
                    "→ Lire la carte Musango",
                ],
                "targets": ["n_node_invente", "n_10", "n_11"],
                "style": "box",
                "color": "green",
            }
        )

    monkeypatch.setattr("app.llm.requests.post", fake_ollama_compact)
    home_ctx = {
        "type": "screen_context",
        "page": {"url": "https://safinum.cm/hackathon-test", "title": "Safinum"},
        "screen_hint": "home",
        "nodes": [
            {"node_id": "n_01", "tag": "h2", "text": "Bonjour, Amina", "clickable": False, "bounds": [0, 0, 180, 24], "tone": "dark"},
            {"node_id": "n_10", "tag": "h3", "text": "Musango [Sécurité]", "clickable": False, "bounds": [420, 240, 520, 265], "tone": "dark"},
            {"node_id": "n_11", "tag": "p", "text": "Ombwa bwam dina na nimero ya mukusa oboso ba bola loma.", "clickable": False, "bounds": [420, 270, 650, 310], "tone": "dark"},
        ],
    }
    resp = client.post(
        "/answer",
        json={"transcript": "Comment je sais si quelqu'un veut m'arnaquer ?", "lang_hint": "fr", "context": home_ctx},
    )
    assert resp.status_code == 200
    acts = resp.json()["actions"]
    types = [a["action"]["t"] for a in acts]
    assert types == ["speak", "notebook", "arrow", "box", "clear"]
    assert acts[0]["action"]["phrase_key"] == "llm_answer"
    assert acts[1]["action"]["title"] == "Vérifier avant envoi"
    assert "from" in acts[2]["action"] and "from_" not in acts[2]["action"]
    assert acts[2]["action"]["to"]["node_id"] == "n_10"
    assert acts[3]["action"]["target"]["node_id"] == "n_10"
    assert acts[3]["action"]["color"] == "green"
    # Aucun nœud halluciné + max 3 marques visuelles (notebook + arrow + box)
    target_ids = {
        a["action"].get("target", {}).get("node_id") or a["action"].get("to", {}).get("node_id")
        for a in acts
    }
    assert "n_node_invente" not in target_ids
    visual_marks = [a for a in acts if a["action"]["t"] in {"notebook", "arrow", "box", "circle", "frame", "underline", "write"}]
    assert len(visual_marks) <= 3

    # 2. Schéma détaillé rich-highlights (notebook_lines + highlights + spoken_after)
    def fake_ollama_rich(url, json=None, timeout=None, **kwargs):
        return _FakeResponse(
            {
                "spoken": "Les frais affichés ici sont de 0 FCFA.",
                "notebook_title": "Frais du transfert",
                "notebook_lines": [
                    {"label": "Frais", "value": "0 FCFA", "color": "green"},
                    {"text": "→ Aucun frais prélevé", "underline": True},
                ],
                "highlights": [
                    {"node_id": "n_04", "style": "underline", "color": "green", "arrow_from_notebook": True}
                ],
                "spoken_after": "Tu peux continuer si le reste te convient.",
            }
        )

    monkeypatch.setattr("app.llm.requests.post", fake_ollama_rich)
    fees_ctx = {
        "type": "screen_context",
        "page": {"url": "https://safinum.cm/hackathon-test", "title": "Safinum"},
        "screen_hint": "fees",
        "nodes": [
            {"node_id": "n_03", "tag": "span", "text": "Frais", "clickable": False, "bounds": [0, 80, 60, 100], "tone": "dark"},
            {"node_id": "n_04", "tag": "span", "text": "0 FCFA", "clickable": False, "bounds": [80, 80, 140, 100], "tone": "dark"},
        ],
    }
    resp_rich = client.post(
        "/answer",
        json={"transcript": "Combien coûtent les frais ?", "lang_hint": "fr", "context": fees_ctx},
    )
    assert resp_rich.status_code == 200
    acts_rich = resp_rich.json()["actions"]
    assert [a["action"]["t"] for a in acts_rich] == ["speak", "notebook", "arrow", "speak", "underline", "clear"]
    assert acts_rich[4]["action"]["target"]["node_id"] == "n_04"


def test_http_answer_handles_dynamic_offline_fallback(monkeypatch):
    def fake_failing_post(*args, **kwargs):
        raise ConnectionError("offline")

    monkeypatch.setattr("app.llm.requests.post", fake_failing_post)

    # 1. Repli hors-ligne ancré sur l'écran réel : frais (associe libellé + valeur suivante)
    fees_ctx = {
        "type": "screen_context",
        "page": {"url": "https://safinum.cm/hackathon-test", "title": "Safinum"},
        "screen_hint": "fees",
        "nodes": [
            {"node_id": "n_01", "tag": "p", "text": "Solde disponible", "clickable": False, "bounds": [0, 0, 100, 20], "tone": "dark"},
            {"node_id": "n_02", "tag": "p", "text": "250 000 FCFA", "clickable": False, "bounds": [0, 25, 100, 45], "tone": "dark"},
            {"node_id": "n_03", "tag": "span", "text": "Frais", "clickable": False, "bounds": [0, 80, 60, 100], "tone": "dark"},
            {"node_id": "n_04", "tag": "span", "text": "0 FCFA", "clickable": False, "bounds": [80, 80, 140, 100], "tone": "dark"},
        ],
    }
    resp_fees = client.post(
        "/answer",
        json={"transcript": "Combien coûtent les frais ?", "lang_hint": "fr", "context": fees_ctx},
    )
    assert resp_fees.status_code == 200
    acts_fees = resp_fees.json()["actions"]
    assert [a["action"]["t"] for a in acts_fees] == ["speak", "notebook", "arrow", "box", "clear"]
    assert "0 FCFA" in acts_fees[0]["action"]["text"]
    assert acts_fees[3]["action"]["target"]["node_id"] == "n_04"

    # 2. Pas de fausse alerte inventée hors-ligne si aucun bandeau d'avertissement n'est affiché
    home_ctx = {
        "type": "screen_context",
        "page": {"url": "https://safinum.cm/hackathon-test", "title": "Safinum"},
        "screen_hint": "home",
        "nodes": [
            {"node_id": "n_01", "tag": "h2", "text": "Bonjour, Amina", "clickable": False, "bounds": [0, 0, 180, 24], "tone": "dark"},
            {"node_id": "n_10", "tag": "h3", "text": "Musango [Sécurité]", "clickable": False, "bounds": [420, 240, 520, 265], "tone": "dark"},
        ],
    }
    resp_home = client.post(
        "/answer",
        json={"transcript": "Pourquoi cette alerte jaune ?", "lang_hint": "fr", "context": home_ctx},
    )
    assert resp_home.status_code == 200
    spoken_home = resp_home.json()["actions"][0]["action"]["text"].lower()
    assert "message jaune" not in spoken_home

    # 3. Erreur bloquante affichée à l'écran -> encadré rouge dynamique
    err_ctx = {
        "type": "screen_context",
        "page": {"url": "https://safinum.cm/hackathon-test", "title": "Safinum"},
        "screen_hint": "beneficiary",
        "nodes": [
            {"node_id": "n_e1", "tag": "div", "text": "Une erreur est survenue : Solde insuffisant pour effectuer ce transfert.", "clickable": False, "bounds": [0, 0, 320, 40], "tone": "dark"},
        ],
    }
    resp_err = client.post(
        "/answer",
        json={"transcript": "Pourquoi cette erreur ?", "lang_hint": "fr", "context": err_ctx},
    )
    assert resp_err.status_code == 200
    assert any(
        a["action"]["t"] == "box" and a["action"].get("color") == "red"
        for a in resp_err.json()["actions"]
    )

    # 4. Question libre sur le numéro de compte affiché
    custom_ctx = {
        "type": "screen_context",
        "page": {"url": "https://safinum.cm/hackathon-test", "title": "Safinum"},
        "screen_hint": "home",
        "nodes": [
            {"node_id": "n_h1", "tag": "p", "text": "Amina Ngo Bell", "clickable": False, "bounds": [0, 0, 180, 24], "tone": "dark"},
            {"node_id": "n_h2", "tag": "p", "text": "Numéro de compte : CM 001 2345 6789 01", "clickable": False, "bounds": [0, 30, 260, 50], "tone": "dark"},
        ],
    }
    resp_custom = client.post(
        "/answer",
        json={"transcript": "Quel est mon numéro de compte CM ?", "lang_hint": "fr", "context": custom_ctx},
    )
    assert resp_custom.status_code == 200
    acts_custom = resp_custom.json()["actions"]
    assert any(a["action"]["t"] == "notebook" for a in acts_custom)
    assert any(a["action"].get("target", {}).get("node_id") == "n_h2" for a in acts_custom)


def test_http_answer_spatial_row_grouping_and_target_text_resolution(monkeypatch):
    import json

    captured_prompts = []

    class _FakeResponse:
        def __init__(self, payload: dict):
            self._payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"response": json.dumps(self._payload, ensure_ascii=False)}

    # 1. Écran frais en Douala : `Mabála | Bonam | 0 FCFA` sur la même ligne Y que `Botali ba busa | 25 000 FCFA`
    def fake_ollama_target_text(url, json=None, timeout=None, **kwargs):
        captured_prompts.append(json.get("prompt", ""))
        return _FakeResponse(
            {
                "spoken": "Les frais de transfert sont de 0 FCFA.",
                "title": "Frais de transfert",
                "points": [
                    "Compte Safinum sans frais",
                    "→ Frais affichés : 0 FCFA",
                ],
                "target_text": "0 FCFA",
                "style": "underline",
                "color": "yellow",
            }
        )

    monkeypatch.setattr("app.llm.requests.post", fake_ollama_target_text)
    real_fees_ctx = {
        "type": "screen_context",
        "page": {"url": "https://safinum.cm/hackathon-test", "title": "Safinum Pay"},
        "screen_hint": "fees",
        "nodes": [
            {"node_id": "n_ban", "tag": "div", "text": "Environnement de test — données fictives", "clickable": False, "bounds": [0, 0, 1000, 32], "tone": "light"},
            {"node_id": "n_app", "tag": "span", "text": "Safinum Pay", "clickable": False, "bounds": [160, 50, 280, 75], "tone": "dark"},
            {"node_id": "n_f1", "tag": "span", "text": "Mabála", "clickable": False, "bounds": [180, 580, 235, 600], "tone": "dark"},
            {"node_id": "n_f2", "tag": "span", "text": "Bonam", "clickable": False, "bounds": [245, 580, 295, 600], "tone": "dark"},
            {"node_id": "n_f3", "tag": "span", "text": "0 FCFA", "clickable": False, "bounds": [530, 580, 585, 600], "tone": "dark"},
            {"node_id": "n_t1", "tag": "span", "text": "Botali ba busa", "clickable": False, "bounds": [180, 620, 290, 640], "tone": "dark"},
            {"node_id": "n_t2", "tag": "span", "text": "25 000 FCFA", "clickable": False, "bounds": [510, 620, 585, 640], "tone": "dark"},
            # Panneau latéral (Y remonte de 620 -> 220)
            {"node_id": "n_s1", "tag": "span", "text": "MONI MA PEŃE", "clickable": False, "bounds": [680, 220, 780, 240], "tone": "dark"},
            {"node_id": "n_s2", "tag": "span", "text": "250 000 FCFA", "clickable": False, "bounds": [680, 250, 810, 280], "tone": "dark"},
        ],
    }
    resp = client.post(
        "/answer",
        json={"transcript": "Quels sont les frais de transfert ?", "lang_hint": "fr", "context": real_fees_ctx},
    )
    assert resp.status_code == 200
    assert captured_prompts
    # Le bandeau test est exclu, le contexte est 100 % en français sans Douala/Ewondo, et chaque ligne est regroupée
    assert "Environnement de test" not in captured_prompts[0]
    assert "Mabála" not in captured_prompts[0]
    assert "MONI MA PEŃE" not in captured_prompts[0]
    assert "- Frais | Gratuit | 0 FCFA" in captured_prompts[0]
    assert "- Total à débiter | 25 000 FCFA" in captured_prompts[0]
    assert "Panneau latéral:" in captured_prompts[0]
    acts = resp.json()["actions"]
    assert acts[-2]["action"]["target"]["node_id"] == "n_f3"

    # 2. Doublon solde `250 000 FCFA` (zone principale vs sidebar) + sous-titre décoratif : pointe toujours la zone principale
    def fake_ollama_balance(url, json=None, timeout=None, **kwargs):
        return _FakeResponse(
            {
                "spoken": "Ton solde est de 250 000 FCFA.",
                "title": "Solde",
                "points": ["Solde disponible", "250 000 FCFA"],
                "target_text": "250 000 FCFA",
                "style": "underline",
                "color": "yellow",
            }
        )

    monkeypatch.setattr("app.llm.requests.post", fake_ollama_balance)
    dup_ctx = {
        "type": "screen_context",
        "page": {"url": "https://safinum.cm/hackathon-test", "title": "Safinum Pay"},
        "screen_hint": "home",
        "nodes": [
            {"node_id": "n_sub", "tag": "p", "text": "Ombwa moni mango pe loma moni na musango.", "clickable": False, "bounds": [180, 210, 500, 232], "tone": "dark"},
            {"node_id": "n_lbl", "tag": "span", "text": "MONI MA PEŃE", "clickable": False, "bounds": [180, 260, 290, 280], "tone": "dark"},
            {"node_id": "n_main_bal", "tag": "p", "text": "250 000 FCFA", "clickable": False, "bounds": [180, 290, 360, 330], "tone": "dark"},
            {"node_id": "n_side_lbl", "tag": "span", "text": "MONI MA PEŃE", "clickable": False, "bounds": [680, 210, 780, 230], "tone": "dark"},
            {"node_id": "n_side_bal", "tag": "p", "text": "250 000 FCFA", "clickable": False, "bounds": [680, 240, 810, 270], "tone": "dark"},
        ],
    }
    resp_bal = client.post(
        "/answer",
        json={"transcript": "Quel est mon solde ?", "lang_hint": "fr", "context": dup_ctx},
    )
    assert resp_bal.status_code == 200
    acts_bal = resp_bal.json()["actions"]
    assert acts_bal[-2]["action"]["target"]["node_id"] == "n_main_bal"


def test_http_answer_groups_stacked_transactions_and_avoids_amount_footer_on_non_amount_queries(monkeypatch):
    import json
    client = TestClient(app)
    captured_prompts = []

    class _FakeResp:
        def __init__(self, payload: dict):
            self._payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"response": json.dumps(self._payload, ensure_ascii=False)}

    def fake_ollama_tx(url, json=None, timeout=None, **kwargs):
        captured_prompts.append((json or {}).get("prompt", ""))
        return _FakeResp(
            {
                "spoken": "Tes dernières opérations incluent un paiement marchand.",
                "spoken_after": "Vérifie le numéro du bénéficiaire.",
                "title": "Dernières opérations",
                "rows": [
                    {"label": "Paiement marchand", "value": "Paiement marchand"},
                    {"label": "Salaire reçu", "value": "+180 000 FCFA"},
                ],
                "targets": ["Paiement marchand"],
                "color": "green",
            }
        )

    monkeypatch.setattr("app.llm.requests.post", fake_ollama_tx)
    tx_ctx = {
        "type": "screen_context",
        "page": {"url": "https://safinum.cm/hackathon-test", "title": "Safinum Pay"},
        "screen_hint": "home",
        "nodes": [
            {"node_id": "n_title", "tag": "p", "text": "Safinum Pay", "clickable": False, "bounds": [157, 81, 275, 109], "tone": "dark"},
            {"node_id": "n_sub", "tag": "p", "text": "Banque en ligne", "clickable": False, "bounds": [157, 109, 275, 125], "tone": "dark"},
            {"node_id": "n_user", "tag": "span", "text": "Amina Ngo Bell", "clickable": False, "bounds": [1026, 93, 1134, 113], "tone": "dark"},
            {"node_id": "n_h2", "tag": "h2", "text": "Transactions récentes", "clickable": False, "bounds": [113, 601, 764, 621], "tone": "dark"},
            {"node_id": "n_tx1_lbl", "tag": "p", "text": "Paiement marchand", "clickable": False, "bounds": [161, 645, 307, 665], "tone": "dark"},
            {"node_id": "n_tx1_dt", "tag": "p", "text": "05 nov. 2026", "clickable": False, "bounds": [161, 665, 307, 681], "tone": "dark"},
            {"node_id": "n_tx1_amt", "tag": "p", "text": "-12 500 FCFA", "clickable": False, "bounds": [674, 653, 764, 673], "tone": "dark"},
            {"node_id": "n_side", "tag": "h2", "text": "Votre compte", "clickable": False, "bounds": [842, 239, 1146, 259], "tone": "dark"},
        ],
    }

    resp = client.post(
        "/answer",
        json={"transcript": "Quelles sont mes dernières transactions ?", "lang_hint": "fr", "context": tx_ctx},
    )
    assert resp.status_code == 200
    assert "- Paiement marchand (05 nov. 2026) | -12 500 FCFA" in captured_prompts[0]
    assert "Panneau latéral:" in captured_prompts[0]
    acts = resp.json()["actions"]
    nb = next(a["action"] for a in acts if a["action"]["t"] == "notebook")
    assert all((ln.get("label") or "") != (ln.get("value") or "") or not ln.get("label") for ln in nb["lines"])
    spoken_texts = " ".join(a["action"].get("text", "") for a in acts if a["action"]["t"] == "speak")
    assert "bénéficiaire" not in spoken_texts.lower()

    # Correctif 2 : pas de mention "montants" pour une question non-monétaire ("C'est quoi cette app ?")
    def fake_ollama_app(url, json=None, timeout=None, **kwargs):
        return _FakeResp(
            {
                "spoken": "Safinum Pay est une banque en ligne de démonstration.",
                "spoken_after": "",
                "title": "Safinum Pay",
                "rows": [
                    {"label": "Safinum Pay", "value": "Banque en ligne"},
                    {"label": "Titulaire", "value": "Amina Ngo Bell"},
                ],
                "targets": ["Safinum Pay", "Amina Ngo Bell"],
                "color": "yellow",
            }
        )

    monkeypatch.setattr("app.llm.requests.post", fake_ollama_app)
    resp_app = client.post(
        "/answer",
        json={"transcript": "C'est quoi cette app ?", "lang_hint": "fr", "context": tx_ctx},
    )
    assert resp_app.status_code == 200
    acts_app = resp_app.json()["actions"]
    nb_app = next(a["action"] for a in acts_app if a["action"]["t"] == "notebook")
    assert not any("montant" in (ln.get("text") or "").lower() for ln in nb_app["lines"])
    spoken_app = " ".join(a["action"].get("text", "") for a in acts_app if a["action"]["t"] == "speak")
    assert "montant" not in spoken_app.lower()


def test_http_answer_refuses_out_of_context_and_insufficient_info_queries(monkeypatch):
    import json
    client = TestClient(app)
    llm_calls = []

    class _FakeResp:
        def __init__(self, payload: dict):
            self._payload = payload

        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"response": json.dumps(self._payload, ensure_ascii=False)}

    def fake_ollama_oos(url, json=None, timeout=None, **kwargs):
        llm_calls.append(json)
        return _FakeResp({"out_of_scope": True, "spoken": "Je suis incapable de répondre."})

    monkeypatch.setattr("app.llm.requests.post", fake_ollama_oos)
    home_ctx = {
        "type": "screen_context",
        "page": {"url": "https://safinum.cm/hackathon-test", "title": "Safinum Pay"},
        "screen_hint": "home",
        "nodes": [
            {"node_id": "n_title", "tag": "p", "text": "Safinum Pay", "clickable": False, "bounds": [157, 81, 275, 109], "tone": "dark"},
            {"node_id": "n_bal", "tag": "p", "text": "250 000 FCFA", "clickable": False, "bounds": [137, 403, 740, 439], "tone": "dark"},
            {"node_id": "n_cta", "tag": "button", "text": "Effectuer un transfert", "clickable": True, "bounds": [113, 523, 338, 569], "tone": "light"},
        ],
    }

    off_topic_questions = [
        "Comment acheter des actions dans l'entreprise safinum ?",
        "Comment doubler mon argent ?",
        "Comment pirater un compte ?",
        "Comment acheter une voiture ?",
        "Quelle est la capitale du Japon ?",
    ]
    for q in off_topic_questions:
        resp = client.post("/answer", json={"transcript": q, "lang_hint": "fr", "context": home_ctx})
        assert resp.status_code == 200
        acts = resp.json()["actions"]
        spoken = " ".join(a["action"].get("text", "") for a in acts if a["action"]["t"] == "speak").lower()
        assert "incapable" in spoken
        assert "support" in spoken
        assert not any(a["action"]["t"] in {"box", "circle", "frame", "underline", "arrow"} for a in acts)

    assert len(llm_calls) == 0

    # Si une question ambiguë passe au LLM et que celui-ci répond out_of_scope=true :
    resp_llm_oos = client.post(
        "/answer",
        json={"transcript": "Est-ce que ce transfert est remboursable demain ?", "lang_hint": "fr", "context": home_ctx},
    )
    assert resp_llm_oos.status_code == 200
    assert len(llm_calls) == 1
    acts_llm = resp_llm_oos.json()["actions"]
    spoken_llm = " ".join(a["action"].get("text", "") for a in acts_llm if a["action"]["t"] == "speak").lower()
    assert "incapable" in spoken_llm
    assert "support" in spoken_llm




