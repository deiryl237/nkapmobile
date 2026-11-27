from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path
from typing import Any

from app.core.contracts import ScreenContext, ScreenNode


def _norm(value: str | None) -> str:
    decomposed = unicodedata.normalize("NFD", (value or "").lower())
    text = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", text).strip()


class AppPlaybookStore:
    """
    Charge les fiches de connaissance applicative M5 (`cerveau/m5_kb/<app>/playbook.json`).
    Permet au harnais (malgré un LLM local 1.5B) de connaître le fonctionnement exact
    de chaque écran de l'environnement de test SAFINUM, de Wave et d'Orange Max it.
    """

    def __init__(self, kb_root: str | Path):
        self.root = Path(kb_root)
        self.playbooks: list[dict[str, Any]] = []
        self._load_all()

    def _load_all(self) -> None:
        self.playbooks = []
        if not self.root.exists():
            return
        for pb_path in sorted(self.root.glob("*/playbook.json")):
            try:
                data = json.loads(pb_path.read_text(encoding="utf-8"))
                if isinstance(data, dict) and data.get("app_id"):
                    self.playbooks.append(data)
            except Exception:
                continue

    def detect_playbook(self, screen_context: ScreenContext) -> dict[str, Any] | None:
        pkg = (screen_context.app.package if screen_context.app else "").lower()
        url = (screen_context.page.url if screen_context.page else "").lower()
        corpus = _norm(" ".join((n.text or "") + " " + (n.content_desc or "") for n in screen_context.nodes[:240]))

        for pb in self.playbooks:
            for p in pb.get("match_packages", []):
                if p and p.lower() in pkg:
                    return pb
            for u in pb.get("match_urls", []):
                if u and u.lower() in url:
                    return pb

        for pb in self.playbooks:
            cues = pb.get("match_text_cues", [])
            if any(_norm(c) in corpus for c in cues if c):
                return pb
        return None

    def infer_screen_key(self, pb: dict[str, Any], screen_context: ScreenContext) -> str:
        url = (screen_context.page.url if screen_context.page else "").lower()
        activity = (screen_context.app.activity if screen_context.app else "").lower()
        hint = _norm(screen_context.screen_hint)
        corpus = _norm(" ".join((n.text or "") + " " + (n.content_desc or "") for n in screen_context.nodes[:240]))
        exact_texts = {
            _norm(n.text or n.content_desc)
            for n in screen_context.nodes[:240]
            if (n.text or n.content_desc)
        }

        # 1. Détecteurs déclaratifs dans `playbook.json` (évalués dans l'ordre : sous-écrans d'abord, accueil en dernier)
        for det in pb.get("screen_detectors", []):
            screen_name = det.get("screen")
            if not screen_name:
                continue
            not_any = det.get("not_text_any") or []
            if any(_norm(t) in corpus for t in not_any if t):
                continue

            matched = False
            for u in det.get("url_any") or []:
                if u and u.lower() in url:
                    matched = True
                    break
            if not matched:
                for act in det.get("activity_any") or []:
                    if act and act.lower() in activity:
                        matched = True
                        break
            if not matched:
                for t in det.get("text_any") or []:
                    if t and _norm(t) in corpus:
                        matched = True
                        break
            if not matched:
                for e in det.get("exact_any") or []:
                    if e and _norm(e) in exact_texts:
                        matched = True
                        break
            if not matched:
                for group in det.get("text_all_groups") or []:
                    if group and all(_norm(t) in corpus for t in group if t):
                        matched = True
                        break
            if not matched:
                text_all = det.get("text_all") or []
                if text_all and all(_norm(t) in corpus for t in text_all if t):
                    matched = True
            if matched:
                return str(screen_name)

        if hint in pb.get("screen_guides", {}):
            return hint
        return "home"

    @staticmethod
    def get_screen_prompt_hint(pb: dict[str, Any], screen_key: str) -> str:
        """Retourne un résumé d'écran ultra-concis à injecter dans le prompt LLM pour les questions libres."""
        guide = (pb.get("screen_guides") or {}).get(screen_key)
        app_name = pb.get("name") or pb.get("app_id") or "App"
        if isinstance(guide, dict):
            summary = guide.get("llm_summary") or guide.get("spoken") or ""
            if summary:
                return f"Contexte appli ({app_name}, écran={screen_key}): {summary}"
        return f"Contexte appli ({app_name}, écran={screen_key})."

    @staticmethod
    def is_screen_guide_question(q_norm: str) -> bool:
        cues = (
            "je dois faire quoi",
            "que dois-je faire",
            "que dois je faire",
            "qu'est-ce que je fais",
            "qu est ce que je fais",
            "quest ce que je fais",
            "quoi faire ici",
            "faire quoi ici",
            "fais quoi ici",
            "je fais quoi",
            "je fais comment ici",
            "comment faire ici",
            "comment ca marche ici",
            "comment ca se passe ici",
            "explique-moi cet ecran",
            "explique moi cet ecran",
            "explique cet ecran",
            "a quoi sert cet ecran",
            "c'est quoi cet ecran",
            "cest quoi cet ecran",
            "c'est quoi cette page",
            "cest quoi cette page",
            "je suis perdu",
            "je suis bloque",
            "comment remplir",
            "comment utiliser cet ecran",
            "aide-moi ici",
            "aide moi ici",
            "ou appuyer",
            "ou cliquer",
            "je dois appuyer ou",
        )
        return any(c in q_norm for c in cues)

    @staticmethod
    def _is_non_clickable_header(node: ScreenNode, txt_n: str) -> bool:
        """Protège contre l'encadrement erroné des titres de page (ex. `Send Money`, `<h1>/<h2>`)."""
        if node.tag in {"h1", "h2"}:
            return True
        if node.clickable or node.tag in {"button", "a"}:
            return False
        # Barre d'en-tête Android (titre à droite de la flèche retour ←, y < 165, x >= 80)
        if len(node.bounds) == 4:
            x1, y1, x2, _y2 = node.bounds
            top_bar_buttons = {
                "settings", "parametres", "hide balance", "show balance",
                "back", "navigate up", "retour", "revenir en haut", "revenir", "previous", "close", "fermer",
            }
            if y1 < 165 and x1 >= 80 and x2 <= 580 and txt_n not in top_bar_buttons:
                return True
        return False

    @staticmethod
    def _is_transaction_row_text(txt_n: str) -> bool:
        """Évite de confondre une ligne d'historique (ex. 'Transfert vers Achille Bello', 'Facture ENEO') avec un bouton de navigation."""
        tx_prefixes = (
            "transfert vers ",
            "recu de ",
            "facture ",
            "credit ",
            "bi lom a ",
            "bi bi a ",
            "loma na ",
            "lomea ",
            "kusa na ",
            "moni mwa ",
            "sawa la ",
            "kalara ",
            "kalati ",
            "gimac transfer",
            "payment to ",
            "paid to ",
            "sent to ",
            "received from ",
        )
        return any(txt_n.startswith(pref) for pref in tx_prefixes)

    @classmethod
    def find_matching_node(
        cls,
        nodes: list[ScreenNode],
        patterns: list[str],
        prefer_button: bool = False,
    ) -> ScreenNode | None:
        if not patterns:
            return None
        norm_pats = [_norm(p) for p in patterns if p]
        candidates: list[tuple[int, ScreenNode]] = []
        for n in nodes:
            txt_n = _norm(n.text or n.content_desc)
            if not txt_n:
                continue
            is_btn = bool(n.clickable or n.tag in {"button", "a"})
            if prefer_button and cls._is_non_clickable_header(n, txt_n):
                continue
            if prefer_button and cls._is_transaction_row_text(txt_n):
                continue
            for p in norm_pats:
                if txt_n == p:
                    score = 100 + (25 if (prefer_button and is_btn) else 0)
                    candidates.append((score, n))
                    break
                # En mode bouton, un motif d'un seul mot (ex. "send", "bills", "transfert", "payer", "historique")
                # ne doit JAMAIS matcher en sous-chaîne un texte non-cliquable ni une phrase longue.
                if prefer_button and " " not in p:
                    if is_btn and txt_n.startswith(p + " ") and len(txt_n) <= len(p) + 18:
                        candidates.append((74, n))
                        break
                    continue
                if p in txt_n and len(txt_n) <= len(p) + 28:
                    score = 60 + (25 if (prefer_button and is_btn) else 0)
                    candidates.append((score, n))
                    break
        if not candidates:
            return None
        candidates.sort(key=lambda pair: (-pair[0], pair[1].bounds[1] if len(pair[1].bounds) == 4 else 9999))
        return candidates[0][1]

    def match_qa_shortcut(
        self,
        pb: dict[str, Any],
        screen_key: str,
        q_norm: str,
    ) -> dict[str, Any] | None:
        # Priorise d'abord les raccourcis spécifiques à l'écran actif, puis les globaux,
        # et départage par la spécificité (longueur du trigger matché) afin qu'un trigger précis
        # (ex. "nouveau numero", "scanner un qr") batte toujours un trigger générique ("envoyer").
        best_scoped: tuple[int, dict[str, Any]] | None = None
        best_global: tuple[int, dict[str, Any]] | None = None
        for sc in pb.get("qa_shortcuts", []):
            allowed_screens = sc.get("screens")
            if allowed_screens and screen_key not in allowed_screens:
                continue
            triggers = sc.get("triggers", [])
            matched_lens = [len(_norm(t)) for t in triggers if t and _norm(t) in q_norm]
            if not matched_lens:
                continue
            score = max(matched_lens)
            if allowed_screens:
                if best_scoped is None or score > best_scoped[0]:
                    best_scoped = (score, sc)
            else:
                if best_global is None or score > best_global[0]:
                    best_global = (score, sc)
        if best_scoped is not None:
            return best_scoped[1]
        if best_global is not None:
            return best_global[1]
        return None
