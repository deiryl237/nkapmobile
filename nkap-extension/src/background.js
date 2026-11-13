/** Réglages partagés (popup ↔ content scripts). */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get({ ewondoOn: false, brainUrl: "" }, (cfg) => {
    chrome.storage.sync.set(cfg);
  });
});

chrome.action.onClicked?.addListener?.(() => {});
