import { auth, db } from "../../js/firebase.js";
import {
  EmailAuthProvider, GoogleAuthProvider, TotpMultiFactorGenerator,
  multiFactor, reauthenticateWithCredential, reauthenticateWithPopup,
  updatePassword, signOut, sendEmailVerification, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const notify = (message, type = "success") => {
  const toast = $("securityToast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = "security-toast show" + (type === "error" ? " error" : "");
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove("show"), 4200);
};
let pendingTotpSecret = null;
let founderUser = null;

function setButton(id, disabled, label) {
  const button = $(id);
  if (!button) return;
  button.disabled = disabled;
  if (label) button.textContent = label;
}

async function verifyFounder(user) {
  if (!user) throw new Error("No authenticated account found.");
  const snap = await getDoc(doc(db, "founder", user.uid));
  if (!snap.exists()) throw new Error("Founder profile does not exist.");
  const profile = snap.data();
  if (profile.role !== "founder" || profile.status !== "active" || profile.active === false || profile.verified === false) {
    throw new Error("Founder account is not fully active and verified.");
  }
  return profile;
}

async function reauthenticateFounder(password) {
  const user = auth.currentUser;
  if (!user) throw new Error("Founder session expired. Sign in again.");
  const providers = user.providerData.map(item => item.providerId);
  if (providers.includes("password")) {
    if (!password) throw new Error("Enter your current password to continue.");
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } else if (providers.includes("google.com")) {
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
  } else {
    throw new Error("This sign-in provider needs a supported reauthentication flow. Sign in again before continuing.");
  }
}

function renderIdentity(user) {
  const factors = multiFactor(user).enrolledFactors;
  const hasTotp = factors.some(factor => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  $("emailVerifyNotice").hidden = user.emailVerified;
  $("mfaMetric").textContent = hasTotp ? "Enabled" : "Not enabled";
  $("mfaMetricNote").textContent = hasTotp ? "Authenticator factor enrolled" : "Founder setup required";
  $("emailMetric").textContent = user.emailVerified ? "Verified" : "Unverified";
  $("emailMetricNote").textContent = user.email || "No email available";
  $("sessionEmail").textContent = user.email || "—";
  $("sessionProvider").textContent = user.providerData.map(item => item.providerId).join(", ") || "—";
  $("sessionVerified").textContent = user.emailVerified ? "Verified" : "Not verified";
  $("sessionRefresh").textContent = user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : "Unavailable";
  $("sessionMetric").textContent = "Authenticated";
  $("sessionMetricNote").textContent = user.metadata.lastSignInTime ? "Signed in " + new Date(user.metadata.lastSignInTime).toLocaleString() : "Current browser session";
  $("securityPosture").textContent = hasTotp && user.emailVerified ? "MFA protected" : "Action required";
  $("mfaStatusTitle").textContent = hasTotp ? "Authenticator protection is active" : "Authenticator protection is not enabled";
  $("mfaStatusText").textContent = hasTotp ? "Firebase Authentication has an enrolled TOTP factor for this account." : "Set up a TOTP authenticator to add a second sign-in factor.";
  $("mfaStatusBadge").textContent = hasTotp ? "ENABLED" : "NOT ENABLED";
  $("mfaStatusBadge").classList.toggle("enabled", hasTotp);
  $("mfaSetup").hidden = true;
  $("mfaReauth").hidden = hasTotp;
  $("mfaEnabled").hidden = !hasTotp;
  $("startMfaBtn").hidden = hasTotp;
}

async function startTotpEnrollment() {
  if (!founderUser.emailVerified) return notify("Verify your founder email before enabling MFA.", "error");
  setButton("startMfaBtn", true, "Preparing…");
  try {
    await reauthenticateFounder($("reauthPassword")?.value || "");
    const session = await multiFactor(founderUser).getSession();
    pendingTotpSecret = await TotpMultiFactorGenerator.generateSecret(session);
    $("totpSecret").value = pendingTotpSecret.secretKey;
    $("mfaSetup").hidden = false;
    $("mfaReauth").hidden = true;
    $("totpCode").focus();
    notify("Add the setup key to your authenticator app, then enter its current code.");
  } catch (error) {
    console.error("[Founder Security] MFA setup failed:", error);
    notify(error.message || "Could not start authenticator setup.", "error");
    setButton("startMfaBtn", false, "Set up authenticator");
  }
}

async function confirmTotpEnrollment() {
  const code = String($("totpCode")?.value || "").replace(/\s/g, "");
  if (!pendingTotpSecret) return notify("Start authenticator setup first.", "error");
  if (!/^\d{6}$/.test(code)) return notify("Enter the six-digit authenticator code.", "error");
  setButton("verifyTotpBtn", true, "Verifying…");
  try {
    const assertion = TotpMultiFactorGenerator.assertionForEnrollment(pendingTotpSecret, code);
    await multiFactor(founderUser).enroll(assertion, "Founder authenticator");
    pendingTotpSecret = null;
    await founderUser.reload();
    founderUser = auth.currentUser;
    renderIdentity(founderUser);
    await loadRecentSecurityEvents(founderUser);
    $("totpSecret").value = "";
    $("totpCode").value = "";
    notify("Authenticator enrolled successfully. Future sign-ins will require the second factor.");
  } catch (error) {
    console.error("[Founder Security] TOTP verification failed:", error);
    notify(error.code === "auth/invalid-verification-code" ? "That code is incorrect or expired. Try the newest code." : (error.message || "Authenticator verification failed."), "error");
  } finally {
    setButton("verifyTotpBtn", false, "Verify and enable");
  }
}

async function changeFounderPassword() {
  const current = $("currentPassword")?.value || "";
  const next = $("newPassword")?.value || "";
  const confirm = $("confirmPassword")?.value || "";
  if (next.length < 12) return notify("Use a password with at least 12 characters.", "error");
  if (next !== confirm) return notify("The new passwords do not match.", "error");
  if (next === current) return notify("Choose a password different from the current one.", "error");
  setButton("changePasswordBtn", true, "Updating…");
  try {
    await reauthenticateFounder(current);
    await updatePassword(founderUser, next);
    ["currentPassword", "newPassword", "confirmPassword"].forEach(id => $(id).value = "");
    notify("Founder password updated.");
  } catch (error) {
    console.error("[Founder Security] Password update failed:", error);
    notify(error.message || "Password update failed.", "error");
  } finally {
    setButton("changePasswordBtn", false, "Update password");
  }
}

async function signOutDevice() {
  const confirmed = await (window.ssaConfirm?.("Sign out of this Founder Portal session?", {
    title: "End current session", confirmText: "Sign out", cancelText: "Stay signed in", tone: "danger"
  }) ?? Promise.resolve(false));
  if (!confirmed) return;
  await signOut(auth);
  sessionStorage.removeItem("founderProfile");
  window.location.replace("../login.html");
}

async function loadRecentSecurityEvents(user) {
  const container = $("securityActivity");
  const base = String(window.SSA_SECURITY_API_BASE || "").replace(/\/$/, "");
  if (!base) {
    container.innerHTML = '<p class="security-empty">Edge incident collection is not configured yet. Deploy the security Worker and set its URL in js/security-config.js.</p>';
    return;
  }
  try {
    const token = await user.getIdToken();
    const response = await fetch(`${base}/v1/incidents`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) throw new Error(response.status === 403 ? "Founder access was not accepted by the incident service." : "Incident service is unavailable.");
    const payload = await response.json();
    const events = Array.isArray(payload.events) ? payload.events.slice(0, 8) : [];
    container.replaceChildren();
    if (!events.length) {
      const empty = document.createElement("p"); empty.className = "security-empty"; empty.textContent = "No events have been recorded by the edge collector."; container.appendChild(empty); return;
    }
    events.forEach(event => {
      const row = document.createElement("article"); row.className = "security-event-row";
      const title = document.createElement("strong"); title.textContent = String(event.event_type || "Security event").replaceAll("_", " ");
      const meta = document.createElement("small");
      const place = [event.city, event.region, event.country].filter(Boolean).join(", ") || "Location unavailable";
      const actor = event.actor_email || event.actor_uid || "Unattributed";
      const time = event.occurred_at ? new Date(event.occurred_at).toLocaleString() : "Time unavailable";
      meta.textContent = `${time} · ${place} · ${actor}`;
      const detail = document.createElement("span"); detail.textContent = `${String(event.severity || "info").toUpperCase()} · ${event.source || "unknown source"} · ${event.portal || "unknown portal"}`;
      row.append(title, meta, detail); container.appendChild(row);
    });
  } catch (error) {
    console.warn("[Founder Security] Incident feed unavailable:", error);
    container.innerHTML = '<p class="security-empty">Could not load the incident feed. Confirm the Worker deployment, origin allowlist and D1 binding.</p>';
  }
}

async function initialize() {
  try {
    founderUser = auth.currentUser;
    if (!founderUser) throw new Error("Founder session not found. Sign in again.");
    await verifyFounder(founderUser);
    renderIdentity(founderUser);
  } catch (error) {
    console.error("[Founder Security] Initialization failed:", error);
    notify(error.message || "Unable to load founder security.", "error");
    if (!auth.currentUser) window.setTimeout(() => window.location.replace("../login.html"), 1200);
  }
}

$("startMfaBtn")?.addEventListener("click", startTotpEnrollment);
$("sendVerifyEmailBtn")?.addEventListener("click", async () => { try { await sendEmailVerification(founderUser); notify("Verification email sent. Check your inbox."); } catch (error) { notify(error.message || "Could not send verification email.", "error"); } });
$("verifyTotpBtn")?.addEventListener("click", confirmTotpEnrollment);
$("copySecretBtn")?.addEventListener("click", async () => {
  if (!$("totpSecret")?.value) return;
  try { await navigator.clipboard.writeText($("totpSecret").value); notify("Setup key copied. Keep it private."); }
  catch { notify("Clipboard access unavailable. Select and copy the key manually.", "error"); }
});
$("changePasswordBtn")?.addEventListener("click", changeFounderPassword);
$("signOutBtn")?.addEventListener("click", signOutDevice);
$("totpCode")?.addEventListener("input", event => { event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6); });
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.replace("../login.html"); return; }
  founderUser = user;
  await initialize();
});