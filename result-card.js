// Injected into the active tab to render the brand-styled result card
// (P2-33). Loaded via chrome.scripting.executeScript, listens once for the
// result message sent right after injection.
(function () {
  if (window.__chekkamListenerAttached) return;
  window.__chekkamListenerAttached = true;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function renderCard(result, error) {
    const existing = document.getElementById("chekkam-result-card");
    if (existing) existing.remove();

    const card = document.createElement("div");
    card.id = "chekkam-result-card";
    card.className = "chekkam-result-card";

    if (error) {
      card.innerHTML = `
        <div class="chekkam-card-header">
          <span class="chekkam-card-title">Chekkam</span>
          <button class="chekkam-card-close" aria-label="Close">×</button>
        </div>
        <span class="chekkam-badge chekkam-badge-error">Couldn't check</span>
        <div class="chekkam-card-body">${escapeHtml(error)}</div>
      `;
    } else {
      const level = result.risk_level || "medium";
      const label = level.charAt(0).toUpperCase() + level.slice(1) + " risk";
      const topReason = (result.reasons && result.reasons[0]) || "";
      card.innerHTML = `
        <div class="chekkam-card-header">
          <span class="chekkam-card-title">Chekkam</span>
          <button class="chekkam-card-close" aria-label="Close">×</button>
        </div>
        <span class="chekkam-badge chekkam-badge-${escapeHtml(level)}">${escapeHtml(label)}</span>
        <div class="chekkam-card-body">${escapeHtml(topReason)}</div>
        <div class="chekkam-card-action">${escapeHtml(result.recommended_action)}</div>
        <div class="chekkam-card-note">Not a verdict — pending human review by a Chekkam analyst.</div>
      `;
    }

    document.body.appendChild(card);
    card.querySelector(".chekkam-card-close").addEventListener("click", () => card.remove());
    setTimeout(() => card.remove(), 20000);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "CHEKKAM_SHOW_RESULT") {
      renderCard(message.result, message.error);
    }
  });
})();
