import "../js/ui-runtime.js";
import { auth, db } from "../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, setDoc, addDoc, deleteDoc, query, orderBy, limit, onSnapshot, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const state = { user: null, profile: null, auditLogs: [] };
const $ = id => document.getElementById(id);
const toast = (message, type = "success") => window.showToast?.(message, type) ?? console.log(message);
const controlRef = () => doc(db, "platform_controls", "global");

async function requireFounder(user) {
  const snapshot = await getDoc(doc(db, "founder", user.uid));
  if (!snapshot.exists()) throw Error("Founder profile not found.");
  const profile = snapshot.data();
  if (profile.role && profile.role !== "founder") throw Error("Founder access required.");
  if (profile.status && profile.status !== "active") throw Error("Founder account is not active.");
  state.user = user;
  state.profile = profile;
}

async function audit(message, action, details = {}) {
  return addDoc(collection(db, "audit_logs"), { actor_id: state.user.uid, actor_email: state.user.email || "", action, target_type: "platform", target_id: "global", details, message, created_at: serverTimestamp() });
}

async function writeControls(patch, auditMessage, action, details = {}) {
  await setDoc(controlRef(), { ...patch, updated_at: serverTimestamp(), updated_by: state.user.uid }, { merge: true });
  await audit(auditMessage, action, details);
}

async function askReason({ title, message, confirmText = "Continue", tone = "warning", icon = "✎", placeholder = "Enter a clear reason for users..." }) {
  const value = await window.ssaPrompt?.(message, { title, confirmText, tone, icon, placeholder, type: "text" });
  if (value === null) return null;
  const reason = String(value || "").trim();
  if (!reason) { toast("A reason is required so users know why access changed.", "warning"); return null; }
  return reason;
}

async function setPortalState(target, suspended, reason = "") {
  const snapshot = await getDoc(controlRef());
  const current = snapshot.exists() ? snapshot.data() : {};
  const label = target === "student" ? "Student" : "Instructor";
  const previous = current[target] || {};
  const next = { ...previous, suspended, reason: suspended ? reason : "", reason_updated_at: serverTimestamp(), updated_at: serverTimestamp(), updated_by: state.user.uid };
  await writeControls({ [target]: next }, `${label} portal ${suspended ? "suspended" : "restored"}${suspended && reason ? `: ${reason}` : ""}`, suspended ? "portal_suspended" : "portal_restored", { target, suspended, reason: suspended ? reason : "" });
  toast(`${label} portal ${suspended ? "suspended" : "restored"}.`);
}

async function setLockdown(active, reason = "") {
  const snapshot = await getDoc(controlRef());
  const current = snapshot.exists() ? snapshot.data() : {};
  const student = current.student || {};
  const instructor = current.instructor || {};

  if (active) {
    await writeControls({
      lockdown: true,
      lockdown_reason: reason,
      lockdown_reason_updated_at: serverTimestamp(),
      student: { ...student, preLockdownSuspended: student.suspended === true, preLockdownReason: student.reason || "", suspended: true, reason, updated_at: serverTimestamp(), updated_by: state.user.uid },
      instructor: { ...instructor, preLockdownSuspended: instructor.suspended === true, preLockdownReason: instructor.reason || "", suspended: true, reason, updated_at: serverTimestamp(), updated_by: state.user.uid }
    }, `Emergency lockdown activated: ${reason}`, "lockdown_enabled", { affects: ["student", "instructor"], reason });
  } else {
    const restorePortal = portal => ({
      ...portal,
      suspended: portal.preLockdownSuspended === true,
      reason: portal.preLockdownSuspended === true ? (portal.preLockdownReason || "") : "",
      preLockdownSuspended: null,
      preLockdownReason: null,
      updated_at: serverTimestamp(),
      updated_by: state.user.uid
    });
    await writeControls({
      lockdown: false,
      lockdown_reason: "",
      lockdown_reason_updated_at: serverTimestamp(),
      student: restorePortal(student),
      instructor: restorePortal(instructor)
    }, "Emergency lockdown lifted", "lockdown_disabled", { affects: ["student", "instructor"] });
  }
  toast(active ? "Emergency lockdown activated." : "Lockdown lifted.");
}

function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString(); }

function renderMaintenance(maintenance) {
  const element = $("scheduleInfo");
  if (!element) return;
  if (!maintenance?.scheduled) { element.textContent = "No maintenance window scheduled."; return; }
  const start = new Date(maintenance.start).getTime(), end = new Date(maintenance.end).getTime(), now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) { element.textContent = "Invalid maintenance schedule."; return; }
  const target = maintenance.target === "all" ? "Student + Instructor" : maintenance.target === "student" ? "Student Portal" : "Instructor Portal";
  const status = now >= end ? "Expired" : now >= start ? "LIVE NOW" : "Scheduled";
  element.innerHTML = `<strong>${status}</strong> · ${target}<br>${formatDate(maintenance.start)} → ${formatDate(maintenance.end)}<br><span>${maintenance.message || "Scheduled maintenance."}</span>`;
}

function renderControls(data = {}) {
  const studentSuspended = !!data.student?.suspended;
  const instructorSuspended = !!data.instructor?.suspended;
  const lockdown = !!data.lockdown;
  if ($("studentState")) $("studentState").textContent = studentSuspended ? "Suspended" : "Online";
  if ($("instructorState")) $("instructorState").textContent = instructorSuspended ? "Suspended" : "Online";
  if ($("lockdownState")) $("lockdownState").textContent = lockdown ? "ACTIVE" : "Inactive";
  if ($("studentToggle")) $("studentToggle").textContent = studentSuspended ? "Restore Student Portal" : "Suspend Student Portal";
  if ($("instructorToggle")) $("instructorToggle").textContent = instructorSuspended ? "Restore Instructor Portal" : "Suspend Instructor Portal";
  if ($("lockdownToggle")) $("lockdownToggle").textContent = lockdown ? "Lift Lockdown" : "Activate Lockdown";
  if ($("globalStatus")) $("globalStatus").innerHTML = lockdown ? "<span></span> Emergency Lockdown" : studentSuspended || instructorSuspended ? "<span></span> Limited Availability" : "<span></span> All Systems Online";
  renderMaintenance(data.maintenance);
}

function listenControls() {
  return onSnapshot(controlRef(), snapshot => renderControls(snapshot.exists() ? snapshot.data() : {}), error => { console.error("Control listener failed:", error); toast("Unable to read platform controls.", "error"); });
}

function renderAuditLog() {
  const commandLog = $("commandLog");
  if (!commandLog) return;
  const search = String($("auditSearch")?.value || "").trim().toLowerCase();
  const sort = $("auditSort")?.value || "newest";
  let items = state.auditLogs.filter(item => {
    const d = item.data;
    const haystack = [d.message, d.action, d.actor_email, d.target_type, d.target_id].filter(Boolean).join(" ").toLowerCase();
    return !search || haystack.includes(search);
  });
  items.sort((a,b) => {
    const da = a.data, dbb = b.data;
    if (sort === "oldest") return auditTime(da.created_at) - auditTime(dbb.created_at);
    if (sort === "action") return String(da.action || da.message || "").localeCompare(String(dbb.action || dbb.message || ""));
    if (sort === "actor") return String(da.actor_email || "").localeCompare(String(dbb.actor_email || ""));
    return auditTime(dbb.created_at) - auditTime(da.created_at);
  });
  $("auditCount") && ($("auditCount").textContent = `${items.length} shown · ${state.auditLogs.length} total`);
  if (!items.length) { commandLog.innerHTML = '<div class="empty">No audit entries match your search.</div>'; return; }
  commandLog.innerHTML = items.map(item => {
    const d = item.data;
    return `<article class="command-entry">
      <div class="command-entry-main"><div class="audit-entry-icon"><i data-lucide="shield-check"></i></div><div>
        <strong>${escapeHTML(d.message || d.action || "Command executed")}</strong>
        <small>${escapeHTML(d.actor_email || "Founder")} · ${auditDate(d.created_at)}</small>
        <span class="audit-action">${escapeHTML(d.action || "platform_action")}</span>
      </div></div>
      <button class="audit-delete-btn" type="button" data-delete-audit="${escapeHTML(item.id)}" title="Delete audit entry" aria-label="Delete audit entry"><i data-lucide="trash-2"></i></button>
    </article>`;
  }).join("");
  window.lucide?.createIcons();
}
function auditTime(value) { return value?.toDate ? value.toDate().getTime() : (new Date(value || 0).getTime() || 0); }
function auditDate(value) { const t = auditTime(value); return t ? new Date(t).toLocaleString() : "Just now"; }
function escapeHTML(value) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function listenAuditLog() {
  const q = query(collection(db, "audit_logs"), orderBy("created_at", "desc"), limit(100));
  onSnapshot(q, snapshot => {
    state.auditLogs = snapshot.docs.map(item => ({ id: item.id, data: item.data() }));
    renderAuditLog();
  }, error => { console.error("Audit listener failed:", error); $("commandLog").innerHTML = '<div class="empty">Command history is temporarily unavailable.</div>'; });
}
async function deleteAuditEntry(id) {
  if (!id) return;
  const confirmed = await window.ssaConfirm?.("Delete this audit entry? This cannot be undone.", { title: "Delete audit entry?", confirmText: "Delete", tone: "danger", icon: "🗑" });
  if (!confirmed) return;
  await deleteDoc(doc(db, "audit_logs", id));
  toast("Audit entry deleted.");
}
async function deleteFilteredAudit() {
  const search = String($("auditSearch")?.value || "").trim().toLowerCase();
  const sort = $("auditSort")?.value || "newest";
  const items = state.auditLogs.filter(item => {
    const d=item.data; return !search || [d.message,d.action,d.actor_email,d.target_type,d.target_id].filter(Boolean).join(" ").toLowerCase().includes(search);
  });
  if (!items.length) { toast("There are no shown audit entries to delete.","warning"); return; }
  const confirmed = await window.ssaConfirm?.(`Delete ${items.length} shown audit entr${items.length === 1 ? "y" : "ies"}? This cannot be undone.`, { title: "Delete shown entries?", confirmText: "Delete shown", tone: "danger", icon: "🗑" });
  if (!confirmed) return;
  $("deleteFilteredAudit").disabled = true;
  try { for (const item of items) await deleteDoc(doc(db, "audit_logs", item.id)); toast(`${items.length} audit entr${items.length === 1 ? "y" : "ies"} deleted.`); }
  catch (error) { console.error(error); toast(error.message || "Unable to delete audit entries.","error"); }
  finally { $("deleteFilteredAudit").disabled = false; }
}
function bindAuditControls() {
  $("auditSearch")?.addEventListener("input", renderAuditLog);
  $("auditSort")?.addEventListener("change", renderAuditLog);
  $("clearAuditSearch")?.addEventListener("click", () => { $("auditSearch").value=""; $("auditSort").value="newest"; renderAuditLog(); });
  $("deleteFilteredAudit")?.addEventListener("click", deleteFilteredAudit);
  $("commandLog")?.addEventListener("click", event => { const button=event.target.closest("[data-delete-audit]"); if (button) deleteAuditEntry(button.dataset.deleteAudit); });
}

async function scheduleMaintenance() {
  const target = $("maintenanceTarget").value, start = $("maintenanceStart").value, end = $("maintenanceEnd").value, message = $("maintenanceMessage").value.trim();
  if (!start || !end) throw Error("Choose both a start and end time.");
  const startDate = new Date(start), endDate = new Date(end);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) throw Error("Please enter valid maintenance dates.");
  if (endDate <= startDate) throw Error("End time must be after start time.");
  if (endDate <= new Date()) throw Error("Maintenance must end in the future.");
  const maintenance = {
    scheduled: true,
    target,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    startAt: Timestamp.fromDate(startDate),
    endAt: Timestamp.fromDate(endDate),
    message: message || "SSA is temporarily offline for scheduled maintenance.",
    scheduled_by: state.user.uid,
    scheduled_by_email: state.user.email || "",
    scheduled_at: serverTimestamp()
  };
  await writeControls({ maintenance }, "Maintenance window scheduled", "maintenance_scheduled", { target, start: maintenance.start, end: maintenance.end, message: maintenance.message });
  renderMaintenance(maintenance);
  toast("Maintenance window scheduled successfully.");
}

async function cancelMaintenance() {
  const confirmed = await window.ssaConfirm?.("The current maintenance window will be cancelled. Users will remain online unless another control is active.", { title: "Cancel maintenance?", confirmText: "Cancel Window", tone: "warning", icon: "◷" });
  if (!confirmed) return false;
  await writeControls({ maintenance: { scheduled: false, cancelled_at: serverTimestamp(), cancelled_by: state.user.uid } }, "Scheduled maintenance cancelled", "maintenance_cancelled");
  if ($("scheduleInfo")) $("scheduleInfo").textContent = "No maintenance window scheduled.";
  toast("Scheduled maintenance cancelled.");
  return true;
}

function bindEvents() {
  $("studentToggle").onclick = async () => {
    try { const snapshot = await getDoc(controlRef()); const suspended = !snapshot.data()?.student?.suspended; const reason = suspended ? await askReason({ title: "Suspend Student Portal", message: "Tell students why the Student Portal is being suspended. This message will be shown to active users before they are signed out.", confirmText: "Suspend Portal", tone: "danger", icon: "⛔", placeholder: "e.g. Scheduled security maintenance" }) : ""; if (suspended && !reason) return; await setPortalState("student", suspended, reason); }
    catch (error) { console.error(error); toast(error.message || "Unable to change student portal state.", "error"); }
  };
  $("instructorToggle").onclick = async () => {
    try { const snapshot = await getDoc(controlRef()); const suspended = !snapshot.data()?.instructor?.suspended; const reason = suspended ? await askReason({ title: "Suspend Instructor Portal", message: "Tell instructors why the Instructor Portal is being suspended. This message will be shown to active users before they are signed out.", confirmText: "Suspend Portal", tone: "danger", icon: "⛔", placeholder: "e.g. Emergency maintenance" }) : ""; if (suspended && !reason) return; await setPortalState("instructor", suspended, reason); }
    catch (error) { console.error(error); toast(error.message || "Unable to change instructor portal state.", "error"); }
  };
  $("lockdownToggle").onclick = async () => {
    try {
      const snapshot = await getDoc(controlRef());
      const active = !!snapshot.data()?.lockdown;
      if (!active) {
        const confirmed = await window.ssaConfirm("This will immediately restrict BOTH the Student and Instructor portals. Use this only for a genuine emergency.", { title: "Activate emergency lockdown?", confirmText: "Continue", tone: "danger", icon: "⛔" });
        if (!confirmed) return;
        const reason = await askReason({ title: "Lockdown reason", message: "This message will be shown to active students and instructors before they are signed out.", confirmText: "Activate Lockdown", tone: "danger", icon: "🛡", placeholder: "e.g. Critical security incident" });
        if (!reason) return;
        $("lockdownToggle").disabled = true;
        await setLockdown(true, reason);
      } else {
        const confirmed = await window.ssaConfirm("Restore access for both Student and Instructor portals?", { title: "Lift emergency lockdown?", confirmText: "Restore Access", tone: "warning", icon: "✓" });
        if (!confirmed) return;
        $("lockdownToggle").disabled = true;
        await setLockdown(false);
      }
    } catch (error) { console.error("Lockdown error:", error); toast(error.message || "Unable to change lockdown status.", "error"); }
    finally { $("lockdownToggle").disabled = false; }
  };
  $("scheduleBtn").onclick = async () => { try { $("scheduleBtn").disabled = true; await scheduleMaintenance(); } catch (error) { toast(error.message, "error"); } finally { $("scheduleBtn").disabled = false; } };
  $("cancelScheduleBtn").onclick = async () => { try { $("cancelScheduleBtn").disabled = true; await cancelMaintenance(); } catch (error) { toast(error.message || "Unable to cancel maintenance.", "error"); } finally { $("cancelScheduleBtn").disabled = false; } };
}

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.replace("../login.html"); return; }
  try { await requireFounder(user); listenControls(); listenAuditLog(); bindAuditControls(); bindEvents(); console.log("🔥 Founder Command Center connected to Firebase."); }
  catch (error) { console.error(error); toast(error.message || "Founder authorization failed.", "error"); setTimeout(() => window.location.replace("../login.html"), 1500); }
});
