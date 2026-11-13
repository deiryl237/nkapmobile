# nkap-extension — l'extension navigateur pour l'épreuve de présélection

> L'environnement de test du comité (safinum.cm/hackathon-test) est une **page web** ;
> l'outil interne du comité parle d'« **extension** » qui doit traduire le contenu
> injecté « **sans hook dédié** ». Cette extension est notre livrable principal du 14 nov.
> Le moteur Android (`moteur-rendu-ia/`) reste notre démo « composant logiciel indépendant »
> pour la finale — **le cerveau, la voix et la KB sont partagés** : seul l'hôte change.

## Architecture (mêmes modules, autre hôte)

| Module Android | Ici (web) | Note |
|---|---|---|
| M4 contexte (AccessibilityService) | **content script** : DOM = le contexte (texte + rects exacts via getBoundingClientRect) | plus riche que l'arbre Android : on a les sélecteurs |
| M1 rendu (Canvas overlay) | **overlay injecté** : SVG manuscrits + chips DOM ancrés sur les rects | mêmes 6 gestes, mêmes règles (≤3, double contour, backing paper) |
| session WS | fetch/WS vers le cerveau (M2) + **fixtures embarquées** pour la démo offline | contrat identique |
| Sous-titres + voix | captions injectées + audio du serveur (M3) | identique |

## Les 3 garde-fous d'intégrité (règlement §9)

1. **Aucun nœud contenant un chiffre n'est modifié** — les montants/frais/numéros
   restent affichés à l'identique (le journal du comité signale tout écart comme
   « compromis »). L'explication se fait par la voix + le dessin.
2. **Remplacement texte = lexique verrouillé uniquement** (`validated=true` par le
   relecteur ewondo). Les entrées `status:"demo"` sont des placeholders — le toggle
   ewondo du popup est **OFF par défaut**.
3. **Original préservé** (`data-nkap-orig`) → restauration instantanée au toggle off.

## Tester en 2 minutes

1. `chrome://extensions` → Mode développeur → *Charger l'extension non empaquetée* →
   sélectionner le dossier `nkap-extension/`
2. Ouvrir `mock/kwikpay.html` dans Chrome. **Si tu l'ouvres par double-clic** (URL
   `file://…`), il faut d'abord activer « **Autoriser l'accès aux URL des fichiers** »
   dans les détails de l'extension — sinon Chrome n'injecte PAS les content scripts
   (piège classique). Alternative : servir le dossier en local
   (`python -m http.server` → `http://localhost:8000/mock/kwikpay.html`).
3. **Recharger l'onglet** (F5) si la page était déjà ouverte avant le chargement de
   l'extension. Console : `[nkap] content script prêt — ewondo: false` doit apparaître.
4. La **bulle nkap** apparaît en bas à droite → chaque appui joue le parcours
   suivant (P1 solde → P2 frais → P3 transfert → P5 erreur), captions en bas à
   gauche + gestes manuscrits. Équivalent console : `NKAP_ASSISTANT.next()`.
5. Toggle « Traduire l'interface » → les textes du lexique passent en ewondo
   (placeholders démo) — les montants restent intacts
6. Bouton « Injecter du contenu inédit » de la maquette → le MutationObserver traduit
   et annote sans rechargement (« sans hook dédié »)

## Intégration cerveau (M2)

- Popup → URL du cerveau → l'assistant envoie `{text, context{url, texts[]}}` sur
  `POST /answer` et exécute le flux d'actions renvoyé (contrat §5, même format).
- Sans cerveau : fixtures embarquées (P1/P2/P3/P5) + captions.

## Protocole de soumission du comité

Le journal d'intégrité (« attendu / affiché / soumis ») implique que la solution
**soumette ses valeurs rendues**. Le mécanisme exact n'est pas encore communiqué —
l'adaptateur est isolé : **`window.NKAP_SUBMIT(values)`** dans `src/content.js`
(journal localStorage en attendant). Question posée aux organisateurs.

## Limites connues (à mettre dans la note technique)

- MutationObserver ne voit pas le contenu rendu en canvas/image (rare pour de la fintech).
- Chrome mobile : les extensions MV3 ne s'y chargent pas — la démo du 14 se fait sur
  desktop ; l'Android couvre le mobile pour la finale.
- Les sélecteurs de l'environnement réel du comité seront différents de la maquette —
  le matching est par TEXTE (robuste), pas par structure.
