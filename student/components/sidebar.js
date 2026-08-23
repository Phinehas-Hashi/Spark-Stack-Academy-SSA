// =====================================
// SPARK STACK ACADEMY
// STUDENT SIDEBAR V3
// =====================================

console.log("🚀 SSA Student Sidebar Loaded");

export async function loadSidebar() {
    const container = document.getElementById("sidebarContainer");
    if (!container) return;

    try {
        const response = await fetch(new URL("./sidebar.html", import.meta.url));
        if (!response.ok) throw new Error(`Failed to load sidebar: ${response.status}`);

        container.innerHTML = await response.text();
        initializeSidebar();
        window.lucide?.createIcons();
    } catch (error) {
        console.error("Sidebar loading failed:", error);
    }
}

function initializeSidebar() {
    const sidebar = document.getElementById("sidebar");
    const logoutBtn = document.getElementById("logoutBtn");
    const overlay = document.getElementById("sidebarOverlay");

    logoutBtn?.addEventListener("click", async () => {
        try {
            const { auth } = await import("../../js/firebase.js");
            const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
            await signOut(auth);
        } catch (error) {
            console.error("Student logout failed:", error);
        } finally {
            window.location.replace("../login.html");
        }
    });

    document.querySelectorAll("#sidebar a").forEach(link => {
        link.addEventListener("click", () => {
            sidebar?.classList.remove("open");
            overlay?.classList.remove("show");
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
            sidebarName.appendChild(document.createTextNode(" "));
            sidebarName.appendChild(badge);
        }
    }

    if (sidebarAvatar) sidebarAvatar.textContent = initial;
    if (sidebarLevel) sidebarLevel.textContent = student.level || 1;
}
