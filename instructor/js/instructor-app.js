console.log("🔥 INSTRUCTOR APP JS LOADED");

// ============================================================
// SPARK STACK ACADEMY
// INSTRUCTOR PORTAL
// APP SHELL ENGINE
// ============================================================

import {
    auth,
    db
} from "../../js/firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    watchPortalControl
} from "../../js/portal-control.js";


// ============================================================
// CONFIG
// ============================================================

const LOGIN_PAGE = "../login.html";


// ============================================================
// DOM
// ============================================================

const sidebar =
    document.getElementById("instructorSidebar");

const topbar =
    document.getElementById("instructorTopbar");

const overlay =
    document.getElementById("sidebarOverlay");


// ============================================================
// LOAD COMPONENTS
// ============================================================

async function loadComponent(container, path) {

    if (!container) {

        console.error("❌ Missing container:", path);

        return false;

    }

    try {

        const response = await fetch(path);

        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }

        container.innerHTML =
            await response.text();

        console.log("✓ Loaded:", path);

        return true;

    } catch (error) {

        console.error(
            "❌ Component load failed:",
            path,
            error
        );

        return false;

    }

}


async function loadShell() {

    await loadComponent(
        sidebar,
        "components/sidebar.html"
    );

    await loadComponent(
        topbar,
        "components/topbar.html"
    );

    refreshIcons();

    initSidebar();

    initTopbar();

}


// ============================================================
// SIDEBAR
// ============================================================

function initSidebar() {

    if (!overlay) return;

    document.addEventListener("click", event => {

        const toggle =
            event.target.closest("[data-sidebar-toggle]");

        if (toggle) {

            document.body.classList.toggle(
                "sidebar-open"
            );

        }

        if (
            event.target === overlay ||
            event.target.closest(".sidebar-link")
        ) {

            document.body.classList.remove(
                "sidebar-open"
            );

        }

    });

}


// ============================================================
// TOPBAR
// ============================================================

function initTopbar() {

    document.addEventListener("click", event => {

        const profile =
            event.target.closest("[data-profile-menu]");

        if (profile) {

            document.body.classList.toggle(
                "profile-menu-open"
            );

        }

    });

}


// ============================================================
// AUTH
// ============================================================

function initAuth() {

    onAuthStateChanged(
        auth,
        async user => {

            if (!user) {

                window.location.replace(
                    LOGIN_PAGE
                );

                return;

            }

            try {

                const snap = await getDoc(
                    doc(db, "users", user.uid)
                );

                if (!snap.exists()) {

                    throw new Error(
                        "Instructor profile not found."
                    );

                }

                const data = snap.data();

                if (data.role !== "instructor") {

                    throw new Error(
                        "This account is not registered as an instructor."
                    );

                }

                console.log(
                    "✓ Instructor authenticated:",
                    user.uid
                );

                document.body.classList.add(
                    "instructor-authenticated"
                );

            } catch (error) {

                console.error(
                    "❌ Instructor authentication failed:",
                    error
                );

                try {
                    await signOut(auth);
                } catch {}

                window.location.replace(
                    LOGIN_PAGE
                );

            }

        }
    );

}


// ============================================================
// ICONS
// ============================================================

function refreshIcons() {

    if (
        window.lucide &&
        typeof window.lucide.createIcons ===
            "function"
    ) {

        window.lucide.createIcons();

    }

}


// ============================================================
// BOOT
// ============================================================

async function boot() {

    // Start Founder platform controls before shell/auth work so a live
    // suspension or lockdown can block an already-authenticated instructor
    // immediately, even if component loading is slow.
    watchPortalControl("instructor");

    await loadShell();

    initAuth();

}


boot();