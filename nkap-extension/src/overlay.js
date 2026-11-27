/**
 * overlay.js — Moteur de rendu « Le prof au tableau » / style HeyClicky (M1-web, contrat v1.1 §6)
 *
 * Aligné sur l'audit HeyClicky (draw_07, draw_15, draw_18, omg_05, use_05, use_12) :
 * 1. Curseur-compagnon (« Pointer Buddy ») triangulaire lumineux qui vole d'une cible à l'autre
 *    et suit en temps réel la pointe du feutre (`SVGPathElement.getPointAtLength`) pendant chaque tracé.
 * 2. Tableau transparent esquissé (`notebook`, réf. draw_07 & omg_05) :
 *    ardoise vitrée sombre translucide (`backdrop-filter: blur(12px)`), cadre wireframe dessiné à la craie
 *    avec barre de titre esquissée, écriture feutre multicolore (blanc craie, jaune #F5B700, rose-corail #FF6B8B,
 *    vert menthe #34D399) et étiquettes pills — ancré au scroll avec la flèche.
 * 3. `frame` style FL Studio (`draw_15` / `draw_18`) : rectangle de sélection rouge qui s'étire depuis
 *    le coin haut-gauche + 4 poignées carrées aux angles + curseur rouge posé au coin bas-droite.
 * 4. `caption` style sous-titre cinéma (`draw_18`) : pilule translucide basse à fort halo, ne masquant
 *    jamais les boutons d'action (`Continuer` / `Retour`).
 * 5. Bulle interactive avec Chips de questions par écran + Push-to-Talk (`Web Speech API`) + Voix.
 */

window.NKAP_OVERLAY = (() => {
  let hostEl = null;
  let svg = null;
  let capLayer = null;
  let cursorEl = null;
  let cursorPathEl = null;
  let statusPillEl = null;
  let bubbleEl = null;
  let panelEl = null;
  let wordTimer = null;

  const marks = new Map(); // id → descripteur de marque active

  const PALETTE = {
    inkLight: "#12233A", // encre sombre sur fond clair
    inkDark: "#F5B700",  // jaune feutre sur fond sombre
    yellow: "#F5B700",
    red: "#FF3B5C",
    chalk: "#F8FAFC",
    coral: "#FF6B8B",
    mint: "#34D399",
  };

  function getAssetUrl(relPath) {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
      return chrome.runtime.getURL(relPath);
    }
    return "../" + relPath;
  }

  function injectFontsAndStyles() {
    if (document.getElementById("nkap-styles")) return;
    const regUrl = getAssetUrl("fonts/Andika-Regular.ttf");
    const boldUrl = getAssetUrl("fonts/Andika-Bold.ttf");

    const style = document.createElement("style");
    style.id = "nkap-styles";
    style.textContent = `
      @font-face {
        font-family: 'Andika';
        src: url('${regUrl}') format('truetype');
        font-weight: 400;
        font-style: normal;
        font-display: swap;
      }
      @font-face {
        font-family: 'Andika';
        src: url('${boldUrl}') format('truetype');
        font-weight: 700;
        font-style: normal;
        font-display: swap;
      }
      @keyframes nkapPopIn {
        0% { opacity: 0; transform: scale(0.96); }
        100% { opacity: 1; transform: scale(1); }
      }
      @keyframes nkapMarqueeDrag {
        0% { transform: scale(0.08, 0.08); opacity: 0.4; }
        100% { transform: scale(1, 1); opacity: 1; }
      }
      @keyframes nkapPulseWave {
        0%, 100% { transform: scaleY(0.45); }
        50% { transform: scaleY(1.15); }
      }
      .nkap-write-char {
        display: inline-block;
        opacity: 0;
        transition: opacity 0.08s ease-out;
        white-space: pre;
      }
      .nkap-write-char.visible {
        opacity: 1;
      }
      .nkap-word {
        display: inline-block;
        opacity: 0;
        transform: translateY(3px);
        transition: opacity 0.13s ease-out, transform 0.13s ease-out;
        margin-right: 0.28em;
      }
      .nkap-word.visible {
        opacity: 1;
        transform: translateY(0);
      }
      .nkap-chip-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        text-align: left;
        background: rgba(255, 255, 255, 0.06);
        color: #F8FAFC;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 11px;
        padding: 8px 12px;
        font-family: 'Andika', system-ui, sans-serif;
        font-size: 13.5px;
        cursor: pointer;
        transition: background 0.14s ease, border-color 0.14s ease, transform 0.12s ease;
      }
      .nkap-chip-btn:hover {
        background: rgba(245, 183, 0, 0.16);
        border-color: rgba(245, 183, 0, 0.55);
        transform: translateX(-2px);
      }
    `;
    document.head.appendChild(style);
  }

  function ensureLayers() {
    injectFontsAndStyles();
    if (svg && capLayer && cursorEl) return;

    hostEl = document.createElement("div");
    hostEl.id = "nkap-overlay-host";
    hostEl.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:2147483646;overflow:hidden;";

    const NS = "http://www.w3.org/2000/svg";
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.cssText = "display:block;width:100%;height:100%;overflow:visible;";
    hostEl.appendChild(svg);

    // Curseur-compagnon HeyClicky (« Pointer Buddy » triangulaire)
    cursorEl = document.createElement("div");
    cursorEl.id = "nkap-cursor-buddy";
    cursorEl.style.cssText =
      "position:fixed;left:0;top:0;width:24px;height:24px;pointer-events:none;" +
      "z-index:2147483647;opacity:0;transform:translate(-40px,-40px);" +
      "transition:opacity 0.18s ease, transform 0.18s cubic-bezier(0.22,1,0.36,1);" +
      "filter:drop-shadow(0 3px 8px rgba(0,0,0,0.55));";
    const curSvg = document.createElementNS(NS, "svg");
    curSvg.setAttribute("viewBox", "0 0 24 24");
    curSvg.setAttribute("width", "24");
    curSvg.setAttribute("height", "24");
    cursorPathEl = document.createElementNS(NS, "path");
    cursorPathEl.setAttribute("d", "M2.5 2.5 L20.5 10.2 L12.2 13.4 L9.2 21.2 Z");
    cursorPathEl.setAttribute("fill", "#F5B700");
    cursorPathEl.setAttribute("stroke", "#FFFFFF");
    cursorPathEl.setAttribute("stroke-width", "1.8");
    cursorPathEl.setAttribute("stroke-linejoin", "round");
    curSvg.appendChild(cursorPathEl);
    cursorEl.appendChild(curSvg);
    hostEl.appendChild(cursorEl);

    // Pilule d'état haute façon HeyClicky (« Speaking » / « Listening »)
    statusPillEl = document.createElement("div");
    statusPillEl.id = "nkap-status-pill";
    statusPillEl.style.cssText =
      "position:fixed;top:12px;left:50%;transform:translateX(-50%);" +
      "background:rgba(10,14,22,0.92);color:#F8FAFC;border:1px solid rgba(255,255,255,0.14);" +
      "border-radius:999px;padding:5px 15px;font-family:'Andika',system-ui,sans-serif;" +
      "font-size:12.5px;font-weight:700;display:none;align-items:center;gap:10px;" +
      "box-shadow:0 8px 24px rgba(0,0,0,0.45);z-index:2147483647;pointer-events:none;" +
      "backdrop-filter:blur(8px);";
    hostEl.appendChild(statusPillEl);

    // Sous-titre cinéma bas (réf. draw_18 / draw_07 : compact, translucide, fort halo)
    capLayer = document.createElement("div");
    capLayer.id = "nkap-caption";
    capLayer.style.cssText =
      "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);" +
      "max-width:min(680px, calc(100vw - 140px));z-index:2147483647;" +
      "background:rgba(10,14,22,0.72);backdrop-filter:blur(6px);" +
      "border:1px solid rgba(255,255,255,0.12);color:#FFFFFF;border-radius:999px;" +
      "padding:7px 22px;font-family:'Andika',system-ui,sans-serif;font-size:18.5px;" +
      "line-height:1.35;text-align:center;" +
      "text-shadow:0 2px 8px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.9);" +
      "box-shadow:0 6px 20px rgba(0,0,0,0.35);" +
      "pointer-events:none;display:none;opacity:0;transition:opacity 0.16s ease;";

    document.documentElement.appendChild(hostEl);
    document.documentElement.appendChild(capLayer);

    window.addEventListener("scroll", repositionAll, { passive: true, capture: true });
    window.addEventListener("resize", repositionAll, { passive: true });
  }

  /** Déplace le curseur-compagnon HeyClicky vers (x, y). */
  function moveCursor(x, y, color = "#F5B700", instant = false) {
    ensureLayers();
    if (!cursorEl) return;
    if (cursorPathEl && color) {
      cursorPathEl.setAttribute("fill", color);
    }
    cursorEl.style.transition = instant
      ? "opacity 0.14s ease"
      : "opacity 0.16s ease, transform 0.2s cubic-bezier(0.22,1,0.36,1)";
    cursorEl.style.opacity = "1";
    cursorEl.style.transform = `translate(${(x - 2).toFixed(1)}px, ${(y - 2).toFixed(1)}px)`;
  }

  function hideCursor() {
    if (cursorEl) cursorEl.style.opacity = "0";
  }

  /** Affiche la pilule haute HeyClicky (« Speaking » / « Listening »). */
  function setStatusPill(mode, labelText) {
    ensureLayers();
    if (!statusPillEl) return;
    if (!mode) {
      statusPillEl.style.display = "none";
      statusPillEl.innerHTML = "";
      return;
    }
    const accent = mode === "listening" ? "#FF3B5C" : "#F5B700";
    statusPillEl.style.display = "inline-flex";
    statusPillEl.innerHTML = `
      <span>${labelText || (mode === "listening" ? "Écoute…" : "Parle…")}</span>
      <span style="display:inline-flex;align-items:center;gap:2.5px;height:12px;">
        <span style="width:2.5px;height:10px;background:${accent};border-radius:2px;animation:nkapPulseWave 0.55s infinite ease-in-out;"></span>
        <span style="width:2.5px;height:13px;background:${accent};border-radius:2px;animation:nkapPulseWave 0.55s infinite 0.15s ease-in-out;"></span>
        <span style="width:2.5px;height:8px;background:${accent};border-radius:2px;animation:nkapPulseWave 0.55s infinite 0.3s ease-in-out;"></span>
      </span>
    `;
  }

  function resolveInk(colorName, targetEl) {
    if (colorName === "red") return PALETTE.red;
    if (colorName === "yellow") return PALETTE.yellow;
    const tone = window.NKAP_RULES ? window.NKAP_RULES.detectTone(targetEl) : "light";
    return tone === "dark" ? PALETTE.inkDark : PALETTE.inkLight;
  }

  function svgEl(tag, attrs) {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  let measureCtx = null;
  function getMeasureCtx() {
    if (!measureCtx) {
      const c = document.createElement("canvas");
      measureCtx = c.getContext("2d");
    }
    return measureCtx;
  }

  function getTightTextRect(el) {
    try {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rect = range.getBoundingClientRect();
      if (rect && rect.width > 4 && rect.height > 4) {
        return rect;
      }
    } catch (_) {}
    return el.getBoundingClientRect();
  }

  function rectOf(el) {
    const r = el.getBoundingClientRect();

    // Cas 1 : Champ de saisie (<input> ou conteneur .relative avec <input>)
    const inputEl =
      el.tagName?.toLowerCase() === "input"
        ? el
        : el.querySelector?.('input:not([type="checkbox"]):not([type="radio"])');
    if (inputEl && inputEl.type !== "checkbox" && inputEl.type !== "radio") {
      const ir = inputEl.getBoundingClientRect();
      const cs = window.getComputedStyle(inputEl);
      const padL = parseFloat(cs.paddingLeft) || 16;
      const val = (inputEl.value || inputEl.placeholder || "").trim();
      let textW = 140;
      if (val) {
        const ctx = getMeasureCtx();
        if (ctx) {
          ctx.font = `${cs.fontWeight || "500"} ${cs.fontSize || "14px"} ${cs.fontFamily || "sans-serif"}`;
          textW = Math.max(38, ctx.measureText(val).width);
        }
      }
      const x = ir.left + padL - 5;
      const y = ir.top + 6;
      const w = Math.min(ir.width - padL - 10, textW + 10);
      const h = Math.max(22, ir.height - 12);
      return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
    }

    // Cas 2 : Ligne de case à cocher (<label><input type="checkbox"/><span>Texte...</span></label> ou .check)
    const labelParent =
      el.tagName?.toLowerCase() === "label"
        ? el
        : el.closest?.("label, .check") ||
          (el.parentElement && el.parentElement.querySelector?.('input[type="checkbox"], input[type="radio"]')
            ? el.parentElement
            : null);
    const chk = labelParent
      ? labelParent.querySelector('input[type="checkbox"], input[type="radio"]')
      : null;
    if (chk) {
      const cRect = chk.getBoundingClientRect();
      const textEl = labelParent.querySelector("span") || (el !== chk ? el : labelParent);
      const tRect = getTightTextRect(textEl);
      const left = Math.min(cRect.left, tRect.left);
      const top = Math.min(cRect.top, tRect.top);
      const right = Math.max(cRect.right, tRect.right);
      const bottom = Math.max(cRect.bottom, tRect.bottom);
      const w = right - left;
      const h = bottom - top;
      return { x: left, y: top, w, h, cx: left + w / 2, cy: top + h / 2 };
    }

    // Cas 3 : Élément texte de type bloc (<p>, <h1>, <h2>, <div>) beaucoup plus large que son texte
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    const isInteractiveBox =
      tag === "button" ||
      tag === "a" ||
      tag === "select" ||
      tag === "textarea" ||
      el.getAttribute?.("role") === "button";
    if (!isInteractiveBox && el.children.length <= 1) {
      const tRect = getTightTextRect(el);
      if (r.width - tRect.width > 20) {
        return {
          x: tRect.left,
          y: tRect.top,
          w: tRect.width,
          h: tRect.height,
          cx: tRect.left + tRect.width / 2,
          cy: tRect.top + tRect.height / 2,
        };
      }
    }

    return {
      x: r.left,
      y: r.top,
      w: r.width,
      h: r.height,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
  }

  function enforceMarkBudget(id) {
    if (marks.has(id)) removeMark(id, marks.get(id), false);
    if (!window.NKAP_RULES) return;
    const evicted = window.NKAP_RULES.onMarkAdded(id);
    for (const oldId of evicted) {
      const m = marks.get(oldId);
      if (m) fadeOutMark(oldId, m);
    }
  }

  let clearGen = 0;
  const pendingOverlayTimers = new Set();

  function trackOverlayTimer(fn, delayMs) {
    const gen = clearGen;
    const tid = setTimeout(() => {
      pendingOverlayTimers.delete(tid);
      if (gen !== clearGen) return;
      fn();
    }, delayMs);
    pendingOverlayTimers.add(tid);
    return tid;
  }

  function fadeOutMark(id, m) {
    const elToFade = m.group || (m.node && m.node[0]);
    if (elToFade && elToFade.style) {
      elToFade.style.transition = "opacity 0.22s ease-out";
      elToFade.style.opacity = "0";
      trackOverlayTimer(() => removeMark(id, m, false), 220);
    } else {
      removeMark(id, m, false);
    }
  }

  function removeMark(id, m, notifyRules = true) {
    if (!m) return;
    if (m.timers) m.timers.forEach((t) => clearTimeout(t));
    if (m.node) m.node.forEach((n) => n && n.remove && n.remove());
    if (m.group && m.group.remove) m.group.remove();
    marks.delete(id);
    marks.delete(id + "::head");
    if (notifyRules && window.NKAP_RULES) window.NKAP_RULES.onMarkRemoved(id);
  }

  function repositionAll() {
    for (const [id, m] of marks) {
      if (id.endsWith("::head")) continue;
      if (!m.anchorEl || !m.baseRect) continue;
      if (!m.anchorEl.isConnected) {
        removeMark(id, m);
        continue;
      }
      const r = m.anchorEl.getBoundingClientRect();
      const dx = r.left - m.baseRect.left;
      const dy = r.top - m.baseRect.top;
      m.dx = dx;
      m.dy = dy;
      if (m.group) {
        m.group.setAttribute("transform", `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
      } else if (m.dom && m.node) {
        m.node.forEach((n) => {
          if (n && n.style) {
            n.style.left = (m.baseX + dx).toFixed(1) + "px";
            n.style.top = (m.baseY + dy).toFixed(1) + "px";
          }
        });
      }
    }
  }

  function anchored(el, drawFn) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    const outOfView =
      r.top < 12 || r.bottom > window.innerHeight - 12 || r.left < 8 || r.right > window.innerWidth - 8;
    if (outOfView) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      trackOverlayTimer(drawFn, 320);
    } else {
      drawFn();
    }
  }

  function addStroke(id, pathData, headData, strokeColor, drawMs, anchorEl, baseRect, strokeWidth = 4.2) {
    ensureLayers();
    enforceMarkBudget(id);

    const group = svgEl("g", { "data-nkap": id });
    const len = Math.max(1, pathData.len || 1);

    const feltPass2 = svgEl("path", {
      d: pathData.d,
      fill: "none",
      stroke: strokeColor,
      "stroke-width": String((strokeWidth * 0.65).toFixed(1)),
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-opacity": "0.52",
      transform: "translate(1.5, 1.2)",
      "stroke-dasharray": `${len} ${len + 12}`,
      "stroke-dashoffset": String(len),
    });

    const feltMain = svgEl("path", {
      d: pathData.d,
      fill: "none",
      stroke: strokeColor,
      "stroke-width": String(strokeWidth),
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "stroke-opacity": "0.96",
      "stroke-dasharray": `${len} ${len + 12}`,
      "stroke-dashoffset": String(len),
    });

    group.appendChild(feltPass2);
    group.appendChild(feltMain);

    if (headData) {
      const hLen = Math.max(1, headData.len || 1);
      const headMain = svgEl("path", {
        d: headData.d,
        fill: "none",
        stroke: strokeColor,
        "stroke-width": String(strokeWidth),
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        opacity: "0",
        "stroke-dasharray": `${hLen} ${hLen + 10}`,
        "stroke-dashoffset": String(hLen),
      });
      group.appendChild(headMain);
      marks.set(id + "::head", {
        node: [headMain],
        startedAt: performance.now() + drawMs * 0.88,
        drawMs: 150,
        len: hLen,
      });
    }

    svg.appendChild(group);
    marks.set(id, {
      node: [feltPass2, feltMain],
      mainPath: feltMain,
      strokeColor,
      group,
      startedAt: performance.now(),
      drawMs,
      len,
      anchorEl,
      baseRect,
      dx: 0,
      dy: 0,
    });
    animate();
  }

  let raf = null;
  let activeCursorMarkId = null;
  function animate() {
    if (raf) return;
    const step = () => {
      const now = performance.now();
      let live = false;
      let latestCursorPt = null;
      let latestColor = "#F5B700";

      // 1. Vérifie si le trait que le curseur suivait est toujours en cours de dessin
      let activeCursorMark = null;
      if (activeCursorMarkId && marks.has(activeCursorMarkId)) {
        const m = marks.get(activeCursorMarkId);
        const rawT = (now - m.startedAt) / (m.drawMs || 1);
        if (rawT >= 0 && rawT <= 1.02) {
          activeCursorMark = m;
        } else {
          activeCursorMarkId = null;
        }
      }

      for (const [id, m] of marks) {
        if (!m.len) continue;
        const rawT = (now - m.startedAt) / m.drawMs;
        const t = Math.min(1, Math.max(0, rawT));
        const eased = 1 - Math.pow(1 - t, 1.65);
        m.node.forEach((p) => {
          const offset = (1 - eased) * m.len;
          p.setAttribute("stroke-dashoffset", String(offset.toFixed(1)));
          if (rawT >= 0 && p.getAttribute("opacity") === "0") {
            p.setAttribute("opacity", "0.96");
          }
        });

        // Si aucun trait n'est actuellement verrouillé par le curseur, ce nouveau trait prend le relais
        if (!activeCursorMarkId && !id.endsWith("::head") && m.mainPath && rawT >= 0 && rawT <= 1.02) {
          activeCursorMarkId = id;
          activeCursorMark = m;
        }

        if (now < m.startedAt + m.drawMs + 180) live = true;
      }

      // 2. Le curseur suit uniquement le trait actif d'un bout à l'autre (0% → 100%) sans jamais sauter
      if (activeCursorMark && activeCursorMark.mainPath) {
        const rawT = (now - activeCursorMark.startedAt) / activeCursorMark.drawMs;
        const t = Math.min(1, Math.max(0, rawT));
        const eased = 1 - Math.pow(1 - t, 1.65);
        try {
          const pt = activeCursorMark.mainPath.getPointAtLength(
            Math.max(0, Math.min(activeCursorMark.len, eased * activeCursorMark.len))
          );
          latestCursorPt = {
            x: pt.x + (activeCursorMark.dx || 0),
            y: pt.y + (activeCursorMark.dy || 0),
          };
          latestColor = activeCursorMark.strokeColor || "#F5B700";
        } catch (_) {}
      }

      if (latestCursorPt) {
        moveCursor(latestCursorPt.x, latestCursorPt.y, latestColor, true);
      }

      if (live) raf = requestAnimationFrame(step);
      else raf = null;
    };
    raf = requestAnimationFrame(step);
  }

  // ---- API publique des gestes (I4) ----------------------------------------

  return {
    rectOf,
    moveCursor,
    hideCursor,
    setStatusPill,

    /**
     * 1. `circle` : Ovale manuscrit (ou `box` si opts.shape === "box")
     */
    circle(el, color = "ink", drawMs = 680, id = "c_" + Date.now(), opts = {}) {
      if (opts && opts.shape === "box") {
        return this.box(el, color, drawMs, id);
      }
      anchored(el, () => {
        const r = rectOf(el);
        const strokeColor = resolveInk(color, el);
        const p = window.NKAP_GEOMETRY.handCircle(r.cx, r.cy, r.w / 2 + 14, r.h / 2 + 11, id);
        addStroke(id, p, null, strokeColor, drawMs, el, el.getBoundingClientRect(), 4.2);
      });
    },

    /**
     * 2. `box` : Rectangle manuscrit à coins doux qui ferme son contour
     */
    box(el, color = "ink", drawMs = 680, id = "b_" + Date.now()) {
      anchored(el, () => {
        const r = rectOf(el);
        const padX = 10;
        const padY = 6;
        const strokeColor = resolveInk(color, el);
        const p = window.NKAP_GEOMETRY.handBox(
          r.x - padX,
          r.y - padY,
          r.w + padX * 2,
          r.h + padY * 2,
          id
        );
        addStroke(id, p, null, strokeColor, drawMs, el, el.getBoundingClientRect(), 4.2);
      });
    },

    /**
     * 3. `underline` : Soulignement jaune feutre souple
     */
    underline(el, color = "yellow", drawMs = 450, id = "u_" + Date.now()) {
      anchored(el, () => {
        const r = rectOf(el);
        const strokeColor = resolveInk(color, el);
        const p = window.NKAP_GEOMETRY.handUnderline(r.x - 4, r.y + r.h + 5, r.w + 8, id);
        addStroke(id, p, null, strokeColor, drawMs, el, el.getBoundingClientRect(), 4.8);
      });
    },

    /**
     * 4. `arrow` : Flèche manuscrite reliant le bord de `elFrom` au bord de `elTo`
     */
    arrow(elFrom, elTo, color = "ink", drawMs = 800, id = "a_" + Date.now()) {
      anchored(elFrom, () =>
        anchored(elTo, () => {
          const a = rectOf(elFrom);
          const b = rectOf(elTo);
          let strokeColor = resolveInk(color, elFrom);
          if (color === "ink" && window.NKAP_RULES) {
            const toneA = window.NKAP_RULES.detectTone(elFrom);
            const toneB = window.NKAP_RULES.detectTone(elTo);
            if (toneA === "dark" || toneB === "dark") {
              strokeColor = PALETTE.inkDark;
            }
          }
          const pageAnchor =
            elFrom.closest && elFrom.closest("#nkap-notebook") ? elTo : elFrom;
          const p = window.NKAP_GEOMETRY.handArrowBetweenRects(a, b, id, 0.14);
          addStroke(
            id,
            p.main,
            p.head,
            strokeColor,
            drawMs,
            pageAnchor,
            pageAnchor.getBoundingClientRect(),
            3.8
          );
        })
      );
    },

    /**
     * 5. `frame` : Vrai style FL Studio de HeyClicky (réf. draw_15 & draw_18)
     * - Rectangle de sélection rouge qui s'étire depuis le coin haut-gauche
     * - 4 petites poignées carrées aux angles (blanc + bord rouge)
     * - Curseur rouge HeyClicky posé sur la poignée bas-droite
     * - Étiquette latérale discrète qui ne couvre jamais le montant situé au-dessus du bouton
     */
    frame(el, label = "Appuie ici", id = "f_" + Date.now()) {
      ensureLayers();
      anchored(el, () => {
        enforceMarkBudget(id);
        const r = rectOf(el);
        const pad = 6;
        const baseX = r.x - pad;
        const baseY = r.y - pad;
        const boxW = r.w + pad * 2;
        const boxH = r.h + pad * 2;

        const div = document.createElement("div");
        div.setAttribute("data-nkap", id);
        div.style.cssText =
          `position:fixed;left:${baseX}px;top:${baseY}px;width:${boxW}px;height:${boxH}px;` +
          `border:2px dashed #FF3B5C;outline:1px solid rgba(255,59,92,0.38);border-radius:6px;` +
          `transform-origin:top left;pointer-events:none;z-index:2147483646;` +
          `box-shadow:0 0 0 3px rgba(255,59,92,0.12);` +
          `animation:nkapMarqueeDrag 0.18s cubic-bezier(0.16,1,0.3,1) both;`;

        // 4 petites poignées carrées de sélection aux coins (style draw_15)
        for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const handle = document.createElement("div");
          handle.style.cssText =
            `position:absolute;width:7px;height:7px;background:#FFFFFF;` +
            `border:2px solid #FF3B5C;border-radius:1.5px;box-sizing:border-box;` +
            `${sx ? "right:-4.5px" : "left:-4.5px"};${sy ? "bottom:-4.5px" : "top:-4.5px"};`;
          div.appendChild(handle);
        }

        if (label) {
          const chip = document.createElement("div");
          chip.textContent = label;
          const placeRight = baseX < 130;
          chip.style.cssText =
            (placeRight
              ? `position:absolute;left:50%;top:-10px;transform:translate(-50%, -100%);`
              : `position:absolute;left:-10px;top:50%;transform:translate(-100%, -50%);`) +
            `background:#FF3B5C;color:#FFFFFF;border-radius:999px;padding:3px 11px;` +
            `font-family:'Andika',system-ui,sans-serif;font-weight:700;font-size:13px;` +
            `white-space:nowrap;box-shadow:0 4px 12px rgba(255,59,92,0.4);`;
          div.appendChild(chip);
        }

        document.documentElement.appendChild(div);
        // Le curseur-compagnon se pose au coin bas-droite du cadre de sélection (comme dans draw_15)
        moveCursor(baseX + boxW, baseY + boxH, "#FF3B5C", false);

        marks.set(id, {
          node: [div],
          startedAt: performance.now(),
          drawMs: 180,
          len: 0,
          dom: true,
          anchorEl: el,
          baseRect: el.getBoundingClientRect(),
          baseX,
          baseY,
        });
      });
    },

    /**
     * 6. `write` : Écriture manuscrite Andika Bold révélée lettre par lettre
     */
    write(text, el, opts = {}, id = "w_" + Date.now()) {
      if (!text) return;
      if (window.NKAP_RULES && !window.NKAP_RULES.amountsPreserved(text)) return;

      ensureLayers();
      anchored(el, () => {
        enforceMarkBudget(id);
        const r = rectOf(el);
        const dy = opts.dy !== undefined ? opts.dy : -44;
        const dx = opts.dx !== undefined ? opts.dx : 0;
        const baseX = r.cx + dx;
        const baseY = r.y + dy;
        const strokeColor = resolveInk(opts.color || "ink", el);
        const fontSize = opts.size || 24;
        const perLetterMs = opts.perLetterMs || 48;

        const container = document.createElement("div");
        container.setAttribute("data-nkap", id);
        container.style.cssText =
          `position:fixed;left:${baseX}px;top:${baseY}px;transform:translate(-50%, 0);` +
          `font-family:'Andika',system-ui,sans-serif;font-weight:700;color:${strokeColor};` +
          `font-size:${fontSize}px;white-space:nowrap;z-index:2147483647;pointer-events:none;` +
          `text-shadow:0 2px 6px rgba(0,0,0,0.75);`;

        const rand = window.NKAP_GEOMETRY.seeded(id + "::" + text);
        const timers = [];

        Array.from(String(text)).forEach((ch, idx) => {
          const span = document.createElement("span");
          span.className = "nkap-write-char";
          span.textContent = ch;
          const rot = ((rand() - 0.5) * 5.8).toFixed(2);
          const jy = ((rand() - 0.5) * 2.2).toFixed(1);
          span.style.transform = `translateY(${jy}px) rotate(${rot}deg)`;
          container.appendChild(span);

          const timer = setTimeout(() => {
            span.classList.add("visible");
          }, idx * perLetterMs);
          timers.push(timer);
        });

        document.documentElement.appendChild(container);
        moveCursor(baseX, baseY, strokeColor, false);

        marks.set(id, {
          node: [container],
          timers,
          startedAt: performance.now(),
          drawMs: text.length * perLetterMs,
          len: 0,
          dom: true,
          anchorEl: el,
          baseRect: el.getBoundingClientRect(),
          baseX,
          baseY,
        });
      });
    },

    /**
     * 6b. `notebook` : Tableau vitré esquissé style HeyClicky (réf. draw_07 & omg_05)
     * - Fini l'effet post-it blanc : ardoise translucide sombre (`backdrop-filter: blur(12px)`)
     *   avec cadre wireframe esquissé à la craie (style omg_05) et écriture feutre multicolore
     *   (blanc craie, jaune #F5B700, rose-corail #FF6B8B, vert menthe #34D399) + badges pills.
     * - Ancré sur l'élément cible de la page (`config.anchorEl`) pour rester cadré au scroll.
     */
    notebook(config = {}, id = config.id || "nb_" + Date.now()) {
      ensureLayers();
      const pageAnchor =
        config.anchorEl ||
        document.querySelector("section") ||
        document.querySelector("main") ||
        document.body.firstElementChild;

      const renderNotebook = () => {
        enforceMarkBudget(id);

        const timers = [];
        // Palette craie/feutre sur vitre sombre (réf. draw_07)
        const CHALK_COLORS = {
          ink: "#F8FAFC",
          white: "#F8FAFC",
          yellow: "#F5B700",
          red: "#FF6B8B",
          green: "#34D399",
          cyan: "#38BDF8",
        };

        const width = config.width || 404;
        let baseX = Math.max(20, window.innerWidth - width - 28);
        let baseY = 104;
        const asideEl = document.querySelector("section + aside, main aside, aside");
        if (asideEl && config.position !== "left" && config.position !== "center") {
          const ar = asideEl.getBoundingClientRect();
          if (ar.width > 180 && ar.left > 320) {
            baseX = Math.min(window.innerWidth - width - 16, Math.max(16, ar.left));
            baseY = Math.max(88, Math.min(180, ar.top));
          }
        } else if (config.position === "left") {
          baseX = 28;
        } else if (config.position === "center") {
          baseX = Math.max(16, (window.innerWidth - width) / 2);
        }

        if (config.anchorEl) {
          const tr = config.anchorEl.getBoundingClientRect();
          if (tr.left >= baseX - 24) {
            baseX = Math.max(20, tr.left - width - 28);
            baseY = Math.max(76, Math.min(window.innerHeight - 250, tr.top - 24));
          } else {
            baseY = Math.max(64, Math.min(window.innerHeight - 250, tr.top - 76));
          }
        }

        const card = document.createElement("div");
        card.id = "nkap-notebook";
        card.setAttribute("data-nkap", id);
        card.style.cssText =
          `position:fixed;left:${baseX}px;top:${baseY}px;width:${width}px;` +
          `background:rgba(12,17,28,0.86);backdrop-filter:blur(12px);` +
          `color:#F8FAFC;border-radius:16px;` +
          `padding:26px 26px 24px 26px;box-sizing:border-box;` +
          `font-family:'Andika',system-ui,sans-serif;` +
          `box-shadow:0 22px 50px rgba(0,0,0,0.62);` +
          `z-index:2147483646;pointer-events:auto;` +
          `animation:nkapPopIn 0.16s ease-out both;`;

        // Petits boutons de fenêtre esquissés en haut à droite (clin d'œil omg_05) + fermeture au clic
        const winControls = document.createElement("div");
        winControls.style.cssText =
          "position:absolute;top:12px;right:14px;display:flex;align-items:center;gap:6px;cursor:pointer;";
        winControls.setAttribute("aria-label", "Fermer");
        winControls.innerHTML = `
          <span style="width:9px;height:9px;border:1.6px solid rgba(248,250,252,0.55);border-radius:2px;display:inline-block;"></span>
          <span style="width:9px;height:9px;border:1.6px solid rgba(255,107,139,0.75);border-radius:2px;display:inline-block;"></span>
        `;
        winControls.addEventListener("click", () => this.hide(id));
        card.appendChild(winControls);

        // Calque SVG interne pour le cadre wireframe esquissé (omg_05) et les annotations feutre
        const noteSvg = svgEl("svg", { width: "100%", height: "100%" });
        noteSvg.style.cssText =
          "position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;";
        card.appendChild(noteSvg);

        function localRectInCard(el) {
          let x = 0;
          let y = 0;
          let cur = el;
          while (cur && cur !== card) {
            x += cur.offsetLeft || 0;
            y += cur.offsetTop || 0;
            cur = cur.offsetParent;
          }
          return {
            x,
            y,
            w: el.offsetWidth || 0,
            h: el.offsetHeight || 0,
          };
        }

        function appendAnimatedLetters(targetEl, str, seedKey, startDelayMs, perLetterMs = 22, penColor = "#F8FAFC") {
          const rand = window.NKAP_GEOMETRY.seeded(seedKey);
          const chars = Array.from(String(str || ""));
          let wordSpan = null;
          const ensureWordSpan = () => {
            if (!wordSpan) {
              wordSpan = document.createElement("span");
              wordSpan.style.cssText = "display:inline-block;white-space:nowrap;";
              targetEl.appendChild(wordSpan);
            }
            return wordSpan;
          };
          chars.forEach((ch, idx) => {
            const s = document.createElement("span");
            s.className = "nkap-write-char";
            s.textContent = ch;
            const rot = ((rand() - 0.5) * 3.4).toFixed(2);
            const jy = ((rand() - 0.5) * 1.3).toFixed(1);
            s.style.transform = `translateY(${jy}px) rotate(${rot}deg)`;
            if (/\s/.test(ch)) {
              wordSpan = null;
              targetEl.appendChild(s);
            } else {
              ensureWordSpan().appendChild(s);
            }
            const t = setTimeout(() => {
              s.classList.add("visible");
              if (idx % 4 === 0) {
                const sr = s.getBoundingClientRect();
                if (sr.width > 0) moveCursor(sr.right, sr.bottom, penColor, false);
              }
            }, startDelayMs + idx * perLetterMs);
            timers.push(t);
          });
          return startDelayMs + chars.length * perLetterMs;
        }

        function drawInternalPath(pathObj, color, delayMs, strokeWidth = 2.8, opacity = "0.92") {
          const t = setTimeout(() => {
            const len = Math.max(1, pathObj.len || 1);
            const p = svgEl("path", {
              d: pathObj.d,
              fill: "none",
              stroke: color,
              "stroke-width": String(strokeWidth),
              "stroke-opacity": opacity,
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              "stroke-dasharray": `${len} ${len + 10}`,
              "stroke-dashoffset": String(len),
              style: "transition: stroke-dashoffset 0.42s ease-out;",
            });
            noteSvg.appendChild(p);
            requestAnimationFrame(() => {
              p.setAttribute("stroke-dashoffset", "0");
            });
          }, delayMs);
          timers.push(t);
        }

        // 1. Titre du tableau + badge éventuel
        let cursorMs = 90;
        let titleSpan = null;
        if (config.title) {
          const titleRow = document.createElement("div");
          titleRow.style.cssText =
            "font-weight:700;font-size:17px;color:#F8FAFC;margin-bottom:16px;line-height:1.3;padding-right:34px;";
          titleSpan = document.createElement("span");
          titleRow.appendChild(titleSpan);
          card.appendChild(titleRow);
          cursorMs = appendAnimatedLetters(titleSpan, config.title, id + "::title", 70, 20, "#F5B700") + 100;
        }

        // 2. Lignes du tableau (équations / barème / règles style draw_07)
        const linesContainer = document.createElement("div");
        linesContainer.style.cssText = "display:flex;flex-direction:column;gap:12px;";
        card.appendChild(linesContainer);

        const postLayoutDrawJobs = [];
        const lines = Array.isArray(config.lines) ? config.lines : [];

        lines.forEach((line, idx) => {
          const startAt = line.at !== undefined ? line.at : cursorMs;
          const lineId = line.id || `${id}_l${idx + 1}`;
          const lineColor = CHALK_COLORS[line.color] || CHALK_COLORS.ink;
          const perLetter = line.per_letter_ms || 20;

          if (line.divider) {
            const divRow = document.createElement("div");
            divRow.style.cssText = "height:10px;position:relative;margin:2px 0;";
            linesContainer.appendChild(divRow);
            postLayoutDrawJobs.push(() => {
              const dr = localRectInCard(divRow);
              const p = window.NKAP_GEOMETRY.handUnderline(dr.x, dr.y + 5, dr.w, lineId + "::div");
              drawInternalPath(p, "rgba(248,250,252,0.5)", startAt, 2.2);
            });
            cursorMs = startAt + 220;
            return;
          }

          const row = document.createElement("div");
          row.setAttribute("data-nkap-id", lineId);
          row.style.cssText =
            `display:flex;align-items:baseline;justify-content:space-between;gap:12px;` +
            `font-size:${line.bold ? "16px" : "14.5px"};font-weight:${line.bold ? "700" : "400"};` +
            `color:${lineColor};line-height:1.45;position:relative;`;

          let endAt = startAt;
          let highlightTargetEl = row;

          if (line.label != null && line.value != null) {
            const lblSpan = document.createElement("span");
            lblSpan.style.cssText = "color:#CBD5E1;flex-shrink:0;";
            const valSpan = document.createElement("span");
            valSpan.setAttribute("data-nkap-id", lineId + "-val");
            valSpan.style.cssText = `font-weight:700;color:${lineColor};text-align:right;max-width:230px;overflow-wrap:anywhere;`;
            row.appendChild(lblSpan);
            row.appendChild(valSpan);

            const afterLbl = appendAnimatedLetters(
              lblSpan,
              line.label,
              lineId + "::lbl",
              startAt,
              perLetter,
              "#CBD5E1"
            );
            endAt = appendAnimatedLetters(
              valSpan,
              line.value,
              lineId + "::val",
              afterLbl + 50,
              perLetter,
              lineColor
            );
            highlightTargetEl = valSpan;
          } else {
            const txtSpan = document.createElement("span");
            if (line.bold) txtSpan.style.fontWeight = "700";
            row.appendChild(txtSpan);
            endAt = appendAnimatedLetters(
              txtSpan,
              line.text || "",
              lineId + "::txt",
              startAt,
              perLetter,
              lineColor
            );
            highlightTargetEl = txtSpan;
          }

          linesContainer.appendChild(row);
          cursorMs = endAt + 150;

          if (line.box || line.circle || line.underline) {
            postLayoutDrawJobs.push(() => {
              const lr = localRectInCard(highlightTargetEl);
              if (line.box) {
                const p = window.NKAP_GEOMETRY.handBox(
                  lr.x - 7,
                  lr.y - 4,
                  lr.w + 14,
                  lr.h + 8,
                  lineId + "::box"
                );
                drawInternalPath(p, "#F5B700", endAt + 60, 3.2);
              } else if (line.circle) {
                const p = window.NKAP_GEOMETRY.handCircle(
                  lr.x + lr.w / 2,
                  lr.y + lr.h / 2,
                  lr.w / 2 + 10,
                  lr.h / 2 + 7,
                  lineId + "::circle"
                );
                drawInternalPath(p, "#F5B700", endAt + 60, 3.2);
              } else if (line.underline) {
                const p = window.NKAP_GEOMETRY.handUnderline(
                  lr.x - 2,
                  lr.y + lr.h + 3,
                  lr.w + 4,
                  lineId + "::ul"
                );
                drawInternalPath(p, "#F5B700", endAt + 60, 3.4);
              }
            });
          }
        });

        document.documentElement.appendChild(card);

        // Ajuste verticalement si la carte déborde près du sous-titre bas
        const cardRect = card.getBoundingClientRect();
        const maxBottom = window.innerHeight - 92;
        if (cardRect.bottom > maxBottom) {
          baseY = Math.max(58, baseY - (cardRect.bottom - maxBottom));
          card.style.top = `${baseY}px`;
        }

        // Contour wireframe esquissé à la craie (style omg_05) sur le bord extérieur exact (offsetWidth/offsetHeight)
        const nbGen = clearGen;
        requestAnimationFrame(() => {
          if (nbGen !== clearGen || !card.isConnected) return;
          const cw = card.offsetWidth;
          const ch = card.offsetHeight;
          const wirePath = window.NKAP_GEOMETRY.handBox(
            3,
            3,
            cw - 6,
            ch - 6,
            id + "::wireframe"
          );
          drawInternalPath(wirePath, "rgba(248,250,252,0.52)", 0, 2.2, "0.75");

          if (titleSpan) {
            const tr = localRectInCard(titleSpan);
            const ulPath = window.NKAP_GEOMETRY.handUnderline(
              tr.x - 2,
              tr.y + tr.h + 3,
              tr.w + 6,
              id + "::title-ul"
            );
            drawInternalPath(ulPath, "#F5B700", 220, 3.6);
          }

          postLayoutDrawJobs.forEach((job) => job());
        });

        marks.set(id, {
          node: [card],
          timers,
          startedAt: performance.now(),
          drawMs: cursorMs,
          len: 0,
          dom: true,
          anchorEl: pageAnchor,
          baseRect: pageAnchor ? pageAnchor.getBoundingClientRect() : null,
          baseX,
          baseY,
        });
      };

      if (config.anchorEl) {
        anchored(config.anchorEl, renderNotebook);
      } else {
        renderNotebook();
      }
    },

    /**
     * 7. `caption` : Sous-titre cinéma en bas de l'écran (réf. draw_18 / draw_07)
     */
    caption(text, subFr = null, wordDelayMs = 80) {
      ensureLayers();
      if (wordTimer) {
        clearInterval(wordTimer);
        wordTimer = null;
      }
      if (!text || !String(text).trim()) {
        capLayer.style.opacity = "0";
        setStatusPill(null);
        setTimeout(() => {
          if (capLayer.style.opacity === "0") {
            capLayer.style.display = "none";
            capLayer.innerHTML = "";
          }
        }, 160);
        return;
      }

      capLayer.innerHTML = "";
      capLayer.style.display = "block";
      requestAnimationFrame(() => {
        capLayer.style.opacity = "1";
      });

      const mainLine = document.createElement("div");
      mainLine.style.fontWeight = "700";
      const words = String(text).trim().split(/\s+/);
      const wordSpans = words.map((w) => {
        const s = document.createElement("span");
        s.className = "nkap-word";
        s.textContent = w;
        mainLine.appendChild(s);
        return s;
      });
      capLayer.appendChild(mainLine);

      if (subFr) {
        const subLine = document.createElement("div");
        subLine.textContent = subFr;
        subLine.style.cssText =
          "font-size:13px;color:#CBD5E1;margin-top:2px;font-weight:400;";
        capLayer.appendChild(subLine);
      }

      let idx = 0;
      const revealNext = () => {
        if (idx < wordSpans.length) {
          wordSpans[idx].classList.add("visible");
          idx++;
        } else if (wordTimer) {
          clearInterval(wordTimer);
          wordTimer = null;
        }
      };
      revealNext();
      wordTimer = setInterval(revealNext, wordDelayMs);
    },

    hide(id) {
      const m = marks.get(id);
      if (m) fadeOutMark(id, m);
      else {
        document.querySelectorAll(`[data-nkap="${id}"]`).forEach((n) => n.remove());
        if (window.NKAP_RULES) window.NKAP_RULES.onMarkRemoved(id);
      }
    },

    clear() {
      clearGen++;
      pendingOverlayTimers.forEach((tid) => clearTimeout(tid));
      pendingOverlayTimers.clear();
      ensureLayers();
      if (wordTimer) {
        clearInterval(wordTimer);
        wordTimer = null;
      }
      for (const [, m] of marks) {
        if (m.timers) m.timers.forEach((t) => clearTimeout(t));
      }
      svg.innerHTML = "";
      marks.clear();
      activeCursorMarkId = null;
      hideCursor();
      setStatusPill(null);
      if (window.NKAP_RULES) window.NKAP_RULES.onCleared();
      this.caption("");
      document.querySelectorAll("[data-nkap]").forEach((n) => n.remove());
    },

    /**
     * 8. Bulle & Dock interactif HeyClicky (Chips de questions par écran + Micro Push-to-Talk + Saisie)
     */
    bubble(onTap) {
      ensureLayers();
      if (bubbleEl) {
        if (onTap) bubbleEl.__nkapTap = onTap;
        return bubbleEl;
      }

      // Panneau de questions rapides juste au-dessus de la bulle
      panelEl = document.createElement("div");
      panelEl.id = "nkap-question-panel";
      panelEl.style.cssText =
        "position:fixed;right:20px;bottom:90px;width:336px;" +
        "background:rgba(12,17,28,0.94);backdrop-filter:blur(14px);" +
        "border:1px solid rgba(245,183,0,0.35);border-radius:18px;" +
        "padding:14px;color:#F8FAFC;font-family:'Andika',system-ui,sans-serif;" +
        "box-shadow:0 20px 48px rgba(0,0,0,0.6);z-index:2147483647;" +
        "display:none;flex-direction:column;gap:10px;pointer-events:auto;" +
        "animation:nkapPopIn 0.14s ease-out both;";

      document.documentElement.appendChild(panelEl);

      bubbleEl = document.createElement("div");
      bubbleEl.id = "nkap-bubble";
      bubbleEl.innerHTML = `<span style="pointer-events:none;">nkap</span>`;
      bubbleEl.title = "Cliquer : poser une question ou choisir une explication";
      bubbleEl.style.cssText =
        "position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;" +
        "background:#12233A;color:#F5B700;display:flex;align-items:center;justify-content:center;" +
        "font-family:'Andika',system-ui,sans-serif;font-weight:700;font-size:16px;" +
        "border:2.5px solid #F5B700;box-shadow:0 6px 20px rgba(0,0,0,0.45);" +
        "z-index:2147483647;pointer-events:auto;cursor:pointer;user-select:none;" +
        "transition:transform 0.14s ease, box-shadow 0.14s ease;";

      bubbleEl.__nkapTap = onTap || (() => {});
      bubbleEl.addEventListener("click", () => {
        bubbleEl.style.transform = "scale(0.91)";
        setTimeout(() => (bubbleEl.style.transform = "scale(1)"), 140);
        if (window.NKAP_ASSISTANT && window.NKAP_ASSISTANT.togglePanel) {
          window.NKAP_ASSISTANT.togglePanel(panelEl);
        } else {
          bubbleEl.__nkapTap();
        }
      });

      document.documentElement.appendChild(bubbleEl);
      return bubbleEl;
    },
  };
})();
