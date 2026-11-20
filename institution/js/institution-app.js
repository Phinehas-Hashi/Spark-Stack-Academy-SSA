import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const LOGIN_PAGE = "../login.html";
const ALLOWED_ROLES = new Set(["institution", "institution_owner", "institution_admin"]);
const sidebar = document.getElementById("institutionSidebar");
const topbar = document.getElementById("institutionTopbar");
const overlay = document.getElementById("sidebarOverlay");
const functions = getFunctions();
const createTeamAccount = httpsCallable(functions, "createInstitutionTeamAccount");
let currentInstitutionId = null;
let currentProfile = null;

async function loadComponent(target, path) {
  if (!target) throw new Error("Institution portal shell container is missing.");
  const response = await fetch(path);
  if (!response.ok) throw new Error("Unable to load portal component: " + path);
  target.innerHTML = await response.text();
}

function initials(value) {
  const words = String(value || "Institution").trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? (words[0][0] + words[words.length - 1][0]).toUpperCase() : (words[0]?.[0] || "I").toUpperCase();
}

function setInstitutionName(name) {
  const safeName = name || "Your institution";
  const mark = initials(safeName);
  for (const id of ["institutionName", "sidebarInstitutionName", "topbarInstitutionName"]) {
    const node = document.getElementById(id);
    if (node) node.textContent = safeName;
  }
  for (const id of ["sidebarInstitutionAvatar", "topbarInstitutionAvatar"]) {
    const node = document.getElementById(id);
    if (node) node.textContent = mark;
  }
}

function renderQuota(id, barId, used, maximum) {
  const value = Math.max(0, Number(used) || 0);
  const cap = Math.max(0, Number(maximum) || 0);
  const label = document.getElementById(id);
  const bar = document.getElementById(barId);
  if (label) label.textContent = value.toLocaleString() + " / " + cap.toLocaleString();
  if (bar) bar.style.width = (cap ? Math.min(100, value / cap * 100) : 0) + "%";
}

function renderInstitutionQuotas(institution) {
  const limits = institution.limits || { instructors: 20, courses: 100, students: 5000, adminAccounts: 10 };
  const usage = institution.usage || {};
  renderQuota("quotaInstructors", "barInstructors", usage.instructors, limits.instructors ?? 20);
  renderQuota("quotaCourses", "barCourses", usage.courses, limits.courses ?? 100);
  renderQuota("quotaStudents", "barStudents", usage.students, limits.students ?? 5000);
  renderQuota("quotaAdmins", "barAdmins", usage.adminAccounts, limits.adminAccounts ?? 10);
}

async function loadInstitutionTeam() {
  const list = document.getElementById("institutionTeamList");
  if (!list || !currentInstitutionId) return;
  list.textContent = "Loading team accounts…";
  try {
    const snap = await getDocs(query(collection(db, "institutions", currentInstitutionId, "members"), orderBy("createdAt", "desc")));
    list.replaceChildren();
    if (snap.empty) {
      const empty = document.createElement("div");
      empty.className = "team-empty";
      empty.textContent = "No additional team accounts have been created.";
      list.append(empty);
      return;
    }
    snap.forEach(memberDoc => {
      const member = memberDoc.data();
      const row = document.createElement("div");
      row.className = "team-member";
      const identity = document.createElement("div");
      const name = document.createElement("strong");
      name.textContent = member.fullName || "Team member";
      const email = document.createElement("small");
      email.textContent = member.email || "";
      identity.append(name, email);
      const role = document.createElement("em");
      role.textContent = member.role === "institution_admin" ? "Administrator" : "Instructor";
      row.append(identity, role);
      list.append(row);
    });
  } catch (error) {
    console.error("Institution team loading failed:", error);
    list.textContent = "Team accounts could not be loaded. Check permissions and try again.";
  }
}

function setupTeamForm() {
  const form = document.getElementById("teamAccountForm");
  if (!form) return;
  const isOwner = currentProfile?.role === "institution" && currentProfile?.institutionRole === "owner";
  if (!isOwner) {
    form.hidden = true;
    return;
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.getElementById("createTeamAccountBtn");
    const message = document.getElementById("teamAccountMessage");
    const values = new FormData(form);
    const payload = {
      fullName: String(values.get("fullName") || "").trim(),
      email: String(values.get("email") || "").trim(),
      role: String(values.get("role") || ""),
      temporaryPassword: String(values.get("temporaryPassword") || "")
    };
    button.disabled = true;
    message.className = "team-message";
    message.textContent = "Creating account securely…";
    try {
      await createTeamAccount(payload);
      form.reset();
      message.className = "team-message success";
      message.textContent = "Team account created successfully.";
      await loadInstitutionTeam();
      const institutionSnap = await getDoc(doc(db, "institutions", currentInstitutionId));
      if (institutionSnap.exists()) renderInstitutionQuotas(institutionSnap.data());
    } catch (error) {
      console.error("Institution team account creation failed:", error);
      message.className = "team-message error";
      message.textContent = error.message || "Account creation failed. Check the limits and try again.";
    } finally {
      button.disabled = false;
    }
  });
}

function setupNavigation() {
  const menu = document.getElementById("institutionMenuBtn");
  menu?.addEventListener("click", () => {
    sidebar?.classList.add("open");
    overlay?.classList.add("active");
  });
  overlay?.addEventListener("click", closeNavigation);
  sidebar?.querySelectorAll("a").forEach(link => link.addEventListener("click", closeNavigation));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeNavigation();
  });
}

function closeNavigation() {
  sidebar?.classList.remove("open");
  overlay?.classList.remove("active");
}

function setupLogout() {
  document.addEventListener("click", async event => {
    const button = event.target.closest("#institutionLogoutBtn");
    if (!button) return;
    button.disabled = true;
    try {
      await signOut(auth);
      window.location.replace(LOGIN_PAGE);
    } catch (error) {
      console.error("Institution sign-out failed:", error);
      button.disabled = false;
      window.alert("Unable to sign out. Please try again.");
    }
  });
}

function denyAccess() {
  document.body.innerHTML = '<main style="max-width:560px;margin:12vh auto;padding:28px;font-family:Arial,sans-serif;text-align:center"><h1>Institution access required</h1><p>This account does not currently have an approved institution role. Contact Spark Stack Academy support if you believe this is an error.</p><a href="../login.html">Return to sign in</a></main>';
}

async function boot() {
  try {
    await Promise.all([
      loadComponent(sidebar, "components/sidebar.html"),
      loadComponent(topbar, "components/topbar.html")
    ]);
    setupNavigation();
    setupLogout();
    window.lucide?.createIcons();
  } catch (error) {
    console.error("Institution portal shell failed:", error);
    return;
  }

  onAuthStateChanged(auth, async user => {
    if (!user) {
      window.location.replace(LOGIN_PAGE);
      return;
    }
    try {
      const snapshot = await getDoc(doc(db, "users", user.uid));
      if (!snapshot.exists()) {
        denyAccess();
        return;
      }
      const profile = snapshot.data();
      currentProfile = profile;
      const role = String(profile.role || "").trim().toLowerCase();
      const approved = profile.status === "active" && profile.active === true && profile.verified === true;
      if (!ALLOWED_ROLES.has(role) || !approved) {
        denyAccess();
        return;
      }
      const institutionId = profile.institutionId;
      currentInstitutionId = institutionId || null;
      if (institutionId) {
        const institutionSnapshot = await getDoc(doc(db, "institutions", institutionId));
        if (institutionSnapshot.exists()) renderInstitutionQuotas(institutionSnapshot.data());
      }
      const name = profile.institutionName || profile.organizationName || profile.displayName || profile.name || user.displayName || "Your institution";
      setInstitutionName(name);
      setupTeamForm();
      await loadInstitutionTeam();
      document.documentElement.dataset.institutionPortalReady = "true";
      window.lucide?.createIcons();
    } catch (error) {
      console.error("Institution profile verification failed:", error);
      document.body.innerHTML = '<main style="max-width:560px;margin:12vh auto;padding:28px;font-family:Arial,sans-serif;text-align:center"><h1>Unable to verify institution access</h1><p>Please check your connection and try again. No institution data has been changed.</p><a href="../login.html">Return to sign in</a></main>';
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}