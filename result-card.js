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

  // Icon + colour + text on every badge — colour alone is never the signal
  // (CLAUDE.md rule 9), mirroring components/ui/StatusBadge.tsx's tones.
  const RISK_BADGE = {
    low: { tone: "low", icon: "✓", label: "Low risk" },
    medium: { tone: "medium", icon: "⚠", label: "Medium risk" },
    high: { tone: "high", icon: "⛔", label: "High risk" },
    critical: { tone: "high", icon: "⛔", label: "Critical risk" },
  };

  // Tones mirror lib/verify-status-style.ts's hero display: revoked is
  // withdrawn-but-not-proven-fraudulent (neutral), tampered is the alarming
  // red state.
  const DOCUMENT_BADGE = {
    genuine: { tone: "low", icon: "✓", label: "Genuine" },
    tampered: { tone: "high", icon: "✕", label: "Tampered" },
    revoked: { tone: "neutral", icon: "⊘", label: "Revoked" },
    expired: { tone: "medium", icon: "⏱", label: "Expired" },
    not_found: { tone: "neutral", icon: "?", label: "Not found" },
  };

  const MEDIA_BADGE = {
    verified: { tone: "low", icon: "✓", label: "Official source verified" },
    unverified: { tone: "neutral", icon: "?", label: "Source not verified" },
  };

  function badgeHtml({ tone, icon, label }) {
    return `<span class="chekkam-badge chekkam-badge-${tone}"><span aria-hidden="true">${icon}</span>${escapeHtml(label)}</span>`;
  }

  function renderRiskResult(result) {
    const badge = RISK_BADGE[result.risk_level] || RISK_BADGE.medium;
    const topReason = (result.reasons && result.reasons[0]) || "";
    return `
      ${badgeHtml(badge)}
      <div class="chekkam-card-body">${escapeHtml(topReason)}</div>
      <div class="chekkam-card-action">${escapeHtml(result.recommended_action)}</div>
      <div class="chekkam-card-note">Not a verdict — pending human review by a Chekkam analyst.</div>
    `;
  }

  function renderDocumentResult(result) {
    const badge = DOCUMENT_BADGE[result.status] || DOCUMENT_BADGE.not_found;
    const details = [];
    if (result.institution) details.push(result.institution);
    if (result.document_type) details.push(result.document_type);
    if (result.status === "revoked" && result.reason) details.push(`Reason: ${result.reason}`);
    if (result.status === "expired" && result.expiry_date) {
      details.push(`Expired ${new Date(result.expiry_date).toLocaleDateString()}`);
    }
    return `
      ${badgeHtml(badge)}
      <div class="chekkam-card-body">${escapeHtml(details.join(" · "))}</div>
      <div class="chekkam-card-note">Cryptographic verification result — not an AI judgement.</div>
    `;
  }

  function renderMediaResult(result) {
    const source = result.source || null;
    const verified = source?.status === "verified_official_source";
    const badge = verified ? MEDIA_BADGE.verified : MEDIA_BADGE.unverified;
    const sourceDetail = source?.detail || "No original public source was available to check.";
    const ai = result.ai_generation || {};
    const aiDetails = Array.isArray(ai.detail) ? ai.detail.join(" ") : ai.detail;
    const aiDetail = aiDetails || "No AI-generation assessment was made from this link.";
    return `
      ${badgeHtml(badge)}
      <div class="chekkam-card-body">${escapeHtml(sourceDetail)}</div>
      <div class="chekkam-card-action">${escapeHtml(result.recommended_action || "Check the original publication and its context before sharing.")}</div>
      <div class="chekkam-card-note">${escapeHtml(aiDetail)} A source match confirms where the link was published; it does not prove every claim in the media.</div>
    `;
  }

  function renderCard(result, error, kind) {
    const existing = document.getElementById("chekkam-result-card");
    if (existing) existing.remove();

    const card = document.createElement("div");
    card.id = "chekkam-result-card";
    card.className = "chekkam-result-card";

    let body;
    if (error) {
      body = `
        ${badgeHtml({ tone: "error", icon: "⚠", label: "Couldn't check" })}
        <div class="chekkam-card-body">${escapeHtml(error)}</div>
      `;
    } else if (kind === "document") {
      body = renderDocumentResult(result);
    } else if (kind === "media") {
      body = renderMediaResult(result);
    } else {
      body = renderRiskResult(result);
    }

    card.innerHTML = `
      <div class="chekkam-card-header">
        <span class="chekkam-card-title">Chekkam</span>
        <button class="chekkam-card-close" aria-label="Close">×</button>
      </div>
      ${body}
    `;

    document.body.appendChild(card);
    card.querySelector(".chekkam-card-close").addEventListener("click", () => card.remove());
    setTimeout(() => card.remove(), 20000);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "CHEKKAM_SHOW_RESULT") {
      renderCard(message.result, message.error, message.kind);
    }
  });
})();
