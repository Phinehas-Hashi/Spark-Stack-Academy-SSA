// ==========================================
// FOUNDER OS AUTH GUARD
// Firebase Auth + Firestore
// ==========================================

import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    window.currentUser = user;

    try {
        const userSnap = await getDoc(doc(db, "users", user.uid));

        if (!userSnap.exists()) {
            console.error("Founder profile not found: users/" + user.uid);
            window.location.href = "../login.html";
            return;
        }

        const founderData = userSnap.data();

        // Founder OS is founder-only. Admins use the Admin Console.
        if (founderData.role !== "founder" || founderData.active === false) {
            window.location.href = founderData.role === "admin"
                ? "../admin/dashboard.html"
                : "../login.html";
            return;
        }

        window.currentFounder = {
            ...founderData,
            uid: founderData.uid || user.uid,
            email: founderData.email || user.email || "",
            fullName: founderData.fullName || user.displayName || "Founder"
        };

        sessionStorage.setItem("founderProfile", JSON.stringify(window.currentFounder));
        document.dispatchEvent(new Event("founderLoaded"));
        console.log("✅ Founder authenticated", user.uid);
    } catch (error) {
        console.error("Founder authentication error:", error);
        window.location.href = "../login.html";
    }
});
