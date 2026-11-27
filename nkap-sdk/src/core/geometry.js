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
