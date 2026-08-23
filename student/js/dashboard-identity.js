import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);

function renderStudent(student, authUser) {
    const name = student.name || student.fullName || authUser.displayName || "Student";
    const email = student.email || authUser.email || "";
    const initial = name.charAt(0).toUpperCase() || "S";
    const stats = student.stats || {};

    if ($("studentName")) $("studentName").textContent = name;
    if ($("studentFullName")) $("studentFullName").textContent = name;
    if ($("studentEmail")) $("studentEmail").textContent = email;
    if ($("profileAvatar")) $("profileAvatar").textContent = initial;
    if ($("studentAdmission")) $("studentAdmission").textContent = `Admission: ${student.admissionNumber || "Pending"}`;
    if ($("courseCount")) $("courseCount").textContent = stats.coursesEnrolled ?? 0;
    if ($("lessonCount")) $("lessonCount").textContent = stats.lessonsCompleted ?? 0;
    if ($("progressPercent")) $("progressPercent").textContent = `${stats.progress ?? 0}%`;
    if ($("overallProgress")) $("overallProgress").textContent = `${stats.progress ?? 0}%`;
    if ($("progressBarFill")) $("progressBarFill").style.width = `${Math.min(100, Math.max(0, Number(stats.progress) || 0))}%`;
    if ($("studentLevel")) $("studentLevel").textContent = student.level ?? 1;
    if ($("studentXP")) $("studentXP").textContent = student.xp ?? 0;
    if ($("streakDays")) $("streakDays").textContent = `${student.streak ?? 0} Days`;
    if ($("learningStreak")) $("learningStreak").textContent = `${student.streak ?? 0} Day Streak`;
    if ($("badgeCount")) $("badgeCount").textContent = `${Array.isArray(student.badges) ? student.badges.length : 0} Badges`;

    const xp = Number(student.xp) || 0;
    if ($("xpProgress")) $("xpProgress").style.width = `${Math.min(100, (xp / 1000) * 100)}%`;
}

async function loadIdentity(user) {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) throw new Error("Student account profile not found.");

    const userData = userSnap.data();
    if (userData.role !== "student") throw new Error("This account is not a student account.");
    if (userData.active === false) throw new Error("This student account is disabled.");

    const studentSnap = await getDoc(doc(db, "students", user.uid));
    if (!studentSnap.exists()) throw new Error("Student profile has not been created yet.");

    const student = studentSnap.data();
    const status = String(student.status || "").toLowerCase();
    const onboarding = String(student.onboardingStatus || "").toLowerCase();

    if (status === "pending" || status === "rejected" || onboarding === "awaiting_admission") {
        throw new Error("Your student admission has not been approved yet.");
    }

    // Identity is always keyed by the Firebase Auth UID. Platform controls
    // remain handled independently by portal-control.js.
    renderStudent({ ...student, uid: user.uid }, user);
}

onAuthStateChanged(auth, async user => {
    if (!user) {
        location.replace("../login.html");
        return;
    }

    try {
        await loadIdentity(user);
    } catch (error) {
        console.error("Student identity check failed:", error);
        try { await signOut(auth); } catch (signOutError) { console.error(signOutError); }
        sessionStorage.setItem("ssaPortalNotice", error.message || "Student access is unavailable.");
        location.replace("../login.html");
    }
});
