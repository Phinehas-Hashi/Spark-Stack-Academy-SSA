import { auth, db } from "../../js/firebase.js";
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const functions = getFunctions(getApp());
const syncCourseEntitlements = httpsCallable(functions, "syncMyCourseEntitlements");
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
        // Synchronize trusted legacy grants before reading the canonical list.
        await syncCourseEntitlements();
        const entitlementQuery = query(
            collection(db, "courseEntitlements"),
            where("studentUid", "==", currentUser.uid)
        );
        const entitlementSnap = await getDocs(entitlementQuery);
        const entitlements = entitlementSnap.docs
            .map(s => ({ id: s.id, ...s.data() }))
            .filter(item => item.status === "active" && item.courseId);

        for (const entitlement of entitlements) {
            const courseId = String(entitlement.courseId);
            try {
                const courseSnap = await getDoc(doc(db, "courses", courseId));
                if (!courseSnap.exists()) continue;

                const course = courseSnap.data();
                let progressData = {};
                try {
                    const progressSnap = await getDoc(doc(db, "courseProgress", `${currentUser.uid}_${courseId}`));
                    if (progressSnap.exists()) progressData = progressSnap.data() || {};
                } catch (progressError) {
                    console.warn("Course progress is unavailable for", courseId, progressError);
                }
                const grants = Object.values(entitlement.grants || {}).filter(g => g?.status === "active");
                const institutionGrant = grants.find(g => g.source === "institution_enrollment");
                const purchaseGrant = grants.find(g => g.source === "verified_legacy_purchase");
                const freeGrant = grants.find(g => g.source === "approved_free_enrollment");
                const sourceLabel = institutionGrant
                    ? "Institution"
                    : purchaseGrant
                        ? "Purchased"
                        : freeGrant
                            ? "Free enrolment"
                            : "Granted access";
                myCourses.push({
                    id: courseId,
                    ...course,
                    entitlementId: entitlement.id,
                    entitlementSource: sourceLabel,
                    institutionId: institutionGrant?.institutionId || "",
                    progress: Number(progressData.progress ?? institutionGrant?.progress ?? purchaseGrant?.progress ?? freeGrant?.progress ?? 0),
                    enrollmentStatus: "active",
                    paymentStatus: purchaseGrant ? "paid" : (freeGrant ? "free" : ""),
                    joinedAt: entitlement.createdAt || entitlement.updatedAt || null
                });
            } catch (courseError) {
                console.warn("Could not load entitled course", courseId, courseError);
            }
        }

        myCourses.sort((a, b) => getTime(b.joinedAt) - getTime(a.joinedAt));
        renderCourses();
        updateStats();
    } catch (error) {
        console.error("MY LEARNING FAILED:", error);
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
            <span class="course-access-source">${escapeHTML(course.entitlementSource || "Enrolled")}</span>
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
