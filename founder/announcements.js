// ===================================
// SPARK STACK ACADEMY
// ANNOUNCEMENTS
// ===================================

import "../js/ui-runtime.js";
import { db } from "../../js/firebase.js";
import {
  collection, addDoc, doc, deleteDoc, updateDoc,
  onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const announcementsRef = collection(db, "announcements");
const $ = id => document.getElementById(id);

const announcementTitle = $("announcementTitle");
const announcementCategory = $("announcementCategory");
const announcementMessage = $("announcementMessage");
const announcementAudience = $("announcementAudience");
const publishDate = $("publishDate");
const expiryDate = $("expiryDate");
const pinAnnouncement = $("pinAnnouncement");
const importantAnnouncement = $("importantAnnouncement");
const sendPush = $("sendPush");
const sendEmail = $("sendEmail");
const showPopup = $("showPopup");
const announcementList = $("announcementList");
const announcementCount = $("announcementCount");

const escapeHTML = value => String(value ?? "").replace(/[&<>\"']/g, char => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"
}[char]));

function formData(status) {
  return {
    title: announcementTitle.value.trim(),
    category: announcementCategory.value,
    message: announcementMessage.value.trim(),
    audience: announcementAudience.value,
    publishDate: publishDate.value || null,
    expiryDate: expiryDate.value || null,
    pinned: pinAnnouncement.checked,
    important: importantAnnouncement.checked,
    push: sendPush.checked,
    email: sendEmail.checked,
    popup: showPopup.checked,
    status,
    createdAt: serverTimestamp()
  };
}

async function save(status) {
  const data = formData(status);
  if (!data.title || !data.message) {
    window.ssaToast?.("Add an announcement title and message first.", "warning");
    return;
  }

  try {
    await addDoc(announcementsRef, data);
    window.ssaToast?.(status === "published" ? "Announcement published." : "Draft saved.", "success");
    clearForm();
  } catch (error) {
    console.error("Announcement save failed:", error);
    window.ssaToast?.("Failed to save announcement. Please try again.", "error");
  }
}

function loadAnnouncements() {
  const q = query(announcementsRef, orderBy("createdAt", "desc"));
  onSnapshot(q, snapshot => {
    announcementList.replaceChildren();
    announcementCount.textContent = `${snapshot.size} Announcements`;

    if (snapshot.empty) {
      announcementList.innerHTML = `<p class="empty-state">No announcements yet.</p>`;
      return;
    }

    snapshot.forEach(item => {
      const data = item.data();
      const card = document.createElement("div");
      card.className = "announcement-card";
      card.innerHTML = `
        <div class="announcement-header">
          <h3>${escapeHTML(data.title)}</h3>
          <span class="badge">${escapeHTML(data.status)}</span>
        </div>
        <p>${escapeHTML(data.message)}</p>
        <div class="announcement-footer">
          <span class="announcement-date">${escapeHTML(data.category)}${data.pinned ? " • 📌 Pinned" : ""}</span>
          <div class="announcement-actions">
            <button class="secondary-btn" type="button" data-pin="${item.id}" data-current-pin="${data.pinned === true}">
              ${data.pinned ? "Unpin" : "📌"}
            </button>
            <button class="secondary-btn" type="button" data-delete="${item.id}">🗑️</button>
          </div>
        </div>`;
      announcementList.appendChild(card);
    });
  }, error => {
    console.error("Announcements listener failed:", error);
    announcementList.innerHTML = `<p class="empty-state">Unable to load announcements.</p>`;
  });
}

async function togglePin(id, current) {
  try {
    await updateDoc(doc(db, "announcements", id), { pinned: !current });
    window.ssaToast?.(current ? "Announcement unpinned." : "Announcement pinned.", "success");
  } catch (error) {
    console.error("Pin update failed:", error);
    window.ssaToast?.("Unable to update pinned status.", "error");
  }
}

async function removeAnnouncement(id) {
  const confirmed = await (window.ssaConfirm?.("Delete this announcement? This cannot be undone.", {
    title: "Delete announcement",
    confirmText: "Delete",
    cancelText: "Keep announcement",
    tone: "danger",
    icon: "🗑"
  }) ?? false);
  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "announcements", id));
    window.ssaToast?.("Announcement deleted.", "success");
  } catch (error) {
    console.error("Delete failed:", error);
    window.ssaToast?.("Unable to delete announcement.", "error");
  }
}

function clearForm() {
  announcementTitle.value = "";
  announcementMessage.value = "";
  publishDate.value = "";
  expiryDate.value = "";
  pinAnnouncement.checked = false;
  importantAnnouncement.checked = false;
  sendPush.checked = false;
  sendEmail.checked = false;
  showPopup.checked = false;
}

document.addEventListener("click", async event => {
  const pinButton = event.target.closest("[data-pin]");
  const deleteButton = event.target.closest("[data-delete]");
  if (pinButton) await togglePin(pinButton.dataset.pin, pinButton.dataset.currentPin === "true");
  if (deleteButton) await removeAnnouncement(deleteButton.dataset.delete);
});

window.addEventListener("DOMContentLoaded", () => {
  loadAnnouncements();
  $("publishAnnouncementBtn")?.addEventListener("click", () => save("published"));
  $("saveDraftBtn")?.addEventListener("click", () => save("draft"));
});