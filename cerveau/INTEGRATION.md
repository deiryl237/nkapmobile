# 🔌 Guide d'Interconnexion & d'Intégration — NKAP Money

Ce document constitue le **guide d'intégration officiel** entre le module **M2 (Gateway / Cerveau)** et les autres modules de l'équipe :
- **Membre 1** : `nkap-app` (M4 Accessibility Context + M1 Moteur de Rendu Android)
- **Membre 3** : Module Voix (M3 Faster-Whisper STT + MMS-TTS / Piper)

---

## 🌐 1. Matrice Réseau & Points d'Accès

| Service | Protocole | Adresse réseau locale | Description |
|---|---|---|---|
| **Gateway WebSocket** | `WS` | `ws://172.31.9.31:8000/ws/session/{session_id}` | Canal unique bidirectionnel de session |
| **Serveur Audio TTS** | `HTTP` | `http://172.31.9.31:8000/static/audio/{id}.wav` | Hébergement statique des synthèses vocales |
| **Console Web de test** | `HTTP` | `http://172.31.9.31:8000/` | Dashboard interactif avec simulation en direct |
| **Vérification de santé**| `HTTP` | `http://172.31.9.31:8000/health` | Vérifie que le serveur M2 est bien en ligne |

> 💡 **Sur Mac/Linux** : pour vérifier l'état du serveur depuis n'importe quelle machine du réseau :  
> `curl http://172.31.9.31:8000/health`

---

## 📱 2. Guide d'Intégration — Membre 1 (Application Android)

### A. Configuration requise dans Android Studio (`AndroidManifest.xml`)

Par défaut, Android bloque les connexions `ws://` et `http://` non chiffrées (Cleartext). Vous **devez** autoriser le trafic clair dans votre manifeste :

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="cm.demo.fintech">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:usesCleartextTraffic="true"
        android:label="NKAP Money"
        ... >
        ...
    </application>
</manifest>
```

---

### B. Choix de l'URL de connexion selon votre environnement

1. **Sur Émulateur Android Studio** :
   ```kotlin
   val wsUrl = "ws://10.0.2.2:8000/ws/session/s_mobile_demo"
   ```
2. **Sur Téléphone physique en Wi-Fi** (connecté au même réseau que le Mac) :
   ```kotlin
   val wsUrl = "ws://172.31.9.31:8000/ws/session/s_mobile_demo"
   ```
3. **Sur Téléphone physique branché en USB (Recommandé - Zéro problème de Wi-Fi)** :
   Exécutez dans votre terminal :
   ```bash
   adb reverse tcp:8000 tcp:8000
   ```
   Votre téléphone peut alors se connecter directement comme s'il était en local :
   ```kotlin
   val wsUrl = "ws://127.0.0.1:8000/ws/session/s_mobile_demo"
   ```

---

### C. Modèles Kotlin prêts à l'emploi pour Android (Data Classes)

```kotlin
// 1. Enveloppe commune
data class Envelope(
    val type: String,
    val session_id: String,
    val turn_id: String?,
    val ts: Long
)

// 2. Action reçue de M2 (ActionStream I3)
data class ActionTarget(
    val node_id: String,
    val dx: Int? = null,
    val dy: Int? = null
)

data class ActionPayload(
    val t: String,               // "speak", "circle", "write", "underline", "frame", etc.
    val id: String? = null,
    val text: String? = null,
    val target: ActionTarget? = null,
    val color: String? = null,
    val duration_ms: Long? = null,
    val per_letter_ms: Long? = null
)

data class ActionMessage(
    val type: String,            // "action"
    val session_id: String,
    val turn_id: String?,
    val ts: Long,
    val seq: Int,
    val run_after_ms: Long,
    val action: ActionPayload
)
```

---

### D. Déroulement du cycle de vie côté Android

1. **Connexion** : Dès que la WebSocket s'ouvre, envoyez :
   ```json
   { "type": "hello", "session_id": "s_01", "ts": 1699450000000, "device_id": "pixel_7" }
   ```
   *Attendez la réception de `{"type": "hello_ack", ...}`.*
2. **Changement d'écran** : Dès que l'activité change, M4 envoie `screen_context`.
3. **Pendant un tour** :
   - Vous recevez les messages `action` ordonnés par `seq`.
   - Exécutez chaque geste après `run_after_ms` millisecondes.
   - Vous recevez `audio_out` : chargez l'URL `http://172.31.9.31:8000/static/audio/spk_1.wav` dans votre `MediaPlayer` Android.
4. **Fin du tour (`turn_end`)** : Dès réception de `{"type": "turn_end", ...}`, débloquez les clics utilisateur sur l'écran.

---

## 🎙️ 3. Guide d'Intégration — Membre 3 (Module Voix : STT & TTS)

### A. Intégration du STT (Speech-To-Text / Faster-Whisper)

Lorsque l'utilisateur parle, le client envoie l'audio brut (`audio_chunk`). Dès que Faster-Whisper a décodé la phrase, vous émettez sur le WebSocket :

```json
{
  "type": "transcript",
  "session_id": "s_01",
  "turn_id": "t_turn_101",
  "ts": 1699450001000,
  "text": "Quel est mon solde ?",
  "lang": "fr",
  "confidence": 0.99,
  "is_final": true
}
```

---

### B. Intégration du TTS (Text-To-Speech / MMS-TTS ou Piper)

1. **Écoutez l'action `speak` émise par M2** :
   ```json
   {
     "type": "action",
     "action": {
       "t": "speak",
       "id": "spk_1",
       "text": "Solde wɔ́g á 42 500 FCFA.",
       "lang": "ewo",
       "phrase_key": "balance_answer"
     }
   }
   ```
2. **Générez le fichier audio WAV** et enregistrez-le dans le dossier :
   `static/audio/{id}.wav` (ex: `static/audio/spk_1.wav`).
3. **Émettez l'événement `audio_out` (I2)** :
   ```json
   {
     "type": "audio_out",
     "session_id": "s_01",
     "turn_id": "t_turn_101",
     "ts": 1699450001200,
     "url": "/static/audio/spk_1.wav",
     "speak_id": "spk_1",
     "duration_ms": 1800
   }
   ```

---

## 🛠️ 4. Outils de Test Mis à Disposition

1. **Simulateur client complet** :
   ```bash
   ./scripts/simulate_client.py ewo
   ./scripts/simulate_client.py fr
   ```
2. **Simulateur module voix M3** :
   ```bash
   ./scripts/simulate_m3_voice.py
   ```
3. **Console Web interactive** :
   Ouvrez simplement [http://172.31.9.31:8000/](http://172.31.9.31:8000/) dans votre navigateur pour tester en direct sans coder de client.

