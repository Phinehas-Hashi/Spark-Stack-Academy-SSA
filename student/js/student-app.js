// ============================================================
// SPARK STACK ACADEMY — STUDENT APP SHELL
// Student authentication + shared shell boot
// ============================================================

import { auth, db } from "../../js/firebase.js";
import { watchPortalControl } from "../../js/portal-control.js";
import {
    loadSidebar,
    updateSidebar
} from "../components/sidebar.js";
import {
    loadTopbar,
    updateTopbar
} from "../components/topbar.js";
import "./notifications.js";
import { updateStudentStreak } from "./streak.js";

// ------------------------------------------------------------
// SHARED SHELL — START IMMEDIATELY
// ------------------------------------------------------------

const shellPromise = Promise.allSettled([
    loadSidebar(),
    loadTopbar()
]);

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------

function getPageName() {
    return window.location.pathname.split("/").pop() || "dashboard.html";
}

function highlightActivePage() {
    const currentPage = getPageName();

    document.querySelectorAll(".sidebar-link").forEach(link => {
        const href = link.getAttribute("href");

        if (!href) return;

        const linkPage = href.split("/").pop();

        link.classList.toggle(
            "active",
            linkPage === currentPage
        );
    });
}

function updateDate() {
    const dateElement = document.getElementById("currentDate");

    if (!dateElement) return;

    dateElement.textContent = new Intl.DateTimeFormat(
        "en-KE",
        {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }
    ).format(new Date());
}

// ------------------------------------------------------------
// STUDENT PROFILE
// ------------------------------------------------------------

async function loadStudentProfile(user) {
    if (!user) return null;

    try {
        const { doc, getDoc } = await import(
            "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"
        );

        const snapshot = await getDoc(
            doc(db, "users", user.uid)
        );

        if (!snapshot.exists()) {
            return {
                uid: user.uid,
                name:
                    user.displayName ||
                    user.email?.split("@")[0] ||
                    "Student",
                email: user.email || "",
                level: 1,
                premium: false
            };
        }

        const data = snapshot.data();

        return {
            uid: user.uid,
            ...data,
            name:
                data.name ||
                data.fullName ||
                data.displayName ||
                user.displayName ||
                user.email?.split("@")[0] ||
                "Student",
            email:
                data.email ||
                user.email ||
                "",
            level:
                Number(data.level) ||
                1,
            premium:
                data.premium === true ||
                data.subscriptionStatus === "active"
        };
    } catch (error) {
        console.warn(
            "Student profile loading failed:",
            error
        );

        return {
            uid: user.uid,
            name:
                user.displayName ||
                user.email?.split("@")[0] ||
                "Student",
            email: user.email || "",
            level: 1,
            premium: false
        };
    }
}

// ------------------------------------------------------------
// SHELL IDENTITY
// ------------------------------------------------------------

async function updateStudentShell(student) {
    updateSidebar(student);
    updateTopbar(student);

    window.dispatchEvent(
        new CustomEvent("ssa:student-ready", {
            detail: student
        })
    );
}

// ------------------------------------------------------------
// AUTH BOOT
// ------------------------------------------------------------

async function bootStudent(user) {
    if (!user) return;

    try {
        await shellPromise;

        // Shell may have been injected while Firebase was loading.
        // Re-apply active state after injection.
        highlightActivePage();
        updateDate();

        const student = await loadStudentProfile(user);

        if (student) {
            await updateStudentShell(student);

            try {
                await updateStudentStreak(user.uid);
            } catch (error) {
                console.warn(
                    "Student streak update failed:",
                    error
                );
            }
        }
    } catch (error) {
        console.error(
            "Student application boot failed:",
            error
        );
    }
}

// ------------------------------------------------------------
// AUTH STATE
// ------------------------------------------------------------

auth.onAuthStateChanged(user => {
    if (!user) {
        window.location.replace("../login.html");
        return;
    }

    bootStudent(user);
});

// ------------------------------------------------------------
// PORTAL CONTROL
// ------------------------------------------------------------

try {
    watchPortalControl();
} catch (error) {
    console.warn(
        "Portal control unavailable:",
        error
    );
}

// ------------------------------------------------------------
// SAFETY: RE-RUN ACTIVE STATE AFTER SHELL INJECTION
// ------------------------------------------------------------

shellPromise.finally(() => {
    highlightActivePage();
    updateDate();
});