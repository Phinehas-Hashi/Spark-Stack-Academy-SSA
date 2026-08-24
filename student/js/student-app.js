// ============================================================
// SPARK STACK ACADEMY — STUDENT PORTAL CORE
// Auth + student identity + shell + Founder platform controls.
// ============================================================

import { auth, db } from "../../js/firebase.js";
import { watchPortalControl } from "../../js/portal-control.js";
import { loadSidebar, updateSidebar } from "../components/sidebar.js";
import { loadTopbar, updateTopbar } from "../components/topbar.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const state = { user: null, userProfile: null, profile: null, controlUnsubscribe: null };
const page = () => location.pathname.split("/").pop() || "dashboard.html";

function highlightActivePage() {
    const current = page();
    document.querySelectorAll("#sidebar a, .student-sidebar a, [data-page], [data-nav]").forEach(link => {
        const target = link.getAttribute("href") || link.dataset.page || link.dataset.nav || "";
        const active = target.split("?")[0].split("#")[0] === current;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
}

async function loadIdentity(uid) {
    const [userSnap, studentSnap] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        getDoc(doc(db, "students", uid))
    ]);
    if (!userSnap.exists()) throw new Error("Student account profile is missing.");
    const userProfile = userSnap.data();
    if (userProfile.role !== "student") throw new Error("This account is not registered as a student.");
    if (!studentSnap.exists()) throw new Error("Student admission profile is missing.");
    state.userProfile = { id: uid, ...userProfile };
    state.profile = { id: uid, ...studentSnap.data() };
    return state.profile;
}

async function initializeShell() {
    // Sidebar and topbar are independent. Never make one wait for the other.
    await Promise.all([
        loadSidebar().catch(error => console.error("[SSA] Sidebar failed:", error)),
        loadTopbar().catch(error => console.error("[SSA] Topbar failed:", error))
    ]);

    highlightActivePage();

    const profile = await loadIdentity(state.user.uid);
    updateSidebar(profile);
    updateTopbar(profile);

    window.ssaStudent = Object.freeze({
        get user() { return state.user; },
        get userProfile() { return state.userProfile; },
        get profile() { return state.profile; }
    });
    document.documentElement.classList.add("student-portal-ready");
}

function startPortalControl() {
    if (state.controlUnsubscribe) return;
    try { state.controlUnsubscribe = watchPortalControl("student"); }
    catch (error) { console.error("[SSA] Platform control listener failed:", error); }
}

async function boot(user) {
    state.user = user;
    startPortalControl();
    try {
        await initializeShell();
        window.dispatchEvent(new CustomEvent("ssa:student-ready", { detail: state.profile }));
    } catch (error) {
        console.error("[SSA] Student portal initialization failed:", error);
    }
}

onAuthStateChanged(auth, user => {
    if (!user) {
        window.location.replace("../login.html");
        return;
    }
    boot(user);
});
