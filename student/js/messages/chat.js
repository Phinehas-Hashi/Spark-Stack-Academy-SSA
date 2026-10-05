import { auth } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getMessages, sendMessage, subscribeToMessages, subscribeToReadReceipts, markConversationRead, getProfileByFirebaseUid, getConversationPeople, createChatPresence, touchLastSeen } from "../../js/messaging-service.js";

const params = new URLSearchParams(location.search);
const chatId = params.get("conversation") || params.get("chatId");
const messagesBox = document.getElementById("chatMessages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const chatName = document.getElementById("chatName");
const chatStatus = document.getElementById("chatStatus");
const chatAvatar = document.getElementById("chatAvatar");
const onlineDot = document.getElementById("onlineDot");
const typingIndicator = document.getElementById("typingIndicator");
const backBtn = document.getElementById("backBtn");

let firebaseUser = null;
let profile = null;
let peer = null;
let peerLastReadAt = null;
let unsubscribeMessages = null;
let unsubscribeReads = null;
let presence = null;
let typingHideTimer = null;

const escapeHTML = value => String(value ?? "").replace(/[&<>\"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;" }[char]));
const toast = (message, type = "error") => window.SSA?.toast?.(message, type) || console.warn(message);

function formatLastSeen(value) {
  if (!value) return "Offline";
  const time = new Date(value);
  const diff = Date.now() - time.getTime();
  if (diff < 60000) return "Last seen just now";
  if (diff < 3600000) return `Last seen ${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `Last seen ${Math.floor(diff / 3600000)}h ago`;
  return `Last seen ${time.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

function setPeerStatus(online, lastSeen) {
  onlineDot?.classList.toggle("is-online", online);
  onlineDot?.classList.toggle("is-offline", !online);
  if (chatStatus) chatStatus.textContent = online ? "Online" : formatLastSeen(lastSeen);
}

function showTyping() {
  typingIndicator?.classList.remove("hidden");
  clearTimeout(typingHideTimer);
  typingHideTimer = setTimeout(() => typingIndicator?.classList.add("hidden"), 2600);
}

function isRead(message) {
  if (!peerLastReadAt || !message.created_at) return false;
  return new Date(peerLastReadAt).getTime() >= new Date(message.created_at).getTime();
}

function renderMessage(message, { scroll = true } = {}) {
  const mine = message.sender_id === profile.id;
  const read = mine && isRead(message);
  const element = document.createElement("div");
  element.className = mine ? "message sent" : "message received";
  element.dataset.messageId = message.id;
  element.dataset.createdAt = message.created_at || "";
  element.innerHTML = `<div class="message-text">${escapeHTML(message.body)}</div><div class="message-meta"><time class="message-time">${new Date(message.created_at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</time>${mine ? `<span class="message-read${read ? " is-read" : ""}" aria-label="${read ? "Read" : "Sent"}">${read ? "✓✓" : "✓"}</span>` : ""}</div>`;
  messagesBox.appendChild(element);
  if (scroll) messagesBox.scrollTop = messagesBox.scrollHeight;
}

function refreshReadStates() {
  messagesBox?.querySelectorAll(".message.sent").forEach(element => {
    const read = isRead({ created_at: element.dataset.createdAt });
    const indicator = element.querySelector(".message-read");
    if (!indicator) return;
    indicator.textContent = read ? "✓✓" : "✓";
    indicator.classList.toggle("is-read", read);
    indicator.setAttribute("aria-label", read ? "Read" : "Sent");
  });
}

async function loadChat() {
  profile = await getProfileByFirebaseUid(firebaseUser.uid);
  const people = await getConversationPeople(chatId);
  peer = people.find(person => person.id !== profile.id) || people[0];
  if (!peer) throw new Error("This conversation is unavailable.");
  peerLastReadAt = peer.last_read_at || null;

  if (chatName) chatName.textContent = peer.username ? `@${peer.username}` : (peer.full_name || "User");
  if (chatAvatar && peer.avatar_url) chatAvatar.src = peer.avatar_url;
  setPeerStatus(false, peer.last_seen_at);

  const messages = await getMessages(chatId);
  messagesBox.innerHTML = "";
  messages.forEach(message => renderMessage(message, { scroll: false }));
  messagesBox.scrollTop = messagesBox.scrollHeight;

  await markConversationRead({ conversationId: chatId, userId: profile.id });
  await touchLastSeen(profile.id);

  unsubscribeMessages?.();
  unsubscribeReads?.();
  unsubscribeMessages = subscribeToMessages(chatId, message => {
    renderMessage(message);
    if (message.sender_id !== profile.id) {
      markConversationRead({ conversationId: chatId, userId: profile.id }).catch(() => {});
    }
  });
  unsubscribeReads = subscribeToReadReceipts(chatId, member => {
    if (member.user_id === peer.id) {
      peerLastReadAt = member.last_read_at || peerLastReadAt;
      refreshReadStates();
    }
  });

  presence?.stop?.();
  presence = createChatPresence(chatId, profile, {
    onSync(state) {
      const entries = Object.values(state).flat();
      const peerPresence = entries.find(entry => entry.user_id === peer.id);
      setPeerStatus(Boolean(peerPresence), peer.last_seen_at);
    },
    onTyping(payload) {
      if (payload?.typing) showTyping();
      else typingIndicator?.classList.add("hidden");
    }
  });
}

async function send() {
  const body = input?.value.trim();
  if (!body || !chatId || !profile) return;
  sendBtn.disabled = true;
  try {
    presence?.setTyping(false);
    await sendMessage({ conversationId: chatId, senderId: profile.id, body });
    input.value = "";
    input.style.height = "auto";
    input.focus();
  } catch (error) {
    console.error("Message send failed:", error);
    toast("We couldn't send that message. Check your connection and try again.");
  } finally {
    sendBtn.disabled = false;
  }
}

sendBtn?.addEventListener("click", send);
input?.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 130)}px`;
  presence?.setTyping(Boolean(input.value.trim()));
});
input?.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); }
});
backBtn?.addEventListener("click", () => history.length > 1 ? history.back() : (location.href = "messages.html"));

onAuthStateChanged(auth, async current => {
  if (!current) { location.href = "../../login.html"; return; }
  firebaseUser = current;
  if (!chatId) { location.href = "messages.html"; return; }
  try { await loadChat(); }
  catch (error) {
    console.error("Chat loading failed:", error);
    messagesBox.innerHTML = `<div class="empty-state"><h2>Messages are temporarily unavailable</h2><p>We couldn't load this conversation. Please try again.</p></div>`;
    toast("We couldn't load this conversation. Please try again.");
  }
});

window.addEventListener("beforeunload", () => {
  unsubscribeMessages?.();
  unsubscribeReads?.();
  presence?.stop?.();
  if (profile?.id) touchLastSeen(profile.id);
});