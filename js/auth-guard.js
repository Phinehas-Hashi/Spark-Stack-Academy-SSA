import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ROOT = new URL("../", import.meta.url).href;
const DASHBOARDS = {
  founder: new URL("founder/dashboard.html", ROOT).href,
  admin: new URL("admin/dashboard.html", ROOT).href,
  instructor: new URL("instructor/dashboard.html", ROOT).href,
  student: new URL("student/dashboard.html", ROOT).href
};
const LOGIN = new URL("login.html", ROOT).href;

function showGuardMessage(message, type = "error") {
  if (window.showSSAModal) return window.showSSAModal({ title: type === "pending" ? "Admission pending" : "Access denied", message, type, confirmText: "Continue" });
  if (window.ssaConfirm) return window.ssaConfirm(message, { title: type === "pending" ? "Admission pending" : "Access denied", confirmText: "Continue", cancelText: "" });
  console.warn(message);
}

export function protectPage(requiredRole) {
  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = LOGIN; return; }
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (!userSnap.exists()) { window.location.href = LOGIN; return; }
      const userData = userSnap.data();
      if (userData.role !== requiredRole) {
        await showGuardMessage("You do not have permission to access this portal.");
        window.location.href = DASHBOARDS[userData.role] || LOGIN;
        return;
      }
      if (requiredRole === "student" && userData.status !== "active") {
        await showGuardMessage("Your account is awaiting admission approval.", "pending");
        window.location.href = LOGIN;
        return;
      }
      if (requiredRole === "instructor" && userData.status && userData.status !== "active") {
        await showGuardMessage("Your instructor account is still waiting for approval.", "pending");
        window.location.href = LOGIN;
        return;
      }
      console.log("Authorized:", userData.role);
    } catch (error) {
      console.error("Guard error:", error);
      window.location.href = LOGIN;
    }
  });
}
