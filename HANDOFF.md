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
| membre 3 | M3 voix (STT/TTS) + fixtures + recrutement locuteur | nom inconnu — à confirmer |

**Aucun locuteur ewondo dans l'équipe** — recrutement d'un relecteur à distance en cours
(NABU/IHS Cameroon, Université de Yaoundé I, ANACLAC/CABTAL, paroisses).
Règle absolue : **aucune phrase ewondo non validée ne sort en démo** (facteur éliminatoire).

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
6. **Ewondo complet** : STT = fine-tune Whisper sur Common Voice v27 ewo (14,4 h CC0) ;
   TTS = banque ~60 phrases validées (primaire) + `mms-tts-ewo` (repli libre, CC-BY-NC) ;
   cerveau contraint par lexique verrouillé (le LLM compose, n'invente pas).
7. **Cloud AWS** (crédits équipe) : Bedrock + EC2 GPU spot. Règles : aucune instance
   laissée allumée, alarmes 60/80 $, vérifier éligibilité Bedrock + expiration.
   Laptop local = repli complet (le cloud n'est pas un chemin critique).
8. **Git** : UN repo `deiryl237/nkapmobile` — `master` (livrables) / `dev` (intégration) /
   `perso/<pseudo>-<module>` / `ia/*` (références ZCode). Jamais de push direct master.
   ≤ 3 marques simultanées, montants jamais reformulés (harnais).

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
- **Corpus** : Common Voice v27 ewo 14,4 h CC0 ; cameroon_bibles 60 langues CC-BY ;
  JW300 = risque droits ; MMS = CC-BY-NC ; Whisper sans ewo (fine-tune obligatoire) ;
  aucun TTS commercial ewo ; **aucun lexique financier ewondo existant** (à créer =
  contribution différenciante). Précédent : MTN Ouganda (USSD luganda).

## 7. Contrats (docs/02 = référence)

- I1 STT · I2 TTS (banque phrase_key + neural repli) · I3 ActionStream (9 types,
  cibles node_id/match_text-offline, run_after_ms) · I4 rendu (tracé progressif,
  sync, pas de crash) · I5 ScreenContext (≤ 200 nœuds, PIN exclu, ≤ 30 Ko).
- **fixtures/** partagées : les 4 parcours en JSON (steps/do, cibles match_text en
  offline, node_id en serveur) — consommées par M1-web, M1-android ET M2 pour tests.

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
- **lexicon.js** : lexique verrouillé — **placeholders `status:"demo"`**, toggle ewondo
  OFF par défaut ; le relecteur ewondo remplit + passe `validated:true`.
- **mock/kwikpay.html** : maquette locale de l'env Safinum (frais 1,5 %/2 %, formulaire
  bénéficiaire, récap, erreurs, boutons « injecter contenu inédit / erreurs / reset »
  simulant l'outil interne du comité).
- **À tester** : chrome://extensions → charger `nkap-extension/` → ouvrir
  `mock/kwikpay.html` (**si file:// : activer « Autoriser l'accès aux URL des
  fichiers »**, sinon pas d'injection) → recharger l'onglet → appuyer sur la
  **bulle nkap** bas-droite ×4 (ou console : `NKAP_ASSISTANT.next()`) →
  toggle ewondo → bouton inject → vérifier traduction à la volée.
  (9 nov. : bulle ajoutée + fix chemin fixtures + fix pont content↔assistant.)

## 10. Prochaines actions (dans l'ordre)

**Membre 1 (utilisateur) :**
- [ ] Leçons 1→3 de LEARN.md (app Android, filtre sécurité, ScreenContext)
- [ ] Tester l'extension sur la maquette (2 min, §9bis)
- [ ] Protection de `master` sur GitHub web (docs/03 §4)
- [ ] **Poser au comité** : protocole de soumission du journal d'intégrité +
      l'environnement de test sera-t-il accessible pendant la démo (URL publique) ?

**Membre 2 (dès identification) :**
- [ ] Activer AWS (vérifier crédits Bedrock/EC2 + expiration) + alarmes 60/80 $
- [ ] Gateway + harnais validateur + Bedrock prompt v1 (test sur fixtures)
- [ ] KB : `kb/demo-fintech/` (ui_inventory depuis la maquette, lexique v1, phrases v0)

**Membre 3 (dès identification) :**
- [ ] Fine-tune STT (EC2 spot ou Kaggle) sur Common Voice ewo
- [ ] 60 phrases ewondo écrites + validées (relecteur dès recruté) → phrases.json
- [ ] fixtures/stt-test-30.ewo (30 phrases enregistrées → WER)

**Équipe :**
- [ ] Valider cadrage + contrat ensemble
- [ ] Intégration P1-P6 extension ↔ cerveau ↔ voix en français le 11-12
- [ ] Ewondo : traduction interface (lexique validé) + voix sur banque le 12-13
- [ ] Vidéo 3 min le 12-13 · gel le 13 soir : dev → master, tag `preselection`

## 11. Conventions de session ZCode

- Le membre 1 parle français ; réponses en français.
- Brainstorm cadrage = back-and-forth (poser des questions plutôt que supposer).
- Ne jamais écrire le code des LEARN.md à sa place (mentorat, pas génération) ;
  ZCode construit les RÉFÉRENCES (moteur-rendu-ia, nkap-extension) sur branches ia/*.
- Tout changement de payload = révision versionnée de docs/02 — jamais à l'oral.
- Chaque validation visuelle = capture de la COMPOSITION complète (leçon apprise le 8 nov.).
