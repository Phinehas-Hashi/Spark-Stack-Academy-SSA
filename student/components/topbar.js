// ============================================================
// SPARK STACK ACADEMY — STUDENT TOPBAR
// Fast shell loader with instant session cache.
// ============================================================

const CACHE_KEY = "ssa_student_topbar_html_v2";

function paint(html, container) {
    if (!container || !html) return false;
    container.innerHTML = html;
    initializeTopbar();
    window.lucide?.createIcons();
    return true;
}

export async function loadTopbar() {
    const container = document.getElementById("topbarContainer");
    if (!container) return;

    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) paint(cached, container);

    try {
        const response = await fetch(new URL("./topbar.html", import.meta.url), { cache: "no-cache" });
        if (!response.ok) throw new Error(`Failed to load topbar: ${response.status}`);
        const html = await response.text();
        sessionStorage.setItem(CACHE_KEY, html);
        if (!cached) paint(html, container);
        else if (container.innerHTML !== html) paint(html, container);
    } catch (error) {
        console.error("Topbar error:", error);
    }
}

function initializeTopbar() {
    window.lucide?.createIcons();

    const menuBtn = document.getElementById("mobileMenuBtn");
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");

    if (menuBtn && !menuBtn.dataset.bound) {
        menuBtn.dataset.bound = "true";
        menuBtn.addEventListener("click", () => {
            sidebar?.classList.toggle("open");
            overlay?.classList.toggle("show");
        });
    }
    overlay?.addEventListener("click", () => {
        sidebar?.classList.remove("open");
        overlay?.classList.remove("show");
    });

    const themeBtn = document.getElementById("themeToggle");
    const themeIcon = document.getElementById("themeIcon");
    const savedTheme = localStorage.getItem("ssa-theme") || "light";
    applyTheme(savedTheme);

    if (themeBtn && !themeBtn.dataset.bound) {
        themeBtn.dataset.bound = "true";
        themeBtn.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme") || "light";
            applyTheme(current === "dark" ? "light" : "dark");
        });
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("ssa-theme", theme);
        if (themeIcon) {
            themeIcon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon");
            window.lucide?.createIcons();
        }
    }

    const notificationBtn = document.getElementById("notificationBtn");
    const notificationPanel = document.getElementById("notificationPanel");
    if (notificationBtn && !notificationBtn.dataset.bound) {
        notificationBtn.dataset.bound = "true";
        notificationBtn.addEventListener("click", event => {
            event.stopPropagation();
            notificationPanel?.classList.toggle("show");
        });
    }
    notificationPanel?.addEventListener("click", event => event.stopPropagation());

    const profileMenu = document.getElementById("profileMenu");
    profileMenu?.addEventListener("click", () => { window.location.href = "profile.html"; });
    profileMenu?.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            window.location.href = "profile.html";
        }
    });

    const searchInput = document.getElementById("studentSearch");
    searchInput?.addEventListener("keydown", event => {
        if (event.key === "Enter" && searchInput.value.trim()) {
            window.location.href = `courses.html?search=${encodeURIComponent(searchInput.value.trim())}`;
        }
    });
}

export function updateTopbar(student) {
    if (!student) return;
    const name = student.name || student.fullName || "Student";
    const topName = document.getElementById("topStudentName");
    const avatar = document.getElementById("topAvatar");
    if (topName) {
        topName.textContent = name;
        if (student.premium === true) {
            const badge = document.createElement("span");
            badge.className = "premium-badge";
            badge.textContent = "✓";
            badge.title = "SSA Premium Verified";
            topName.append(" ", badge);
        }
    }
    if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
}
