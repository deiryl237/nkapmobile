# HANDOFF — État du projet nkapmobile
### Dernière mise à jour : 9 nov. 2026 · session ZCode (GLM) avec membre 1

> **Comment reprendre** : dans une nouvelle session ZCode, dire simplement
> *« Lis HANDOFF.md à la racine du repo nkapmobile »* — puis préciser la tâche du
> moment (voir §10). Tous les chemins sont absolus sur la machine du membre 1.

---

## 1. Mission

**nkapmobile** — couche d'accessibilité linguistique pour services financiers numériques.
**Deux hôtes** pour le même cerveau/voix/KB :
- **WEB — extension Chrome** : l'environnement de test du comité (safinum.cm/hackathon-test)
  est une **page web** ; l'outil interne parle d'« extension » traduisant le contenu
  injecté « **sans hook dédié** » → **livrable principal du 14 nov.**
- **ANDROID — moteur natif** : AccessibilityService + overlay (`moteur-rendu-ia/`,
  validé sur Infinix) → démo « composant logiciel indépendant » de la FINALE + couverture
  des vraies apps mobile money.

- **Événement** : SAFINUM Innovate Challenge, Palais des Congrès Yaoundé, 26-28 nov. 2026
  (prix 1er : 2 500 000 FCFA). Sponsor hackathon : Wave.
- **Échéance** : prototype de **présélection à remettre le 14 nov. 2026**. Livrables :
  description + prototype + vidéo 3 min + note technique + méthode de validation
  linguistique. Parcours imposé : solde, frais, transfert, récapitulatif, erreur/sécurité
  + **contenu inédit injecté par le jury**. Critères 100 pts (fonctionnement 25,
  intégration 20, sécurité 20, UX 15, inédit 10, doc 10). **Facteur éliminatoire** :
  erreur linguistique modifiant un sens financier.

## 2. Équipe

| Membre | Module | Statut |
|---|---|---|
| **membre 1 (utilisateur, GitHub `deiryl237`)** | M1 moteur de rendu + M4 contexte + vision artistique (les deux hôtes) | apprend Kotlin via Antigravity + toolkit Manware (LEARN.md) — **Leçon 1 en cours** (moteur-rendu/) |
| membre 2 | M2 cerveau (harnais LLM) + M5 KB/RAG + AWS | nom inconnu — à confirmer |
| membre 3 | chaîne linguistique : lexique + banque voix + fixtures | nom inconnu — à confirmer |
| **le père du membre 1** | **locuteur douala natif : relecteur + voix** | VALIDÉ 9 nov. — 3 sessions prévues (lexique, relecture, enregistrement) |

**Décision 9 nov. : la langue du projet = DOUALA** (plus ewondo). Raison : locuteur
natif dans l'équipe ; données équivalentes (Common Voice dua 14,4 h = ewo, Bible dua
complète). Règle absolue : **aucune phrase douala non validée ne sort en démo**
(facteur éliminatoire). Chaîne : papa est l'AUTEUR du lexique (la machine ne fait que
préparer la liste fr + pistes dictionnaire) — voir docs/02 v1.1 §7.2.

## 3. Décisions actées (avec les débats tranchés)

1. **Repartir de zéro** — le PoC ne sert que de capital de connaissances (§6).
2. **Architecture 5 modules / 5 interfaces** (docs/02) : M1 rendu · M2 cerveau+harnais ·
   M3 voix · M4 contexte · M5 KB. **Cerveau/voix/KB host-agnostic** — deux hôtes de
   rendu/contexte (web + Android), même contrat.
3. **Flux d'actions** : le LLM streame un seul flux où `speak` et les gestes s'entrelacent.
   v1 = blocs par phrase, v2 = streaming token — même interface.
4. **KB entreprise = RAG** (dossier par entreprise), pas de fine-tuning avant la finale.
5. **Moteur Android** : AccessibilityService + overlay `TYPE_ACCESSIBILITY_OVERLAY`
   (prouvé par spike, implémenté §9). **Extension web** : MV3, content script +
   MutationObserver (§9bis).
6. **Douala complet** : STT = fine-tune Whisper sur Common Voice v27 dua (14,4 h CC0,
   12,5 h validées) — FINALE ; TTS neural = entraînement maison sur la voix du locuteur
   — FINALE. **Pour le 14 : banque audio embarquée dans l'extension + STT navigateur
   (Web Speech, français)**. Le LLM sélectionne des `phrase_key` validés, il ne compose
   jamais de douala libre (harnais : chaque mot ∈ lexique validé).
   ⚠ **ERRATUM vérifié le 9 nov. : `mms-tts-dua` et `mms-tts-ewo` N'EXISTENT PAS** —
   MMS ne couvre `dua`/`ewo` qu'en LID (ni ASR, ni TTS). La v1 de ce HANDOFF promettait
   « mms-tts-ewo en repli » : faux, à ne plus jamais citer.
7. **Cloud AWS** (crédits équipe) : **API payantes INTERDITES par le comité** (9 nov.).
   LLM = API gratuite de modèles ouverts (type Groq — vérifier l'orthographe avec le
   comité : Groq avec q ≠ Grok avec k) ou modèle ouvert auto-hébergé (EC2, crédits) =
   repli obligatoire prêt le 11. **Clé API jamais dans l'extension** (serveur only).
   Règles : aucune instance laissée allumée, alarmes 60/80 $. Laptop local = repli.
8. **Git** : UN repo `deiryl237/nkapmobile` — `master` (livrables) / `dev` (intégration) /
   `perso/<pseudo>-<module>` / `ia/*` (références ZCode). Jamais de push direct master.
   ≤ 3 marques simultanées, montants jamais reformulés (harnais).
9. **Contrat v1.1 (9 nov., docs/02 §12 = changelog complet)** : transport web = HTTP
   `POST /answer` (WS = finale) ; cibles = `node_id` via `data-nkap-id` (`match_text`
   réservé aux fixtures offline) ; traduction d'interface = LOCALE par lexique
   verrouillé avec garde `validated` codé ; **P6 = 3 niveaux** (lexique domaine →
   composition LLM contrainte → gabarit airbag « Attention : {message} ») ;
   dégradation gracieuse obligatoire (serveur mort → fixtures locales, jamais d'écran
   muet). La voix ne lit jamais les montants : le montant s'écrit à l'écran.

## 4. Carte des fichiers

```
C:\Users\UltraBook 3.1\Desktop\nkapmobile\        ← LE REPO GIT (branche active : ia/moteur-rendu)
├── HANDOFF.md                    ← ce fichier
├── AGENTS.md                     ← source de vérité unique pour les agents IA (pattern clicky)
├── LEARN.md                      ← curriculum du membre 1 (7 leçons, C#→Kotlin)
├── moteur-rendu-ia\              ← M1+M4 Android complets, validés sur Infinix (§9)
├── moteur-rendu\                 ← zone d'APPRENTISSAGE du membre 1 (Leçon 1 en cours — NE PAS toucher)
├── nkap-extension\               ← M1+M4 WEB : extension Chrome MV3 pour le 14 (§9bis)
│   ├── manifest.json · src\{lexicon,overlay,assistant,content,background}.js
│   ├── popup.html/js · fixtures\*.json (4 parcours)
│   ├── mock\kwikpay.html         ← maquette locale de l'env de test Safinum
│   └── README.md
├── docs\
│   ├── 01-cadrage.md             ← cadrage v1 (exigences mappées, archi, plan, budget AWS)
│   ├── 02-architecture-interfaces.md  ← LE CONTRAT : payloads I1-I5, 9 actions, parcours P1-P6
│   ├── 03-git-workflow.md        ← règles branches + cheat-sheet par membre
│   └── learning-toolkit-readme.md
├── .agents\                      ← toolkit Manware pour Antigravity (learning-companion)
├── learning\ captures\           ← journal membre 1 · preuves
└── (à venir : server/ = cerveau M2 du membre 2, voice/ = M3 du membre 3)

C:\Users\UltraBook 3.1\Desktop\projets\architecture logicielle\
├── archive-spike-context-overlay\   ← SPIKE prouvé — lecture seule
├── hackathon-safinum\               ← ANCIEN PoC (archivé) + docs de recherche :
│     recherche-langues-camerounaises.md · concept-experience.md · architecture-couche.md
│     pitch-candidature.md · checklist-pre-hackathon.md
└── outils\ plateforme-portefeuilles-wso2\   (hors projet)
```

**Branches Git** : `master` = `dev` = `perso/deiryl-moteur-rendu` = `ia/moteur-rendu`
(à 328f39d + commits HANDOFF le 9 nov.). Membre 1 code sur `perso/…` ; ZCode publie
les références sur `ia/*` ; merge sur `dev` à la validation de l'équipe.

## 5. Environnement technique (machine du membre 1)

- **Téléphone test** : Infinix X6835B, USB, id `0985537349008864`, densité ~2.2
  (720×1640 px, 360×744 dp).
- **JDK 21** : `C:\Program Files\Java\jdk-21` (JAVA_HOME à exporter dans chaque session bash)
- **Android SDK** : `C:\Users\UltraBook 3.1\AppData\Local\Android\Sdk` (android-34, build-tools 34.0.0)
- **Gradle 8.7** : `C:\Users\UltraBook 3.1\gradle\gradle-8.7\bin\gradle.bat`
- **pypdf venv** : `C:\Users\UltraBook 3.1\pdfwork\.venv` (extract.py, extract_strs2.py)
- **Editeurs** : Antigravity IDE + VS Code installés ; membre 1 code dans Antigravity
  (toolkit Manware — l'IA n'écrit pas). **ZCode = mentor/testeur** + construit les
  références (moteur-rendu-ia, nkap-extension) sur branches ia/*.
- **Extension en dev** : chrome://extensions → Mode développeur → charger
  `nkap-extension/` ; page de test = `nkap-extension/mock/kwikpay.html`

## 6. Capital de connaissances (leçons à NE PAS réapprendre)

### Technique Android (spike + moteur-rendu-ia)
- **Edge-to-edge** : convertir fenêtre→surface pour toute coordonnée de dessin.
- **Margins sur l'ancre, jamais sur l'enfant** (mesure exacte).
- **Overlay sans permission** : `TYPE_ACCESSIBILITY_OVERLAY` + `FLAG_NOT_TOUCHABLE`
  (marks) ; **la bulle = seule couche tactile** (140 px bas-droite).
- **Filtre sécurité** : `isPassword`/`EditText` jamais dumpés (règle jury).
- **Tone inconnu** → double-contour (encre + liseré) et `write` backing papier.
- **XOS/adb** : settings put exige le nom de composant COMPLET ; retirer le filtre
  self-exclusion pour que l'écran démo (notre app) soit lisible.
- RN 0.88 : FormData{uri} cassé → base64 ; websockets : URLSession partagé (leçon clicky).

### Web / extension
- **MutationObserver** = l'outil du « sans hook dédié » ; observer `childList+subtree`
  sur document.body ; ignorer ses propres nœuds overlay (`#nkap-overlay-host`).
- **SVG dashoffset** = le tracé progressif web (équivalent PathMeasure Android).
- **getBoundingClientRect** = bornes exactes des nœuds DOM (plus précis que l'arbre a11y).
- **Intégrité** : regex chiffres → aucun nœud à chiffres remplacé ; montants expliqués
  par voix/dessin, jamais réécrits.

### Produit / linguistique
- Identité visuelle « le tableau » (analyse frames des démos heyclicky, `~/heyclicky-frames/`) :
  6 gestes, 3 encres (ink=expliquer, yellow=souligner, red=agir), ≤ 3 marques, tracé
  progressif, sous-titres, police **Andika** (SIL, ɓ/ə/ɔ/ŋ/tons).
- **Corpus** : Common Voice v27 **dua 14,4 h CC0** (12,5 h validées, 13 locuteurs ;
  ewo identique) ; **Bible douala complète** (édition 2006 — corpus parallèle FR↔dua) ;
  Banen/Tunen : NT seul (2019), pas de CV → écarté. Dictionnaire **Helmlinger 1972**
  (688 p., archive.org, téléchargeable) + Glosbe dua↔fr = pistes pour papa.
  ⚠ MMS : `dua`/`ewo` en **LID seulement** (ni ASR ni TTS — erratum §3.6).
  Whisper sans dua → fine-tune obligatoire. Aucun TTS commercial douala.
  **Aucun lexique financier douala existant** (à créer par papa = contribution
  différenciante). Précédent : MTN Ouganda (USSD luganda).

## 7. Contrats (docs/02 **v1.1** = référence, §12 = changelog)

- **Web v1 (le 14)** : I1 = STT navigateur (fr) · I2 = banque audio embarquée
  (phrase_key + vars, jamais de douala libre) · I3 = réponse HTTP `POST /answer`
  {actions} (9 types, cibles `node_id`/`data-nkap-id`, match_text = fixtures offline
  seulement) · I5-web = extraction DOM (page/tag/bounds/tone calculé, saisies exclues).
- **Finale (Android)** : payloads v1 §1-§5 inchangés (WS, /stt dua Whisper, /tts).
- **P6 = 3 niveaux** (docs/02 §7.3) ; dégradation gracieuse obligatoire.
- **fixtures/** partagées : parcours JSON + **lexique-douala.csv** (feuille papa) +
  **phrases-banque.csv** (script vocal) — consommées par M1-web, M1-android ET M2.

## 8. Historique rapide

- 4-5 nov. : recherche langues → ewondo ; concept v2 (« le tableau ») après analyse
  frames heyclicky (v1 « trait doré » rejetée par le membre 1).
- 5 nov. : PoC RN/Expo validé sur appareil (pipeline vocal complet) — convainc l'équipe.
- 7-8 nov. : repartir de zéro ; cadrage + contrat ; spike natif prouvé (AccessibilityService
  + overlay sur apps tierces, sans permission) ; repo Git d'équipe (master/dev/perso).
- 9 nov. : découverte de l'environnement de test (WEB, safinum.cm/hackathon-test —
  l'outil interne parle d'extension et de « sans hook dédié ») → pivot extension ;
  moteur Android complet validé (P1/P2/P3 capturés, AmountGuard actif) ; extension MV3
  v1 construite ; AGENTS.md adopté (pattern clicky) ; membre 1 démarre la Leçon 1.
- 9 nov. (soir) : **langue → douala** (papa = locuteur natif validé) ; erratum
  mms-tts-ewo/dua ; API payantes interdites par le comité (Groq/modèle ouvert OK) ;
  contract **docs/02 v1.1** écrit ; overlays corrigés + vérifiés en navigateur
  (16590ba) ; lexique douala (95 entrées) + script phrases vocales (36) générés.

## 9. MOTEUR-RENDU-IA Android (référence complète, branche `ia/moteur-rendu`)

Implémentation complète et **validée sur Infinix** dans `moteur-rendu-ia/` :
- `core/` Kotlin pur : 9 actions + ScreenContext (parsing défensif), géométrie
  manuscrite déterministe (tremblé seedé, tracé progressif PathMeasure),
  `CompositionRules` (≤ 3 marques via LiveMarks) + **AmountGuard** (rejet réel
  observé en conditions réelles).
- `service/ScreenReaderService` : M4 (dump arbre → ScreenContext, filtre PIN,
  snapshot périodique + événements) + 3 couches overlay.
- `overlay/` : OverlaySurface (double-contour, write papier lettre/lettre, frame
  coins + étiquette, captions Andika fondu), CaptionLayer, AssistantBubble
  (SEULE couche tactile, 140 px bas-droite).
- `session/WsSession` : protocole WS du contrat (URL configurable prefs `nkap`→`ws_url`).
- `demo/` : DemoDirector (fixtures embarquées, cibles `match_text` — extension offline
  documentée) + DemoFintechActivity (KwikPay simulé, parcours imposé).
- **Mode OFFLINE** : P1→P5 sans serveur ni internet ; un tap = annule et joue le suivant.
- Pièges corrigés dedans : unités safeBottom, margins/ancres, self-exclusion du dump,
  activation adb XOS = nom de composant COMPLET.

## 9bis. NKAP-EXTENSION WEB (livrable principal du 14, branche `ia/moteur-rendu`)

`nkap-extension/` — extension Chrome MV3 :
- **content.js** : couche de traduction (lexique verrouillé, montants intacts, original
  préservé), **MutationObserver** (contenu inédit « sans hook dédié » → traduit +
  notifie le cerveau), `window.NKAP_SUBMIT` (adaptateur soumission comité — protocole
  à confirmer), `NKAP_QUERY` (text → élément DOM, équivalent node_id).
- **overlay.js** : SVG manuscrits injectés (mêmes gestes, dashoffset progressif,
  double contour), frame DOM à coins + étiquette, write papier, captions fixes,
  **bulle assistant bas-droite (seule couche tactile)** — appui = parcours suivant.
- **assistant.js** : fixtures P1/P2/P3/P5 embarquées (fetch runtime,
  `fixtures/actions-<id>.json`) + intégration cerveau via `POST /answer`
  (contexte = URL + textes visibles).
- **lexicon.js** : lexique verrouillé — **placeholders `status:"demo"`**, toggle OFF
  par défaut ; **garde à coder (10 nov.)** : le toggle refuse de s'activer tant qu'une
  entrée n'est pas `validated` ; papa remplit + passe `status:"validated"`.
- **mock/kwikpay.html** : maquette locale de l'env Safinum (frais 1,5 %/2 %, formulaire
  bénéficiaire, récap, erreurs, boutons « injecter contenu inédit / erreurs / reset »
  simulant l'outil interne du comité).
- **À tester** : chrome://extensions → charger `nkap-extension/` → ouvrir
  `mock/kwikpay.html` (**si file:// : activer « Autoriser l'accès aux URL des
  fichiers »**, sinon pas d'injection) → recharger l'onglet → appuyer sur la
  **bulle nkap** bas-droite ×4 (ou console : `NKAP_ASSISTANT.next()`) →
  toggle douala → bouton inject → vérifier traduction à la volée.
  (9 nov. : bulle ajoutée + fix chemin fixtures + fix pont content↔assistant +
  **commit 16590ba** : marques ancrées au DOM — suivent scroll/resize, cible disparue
  → marque retirée ; `NKAP_QUERY` = correspondance exacte puis conteneur le plus
  court, cherche aussi sur `data-nkap-orig` → cibles survivent à la traduction ;
  `write` respecte `target.dy`. **Vérifié en navigateur** : positionnement des 4
  gestes + suivi scroll 300 px + résistance à la traduction, captures d'écran ok.)

## 10. Prochaines actions (dans l'ordre — plan des 5 jours)

**Membre 1 (utilisateur) :**
- [ ] **Session papa n°1 (10 nov.)** : `fixtures/lexique-douala.csv` dans Google
      Sheets → il remplit la colonne `douala_valide_papa` (les mots généraux vont
      vite ; le temps réel = les créations financières, laisser vide si incertain)
- [ ] **Session papa n°2 (11)** : `fixtures/phrases-banque.csv` (36 phrases) →
      validation ; **Session n°3 (12)** : enregistrement → `voice-bank/<cle>.m4a`
- [ ] Gardes du lexique : toggle refuse si une entrée n'est pas `validated` (10 nov.)
- [ ] Briefs envoyés aux membres 2 et 3 ; protection de `master` (docs/03 §4)
- [ ] **Poser au comité** : protocole NKAP_SUBMIT (journal attendu/affiché/soumis) ;
      URL de test accessible avant le 13 ? livraison de l'extension (zip/store) ?
      navigateur imposé ? voix attendue pendant le test ? Groq ou Grok ?

**Membre 2 (dès identification) :**
- [ ] Activer AWS + alarmes 60/80 $ ; vérifier expiration des crédits
- [ ] Serveur `POST /answer` (docs/02 v1.1 §5) + harnais validateur + LLM gratuit
      (Groq ou équiv.) ; **modèle ouvert auto-hébergé de repli PRÊT le 11**
- [ ] KB : `kb/demo-fintech/` (ui_inventory depuis la maquette, lexique papa, phrases)
- [ ] Test de coupure : serveur coupé en pleine démo → repli fixtures sans erreur

**Membre 3 (dès identification) :**
- [ ] Accompagner les sessions papa (transcription → lexicon.json/phrases.json)
- [ ] Enregistrer la banque voix (36 phrases → voice-bank/) le 12
- [ ] Finale : fine-tune Whisper dua (EC2 spot) + TTS maison sur la voix de papa

**Équipe :**
- [ ] Valider docs/02 v1.1 ensemble (§12 = les 10 décisions avec leurs raisons)
- [ ] **11 nov. : P1-P6 intégrés EN FRANÇAIS** (extension ↔ cerveau, preuves capturées)
- [ ] **12 nov. : bascule douala** (lexique validé + banque audio) + P6 inédit testé
- [ ] 12-13 : vidéo 3 min + note technique (§7.2 = méthode de validation) + méthode
- [ ] **Gel le 13 soir** : dev → master, tag `preselection`

## 11. Conventions de session ZCode

- Le membre 1 parle français ; réponses en français.
- Brainstorm cadrage = back-and-forth (poser des questions plutôt que supposer).
- Ne jamais écrire le code des LEARN.md à sa place (mentorat, pas génération) ;
  ZCode construit les RÉFÉRENCES (moteur-rendu-ia, nkap-extension) sur branches ia/*.
- Tout changement de payload = révision versionnée de docs/02 — jamais à l'oral.
- Chaque validation visuelle = capture de la COMPOSITION complète (leçon apprise le 8 nov.).
