// ============================================
// SPARK STACK ACADEMY
// AUTH GUARD SYSTEM
// ============================================

import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DASHBOARDS = {
    founder: "/founder/dashboard.html",
    admin: "/admin/dashboard.html",
    instructor: "/instructor/dashboard.html",
    student: "/student/dashboard.html"
};

export function protectPage(requiredRole) {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = "/login.html";
            return;
        }

        try {
            const userSnap = await getDoc(doc(db, "users", user.uid));

            if (!userSnap.exists()) {
                window.location.href = "/login.html";
                return;
            }

            const userData = userSnap.data();

            if (userData.active === false || userData.role !== requiredRole) {
                alert("Access denied.");
                window.location.href = DASHBOARDS[userData.role] || "/login.html";
                return;
            }

            console.log("Authorized:", userData.role);
        } catch (error) {
            console.error("Guard error:", error);
            window.location.href = "/login.html";
        }
    });
}
