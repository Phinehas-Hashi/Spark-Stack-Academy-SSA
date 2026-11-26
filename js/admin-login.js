import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
  setPersistence, browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDocFromServer } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const form = $("privilegedLoginForm");
const emailInput = $("email");
const passwordInput = $("password");
const remember = $("rememberMe");
const button = $("loginButton");
const message = $("message");

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `message show ${type}`;
}
function setBusy(busy) {
  button.disabled = busy;
  button.querySelector("span").textContent = busy ? "Verifying access..." : "Verify and continue";
}
function friendlyAuthError(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "Email or password is incorrect.";
  }
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a few minutes and try again.";
  if (code.includes("network-request-failed")) return "Network connection failed. Check your connection and retry.";
  if (code.includes("user-disabled")) return "This Firebase Authentication account is disabled.";
  return "Sign-in could not be completed. Check your details and try again.";
}

// The canonical Founder record is checked first. If it exists, it is
// authoritative: a stale users/{uid} document cannot change its role.
async function resolvePrivilegedAccess(uid) {
  const founderRef = doc(db, "founder", uid);
  // Bypass any local Firestore cache so Founder authorization is evaluated
  // against the current server document.
  const founderSnapshot = await getDocFromServer(founderRef);
  if (founderSnapshot.exists()) {
    const founder = founderSnapshot.data();
    const checks = [
      ["role", founder.role, "founder"],
      ["active", founder.active, true],
      ["status", founder.status, "active"],
      ["verified", founder.verified, true]
    ];
    const failed = checks.filter(([, actual, expected]) => actual !== expected);
    if (failed.length) {
      // The user has authenticated successfully. Report only the exact
      // authorization fields that failed; never expose the full document.
      const details = failed.map(([field, actual, expected]) => {
        const actualType = actual === null ? "null" : typeof actual;
        const actualValue = actual === undefined ? "<missing>" : JSON.stringify(actual);
        return `${field}: expected ${JSON.stringify(expected)}, received ${actualValue} (${actualType})`;
      }).join("; ");
      console.error("[SSA FOUNDER PROFILE CHECK]", {
        path: founderSnapshot.ref.path,
        exists: founderSnapshot.exists(),
        fromCache: founderSnapshot.metadata.fromCache,
        fieldNames: Object.keys(founder),
        details
      });
      return {
        allowed:false,
        reason:`Founder profile verification failed: ${details}. Correct these exact fields in founder/{your-auth-uid}, then retry.`
      };
    }
    return { allowed:true, role:"founder", destination:"founder/dashboard.html" };
  }

  const userSnapshot = await getDoc(doc(db, "users", uid));
  if (!userSnapshot.exists()) {
    return { allowed:false, reason:"No authorized admin or Founder profile is linked to this account." };
  }
  const profile = userSnapshot.data();
  if (profile.role !== "admin" || profile.active !== true || profile.status !== "active") {
    return { allowed:false, reason:"This account is not an active Academy administrator or Founder." };
  }
  return { allowed:true, role:"admin", destination:"admin/dashboard.html" };
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) {
    showMessage("Enter your email address and password.");
    return;
  }

  setBusy(true);
  message.className = "message";
  try {
    await setPersistence(auth, remember.checked ? browserLocalPersistence : browserSessionPersistence);
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const access = await resolvePrivilegedAccess(credential.user.uid);
    if (!access.allowed) {
      await signOut(auth);
      showMessage(access.reason);
      setBusy(false);
      return;
    }
    showMessage("Access verified. Opening your portal...", "success");
    window.location.replace(access.destination);
  } catch (error) {
    console.error("[SSA PRIVILEGED LOGIN]", error?.code || error?.message || "unknown");
    try { if (auth.currentUser) await signOut(auth); } catch {}
    if (error?.code === "permission-denied" || error?.code === "firestore/permission-denied") {
      showMessage("Your profile could not be verified because Firestore denied the profile read. No portal access was granted.");
    } else {
      showMessage(friendlyAuthError(error));
    }
    setBusy(false);
  }
});

$("togglePassword").addEventListener("click", () => {
  const visible = passwordInput.type === "password";
  passwordInput.type = visible ? "text" : "password";
  $("togglePassword").textContent = visible ? "Hide" : "Show";
  $("togglePassword").setAttribute("aria-label", visible ? "Hide password" : "Show password");
});

$("forgotPassword").addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) {
    showMessage("Enter your email address first, then select Forgot password.");
    emailInput.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    showMessage("If the account exists, Firebase has sent a password reset email.", "success");
  } catch (error) {
    console.error("[SSA PASSWORD RESET]", error?.code || "unknown");
    showMessage("Password reset could not be started. Check the email address and try again.");
  }
});

try {
  if (localStorage.getItem("rememberMe") === "true") {
    emailInput.value = localStorage.getItem("savedEmail") || "";
    remember.checked = true;
  }
} catch {}
remember.addEventListener("change", () => {
  try {
    localStorage.setItem("rememberMe", String(remember.checked));
    if (!remember.checked) localStorage.removeItem("savedEmail");
  } catch {}
});
form.addEventListener("submit", () => {
  try {
    if (remember.checked) {
      localStorage.setItem("rememberMe", "true");
      localStorage.setItem("savedEmail", emailInput.value.trim());
    }
  } catch {}
});
