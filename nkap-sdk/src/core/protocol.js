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
