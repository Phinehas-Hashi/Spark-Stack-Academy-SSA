import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, limit, getDocs, getDoc, addDoc, onSnapshot, orderBy, serverTimestamp, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import "./ssa-ui.js";

const RULES = {
  student: ["instructor"],
  instructor: ["student", "admin"],
  admin: ["instructor", "founder"],
  founder: ["student", "instructor", "admin"]
};

const app = document.getElementById("roleMessagingApp");
if (!app) throw new Error("Messaging root is missing.");

const role = String(app.dataset.role || "").toLowerCase();
const allowed = RULES[role] || [];
let user = null;
let profile = null;
let activeChatId = null;
let stopMessages = null;

const esc = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

app.innerHTML = `<div class="rm-shell"><aside class="rm-contacts"><div class="rm-head"><div><small>COMMUNICATION</small><h1>Messages</h1></div><span>${esc(role)}</span></div><input id="rmSearch" class="rm-search" placeholder="Search people…" autocomplete="off"><div id="rmPeople" class="rm-people"></div></aside><section class="rm-chat"><div id="rmChatHead" class="rm-chat-head"><div><strong>Select a conversation</strong><span>Choose someone you’re allowed to contact.</span></div></div><div id="rmMessages" class="rm-messages"><div class="rm-empty">💬<strong>Your conversations will appear here.</strong><span>Messaging is restricted by academy role permissions.</span></div></div><form id="rmComposer" class="rm-composer"><input id="rmInput" placeholder="Write a message…" autocomplete="off"><button type="submit">Send</button></form></section></div>`;

const peopleEl = app.querySelector("#rmPeople");
const searchEl = app.querySelector("#rmSearch");
const messagesEl = app.querySelector("#rmMessages");
const headEl = app.querySelector("#rmChatHead");
const composer = app.querySelector("#rmComposer");
const input = app.querySelector("#rmInput");

function contactQuery() {
  if (role === "student" || role === "admin") return query(collection(db, "users"), where("role", "==", allowed[0]), limit(50));
  return query(collection(db, "users"), where("role", "in", allowed.filter(r => r !== "founder")), limit(50));
}

function renderPeople(items) {
  peopleEl.innerHTML = items.length ? items.map(person => `<button type="button" class="rm-person" data-id="${esc(person.id)}"><span class="rm-avatar">${esc((person.name || person.displayName || person.email || "U").slice(0, 1).toUpperCase())}</span><span><strong>${esc(person.name || person.displayName || "User")}</strong><small>${esc(person.role || "")}</small></span></button>`).join("") : '<div class="rm-empty">No permitted contacts found.</div>';
  peopleEl.querySelectorAll(".rm-person").forEach(button => button.onclick = () => openChat(button.dataset.id));
  window.lucide?.createIcons();
}

async function loadPeople() {
  const snapshot = await getDocs(contactQuery());
  const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(person => person.id !== user.uid);
  renderPeople(items);
  searchEl.oninput = () => {
    const value = searchEl.value.trim().toLowerCase();
    renderPeople(items.filter(person => `${person.name || person.displayName || ""} ${person.email || ""}`.toLowerCase().includes(value)));
  };
}

async function findChat(otherId) {
  const snapshot = await getDocs(query(collection(db, "chats"), where("participants", "array-contains", user.uid), limit(50)));
  return snapshot.docs.find(item => (item.data().participants || []).includes(otherId)) || null;
}

async function openChat(otherId) {
  const otherSnapshot = await getDoc(doc(db, "users", otherId));
  if (!otherSnapshot.exists()) return;
  const other = otherSnapshot.data();
  if (!allowed.includes(String(other.role || "").toLowerCase())) return;

  let chat = await findChat(otherId);
  if (!chat) {
    chat = await addDoc(collection(db, "chats"), {
      participants: [user.uid, otherId],
      members: [
        { uid: user.uid, name: profile?.name || profile?.displayName || user.email || "User", role },
        { uid: otherId, name: other.name || other.displayName || other.email || "User", role: other.role || "" }
      ],
      lastMessage: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  activeChatId = chat.id;
  headEl.innerHTML = `<div><strong>${esc(other.name || other.displayName || "User")}</strong><span>${esc(other.role || "")}</span></div>`;
  if (stopMessages) stopMessages();

  const messageQuery = query(collection(db, "chats", activeChatId, "messages"), orderBy("timestamp", "asc"));
  stopMessages = onSnapshot(messageQuery, snapshot => {
    messagesEl.innerHTML = "";
    snapshot.forEach(item => {
      const message = item.data();
      const mine = message.senderId === user.uid;
      const row = document.createElement("div");
      row.className = `rm-msg ${mine ? "mine" : ""}`;
      row.innerHTML = `<div>${esc(message.text || "")}</div><small>${message.timestamp?.toDate ? message.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</small>`;
      messagesEl.appendChild(row);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }, error => console.error("Messaging listener failed:", error));
  input.focus();
}

composer.onsubmit = async event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || !activeChatId || !user) return;
  try {
    const chatSnapshot = await getDoc(doc(db, "chats", activeChatId));
    if (!chatSnapshot.exists()) return;
    const members = chatSnapshot.data().participants || [];
    if (!members.includes(user.uid)) return;
    const otherId = members.find(id => id !== user.uid);
    await addDoc(collection(db, "chats", activeChatId, "messages"), { senderId: user.uid, text, timestamp: serverTimestamp(), seen: false });
    await updateDoc(doc(db, "chats", activeChatId), { lastMessage: text, updatedAt: serverTimestamp(), lastSenderId: user.uid });
    if (otherId) await addDoc(collection(db, "notifications"), { title: `New message from ${profile?.name || profile?.displayName || role}`, message: text.slice(0, 120), type: "message", audience: "user", recipientId: otherId, userId: otherId, senderId: user.uid, priority: "normal", read: false, createdAt: serverTimestamp(), metadata: { chatId: activeChatId } });
    input.value = "";
  } catch (error) {
    window.ssaToast?.(window.ssaFriendlyError?.(error, "Message could not be sent.") || "Message could not be sent.", "error", "Messaging");
  }
};

onAuthStateChanged(auth, async currentUser => {
  if (!currentUser) { location.replace("../login.html"); return; }
  if (!RULES[role]) { window.ssaToast?.("Messaging role is not configured.", "error", "Messaging"); return; }
  user = currentUser;
  try {
    const profileSnapshot = await getDoc(doc(db, "users", user.uid));
    profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
    await loadPeople();
  } catch (error) {
    console.error("Messaging boot failed:", error);
    peopleEl.innerHTML = '<div class="rm-empty">Messaging is temporarily unavailable.</div>';
  }
});
