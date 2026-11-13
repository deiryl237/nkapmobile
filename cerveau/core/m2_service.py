from __future__ import annotations

import json
import re
from pathlib import Path

from app.core.contracts import (
    ActionMessage,
    ActionPayload,
    ActionTarget,
    ScreenContext,
    Transcript,
)
from app.core.validators import extract_amounts, validate_action_stream
from app.llm import LLMAdapter


class KnowledgeBase:
    """Gestionnaire de la base de connaissances M5 locale."""

    def __init__(self, root: str | Path):
        self.root = Path(root)
        self._stores: dict[str, dict] = {}
        self.default_company = "demo-fintech"
        self._load_company(self.default_company)

    def _load_company(self, company_id: str) -> dict:
        if company_id in self._stores:
            return self._stores[company_id]

        company_dir = self.root / company_id
        if not company_dir.exists():
            # Repli sur demo-fintech si disponible
            company_dir = self.root / self.default_company

        manifest_path = company_dir / "manifest.json"
        lexicon_path = company_dir / "lexicon.json"
        phrases_path = company_dir / "phrases.json"
        ui_inv_path = company_dir / "ui_inventory.json"

        manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
        lexicon = json.loads(lexicon_path.read_text(encoding="utf-8")) if lexicon_path.exists() else {}
        phrases = json.loads(phrases_path.read_text(encoding="utf-8")) if phrases_path.exists() else {}
        ui_inventory = json.loads(ui_inv_path.read_text(encoding="utf-8")) if ui_inv_path.exists() else {}

        store = {
            "manifest": manifest,
            "lexicon": lexicon,
            "phrases": phrases,
            "ui_inventory": ui_inventory,
        }
        self._stores[company_id] = store
        return store

    def get_store(self, company_id: str | None = None) -> dict:
        cid = company_id or self.default_company
        return self._load_company(cid)

    @property
    def terms(self) -> list[str]:
        """Retourne l'ensemble des termes lexiques et gabarits connus."""
        store = self.get_store()
        lexicon = store.get("lexicon", {})
        phrases = store.get("phrases", {})

        phrase_words: list[str] = []
        for p_data in phrases.values():
            if isinstance(p_data, dict):
                for text in p_data.values():
                    phrase_words.extend(text.replace("{amount}", "").split())

        all_terms = [*lexicon.keys(), *lexicon.values(), *phrase_words]
        return list(set(all_terms))

    def get_phrase(self, key: str, lang: str = "ewo", company_id: str | None = None) -> str | None:
        store = self.get_store(company_id)
        phrases = store.get("phrases", {})
        phrase_entry = phrases.get(key, {})
        if isinstance(phrase_entry, dict):
            return phrase_entry.get(lang) or phrase_entry.get("fr")
        return None


class M2Service:
    """Cerveau M2 et orchestrateur d'actions validées."""

    def __init__(self, kb_root: str | Path, llm: LLMAdapter | None = None):
        self.kb = KnowledgeBase(kb_root)
        self.llm = llm or LLMAdapter()
        self.last_screen_context: ScreenContext | None = None

    def _find_amount_node(self, screen_context: ScreenContext) -> tuple[str | None, str | None]:
        """Localise le montant financier le plus spécifique et son node_id dans l'arbre d'accessibilité."""
        # 1. Priorité aux nœuds feuilles TextView avec un montant strict
        for node in reversed(screen_context.nodes):
            if node.password or not node.text:
                continue
            amounts = extract_amounts(node.text)
            if amounts:
                # Si le texte est court et principalement le montant (ex: "42 500 FCFA")
                if len(node.text.strip()) <= 20:
                    return node.text.strip(), node.node_id

        # 2. Deuxième passe générale
        for node in screen_context.nodes:
            if node.password or not node.text:
                continue
            amounts = extract_amounts(node.text)
            if amounts:
                # Retourne le montant extrait plutôt que la phrase entière si possible
                first_amt = next(iter(amounts))
                return first_amt.upper(), node.node_id

        return None, None

    def candidate_actions(
        self, transcript: Transcript, screen_context: ScreenContext
    ) -> list[ActionMessage]:
        """Génère la proposition brute de plan d'action (M2.1)."""
        screen_summary = [
            {"id": n.node_id, "text": n.text}
            for n in screen_context.nodes
            if n.text and not n.password
        ]

        prompt = (
            "Tu es le cerveau M2 NKAP Money. "
            "Réponds en JSON strict avec le format: {\"intent\":\"check_balance\",\"amount\":\"...\"}. "
            f"Contexte écran: {json.dumps(screen_summary, ensure_ascii=False)}. "
            f"Question utilisateur: {transcript.text}."
        )

        llm_payload = self.llm.generate(prompt)

        # Détermination du montant et de la cible UI (avec priorité aux données réelles de l'écran)
        screen_amount, screen_node_id = self._find_amount_node(screen_context)
        llm_amount = llm_payload.get("amount")

        # Règle de sécurité stricte : n'utiliser le montant du LLM que s'il est réellement à l'écran
        amount = screen_amount
        if llm_amount and screen_amount and re.sub(r"\D", "", llm_amount) == re.sub(r"\D", "", screen_amount):
            amount = llm_amount

        intent = llm_payload.get("intent", "check_balance")
        if intent not in {"check_balance", "transfer", "unknown"}:
            intent = "check_balance"

        target_node_id = screen_node_id or (
            screen_context.nodes[0].node_id if screen_context.nodes else "n_01"
        )

        lang = transcript.lang or "ewo"
        phrase = self.kb.get_phrase("balance_answer", lang=lang)
        if phrase and amount:
            phrase = phrase.replace("{amount}", amount)
        elif amount:
            phrase = f"Solde wɔ́g á {amount}."

        actions: list[ActionMessage] = []
        base_ts = transcript.ts or 0

        # Action 1 : Synthèse vocale speak
        if phrase:
            actions.append(
                ActionMessage(
                    type="action",
                    session_id=transcript.session_id,
                    turn_id=transcript.turn_id,
                    ts=base_ts,
                    seq=1,
                    speak_seg=0,
                    run_after_ms=0,
                    action=ActionPayload(
                        t="speak",
                        id="spk_1",
                        text=phrase,
                        lang=lang,
                        mode="bank",
                        phrase_key="balance_answer",
                    ),
                )
            )

        # Action 2 : Cercle visuel autour du montant ciblé
        if amount and target_node_id:
            actions.append(
                ActionMessage(
                    type="action",
                    session_id=transcript.session_id,
                    turn_id=transcript.turn_id,
                    ts=base_ts + 200,
                    seq=2,
                    speak_seg=0,
                    run_after_ms=200,
                    action=ActionPayload(
                        t="circle",
                        id="c_1",
                        target=ActionTarget(node_id=target_node_id),
                        color="ink",
                        duration_ms=700,
                    ),
                )
            )

        # Action 3 : Annotation manuscrite write
        if amount and target_node_id:
            actions.append(
                ActionMessage(
                    type="action",
                    session_id=transcript.session_id,
                    turn_id=transcript.turn_id,
                    ts=base_ts + 900,
                    seq=3,
                    speak_seg=0,
                    run_after_ms=900,
                    action=ActionPayload(
                        t="write",
                        id="w_1",
                        text=amount,
                        target=ActionTarget(node_id=target_node_id, dy=-66),
                        size=27,
                        color="ink",
                        backing="paper",
                        per_letter_ms=55,
                    ),
                )
            )

        return actions

    def handle_turn(
        self, transcript: Transcript, screen_context: ScreenContext
    ) -> list[ActionMessage]:
        """Orchestre la réception d'un tour : génération brute (M2.1) + validation par le harnais (M2.2)."""
        self.last_screen_context = screen_context
        raw_actions = self.candidate_actions(transcript, screen_context)
        return validate_action_stream(raw_actions, screen_context, self.kb.terms)
