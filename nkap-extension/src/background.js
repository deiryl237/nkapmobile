/** Réglages partagés (popup ↔ content scripts). */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ ewondoOn: false, brainUrl: "" }, (cfg) => {
    chrome.storage.sync.set(cfg);
  });
});

chrome.action.onClicked?.addListener?.(() => {});

// Relais HTTP pour le serveur cerveau local (évite le blocage Mixed Content HTTPS -> HTTP)
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "nkap_brain_answer") return false;
  const base = String(msg.url || "").trim().replace(/\/+$/, "");
  if (!base) {
    sendResponse({ ok: false, error: "missing_url" });
    return false;
  }
  fetch(base + "/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(msg.payload || {}),
  })
    .then(async (res) => {
      const data = await res.json().catch(() => null);
      sendResponse({ ok: res.ok, status: res.status, data });
    })
    .catch((err) => {
      sendResponse({ ok: false, error: String(err) });
    });
  return true;
});
