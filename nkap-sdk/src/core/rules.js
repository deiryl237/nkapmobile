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
