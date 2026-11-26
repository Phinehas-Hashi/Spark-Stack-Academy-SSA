// Spark Stack Academy — secure login and role routing
import { auth, db } from "./firebase.js";
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, browserLocalPersistence, browserSessionPersistence, setPersistence, sendPasswordResetEmail, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const loginForm = $("loginForm");
const emailInput = $("email");
const passwordInput = $("password");
const rememberMe = $("rememberMe");
const loginBtn = $("loginBtn");
const googleLoginBtn = $("googleLogin");
const loader = $("authLoader");
const loaderText = $("loaderText");
const toastContainer = $("toastContainer");
const forgotPasswordBtn = $("forgotPassword");
const resetModal = $("resetModal");
const resetEmail = $("resetEmail");
const sendResetBtn = $("sendReset");
const cancelResetBtn = $("cancelReset");
const scrollBtn = $("scrollTopBtn");

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

const DASHBOARDS = Object.freeze({
    founder: "founder/dashboard.html",
    admin: "admin/dashboard.html",
    instructor: "instructor/dashboard.html",
    institution: "institution/dashboard.html",
    institution_owner: "institution/dashboard.html",
    institution_admin: "institution/dashboard.html",
    student: "student/dashboard.html"
});

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
    toast.setAttribute("role", "status");
    toast.textContent = message;
    toastContainer.appendChild(toast);
    window.setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(24px)";
        window.setTimeout(() => toast.remove(), 300);
    }, 6000);
}
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function setButtonsDisabled(disabled) {
    if (loginBtn) loginBtn.disabled = disabled;
    if (googleLoginBtn) googleLoginBtn.disabled = disabled;
}
function getPersistence() {
    return rememberMe?.checked ? browserLocalPersistence : browserSessionPersistence;
}
function saveRememberedEmail(email) {
    try {
        if (rememberMe?.checked) {
            localStorage.setItem("rememberMe", "true");
            localStorage.setItem("savedEmail", email);
        } else {
            localStorage.setItem("rememberMe", "false");
            localStorage.removeItem("savedEmail");
        }
    } catch {
        console.warn("[SSA AUTH] Browser storage unavailable.");
    }
}
function redirectByRole(role) {
    const destination = DASHBOARDS[role];
    if (!destination) {
        hideLoader();
        setButtonsDisabled(false);
        showToast("This account does not have a supported Academy portal. Contact the Founder.", "error");
        return;
    }
    window.location.assign(destination);
}

/** Clear Firebase sessions that do not have approved portal access. */
async function rejectSession(message) {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("[SSA AUTH] Could not clear rejected session:", error.code || error.message);
    }
    hideLoader();
    setButtonsDisabled(false);
    showToast(message, "warning");
}

/**
 * Read the account's own user profile and protected Founder record.
 * Never create, repair, or elevate roles from the browser.
 *
 * Legacy recovery from students/{uid} and instructors/{uid} is deliberately
 * excluded: Firestore rules do not allow pending applicants to read those
 * collections. Incomplete legacy profiles require trusted staff repair.
 */
/**
 * Resolve the signed-in identity using the canonical Founder record first.
 * A users/{uid} document can never grant Founder privileges.
 */
async function resolveUserProfile(user) {
    const founderRef = doc(db, "founder", user.uid);
    const userRef = doc(db, "users", user.uid);

    let founderSnap;
    try {
        founderSnap = await getDoc(founderRef);
    } catch (error) {
        return {
            userRef,
            userData: null,
            source: "founder-read-error",
            failureCode: error?.code === "permission-denied"
                ? "FOUNDER_READ_PERMISSION_DENIED"
                : "FOUNDER_READ_FAILED",
            failureMessage: "We could not verify your Founder record. Access has been stopped for security.",
            diagnostics: {
                founderDocExists: "unknown",
                lookupError: error?.code || "unknown",
                projectId: auth.app.options.projectId
            }
        };
    }

    const founderData = founderSnap.exists() ? founderSnap.data() : null;
    const founderDiagnostics = {
        founderDocExists: founderSnap.exists(),
        founderRole: typeof founderData?.role === "string" ? founderData.role : "missing-or-non-string",
        founderRoleType: typeof founderData?.role,
        founderRoleMatches: founderData?.role === "founder",
        founderStatus: typeof founderData?.status === "string" ? founderData.status : "missing-or-non-string",
        founderStatusType: typeof founderData?.status,
        founderActive: typeof founderData?.active === "boolean" ? founderData.active : "missing-or-non-boolean",
        founderActiveType: typeof founderData?.active,
        founderVerified: typeof founderData?.verified === "boolean" ? founderData.verified : "missing-or-non-boolean",
        founderVerifiedType: typeof founderData?.verified,
        projectId: auth.app.options.projectId
    };

    if (founderData) {
        if (founderData.role !== "founder") {
            return {
                userRef,
                userData: null,
                source: "founder-role-mismatch",
                failureCode: "FOUNDER_ROLE_MISMATCH",
                failureMessage: "The Founder record does not contain the required Founder role. Contact Academy support.",
                diagnostics: founderDiagnostics
            };
        }

        // Founder approval requires explicit trusted values. No default-true
        // behavior is used for active or verified.
        const active = founderData.active === true && founderData.status === "active";
        const verified = founderData.verified === true;
        const failureCode = founderData.active !== true
            ? "FOUNDER_ACTIVE_NOT_TRUE"
            : founderData.status !== "active"
                ? "FOUNDER_STATUS_NOT_ACTIVE"
                : founderData.verified !== true
                    ? "FOUNDER_NOT_VERIFIED"
                    : null;

        return {
            userRef,
            source: "founder",
            diagnostics: founderDiagnostics,
            failureCode,
            failureMessage: failureCode
                ? "The Founder record is present but does not meet the active and verified access requirements."
                : null,
            userData: {
                uid: user.uid,
                fullName: founderData.fullName || founderData.name || user.displayName || "Founder",
                email: founderData.email || user.email || "",
                role: "founder",
                status: founderData.status,
                active,
                verified
            }
        };
    }

    // Non-Founder accounts are resolved from their own users/{uid} record.
    let userSnap;
    try {
        userSnap = await getDoc(userRef);
    } catch (error) {
        return {
            userRef,
            userData: null,
            source: "user-profile-read-error",
            failureCode: error?.code === "permission-denied"
                ? "USER_PROFILE_READ_PERMISSION_DENIED"
                : "USER_PROFILE_READ_FAILED",
            failureMessage: "We could not read your Academy profile. Access has been stopped for security.",
            diagnostics: {
                founderDocExists: false,
                usersDocExists: "unknown",
                lookupError: error?.code || "unknown",
                projectId: auth.app.options.projectId
            }
        };
    }

    if (!userSnap.exists()) {
        return {
            userRef,
            userData: null,
            source: "missing",
            failureCode: "ACADEMY_PROFILE_MISSING",
            failureMessage: "No Academy profile is linked to this account.",
            diagnostics: {
                founderDocExists: false,
                usersDocExists: false,
                projectId: auth.app.options.projectId
            }
        };
    }

    const userData = userSnap.data();
    const diagnostics = {
        ...founderDiagnostics,
        usersDocExists: true,
        usersRole: typeof userData.role === "string" ? userData.role : "missing",
        usersActive: typeof userData.active === "boolean" ? userData.active : "missing-or-non-boolean",
        usersActiveType: typeof userData.active,
        usersStatus: typeof userData.status === "string" ? userData.status : "missing-or-non-string",
        usersStatusType: typeof userData.status
    };

    // A stale users/{uid} Founder role is not an authorization source.
    if (userData.role === "founder") {
        return {
            userRef,
            userData: { ...userData, active: false },
            source: "invalid-founder-fallback",
            failureCode: "FOUNDER_DOC_MISSING",
            failureMessage: "The Founder record is missing. A users profile alone cannot authorize Founder access.",
            diagnostics
        };
    }

    return { userRef, userData, source: "users", diagnostics };
}

function getAccessDecision(profile) {
    const data = profile.userData;
    if (!data) {
        return {
            allowed: false,
            message: profile.failureMessage || "No Academy profile is linked to this account. Complete the application process or contact Academy support."
        };
    }

    const role = data.role;
    if (!DASHBOARDS[role]) {
        return { allowed: false, message: "Your Academy profile has no valid portal role. Contact the Founder for assistance." };
    }

    // Founder checks run before the generic disabled-account check so a
    // Founder rejection cannot be confused with a student/staff suspension.
    if (role === "founder") {
        return data.active === true && data.status === "active" && data.verified === true
            ? { allowed: true }
            : { allowed: false, message: profile.failureMessage || "The Founder account is not active and verified." };
    }

    if (data.active === false) {
        return { allowed: false, message: "This account has been disabled. Contact Academy support." };
    }

    if (role === "student") {
        return data.status === "active"
            ? { allowed: true }
            : { allowed: false, message: "Your student application is awaiting admission approval. Portal access begins after approval." };
    }

    if (role === "instructor") {
        return data.status === "active" && data.active === true && data.verified === true
            ? { allowed: true }
            : { allowed: false, message: "Your instructor application is still under review. Portal access begins after approval and verification." };
    }

    if (["institution", "institution_owner", "institution_admin"].includes(role)) {
        return data.status === "active" && data.active === true && data.verified === true && Boolean(data.institutionId)
            ? { allowed: true }
            : { allowed: false, message: "Your institution account is not yet active and verified. Contact Academy support." };
    }

    // Matches the current Firestore isAdmin() rule.
    if (role === "admin" && data.active === true && data.status === "active") {
        return { allowed: true };
    }

    return { allowed: false, message: "This account is not authorised to access an Academy portal." };
}

async function finishSignIn(user) {
    const profile = await resolveUserProfile(user);
    const decision = getAccessDecision(profile);

    console.info("[SSA AUTH] Profile check", {
        source: profile.source,
        role: profile.userData?.role || "missing",
        accessGranted: decision.allowed,
        failureCode: profile.failureCode || null,
        diagnostics: profile.diagnostics || null,
        projectId: auth.app.options.projectId
    });

    if (!decision.allowed) {
        const diagnostic = profile.diagnostics || {};
        const diagnosticDetails = [
            `source=${profile.source || "unknown"}`,
            `founderDocument=${diagnostic.founderDocExists === true ? "found" : diagnostic.founderDocExists === false ? "missing" : "unreadable"}`,
            `founderRole=${JSON.stringify(diagnostic.founderRole ?? "unknown")}`,
            `roleMatch=${String(diagnostic.founderRoleMatches ?? "unknown")}`,
            `status=${JSON.stringify(diagnostic.founderStatus ?? "unknown")} (type=${diagnostic.founderStatusType || "unknown"})`,
            `active=${JSON.stringify(diagnostic.founderActive ?? "unknown")} (type=${diagnostic.founderActiveType || "unknown"})`,
            `verified=${JSON.stringify(diagnostic.founderVerified ?? "unknown")} (type=${diagnostic.founderVerifiedType || "unknown"})`,
            `usersDocument=${String(diagnostic.usersDocExists ?? "not-checked")}`,
            `project=${diagnostic.projectId || auth.app.options.projectId}`,
            diagnostic.lookupError ? `readError=${diagnostic.lookupError}` : null
        ].filter(Boolean).join("; ");

        const code = profile.failureCode || "ACCESS_CHECK_REJECTED";
        await rejectSession(`${decision.message} [${code}; ${diagnosticDetails}]`);
        return;
    }

    // lastLogin is an optional audit field; do not block valid sign-in if
    // this non-essential update is temporarily unavailable.
    if (profile.source === "users") {
        try {
            await setDoc(profile.userRef, { lastLogin: serverTimestamp() }, { merge: true });
        } catch (error) {
            console.warn("[SSA AUTH] Could not update lastLogin:", error.code || error.message);
        }
    }

    showToast(`Welcome back, ${profile.userData.fullName || "User"}!`, "success");
    window.setTimeout(() => redirectByRole(profile.userData.role), 700);
}

// Password visibility controls support mouse, touch and keyboard activation.
document.querySelectorAll(".toggle-password").forEach(toggle => {
    const togglePassword = () => {
        const input = $(toggle.dataset.target);
        if (!input) return;
        const revealing = input.type === "password";
        input.type = revealing ? "text" : "password";
        toggle.classList.toggle("fa-eye", !revealing);
        toggle.classList.toggle("fa-eye-slash", revealing);
        toggle.setAttribute("aria-label", revealing ? "Hide password" : "Show password");
        toggle.setAttribute("aria-pressed", String(revealing));
    };
    toggle.addEventListener("click", togglePassword);
    toggle.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            togglePassword();
        }
    });
});

// Restore the optional remembered email safely.
try {
    if (rememberMe) rememberMe.checked = localStorage.getItem("rememberMe") === "true";
    const savedEmail = localStorage.getItem("savedEmail");
    if (savedEmail && emailInput) emailInput.value = savedEmail;
} catch {
    console.warn("[SSA AUTH] Browser storage unavailable.");
}
rememberMe?.addEventListener("change", () => {
    if (!rememberMe.checked) {
        try {
            localStorage.removeItem("savedEmail");
            localStorage.setItem("rememberMe", "false");
        } catch {
            console.warn("[SSA AUTH] Could not update remember-me preference.");
        }
    }
});

forgotPasswordBtn?.addEventListener("click", event => {
    event.preventDefault();
    if (resetEmail) resetEmail.value = emailInput?.value.trim() || "";
    resetModal?.classList.add("active");
    resetEmail?.focus();
});
function closeResetModal() {
    resetModal?.classList.remove("active");
}
cancelResetBtn?.addEventListener("click", closeResetModal);
resetModal?.addEventListener("click", event => {
    if (event.target === resetModal) closeResetModal();
});

sendResetBtn?.addEventListener("click", async () => {
    const email = resetEmail?.value.trim() || "";
    if (!email) return showToast("Enter your email address.", "warning");
    if (!isValidEmail(email)) return showToast("Enter a valid email address.", "error");

    sendResetBtn.disabled = true;
    showLoader("Sending password reset link...");
    try {
        await sendPasswordResetEmail(auth, email);
        closeResetModal();
        showToast("If an account exists for that address, a password reset email will be sent.", "success");
    } catch (error) {
        console.error("[SSA AUTH] PASSWORD RESET FAILED", error.code || error.message);
        showToast("Unable to send the reset email. Check the address and try again.", "error");
    } finally {
        hideLoader();
        sendResetBtn.disabled = false;
    }
});

loginForm?.addEventListener("submit", async event => {
    event.preventDefault();
    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value || "";
    if (!email || !password) return showToast("Enter your email address and password.", "warning");
    if (!isValidEmail(email)) return showToast("Enter a valid email address.", "error");

    setButtonsDisabled(true);
    showLoader("Signing you in...");
    try {
        await setPersistence(auth, getPersistence());
        saveRememberedEmail(email);
        const credential = await signInWithEmailAndPassword(auth, email, password);
        await finishSignIn(credential.user);
    } catch (error) {
        console.error("[SSA AUTH] LOGIN FAILED", error.code || error.message);
        hideLoader();
        setButtonsDisabled(false);
        const messages = {
            "auth/invalid-credential": "The email or password is incorrect.",
            "auth/user-not-found": "The email or password is incorrect.",
            "auth/wrong-password": "The email or password is incorrect.",
            "auth/too-many-requests": "Too many attempts. Wait a while and try again.",
            "auth/network-request-failed": "Network error. Check your connection and try again."
        };
        showToast(messages[error.code] || "Unable to sign in. Please try again.", "error");
    }
});

googleLoginBtn?.addEventListener("click", async () => {
    setButtonsDisabled(true);
    showLoader("Verifying your Google account...");
    try {
        await setPersistence(auth, getPersistence());
        const result = await signInWithPopup(auth, provider);
        // New applicants must use signup.html so their selected application
        // type and approval workflow are respected. Login never auto-registers.
        await finishSignIn(result.user);
    } catch (error) {
        console.error("[SSA AUTH] GOOGLE LOGIN FAILED", error.code || error.message);
        hideLoader();
        setButtonsDisabled(false);
        if (error.code === "auth/popup-closed-by-user") {
            showToast("Google sign-in was cancelled.", "warning");
        } else if (error.code === "auth/account-exists-with-different-credential") {
            showToast("This email uses another sign-in method. Use your original method.", "error");
        } else {
            showToast("Unable to sign in with Google. Please try again.", "error");
        }
    }
});

if (scrollBtn) {
    window.addEventListener("scroll", () => scrollBtn.classList.toggle("show", window.scrollY > 250));
    scrollBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
}
window.addEventListener("load", () => {
    hideLoader();
    emailInput?.focus();
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeResetModal();
});

console.info("[SSA AUTH] Login module initialised.");
