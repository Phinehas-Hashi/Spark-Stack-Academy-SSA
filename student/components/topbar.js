// ============================================================
// SPARK STACK ACADEMY — STUDENT TOPBAR
// Behavior-only shell controller. Styling lives in components.css.
// ============================================================

const CACHE_KEY = "ssa_student_topbar_html_v4";

function readCache() {
    try { return sessionStorage.getItem(CACHE_KEY); } catch (_) { return null; }
}
function writeCache(value) {
    try { sessionStorage.setItem(CACHE_KEY, value); } catch (_) { /* cache is optional */ }
}

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

    const cached = readCache();
    if (cached) paint(cached, container);

    try {
        const response = await fetch(new URL("./topbar.html", import.meta.url), {
            cache: "no-cache"
        });
        if (!response.ok) {
            throw new Error(`Failed to load topbar: ${response.status}`);
        }

        const html = await response.text();
        writeCache(html);

        if (!cached || cached !== html) {
            paint(html, container);
        }
    } catch (error) {
        console.error("Topbar loading failed:", error);
    }
}

function initializeTopbar() {
    window.lucide?.createIcons();

    const menuBtn = document.getElementById("mobileMenuBtn");
    const overlay = document.getElementById("sidebarOverlay");

    // The topbar and sidebar load in parallel. Resolve the sidebar at
    // interaction time rather than capturing a possibly-not-yet-injected node.
    const closeSidebar = () => {
        document.getElementById("sidebar")?.classList.remove("open");
        document.getElementById("sidebarOverlay")?.classList.remove("show");
        document.getElementById("sidebarOverlay")?.setAttribute("aria-hidden", "true");
        menuBtn?.setAttribute("aria-expanded", "false");
        menuBtn?.setAttribute("aria-label", "Open menu");
        document.body.classList.remove("ssa-sidebar-open");
    };

    if (menuBtn && !menuBtn.dataset.bound) {
        menuBtn.dataset.bound = "true";
        menuBtn.setAttribute("aria-expanded", "false");
        menuBtn.addEventListener("click", () => {
            const sidebar = document.getElementById("sidebar");
            const activeOverlay = document.getElementById("sidebarOverlay");
            if (!sidebar) {
                // The sidebar fragment may still be loading; retry after its loader settles.
                let attempts = 0;
                const retryToggle = () => {
                    if (document.getElementById("sidebar")) {
                        menuBtn.click();
                    } else if (++attempts < 10) {
                        window.setTimeout(retryToggle, 120);
                    }
                };
                window.setTimeout(retryToggle, 120);
                return;
            }

            const open = !sidebar.classList.contains("open");
            sidebar.classList.toggle("open", open);
            activeOverlay?.classList.toggle("show", open);
            activeOverlay?.setAttribute("aria-hidden", String(!open));
            menuBtn.setAttribute("aria-expanded", String(open));
            menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
            document.body.classList.toggle("ssa-sidebar-open", open);
        });
    }

    if (overlay && !overlay.dataset.bound) {
        overlay.dataset.bound = "true";
        overlay.setAttribute("aria-hidden", "true");
        overlay.addEventListener("click", closeSidebar);
    }

    if (!document.body.dataset.ssaEscapeBound) {
        document.body.dataset.ssaEscapeBound = "true";
        document.addEventListener("keydown", event => {
            if (event.key === "Escape") closeSidebar();
        });
    }

    const themeBtn = document.getElementById("themeToggle");
    const themeIcon = document.getElementById("themeIcon");

    const applyTheme = theme => {
        const normalized = theme === "dark" ? "dark" : "light";
        document.documentElement.setAttribute("data-theme", normalized);
        localStorage.setItem("ssa-theme", normalized);

        if (themeIcon) {
            themeIcon.setAttribute(
                "data-lucide",
                normalized === "dark" ? "sun" : "moon"
            );
            window.lucide?.createIcons();
        }
    };

    let savedTheme = "light";
    try { savedTheme = localStorage.getItem("ssa-theme") || "light"; } catch (_) { /* use default theme */ }
    applyTheme(savedTheme);

    if (themeBtn && !themeBtn.dataset.bound) {
        themeBtn.dataset.bound = "true";
        themeBtn.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme") || "light";
            applyTheme(current === "dark" ? "light" : "dark");
        });
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

    if (notificationPanel && !notificationPanel.dataset.bound) {
        notificationPanel.dataset.bound = "true";
        notificationPanel.addEventListener("click", event => event.stopPropagation());
    }

    if (!document.body.dataset.ssaNotificationOutsideBound) {
        document.body.dataset.ssaNotificationOutsideBound = "true";
        document.addEventListener("click", () => {
            document.getElementById("notificationPanel")?.classList.remove("show");
        });
    }

    const profileMenu = document.getElementById("profileMenu");
    if (profileMenu && !profileMenu.dataset.bound) {
        profileMenu.dataset.bound = "true";
        profileMenu.addEventListener("click", () => {
            window.location.href = "profile.html";
        });
        profileMenu.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                window.location.href = "profile.html";
            }
        });
    }

    const searchInput = document.getElementById("studentSearch");
    if (searchInput && !searchInput.dataset.bound) {
        searchInput.dataset.bound = "true";
        searchInput.addEventListener("keydown", event => {
            if (event.key !== "Enter") return;

            const query = searchInput.value.trim();
            if (!query) return;

            window.location.href = `courses.html?search=${encodeURIComponent(query)}`;
        });
    }
}

export function updateTopbar(student = {}) {
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

    if (avatar) {
        avatar.textContent = name.charAt(0).toUpperCase();
    }
}
