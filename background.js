// Chekkam extension service worker — context menus + API calls (P2-31, P2-32).
// Defaults to the deployed backend: a real installed extension isn't running
// alongside a local dev server. Anyone developing against a local backend
// changes this from the popup's "Backend URL" field instead.
const DEFAULT_BACKEND_URL = "https://chekkam-backend-production.up.railway.app";

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
  chrome.contextMenus.create({
    id: "chekkam-verify-document",
    title: "Verify this document with Chekkam",
    contexts: ["image", "link"],
    // targetUrlPatterns matches an <img>'s src (image context) or an <a>'s
    // href (link context) — so this only appears for links/images that look
    // like a signed document, not every link on the page.
    targetUrlPatterns: ["*://*/*.pdf", "*://*/*.png", "*://*/*.jpg", "*://*/*.jpeg"],
  });
  chrome.contextMenus.create({
    id: "chekkam-check-media",
    title: "Check this media source with Chekkam",
    // srcUrl is available for images, audio, and video; link catches a
    // public post/video URL where the platform does not expose its media src.
    contexts: ["video", "audio", "image", "link"],
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

/** Calls the free, no-API-key document-verification endpoint for a
 * right-clicked link/image — fetches it server-side, hashes it, and runs
 * the exact same verifyByUpload() engine every other surface uses. */
async function verifyDocument(fileUrl) {
  const backendUrl = await getBackendUrl();
  const response = await fetch(`${backendUrl}/api/extension/verify-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileUrl }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `Chekkam verification failed (HTTP ${response.status}).`);
  }
  return body;
}

/**
 * Checks whether a public media URL belongs to an official Chekkam-verified
 * publisher. This is intentionally not the generic risk engine: it returns a
 * source/AI Trust Report and never represents a publisher match as proof that
 * every claim in a video is true.
 */
async function checkMediaSource(url) {
  const backendUrl = await getBackendUrl();
  const response = await fetch(`${backendUrl}/api/media/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, channel: "extension" }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `Chekkam media check failed (HTTP ${response.status}).`);
  }
  return body;
}

function isPublicHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Injects the brand-styled result card into the page (P2-33).
 * kind is "risk" for a content check or "document" for a verify-document
 * result — result-card.js renders each with its own badge set. */
async function showResultInTab(tabId, result, error, kind) {
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ["result.css"] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ["result-card.js"] });
    await chrome.tabs.sendMessage(tabId, { type: "CHEKKAM_SHOW_RESULT", result, error, kind });
  } catch (err) {
    // Some pages (chrome://, the Web Store, etc.) don't allow script injection —
    // fail quietly rather than showing the user a confusing error there.
    console.warn("Chekkam: could not show result in this page", err);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === "chekkam-verify-document") {
    const fileUrl = info.srcUrl || info.linkUrl;
    if (!fileUrl) return;
    try {
      const result = await verifyDocument(fileUrl);
      await showResultInTab(tab.id, result, null, "document");
    } catch (err) {
      await showResultInTab(tab.id, null, err.message || String(err), "document");
    }
    return;
  }

  if (info.menuItemId === "chekkam-check-media") {
    // A <video> element often exposes a short-lived CDN/blob src instead of
    // its public post URL. Prefer the clicked link, then the page URL, so a
    // registered TikTok/Facebook/official-publisher account can be matched.
    const candidates = [info.linkUrl, info.pageUrl, info.srcUrl];
    const mediaUrl = candidates.find(isPublicHttpUrl);
    if (!mediaUrl) return;
    try {
      const result = await checkMediaSource(mediaUrl);
      await showResultInTab(tab.id, result, null, "media");
    } catch (err) {
      await showResultInTab(tab.id, null, err.message || String(err), "media");
    }
    return;
  }

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
    await showResultInTab(tab.id, result, null, "risk");
  } catch (err) {
    await showResultInTab(tab.id, null, err.message || String(err), "risk");
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
