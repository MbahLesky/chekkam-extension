// Chekkam extension service worker — context menus + API calls (P2-31, P2-32).
const DEFAULT_BACKEND_URL = "http://localhost:3000";

async function getBackendUrl() {
  const { backendUrl } = await chrome.storage.sync.get("backendUrl");
  return backendUrl || DEFAULT_BACKEND_URL;
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "chekkam-check-link",
    title: "Check this link with Chekkam",
    contexts: ["link"],
  });
  chrome.contextMenus.create({
    id: "chekkam-check-selection",
    title: "Check selected text with Chekkam",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "chekkam-check-page",
    title: "Check this page with Chekkam",
    contexts: ["page"],
  });
});

/** Calls the free, no-API-key extension endpoint — same analyzeContent() engine as every other channel. */
async function checkContent(content, type) {
  const backendUrl = await getBackendUrl();
  const response = await fetch(`${backendUrl}/api/extension/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, type }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `Chekkam check failed (HTTP ${response.status}).`);
  }
  return body;
}

/** Injects the brand-styled result card into the page (P2-33). */
async function showResultInTab(tabId, result, error) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["result.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["result-card.js"] });
    await chrome.tabs.sendMessage(tabId, { type: "CHEKKAM_SHOW_RESULT", result, error });
  } catch (err) {
    // Some pages (chrome://, the Web Store, etc.) don't allow script injection —
    // fail quietly rather than showing the user a confusing error there.
    console.warn("Chekkam: could not show result in this page", err);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  let content;
  let type;
  if (info.menuItemId === "chekkam-check-link") {
    content = info.linkUrl;
    type = "link";
  } else if (info.menuItemId === "chekkam-check-selection") {
    content = info.selectionText;
    type = "text";
  } else if (info.menuItemId === "chekkam-check-page") {
    content = info.pageUrl; // URL only — never the page's HTML (privacy)
    type = "page";
  } else {
    return;
  }
  if (!content) return;

  try {
    const result = await checkContent(content, type);
    await showResultInTab(tab.id, result, null);
  } catch (err) {
    await showResultInTab(tab.id, null, err.message || String(err));
  }
});

// Bridge for the popup (P2-34), which has no context-menu info of its own.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CHEKKAM_CHECK_CONTENT") {
    checkContent(message.content, message.contentType)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true; // keep the message channel open for the async response
  }
  if (message?.type === "CHEKKAM_GET_BACKEND_URL") {
    getBackendUrl().then((backendUrl) => sendResponse({ backendUrl }));
    return true;
  }
  if (message?.type === "CHEKKAM_SET_BACKEND_URL") {
    chrome.storage.sync.set({ backendUrl: message.backendUrl }).then(() => sendResponse({ ok: true }));
    return true;
  }
  return undefined;
});
