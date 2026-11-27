# nkapmobile — Architecture & contrats d'interfaces
### v1.2 · 26 nov. 2026 · LE document contrat de l'équipe (Finale Multicanale SAFINUM)

> Règle du document : **chaque module se code contre ce document seul.** Tout
> échange entre modules passe par un payload défini ici. Changer un payload =
> proposer une modification versionnée de ce doc (v1.2…) — jamais à l'oral.
>
> **Changements v1.1 → v1.2 (26 nov. 2026, voir §13) :**
> ① **Passerelle officielle Finale SAFINUM (`POST /sandbox`)** : USSD (`*123#`, GSM-7 ≤ 182 car., `< 3 s`, `X-Trace-Id`) + Mobile/Web (`ui_translation` 65 clés `ewo`/`dua`, `{placeholders}` et `max_chars` vérifiés) + pré-support SMS/ATM/IVR ;
> ② **Protocole `NkapTurn v1.2`** (100 % rétro-compatible v1.1) : `meta`, `text_fallback`, `choices[]`, 6 nouveaux gestes (`callout`, `num`, `highlight`, `strike`, `check`, `cross`) + `edit`, et `notebook.mode` (`lines | flow | bars | table | choices`) ;
> ③ **Architecture SDK abstrait (`nkap-sdk/` Web + `moteur-rendu-ia/` Android)** : noyau 0-DOM + `HostAdapter` + `SurfaceRenderer` + `TextRenderer` ;
> ④ **Double voie `cerveau/` (`qwen2.5:1.5b`)** : voie rapide déterministe (`< 50 ms`) + voie LLM JSON compact (`num_predict: 160`, jamais bridé à 10 tokens).

---

## 0. Vue d'ensemble et transport

```
┌──────────────────── HÔTE — deux implémentations, un même cerveau ───────────────────┐
│                                                                                      │
│  WEB (livrable du 14 nov.)                 ANDROID (démo finale 26-28 nov.)          │
│  extension Chrome MV3 (nkap-extension/)    moteur natif (moteur-rendu-ia/)           │
│  ├── M4 CONTEXT : extraction DOM →         ├── M4 CONTEXT : AccessibilityService →   │
│  │   ScreenContext (I5-web, §2)            │   ScreenContext (I5-android, v1 §2)     │
│  ├── M1 RENDU : SVG manuscrit ancré        ├── M1 RENDU : Canvas/overlay système     │
│  │   au DOM (I4, §6)                       │   (I4, §6)                              │
│  ├── traduction locale par lexique (§7.3)  ├── même traduction embarquée             │
│  └── STT navigateur (fr) + banque audio    └── client session WS                    │
└───────────────┬──────────────────────────────────────────┬───────────────────────────┘
                │  HTTP POST /answer (v1 web)              │  WebSocket (contrat v1,
                ▼                                          │  inchangé pour la finale)
┌────────────────────────── SERVEUR (AWS ou équivalent) ───┴───────────────────────────┐
│  gateway (routage, enveloppe commune)                                                │
│    ├── M2 CERVEAU : LLM (API gratuite type Groq, ou modèle ouvert auto-hébergé)      │
│    │     + harnais validateur (règles §5) + scheduler                                │
│    │     Entrées : transcript (I1-out) + ScreenContext (I5) + KB (M5)                │
│    │     Sortie  : ActionStream (I3)                                                 │
│    └── M5 KB : dossier par entreprise (§7)                                           │
│  M3 VOIX : v1 web = banque audio embarquée extension (pas de serveur) ;              │
│  finale = /stt · /tts serveur (payloads v1 §3-§4 inchangés)                          │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

**Décisions transport (v1.1, actées le 9 nov.) :**
- **Web, v1 (le 14) : HTTP `POST /answer`** — une requête par tour (push-to-talk),
  réponse = bloc d'actions complet. Pas de streaming avant la finale (décision actée n°3
  de v1 : « v1 = blocs par phrase, v2 = streaming, même interface »).
- **Android (finale) : WebSocket unique** — le contrat v1 §0-§1 reste la référence.
- **Le serveur ne connaît jamais les pixels.** Toutes les cibles visuelles sont des
  `node_id` ; l'hôte résout les coordonnées au moment d'exécuter (l'UI a pu bouger).
- **Clés API : jamais dans l'extension.** Le LLM est appelé par le serveur uniquement.
  API payantes interdites par le comité ; autorisées : offres gratuites de modèles
  ouverts + modèles ouverts auto-hébergés (crédits AWS). Repli si l'API gratuite échoue
  pendant le test : modèle auto-hébergé (M2 doit en avoir un prêt le 11).
- **Horloge du tour** : la banque audio connait la durée de chaque phrase → M2 planifie
  en `run_after_ms` relatif au début de lecture du segment → M1 exécute sans décision.
- **Dégradation gracieuse obligatoire** : serveur injoignable → l'hôte continue avec
  ses données locales (fixtures + lexique + banque audio). **Jamais d'écran muet.**

**Enveloppe commune** — tout message JSON a :

```json
{ "type": "…", "session_id": "s_9f2", "turn_id": "t_17", "ts": 1699450000123 }
```
`turn_id` = un tour question→réponse. Tout ce qui appartient au même tour partage le `turn_id`.

---

## 1. Cycle de vie d'un tour (WEB, v1 — le 14 nov.)

```
EXTENSION (page web)                        SERVEUR
   │ page chargée : extraction I5-web         │
   │ (lexique traduit localement, §7.3)       │
   │                                          │
   │ ══ user maintient la bulle, parle ══     │
   │ (STT navigateur, français, I1-web)       │
   │ ══ relâche = envoi ══                    │
   │ ── POST /answer {transcript, I5} ───────►│
   │                                          │ harnais valide (§5), M2 compose
   │ ◄── {actions: [...]} ────────────────────│  (I3 : speak + gestes entrelacés)
   │ lecture audio banque (I2-web)            │
   │ exécution des gestes à run_after_ms      │
   │                                          │
   │ ══ MutationObserver : contenu inédit ══  │
   │    traduction locale (niveau 1 §7.3)     │
   │ ── POST /answer {transcript: inédit} ───►│  (optionnel : explication P6)
   │                                          │
   │ ══ soumission : NKAP_SUBMIT(values) ══   │  (journal attendu/affiché/soumis,
   │    adaptateur — protocole comité §11.1   │   protocole exact à confirmer)
```

**Version finale (Android/WS)** : séquence v1 §1 inchangée (hello/screen_context/audio
chunks/…) + STT douala serveur. Le contenu inédit passe alors par le flux WS
(`action(speak)` proactif, « répétition pro-active » v1 §1).

---

## 2. I5-web — ScreenContext (extension → serveur)

**Émis** : à chaque tour (dans le corps du `POST /answer`), et à la demande du serveur
dans sa réponse (`context_request: true` → l'extension ré-émet au tour suivant).

```json
{
  "type": "screen_context",
  "session_id": "s_9f2",
  "turn_id": "t_17",
  "ts": 1699450000123,
  "page": { "url": "https://safinum.cm/hackathon-test", "title": "KwikPay" },
  "screen_hint": "home",
  "nodes": [
    {
      "node_id": "n_01",
      "tag": "div",
      "text": "Solde disponible",
      "role": "label",
      "clickable": false,
      "bounds": [364, 258, 620, 276],
      "tone": "dark"
    },
    {
      "node_id": "n_02",
      "tag": "button",
      "text": "Effectuer un transfert",
      "clickable": true,
      "bounds": [364, 443, 892, 490],
      "tone": "light"
    }
  ]
}
```

| Champ | Règle |
|---|---|
| `nodes[]` | ≤ 200 nœuds **feuilles texte** visibles ou cliquables ; ordre du parcours DOM |
| `node_id` | **`data-nkap-id` posé par l'extension sur l'élément DOM** au moment de l'extraction (`n_01…`), stable tant que l'élément vit ; l'attribut reste posé même après traduction → les cibles survivent au remplacement du texte |
| `tag` | balise HTML (`button`, `h2`, `div`, `label`…) — remplace `cls` d'Android |
| `bounds` | `[left, top, right, bottom]` **pixels viewport** (`getBoundingClientRect`) |
| `tone` | `"light" \| "dark" \| "unknown"` — **calculé** via `getComputedStyle` (fond effectif), plus de `unknown` systématique |
| `text` | le texte **original** (français) même si l'écran est actuellement traduit : `data-nkap-orig` fait foi |
| Sécurité | **exclus** : `input`, `textarea`, `select`, `[type=password]`, `[contenteditable]` — jamais dumpés, jamais dessinés dessus (règle jury) |
| Poids | snapshot ≤ 30 Ko (tronquer `text` à 90 caractères) |

**Différences avec I5-android (v1 §2)** : `app{package,activity}` → `page{url,title}` ;
`cls` → `tag` ; bounds = viewport px ; `tone` calculable ; champs de saisie exclus par
balise (Android les excluait par classe). **Tout le reste est identique** — M2 code une
seule fois contre les deux variantes.

**Acceptation M4-web** : extraction ≤ 50 ms sur la page de test ; zéro champ de saisie ;
`node_id` résolvable après traduction et après scroll (`getBoundingClientRect` au moment
d'exécuter) ; testé sur la maquette ET sur l'URL réelle du comité dès accessible.

---

## 3. I1 — STT (CHANGÉ en v1.1)

**v1 web (le 14 nov.) — STT côté navigateur, zéro serveur :**
- Web Speech API (`webkitSpeechRecognition`, `lang: "fr-FR"`, `interimResults: false`).
- L'utilisateur parle **français** ; le transcript texte part dans le `POST /answer`.
- Repli si l'API n'est pas dispo (micro refusé, navigateur sans Web Speech) : champ
  texte de secours dans la bulle assistant (saisie clavier → même `POST /answer`).
- **Acceptation I1-web** : transcript correct sur les 5 questions des parcours avec
  micro laptop ; taux d'échec → repli clavier documenté dans la vidéo.

**Finale — STT serveur douala (payload v1 §3 inchangé) :**
```json
// POST /stt
{ "audio_b64": "…", "lang_hint": "dua", "sample_rate": 16000 }
→ { "text": "…", "lang": "dua", "duration_s": 2.4, "conf": 0.81 }
```
- Whisper fine-tuné sur Common Voice v27 **dua** (14,4 h, 12,5 h validées — même volume
  que l'ewondo, chemin identique). Entraînement EC2 spot entre le 14 et le 26 nov.
- **Acceptation M3-STT** : WER ≤ 35 % sur 30 phrases-test douala enregistrées par le
  locuteur (`fixtures/stt-test-30.dua`).

## 4. I2 — TTS (CHANGÉ en v1.1)

**v1 web (le 14 nov.) — banque audio embarquée dans l'extension, zéro serveur :**
- `voice-bank/{phrase_key}.m4a` (ou .opus) dans le paquet de l'extension ;
  `phrases.json` embarqué donne `{phrase_key → fichier, duration_ms, vars}`.
- Le LLM ne génère **jamais** de texte douala libre : il **sélectionne** un
  `phrase_key` et remplit les `vars` (montants recopiés à l'identique de l'écran).
- Si `phrase_key` absent de la banque → le harnais reformule via un template validé
  (§7.3 niveau 3) ; **jamais** de synthèse à la volée.
- **Acceptation I2-web** : 100 % des `phrase_key` des parcours P1-P6 couverts ;
  latence clic→son ≤ 150 ms (fichier local).

**ERRATUM (9 nov., vérifié) : `mms-tts-dua` et `mms-tts-ewo` N'EXISTENT PAS.**
La table officielle de couverture MMS ne supporte `dua` ni `ewo` qu'en LID
(détection de langue) — ni ASR, ni TTS. La v1 promettait « mms-tts-ewo en repli » :
c'était faux et non vérifié. Conséquences :
- **TTS neural = entraînement maison** sur les enregistrements du locuteur
  (la banque de phrases devient le jeu de données) → **finale uniquement**.
- Whisper ne couvre pas le douala non plus (déjà connu) → fine-tune obligatoire (§3).

**Finale — POST /tts (payload v1 §4 inchangé, `lang: "dua"`) :**
```json
{ "text": "…", "lang": "dua", "mode": "bank", "phrase_key": "balance_answer", "vars": { "amount": "42 500 FCFA" } }
→ { "audio_url": "…", "duration_ms": 2350, "mode_used": "bank", "cache_hit": true }
```

---

## 5. I3 — ActionStream (cerveau → hôte) — grammaire INCHANGÉE, transport web = HTTP

**Vocabulaire fermé de 9 types** : `speak · circle · underline · write · caption ·
arrow · frame · hide · clear`. Le validateur du harnais rejette tout le reste.

**Transport web v1** : la réponse du `POST /answer` est un bloc unique :
```json
{ "turn_id": "t_17",
  "actions": [
    { "seq": 1, "speak_seg": 0, "run_after_ms": 0,
      "action": { "t": "speak", "id": "spk_1", "phrase_key": "balance_answer",
                  "vars": { "amount": "42 500 FCFA" },
                  "caption_fr": "Votre solde est de 42 500 FCFA." } },
    { "seq": 2, "speak_seg": 0, "run_after_ms": 300,
      "action": { "t": "circle", "id": "c_1", "target": { "node_id": "n_01" },
                  "color": "ink", "duration_ms": 700 } },
    { "seq": 3, "speak_seg": 0, "run_after_ms": 900,
      "action": { "t": "write", "id": "w_1", "text": "42 500 FCFA",
                  "target": { "node_id": "n_01", "dy": -66 }, "size": 27,
                  "color": "ink", "backing": "paper", "per_letter_ms": 55 } },
    { "seq": 4, "action": { "t": "caption", "text": "…", "sub_fr": "…" } },
    { "seq": 5, "action": { "t": "clear" } }
  ] }
```

### Cibles
```json
"target": { "node_id": "n_01", "dx": 0, "dy": -34 }        // data-nkap-id (résolu à l'exécution)
```
- **`node_id` = la seule cible en production** (serveur et parcours joués sur la page).
- `match_text` **réservé aux fixtures hors-ligne** (`fixtures/actions-*.json` jouées
  sans serveur) : l'hôte résout `match_text` via sa requête locale (texte original
  d'abord, correspondance exacte puis conteneur le plus court). Cette dualité est
  assumée et documentée : offline = fixtures figées ; en ligne = node_id fiable.
- Nœud disparu → geste sauté silencieusement (jamais d'erreur visible) ; les marques
  restent **ancrées au nœud** (suivent scroll et resize).

| Champ | Règle |
|---|---|
| `seq` | ordre strict croissant par tour |
| `speak_seg` + `run_after_ms` | exécution relative au **début de lecture** du n-ième segment vocal. Absent = dès réception |
| `color` | `"ink" \| "yellow" \| "red"` — ink=expliquer, yellow=souligner, red=agir/alerter |
| `speak.phrase_key` + `vars` | **obligatoire en v1 web** — pas de `text` douala libre ; `caption_fr` = sous-titre français affiché simultanément |
| `write.text` | montants/noms **recopiés à l'identique du ScreenContext** — le validateur rejette toute altération |
| Limites | ≤ 3 marques simultanées, ≤ 1 `frame` par tour, tour ≤ 9 s |

### Validation côté harnais (règles exécutées avant envoi, inchangées v1)
1. Schéma : types fermés, champs requis, cibles existantes dans le ScreenContext courant.
2. Montants : toute chaîne montant (`/[\d\s.,]+ *(FCFA|francs?)/i`) dans `write`/`vars`
   doit exister à l'identique dans le contexte écran — sinon rejet + reformulation.
3. Budget : > 3 marques vivantes → `hide` auto des plus anciennes.
4. Vocal : `phrase_key` doit exister dans `phrases.json` validé ; sinon template.
5. **(nouveau v1.1) Lexique** : tout mot douala d'un `caption`/template doit exister
   dans `lexicon.json` validé — sinon repli gabarit (§7.3, niveau 3).

**Acceptation M2** : 95 % des flux sur le jeu de questions-test passent sans retouche ;
latence transcript→réponse ≤ 2 s ; **test de coupure** : serveur coupé en pleine démo →
l'hôte bascule sur ses fixtures sans erreur visible (démo de robustesse dans la vidéo).

### POST /answer (contrat du serveur web)
```json
// Requête
{ "session_id": "s_9f2", "turn_id": "t_17",
  "transcript": "Quel est mon solde ?", "lang_hint": "fr",
  "context": { …I5-web §2… } }
// Réponse
{ "turn_id": "t_17", "actions": [ …§5… ] }
// Erreurs : 422 { "error": "harness_reject", "reason": "…" } — l'hôte joue son repli local.
```
Auth : token statique v1 (header `X-Nkap-Token`) — vrai auth post-hackathon.

---

## 6. I4 — Rendu (M1, interne hôte) — contrat observable inchangé

Entrée = ActionStream. Contrat observable (les deux hôtes) :
- 9 types rendus ; **tracé progressif** (jamais d'apparition sèche sauf `frame` ≤ 120 ms).
- Sync : exécution à `run_after_ms` ± 150 ms du début du segment audio.
- Marques **ancrées à leur cible** : suivent scroll/resize ; cible disparue → marque
  retirée (jamais de marque orpheline flottant sur du vide).
- `tone` inconnu → trait double-contour, `write` → `backing: "paper"` forcé.
- Sous-titres `caption` (Andika, bilingue douala + français recommandé pour la démo).
- **Bulle assistant = la seule couche tactile** (web : bas-droite, ~62 px) ;
  maintien = parler, relâchement = envoi. v2 : glisser vers le haut = continu.
- Web : SVG `stroke-dashoffset` (équivalent PathMeasure), z-index maximum, l'overlay
  n'intercepte jamais la page (`pointer-events: none` partout sauf la bulle).
- Aucun crash sur nœud disparu ; `clear` ≤ 300 ms.

---

## 7. M5 — KB entreprise + la traduction (LE cœur linguistique)

### 7.1 Format dossier (inchangé v1, langue douala)

```
kb/<entreprise>/
  manifest.json      { "name": "demo-fintech", "lang": ["fr","dua"], "version": 4 }
  ui_inventory.json  { "screens": { "home": { "purpose_fr": "…", "purpose_dua": "…", … } } }
  lexicon.json       { "key": { "fr": "Solde disponible", "dua": "…", "status": "validated",
                       "note": "création du locuteur : pourquoi ce terme" }, … }   // ≥ 150 entrées
  phrases.json       { "balance_answer": { "dua": "… {amount} …", "fr": "Votre solde est de {amount}.",
                       "audio": "voice-bank/balance_answer.m4a", "duration_ms": 2350,
                       "validated_by": "locuteur-1", "validated_at": "…" } }        // 60+
  faq.md, tariffs.md
```

### 7.2 La chaîne de validation (livrable « méthode de validation linguistique »)

1. **Le locuteur natif est l'auteur** : la machine prépare la liste française et des
   pistes de dictionnaire (Helmlinger 1972, Glosbe) ; **le locuteur écrit/corrige la
   colonne douala** et documente chaque création (`note` : image, emprunt, composition).
2. **Recoupage à deux voix** quand possible (deuxième locuteur de la famille).
3. **Statuts** : `draft` (jamais affiché) → `validated` (seul statut affichable).
4. **Règle d'or** : aucun chiffre, montant, numéro ou nom dans le lexique — toujours
   recopiés tels quels de l'écran. Un contresens financier = éliminatoire.
5. Traçabilité : chaque entrée validée porte `validated_by` + `validated_at` —
   la note technique du 14 documente cette chaîne (point différenciant du jury).

### 7.3 Le contenu inédit P6 en 3 niveaux (nouveau v1.1)

Le jury injecte des messages financiers jamais vus. Trois niveaux, du plus sûr au plus
flexible — **le niveau 3 ne doit presque jamais se déclencher** :

| Niveau | Mécanisme | Couverture attendue |
|---|---|---|
| **1. Lexique de domaine** | traduction locale par `lexicon.json` — le lexique couvre tout le vocabulaire bancaire (150-200 entrées : statuts, erreurs, opérations), pas seulement les textes de la maquette | la majorité des messages inédits, mot à mot |
| **2. Composition LLM contrainte** | le cerveau compose la phrase douala **uniquement avec les mots du lexique validé** ; le harnais vérifie chaque mot ∈ lexique + montants identiques ; échec → niveau 3 | messages inédits à syntaxe nouvelle, vocabulaire connu |
| **3. Gabarit airbag** | template validé « ⚠ Attention : {message} » — la trame douala validée + le message original **français en sous-titre** ; on préfère un mot français de trop à un contresens | filet de sécurité, cible < 10 % des cas |

### 7.4 La traduction d'interface = LOCALE (décision tranchée)

- Le remplacement des textes à l'écran se fait **dans l'hôte, par le lexique verrouillé**
  — jamais par le LLM. Un lexique validé ne peut pas inventer ; le LLM, si.
- **Garde-fou codé** : le toggle de langue refuse de s'activer tant qu'une seule entrée
  du lexique actif n'est pas `status: "validated"`. (La v0.9 de l'extension acceptait
  des entrées `demo` — corrigé.)
- Les montants, numéros de compte, téléphones, noms propres ne sont **jamais** des
  nœuds traduits (règle d'intégrité, inchangée).

---

## 8. Parcours imposés (inchangés, calendrier ajusté)

| # | Parcours | Question type (fr, STT navigateur) | Marques attendues (min.) |
|---|---|---|---|
| P1 | Consultation solde | « Quel est mon solde ? » | circle + write(montant) + speak(bank) |
| P2 | Frais d'une opération | « C'est quoi ces frais ? » | underline + write(frais) |
| P3 | Préparation transfert | « Comment envoyer à ma sœur ? » | circle + arrow + frame(CTA) |
| P4 | Récapitulatif avant confirmation | « Récapitule-moi » | underline ×2 (montant, frais) + write(total) |
| P5 | Erreur / avertissement sécurité | « Ce message, c'est quoi ? » | frame rouge + speak(alerte validée) |
| P6 | **Contenu inédit** (injecté par le jury) | message jamais vu | §7.3 — niveaux 1→2→3 |

**Critère d'intégration équipe** : P1→P5 **en français le 11 nov.** (technique
découplée du risque linguistique) ; **douala le 12** (lexique validé + banque audio) ;
P6 testé avec 10 messages inédits maison les deux jours.

## 9. Jeux de test (livrables partagés)

- `fixtures/lexique-douala.csv` : la feuille de travail du locuteur (95 entrées,
  colonnes fr / brouillon / **douala_validé** / note) → alimente `lexicon.json`.
- `fixtures/actions-*.json` : parcours rejouables hors-ligne (cibles `match_text`).
- `fixtures/stt-test-30.dua` : 30 phrases douala enregistrées → WER (finale).
- `fixtures/questions-demo.json` : les questions des 5 parcours (texte + audio fr).
- `fixtures/messages-inedits.json` : 10 messages surprises pour P6.
- `mock/kwikpay.html` : maquette locale de l'environnement de test (avec injecteur
  de contenu inédit).

## 10. Qui code quoi (contremarque)

| Propriétaire | Modules | « Terminé » signifie |
|---|---|---|
| **Membre 1** | extension (M1+M4 web) + moteur Android (finale) | §2+§6 acceptation web ; P1-P6 joués sur la maquette depuis fixtures ET depuis `/answer` |
| **Membre 2** | serveur `/answer` + M2 + M5 | §5 acceptation ; sur `fixtures/questions-demo.json` → flux validés sans extension ; modèle auto-hébergé de repli prêt le 11 |
| **Membre 3** | chaîne linguistique (locuteur + banque + fixtures) | §7.2 : lexique ≥ 150 validé + banque 60 phrases enregistrées le 12 ; STT douala pour la finale |
| **Le locuteur (papa)** | validation linguistique | lexique + phrases validés et enregistrés ; disponible pour 3 sessions avant le 13 |

## 11. Ouverts (à trancher avant le 10)

1. **Protocole NKAP_SUBMIT** : comment le comité veut lire le journal
   « attendu / affiché / soumis » (API ? localStorage ? postMessage ? capture ?) —
   l'adaptateur est isolé dans `content.js`, branchement dès réponse.
2. **Environnement de test** : URL accessible avant le 13 ? livraison de l'extension
   (zip load-unpacked ? store ?) ; navigateur imposé ?
3. `screen_hint` : heuristique locale sur `url` + premiers textes (v1.1 : local).
4. `caption` bilingue : douala + français recommandé pour la démo jury (avis équipe).

## 12. Changelog v1 → v1.1 (9 nov. 2026)

| # | Décision | Raison |
|---|---|---|
| 1 | Extension web = livrable du 14 ; Android = finale | l'environnement de test du comité est une page web ; le remplacement de texte natif n'existe que sur le web |
| 2 | Langue = **douala** (plus ewondo) | locuteur natif dans l'équipe (relecteur + voix + crédibilité) ; données data équivalentes (CV 14,4 h les deux, Bible complète les deux) |
| 3 | Transport web = HTTP `POST /answer` | v1 = blocs par phrase (décision actée) ; WS ne sert qu'au streaming v2 → finale |
| 4 | Cibles = `node_id` (`data-nkap-id`) ; `match_text` = fixtures offline seulement | `match_text` casse dès que la page est traduite ; `node_id` survit au remplacement et permet le suivi de scroll |
| 5 | Traduction d'interface = locale, lexique verrouillé ; garde `validated` codé | un contresens financier est éliminatoire ; un lexique validé n'invente pas |
| 6 | P6 = 3 niveaux (lexique domaine → LLM contraint → gabarit) | traduire l'inédit sans jamais risquer un sens financier |
| 7 | Voix du 14 = banque audio embarquée ; STT du 14 = navigateur (fr) | zéro infrastructure, zéro modèle non validé ; Whisper/TTS neural → finale |
| 8 | Erratum : `mms-tts-dua`/`mms-tts-ewo` n'existent pas (LID seulement) | v1 affirmait le contraire sans vérification ; corrigé et testé le 9 nov. |
| 9 | LLM = API gratuite (type Groq) ou modèle ouvert auto-hébergé ; clé jamais côté client | consigne comité du 9 nov. : API payantes interdites |
| 10 | Dégradation gracieuse obligatoire (serveur mort → fixtures locales) | 65/100 des points se gagnent par la robustesse |

---

## 13. Révision v1.2 — Finale Multicanale SAFINUM & Nkap SDK (26 nov. 2026)

### 13.1 Passerelle officielle SAFINUM (`POST /sandbox` sur `cerveau/`)

La sandbox finale (`https://safinum.cm/sandbox/docs`) envoie chaque tour en HTTP `POST` vers l'URL publique HTTPS de l'équipe (`POST /api/v1/sandbox/endpoint`, ex. `https://13.51.168.107.sslip.io/sandbox`) avec l'en-tête **`X-Trace-Id`** (à propager sur **tous** les appels `https://safinum.cm/api/v1/...` avec `X-Team-Key`).

1. **Mobile & Web (`payload.type == "ui_translation"`)** :
   - Entrée : `{ trace_id, channel: "mobile"|"web", type: "ui_translation", language, source_language, screen, strings: { key: { text, context, max_chars } } }`
   - Sortie (`< 10 s`, UTF-8) : `{ "language": "ewo"|"dua"|"fr"|"en", "strings": { key: "traduction" } }`
   - Invariants vérifiés : 0 placeholder `{amount}/{name}/{missing}/{max}/{fee}/{phone}/{operator}/{biller}` altéré, 0 dépassement de `max_chars`, langue déclarée honnête.
2. **USSD (`channel == "ussd"`, `*123#`)** :
   - Entrée : `{ trace_id, session_id, phone, language, input: { type: "text", text, ussd_text }, constraints: { max_chars: 182, charset: "gsm7", timeout_ms: 3000 }, bank_api: { base_url } }`
   - Sortie (`< 3 s`) :
     ```json
     {
       "response": { "text": "...", "end_session": false, "options": ["..."] },
       "interpretation": { "intent": "BALANCE_INQUIRY", "parameters": {}, "language": "ewo" },
       "transaction": { "id": null, "status": "none" }
     }
     ```
   - Invariants vérifiés : **≤ 182 septets GSM-7** (transcodage automatique de `ɛ/ɔ/ŋ/ə/’` vers équivalents GSM-7), confirmation toujours dans un **tour séparé** (`POST /transactions` puis `POST /transactions/{ref}/confirm`), **13 intentions officielles** en MAJUSCULES (`BALANCE_INQUIRY`, `TRANSFER`, `FEE_INQUIRY`, `TRANSACTION_HISTORY`, `AIRTIME_PURCHASE`, `BILL_PAYMENT`, `CONFIRM`, `CANCEL`, `CORRECTION`, `CLARIFICATION_NEEDED`, `TERM_EXPLANATION`, `LANGUAGE_SWITCH`, `UNKNOWN`), aucune supposition en cas d'ambiguïté (`CLARIFICATION_NEEDED`).
3. **Canaux bonus (`sms`, `atm`, `ivr`)** : même routeur `POST /sandbox` avec contraintes canal (`sms`: 160 car GSM-7 sans session ; `atm`: multiples de 5 000 FCFA ; `ivr`: `input.type == "audio"` → réponse texte).

### 13.2 Extensions du payload visuel (`NkapTurn v1.2` — rétro-compatible v1.1)

`AnswerResponse` (`POST /answer`) conserve `turn_id` + `actions[]` et ajoute des champs optionnels :
- `meta`: `{ "channel": "web|mobile|ussd|atm|sms|ivr", "lang": "ewo|dua|fr", "intent": "...", "params": {}, "status": "ok|needs_clarification|corrected|error" }`
- `text_fallback`: résumé court (≤ 182 car. GSM-7) utilisable directement sur canal texte sans écran.
- `choices`: `[{ "id": "c1", "key": "1", "label": "...", "value": "..." }]` (boutons cliquables sur écran ou options `1/2/3` en USSD/SMS).
- `follow_up` *(v1.2.1 — suivi d'objectif multi-écrans)* : `{ "target_screens": ["home"], "target_cues": ["solde disponible", ...], "question": "Quel est mon solde ?", "ttl_ms": 30000 }`. Renvoyé par un raccourci inter-écrans : le client (extension Web/Mobile ou SDK Android) observe passivement le changement d'écran et relance automatiquement `question` (une seule fois, sans jamais cliquer à la place de l'utilisateur) dès que l'utilisateur atteint l'écran cible dans la fenêtre `ttl_ms`.

**Nouveaux types d'actions `ActionPayload.t` (en plus des 11 types v1.1) :**
| Type `t` | Rôle | Paramètres clés |
|---|---|---|
| `callout` | Curseur-compagnon + étiquette pilule anti-collision (`nameSpot`) + flèche fine | `target`, `label` / `text`, `color` |
| `num` | Pastille numérotée ① ② ③ ancrée sur une cible (parcours & menus USSD/GAB) | `target`, `step` (1..5), `label?`, `color` |
| `highlight` | Surligneur translucide non-intrusif | `target`, `color` |
| `strike` | Rature manuscrite rouge sur une valeur corrigée (scénario Correction) | `target`, `color` |
| `check` / `cross` | Coche verte ✓ ou croix rouge ✗ tracée au feutre | `target`, `color` |
| `edit` | Met à jour une marque existante par son `id` sans effacer la scène | `id`, `text?`/`label?`/`color?`/`target?` |

**Ardoise pédagogique modulaire (`notebook.mode`, toujours 1 marque dans le budget `≤ 3`) :**
- `mode: "lines"` (défaut v1.1) : `lines[]` clé/valeur ou puces.
- `mode: "flow"` : `flow_steps: [{ "label": "...", "value": "...", "tone": "ink|yellow|green|red" }]` (trajet d'argent).
- `mode: "bars"` : `bars: [{ "label": "...", "value": 25000, "amount_text": "25 000 FCFA", "tone": "..." }]`.
- `mode: "table"` : `columns: ["..."]`, `rows: [["..."]]`.
- `mode: "choices"` : `choices: [{ "id": "...", "key": "1", "label": "...", "value": "..." }]` (clarification interactive).

**Règle de sécurité inchangée** : `AmountGuard` (`validators.py` + `nkap-sdk/src/core/rules.js`) vérifie **100 %** des textes dans `callout`, `num`, `edit`, `flow_steps`, `bars`, `table` et `choices`.

### 13.3 Double voie `cerveau/` (`qwen2.5:1.5b`) & Architecture `nkap-sdk/`

- **Cerveau** : voie rapide déterministe (`< 50 ms`) pour `ui_translation`, menus USSD et intentions claires + voie LLM JSON compact (`num_predict: 160`, `temperature: 0.1`, préchauffé en RAM avec `keep_alive=-1`) pour questions ouvertes, terminologie, ambiguïtés et corrections → compilées de façon déterministe en `NkapTurn v1.2`.
- **SDK Web (`nkap-sdk/`)** : 0 dépendance, découplé en `core/` (géométrie, `nameSpot` anti-collision, `AmountGuard`, normaliseur `actions[]`/`beats[]`), `adapters/dom-adapter.js` (calibré sur `/sandbox/channel/web`, `/mobile`, `/ussd` et toute app web), `renderers/svg-renderer.js` et `renderers/text-renderer.js`. Servi aussi par FastAPI sur `/sdk/nkap-sdk.js` et injecté par `nkap-extension/vendor/nkap-sdk.js`.

