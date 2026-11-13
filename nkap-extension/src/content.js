/**
 * M4 web — le fournisseur de contexte + la couche de traduction passive.
 *
 * 1. Traduction (couverture) : remplace les textes présents dans le lexique
 *    VALIDÉ, jamais les nœuds à chiffres (integrité), original préservé.
 * 2. MutationObserver : détecte le contenu inédit injecté — « sans hook dédié »
 *    (exigence du protocole Safinum) → traduit et notifie le cerveau.
 * 3. Soumissions : expose window.NKAP_SUBMIT(values) — le protocole exact du
 *    comité sera branché ici dès communication (adaptateur isolé).
 * 4. Cibles nommées : expose window.NKAP_QUERY(text) → élément DOM (pour le
 *    cerveau : même rôle que node_id sur Android).
 */

(function () {
  if (window.__NKAP_CONTENT__) return;
  window.__NKAP_CONTENT__ = true;

  let ewondoOn = false; // toggle popup — OFF par défaut (lexique à valider)
  const restored = new WeakMap(); // node → texte original

  const trackable = (el) =>
    el &&
    el.children.length === 0 && // nœuds texte feuilles uniquement
    el.textContent.trim().length >= 3 &&
    el.offsetParent !== null; // visible

  // ---- 1. couche de traduction ------------------------------------------

  function translateNode(el) {
    if (!ewondoOn) return false;
    const text = el.textContent.trim();
    if (window.NKAP_LEXICON.hasDigits(text)) return false; // montants intacts
    const entry = window.NKAP_LEXICON.exactMatch(text);
    if (!entry) return false;
    if (!restored.has(el)) restored.set(el, el.textContent);
    el.textContent = entry.ewo;
    el.setAttribute("data-nkap-translated", entry.key);
    return true;
  }

  function translateVisible() {
    let changed = 0;
    document
      .querySelectorAll("h1,h2,h3,h4,p,span,label,button,a,li,td,div")
      .forEach((el) => {
        if (trackable(el) && translateNode(el)) changed++;
      });
    return changed;
  }

  function restoreAll() {
    restored.forEach((orig, el) => {
      if (el.isConnected) el.textContent = orig;
    });
    restored.clear();
    window.NKAP_OVERLAY.clear();
  }

  // ---- 2. MutationObserver (contenu inédit, sans hook dédié) -------------

  const mo = new MutationObserver((mutations) => {
    let newNodes = 0;
    for (const m of mutations) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.id === "nkap-overlay-host" || n.closest?.("#nkap-overlay-host")) return;
        if (trackable(n)) {
          if (translateNode(n)) newNodes++;
          // contenu inédit → prévenir le cerveau (I3) pour l'explication vocale
          window.NKAP_ASSISTANT?.onUnseenContent(n.textContent.trim());
        }
        n.querySelectorAll?.("h1,h2,h3,p,span,label,button,td,div").forEach((c) => {
          if (trackable(c)) {
            if (translateNode(c)) newNodes++;
          }
        });
      });
    }
    if (newNodes > 0) console.log("[nkap] contenu inédit traduit:", newNodes);
  });

  // ---- 3. soumissions (adaptateur — protocole comité à confirmer) --------

  window.NKAP_SUBMIT = function (values) {
    // Protocole exact du comité à brancher ici (API/localStorage/postMessage).
    // En attendant : journal local consultable dans la console.
    const log = JSON.parse(localStorage.getItem("nkap-submissions") || "[]");
    log.push({ at: new Date().toISOString(), values });
    localStorage.setItem("nkap-submissions", JSON.stringify(log));
    console.log("[nkap] soumission:", values);
  };

  window.NKAP_QUERY = function (textFragment) {
    const els = Array.from(document.querySelectorAll("*")).filter(
      (el) => trackable(el) && el.textContent.includes(textFragment)
    );
    return els[0] || null;
  };

  window.NKAP_SETTINGS = {
    get ewondo() { return ewondoOn; },
    set ewondo(v) {
      ewondoOn = !!v;
      if (!ewondoOn) restoreAll();
      else translateVisible();
    },
  };

  // ---- réglages du popup ------------------------------------------------

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "settings") {
      ewondoOn = !!msg.ewondoOn;
      if (!ewondoOn) restoreAll(); else translateVisible();
      if (msg.brainUrl) window.NKAP_ASSISTANT?.setBrainUrl(msg.brainUrl);
    }
  });

  // ---- démarrage ---------------------------------------------------------

  function start() {
    chrome.storage?.sync?.get({ ewondoOn: false, brainUrl: "" }, (cfg) => {
      ewondoOn = !!cfg.ewondoOn;
      if (ewondoOn) translateVisible();
      mo.observe(document.body, { childList: true, subtree: true });
      if (cfg.brainUrl) window.NKAP_ASSISTANT?.setBrainUrl(cfg.brainUrl);
      // la bulle assistant — SEULE couche tactile de l'overlay (équivalent Android)
      window.NKAP_OVERLAY?.bubble?.(() => window.NKAP_ASSISTANT?.next());
      console.log("[nkap] content script prêt — ewondo:", ewondoOn);
    });
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
