// ============================================================
// SPARK STACK ACADEMY — STUDENT ANNOUNCEMENTS
// Live, read-only Academy bulletin
// ============================================================

import { db } from "../../js/firebase.js";
import {
    collection,
    limit,
    onSnapshot,
    orderBy,
    query
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const MAX_ANNOUNCEMENTS = 50;
let unsubscribeAnnouncements = null;

function getContainer() {
    return document.getElementById("announcementsContainer");
}

function setBusy(isBusy) {
    getContainer()?.setAttribute("aria-busy", String(isBusy));
}

function refreshIcons() {
    if (window.lucide?.createIcons) {
        window.lucide.createIcons();
    }
}

function startAnnouncements() {
    const container = getContainer();

    if (!container) {
        console.error("Announcements container is missing.");
        return;
    }

    if (unsubscribeAnnouncements) {
        unsubscribeAnnouncements();
        unsubscribeAnnouncements = null;
    }

    setBusy(true);
    container.innerHTML = `
        <div class="announcement-loading" role="status">
            <span class="announcement-loading-icon" aria-hidden="true">
                <i data-lucide="loader-circle"></i>
            </span>
            <h3>Loading announcements</h3>
            <p>Connecting to the Academy bulletin…</p>
        </div>
    `;
    refreshIcons();

    const announcementsQuery = query(
        collection(db, "announcements"),
        orderBy("createdAt", "desc"),
        limit(MAX_ANNOUNCEMENTS)
    );

    unsubscribeAnnouncements = onSnapshot(
        announcementsQuery,
        snapshot => {
            if (snapshot.empty) {
                showEmptyState(container);
                setBusy(false);
                return;
            }

            const fragment = document.createDocumentFragment();

            snapshot.forEach(announcementDoc => {
                const card = createAnnouncementCard(
                    announcementDoc.id,
                    announcementDoc.data()
                );
                fragment.appendChild(card);
            });

            container.replaceChildren(fragment);
            setBusy(false);
            refreshIcons();
        },
        error => {
            console.error("Announcements subscription failed:", error);
            showError(container);
            setBusy(false);
        }
    );
}

function createAnnouncementCard(id, announcement = {}) {
    const card = document.createElement("article");
    card.className = "announcement-card";
    card.dataset.announcementId = id;

    const title = safeText(
        announcement.title,
        "Academy Announcement"
    );
    const message = safeText(
        announcement.message,
        "No announcement message available."
    );
    const category = safeText(
        announcement.category,
        "General"
    );
    const author = safeText(
        announcement.author,
        "Spark Stack Academy"
    );
    const date = formatDate(announcement.createdAt);

    card.innerHTML = `
        <div class="announcement-card-topline">
            <span class="announcement-card-symbol" aria-hidden="true">
                <i data-lucide="megaphone"></i>
            </span>
            <span class="announcement-category">${escapeHTML(category)}</span>
        </div>

        <div class="announcement-card-content">
            <h3>${escapeHTML(title)}</h3>
            <p class="announcement-message">${escapeHTML(message)}</p>
        </div>

        <footer class="announcement-footer">
            <span class="announcement-author">
                <i data-lucide="user-round" aria-hidden="true"></i>
                ${escapeHTML(author)}
            </span>
            <time class="announcement-date" datetime="${escapeHTML(date.iso)}">
                <i data-lucide="calendar-days" aria-hidden="true"></i>
                ${escapeHTML(date.label)}
            </time>
        </footer>
    `;

    return card;
}

function showEmptyState(container) {
    container.innerHTML = `
        <div class="announcement-empty" role="status">
            <span class="announcement-empty-icon" aria-hidden="true">
                <i data-lucide="inbox"></i>
            </span>
            <span class="announcement-empty-kicker">YOU'RE ALL CAUGHT UP</span>
            <h3>No announcements yet</h3>
            <p>There are no Academy updates to display right now. Check back later.</p>
        </div>
    `;
    refreshIcons();
}

function showError(container) {
    container.innerHTML = `
        <div class="announcement-empty announcement-error" role="alert">
            <span class="announcement-empty-icon" aria-hidden="true">
                <i data-lucide="cloud-alert"></i>
            </span>
            <span class="announcement-empty-kicker">CONNECTION ISSUE</span>
            <h3>Announcements could not load</h3>
            <p>Check your connection and try loading the Academy bulletin again.</p>
            <button class="announcement-retry" type="button" id="retryAnnouncements">
                <i data-lucide="refresh-cw" aria-hidden="true"></i>
                Try again
            </button>
        </div>
    `;

    document.getElementById("retryAnnouncements")?.addEventListener(
        "click",
        startAnnouncements,
        { once: true }
    );

    refreshIcons();
}

function safeText(value, fallback) {
    if (typeof value !== "string") return fallback;
    const normalized = value.trim();
    return normalized ? normalized : fallback;
}

function formatDate(timestamp) {
    if (!timestamp) return { label: "Recently", iso: "" };

    try {
        let date;

        if (typeof timestamp.toDate === "function") {
            date = timestamp.toDate();
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else {
            date = new Date(timestamp);
        }

        if (Number.isNaN(date.getTime())) {
            return { label: "Recently", iso: "" };
        }

        return {
            label: new Intl.DateTimeFormat("en-KE", {
                day: "numeric",
                month: "short",
                year: "numeric"
            }).format(date),
            iso: date.toISOString()
        };
    } catch {
        return { label: "Recently", iso: "" };
    }
}

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

document.addEventListener("DOMContentLoaded", startAnnouncements);
