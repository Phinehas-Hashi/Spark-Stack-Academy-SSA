// ============================================================
// SPARK STACK ACADEMY — STUDENT PORTAL CORE
// Auth + shell + Founder platform-control enforcement only.
// Dashboard/page data belongs to each page controller.
// ============================================================

import { auth, db } from "../../js/firebase.js";
import { watchPortalControl } from "../../js/portal-control.js";
import { loadSidebar, updateSidebar } from "../components/sidebar.js";
import { loadTopbar } from "../components/topbar.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const state = { user: null, profile: null };

function highlightActivePage() {
    const current = location.pathname.split("/").pop() || "dashboard.html";
    document.querySelectorAll("#sidebar a, .student-sidebar a, [data-page], [data-nav]").forEach(link => {
        const target = link.getAttribute("href") || link.dataset.page || link.dataset.nav || "";
        const active = target.split("?")[0].split("#")[0] === current;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
}

async function loadStudentProfile(uid) {
    try {
        const snap = await getDoc(doc(db, "students", uid));
        state.profile = snap.exists() ? { id: uid, ...snap.data() } : { id: uid };
        if (!snap.exists()) console.warn("[SSA] Student profile document not found:", uid);
        return state.profile;
    } catch (error) {
        console.error("[SSA] Student profile read failed:", error);
        state.profile = { id: uid };
        return state.profile;
    }
}

async function initializeShell() {
    try { await loadSidebar(); }
    catch (error) { console.error("[SSA] Sidebar failed:", error); }

    try { await loadTopbar(); }
    catch (error) { console.error("[SSA] Topbar failed:", error); }

    highlightActivePage();

    const profile = await loadStudentProfile(state.user.uid);
    updateSidebar?.(profile);

    window.ssaStudent = Object.freeze({
        get user() { return state.user; },
        get profile() { return state.profile; }
    });

    document.documentElement.classList.add("student-portal-ready");
}

function startPortalControl() {
    try {
        // Keep Founder controls independent from page-data loading.
        watchPortalControl("student");
    } catch (error) {
        console.error("[SSA] Platform control listener failed:", error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    startPortalControl();

    onAuthStateChanged(auth, async user => {
        if (!user) {
            window.location.replace("../login.html");
            return;
        }

        state.user = user;

        try {
            await initializeShell();
            console.log("🔥 SSA Student Portal ready:", user.email || user.uid);
        } catch (error) {
            console.error("[SSA] Portal initialization failed:", error);
        }
    });
});
