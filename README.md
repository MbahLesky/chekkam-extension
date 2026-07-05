# Chekkam Browser Extension

A Manifest V3 Chrome/Edge extension that lets you right-click a link, selected
text, or the current page and check it with Chekkam — the same
`analyzeContent()` engine used by the mobile app, WhatsApp, and Telegram.

Ships **load-unpacked only** for testing (Phase 2 spec §6.3, §1.1). Chrome Web
Store / Edge Add-ons store submission is out of scope for now.

## Install for testing

1. Make sure the backend (`../chekkam-backend`) is running — `npm run dev`
   from that folder, default `http://localhost:3000`.
2. Open `chrome://extensions` (or `edge://extensions` in Edge).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this `chekkam-extension/` folder.
5. The Chekkam icon (checkmark in a teal circle) appears in your toolbar.

Edge uses the same Manifest V3 format and loads unpacked extensions the same
way — no changes needed to use this folder there instead.

## Using it

- **Right-click a link** → "Check this link with Chekkam" → a result card
  appears in the top-right of the page.
- **Select some text, right-click** → "Check selected text with Chekkam".
- **Right-click anywhere on a page** → "Check this page with Chekkam" — this
  sends only the page's URL, never its HTML content (privacy by design).
- **Click the toolbar icon** for the popup: paste a message and press Check.

Every result card shows the risk level, the top reason, the recommended
action, and a note that it's pending human review — never presented as a
final verdict.

## Pointing at a different backend

By default the extension calls `http://localhost:3000`. To point it at a
deployed backend:

1. Open the popup, expand **"Backend URL (dev only)"**, enter the URL, and
   click Save (stored via `chrome.storage.sync`, no manifest edit needed for
   this).
2. If the backend is on a different domain than the ones already declared,
   also add it to `host_permissions` in `manifest.json`, e.g.:
   ```json
   "host_permissions": [
     "http://localhost:3000/*",
     "http://127.0.0.1:3000/*",
     "https://your-backend-domain.example.com/*"
   ]
   ```
   Then reload the extension from `chrome://extensions`.

## Files

```
manifest.json      Manifest V3 config — permissions, icons, background/popup entry points
background.js      Service worker: registers context menus, calls /api/extension/check
result-card.js      Injected into the active tab to render the result card
popup.html/popup.js Toolbar popup: paste-a-message-to-check box
result.css          Shared brand-styled result card CSS (used by both the popup and the injected card)
icons/              16/48/128px Chekkam check-in-circle icon
```

## Privacy

- "Check this page" sends only the URL, never the page's HTML or any other
  page content.
- No API key or account needed — this is the free citizen-tier check,
  rate-limited server-side by IP (Phase 2 spec §6.1).
- Every check is logged as an `extension`-channel report for campaign
  detection, same as any other channel — see `../chekkam-backend`'s
  `DOCUMENTATION.md`.
