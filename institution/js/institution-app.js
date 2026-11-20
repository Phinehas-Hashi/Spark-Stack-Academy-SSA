import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LOGIN_PAGE = "../login.html";
const ALLOWED_ROLES = new Set(["institution", "institution_owner", "institution_admin"]);
const sidebar = document.getElementById("institutionSidebar");
const topbar = document.getElementById("institutionTopbar");
const overlay = document.getElementById("sidebarOverlay");

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
      const role = String(profile.role || "").trim().toLowerCase();
      const approved = profile.status === "active" && profile.active === true && profile.verified === true;
      if (!ALLOWED_ROLES.has(role) || !approved) {
        denyAccess();
        return;
      }
      const name = profile.institutionName || profile.organizationName || profile.displayName || profile.name || user.displayName || "Your institution";
      setInstitutionName(name);
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