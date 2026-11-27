# Guide M5 — Connaissance applicative & Scénarios débutants (SAFINUM · Wave · Max it)

> Ce document décrit la couche de connaissance applicative **M5 KB** (`cerveau/m5_kb/<app>/playbook.json`) qui permet au harnais NkapMobile de guider un utilisateur peu familier des services financiers numériques **écran par écran** avec **zéro hallucination**, même sur un modèle local léger (1,5B).

---

## 1. Principe architectural (Harnais + Playbook M5 multi-écrans)

Un petit LLM local (`qwen2.5:1.5b`) excelle pour reformuler et comprendre une intention, mais il ne connaît pas les pièges propres à chaque application ni la navigation entre écrans (ex. un texte d'aide *« Jusqu'à 500 000 FCFA par opération »* confondu avec un montant à envoyer, un solde sans libellé au sommet de Wave, ou un titre de page `Send Money` confondu avec le bouton `Send` de l'accueil).

Chaque application prise en charge dispose d'une fiche déclarative `cerveau/m5_kb/<app>/playbook.json` chargée par `AppPlaybookStore` (`cerveau/app/core/app_kb.py`) :
- **`match_packages` / `match_urls` / `match_text_cues`** : identification automatique de l'application active.
- **`screen_detectors`** : détection déterministe de l'écran exact (`home`, `send_money`, `send_new_number`, `send_amount`, `bills`, `vault`, `more`, `settings`, `card_qr` sur Wave ; `home`, `transfer`, `pay_bill`, `pay_airtime`, `review`, `receipt`, `history` sur SAFINUM) via l'`activity` Android, l'URL et les indices textuels avec clauses d'exclusion (`not_text_any`).
- **Protection anti-en-tête & anti-ligne d'historique (`_is_non_clickable_header`, `_is_transaction_row_text`)** : en mode bouton (`style="frame"`), le harnais refuse d'encadrer les balises `<h1>`/`<h2>`, les titres d'en-tête Android non cliquables situés dans la barre supérieure à droite de `←`, ainsi que les lignes d'historique (`Transfert vers ...`, `Bi lom a ...`, `Facture ENEO`, `Crédit MTN`), et impose qu'un motif bouton d'un seul mot (`"send"`, `"bills"`, `"transfert"`, `"payer"`) ne matche jamais en sous-chaîne un texte non cliquable.
- **`screen_guides`** : réponse guidée immédiate quand l'utilisateur demande *« Je dois faire quoi ici ? »*, *« Explique-moi cet écran »*, *« Où appuyer ? »*, *« Je suis perdu »* + résumé `llm_summary` injecté dans le prompt LLM pour les questions ouvertes.
- **Couverture totale N × M (`qa_shortcuts` + `follow_up`)** : chaque combinaison `(écran, intention)` de SAFINUM (7 écrans), Wave (9 écrans) et Orange Max it (5 écrans) dispose d'un guidage déterministe. Si l'utilisateur demande une fonctionnalité située sur un autre écran (ex. *« Comment envoyer de l'argent ? »* depuis Wave `Payments` ou SAFINUM `Historique`), Nkap pointe exactement le bouton de navigation (`←`, `Lomo`/`Transfert`, `Yaan`/`Payer`, `Nda`/`Accueil`, `Itang`/`Historique`), mémorise la question pendant 30 s, puis **reprend automatiquement** la réponse dès l'arrivée sur l'écran cible — sans jamais cliquer à sa place.
- **Normalisation 2e personne (`_enforce_second_person_fr`)** : corrige automatiquement tout écho du petit LLM à la 1re personne (*« Mes contacts »* → *« Tes contacts »*, *« Mon solde »* → *« Ton solde »*) tout en préservant les libellés d'interface cités entre guillemets (`« Mes bénéficiaires »`).

---

## 2. Environnement de test SAFINUM (`banque-demo.sandbox` — Web, Mobile & USSD)

Fiche : `cerveau/m5_kb/safinum-sandbox/playbook.json` (calibrée sur la documentation officielle `https://safinum.cm/sandbox/docs` et les 90 clés FR / EN / Ewondo / Duálá de `cerveau/app/sandbox/translations/{ewo,dua,en}.json`).

Règles métier officielles du bac à sable SAFINUM :
- **Grille de frais** : Transfert & Retrait (`1–5 000` → `50 FCFA`, `5 001–25 000` → `150 FCFA`, `25 001–100 000` → `400 FCFA`, `> 100 000` → `1 %`) · Crédit téléphone (`0 FCFA`) · Factures (`100 FCFA` fixe) · Plafond : `500 000 FCFA` / opération.
- **Sécurité transactionnelle** : `POST /transactions` crée une opération `pending` sans rien débiter ; seul `Confirmer` sur `/review` exécute le débit.
- **Facturiers & opérateurs** : `ENEO`, `CAMWATER`, `CANAL`, `CAMTEL` · opérateurs `MTN`, `ORANGE`, `CAMTEL` (détection automatique au préfixe).
- **Guidage inter-écrans** : demander son solde depuis `/transfer`, `/pay` ou `/history` renvoie vers l'onglet `Accueil` ; demander ses dernières opérations depuis `/transfer`, `/pay`, `/review` ou `/receipt` renvoie vers l'onglet `Historique` (jamais *« Hors contexte »*).

| Écran | Contenu réel (FR · Ewondo · Duálá) | Questions débutant typiques | Comportement Nkap |
|---|---|---|---|
| **Accueil (`/home`)** | Solde disponible (`Itan ineu` / `Moni ma pene`), 4 raccourcis (`Lomo moni`, `Yaan mfie ai kalara`, `Kus kredi telefon`, `Itang mvet yam`), dernières opérations, `Wog`/`Senga` | *« Quel est mon solde ? »*<br>*« Comment envoyer de l'argent ? »*<br>*« Comment payer une facture ? »*<br>*« Comment acheter du crédit ? »*<br>*« Je dois faire quoi ici ? »* | Cercle doré seul sur le solde ; cadre `Appuie ici` sur l'action demandée (`Lomo moni`, `Yaan mfie ai kalara`, `Kus kredi telefon`, `Itang mvet yam`). |
| **Transfert (`/transfer`)** | Titre `Envoyer de l'argent` (`Lomo moni`), champs `Bénéficiaire` (`Mod a non moni` / `Mukusa`) et `Montant` (`Itan` / `Moni`), indice **`Jusqu'à 500 000 FCFA par opération`** (`Akui 500 000` / `Tinga 500 000`), liste **`Mes bénéficiaires`** (`Bot bam ba non moni` / `Bakusa bam`), `Annuler` (`Vaa` / `Buka`), `Continuer` (`Kele obusu` / `Ala oboso`) | *« Je veux envoyer de l'argent »* (déjà sur `/transfer`)<br>*« Je dois faire quoi ici ? »*<br>*« Je dois envoyer 500 000 FCFA ? »*<br>*« C'est quoi la liste à droite ? »*<br>*« Comment annuler ? »* | Indique **« Tu es déjà sur l'écran de transfert ! »** avec **① Bénéficiaire → ② Montant → cadre ③ Continuer** (jamais le titre `<h2>`!). L'indice `500 000 FCFA` est marqué `role=hint`. |
| **Payer — Facture (`pay_bill`)** | Onglets `Facture` (`Kalara` / `Kalati`) et `Crédit` (`Kredi`), `Choisir le service` (`Tob isae` / `Pona ebolo`), 4 facturiers (`ENEO`, `CAMWATER`, `CANAL`, `CAMTEL`), `Montant`, `Continuer` | *« Je dois faire quoi ici ? »*<br>*« Comment payer ENEO ? »*<br>*« Je veux acheter du crédit »* | Guide pas-à-pas **① Fournisseur → ② Montant → ③ Continuer** ; bascule sur l'onglet `Crédit` si l'utilisateur veut recharger. |
| **Payer — Crédit (`pay_airtime`)** | `Numéro à recharger` (`Nombo ya lomo kredi` / `Nimero ya kredi`), `Opérateur détecté` (`Nsaa a yenban` / `Singi e yenbe`), `Montant`, `Continuer` | *« Je dois faire quoi ici ? »*<br>*« Comment recharger mon numéro ? »*<br>*« Je veux payer une facture »* | Guide **① Numéro → ② Montant → ③ Continuer** ; bascule sur l'onglet `Facture` si l'utilisateur veut payer ENEO/CAMWATER. |
| **Récapitulatif (`/review`)** | `Vérifiez avant de confirmer` (`Fombo ossussua eneu wa yemban` / `Ombwa oboso ba bamse`), Bénéficiaire/Service, Montant, Frais (`Mbug` / `Mabala`), Total (`Ntolan wog` / `Botali ba busa`), Solde après (`Itan e li'i` / `Moni ombusa`), avertissement irréversible, `Confirmer` (`Yemban` / `Bamse`), `Modifier` (`Tyende` / `Tukwa`), `Annuler` | *« Combien il me restera après ? »*<br>*« Je dois faire quoi ici ? »*<br>*« Comment modifier / corriger ? »*<br>*« Comment confirmer ? »*<br>*« Comment annuler ? »* | Cadre rouge `Confirmer` avec rappel de vérification ; cadre `Modifier` si erreur (rien n'est débité) ; ardoise `flow` pour la décomposition Montant → Frais → Solde après. |
| **Reçu (`/receipt`)** | `Opération réussie` (`Mvet o boban mben` / `Ebolo e tilabe na bwam`) ou `Opération annulée`, `Référence` (`Nombo ndem` / `Edun`), `Nouveau solde` (`Itan mfefe` / `Moni ma pene ma dia`), `Terminé` / `Retour` | *« L'argent est bien parti ? »*<br>*« Où est ma preuve / référence ? »* | Surligne la référence en vert et rassure sur le statut + nouveau solde. |
| **Historique (`/history`)** | Filtres `Tout` (`Mese`), `Reçus` (`Bi bi` / `Ma-poy`), `Envoyés` (`Bi lom` / `Ma-ala`), statuts `Confirmé`, `En attente`, `Annulé`, `Échoué` | *« Je dois faire quoi ici ? »*<br>*« Comment filtrer les reçus ? »*<br>*« Que veut dire En attente / Annulé ? »* | Marque **① Reçus → ② Envoyés** et explique les 4 statuts clairement. |

---

## 3. Wave Mobile Money (`com.wave.personal` — Sponsor officiel)

Fiche : `cerveau/m5_kb/wave/playbook.json` (calibrée sur dumps `uiautomator` réels et captures multi-écrans sur TECNO KN4).

Particularités techniques de l'arbre d'accessibilité Wave :
1. Sur `PersonalHomeActivity`, la **liste de transactions** (`y=834`, ex. `GIMAC transfer ... | 1.500F`) apparaît **avant** le bandeau supérieur fixe (`1.500F` centré en `y=157, h=72px`, accompagné de `content-desc="Hide balance"` en `y=186`). Le cerveau trie les nœuds en ordre visuel `(y, x)` et identifie prioritairement le grand montant en tête d'écran / adjacent à `Hide balance` comme **`Solde disponible`**.
2. Les 4 icônes principales (`Send`, `Bills`, `Vault`, `More`) ont `clickable=false` sur leur `TextView` enfant (le conteneur parent porte le clic). Le playbook les classe explicitement en `role=button`.
3. Sur les sous-écrans (`Send Money`, `Bills`, `Vault`, `Settings`), la barre du haut affiche `←` puis le **titre de la page** (`Send Money`, non cliquable). Grâce aux `screen_detectors` + au garde-fou anti-en-tête, Nkap sait que l'utilisateur est **déjà** sur le sous-écran et n'encadre jamais le titre de page.

Parcours complet Wave couvert (9 écrans) :

| Écran Wave | Détection | Scénarios débutants couverts |
|---|---|---|
| **`home`** (`PersonalHomeActivity`) | `Hide balance` / `Show balance` ou trio `Send + Bills + Vault` | Solde du haut (`1.500F`, jamais la transaction du bas), `Send` (cadre `Appuie ici`), `Bills`, `Vault` (Coffre), `More`, `QR code` central, œil `Hide balance`, roue `Settings`, *« Je dois faire quoi ici ? »*. |
| **`send_money`** (Choix destinataire) | `Scan to send` ou `Enter a new number + Contacts` | *« Je veux envoyer de l'argent »* / *« Je dois faire quoi ici ? »* → dit **« Tu es déjà sur l'écran d'envoi ! »** et pointe **① `Enter a new number`**, **② `Scan to send`**, **③ `Contacts`** (n'encadre jamais le titre `Send Money` !). Questions dédiées sur `To`, nouveau numéro, scanner QR, retour `←`. |
| **`send_new_number`** | `Full Name` / `Nom complet` + `Next` / `Suivant` | Guide saisie nom + numéro (vérifier chaque chiffre) + cadre `Next`. |
| **`send_amount`** | `Send Amount` / `Receive Amount` / `Wave fee` | Guide saisie montant, différence entre montant envoyé et montant reçu (frais Wave), validation. |
| **`card_qr`** (`CardFullScreenActivity`) | `CardFullScreenActivity` / `Scan to pay` | Explique l'usage du QR plein écran (dépôt/retrait agent, réception) + retour `←`. |
| **`bills` (`Payments`)** | `Payments` / `Utilities` / `ENEO Prepaid` / `ENEO Postpaid` / `CAM-WATER` / `Canal+` | Guide sélection fournisseur, explique `ENEO Prepaid` (compteur prépayé) vs `ENEO Postpaid` (facture mensuelle), encadre `CAM-WATER` et `Canal+`, et redirige avec `follow_up` vers `home` pour envoyer de l'argent, voir le solde, le coffre ou les paramètres. |
| **`vault`** | `Lock vault` / `Transfer to vault` / `Withdraw from vault` | Explique l'épargne séparée dans le Coffre, dépôt et retrait vers le solde principal. |
| **`more`** | `Airtime` / `Rewards` / `Transport` (hors `home`) | Présente le crédit téléphonique et les services complémentaires. |
| **`settings`** | `Reset secret code` / `Call support` / `Find nearby agents` / `Verify your limit` | Explique changement de code secret, plafonds, agents proches et support Wave. |

---

## 4. Orange Max it (`com.orange` / `maxit`)

Fiche : `cerveau/m5_kb/maxit/playbook.json` (calibrée sur captures réelles sur TECNO KN4).

Particularités gérées :
- Fusion automatique dans `ScreenReaderService.kt` des `TextView` séparés `Nombre + Devise` (`"24 828,58"` + `"FCFA"` → `"24 828,58 FCFA"` ; `"1,04"` + `"U"` → `"1,04 U"`).
- Raccourcis d'accueil scopés à `screens: ["home"]` (`Money transfer`, `Cancel transaction`, `Buy a bundle`, `Top Up`) + écran `transfer` dédié pour ne jamais reboucler vers l'accueil une fois dans le formulaire d'envoi.

---

## 5. Ajouter une nouvelle banque / fintech en 5 minutes

Créez simplement `cerveau/m5_kb/<nom-banque>/playbook.json` avec `screen_detectors`, `screen_guides` et `qa_shortcuts` scopés par écran, puis redémarrez `nkap-cerveau` : `AppPlaybookStore` détecte et active la nouvelle application automatiquement, sans modifier une seule ligne de code Python ou Kotlin.
