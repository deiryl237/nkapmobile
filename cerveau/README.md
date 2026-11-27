# 🚀 NKAP Money — Module M2 (Cerveau + Harnais de Sécurité + Gateway WebSocket)

Ce dépôt contient le code complet et opérationnel du **Module M2** et du **Gateway WebSocket** du projet **NKAP Money**, développé conformément au document d’architecture et contrats d’interfaces **v1.1 (Option 100% Gratuite & Souveraine)**.

---

## 🎯 Périmètre & Responsabilités du Module M2

1. **Gateway WebSocket unique (Section 0 & 2)** :
   - Gestion complète du cycle de vie de session (`hello` $\rightarrow$ `hello_ack`).
   - Réception et mise en cache du contexte d'écran d'accessibilité (`screen_context` — I5).
   - Prise en charge des flux audio (`audio_start`, `audio_chunk` binaires, `audio_end`).
   - Streaming temps réel du plan d'actions validé (`ActionStream` — I3).
   - Émission conjointe des métadonnées audio (`audio_out` — I2).
   - Émission du signal critique de fin de tour (`turn_end`) pour débloquer l'UI mobile.

2. **Cerveau LLM 100% Open-Weight Local (M2.1)** :
   - **Inférence open-weight locale uniquement** via **Ollama** (`http://localhost:11434`, ex. `qwen2.5:3b`, `mistral:7b`, `llama3.2:3b`) ou serveur local compatible OpenAI (`LOCAL_LLM_URL` pour `llama.cpp` / `vLLM`). Aucune API cloud payante ni free-tier externe.
   - **Repli heuristique déterministe** : garantit un taux de disponibilité de 100% hors-ligne sans jamais planter la session.

3. **Harnais de Validation & Filtre de Sécurité (M2.2)** :
   - **Zéro altération financière** : Vérification stricte mot pour mot et chiffre pour chiffre que **chaque** montant manipulé provient textuellement du `ScreenContext` ou du lexique M5.
   - **Validation stricte des cibles UI** : Rejet automatique de toute action ciblant un `node_id` (ou couple `from`/`to` pour les flèches) inexistant dans l'arbre d'accessibilité actif.
   - **Grammaire fermée des 9 actions** : Seuls les 9 types autorisés (`speak`, `circle`, `write`, `caption`, `underline`, `arrow`, `frame`, `hide`, `clear`) peuvent traverser le harnais.
   - **Limite visuelle $\le 3$ marques simultanées** : Prise en compte dynamique des actions `clear` (remise à zéro) et `hide`.

4. **Base de connaissances locale (M5)** :
   - Dictionnaires bilingues (Ewondo / Français).
   - Banques de phrases bancaires officielles (`phrases.json`).
   - Inventaires UI et manifestes d'entreprise.

5. **Hébergement des fichiers Audio TTS** :
   - Exposition du dossier statique `/static/audio/` pour servir les fichiers audio aux appareils mobiles.

---

## 📂 Structure du Répertoire

```text
nkapmoney/
├── app/
│   ├── api/
│   │   └── websocket.py        # Gateway WebSocket (cycle de vie & streaming)
│   ├── core/
│   │   ├── contracts.py        # Modèles Pydantic v2 (enveloppe commune & payloads stricts)
│   │   ├── m2_service.py       # Orchestrateur M2 (ciblage précis & génération)
│   │   └── validators.py       # Harnais de sécurité & filtre déterministe
│   ├── config.py               # Paramètres & chargement automatique de .env
│   ├── llm.py                  # Adaptateur hybride (Hugging Face + Ollama + Heuristique)
│   └── main.py                 # Serveur FastAPI, Dashboard web & fichiers statiques
├── fixtures/                   # Payloads de démonstration conformes à la spec v1.1
│   ├── action_stream.json
│   ├── screen_context.json
│   └── transcript.json
├── m5_kb/                      # Base de connaissances locale souveraine
│   └── demo-fintech/
│       ├── lexicon.json        # Dictionnaire Ewondo - Français
│       ├── manifest.json       # Métadonnées
│       ├── phrases.json        # Gabarits de réponses bancaires
│       └── ui_inventory.json   # Inventaire des écrans et composants
├── scripts/                    # Outils de simulation et d'intégration
│   ├── simulate_client.py      # Simulateur complet d'application Android (M1/M4)
│   └── simulate_m3_voice.py    # Simulateur du module Voix (STT / TTS)
├── static/
│   └── audio/                  # Dossier des fichiers WAV synthétisés (TTS)
│       └── spk_1.wav           # Fichier audio de démonstration
├── tests/                      # Suite de tests unitaires et d'intégration (20 tests)
│   ├── test_contracts.py
│   ├── test_llm_integration.py
│   ├── test_m2_service.py
│   ├── test_validation.py
│   └── test_websocket.py
├── .env.example                # Modèle des variables d'environnement
├── INTEGRATION.md              # 📖 Guide officiel d'interconnexion pour l'équipe
├── pyproject.toml              # Configuration du projet & dépendances
└── README.md
```

---

## 🚀 Installation & Démarrage Rapide

### 1. Cloner et préparer l'environnement virtuel

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

### 2. Configuration (`.env`)

Copiez le fichier `.env.example` vers `.env` :
```bash
cp .env.example .env
```

Aperçu de la configuration (open-weight local uniquement) :
```ini
# Ollama local (modèle open-weight)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=qwen2.5:3b

# Optionnel : serveur local open-weight compatible OpenAI (llama.cpp / vLLM / LM Studio)
# LOCAL_LLM_URL=http://127.0.0.1:8080/v1/chat/completions
# LOCAL_LLM_MODEL=qwen2.5-3b-instruct
```

### 3. Lancer le serveur Gateway

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Le serveur écoute sur :
- **Console Web interactive** : `http://localhost:8000/`
- **Point d'entrée WebSocket** : `ws://localhost:8000/ws/session/{session_id}`
- **Fichiers Audio TTS** : `http://localhost:8000/static/audio/`
- **Vérification de santé** : `http://localhost:8000/health`

---

## 🧪 Comment Tester le Projet ?

### Option 1 : La suite de tests automatisés (20/20)

Exécutez `pytest` dans votre terminal :
```bash
pytest -v
```
*Valide les schémas Pydantic, la robustesse anti-hallucination du harnais, le fallback Ollama et le cycle complet WebSocket en moins d'une seconde.*

---

### Option 2 : Le simulateur client Android (Terminal)

Un script interactif simule le comportement exact de l'application Android (`nkap-app`) :
```bash
# Test en langue Ewondo
./scripts/simulate_client.py ewo

# Test en langue Française
./scripts/simulate_client.py fr
```
*Le script gère automatiquement l'environnement virtuel `.venv` et déroule la séquence complète (`hello` $\rightarrow$ `screen_context` $\rightarrow$ `transcript` $\rightarrow$ `actions` $\rightarrow$ `audio_out` $\rightarrow$ `turn_end`).*

---

### Option 3 : Le Dashboard Web (Dans votre navigateur)

Ouvrez simplement [http://localhost:8000/](http://localhost:8000/) dans un navigateur. Vous pouvez cliquer sur les boutons pour connecter la WebSocket, envoyer l'état de l'écran et observer les actions défiler en temps réel.

---

## 🤝 Interconnexion avec les Autres Modules

Pour interconnecter votre serveur avec vos collègues :
- **Membre 1 (Application Android : M4 & M1)**
- **Membre 3 (Serveur Voix : STT Faster-Whisper & TTS MMS/Piper)**

👉 **Consultez le guide détaillé [INTEGRATION.md](INTEGRATION.md)**.

Il fournit :
- L'adresse IP locale (`172.31.9.31`) et les ports.
- La configuration Android essentielle (`android:usesCleartextTraffic="true"`).
- L'astuce USB sans latence : `adb reverse tcp:8000 tcp:8000`.
- Les Data Classes Kotlin prêtes à l'emploi.
- Les contrats JSON complets pour le STT et le TTS.
