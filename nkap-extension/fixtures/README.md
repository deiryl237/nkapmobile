# fixtures/ — parcours rejouables (M1-web, M1-android ET M2)

Conformes à docs/02 **v1.1** §5. Chaque fichier `actions-<parcours>.json` est une
liste d'étapes `{at, do[]}` ; `at` = ms depuis le début du parcours (offline), et
`at_next` est déduit automatiquement. Les cibles manquantes sont **sautées
silencieusement** (jamais d'erreur visible) — c'est ce qui rend ces fixtures
jouables sur la maquette ET sur l'environnement réel du comité.

## Langage de cibles (le DSL)

| Cible | Signification | Quand l'utiliser |
|---|---|---|
| `{ "node_id": "n_07" }` | attribut `data-nkap-id` posé par l'extraction I5-web | **en ligne** (serveur) — la seule cible de production |
| `{ "match_text": "Frais" }` | texte unique, normalisé (casse/accents/espaces ignorés) | fixtures simples |
| `{ "match_text": ["Continuer", "Envoyer", "Suivant", "Valider"] }` | **liste de synonymes** — le premier trouvé gagne | fixtures agnostiques d'environnement (le standard ici) |
| `{ "match_regex": "\\d[\\d\\s.,]*\\s*(?:FCFA\|francs?)", "pick": "largest_value" }` | **motif** + stratégie de choix | montants (jamais connus à l'avance sur l'écran réel) |

`pick` : `first` · `last` · `largest` (texte le plus long) · `largest_value` ·
`smallest_value` (valeur numérique lue dans le texte).

La recherche cherche aussi sur `data-nkap-orig` : une cible reste trouvable
**même si l'écran est actuellement traduit en douala**.

## Règles d'intégrité (facteur éliminatoire du jury)

1. **Aucun montant écrit en dur** dans une fixture : utiliser `copy_from_target`
   (recopie le texte de la cible) ou `copy_from` (recopie le texte d'une autre
   cible, ex. le total via regex). Le montant affiché est TOUJOURS celui de
   l'écran, à l'identique.
2. Aucun montant, numéro ou nom n'est jamais *réécrit* différemment.
3. Champs de saisie : jamais ciblés, jamais dumpés (M4-web les exclut déjà).
4. ≤ 3 marques simultanées ; phases séquentielles avec `hide` entre elles.

## Les 6 parcours

| Fichier | Parcours | Particularité |
|---|---|---|
| `actions-p1-solde.json` | consultation du solde | montant = motif FCFA `largest_value`, écrit via `copy_from_target` |
| `actions-p2-frais.json` | frais | frais = motif FCFA `smallest_value` (écran de frais) |
| `actions-p3-transfert.json` | préparation transfert | CTA parmi 6 synonymes ; arrow montant→CTA |
| `actions-p4-recap.json` | récapitulatif | total = motif FCFA `last` recopié verbatim |
| `actions-p5-erreur.json` | erreur / sécurité | cadre rouge sur la 1re alerte trouvée |
| `actions-p6-inedit.json` | contenu inédit (répétition offline) | rejoue la réponse au message injecté de la maquette ; en réel = MutationObserver → `/answer` |

## Jouer une fixture

- **Bulle nkap** (bas-droite) = parcours suivant dans l'ordre P1→P6.
- Console : `NKAP_ASSISTANT.playParcours("p4-recap")` pour un parcours précis.
- Hors-extension (page nue servie en HTTP) : ça marche aussi — `content.js`
  démarre sans `chrome.*` spécifiquement pour permettre ces tests.
