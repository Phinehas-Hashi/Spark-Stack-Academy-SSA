import { db } from "../../js/firebase.js";
import { collection, getDocs, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const setText = (id, value) => { const el = $(id); if (el) el.textContent = value ?? "0"; };
const normalize = value => String(value ?? "").trim().toLowerCase();
const escapeHTML = value => String(value ?? "").replace(/[&<>\"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" }[c]));

async function getCollection(name) {
  try { return await getDocs(collection(db, name)); }
  catch (error) { console.warn(`[Admin Dashboard] Unable to read ${name}:`, error); return null; }
}

async function loadPlatformStats() {
  const [studentsSnap, instructorsSnap, coursesSnap, reportsSnap, withdrawalsSnap] = await Promise.all([
    getCollection("students"), getCollection("instructors"), getCollection("courses"), getCollection("reports"), getCollection("withdrawals")
  ]);
  const students = studentsSnap?.docs.map(d => d.data()) || [];
  const instructors = instructorsSnap?.docs.map(d => d.data()) || [];
  const courses = coursesSnap?.docs.map(d => d.data()) || [];
  const reports = reportsSnap?.docs.map(d => d.data()) || [];
  const withdrawals = withdrawalsSnap?.docs.map(d => d.data()) || [];
  setText("totalStudents", students.length);
  setText("totalInstructors", instructors.filter(i => !i.status || normalize(i.status) === "active").length);
  setText("totalCourses", courses.filter(c => normalize(c.status) !== "archived").length);
  setText("openReports", reports.filter(r => !["resolved", "closed", "dismissed"].includes(normalize(r.status))).length);
  setText("pendingInstructors", `${instructors.filter(i => ["pending", "review", "awaiting_approval", "submitted"].includes(normalize(i.status))).length} pending`);
  setText("pendingCourses", `${courses.filter(c => ["pending", "review", "submitted", "pending_review"].includes(normalize(c.status))).length} pending`);
  setText("pendingWithdrawals", `${withdrawals.filter(w => ["pending", "review", "processing"].includes(normalize(w.status))).length} pending`);
  renderModerationQueue(reports);
}

function renderModerationQueue(reports) {
  const container = $("moderationQueue"); if (!container) return;
  const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
  const rows = reports.filter(r => !["resolved", "closed", "dismissed"].includes(normalize(r.status))).sort((a, b) => (priorityWeight[normalize(b.priority)] || 0) - (priorityWeight[normalize(a.priority)] || 0)).slice(0, 5);
  if (!rows.length) { container.innerHTML = `<div class="dashboard-loading"><span>Queue clear — no open reports.</span></div>`; return; }
  container.innerHTML = rows.map(report => `<a class="moderation-item" href="reports.html"><div class="moderation-item-icon ${normalize(report.priority) === "critical" ? "report" : "warning"}"><i data-lucide="flag"></i></div><div class="moderation-item-content"><strong>${escapeHTML(report.title || report.reason || "Report")}</strong><span>${escapeHTML(report.reportedUserName || report.category || "Requires review")}</span></div><span class="moderation-item-time">${escapeHTML(report.priority || "medium")}</span></a>`).join("");
  refreshIcons();
}

async function loadRecentActivity() {
  const container = $("recentActivity"); if (!container) return;
  try {
    let snapshot;
    try { snapshot = await getDocs(query(collection(db, "notifications"), orderBy("createdAt", "desc"), limit(8))); }
    catch { snapshot = await getDocs(query(collection(db, "notifications"), limit(8))); }
    if (snapshot.empty) { container.innerHTML = `<div class="dashboard-loading"><span>No recent activity.</span></div>`; return; }
    container.innerHTML = snapshot.docs.map(item => { const data = item.data(); return `<div class="activity-item"><div class="activity-icon"><i data-lucide="bell"></i></div><div class="activity-content"><strong>${escapeHTML(data.title || "Academy Activity")}</strong><span>${escapeHTML(data.message || "New platform activity.")}</span></div></div>`; }).join("");
    refreshIcons();
  } catch (error) { console.warn("Activity loading failed:", error); container.innerHTML = `<div class="dashboard-loading"><span>Activity is temporarily unavailable.</span></div>`; }
}

function refreshIcons() { if (window.lucide?.createIcons) window.lucide.createIcons(); }

async function loadDashboard() { await Promise.allSettled([loadPlatformStats(), loadRecentActivity()]); refreshIcons(); console.log("✓ Admin dashboard ready"); }
document.addEventListener("admin:ready", loadDashboard, { once: true });
