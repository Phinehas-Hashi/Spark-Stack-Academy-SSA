import { auth, db } from "./firebase.js";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, updateProfile, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, setDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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
function hideLoader() { loader?.classList.remove("active"); }
function showToast(message, type = "success") {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateX(40px)"; setTimeout(() => toast.remove(), 300); }, 3500);
}
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function strongPassword(v) { return v.length >= 8 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v); }
function setButtons(disabled) { if (signupBtn) signupBtn.disabled = disabled; if (googleSignupBtn) googleSignupBtn.disabled = disabled; }

async function createStudentApplication({ uid, fullName, email, providerName = "email" }) {
    await setDoc(doc(db, "users", uid), {
        uid, fullName, email, role: "student", bio: "", expertise: "", profilePhoto: "",
        active: true, verified: false, status: "pending_admission", provider: providerName,
        createdAt: serverTimestamp(), lastLogin: serverTimestamp()
    }, { merge: true });

    await setDoc(doc(db, "students", uid), {
        uid, name: fullName, email, role: "student", status: "Pending",
        onboardingStatus: "awaiting_admission", admissionNumber: "Pending",
        level: 1, xp: 0, streak: 0, badges: [],
        stats: { coursesEnrolled: 0, lessonsCompleted: 0, progress: 0, certificates: 0 },
        createdAt: serverTimestamp()
    }, { merge: true });

    await addDoc(collection(db, "applications"), {
        studentUid: uid,
        name: fullName,
        email,
        phone: "",
        course: $("course")?.value?.trim() || "",
        role: "student",
        status: "Pending",
        source: "signup",
        createdAt: serverTimestamp()
    });
}

async function createInstructorProfile({ uid, fullName, email, bio, expertise }) {
    await setDoc(doc(db, "users", uid), {
        uid, fullName, email, role: "instructor", bio, expertise, profilePhoto: "",
        active: true, verified: false, status: "pending_review", createdAt: serverTimestamp(), lastLogin: serverTimestamp()
    }, { merge: true });
}

signupForm?.addEventListener("submit", async e => {
    e.preventDefault();
    const fullName = nameInput?.value.trim() || "";
    const email = emailInput?.value.trim() || "";
    const password = passwordInput?.value || "";
    const confirmPassword = confirmPasswordInput?.value || "";
    const role = roleSelect?.value || "";
    const bio = bioInput?.value.trim() || "";
    const expertise = expertiseInput?.value.trim() || "";

    if (!fullName) return showToast("Enter your full name", "error");
    if (!validEmail(email)) return showToast("Enter a valid email", "error");
    if (!strongPassword(password)) return showToast("Password must contain uppercase, lowercase, number and 8 characters", "error");
    if (password !== confirmPassword) return showToast("Passwords do not match", "error");
    if (!role) return showToast("Select account type", "error");
    if (!termsCheckbox?.checked) return showToast("Accept Terms & Conditions", "warning");

    try {
        setButtons(true);
        showLoader(role === "student" ? "Creating your application..." : "Creating account...");
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const user = credential.user;
        await updateProfile(user, { displayName: fullName });

        if (role === "student") {
            await createStudentApplication({ uid: user.uid, fullName, email });
            await signOut(auth);
            hideLoader();
            showToast("Application submitted! Wait for Founder approval before accessing your student portal.", "success");
            setTimeout(() => { window.location.href = "login.html"; }, 1800);
            return;
        }

        await createInstructorProfile({ uid: user.uid, fullName, email, bio, expertise });
        await signOut(auth);
        hideLoader();
        showToast("Instructor application created. Please wait for review.", "success");
        setTimeout(() => { window.location.href = "login.html"; }, 1800);
    } catch (error) {
        console.error("Signup Error:", error);
        hideLoader();
        setButtons(false);
        showToast(error.code === "auth/email-already-in-use" ? "An account already exists with this email." : (error.message || "Unable to create account."), "error");
    }
});

googleSignupBtn?.addEventListener("click", async () => {
    try {
        setButtons(true);
        showLoader("Connecting your Google account...");
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        const fullName = user.displayName || "Student";
        const email = user.email || "";
        await createStudentApplication({ uid: user.uid, fullName, email, providerName: "google" });
        await signOut(auth);
        hideLoader();
        showToast("Application submitted! Your account is waiting for Founder approval.", "success");
        setTimeout(() => { window.location.href = "login.html"; }, 1800);
    } catch (error) {
        console.error("Google Signup Error:", error);
        hideLoader();
        setButtons(false);
        showToast(error.message || "Google signup failed.", "error");
    }
});

document.querySelectorAll(".toggle-password").forEach(toggle => toggle.addEventListener("click", () => {
    const target = $(toggle.dataset.target);
    if (!target) return;
    target.type = target.type === "password" ? "text" : "password";
    toggle.classList.toggle("fa-eye");
    toggle.classList.toggle("fa-eye-slash");
}));

roleSelect?.addEventListener("change", () => {
    const instructor = roleSelect.value === "instructor";
    if (instructorFields) instructorFields.style.display = instructor ? "block" : "none";
    if (!instructor) { if (bioInput) bioInput.value = ""; if (expertiseInput) expertiseInput.value = ""; }
});

passwordInput?.addEventListener("input", () => {
    const value = passwordInput.value;
    const score = [value.length >= 8, /[A-Z]/.test(value), /[a-z]/.test(value), /\d/.test(value)].filter(Boolean).length;
    if (strengthBar) strengthBar.style.width = `${score * 25}%`;
    if (strengthText) strengthText.textContent = ["Enter password", "Weak", "Fair", "Good", "Strong"][score];
});

window.addEventListener("load", () => { hideLoader(); nameInput?.focus(); });
console.log("🚀 Spark Stack Academy Signup — Admission Flow Ready");