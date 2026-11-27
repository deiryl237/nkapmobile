# nkapmobile — Agent Instructions

<!-- Source de vérité unique pour tous les agents IA travaillant sur ce repo
     (Antigravity, ZCode, Claude Code, etc.). Format AGENTS.md. -->

## Overview

Couche d'accessibilité linguistique pour app fintech Android : un
AccessibilityService lit l'écran de n'importe quelle app (sans modifier son code),
un LLM streame des actions visuelles annotées (cercle/écriture/soulignement/cadre/
flèche/caption) synchronisées avec une voix ewondo, par-dessus l'UI réelle.
Langues : ewondo (primaire). Rendu : Kotlin natif, style « annotation manuscrite ».

## Documents de référence (dans l'ordre de lecture)

1. **HANDOFF.md** — état du projet, décisions actées, prochaines actions
2. **docs/02-architecture-interfaces.md** — LE CONTRAT des payloads (I1-I5) :
   tout échange inter-modules passe par ces formats, versionnés
3. **docs/01-cadrage.md** — exigences du sujet, critères jury (100 pts), plan
4. **LEARN.md** — parcours d'apprentissage du membre 1 (règle : l'IA ne code pas
   les leçons, elle questionne et corrige — voir .agents/rules/learning-companion.md)

## Règles d'or

1. Tout changement de payload = révision versionnée de docs/02 (jamais à l'oral).
2. Les montants, frais et bénéficiaires ne sont jamais traduits ni reformulés.
3. Champs de saisie / PIN : jamais lus, jamais transmis (filtre M4).
4. ≤ 3 marques visuelles simultanées ; le harnais rejette les actions invalides.
5. Aucune phrase vocale ewondo non validée par le relecteur ne sort en démo.
6. Toute validation visuelle « réussie » = capture adb de la composition complète.

## Limites connues

- tone des fonds `unknown` via l'arbre d'accessibilité → rendu double-contour.
- Whisper ne couvre pas ewo → fine-tune Common Voice v27 requis.
- mms-tts-ewo : CC-BY-NC (démo OK, produit commercial non).
- La latence bout-en-bout cible est < 3 s (pré-génération pendant la parole).
