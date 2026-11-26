// ============================================================
// SPARK STACK ACADEMY — ADMIN PORTAL ACCESS GUARD
// ============================================================
import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COMPONENTS = { sidebar:"components/sidebar.html", topbar:"components/topbar.html" };
const sidebar = document.getElementById("adminSidebar"), topbar = document.getElementById("adminTopbar");

async function fetchComponent(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`);
    return response.text();
}

async function loadAdminShell() {
    try {
        const [sidebarHTML, topbarHTML] = await Promise.all([
            fetchComponent(COMPONENTS.sidebar), fetchComponent(COMPONENTS.topbar)
        ]);
        if (sidebar) sidebar.innerHTML = sidebarHTML;
        if (topbar) topbar.innerHTML = topbarHTML;
        await Promise.all([import("../components/sidebar.js"), import("../components/topbar.js")]);
        window.AdminSidebar?.init?.();
        window.AdminTopbar?.init?.();
        return true;
    } catch (error) {
        console.error("Admin shell failed:", error);
        return false;
    }
}

// Founder identity is resolved first and is authoritative. A stale users
// document must never replace or downgrade a real Founder record.
async function getAdminProfile(uid) {
    try {
        const founderSnapshot = await getDoc(doc(db, "founder", uid));
        if (founderSnapshot.exists()) {
            const founder = founderSnapshot.data();
            if (founder.role !== "founder" || founder.status !== "active" ||
                founder.active !== true || founder.verified !== true) return null;
            return { uid, ...founder, role:"founder", active:true, status:"active" };
        }

        const userSnapshot = await getDoc(doc(db, "users", uid));
        if (!userSnapshot.exists()) return null;
        const profile = { uid, ...userSnapshot.data() };
        return profile.role === "admin" &&
            profile.active === true &&
            profile.status === "active" ? profile : null;
    } catch (error) {
        console.error("Privileged profile verification failed:", error);
        return null;
    }
}

function isAuthorized(profile) {
    return Boolean(profile) &&
        ((profile.role === "founder" && profile.active === true &&
          profile.status === "active" && profile.verified === true) ||
         (profile.role === "admin" && profile.active === true &&
          profile.status === "active"));
}

function syncAdminProfile(profile) {
    window.AdminSidebar?.updateProfile?.(profile);
    window.AdminTopbar?.updateProfile?.(profile);
}

function denyAccess() {
    document.body.innerHTML = `<main class="admin-access-denied">
      <div class="access-denied-content">
        <div class="access-denied-icon">🛡️</div>
        <h1>Access Restricted</h1>
        <p>This account is not authorized for the Spark Stack privileged portal.</p>
        <a href="../admin-login.html" class="access-denied-btn">Return to Admin &amp; Founder Login</a>
      </div>
    </main>`;
}

async function logoutAdmin() {
    try {
        await signOut(auth);
        window.location.href = "../admin-login.html";
    } catch (error) {
        console.error("Logout failed:", error);
        window.ssaToast?.("Unable to sign out. Please try again.", "error", "Admin");
    }
}

function initLogout() {
    document.addEventListener("click", event => {
        const button = event.target.closest("#adminLogoutBtn, #adminDropdownLogout");
        if (!button) return;
        event.preventDefault();
        logoutAdmin();
    });
}

window.AdminApp = {
    getProfile:getAdminProfile,
    logout:logoutAdmin,
    isAuthorized,
    getCurrentUser:() => auth.currentUser
};

async function bootAdmin() {
    initLogout();
    onAuthStateChanged(auth, async user => {
        if (!user) {
            window.location.replace("../admin-login.html");
            return;
        }
        const profile = await getAdminProfile(user.uid);
        if (!isAuthorized(profile)) {
            denyAccess();
            return;
        }
        const shellReady = await loadAdminShell();
        if (!shellReady) return;
        syncAdminProfile(profile);
        document.dispatchEvent(new CustomEvent("admin:ready", { detail:{ user, profile } }));
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAdmin, { once:true });
} else {
    bootAdmin();
}
