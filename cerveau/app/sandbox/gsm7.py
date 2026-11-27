"""Utilitaires GSM-7 stricts pour USSD (182 septets max) et SMS (160 septets max)."""

from __future__ import annotations

import unicodedata

GSM7_BASIC = (
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
GSM7_EXTENDED = "^{}\\[~]|€\f"

_AFRICAN_AND_TYPO_MAP = str.maketrans(
    {
        "ɛ": "e",
        "Ɛ": "E",
        "ɔ": "o",
        "Ɔ": "O",
        "ŋ": "n",
        "Ŋ": "N",
        "ə": "e",
        "Ə": "E",
        "ɓ": "b",
        "Ɓ": "B",
        "ɗ": "d",
        "Ɗ": "D",
        "’": "'",
        "‘": "'",
        "“": '"',
        "”": '"',
        "«": '"',
        "»": '"',
        "–": "-",
        "—": "-",
        "…": "...",
        "\u00a0": " ",
        "\u202f": " ",
        "•": "-",
        "→": "->",
        "✓": "OK",
        "✗": "X",
    }
)


def is_gsm7(text: str) -> bool:
    """Vrai si chaque caractère passe en GSM-7 sans bascule UCS-2."""
    return all(ch in GSM7_BASIC or ch in GSM7_EXTENDED for ch in (text or ""))


def gsm7_length(text: str) -> int:
    """Longueur en septets GSM-7 (caractères étendus comptés double)."""
    return sum(2 if ch in GSM7_EXTENDED else 1 for ch in (text or ""))


def to_gsm7(text: str) -> str:
    """Transcode proprement un texte Ewondo/Duala/Français en GSM-7 strict."""
    if not text:
        return ""
    s = text.translate(_AFRICAN_AND_TYPO_MAP)
    out: list[str] = []
    for ch in s:
        if ch in GSM7_BASIC or ch in GSM7_EXTENDED:
            out.append(ch)
            continue
        # Décompose NFD pour retirer les tons/diacritiques hors GSM-7 (ex: á -> a, ě -> e, ń -> n)
        decomposed = unicodedata.normalize("NFD", ch)
        base = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
        base = base.translate(_AFRICAN_AND_TYPO_MAP)
        for b in base:
            if b in GSM7_BASIC or b in GSM7_EXTENDED:
                out.append(b)
    return "".join(out)


def fit_gsm7(text: str, max_septets: int = 182) -> str:
    """Transcode en GSM-7 et garantit gsm7_length(result) <= max_septets."""
    clean = to_gsm7(text).strip()
    if gsm7_length(clean) <= max_septets:
        return clean
    limit = max(1, max_septets - 3)
    acc: list[str] = []
    used = 0
    for ch in clean:
        cost = 2 if ch in GSM7_EXTENDED else 1
        if used + cost > limit:
            break
        acc.append(ch)
        used += cost
    return "".join(acc).rstrip() + "..."
