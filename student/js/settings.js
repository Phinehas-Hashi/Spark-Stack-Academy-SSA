// Spark Stack Academy — Student Settings
import { auth, db } from "../../js/firebase.js";
import {
    onAuthStateChanged, updatePassword, signOut, sendEmailVerification
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    doc, getDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
let preferencesReady = false;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("../login.html");
        return;
    }
    currentUser = user;
    await loadSettings(user);
    initializeActions();
});

async function loadSettings(user) {
    try {
        const [studentSnapshot, settingsSnapshot] = await Promise.all([
            getDoc(doc(db, "students", user.uid)),
            getDoc(doc(db, "studentSettings", user.uid))
        ]);
        const student = studentSnapshot.exists() ? studentSnapshot.data() : {};
        const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {};

        setValue("settingName", student.name || student.fullName || student.studentName || user.displayName || "");
        setValue("settingEmail", user.email || "");
        setValue("settingPhone", student.phone || student.phoneNumber || "");
        setValue("settingAdmission", student.admissionNumber || student.admissionNo || "Not assigned");

        const notifications = settings.notifications || {};
        setChecked("notifyAnnouncements", notifications.announcements !== false);
        setChecked("notifyCourses", notifications.courses !== false);
        setChecked("notifyAssignments", notifications.assignments !== false);
        setChecked("notifyPayments", notifications.payments !== false);
        setChecked("notifyMessages", notifications.messages !== false);

        const learning = settings.learning || {};
        setChecked("rememberLesson", learning.rememberLesson !== false);
        setChecked("learningReminders", learning.reminders !== false);
        setChecked("captions", learning.captions === true);

        const premium = student.premium === true || student.subscriptionStatus === "active";
        setText("premiumPlan", premium ? "Premium Student" : "Free Student");
        renderVerificationStatus(user);
        preferencesReady = true;
    } catch (error) {
        console.error("Settings load failed:", error);
        setText("accountSaveStatus", "Some settings could not be loaded. Refresh the page before changing preferences.");
        setText("securityStatus", "Security details could not be loaded.");
    }
}

function initializeActions() {
    document.getElementById("accountSettingsForm")?.addEventListener("submit", (event) => {
        event.preventDefault();
        saveAccount();
    });
    document.getElementById("changePasswordBtn")?.addEventListener("click", changePassword);
    document.getElementById("verifyEmailBtn")?.addEventListener("click", sendVerification);
    document.getElementById("signOutBtn")?.addEventListener("click", logout);
    document.getElementById("deleteAccountBtn")?.addEventListener("click", requestDeletion);

    document.querySelectorAll(".toggle-row input").forEach((input) => {
        input.addEventListener("change", () => {
            if (input.id.startsWith("notify")) savePreferences("notificationSaveStatus");
            else savePreferences("learningSaveStatus");
        });
    });
}

async function saveAccount() {
    if (!currentUser) return;
    const name = getValue("settingName").trim();
    const phone = getValue("settingPhone").trim();
    if (name.length < 2 || name.length > 100) {
        setText("accountSaveStatus", "Enter a name between 2 and 100 characters.");
        return;
    }
    if (phone.length > 30) {
        setText("accountSaveStatus", "Phone number is too long.");
        return;
    }

    const button = document.getElementById("saveAccountBtn");
    if (button) button.disabled = true;
    setText("accountSaveStatus", "Saving your student record…");
    try {
        await setDoc(doc(db, "students", currentUser.uid), {
            name,
            phone,
            updatedAt: serverTimestamp()
        }, { merge: true });
        setText("accountSaveStatus", "Your student contact details have been saved.");
    } catch (error) {
        console.error("Account update failed:", error);
        setText("accountSaveStatus", error.code === "permission-denied"
            ? "The Academy currently does not allow this profile update. Contact support."
            : "Could not save your changes. Check your connection and try again.");
    } finally {
        if (button) button.disabled = false;
    }
}

async function savePreferences(statusId) {
    if (!currentUser || !preferencesReady) return;
    setText(statusId, "Saving preferences…");
    try {
        await setDoc(doc(db, "studentSettings", currentUser.uid), {
            notifications: {
                announcements: isChecked("notifyAnnouncements"),
                courses: isChecked("notifyCourses"),
                assignments: isChecked("notifyAssignments"),
                payments: isChecked("notifyPayments"),
                messages: isChecked("notifyMessages")
            },
            learning: {
                rememberLesson: isChecked("rememberLesson"),
                reminders: isChecked("learningReminders"),
                captions: isChecked("captions")
            },
            updatedAt: serverTimestamp()
        }, { merge: true });
        setText(statusId, "Preferences saved to your student settings.");
    } catch (error) {
        console.error("Preference save failed:", error);
        setText(statusId, "Could not save this preference. Check your connection and try again.");
    }
}

async function sendVerification() {
    if (!currentUser) return;
    if (currentUser.emailVerified) {
        setText("securityStatus", "Your email address is already verified.");
        return;
    }
    try {
        await sendEmailVerification(currentUser);
        setText("securityStatus", "Verification email sent. Check your inbox and spam folder.");
    } catch (error) {
        console.error("Verification email failed:", error);
        setText("securityStatus", error.code === "auth/too-many-requests"
            ? "Too many attempts. Wait before requesting another email."
            : "Could not send the verification email. Try again later.");
    }
}

function renderVerificationStatus(user) {
    const verified = Boolean(user.emailVerified);
    setText("emailVerificationStatus", verified ? "Your email address is verified." : "Your email address is not verified.");
    const button = document.getElementById("verifyEmailBtn");
    if (button) {
        button.disabled = verified;
        if (verified) button.textContent = "Verified";
    }
}

async function changePassword() {
    if (!currentUser) return;
    const hasPasswordProvider = currentUser.providerData?.some((item) => item.providerId === "password");
    if (!hasPasswordProvider) {
        setText("securityStatus", "This account uses an external sign-in provider. Manage its password with that provider.");
        return;
    }
    const newPassword = window.prompt("Enter a new password (at least 8 characters):");
    if (newPassword === null) return;
    if (newPassword.length < 8) {
        setText("securityStatus", "Use a password with at least 8 characters.");
        return;
    }
    const confirmation = window.prompt("Confirm your new password:");
    if (confirmation === null) return;
    if (newPassword !== confirmation) {
        setText("securityStatus", "The passwords do not match. No changes were made.");
        return;
    }
    try {
        await updatePassword(currentUser, newPassword);
        setText("securityStatus", "Your password has been changed.");
    } catch (error) {
        console.error("Password update failed:", error);
        setText("securityStatus", error.code === "auth/requires-recent-login"
            ? "For security, sign out, sign in again, then retry the password change."
            : "Password update failed. Check the password requirements and try again.");
    }
}

async function logout() {
    if (!window.confirm("Sign out of Spark Stack Academy on this device?")) return;
    try {
        await signOut(auth);
        window.location.replace("../login.html");
    } catch (error) {
        console.error("Sign out failed:", error);
        setText("securityStatus", "Could not sign out. Please try again.");
    }
}

async function requestDeletion() {
    if (!currentUser) return;
    const button = document.getElementById("deleteAccountBtn");
    if (!window.confirm("Submit an account deletion request for Academy staff review? This will not immediately delete your account.")) return;
    if (button) button.disabled = true;
    try {
        const requestRef = doc(db, "accountDeletionRequests", currentUser.uid);
        const existing = await getDoc(requestRef);
        if (existing.exists()) {
            setText("deletionStatus", "A deletion request already exists for this account. Contact Academy support for an update.");
            return;
        }
        await setDoc(requestRef, {
            userId: currentUser.uid,
            email: currentUser.email || "",
            status: "pending",
            requestedAt: serverTimestamp()
        });
        setText("deletionStatus", "Your request has been submitted for Academy staff review. Your account has not been deleted.");
    } catch (error) {
        console.error("Deletion request failed:", error);
        setText("deletionStatus", "Could not submit the request. Please contact Academy support.");
    } finally {
        if (button) button.disabled = false;
    }
}

function getValue(id) { return document.getElementById(id)?.value || ""; }
function setValue(id, value) { const node = document.getElementById(id); if (node) node.value = value; }
function setChecked(id, value) { const node = document.getElementById(id); if (node) node.checked = Boolean(value); }
function isChecked(id) { return Boolean(document.getElementById(id)?.checked); }
function setText(id, value) { const node = document.getElementById(id); if (node) node.textContent = value; }