// ============================================================
// SPARK STACK ACADEMY — ADMIN / MODERATOR APP ENGINE
// ============================================================
console.log("🛡️ ADMIN APP JS LOADED");

import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COMPONENTS = { sidebar:"components/sidebar.html", topbar:"components/topbar.html" };
const sidebar = document.getElementById("adminSidebar"), topbar = document.getElementById("adminTopbar");

async function fetchComponent(path) { const response = await fetch(path); if (!response.ok) throw new Error(`Failed to load ${path} (${response.status})`); return response.text(); }

function initAdminModalState() {
    const sync = () => {
        const open = [...document.querySelectorAll(".admin-modal")].some(modal =>
            !modal.classList.contains("hidden") && modal.getAttribute("aria-hidden") !== "true"
        );
        document.body.classList.toggle("admin-modal-open", open);
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "aria-hidden"]
    });
    sync();
}


async function loadAdminShell() {
    try {
        const [sidebarHTML, topbarHTML] = await Promise.all([fetchComponent(COMPONENTS.sidebar), fetchComponent(COMPONENTS.topbar)]);
        if (sidebar) sidebar.innerHTML = sidebarHTML;
        if (topbar) topbar.innerHTML = topbarHTML;
        await Promise.all([import("../components/sidebar.js"), import("../components/topbar.js")]);
        window.AdminSidebar?.init?.(); window.AdminTopbar?.init?.();
        return true;
    } catch (error) { console.error("❌ Admin shell failed:", error); return false; }
}

async function getAdminProfile(uid) {
    try { const snapshot = await getDoc(doc(db, "users", uid));
        if (snapshot.exists()) {
            const profile = { uid, ...snapshot.data() };
            if (String(profile.role || "").toLowerCase() !== "founder") return profile;
            const founderSnapshot = await getDoc(doc(db, "founder", uid));
            if (!founderSnapshot.exists()) return null;
            const founder = founderSnapshot.data();
            if (founder.role !== "founder" || founder.status !== "active" || founder.active === false || founder.verified === false) return null;
            return { ...profile, role: "founder", active: true, status: "active" };
        }
        const founderSnapshot = await getDoc(doc(db, "founder", uid));
        if (!founderSnapshot.exists()) return null;
        const founder = founderSnapshot.data();
        return founder.role === "founder" && founder.status === "active" && founder.active !== false && founder.verified !== false
            ? { uid, ...founder, role: "founder", active: true, status: "active" } : null; }
    catch (error) { console.error("❌ Failed loading admin profile:", error); return null; }
}

function isAuthorized(profile) {
    if (!profile) return false;
    const role = String(profile.role || "").trim().toLowerCase();
    return ["admin", "administrator", "moderator", "finance_manager", "financial_manager", "founder"].includes(role)
        && profile.active !== false
        && profile.status !== "suspended";
}

function syncAdminProfile(profile) { window.AdminSidebar?.updateProfile?.(profile); window.AdminTopbar?.updateProfile?.(profile); }

function denyAccess() {
    document.body.innerHTML = `<main class="admin-access-denied"><div class="access-denied-content"><div class="access-denied-icon">🛡️</div><h1>Access Restricted</h1><p>You don't have permission to access the Spark Stack Academy moderator console.</p><a href="../login.html" class="access-denied-btn">Return to Login</a></div></main>`;
}

async function logoutAdmin() {
    try { await signOut(auth); window.location.href = "../login.html"; }
    catch (error) { console.error("❌ Logout failed:", error); window.ssaToast?.("Unable to sign out. Please try again.", "error", "Admin"); }
}

function initLogout() {
    document.addEventListener("click", event => {
        const button = event.target.closest("#adminLogoutBtn, #adminDropdownLogout");
        if (!button) return; event.preventDefault(); logoutAdmin();
    });
}

window.AdminApp = { getProfile:getAdminProfile, logout:logoutAdmin, isAuthorized, getCurrentUser:() => auth.currentUser };

async function bootAdmin() {
    const shellReady = await loadAdminShell();
    if (!shellReady) return;
    initAdminModalState();
    initLogout();
    onAuthStateChanged(auth, async user => {
        if (!user) { window.location.href = "../login.html"; return; }
        const profile = await getAdminProfile(user.uid);
        if (!isAuthorized(profile)) { denyAccess(); return; }
        syncAdminProfile(profile);
        document.dispatchEvent(new CustomEvent("admin:ready", { detail:{ user, profile } }));
    });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootAdmin, { once:true }); else bootAdmin();