/**
 * rules.js — La discipline de composition et de sécurité (contrat v1.1 §5 & §6)
 *
 * 1. Budget visuel strict : ≤ 3 marques simultanées à l'écran (FIFO).
 * 2. AmountGuard : tout montant écrit doit exister à l'identique à l'écran.
 * 3. Détection du ton de fond (light / dark) : permet d'adapter l'encre
 *    (#12233A sur fond clair, #F5B700 jaune feutre sur fond sombre).
 */

window.NKAP_RULES = (() => {
  const MAX_MARKS = 3;
  const visibleIds = []; // file FIFO des marques actives à l'écran

  const AMOUNT_RE = /[\d][\d\s.,]*\s*(?:FCFA|francs?|fr\.?|%)/giu;

  /** Enregistre une nouvelle marque et renvoie les IDs à effacer si > 3. */
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

  /**
   * AmountGuard : vérifie qu'aucun montant ou pourcentage dans `text`
   * n'est inventé ou altéré par rapport aux textes visibles de la page.
   */
  function amountsPreserved(text) {
    if (!text) return true;
    const matches = String(text).match(AMOUNT_RE);
    if (!matches || matches.length === 0) return true;

    const bodyDigits = (document.body ? document.body.innerText : "").replace(/\D+/g, "");
    for (const raw of matches) {
      const digits = raw.replace(/\D+/g, "");
      if (digits.length > 0 && !bodyDigits.includes(digits)) {
        console.warn("[nkap/AmountGuard] Action rejetée — montant absent de l'écran :", raw);
        return false;
      }
    }
    return true;
  }

  /**
   * Calcule le ton effectif ("light" | "dark") du fond derrière `el`
   * en remontant toute la chaîne des ancêtres jusqu'à <html>, avec repli sur la couleur du texte.
   */
  function detectTone(el) {
    const parseLum = (cssColor) => {
      const m = String(cssColor || "").match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
      if (!m) return null;
      const alpha = m[4] !== undefined ? parseFloat(m[4]) : 1;
      if (alpha < 0.35) return null;
      const r = parseFloat(m[1]);
      const g = parseFloat(m[2]);
      const b = parseFloat(m[3]);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };

    let cur = el;
    for (let depth = 0; depth < 32 && cur && cur.nodeType === 1; depth++, cur = cur.parentElement) {
      const cs = window.getComputedStyle(cur);
      const bgLum = parseLum(cs.backgroundColor);
      if (bgLum !== null) {
        return bgLum < 0.45 ? "dark" : "light";
      }
      if (cs.backgroundImage && cs.backgroundImage !== "none") {
        const matches = cs.backgroundImage.match(/rgba?\([^)]+\)/g);
        if (matches && matches.length) {
          const lums = matches.map(parseLum).filter((v) => v !== null);
          if (lums.length) {
            const avg = lums.reduce((a, b) => a + b, 0) / lums.length;
            return avg < 0.45 ? "dark" : "light";
          }
        }
      }
    }

    if (el && el.nodeType === 1) {
      const fgLum = parseLum(window.getComputedStyle(el).color);
      if (fgLum !== null && fgLum > 0.55) {
        return "dark";
      }
    }
    return "light";
  }

  return {
    MAX_MARKS,
    onMarkAdded,
    onMarkRemoved,
    onCleared,
    getVisibleCount,
    amountsPreserved,
    detectTone,
  };
})();

