// ============================================================
// SPARK STACK ACADEMY — ADMIN / MODERATOR DASHBOARD
// ============================================================

import { db } from "../../js/firebase.js";
import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const setText = (id, value) => { const element = $(id); if (element) element.textContent = value ?? "0"; };
const normalize = value => String(value ?? "").trim().toLowerCase();

async function getCollection(name) {
    try {
        return await getDocs(collection(db, name));
    } catch (error) {
        console.warn(`[Admin Dashboard] Unable to read ${name}:`, error);
        return null;
    }
}

async function loadPlatformStats() {
    const [usersSnap, instructorsSnap, coursesSnap, reportsSnap, withdrawalsSnap] = await Promise.all([
        getCollection("users"),
        getCollection("instructors"),
        getCollection("courses"),
        getCollection("reports"),
        getCollection("withdrawals")
    ]);

    const users = usersSnap?.docs.map(d => d.data()) || [];
    const instructors = instructorsSnap?.docs.map(d => d.data()) || [];
    const courses = coursesSnap?.docs.map(d => d.data()) || [];
    const reports = reportsSnap?.docs.map(d => d.data()) || [];
    const withdrawals = withdrawalsSnap?.docs.map(d => d.data()) || [];

    // users contains multiple roles; never count the entire collection as students.
    const studentsFromUsers = users.filter(u => normalize(u.role) === "student").length;
    const instructorsFromUsers = users.filter(u => ["instructor", "teacher"].includes(normalize(u.role))).length;
    const studentCount = studentsFromUsers || (await getCollection("students"))?.size || 0;
    const instructorCount = instructors.length || instructorsFromUsers;
    const courseCount = courses.filter(c => normalize(c.status) !== "archived").length;
    const openReports = reports.filter(r => !["resolved", "closed", "dismissed"].includes(normalize(r.status))).length;
    const pendingInstructors = instructors.filter(i => ["pending", "review", "awaiting_approval", "submitted"].includes(normalize(i.status))).length;
    const pendingCourses = courses.filter(c => ["pending", "review", "submitted", "pending_review"].includes(normalize(c.status))).length;
    const pendingWithdrawals = withdrawals.filter(w => ["pending", "review", "processing"].includes(normalize(w.status))).length;

    setText("totalStudents", studentCount);
    setText("totalInstructors", instructorCount);
    setText("totalCourses", courseCount);
    setText("openReports", openReports);
    setText("pendingInstructors", `${pendingInstructors} pending`);
    setText("pendingCourses", `${pendingCourses} pending`);
    setText("pendingWithdrawals", `${pendingWithdrawals} pending`);
}

async function loadRecentActivity() {
    const container = $("recentActivity");
    if (!container) return;

    try {
        let snapshot;
        try {
            snapshot = await getDocs(query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(8)));
        } catch {
            snapshot = await getDocs(query(collection(db, "notifications"), limit(8)));
        }

        if (snapshot.empty) {
            renderEmptyActivity(container);
            return;
        }

        container.replaceChildren();
        snapshot.docs.forEach(notification => {
            const data = notification.data();
            const item = document.createElement("div");
            item.className = "activity-item";
            item.innerHTML = `<div class="activity-icon"><i data-lucide="bell"></i></div><div class="activity-content"><strong>${escapeHTML(data.title || "Academy Activity")}</strong><span>${escapeHTML(data.message || "New platform activity.")}</span></div>`;
            container.appendChild(item);
        });
        refreshIcons();
    } catch (error) {
        console.warn("[Admin Dashboard] Activity loading failed:", error);
        renderEmptyActivity(container);
    }
}

function renderEmptyActivity(container) {
    container.innerHTML = `<div class="activity-empty"><i data-lucide="inbox"></i><span>No recent activity</span></div>`;
    refreshIcons();
}

function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") window.lucide.createIcons();
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>\"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" }[c]));
}

async function loadDashboard() {
    await Promise.allSettled([loadPlatformStats(), loadRecentActivity()]);
    refreshIcons();
    console.log("✓ Admin dashboard ready");
}

document.addEventListener("admin:ready", loadDashboard, { once: true });
