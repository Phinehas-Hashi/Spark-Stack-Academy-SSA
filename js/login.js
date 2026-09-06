// ============================================
// SPARK STACK ACADEMY - login.js
// Production-ready auth flow with role recovery
// ============================================
import { auth, db } from "./firebase.js";
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, browserLocalPersistence, browserSessionPersistence, setPersistence, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberMe = document.getElementById("rememberMe");
const loginBtn = document.getElementById("loginBtn");
const googleLoginBtn = document.getElementById("googleLogin");
const loader = document.getElementById("authLoader");
const loaderText = document.getElementById("loaderText");
const toastContainer = document.getElementById("toastContainer");
const forgotPasswordBtn = document.getElementById("forgotPassword");
const resetModal = document.getElementById("resetModal");
const resetEmail = document.getElementById("resetEmail");
const sendResetBtn = document.getElementById("sendReset");
const cancelResetBtn = document.getElementById("cancelReset");

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const DASHBOARDS = {
    founder: "founder/dashboard.html",
    admin: "admin/dashboard.html",
    instructor: "instructor/dashboard.html",
    student: "student/dashboard.html"
};

function showLoader(message = "Signing you in...") {
    loader?.classList.add("active");
    if (loaderText) loaderText.textContent = message;
}

function hideLoader() {
    loader?.classList.remove("active");
}

function showToast(message, type = "success") {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(40px)";
        setTimeout(() => toast.remove(), 300);
    }, 7000);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function redirectByRole(role) {
    const dashboard = DASHBOARDS[role];
    if (dashboard) {
        window.location.href = dashboard;
        return;
    }
    hideLoader();
    showToast(`Account role is invalid: ${JSON.stringify(role)}. Contact the Founder.`, "error");
}

function disableButtons() {
    if (loginBtn) loginBtn.disabled = true;
    if (googleLoginBtn) googleLoginBtn.disabled = true;
}

function enableButtons() {
    if (loginBtn) loginBtn.disabled = false;
    if (googleLoginBtn) googleLoginBtn.disabled = false;
}

/**
 * Resolve the user's role safely.
 *
 * Primary source: users/{uid}.role
 * Recovery sources: students/{uid} or instructors/{uid}
 *
 * This fixes older accounts whose users document exists but was created
 * without a role. We never guess founder/admin from an arbitrary account.
 */
async function resolveUserProfile(user) {
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
        const userData = userSnap.data();

        if (userData.role && DASHBOARDS[userData.role]) {
            return { userRef, userData, recovered: false };
        }

        // Existing profile but missing/invalid role: recover only from a
        // dedicated role collection instead of blindly assigning a role.
        const studentSnap = await getDoc(doc(db, "students", user.uid));
        if (studentSnap.exists()) {
            const role = "student";
            await setDoc(userRef, {
                uid: user.uid,
                email: user.email || userData.email || "",
                role,
                active: userData.active !== false,
                lastLogin: serverTimestamp()
            }, { merge: true });

            return {
                userRef,
                userData: { ...userData, role },
                recovered: true
            };
        }

        const instructorSnap = await getDoc(doc(db, "instructors", user.uid));
        if (instructorSnap.exists()) {
            const instructorData = instructorSnap.data();
            if (instructorData.active === false) {
                return {
                    userRef,
                    userData: { ...userData, role: "instructor", active: false },
                    recovered: true
                };
            }

            const role = "instructor";
            await setDoc(userRef, {
                uid: user.uid,
                fullName: instructorData.name || userData.fullName || user.displayName || "",
                email: instructorData.email || user.email || userData.email || "",
                role,
                active: true,
                verified: instructorData.verified === true,
                lastLogin: serverTimestamp()
            }, { merge: true });

            return {
                userRef,
                userData: { ...userData, ...instructorData, role },
                recovered: true
            };
        }

        return { userRef, userData, recovered: false };
    }

    // Legacy/incomplete student account: recover from students/{uid}.
    const studentSnap = await getDoc(doc(db, "students", user.uid));
    if (studentSnap.exists()) {
        const studentData = studentSnap.data();
        const userData = {
            uid: user.uid,
            fullName: studentData.name || user.displayName || "Student",
            email: studentData.email || user.email || "",
            role: "student",
            active: true,
            verified: user.emailVerified,
            status: studentData.status || "Pending",
            createdAt: studentData.createdAt || serverTimestamp(),
            lastLogin: serverTimestamp()
        };

        await setDoc(userRef, userData, { merge: true });
        return { userRef, userData, recovered: true };
    }

    // Legacy/incomplete instructor account: recover from instructors/{uid}.
    const instructorSnap = await getDoc(doc(db, "instructors", user.uid));
    if (instructorSnap.exists()) {
        const instructorData = instructorSnap.data();
        const userData = {
            uid: user.uid,
            fullName: instructorData.name || user.displayName || "Instructor",
            email: instructorData.email || user.email || "",
            role: "instructor",
            active: instructorData.active !== false,
            verified: instructorData.verified === true,
            status: instructorData.status || "pending_review",
            createdAt: instructorData.createdAt || serverTimestamp(),
            lastLogin: serverTimestamp()
        };

        await setDoc(userRef, userData, { merge: true });
        return { userRef, userData, recovered: true };
    }

    return { userRef, userData: null, recovered: false };
}

document.querySelectorAll(".toggle-password").forEach(toggle => {
    toggle.addEventListener("click", () => {
        const input = document.getElementById(toggle.dataset.target);
        if (!input) return;
        if (input.type === "password") {
            input.type = "text";
            toggle.classList.remove("fa-eye");
            toggle.classList.add("fa-eye-slash");
        } else {
            input.type = "password";
            toggle.classList.remove("fa-eye-slash");
            toggle.classList.add("fa-eye");
        }
    });
});

if (rememberMe) {
    rememberMe.checked = localStorage.getItem("rememberMe") === "true";
    if (localStorage.getItem("savedEmail") && emailInput) {
        emailInput.value = localStorage.getItem("savedEmail");
    }
    rememberMe.addEventListener("change", () => {
        localStorage.setItem("rememberMe", rememberMe.checked);
        if (!rememberMe.checked) localStorage.removeItem("savedEmail");
    });
}

forgotPasswordBtn?.addEventListener("click", e => {
    e.preventDefault();
    if (resetEmail) resetEmail.value = emailInput?.value || "";
    resetModal?.classList.add("active");
    resetEmail?.focus();
});

cancelResetBtn?.addEventListener("click", () => resetModal?.classList.remove("active"));
resetModal?.addEventListener("click", e => {
    if (e.target === resetModal) resetModal.classList.remove("active");
});

sendResetBtn?.addEventListener("click", async () => {
    const email = resetEmail?.value.trim() || "";
    if (!email) return showToast("Enter your email address.", "warning");
    if (!isValidEmail(email)) return showToast("Enter a valid email address.", "error");

    try {
        showLoader("Sending password reset link...");
        await sendPasswordResetEmail(auth, email);
        hideLoader();
        resetModal?.classList.remove("active");
        showToast("Password reset link sent successfully.", "success");
    } catch (error) {
        hideLoader();
        console.error("[SSA AUTH] PASSWORD RESET FAILED", error);
        showToast(`Firebase: ${error.code || "unknown-error"}`, "error");
    }
});

loginForm?.addEventListener("submit", async e => {
    e.preventDefault();

    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value || "";

    if (!email || !password) return showToast("Please enter your email and password.", "warning");
    if (!isValidEmail(email)) return showToast("Please enter a valid email address.", "error");

    try {
        disableButtons();
        showLoader("Signing you in...");

        await setPersistence(
            auth,
            rememberMe?.checked ? browserLocalPersistence : browserSessionPersistence
        );

        if (rememberMe?.checked) localStorage.setItem("savedEmail", email);
        else localStorage.removeItem("savedEmail");

        console.log("[SSA AUTH] Login attempt", {
            projectId: auth.app.options.projectId,
            authDomain: auth.app.options.authDomain,
            email,
            passwordLength: password.length
        });

        const credential = await signInWithEmailAndPassword(auth, email, password);
        const user = credential.user;

        console.log("[SSA AUTH] Authentication successful", {
            uid: user.uid,
            email: user.email,
            emailVerified: user.emailVerified,
            providerData: user.providerData
        });

        const { userRef, userData, recovered } = await resolveUserProfile(user);

        if (!userData) {
            hideLoader();
            enableButtons();
            showToast("Your account exists, but no Spark Stack Academy profile was found. Please contact the Founder.", "error");
            console.error("[SSA AUTH] PROFILE MISSING", {
                uid: user.uid,
                email: user.email,
                projectId: auth.app.options.projectId
            });
            return;
        }

        console.log("[SSA AUTH] PROFILE RESOLVED", {
            documentPath: `users/${user.uid}`,
            role: userData.role || "<MISSING FIELD>",
            active: userData.active,
            recovered,
            projectId: auth.app.options.projectId
        });

        if (userData.active === false) {
            hideLoader();
            enableButtons();
            return showToast("This account has been disabled.", "error");
        }

        if (!DASHBOARDS[userData.role]) {
            hideLoader();
            enableButtons();
            showToast(`Account role is missing or invalid. UID=${user.uid}`, "error");
            return;
        }

        await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });

        showToast(`Welcome back, ${userData.fullName || "User"}!`, "success");
        setTimeout(() => redirectByRole(userData.role), 1200);
    } catch (error) {
        hideLoader();
        enableButtons();
        console.error("[SSA AUTH] LOGIN FAILED", error);
        console.error("[SSA AUTH] code:", error.code);
        console.error("[SSA AUTH] message:", error.message);
        console.error("[SSA AUTH] email:", email);
        console.error("[SSA AUTH] projectId:", auth.app.options.projectId);
        console.error("[SSA AUTH] authDomain:", auth.app.options.authDomain);
        showToast(`Firebase: ${error.code || "unknown-error"}`, "error");
    }
});

googleLoginBtn?.addEventListener("click", async () => {
    try {
        disableButtons();
        showLoader("Signing in with Google...");

        await setPersistence(
            auth,
            rememberMe?.checked ? browserLocalPersistence : browserSessionPersistence
        );

        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            await setDoc(userRef, {
                uid: user.uid,
                fullName: user.displayName || "Student",
                email: user.email || "",
                role: "student",
                profilePhoto: user.photoURL || "",
                bio: "",
                expertise: "",
                provider: "google",
                verified: user.emailVerified,
                active: true,
                createdAt: serverTimestamp(),
                lastLogin: serverTimestamp()
            });
        } else {
            const existing = userSnap.data();
            if (!existing.role) {
                const studentSnap = await getDoc(doc(db, "students", user.uid));
                if (studentSnap.exists()) {
                    await setDoc(userRef, { role: "student" }, { merge: true });
                }
            }
            await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true });
        }

        const data = (await getDoc(userRef)).data();
        if (!data?.role || !DASHBOARDS[data.role]) {
            hideLoader();
            enableButtons();
            return showToast("Google account profile has no valid role. Contact the Founder.", "error");
        }

        if (data.active === false) {
            hideLoader();
            enableButtons();
            return showToast("This account has been disabled.", "error");
        }

        showToast(`Welcome back, ${data.fullName || "User"}!`, "success");
        setTimeout(() => redirectByRole(data.role), 1200);
    } catch (error) {
        hideLoader();
        enableButtons();
        console.error("[SSA AUTH] GOOGLE LOGIN FAILED", error);
        showToast(`Firebase: ${error.code || "unknown-error"}`, "error");
    }
});

const scrollBtn = document.getElementById("scrollTopBtn");
if (scrollBtn) {
    window.addEventListener("scroll", () => {
        scrollBtn.classList.toggle("show", window.scrollY > 250);
    });
    scrollBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}

window.addEventListener("load", () => {
    hideLoader();
    emailInput?.focus();
});

document.addEventListener("keydown", e => {
    if (e.key === "Escape") resetModal?.classList.remove("active");
});

console.log("%cSpark Stack Academy Login — Auth Ready 🚀", "color:#0B2D5C;font-size:16px;font-weight:bold;");
