import { auth, db } from "../../js/firebase.js";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const securityRef = doc(db, "settings", "security");
const $ = id => document.getElementById(id);
const notify = (message, type = "success") => window.showFounderToast?.(message, type) ?? alert(message);

async function loadSecuritySettings() {
  try {
    const snapshot = await getDoc(securityRef);
    const data = snapshot.exists() ? snapshot.data() : {};
    ["twoFactor", "loginAlerts", "trustedDevices", "maintenanceMode"].forEach(id => {
      if ($(id)) $(id).checked = Boolean(data[id]);
    });
  } catch (error) {
    console.error("Load Security Error:", error);
    notify("Could not load security settings.", "error");
  }
}

async function saveSecuritySettings() {
  try {
    await setDoc(securityRef, {
      twoFactor: $("twoFactor")?.checked ?? false,
      loginAlerts: $("loginAlerts")?.checked ?? false,
      trustedDevices: $("trustedDevices")?.checked ?? false,
      maintenanceMode: $("maintenanceMode")?.checked ?? false,
      updatedAt: serverTimestamp()
    }, { merge: true });
    notify("Security settings saved successfully.");
  } catch (error) {
    console.error("Save Security Error:", error);
    notify("Failed to save security settings.", "error");
  }
}

async function changePassword() {
  const user = auth.currentUser;
  const current = $("currentPassword")?.value.trim();
  const next = $("newPassword")?.value || "";
  const confirmPassword = $("confirmPassword")?.value || "";

  if (!user?.email) return notify("No authenticated founder session found.", "error");
  if (!current || !next || !confirmPassword) return notify("Fill all password fields.", "error");
  if (next.length < 8) return notify("Password must be at least 8 characters.", "error");
  if (next !== confirmPassword) return notify("Passwords do not match.", "error");

  const btn = $("changePasswordBtn");
  if (btn) { btn.disabled = true; btn.textContent = "Updating..."; }
  try {
    const credential = EmailAuthProvider.credential(user.email, current);
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, next);
    $("currentPassword").value = "";
    $("newPassword").value = "";
    $("confirmPassword").value = "";
    notify("Password updated successfully.");
  } catch (error) {
    console.error("Password update failed:", error);
    notify(error.code === "auth/wrong-password" ? "Current password is incorrect." : (error.message || "Password update failed."), "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "🔑 Change Password"; }
  }
}

async function signOutCurrentDevice() {
  if (!confirm("Sign out from this device?")) return;
  try {
    await signOut(auth);
    window.location.href = "../login.html";
  } catch (error) {
    console.error("Logout failed:", error);
    notify("Logout failed.", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadSecuritySettings();
  $("saveSecurityBtn")?.addEventListener("click", saveSecuritySettings);
  $("changePasswordBtn")?.addEventListener("click", changePassword);
  $("logoutAllBtn")?.addEventListener("click", signOutCurrentDevice);
});
