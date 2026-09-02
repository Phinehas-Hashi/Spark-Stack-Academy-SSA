// ============================================================
// SPARK STACK ACADEMY — STUDENT SIDEBAR
// Behavior-only shell loader. Styling lives in components.css.
// ============================================================

const CACHE_KEY = "ssa_student_sidebar_html_v3";

function paint(html, container) {
    if (!container || !html) return false;
    container.innerHTML = html;
    initializeSidebar();
    window.lucide?.createIcons();
    return true;
}

export async function loadSidebar() {
    const container = document.getElementById("sidebarContainer");
    if (!container) return;

    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) paint(cached, container);

    try {
        const response = await fetch(new URL("./sidebar.html", import.meta.url), {
            cache: "no-cache"
        });
        if (!response.ok) {
            throw new Error(`Failed to load sidebar: ${response.status}`);
        }

        const html = await response.text();
        sessionStorage.setItem(CACHE_KEY, html);

        if (!cached || cached !== html) {
            paint(html, container);
        }
    } catch (error) {
        console.error("Sidebar loading failed:", error);
    }
}

function initializeSidebar() {
    const sidebar = document.getElementById("sidebar");
    const logoutBtn = document.getElementById("logoutBtn");
    const overlay = document.getElementById("sidebarOverlay");

    if (logoutBtn && !logoutBtn.dataset.bound) {
        logoutBtn.dataset.bound = "true";
        logoutBtn.addEventListener("click", async () => {
            try {
                const { auth } = await import("../../js/firebase.js");
                const { signOut } = await import(
                    "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js"
                );
                await signOut(auth);
            } catch (error) {
                console.error("Student logout failed:", error);
            } finally {
                window.location.replace("../login.html");
            }
        });
    }

    document.querySelectorAll("#sidebar a").forEach(link => {
        if (link.dataset.shellBound) return;
        link.dataset.shellBound = "true";
        link.addEventListener("click", () => {
            sidebar?.classList.remove("open");
            overlay?.classList.remove("show");
            overlay?.setAttribute("aria-hidden", "true");
            document.body.classList.remove("ssa-sidebar-open");
        });
    });
}

export function updateSidebar(student = {}) {
    const name = student.name || student.fullName || "Student";
    const initial = name.charAt(0).toUpperCase();
    const sidebarName = document.getElementById("sidebarName");
    const sidebarAvatar = document.getElementById("sidebarAvatar");
    const sidebarLevel = document.getElementById("sidebarLevel");

    if (sidebarName) {
        sidebarName.textContent = name;

        if (student.premium === true) {
            const badge = document.createElement("span");
            badge.className = "premium-badge";
            badge.title = "SSA Premium Verified";
            badge.textContent = "✓";
            sidebarName.append(" ", badge);
        }
    }

    if (sidebarAvatar) sidebarAvatar.textContent = initial;
    if (sidebarLevel) sidebarLevel.textContent = student.level || 1;
}
