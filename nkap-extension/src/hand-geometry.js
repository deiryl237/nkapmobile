/**
 * hand-geometry.js — Géométrie manuscrite déterministe (« Le prof au tableau »)
 *
 * Produit des chemins SVG (d + longueur) au grain feutre naturel :
 * - handCircle    : ovale manuscrit qui se referme avec un léger croisement
 * - handBox       : rectangle manuscrit à coins doux qui ferme son contour
 * - handUnderline : trait de soulignement souple sous un élément
 * - handArrow     : flèche courbée qui part du bord de A jusqu'au bord de B
 */

window.NKAP_GEOMETRY = (() => {
  /** Générateur pseudo-aléatoire déterministe (même id = même coup de feutre). */
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

  /** Lisse un polygone de points en courbe de Bézier cubique continue (Catmull-Rom). */
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

  /**
   * 1. Ovale manuscrit (`circle`)
   * Part du quart supérieur gauche, fait le tour complet et dépasse légèrement
   * pour fermer la boucle comme un vrai tracé à main levée.
   */
  function handCircle(cx, cy, rx, ry, seed) {
    const rand = seeded(seed);
    const steps = 20;
    const startAngle = -2.25;
    const sweep = Math.PI * 2 + 0.38; // léger recouvrement de fermeture
    const pts = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = startAngle + sweep * t;
      // Très légère dérive de fin de geste pour que le croisement soit vivant
      const endSpiral = t > 0.85 ? (t - 0.85) * 14 : 0;
      const jr = 1 + (rand() - 0.5) * 0.042;
      const px = cx + Math.cos(a) * (rx * jr + endSpiral * 0.3);
      const py = cy + Math.sin(a) * (ry * jr - endSpiral * 0.15);
      pts.push([px, py]);
    }
    return smoothPath(pts, 6);
  }

  /**
   * 2. Rectangle manuscrit qui ferme son contour (`box`)
   * Idéal pour entourer un montant ("42 500 FCFA") ou une ligne sans déborder
   * sur les éléments voisins. Se trace d'un seul trait continu et se referme
   * avec un léger dépassement de feutre en haut à gauche.
   */
  function handBox(x, y, w, h, seed) {
    const rand = seeded(seed);
    const r = Math.min(12, w * 0.08, h * 0.28); // rayon doux aux 4 coins
    const jit = () => (rand() - 0.5) * 2.0;

    // Points clés le long des 4 côtés + coins adoucis + fermeture qui dépasse de 14px
    const raw = [
      // Départ légèrement après le coin haut-gauche
      [x + r * 0.6, y + jit()],
      // Côté haut (3 points intermédiaires)
      [x + w * 0.35, y - 1.2 + jit()],
      [x + w * 0.7, y + 0.6 + jit()],
      [x + w - r, y + jit()],
      // Coin haut-droit
      [x + w + jit() * 0.6, y + r],
      // Côté droit
      [x + w + 0.8 + jit(), y + h * 0.5],
      [x + w + jit() * 0.6, y + h - r],
      // Coin bas-droit
      [x + w - r, y + h + jit()],
      // Côté bas
      [x + w * 0.65, y + h + 1.2 + jit()],
      [x + w * 0.3, y + h - 0.5 + jit()],
      [x + r, y + h + jit()],
      // Coin bas-gauche
      [x + jit() * 0.6, y + h - r],
      // Côté gauche
      [x - 0.8 + jit(), y + h * 0.5],
      [x + jit() * 0.6, y + r],
      // Fermeture du contour au coin haut-gauche + léger dépassement naturel
      [x + r * 0.6, y + 1.0 + jit() * 0.5],
      [x + r + Math.min(18, w * 0.12), y + 1.8 + jit() * 0.5],
    ];

    return smoothPath(raw, 6.5);
  }

  /**
   * 3. Soulignement manuscrit (`underline`)
   * Ligne souple avec très légère cambrure naturelle.
   */
  function handUnderline(x, y, w, seed) {
    const rand = seeded(seed);
    const steps = 10;
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const arch = Math.sin(t * Math.PI) * 2.8;
      pts.push([
        x + w * t + (rand() - 0.5) * 1.6,
        y + arch + (rand() - 0.5) * 1.6,
      ]);
    }
    return smoothPath(pts, 6);
  }

  /**
   * Trouve le point sur le bord du rectangle `rect` (avec marge `pad`)
   * en direction du point `( targetX, targetY )` pour que les flèches
   * ne rayent jamais le texte à l'intérieur des éléments.
   */
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

  /**
   * 4. Flèche manuscrite (`arrow`)
   * Relie proprement le bord de `rectFrom` au bord de `rectTo`.
   */
  function handArrowBetweenRects(rectFrom, rectTo, seed, bow = 0.14) {
    const [fx, fy] = borderPointTowards(rectFrom, rectTo.cx, rectTo.cy, 8);
    const [tx, ty] = borderPointTowards(rectTo, rectFrom.cx, rectFrom.cy, 10);
    return handArrow(fx, fy, tx, ty, seed, bow);
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
      const j = (1 - Math.abs(t - 0.5) * 1.6) * 1.8; // zéro jitter aux extrémités
      pts.push([
        fx + dx * t + nx * bulge + (rand() - 0.5) * j,
        fy + dy * t + ny * bulge + (rand() - 0.5) * j,
      ]);
    }
    const main = smoothPath(pts, 6);

    // Tangente finale pour orienter la pointe de flèche dans l'axe exact de la courbe
    const pLast = pts[pts.length - 1];
    const pPrev = pts[Math.max(0, pts.length - 3)];
    const ang = Math.atan2(pLast[1] - pPrev[1], pLast[0] - pPrev[0]);
    const L = 14;
    const a1 = ang + Math.PI - 0.48;
    const a2 = ang + Math.PI + 0.48;
    const headPts = [
      [tx + L * Math.cos(a1), ty + L * Math.sin(a1)],
      [tx, ty],
      [tx + L * Math.cos(a2), ty + L * Math.sin(a2)],
    ];
    const head = {
      d: `M ${headPts[0][0].toFixed(1)} ${headPts[0][1].toFixed(1)} L ${headPts[1][0].toFixed(1)} ${headPts[1][1].toFixed(1)} L ${headPts[2][0].toFixed(1)} ${headPts[2][1].toFixed(1)}`,
      len: L * 2.2,
    };
    return { main, head };
  }

  return {
    seeded,
    smoothPath,
    handCircle,
    handBox,
    handUnderline,
    handArrow,
    handArrowBetweenRects,
  };
})();

