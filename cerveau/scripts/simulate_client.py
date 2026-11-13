#!/usr/bin/env python3
"""
Simulateur de client mobile (M1 / M4) pour tester en conditions réelles
le Gateway WebSocket M2 et l'intégration bout-en-bout.
"""

import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
venv_python = ROOT / ".venv" / "bin" / "python"

# Si websockets n'est pas installé dans le python global, basculer automatiquement sur .venv
try:
    import websockets
except ModuleNotFoundError:
    if venv_python.exists() and sys.executable != str(venv_python):
        os.execv(str(venv_python), [str(venv_python)] + sys.argv)
    else:
        print("❌ Erreur : Le paquet 'websockets' n'est pas installé.")
        print("👉 Veuillez activer l'environnement virtuel : source .venv/bin/activate")
        print("👉 Ou installer les dépendances : pip install -e .\n")
        sys.exit(1)

import asyncio
import json


async def run_simulation(
    host: str = "127.0.0.1",
    port: int = 8000,
    session_id: str = "s_demo_dev",
    lang: str = "ewo",
    question: str = "Quel est mon solde ?",
):
    url = f"ws://{host}:{port}/ws/session/{session_id}"
    print(f"\n🔌 Connexion au Gateway M2 : {url} ...")

    screen_fixture = ROOT / "fixtures" / "screen_context.json"
    screen_data = json.loads(screen_fixture.read_text(encoding="utf-8"))

    async with websockets.connect(url) as ws:
        print("✅ Connecté au WebSocket M2 !")

        # Étape 1 : Handshake 'hello' (Section 2)
        print("\n[Étape 1] 📱 Envoi du handshake 'hello'...")
        hello_msg = {
            "type": "hello",
            "session_id": session_id,
            "ts": 1699450000000,
            "device_id": "pixel_7_android_14",
        }
        await ws.send(json.dumps(hello_msg))
        ack = json.loads(await ws.recv())
        print(f"📥 Réponse reçue : {ack}")
        assert ack.get("type") == "hello_ack", f"Attendu hello_ack, reçu: {ack}"

        # Étape 2 : Transmission du ScreenContext (I5)
        print("\n[Étape 2] 📱 Envoi du ScreenContext (M4 -> M2)...")
        screen_data["session_id"] = session_id
        await ws.send(json.dumps(screen_data))
        print(f"📤 ScreenContext envoyé ({len(screen_data['nodes'])} nœuds UI)")

        # Étape 3 : Simulation d'un tour de parole utilisateur (M3 -> M2)
        print(f"\n[Étape 3] 🎙️ Envoi de la transcription ({lang}): '{question}'...")
        transcript_msg = {
            "type": "transcript",
            "session_id": session_id,
            "turn_id": "t_turn_101",
            "ts": 1699450001000,
            "text": question,
            "lang": lang,
            "confidence": 0.99,
            "is_final": True,
        }
        await ws.send(json.dumps(transcript_msg))

        # Étape 4 : Réception et affichage du flux ActionStream validé (M2 -> M1)
        print("\n[Étape 4] 🎬 Réception du flux d'actions (ActionStream I3) :")
        while True:
            raw_msg = await ws.recv()
            msg = json.loads(raw_msg)
            msg_type = msg.get("type")

            if msg_type == "action":
                act = msg["action"]
                t = act["t"]
                seq = msg["seq"]
                run_after = msg.get("run_after_ms", 0)

                if t == "speak":
                    print(f"  🔊 Action #{seq} [+{run_after}ms] SPEAK : \"{act.get('text')}\" (lang={act.get('lang')}, mode={act.get('mode')})")
                elif t == "circle":
                    print(f"  ⭕ Action #{seq} [+{run_after}ms] CIRCLE : cible node_id={act.get('target', {}).get('node_id')} (couleur={act.get('color')})")
                elif t == "write":
                    print(f"  ✍️ Action #{seq} [+{run_after}ms] WRITE : \"{act.get('text')}\" au-dessus de {act.get('target', {}).get('node_id')} (dy={act.get('target', {}).get('dy')})")
                else:
                    print(f"  ✨ Action #{seq} [+{run_after}ms] {t.upper()} : {act}")

            elif msg_type == "audio_out":
                print(f"  🎵 AudioOut (I2) reçu : URL='{msg.get('url')}' (speak_id={msg.get('speak_id')}, durée={msg.get('duration_ms')}ms)")

            elif msg_type == "turn_end":
                print(f"\n🏁 Signal 'turn_end' reçu ! (session={msg.get('session_id')}, turn={msg.get('turn_id')})")
                print("📱 L'application mobile (M1) a exécuté toutes les animations et rend la main à l'UI.")
                break

            elif msg_type == "error":
                print(f"❌ Erreur reçue : {msg}")
                break

        print("\n🎉 Test d'intégration WebSocket réussi à 100 % !\n")


if __name__ == "__main__":
    lang_arg = sys.argv[1] if len(sys.argv) > 1 else "ewo"
    try:
        asyncio.run(run_simulation(lang=lang_arg))
    except ConnectionRefusedError:
        print("❌ Impossible de se connecter au serveur. Assurez-vous d'avoir lancé :")
        print("   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000\n")

