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
