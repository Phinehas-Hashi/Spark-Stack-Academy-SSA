import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const DASHBOARDS = {
    founder: "/founder/dashboard.html",
    admin: "/admin/dashboard.html",
    instructor: "/instructor/dashboard.html",
    student: "/student/dashboard.html"
};

function showGuardMessage(message, type="error") {
    if (window.showSSAModal) return window.showSSAModal({ title: type === "pending" ? "Admission pending" : "Access denied", message, type, confirmText: "Continue" });
    if (window.ssaConfirm) return window.ssaConfirm(message, { title: type === "pending" ? "Admission pending" : "Access denied", confirmText: "Continue", cancelText: "" });
    console.warn(message);
}

export function protectPage(requiredRole) {
    onAuthStateChanged(auth, async user => {
        if (!user) { window.location.href="/login.html"; return; }
        try {
            const userSnap=await getDoc(doc(db,"users",user.uid));
            if(!userSnap.exists()){ window.location.href="/login.html"; return; }
            const userData=userSnap.data();
            if(userData.role!==requiredRole){
                await showGuardMessage("You do not have permission to access this portal.");
                window.location.href=DASHBOARDS[userData.role]||"/login.html";
                return;
            }
            if(requiredRole==="student" && userData.status!=="active"){
                await showGuardMessage("Your account was created successfully, but you must be approved by the Founder before you can access the Student Portal.","pending");
                window.location.href="/login.html";
                return;
            }
            if(requiredRole==="instructor" && userData.status && userData.status!=="active"){
                await showGuardMessage("Your instructor account is still waiting for approval.","pending");
                window.location.href="/login.html";
                return;
            }
            console.log("Authorized:",userData.role);
        } catch(error) {
            console.error("Guard error:",error);
            window.location.href="/login.html";
        }
    });
}
