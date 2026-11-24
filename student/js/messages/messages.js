import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  limit,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const conversationList = document.getElementById("conversationList");
const emptyState = document.getElementById("emptyState");
const statusEl = document.getElementById("conversationStatus");
const searchInput = document.getElementById("searchChats");
const filterButtons = [...document.querySelectorAll("[data-filter]")];

let currentUser = null;
let activeFilter = "all";
let conversations = new Map();
let stopMemberIds = null;
let stopParticipants = null;
let authStarted = false;

const safeText = value => String(value ?? "");
const toDate = value => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const escapeHtml = value => safeText(value).replace(/[&<>"]/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
}[char]));

function getPeer(chat) {
  const members = Array.isArray(chat.members) ? chat.members : [];
  return members.find(member => member?.uid && member.uid !== currentUser.uid) || null;
}

function getConversationTime(chat) {
  return toDate(chat.lastMessageAt || chat.updatedAt || chat.createdAt);
}

function isUnread(chat) {
  if (!chat.lastMessage || chat.lastSenderId === currentUser.uid) return false;
  const readAt = toDate(chat.lastReadAt?.[currentUser.uid]);
  const latest = getConversationTime(chat);
  return !readAt || !latest || latest > readAt;
}

function formatTime(value) {
  const date = toDate(value);
  if (!date) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" });
}

function updateStatus(message = "") {
  if (statusEl) statusEl.textContent = message;
}

function renderConversation(id, chat) {
  const peer = getPeer(chat);
  const peerName = peer?.name || peer?.displayName || "Instructor";
  const preview = chat.lastMessage || "Conversation started";
  const unread = isUnread(chat);

  const button = document.createElement("button");
  button.type = "button";
  button.className = `conversation-card${unread ? " unread" : ""}`;
  button.dataset.chatId = id;
  button.setAttribute("aria-label", `Open conversation with ${peerName}`);

  const avatar = document.createElement("span");
  avatar.className = "conversation-avatar";
  avatar.textContent = safeText(peerName).trim().charAt(0).toUpperCase() || "I";
  avatar.setAttribute("aria-hidden", "true");

  const info = document.createElement("span");
  info.className = "conversation-info";
  const name = document.createElement("strong");
  name.textContent = peerName;
  const message = document.createElement("span");
  message.className = "conversation-preview";
  message.textContent = preview;
  info.append(name, message);

  const meta = document.createElement("span");
  meta.className = "conversation-meta";
  const time = document.createElement("time");
  const date = getConversationTime(chat);
  time.className = "message-time";
  time.textContent = formatTime(date);
  if (date) time.dateTime = date.toISOString();
  meta.append(time);

  if (unread) {
    const badge = document.createElement("span");
    badge.className = "unread-count";
    badge.textContent = "New";
    meta.append(badge);
  }

  button.append(avatar, info, meta);
  button.addEventListener("click", () => {
    window.location.href = `chat.html?chatId=${encodeURIComponent(id)}`;
  });
  conversationList.append(button);
}

function render() {
  if (!conversationList || !emptyState || !currentUser) return;

  const term = safeText(searchInput?.value).trim().toLowerCase();
  const rows = [...conversations.entries()]
    .filter(([, chat]) => {
      const peer = getPeer(chat);
      const name = peer?.name || peer?.displayName || "Instructor";
      const matchesSearch = `${name} ${chat.lastMessage || ""}`.toLowerCase().includes(term);
      return matchesSearch && (activeFilter !== "unread" || isUnread(chat));
    })
    .sort((a, b) => {
      const aTime = getConversationTime(a[1])?.getTime() || 0;
      const bTime = getConversationTime(b[1])?.getTime() || 0;
      return bTime - aTime;
    });

  conversationList.replaceChildren();
  rows.forEach(([id, chat]) => renderConversation(id, chat));
  conversationList.setAttribute("aria-busy", "false");

  const hasAny = conversations.size > 0;
  const hasVisible = rows.length > 0;
  emptyState.hidden = hasVisible;
  if (!hasAny) {
    document.getElementById("emptyStateTitle").textContent = "No conversations yet";
    document.getElementById("emptyStateText").textContent =
      "Start a conversation with an instructor to ask a question or get learning support.";
    updateStatus("Your conversations will appear here.");
  } else if (!hasVisible) {
    document.getElementById("emptyStateTitle").textContent =
      activeFilter === "unread" ? "No unread conversations" : "No matching conversations";
    document.getElementById("emptyStateText").textContent =
      activeFilter === "unread"
        ? "You're all caught up."
        : "Try another search or switch to All conversations.";
    updateStatus("No conversations match the current filter.");
  } else {
    updateStatus(`${rows.length} conversation${rows.length === 1 ? "" : "s"}`);
  }
}

function mergeSnapshot(snapshot) {
  snapshot.docChanges().forEach(change => {
    if (change.type === "removed") conversations.delete(change.doc.id);
    else conversations.set(change.doc.id, change.doc.data());
  });
  render();
}

function handleListenerError(error) {
  console.error("Firebase conversations listener failed:", error);
  updateStatus("We couldn't load conversations. Check your connection and refresh.");
  if (!conversations.size) {
    emptyState.hidden = false;
    document.getElementById("emptyStateTitle").textContent = "Messages are temporarily unavailable";
    document.getElementById("emptyStateText").textContent =
      "Your conversations could not be loaded. Please refresh and try again.";
    conversationList.setAttribute("aria-busy", "false");
  }
}

function startConversationListeners() {
  const chats = collection(db, "chats");
  const byMemberIds = query(chats, where("memberIds", "array-contains", currentUser.uid), limit(100));
  const byParticipants = query(chats, where("participants", "array-contains", currentUser.uid), limit(100));

  stopMemberIds = onSnapshot(byMemberIds, mergeSnapshot, handleListenerError);
  stopParticipants = onSnapshot(byParticipants, mergeSnapshot, handleListenerError);
}

searchInput?.addEventListener("input", render);
filterButtons.forEach(button => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter || "all";
    filterButtons.forEach(item => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    render();
  });
});

onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.replace("../login.html");
    return;
  }
  if (authStarted) return;
  authStarted = true;
  currentUser = user;
  updateStatus("Listening for your conversations…");
  startConversationListeners();
});

window.addEventListener("pagehide", () => {
  stopMemberIds?.();
  stopParticipants?.();
});
