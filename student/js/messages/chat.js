import { auth, db, storage } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { uploadFile } from "./uploads.js";
import { getBlob, ref as storageRef } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const params = new URLSearchParams(location.search);
const chatId = params.get("chatId") || params.get("conversation");
const messagesBox = document.getElementById("chatMessages");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const chatComposer = document.getElementById("chatComposer");
const chatName = document.getElementById("chatName");
const chatStatus = document.getElementById("chatStatus");
const chatAvatar = document.getElementById("chatAvatar");
const typingIndicator = document.getElementById("typingIndicator");
const fileInput = document.getElementById("fileInput");

let currentUser = null;
let chatRef = null;
let peer = null;
let stopMessages = null;
let stopChat = null;
let typingTimer = null;
let typingHideTimer = null;
let sending = false;
let typingActive = false;

const toDate = value => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const escapeHtml = value => String(value ?? "").replace(/[&<>"]/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
}[char]));

function showNotice(message) {
  if (!messagesBox) return;
  const notice = document.createElement("div");
  notice.className = "chat-system-notice";
  notice.textContent = message;
  messagesBox.replaceChildren(notice);
}

function formatTime(value) {
  const date = toDate(value);
  return date
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Sending…";
}

function peerReadMessage(message, peerLastReadAt) {
  const sentAt = toDate(message.timestamp);
  const readAt = toDate(peerLastReadAt);
  return Boolean(sentAt && readAt && readAt >= sentAt);
}

function renderMessage(message, peerLastReadAt) {
  const mine = message.senderId === currentUser.uid;
  const row = document.createElement("article");
  row.className = mine ? "message sent" : "message received";
  row.dataset.messageId = message.id;
  const sentAt = toDate(message.timestamp);
  row.dataset.createdAt = sentAt ? sentAt.toISOString() : "";

  if (message.text) {
    const body = document.createElement("div");
    body.className = "message-text";
    body.textContent = message.text;
    row.append(body);
  }

  if (message.attachment && typeof message.attachment.path === "string") {
    const attachmentButton = document.createElement("button");
    attachmentButton.type = "button";
    attachmentButton.className = "message-attachment";
    attachmentButton.textContent = message.attachment.name || "Download attachment";
    attachmentButton.addEventListener("click", async () => {
      attachmentButton.disabled = true;
      try {
        const blob = await getBlob(storageRef(storage, message.attachment.path));
        const objectUrl = URL.createObjectURL(blob);
        const downloadLink = document.createElement("a");
        downloadLink.href = objectUrl;
        downloadLink.download = message.attachment.name || "ssa-attachment";
        document.body.append(downloadLink);
        downloadLink.click();
        downloadLink.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      } catch (error) {
        console.error("Attachment download failed:", error);
        window.SSA?.toast?.("This attachment could not be downloaded.", "error");
      } finally {
        attachmentButton.disabled = false;
      }
    });
    row.append(attachmentButton);
  }

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const time = document.createElement("time");
  time.className = "message-time";
  const date = toDate(message.timestamp);
  time.textContent = formatTime(message.timestamp);
  if (date) time.dateTime = date.toISOString();
  meta.append(time);

  if (mine) {
    const read = document.createElement("span");
    const isRead = peerReadMessage(message, peerLastReadAt);
    read.className = `message-read${isRead ? " is-read" : ""}`;
    read.textContent = isRead ? "✓✓" : "✓";
    read.setAttribute("aria-label", isRead ? "Read" : "Sent");
    meta.append(read);
  }

  row.append(meta);
  return row;
}

function renderMessages(snapshot, peerLastReadAt) {
  const fragment = document.createDocumentFragment();
  const latestMessages = snapshot.docs.slice().reverse();

  if (!latestMessages.length) {
    const welcome = document.createElement("p");
    welcome.className = "chat-system-notice";
    welcome.textContent = "This is the beginning of your private conversation.";
    fragment.append(welcome);
  } else {
    latestMessages.forEach(item => fragment.append(renderMessage(
      { id: item.id, ...item.data() },
      peerLastReadAt
    )));
  }

  messagesBox.replaceChildren(fragment);
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

async function markRead() {
  if (!chatRef || !currentUser) return;
  try {
    await updateDoc(chatRef, {
      [`lastReadAt.${currentUser.uid}`]: serverTimestamp()
    });
  } catch (error) {
    console.warn("Read receipt update skipped:", error);
  }
}

function setTyping(active) {
  if (!chatRef || !currentUser) return;
  clearTimeout(typingTimer);
  const nextState = Boolean(active);
  if (nextState !== typingActive) {
    typingActive = nextState;
    updateDoc(chatRef, {
      typing: {
        uid: currentUser.uid,
        status: nextState,
        updatedAt: serverTimestamp()
      }
    }).catch(() => {});
  }
  if (nextState) typingTimer = setTimeout(() => setTyping(false), 1800);
}

function startChatListeners() {
  const messagesQuery = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("timestamp", "desc"),
    limit(100)
  );

  stopMessages = onSnapshot(messagesQuery, snapshot => {
    renderMessages(snapshot, peer?.lastReadAt);
    const hasIncoming = snapshot.docs.some(item => item.data().senderId !== currentUser.uid);
    if (hasIncoming) markRead();
  }, error => {
    console.error("Message listener failed:", error);
    showNotice("Messages could not be updated. Check your connection.");
  });

  stopChat = onSnapshot(chatRef, snapshot => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    const peerReadAt = data.lastReadAt?.[peer?.uid];
    peer.lastReadAt = peerReadAt || null;

    messagesBox.querySelectorAll(".message.sent").forEach(row => {
      const indicator = row.querySelector(".message-read");
      if (!indicator) return;
      const sentAt = toDate(row.dataset.createdAt);
      const readAt = toDate(peerReadAt);
      const read = Boolean(sentAt && readAt && readAt >= sentAt);
      indicator.textContent = read ? "✓✓" : "✓";
      indicator.classList.toggle("is-read", read);
      indicator.setAttribute("aria-label", read ? "Read" : "Sent");
    });

    const typing = data.typing;
    if (typing?.uid === peer?.uid && typing.status) {
      typingIndicator?.classList.remove("hidden");
      clearTimeout(typingHideTimer);
      typingHideTimer = setTimeout(() => typingIndicator?.classList.add("hidden"), 2200);
    } else {
      typingIndicator?.classList.add("hidden");
    }
  }, error => console.warn("Conversation status listener failed:", error));
}


async function loadChat() {
  if (!chatId) throw new Error("Conversation link is missing.");

  chatRef = doc(db, "chats", chatId);
  const snapshot = await getDoc(chatRef);
  if (!snapshot.exists()) throw new Error("This conversation does not exist.");

  const data = snapshot.data();
  const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];
  const participants = Array.isArray(data.participants) ? data.participants : [];
  const allowedMembers = memberIds.length ? memberIds : participants;
  if (!allowedMembers.includes(currentUser.uid)) {
    throw new Error("You do not have access to this conversation.");
  }

  const members = Array.isArray(data.members) ? data.members : [];
  peer = members.find(member => member?.uid && member.uid !== currentUser.uid) || {
    uid: allowedMembers.find(id => id !== currentUser.uid),
    name: "Instructor"
  };
  if (!peer.uid) throw new Error("The other participant could not be identified.");

  const peerName = peer.name || peer.displayName || "Instructor";
  chatName.textContent = peerName;
  chatStatus.textContent = "Private conversation";
  if (peer.photo || peer.photoURL) chatAvatar.src = peer.photo || peer.photoURL;

  startChatListeners();
  await markRead();
}

async function send() {
  const text = input?.value.trim() || "";
  if (!chatRef || !currentUser || sending) return;

  const hasFile = Boolean(fileInput?.files?.[0]);
  if (!text && !hasFile) return;
  if (text.length > 4000) {
    window.SSA?.toast?.("Messages must be 4,000 characters or fewer.", "error");
    return;
  }

  sending = true;
  if (sendBtn) sendBtn.disabled = true;

  try {
    let attachment = null;
    if (hasFile) {
      const file = fileInput.files[0];
      if (file.size >= 10 * 1024 * 1024) {
        throw new Error("Attachments must be smaller than 10 MB.");
      }
      attachment = await uploadFile();
      if (!attachment) throw new Error("The attachment could not be uploaded.");
    }

    const message = {
      senderId: currentUser.uid,
      text,
      timestamp: serverTimestamp(),
      seen: false
    };
    if (attachment) message.attachment = attachment;

    await addDoc(collection(db, "chats", chatId, "messages"), message);
    await updateDoc(chatRef, {
      lastMessage: text || `Attachment: ${attachment.name}`,
      lastSenderId: currentUser.uid,
      lastMessageAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await markRead();

    input.value = "";
    input.style.height = "auto";
    setTyping(false);
    input.focus();
  } catch (error) {
    console.error("Message send failed:", error);
    window.SSA?.toast?.(error.message || "We couldn't send that message. Check your connection.", "error");
  } finally {
    sending = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

chatComposer?.addEventListener("submit", event => {
  event.preventDefault();
  send();
});
input?.addEventListener("input", () => setTyping(Boolean(input.value.trim())));

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.replace("../login.html");
    return;
  }
  if (currentUser) return;
  currentUser = user;
  try {
    await loadChat();
  } catch (error) {
    console.error("Chat loading failed:", error);
    showNotice(error.message || "We couldn't load this conversation. Please try again.");
    window.SSA?.toast?.(error.message || "Conversation unavailable.", "error");
  }
});

window.addEventListener("pagehide", () => {
  stopMessages?.();
  stopChat?.();
  clearTimeout(typingTimer);
  clearTimeout(typingHideTimer);
});
