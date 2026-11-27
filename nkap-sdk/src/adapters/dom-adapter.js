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
