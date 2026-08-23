import { auth, db } from "./firebase.js";
import { onSnapshot, doc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let blocker = null;
let notice = null;
let lastKey = "";
let redirecting = false;
let logoutTimer = null;

const label = portal => portal === "instructor" ? "Instructor Portal" : "Student Portal";

function styles() {
    if (document.getElementById("ssaControlStyles")) return;
    const style = document.createElement("style");
    style.id = "ssaControlStyles";
    style.textContent = `
        #ssaPortalBlocker,#ssaPortalNotice{position:fixed;inset:0;z-index:2147483647;font-family:Inter,Poppins,system-ui,sans-serif}
        #ssaPortalBlocker{display:none;align-items:center;justify-content:center;padding:24px;overflow:auto;background:radial-gradient(circle at 20% 10%,rgba(41,121,255,.18),transparent 34%),radial-gradient(circle at 85% 90%,rgba(255,193,7,.12),transparent 30%),linear-gradient(135deg,#061326,#0b2141 55%,#071326)}
        #ssaPortalBlocker .card,#ssaPortalNotice .card{width:min(560px,100%);padding:42px 32px;text-align:center;background:rgba(255,255,255,.97);color:#0f172a;border:1px solid rgba(255,255,255,.55);border-radius:30px;box-shadow:0 35px 120px rgba(0,0,0,.34);animation:ssaControlIn .45s ease}
        .ssa-control-brand{display:inline-flex;align-items:center;gap:8px;margin-bottom:20px;color:#64748b;font-size:10px;font-weight:900;letter-spacing:.18em}
        .ssa-control-brand b{color:#081c3a;font-size:13px;letter-spacing:.05em}
        .ssa-control-icon{width:82px;height:82px;margin:0 auto 20px;display:grid;place-items:center;border-radius:25px;background:linear-gradient(145deg,#eef4ff,#f8fafc);font-size:34px;box-shadow:inset 0 0 0 1px #e2e8f0}
        .ssa-control-eyebrow{color:#2563eb;font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}
        .ssa-control-card h1,.ssa-control-card h2{margin:10px 0 12px;font-size:29px;line-height:1.15;letter-spacing:-.03em}
        .ssa-control-card p{margin:0 auto 20px;max-width:455px;color:#64748b;line-height:1.7;white-space:pre-line;font-size:14px}
        .ssa-control-status{display:inline-flex;padding:9px 13px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:900}
        .ssa-control-meta{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin:0 0 20px}
        .ssa-control-chip{padding:8px 11px;border-radius:999px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:800}
        .ssa-control-message{margin:18px 0;padding:16px;text-align:left;background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;color:#334155;line-height:1.65;font-size:13px}
        .ssa-control-btn{width:100%;border:0;border-radius:14px;padding:14px;background:#081c3a;color:#fff;font-weight:850;cursor:pointer}
        .ssa-control-btn:hover{background:#102d56}
        @keyframes ssaControlIn{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
    `;
    document.head.appendChild(style);
}

function blockerEl() {
    if (blocker) return blocker;
    styles();
    blocker = document.createElement("div");
    blocker.id = "ssaPortalBlocker";
    blocker.innerHTML = `<div class="card ssa-control-card"><div class="ssa-control-brand"><span>⚡</span><b>SPARK STACK ACADEMY</b></div><div id="scIcon" class="ssa-control-icon">⚡</div><div class="ssa-control-eyebrow">PLATFORM CONTROL</div><h1 id="scTitle">Portal Unavailable</h1><p id="scMsg"></p><div class="ssa-control-status" id="scStatus">System Control Active</div></div>`;
    document.body.appendChild(blocker);
    return blocker;
}

function noticeEl() {
    if (notice) return notice;
    styles();
    notice = document.createElement("div");
    notice.id = "ssaPortalNotice";
    notice.style.display = "none";
    notice.innerHTML = `<div class="card ssa-control-card"><div class="ssa-control-brand"><span>⚡</span><b>SPARK STACK ACADEMY</b></div><div class="ssa-control-icon">🛠️</div><div class="ssa-control-eyebrow">SSA SERVICE NOTICE</div><h2 id="snTitle">Maintenance Scheduled</h2><div id="snMeta" class="ssa-control-meta"></div><p id="snIntro"></p><div id="snMsg" class="ssa-control-message"></div><button id="snClose" class="ssa-control-btn">Got it</button></div>`;
    document.body.appendChild(notice);
    notice.querySelector("#snClose").onclick = () => notice.style.display = "none";
    return notice;
}

function showBlock(title, message, icon, status) {
    const element = blockerEl();
    element.querySelector("#scIcon").textContent = icon;
    element.querySelector("#scTitle").textContent = title;
    element.querySelector("#scMsg").textContent = message;
    element.querySelector("#scStatus").textContent = status;
    element.style.display = "flex";
    document.body.style.overflow = "hidden";
}

function hideBlock() {
    if (blocker) blocker.style.display = "none";
    if (notice) notice.style.display = "none";
    document.body.style.overflow = "";
    if (logoutTimer) { clearTimeout(logoutTimer); logoutTimer = null; }
    redirecting = false;
}

function broadcast(maintenance, portal) {
    const element = noticeEl();
    element.querySelector("#snTitle").textContent = "Maintenance Scheduled";
    element.querySelector("#snIntro").textContent = `A service window has been scheduled for the ${label(portal)}.`;
    element.querySelector("#snMsg").textContent = maintenance.message || "Please save your work before maintenance begins. You will be signed out when the window starts.";
    const chips = [];
    if (maintenance.target) chips.push(`<span class="ssa-control-chip">${maintenance.target === "all" ? "Student + Instructor" : label(portal)}</span>`);
    if (maintenance.start) chips.push(`<span class="ssa-control-chip">Starts ${new Date(maintenance.start).toLocaleString()}</span>`);
    if (maintenance.end) chips.push(`<span class="ssa-control-chip">Ends ${new Date(maintenance.end).toLocaleString()}</span>`);
    element.querySelector("#snMeta").innerHTML = chips.join("");
    element.style.display = "flex";
}

async function logout(reason) {
    if (redirecting) return;
    redirecting = true;
    try { sessionStorage.setItem("ssaPortalNotice", reason); } catch {}
    logoutTimer = setTimeout(async () => {
        try { await signOut(auth); }
        catch (error) { console.error("SSA controlled logout failed:", error); }
        finally { location.replace("../login.html"); }
    }, 1400);
}

export function watchPortalControl(portal = "student") {
    return onSnapshot(doc(db, "platform_controls", "global"), async snapshot => {
        if (!snapshot.exists()) { hideBlock(); return; }

        const data = snapshot.data();
        const lockdown = data.lockdown === true;
        const suspended = data[portal]?.suspended === true;
        const maintenance = data.maintenance || {};
        const now = Date.now();
        const start = new Date(maintenance.start).getTime();
        const end = new Date(maintenance.end).getTime();
        const applies = maintenance.target === portal || maintenance.target === "all";
        const maintenanceActive = maintenance.scheduled && applies && now >= start && now < end;
        const maintenanceUpcoming = maintenance.scheduled && applies && now < start;
        const reason = data[portal]?.reason || data.reason || maintenance.message || "No additional reason was provided.";
        const key = JSON.stringify({ lockdown, suspended, scheduled: maintenance.scheduled, start, end, reason });

        if (lockdown) {
            showBlock("Emergency Lockdown", "Spark Stack Academy has temporarily restricted access to protect the platform and its users.\n\nYour current session will end automatically. Please return when access is restored.", "🔒", "Emergency Lockdown Active");
            lastKey = key;
            await logout("Emergency lockdown is active. Please return after access is restored.");
            return;
        }

        if (suspended) {
            showBlock(`${label(portal)} Suspended`, `Your portal has been temporarily suspended by Spark Stack Academy administration.\n\nReason: ${reason}\n\nYou will not be able to access the portal until access is restored.`, "⛔", "Portal Access Suspended");
            lastKey = key;
            await logout(`${label(portal)} suspended. ${reason}`);
            return;
        }

        if (maintenanceActive) {
            showBlock("Scheduled Maintenance", `${maintenance.message || "This portal is temporarily offline for scheduled maintenance."}\n\nMaintenance ends: ${new Date(maintenance.end).toLocaleString()}`, "🛠️", "Maintenance In Progress");
            lastKey = key;
            await logout("Scheduled maintenance is currently in progress.");
            return;
        }

        if (maintenanceUpcoming && key !== lastKey) broadcast(maintenance, portal);
        lastKey = key;
        if (!maintenanceUpcoming) hideBlock();
    }, error => console.error("SSA platform control listener failed:", error));
}
