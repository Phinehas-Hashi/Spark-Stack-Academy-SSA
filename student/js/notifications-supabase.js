import { auth } from "../../js/firebase.js";
import { startNotificationRuntime, markNotificationRead, markAllNotificationsRead, notificationTime } from "../../js/notification-runtime.js";

let items = [];

const iconFor = type => ({
  payment_success: "credit-card",
  new_report: "flag",
  report_feedback: "message-circle",
  course: "book-open",
  lesson: "play-circle",
  assignment: "clipboard-list",
  quiz: "help-circle",
  announcement: "megaphone",
  premium: "crown",
  achievement: "trophy",
  certificate: "award"
}[type] || "bell");

const esc = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function render() {
  const count = document.getElementById("notificationCount");
  const list = document.getElementById("notificationList");
  const full = document.getElementById("notificationsList");
  const unread = items.filter(x => !x.read_at);

  if (count) {
    count.textContent = unread.length > 99 ? "99+" : unread.length;
    count.style.display = unread.length ? "flex" : "none";
  }

  const latest = items.slice(0, 5);
  if (list) {
    list.innerHTML = latest.length ? latest.map(item => `
      <div class="notification-item ${item.read_at ? "" : "unread"}" data-id="${esc(item.id)}">
        <div class="notification-icon"><i data-lucide="${iconFor(item.type)}"></i></div>
        <div class="notification-content">
          <strong>${esc(item.title)}</strong>
          <p>${esc(item.message)}</p>
          <small>${notificationTime(item.created_at)}</small>
        </div>
      </div>`).join("") : `<div class="notification-empty"><i data-lucide="bell-off"></i><p>No new notifications</p></div>`;
  }

  if (full) {
    full.innerHTML = items.length ? items.map(item => `
      <article class="notification-card ${item.read_at ? "" : "unread"}" data-id="${esc(item.id)}">
        <div class="notification-card-icon"><i data-lucide="${iconFor(item.type)}"></i></div>
        <div class="notification-card-content">
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.message)}</p>
          <span class="notification-time">${notificationTime(item.created_at)}</span>
        </div>
        <div class="notification-card-action"><i data-lucide="chevron-right"></i></div>
      </article>`).join("") : "";
  }

  if (window.lucide) window.lucide.createIcons();
}

window.addEventListener("ssa:notifications", event => {
  items = event.detail || [];
  render();
});

document.addEventListener("click", event => {
  const item = event.target.closest("[data-id]");
  if (item?.dataset.id) markNotificationRead(item.dataset.id).catch(() => {});

  if (event.target.closest("#markNotificationsRead, #markAllReadBtn")) {
    markAllNotificationsRead().catch(() => {});
  }
});

if (auth.currentUser) startNotificationRuntime();
else auth.onAuthStateChanged(user => { if (user) startNotificationRuntime(); });
