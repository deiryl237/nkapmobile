/**
 * I4 web — l'overlay « le tableau » injecté dans la page : traits manuscrits
 * SVG progressifs (double contour), écriture papier, cadre rouge à coins,
 * captions fixes en bas. Cible = rects DOM réels (getBoundingClientRect).
 * Les 9 actions du contrat, mêmes sémantiques que le moteur Android.
 */
window.NKAP_OVERLAY = (() => {
  let svg = null;
  let capLayer = null;
  let bubbleEl = null;
  const marks = new Map(); // id → {node: SVG node, startedAt, drawMs, len, seg}

  const INK = { ink: "#12233A", yellow: "#F5B700", red: "#E23B3B" };
  const OUTLINE = { ink: "rgba(255,255,255,0.75)", yellow: "rgba(18,35,58,0.55)", red: "rgba(255,255,255,0.75)" };

  function ensureLayers() {
    if (svg && capLayer) return;
    const host = document.createElement("div");
    host.id = "nkap-overlay-host";
    host.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:2147483646;";
    const NS = "http://www.w3.org/2000/svg";
    svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    host.appendChild(svg);

    capLayer = document.createElement("div");
    capLayer.style.cssText =
      "position:fixed;left:24px;bottom:120px;max-width:70%;z-index:2147483647;" +
      "background:rgba(255,255,255,0.95);border:1px solid #E2EEF5;border-radius:14px;" +
      "padding:12px 18px;font-family:'Andika',system-ui,sans-serif;color:#12233A;font-size:16px;" +
      "box-shadow:0 4px 14px rgba(11,27,43,0.18);";
    document.documentElement.appendChild(host);
    document.documentElement.appendChild(capLayer);
  }

  function seeded(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353) | 0;
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507) | 0;
      h = Math.imul(h ^ (h >>> 13), 3266489909) | 0;
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  function smoothPath(pts) {
    if (pts.length < 2) return { d: "", len: 0 };
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1],
        p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)},` +
           ` ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)},` +
           ` ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
      len += Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    }
    return { d, len: len * 1.12 };
  }

  function handCircle(cx, cy, rx, ry, seed) {
    const rand = seeded(seed), n = 16, start = -2.1,
      sweep = 2 * Math.PI + 0.55, pts = [];
    for (let i = 0; i <= n; i++) {
      const a = start + sweep * (i / n), jr = 1 + (rand() - 0.5) * 0.055;
      pts.push([cx + Math.cos(a) * rx * jr, cy + Math.sin(a) * ry * jr]);
    }
    return smoothPath(pts);
  }

  function handUnderline(x, y, w, seed) {
    const rand = seeded(seed), n = 8, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, sag = Math.sin(t * Math.PI) * 5;
      pts.push([x + w * t + (rand() - 0.5) * 2.2, y + sag + (rand() - 0.5) * 2.2]);
    }
    return smoothPath(pts);
  }

  function handArrow(fx, fy, tx, ty, seed, bow = 0.16) {
    const rand = seeded(seed), n = 12;
    const dx = tx - fx, dy = ty - fy,
      dist = Math.hypot(dx, dy) || 1,
      nx = -dy / dist, ny = dx / dist, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, bulge = Math.sin(t * Math.PI) * bow * dist * 0.35;
      pts.push([fx + dx * t + nx * bulge + (rand() - 0.5) * 2.4,
                fy + dy * t + ny * bulge + (rand() - 0.5) * 2.4]);
    }
    const main = smoothPath(pts);
    const ang = Math.atan2(dy, dx), L = 16,
      a1 = ang + Math.PI - 0.5, a2 = ang + Math.PI + 0.5;
    const head = { d: `M ${(tx + L * Math.cos(a1)).toFixed(1)} ${(ty + L * Math.sin(a1)).toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)} L ${(tx + L * Math.cos(a2)).toFixed(1)} ${(ty + L * Math.sin(a2)).toFixed(1)}`, len: L * 2 };
    return { main, head };
  }

  function el(tag, attrs) {
    const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  /** Ajoute un trait animé (tracé progressif par dashoffset). */
  function addStroke(id, pathData, headData, color, drawMs) {
    ensureLayers();
    const NS = "http://www.w3.org/2000/svg";
    const group = el("g", { "data-nkap": id });
    const len = pathData.len || 1;
    const outline = el("path", {
      d: pathData.d, fill: "none", stroke: OUTLINE[inkKey(color)] || "rgba(255,255,255,0.6)",
      "stroke-width": "9", "stroke-linecap": "round",
      "stroke-dasharray": `${len} ${len + 10}`, "stroke-dashoffset": String(len),
    });
    const main = el("path", {
      d: pathData.d, fill: "none", stroke: color, "stroke-width": "5",
      "stroke-linecap": "round", "stroke-linejoin": "round",
      "stroke-dasharray": `${len} ${len + 10}`, "stroke-dashoffset": String(len),
    });
    group.appendChild(outline);
    group.appendChild(main);
    if (headData) {
      const ho = el("path", {
        d: headData.d, fill: "none", stroke: OUTLINE[inkKey(color)] || "rgba(255,255,255,0.6)",
        "stroke-width": "9", "stroke-linecap": "round", opacity: "0",
        "stroke-dasharray": `${headData.len} ${headData.len + 10}`, "stroke-dashoffset": String(headData.len),
      });
      const hm = el("path", {
        d: headData.d, fill: "none", stroke: color, "stroke-width": "5",
        "stroke-linecap": "round", opacity: "0",
        "stroke-dasharray": `${headData.len} ${headData.len + 10}`, "stroke-dashoffset": String(headData.len),
      });
      group.appendChild(ho); group.appendChild(hm);
      marks.set(id + "::head", { node: [ho, hm], startedAt: performance.now() + drawMs, drawMs: 180, len: headData.len });
    }
    svg.appendChild(group);
    marks.set(id, { node: [outline, main], startedAt: performance.now(), drawMs, len });
    animate();
  }

  let raf = null;
  function animate() {
    if (raf) return;
    const step = () => {
      const now = performance.now();
      let live = false;
      for (const [, m] of marks) {
        const t = Math.min(1, Math.max(0, (now - m.startedAt) / m.drawMs));
        m.node.forEach((p, i) => {
          const offset = (1 - t) * m.len;
          p.setAttribute("stroke-dashoffset", String(offset));
          if (m.startedAt + m.drawMs <= now && p.getAttribute("opacity") === "0") p.setAttribute("opacity", "1");
        });
        if (now < m.startedAt + m.drawMs + 200) live = true;
      }
      if (live) raf = requestAnimationFrame(step);
      else { raf = null; }
    };
    raf = requestAnimationFrame(step);
  }

  function inkKey(color) {
    return color === INK.yellow ? "yellow" : color === INK.red ? "red" : "ink";
  }

  // ---- API publique (les gestes du contrat) -------------------------------

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  return {
    rectOf,
    circle(el, color = "ink", drawMs = 700, id = "c_" + Date.now()) {
      const r = rectOf(el);
      const p = handCircle(r.cx, r.cy, r.w / 2 + 18, r.h / 2 + 16, id);
      addStroke(id, p, null, INK[color], drawMs);
    },
    underline(el, color = "yellow", drawMs = 450, id = "u_" + Date.now()) {
      const r = rectOf(el);
      const p = handUnderline(r.x - 9, r.y + r.h + 8, r.w + 18, id);
      addStroke(id, p, null, INK[color], drawMs);
    },
    arrow(elFrom, elTo, color = "ink", drawMs = 800, id = "a_" + Date.now()) {
      const a = rectOf(elFrom), b = rectOf(elTo);
      const p = handArrow(a.cx, a.cy, b.cx, b.cy, id);
      addStroke(id, p.main, p.head, INK[color], drawMs);
    },
    frame(el, label = "Appuie ici", id = "f_" + Date.now()) {
      ensureLayers();
      const r = rectOf(el);
      const pad = 8;
      const div = document.createElement("div");
      div.setAttribute("data-nkap", id);
      div.style.cssText = `position:fixed;left:${r.x - pad}px;top:${r.y - pad}px;width:${r.w + pad * 2}px;height:${r.h + pad * 2}px;` +
        "border:1.6px solid rgba(226,59,59,0.55);border-radius:10px;pointer-events:none;";
      // 4 coins en L
      const L = 16;
      for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const c = document.createElement("div");
        c.style.cssText = `position:absolute;width:${L}px;height:${L}px;border:4px solid #E23B3B;` +
          `border-${sy ? "bottom" : "top"}-width:4px;` +
          `left:${sx ? "auto" : 0};right:${sx ? 0 : "auto"};top:${sy ? "auto" : 0};bottom:${sy ? 0 : "auto"};` +
          `border-${sx ? "right" : "left"}-width:${sx ? 4 : 0}px;border-${sy ? "bottom" : "top"}-width:${sy ? 4 : 0}px;` +
          `border-${sx ? "left" : "right"}-width:0;border-${sy ? "top" : "bottom"}-width:0;`;
        c.style.border = `none`;
        c.style.borderTop = sy ? "none" : `4px solid #E23B3B`;
        c.style.borderBottom = sy ? `4px solid #E23B3B` : "none";
        c.style.borderLeft = sx ? "none" : `4px solid #E23B3B`;
        c.style.borderRight = sx ? `4px solid #E23B3B` : "none";
        c.style.position = "absolute";
        c.style.width = `${L}px`; c.style.height = `${L}px`;
        c.style[sx ? "right" : "left"] = "0";
        c.style[sy ? "bottom" : "top"] = "0";
        div.appendChild(c);
      }
      if (label) {
        const chip = document.createElement("div");
        chip.textContent = label;
        chip.style.cssText = `position:absolute;top:-44px;left:50%;transform:translateX(-50%);` +
          `background:#fff;border:1.6px solid #E23B3B;border-radius:10px;padding:6px 14px;` +
          `font-family:'Andika',system-ui,sans-serif;font-weight:700;color:#E23B3B;font-size:16px;white-space:nowrap;`;
        div.appendChild(chip);
      }
      document.documentElement.appendChild(div);
      marks.set(id, { node: [div], startedAt: performance.now(), drawMs: 120, len: 0, dom: true });
      animate();
    },
    write(text, el, opts = {}, id = "w_" + Date.now()) {
      ensureLayers();
      const r = rectOf(el);
      const div = document.createElement("div");
      div.setAttribute("data-nkap", id);
      div.textContent = text;
      div.style.cssText = `position:fixed;left:${r.cx}px;top:${r.y - 56}px;transform:translate(-50%,0);` +
        `background:rgba(255,255,255,0.94);border-radius:12px;padding:8px 14px;` +
        `font-family:'Andika',system-ui,sans-serif;font-weight:700;color:#12233A;font-size:${opts.size || 22}px;` +
        `white-space:nowrap;z-index:2147483647;pointer-events:none;` +
        `box-shadow:0 3px 10px rgba(11,27,43,0.2);`;
      document.documentElement.appendChild(div);
      marks.set(id, { node: [div], startedAt: performance.now(), drawMs: (text.length * (opts.perLetterMs || 55)), len: 0, dom: true });
      animate();
    },
    caption(text, subFr = null) {
      ensureLayers();
      capLayer.innerHTML = "";
      const main = document.createElement("div");
      main.textContent = text;
      capLayer.appendChild(main);
      if (subFr) {
        const s = document.createElement("div");
        s.textContent = subFr;
        s.style.cssText = "font-size:13px;color:#54677D;margin-top:4px;";
        capLayer.appendChild(s);
      }
    },
    hide(id) {
      const m = marks.get(id);
      if (m) {
        m.node.forEach((n) => n.remove());
        marks.delete(id);
      }
      const dom = document.querySelectorAll(`[data-nkap="${id}"]`);
      dom.forEach((n) => n.remove());
    },
    clear() {
      ensureLayers();
      svg.innerHTML = "";
      marks.clear();
      capLayer.innerHTML = "";
      document.querySelectorAll("[data-nkap]").forEach((n) => n.remove());
    },

    // ---- bulle assistant (SEULE couche tactile, équivalent Android 140px) ---
    bubble(onTap) {
      if (bubbleEl) {
        if (onTap) bubbleEl.__nkapTap = onTap;
        return bubbleEl;
      }
      bubbleEl = document.createElement("div");
      bubbleEl.id = "nkap-bubble";
      bubbleEl.textContent = "nkap";
      bubbleEl.title = "nkapmobile — appuie : parcours suivant (P1 → P2 → P3 → P5)";
      bubbleEl.style.cssText =
        "position:fixed;right:18px;bottom:18px;width:62px;height:62px;border-radius:50%;" +
        "background:#0AB4FF;color:#fff;display:flex;align-items:center;justify-content:center;" +
        "font-family:'Andika',system-ui,sans-serif;font-weight:700;font-size:15px;" +
        "border:3px solid rgba(255,255,255,0.92);box-shadow:0 6px 18px rgba(11,120,180,0.45);" +
        "z-index:2147483647;pointer-events:auto;cursor:pointer;user-select:none;transition:transform 0.14s;";
      bubbleEl.__nkapTap = onTap || (() => {});
      bubbleEl.addEventListener("click", () => {
        bubbleEl.style.transform = "scale(0.9)";
        setTimeout(() => (bubbleEl.style.transform = "scale(1)"), 140);
        try {
          bubbleEl.__nkapTap();
        } catch (e) {
          console.log("[nkap] bulle:", e.message);
        }
      });
      document.documentElement.appendChild(bubbleEl);
      return bubbleEl;
    },
  };
})();
