// =====================================
// SPARK STACK ACADEMY — STUDENT DASHBOARD
// =====================================

import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const text = (id, value) => { const el = $(id); if (el) el.textContent = value; };
const clamp = value => Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 0;
const escapeHTML = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");

async function loadStudent(uid) {
    const [studentSnap, userSnap] = await Promise.all([
        getDoc(doc(db, "students", uid)),
        getDoc(doc(db, "users", uid))
    ]);
    if (!userSnap.exists() || userSnap.data().role !== "student" || userSnap.data().status !== "active") {
        throw new Error("Your student admission is not active.");
    }
    if (!studentSnap.exists()) throw new Error("Your student admission profile is missing.");
    return { ...studentSnap.data(), email: studentSnap.data().email || userSnap.data().email || auth.currentUser?.email || "", name: studentSnap.data().name || userSnap.data().fullName || "Student" };
}

function renderProfile(student) {
    const name = student.name || student.fullName || "Student";
    const stats = student.stats || {};
    const progress = clamp(stats.progress ?? student.progress ?? 0);
    const xp = Math.max(0, Number(student.xp ?? 0));
    const level = Math.max(1, Number(student.level ?? Math.floor(xp / 250) + 1));
    const streak = Math.max(0, Number(student.streak ?? 0));
    const badges = Array.isArray(student.badges) ? student.badges : [];

    text("studentName", name); text("studentFullName", name); text("studentEmail", student.email);
    text("studentAdmission", `Admission: ${student.admissionNumber || "Pending"}`);
    text("courseCount", Number(stats.coursesEnrolled ?? 0)); text("lessonCount", Number(stats.lessonsCompleted ?? 0));
    text("certificateCount", Number(stats.certificates ?? 0)); text("progressPercent", `${progress}%`); text("overallProgress", `${progress}%`);
    text("studentXP", xp); text("studentLevel", level); text("streakDays", `${streak} Days`);
    text("learningStreak", `${streak} Day${streak === 1 ? "" : "s"} Streak`); text("badgeCount", `${badges.length} Badges`);

    const avatar = $("profileAvatar"); if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
    const progressBar = $("progressBarFill"); if (progressBar) progressBar.style.width = `${progress}%`;
    const xpProgress = $("xpProgress"); if (xpProgress) xpProgress.style.width = `${(xp % 250) / 250 * 100}%`;
}

async function loadCourses(uid) {
    const container = $("continueCourses"); if (!container) return;
    try {
        const enrollments = await getDocs(query(collection(db, "enrollments"), where("studentId", "==", uid)));
        if (enrollments.empty) {
            container.innerHTML = `<div class="course-card"><div class="loading-icon"><i data-lucide="book-open"></i></div><h3>No Active Courses</h3><p>Enroll into a course and start learning.</p><a href="courses.html">Browse Courses</a></div>`;
            window.lucide?.createIcons(); return;
        }
        const results = await Promise.allSettled(enrollments.docs.map(async item => {
            const enrollment = item.data(); if (!enrollment.courseId) return null;
            const course = await getDoc(doc(db, "courses", enrollment.courseId)); if (!course.exists()) return null;
            return { id: course.id, data: course.data(), progress: clamp(enrollment.progress ?? 0) };
        }));
        const courses = results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
        if (!courses.length) { container.innerHTML = `<div class="course-card"><h3>Courses temporarily unavailable</h3><p>Your enrollment exists, but course details could not be loaded.</p></div>`; return; }
        container.innerHTML = courses.map(course => {
            const title = escapeHTML(course.data.title || "Course"); const description = escapeHTML(course.data.description || "Continue your learning journey.");
            return `<div class="course-card"><div class="course-header"><div class="loading-icon"><i data-lucide="play-circle"></i></div><span>${course.progress}% Complete</span></div><h3>${title}</h3><p>${description}</p><div class="course-progress"><div><span style="width:${course.progress}%"></span></div></div><a href="course-player.html?id=${encodeURIComponent(course.id)}" class="continue-btn">Continue Learning</a></div>`;
        }).join("");
        window.lucide?.createIcons();
    } catch (error) { console.error("[SSA Dashboard] Courses failed:", error); container.innerHTML = `<div class="course-card"><h3>Courses temporarily unavailable</h3><p>Please try again shortly.</p></div>`; }
}

async function loadAnnouncements() {
    const container = $("announcementPreview"); if (!container) return;
    try {
        const snap = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(3)));
        if (snap.empty) { container.innerHTML = `<p>No announcements yet.</p>`; return; }
        container.innerHTML = snap.docs.map(item => { const a = item.data(); return `<div class="dashboard-mini-item"><strong>${escapeHTML(a.title || "SSA Announcement")}</strong><p>${escapeHTML(a.message || a.content || "")}</p></div>`; }).join("");
    } catch (error) { console.error("[SSA Dashboard] Announcements failed:", error); container.innerHTML = `<p>Announcements are temporarily unavailable.</p>`; }
}

async function loadActivity(uid) {
    const container = $("recentActivity"); if (!container) return;
    try {
        // Avoid the composite index requirement: filter by user, then sort locally.
        const snap = await getDocs(query(collection(db, "notifications"), where("userId", "==", uid), limit(25)));
        const rows = snap.docs.map(item => ({ id: item.id, ...item.data() })).sort((a,b) => {
            const av = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
            const bv = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
            return bv - av;
        }).slice(0,5);
        if (!rows.length) return;
        container.innerHTML = rows.map(n => `<div class="activity-item"><div class="activity-icon"><i data-lucide="bell"></i></div><div><h4>${escapeHTML(n.title || "Notification")}</h4><p>${escapeHTML(n.message || "You have a new update.")}</p></div></div>`).join("");
        window.lucide?.createIcons();
    } catch (error) { console.error("[SSA Dashboard] Activity failed:", error); }
}

async function loadDashboard(uid) {
    const student = await loadStudent(uid);
    renderProfile(student);
    await Promise.allSettled([loadCourses(uid), loadAnnouncements(), loadActivity(uid)]);
    const date = $("todayDate"); if (date) date.textContent = new Date().toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" });
    window.lucide?.createIcons();
}

function start() {
    if (location.pathname.split("/").pop() !== "dashboard.html") return;
    onAuthStateChanged(auth, user => {
        if (!user) return;
        loadDashboard(user.uid).catch(error => { console.error("[SSA Dashboard] Failed:", error); text("studentName", "Student"); });
    });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
