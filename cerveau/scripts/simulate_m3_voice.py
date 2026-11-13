#!/usr/bin/env python3
"""
Simulateur du module Voix M3 (STT / TTS) pour valider l'interconnexion
avec le Gateway M2.
"""

import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
venv_python = ROOT / ".venv" / "bin" / "python"

try:
    import websockets
except ModuleNotFoundError:
    if venv_python.exists() and sys.executable != str(venv_python):
        os.execv(str(venv_python), [str(venv_python)] + sys.argv)
    else:
        print("❌ 'websockets' manquant. Lancez : source .venv/bin/activate")
        sys.exit(1)

import asyncio
import json
import time


async def run_voice_service(host: str = "127.0.0.1", port: int = 8000, session_id: str = "s_voice_worker"):
    url = f"ws://{host}:{port}/ws/session/{session_id}"
    print(f"🎙️ [Module M3 Voix] Connexion au Gateway M2 : {url} ...")

    async with websockets.connect(url) as ws:
        print("✅ Module M3 connecté au Gateway M2 !")
        print("🎧 En écoute des événements audio et des actions 'speak'...\n")

        # Exemple : Injection d'un transcript simulé après connexion
        transcript = {
            "type": "transcript",
            "session_id": session_id,
            "turn_id": f"turn_{int(time.time())}",
            "ts": int(time.time() * 1000),
            "text": "Quel est mon solde disponible ?",
            "lang": "fr",
            "confidence": 0.98,
            "is_final": True,
        }

        # Pour injecter un transcript, un screen_context doit déjà exister.
        # On attend les actions générées.
        try:
            while True:
                raw = await ws.recv()
                msg = json.loads(raw)
                msg_type = msg.get("type")

                if msg_type == "action" and msg.get("action", {}).get("t") == "speak":
                    act = msg["action"]
                    spk_id = act.get("id", "spk_1")
                    text = act.get("text", "")
                    lang = act.get("lang", "ewo")
                    print(f"🔊 [M3 TTS Détecté] Synthèse demandée pour : \"{text}\" ({lang})")

                    # Simulation de la synthèse vocale (génération du wav)
                    audio_out = {
                        "type": "audio_out",
                        "session_id": session_id,
                        "turn_id": msg.get("turn_id"),
                        "ts": int(time.time() * 1000),
                        "url": f"/static/audio/{spk_id}.wav",
                        "speak_id": spk_id,
                        "duration_ms": 1800,
                    }
                    await ws.send(json.dumps(audio_out))
                    print(f"  👉 [M3 TTS Émis] audio_out envoyé pour '{spk_id}'\n")

                elif msg_type == "turn_end":
                    print(f"🏁 [M3 Info] Fin du tour détectée : {msg.get('turn_id')}")

        except websockets.exceptions.ConnectionClosed:
            print("🔌 Connexion fermée.")


if __name__ == "__main__":
    try:
        asyncio.run(run_voice_service())
    except KeyboardInterrupt:
        print("\nArrêt du simulateur voix.")

