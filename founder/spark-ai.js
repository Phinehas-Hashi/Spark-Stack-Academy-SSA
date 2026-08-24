import { askAI } from "./js/groq.js";

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const typingIndicator = document.getElementById("typingIndicator");
const clearChatBtn = document.getElementById("clearChat");
const founderInsight = document.getElementById("founderInsight");

const SYSTEM_PROMPT = `You are Spark AI, the Founder Intelligence System for The Spark Stack Academy. Help the Founder monitor, analyze and improve the academy. Provide founder briefings, academy insights, growth analysis, instructor activity summaries, enrollment trends, business strategy, product roadmap discussions, executive summaries and platform recommendations. Do not generate lessons, quizzes, courses or instructor content. Answer professionally, clearly and concisely.`;
let conversation = [{ role: "system", content: SYSTEM_PROMPT }];

const escapeHTML = value => String(value ?? "").replace(/[&<>\"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[char]));
const scrollToBottom = () => requestAnimationFrame(() => { chatMessages.scrollTop = chatMessages.scrollHeight; });
const showTyping = () => { typingIndicator?.classList.add("active"); scrollToBottom(); };
const hideTyping = () => typingIndicator?.classList.remove("active");
const currentTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function addUserMessage(text) {
  const message = document.createElement("div");
  message.className = "message user-message";
  message.innerHTML = `<div class="message-avatar">👤</div><div class="message-content"><p>${escapeHTML(text)}</p><div class="message-footer"><span class="message-time">You • ${currentTime()}</span></div></div>`;
  chatMessages.appendChild(message);
  scrollToBottom();
}

function addAIMessage(text) {
  const message = document.createElement("div");
  message.className = "message ai-message";
  message.innerHTML = `<div class="message-avatar">✨</div>`;
  const content = document.createElement("div");
  content.className = "message-content ai-content";
  if (window.marked) content.innerHTML = marked.parse(String(text ?? ""));
  else content.textContent = String(text ?? "");
  const footer = document.createElement("div");
  footer.className = "message-footer";
  footer.innerHTML = `<span class="message-time">Spark AI • ${currentTime()}</span><button class="copy-btn" type="button">Copy</button>`;
  content.appendChild(footer);
  message.appendChild(content);
  chatMessages.appendChild(message);
  scrollToBottom();
}

function trimConversation() {
  const limit = 20;
  if (conversation.length > limit) conversation = [conversation[0], ...conversation.slice(-(limit - 1))];
}

async function sendMessage(text) {
  const prompt = String(text || "").trim();
  if (!prompt) return;
  addUserMessage(prompt);
  conversation.push({ role: "user", content: prompt });
  chatInput.value = "";
  chatInput.style.height = "56px";
  showTyping();
  try {
    const reply = await askAI(conversation);
    hideTyping();
    addAIMessage(reply);
    conversation.push({ role: "assistant", content: reply });
    trimConversation();
    if (founderInsight) founderInsight.textContent = "Spark AI has analyzed your latest request and updated founder context.";
  } catch (error) {
    hideTyping();
    addAIMessage("I couldn't reach Spark AI right now. Please try again.");
    console.error("Spark AI request failed:", error);
  }
}

chatForm?.addEventListener("submit", event => { event.preventDefault(); sendMessage(chatInput.value); });

const quickCommands = {
  dailyBriefBtn: "Give me today's founder briefing for The Spark Stack Academy.",
  academyHealthBtn: "Analyze the current health of the academy based on available information.",
  growthBtn: "Suggest practical ways to increase student growth and engagement.",
  roadmapBtn: "Recommend the next milestones for The Spark Stack Academy and Spark Stack ecosystem."
};
Object.entries(quickCommands).forEach(([id, prompt]) => document.getElementById(id)?.addEventListener("click", () => sendMessage(prompt)));

document.addEventListener("click", async event => {
  const button = event.target.closest(".copy-btn");
  if (!button) return;
  const content = button.closest(".message-content");
  try {
    await navigator.clipboard.writeText((content?.innerText || "").replace(/\nCopy$/, ""));
    button.textContent = "Copied ✓";
  } catch { button.textContent = "Copy failed"; }
  setTimeout(() => { button.textContent = "Copy"; }, 1500);
});

clearChatBtn?.addEventListener("click", () => {
  chatMessages.replaceChildren();
  conversation = [{ role: "system", content: SYSTEM_PROMPT }];
  if (founderInsight) founderInsight.textContent = "Conversation cleared. Spark AI is ready for a new discussion.";
});

chatInput?.addEventListener("input", () => {
  chatInput.style.height = "56px";
  chatInput.style.height = `${chatInput.scrollHeight}px`;
});

chatInput?.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm?.requestSubmit();
  }
});

window.addEventListener("load", () => { chatInput?.focus(); scrollToBottom(); });