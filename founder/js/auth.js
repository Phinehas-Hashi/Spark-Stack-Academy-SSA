// ==========================================
// FOUNDER OS AUTH GUARD
// Firebase Auth + Firestore only
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
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            console.error("Founder profile not found: users/" + user.uid);
            window.location.href = "../login.html";
            return;
        }

        const founderData = userSnap.data();

        if (founderData.role !== "founder" && founderData.role !== "admin") {
            window.location.href = "../dashboard.html";
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
