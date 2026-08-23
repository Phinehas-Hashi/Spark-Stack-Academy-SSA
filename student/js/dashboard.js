// =====================================
// SPARK STACK ACADEMY
// STUDENT DASHBOARD DATA LAYER
// =====================================
// This module deliberately stays separate from student-app.js.
// It never owns authentication or portal-control enforcement.
// It only verifies/refreshes dashboard data after the core app loads.

import { auth, db } from "../../js/firebase.js";
import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);

const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
};

const clampPercent = value => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
};

const escapeHTML = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

async function loadDashboardData(uid) {
    const profileSnap = await getDoc(doc(db, "students", uid));

    if (!profileSnap.exists()) {
        console.warn("[SSA Dashboard] Student profile is missing.");
        return;
    }

    const student = profileSnap.data();
    const stats = student.stats || {};

    // Only fill values that are safely available from the student's profile.
    setText("studentName", student.name || student.fullName || "Student");
    setText("studentEmail", student.email || auth.currentUser?.email || "");
    setText("studentAdmission", `Admission: ${student.admissionNumber || "Pending"}`);
    setText("courseCount", Number(stats.coursesEnrolled ?? 0));
    setText("lessonCount", Number(stats.lessonsCompleted ?? 0));
    setText("certificateCount", Number(stats.certificates ?? 0));

    const progress = clampPercent(stats.progress ?? 0);
    setText("progressPercent", `${progress}%`);
    setText("overallProgress", `${progress}%`);

    const progressBar = $("progressBarFill");
    if (progressBar) progressBar.style.width = `${progress}%`;

    setText("studentXP", Number(student.xp ?? 0));
    setText("studentLevel", Number(student.level ?? 1));
    setText("streakDays", `${Number(student.streak ?? 0)} Days`);

    const badges = Array.isArray(student.badges) ? student.badges : [];
    setText("badgeCount", `${badges.length} Badges`);

    const avatar = $("profileAvatar");
    if (avatar) avatar.textContent = (student.name || student.fullName || "S").charAt(0).toUpperCase();

    // Keep course data resilient: one broken course document must not blank the dashboard.
    await loadEnrolledCourses(uid);
}

async function loadEnrolledCourses(uid) {
    const container = $("continueCourses");
    if (!container) return;

    try {
        const snap = await getDocs(query(
            collection(db, "enrollments"),
            where("studentId", "==", uid)
        ));

        if (snap.empty) {
            container.innerHTML = `
                <div class="course-card">
                    <div class="loading-icon"><i data-lucide="book-open"></i></div>
                    <h3>No Active Courses</h3>
                    <p>Enroll into a course and start learning.</p>
                    <a href="courses.html">Browse Courses</a>
                </div>`;
            window.lucide?.createIcons();
            return;
        }

        const courseResults = await Promise.allSettled(
            snap.docs.map(async enrollmentDoc => {
                const enrollment = enrollmentDoc.data();
                if (!enrollment.courseId) return null;

                const courseSnap = await getDoc(doc(db, "courses", enrollment.courseId));
                if (!courseSnap.exists()) return null;

                return {
                    id: enrollment.courseId,
                    data: courseSnap.data(),
                    progress: clampPercent(enrollment.progress ?? 0)
                };
            })
        );

        const courses = courseResults
            .filter(result => result.status === "fulfilled" && result.value)
            .map(result => result.value);

        if (!courses.length) {
            container.innerHTML = `<div class="course-card"><h3>Courses unavailable</h3><p>Your enrollment records are available, but the course details could not be loaded right now.</p></div>`;
            return;
        }

        container.innerHTML = courses.map(course => {
            const title = escapeHTML(course.data.title || "Course");
            const description = escapeHTML(course.data.description || "Continue your learning journey.");
            const progress = course.progress;

            return `
                <div class="course-card">
                    <div class="course-header">
                        <div class="loading-icon"><i data-lucide="play-circle"></i></div>
                        <span>${progress}% Complete</span>
                    </div>
                    <h3>${title}</h3>
                    <p>${description}</p>
                    <div class="course-progress">
                        <div><span style="width:${progress}%"></span></div>
                    </div>
                    <a href="course-player.html?id=${encodeURIComponent(course.id)}" class="continue-btn">Continue Learning</a>
                </div>`;
        }).join("");

        window.lucide?.createIcons();
    } catch (error) {
        console.error("[SSA Dashboard] Enrollment loading failed:", error);
        container.innerHTML = `<div class="course-card"><h3>Courses temporarily unavailable</h3><p>Your dashboard is still available. Please try again shortly.</p></div>`;
    }
}

function startDashboardLayer() {
    if (window.location.pathname.split("/").pop() !== "dashboard.html") return;

    onAuthStateChanged(auth, user => {
        if (!user) return;

        // Let student-app.js perform its normal initialization first.
        // This layer then verifies the dashboard with a small delay.
        window.setTimeout(() => {
            loadDashboardData(user.uid).catch(error => {
                console.error("[SSA Dashboard] Data layer failed:", error);
            });
        }, 250);
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startDashboardLayer, { once: true });
} else {
    startDashboardLayer();
}
