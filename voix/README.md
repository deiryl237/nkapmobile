# Service TTS ewondo et traduction

API locale de traduction **français → ewondo**, **anglais → français → ewondo**,
et de synthèse vocale ewondo. Les modèles sont chargés depuis le disque et
l'inférence ne contacte pas Hugging Face.

## Modèles

| Usage | Modèle | Révision par défaut |
|---|---|---|
| TTS ewondo | [OlameMend/mms-tts-ewo](https://huggingface.co/OlameMend/mms-tts-ewo) | `d1614d3b8002f663b660a7c0d982e7ca398566ba` |
| Français ↔ ewondo | [bivariant/Griot-MT-1.3B-ALL](https://huggingface.co/bivariant/Griot-MT-1.3B-ALL) | `2a19a8919d712db90774bb8d2e7e58a4b568c8d1` |
| Anglais → français | [Helsinki-NLP/opus-mt-en-fr](https://huggingface.co/Helsinki-NLP/opus-mt-en-fr) | `dd7f6540a7a48a7f4db59e5c0b9c42c8eea67f18` |

Griot-MT ne déclare pas de direction anglais → ewondo. La traduction anglaise
utilise donc deux modèles en séquence ; elle peut accumuler les erreurs du
pivot français. Les fiches des modèles Griot-MT et MMS-TTS ewondo ne précisent
pas leur licence : vérifier les droits d'utilisation avant une diffusion
commerciale.

Le checkpoint Griot-MT fait environ **2,74 Go**, son adaptateur Ewondo environ
95 Mo, le modèle anglais-français environ 301 Mo, et le TTS environ 145 Mo.
Prévoir plus de 3,3 Go pour les poids, en plus de l'espace d'installation.

## Installation et téléchargement

Python 3.10 ou plus récent :

```powershell
cd voix
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m scripts.download_models
```

Le téléchargement récupère uniquement les poids/tokenizers requis, dans
`voix/models/`. Il faut un accès internet uniquement pour l'installation et
cette étape de téléchargement. Les modèles et fichiers audio générés sont
ignorés par Git. Télécharger un modèle ne vaut pas validation de sa qualité.

## Démarrer

```powershell
uvicorn app.main:app --app-dir . --host 127.0.0.1 --port 8000
```

Documentation interactive : <http://127.0.0.1:8000/docs>

Le serveur charge les poids au démarrage ; si un fichier manque ou que le
checkpoint est incompatible, le démarrage échoue avec une erreur explicite.
Le CPU est sélectionné par défaut ; `VOIX_DEVICE=cuda` force CUDA.

## API

### Traduire

`POST /v1/translate`

```json
{"text": "Good morning", "source_lang": "en"}
```

`source_lang` vaut `fr`, `en` ou `ewo`. Exemple de réponse :

```json
{
  "source_text": "Good morning",
  "source_lang": "en",
  "target_lang": "ewo",
  "text": "…",
  "intermediate_text": "Bonjour"
}
```

`intermediate_text` est la traduction française utilisée pour les requêtes
anglaises ; il vaut `null` pour les autres langues.

### Traduire puis synthétiser

`POST /v1/synthesize` accepte le même JSON et renvoie le texte Ewondo ainsi
qu'une URL audio locale :

```json
{
  "source_text": "Good morning",
  "source_lang": "en",
  "target_lang": "ewo",
  "text": "…",
  "intermediate_text": "Bonjour",
  "audio_url": "http://127.0.0.1:8000/v1/audio/….wav",
  "audio_format": "wav",
  "sample_rate": 16000,
  "duration_ms": 830,
  "mode_used": "neural",
  "cache_hit": false
}
```

L'URL audio est réutilisable sur le même serveur. `POST /v1/tts` accepte
`{"text": "texte ewondo"}` et renvoie directement `audio/wav`.
`GET /health` indique si les modèles sont chargés.

Les fichiers audio sont servis en WAV mono PCM 16 bits, 16 kHz. Le contrat
d'intégration I2 de `docs/02-architecture-interfaces.md` prévoit de l'Opus :
un transcodage sera nécessaire avant de raccorder cette API directement au
serveur de production.

## Changer les modèles

Les IDs, révisions et chemins locaux sont configurables par variables
d'environnement : `VOIX_TTS_MODEL_ID`, `VOIX_TTS_REVISION`,
`VOIX_TTS_MODEL_PATH`, `VOIX_GRIOT_MODEL_ID`, `VOIX_GRIOT_REVISION`,
`VOIX_GRIOT_MODEL_PATH`, `VOIX_EN_FR_MODEL_ID`, `VOIX_EN_FR_REVISION` et
`VOIX_EN_FR_MODEL_PATH`. `VOIX_OUTPUT_DIR` et `VOIX_DEVICE` configurent les
sorties et le périphérique d'inférence.

Les modèles de remplacement doivent garder l'architecture/tokenizer du
backend correspondant. Pour changer d'architecture, implémenter l'interface
du backend concerné dans `app/models.py` et modifier sa fabrique ; le reste de
l'API ne dépend pas des modèles Hugging Face.

## Tests

```powershell
python -m pip install pytest httpx
python -m pytest
```
