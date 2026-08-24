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
            "❌ Failed loading:",
            path,
            error
        );

        return false;

    }

}


// ============================================================
// LOAD SHELL
// ============================================================

async function loadShell() {

    console.log("🚀 Loading instructor shell...");


    await Promise.all([

        loadComponent(
            sidebar,
            "components/sidebar.html"
        ),

        loadComponent(
            topbar,
            "components/topbar.html"
        )

    ]);


    // IMPORTANT:
    // Components are now inside the DOM.

    setupMobileSidebar();

    setupLogout();

    setupNotifications();

    updateActiveLink();

    refreshIcons();


    console.log("✓ Instructor shell ready");

}


// ============================================================
// SIDEBAR
// ============================================================

function setupMobileSidebar() {

    const menuButton =
        document.getElementById("instructorMenuBtn");

    const sidebar =
        document.getElementById("instructorSidebar");

    const overlay =
        document.getElementById("sidebarOverlay");


    // OPEN
    menuButton?.addEventListener(
        "click",
        (event) => {

            event.stopPropagation();

            openSidebar();

        }
    );


    // CLOSE WHEN TAPPING OVERLAY
    overlay?.addEventListener(
        "click",
        closeSidebar
    );


    // CLOSE WHEN TAPPING ANYTHING OUTSIDE SIDEBAR
    document.addEventListener(
        "click",
        (event) => {

            if (!sidebar?.classList.contains("open")) {
                return;
            }

            const clickedInsideSidebar =
                sidebar.contains(event.target);

            const clickedMenuButton =
                menuButton?.contains(event.target);

            if (
                !clickedInsideSidebar &&
                !clickedMenuButton
            ) {

                closeSidebar();

            }

        }
    );


    // CLOSE WITH ESC
    document.addEventListener(
        "keydown",
        (event) => {

            if (event.key === "Escape") {

                closeSidebar();

            }

        }
    );


    // CLOSE AFTER NAVIGATION
    sidebar?.querySelectorAll(".nav-link")
        .forEach(link => {

            link.addEventListener(
                "click",
                closeSidebar
            );

        });

}
// ============================================================
// TOGGLE
// ============================================================

function toggleSidebar() {

    if (
        sidebar?.classList.contains("open")
    ) {

        closeSidebar();

    } else {

        openSidebar();

    }

}


// ============================================================
// OPEN
// ============================================================

function openSidebar() {

    sidebar?.classList.add("open");

    overlay?.classList.add("active");

    document.body.classList.add(
        "sidebar-open"
    );


    console.log(
        "📂 SIDEBAR OPENED"
    );

}


// ============================================================
// CLOSE
// ============================================================

function closeSidebar() {

    const sidebar =
        document.getElementById("instructorSidebar");

    const overlay =
        document.getElementById("sidebarOverlay");


    sidebar?.classList.remove("open");

    overlay?.classList.remove("active");

    document.body.classList.remove("sidebar-open");

    document.body.style.overflow = "";

}


// ============================================================
// ACTIVE LINK
// ============================================================

function updateActiveLink() {

    const currentPage =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();


    sidebar
        ?.querySelectorAll(".nav-link")
        .forEach(link => {

            const href =
                link.getAttribute("href");

            if (!href) return;


            const page =
                href
                    .split("/")
                    .pop()
                    .split("?")[0]
                    .toLowerCase();


            link.classList.toggle(
                "active",
                page === currentPage
            );

        });

}


// ============================================================
// LOGOUT
// ============================================================

function setupLogout() {

    document.addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    "#instructorLogoutBtn"
                );


            if (!button) return;


            try {

                button.disabled = true;

                await signOut(auth);

                window.location.href =
                    LOGIN_PAGE;

            } catch (error) {

                console.error(
                    "Logout failed:",
                    error
                );

                button.disabled = false;

            }

        }
    );

}


// ============================================================
// NOTIFICATIONS
// ============================================================

function setupNotifications() {

    const button =
        document.getElementById(
            "notificationBtn"
        );


    if (!button) return;


    button.addEventListener(
        "click",
        () => {

            window.location.href =
                "notifications.html";

        }
    );

}


// ============================================================
// AUTH
// ============================================================

function initAuth() {

    onAuthStateChanged(
        auth,
        async user => {

            if (!user) {

                window.location.href =
                    LOGIN_PAGE;

                return;

            }


            try {

                const ref =
                    doc(
                        db,
                        "users",
                        user.uid
                    );


                const snapshot =
                    await getDoc(ref);


                const data =
                    snapshot.exists()
                        ? snapshot.data()
                        : {};


                window.currentInstructor = {

                    uid: user.uid,

                    email:
                        user.email || "",

                    displayName:
                        data.displayName ||
                        data.name ||
                        user.displayName ||
                        "Instructor",

                    ...data

                };


                updateInstructorUI(
                    window.currentInstructor
                );


                refreshIcons();


            } catch (error) {

                console.error(
                    "❌ Instructor auth error:",
                    error
                );

            }

        }
    );

}


// ============================================================
// UPDATE PROFILE
// ============================================================

function updateInstructorUI(
    instructor
) {

    const name =
        instructor.displayName ||
        "Instructor";


    const initials =
        getInitials(name);


    setText(
        "sidebarInstructorName",
        name
    );


    setText(
        "topbarInstructorName",
        name
    );


    setText(
        "sidebarInstructorAvatar",
        initials
    );


    setText(
        "topbarInstructorAvatar",
        initials
    );


    setText(
        "instructorName",
        name
    );

}


// ============================================================
// INITIALS
// ============================================================

function getInitials(name) {

    const parts =
        String(name)
            .trim()
            .split(/\s+/)
            .filter(Boolean);


    if (!parts.length) return "I";

    if (parts.length === 1) {

        return parts[0]
            .charAt(0)
            .toUpperCase();

    }


    return (
        parts[0].charAt(0) +
        parts[parts.length - 1].charAt(0)
    ).toUpperCase();

}


// ============================================================
// HELPER
// ============================================================

function setText(id, value) {

    const element =
        document.getElementById(id);


    if (element) {

        element.textContent = value;

    }

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

    await loadShell();

    initAuth();

    // Listen for Founder Command Center controls
    watchPortalControl("instructor");

}


boot();