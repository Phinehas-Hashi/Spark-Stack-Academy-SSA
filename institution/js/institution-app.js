import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, getDocFromServer, collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const LOGIN_PAGE = "../login.html";
const ALLOWED_ROLES = new Set(["institution_applicant", "institution", "institution_owner", "institution_admin"]);
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
    if (!window.SSAOnlineActionGuard?.requireOnline("Creating an institution team account")) return;
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

function denyAccess(profile, user, reason = "profile_rejected") {
  const details = {
    reason,
    uid: user?.uid || null,
    profileFound: Boolean(profile),
    role: profile?.role ?? null,
    roleAllowed: ALLOWED_ROLES.has(String(profile?.role || "").trim().toLowerCase()),
    status: profile?.status ?? null,
    active: profile?.active ?? null,
    activeType: typeof profile?.active,
    verified: profile?.verified ?? null,
    verifiedType: typeof profile?.verified,
    statusIsActive: profile?.status === "active",
    activeIsBooleanTrue: profile?.active === true,
    verifiedIsBooleanTrue: profile?.verified === true,
    institutionId: profile?.institutionId ?? null
  };
  console.error("Institution access diagnostic:", details);
  document.body.innerHTML = '<main style="max-width:560px;margin:8vh auto;padding:24px;font-family:Arial,sans-serif"><h1>Institution access required</h1><p>The portal rejected this account. Temporary diagnostic details are shown below; no account data has been changed.</p><pre id="institutionAccessDiagnostic" style="white-space:pre-wrap;overflow-wrap:anywhere;background:#eef2f7;padding:16px;border-radius:8px;font-size:13px;text-align:left"></pre><p><a href="../login.html">Return to sign in</a></p></main>';
  const output = document.getElementById("institutionAccessDiagnostic");
  if (output) output.textContent = JSON.stringify(details, null, 2);
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
      const snapshot = await getDocFromServer(doc(db, "users", user.uid));
      if (!snapshot.exists()) {
        denyAccess(null, user, "users_document_missing");
        return;
      }
      const profile = snapshot.data();
      currentProfile = profile;
      const role = String(profile.role || "").trim().toLowerCase();

      if (role === "institution_applicant") {
        if (profile.status !== "pending_review" || profile.active !== false || profile.verified !== false) {
          denyAccess(profile, user, "invalid_provisional_applicant_state");
          return;
        }
        const provisionalId = user.uid;
        const [institutionSnapshot, membershipSnapshot] = await Promise.all([
          getDoc(doc(db, "institutions", provisionalId)),
          getDoc(doc(db, "institutions", provisionalId, "members", user.uid))
        ]);
        if (!institutionSnapshot.exists() || !membershipSnapshot.exists()) {
          denyAccess(profile, user, "provisional_workspace_missing");
          return;
        }
        const institution = institutionSnapshot.data();
        const membership = membershipSnapshot.data();
        if (institution.ownerUid !== user.uid
          || institution.status !== "provisional"
          || membership.uid !== user.uid
          || membership.status !== "pending_verification"
          || membership.verified !== false) {
          denyAccess(profile, user, "provisional_workspace_owner_check_failed");
          return;
        }

        currentInstitutionId = provisionalId;
        currentProfile = profile;
        setInstitutionName(institution.institutionName || institution.legalName || profile.fullName || "Your institution");
        const welcome = document.querySelector(".welcome-panel");
        const notice = document.createElement("section");
        notice.className = "notice-panel";
        const icon = document.createElement("span");
        icon.textContent = "!";
        const copy = document.createElement("div");
        const heading = document.createElement("strong");
        heading.textContent = "Provisional workspace · Verification pending";
        const paragraph = document.createElement("p");
        paragraph.textContent = "Your institution application has been received. You can sign in to check this restricted workspace while the Academy verifies your organisation. Staff management, student records, course publishing and billing remain locked until approval.";
        copy.append(heading, paragraph);
        notice.append(icon, copy);
        welcome?.insertAdjacentElement("afterend", notice);

        document.querySelectorAll("#limits, .team-management, .services-grid, .module-grid").forEach(node => node.hidden = true);
        document.querySelectorAll(".section-heading").forEach(node => node.hidden = true);
        sidebar?.querySelectorAll("a").forEach(link => {
          const href = (link.getAttribute("href") || "").split("#")[0];
          if (!href.endsWith("dashboard.html")) link.hidden = true;
        });
        document.documentElement.dataset.institutionPortalReady = "true";
        document.documentElement.dataset.institutionPortalMode = "provisional";
        window.lucide?.createIcons();
        return;
      }

      const approved = profile.status === "active" && profile.active === true && profile.verified === true;
      if (!ALLOWED_ROLES.has(role) || !approved) {
        denyAccess(profile, user, "role_or_approval_check_failed");
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