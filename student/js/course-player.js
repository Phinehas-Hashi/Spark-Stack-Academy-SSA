// ============================================================
// SPARK STACK ACADEMY
// COURSE PLAYER V3 — RELIABLE LESSON LOADER
// ============================================================

import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    doc, getDoc, setDoc, collection, query, where, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { awardXP, XP_REWARDS, updateLearningStreak } from "./achievements.js";
import { issueCertificate } from "./certificate-engine.js";

let currentUser = null;
let course = null;
let lessons = [];
let currentLessonIndex = 0;
let completedLessons = [];
let courseId = null;

const $ = id => document.getElementById(id);
const courseLocked = $("courseLocked");
const courseContent = $("courseContent");
const unlockCourseBtn = $("unlockCourseBtn");
const courseTitle = $("courseTitle");
const courseDescription = $("courseDescription");
const instructorName = $("instructorName");
const instructorAvatar = $("instructorAvatar");
const lessonList = $("lessonList");
const lessonTitle = $("lessonTitle");
const lessonDescription = $("lessonDescription");
const lessonDuration = $("lessonDuration");
const lessonCount = $("lessonCount");
const completedCount = $("completedCount");
const courseProgressText = $("courseProgressText");
const courseProgressBar = $("courseProgressBar");
const lessonProgressLabel = $("lessonProgressLabel");
const previousLessonBtn = $("previousLessonBtn");
const nextLessonBtn = $("nextLessonBtn");
const completeLessonBtn = $("completeLessonBtn");
const lessonNotes = $("lessonNotes");
const saveNotesBtn = $("saveNotesBtn");
const courseResources = $("courseResources");
const classAnnouncement = $("classAnnouncement");
const videoBox = $("videoBox") || document.querySelector(".video-box");

function toast(message) {
    let el = $("ssaCourseToast");
    if (!el) {
        el = document.createElement("div");
        el.id = "ssaCourseToast";
        el.className = "ssa-course-toast";
        document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("show"), 2600);
}

function refreshIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
    return escapeHTML(value);
}

function getCourseId() {
    const p = new URLSearchParams(window.location.search);
    return p.get("courseId") || p.get("id") || p.get("course") || null;
}

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "../login.html";
        return;
    }
    currentUser = user;
    await initializeClassroom();
});

async function initializeClassroom() {
    try {
        courseId = getCourseId();
        if (!courseId) throw new Error("No course was selected.");

        await loadCourse();
        if (!(await checkCourseAccess())) {
            showLockedState();
            return;
        }

        showClassroom();
        await loadLessons();
        await loadStudentProgress();
        await loadLiveClassSessions();
        renderLessons();
        updateProgress();

        if (lessons.length) await showLesson(currentLessonIndex);
        else showNoLessons();
    } catch (error) {
        console.error("COURSE PLAYER ERROR:", error);
        showError("We couldn't load this course. Please refresh and try again.");
    }
}

async function loadCourse() {
    const snap = await getDoc(doc(db, "courses", courseId));
    if (!snap.exists()) throw new Error("Course not found.");

    course = { id: snap.id, ...snap.data() };

    if (courseTitle) courseTitle.textContent = course.title || "Course";
    if (courseDescription) courseDescription.textContent = course.description || "Welcome to your classroom.";
    if (instructorName) instructorName.textContent = course.instructorName || "SSA Instructor";
    if (instructorAvatar) instructorAvatar.textContent = (course.instructorName || "S").charAt(0).toUpperCase();
    if (classAnnouncement) classAnnouncement.textContent = course.announcement || "No announcements yet.";
}

async function checkCourseAccess() {
    // A public listing or a zero price is not an entitlement.
    // Access requires a trusted active enrolment record.
    const activeStatuses = ["active", "approved", "completed"];
    const hasEntitlement = data => {
        if (!data) return false;
        const status = String(data.status || "").trim().toLowerCase();
        const paymentStatus = String(data.paymentStatus || "").trim().toLowerCase();
        if (["revoked", "suspended", "cancelled", "canceled", "rejected", "pending"].includes(status)) return false;

        // Institution-issued enrolments are valid when tied to an institution
        // and active; the institution is responsible for the learner's access.
        if (data.institutionId && activeStatuses.includes(status)) return true;

        // Marketplace/free enrolments must have both an active state and
        // a trusted paid/free payment state.
        if (activeStatuses.includes(status) && ["paid", "free"].includes(paymentStatus)) return true;

        // Older trusted payment records may use status="paid".
        return status === "paid" && (paymentStatus === "" || paymentStatus === "paid");
    };

    // Canonical marketplace enrolment: deterministic uid_courseId document.
    try {
        const canonical = await getDoc(doc(db, "enrollments", `${currentUser.uid}_${courseId}`));
        if (canonical.exists() && hasEntitlement(canonical.data())) return true;
    } catch (error) {
        console.warn("Canonical enrolment check failed:", error);
    }

    // Institution and legacy enrolments live under the student's record.
    try {
        const nested = await getDoc(doc(db, "students", currentUser.uid, "enrollments", courseId));
        if (nested.exists() && hasEntitlement(nested.data())) return true;
    } catch (error) {
        console.warn("Institution/legacy enrolment check failed:", error);
    }

    return false;
}

async function loadLessons() {
    lessons = [];

    // courseLessons is the canonical lesson collection.
    const q = query(
        collection(db, "courseLessons"),
        where("courseId", "==", courseId)
    );

    const snap = await getDocs(q);

    snap.forEach(item => {
        const data = item.data() || {};
        lessons.push({ id: item.id, ...data });
    });

    lessons.sort((a, b) => {
        const orderDiff = Number(a.order ?? a.position ?? 0) - Number(b.order ?? b.position ?? 0);
        return orderDiff || String(a.title || "").localeCompare(String(b.title || ""));
    });

    console.log(`COURSE PLAYER: loaded ${lessons.length} courseLessons for ${courseId}`);
}


async function loadLiveClassSessions() {
    const container = $("liveClassSessions");
    if (!container || !courseId) return;
    try {
        const snapshot = await getDocs(collection(db, "calendarEvents"));
        const now = new Date();
        const sessions = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
            .filter(item => item.type === "live_class" && item.courseId === courseId &&
                item.audience === "students" && item.meetingUrl &&
                (item.startAt?.toDate ? item.startAt.toDate() : new Date(item.startAt)) >= new Date(now.getTime() - 2 * 60 * 60 * 1000))
            .sort((a,b) => {
                const da = a.startAt?.toDate ? a.startAt.toDate() : new Date(a.startAt);
                const db = b.startAt?.toDate ? b.startAt.toDate() : new Date(b.startAt);
                return da - db;
            });
        if (!sessions.length) {
            container.innerHTML = '<p class="live-class-empty">No upcoming live sessions have been scheduled for this course.</p>';
            return;
        }
        container.innerHTML = sessions.map(session => {
            const start = session.startAt?.toDate ? session.startAt.toDate() : new Date(session.startAt);
            const end = session.endAt?.toDate ? session.endAt.toDate() : new Date(session.endAt);
            const dateLabel = Number.isNaN(start.getTime()) ? "Time to be confirmed" :
                new Intl.DateTimeFormat(undefined,{weekday:"short",day:"numeric",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}).format(start);
            const provider = session.meetingProvider === "google_meet" ? "Google Meet" : "Zoom";
            const safeUrl = /^https:\/\//i.test(session.meetingUrl) ? session.meetingUrl : "";
            return '<article class="live-class-session"><div class="live-class-session-info"><strong>' +
                escapeHTML(session.title || "Live class") + '</strong><span>' + escapeHTML(provider) +
                ' · ' + escapeHTML(dateLabel) + '</span>' +
                (session.description ? '<p>' + escapeHTML(session.description) + '</p>' : '') +
                '</div><a class="live-class-join" href="' + escapeAttr(safeUrl) +
                '" target="_blank" rel="noopener noreferrer">Join class <span aria-hidden="true">↗</span></a></article>';
        }).join("");
    } catch (error) {
        console.warn("Live class sessions could not be loaded:", error);
        container.innerHTML = '<p class="live-class-empty">Live sessions are temporarily unavailable.</p>';
    }
}

async function loadStudentProgress() {
    try {
        const snap = await getDoc(doc(db, "courseProgress", `${currentUser.uid}_${courseId}`));
        if (!snap.exists()) return;

        const data = snap.data() || {};
        completedLessons = Array.isArray(data.completedLessons) ? data.completedLessons : [];

        if (data.currentLessonId) {
            const index = lessons.findIndex(l => l.id === data.currentLessonId);
            if (index >= 0) currentLessonIndex = index;
        } else {
            currentLessonIndex = Number(data.currentLesson || 0);
        }

        if (currentLessonIndex < 0 || currentLessonIndex >= lessons.length) currentLessonIndex = 0;
    } catch (error) {
        console.warn("Progress load failed:", error);
    }
}

function renderLessons() {
    if (!lessonList) return;

    lessonList.innerHTML = "";

    if (!lessons.length) {
        showNoLessons();
        return;
    }

    lessons.forEach((lesson, index) => {
        const completed = completedLessons.includes(lesson.id);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `lesson-item${index === currentLessonIndex ? " active" : ""}${completed ? " completed" : ""}`;
        button.innerHTML = `
            <span class="lesson-number">${completed ? "✓" : index + 1}</span>
            <span class="lesson-info">
                <strong>${escapeHTML(lesson.title || `Lesson ${index + 1}`)}</strong>
                <small>${escapeHTML(lesson.duration ? `${lesson.duration} min` : lesson.type || "Lesson")}</small>
            </span>
            <i data-lucide="${completed ? "check-circle" : "play-circle"}"></i>`;
        button.addEventListener("click", () => showLesson(index));
        lessonList.appendChild(button);
    });

    if (lessonCount) lessonCount.textContent = `${lessons.length} Lesson${lessons.length === 1 ? "" : "s"}`;
    if (completedCount) completedCount.textContent = `${completedLessons.length} completed`;
    refreshIcons();
}

function isCoursePlaybackOnline() {
    const state = window.SSASmartConnectivity?.getState?.();
    return navigator.onLine !== false && state !== "offline";
}

function showOfflineLessonState() {
    const message = "You are offline. Lessons are not available offline yet. Download support will be introduced in a future phase, and access will require an eligible course entitlement.";
    if (lessonDescription) lessonDescription.textContent = message;
    if (videoBox) videoBox.innerHTML = `<div class="video-placeholder"><div class="video-placeholder-icon"><i data-lucide="wifi-off"></i></div><h3>Internet connection required</h3><p>${escapeHTML(message)}</p></div>`;
    if (courseResources) courseResources.innerHTML = "";
    if (lessonNotes) lessonNotes.disabled = true;
    if (saveNotesBtn) saveNotesBtn.disabled = true;
    if (completeLessonBtn) completeLessonBtn.disabled = true;
    if (previousLessonBtn) previousLessonBtn.disabled = true;
    if (nextLessonBtn) nextLessonBtn.disabled = true;
    const video = videoBox?.querySelector("video");
    video?.pause?.();
    refreshIcons();
}

function restoreOnlineLessonControls() {
    if (lessonNotes) lessonNotes.disabled = false;
    if (saveNotesBtn) saveNotesBtn.disabled = false;
}

async function showLesson(index) {
    if (!lessons[index]) return;
    if (!isCoursePlaybackOnline()) {
        currentLessonIndex = index;
        showOfflineLessonState();
        return;
    }
    restoreOnlineLessonControls();

    currentLessonIndex = index;
    const lesson = lessons[index];

    if (lessonTitle) lessonTitle.textContent = lesson.title || `Lesson ${index + 1}`;
    if (lessonDuration) lessonDuration.textContent = lesson.duration ? `${lesson.duration} min` : "Lesson";
    if (lessonProgressLabel) lessonProgressLabel.textContent = `Lesson ${index + 1} of ${lessons.length}`;
    if ($("lessonTypeBadge")) $("lessonTypeBadge").textContent = lesson.type || "Lesson";

    renderLessonContent(lesson);
    renderVideo(lesson);
    renderResources(lesson);
    await loadNotes(lesson);
    updateNavigation();
    updateProgress();
    renderLessons();
}

function renderLessonContent(lesson) {
    if (!lessonDescription) return;

    const content = lesson.content ?? lesson.body ?? lesson.text ?? lesson.description ?? "";
    lessonDescription.textContent = String(content || "");
}

function renderVideo(lesson) {
    if (!videoBox) return;

    const source = lesson.videoUrl || lesson.youtubeUrl || lesson.video || "";
    const youtubeId = lesson.youtubeId || extractYouTubeId(source);

    if (youtubeId) {
        videoBox.innerHTML = `
            <div class="video-frame-wrapper">
                <iframe id="lessonVideo"
                    src="https://www.youtube.com/embed/${encodeURIComponent(youtubeId)}?rel=0&modestbranding=1&playsinline=1"
                    title="${escapeAttr(lesson.title || "SSA Lesson")}"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowfullscreen></iframe>
            </div>`;
        return;
    }

    if (source) {
        videoBox.innerHTML = `
            <div class="video-frame-wrapper">
                <video id="lessonVideo" class="lesson-video" controls playsinline preload="metadata">
                    <source src="${escapeAttr(source)}">
                    Your browser does not support video playback.
                </video>
            </div>`;
        return;
    }

    videoBox.innerHTML = `
        <div class="video-placeholder">
            <div class="video-placeholder-icon"><i data-lucide="book-open"></i></div>
            <h3>Lesson content ready</h3>
            <p>There is no video attached to this lesson yet.</p>
        </div>`;
    refreshIcons();
}

function extractYouTubeId(url) {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes("youtu.be")) return parsed.pathname.replace(/^\//, "").split("/")[0];
        if (parsed.hostname.includes("youtube.com")) return parsed.searchParams.get("v") || parsed.pathname.split("/").pop();
    } catch {}
    return null;
}

function renderResources(lesson) {
    if (!courseResources) return;
    const resources = Array.isArray(lesson.resources) ? lesson.resources : [];

    if (!resources.length) {
        courseResources.innerHTML = `<div class="resource-empty"><i data-lucide="folder-open"></i><p>No learning resources for this lesson yet.</p></div>`;
        refreshIcons();
        return;
    }

    courseResources.innerHTML = resources.map(resource => `
        <a class="resource-item" href="${escapeAttr(resource.url || "#")}" target="_blank" rel="noopener noreferrer">
            <span><i data-lucide="file-text"></i><strong>${escapeHTML(resource.title || "Learning Resource")}</strong></span>
            <i data-lucide="external-link"></i>
        </a>`).join("");
    refreshIcons();
}

function updateNavigation() {
    if (previousLessonBtn) previousLessonBtn.disabled = currentLessonIndex <= 0;
    if (nextLessonBtn) nextLessonBtn.disabled = currentLessonIndex >= lessons.length - 1;

    const completed = completedLessons.includes(lessons[currentLessonIndex]?.id);
    if (completeLessonBtn) {
        completeLessonBtn.disabled = completed;
        completeLessonBtn.innerHTML = completed ? "Completed ✓" : `<i data-lucide="check"></i><span>Mark Complete</span>`;
    }
    refreshIcons();
}

previousLessonBtn?.addEventListener("click", () => showLesson(currentLessonIndex - 1));
nextLessonBtn?.addEventListener("click", () => showLesson(currentLessonIndex + 1));

completeLessonBtn?.addEventListener("click", completeCurrentLesson);

async function completeCurrentLesson() {
    if (!isCoursePlaybackOnline()) { showOfflineLessonState(); return; }
    const lesson = lessons[currentLessonIndex];
    if (!lesson || !currentUser || completedLessons.includes(lesson.id)) return;

    completedLessons.push(lesson.id);
    renderLessons();
    updateProgress();
    updateNavigation();

    try {
        await saveProgress();
        await awardXP(currentUser.uid, XP_REWARDS.lesson, `Completed lesson: ${lesson.title || "Lesson"}`, `lesson_${courseId}_${lesson.id}`);
        await updateLearningStreak(currentUser.uid);
        toast(`Lesson completed! ⚡ +${XP_REWARDS.lesson || 20} XP`);

        if (completedLessons.length === lessons.length) {
            await awardXP(currentUser.uid, XP_REWARDS.course || 50, `Completed course: ${course.title || "Course"}`, `course_${courseId}`);
            const certificate = await issueCertificate(currentUser.uid, course);
            toast(certificate?.alreadyExists ? "Course completed! 🎓" : "Course completed! 🎓 Certificate earned!");
        } else if (currentLessonIndex < lessons.length - 1) {
            setTimeout(() => showLesson(currentLessonIndex + 1), 650);
        }
    } catch (error) {
        console.error("Lesson completion failed:", error);
        completedLessons = completedLessons.filter(id => id !== lesson.id);
        renderLessons();
        updateProgress();
        updateNavigation();
        toast("We couldn't save your progress. Please try again.");
    }
}

function updateProgress() {
    const percent = lessons.length ? Math.round((completedLessons.length / lessons.length) * 100) : 0;
    if (courseProgressText) courseProgressText.textContent = `${percent}%`;
    if (courseProgressBar) courseProgressBar.style.width = `${percent}%`;
    if (completedCount) completedCount.textContent = `${completedLessons.length} completed`;
}

async function saveProgress() {
    if (!currentUser || !courseId) return;

    const percentage = lessons.length ? Math.round((completedLessons.length / lessons.length) * 100) : 0;
    const progress = {
        userId: currentUser.uid,
        courseId,
        completedLessons,
        currentLessonId: lessons[currentLessonIndex]?.id || null,
        currentLesson: currentLessonIndex,
        progress: percentage,
        updatedAt: serverTimestamp()
    };

    await setDoc(doc(db, "courseProgress", `${currentUser.uid}_${courseId}`), progress, { merge: true });

    try {
        const q = query(collection(db, "enrollments"), where("userId", "==", currentUser.uid), where("courseId", "==", courseId));
        const snap = await getDocs(q);
        if (!snap.empty) {
            await setDoc(snap.docs[0].ref, {
                progress: percentage,
                lastLesson: lessons[currentLessonIndex]?.id || null,
                status: percentage >= 100 ? "completed" : "active",
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
    } catch (error) {
        console.warn("Enrollment progress update skipped:", error);
    }
}

async function loadNotes(lesson) {
    if (!lessonNotes || !currentUser || !lesson) return;
    lessonNotes.value = "";
    try {
        const snap = await getDoc(doc(db, "courseNotes", `${currentUser.uid}_${courseId}_${lesson.id}`));
        if (snap.exists()) lessonNotes.value = snap.data().notes || "";
    } catch (error) {
        console.warn("Notes load failed:", error);
    }
}

saveNotesBtn?.addEventListener("click", async () => {
    if (!isCoursePlaybackOnline()) { showOfflineLessonState(); return; }
    const lesson = lessons[currentLessonIndex];
    if (!lesson || !currentUser || !lessonNotes) return;
    try {
        await setDoc(doc(db, "courseNotes", `${currentUser.uid}_${courseId}_${lesson.id}`), {
            userId: currentUser.uid,
            courseId,
            lessonId: lesson.id,
            notes: lessonNotes.value,
            updatedAt: serverTimestamp()
        }, { merge: true });
        toast("Notes saved ✓");
    } catch (error) {
        console.error(error);
        toast("Couldn't save your notes. Please try again.");
    }
});

function showLockedState() {
    if (courseLocked) courseLocked.style.display = "block";
    if (courseContent) courseContent.style.display = "none";
    unlockCourseBtn && (unlockCourseBtn.onclick = () => {
        window.location.href = `course-details.html?id=${encodeURIComponent(courseId)}`;
    });
}

function showClassroom() {
    if (courseLocked) courseLocked.style.display = "none";
    if (courseContent) courseContent.style.display = "block";
}

function showNoLessons() {
    if (lessonList) lessonList.innerHTML = `<div class="empty-state"><i data-lucide="book-open"></i><h3>Lessons Coming Soon</h3><p>Your instructor hasn't published lessons for this course yet.</p></div>`;
    if (lessonTitle) lessonTitle.textContent = "No lesson selected";
    if (lessonDescription) lessonDescription.textContent = "Lessons will appear here once your instructor publishes them.";
    if (lessonDuration) lessonDuration.textContent = "--";
    if (videoBox) videoBox.innerHTML = `<div class="video-placeholder"><i data-lucide="book-open"></i><h3>Waiting for lessons</h3><p>Your classroom is ready.</p></div>`;
    refreshIcons();
}

function showError(message) {
    if (!courseContent) return;
    courseContent.innerHTML = `<div class="course-error-state"><div class="error-icon"><i data-lucide="circle-alert"></i></div><h2>Something went wrong</h2><p>${escapeHTML(message)}</p><button class="primary-btn" type="button" id="courseBackBtn">Go Back</button></div>`;
    $("courseBackBtn")?.addEventListener("click", () => history.back());
    refreshIcons();
}

// Normalize old/new course-player links without touching login routing.
if (!new URLSearchParams(window.location.search).get("id")) {
    const legacyCourseId = getCourseId();
    if (legacyCourseId) {
        const url = new URL(window.location.href);
        url.searchParams.set("id", legacyCourseId);
        window.history.replaceState({}, "", url);
    }
}

window.addEventListener("ssa:connectivity-change", event => {
    if (event.detail?.online !== true) {
        showOfflineLessonState();
        return;
    }
    restoreOnlineLessonControls();
    if (lessons.length && currentUser) showLesson(currentLessonIndex);
});
window.addEventListener("offline", showOfflineLessonState);
window.addEventListener("online", () => {
    if (lessons.length && currentUser) showLesson(currentLessonIndex);
});

refreshIcons();
