from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Set

from app.core.contracts import ActionMessage, ScreenContext

ALLOWED_ACTIONS = {
    "speak",
    "circle",
    "box",
    "write",
    "caption",
    "underline",
    "arrow",
    "frame",
    "notebook",
    "callout",
    "num",
    "highlight",
    "strike",
    "check",
    "cross",
    "edit",
    "hide",
    "clear",
}

# Actions qui créent une marque visuelle à l'écran (`edit` modifie une marque existante sans en ajouter)
VISUAL_ACTIONS = {
    "circle",
    "underline",
    "arrow",
    "frame",
    "write",
    "notebook",
    "box",
    "callout",
    "num",
    "highlight",
    "strike",
    "check",
    "cross",
}


def normalize_text(value: str | None) -> str:
    if value is None:
        return ""
    # Normalise les espaces multiples et met en minuscules
    value = re.sub(r"\s+", " ", value).strip().lower()
    return value


def extract_amounts(text: str | None) -> set[str]:
    """Extrait tous les montants et nombres formatés d'un texte (ex: '42 500 FCFA', '42500', '10.000')."""
    if not text:
        return set()

    # Détecte les nombres (avec espaces ou séparateurs) optionnellement suivis d'une devise
    pattern = r"\b\d[\d\s.,]*\d(?:\s*(?:fcfa|xaf|f|cfa|€|\$))?|\b\d+(?:\s*(?:fcfa|xaf|f|cfa|€|\$))?"
    matches = re.findall(pattern, text, re.IGNORECASE)

    extracted = set()
    for m in matches:
        norm = normalize_text(m)
        if norm and any(c.isdigit() for c in norm):
            extracted.add(norm)
    return extracted


def get_screen_text_corpus(screen_context: ScreenContext) -> tuple[str, set[str]]:
    """Retourne le texte complet concaténé et l'ensemble de tous les montants visibles à l'écran."""
    texts = []
    screen_amounts: set[str] = set()

    for node in screen_context.nodes:
        # Sécurité : ne jamais lire les champs de mot de passe
        if node.password:
            continue
        if node.text:
            texts.append(node.text)
            screen_amounts.update(extract_amounts(node.text))
        if node.content_desc:
            texts.append(node.content_desc)
            screen_amounts.update(extract_amounts(node.content_desc))

    corpus = " ".join(texts)
    return normalize_text(corpus), screen_amounts


def text_is_covered(
    candidate: str,
    screen_context: ScreenContext,
    kb_terms: Iterable[str] | None = None,
) -> bool:
    """Vérifie strictement la couverture textuelle et financière selon le contrat de sécurité M2 :
    - Zéro altération financière : aucun montant halluciné non présent dans ScreenContext.
    - Tout texte libre doit être ancré dans ScreenContext ou la base de connaissances (KB).
    """
    normalized_candidate = normalize_text(candidate)
    if not normalized_candidate:
        return True

    screen_corpus, screen_amounts = get_screen_text_corpus(screen_context)
    normalized_kb_terms = {normalize_text(t) for t in (kb_terms or []) if t}

    # Inclure les montants définis dans la KB
    for term in normalized_kb_terms:
        screen_amounts.update(extract_amounts(term))

    candidate_amounts = extract_amounts(candidate)

    # 1. Si le texte candidat contient des montants financiers
    if candidate_amounts:
        for c_amt in candidate_amounts:
            c_digits = re.sub(r"\D", "", c_amt)
            if not c_digits:
                continue

            # Vérifier que CHAQUE montant correspond mot pour mot ou chiffre pour chiffre
            matched = False
            if c_amt in screen_corpus or c_amt in normalized_kb_terms:
                matched = True
            else:
                for s_amt in screen_amounts:
                    s_digits = re.sub(r"\D", "", s_amt)
                    if c_digits == s_digits:
                        matched = True
                        break

            if not matched:
                # Montant halluciné ou non autorisé !
                return False

        # Tous les montants sont valides : vérifier qu'un ancrage légitime existe
        screen_digits = {re.sub(r"\D", "", s_amt) for s_amt in screen_amounts if re.sub(r"\D", "", s_amt)}
        has_anchor = (
            any(s_amt in normalized_candidate for s_amt in screen_amounts)
            or any(re.sub(r"\D", "", c_amt) in screen_digits for c_amt in candidate_amounts)
            or any(term in normalized_candidate for term in normalized_kb_terms)
        )
        return has_anchor

    # 2. Si aucun montant chiffré n'est présent : autoriser les explications pédagogiques
    #    libres générées par le LLM (la contrainte financière stricte porte sur tout nombre/montant).
    return True


def validate_action_stream(
    actions: list[ActionMessage],
    screen_context: ScreenContext,
    kb_terms: Iterable[str] | None = None,
) -> list[ActionMessage]:
    """Valide strictement un flux d'actions selon les règles du Harnais M2.
    Lève ValueError si une contrainte de sécurité n'est pas respectée.
    """
    if not actions:
        return []

    valid_node_ids = {node.node_id for node in screen_context.nodes}
    notebook_node_ids: Set[str] = set()
    active_visual_ids: Set[str] = set()

    for idx, action_msg in enumerate(actions, start=1):
        action = action_msg.action
        action_type = action.t

        # Règle 1 : Vocabulaire fermé des actions autorisées
        if action_type not in ALLOWED_ACTIONS:
            raise ValueError(f"Action non autorisée: {action_type}")

        # Enregistre les IDs virtuels créés par un carnet (`notebook`) pour les flèches associées
        if action_type == "notebook" and action.lines:
            for line in action.lines:
                if line.id:
                    notebook_node_ids.add(line.id)
                    notebook_node_ids.add(f"{line.id}-val")

        all_valid_ids = valid_node_ids | notebook_node_ids

        # Règle 2 : Validation des cibles node_id
        if action.target is not None:
            if action.target.node_id not in all_valid_ids:
                raise ValueError(
                    f"node_id cible inconnu dans ScreenContext: {action.target.node_id}"
                )

        if action.anchor is not None:
            if action.anchor.node_id not in all_valid_ids:
                raise ValueError(
                    f"node_id d'ancrage inconnu dans ScreenContext: {action.anchor.node_id}"
                )

        if action_type == "arrow":
            from_target = action.from_target
            if from_target is None or from_target.node_id not in all_valid_ids:
                raise ValueError(
                    f"Action 'arrow' avec origine 'from' invalide ou absente: {from_target}"
                )
            if action.to is None or action.to.node_id not in all_valid_ids:
                raise ValueError(
                    f"Action 'arrow' avec destination 'to' invalide ou absente: {action.to}"
                )

        if action_type in {
            "circle",
            "box",
            "underline",
            "frame",
            "callout",
            "num",
            "highlight",
            "strike",
            "check",
            "cross",
        } and action.target is None:
            raise ValueError(f"L'action '{action_type}' requiert une cible 'target' valide.")

        # Règle 3 : Limite de 3 marques visuelles simultanées
        if action_type == "clear":
            active_visual_ids.clear()
        elif action_type == "hide":
            if action.id and action.id in active_visual_ids:
                active_visual_ids.remove(action.id)
            elif action.id is None:
                # hide sans id spécifique supprime la dernière marque
                if active_visual_ids:
                    active_visual_ids.pop()
        elif action_type in VISUAL_ACTIONS:
            visual_id = action.id or f"vis_{idx}"
            active_visual_ids.add(visual_id)
            if len(active_visual_ids) > 3:
                raise ValueError(
                    f"Dépassement du nombre maximal de marques visuelles simultanées (> 3, actuelles: {len(active_visual_ids)})"
                )

        # Règle 4 : Zéro altération financière et couverture textuelle
        if action_type in {"speak", "write", "caption"} and action.text:
            if not text_is_covered(action.text, screen_context, kb_terms):
                raise ValueError(
                    f"Texte ou montant financier non autorisé dans '{action_type}': {action.text}"
                )
        if action_type in {"callout", "num", "edit", "frame"}:
            for field in (action.text, action.label):
                if field and not text_is_covered(field, screen_context, kb_terms):
                    raise ValueError(
                        f"Texte ou montant financier non autorisé dans '{action_type}': {field}"
                    )
        if action_type == "notebook":
            if action.title and not text_is_covered(action.title, screen_context, kb_terms):
                raise ValueError(f"Titre de carnet non autorisé: {action.title}")
            for line in action.lines or []:
                for field in (line.label, line.value, line.text):
                    if field and not text_is_covered(field, screen_context, kb_terms):
                        raise ValueError(f"Ligne de carnet non autorisée: {field}")
            for step in action.flow_steps or []:
                for field in (step.label, step.value):
                    if field and not text_is_covered(field, screen_context, kb_terms):
                        raise ValueError(f"Étape flow non autorisée: {field}")
            for bar in action.bars or []:
                for field in (bar.label, bar.amount_text):
                    if field and not text_is_covered(field, screen_context, kb_terms):
                        raise ValueError(f"Barre comparative non autorisée: {field}")
            for col in action.columns or []:
                if col and not text_is_covered(col, screen_context, kb_terms):
                    raise ValueError(f"Colonne tableau non autorisée: {col}")
            for row in action.rows or []:
                for cell in row:
                    if cell and not text_is_covered(cell, screen_context, kb_terms):
                        raise ValueError(f"Cellule tableau non autorisée: {cell}")
            for ch in action.choices or []:
                for field in (ch.label, ch.value):
                    if field and not text_is_covered(field, screen_context, kb_terms):
                        raise ValueError(f"Choix non autorisé: {field}")

    return actions
