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

function renderResult(result, error) {
  resultContainer.innerHTML = "";
  const card = document.createElement("div");
  card.className = "chekkam-result-card";

  if (error) {
    card.innerHTML = `
      <span class="chekkam-badge chekkam-badge-error">Couldn't check</span>
      <div class="chekkam-card-body">${escapeHtml(error)}</div>
    `;
  } else {
    const level = result.risk_level || "medium";
    const label = level.charAt(0).toUpperCase() + level.slice(1) + " risk";
    const topReason = (result.reasons && result.reasons[0]) || "";
    card.innerHTML = `
      <span class="chekkam-badge chekkam-badge-${escapeHtml(level)}">${escapeHtml(label)}</span>
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
