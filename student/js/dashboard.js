// =====================================
// SPARK STACK ACADEMY — STUDENT DASHBOARD
// Authenticated student data + learning stats
// =====================================

import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const setText = (id, value) => { const el = $(id); if (el) el.textContent = value ?? "—"; };
const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));
const escapeHTML = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));

function timestampValue(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

async function loadStudent(uid, authUser) {
    // The canonical student record is students/{firebaseAuthUid}.
    // users/{uid} is only a profile fallback. Never use a collection-wide
    // students query because that can display another student's information.
    const studentSnap = await getDoc(doc(db, "students", uid));
    const userSnap = await getDoc(doc(db, "users", uid));

    if (!studentSnap.exists() && !userSnap.exists()) {
        throw new Error("Your student profile could not be found.");
    }

    const student = studentSnap.exists() ? studentSnap.data() : {};
    const user = userSnap.exists() ? userSnap.data() : {};

    if (user.role && user.role !== "student") {
        throw new Error("This account is not registered as a student.");
    }
    if (student.role && student.role !== "student") {
        throw new Error("This profile is not registered as a student.");
    }

    const name = student.name || student.fullName || student.studentName || user.fullName || user.name || authUser.displayName || "Student";
    const email = student.email || user.email || authUser.email || "";

    return {
        ...user,
        ...student,
        uid,
        id: uid,
        name,
        fullName: student.fullName || user.fullName || name,
        email,
        admissionNumber: student.admissionNumber || student.admissionNo || user.admissionNumber || user.admissionNo || "Pending",
        status: student.status || user.status || "Pending"
    };
}

async function loadLearningData(uid, student) {
    let enrollments = [];

    // Current student pages use students/{uid}/enrollments/{id}.
    try {
        const nested = await getDocs(collection(db, "students", uid, "enrollments"));
        enrollments = nested.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (error) {
        console.warn("[SSA Dashboard] Nested enrollments unavailable:", error);
    }

    // Backward-compatible fallback for older top-level enrollment records.
    if (!enrollments.length) {
        try {
            const queries = [
                query(collection(db, "enrollments"), where("studentId", "==", uid)),
                query(collection(db, "enrollments"), where("studentUid", "==", uid))
            ];
            const snapshots = await Promise.allSettled(queries.map(q => getDocs(q)));
            const map = new Map();
            snapshots.forEach(result => {
                if (result.status !== "fulfilled") return;
                result.value.docs.forEach(d => map.set(d.id, { id: d.id, ...d.data() }));
            });
            enrollments = [...map.values()];
        } catch (error) {
            console.warn("[SSA Dashboard] Legacy enrollments unavailable:", error);
        }
    }

    const stats = student.stats || {};
    const progressValues = enrollments.map(e => clamp(e.progress ?? e.completion ?? 0));
    const calculatedProgress = progressValues.length
        ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
        : clamp(stats.progress ?? student.progress ?? 0);
    const completedLessons = Number(stats.lessonsCompleted ?? student.lessonsCompleted ?? 0);
    const certificates = Number(stats.certificates ?? student.certificates ?? 0);
    const xp = Math.max(0, Number(student.xp ?? 0));
    const level = Math.max(1, Number(student.level ?? Math.floor(xp / 250) + 1));
    const streak = Math.max(0, Number(student.streak ?? 0));
    const badges = Array.isArray(student.badges) ? student.badges : [];

    return {
        enrollments,
        coursesCount: enrollments.length || Number(stats.coursesEnrolled ?? 0),
        lessonsCompleted: completedLessons,
        certificates,
        progress: calculatedProgress,
        xp,
        level,
        streak,
        badges
    };
}

function renderStudent(student, learning) {
    const name = student.name || "Student";
    setText("studentName", name);
    setText("studentFullName", name);
    setText("studentEmail", student.email || "");
    setText("studentAdmission", `Admission: ${student.admissionNumber || "Pending"}`);

    setText("courseCount", learning.coursesCount);
    setText("lessonCount", learning.lessonsCompleted);
    setText("certificateCount", learning.certificates);
    setText("progressPercent", `${learning.progress}%`);
    setText("overallProgress", `${learning.progress}%`);
    setText("studentXP", learning.xp);
    setText("studentLevel", learning.level);
    setText("streakDays", `${learning.streak} Day${learning.streak === 1 ? "" : "s"}`);
    setText("learningStreak", `${learning.streak} Day${learning.streak === 1 ? "" : "s"} Streak`);
    setText("badgeCount", `${learning.badges.length} Badges`);

    const avatar = $("profileAvatar");
    if (avatar) avatar.textContent = name.charAt(0).toUpperCase();

    const progressBar = $("progressBarFill");
    if (progressBar) progressBar.style.width = `${learning.progress}%`;

    const xpProgress = $("xpProgress");
    if (xpProgress) xpProgress.style.width = `${(learning.xp % 250) / 250 * 100}%`;
}

async function loadCourses(learning) {
    const container = $("continueCourses");
    if (!container) return;

    if (!learning.enrollments.length) {
        container.innerHTML = `<div class="course-card"><div class="loading-icon"><i data-lucide="book-open"></i></div><h3>No Active Courses</h3><p>Enroll into a course and start learning.</p><a href="courses.html">Browse Courses</a></div>`;
        window.lucide?.createIcons();
        return;
    }

    const results = await Promise.allSettled(learning.enrollments.map(async enrollment => {
        const courseId = enrollment.courseId || enrollment.courseUid || enrollment.course;
        if (!courseId) return { id: enrollment.id, data: { title: enrollment.courseName || "Course" }, progress: clamp(enrollment.progress ?? 0) };
        const courseSnap = await getDoc(doc(db, "courses", courseId));
        return {
            id: courseId,
            data: courseSnap.exists() ? courseSnap.data() : { title: enrollment.courseName || "Course" },
            progress: clamp(enrollment.progress ?? enrollment.completion ?? 0)
        };
    }));

    const courses = results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
    container.innerHTML = courses.map(course => {
        const title = escapeHTML(course.data.title || course.data.name || "Course");
        const description = escapeHTML(course.data.description || "Continue your learning journey.");
        return `<div class="course-card"><div class="course-header"><div class="loading-icon"><i data-lucide="play-circle"></i></div><span>${course.progress}% Complete</span></div><h3>${title}</h3><p>${description}</p><div class="course-progress"><div><span style="width:${course.progress}%"></span></div></div><a href="course-player.html?id=${encodeURIComponent(course.id)}" class="continue-btn">Continue Learning</a></div>`;
    }).join("");
    window.lucide?.createIcons();
}

async function loadAnnouncements() {
    const container = $("announcementPreview");
    if (!container) return;
    try {
        let snap;
        try {
            snap = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(3)));
        } catch {
            snap = await getDocs(query(collection(db, "announcements"), limit(3)));
        }
        if (snap.empty) { container.innerHTML = `<p>No announcements yet.</p>`; return; }
        const rows = [...snap.docs].sort((a,b) => timestampValue(b.data().createdAt || b.data().created_at) - timestampValue(a.data().createdAt || a.data().created_at));
        container.innerHTML = rows.map(item => {
            const a = item.data();
            return `<div class="dashboard-mini-item"><strong>${escapeHTML(a.title || "SSA Announcement")}</strong><p>${escapeHTML(a.message || a.content || "")}</p></div>`;
        }).join("");
    } catch (error) {
        console.error("[SSA Dashboard] Announcements failed:", error);
        container.innerHTML = `<p>Announcements are temporarily unavailable.</p>`;
    }
}

async function loadActivity(uid) {
    const container = $("recentActivity");
    if (!container) return;
    try {
        const snap = await getDocs(query(collection(db, "notifications"), where("userId", "==", uid), limit(25)));
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            .sort((a,b) => timestampValue(b.createdAt || b.created_at) - timestampValue(a.createdAt || a.created_at))
            .slice(0, 5);
        if (!rows.length) return;
        container.innerHTML = rows.map(n => `<div class="activity-item"><div class="activity-icon"><i data-lucide="bell"></i></div><div><h4>${escapeHTML(n.title || "Notification")}</h4><p>${escapeHTML(n.message || "You have a new update.")}</p></div></div>`).join("");
        window.lucide?.createIcons();
    } catch (error) {
        console.warn("[SSA Dashboard] Activity unavailable:", error);
    }
}

async function loadDashboard(user) {
    const student = await loadStudent(user.uid, user);
    const learning = await loadLearningData(user.uid, student);

    window.ssaCurrentStudent = Object.freeze({ ...student, learning });
    renderStudent(student, learning);

    await Promise.allSettled([
        loadCourses(learning),
        loadAnnouncements(),
        loadActivity(user.uid)
    ]);

    setText("todayDate", new Date().toLocaleDateString("en-KE", { weekday: "long", month: "short", day: "numeric" }));
    window.lucide?.createIcons();
    console.log("🔥 SSA Student Dashboard loaded:", { uid: user.uid, name: student.name, email: student.email, admission: student.admissionNumber });
}

let started = false;
function start() {
    if (started) return;
    started = true;

    onAuthStateChanged(auth, async user => {
        if (!user) return;
        try {
            await loadDashboard(user);
        } catch (error) {
            console.error("[SSA Dashboard] Failed to load student data:", error);
            // Keep Firebase session intact. Platform-control.js owns suspension/logout.
            setText("studentName", user.displayName || "Student");
            setText("studentFullName", user.displayName || "Student");
            setText("studentEmail", user.email || "");
            setText("studentAdmission", "Admission: Pending");
        }
    });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
