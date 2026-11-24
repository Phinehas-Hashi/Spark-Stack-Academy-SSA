// =====================================
// SPARK STACK ACADEMY
// STUDENT SETTINGS
// settings.js
// =====================================

import {
    auth,
    db
} from "../../js/firebase.js";

import {
    onAuthStateChanged,
    updatePassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


console.log("⚙️ Student Settings Loaded");


let currentUser = null;


// =====================================
// START
// =====================================

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            window.location.href =
                "../login.html";

            return;

        }

        currentUser = user;

        console.log(
            "👤 Settings User:",
            user.email
        );

        await loadSettings(user);

        initializeActions();

    }
);


// =====================================
// LOAD SETTINGS
// =====================================

async function loadSettings(user) {

    try {

        const studentRef =
            doc(
                db,
                "students",
                user.uid
            );


        const settingsRef =
            doc(
                db,
                "studentSettings",
                user.uid
            );


        const studentSnap =
            await getDoc(
                studentRef
            );


        const settingsSnap =
            await getDoc(
                settingsRef
            );


        const student =
            studentSnap.exists()
                ? studentSnap.data()
                : {};


        const settings =
            settingsSnap.exists()
                ? settingsSnap.data()
                : {};


        // ---------------------------------
        // ACCOUNT
        // ---------------------------------

        setValue(
            "settingName",
            student.name ||
            student.fullName ||
            student.studentName ||
            user.displayName ||
            ""
        );


        setValue(
            "settingEmail",
            user.email || ""
        );


        setValue(
            "settingPhone",
            student.phone ||
            student.phoneNumber ||
            ""
        );


        setValue(
            "settingAdmission",
            student.admissionNumber ||
            student.admissionNo ||
            ""
        );


        // ---------------------------------
        // NOTIFICATIONS
        // ---------------------------------

        setChecked(
            "notifyAnnouncements",
            settings.notifications?.announcements !== false
        );


        setChecked(
            "notifyCourses",
            settings.notifications?.courses !== false
        );


        setChecked(
            "notifyAssignments",
            settings.notifications?.assignments !== false
        );


        setChecked(
            "notifyPayments",
            settings.notifications?.payments !== false
        );


        setChecked(
            "notifyMessages",
            settings.notifications?.messages !== false
        );


        // ---------------------------------
        // LEARNING
        // ---------------------------------

        setChecked(
            "rememberLesson",
            settings.learning?.rememberLesson !== false
        );


        setChecked(
            "learningReminders",
            settings.learning?.reminders !== false
        );


        setChecked(
            "captions",
            settings.learning?.captions === true
        );


        // ---------------------------------
        // PRIVACY
        // ---------------------------------

        setChecked(
            "showAchievements",
            settings.privacy?.achievements !== false
        );


        setChecked(
            "showCertificates",
            settings.privacy?.certificates !== false
        );

        setChecked(
            "showLeaderboard",
            settings.privacy?.leaderboard === true
        );


        // ---------------------------------
        // PREMIUM
        // ---------------------------------

        const premium =
            student.premium === true ||
            student.subscriptionStatus === "active";


        setText(
            "premiumPlan",
            premium
                ? "Premium Student"
                : "Free Student"
        );


        console.log(
            "⚙️ Settings loaded"
        );

    }

    catch (error) {

        console.error(
            "❌ Settings loading failed:",
            error
        );

    }

}


// =====================================
// ACTIONS
// =====================================

function initializeActions() {


    // ---------------------------------
    // SAVE ACCOUNT
    // ---------------------------------

    document
        .getElementById("saveAccountBtn")
        ?.addEventListener(
            "click",
            saveAccount
        );


    // ---------------------------------
    // PASSWORD
    // ---------------------------------

    document
        .getElementById("changePasswordBtn")
        ?.addEventListener(
            "click",
            changePassword
        );


    // ---------------------------------
    // SIGN OUT
    // ---------------------------------

    document
        .getElementById("signOutBtn")
        ?.addEventListener(
            "click",
            logout
        );


    // ---------------------------------
    // PREMIUM
    // ---------------------------------

    document
        .getElementById("managePremiumBtn")
        ?.addEventListener(
            "click",
            () => {

                window.location.href =
                    "premium.html";

            }
        );


    // ---------------------------------
    // SUPPORT
    // ---------------------------------

    document
    .getElementById("helpBtn")
    ?.addEventListener(
        "click",
        () => {
            window.location.href = "help-center.html";
        }
    );


document
    .getElementById("reportBtn")
    ?.addEventListener(
        "click",
        () => {
            window.location.href = "help-center.html";
        }
    );


    // ---------------------------------
    // DELETE
    // ---------------------------------

    document
        .getElementById("deleteAccountBtn")
        ?.addEventListener(
            "click",
            requestDeletion
        );


    // ---------------------------------
    // AUTO-SAVE PREFERENCES
    // ---------------------------------

    const preferenceInputs =
        document.querySelectorAll(
            ".toggle-row input"
        );


    preferenceInputs.forEach(
        input => {

            input.addEventListener(
                "change",
                savePreferences
            );

        }
    );

}


// =====================================
// SAVE ACCOUNT
// =====================================

async function saveAccount() {

    if (!currentUser) return;


    const name =
        getValue("settingName");


    const phone =
        getValue("settingPhone");


    if (!name.trim()) {

        alert(
            "Please enter your full name."
        );

        return;

    }


    try {

        await setDoc(

            doc(
                db,
                "students",
                currentUser.uid
            ),

            {

                name:
                    name.trim(),

                phone:
                    phone.trim(),

                updatedAt:
                    new Date()

            },

            {

                merge: true

            }

        );


        showSaved(
            "Account saved ✓"
        );

    }

    catch (error) {

        console.error(
            "Account save failed:",
            error
        );

        alert(
            "Unable to save your changes."
        );

    }

}


// =====================================
// SAVE PREFERENCES
// =====================================

async function savePreferences() {

    if (!currentUser) return;


    try {

        await setDoc(

            doc(
                db,
                "studentSettings",
                currentUser.uid
            ),

            {

                notifications: {

                    announcements:
                        isChecked(
                            "notifyAnnouncements"
                        ),

                    courses:
                        isChecked(
                            "notifyCourses"
                        ),

                    assignments:
                        isChecked(
                            "notifyAssignments"
                        ),

                    payments:
                        isChecked(
                            "notifyPayments"
                        ),

                    messages:
                        isChecked(
                            "notifyMessages"
                        )

                },


                learning: {

                    rememberLesson:
                        isChecked(
                            "rememberLesson"
                        ),

                    reminders:
                        isChecked(
                            "learningReminders"
                        ),

                    captions:
                        isChecked(
                            "captions"
                        )

                },


                privacy: {

                    achievements:
                        isChecked(
                            "showAchievements"
                        ),

                    certificates:
                        isChecked(
                            "showCertificates"
                        ),

                    leaderboard:
                        isChecked(
                            "showLeaderboard"
                        )

                },


                updatedAt:
                    new Date()

            },

            {

                merge: true

            }

        );


        console.log(
            "💾 Preferences saved"
        );

    }

    catch (error) {

        console.error(
            "Preference save failed:",
            error
        );

    }

}


// =====================================
// CHANGE PASSWORD
// =====================================

async function changePassword() {

    if (!currentUser) return;


    const newPassword =
        prompt(
            "Enter your new password:"
        );


    if (!newPassword) return;


    if (newPassword.length < 6) {

        alert(
            "Password must be at least 6 characters."
        );

        return;

    }


    try {

        await updatePassword(
            currentUser,
            newPassword
        );


        alert(
            "Password changed successfully ✓"
        );

    }

    catch (error) {

        console.error(
            "Password update failed:",
            error
        );


        alert(
            "For security, you may need to log in again before changing your password."
        );

    }

}


// =====================================
// LOGOUT
// =====================================

async function logout() {

    const confirmed =
        confirm(
            "Are you sure you want to sign out?"
        );


    if (!confirmed) return;


    try {

        await signOut(auth);

        window.location.href =
            "../login.html";

    }

    catch (error) {

        console.error(
            "Sign out failed:",
            error
        );

    }

}


// =====================================
// ACCOUNT DELETION REQUEST
// =====================================

async function requestDeletion() {

    const confirmed =
        confirm(
            "Are you sure you want to request account deletion?"
        );


    if (!confirmed) return;


    try {

        await setDoc(

            doc(
                db,
                "accountDeletionRequests",
                currentUser.uid
            ),

            {

                userId:
                    currentUser.uid,

                email:
                    currentUser.email,

                status:
                    "pending",

                requestedAt:
                    new Date()

            },

            {

                merge: true

            }

        );


        alert(
            "Your account deletion request has been submitted."
        );

    }

    catch (error) {

        console.error(
            "Deletion request failed:",
            error
        );

    }

}


// =====================================
// HELPERS
// =====================================

function getValue(id) {

    return (
        document.getElementById(id)
            ?.value || ""
    );

}


function setValue(id, value) {

    const element =
        document.getElementById(id);


    if (element) {

        element.value =
            value;

    }

}


function setChecked(id, value) {

    const element =
        document.getElementById(id);


    if (element) {

        element.checked =
            value;

    }

}


function isChecked(id) {

    return Boolean(
        document.getElementById(id)
            ?.checked
    );

}


function setText(id, value) {

    const element =
        document.getElementById(id);


    if (element) {

        element.textContent =
            value;

    }

}


function showSaved(message) {

    const button =
        document.getElementById(
            "saveAccountBtn"
        );


    if (!button) return;


    const original =
        button.textContent;


    button.textContent =
        message;


    setTimeout(
        () => {

            button.textContent =
                original;

        },
        1800
    );

}