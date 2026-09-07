// ==========================================
// FOUNDER OS AUTH GUARD
// Firebase Auth + Firestore only
// ==========================================

import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const isActiveFounder = profile => profile?.role === "founder" && (profile.status === "active" || profile.active === true);

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    window.currentUser = user;

    try {
        const founderRef = doc(db, "founder", user.uid);
        const founderSnap = await getDoc(founderRef);

        if (!founderSnap.exists() || !isActiveFounder(founderSnap.data())) {
            console.error("Founder profile is missing or inactive: founder/" + user.uid);
            window.location.href = "../login.html";
            return;
        }

        const founderData = founderSnap.data();

        window.currentFounder = {
            ...founderData,
            uid: founderData.uid || user.uid,
            email: founderData.email || user.email || "",
            fullName: founderData.fullName || founderData.name || user.displayName || "Founder"
        };

        sessionStorage.setItem("founderProfile", JSON.stringify(window.currentFounder));
        document.dispatchEvent(new Event("founderLoaded"));
        console.log("✅ Founder authenticated", user.uid);
    } catch (error) {
        console.error("Founder authentication error:", error);
        window.location.href = "../login.html";
    }
});
