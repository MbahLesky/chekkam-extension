// Inline social-feed badges (FR-093) — desktop web only, fully opt-in.
// Adds a small "Check" control next to posts on Facebook/X/TikTok feeds, and
// an optional auto-flag mode that badges suspicious posts while scrolling.
// This cannot and does not run inside native mobile apps (OS sandboxing);
// never claim otherwise (SRS FR-093).
//
// Selector note: [data-testid="tweet"]/[data-testid="tweetText"] on X are
// long-standing, community-documented attributes. Facebook's [role="article"]
// is an ARIA landmark rather than a styling hook, so it's comparatively
// stable, but Facebook doesn't expose an equivalent stable text selector —
// this falls back to the article's innerText. TikTok's [data-e2e="..."]
// attributes are the least stable of the three (TikTok changes them often)
// and are best-effort. All three are unverified against live production
// markup in this environment — see README's FR-093 section.
(function () {
  if (window.__chekkamSocialBadgesAttached) return;
  window.__chekkamSocialBadgesAttached = true;

  const PLATFORM_CONFIG = {
    "facebook.com": { postSelector: 'div[role="article"]', textSelector: null },
    "x.com": { postSelector: 'article[data-testid="tweet"]', textSelector: '[data-testid="tweetText"]' },
    "twitter.com": { postSelector: 'article[data-testid="tweet"]', textSelector: '[data-testid="tweetText"]' },
    "tiktok.com": {
      postSelector: '[data-e2e="recommend-list-item-container"], [data-e2e="video-desc"]',
      textSelector: '[data-e2e="video-desc"]',
    },
  };

  function currentConfig() {
    const host = location.hostname.replace(/^www\.|^m\./, "");
    const key = Object.keys(PLATFORM_CONFIG).find((k) => host === k || host.endsWith("." + k));
    return key ? PLATFORM_CONFIG[key] : null;
  }

  function postText(el, config) {
    const textEl = config.textSelector && el.querySelector(config.textSelector);
    const raw = (textEl || el).innerText || "";
    return raw.trim().slice(0, 4000);
  }

  const RISK_BADGE = {
    low: { tone: "low", icon: "✓", label: "Low risk" },
    medium: { tone: "medium", icon: "⚠", label: "Medium risk" },
    high: { tone: "high", icon: "⛔", label: "High risk" },
    critical: { tone: "high", icon: "⛔", label: "Critical risk" },
  };

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function renderInlineResult(container, result, error) {
    container.innerHTML = "";
    if (error) {
      container.innerHTML = `<span class="chekkam-badge chekkam-badge-error"><span aria-hidden="true">⚠</span>Couldn't check</span>`;
      return;
    }
    const badge = RISK_BADGE[result.risk_level] || RISK_BADGE.medium;
    const topReason = (result.reasons && result.reasons[0]) || "";
    container.innerHTML = `
      <span class="chekkam-badge chekkam-badge-${badge.tone}" title="${escapeHtml(topReason)} — not a verdict, pending human review">
        <span aria-hidden="true">${badge.icon}</span>${escapeHtml(badge.label)}
      </span>
    `;
  }

  function checkContent(content) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "CHEKKAM_CHECK_CONTENT", content, contentType: "text" }, (response) => {
        if (!response) return reject(new Error("No response from Chekkam."));
        if (response.ok) resolve(response.result);
        else reject(new Error(response.error || "Check failed."));
      });
    });
  }

  function attachControl(post, config) {
    if (post.dataset.chekkamProcessed) return;
    post.dataset.chekkamProcessed = "true";

    const wrapper = document.createElement("span");
    wrapper.className = "chekkam-inline-wrapper";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chekkam-inline-check-btn";
    button.textContent = "Check with Chekkam";
    const resultSlot = document.createElement("span");
    resultSlot.className = "chekkam-inline-result";
    wrapper.appendChild(button);
    wrapper.appendChild(resultSlot);
    post.prepend(wrapper);

    button.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      button.disabled = true;
      button.textContent = "Checking…";
      try {
        const result = await checkContent(postText(post, config));
        renderInlineResult(resultSlot, result, null);
      } catch (err) {
        renderInlineResult(resultSlot, null, err.message);
      } finally {
        button.remove();
      }
    });

    return { post, resultSlot, config };
  }

  // Auto-flag mode: only ever badges a post automatically if the result
  // comes back medium/high/critical — it flags suspicious posts, it doesn't
  // label every post (that would be noisy and isn't what "auto-flag" means).
  // Throttled to one request roughly every 2.5s to stay well inside the
  // existing 30-per-10-minutes IP rate limit on /api/extension/check.
  const autoQueue = [];
  let autoRunning = false;
  async function drainAutoQueue() {
    if (autoRunning) return;
    autoRunning = true;
    while (autoQueue.length) {
      const { post, config } = autoQueue.shift();
      try {
        const text = postText(post, config);
        if (text.length > 10) {
          const result = await checkContent(text);
          if (["medium", "high", "critical"].includes(result.risk_level)) {
            const badge = document.createElement("span");
            badge.className = "chekkam-inline-autoflag";
            renderInlineResult(badge, result, null);
            post.prepend(badge);
          }
        }
      } catch {
        // Auto-flag is best-effort background enrichment — a single failed
        // check should never interrupt scrolling or surface an error to the user.
      }
      await new Promise((r) => setTimeout(r, 2500));
    }
    autoRunning = false;
  }

  function observeForAutoFlag(post, config) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !post.dataset.chekkamAutoQueued) {
          post.dataset.chekkamAutoQueued = "true";
          autoQueue.push({ post, config });
          drainAutoQueue();
          io.disconnect();
        }
      }
    });
    io.observe(post);
  }

  async function init() {
    const config = currentConfig();
    if (!config) return;

    const { socialBadgesEnabled, socialAutoFlagEnabled } = await chrome.storage.sync.get([
      "socialBadgesEnabled",
      "socialAutoFlagEnabled",
    ]);
    if (!socialBadgesEnabled) return; // fully opt-in — off by default (SRS FR-093)

    function scan(root) {
      const posts = root.querySelectorAll(config.postSelector);
      const all = root.matches?.(config.postSelector) ? [root, ...posts] : [...posts];
      all.forEach((post) => {
        const attached = attachControl(post, config);
        if (attached && socialAutoFlagEnabled) observeForAutoFlag(post, config);
      });
    }

    scan(document);
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === 1) scan(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
