/**
 * M3/I3 côté extension : l'assistant à la demande. Les parcours imposés sont
 * embarqués (fixtures — même format que le moteur Android) ; le cerveau (M2)
 * peut aussi générer des flux dynamiques via brainUrl.
 */
window.NKAP_ASSISTANT = (() => {
  let brainUrl = "";
  const parcours = ["p1-solde", "p2-frais", "p3-transfert", "p5-erreur"];
  let index = 0;
  let busy = false;

  const O = () => window.NKAP_OVERLAY;
  const Q = (t) => window.NKAP_QUERY(t);
  const ok = (el) => !!el;

  async function loadFixture(id) {
    const url = chrome.runtime.getURL(`fixtures/actions-${id}.json`);
    const res = await fetch(url);
    return res.json();
  }

  /** Résout {"match_text": "..."} → élément DOM réel. */
  function resolveTarget(pos) {
    if (!pos) return null;
    if (pos.match_text) return Q(pos.match_text);
    if (pos.node_id && window.NKAP_QUERY_BY_ID) return window.NKAP_QUERY_BY_ID(pos.node_id);
    return null;
  }

  async function runSteps(steps, i = 0) {
    if (busy) return;
    if (i >= steps.length) {
      busy = false;
      O().clear();
      return;
    }
    busy = true;
    const step = steps[i];
    for (const action of step.do || []) {
      switch (action.t) {
        case "speak":
          O().caption(action.text);
          // mode démo offline : pas d'audio (M3 fournira audio_url)
          break;
        case "circle": {
          const el = resolveTarget(action.target);
          if (el) O().circle(el, action.color, action.duration_ms || 700, action.id);
          break;
        }
        case "underline": {
          const el = resolveTarget(action.target);
          if (el) O().underline(el, action.color, action.duration_ms || 450, action.id);
          break;
        }
        case "arrow": {
          const a = resolveTarget(action.from), b = resolveTarget(action.to);
          if (a && b) O().arrow(a, b, action.color, action.duration_ms || 800, action.id);
          break;
        }
        case "frame": {
          const el = resolveTarget(action.target);
          if (el) O().frame(el, action.label, action.id);
          break;
        }
        case "write": {
          const el = resolveTarget(action.target);
          if (el) O().write(action.text, el, { size: action.size, perLetterMs: action.per_letter_ms }, action.id);
          break;
        }
        case "caption":
          O().caption(action.text, action.sub_fr);
          break;
        case "hide":
          O().hide(action.id);
          break;
        case "clear":
          O().clear();
          break;
      }
    }
    const wait = (step.at_next || 2500);
    setTimeout(() => { busy = false; runSteps(steps, i + 1); }, wait);
  }

  async function playParcours(id) {
    if (busy) return;
    busy = true;
    try {
      const fixture = await loadFixture(id);
      const steps = fixture.steps.map((s, i) => ({
        do: s.do,
        at_next: s.at_next || (fixture.steps[i + 1] ? fixture.steps[i + 1].at - s.at : 2500),
      }));
      O().clear();
      busy = false;
      await runSteps(steps);
      return;
    } catch (e) {
      busy = false;
      O().caption("Fixture introuvable: " + id);
    }
  }

  /** Contenu inédit injecté — prévient le cerveau (I3) pour explication. */
  function onUnseenContent(text) {
    if (!brainUrl) {
      console.log("[nkap] inédit (pas de cerveau):", text);
      O().caption("🆕 " + text.slice(0, 90));
      return;
    }
    fetch(brainUrl + "/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        context: {
          url: location.href,
          texts: Array.from(document.querySelectorAll("h1,h2,p,button,td,span"))
            .filter((e) => e.offsetParent)
            .slice(0, 40)
            .map((e) => e.textContent.trim().slice(0, 90)),
        },
      }),
    })
      .then((r) => r.json())
      .then((stream) => {
        (stream.actions || []).forEach((a, i) => {
          setTimeout(() => {
            if (a.t === "speak" || a.t === "caption") O().caption(a.text);
            else if (a.t === "circle") { const el = Q(a.target?.text || ""); if (el) O().circle(el, a.color); }
            else if (a.t === "underline") { const el = Q(a.target?.text || ""); if (el) O().underline(el, a.color); }
            else if (a.t === "frame") { const el = Q(a.target?.text || ""); if (el) O().frame(el, a.label); }
          }, i * 900);
        });
      })
      .catch((e) => console.log("[nkap] cerveau injoignable:", e.message));
  }

  return {
    next() { playParcours(parcours[index++ % parcours.length]); },
    playParcours,
    onUnseenContent,
    setBrainUrl(u) { brainUrl = u; },
    get brainUrl() { return brainUrl; },
  };
})();
