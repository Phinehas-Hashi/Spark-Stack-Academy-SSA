// ============================================================
// SPARK STACK ACADEMY — STUDENT DASHBOARD
// Student identity, enrolled courses, progress and activity
// ============================================================

import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const setText = (id, value) => {
    const element = $(id);
    if (element) element.textContent = value ?? "—";
};
const clamp = value => Math.max(0, Math.min(100, Number(value) || 0));

const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
}[character]));

function timestampValue(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatActivityDate(value) {
    const timestamp = timestampValue(value);
    if (!timestamp) return "Recently";

    return new Intl.DateTimeFormat("en-KE", {
        day: "numeric",
        month: "short"
    }).format(new Date(timestamp));
}

// ------------------------------------------------------------
// STUDENT PROFILE
// ------------------------------------------------------------

async function loadStudent(uid, authUser) {
    // The canonical student record is students/{Firebase Auth UID}.
    // users/{uid} is retained as a profile fallback.
    const [studentResult, userResult] = await Promise.allSettled([
        getDoc(doc(db, "students", uid)),
        getDoc(doc(db, "users", uid))
    ]);

    const studentSnap = studentResult.status === "fulfilled"
        ? studentResult.value
        : null;
    const userSnap = userResult.status === "fulfilled"
        ? userResult.value
        : null;

    if (!studentSnap?.exists() && !userSnap?.exists()) {
        throw new Error("Your student profile could not be found.");
    }

    const student = studentSnap?.exists() ? studentSnap.data() : {};
    const user = userSnap?.exists() ? userSnap.data() : {};

    if (user.role && user.role !== "student") {
        throw new Error("This account is not registered as a student.");
    }
    if (student.role && student.role !== "student") {
        throw new Error("This profile is not registered as a student.");
    }

    const name = student.name
        || student.fullName
        || student.studentName
        || user.fullName
        || user.name
        || authUser.displayName
        || "Student";

    return {
        ...user,
        ...student,
        uid,
        id: uid,
        name,
        fullName: student.fullName || user.fullName || name,
        email: student.email || user.email || authUser.email || "",
        admissionNumber: student.admissionNumber
            || student.admissionNo
            || user.admissionNumber
            || user.admissionNo
            || "Pending",
        status: student.status || user.status || "Pending"
    };
}

// ------------------------------------------------------------
// ENROLLMENTS
// ------------------------------------------------------------

function hasCourseAccess(enrollment) {
    const status = String(enrollment.status || "").trim().toLowerCase();
    const paymentStatus = String(enrollment.paymentStatus || "").trim().toLowerCase();

    if (["rejected", "revoked", "cancelled", "canceled", "suspended", "pending"].includes(status)) {
        return false;
    }

    const institutionEntitlement = Boolean(enrollment.institutionId)
        && ["active", "approved", "completed"].includes(status);

    const academyEntitlement = (
        ["active", "approved", "completed"].includes(status)
        && ["paid", "free"].includes(paymentStatus)
    ) || (
        status === "paid"
        && ["", "paid"].includes(paymentStatus)
    );

    return institutionEntitlement || academyEntitlement;
}

async function loadEnrollments(uid) {
    const tasks = [
        getDocs(collection(db, "students", uid, "enrollments")),
        // Current canonical top-level enrollment ownership fields.
        getDocs(query(collection(db, "enrollments"), where("userId", "==", uid))),
        // Legacy records still use studentId.
        getDocs(query(collection(db, "enrollments"), where("studentId", "==", uid)))
    ];

    const snapshots = await Promise.allSettled(tasks);
    const records = [];
    const seenRecords = new Set();

    snapshots.forEach((result, index) => {
        if (result.status !== "fulfilled") {
            console.warn("[SSA Dashboard] Enrollment source unavailable:", index, result.reason);
            return;
        }

        result.value.docs.forEach(snapshot => {
            const recordKey = snapshot.ref.path;
            if (seenRecords.has(recordKey)) return;
            seenRecords.add(recordKey);

            records.push({
                id: snapshot.id,
                ...snapshot.data(),
                source: index === 0 ? "institution" : "academy"
            });
        });
    });

    // Keep only enrollments that currently grant course access.
    const byCourse = new Map();

    for (const enrollment of records) {
        if (!hasCourseAccess(enrollment)) continue;

        const courseId = enrollment.courseId
            || enrollment.courseID
            || enrollment.courseUid
            || enrollment.course;

        if (!courseId) continue;

        const key = String(courseId);
        if (!byCourse.has(key)) byCourse.set(key, enrollment);
    }

    return [...byCourse.values()];
}

async function loadCertificateCount(uid, fallbackCount) {
    try {
        // Firestore rules permit a student query scoped to studentId == uid.
        const snapshot = await getDocs(query(
            collection(db, "certificates"),
            where("studentId", "==", uid)
        ));
        return snapshot.size;
    } catch (error) {
        console.warn("[SSA Dashboard] Certificate count unavailable:", error);
        return Math.max(0, Number(fallbackCount) || 0);
    }
}

async function loadLearningData(uid, student) {
    const enrollments = await loadEnrollments(uid);
    const stats = student.stats || {};

    const progressValues = enrollments.map(enrollment => clamp(
        enrollment.progress
        ?? enrollment.progressPercent
        ?? enrollment.completion
        ?? 0
    ));

    const calculatedProgress = progressValues.length
        ? Math.round(progressValues.reduce((total, value) => total + value, 0) / progressValues.length)
        : clamp(stats.progress ?? student.progress ?? 0);

    const lessonsFromEnrollments = enrollments.reduce((total, enrollment) => {
        const completed = Array.isArray(enrollment.completedLessons)
            ? enrollment.completedLessons.length
            : 0;
        return total + completed;
    }, 0);

    const completedLessons = Math.max(0, Number(
        stats.lessonsCompleted
        ?? student.lessonsCompleted
        ?? lessonsFromEnrollments
    ) || 0);

    const certificates = await loadCertificateCount(
        uid,
        stats.certificates ?? student.certificates ?? 0
    );

    const xp = Math.max(0, Number(student.xp) || 0);
    const level = Math.max(1, Number(student.level) || Math.floor(xp / 250) + 1);
    const streak = Math.max(0, Number(student.streak) || 0);
    const badges = Array.isArray(student.badges) ? student.badges : [];

    return {
        enrollments,
        coursesCount: enrollments.length || Math.max(0, Number(stats.coursesEnrolled) || 0),
        lessonsCompleted: completedLessons,
        certificates,
        progress: calculatedProgress,
        xp,
        level,
        streak,
        badges
    };
}

// ------------------------------------------------------------
// DASHBOARD RENDERING
// ------------------------------------------------------------

function renderStudent(student, learning) {
    const name = student.name || "Student";

    setText("studentName", name);
    setText("studentFullName", student.fullName || name);
    setText("studentEmail", student.email || "");
    setText("studentAdmission", `Admission: ${student.admissionNumber || "Pending"}`);

    setText("courseCount", learning.coursesCount);
    setText("lessonCount", learning.lessonsCompleted);
    setText("certificateCount", learning.certificates);
    setText("progressPercent", `${learning.progress}%`);
    setText("overallProgress", `${learning.progress}%`);
    setText("studentXP", learning.xp.toLocaleString());
    setText("studentLevel", learning.level);
    setText("streakDays", `${learning.streak} Day${learning.streak === 1 ? "" : "s"}`);
    setText("learningStreak", `${learning.streak} Day${learning.streak === 1 ? "" : "s"} Streak`);
    setText("badgeCount", `${learning.badges.length} Badge${learning.badges.length === 1 ? "" : "s"}`);

    const avatar = $("profileAvatar");
    if (avatar) avatar.textContent = name.trim().charAt(0).toUpperCase() || "S";

    const progressBar = $("progressBarFill");
    if (progressBar) {
        progressBar.style.width = `${learning.progress}%`;
        progressBar.parentElement?.setAttribute("aria-valuenow", String(learning.progress));
    }

    const xpProgress = $("xpProgress");
    if (xpProgress) {
        const progress = (learning.xp % 250) / 250 * 100;
        xpProgress.style.width = `${progress}%`;
        xpProgress.parentElement?.setAttribute("aria-valuenow", String(Math.round(progress)));
    }
}

async function loadCourses(learning) {
    const container = $("continueCourses");
    if (!container) return;

    if (!learning.enrollments.length) {
        container.innerHTML = `
            <div class="course-card course-empty-state">
                <div class="loading-icon"><i data-lucide="book-open"></i></div>
                <h3>No active courses yet</h3>
                <p>Your enrolled courses will appear here when your access is approved.</p>
                <a href="marketplace.html">Explore courses</a>
            </div>`;
        window.lucide?.createIcons();
        return;
    }

    const results = await Promise.allSettled(learning.enrollments.map(async enrollment => {
        const courseId = enrollment.courseId
            || enrollment.courseID
            || enrollment.courseUid
            || enrollment.course;

        if (!courseId) {
            return {
                id: enrollment.id,
                data: { title: enrollment.courseName || enrollment.courseTitle || "Course" },
                progress: clamp(enrollment.progress ?? enrollment.progressPercent ?? 0)
            };
        }

        const courseSnap = await getDoc(doc(db, "courses", String(courseId)));

        return {
            id: String(courseId),
            data: courseSnap.exists()
                ? courseSnap.data()
                : { title: enrollment.courseName || enrollment.courseTitle || "Course" },
            progress: clamp(
                enrollment.progress
                ?? enrollment.progressPercent
                ?? enrollment.completion
                ?? 0
            )
        };
    }));

    const courses = results
        .filter(result => result.status === "fulfilled" && result.value)
        .map(result => result.value);

    if (!courses.length) {
        container.innerHTML = `
            <div class="course-card course-empty-state">
                <h3>Courses are temporarily unavailable</h3>
                <p>Your enrolments are saved. Please try opening your courses page.</p>
                <a href="courses.html">Open my courses</a>
            </div>`;
        return;
    }

    container.innerHTML = courses.map(course => {
        const title = escapeHTML(course.data.title || course.data.name || "Course");
        const description = escapeHTML(course.data.description || "Continue your learning journey.");
        const progress = clamp(course.progress);

        return `
            <article class="course-card">
                <div class="course-header">
                    <div class="loading-icon"><i data-lucide="play-circle"></i></div>
                    <span>${progress}% complete</span>
                </div>
                <h3>${title}</h3>
                <p>${description}</p>
                <div class="course-progress">
                    <div><span style="width:${progress}%"></span></div>
                </div>
                <a href="course-player.html?id=${encodeURIComponent(course.id)}" class="continue-btn">
                    ${progress >= 100 ? "Review course" : "Continue learning"}
                </a>
            </article>`;
    }).join("");

    window.lucide?.createIcons();
}

// ------------------------------------------------------------
// ANNOUNCEMENTS
// ------------------------------------------------------------

async function loadAnnouncements() {
    const container = $("announcementPreview");
    if (!container) return;

    try {
        let snapshot;

        try {
            snapshot = await getDocs(query(
                collection(db, "announcements"),
                orderBy("createdAt", "desc"),
                limit(3)
            ));
        } catch {
            snapshot = await getDocs(query(collection(db, "announcements"), limit(3)));
        }

        if (snapshot.empty) {
            container.innerHTML = "<p>No announcements yet.</p>";
            return;
        }

        const rows = [...snapshot.docs].sort((a, b) =>
            timestampValue(b.data().createdAt || b.data().created_at)
            - timestampValue(a.data().createdAt || a.data().created_at)
        );

        container.innerHTML = rows.map(snapshotDoc => {
            const announcement = snapshotDoc.data();

            return `
                <article class="dashboard-mini-item">
                    <strong>${escapeHTML(announcement.title || "SSA Announcement")}</strong>
                    <p>${escapeHTML(announcement.message || announcement.content || "")}</p>
                    <small>${formatActivityDate(announcement.createdAt || announcement.created_at)}</small>
                </article>`;
        }).join("");
    } catch (error) {
        console.error("[SSA Dashboard] Announcements failed:", error);
        container.innerHTML = "<p>Announcements are temporarily unavailable.</p>";
    }
}

// ------------------------------------------------------------
// RECENT ACTIVITY
// ------------------------------------------------------------

function activityCopy(activity) {
    const type = String(activity.type || "").toLowerCase();

    if (type === "xp_earned") {
        return {
            title: "Experience earned",
            message: activity.reason || `You earned ${Number(activity.amount) || 0} XP.`
        };
    }

    if (type === "level_up") {
        return {
            title: "Level unlocked",
            message: `You advanced from Level ${activity.from || "?"} to Level ${activity.to || "?"}.`
        };
    }

    if (type === "badge_unlocked" || type === "achievement") {
        return {
            title: "Achievement unlocked",
            message: activity.name || activity.description || "A new achievement was added to your profile."
        };
    }

    return {
        title: activity.title || activity.type || "Learning activity",
        message: activity.message || activity.reason || "Your learning activity was updated."
    };
}

async function loadActivity(uid) {
    const container = $("recentActivity");
    if (!container) return;

    const tasks = [
        getDocs(query(collection(db, "students", uid, "activity"), limit(25))),
        getDocs(query(collection(db, "notifications"), where("userId", "==", uid), limit(25)))
    ];

    const results = await Promise.allSettled(tasks);
    const records = [];

    results.forEach((result, index) => {
        if (result.status !== "fulfilled") {
            console.warn("[SSA Dashboard] Activity source unavailable:", index, result.reason);
            return;
        }

        result.value.docs.forEach(snapshot => {
            records.push({
                id: snapshot.id,
                ...snapshot.data(),
                activitySource: index === 0 ? "learning" : "notification"
            });
        });
    });

    const unique = new Map();
    records
        .sort((a, b) => timestampValue(b.createdAt || b.created_at) - timestampValue(a.createdAt || a.created_at))
        .forEach(record => {
            const key = `${record.activitySource}:${record.id}`;
            if (!unique.has(key)) unique.set(key, record);
        });

    const latest = [...unique.values()].slice(0, 5);

    if (!latest.length) {
        container.innerHTML = `
            <div class="activity-empty">
                <p>Your recent learning updates will appear here.</p>
            </div>`;
        return;
    }

    container.innerHTML = latest.map(record => {
        const copy = activityCopy(record);
        const icon = record.activitySource === "notification" ? "bell" : "sparkles";

        return `
            <article class="activity-item">
                <div class="activity-icon"><i data-lucide="${icon}"></i></div>
                <div class="activity-copy">
                    <h3>${escapeHTML(copy.title)}</h3>
                    <p>${escapeHTML(copy.message)}</p>
                    <small>${formatActivityDate(record.createdAt || record.created_at)}</small>
                </div>
            </article>`;
    }).join("");

    window.lucide?.createIcons();
}

// ------------------------------------------------------------
// DASHBOARD BOOT
// ------------------------------------------------------------

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

    setText("todayDate", new Date().toLocaleDateString("en-KE", {
        weekday: "long",
        month: "short",
        day: "numeric"
    }));

    window.lucide?.createIcons();

    console.log("[SSA Dashboard] Student dashboard loaded.", {
        uid: user.uid,
        enrolledCourses: learning.coursesCount,
        progress: learning.progress
    });
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
            setText("studentName", user.displayName || "Student");
            setText("studentFullName", user.displayName || "Student");
            setText("studentEmail", user.email || "");
            setText("studentAdmission", "Admission: Pending");

            const courseContainer = $("continueCourses");
            if (courseContainer) {
                courseContainer.innerHTML = `
                    <div class="course-card course-error-state">
                        <h3>We couldn't load your dashboard data</h3>
                        <p>Your sign-in is still active. Refresh the page or open your courses page.</p>
                        <a href="courses.html">Open my courses</a>
                    </div>`;
            }
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
    start();
}
