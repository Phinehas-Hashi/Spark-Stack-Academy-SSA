// ============================================================
// SPARK STACK ACADEMY — STUDENT PORTAL CORE
// Auth + shell + Founder platform-control enforcement only.
// Dashboard/page data belongs to each page controller.
// ============================================================

import { auth, db } from "../../js/firebase.js";
import { watchPortalControl } from "../../js/portal-control.js";
import { loadSidebar, updateSidebar } from "../components/sidebar.js";
import { loadTopbar, updateTopbar } from "../components/topbar.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const state = { user: null, profile: null };
const $ = id => document.getElementById(id);

function safeText(value, fallback = "") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function highlightActivePage() {
    const current = location.pathname.split("/").pop() || "dashboard.html";
    document.querySelectorAll("[data-page], [data-nav]").forEach(link => {
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
        if (snap.exists()) {
            state.profile = { id: uid, ...snap.data() };
            return state.profile;
        }

        // Keep the shell usable even if the founder has not created the
        // student document yet. Do not create/overwrite it from the client.
        state.profile = { id: uid };
        console.warn("Student profile document not found:", uid);
        return state.profile;
    } catch (error) {
        console.error("Student profile read failed:", error);
        state.profile = { id: uid };
        return state.profile;
    }
}

async function initializeShell() {
    try { await loadSidebar(); }
    catch (error) { console.error("Student sidebar failed:", error); }

    try { await loadTopbar(); }
    catch (error) { console.error("Student topbar failed:", error); }

    highlightActivePage();

    try {
        const profile = await loadStudentProfile(state.user.uid);
        updateSidebar?.(profile);
        updateTopbar?.(profile);
    } catch (error) {
        console.error("Student shell profile update failed:", error);
    }

    window.ssaStudent = Object.freeze({
        get user() { return state.user; },
        get profile() { return state.profile; }
    });

    document.documentElement.classList.add("student-portal-ready");
}

function startPortalControl() {
    // This remains independent of profile/dashboard loading so a Founder
    // suspension or lockdown can always take control of the active session.
    try {
        watchPortalControl("student");
    } catch (error) {
        console.error("Platform control listener failed:", error);
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
            console.log("🔥 SSA Student Portal ready:", safeText(user.email, user.uid));
        } catch (error) {
            console.error("Student portal initialization failed:", error);
        }
    });
});
