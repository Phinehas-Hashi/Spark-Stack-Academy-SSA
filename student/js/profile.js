// Spark Stack Academy — Student Profile
import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const courseList = $("profileCourses");

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("../login.html");
        return;
    }
    await loadProfile(user);
});

async function loadProfile(user) {
    try {
        const studentRef = doc(db, "students", user.uid);
        const studentSnapshot = await getDoc(studentRef);
        const student = studentSnapshot.exists() ? studentSnapshot.data() : {};

        renderIdentity(user, student);
        await Promise.all([
            loadLearning(user.uid, student),
            loadCertificateCount(user.uid)
        ]);
        setStatus("");
    } catch (error) {
        console.error("Student profile load failed:", error);
        setStatus("Some profile information could not be loaded. Refresh the page or contact Academy support.");
        if (courseList) {
            courseList.setAttribute("aria-busy", "false");
            courseList.innerHTML = '<p class="profile-state">Course activity is temporarily unavailable.</p>';
        }
    }
}

function renderIdentity(user, student) {
    const name = student.name || student.fullName || student.studentName || user.displayName || "Student";
    const email = student.email || user.email || "—";
    const phone = student.phone || student.phoneNumber || "Not provided";
    const admission = student.admissionNumber || student.admissionNo || "Pending assignment";
    setText("profileName", name);
    setText("profileEmail", email);
    setText("fullName", name);
    setText("email", email);
    setText("phone", phone);
    setText("admissionNumber", admission);
    setText("admissionDetail", admission);
    setText("joinedDate", formatDate(student.createdAt || student.joinedAt || student.admissionDate));
    setText("onboardingStatus", humanize(student.onboardingStatus || student.status || "Not recorded"));
    setText("verificationStatus", user.emailVerified ? "Email verified" : "Email not verified");
    setText("accountStatus", student.status ? humanize(student.status) : "Status not recorded");
    setText("studentBadge", "Student");
    setText("levelCount", String(Number(student.level) || Math.floor((Number(student.xp) || 0) / 100) + 1));
    const avatar = $("profileAvatar");
    if (avatar) avatar.textContent = name.trim().charAt(0).toUpperCase() || "S";
}

async function loadLearning(uid, student) {
    const results = await Promise.allSettled([
        getDocs(collection(db, "students", uid, "enrollments")),
        getDocs(query(collection(db, "enrollments"), where("userId", "==", uid))),
        getDocs(query(collection(db, "enrollments"), where("studentId", "==", uid)))
    ]);

    const byId = new Map();
    results.forEach((result) => {
        if (result.status !== "fulfilled") return;
        result.value.forEach((item) => {
            const data = item.data();
            const courseId = data.courseId || data.course_id || item.id;
            const status = String(data.status || "active").toLowerCase();
            if (["pending", "rejected", "revoked", "cancelled", "suspended"].includes(status)) return;
            const payment = String(data.paymentStatus || data.payment_status || "").toLowerCase();
            const entitled = data.institutionId || data.institution_id ||
                ["paid", "free", "completed"].includes(payment) ||
                ["active", "approved", "completed"].includes(status);
            if (!entitled) return;
            const current = byId.get(courseId);
            const candidate = { id: item.id, courseId, ...data };
            if (!current || Number(candidate.progress || 0) > Number(current.progress || 0)) {
                byId.set(courseId, candidate);
            }
        });
    });

    const enrollments = [...byId.values()];
    const completed = enrollments.filter((item) =>
        Number(item.progress || 0) >= 100 || String(item.status || "").toLowerCase() === "completed"
    ).length;
    const xp = Math.max(0, Number(student.xp) || 0);
    setText("coursesCount", String(enrollments.length));
    setText("completedCount", String(completed));
    setText("xpCount", xp.toLocaleString("en-KE"));
    setText("streakCount", String(Math.max(0, Number(student.streak) || 0)) + " days");
    await renderCourseList(enrollments);
}

async function renderCourseList(enrollments) {
    if (!courseList) return;
    courseList.replaceChildren();
    courseList.setAttribute("aria-busy", "false");
    if (!enrollments.length) {
        const empty = document.createElement("p");
        empty.className = "profile-state";
        empty.textContent = "No active course enrolments were found on this account yet.";
        courseList.append(empty);
        return;
    }

    const cards = await Promise.all(enrollments.slice(0, 8).map(async (enrollment) => {
        let title = enrollment.courseTitle || enrollment.title || "";
        if (!title && enrollment.courseId) {
            try {
                const courseSnapshot = await getDoc(doc(db, "courses", enrollment.courseId));
                if (courseSnapshot.exists()) {
                    const course = courseSnapshot.data();
                    title = course.title || course.courseName || course.name || "";
                }
            } catch (error) {
                console.warn("Could not load course title:", enrollment.courseId, error);
            }
        }
        return { ...enrollment, displayTitle: title || "Enrolled course" };
    }));

    cards.forEach((item) => {
        const row = document.createElement("article");
        row.className = "profile-course-item";
        const copy = document.createElement("div");
        copy.className = "profile-course-copy";
        const title = document.createElement("strong");
        title.textContent = item.displayTitle;
        const detail = document.createElement("span");
        const progress = Math.min(100, Math.max(0, Number(item.progress) || 0));
        detail.textContent = progress >= 100 ? "Completed" : progress + "% complete";
        copy.append(title, detail);
        const progressTrack = document.createElement("div");
        progressTrack.className = "profile-progress-track";
        progressTrack.setAttribute("role", "progressbar");
        progressTrack.setAttribute("aria-label", item.displayTitle + " progress");
        progressTrack.setAttribute("aria-valuemin", "0");
        progressTrack.setAttribute("aria-valuemax", "100");
        progressTrack.setAttribute("aria-valuenow", String(progress));
        const fill = document.createElement("span");
        fill.style.width = progress + "%";
        progressTrack.append(fill);
        const link = document.createElement("a");
        link.href = "course-player.html?id=" + encodeURIComponent(item.courseId);
        link.className = "profile-course-link";
        link.textContent = progress >= 100 ? "Review" : "Continue";
        row.append(copy, progressTrack, link);
        courseList.append(row);
    });
}

async function loadCertificateCount(uid) {
    try {
        const snapshot = await getDocs(query(
            collection(db, "certificates"),
            where("studentId", "==", uid)
        ));
        // The count is retained for consistency in the student's record panel.
        const certificateLink = document.querySelector('.profile-shortcuts a[href="certificates.html"] small');
        if (certificateLink) {
            certificateLink.textContent = snapshot.size + " verified certificate" + (snapshot.size === 1 ? "" : "s");
        }
    } catch (error) {
        console.warn("Certificate summary unavailable:", error);
    }
}

function setText(id, value) {
    const node = $(id);
    if (node) node.textContent = value == null || value === "" ? "—" : String(value);
}

function setStatus(message) {
    const node = $("profileStatus");
    if (node) node.textContent = message;
}

function humanize(value) {
    return String(value).replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value) {
    if (!value) return "Not recorded";
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return "Not recorded";
    return date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}