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
