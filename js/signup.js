import { auth, db } from "./firebase.js";
import {
    createUserWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile,
    signOut,
    deleteUser,
    getAdditionalUserInfo
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    doc,
    setDoc,
    collection,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const signupForm = $("signupForm");
const nameInput = $("name");
const emailInput = $("email");
const passwordInput = $("password");
const confirmPasswordInput = $("confirmPassword");
const roleSelect = $("role");
const bioInput = $("bio");
const expertiseInput = $("expertise");
const termsCheckbox = $("terms");
const signupBtn = $("signupBtn");
const googleSignupBtn = $("googleSignup");
const instructorFields = $("instructorFields");
const toastContainer = $("toastContainer");
const loader = $("authLoader");
const loaderText = $("loaderText");
const strengthBar = $("strengthBar");
const strengthText = $("strengthText");

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

function showLoader(message) {
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
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(40px)";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function strongPassword(value) {
    return value.length >= 8
        && /[A-Z]/.test(value)
        && /[a-z]/.test(value)
        && /\d/.test(value);
}

function setButtons(disabled) {
    if (signupBtn) signupBtn.disabled = disabled;
    if (googleSignupBtn) googleSignupBtn.disabled = disabled;
}

function validateCommonFields() {
    if (!termsCheckbox?.checked) {
        showToast("Please accept the Terms & Conditions and Privacy Policy.", "warning");
        return false;
    }
    return true;
}

async function createStudentApplication({ uid, fullName, email, providerName = "email" }) {
    const batch = writeBatch(db);
    const userRef = doc(db, "users", uid);
    const studentRef = doc(db, "students", uid);
    const applicationRef = doc(collection(db, "applications"));
    const now = serverTimestamp();

    batch.set(userRef, {
        uid,
        fullName,
        email,
        role: "student",
        bio: "",
        expertise: "",
        profilePhoto: "",
        active: true,
        verified: false,
        status: "pending_admission",
        provider: providerName,
        createdAt: now,
        lastLogin: now
    });

    batch.set(studentRef, {
        uid,
        name: fullName,
        email,
        role: "student",
        status: "Pending",
        onboardingStatus: "awaiting_admission",
        admissionNumber: "Pending",
        level: 1,
        xp: 0,
        streak: 0,
        badges: [],
        stats: {
            coursesEnrolled: 0,
            lessonsCompleted: 0,
            progress: 0,
            certificates: 0
        },
        createdAt: now
    });

    batch.set(applicationRef, {
        studentUid: uid,
        name: fullName,
        email,
        phone: "",
        course: $("course")?.value?.trim() || "",
        role: "student",
        status: "Pending",
        source: "signup",
        createdAt: now
    });

    await batch.commit();
}

async function createInstructorProfile({ uid, fullName, email, bio, expertise }) {
    await setDoc(doc(db, "users", uid), {
        uid,
        fullName,
        email,
        role: "instructor",
        bio,
        expertise,
        profilePhoto: "",
        active: true,
        verified: false,
        status: "pending_review",
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
    });
}

async function rollbackNewAuthUser(user) {
    if (!user) return false;
    try {
        await deleteUser(user);
        return true;
    } catch (error) {
        console.error("Signup rollback failed:", error.code || error.message);
        return false;
    }
}

function finishPendingApplication(message) {
    try {
        signOut(auth).catch(error => {
            console.warn("Post-signup sign-out failed:", error.code || error.message);
        });
    } catch (error) {
        console.warn("Post-signup sign-out failed:", error);
    }
    hideLoader();
    setButtons(false);
    showToast(message, "success");
    setTimeout(() => {
        window.location.href = "login.html";
    }, 1800);
}

signupForm?.addEventListener("submit", async event => {
    event.preventDefault();

    const fullName = nameInput?.value.trim() || "";
    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value || "";
    const confirmPassword = confirmPasswordInput?.value || "";
    const role = roleSelect?.value || "";
    const bio = bioInput?.value.trim() || "";
    const expertise = expertiseInput?.value.trim() || "";

    if (!fullName) return showToast("Enter your full name.", "error");
    if (!validEmail(email)) return showToast("Enter a valid email address.", "error");
    if (!strongPassword(password)) {
        return showToast("Use at least 8 characters with uppercase, lowercase and a number.", "error");
    }
    if (password !== confirmPassword) return showToast("Passwords do not match.", "error");
    if (!["student", "instructor"].includes(role)) return showToast("Select a valid account type.", "error");
    if (!validateCommonFields()) return;

    let createdUser = null;
    let applicationCreated = false;

    try {
        setButtons(true);
        showLoader(role === "student" ? "Submitting your student application..." : "Creating your instructor application...");

        const credential = await createUserWithEmailAndPassword(auth, email, password);
        createdUser = credential.user;
        await updateProfile(createdUser, { displayName: fullName });

        if (role === "student") {
            await createStudentApplication({
                uid: createdUser.uid,
                fullName,
                email
            });
            applicationCreated = true;
            finishPendingApplication(
                "Student application submitted. Portal access begins after admission approval."
            );
            return;
        }

        await createInstructorProfile({
            uid: createdUser.uid,
            fullName,
            email,
            bio,
            expertise
        });
        applicationCreated = true;
        finishPendingApplication(
            "Instructor application submitted. Portal access begins after review and verification."
        );
    } catch (error) {
        console.error("Signup failed:", error.code || error.message);

        if (createdUser && !applicationCreated) {
            const rolledBack = await rollbackNewAuthUser(createdUser);
            if (!rolledBack) {
                try { await signOut(auth); } catch (_) {}
                hideLoader();
                setButtons(false);
                showToast(
                    "Your account was created but profile setup did not finish. Contact Academy support before trying again.",
                    "error"
                );
                return;
            }
        }

        hideLoader();
        setButtons(false);
        showToast(
            error.code === "auth/email-already-in-use"
                ? "An account already exists with this email. Please log in instead."
                : error.code === "auth/weak-password"
                    ? "Choose a stronger password."
                    : error.message || "Unable to complete signup. Please try again.",
            "error"
        );
    }
});

googleSignupBtn?.addEventListener("click", async () => {
    if (roleSelect?.value !== "student") {
        showToast("Google signup is currently available for Student accounts only. Select Student or use the Instructor form.", "warning");
        return;
    }
    if (!validateCommonFields()) return;

    let newGoogleUser = null;
    let applicationCreated = false;

    try {
        setButtons(true);
        showLoader("Connecting your Google account...");

        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const accountInfo = getAdditionalUserInfo(result);

        if (!accountInfo?.isNewUser) {
            await signOut(auth);
            hideLoader();
            setButtons(false);
            showToast("A Google account already exists. Please use Login instead.", "warning");
            return;
        }

        newGoogleUser = user;
        const fullName = user.displayName || "Student";
        const email = user.email || "";

        await createStudentApplication({
            uid: user.uid,
            fullName,
            email,
            providerName: "google"
        });
        applicationCreated = true;

        finishPendingApplication(
            "Student application submitted. Portal access begins after admission approval."
        );
    } catch (error) {
        console.error("Google signup failed:", error.code || error.message);

        if (newGoogleUser && !applicationCreated) {
            const rolledBack = await rollbackNewAuthUser(newGoogleUser);
            if (!rolledBack) {
                try { await signOut(auth); } catch (_) {}
                hideLoader();
                setButtons(false);
                showToast(
                    "Google authentication succeeded but profile setup did not finish. Contact Academy support before trying again.",
                    "error"
                );
                return;
            }
        }

        hideLoader();
        setButtons(false);
        showToast(
            error.code === "auth/popup-closed-by-user"
                ? "Google signup was cancelled."
                : error.message || "Google signup failed. Please try again.",
            "error"
        );
    }
});

document.querySelectorAll(".toggle-password").forEach(toggle => {
    const reveal = () => {
        const target = $(toggle.dataset.target);
        if (!target) return;
        const visible = target.type === "password";
        target.type = visible ? "text" : "password";
        toggle.classList.toggle("fa-eye", !visible);
        toggle.classList.toggle("fa-eye-slash", visible);
        toggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    };

    toggle.addEventListener("click", reveal);
    toggle.setAttribute("role", "button");
    toggle.setAttribute("tabindex", "0");
    toggle.setAttribute("aria-label", "Show password");
    toggle.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            reveal();
        }
    });
});

roleSelect?.addEventListener("change", () => {
    const instructor = roleSelect.value === "instructor";
    if (instructorFields) {
        instructorFields.style.display = instructor ? "block" : "none";
        instructorFields.setAttribute("aria-hidden", String(!instructor));
    }
    if (!instructor) {
        if (bioInput) bioInput.value = "";
        if (expertiseInput) expertiseInput.value = "";
    }
});

passwordInput?.addEventListener("input", () => {
    const value = passwordInput.value;
    const score = [
        value.length >= 8,
        /[A-Z]/.test(value),
        /[a-z]/.test(value),
        /\d/.test(value)
    ].filter(Boolean).length;

    if (strengthBar) {
        strengthBar.style.width = `${score * 25}%`;
        strengthBar.setAttribute("aria-valuenow", String(score * 25));
    }
    if (strengthText) {
        strengthText.textContent = ["Enter password", "Weak", "Fair", "Good", "Strong"][score];
    }
});

roleSelect?.dispatchEvent(new Event("change"));

window.addEventListener("load", () => {
    hideLoader();
    nameInput?.focus();
});

console.log("Spark Stack Academy signup flow ready.");
