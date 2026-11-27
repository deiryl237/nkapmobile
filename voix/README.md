# Service voix Ewondo

Service REST autonome pour traduire du français ou de l'anglais vers
l'ewondo, puis synthétiser la voix ewondo. Les modèles Hugging Face sont
téléchargés explicitement dans `voix/models/`, chargés depuis le disque et
utilisables sans réseau après le téléchargement.

## Modèles

| Usage | Modèle |
|---|---|
| Français / anglais → ewondo | [dadv12/nkap-translate-ewo-en-fr](https://huggingface.co/dadv12/nkap-translate-ewo-en-fr) |
| Texte ewondo → audio | [OlameMend/mms-tts-ewo](https://huggingface.co/OlameMend/mms-tts-ewo) |

Le modèle de traduction utilise le préfixe `>>ewo<<` pour demander l'ewondo.
Un téléchargement couvre environ **450 Mo de poids de modèles** ; prévoir
plus d'espace pour Python, PyTorch et les fichiers temporaires. Les modèles
ont leurs révisions épinglées dans `app/config.py`.

Les fiches de ces modèles ne précisent pas clairement leur licence. Vérifier
les droits d'utilisation avant une diffusion commerciale.

## Installation et téléchargement

Python 3.10 ou plus récent :

```powershell
cd voix
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m scripts.download_models
```

Le dépôt contient les poids localement uniquement dans le dossier ignoré par
Git `voix/models/`. Aucun jeton Hugging Face n'est requis pour ces dépôts
publics ; le script désactive explicitement l'envoi d'un jeton enregistré.
Pour ne télécharger qu'un modèle :

```powershell
python -m scripts.download_models translation
python -m scripts.download_models tts
```

## Test réel traduction + audio

Après le téléchargement, cette commande charge les deux modèles locaux,
traduit « Bonjour », génère son audio et l'enregistre dans
`voix/generated/bonjour.wav` :

```powershell
python -m scripts.run_bonjour_test
```

La commande affiche le texte ewondo, la fréquence d'échantillonnage et la
durée de l'audio. Fichier audio WAV mono PCM 16 bits, 16 kHz.

## Lancer l'API

```powershell
uvicorn app.main:app --app-dir . --host 127.0.0.1 --port 8000
```

Les poids sont chargés au démarrage depuis le disque ; si un fichier manque,
le serveur échoue explicitement en indiquant de lancer
`python -m scripts.download_models`. Aucun appel d'inférence distant n'est
fait après le téléchargement.

Documentation interactive : <http://127.0.0.1:8000/docs>

## API

### Traduire

`POST /v1/translate`

```json
{"text": "Bonjour", "source_lang": "fr"}
```

`source_lang` vaut `fr`, `en` ou `ewo`.

### Traduire et synthétiser

`POST /v1/synthesize` accepte le même JSON et renvoie le texte ewondo ainsi
qu'une URL audio locale :

```json
{
  "source_text": "Bonjour",
  "source_lang": "fr",
  "target_lang": "ewo",
  "text": "…",
  "intermediate_text": null,
  "audio_url": "http://127.0.0.1:8000/v1/audio/….wav",
  "audio_format": "wav",
  "sample_rate": 16000,
  "duration_ms": 830,
  "cache_hit": false,
  "mode_used": "neural"
}
```

`POST /v1/tts` accepte `{"text": "texte ewondo"}` et renvoie directement
`audio/wav`. `GET /v1/audio/{audio_id}.wav` récupère l'audio mis en cache et
`GET /health` vérifie que le service REST est démarré.

Le cerveau peut appeler ces routes sans dépendance de code ni partage du
runtime : ce module expose uniquement une API HTTP et charge ses propres
modèles.

## Configuration

| Variable | Défaut | Rôle |
|---|---|---|
| `VOIX_TRANSLATION_MODEL_ID` | `dadv12/nkap-translate-ewo-en-fr` | ID du modèle traduction |
| `VOIX_TRANSLATION_REVISION` | révision épinglée | Révision du modèle traduction |
| `VOIX_TRANSLATION_MODEL_PATH` | `voix/models/nkap-translate-ewo-en-fr` | Dossier local traduction |
| `VOIX_TTS_MODEL_ID` | `OlameMend/mms-tts-ewo` | ID du modèle TTS |
| `VOIX_TTS_REVISION` | révision épinglée | Révision du modèle TTS |
| `VOIX_TTS_MODEL_PATH` | `voix/models/mms-tts-ewo` | Dossier local TTS |
| `VOIX_DEVICE` | `auto` | `auto`, `cpu` ou `cuda` |
| `VOIX_OUTPUT_DIR` | `voix/generated` | Cache audio |

## Tests

```powershell
python -m pip install pytest
python -m pytest
```
