import { auth, db } from "./firebase.js";
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, browserLocalPersistence, browserSessionPersistence, setPersistence, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const loginForm = $("loginForm"), emailInput = $("email"), passwordInput = $("password"), rememberMe = $("rememberMe"), loginBtn = $("loginBtn"), googleLoginBtn = $("googleLogin");
const loader = $("authLoader"), loaderText = $("loaderText"), toastContainer = $("toastContainer");
const forgotPasswordBtn = $("forgotPassword"), resetModal = $("resetModal"), resetEmail = $("resetEmail"), sendResetBtn = $("sendReset"), cancelResetBtn = $("cancelReset");
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });
const ROOT = new URL("../", import.meta.url).href;
const DASHBOARDS = { founder: "founder/dashboard.html", admin: "admin/dashboard.html", instructor: "instructor/dashboard.html", student: "student/dashboard.html" };
const redirectByRole = role => DASHBOARDS[role] ? (window.location.href = new URL(DASHBOARDS[role], ROOT).href) : null;
const validEmail = email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function showLoader(message) { loader?.classList.add("active"); if (loaderText) loaderText.textContent = message; }
function hideLoader() { loader?.classList.remove("active"); }
function buttons(disabled) { if (loginBtn) loginBtn.disabled = disabled; if (googleLoginBtn) googleLoginBtn.disabled = disabled; }
function toast(message, type = "success") { const el = document.createElement("div"); el.className = `toast ${type}`; el.textContent = message; toastContainer?.appendChild(el); setTimeout(() => el.remove(), 5000); }
function pendingMessage() { toast("Your account exists, but admission approval is still required before portal access.", "warning"); }

function handleProfile(userData) {
  if (userData.active === false) throw new Error("This account has been disabled.");
  if (!userData.role) throw new Error("Your account profile is missing its role. Please contact the Founder.");
  if (userData.role === "student" && userData.status !== "active") { pendingMessage(); return false; }
  if (userData.role === "instructor" && userData.status && userData.status !== "active") { toast("Your instructor account is awaiting approval.", "warning"); return false; }
  if (!DASHBOARDS[userData.role]) throw new Error(`Unsupported account role: ${userData.role}`);
  return true;
}

function isActiveFounder(profile) {
  return profile?.role === "founder" && (profile.status === "active" || profile.active === true);
}

async function signInUser(user) {
  // Founder identity is authoritative. Check it before the shared users profile because
  // an older founder account may also have a users/{uid} document with student metadata.
  const founderRef = doc(db, "founder", user.uid);
  const founderSnap = await getDoc(founderRef);
  if (founderSnap.exists()) {
    const founder = founderSnap.data();
    if (founder.role !== "founder") throw new Error("Founder profile is invalid. Please contact the Founder.");
    if (!isActiveFounder(founder)) throw new Error("Your founder account is not active. Please contact the Founder.");
    toast(`Welcome back, ${founder.name || founder.fullName || user.displayName || "Founder"}!`);
    setTimeout(() => redirectByRole("founder"), 700);
    return;
  }

  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    if (!handleProfile(data)) { await signOut(auth); return; }
    await updateDoc(ref, { lastLogin: serverTimestamp() });
    toast(`Welcome back, ${data.fullName || data.displayName || "User"}!`);
    setTimeout(() => redirectByRole(data.role), 700);
    return;
  }

  const instructorSnap = await getDoc(doc(db, "instructors", user.uid));
  if (instructorSnap.exists()) {
    const instructor = instructorSnap.data();
    await setDoc(ref, { uid: user.uid, fullName: instructor.name || user.displayName || "", email: instructor.email || user.email || "", role: "instructor", status: instructor.status || "pending_review", active: instructor.active !== false, verified: instructor.verified === true, createdAt: instructor.createdAt || serverTimestamp(), lastLogin: serverTimestamp() }, { merge: true });
    toast("Your instructor profile is awaiting approval.", "warning");
    await signOut(auth);
    return;
  }
  throw new Error("No Spark Stack Academy profile exists for this account. Please complete registration first.");
}

loginForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const email = emailInput?.value.trim() || "", password = passwordInput?.value || "";
  if (!validEmail(email)) return toast("Please enter a valid email address.", "error");
  if (!password) return toast("Please enter your password.", "warning");
  try {
    buttons(true); showLoader("Signing you in...");
    await setPersistence(auth, rememberMe?.checked ? browserLocalPersistence : browserSessionPersistence);
    if (rememberMe?.checked) localStorage.setItem("savedEmail", email); else localStorage.removeItem("savedEmail");
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await signInUser(credential.user);
    hideLoader();
  } catch (error) {
    hideLoader(); buttons(false); console.error("Login failed:", error);
    toast(`Firebase: ${error.code || error.message || "Unable to sign in"}`, "error");
  }
});

googleLoginBtn?.addEventListener("click", async () => {
  try {
    buttons(true); showLoader("Signing in with Google...");
    await setPersistence(auth, rememberMe?.checked ? browserLocalPersistence : browserSessionPersistence);
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const founderSnap = await getDoc(doc(db, "founder", user.uid));
    if (founderSnap.exists()) {
      const founder = founderSnap.data();
      if (founder.role !== "founder" || !isActiveFounder(founder)) throw new Error("Your founder account is not active. Please contact the Founder.");
      toast(`Welcome back, ${founder.name || founder.fullName || user.displayName || "Founder"}!`);
      setTimeout(() => redirectByRole("founder"), 700);
      hideLoader();
      return;
    }
    const ref = doc(db, "users", user.uid);
    const existing = await getDoc(ref);
    if (!existing.exists()) {
      await setDoc(ref, { uid: user.uid, fullName: user.displayName || "", email: user.email || "", role: "student", status: "Pending", profilePhoto: user.photoURL || "", provider: "google", verified: user.emailVerified, active: true, createdAt: serverTimestamp(), lastLogin: serverTimestamp() });
      await setDoc(doc(db, "students", user.uid), { uid: user.uid, name: user.displayName || "", email: user.email || "", role: "student", status: "Pending", onboardingStatus: "awaiting_admission", admissionNumber: "Pending", level: 1, xp: 0, streak: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      toast("Google account created. Your admission is now awaiting approval.", "warning");
      await signOut(auth); hideLoader(); buttons(false); return;
    }
    await signInUser(user);
    hideLoader();
  } catch (error) {
    hideLoader(); buttons(false); console.error("Google login failed:", error); toast(`Firebase: ${error.code || error.message || "Unable to sign in with Google"}`, "error");
  }
});

forgotPasswordBtn?.addEventListener("click", event => { event.preventDefault(); if (resetEmail) resetEmail.value = emailInput?.value || ""; resetModal?.classList.add("active"); resetEmail?.focus(); });
cancelResetBtn?.addEventListener("click", () => resetModal?.classList.remove("active"));
resetModal?.addEventListener("click", event => { if (event.target === resetModal) resetModal.classList.remove("active"); });
sendResetBtn?.addEventListener("click", async () => { const email = resetEmail?.value.trim() || ""; if (!validEmail(email)) return toast("Enter a valid email address.", "error"); try { showLoader("Sending password reset link..."); await sendPasswordResetEmail(auth, email); hideLoader(); resetModal?.classList.remove("active"); toast("Password reset link sent successfully."); } catch (error) { hideLoader(); toast(`Firebase: ${error.code || "Unable to send reset link"}`, "error"); } });

document.querySelectorAll(".toggle-password").forEach(toggle => toggle.addEventListener("click", () => { const input = document.getElementById(toggle.dataset.target); if (!input) return; input.type = input.type === "password" ? "text" : "password"; }));
if (rememberMe) rememberMe.checked = localStorage.getItem("rememberMe") === "true";
if (emailInput && localStorage.getItem("savedEmail")) emailInput.value = localStorage.getItem("savedEmail");
rememberMe?.addEventListener("change", () => { localStorage.setItem("rememberMe", rememberMe.checked); if (!rememberMe.checked) localStorage.removeItem("savedEmail"); });
window.addEventListener("load", hideLoader);
