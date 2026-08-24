// ============================================================
// SPARK STACK ACADEMY — ADMIN TOPBAR ENGINE
// ============================================================
console.log("🛡️ ADMIN TOPBAR JS LOADED");

const ADMIN_PAGE_NAMES = { "dashboard.html":"Dashboard", "students.html":"Students", "instructors.html":"Instructors", "courses.html":"Courses", "assignments.html":"Assignments", "reports.html":"Reports", "messages.html":"Messages", "announcements.html":"Announcements", "notifications.html":"Notifications", "profile.html":"My Profile", "settings.html":"Settings", "course-profile.html":"Course Profile", "instructor-profile.html":"Instructor Profile" };

function updateAdminPageTitle() {
    const file = window.location.pathname.split("/").pop().toLowerCase();
    const element = document.getElementById("adminCurrentPage");
    if (element) element.textContent = ADMIN_PAGE_NAMES[file] || "Admin Console";
}

function initAdminProfileDropdown() {
    const button = document.getElementById("adminProfileMenu"), dropdown = document.getElementById("adminProfileDropdown");
    if (!button || !dropdown) return;
    button.addEventListener("click", event => { event.stopPropagation(); dropdown.classList.toggle("active"); });
    document.addEventListener("click", event => { if (!dropdown.contains(event.target) && !button.contains(event.target)) dropdown.classList.remove("active"); });
}

function closeAdminMenu() {
    document.getElementById("adminSidebar")?.classList.remove("open");
    document.getElementById("sidebarOverlay")?.classList.remove("active");
    document.body.classList.remove("admin-menu-open");
}

function initAdminMenuToggle() {
    const button = document.getElementById("adminMenuToggle"), sidebar = document.getElementById("adminSidebar"), overlay = document.getElementById("sidebarOverlay");
    if (!button) return;
    button.addEventListener("click", () => {
        sidebar?.classList.toggle("open"); overlay?.classList.toggle("active"); document.body.classList.toggle("admin-menu-open");
    });
    overlay?.addEventListener("click", closeAdminMenu);
}

function updateAdminTopbarProfile(data = {}) {
    const name = data.displayName || data.name || data.fullName || "Administrator";
    const avatar = document.getElementById("adminTopbarAvatar"), topbarName = document.getElementById("adminTopbarName"), dropdownName = document.getElementById("dropdownAdminName"), dropdownAvatar = document.getElementById("dropdownAdminAvatar");
    if (topbarName) topbarName.textContent = name;
    if (dropdownName) dropdownName.textContent = name;
    const initial = name.trim().charAt(0).toUpperCase();
    [avatar, dropdownAvatar].forEach(el => { if (!el) return; el.innerHTML = data.photoURL ? `<img src="${escapeHTML(data.photoURL)}" alt="Admin">` : initial; });
}

function updateAdminNotificationBadge(count = 0) {
    const badge = document.getElementById("adminNotificationBadge"); if (!badge) return;
    const total = Number(count || 0); badge.classList.toggle("hidden", total <= 0); badge.textContent = total > 99 ? "99+" : String(total);
}

function initAdminSearch() {
    const button = document.getElementById("adminSearchBtn");
    if (!button) return;
    button.addEventListener("click", () => document.dispatchEvent(new CustomEvent("admin:search")));
}

function refreshAdminTopbarIcons() { if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons(); }
function escapeHTML(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function initAdminTopbar() { updateAdminPageTitle(); initAdminProfileDropdown(); initAdminMenuToggle(); initAdminSearch(); refreshAdminTopbarIcons(); console.log("✓ Admin topbar ready"); }
window.AdminTopbar = { init:initAdminTopbar, updatePageTitle:updateAdminPageTitle, updateProfile:updateAdminTopbarProfile, updateNotificationBadge:updateAdminNotificationBadge, closeMenu:closeAdminMenu };