// ============================================================
// SPARK STACK ACADEMY — STUDENT PORTAL CORE
// Auth + student identity + fast shell + Founder controls.
// ============================================================

import { auth, db } from "../../js/firebase.js";
import { watchPortalControl } from "../../js/portal-control.js";
import { loadSidebar, updateSidebar } from "../components/sidebar.js";
import { loadTopbar, updateTopbar } from "../components/topbar.js";
import "./notifications.js";
import { updateStudentStreak } from "./streak.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const state = { user: null, profile: null, controlUnsubscribe: null };
const currentPage = () => location.pathname.split("/").pop() || "dashboard.html";

function highlightActivePage() {
    const current = currentPage();
    document.querySelectorAll("#sidebar .sidebar-link, .sidebar-link, [data-page], [data-nav]").forEach(link => {
        const target = link.getAttribute("href") || link.dataset.page || link.dataset.nav || "";
        const active = target.split("?")[0].split("#")[0] === current;
        link.classList.toggle("active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
}

function updateDate() {
    const el = document.getElementById("todayDate");
    if (!el) return;
    el.textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

async function loadIdentity(uid) {
    const [userSnap, studentSnap] = await Promise.all([getDoc(doc(db, "users", uid)), getDoc(doc(db, "students", uid))]);
    if (!userSnap.exists()) throw new Error("Student account profile is missing.");
    const user = userSnap.data();
    if (user.role !== "student") throw new Error("This account is not registered as a student.");
    if (!studentSnap.exists()) throw new Error("Student admission profile is missing.");
    state.profile = { id: uid, ...studentSnap.data() };
    return state.profile;
}

async function initializeStudentPortal(user) {
    state.user = user;

    // Load the drawer first, then the topbar controller. The two shells
    // share the sidebar/overlay DOM, so ordering prevents a mobile-menu
    // race where topbar.js initializes before sidebar.js has injected it.
    await loadSidebar().catch(err => console.error("[SSA] Sidebar failed:", err));
    await loadTopbar().catch(err => console.error("[SSA] Topbar failed:", err));

    highlightActivePage();
    updateDate();

    const profile = await loadIdentity(user.uid);
    updateSidebar(profile);
    updateTopbar(profile);

    if (!state.controlUnsubscribe) {
        try { state.controlUnsubscribe = watchPortalControl("student"); }
        catch (err) { console.error("[SSA] Platform control listener failed:", err); }
    }

    if (currentPage() === "dashboard.html") {
        updateDashboardUI(profile);
        await Promise.allSettled([loadContinueCourses(user.uid), loadAnnouncements(), loadMessagesPreview(user.uid)]);
        loadGamification(profile);
    }

    try { await updateStudentStreak(user.uid); }
    catch (err) { console.warn("[SSA] Streak update skipped:", err); }

    document.documentElement.classList.add("student-portal-ready");
    window.ssaStudent = Object.freeze({ get user() { return state.user; }, get profile() { return state.profile; } });
    window.dispatchEvent(new CustomEvent("ssa:student-ready", { detail: profile }));
}

function updateDashboardUI(student) {
    const name = student.name || student.fullName || "Student";
    const email = student.email || state.user?.email || "";
    const initial = name.charAt(0).toUpperCase();

    document.getElementById("studentName")?.replaceChildren(document.createTextNode(name));
    const fullName = document.getElementById("studentFullName");
    if (fullName) {
        fullName.textContent = name;
        if (student.premium === true) {
            const badge = document.createElement("span");
            badge.className = "premium-badge";
            badge.title = "SSA Premium Verified";
            badge.textContent = "✓";
            fullName.append(" ", badge);
        }
    }
    document.getElementById("studentEmail")?.replaceChildren(document.createTextNode(email));
    document.getElementById("profileAvatar")?.replaceChildren(document.createTextNode(initial));
    const admission = document.getElementById("studentAdmission");
    if (admission) admission.textContent = `Admission: ${student.admissionNumber || "Pending"}`;

    const stats = student.stats || {};
    const progress = Number(stats.progress || 0);
    document.getElementById("courseCount")?.replaceChildren(document.createTextNode(stats.coursesEnrolled || 0));
    document.getElementById("lessonCount")?.replaceChildren(document.createTextNode(stats.lessonsCompleted || 0));
    document.getElementById("progressPercent")?.replaceChildren(document.createTextNode(`${progress}%`));
    document.getElementById("certificateCount")?.replaceChildren(document.createTextNode(stats.certificates || 0));
    document.getElementById("overallProgress")?.replaceChildren(document.createTextNode(`${progress}%`));
    const bar = document.getElementById("progressBarFill");
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
}

async function loadContinueCourses(uid) {
    const container = document.getElementById("continueCourses");
    if (!container) return;
    try {
        const snap = await getDocs(query(collection(db, "enrollments"), where("studentId", "==", uid)));
        if (snap.empty) {
            container.innerHTML = `<div class="course-card"><h3>No Active Courses</h3><p>Enroll into a course and start learning.</p><a href="courses.html">Browse Courses</a></div>`;
            return;
        }
        const courses = await Promise.all(snap.docs.map(async enrollment => {
            const data = enrollment.data();
            if (!data.courseId) return null;
            const courseSnap = await getDoc(doc(db, "courses", data.courseId));
            return courseSnap.exists() ? { id: data.courseId, ...courseSnap.data(), progress: Number(data.progress || 0) } : null;
        }));
        const valid = courses.filter(Boolean);
        if (!valid.length) {
            container.innerHTML = `<div class="course-card"><h3>No Active Courses</h3><p>Your enrolled course records are being prepared.</p></div>`;
            return;
        }
        container.innerHTML = valid.map(course => `
            <div class="course-card">
                <div class="course-header"><span>${course.progress}% Complete</span></div>
                <h3>${course.title || "Course"}</h3>
                <p>${course.description || "Continue your learning journey."}</p>
                <div class="course-progress"><div><span style="width:${Math.min(100, Math.max(0, course.progress))}%"></span></div></div>
                <a href="course-player.html?id=${encodeURIComponent(course.id)}" class="continue-btn">Continue Learning</a>
            </div>`).join("");
        window.lucide?.createIcons();
    } catch (error) {
        console.error("Courses loading error:", error);
        container.innerHTML = `<div class="course-card"><h3>Courses unavailable</h3><p>We couldn't load your courses right now.</p><button type="button" onclick="location.reload()">Retry</button></div>`;
    }
}

function loadGamification(student) {
    const xp = student.xp || 0;
    const level = student.level || 1;
    const streak = student.streak || 0;
    const badges = student.badges || [];
    document.getElementById("studentXP")?.replaceChildren(document.createTextNode(xp));
    document.getElementById("studentLevel")?.replaceChildren(document.createTextNode(level));
    document.getElementById("streakDays")?.replaceChildren(document.createTextNode(`${streak} Days`));
    document.getElementById("badgeCount")?.replaceChildren(document.createTextNode(`${badges.length} Badges`));
    const bar = document.getElementById("xpProgress");
    if (bar) bar.style.width = `${Math.min(100, (xp / 1000) * 100)}%`;
}

async function loadAnnouncements() {
    const container = document.getElementById("announcementPreview");
    if (!container) return;
    try {
        const snap = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(3)));
        container.innerHTML = snap.empty ? `<p>No announcements yet.</p>` : snap.docs.map(item => {
            const data = item.data();
            return `<div class="announcement-item"><h4>${data.title || "Announcement"}</h4><p>${data.message || ""}</p></div>`;
        }).join("");
    } catch (error) { console.warn("Announcements unavailable:", error); }
}

async function loadMessagesPreview(uid) {
    const container = document.getElementById("messagePreview");
    if (!container) return;
    try {
        const snap = await getDocs(query(collection(db, "messages"), where("receiverId", "==", uid), orderBy("createdAt", "desc"), limit(3)));
        container.innerHTML = snap.empty ? `<p>No new messages.</p>` : snap.docs.map(item => {
            const msg = item.data();
            return `<div class="message-item"><strong>${msg.senderName || "Student"}</strong><p>${msg.text || ""}</p></div>`;
        }).join("");
    } catch (error) { console.warn("Messages unavailable:", error); }
}

onAuthStateChanged(auth, user => {
    if (!user) {
        location.replace("../login.html");
        return;
    }
    initializeStudentPortal(user).catch(error => console.error("[SSA] Student portal boot failed:", error));
});

window.addEventListener("error", event => console.error("SSA Portal Error:", event.error));
console.log("%cSpark Stack Academy Student Portal Ready 🚀", "color:#2979FF;font-weight:bold;");
