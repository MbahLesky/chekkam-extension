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
- **Right-click a video, audio clip, image, or public post link** → "Check
  this media source with Chekkam" → Chekkam checks whether that URL is a
  verified official publisher source (including BBC and CRTV domains, plus
  organisations registered by Chekkam). A source match is deliberately not
  presented as proof that every claim in the media is true. Browser extensions
  work on desktop pages; native mobile apps do not permit browser extensions,
  so the Android Chekkam app handles those through its system Share target.
- **Click the toolbar icon** for the popup: paste a message and press Check.
- **Inline social-feed badges (FR-093, opt-in, off by default)** — enable
  "Show a Check button on Facebook/X/TikTok posts" in the popup and a small
  "Check with Chekkam" button appears next to posts as you scroll those
  three sites (desktop web only — this cannot and does not run inside their
  native mobile apps, which sandbox extensions out entirely). A second
  opt-in toggle, "Auto-flag suspicious posts while scrolling", additionally
  runs a check on every newly-visible post automatically and only adds a
  badge when the result comes back medium/high/critical risk — it flags
  suspicious posts, it doesn't label every post you scroll past. Auto-flag
  checks are throttled to roughly one every 2.5 seconds so it stays well
  inside the existing per-IP rate limit.

  Selector caveat: X/Twitter's `data-testid="tweet"`/`"tweetText"` attributes
  are long-standing and community-documented, so that integration is the
  most likely to keep working as-is. Facebook's `[role="article"]` is a
  stable ARIA landmark, but Facebook has no equivalent stable text selector,
  so the post's full `innerText` is used as a best-effort fallback. TikTok's
  `data-e2e` attributes are the least stable of the three and change more
  often. All three selectors are unverified against live, current production
  markup — this was proven against a local fixture mirroring X's real DOM
  shape (manual button + auto-flag badge both confirmed working end-to-end,
  including a real backend check call), not against facebook.com/x.com/
  tiktok.com themselves. If a selector stops matching after a platform
  redesign, the fix is a one-line update to `PLATFORM_CONFIG` in
  `social-badges.js` — the detection/check/render mechanism itself doesn't
  need to change.

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
manifest.json      Manifest V3 config — permissions, icons, background/popup/content-script entry points
background.js      Service worker: registers context menus, calls /api/extension/check,
                    /api/extension/verify-document, and /api/media/check
result-card.js      Injected into the active tab to render the result card
                    (content-check, document-verification, and media-source badges)
social-badges.js    Declarative content script on facebook.com/x.com/twitter.com/tiktok.com
                    (FR-093, opt-in) — per-post Check button + auto-flag mode
popup.html/popup.js Toolbar popup: paste-a-message-to-check box, backend URL, social-badges opt-in toggles
result.css          Shared brand-styled result/badge CSS (popup, injected card, and inline social badges)
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
- "Check this media source" sends only the clicked public media/link URL. It
  does not upload the page, video, or private messages, and returns source
  provenance separately from any AI-generation assessment.
- Every content check is logged as an `extension`-channel report for campaign
  detection, same as any other channel — see `../chekkam-backend`'s
  `DOCUMENTATION.md`. Document verification only reads the existing
  verification registry; it does not create a report.
- Inline social-feed badges are off by default and never scrape private
  messages/DMs — the content script only targets public feed post
  containers. Auto-flag mode sends the same post text a manual click would
  send; it does not read anything beyond what's already visible on screen.
