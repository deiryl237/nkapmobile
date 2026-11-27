from __future__ import annotations

import os
import time
from pathlib import Path
from contextlib import asynccontextmanager
from uuid import uuid4
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from app.api.sandbox import router as sandbox_router
from app.api.websocket import router as ws_router, service
from app.core.contracts import AnswerRequest, AnswerResponse, Transcript

ROOT_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = ROOT_DIR / "static"
STATIC_DIR.mkdir(exist_ok=True)
(STATIC_DIR / "audio").mkdir(exist_ok=True)
(STATIC_DIR / "sdk").mkdir(exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Préchauffe Ollama en mémoire au démarrage pour éviter 30s de chargement à froid."""
    try:
        await run_in_threadpool(service.llm.warmup)
    except Exception:
        pass
    yield


app = FastAPI(
    title="nkap-m2",
    description="Module M2 Cerveau & Harnais de Sécurité - NKAP Money",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS pour autoriser l'accès depuis l'extension Chrome et tout client web
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Montage des fichiers statiques (audio TTS + SDK Web drop-in /sdk/nkap-sdk.js)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/sdk", StaticFiles(directory=str(STATIC_DIR / "sdk")), name="sdk")

# Routage WebSocket M2 + Passerelle officielle SAFINUM Sandbox Finale
app.include_router(ws_router)
app.include_router(sandbox_router)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "m2",
        "version": "0.1.0",
        "llm": {
            "ollama_host": service.llm.ollama_host,
            "ollama_model": service.llm.ollama_model,
            "last_engine": service.llm.last_engine,
        },
        "endpoints": {
            "http_answer": "/answer",
            "safinum_sandbox": "/sandbox",
            "web_sdk": "/sdk/nkap-sdk.js",
            "websocket": "/ws/session/{session_id}",
            "static_audio": "/static/audio/",
        },
    }


@app.post("/answer", response_model=AnswerResponse, response_model_exclude_none=True)
async def answer(req: AnswerRequest):
    """Endpoint HTTP v1.1 (I5-web -> ActionStream I3) utilisé par l'extension Chrome."""
    now_ms = int(time.time() * 1000)
    turn_id = req.turn_id or f"t_{uuid4().hex[:8]}"
    transcript = Transcript(
        type="transcript",
        session_id=req.session_id or "web_session",
        turn_id=turn_id,
        ts=now_ms,
        text=req.transcript,
        lang=req.lang_hint or "fr",
        confidence=1.0,
        is_final=True,
    )
    try:
        actions = await run_in_threadpool(
            service.handle_turn, transcript=transcript, screen_context=req.context
        )
    except ValueError as exc:
        return JSONResponse(
            status_code=422,
            content={"error": "harness_reject", "reason": str(exc)},
        )
    meta, text_fallback, choices = service.build_turn_envelope(
        transcript=transcript,
        screen_context=req.context,
        actions=actions,
        channel=req.channel,
    )
    follow_up = service.pop_turn_follow_up(turn_id)
    return AnswerResponse(
        turn_id=turn_id,
        actions=actions,
        meta=meta,
        text_fallback=text_fallback,
        choices=choices,
        follow_up=follow_up,
    )


@app.get("/", response_class=HTMLResponse)
async def dashboard() -> str:
    return """
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NKAP Money — M2 Gateway & Interconnexion</title>
    <style>
        :root { --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --primary: #38bdf8; --green: #4ade80; --border: #334155; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 24px; }
        .container { max-width: 900px; margin: 0 auto; }
        h1 { color: var(--primary); margin-bottom: 8px; }
        p { color: #94a3b8; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .badge { display: inline-block; background: #065f46; color: #34d399; padding: 4px 10px; border-radius: 999px; font-weight: 600; font-size: 13px; }
        button { background: var(--primary); color: #0f172a; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; margin-right: 8px; margin-bottom: 8px; }
        button:hover { opacity: 0.9; }
        #logs { background: #020617; border: 1px solid var(--border); border-radius: 8px; padding: 14px; font-family: monospace; font-size: 13px; min-height: 220px; max-height: 400px; overflow-y: auto; white-space: pre-wrap; }
        .log-in { color: #60a5fa; }
        .log-out { color: #4ade80; }
        .log-err { color: #f87171; }
        .endpoint-box { background: #0b1329; padding: 10px 14px; border-radius: 6px; font-family: monospace; color: #38bdf8; word-break: break-all; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 NKAP Money — Module M2 Gateway</h1>
        <p>Console de test & d'interconnexion pour les modules <strong>M1/M4 (Android)</strong> et <strong>M3 (Voix STT/TTS)</strong>.</p>
        
        <div class="card">
            <h3>📡 Points d'accès réseau pour l'équipe</h3>
            <div class="grid">
                <div>
                    <strong>WebSocket (Unique) :</strong>
                    <div class="endpoint-box" id="ws-url">ws://.../ws/session/s_web_test</div>
                </div>
                <div>
                    <strong>Dossier Audio TTS (M3/M1) :</strong>
                    <div class="endpoint-box" id="http-url">http://.../static/audio/</div>
                </div>
            </div>
        </div>

        <div class="card">
            <h3>🧪 Console de test interactive en direct</h3>
            <div>
                <button onclick="connectWS()">1. Connecter WebSocket</button>
                <button onclick="sendHello()">2. Envoyer 'hello'</button>
                <button onclick="sendScreen()">3. Envoyer ScreenContext</button>
                <button onclick="sendTranscript('fr')">4. Parler en Français</button>
                <button onclick="sendTranscript('ewo')">5. Parler en Ewondo</button>
                <button onclick="clearLogs()" style="background: #475569; color: white;">Effacer logs</button>
            </div>
            <h4>Journal des échanges WebSocket :</h4>
            <div id="logs">// En attente d'interaction...</div>
        </div>
    </div>

    <script>
        const wsHost = window.location.host;
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsEndpoint = `${wsProtocol}//${wsHost}/ws/session/s_web_test`;
        document.getElementById('ws-url').innerText = wsEndpoint;
        document.getElementById('http-url').innerText = `${window.location.origin}/static/audio/`;

        let ws = null;
        const logsEl = document.getElementById('logs');

        function log(msg, cls = '') {
            const span = document.createElement('div');
            span.className = cls;
            span.innerText = `[${new Date().toLocaleTimeString()}] ${msg}`;
            logsEl.appendChild(span);
            logsEl.scrollTop = logsEl.scrollHeight;
        }

        function clearLogs() { logsEl.innerHTML = ''; }

        function connectWS() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                log('Déjà connecté au WebSocket !', 'log-out');
                return;
            }
            log(`Connexion à ${wsEndpoint}...`);
            ws = new WebSocket(wsEndpoint);
            ws.onopen = () => log('✅ WebSocket connecté avec succès !', 'log-out');
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'action') {
                    log(`📥 ACTION #${data.seq} [t=${data.action.t}]: ${JSON.stringify(data.action)}`, 'log-out');
                } else if (data.type === 'turn_end') {
                    log(`🏁 TURN_END reçu ! Le tour est terminé.`, 'log-out');
                } else if (data.type === 'error') {
                    log(`❌ ERREUR: ${JSON.stringify(data)}`, 'log-err');
                } else {
                    log(`📥 REÇU: ${JSON.stringify(data)}`, 'log-in');
                }
            };
            ws.onerror = (err) => log('❌ Erreur WebSocket', 'log-err');
            ws.onclose = () => log('🔌 WebSocket déconnecté.', 'log-err');
        }

        function sendHello() {
            if (!ws || ws.readyState !== WebSocket.OPEN) return log('Connectez d\\'abord le WebSocket', 'log-err');
            const msg = { type: 'hello', session_id: 's_web_test', ts: Date.now(), device_id: 'browser_test' };
            ws.send(JSON.stringify(msg));
            log(`📤 ENVOI: hello`, 'log-in');
        }

        function sendScreen() {
            if (!ws || ws.readyState !== WebSocket.OPEN) return log('Connectez d\\'abord le WebSocket', 'log-err');
            const msg = {
                type: 'screen_context',
                session_id: 's_web_test',
                turn_id: null,
                ts: Date.now(),
                app: { package: 'cm.demo.fintech', activity: 'HomeActivity' },
                screen_hint: 'home',
                nodes: [
                    { node_id: 'n_01', path: 'root/card', cls: 'ViewGroup', text: 'Solde disponible 42 500 FCFA', bounds: [16,115,344,223], password: false },
                    { node_id: 'n_02', path: 'root/card/amount', cls: 'TextView', text: '42 500 FCFA', bounds: [90,160,270,200], password: false }
                ]
            };
            ws.send(JSON.stringify(msg));
            log(`📤 ENVOI: screen_context (2 nœuds)`, 'log-in');
        }

        function sendTranscript(lang) {
            if (!ws || ws.readyState !== WebSocket.OPEN) return log('Connectez d\\'abord le WebSocket', 'log-err');
            const msg = {
                type: 'transcript',
                session_id: 's_web_test',
                turn_id: 't_' + Math.floor(Math.random() * 1000),
                ts: Date.now(),
                text: 'Quel est mon solde ?',
                lang: lang,
                confidence: 0.99,
                is_final: true
            };
            ws.send(JSON.stringify(msg));
            log(`📤 ENVOI: transcript (${lang}) "Quel est mon solde ?"`, 'log-in');
        }
    </script>
</body>
</html>
"""
