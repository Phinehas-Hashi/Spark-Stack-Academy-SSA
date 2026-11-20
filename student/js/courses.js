import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, doc, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
let myCourses = [];

const $ = id => document.getElementById(id);
const coursesContainer = $("coursesContainer");
const enrolledCount = $("enrolledCount");
const progressCount = $("progressCount");
const completedCount = $("completedCount");
const hoursCount = $("hoursCount");
const myCoursesCount = $("myCoursesCount");

console.log("🚀 SSA MY COURSES ENGINE LOADED");

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.replace("../login.html");
        return;
    }

    currentUser = user;
    console.log("👨‍🎓 Loading courses for UID:", user.uid);
    await loadMyCourses();
});

async function loadMyCourses() {
    showLoading();
    myCourses = [];

    try {
        // Merge institution-issued enrolments with Academy marketplace enrolments.
        const [nestedSnap, academySnap] = await Promise.all([
            getDocs(collection(db, "students", currentUser.uid, "enrollments")),
            getDocs(query(collection(db, "enrollments"), where("userId", "==", currentUser.uid)))
        ]);
        const records = [
            ...nestedSnap.docs.map(s => ({ id: s.id, ...s.data(), source: "institution" })),
            ...academySnap.docs.map(s => ({ id: s.id, ...s.data(), source: "academy" }))
        ];
        const byCourse = new Map();
        for (const enrollment of records) {
            const courseId = enrollment.courseId || enrollment.courseID || enrollment.course;
            if (!courseId) continue;
            const status = String(enrollment.status || "").trim().toLowerCase();
            const paymentStatus = String(enrollment.paymentStatus || "").trim().toLowerCase();
            if (["rejected","revoked","cancelled","canceled","suspended","pending"].includes(status)) continue;
            const institutionEntitlement = Boolean(enrollment.institutionId) && ["active","approved","completed"].includes(status);
            const academyEntitlement = (["active","approved","completed"].includes(status) && ["paid","free"].includes(paymentStatus)) || (status === "paid" && (paymentStatus === "" || paymentStatus === "paid"));
            if (!institutionEntitlement && !academyEntitlement) continue;
            const key = String(courseId);
            if (!byCourse.has(key)) byCourse.set(key, enrollment);
        }
        for (const [courseId, enrollment] of byCourse.entries()) {
            try {
                const courseSnap = await getDoc(doc(db, "courses", courseId));
                if (!courseSnap.exists()) { console.warn("Course missing:", courseId); continue; }
                const course = courseSnap.data();
                myCourses.push({
                    id: courseId, ...course, enrollmentId: enrollment.id,
                    enrollmentSource: enrollment.source, institutionId: enrollment.institutionId || "",
                    institutionName: enrollment.institutionName || enrollment.schoolName || "",
                    progress: Number(enrollment.progress ?? enrollment.progressPercent ?? 0),
                    enrollmentStatus: statusValue(enrollment.status), paymentStatus: enrollment.paymentStatus || "",
                    joinedAt: enrollment.enrolledAt || enrollment.joinedAt || enrollment.createdAt || null
                });
            } catch (courseError) { console.warn("Could not load course", courseId, courseError); }
        }
        myCourses.sort((a, b) => getTime(b.joinedAt) - getTime(a.joinedAt));
        console.log("🎓 Signed-in student's courses:", myCourses);

        renderCourses();
        updateStats();
    } catch (error) {
        console.error("❌ MY COURSES FAILED:", error);
        showError(error);
    }
}

function renderCourses() {
    if (!coursesContainer) return;

    if (!myCourses.length) {
        showEmpty();
        return;
    }

    coursesContainer.innerHTML = myCourses.map(course => createCourseCard(course)).join("");
    updateCourseCount();
    bindCourseButtons();
    refreshIcons();
}

function createCourseCard(course) {
    const progress = Math.min(100, Math.max(0, Number(course.progress || 0)));
    const completed = progress >= 100;
    const title = course.title || "Untitled Course";
    const description = course.description || "Continue your learning journey.";
    const instructor = course.instructorName || course.instructor || "SSA Instructor";
    const category = course.category || "Technology";
    const level = course.level || "Beginner";
    const duration = course.duration || "Self-paced";
    const thumbnail = course.thumbnail || course.image || "";

    return `<article class="my-course-card">
        <div class="my-course-cover">
            ${thumbnail
                ? `<img src="${escapeHTML(thumbnail)}" alt="${escapeHTML(title)}" loading="lazy" onerror="this.style.display='none'">`
                : `<div class="course-cover-placeholder"><i data-lucide="book-open"></i></div>`}
            <div class="course-cover-overlay">
                <span class="course-category">${escapeHTML(category)}</span>
                <span class="course-progress-pill">${progress}%</span>
            </div>
        </div>
        <div class="my-course-body">
            <div class="course-meta-row">
                <span><i data-lucide="signal"></i>${escapeHTML(level)}</span>
                <span><i data-lucide="clock-3"></i>${escapeHTML(String(duration))}</span>
            </div>
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(description)}</p>
            <div class="course-instructor-row">
                <span class="instructor-avatar">${escapeHTML(instructor.charAt(0).toUpperCase())}</span>
                <span>${escapeHTML(instructor)}</span>
            </div>
            <div class="course-progress-block">
                <div class="progress-label"><span>${completed ? "Course completed" : "Your progress"}</span><strong>${progress}%</strong></div>
                <div class="progress-track"><span class="progress-fill" style="width:${progress}%"></span></div>
            </div>
            <button type="button" class="continue-course-btn" data-course-id="${escapeHTML(course.id)}">
                <span>${completed ? "Review Course" : "Continue Learning"}</span>
                <i data-lucide="${completed ? "rotate-ccw" : "arrow-right"}"></i>
            </button>
        </div>
    </article>`;
}

function bindCourseButtons() {
    coursesContainer?.querySelectorAll(".continue-course-btn").forEach(button => {
        button.addEventListener("click", () => {
            const id = button.dataset.courseId;
            if (id) window.location.href = `course-player.html?id=${encodeURIComponent(id)}`;
        });
    });
}

function updateStats() {
    let inProgress = 0;
    let completed = 0;
    let hours = 0;

    myCourses.forEach(course => {
        const progress = Math.min(100, Math.max(0, Number(course.progress || 0)));
        if (progress >= 100) completed++;
        else if (progress > 0) inProgress++;
        hours += getCourseHours(course.duration);
    });

    if (enrolledCount) enrolledCount.textContent = myCourses.length;
    if (progressCount) progressCount.textContent = inProgress;
    if (completedCount) completedCount.textContent = completed;
    if (hoursCount) hoursCount.textContent = formatHours(hours);
    updateCourseCount();
}

function updateCourseCount() {
    if (myCoursesCount) myCoursesCount.textContent = `${myCourses.length} ${myCourses.length === 1 ? "course" : "courses"}`;
}

function showLoading() {
    if (!coursesContainer) return;
    coursesContainer.innerHTML = `<div class="courses-state loading-state"><div class="state-icon"><i data-lucide="loader-circle"></i></div><h3>Loading your courses...</h3><p>Preparing your classroom.</p></div>`;
    refreshIcons();
}

function showEmpty() {
    if (!coursesContainer) return;
    coursesContainer.innerHTML = `<div class="courses-state empty-state"><div class="state-icon"><i data-lucide="book-open"></i></div><h3>No Courses Yet</h3><p>Your institution courses and Academy purchases will appear here after enrolment. Explore the global marketplace to find your next course.</p><a href="marketplace.html" class="primary-btn"><i data-lucide="compass"></i> Explore Marketplace</a></div>`;
    updateStats();
    refreshIcons();
}

function showError(error) {
    if (!coursesContainer) return;
    coursesContainer.innerHTML = `<div class="courses-state error-state"><div class="state-icon"><i data-lucide="triangle-alert"></i></div><h3>Courses couldn't be loaded</h3><p>We couldn't read your enrolled courses right now. Your account is still signed in.</p><button class="primary-btn" type="button" id="retryCourses">Try Again</button></div>`;
    $("retryCourses")?.addEventListener("click", loadMyCourses);
    refreshIcons();
}

function statusValue(value) { return String(value || "active").trim().toLowerCase(); }

function getCourseHours(duration) {
    if (typeof duration === "number") return duration;
    const value = String(duration || "").toLowerCase();
    const number = parseFloat(value);
    if (!Number.isFinite(number)) return 0;
    if (value.includes("minute")) return number / 60;
    if (value.includes("week")) return number * 5;
    return number;
}

function formatHours(hours) {
    if (!hours) return "0h";
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    return `${Math.round(hours)}h`;
}

function getTime(value) {
    if (!value) return 0;
    if (typeof value?.toMillis === "function") return value.toMillis();
    if (typeof value?.toDate === "function") return value.toDate().getTime();
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[char]));
}

function refreshIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
}
