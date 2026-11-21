const promptButtons = document.querySelectorAll("[data-prompt]");
const input = document.getElementById("chatInput");
const form = document.getElementById("chatForm");
const messages = document.getElementById("chatMessages");
const clearButton = document.getElementById("clearChat");

promptButtons.forEach(button => {
  button.addEventListener("click", () => {
    if (!input) return;
    input.value = button.dataset.prompt || "";
    input.focus();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

form?.addEventListener("submit", event => {
  event.preventDefault();
  // The secure AI service is intentionally not connected in this UI-only phase.
});

clearButton?.addEventListener("click", () => {
  if (!messages) return;
  messages.innerHTML = '<article class="message assistant-message"><div class="message-avatar"><i data-lucide="sparkles"></i></div><div class="message-body"><span class="message-author">Spark AI <small>LEARNING COMPANION</small></span><div class="message-bubble"><strong>Fresh start.</strong><p>Your conversation preview has been cleared. Live AI tutoring will be enabled after the secure service is connected.</p></div></div></article>';
  window.lucide?.createIcons();
});
