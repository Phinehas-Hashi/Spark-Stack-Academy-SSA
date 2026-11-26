import { auth, db } from "../js/firebase.js";
import {
  EmailAuthProvider, GoogleAuthProvider, reauthenticateWithCredential,
  reauthenticateWithPopup, updatePassword, signOut, sendEmailVerification,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
let founderUser = null;

function notify(message, type = "success") {
  const toast = $("securityToast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = "security-toast show" + (type === "error" ? " error" : "");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 4200);
}

async function verifyFounder(user) {
  if (!user) throw new Error("No authenticated account found.");
  const snap = await getDoc(doc(db, "founder", user.uid));
  if (!snap.exists()) throw new Error("Founder profile does not exist.");
  const p = snap.data();
  if (p.role !== "founder" || p.status !== "active" || p.active === false || p.verified === false) {
    throw new Error("Founder account is not fully active and verified.");
  }
  return p;
}

async function reauthenticate(password) {
  const user = auth.currentUser;
  if (!user) throw new Error("Founder session expired. Sign in again.");
  const providers = user.providerData.map(x => x.providerId);
  if (providers.includes("password")) {
    if (!password) throw new Error("Enter your current password.");
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } else if (providers.includes("google.com")) {
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
  } else {
    throw new Error("Sign in again using your account provider before changing credentials.");
  }
}

function render(user, profile) {
  $("emailVerifyNotice").hidden = user.emailVerified;
  $("identityMetric").textContent = profile.status === "active" && profile.active !== false ? "Active" : "Review required";
  $("identityMetricNote").textContent = "Founder account status";
  $("emailMetric").textContent = user.emailVerified ? "Verified" : "Not verified";
  $("emailMetricNote").textContent = user.email || "No email available";
  $("sessionEmail").textContent = user.email || "—";
  $("sessionProvider").textContent = user.providerData.map(x => x.providerId).join(", ") || "—";
  $("sessionVerified").textContent = user.emailVerified ? "Verified" : "Not verified";
  $("sessionRefresh").textContent = user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : "Unavailable";
  $("sessionMetric").textContent = "Authenticated";
  $("sessionMetricNote").textContent = "Current browser session";
  $("securityPosture").textContent = "Founder identity checks active";
}

async function changePassword() {
  const current = $("currentPassword").value;
  const next = $("newPassword").value;
  const confirm = $("confirmPassword").value;
  if (next.length < 12) return notify("Use a password with at least 12 characters.", "error");
  if (next !== confirm) return notify("The new passwords do not match.", "error");
  if (next === current) return notify("Choose a different password.", "error");
  const button = $("changePasswordBtn");
  button.disabled = true;
  try {
    await reauthenticate(current);
    await updatePassword(founderUser, next);
    ["currentPassword", "newPassword", "confirmPassword"].forEach(id => $(id).value = "");
    notify("Founder password updated.");
  } catch (error) {
    notify(error.message || "Password update failed.", "error");
  } finally {
    button.disabled = false;
  }
}

$("sendVerifyEmailBtn")?.addEventListener("click", async () => {
  try { await sendEmailVerification(founderUser); notify("Verification email sent."); }
  catch (error) { notify(error.message || "Could not send verification email.", "error"); }
});
$("refreshEmailBtn")?.addEventListener("click", async () => {
  try {
    await founderUser.reload();
    founderUser = auth.currentUser;
    render(founderUser, await verifyFounder(founderUser));
    notify(founderUser.emailVerified ? "Email verified." : "Email is not verified yet.", founderUser.emailVerified ? "success" : "error");
  } catch (error) { notify(error.message || "Could not refresh account status.", "error"); }
});
$("changePasswordBtn")?.addEventListener("click", changePassword);
$("signOutBtn")?.addEventListener("click", async () => {
  await signOut(auth);
  sessionStorage.removeItem("founderProfile");
  location.replace("../login.html");
});

onAuthStateChanged(auth, async user => {
  if (!user) { location.replace("../login.html"); return; }
  founderUser = user;
  try { render(user, await verifyFounder(user)); }
  catch (error) { console.error("[Founder Security]", error); notify(error.message, "error"); }
});
