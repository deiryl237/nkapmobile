const DEFAULT_BRAIN = "https://13.51.168.107.sslip.io";
const ewondo = document.getElementById("ewondoOn");
const brain = document.getElementById("brainUrl");
const save = document.getElementById("save");
const pingBtn = document.getElementById("ping");
const statusChip = document.getElementById("status-chip");
const statusText = document.getElementById("status-text");

// Mini orbe neuronal animé dans le header du popup
(function initMiniOrb() {
  const canvas = document.getElementById("mini-orb");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const size = 42;
  const dpr = 2;
  ctx.scale(dpr, dpr);
  const N = 11;
  const nodes = Array.from({ length: N }, (_, i) => ({
    phi: Math.acos(1 - (2 * (i + 0.5)) / N),
    theta: Math.PI * (1 + Math.sqrt(5)) * i,
    r: 10 + (i % 3) * 3,
    speed: 0.55 + (i % 3) * 0.2,
    phase: i * 0.8,
  }));
  function frame(ms) {
    const t = ms * 0.001;
    const cx = size / 2;
    const cy = size / 2;
    ctx.clearRect(0, 0, size, size);
    const pulse = 1 + 0.08 * Math.sin(t * 2.6);
    const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, 17 * pulse);
    g.addColorStop(0, "rgba(255, 244, 200, 0.85)");
    g.addColorStop(0.4, "rgba(245, 183, 0, 0.42)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 18 * pulse, 0, Math.PI * 2);
    ctx.fill();

    const pts = nodes.map((n) => {
      const a = n.theta + t * n.speed;
      const b = n.phi + Math.sin(t * 0.8 + n.phase) * 0.2;
      const rad = n.r * pulse;
      return { x: cx + rad * Math.sin(b) * Math.cos(a), y: cy + rad * Math.cos(b) };
    });
    ctx.lineWidth = 0.8;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
        if (d < 16) {
          ctx.strokeStyle = `rgba(245, 183, 0, ${((1 - d / 16) * 0.6).toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();
        }
      }
    }
    for (const p of pts) {
      ctx.fillStyle = "rgba(255, 246, 214, 0.9)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

async function checkBrainHealth(urlRaw) {
  const base = String(urlRaw || "").trim().replace(/\/+$/, "");
  statusChip.className = "status-chip";
  if (!base) {
    statusText.textContent = "Mode local (sans serveur)";
    return;
  }
  statusText.textContent = "Connexion au cerveau…";
  const t0 = performance.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const resp = await fetch(`${base}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const ms = Math.round(performance.now() - t0);
    const model = data?.llm?.ollama_model || "m2";
    statusChip.className = "status-chip ok";
    statusText.textContent = `En ligne · ${model} · ${ms} ms`;
  } catch (err) {
    statusChip.className = "status-chip err";
    statusText.textContent = "Serveur injoignable";
  }
}

if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
  chrome.storage.sync.get({ ewondoOn: false, brainUrl: DEFAULT_BRAIN }, (cfg) => {
    ewondo.checked = !!cfg.ewondoOn;
    brain.value = cfg.brainUrl || DEFAULT_BRAIN;
    checkBrainHealth(brain.value);
  });
} else {
  brain.value = DEFAULT_BRAIN;
  checkBrainHealth(brain.value);
}

document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    brain.value = btn.dataset.url || DEFAULT_BRAIN;
    checkBrainHealth(brain.value);
  });
});

pingBtn.addEventListener("click", () => checkBrainHealth(brain.value));

save.addEventListener("click", () => {
  const nextUrl = brain.value.trim();
  const doneFeedback = () => {
    save.textContent = "Synchronisé ✓";
    checkBrainHealth(nextUrl);
    setTimeout(() => (save.textContent = "Enregistrer & synchroniser"), 1400);
  };
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.set({ ewondoOn: ewondo.checked, brainUrl: nextUrl }, () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs
            .sendMessage(tabs[0].id, {
              type: "settings",
              ewondoOn: ewondo.checked,
              brainUrl: nextUrl,
            })
            .catch(() => {});
        }
      });
      doneFeedback();
    });
  } else {
    doneFeedback();
  }
});
