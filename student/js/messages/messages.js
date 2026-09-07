import { auth, db } from "../../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, query, where, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const conversationList = document.getElementById("conversationList");
const emptyState = document.getElementById("emptyState");
let currentUser = null;
let conversations = [];

const escapeHtml = value => String(value ?? "").replace(/[&<>\"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;" }[c]));
const timeValue = value => value?.toDate?.() ? value.toDate().getTime() : (value ? new Date(value).getTime() : 0);

function showError(message = "Messages are temporarily unavailable.") {
  conversationList.innerHTML = `<div class="empty-state"><div class="empty-icon">💬</div><h2>Messages are taking a quick break</h2><p>${escapeHtml(message)}</p></div>`;
  emptyState.style.display = "none";
}

function peerFromChat(data) {
  const members = Array.isArray(data.members) ? data.members : [];
  return members.find(member => member.uid !== currentUser?.uid) || null;
}

function renderConversation(chat) {
  const peer = peerFromChat(chat.data) || {};
  const title = peer.name || peer.fullName || peer.displayName || peer.email || "Conversation";
  const last = chat.data.lastMessage || "New conversation";
  const updated = chat.data.updatedAt || chat.data.createdAt;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "conversation-item";
  button.dataset.id = chat.id;
  button.innerHTML = `<div class="conversation-info"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(last)}</small></div><time>${updated ? new Date(timeValue(updated)).toLocaleString() : ""}</time>`;
  button.addEventListener("click", () => { window.location.href = `chat.html?chatId=${encodeURIComponent(chat.id)}`; });
  conversationList.appendChild(button);
}

async function loadChats() {
  try {
    const snapshot = await getDocs(query(collection(db, "chats"), where("participants", "array-contains", currentUser.uid), limit(50)));
    conversations = snapshot.docs.map(item => ({ id: item.id, data: item.data() })).sort((a, b) => timeValue(b.data.updatedAt || b.data.createdAt) - timeValue(a.data.updatedAt || a.data.createdAt));
    conversationList.innerHTML = "";
    if (!conversations.length) { emptyState.style.display = "flex"; return; }
    emptyState.style.display = "none";
    conversations.forEach(renderConversation);
  } catch (error) {
    console.error("Firestore messages load error:", error);
    showError();
  }
}

const search = document.getElementById("searchChats");
search?.addEventListener("input", () => {
  const term = search.value.trim().toLowerCase();
  conversationList.innerHTML = "";
  conversations.filter(chat => JSON.stringify(chat.data.members || []).toLowerCase().includes(term) || String(chat.data.lastMessage || "").toLowerCase().includes(term)).forEach(renderConversation);
});

document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
}));

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.href = "../login.html"; return; }
  currentUser = user;
  await loadChats();
});
