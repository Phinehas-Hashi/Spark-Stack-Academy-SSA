// ============================================================
// SPARK STACK ACADEMY
// INSTRUCTOR SETTINGS ENGINE
// ============================================================

import {
    auth,
    db
} from "../../js/firebase.js";

import {
    onAuthStateChanged,
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let currentUser = null;
let currentData = {};


// ============================================================
// DOM
// ============================================================

const $ = id => document.getElementById(id);


// ============================================================
// SETTINGS FIELDS
// ============================================================

const fields = [
    "settingsPhone",
    "notifyEnrollment",
    "notifyAssignments",
    "notifyMessages",
    "notifyEarnings",
    "allowReviews",
    "assignmentAlerts",
    "courseVisibility"
];


// ============================================================
// LOAD ACCOUNT
// ============================================================

async function loadSettings(user) {

    currentUser = user;

    try {

        const ref = doc(
            db,
            "users",
            user.uid
        );

        const snap = await getDoc(ref);

        currentData = snap.exists()
            ? snap.data()
            : {};

        populateSettings();

        await loadPlatformSettings();

        updateProStatus();

        console.log("✓ Instructor settings loaded");

    } catch (error) {

        console.error(
            "❌ Failed loading settings:",
            error
        );

    }
}


// ============================================================
// POPULATE SETTINGS
// ============================================================

function populateSettings() {

    if ($("settingsEmail")) {
        $("settingsEmail").value =
            currentUser?.email || "";
    }


    if ($("settingsPhone")) {
        $("settingsPhone").value =
            currentData.phone || "";
    }


    setChecked(
        "notifyEnrollment",
        currentData.notifications?.enrollment ?? true
    );

    setChecked(
        "notifyAssignments",
        currentData.notifications?.assignments ?? true
    );

    setChecked(
        "notifyMessages",
        currentData.notifications?.messages ?? true
    );

    setChecked(
        "notifyEarnings",
        currentData.notifications?.earnings ?? true
    );


    setChecked(
        "allowReviews",
        currentData.teaching?.allowReviews ?? true
    );

    setChecked(
        "assignmentAlerts",
        currentData.teaching?.assignmentAlerts ?? true
    );


    if ($("courseVisibility")) {

        $("courseVisibility").value =
            currentData.teaching?.courseVisibility ||
            "draft";

    }

}


// ============================================================
// CHECKBOX
// ============================================================

function setChecked(id, value) {

    const element = $(id);

    if (element) {
        element.checked = Boolean(value);
    }

}


// ============================================================
// SAVE SETTINGS
// ============================================================

async function saveSettings() {

    if (!currentUser) return;


    const button =
        $("saveSettingsBtn");


    try {

        if (button) {

            button.disabled = true;

            button.innerHTML = `
                <i data-lucide="loader-circle"></i>
                Saving...
            `;

            refreshIcons();

        }


        const phoneValue = $("settingsPhone")?.value.trim() || "";
        if (phoneValue.length > 30) {
            showToast("Phone number must be 30 characters or fewer.", "error");
            $("settingsPhone")?.focus();
            return;
        }

        const settingsData = {

            phone:
                $("settingsPhone")?.value.trim() || "",

            phoneNumber:
                $("settingsPhone")?.value.trim() || "",

            notifications: {

                enrollment:
                    $("notifyEnrollment")?.checked ?? true,

                assignments:
                    $("notifyAssignments")?.checked ?? true,

                messages:
                    $("notifyMessages")?.checked ?? true,

                earnings:
                    $("notifyEarnings")?.checked ?? true

            },

            teaching: {

                allowReviews:
                    $("allowReviews")?.checked ?? true,

                assignmentAlerts:
                    $("assignmentAlerts")?.checked ?? true,

                courseVisibility:
                    $("courseVisibility")?.value || "draft"

            },

            updatedAt:
                new Date()

        };


        await setDoc(
            doc(
                db,
                "users",
                currentUser.uid
            ),
            settingsData,
            {
                merge: true
            }
        );


        currentData = {
            ...currentData,
            ...settingsData
        };


        showToast(
            "Settings saved successfully.",
            "success"
        );


    } catch (error) {

        console.error(
            "❌ Failed saving settings:",
            error
        );

        showToast(
            "Unable to save settings.",
            "error"
        );


    } finally {

        if (button) {

            button.disabled = false;

            button.innerHTML = `
                <i data-lucide="save"></i>
                Save Changes
            `;

            refreshIcons();

        }

    }

}


// ============================================================
// PLATFORM SETTINGS
// ============================================================

async function loadPlatformSettings() {

    try {

        const ref = doc(
            db,
            "platformSettings",
            "earnings"
        );

        const snap = await getDoc(ref);

        if (!snap.exists()) return;


        const data = snap.data();


        if ($("platformTax")) {

            $("platformTax").textContent =
                `${Number(
                    data.platformTaxPercent || 0
                )}%`;

        }


        if ($("withdrawalFee")) {

            $("withdrawalFee").textContent =
                `${Number(
                    data.withdrawalFeePercent || 0
                )}%`;

        }


        if ($("minimumWithdrawal")) {

            $("minimumWithdrawal").textContent =
                `KSh ${Number(
                    data.minimumWithdrawal || 100
                ).toLocaleString("en-KE")}`;

        }

    } catch (error) {

        console.error(
            "❌ Failed loading platform settings:",
            error
        );

    }

}


// ============================================================
// PRO STATUS
// ============================================================

function updateProStatus() {

    const isPremium =
        currentData.instructorPremium === true ||
        currentData.premiumInstructor === true;


    const status =
        $("proSettingsStatus");

    const description =
        $("proSettingsDescription");


    if (isPremium) {

        if (status) {
            status.textContent =
                "Instructor Pro Active";
        }

        if (description) {
            description.textContent =
                "Your premium instructor benefits are active.";
        }

    } else {

        if (status) {
            status.textContent =
                "Instructor Pro";
        }

        if (description) {
            description.textContent =
                "Upgrade to unlock premium instructor features.";
        }

    }

}


// ============================================================
// SETTINGS NAVIGATION
// ============================================================

function setupNavigation() {

    const buttons =
        document.querySelectorAll(
            ".settings-nav-item"
        );

    const panels =
        document.querySelectorAll(
            ".settings-section"
        );


    buttons.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const target =
                    button.dataset.section;


                buttons.forEach(item =>
                    item.classList.remove("active")
                );


                panels.forEach(panel =>
                    panel.classList.remove("active")
                );


                button.classList.add("active");


                const panel =
                    document.querySelector(
                        `[data-panel="${target}"]`
                    );


                if (panel) {

                    panel.classList.add("active");

                }

            }
        );

    });

}


// ============================================================
// CHANGE PASSWORD
// ============================================================

async function handleChangePassword() {
    if (!currentUser) return;

    const supportsPassword = currentUser.providerData?.some(
        provider => provider.providerId === "password"
    );
    if (!supportsPassword || !currentUser.email) {
        showToast("This account does not use an email password. Manage its sign-in method through your identity provider.", "error");
        return;
    }

    const currentPassword = prompt("Enter your current password to continue:");
    if (!currentPassword) return;
    const newPassword = prompt("Enter your new password (minimum 8 characters):");
    if (!newPassword) return;
    if (newPassword.length < 8) {
        showToast("Use a password with at least 8 characters.", "error");
        return;
    }
    const confirmation = prompt("Confirm your new password:");
    if (confirmation !== newPassword) {
        showToast("The password confirmation does not match.", "error");
        return;
    }

    try {
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
        showToast("Password changed successfully.", "success");
    } catch (error) {
        console.error("Password update failed:", error);
        if (error.code === "auth/wrong-password" || error.code === "auth/invalid-credential") {
            showToast("The current password is incorrect.", "error");
        } else if (error.code === "auth/weak-password") {
            showToast("Choose a stronger password.", "error");
        } else {
            showToast("Unable to change password. Please sign in again and retry.", "error");
        }
    }
}

// ============================================================
// SIGN OUT
// ============================================================

async function handleSignOut() {

    const confirmed =
        confirm(
            "Sign out of your instructor account?"
        );


    if (!confirmed) return;


    try {

        await signOut(auth);

        window.location.href =
            "../login.html";

    } catch (error) {

        console.error(
            "❌ Sign out failed:",
            error
        );

        showToast(
            "Unable to sign out.",
            "error"
        );

    }

}


// ============================================================
// DISABLE ACCOUNT
// ============================================================

async function disableAccount() {

    if (!currentUser) return;


    const confirmed =
        confirm(
            "Disable your instructor account?\n\nYou can contact the Academy later to reactivate it."
        );


    if (!confirmed) return;


    try {

        await updateDoc(
            doc(
                db,
                "users",
                currentUser.uid
            ),
            {
                instructorStatus: "disabled",
                instructorDisabledAt:
                    new Date()
            }
        );


        showToast(
            "Instructor account disabled.",
            "success"
        );


        setTimeout(
            () => signOut(auth),
            1200
        );


    } catch (error) {

        console.error(
            "❌ Disable account failed:",
            error
        );

        showToast(
            "Unable to disable account.",
            "error"
        );

    }

}


// ============================================================
// DELETE ACCOUNT
// ============================================================

async function deleteAccount() {

    if (!currentUser) return;


    const confirmation =
        prompt(
            'Type "DELETE" to permanently delete your account.'
        );


    if (confirmation !== "DELETE") {

        showToast(
            "Account deletion cancelled.",
            "error"
        );

        return;

    }


    showToast(
        "Account deletion requires backend authorization for security.",
        "error"
    );

}


// ============================================================
// TOAST
// ============================================================

function showToast(message, type = "success") {

    let toast =
        document.getElementById(
            "settingsToast"
        );


    if (!toast) {

        toast =
            document.createElement("div");

        toast.id =
            "settingsToast";

        toast.className =
            "settings-toast";

        document.body.appendChild(toast);

    }


    toast.className =
        `settings-toast ${type}`;

    toast.textContent =
        message;


    requestAnimationFrame(() => {

        toast.classList.add("show");

    });


    setTimeout(() => {

        toast.classList.remove("show");

    }, 3000);

}


// ============================================================
// EVENTS
// ============================================================

function setupEvents() {

    $("saveSettingsBtn")
        ?.addEventListener(
            "click",
            saveSettings
        );


    $("changePasswordBtn")
        ?.addEventListener(
            "click",
            handleChangePassword
        );


    $("logoutAllBtn")
        ?.addEventListener(
            "click",
            handleSignOut
        );


    $("disableAccountBtn")
        ?.addEventListener(
            "click",
            disableAccount
        );


    $("deleteAccountBtn")
        ?.addEventListener(
            "click",
            deleteAccount
        );

}


// ============================================================
// ICONS
// ============================================================

function refreshIcons() {

    if (
        window.lucide &&
        typeof window.lucide.createIcons ===
        "function"
    ) {

        window.lucide.createIcons();

    }

}


// ============================================================
// BOOT
// ============================================================

function boot() {

    setupNavigation();

    setupEvents();

    refreshIcons();


    onAuthStateChanged(
        auth,
        async user => {

            if (!user) {

                window.location.href =
                    "../login.html";

                return;

            }


            await loadSettings(user);

            refreshIcons();

        }
    );

}


boot();