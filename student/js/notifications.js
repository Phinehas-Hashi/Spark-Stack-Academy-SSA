import { auth } from "../../js/firebase.js";
import {
  startNotificationRuntime,
  markNotificationRead,
  markAllNotificationsRead,
  notificationTime
} from "../../js/notification-runtime.js";

let notifications = [];
let activeFilter = "all";
let sortOrder = "newest";

const $ = id => document.getElementById(id);

const categoryFor = type => {
  if (["payment_success", "payment", "invoice", "refund"].includes(type)) return "payment";
  if (["course", "lesson", "assignment", "quiz"].includes(type)) return "course";
  if (["announcement"].includes(type)) return "announcement";
  if (["premium"].includes(type)) return "premium";
  if (["achievement", "certificate"].includes(type)) return "achievement";
  return "general";
};

const iconFor = type => ({
  payment_success: "credit-card",
  payment: "credit-card",
  course: "book-open",
  lesson: "play-circle",
  assignment: "clipboard-list",
  quiz: "help-circle",
  achievement: "trophy",
  certificate: "award",
  report_feedback: "message-circle",
  announcement: "megaphone",
  premium: "crown"
}[type] || "bell");

const escapeHTML = value => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function timestamp(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function visibleNotifications() {
  const filtered = notifications.filter(item => {
    if (activeFilter === "unread") return !item.read_at;
    if (activeFilter === "all") return true;
    return categoryFor(item.type) === activeFilter;
  });

  return filtered.sort((a, b) => {
    const difference = timestamp(a.created_at) - timestamp(b.created_at);
    return sortOrder === "oldest" ? difference : -difference;
  });
}

function safeActionUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value, window.location.origin);
    return url.origin === window.location.origin ? url.href : null;
  } catch (_) {
    return null;
  }
}

function render() {
  const unreadCount = notifications.filter(item => !item.read_at).length;
  const total = $("totalNotifications");
  const unread = $("unreadNotifications");
  const markAll = $("markAllReadBtn");
  const list = $("notificationsList");
  const empty = $("notificationsEmpty");
  const status = $("notificationsStatus");

  if (total) total.textContent = String(notifications.length);
  if (unread) unread.textContent = String(unreadCount);
  if (markAll) markAll.disabled = unreadCount === 0;

  // The shared topbar uses these IDs for its compact notification preview.
  const badge = $("notificationCount");
  if (badge) {
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    badge.style.display = unreadCount ? "flex" : "none";
  }

  const preview = $("notificationList");
  if (preview) {
    const latest = notifications.slice(0, 5);
    preview.innerHTML = latest.length ? latest.map(item => `
      <div class="notification-item ${item.read_at ? "" : "unread"}"
           data-notification-id="${escapeHTML(item.id)}">
        <div class="notification-icon"><i data-lucide="${iconFor(item.type)}"></i></div>
        <div class="notification-content">
          <strong>${escapeHTML(item.title)}</strong>
          <p>${escapeHTML(item.message)}</p>
          <small>${escapeHTML(notificationTime(item.created_at))}</small>
        </div>
      </div>`).join("") : `
      <div class="notification-empty"><i data-lucide="bell-off"></i><p>No new notifications</p></div>`;
  }

  if (list) {
    const items = visibleNotifications();
    list.innerHTML = items.map(item => {
      const category = categoryFor(item.type);
      const action = safeActionUrl(item.action_url);
      return `
        <article class="notification-card ${item.read_at ? "" : "unread"}"
                 data-notification-id="${escapeHTML(item.id)}"
                 data-type="${category}"
                 tabindex="0"
                 role="button"
                 aria-label="${escapeHTML(item.title)}. ${item.read_at ? "Read" : "Unread"} notification">
          <div class="notification-card-icon" aria-hidden="true">
            <i data-lucide="${iconFor(item.type)}"></i>
          </div>
          <div class="notification-card-content">
            <h3>${escapeHTML(item.title || "Notification")}</h3>
            <p>${escapeHTML(item.message)}</p>
            <span class="notification-time">${escapeHTML(notificationTime(item.created_at))}</span>
            ${action ? '<span class="notification-open-hint">Open update</span>' : ""}
          </div>
          <div class="notification-card-action" aria-hidden="true">
            <i data-lucide="chevron-right"></i>
          </div>
        </article>`;
    }).join("");

    list.setAttribute("aria-busy", "false");
    list.hidden = items.length === 0;
    if (empty) empty.hidden = items.length !== 0;
    if (status) {
      status.textContent = notifications.length
        ? `Showing ${items.length} of ${notifications.length} notifications.`
        : "You have no notifications yet.";
    }
  }

  if (window.lucide) window.lucide.createIcons();
}

window.addEventListener("ssa:notifications", event => {
  notifications = Array.isArray(event.detail) ? event.detail : [];
  render();
});

document.querySelectorAll("[data-filter]").forEach(button => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter || "all";
    document.querySelectorAll("[data-filter]").forEach(filterButton => {
      const active = filterButton === button;
      filterButton.classList.toggle("active", active);
      filterButton.setAttribute("aria-pressed", String(active));
    });
    render();
  });
});

$("notificationSort")?.addEventListener("change", event => {
  sortOrder = event.target.value === "oldest" ? "oldest" : "newest";
  render();
});

async function openNotification(item) {
  if (!item) return;

  try {
    if (!item.read_at) await markNotificationRead(item.id);
  } catch (error) {
    console.warn("Notification read failed:", error);
    const status = $("notificationsStatus");
    if (status) status.textContent = "Could not mark this notification as read. Please try again.";
  }

  const actionUrl = safeActionUrl(item.action_url);
  if (actionUrl) window.location.assign(actionUrl);
}

function activateNotification(event) {
  const card = event.target.closest("[data-notification-id]");
  if (!card) return;

  const item = notifications.find(notification => notification.id === card.dataset.notificationId);
  openNotification(item);
}

document.addEventListener("click", event => {
  if (event.target.closest("#markNotificationsRead, #markAllReadBtn")) {
    markAllNotificationsRead().catch(error => {
      console.warn("Mark all notifications read failed:", error);
      const status = $("notificationsStatus");
      if (status) status.textContent = "Some notifications could not be marked as read.";
    });
    return;
  }

  activateNotification(event);
});

document.addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest(".notification-card[data-notification-id]");
  if (!card) return;
  event.preventDefault();
  const item = notifications.find(notification => notification.id === card.dataset.notificationId);
  openNotification(item);
});

if (auth.currentUser) startNotificationRuntime();
else auth.onAuthStateChanged(user => {
  if (user) startNotificationRuntime();
});
