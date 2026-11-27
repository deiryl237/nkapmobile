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
