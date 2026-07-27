const contentInput = document.getElementById("content");
const checkButton = document.getElementById("check-button");
const resultContainer = document.getElementById("result-container");
const backendUrlInput = document.getElementById("backend-url");
const saveBackendUrlButton = document.getElementById("save-backend-url");

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function detectType(content) {
  return /^https?:\/\/\S+$/i.test(content.trim()) ? "link" : "text";
}

// Icon + colour + text on every badge — colour alone is never the signal
// (CLAUDE.md rule 9), mirroring result-card.js and components/ui/StatusBadge.tsx.
const RISK_BADGE = {
  low: { tone: "low", icon: "✓", label: "Low risk" },
  medium: { tone: "medium", icon: "⚠", label: "Medium risk" },
  high: { tone: "high", icon: "⛔", label: "High risk" },
  critical: { tone: "high", icon: "⛔", label: "Critical risk" },
};

function badgeHtml({ tone, icon, label }) {
  return `<span class="chekkam-badge chekkam-badge-${tone}"><span aria-hidden="true">${icon}</span>${escapeHtml(label)}</span>`;
}

function renderResult(result, error) {
  resultContainer.innerHTML = "";
  const card = document.createElement("div");
  card.className = "chekkam-result-card";

  if (error) {
    card.innerHTML = `
      ${badgeHtml({ tone: "error", icon: "⚠", label: "Couldn't check" })}
      <div class="chekkam-card-body">${escapeHtml(error)}</div>
    `;
  } else {
    const badge = RISK_BADGE[result.risk_level] || RISK_BADGE.medium;
    const topReason = (result.reasons && result.reasons[0]) || "";
    card.innerHTML = `
      ${badgeHtml(badge)}
      <div class="chekkam-card-body">${escapeHtml(topReason)}</div>
      <div class="chekkam-card-action">${escapeHtml(result.recommended_action)}</div>
      <div class="chekkam-card-note">Not a verdict — pending human review by a Chekkam analyst.</div>
    `;
  }
  resultContainer.appendChild(card);
}

checkButton.addEventListener("click", () => {
  const content = contentInput.value.trim();
  if (!content) return;

  checkButton.disabled = true;
  checkButton.textContent = "Checking...";

  chrome.runtime.sendMessage(
    { type: "CHEKKAM_CHECK_CONTENT", content, contentType: detectType(content) },
    (response) => {
      checkButton.disabled = false;
      checkButton.textContent = "Check";
      if (!response) return;
      if (response.ok) {
        renderResult(response.result, null);
      } else {
        renderResult(null, response.error);
      }
    }
  );
});

chrome.runtime.sendMessage({ type: "CHEKKAM_GET_BACKEND_URL" }, (response) => {
  if (response?.backendUrl) backendUrlInput.value = response.backendUrl;
});

saveBackendUrlButton.addEventListener("click", () => {
  const url = backendUrlInput.value.trim();
  if (!url) return;
  chrome.runtime.sendMessage({ type: "CHEKKAM_SET_BACKEND_URL", backendUrl: url }, () => {
    saveBackendUrlButton.textContent = "Saved!";
    setTimeout(() => (saveBackendUrlButton.textContent = "Save"), 1500);
  });
});

// Social-feed badges opt-in (FR-093) — off by default; auto-flag is nested
// under (and disabled without) the base toggle.
const socialBadgesToggle = document.getElementById("social-badges-toggle");
const socialAutoflagToggle = document.getElementById("social-autoflag-toggle");

chrome.storage.sync.get(["socialBadgesEnabled", "socialAutoFlagEnabled"], (stored) => {
  socialBadgesToggle.checked = !!stored.socialBadgesEnabled;
  socialAutoflagToggle.checked = !!stored.socialAutoFlagEnabled;
  socialAutoflagToggle.disabled = !stored.socialBadgesEnabled;
});

socialBadgesToggle.addEventListener("change", () => {
  socialAutoflagToggle.disabled = !socialBadgesToggle.checked;
  if (!socialBadgesToggle.checked) socialAutoflagToggle.checked = false;
  chrome.storage.sync.set({
    socialBadgesEnabled: socialBadgesToggle.checked,
    socialAutoFlagEnabled: socialAutoflagToggle.checked,
  });
});

socialAutoflagToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ socialAutoFlagEnabled: socialAutoflagToggle.checked });
});
