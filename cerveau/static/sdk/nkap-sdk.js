/*!
 * NkapSDK v1.2.0 — Multi-Channel Financial Linguistic & Visual Overlay SDK
 * Built from nkap-sdk/src/* (zero dependencies)
 */
/* === src/core/geometry.js === */
/**
 * nkap-sdk/src/core/geometry.js — Géométrie manuscrite déterministe (0 DOM, v1.2)
 *
 * Produit des chemins SVG (d + len) au grain feutre naturel :
 * - handCircle, handBox, handUnderline, handArrow, handArrowBetweenRects (v1.1)
 * - handStrike, handCheck, handCross, handHighlight (nouveaux v1.2)
 */

(function (global) {
  const NS = (global.__NKAP_SDK_MODULES__ = global.__NKAP_SDK_MODULES__ || {});

  function seeded(seedStr) {
    const s = String(seedStr || "nkap");
    let h = 1779033703 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 3432918353) | 0;
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507) | 0;
      h = Math.imul(h ^ (h >>> 13), 3266489909) | 0;
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  function smoothPath(pts, tension = 6) {
    if (!pts || pts.length < 2) return { d: "", len: 0 };
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];

      const c1x = p1[0] + (p2[0] - p0[0]) / tension;
      const c1y = p1[1] + (p2[1] - p0[1]) / tension;
      const c2x = p2[0] - (p3[0] - p1[0]) / tension;
      const c2y = p2[1] - (p3[1] - p1[1]) / tension;

      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      len += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    }
    return { d, len: Math.max(1, len * 1.08) };
  }

  function handCircle(cx, cy, rx, ry, seed) {
    const rand = seeded(seed);
    const steps = 20;
    const startAngle = -2.25;
    const sweep = Math.PI * 2 + 0.38;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = startAngle + sweep * t;
      const endSpiral = t > 0.85 ? (t - 0.85) * 14 : 0;
      const jr = 1 + (rand() - 0.5) * 0.042;
      pts.push([
        cx + Math.cos(a) * (rx * jr + endSpiral * 0.3),
        cy + Math.sin(a) * (ry * jr - endSpiral * 0.15),
      ]);
    }
    return smoothPath(pts, 6);
  }

  function handBox(x, y, w, h, seed) {
    const rand = seeded(seed);
    const r = Math.min(12, w * 0.08, h * 0.28);
    const jit = () => (rand() - 0.5) * 2.0;
    const raw = [
      [x + r * 0.6, y + jit()],
      [x + w * 0.35, y - 1.2 + jit()],
      [x + w * 0.7, y + 0.6 + jit()],
      [x + w - r, y + jit()],
      [x + w + jit() * 0.6, y + r],
      [x + w + 0.8 + jit(), y + h * 0.5],
      [x + w + jit() * 0.6, y + h - r],
      [x + w - r, y + h + jit()],
      [x + w * 0.65, y + h + 1.2 + jit()],
      [x + w * 0.3, y + h - 0.5 + jit()],
      [x + r, y + h + jit()],
      [x + jit() * 0.6, y + h - r],
      [x - 0.8 + jit(), y + h * 0.5],
      [x + jit() * 0.6, y + r],
      [x + r * 0.6, y + 1.0 + jit() * 0.5],
      [x + r + Math.min(18, w * 0.12), y + 1.8 + jit() * 0.5],
    ];
    return smoothPath(raw, 6.5);
  }

  function handUnderline(x, y, w, seed) {
    const rand = seeded(seed);
    const steps = 10;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const arch = Math.sin(t * Math.PI) * 2.8;
      pts.push([x + w * t + (rand() - 0.5) * 1.6, y + arch + (rand() - 0.5) * 1.6]);
    }
    return smoothPath(pts, 6);
  }

  /** Rature manuscrite diagonale (`strike`, scénario Correction d'une requête). */
  function handStrike(x, y, w, h, seed) {
    const rand = seeded(seed);
    const steps = 8;
    const pts = [];
    const y0 = y + h * 0.68;
    const y1 = y + h * 0.32;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const wave = Math.sin(t * Math.PI) * 2.4;
      pts.push([
        x - 4 + (w + 8) * t + (rand() - 0.5) * 1.4,
        y0 + (y1 - y0) * t + wave + (rand() - 0.5) * 1.6,
      ]);
    }
    return smoothPath(pts, 6);
  }

  /** Surligneur stabilo légèrement oblique (`highlight`). */
  function handHighlight(x, y, w, h, seed) {
    const rand = seeded(seed);
    const cy = y + h * 0.52;
    const pts = [
      [x - 3, cy + (rand() - 0.5) * 2],
      [x + w * 0.33, cy - 1.2 + (rand() - 0.5) * 2],
      [x + w * 0.66, cy + 1.1 + (rand() - 0.5) * 2],
      [x + w + 3, cy + (rand() - 0.5) * 2],
    ];
    return smoothPath(pts, 6);
  }

  /** Coche manuscrite ✓ (`check`). */
  function handCheck(cx, cy, size = 24, seed = "chk") {
    const rand = seeded(seed);
    const s = size * 0.5;
    const j = () => (rand() - 0.5) * 1.4;
    const pts = [
      [cx - s * 0.85 + j(), cy + s * 0.05 + j()],
      [cx - s * 0.2 + j(), cy + s * 0.72 + j()],
      [cx + s * 0.95 + j(), cy - s * 0.78 + j()],
    ];
    return smoothPath(pts, 8);
  }

  /** Croix manuscrite ✗ en 2 traits (`cross`). */
  function handCross(cx, cy, size = 22, seed = "crs") {
    const rand = seeded(seed);
    const s = size * 0.45;
    const j = () => (rand() - 0.5) * 1.5;
    const p1 = smoothPath(
      [
        [cx - s + j(), cy - s + j()],
        [cx + j(), cy + j()],
        [cx + s + j(), cy + s + j()],
      ],
      7
    );
    const p2 = smoothPath(
      [
        [cx + s + j(), cy - s + j()],
        [cx + j(), cy + j()],
        [cx - s + j(), cy + s + j()],
      ],
      7
    );
    return { main: p1, head: p2 };
  }

  function borderPointTowards(rect, targetX, targetY, pad = 10) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const dx = targetX - cx;
    const dy = targetY - cy;
    if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return [cx, cy];
    const hw = rect.w / 2 + pad;
    const hh = rect.h / 2 + pad;
    const scaleX = Math.abs(dx) > 0.01 ? hw / Math.abs(dx) : Infinity;
    const scaleY = Math.abs(dy) > 0.01 ? hh / Math.abs(dy) : Infinity;
    const s = Math.min(scaleX, scaleY, 1);
    return [cx + dx * s, cy + dy * s];
  }

  function handArrow(fx, fy, tx, ty, seed, bow = 0.14) {
    const rand = seeded(seed);
    const steps = 12;
    const dx = tx - fx;
    const dy = ty - fy;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = -dy / dist;
    const ny = dx / dist;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const bulge = Math.sin(t * Math.PI) * bow * dist * 0.32;
      const j = (1 - Math.abs(t - 0.5) * 1.6) * 1.8;
      pts.push([
        fx + dx * t + nx * bulge + (rand() - 0.5) * j,
        fy + dy * t + ny * bulge + (rand() - 0.5) * j,
      ]);
    }
    const main = smoothPath(pts, 6);
    const pLast = pts[pts.length - 1];
    const pPrev = pts[Math.max(0, pts.length - 3)];
    const ang = Math.atan2(pLast[1] - pPrev[1], pLast[0] - pPrev[0]);
    const L = 13;
    const a1 = ang + Math.PI - 0.48;
    const a2 = ang + Math.PI + 0.48;
    const head = {
      d: `M ${(tx + L * Math.cos(a1)).toFixed(1)} ${(ty + L * Math.sin(a1)).toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${(tx + L * Math.cos(a2)).toFixed(1)} ${(ty + L * Math.sin(a2)).toFixed(1)}`,
      len: L * 2.2,
    };
    return { main, head };
  }

  function handArrowBetweenRects(rectFrom, rectTo, seed, bow = 0.14) {
    const [fx, fy] = borderPointTowards(rectFrom, rectTo.cx, rectTo.cy, 8);
    const [tx, ty] = borderPointTowards(rectTo, rectFrom.cx, rectFrom.cy, 10);
    return handArrow(fx, fy, tx, ty, seed, bow);
  }

  NS.geometry = {
    seeded,
    smoothPath,
    handCircle,
    handBox,
    handUnderline,
    handStrike,
    handHighlight,
    handCheck,
    handCross,
    borderPointTowards,
    handArrow,
    handArrowBetweenRects,
  };
})(typeof window !== "undefined" ? window : globalThis);

/* === src/core/layout.js === */
/**
 * nkap-sdk/src/core/layout.js — Placeur anti-collision pur (0 DOM, inspiré de Roamies `nameSpot`)
 *
 * Teste des positions candidates autour d'une cible (droite, gauche, haut, bas, coins)
 * en pénalisant tout chevauchement avec :
 * - les bords du viewport OU de la frame simulateur Web/Mobile/USSD (`opts.bounds`)
 * - les zones sûres (pilule haute, sous-titres bas, barre de navigation mobile, orbe)
 * - les boîtes de texte / boutons existants de l'écran (`obstacles`)
 * - les marques et cartes déjà affichées (`occupied`)
 */

(function (global) {
  const NS = (global.__NKAP_SDK_MODULES__ = global.__NKAP_SDK_MODULES__ || {});

  function overlapArea(a, b) {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return ix * iy;
  }

  function resolveArea(opts = {}) {
    if (opts.bounds && opts.bounds.inFrame) {
      const b = opts.bounds;
      return {
        left: b.left,
        top: b.top,
        right: b.right,
        bottom: b.bottom,
        w: b.right - b.left,
        h: b.bottom - b.top,
        inFrame: true,
        isMobile: !!b.isMobile,
      };
    }
    const vp = opts.viewport || {
      w: typeof window !== "undefined" ? window.innerWidth : 1280,
      h: typeof window !== "undefined" ? window.innerHeight : 720,
    };
    return {
      left: vp.left ?? 0,
      top: vp.top ?? 0,
      right: vp.right ?? vp.w,
      bottom: vp.bottom ?? vp.h,
      w: vp.w,
      h: vp.h,
      inFrame: false,
      isMobile: vp.w < 520,
    };
  }

  function clampBox(box, area, margin = 12, safeTop = 52, safeBottom = 86) {
    const minX = (area.left ?? 0) + margin;
    const maxX = Math.max(minX, (area.right ?? area.w) - box.w - margin);
    const minY = (area.top ?? 0) + safeTop;
    const maxY = Math.max(minY, (area.bottom ?? area.h) - box.h - safeBottom);
    return {
      x: Math.min(maxX, Math.max(minX, box.x)),
      y: Math.min(maxY, Math.max(minY, box.y)),
      w: box.w,
      h: box.h,
    };
  }

  /**
   * Trouve le meilleur emplacement `(x, y, side)` pour une étiquette ou carte de taille `(w, h)`
   * près de `targetRect` sans recouvrir la cible ni sortir du viewport / de la frame simulateur.
   */
  function findBestSpot(targetRect, size, opts = {}) {
    const area = resolveArea(opts);
    const gap = opts.gap ?? 14;
    const obstacles = opts.obstacles || [];
    const occupied = opts.occupied || [];
    const margin = area.inFrame ? 8 : 12;
    const safeTop = opts.safeTop ?? (area.inFrame && area.isMobile ? 60 : 50);
    const safeBottom = opts.safeBottom ?? (area.inFrame && area.isMobile ? 106 : 84);
    const w = Math.min(size.w, Math.max(120, area.w - margin * 2));
    const h = size.h;
    const t = targetRect || {
      x: area.left + area.w * 0.5 - 20,
      y: area.top + area.h * 0.35,
      w: 40,
      h: 24,
      cx: area.left + area.w * 0.5,
      cy: area.top + area.h * 0.35 + 12,
    };
    const cx = t.cx ?? t.x + t.w / 2;
    const cy = t.cy ?? t.y + t.h / 2;

    // Zone occupée par l'orbe en haut à droite de la frame
    const orbObstacle = { x: area.right - 84, y: area.top + 20, w: 78, h: 78 };

    const candidates = [
      { side: "right", x: t.x + t.w + gap, y: cy - h / 2 },
      { side: "top", x: cx - w / 2, y: t.y - h - gap },
      { side: "bottom", x: cx - w / 2, y: t.y + t.h + gap },
      { side: "left", x: t.x - w - gap, y: cy - h / 2 },
      { side: "top-right", x: t.x + t.w + gap, y: t.y - h * 0.6 },
      { side: "top-left", x: t.x - w - gap, y: t.y - h * 0.6 },
      { side: "bottom-right", x: t.x + t.w + gap, y: t.y + t.h - h * 0.3 },
      { side: "bottom-left", x: t.x - w - gap, y: t.y + t.h - h * 0.3 },
    ];

    let best = null;
    let bestScore = Infinity;

    for (let idx = 0; idx < candidates.length; idx++) {
      const c = candidates[idx];
      const clamped = clampBox({ x: c.x, y: c.y, w, h }, area, margin, safeTop, safeBottom);
      const shiftPenalty = Math.hypot(clamped.x - c.x, clamped.y - c.y) * 4;
      const targetHit = overlapArea(clamped, t) * 40;
      const orbHit = overlapArea(clamped, orbObstacle) * 28;
      let occupiedHit = 0;
      for (const o of occupied) occupiedHit += overlapArea(clamped, o) * 25;
      let obsHit = 0;
      for (const o of obstacles) obsHit += overlapArea(clamped, o) * 3.5;

      const score = shiftPenalty + targetHit + orbHit + occupiedHit + obsHit + idx * 6;
      if (score < bestScore) {
        bestScore = score;
        best = { x: clamped.x, y: clamped.y, w, h, side: c.side, score };
      }
    }

    return best || clampBox({ x: area.right - w - margin, y: area.top + safeTop + 12, w, h }, area, margin, safeTop, safeBottom);
  }

  /**
   * Calcule la meilleure zone libre pour une carte pédagogique (`notebook`)
   * strictement confinée dans la frame Web/Mobile/USSD si présente.
   */
  function findCardSpot(targetRect, cardSize, opts = {}) {
    const area = resolveArea(opts);
    const margin = area.inFrame ? (area.isMobile ? 9 : 14) : 14;
    const safeTop = opts.safeTop ?? (area.inFrame && area.isMobile ? 64 : 52);
    const safeBottom = opts.safeBottom ?? (area.inFrame && area.isMobile ? 112 : 82);
    const w = Math.min(cardSize.w, Math.max(200, area.w - margin * 2));
    const h = cardSize.h;
    const channel = opts.channel || "web";

    // Sur simulateur mobile étroit ou viewport étroit : centré dans la frame, jamais débordant sur les côtés !
    if (area.isMobile || area.w < 540 || channel === "mobile") {
      const midY = area.top + area.h * 0.48;
      const topHalf = targetRect && targetRect.y > midY;
      const y = topHalf
        ? area.top + safeTop
        : Math.max(area.top + safeTop, area.bottom - h - safeBottom);
      return clampBox({ x: area.left + (area.w - w) / 2, y, w, h }, area, margin, safeTop, safeBottom);
    }

    // Sur grand écran / frame Web large : marges calmes à droite ou à gauche À L'INTÉRIEUR de la frame
    const outerRight = clampBox(
      { x: area.right - w - margin, y: targetRect ? targetRect.y - 36 : area.top + safeTop + 20, w, h },
      area,
      margin,
      safeTop,
      safeBottom
    );
    const outerLeft = clampBox(
      { x: area.left + margin, y: targetRect ? targetRect.y - 36 : area.top + safeTop + 20, w, h },
      area,
      margin,
      safeTop,
      safeBottom
    );
    const obs = opts.obstacles || [];
    const occ = opts.occupied || [];
    const scoreBox = (box) => {
      let s = targetRect ? overlapArea(box, targetRect) * 50 : 0;
      for (const o of occ) s += overlapArea(box, o) * 30;
      for (const o of obs) s += overlapArea(box, o) * 5;
      return s;
    };
    const rScore = scoreBox(outerRight);
    const lScore = scoreBox(outerLeft);
    if (rScore < 1200 || lScore < 1200) {
      return rScore <= lScore
        ? Object.assign(outerRight, { side: "outer-right" })
        : Object.assign(outerLeft, { side: "outer-left" });
    }

    return findBestSpot(targetRect, { w, h }, {
      bounds: opts.bounds,
      viewport: opts.viewport,
      gap: 20,
      obstacles: obs,
      occupied: occ,
      safeTop,
      safeBottom,
    });
  }

  NS.layout = {
    overlapArea,
    clampBox,
    findBestSpot,
    findCardSpot,
  };
})(typeof window !== "undefined" ? window : globalThis);

/* === src/core/rules.js === */
/**
 * nkap-sdk/src/core/rules.js — Discipline visuelle, AmountGuard v1.2 & tolérance JSON (`tidyAction`)
 *
 * 1. Budget visuel strict : <= 3 marques simultanées (FIFO) — `notebook` compte pour 1 marque.
 * 2. AmountGuard v1.2 : vérifie les montants/pourcentages dans `write`, `callout`, `num`, `edit`
 *    et tous les modes de `notebook` (`lines`, `flow`, `bars`, `table`, `choices`).
 * 3. `tidyAction` (inspiré de Roamies `tidyMark`) : répare les petites variations de payload
 *    (ex: cible passée en string -> `{ match_text }`, `heading` -> `title`, `ring` -> `circle`).
 */

(function (global) {
  const NS = (global.__NKAP_SDK_MODULES__ = global.__NKAP_SDK_MODULES__ || {});

  const MAX_MARKS = 3;
  const visibleIds = [];
  const AMOUNT_RE = /[\d][\d\s.,]*\s*(?:FCFA|XAF|francs?|fr\.?|%)/giu;

  const ACTION_ALIASES = {
    ring: "circle",
    label: "callout",
    point: "callout",
    connect: "arrow",
    step: "num",
    card: "notebook",
    flow: "notebook",
    bars: "notebook",
    table: "notebook",
    choices: "notebook",
  };

  function onMarkAdded(id) {
    const idx = visibleIds.indexOf(id);
    if (idx !== -1) visibleIds.splice(idx, 1);
    visibleIds.push(id);
    const evicted = [];
    while (visibleIds.length > MAX_MARKS) {
      evicted.push(visibleIds.shift());
    }
    return evicted;
  }

  function onMarkRemoved(id) {
    const idx = visibleIds.indexOf(id);
    if (idx !== -1) visibleIds.splice(idx, 1);
  }

  function onCleared() {
    visibleIds.length = 0;
  }

  function getVisibleCount() {
    return visibleIds.length;
  }

  function amountsPreserved(text, screenTextOverride = null) {
    if (!text) return true;
    const matches = String(text).match(AMOUNT_RE);
    if (!matches || matches.length === 0) return true;

    const rawCorpus =
      screenTextOverride !== null
        ? String(screenTextOverride)
        : typeof document !== "undefined" && document.body
          ? document.body.innerText
          : "";
    const bodyDigits = rawCorpus.replace(/\D+/g, "");
    if (!bodyDigits) return true;

    for (const raw of matches) {
      const digits = raw.replace(/\D+/g, "");
      if (digits.length > 0 && !bodyDigits.includes(digits)) {
        if (typeof console !== "undefined") {
          console.warn("[nkap-sdk/AmountGuard] Action rejetée — montant absent de l'écran :", raw);
        }
        return false;
      }
    }
    return true;
  }

  /** Vérifie récursivement tous les textes d'une action v1.2 contre AmountGuard. */
  function validateActionAmounts(action, screenTextOverride = null) {
    if (!action || typeof action !== "object") return false;
    const texts = [];
    if (action.text) texts.push(action.text);
    if (action.label) texts.push(action.label);
    if (action.title) texts.push(action.title);
    for (const ln of action.lines || []) {
      if (ln.label) texts.push(ln.label);
      if (ln.value) texts.push(ln.value);
      if (ln.text) texts.push(ln.text);
    }
    for (const st of action.flow_steps || []) {
      if (st.label) texts.push(st.label);
      if (st.value) texts.push(st.value);
    }
    for (const b of action.bars || []) {
      if (b.label) texts.push(b.label);
      if (b.amount_text) texts.push(b.amount_text);
    }
    for (const c of action.columns || []) texts.push(c);
    for (const r of action.rows || []) {
      if (Array.isArray(r)) r.forEach((cell) => texts.push(cell));
    }
    for (const ch of action.choices || []) {
      if (ch.label) texts.push(ch.label);
      if (ch.value) texts.push(ch.value);
    }
    return texts.every((t) => amountsPreserved(t, screenTextOverride));
  }

  /** Normalise une action imparfaite (inspiré Roamies `tidyMark`). */
  function tidyAction(raw) {
    if (!raw) return null;
    if (typeof raw === "string") return { t: raw.trim().toLowerCase() };
    const a = Object.assign({}, raw);
    let t = String(a.t || a.kind || a.type || "").trim().toLowerCase();
    if (!t) return null;

    if (t === "flow" || t === "bars" || t === "table" || t === "choices") {
      a.mode = a.mode || t;
      t = "notebook";
    } else if (ACTION_ALIASES[t]) {
      t = ACTION_ALIASES[t];
    }
    a.t = t;

    for (const k of ["target", "from", "to", "anchor"]) {
      if (typeof a[k] === "string" && a[k].trim()) {
        const s = a[k].trim();
        a[k] = /^n_[a-z0-9_-]+$/i.test(s) ? { node_id: s } : { match_text: s };
      }
    }
    if (!a.title && a.heading) a.title = a.heading;
    if (a.t === "callout" && !a.label && a.text) a.label = a.text;
    return a;
  }

  function detectTone(el) {
    if (!el || el.nodeType !== 1 || typeof window === "undefined") return "light";
    const parseLum = (cssColor) => {
      const m = String(cssColor || "").match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
      if (!m) return null;
      const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
      if (alpha < 0.35) return null;
      return (0.2126 * parseFloat(m[1]) + 0.7152 * parseFloat(m[2]) + 0.0722 * parseFloat(m[3])) / 255;
    };

    let cur = el;
    for (let depth = 0; depth < 32 && cur && cur.nodeType === 1; depth++, cur = cur.parentElement) {
      const cs = window.getComputedStyle(cur);
      const bgLum = parseLum(cs.backgroundColor);
      if (bgLum !== null) return bgLum < 0.45 ? "dark" : "light";
      if (cs.backgroundImage && cs.backgroundImage !== "none") {
        const matches = cs.backgroundImage.match(/rgba?\([^)]+\)/g);
        if (matches && matches.length) {
          const lums = matches.map(parseLum).filter((v) => v !== null);
          if (lums.length) {
            return lums.reduce((a, b) => a + b, 0) / lums.length < 0.45 ? "dark" : "light";
          }
        }
      }
    }
    const fgLum = parseLum(window.getComputedStyle(el).color);
    if (fgLum !== null && fgLum > 0.55) return "dark";
    return "light";
  }

  NS.rules = {
    MAX_MARKS,
    onMarkAdded,
    onMarkRemoved,
    onCleared,
    getVisibleCount,
    amountsPreserved,
    validateActionAmounts,
    tidyAction,
    detectTone,
  };
})(typeof window !== "undefined" ? window : globalThis);

/* === src/core/protocol.js === */
/**
 * nkap-sdk/src/core/protocol.js — Normaliseur de payloads `NkapTurn v1.2` (0 DOM)
 *
 * Accepte indifféremment :
 * - v1.1 plat : { turn_id, actions: [{ seq, run_after_ms, action: {...} }] }
 * - v1.2 riche : { turn_id, meta, text_fallback, choices, actions: [...] }
 * - style Roamies `beats[]` : { beats: [{ say, caption_fr, audio_url, wait, actions|marks: [...] }] }
 */

(function (global) {
  const NS = (global.__NKAP_SDK_MODULES__ = global.__NKAP_SDK_MODULES__ || {});

  function normalizeTurn(payload) {
    const rules = NS.rules;
    const raw = payload && typeof payload === "object" ? payload : {};
    const meta = raw.meta || {
      channel: raw.channel || "web",
      lang: raw.lang || "fr",
      intent: raw.intent || "UNKNOWN",
      params: raw.params || {},
      status: raw.status || "ok",
    };

    const timedActions = [];
    let seq = 1;

    if (Array.isArray(raw.beats) && raw.beats.length > 0) {
      let cursorMs = 0;
      raw.beats.forEach((beat, bIdx) => {
        if (!beat || typeof beat !== "object") return;
        if (beat.say) {
          timedActions.push({
            seq: seq++,
            run_after_ms: cursorMs,
            wait: Boolean(beat.wait),
            action: {
              t: "speak",
              id: `beat_spk_${bIdx + 1}`,
              text: String(beat.say),
              caption_fr: beat.caption_fr || null,
              audio_url: beat.audio_url || null,
              lang: beat.lang || meta.lang || "fr",
            },
          });
        }
        const rawMarks = Array.isArray(beat.actions) ? beat.actions : Array.isArray(beat.marks) ? beat.marks : [];
        rawMarks.forEach((m, mIdx) => {
          const clean = rules ? rules.tidyAction(m) : m;
          if (!clean) return;
          timedActions.push({
            seq: seq++,
            run_after_ms: cursorMs + (m.run_after_ms ?? mIdx * 240),
            wait: Boolean(beat.wait),
            action: clean,
          });
        });
        cursorMs += beat.duration_ms || Math.max(1600, String(beat.say || "").length * 48);
      });
    } else if (Array.isArray(raw.actions)) {
      raw.actions.forEach((item) => {
        if (!item) return;
        const inner = item.action ? item.action : item;
        const clean = rules ? rules.tidyAction(inner) : inner;
        if (!clean) return;
        timedActions.push({
          seq: item.seq ?? seq++,
          run_after_ms: Number(item.run_after_ms ?? 0),
          speak_seg: item.speak_seg ?? 0,
          action: clean,
        });
      });
    }

    const speaks = timedActions
      .filter((x) => x.action && x.action.t === "speak" && x.action.text)
      .map((x) => x.action.text);

    return {
      turn_id: raw.turn_id || `t_${Date.now()}`,
      meta,
      text_fallback: raw.text_fallback || speaks.join(" ").trim(),
      choices: Array.isArray(raw.choices) ? raw.choices : null,
      actions: timedActions,
    };
  }

  NS.protocol = { normalizeTurn };
})(typeof window !== "undefined" ? window : globalThis);

/* === src/adapters/dom-adapter.js === */
/**
 * nkap-sdk/src/adapters/dom-adapter.js — HostAdapter Web multicanal (v1.2)
 *
 * Calibré pour :
 * - https://safinum.cm/sandbox/channel/web (Web Banking)
 * - https://safinum.cm/sandbox/channel/mobile (Mobile Banking)
 * - https://safinum.cm/sandbox/ussd (Simulateur USSD *123#)
 * - Toute application financière Web / WebView / GAB / SMS
 *
 * Sécurité (règle d'or #3) : exclut strictement input, textarea, select,
 * [type=password] et [contenteditable] du ScreenContext.
 */

(function (global) {
  const NS = (global.__NKAP_SDK_MODULES__ = global.__NKAP_SDK_MODULES__ || {});

  const OVERLAY_SEL =
    "#nkap-overlay-host, #nkap-caption, #nkap-bubble, #nkap-cursor-buddy, #nkap-status-pill, #nkap-question-panel, #nkap-notebook, [data-nkap]";

  function norm(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[ɔ]/g, "o")
      .replace(/[ɛ]/g, "e")
      .replace(/[ŋ]/g, "n")
      .replace(/[ə]/g, "e")
      .replace(/\s+/g, " ")
      .trim();
  }

  function detectChannel(explicit = "auto") {
    if (explicit && explicit !== "auto") return explicit;
    if (typeof window === "undefined") return "web";
    const rootAttr = document.documentElement?.getAttribute("data-nkap-channel") || document.body?.getAttribute("data-nkap-channel");
    if (rootAttr) return rootAttr;
    const href = String(window.location?.href || "").toLowerCase();
    if (href.includes("/sandbox/ussd") || href.includes("ussd")) return "ussd";
    if (href.includes("/sandbox/channel/mobile")) return "mobile";
    if (href.includes("/sandbox/channel/web")) return "web";
    if (href.includes("atm") || href.includes("gab")) return "atm";
    if (href.includes("sms")) return "sms";
    return window.innerWidth < 720 ? "mobile" : "web";
  }

  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.closest(OVERLAY_SEL)) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "svg" || tag === "path" || tag === "noscript") return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }

  function isSensitive(el) {
    if (!el || el.nodeType !== 1) return true;
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    if (el.getAttribute("type") === "password") return true;
    return false;
  }

  function isLeafText(el) {
    if (!isVisible(el) || isSensitive(el)) return false;
    for (const child of el.children) {
      const ct = child.tagName.toLowerCase();
      if (ct !== "svg" && ct !== "img" && ct !== "br" && ct !== "span") return false;
      if (ct === "span" && child.children.length > 0) return false;
    }
    const txt = (el.getAttribute("data-nkap-orig") || el.textContent || "").trim();
    return txt.length >= 1;
  }

  function createDOMAdapter(opts = {}) {
    const rootEl = opts.root || (typeof document !== "undefined" ? document.body : null);
    let channel = detectChannel(opts.channel || "auto");
    let idSeq = 1;

    function getRoot() {
      return opts.root || document.body;
    }

    function setChannel(next) {
      channel = detectChannel(next || "auto");
      return channel;
    }

    function getChannel() {
      return channel;
    }

    function guessScreenHint(nodes) {
      const blob = norm(nodes.map((n) => n.text).join(" "));
      if (blob.includes("verifiez avant de confirmer") || blob.includes("total debite") || blob.includes("check before")) return "review";
      if (blob.includes("operation reussie") || blob.includes("transfert confirme") || blob.includes("nouveau solde")) return "receipt";
      if (blob.includes("historique") || blob.includes("mes operations")) return "history";
      if (blob.includes("beneficiaire") || blob.includes("envoyer de l'argent")) return "transfer";
      if (blob.includes("facture") || blob.includes("credit")) return "pay";
      if (blob.includes("frais")) return "fees";
      return "home";
    }

    /** Extrait le ScreenContext I5-web (<= 200 nœuds, zéro champ de saisie). */
    function extractContext(screenHintOverride = null) {
      const root = getRoot();
      if (!root) return { type: "screen_context", channel, screen_hint: "unknown", nodes: [] };
      const rules = NS.rules;
      const nodes = [];
      const all = root.querySelectorAll("h1,h2,h3,h4,p,button,a,label,dt,dd,th,td,li,span,strong,b,em,small,code,div");
      for (const el of all) {
        if (nodes.length >= 200) break;
        if (!isLeafText(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight + 400) continue;
        let nid = el.getAttribute("data-nkap-id");
        if (!nid) {
          nid = `n_${String(idSeq++).padStart(2, "0")}`;
          el.setAttribute("data-nkap-id", nid);
        }
        const text = (el.getAttribute("data-nkap-orig") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90);
        if (!text) continue;
        const tag = el.tagName.toLowerCase();
        nodes.push({
          node_id: nid,
          tag,
          text,
          clickable: tag === "button" || tag === "a" || el.getAttribute("role") === "button",
          password: false,
          bounds: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
          tone: rules ? rules.detectTone(el) : "light",
        });
      }
      return {
        type: "screen_context",
        channel,
        page: {
          url: String(window.location?.href || ""),
          title: String(document.title || "Safinum"),
        },
        screen_hint: screenHintOverride || guessScreenHint(nodes),
        nodes,
      };
    }

    /** Résout une cible `{ node_id, match_text, selector }` vers un élément DOM réel. */
    function resolveTarget(target) {
      if (!target) return null;
      if (target.nodeType === 1) return target;
      if (typeof target === "string") {
        target = /^n_[a-z0-9_-]+$/i.test(target) ? { node_id: target } : { match_text: target };
      }

      if (target.selector) {
        const hit = document.querySelector(target.selector);
        if (hit && isVisible(hit)) return hit;
      }

      if (target.node_id) {
        const byId = document.querySelector(`[data-nkap-id="${CSS.escape(target.node_id)}"]`);
        if (byId) {
          if (isVisible(byId)) return byId;
          // Autorise l'ancrage d'une flèche depuis une ligne de notre ardoise (#nkap-notebook)
          if (byId.closest("#nkap-notebook")) {
            const nr = byId.getBoundingClientRect();
            if (nr.width > 2 && nr.height > 2) return byId;
          }
        }
      }

      const query = target.match_text || target.text;
      if (!query) return null;

      // Délègue à NKAP_QUERY de l'extension si présent pour garder la calibration fine existante
      if (typeof global.NKAP_QUERY === "function") {
        const qHit = global.NKAP_QUERY(query);
        if (qHit) return qHit;
      }

      const qn = norm(query);
      const root = getRoot();
      if (!root) return null;
      const candidates = root.querySelectorAll("button,a,h1,h2,h3,p,dt,dd,th,td,li,label,span,strong,b,em,small,code,div");
      let best = null;
      let bestScore = Infinity;

      for (const el of candidates) {
        if (!isVisible(el)) continue;
        const txt = norm(el.getAttribute("data-nkap-orig") || el.textContent || "");
        if (!txt || !txt.includes(qn)) continue;
        const exact = txt === qn ? 0 : 100;
        const score = exact + (txt.length - qn.length) + el.children.length * 15;
        if (score < bestScore) {
          bestScore = score;
          best = el;
        }
      }
      return best;
    }

    /** Boîtes d'obstacles visibles (boutons/titres/champs) pour le placement anti-collision `nameSpot`. */
    function getObstacles() {
      const root = getRoot();
      if (!root) return [];
      const out = [];
      const els = root.querySelectorAll("button,a,input,h1,h2,h3,[data-nkap-id]");
      for (const el of els) {
        if (out.length >= 60) break;
        if (!isVisible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.width > 10 && r.height > 10 && r.top >= 0 && r.bottom <= window.innerHeight) {
          out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
        }
      }
      return out;
    }

    return {
      detectChannel,
      getChannel,
      setChannel,
      extractContext,
      resolveTarget,
      getObstacles,
    };
  }

  NS.domAdapter = { createDOMAdapter, detectChannel };
})(typeof window !== "undefined" ? window : globalThis);

/* === src/renderers/text-renderer.js === */
/**
 * nkap-sdk/src/renderers/text-renderer.js — Renderer Texte pour USSD (<=182 GSM-7) & SMS (<=160 GSM-7)
 *
 * Projette le même payload canonique `NkapTurn v1.2` sur un canal sans écran graphique.
 */

(function (global) {
  const NS = (global.__NKAP_SDK_MODULES__ = global.__NKAP_SDK_MODULES__ || {});

  const GSM7_BASIC =
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
  const GSM7_EXT = "^{}\\[~]|€\f";

  const MAP = {
    "ɛ": "e", "Ɛ": "E", "ɔ": "o", "Ɔ": "O", "ŋ": "n", "Ŋ": "N",
    "ə": "e", "Ə": "E", "ɓ": "b", "Ɓ": "B", "’": "'", "‘": "'",
    "“": '"', "”": '"', "«": '"', "»": '"', "–": "-", "—": "-",
    "…": "...", "•": "-", "→": "->", "✓": "OK", "✗": "X",
  };

  function toGsm7(str) {
    let out = "";
    for (const rawCh of String(str || "")) {
      const ch = MAP[rawCh] || rawCh;
      if (GSM7_BASIC.includes(ch) || GSM7_EXT.includes(ch)) {
        out += ch;
        continue;
      }
      const base = ch.normalize("NFD").replace(/\p{Diacritic}/gu, "");
      for (const b of base) {
        const mb = MAP[b] || b;
        if (GSM7_BASIC.includes(mb) || GSM7_EXT.includes(mb)) out += mb;
      }
    }
    return out;
  }

  function gsm7Length(str) {
    let n = 0;
    for (const ch of String(str || "")) n += GSM7_EXT.includes(ch) ? 2 : 1;
    return n;
  }

  function fitGsm7(str, maxSeptets = 182) {
    const clean = toGsm7(str).trim();
    if (gsm7Length(clean) <= maxSeptets) return clean;
    const lim = Math.max(1, maxSeptets - 3);
    let acc = "";
    let used = 0;
    for (const ch of clean) {
      const cost = GSM7_EXT.includes(ch) ? 2 : 1;
      if (used + cost > lim) break;
      acc += ch;
      used += cost;
    }
    return acc.trimEnd() + "...";
  }

  /** Projette un NkapTurn v1.2 en réponse texte prête pour USSD ou SMS. */
  function renderTurnAsText(turnPayload, opts = {}) {
    const norm = NS.protocol ? NS.protocol.normalizeTurn(turnPayload) : turnPayload;
    const channel = opts.channel || norm.meta?.channel || "ussd";
    const maxSeptets = opts.maxSeptets || (channel === "sms" ? 160 : 182);

    const parts = [];
    if (norm.text_fallback) parts.push(norm.text_fallback);

    const choices = norm.choices || [];
    if (choices.length > 0) {
      parts.push(choices.map((c, idx) => `${c.key || idx + 1}. ${c.label}`).join("\n"));
    }

    const text = fitGsm7(parts.join("\n"), maxSeptets);
    return {
      channel,
      text,
      septets: gsm7Length(text),
      max_septets: maxSeptets,
      intent: norm.meta?.intent || "UNKNOWN",
      language: norm.meta?.lang || "fr",
    };
  }

  NS.textRenderer = { toGsm7, gsm7Length, fitGsm7, renderTurnAsText };
})(typeof window !== "undefined" ? window : globalThis);

/* === src/renderers/svg-renderer.js === */
/**
 * nkap-sdk/src/renderers/svg-renderer.js — SurfaceRenderer Web v1.2 (HeyClicky + Roamies)
 *
 * Gestes écran supportés :
 *   v1.1 : circle, box, underline, arrow, frame, write, caption, hide, clear, bubble
 *   v1.2 : callout (anti-collision nameSpot), num (① ② ③), highlight (stabilo),
 *          strike (rature correction), check (✓), cross (✗), edit (maj par id)
 *
 * Ardoise modulaire `notebook` (5 modes) :
 *   lines | flow | bars | table | choices (cliquable pour Requête ambiguë)
 */

(function (global) {
  const NS = (global.__NKAP_SDK_MODULES__ = global.__NKAP_SDK_MODULES__ || {});

  function createSVGRenderer(opts = {}) {
    let hostEl = null;
    let svg = null;
    let capLayer = null;
    let cursorEl = null;
    let cursorPathEl = null;
    let statusPillEl = null;
    let bubbleEl = null;
    let orbTagEl = null;
    let panelEl = null;
    let orbState = "idle"; // idle | thinking | speaking | listening
    let orbRaf = null;
    let orbFloatingTarget = null;
    let orbSizePx = 74;
    let orbSyncTimer = null;
    let userHomeRel = null; // Position relative choisie par l'utilisateur via glisser-déposer ({ rx, ry })
    let isDraggingOrb = false;
    let justDraggedOrb = false;
    let wordTimer = null;
    let raf = null;
    let activeCursorMarkId = null;
    let clearGen = 0;

    const marks = new Map();
    const pendingTimers = new Set();
    let onChoiceCb = typeof opts.onChoice === "function" ? opts.onChoice : null;
    let getObstaclesCb = typeof opts.getObstacles === "function" ? opts.getObstacles : () => [];
    let getChannelCb = typeof opts.getChannel === "function" ? opts.getChannel : () => "web";

    const PALETTE = {
      inkLight: "#12233A",
      inkDark: "#F5B700",
      yellow: "#F5B700",
      red: "#FF3B5C",
      green: "#34D399",
      cyan: "#38BDF8",
      chalk: "#F8FAFC",
      coral: "#FF6B8B",
    };

    const CHALK = {
      ink: "#F8FAFC",
      white: "#F8FAFC",
      yellow: "#F5B700",
      red: "#FF6B8B",
      green: "#34D399",
      cyan: "#38BDF8",
    };

    const geom = () => NS.geometry;
    const rules = () => NS.rules;
    const layout = () => NS.layout;

    function getAssetUrl(relPath) {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL) {
        return chrome.runtime.getURL(relPath);
      }
      return opts.assetBaseUrl ? `${opts.assetBaseUrl.replace(/\/$/, "")}/${relPath}` : relPath;
    }

    function injectStyles() {
      if (document.getElementById("nkap-sdk-styles")) return;
      const style = document.createElement("style");
      style.id = "nkap-sdk-styles";
      const regUrl = getAssetUrl("fonts/Andika-Regular.ttf");
      const boldUrl = getAssetUrl("fonts/Andika-Bold.ttf");
      const fontBlock =
        typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
          ? `@font-face{font-family:'Andika';src:url('${regUrl}') format('truetype');font-weight:400;font-display:swap;}
             @font-face{font-family:'Andika';src:url('${boldUrl}') format('truetype');font-weight:700;font-display:swap;}`
          : "";
      style.textContent = `
        ${fontBlock}
        @keyframes nkapPopIn { 0%{opacity:0;transform:scale(0.94);} 100%{opacity:1;transform:scale(1);} }
        @keyframes nkapSlideDown { 0%{opacity:0;transform:translateY(-16px) scale(0.96);} 100%{opacity:1;transform:translateY(0) scale(1);} }
        @keyframes nkapChipIn { 0%{opacity:0;transform:translateY(-6px);} 100%{opacity:1;transform:translateY(0);} }
        @keyframes nkapOrbBreath { 0%,100%{box-shadow:0 8px 26px rgba(245,183,0,0.28),0 0 0 1px rgba(255,196,77,0.35);} 50%{box-shadow:0 10px 34px rgba(255,152,48,0.44),0 0 0 2px rgba(245,183,0,0.58);} }
        @keyframes nkapOrbRipple { 0%{transform:scale(1);opacity:0.62;} 100%{transform:scale(1.62);opacity:0;} }
        @keyframes nkapMarqueeDrag { 0%{transform:scale(0.08,0.08);opacity:0.4;} 100%{transform:scale(1,1);opacity:1;} }
        @keyframes nkapPulseWave { 0%,100%{transform:scaleY(0.45);} 50%{transform:scaleY(1.15);} }
        @keyframes nkapBarGrow { 0%{transform:scaleX(0);} 100%{transform:scaleX(1);} }
        .nkap-write-char { display:inline-block;opacity:0;transition:opacity 0.08s ease-out;white-space:pre; }
        .nkap-write-char.visible { opacity:1; }
        .nkap-word { display:inline-block;opacity:0;transform:translateY(3px);transition:opacity 0.13s ease-out,transform 0.13s ease-out;margin-right:0.28em; }
        .nkap-word.visible { opacity:1;transform:translateY(0); }
        #nkap-bubble:hover { transform:scale(1.09); }
        #nkap-bubble[data-state="speaking"] { filter:drop-shadow(0 0 16px rgba(245,183,0,0.65)) drop-shadow(0 2px 8px rgba(15,23,42,0.35)); }
        #nkap-bubble[data-state="thinking"] { filter:drop-shadow(0 0 14px rgba(255,159,28,0.55)) drop-shadow(0 2px 6px rgba(15,23,42,0.3)); }
        #nkap-bubble[data-state="listening"] { filter:drop-shadow(0 0 16px rgba(255,92,119,0.7)) drop-shadow(0 2px 8px rgba(15,23,42,0.35)); }
        .nkap-choice-btn {
          display:flex;align-items:center;gap:10px;width:100%;text-align:left;
          background:rgba(255,255,255,0.07);color:#F8FAFC;border:1.5px solid rgba(245,183,0,0.45);
          border-radius:12px;padding:9px 13px;font-family:'Andika',system-ui,sans-serif;font-size:14px;
          font-weight:700;cursor:pointer;transition:background 0.14s ease,transform 0.12s ease;
        }
        .nkap-choice-btn:hover { background:rgba(245,183,0,0.22);transform:translateX(3px); }
        .nkap-chip-btn {
          display:flex;align-items:center;gap:9px;width:100%;text-align:left;
          background:linear-gradient(135deg,rgba(255,214,130,0.08),rgba(255,255,255,0.04));
          color:#FEF3C7;border:1px solid rgba(245,183,0,0.2);
          border-radius:12px;padding:9px 12px;font-family:'Andika',system-ui,sans-serif;font-size:13px;
          cursor:pointer;transition:background 0.16s ease,border-color 0.16s ease,transform 0.14s ease,box-shadow 0.16s ease;
          animation:nkapChipIn 0.24s cubic-bezier(0.22,1,0.36,1) both;
        }
        .nkap-chip-btn:hover {
          background:linear-gradient(135deg,rgba(245,183,0,0.22),rgba(255,140,66,0.14));
          border-color:rgba(245,183,0,0.62);transform:translateX(3px);
          box-shadow:0 4px 16px rgba(245,183,0,0.16);
        }
        .nkap-quick-pill {
          background:rgba(245,183,0,0.1);color:#FDE68A;border:1px solid rgba(245,183,0,0.28);
          border-radius:999px;padding:4px 10px;font-size:11.5px;font-family:'Andika',system-ui,sans-serif;
          cursor:pointer;transition:background 0.15s ease,border-color 0.15s ease,transform 0.12s ease;
          white-space:nowrap;
        }
        .nkap-quick-pill:hover { background:rgba(245,183,0,0.24);border-color:rgba(245,183,0,0.68);transform:translateY(-1px); }
      `;
      document.head.appendChild(style);
    }

    function svgEl(tag, attrs) {
      const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
      for (const k in attrs) n.setAttribute(k, attrs[k]);
      return n;
    }

    function ensureLayers() {
      injectStyles();
      if (svg && capLayer && cursorEl && hostEl && hostEl.isConnected) return;

      hostEl = document.createElement("div");
      hostEl.id = "nkap-overlay-host";
      hostEl.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646;overflow:hidden;";

      const NS_SVG = "http://www.w3.org/2000/svg";
      svg = document.createElementNS(NS_SVG, "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.style.cssText = "display:block;width:100%;height:100%;overflow:visible;";
      hostEl.appendChild(svg);

      cursorEl = document.createElement("div");
      cursorEl.id = "nkap-cursor-buddy";
      cursorEl.style.cssText =
        "position:fixed;left:0;top:0;width:24px;height:24px;pointer-events:none;z-index:2147483647;" +
        "opacity:0;transform:translate(-40px,-40px);transition:opacity 0.18s ease,transform 0.2s cubic-bezier(0.22,1,0.36,1);" +
        "filter:drop-shadow(0 3px 8px rgba(0,0,0,0.55));";
      const curSvg = document.createElementNS(NS_SVG, "svg");
      curSvg.setAttribute("viewBox", "0 0 24 24");
      curSvg.setAttribute("width", "24");
      curSvg.setAttribute("height", "24");
      cursorPathEl = document.createElementNS(NS_SVG, "path");
      cursorPathEl.setAttribute("d", "M2.5 2.5 L20.5 10.2 L12.2 13.4 L9.2 21.2 Z");
      cursorPathEl.setAttribute("fill", "#F5B700");
      cursorPathEl.setAttribute("stroke", "#FFFFFF");
      cursorPathEl.setAttribute("stroke-width", "1.8");
      cursorPathEl.setAttribute("stroke-linejoin", "round");
      curSvg.appendChild(cursorPathEl);
      cursorEl.appendChild(curSvg);
      hostEl.appendChild(cursorEl);

      statusPillEl = document.createElement("div");
      statusPillEl.id = "nkap-status-pill";
      statusPillEl.style.cssText =
        "position:fixed;top:12px;left:50%;transform:translateX(-50%);background:rgba(10,14,22,0.92);" +
        "color:#F8FAFC;border:1px solid rgba(255,255,255,0.14);border-radius:999px;padding:5px 15px;" +
        "font-family:'Andika',system-ui,sans-serif;font-size:12.5px;font-weight:700;display:none;" +
        "align-items:center;gap:10px;box-shadow:0 8px 24px rgba(0,0,0,0.45);z-index:2147483647;" +
        "pointer-events:none;backdrop-filter:blur(8px);";
      hostEl.appendChild(statusPillEl);

      capLayer = document.createElement("div");
      capLayer.id = "nkap-caption";
      capLayer.style.cssText =
        "position:fixed;left:50%;bottom:12px;transform:translateX(-50%);max-width:min(680px,calc(100vw - 140px));" +
        "z-index:2147483647;background:rgba(10,14,22,0.78);backdrop-filter:blur(6px);" +
        "border:1px solid rgba(255,255,255,0.12);color:#FFFFFF;border-radius:999px;padding:7px 22px;" +
        "font-family:'Andika',system-ui,sans-serif;font-size:18px;line-height:1.35;text-align:center;" +
        "text-shadow:0 2px 8px rgba(0,0,0,0.95);box-shadow:0 6px 20px rgba(0,0,0,0.35);" +
        "pointer-events:none;display:none;opacity:0;transition:opacity 0.16s ease;";

      document.documentElement.appendChild(hostEl);
      document.documentElement.appendChild(capLayer);

      window.addEventListener("scroll", repositionAll, { passive: true, capture: true });
      window.addEventListener("resize", repositionAll, { passive: true });
    }

    function moveCursor(x, y, color = "#F5B700", instant = false) {
      ensureLayers();
      if (!cursorEl) return;
      if (cursorPathEl && color) cursorPathEl.setAttribute("fill", color);
      cursorEl.style.transition = instant
        ? "opacity 0.14s ease"
        : "opacity 0.16s ease, transform 0.2s cubic-bezier(0.22,1,0.36,1)";
      cursorEl.style.opacity = "1";
      cursorEl.style.transform = `translate(${(x - 2).toFixed(1)}px, ${(y - 2).toFixed(1)}px)`;
    }

    function hideCursor() {
      if (cursorEl) cursorEl.style.opacity = "0";
    }

    function isVoiceActiveNow() {
      try {
        if (global.NKAP_ASSISTANT && typeof global.NKAP_ASSISTANT.isSpeaking === "function" && global.NKAP_ASSISTANT.isSpeaking()) {
          return true;
        }
        if (typeof window !== "undefined" && "speechSynthesis" in window && window.speechSynthesis.speaking) {
          return true;
        }
      } catch (_) { }
      return false;
    }

    function findFallbackSandboxRoot() {
      const p = (typeof location !== "undefined" && location.pathname ? location.pathname : "").toLowerCase();
      if (!p.includes("/sandbox/")) return null;
      if (p.includes("/sandbox/channel/mobile")) {
        return document.querySelector('[class*="rounded-[1.8rem]"]') || document.querySelector('[class*="rounded-[2.5rem]"]');
      }
      if (p.includes("/sandbox/ussd")) {
        const scr = document.querySelector('[class*="bg-emerald-950"]');
        return (scr && scr.closest('[class*="rounded-[2rem]"]')) || scr || null;
      }
      if (p.includes("/sandbox/channel/web")) {
        const SIDEBAR_CTRL_RE = /Lecture vocale|Diagnostics de traduction|Nouvelle session|Langue annoncée/i;
        const addrEl = Array.from(document.querySelectorAll("div, span, p")).find(
          (el) =>
            !el.querySelector("div, section, main, article, header, aside") &&
            /banque-demo\.sandbox/i.test(el.textContent || "")
        );
        if (addrEl) {
          let cur = addrEl.parentElement;
          for (let i = 0; i < 8 && cur && cur !== document.body; i++, cur = cur.parentElement) {
            const r = cur.getBoundingClientRect();
            if (r.width >= 420 && r.height >= 280 && !SIDEBAR_CTRL_RE.test(cur.textContent || "")) {
              return cur;
            }
          }
        }
      }
      return null;
    }

    function getFrameBounds() {
      let root = null;
      if (typeof global.NKAP_GET_SANDBOX_ROOT === "function") {
        try {
          root = global.NKAP_GET_SANDBOX_ROOT();
        } catch (_) { }
      }
      if (!root) root = findFallbackSandboxRoot();
      if (!root) {
        const sim = document.querySelector("[data-nkap-channel]");
        if (sim && sim.getBoundingClientRect().width >= 260) root = sim;
      }
      if (root && root.getBoundingClientRect) {
        const r = root.getBoundingClientRect();
        if (r.width >= 240 && r.height >= 240) {
          const isMobileFrame = r.width < 450;
          return {
            inFrame: true,
            isMobile: isMobileFrame,
            left: Math.max(4, r.left),
            top: Math.max(4, r.top),
            right: Math.min(window.innerWidth - 4, r.right),
            bottom: Math.min(window.innerHeight - 4, r.bottom),
            width: r.width,
            height: r.height,
          };
        }
      }
      return {
        inFrame: false,
        isMobile: window.innerWidth < 520,
        left: 8,
        top: 64,
        right: window.innerWidth - 8,
        bottom: window.innerHeight - 8,
        width: window.innerWidth - 16,
        height: window.innerHeight - 72,
      };
    }

    function getOrbHomePosition() {
      const fb = getFrameBounds();
      orbSizePx = fb.isMobile ? 58 : (fb.inFrame ? 64 : 74);
      const minX = fb.left + 6;
      const maxX = Math.max(minX, fb.right - orbSizePx - 6);
      const minY = fb.top + (fb.inFrame && fb.isMobile ? 26 : 4);
      const maxY = Math.max(minY, fb.bottom - orbSizePx - 8);

      if (userHomeRel) {
        const x = minX + userHomeRel.rx * Math.max(0, maxX - minX);
        const y = minY + userHomeRel.ry * Math.max(0, maxY - minY);
        return {
          x: Math.max(minX, Math.min(maxX, x)),
          y: Math.max(minY, Math.min(maxY, y)),
          size: orbSizePx,
          fb,
        };
      }

      const padR = fb.isMobile ? 8 : (fb.inFrame ? 16 : 14);
      // Dans la frame web : sous la barre d'adresse et le bouton Wog ; dans mobile : sous la barre 09:41
      const padT = fb.inFrame ? (fb.isMobile ? 28 : 104) : 6;
      const x = Math.max(minX, Math.min(maxX, fb.right - orbSizePx - padR));
      const y = Math.max(minY, Math.min(maxY, fb.top + padT));
      return { x, y, size: orbSizePx, fb };
    }

    function syncFrameAnchoredChrome() {
      const fb = getFrameBounds();
      if (statusPillEl) {
        if (fb.inFrame) {
          const cx = Math.round(fb.left + fb.width / 2);
          const topY = Math.round(fb.top + (fb.isMobile ? 34 : 10));
          const maxW = Math.round(Math.max(140, fb.width - (fb.isMobile ? 28 : 40)));
          statusPillEl.style.left = `${cx}px`;
          statusPillEl.style.top = `${topY}px`;
          statusPillEl.style.maxWidth = `${maxW}px`;
          statusPillEl.style.fontSize = fb.isMobile ? "11px" : "12px";
          statusPillEl.style.padding = fb.isMobile ? "4px 11px" : "5px 14px";
          statusPillEl.style.whiteSpace = "nowrap";
          statusPillEl.style.overflow = "hidden";
          statusPillEl.style.textOverflow = "ellipsis";
        } else {
          statusPillEl.style.left = "50%";
          statusPillEl.style.top = "12px";
          statusPillEl.style.maxWidth = "calc(100vw - 32px)";
          statusPillEl.style.fontSize = "12.5px";
          statusPillEl.style.padding = "5px 15px";
        }
      }
      if (capLayer) {
        if (fb.inFrame) {
          const cx = Math.round(fb.left + fb.width / 2);
          const maxW = Math.round(Math.max(196, fb.width - (fb.isMobile ? 18 : 36)));
          const bottomPx = Math.max(8, Math.round(window.innerHeight - fb.bottom + (fb.isMobile ? 54 : 14)));
          capLayer.style.left = `${cx}px`;
          capLayer.style.bottom = `${bottomPx}px`;
          capLayer.style.maxWidth = `${maxW}px`;
          capLayer.style.width = fb.isMobile ? `${maxW}px` : "auto";
          capLayer.style.boxSizing = "border-box";
          capLayer.style.borderRadius = fb.isMobile ? "14px" : "18px";
          capLayer.style.fontSize = fb.isMobile ? "12.5px" : "15px";
          capLayer.style.padding = fb.isMobile ? "7px 12px" : "8px 18px";
          capLayer.style.lineHeight = "1.32";
        } else {
          capLayer.style.left = "50%";
          capLayer.style.bottom = "14px";
          capLayer.style.width = "auto";
          capLayer.style.maxWidth = "min(640px, calc(100vw - 80px))";
          capLayer.style.boxSizing = "border-box";
          capLayer.style.borderRadius = "18px";
          capLayer.style.fontSize = "16.5px";
          capLayer.style.padding = "8px 20px";
          capLayer.style.lineHeight = "1.34";
        }
      }
      const nb = document.getElementById("nkap-notebook");
      if (nb && fb.inFrame) {
        const margin = fb.isMobile ? 9 : 14;
        const nbW = Math.min(nb.offsetWidth || 320, Math.max(200, fb.width - margin * 2));
        const curL = parseFloat(nb.style.left) || fb.left + margin;
        const curT = parseFloat(nb.style.top) || fb.top + 60;
        const nbH = nb.offsetHeight || 180;
        const minL = fb.left + margin;
        const maxL = Math.max(minL, fb.right - nbW - margin);
        const minT = fb.top + (fb.isMobile ? 62 : 46);
        const maxT = Math.max(minT, fb.bottom - nbH - (fb.isMobile ? 108 : 74));
        nb.style.maxWidth = `${Math.round(fb.width - margin * 2)}px`;
        nb.style.left = `${Math.round(Math.max(minL, Math.min(maxL, curL)))}px`;
        nb.style.top = `${Math.round(Math.max(minT, Math.min(maxT, curT)))}px`;
      }
    }

    function positionPanelUnderOrb() {
      if (!panelEl || !bubbleEl) return;
      const fb = getFrameBounds();
      const bRect = bubbleEl.getBoundingClientRect();
      const panelW = fb.inFrame
        ? Math.min(346, Math.max(210, fb.width - 16))
        : Math.min(352, window.innerWidth - 32);
      panelEl.style.width = `${panelW}px`;

      let left = bRect.right - panelW;
      if (left < fb.left + 8) left = bRect.left;
      left = Math.max(fb.left + 8, Math.min(fb.right - panelW - 8, left));

      const spaceBelow = fb.bottom - bRect.bottom - 14;
      const spaceAbove = bRect.top - fb.top - 14;
      if (spaceBelow < 220 && spaceAbove > spaceBelow) {
        const maxH = Math.max(200, spaceAbove);
        const estH = Math.min(maxH, panelEl.offsetHeight || 340);
        const top = Math.max(fb.top + 8, bRect.top - estH - 10);
        panelEl.style.left = `${Math.round(left)}px`;
        panelEl.style.right = "auto";
        panelEl.style.top = `${Math.round(top)}px`;
        panelEl.style.maxHeight = `${Math.round(maxH)}px`;
      } else {
        const top = Math.min(fb.bottom - 180, bRect.bottom + 10);
        const maxH = Math.max(200, fb.bottom - top - 12);
        panelEl.style.left = `${Math.round(left)}px`;
        panelEl.style.right = "auto";
        panelEl.style.top = `${Math.round(top)}px`;
        panelEl.style.maxHeight = `${Math.round(maxH)}px`;
      }
    }

    function applyOrbCoords(x, y, size) {
      if (!bubbleEl) return;
      bubbleEl.style.width = `${size}px`;
      bubbleEl.style.height = `${size}px`;
      bubbleEl.style.left = `${Math.round(x)}px`;
      bubbleEl.style.top = `${Math.round(y)}px`;
      bubbleEl.style.right = "auto";
      const cvs = bubbleEl.querySelector("canvas");
      if (cvs) {
        cvs.style.width = `${size}px`;
        cvs.style.height = `${size}px`;
      }
      if (panelEl && panelEl.style.display === "flex") {
        positionPanelUnderOrb();
      }
    }

    function returnOrbHome() {
      orbFloatingTarget = null;
      if (!bubbleEl) return;
      const home = getOrbHomePosition();
      applyOrbCoords(home.x, home.y, home.size);
    }

    function floatOrbNear(targetEl) {
      if (!bubbleEl || !targetEl || !targetEl.getBoundingClientRect) return;
      // Ne déplace pas l'orbe si le panneau chat est actuellement ouvert
      if (panelEl && panelEl.style.display === "flex") return;
      const fb = getFrameBounds();
      const tr = targetEl.getBoundingClientRect();
      if (tr.width < 2 || tr.height < 2) return;
      orbFloatingTarget = targetEl;
      const sz = fb.isMobile ? 58 : 74;
      const occupied = getOccupiedBoxes();

      // Candidats autour de l'élément expliqué (à droite, haut-droite, à gauche, bas-droite) — strictement dans la frame !
      const cands = [
        { x: tr.right + 14, y: tr.top + tr.height / 2 - sz / 2 },
        { x: tr.right - sz * 0.4, y: tr.top - sz - 10 },
        { x: tr.left - sz - 14, y: tr.top + tr.height / 2 - sz / 2 },
        { x: tr.right + 10, y: tr.bottom + 8 },
        { x: fb.right - sz - 10, y: tr.top + tr.height / 2 - sz / 2 },
      ];

      const overlapArea = (ax, ay, aw, ah, bx, by, bw, bh) => {
        const ox = Math.max(0, Math.min(ax + aw, bx + bw) - Math.max(ax, bx));
        const oy = Math.max(0, Math.min(ay + ah, by + bh) - Math.max(ay, by));
        return ox * oy;
      };

      let best = null;
      let bestPenalty = Infinity;
      for (const c of cands) {
        const cx = Math.max(fb.left + 8, Math.min(fb.right - sz - 8, c.x));
        const cy = Math.max(fb.top + 8, Math.min(fb.bottom - sz - 14, c.y));
        let penalty = overlapArea(cx, cy, sz, sz, tr.left - 6, tr.top - 6, tr.width + 12, tr.height + 12) * 5;
        for (const b of occupied) {
          penalty += overlapArea(cx, cy, sz, sz, b.x - 4, b.y - 4, b.w + 8, b.h + 8) * 3;
        }
        // Préfère un déplacement visible mais doux
        penalty += Math.hypot(cx - c.x, cy - c.y) * 0.5;
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          best = { x: cx, y: cy };
        }
      }
      if (best) applyOrbCoords(best.x, best.y, sz);
    }

    function setOrbLabelVisible(visible) {
      if (!orbTagEl) return;
      orbTagEl.style.opacity = visible ? "1" : "0";
      orbTagEl.style.transform = visible ? "translate(-50%, 0) scale(1)" : "translate(-50%, -4px) scale(0.85)";
    }

    function setOrbState(mode) {
      orbState = mode || "idle";
      if (bubbleEl) {
        bubbleEl.setAttribute("data-state", orbState);
      }
      // Affiche aussi brièvement le nom si réveillé par la voix en mode écoute
      if (orbState === "listening") setOrbLabelVisible(true);
    }

    function setStatusPill(mode, labelText) {
      ensureLayers();
      // Synchronise automatiquement la pulsation de l'orbe neuronal Jarvis avec l'état vocal/cerveau !
      if (!mode) {
        setOrbState("idle");
      } else if (mode === "listening") {
        setOrbState("listening");
      } else if (labelText && /cerveau|réfléch|en cours/i.test(labelText)) {
        setOrbState("thinking");
      } else {
        setOrbState("speaking");
      }
      if (!statusPillEl) return;
      if (!mode) {
        statusPillEl.style.display = "none";
        statusPillEl.innerHTML = "";
        return;
      }
      const accent = mode === "listening" ? "#FF5C77" : "#F5B700";
      syncFrameAnchoredChrome();
      statusPillEl.style.display = "inline-flex";
      statusPillEl.innerHTML = `
        <span style="width:7px;height:7px;border-radius:50%;background:${accent};box-shadow:0 0 10px ${accent};"></span>
        <span>${labelText || (mode === "listening" ? "Écoute…" : "Parle…")}</span>
        <span style="display:inline-flex;align-items:center;gap:2.5px;height:12px;">
          <span style="width:2.5px;height:10px;background:${accent};border-radius:2px;animation:nkapPulseWave 0.55s infinite ease-in-out;"></span>
          <span style="width:2.5px;height:13px;background:${accent};border-radius:2px;animation:nkapPulseWave 0.55s infinite 0.15s ease-in-out;"></span>
          <span style="width:2.5px;height:8px;background:${accent};border-radius:2px;animation:nkapPulseWave 0.55s infinite 0.3s ease-in-out;"></span>
        </span>`;
    }

    function resolveInk(colorName, targetEl) {
      if (colorName === "red") return PALETTE.red;
      if (colorName === "yellow") return PALETTE.yellow;
      if (colorName === "green") return PALETTE.green;
      if (colorName === "cyan") return PALETTE.cyan;
      const tone = rules() ? rules().detectTone(targetEl) : "light";
      return tone === "dark" ? PALETTE.inkDark : PALETTE.inkLight;
    }

    function rectOf(el) {
      if (!el) return { x: 80, y: 120, w: 120, h: 32, cx: 140, cy: 136 };
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }

    function getOccupiedBoxes() {
      const boxes = [];
      for (const [, m] of marks) {
        if (m.dom && m.node) {
          for (const n of m.node) {
            if (n && n.getBoundingClientRect) {
              const r = n.getBoundingClientRect();
              if (r.width > 4 && r.height > 4) boxes.push({ x: r.left, y: r.top, w: r.width, h: r.height });
            }
          }
        }
      }
      return boxes;
    }

    function removeMarkImmediate(id) {
      const m = marks.get(id);
      if (!m) return;
      if (m.timers) m.timers.forEach((t) => clearTimeout(t));
      if (m.node) m.node.forEach((n) => n && n.remove && n.remove());
      marks.delete(id);
      if (activeCursorMarkId === id) activeCursorMarkId = null;
      if (rules()) rules().onMarkRemoved(id);
    }

    function enforceMarkBudget(id) {
      if (marks.has(id)) removeMarkImmediate(id);
      if (!rules()) return;
      const evicted = rules().onMarkAdded(id);
      evicted.forEach((oldId) => removeMarkImmediate(oldId));
    }

    function addStroke(id, main, head, strokeColor, drawMs, anchorEl, baseRect, strokeWidth = 4.0, opacity = 0.96, extraNodes = []) {
      ensureLayers();
      enforceMarkBudget(id);
      const created = [...extraNodes];

      const makePath = (pathObj, w, col, op, delay = 0) => {
        const len = Math.max(1, pathObj.len || 1);
        const outline = svgEl("path", {
          d: pathObj.d,
          fill: "none",
          stroke: "rgba(255,255,255,0.45)",
          "stroke-width": String(w + 3),
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-dasharray": `${len} ${len + 12}`,
          "stroke-dashoffset": String(len),
          opacity: "0",
          "data-nkap": id,
        });
        const p = svgEl("path", {
          d: pathObj.d,
          fill: "none",
          stroke: col,
          "stroke-width": String(w),
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-dasharray": `${len} ${len + 12}`,
          "stroke-dashoffset": String(len),
          opacity: "0",
          "data-nkap": id,
        });
        svg.appendChild(outline);
        svg.appendChild(p);
        created.push(outline, p);
        return { p, outline, len, delay, targetOp: op };
      };

      const mainObj = makePath(main, strokeWidth, strokeColor, opacity, 0);
      marks.set(id, {
        node: created,
        mainPath: mainObj.p,
        strokePairs: [mainObj],
        strokeColor,
        startedAt: performance.now(),
        drawMs: Math.max(120, drawMs),
        len: mainObj.len,
        dom: false,
        anchorEl,
        baseRect,
        dx: 0,
        dy: 0,
      });

      if (head && head.d) {
        const headObj = makePath(head, strokeWidth * 0.92, strokeColor, opacity, drawMs * 0.78);
        marks.get(id).strokePairs.push(headObj);
      }

      animate();
    }

    function animate() {
      if (raf) return;
      const step = () => {
        const now = performance.now();
        let live = false;
        let latestCursorPt = null;
        let latestColor = "#F5B700";

        let activeCursorMark = null;
        if (activeCursorMarkId && marks.has(activeCursorMarkId)) {
          const m = marks.get(activeCursorMarkId);
          const rawT = (now - m.startedAt) / (m.drawMs || 1);
          if (rawT >= 0 && rawT <= 1.02) activeCursorMark = m;
          else activeCursorMarkId = null;
        }

        for (const [id, m] of marks) {
          if (!m.strokePairs) continue;
          for (const sp of m.strokePairs) {
            const rawT = (now - (m.startedAt + sp.delay)) / (sp.delay > 0 ? Math.max(160, m.drawMs * 0.35) : m.drawMs);
            const t = Math.min(1, Math.max(0, rawT));
            const eased = 1 - Math.pow(1 - t, 1.65);
            const offset = (1 - eased) * sp.len;
            sp.p.setAttribute("stroke-dashoffset", offset.toFixed(1));
            sp.outline.setAttribute("stroke-dashoffset", offset.toFixed(1));
            if (rawT >= 0) {
              sp.p.setAttribute("opacity", String(sp.targetOp));
              sp.outline.setAttribute("opacity", String(sp.targetOp * 0.55));
            }
          }
          const rawT = (now - m.startedAt) / (m.drawMs || 1);
          if (!activeCursorMarkId && m.mainPath && rawT >= 0 && rawT <= 1.02) {
            activeCursorMarkId = id;
            activeCursorMark = m;
          }
          if (now < m.startedAt + m.drawMs + 280) live = true;
        }

        if (activeCursorMark && activeCursorMark.mainPath) {
          const rawT = (now - activeCursorMark.startedAt) / (activeCursorMark.drawMs || 1);
          const t = Math.min(1, Math.max(0, rawT));
          const eased = 1 - Math.pow(1 - t, 1.65);
          try {
            const pt = activeCursorMark.mainPath.getPointAtLength(
              Math.max(0, Math.min(activeCursorMark.len, eased * activeCursorMark.len))
            );
            latestCursorPt = { x: pt.x + (activeCursorMark.dx || 0), y: pt.y + (activeCursorMark.dy || 0) };
            latestColor = activeCursorMark.strokeColor || "#F5B700";
          } catch (_) { }
        }

        if (latestCursorPt) moveCursor(latestCursorPt.x, latestCursorPt.y, latestColor, true);
        if (live) raf = requestAnimationFrame(step);
        else raf = null;
      };
      raf = requestAnimationFrame(step);
    }

    function pruneDetachedMarks() {
      let removedAny = false;
      for (const [id, m] of Array.from(marks.entries())) {
        if (!m.anchorEl) continue;
        if (!m.anchorEl.isConnected) {
          removeMarkImmediate(id);
          removedAny = true;
          continue;
        }
        try {
          const r = m.anchorEl.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) {
            removeMarkImmediate(id);
            removedAny = true;
          }
        } catch (_) {
          removeMarkImmediate(id);
          removedAny = true;
        }
      }
      if (removedAny && marks.size === 0) {
        hideCursor();
      }
    }

    function repositionAll() {
      syncFrameAnchoredChrome();
      pruneDetachedMarks();
      for (const [, m] of marks) {
        if (!m.anchorEl || !m.baseRect || !m.anchorEl.isConnected) continue;
        const cur = m.anchorEl.getBoundingClientRect();
        const dx = cur.left - m.baseRect.left;
        const dy = cur.top - m.baseRect.top;
        m.dx = dx;
        m.dy = dy;
        if (m.dom) {
          m.node.forEach((n) => {
            if (n && n.style && n.getAttribute("data-nkap-reposition") !== "none") {
              n.style.left = `${(m.baseX + dx).toFixed(1)}px`;
              n.style.top = `${(m.baseY + dy).toFixed(1)}px`;
            }
          });
        } else {
          m.node.forEach((n) => {
            if (n && n.setAttribute && n.namespaceURI === "http://www.w3.org/2000/svg") {
              n.setAttribute("transform", `translate(${dx.toFixed(1)}, ${dy.toFixed(1)})`);
            }
          });
        }
      }
    }

    function anchored(el, fn) {
      if (!el || !el.isConnected) return;
      const r = el.getBoundingClientRect();
      if (r.top < 40 || r.bottom > window.innerHeight - 60) {
        try {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch (_) { }
        const gen = clearGen;
        const tid = setTimeout(() => {
          pendingTimers.delete(tid);
          if (gen === clearGen && el.isConnected) fn();
        }, 260);
        pendingTimers.add(tid);
      } else {
        fn();
      }
    }

    // ---- API publique des gestes (v1.1 + v1.2) -----------------------------

    const api = {
      rectOf,
      moveCursor,
      hideCursor,
      setStatusPill,
      setOnChoice(cb) {
        onChoiceCb = typeof cb === "function" ? cb : null;
      },
      setObstaclesProvider(cb) {
        getObstaclesCb = typeof cb === "function" ? cb : () => [];
      },
      setChannelProvider(cb) {
        getChannelCb = typeof cb === "function" ? cb : () => "web";
      },

      circle(el, color = "ink", drawMs = 680, id = "c_" + Date.now(), opts = {}) {
        if (opts && opts.shape === "box") return api.box(el, color, drawMs, id);
        anchored(el, () => {
          const r = rectOf(el);
          const col = resolveInk(color, el);
          const p = geom().handCircle(r.cx, r.cy, r.w / 2 + 14, r.h / 2 + 11, id);
          addStroke(id, p, null, col, drawMs, el, el.getBoundingClientRect(), 4.2);
        });
      },

      box(el, color = "ink", drawMs = 680, id = "b_" + Date.now()) {
        anchored(el, () => {
          const r = rectOf(el);
          const col = resolveInk(color, el);
          const p = geom().handBox(r.x - 10, r.y - 6, r.w + 20, r.h + 12, id);
          addStroke(id, p, null, col, drawMs, el, el.getBoundingClientRect(), 4.2);
        });
      },

      underline(el, color = "yellow", drawMs = 450, id = "u_" + Date.now()) {
        anchored(el, () => {
          const r = rectOf(el);
          const col = resolveInk(color, el);
          const p = geom().handUnderline(r.x - 4, r.y + r.h + 5, r.w + 8, id);
          addStroke(id, p, null, col, drawMs, el, el.getBoundingClientRect(), 4.8);
        });
      },

      /** NEW v1.2 : Surligneur fluo translucide (`highlight`). */
      highlight(el, color = "yellow", drawMs = 420, id = "hl_" + Date.now()) {
        anchored(el, () => {
          const r = rectOf(el);
          const col = resolveInk(color, el);
          const p = geom().handHighlight(r.x, r.y, r.w, r.h, id);
          addStroke(id, p, null, col, drawMs, el, el.getBoundingClientRect(), Math.max(18, Math.min(34, r.h + 4)), 0.34);
        });
      },

      /** NEW v1.2 : Rature manuscrite rouge (`strike`, scénario Correction). */
      strike(el, color = "red", drawMs = 360, id = "st_" + Date.now()) {
        anchored(el, () => {
          const r = rectOf(el);
          const col = resolveInk(color || "red", el);
          const p = geom().handStrike(r.x, r.y, r.w, r.h, id);
          addStroke(id, p, null, col, drawMs, el, el.getBoundingClientRect(), 4.4);
        });
      },

      /** NEW v1.2 : Coche verte ✓ tracée à côté d'une cible (`check`). */
      check(el, color = "green", drawMs = 380, id = "chk_" + Date.now()) {
        anchored(el, () => {
          const r = rectOf(el);
          const col = resolveInk(color || "green", el);
          const p = geom().handCheck(r.x + r.w + 20, r.cy, 24, id);
          addStroke(id, p, null, col, drawMs, el, el.getBoundingClientRect(), 4.6);
        });
      },

      /** NEW v1.2 : Croix rouge ✗ tracée à côté d'une cible (`cross`). */
      cross(el, color = "red", drawMs = 380, id = "crs_" + Date.now()) {
        anchored(el, () => {
          const r = rectOf(el);
          const col = resolveInk(color || "red", el);
          const p = geom().handCross(r.x + r.w + 20, r.cy, 22, id);
          addStroke(id, p.main, p.head, col, drawMs, el, el.getBoundingClientRect(), 4.4);
        });
      },

      /** NEW v1.2 : Étiquette pilule anti-collision (`nameSpot`) + flèche fine + Pointer Buddy (`callout`). */
      callout(el, label = "", color = "yellow", drawMs = 520, id = "co_" + Date.now()) {
        if (!label || (rules() && !rules().amountsPreserved(label))) return;
        ensureLayers();
        anchored(el, () => {
          const fb = getFrameBounds();
          const r = rectOf(el);
          const col = resolveInk(color || "yellow", el);
          const maxPillW = fb.inFrame ? Math.min(240, Math.max(120, fb.width - 24)) : 260;
          const estW = Math.min(maxPillW, Math.max(90, label.length * 8.6 + 26));
          const estH = 34;
          const spot = layout().findBestSpot(r, { w: estW, h: estH }, {
            bounds: fb,
            gap: fb.isMobile ? 16 : 28,
            obstacles: getObstaclesCb(),
            occupied: getOccupiedBoxes(),
          });

          const pill = document.createElement("div");
          pill.setAttribute("data-nkap", id);
          pill.style.cssText =
            `position:fixed;left:${spot.x.toFixed(1)}px;top:${spot.y.toFixed(1)}px;max-width:${maxPillW}px;` +
            `background:rgba(12,17,28,0.94);color:#F8FAFC;border:2px solid ${col};border-radius:999px;` +
            `padding:5px 14px;font-family:'Andika',system-ui,sans-serif;font-weight:700;font-size:13.5px;` +
            `box-shadow:0 10px 24px rgba(0,0,0,0.48);z-index:2147483647;pointer-events:none;` +
            `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:nkapPopIn 0.16s ease-out both;`;
          pill.textContent = label;
          document.documentElement.appendChild(pill);

          const pr = pill.getBoundingClientRect();
          const pillRect = { x: pr.left, y: pr.top, w: pr.width, h: pr.height, cx: pr.left + pr.width / 2, cy: pr.top + pr.height / 2 };
          const arrowPath = geom().handArrowBetweenRects(pillRect, r, id + "::arr", 0.16);
          addStroke(id, arrowPath.main, arrowPath.head, col, drawMs, el, el.getBoundingClientRect(), 3.2, 0.96, [pill]);
          const rec = marks.get(id);
          if (rec) {
            rec.baseX = spot.x;
            rec.baseY = spot.y;
            rec.calloutPill = pill;
          }
        });
      },

      /** NEW v1.2 : Pastille numérotée ① ② ③ (`num`) pour parcours guidé & menus USSD/GAB. */
      num(el, step = 1, label = "", color = "yellow", id = "num_" + Date.now()) {
        if (label && rules() && !rules().amountsPreserved(label)) return;
        ensureLayers();
        anchored(el, () => {
          enforceMarkBudget(id);
          const fb = getFrameBounds();
          const r = rectOf(el);
          const col = resolveInk(color || "yellow", el);
          const estW = label ? Math.min(fb.isMobile ? 140 : 180, 40 + label.length * 7.8) : 32;
          let bx = r.x - estW - 10;
          if (bx < fb.left + 6) {
            bx = r.x + r.w + 8;
          }
          if (bx + estW > fb.right - 6) {
            bx = Math.max(fb.left + 6, Math.min(fb.right - estW - 6, r.x));
          }
          const minBy = fb.top + (fb.inFrame && fb.isMobile ? 38 : 10);
          const maxBy = Math.max(minBy, fb.bottom - 38);
          const by = Math.max(minBy, Math.min(maxBy, r.cy - 14));

          const wrap = document.createElement("div");
          wrap.setAttribute("data-nkap", id);
          wrap.style.cssText =
            `position:fixed;left:${bx.toFixed(1)}px;top:${by.toFixed(1)}px;display:inline-flex;` +
            `align-items:center;gap:6px;z-index:2147483647;pointer-events:none;animation:nkapPopIn 0.16s ease-out both;`;
          const badge = document.createElement("span");
          badge.textContent = String(step);
          badge.style.cssText =
            `width:28px;height:28px;border-radius:50%;background:${col};color:#0B1220;` +
            `display:inline-flex;align-items:center;justify-content:center;font-family:'Andika',system-ui,sans-serif;` +
            `font-weight:700;font-size:15px;border:2px solid #FFFFFF;box-shadow:0 4px 12px rgba(0,0,0,0.45);`;
          wrap.appendChild(badge);
          if (label) {
            const tag = document.createElement("span");
            tag.textContent = label;
            tag.style.cssText =
              `background:rgba(12,17,28,0.92);color:#F8FAFC;border:1.5px solid ${col};border-radius:999px;` +
              `padding:3px 10px;font-family:'Andika',system-ui,sans-serif;font-weight:700;font-size:12.5px;`;
            wrap.appendChild(tag);
          }
          document.documentElement.appendChild(wrap);
          moveCursor(bx + 14, by + 14, col, false);

          marks.set(id, {
            node: [wrap],
            startedAt: performance.now(),
            drawMs: 180,
            dom: true,
            anchorEl: el,
            baseRect: el.getBoundingClientRect(),
            baseX: bx,
            baseY: by,
          });
        });
      },

      /** NEW v1.2 : Met à jour une marque existante par son ID sans effacer la scène (`edit`). */
      edit(id, patch = {}) {
        const m = marks.get(id);
        if (!m) return false;
        const newText = patch.label || patch.text;
        if (newText && rules() && !rules().amountsPreserved(newText)) return false;
        if (m.calloutPill && newText) {
          m.calloutPill.textContent = newText;
          if (patch.color) m.calloutPill.style.borderColor = resolveInk(patch.color, m.anchorEl);
          return true;
        }
        if (m.dom && m.node[0] && newText) {
          m.node[0].textContent = newText;
          return true;
        }
        return false;
      },

      arrow(elFrom, elTo, color = "ink", drawMs = 760, id = "a_" + Date.now()) {
        anchored(elFrom, () =>
          anchored(elTo, () => {
            const a = rectOf(elFrom);
            const b = rectOf(elTo);
            const col = resolveInk(color, elFrom);
            const pageAnchor = elFrom.closest && elFrom.closest("#nkap-notebook") ? elTo : elFrom;
            const p = geom().handArrowBetweenRects(a, b, id, 0.14);
            addStroke(id, p.main, p.head, col, drawMs, pageAnchor, pageAnchor.getBoundingClientRect(), 3.8);
          })
        );
      },

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
            `box-shadow:0 0 0 3px rgba(255,59,92,0.12);animation:nkapMarqueeDrag 0.18s cubic-bezier(0.16,1,0.3,1) both;`;

          for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const h = document.createElement("div");
            h.style.cssText =
              `position:absolute;width:7px;height:7px;background:#FFFFFF;border:2px solid #FF3B5C;border-radius:1.5px;box-sizing:border-box;` +
              `${sx ? "right:-4.5px" : "left:-4.5px"};${sy ? "bottom:-4.5px" : "top:-4.5px"};`;
            div.appendChild(h);
          }

          if (label) {
            const fb = getFrameBounds();
            const chip = document.createElement("div");
            chip.textContent = label;
            const placeTop = (baseX - fb.left) < 130;
            chip.style.cssText =
              (placeTop
                ? "position:absolute;left:50%;top:-10px;transform:translate(-50%,-100%);"
                : "position:absolute;left:-10px;top:50%;transform:translate(-100%,-50%);") +
              "background:#FF3B5C;color:#FFFFFF;border-radius:999px;padding:3px 11px;" +
              "font-family:'Andika',system-ui,sans-serif;font-weight:700;font-size:13px;white-space:nowrap;" +
              "box-shadow:0 4px 12px rgba(255,59,92,0.4);";
            div.appendChild(chip);
          }

          document.documentElement.appendChild(div);
          moveCursor(baseX + boxW, baseY + boxH, "#FF3B5C", false);

          marks.set(id, {
            node: [div],
            startedAt: performance.now(),
            drawMs: 180,
            dom: true,
            anchorEl: el,
            baseRect: el.getBoundingClientRect(),
            baseX,
            baseY,
          });
        });
      },

      write(text, el, opts = {}, id = "w_" + Date.now()) {
        if (!text || (rules() && !rules().amountsPreserved(text))) return;
        ensureLayers();
        anchored(el, () => {
          enforceMarkBudget(id);
          const r = rectOf(el);
          const baseX = r.cx + (opts.dx ?? 0);
          const baseY = r.y + (opts.dy ?? -44);
          const strokeColor = resolveInk(opts.color || "ink", el);
          const perLetterMs = opts.perLetterMs || 48;

          const container = document.createElement("div");
          container.setAttribute("data-nkap", id);
          container.style.cssText =
            `position:fixed;left:${baseX}px;top:${baseY}px;transform:translate(-50%,0);` +
            `font-family:'Andika',system-ui,sans-serif;font-weight:700;color:${strokeColor};` +
            `font-size:${opts.size || 24}px;white-space:nowrap;z-index:2147483647;pointer-events:none;` +
            `text-shadow:0 2px 6px rgba(0,0,0,0.75);`;

          const rand = geom().seeded(id + "::" + text);
          const timers = [];
          Array.from(String(text)).forEach((ch, idx) => {
            const s = document.createElement("span");
            s.className = "nkap-write-char";
            s.textContent = ch;
            s.style.transform = `translateY(${((rand() - 0.5) * 2.2).toFixed(1)}px) rotate(${((rand() - 0.5) * 5.8).toFixed(2)}deg)`;
            container.appendChild(s);
            timers.push(setTimeout(() => s.classList.add("visible"), idx * perLetterMs));
          });

          document.documentElement.appendChild(container);
          moveCursor(baseX, baseY, strokeColor, false);

          marks.set(id, {
            node: [container],
            timers,
            startedAt: performance.now(),
            drawMs: text.length * perLetterMs,
            dom: true,
            anchorEl: el,
            baseRect: el.getBoundingClientRect(),
            baseX,
            baseY,
          });
        });
      },

      /**
       * Ardoise vitrée modulaire v1.2 (`notebook`) :
       * Modes : `lines` (défaut) | `flow` | `bars` | `table` | `choices`
       */
      notebook(config = {}, id = config.id || "nb_" + Date.now()) {
        ensureLayers();
        if (rules() && !rules().validateActionAmounts(config)) return;

        const mode = config.mode || (config.flow_steps ? "flow" : config.bars ? "bars" : config.columns ? "table" : config.choices ? "choices" : "lines");
        const pageAnchor = config.anchorEl || null;

        const renderCard = () => {
          enforceMarkBudget(id);
          const timers = [];
          const fb = getFrameBounds();
          const nbMargin = fb.inFrame ? (fb.isMobile ? 18 : 28) : 28;
          const availW = fb.inFrame ? fb.width : window.innerWidth;
          const width = Math.min(config.width || 380, Math.max(200, availW - nbMargin));
          const targetRect = pageAnchor ? rectOf(pageAnchor) : null;
          const spot = layout().findCardSpot(targetRect, { w: width, h: fb.isMobile ? 200 : 240 }, {
            bounds: fb,
            channel: fb.isMobile ? "mobile" : getChannelCb(),
            obstacles: getObstaclesCb(),
            occupied: getOccupiedBoxes(),
            safeTop: fb.inFrame && fb.isMobile ? 64 : 52,
            safeBottom: fb.inFrame && fb.isMobile ? 112 : 82,
          });

          const card = document.createElement("div");
          card.id = "nkap-notebook";
          card.setAttribute("data-nkap", id);
          card.setAttribute("data-nkap-mode", mode);
          const nbPad = fb.isMobile ? "15px 15px 14px 15px" : "22px 22px 20px 22px";
          card.style.cssText =
            `position:fixed;left:${spot.x.toFixed(1)}px;top:${spot.y.toFixed(1)}px;width:${spot.w}px;max-width:${Math.round(availW - nbMargin)}px;` +
            `background:rgba(12,17,28,0.92);backdrop-filter:blur(12px);color:#F8FAFC;border-radius:16px;` +
            `padding:${nbPad};box-sizing:border-box;font-family:'Andika',system-ui,sans-serif;` +
            `box-shadow:0 22px 50px rgba(0,0,0,0.62);z-index:2147483646;pointer-events:auto;` +
            `animation:nkapPopIn 0.16s ease-out both;`;

          const closeBtn = document.createElement("div");
          closeBtn.style.cssText = "position:absolute;top:12px;right:14px;display:flex;gap:6px;cursor:pointer;";
          closeBtn.innerHTML =
            '<span style="width:9px;height:9px;border:1.6px solid rgba(248,250,252,0.55);border-radius:2px;"></span>' +
            '<span style="width:9px;height:9px;border:1.6px solid rgba(255,107,139,0.8);border-radius:2px;"></span>';
          closeBtn.addEventListener("click", () => api.hide(id));
          card.appendChild(closeBtn);

          const noteSvg = svgEl("svg", { width: "100%", height: "100%" });
          noteSvg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;";
          card.appendChild(noteSvg);

          // Helper HeyClicky : écrit un texte lettre par lettre dans un élément DOM
          let typeCursorMs = 240;
          const typeInto = (el, fullText, msPerChar = 16) => {
            const str = String(fullText || "");
            el.textContent = "";
            if (!str) return;
            const start = typeCursorMs;
            const step = Math.max(10, msPerChar);
            // Par lots de 2 caractères pour une fluidité 60fps ultra légère
            for (let i = 2; i <= str.length + 1; i += 2) {
              const slice = str.slice(0, Math.min(str.length, i));
              timers.push(setTimeout(() => { el.textContent = slice; }, start + (i - 2) * step * 0.5));
            }
            typeCursorMs = start + str.length * step * 0.52 + 70;
          };

          if (config.title) {
            const titleEl = document.createElement("div");
            titleEl.style.cssText = "font-weight:700;font-size:16.5px;color:#F5B700;margin-bottom:14px;padding-right:34px;min-height:22px;";
            card.appendChild(titleEl);
            typeInto(titleEl, config.title, 20);
          }

          const body = document.createElement("div");
          body.style.cssText = "display:flex;flex-direction:column;gap:10px;position:relative;z-index:1;";
          card.appendChild(body);

          if (mode === "flow" && Array.isArray(config.flow_steps)) {
            config.flow_steps.forEach((st, idx) => {
              const col = CHALK[st.tone] || "#F8FAFC";
              const node = document.createElement("div");
              node.setAttribute("data-nkap-id", `${id}_f${idx + 1}`);
              node.style.cssText =
                `display:flex;justify-content:space-between;align-items:center;gap:10px;` +
                `background:rgba(255,255,255,0.05);border:1.5px solid ${col};border-radius:11px;padding:9px 13px;` +
                `opacity:0;transform:translateY(6px);transition:opacity 0.24s ease,transform 0.24s ease;`;
              const lSpan = document.createElement("span");
              lSpan.style.cssText = "color:#CBD5E1;font-size:13.5px;";
              const vSpan = document.createElement("span");
              vSpan.style.cssText = `font-weight:700;color:${col};font-size:15px;`;
              node.appendChild(lSpan);
              node.appendChild(vSpan);
              body.appendChild(node);
              const showAt = typeCursorMs;
              timers.push(setTimeout(() => { node.style.opacity = "1"; node.style.transform = "translateY(0)"; }, showAt));
              typeInto(lSpan, st.label || "", 14);
              typeInto(vSpan, st.value || "", 16);
              if (idx < config.flow_steps.length - 1) {
                const sep = document.createElement("div");
                sep.textContent = "↓";
                sep.style.cssText = "text-align:center;color:#F5B700;font-weight:700;font-size:15px;line-height:1;opacity:0;transition:opacity 0.2s ease;";
                body.appendChild(sep);
                timers.push(setTimeout(() => { sep.style.opacity = "1"; }, typeCursorMs));
              }
            });
          } else if (mode === "bars" && Array.isArray(config.bars)) {
            const maxVal = Math.max(1, ...config.bars.map((b) => Math.abs(Number(b.value) || 0)));
            config.bars.forEach((b, idx) => {
              const col = CHALK[b.tone] || (idx === 0 ? "#F5B700" : "#34D399");
              const pct = Math.max(6, Math.min(100, (Math.abs(Number(b.value) || 0) / maxVal) * 100));
              const wrap = document.createElement("div");
              wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;";
              wrap.innerHTML =
                `<div style="display:flex;justify-content:space-between;font-size:13.5px;">` +
                `<span style="color:#CBD5E1;">${b.label || ""}</span>` +
                `<span style="font-weight:700;color:${col};">${b.amount_text || b.value}</span></div>` +
                `<div style="height:10px;background:rgba(255,255,255,0.1);border-radius:999px;overflow:hidden;">` +
                `<div style="height:100%;width:${pct.toFixed(1)}%;background:${col};border-radius:999px;transform-origin:left;animation:nkapBarGrow 0.45s ${0.25 + idx * 0.2}s ease-out both;"></div></div>`;
              body.appendChild(wrap);
            });
          } else if (mode === "table" && Array.isArray(config.columns)) {
            const tbl = document.createElement("table");
            tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:13.5px;";
            const thead = document.createElement("tr");
            config.columns.forEach((c) => {
              const th = document.createElement("th");
              th.style.cssText = "text-align:left;padding:5px 6px;color:#F5B700;border-bottom:1.5px solid rgba(248,250,252,0.28);";
              thead.appendChild(th);
              typeInto(th, c, 14);
            });
            tbl.appendChild(thead);
            (config.rows || []).forEach((r) => {
              const tr = document.createElement("tr");
              (Array.isArray(r) ? r : []).forEach((cell) => {
                const td = document.createElement("td");
                td.style.cssText = "padding:6px;border-bottom:1px solid rgba(255,255,255,0.08);color:#F8FAFC;";
                tr.appendChild(td);
                typeInto(td, cell, 13);
              });
              tbl.appendChild(tr);
            });
            body.appendChild(tbl);
          } else if (mode === "choices" && Array.isArray(config.choices)) {
            config.choices.forEach((ch, idx) => {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = "nkap-choice-btn";
              btn.innerHTML =
                `<span style="width:24px;height:24px;border-radius:50%;background:#F5B700;color:#0B1220;display:inline-flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${ch.key || idx + 1}</span>` +
                `<span>${ch.label}</span>`;
              btn.addEventListener("click", () => {
                if (onChoiceCb) onChoiceCb(ch);
              });
              body.appendChild(btn);
            });
          } else {
            // Mode `lines` : écriture progressive ligne par ligne façon HeyClicky !
            (config.lines || []).forEach((line, idx) => {
              const lineId = line.id || `${id}_l${idx + 1}`;
              if (line.divider) {
                const hr = document.createElement("div");
                hr.style.cssText =
                  "height:1px;background:rgba(248,250,252,0.28);margin:2px 0;transform:scaleX(0);transform-origin:left;transition:transform 0.28s ease-out;";
                body.appendChild(hr);
                const tDiv = typeCursorMs;
                timers.push(setTimeout(() => { hr.style.transform = "scaleX(1)"; }, tDiv));
                typeCursorMs += 110;
                return;
              }
              const col = CHALK[line.color] || "#F8FAFC";
              const row = document.createElement("div");
              row.setAttribute("data-nkap-id", lineId);
              row.style.cssText = `display:flex;justify-content:space-between;gap:12px;font-size:${line.bold ? "15.5px" : "14px"};font-weight:${line.bold ? "700" : "400"};color:${col};line-height:1.4;min-height:20px;`;
              if (line.label != null && line.value != null) {
                const lSpan = document.createElement("span");
                lSpan.style.color = "#CBD5E1";
                const vSpan = document.createElement("span");
                vSpan.setAttribute("data-nkap-id", `${lineId}-val`);
                vSpan.style.cssText = `font-weight:700;color:${col};text-align:right;`;
                row.appendChild(lSpan);
                row.appendChild(vSpan);
                body.appendChild(row);
                typeInto(lSpan, line.label, 14);
                typeInto(vSpan, line.value, 16);
              } else {
                body.appendChild(row);
                typeInto(row, line.text || "", 14);
              }
            });
          }

          document.documentElement.appendChild(card);

          // Cadre wireframe esquissé à la craie — se TRACE progressivement via stroke-dashoffset (façon HeyClicky !)
          const gen = clearGen;
          requestAnimationFrame(() => {
            if (gen !== clearGen || !card.isConnected) return;
            const wire = geom().handBox(3, 3, card.offsetWidth - 6, card.offsetHeight - 6, id + "::wire");
            const len = Math.max(1, wire.len || (card.offsetWidth + card.offsetHeight) * 2.1);
            const p = svgEl("path", {
              d: wire.d,
              fill: "none",
              stroke: "rgba(245,183,0,0.72)",
              "stroke-width": "2.2",
              "stroke-linecap": "round",
              "stroke-dasharray": `${len} ${len + 12}`,
              "stroke-dashoffset": String(len),
            });
            p.style.transition = "stroke-dashoffset 0.48s cubic-bezier(0.22,1,0.36,1)";
            noteSvg.appendChild(p);
            requestAnimationFrame(() => { p.setAttribute("stroke-dashoffset", "0"); });
          });

          marks.set(id, {
            node: [card],
            timers,
            startedAt: performance.now(),
            drawMs: 360,
            dom: true,
            anchorEl: pageAnchor,
            baseRect: pageAnchor ? pageAnchor.getBoundingClientRect() : null,
            baseX: spot.x,
            baseY: spot.y,
          });
        };

        if (pageAnchor) anchored(pageAnchor, renderCard);
        else renderCard();
      },

      caption(text, subFr = null, wordDelayMs = 65) {
        ensureLayers();
        if (wordTimer) {
          clearInterval(wordTimer);
          wordTimer = null;
        }
        if (capLayer && capLayer.__chunkTimers) {
          capLayer.__chunkTimers.forEach((t) => clearTimeout(t));
          capLayer.__chunkTimers = [];
        }
        if (!text || !String(text).trim()) {
          capLayer.style.opacity = "0";
          if (!isVoiceActiveNow()) setStatusPill(null);
          setTimeout(() => {
            if (capLayer && capLayer.style.opacity === "0") {
              capLayer.style.display = "none";
              capLayer.innerHTML = "";
            }
          }, 160);
          return;
        }

        // Sous-titres courts qui défilent phrase par phrase (1 à 2 lignes max, confinés dans la frame Web/Mobile !)
        syncFrameAnchoredChrome();
        const fbCap = getFrameBounds();
        const clean = String(text).replace(/\s+/g, " ").trim();
        const maxChars = fbCap.isMobile ? 52 : (fbCap.inFrame ? 70 : 76);
        const chunks = [];
        for (const sent of clean.split(/(?<=[.!?;])\s+/)) {
          if (sent.length <= maxChars) {
            chunks.push(sent);
          } else {
            let cur = "";
            for (const w of sent.split(" ")) {
              const cand = cur ? `${cur} ${w}` : w;
              if (cand.length > maxChars && cur) {
                chunks.push(cur);
                cur = w;
              } else {
                cur = cand;
              }
            }
            if (cur) chunks.push(cur);
          }
        }

        const renderChunk = (chunkText, showSub) => {
          if (wordTimer) { clearInterval(wordTimer); wordTimer = null; }
          capLayer.innerHTML = "";
          capLayer.style.display = "block";
          requestAnimationFrame(() => (capLayer.style.opacity = "1"));
          const mainLine = document.createElement("div");
          mainLine.style.fontWeight = "700";
          const spans = chunkText.split(/\s+/).map((w) => {
            const s = document.createElement("span");
            s.className = "nkap-word";
            s.textContent = w;
            mainLine.appendChild(s);
            return s;
          });
          capLayer.appendChild(mainLine);
          if (showSub && subFr) {
            const sub = document.createElement("div");
            sub.textContent = subFr;
            sub.style.cssText = "font-size:13px;color:#CBD5E1;margin-top:2px;";
            capLayer.appendChild(sub);
          }
          let idx = 0;
          const next = () => {
            if (idx < spans.length) spans[idx++].classList.add("visible");
            else if (wordTimer) { clearInterval(wordTimer); wordTimer = null; }
          };
          next();
          wordTimer = setInterval(next, wordDelayMs);
        };

        capLayer.__chunkTimers = [];
        let accMs = 0;
        chunks.forEach((ch, idx) => {
          if (idx === 0) {
            renderChunk(ch, chunks.length === 1);
          } else {
            const tid = setTimeout(() => renderChunk(ch, idx === chunks.length - 1), accMs);
            capLayer.__chunkTimers.push(tid);
          }
          accMs += Math.max(1750, Math.min(4400, ch.length * 56));
        });
      },

      hide(id) {
        removeMarkImmediate(id);
      },

      clear() {
        clearGen++;
        pendingTimers.forEach((tid) => clearTimeout(tid));
        pendingTimers.clear();
        ensureLayers();
        if (wordTimer) { clearInterval(wordTimer); wordTimer = null; }
        for (const [, m] of marks) {
          if (m.timers) m.timers.forEach((t) => clearTimeout(t));
        }
        if (svg) svg.innerHTML = "";
        marks.clear();
        activeCursorMarkId = null;
        hideCursor();
        if (!isVoiceActiveNow()) setStatusPill(null);
        returnOrbHome();
        if (!panelEl || panelEl.style.display !== "flex") {
          setOrbLabelVisible(false);
        }
        if (rules()) rules().onCleared();
        api.caption("");
        document.querySelectorAll("[data-nkap]").forEach((n) => n.remove());
      },

      bubble(onTap) {
        ensureLayers();
        if (bubbleEl && bubbleEl.isConnected) {
          if (onTap) bubbleEl.__nkapTap = onTap;
          return bubbleEl;
        }
        // Panneau Jarvis chaleureux qui glisse VERS LE BAS depuis l'orbe neuronal (confiné dans la frame web/mobile)
        panelEl = document.createElement("div");
        panelEl.id = "nkap-question-panel";
        panelEl.style.cssText =
          "position:fixed;left:20px;top:140px;width:346px;max-width:calc(100vw - 24px);" +
          "max-height:calc(100vh - 160px);overflow-y:auto;" +
          "background:linear-gradient(160deg,rgba(26,20,15,0.95) 0%,rgba(12,17,30,0.96) 100%);" +
          "backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);" +
          "border:1px solid rgba(245,183,0,0.34);border-radius:20px;" +
          "padding:14px 14px 13px;color:#FEF9EE;font-family:'Andika',system-ui,sans-serif;" +
          "box-shadow:0 24px 60px rgba(0,0,0,0.62),0 0 32px rgba(245,183,0,0.12),inset 0 1px 0 rgba(255,220,130,0.24);" +
          "z-index:2147483647;display:none;flex-direction:column;gap:10px;pointer-events:auto;" +
          "transform-origin:top right;animation:nkapSlideDown 0.24s cubic-bezier(0.22,1,0.36,1) both;";
        document.documentElement.appendChild(panelEl);

        // Constellation neuronale holographique sans contour circulaire (ancrée dans la frame + mobile pendant explications)
        const home = getOrbHomePosition();
        bubbleEl = document.createElement("div");
        bubbleEl.id = "nkap-bubble";
        bubbleEl.setAttribute("data-state", orbState);
        bubbleEl.title = "Clique pour discuter · Glisse pour déplacer";
        const ORB_TRANSITION_SMOOTH =
          "left 0.65s cubic-bezier(0.22,1,0.36,1),top 0.65s cubic-bezier(0.22,1,0.36,1),transform 0.18s cubic-bezier(0.22,1,0.36,1),filter 0.25s ease";
        const ORB_TRANSITION_DRAG = "transform 0.12s ease,filter 0.25s ease";
        bubbleEl.style.cssText =
          `position:fixed;left:${Math.round(home.x)}px;top:${Math.round(home.y)}px;width:${home.size}px;height:${home.size}px;` +
          "background:transparent;border:none;box-shadow:none;" +
          "display:flex;align-items:center;justify-content:center;" +
          "filter:drop-shadow(0 0 11px rgba(245,183,0,0.48)) drop-shadow(0 2px 6px rgba(15,23,42,0.32));" +
          "z-index:2147483647;pointer-events:auto;cursor:grab;user-select:none;touch-action:none;" +
          `transition:${ORB_TRANSITION_SMOOTH};overflow:visible;`;

        // Canvas 60fps : réseau de neurones flottant librement + impulsions lumineuses organiques
        const canvas = document.createElement("canvas");
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const size = 78;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.cssText = `width:${home.size}px;height:${home.size}px;display:block;pointer-events:none;`;
        bubbleEl.appendChild(canvas);

        // Micro-pastille "nkap" : MASQUÉE par défaut, apparaît UNIQUEMENT au clic ou à l'activation « Hey Nkap » !
        const tag = document.createElement("span");
        tag.id = "nkap-orb-tag";
        tag.textContent = "nkap";
        tag.style.cssText =
          "position:absolute;bottom:-5px;left:50%;transform:translate(-50%,-4px) scale(0.85);opacity:0;" +
          "background:linear-gradient(135deg,#F5B700,#FF8C42);color:#140E07;" +
          "font-family:'Andika',system-ui,sans-serif;font-weight:700;font-size:10px;letter-spacing:0.06em;" +
          "padding:1px 7px;border-radius:999px;box-shadow:0 2px 10px rgba(0,0,0,0.35);pointer-events:none;" +
          "transition:opacity 0.2s ease,transform 0.22s cubic-bezier(0.22,1,0.36,1);";
        bubbleEl.appendChild(tag);
        orbTagEl = tag;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.scale(dpr, dpr);
          const N = 16;
          const nodes = Array.from({ length: N }, (_, i) => {
            const phi = Math.acos(1 - (2 * (i + 0.5)) / N);
            const theta = Math.PI * (1 + Math.sqrt(5)) * i;
            return {
              phi,
              theta,
              r: 15 + (i % 3) * 5.2,
              speed: 0.45 + (i % 4) * 0.16,
              phase: i * 0.7,
            };
          });

          const drawOrb = (tMs) => {
            if (!bubbleEl || !bubbleEl.isConnected) {
              orbRaf = null;
              return;
            }
            const t = tMs * 0.001;
            const cx = size / 2;
            const cy = size / 2;
            ctx.clearRect(0, 0, size, size);

            const voiceLive = isVoiceActiveNow();
            const isListen = orbState === "listening";
            const isSpeak = !isListen && (orbState === "speaking" || voiceLive);
            const isThink = !isListen && !isSpeak && orbState === "thinking";
            const expectedAttr = isListen ? "listening" : isSpeak ? "speaking" : isThink ? "thinking" : "idle";
            if (bubbleEl.getAttribute("data-state") !== expectedAttr) {
              bubbleEl.setAttribute("data-state", expectedAttr);
            }
            const speedMul = isSpeak ? 2.5 : isListen ? 2.1 : isThink ? 3.2 : 0.9;
            const pulse = isSpeak
              ? 1 + 0.16 * Math.sin(t * 9.5) + 0.07 * Math.sin(t * 17)
              : isListen
                ? 1 + 0.13 * Math.sin(t * 7.2)
                : isThink
                  ? 1 + 0.1 * Math.sin(t * 5.5)
                  : 1 + 0.05 * Math.sin(t * 2.1);

            const coreHue = isListen ? "255, 92, 119" : "245, 183, 0";
            const warmHue = isListen ? "255, 130, 80" : "234, 118, 28";

            // Lueur solaire diffuse sans aucun bord net (fond 100% transparent)
            const coreGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, 31 * pulse);
            coreGrad.addColorStop(0, `rgba(255, 244, 196, ${isSpeak ? 0.85 : 0.62})`);
            coreGrad.addColorStop(0.32, `rgba(${coreHue}, ${isSpeak ? 0.46 : 0.28})`);
            coreGrad.addColorStop(0.68, `rgba(${warmHue}, ${isSpeak ? 0.16 : 0.08})`);
            coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, 34 * pulse, 0, Math.PI * 2);
            ctx.fill();

            // Onde organique diffuse quand Nkap parle ou écoute (sans bord circulaire dur)
            if (isSpeak || isListen || isThink) {
              const waveP = (t * (isSpeak ? 1.15 : isListen ? 1.35 : 0.85)) % 1;
              const waveR = 12 + waveP * 25;
              const waveAlpha = (1 - waveP) * 0.45;
              ctx.strokeStyle = `rgba(${coreHue}, ${waveAlpha.toFixed(2)})`;
              ctx.lineWidth = 1.6 * (1 - waveP * 0.6);
              ctx.beginPath();
              ctx.arc(cx, cy, waveR, 0, Math.PI * 2);
              ctx.stroke();
            }

            // Projection 3D des neurones en orbite libre
            const pts = nodes.map((n) => {
              const a = n.theta + t * n.speed * speedMul;
              const b = n.phi + Math.sin(t * 0.7 + n.phase) * 0.24;
              const rad = n.r * pulse;
              const x3 = rad * Math.sin(b) * Math.cos(a);
              const y3 = rad * Math.cos(b);
              const z3 = rad * Math.sin(b) * Math.sin(a);
              const scale = (z3 + 46) / 64;
              return { x: cx + x3, y: cy + y3, z: z3, s: scale, p: n.phase };
            });

            // Filaments synaptiques chaleureux (lisibles sur fond clair et foncé)
            ctx.lineWidth = isSpeak ? 1.35 : 1.05;
            for (let i = 0; i < pts.length; i++) {
              for (let j = i + 1; j < pts.length; j++) {
                const dx = pts[i].x - pts[j].x;
                const dy = pts[i].y - pts[j].y;
                const dist = Math.hypot(dx, dy);
                const maxD = isSpeak ? 30 : 26;
                if (dist < maxD) {
                  const alpha = (1 - dist / maxD) * (isSpeak ? 0.88 : isThink ? 0.76 : 0.62);
                  ctx.strokeStyle = `rgba(${i % 2 === 0 ? coreHue : warmHue}, ${alpha.toFixed(2)})`;
                  ctx.beginPath();
                  ctx.moveTo(pts[i].x, pts[i].y);
                  ctx.lineTo(pts[j].x, pts[j].y);
                  ctx.stroke();
                }
              }
            }

            // Neurones lumineux à cœur crème + halo doré
            pts.sort((a, b) => a.z - b.z);
            for (const p of pts) {
              const glow = 0.55 + 0.45 * Math.sin(t * (isSpeak ? 8.5 : 3.2) + p.p);
              const rNode = (1.7 + p.s * 1.55) * (isSpeak ? 1.12 : 1);
              ctx.fillStyle = `rgba(${coreHue}, ${(0.38 + glow * 0.35).toFixed(2)})`;
              ctx.beginPath();
              ctx.arc(p.x, p.y, rNode * 1.65, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = `rgba(255, 248, 220, ${(0.72 + glow * 0.28).toFixed(2)})`;
              ctx.beginPath();
              ctx.arc(p.x, p.y, rNode * 0.85, 0, Math.PI * 2);
              ctx.fill();
            }

            orbRaf = requestAnimationFrame(drawOrb);
          };
          orbRaf = requestAnimationFrame(drawOrb);
        }

        bubbleEl.__nkapTap = onTap || (() => { });

        // Glisser-déposer fluide de l'orbe (toujours confiné dans la frame Web/Mobile)
        let dragStartX = 0;
        let dragStartY = 0;
        let dragOrigL = 0;
        let dragOrigT = 0;
        let dragPointerId = null;

        bubbleEl.addEventListener("pointerdown", (ev) => {
          if (ev.button !== 0 && ev.pointerType === "mouse") return;
          dragPointerId = ev.pointerId;
          dragStartX = ev.clientX;
          dragStartY = ev.clientY;
          const br = bubbleEl.getBoundingClientRect();
          dragOrigL = br.left;
          dragOrigT = br.top;
          isDraggingOrb = false;
          try { bubbleEl.setPointerCapture(ev.pointerId); } catch (_) { }
        });

        bubbleEl.addEventListener("pointermove", (ev) => {
          if (dragPointerId === null || ev.pointerId !== dragPointerId) return;
          const dx = ev.clientX - dragStartX;
          const dy = ev.clientY - dragStartY;
          if (!isDraggingOrb && Math.hypot(dx, dy) > 6) {
            isDraggingOrb = true;
            orbFloatingTarget = null;
            bubbleEl.style.transition = ORB_TRANSITION_DRAG;
            bubbleEl.style.cursor = "grabbing";
          }
          if (!isDraggingOrb) return;
          const fb = getFrameBounds();
          const sz = orbSizePx || 64;
          const minX = fb.left + 6;
          const maxX = Math.max(minX, fb.right - sz - 6);
          const minY = fb.top + (fb.inFrame && fb.isMobile ? 26 : 4);
          const maxY = Math.max(minY, fb.bottom - sz - 8);
          const nx = Math.max(minX, Math.min(maxX, dragOrigL + dx));
          const ny = Math.max(minY, Math.min(maxY, dragOrigT + dy));
          applyOrbCoords(nx, ny, sz);
        });

        const endOrbDrag = (ev) => {
          if (dragPointerId === null || ev.pointerId !== dragPointerId) return;
          try { bubbleEl.releasePointerCapture(ev.pointerId); } catch (_) { }
          dragPointerId = null;
          bubbleEl.style.transition = ORB_TRANSITION_SMOOTH;
          bubbleEl.style.cursor = "grab";
          if (isDraggingOrb) {
            const fb = getFrameBounds();
            const sz = orbSizePx || 64;
            const br = bubbleEl.getBoundingClientRect();
            const minX = fb.left + 6;
            const maxX = Math.max(minX, fb.right - sz - 6);
            const minY = fb.top + (fb.inFrame && fb.isMobile ? 26 : 4);
            const maxY = Math.max(minY, fb.bottom - sz - 8);
            const rx = maxX > minX ? Math.max(0, Math.min(1, (br.left - minX) / (maxX - minX))) : 1;
            const ry = maxY > minY ? Math.max(0, Math.min(1, (br.top - minY) / (maxY - minY))) : 0;
            userHomeRel = { rx, ry };
            isDraggingOrb = false;
            justDraggedOrb = true;
            setTimeout(() => { justDraggedOrb = false; }, 90);
          }
        };
        bubbleEl.addEventListener("pointerup", endOrbDrag);
        bubbleEl.addEventListener("pointercancel", endOrbDrag);

        bubbleEl.addEventListener("click", () => {
          if (justDraggedOrb) return;
          bubbleEl.style.transform = "scale(0.9)";
          setTimeout(() => (bubbleEl.style.transform = ""), 150);
          if (orbFloatingTarget) returnOrbHome();
          positionPanelUnderOrb();
          if (global.NKAP_ASSISTANT && global.NKAP_ASSISTANT.togglePanel) {
            global.NKAP_ASSISTANT.togglePanel(panelEl);
            positionPanelUnderOrb();
          } else {
            bubbleEl.__nkapTap();
          }
        });
        document.documentElement.appendChild(bubbleEl);

        // Maintient l'orbe dans la frame web/mobile après chargement asynchrone ou redimensionnement
        const syncOrb = () => {
          syncFrameAnchoredChrome();
          if (!bubbleEl || !bubbleEl.isConnected || isDraggingOrb) return;
          if (orbFloatingTarget && orbFloatingTarget.isConnected) {
            floatOrbNear(orbFloatingTarget);
          } else {
            const h = getOrbHomePosition();
            applyOrbCoords(h.x, h.y, h.size);
          }
        };
        window.addEventListener("resize", syncOrb, { passive: true });
        window.addEventListener("scroll", syncOrb, { passive: true, capture: true });
        if (orbSyncTimer) clearInterval(orbSyncTimer);
        orbSyncTimer = setInterval(() => {
          if (!bubbleEl || !bubbleEl.isConnected) {
            clearInterval(orbSyncTimer);
            orbSyncTimer = null;
            return;
          }
          if (marks.size > 0) pruneDetachedMarks();
          syncFrameAnchoredChrome();
          if (!orbFloatingTarget && !isDraggingOrb) {
            const h = getOrbHomePosition();
            const curL = parseFloat(bubbleEl.style.left) || 0;
            const curT = parseFloat(bubbleEl.style.top) || 0;
            if (Math.abs(curL - h.x) > 4 || Math.abs(curT - h.y) > 4) {
              applyOrbCoords(h.x, h.y, h.size);
            }
          }
        }, 220);
        return bubbleEl;
      },

      setOrbState,
      setOrbLabelVisible,
      floatOrbNear,
      returnOrbHome,
      positionPanelUnderOrb,
      pruneDetachedMarks,
      getPanelEl() { return panelEl; },

      destroy() {
        if (orbRaf) { cancelAnimationFrame(orbRaf); orbRaf = null; }
        if (orbSyncTimer) { clearInterval(orbSyncTimer); orbSyncTimer = null; }
        api.clear();
        window.removeEventListener("scroll", repositionAll, true);
        window.removeEventListener("resize", repositionAll);
        [hostEl, capLayer, bubbleEl, panelEl].forEach((el) => el && el.remove());
        hostEl = svg = capLayer = cursorEl = statusPillEl = bubbleEl = orbTagEl = panelEl = null;
      },
    };

    return api;
  }

  NS.svgRenderer = { createSVGRenderer };
})(typeof window !== "undefined" ? window : globalThis);

/* === src/index.js === */
/**
 * nkap-sdk/src/index.js — Façade publique `NkapSDK` v1.2 (Drop-in Web SDK + Wrapper Extension)
 *
 * Usage drop-in (1 ligne <script src=".../nkap-sdk.js">) :
 *   const nkap = NkapSDK.mount({ channel: "auto", lang: "ewo", apiUrl: "https://13.51.168.107.sslip.io" });
 *   nkap.play(turnPayload);
 *   nkap.edit("co_1", { label: "15 000 FCFA" });
 *   nkap.setLanguage("dua");
 */

(function (global) {
  const NS = (global.__NKAP_SDK_MODULES__ = global.__NKAP_SDK_MODULES__ || {});

  function mount(options = {}) {
    const adapter = options.adapter || NS.domAdapter.createDOMAdapter(options);
    const renderer = options.renderer || NS.svgRenderer.createSVGRenderer({
      assetBaseUrl: options.assetBaseUrl,
      onChoice: options.onChoice,
      getObstacles: () => adapter.getObstacles(),
      getChannel: () => adapter.getChannel(),
    });

    let currentLang = options.lang || "ewo";
    let apiUrl = (options.apiUrl || "").replace(/\/+$/, "");
    let scheduled = [];

    function cancelScheduled() {
      scheduled.forEach((t) => clearTimeout(t));
      scheduled = [];
    }

    function executeAction(action) {
      if (!action || !action.t) return;
      if (NS.rules && !NS.rules.validateActionAmounts(action)) return;
      const t = action.t;

      if (t === "clear") {
        renderer.clear();
        return;
      }
      if (t === "hide") {
        if (action.id) renderer.hide(action.id);
        return;
      }
      if (t === "edit") {
        if (action.id) renderer.edit(action.id, action);
        return;
      }
      if (t === "caption") {
        renderer.caption(action.text || "", action.sub_fr || null);
        return;
      }
      if (t === "speak") {
        renderer.setStatusPill("speaking", action.lang === "ewo" ? "Ewondo…" : "Parle…");
        renderer.caption(action.text || "", action.caption_fr || action.sub_fr || null);
        if (typeof options.onSpeak === "function") options.onSpeak(action);
        return;
      }
      if (t === "notebook") {
        const anchorEl = action.anchor ? adapter.resolveTarget(action.anchor) : null;
        renderer.notebook(
          Object.assign({}, action, { anchorEl }),
          action.id || "nb_" + Date.now()
        );
        return;
      }
      if (t === "arrow") {
        const elFrom = adapter.resolveTarget(action.from);
        const elTo = adapter.resolveTarget(action.to);
        if (elFrom && elTo) {
          renderer.arrow(elFrom, elTo, action.color || "ink", action.duration_ms || 760, action.id || "a_" + Date.now());
        }
        return;
      }

      const targetEl = adapter.resolveTarget(action.target);
      if (!targetEl) return;

      if (t === "circle") renderer.circle(targetEl, action.color || "ink", action.duration_ms || 680, action.id);
      else if (t === "box") renderer.box(targetEl, action.color || "ink", action.duration_ms || 680, action.id);
      else if (t === "underline") renderer.underline(targetEl, action.color || "yellow", action.duration_ms || 450, action.id);
      else if (t === "highlight") renderer.highlight(targetEl, action.color || "yellow", action.duration_ms || 420, action.id);
      else if (t === "strike") renderer.strike(targetEl, action.color || "red", action.duration_ms || 360, action.id);
      else if (t === "check") renderer.check(targetEl, action.color || "green", action.duration_ms || 380, action.id);
      else if (t === "cross") renderer.cross(targetEl, action.color || "red", action.duration_ms || 380, action.id);
      else if (t === "callout") renderer.callout(targetEl, action.label || action.text || "", action.color || "yellow", action.duration_ms || 520, action.id);
      else if (t === "num") renderer.num(targetEl, action.step || 1, action.label || "", action.color || "yellow", action.id);
      else if (t === "frame") renderer.frame(targetEl, action.label || "Appuie ici", action.id);
      else if (t === "write") {
        renderer.write(
          action.text || "",
          targetEl,
          { color: action.color || "ink", size: action.size || 24, dy: action.target?.dy, dx: action.target?.dx, perLetterMs: action.per_letter_ms || 48 },
          action.id
        );
      }
    }

    function play(turnPayload) {
      cancelScheduled();
      const norm = NS.protocol.normalizeTurn(turnPayload);
      for (const item of norm.actions) {
        const delay = Math.max(0, Number(item.run_after_ms || 0));
        if (delay === 0) {
          executeAction(item.action);
        } else {
          scheduled.push(setTimeout(() => executeAction(item.action), delay));
        }
      }
      return norm;
    }

    async function ask(transcript, opts = {}) {
      if (!apiUrl) throw new Error("NkapSDK: apiUrl non configuré");
      const ctx = adapter.extractContext(opts.screen_hint || null);
      const res = await fetch(`${apiUrl}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: opts.session_id || "sdk_session",
          channel: adapter.getChannel(),
          transcript,
          lang_hint: opts.lang || currentLang,
          context: ctx,
        }),
      });
      if (!res.ok) throw new Error(`NkapSDK /answer HTTP ${res.status}`);
      const data = await res.json();
      play(data);
      return data;
    }

    return {
      version: "1.2.0",
      adapter,
      renderer,
      play,
      ask,
      edit(id, patch) {
        return renderer.edit(id, patch);
      },
      clear() {
        cancelScheduled();
        renderer.clear();
      },
      setLanguage(lang) {
        currentLang = String(lang || "fr");
        if (typeof options.onLanguageChange === "function") options.onLanguageChange(currentLang);
        return currentLang;
      },
      getLanguage() {
        return currentLang;
      },
      setChannel(ch) {
        return adapter.setChannel(ch);
      },
      getChannel() {
        return adapter.getChannel();
      },
      extractContext(hint) {
        return adapter.extractContext(hint);
      },
      renderText(turnPayload, textOpts) {
        return NS.textRenderer.renderTurnAsText(turnPayload, textOpts);
      },
      destroy() {
        cancelScheduled();
        renderer.destroy();
      },
    };
  }

  const defaultInstance = typeof document !== "undefined" ? mount({ channel: "auto" }) : null;

  // Exports SDK public + alias rétro-compatibles pour nkap-extension
  global.NkapSDK = {
    version: "1.2.0",
    mount,
    normalizeTurn: NS.protocol.normalizeTurn,
    renderText: NS.textRenderer.renderTurnAsText,
    geometry: NS.geometry,
    layout: NS.layout,
    rules: NS.rules,
    defaultInstance,
  };
  global.NKAP_GEOMETRY = NS.geometry;
  global.NKAP_RULES = NS.rules;
  if (defaultInstance) {
    global.NKAP_OVERLAY = defaultInstance.renderer;
  }
})(typeof window !== "undefined" ? window : globalThis);
