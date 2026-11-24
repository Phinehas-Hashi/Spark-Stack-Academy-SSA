// ============================================================
// SPARK STACK ACADEMY
// MODERATOR PROFILE ENGINE
// ============================================================

import { auth, db } from "../../js/firebase.js";

import {
    onAuthStateChanged,
    updateProfile,
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    collection,
    query,
    where,
    orderBy,
    limit,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let currentUser = null;


// ============================================================
// DOM
// ============================================================

const $ = (id) => document.getElementById(id);


// ============================================================
// PROFILE ELEMENTS
// ============================================================

const profileAvatar = $("profileAvatar");
const profileDisplayName = $("profileDisplayName");
const profileEmail = $("profileEmail");
const profileAccountId = $("profileAccountId");

const profileFirstName = $("profileFirstName");
const profileLastName = $("profileLastName");
const profileEmailInput = $("profileEmailInput");
const profilePhone = $("profilePhone");
const profileBio = $("profileBio");

const profileJoinedDate = $("profileJoinedDate");
const profileLastLogin = $("profileLastLogin");

const profileForm = $("profileForm");

const refreshProfileBtn = $("refreshProfileBtn");
const changeAvatarBtn = $("changeAvatarBtn");

const changePasswordBtn = $("changePasswordBtn");
const profileLogoutBtn = $("profileLogoutBtn");

const passwordModal = $("passwordModal");
const closePasswordModal = $("closePasswordModal");
const cancelPasswordBtn = $("cancelPasswordBtn");
const passwordForm = $("passwordForm");

const profileActivityList = $("profileActivityList");


// ============================================================
// HELPERS
// ============================================================

function showToast(message, type = "success") {

    let toast = document.querySelector(".profile-toast");

    if (!toast) {

        toast = document.createElement("div");

        toast.className = "profile-toast";

        document.body.appendChild(toast);
    }

    toast.textContent = message;

    toast.dataset.type = type;

    requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    setTimeout(() => {

        toast.classList.remove("show");

    }, 3000);
}


function formatDate(timestamp) {

    if (!timestamp) return "—";

    let date;

    if (timestamp?.toDate) {
        date = timestamp.toDate();
    } else if (timestamp instanceof Date) {
        date = timestamp;
    } else {
        date = new Date(timestamp);
    }

    if (isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}


function formatDateTime(timestamp) {

    if (!timestamp) return "—";

    let date;

    if (timestamp?.toDate) {
        date = timestamp.toDate();
    } else {
        date = new Date(timestamp);
    }

    if (isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}


function getInitials(name = "Administrator") {

    const parts = name
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) return "A";

    if (parts.length === 1) {
        return parts[0].charAt(0).toUpperCase();
    }

    return (
        parts[0].charAt(0) +
        parts[parts.length - 1].charAt(0)
    ).toUpperCase();
}


// ============================================================
// LOAD PROFILE
// ============================================================

async function loadProfile() {

    if (!currentUser) return;

    try {

        const userRef = doc(
            db,
            "users",
            currentUser.uid
        );

        const snapshot = await getDoc(userRef);

        const data = snapshot.exists()
            ? snapshot.data()
            : {};

        const displayName =
            data.displayName ||
            currentUser.displayName ||
            "Administrator";

        const email =
            currentUser.email ||
            data.email ||
            "—";

        const firstName =
            data.firstName ||
            displayName.split(" ")[0] ||
            "";

        const lastName =
            data.lastName ||
            displayName.split(" ").slice(1).join(" ") ||
            "";


        // ====================================================
        // HERO
        // ====================================================

        if (profileDisplayName)
            profileDisplayName.textContent = displayName;

        if (profileEmail)
            profileEmail.textContent = email;

        if (profileAccountId)
            profileAccountId.textContent =
                currentUser.uid;


        if (profileAvatar) {

            profileAvatar.textContent =
                getInitials(displayName);
        }


        // ====================================================
        // FORM
        // ====================================================

        if (profileFirstName)
            profileFirstName.value = firstName;

        if (profileLastName)
            profileLastName.value = lastName;

        if (profileEmailInput)
            profileEmailInput.value = email;

        if (profilePhone)
            profilePhone.value =
                data.phone || "";

        if (profileBio)
            profileBio.value =
                data.bio || "";


        // ====================================================
        // ACCOUNT INFO
        // ====================================================

        if (profileJoinedDate) {

            profileJoinedDate.textContent =
                formatDate(
                    data.createdAt ||
                    currentUser.metadata?.creationTime
                );
        }


        if (profileLastLogin) {

            profileLastLogin.textContent =
                formatDateTime(
                    data.lastLoginAt ||
                    currentUser.metadata?.lastSignInTime
                );
        }


        await loadActivity();

        console.log(
            "🔥 Profile loaded successfully"
        );

    } catch (error) {

        console.error(
            "❌ Failed to load profile:",
            error
        );

        showToast(
            "Unable to load your profile.",
            "error"
        );
    }
}


// ============================================================
// SAVE PROFILE
// ============================================================

async function saveProfile(event) {

    event.preventDefault();

    if (!currentUser) return;

    const firstName =
        profileFirstName?.value.trim() || "";

    const lastName =
        profileLastName?.value.trim() || "";

    const phone =
        profilePhone?.value.trim() || "";

    const bio =
        profileBio?.value.trim() || "";

    const displayName =
        `${firstName} ${lastName}`.trim() ||
        "Administrator";


    const button = $("saveProfileBtn");

    try {

        if (button) {

            button.disabled = true;

            button.innerHTML = `
                <i data-lucide="loader-circle"></i>
                Saving...
            `;

            if (window.lucide) {
                lucide.createIcons();
            }
        }


        // Firebase Auth profile

        await updateProfile(
            currentUser,
            {
                displayName
            }
        );


        // Firestore profile

        await setDoc(
            doc(db, "users", currentUser.uid),
            {
                displayName,
                firstName,
                lastName,
                phone,
                bio,
                email: currentUser.email,
                updatedAt: serverTimestamp()
            },
            {
                merge: true
            }
        );


        showToast(
            "Profile updated successfully."
        );


        await loadProfile();


    } catch (error) {

        console.error(
            "❌ Profile update failed:",
            error
        );

        showToast(
            error.message ||
            "Failed to update profile.",
            "error"
        );

    } finally {

        if (button) {

            button.disabled = false;

            button.innerHTML = `
                <i data-lucide="save"></i>
                Save Changes
            `;

            if (window.lucide) {
                lucide.createIcons();
            }
        }
    }
}


// ============================================================
// PASSWORD MODAL
// ============================================================

function openPasswordModal() {

    if (!passwordModal) return;

    passwordModal.classList.remove("hidden");

    passwordModal.setAttribute(
        "aria-hidden",
        "false"
    );

    document.body.classList.add(
        "admin-modal-open"
    );
}


function closePasswordModalHandler() {

    if (!passwordModal) return;

    passwordModal.classList.add("hidden");

    passwordModal.setAttribute(
        "aria-hidden",
        "true"
    );

    document.body.classList.remove(
        "admin-modal-open"
    );

    passwordForm?.reset();
}


// ============================================================
// CHANGE PASSWORD
// ============================================================

async function changePassword(event) {

    event.preventDefault();

    if (!currentUser) return;

    const currentPassword =
        $("currentPassword")?.value;

    const newPassword =
        $("newPassword")?.value;

    const confirmPassword =
        $("confirmPassword")?.value;

    if (newPassword !== confirmPassword) {

        showToast(
            "New passwords do not match.",
            "error"
        );

        return;
    }

    if (newPassword.length < 8) {

        showToast(
            "Password must be at least 8 characters.",
            "error"
        );

        return;
    }


    const button = $("savePasswordBtn");

    try {

        if (button) {

            button.disabled = true;

            button.innerHTML = `
                Updating...
            `;
        }


        const credential =
            EmailAuthProvider.credential(
                currentUser.email,
                currentPassword
            );


        await reauthenticateWithCredential(
            currentUser,
            credential
        );


        await updatePassword(
            currentUser,
            newPassword
        );


        showToast(
            "Password changed successfully."
        );


        closePasswordModalHandler();

        await writeActivity(
            "Password changed",
            "Your account password was updated."
        );


    } catch (error) {

        console.error(
            "❌ Password change failed:",
            error
        );

        let message =
            "Failed to change password.";

        if (
            error.code ===
            "auth/invalid-credential"
        ) {
            message =
                "Current password is incorrect.";
        }

        if (
            error.code ===
            "auth/wrong-password"
        ) {
            message =
                "Current password is incorrect.";
        }

        showToast(
            message,
            "error"
        );

    } finally {

        if (button) {

            button.disabled = false;

            button.innerHTML = `
                <i data-lucide="key-round"></i>
                Update Password
            `;

            if (window.lucide) {
                lucide.createIcons();
            }
        }
    }
}


// ============================================================
// LOGOUT
// ============================================================

async function logout() {

    try {

        await writeActivity(
            "Signed out",
            "Moderator signed out of the account."
        );

        await signOut(auth);

        window.location.href =
            "../login.html";

    } catch (error) {

        console.error(
            "❌ Logout failed:",
            error
        );

        showToast(
            "Unable to sign out.",
            "error"
        );
    }
}


// ============================================================
// CHANGE AVATAR
// ============================================================

function changeAvatar() {

    showToast(
        "Profile photo upload will be connected to Storage.",
        "info"
    );
}


// ============================================================
// ACTIVITY
// ============================================================

async function writeActivity(
    action,
    description
) {

    if (!currentUser) return;

    try {

        await setDoc(
            doc(
                db,
                "users",
                currentUser.uid
            ),
            {
                lastActivity: {
                    action,
                    description,
                    timestamp: serverTimestamp()
                }
            },
            {
                merge: true
            }
        );

    } catch (error) {

        console.warn(
            "Activity log failed:",
            error
        );
    }
}


async function loadActivity() {

    if (!profileActivityList) return;

    profileActivityList.innerHTML = `
        <div class="profile-loading">
            <div class="loading-spinner"></div>
            <span>Loading account activity...</span>
        </div>
    `;

    try {

        const userRef =
            doc(db, "users", currentUser.uid);

        const snapshot =
            await getDoc(userRef);

        const data =
            snapshot.exists()
                ? snapshot.data()
                : {};


        const activity =
            data.lastActivity;


        if (!activity) {

            profileActivityList.innerHTML = `
                <div class="profile-empty">
                    <i data-lucide="activity"></i>
                    <span>No recent account activity.</span>
                </div>
            `;

            if (window.lucide) {
                lucide.createIcons();
            }

            return;
        }


        profileActivityList.innerHTML = `

            <div class="profile-activity-item">

                <div class="profile-activity-icon">

                    <i data-lucide="shield-check"></i>

                </div>

                <div>

                    <strong>
                        ${escapeHTML(activity.action)}
                    </strong>

                    <span>
                        ${escapeHTML(activity.description || "")}
                    </span>

                    <small>
                        ${formatDateTime(activity.timestamp)}
                    </small>

                </div>

            </div>

        `;

        if (window.lucide) {
            lucide.createIcons();
        }

    } catch (error) {

        console.error(
            "❌ Activity loading failed:",
            error
        );

        profileActivityList.innerHTML = `
            <div class="profile-empty">
                Unable to load activity.
            </div>
        `;
    }
}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHTML(value = "") {

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


// ============================================================
// EVENT LISTENERS
// ============================================================

profileForm?.addEventListener(
    "submit",
    saveProfile
);


refreshProfileBtn?.addEventListener(
    "click",
    async () => {

        refreshProfileBtn.disabled = true;

        await loadProfile();

        refreshProfileBtn.disabled = false;

        showToast(
            "Profile refreshed."
        );
    }
);


changeAvatarBtn?.addEventListener(
    "click",
    changeAvatar
);


changePasswordBtn?.addEventListener(
    "click",
    openPasswordModal
);


closePasswordModal?.addEventListener(
    "click",
    closePasswordModalHandler
);


cancelPasswordBtn?.addEventListener(
    "click",
    closePasswordModalHandler
);


passwordForm?.addEventListener(
    "submit",
    changePassword
);


profileLogoutBtn?.addEventListener(
    "click",
    async () => {

        const confirmed =
            confirm(
                "Are you sure you want to sign out?"
            );

        if (!confirmed) return;

        await logout();
    }
);


// Close modal by clicking backdrop

passwordModal?.querySelector(
    ".admin-modal-backdrop"
)?.addEventListener(
    "click",
    closePasswordModalHandler
);


// ESC closes modal

document.addEventListener(
    "keydown",
    (event) => {

        if (
            event.key === "Escape" &&
            passwordModal &&
            !passwordModal.classList.contains("hidden")
        ) {

            closePasswordModalHandler();
        }
    }
);


// ============================================================
// AUTH STATE
// ============================================================

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            console.warn(
                "⚠️ No authenticated moderator."
            );

            window.location.href =
                "../login.html";

            return;
        }

        currentUser = user;

        console.log(
            "🔥 PROFILE JS LOADED",
            user.uid
        );

        await loadProfile();
    }
);


// ============================================================
// INITIAL ICON REFRESH
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        if (window.lucide) {
            lucide.createIcons();
        }

    }
);