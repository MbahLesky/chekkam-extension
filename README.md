# Chekkam Browser Extension

A Manifest V3 Chrome/Edge extension that lets you right-click a link, selected
text, or the current page and check it with Chekkam — the same
`analyzeContent()` engine used by the mobile app, WhatsApp, and Telegram.

Ships **load-unpacked only** for testing (Phase 2 spec §6.3, §1.1). Chrome Web
Store / Edge Add-ons store submission is out of scope for now.

## Install for testing

1. Open `chrome://extensions` (or `edge://extensions` in Edge).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `chekkam-extension/` folder.
4. The Chekkam icon (the red/orange check mark) appears in your toolbar. By
   default it talks to the deployed backend at
   `https://chekkam-backend-production.up.railway.app` — no local server
   needed to try it.

Edge uses the same Manifest V3 format and loads unpacked extensions the same
way — no changes needed to use this folder there instead.

## Using it

- **Right-click a link** → "Check this link with Chekkam" → a result card
  appears in the top-right of the page.
- **Select some text, right-click** → "Check selected text with Chekkam".
- **Right-click anywhere on a page** → "Check this page with Chekkam" — this
  sends only the page's URL, never its HTML content (privacy by design).
- **Right-click a PDF/image link** (a signed certificate, a scanned document)
  → "Verify this document with Chekkam" — fetches the file server-side,
  hashes it, and runs the exact same document-verification engine as the web
  and mobile apps, returning Genuine, Tampered, Revoked, Expired, or Not
  found (never colour alone — every result has an icon and text label too).
- **Click the toolbar icon** for the popup: paste a message and press Check.

Every content-check result card shows the risk level, the top reason, the
recommended action, and a note that it's pending human review — never
presented as a final verdict. Document-verification results are a
cryptographic check, not an AI judgement, and are labelled as such.

## Pointing at a different backend

By default the extension calls the deployed production backend. To point it
at a local dev server instead (`npm run dev` in `../chekkam-backend`, default
`http://localhost:3000`):

1. Open the popup, expand **"Backend URL (dev only)"**, enter the URL, and
   click Save (stored via `chrome.storage.sync`, no manifest edit needed for
   this — `http://localhost:3000` and `http://127.0.0.1:3000` are already in
   `host_permissions`).
2. If you point it at some other domain not already declared, add it to
   `host_permissions` in `manifest.json`, e.g.:
   ```json
   "host_permissions": [
     "http://localhost:3000/*",
     "http://127.0.0.1:3000/*",
     "https://chekkam-backend-production.up.railway.app/*",
     "https://your-backend-domain.example.com/*"
   ]
   ```
   Then reload the extension from `chrome://extensions`.

## Files

```
manifest.json      Manifest V3 config — permissions, icons, background/popup entry points
background.js      Service worker: registers context menus, calls /api/extension/check
                    and /api/extension/verify-document
result-card.js      Injected into the active tab to render the result card
                    (content-check risk badges and document-verification badges)
popup.html/popup.js Toolbar popup: paste-a-message-to-check box
result.css          Shared brand-styled result card CSS (used by both the popup and the injected card)
icons/              16/48/128px Chekkam check-in-circle icon
```

## Privacy

- "Check this page" sends only the URL, never the page's HTML or any other
  page content.
- "Verify this document" sends only the clicked link/image URL; the backend
  fetches and hashes the file server-side (with SSRF protections — private
  and internal addresses are refused) and never stores the file itself.
- No API key or account needed — both checks are free citizen-tier features,
  rate-limited server-side by IP (Phase 2 spec §6.1).
- Every content check is logged as an `extension`-channel report for campaign
  detection, same as any other channel — see `../chekkam-backend`'s
  `DOCUMENTATION.md`. Document verification only reads the existing
  verification registry; it does not create a report.
