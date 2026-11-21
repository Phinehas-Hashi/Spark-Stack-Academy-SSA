import { populateCountrySelect } from "../../js/countries.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
// =====================================
// SPARK STACK ACADEMY
// STUDENT PROFILE
// profile.js
// =====================================

import {
    auth,
    db
} from "../../js/firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    doc,
    getDoc,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


console.log("👤 Profile Module Loaded");
const countryForm = document.getElementById("countryProfileForm");
const countrySelect = document.getElementById("profileCountry");
const countryMessage = document.getElementById("countryProfileMessage");
const saveCountryButton = document.getElementById("saveCountryProfile");
const saveMyCountry = httpsCallable(getFunctions(auth.app), "updateMyCountry");


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

        console.log(
            "👤 Profile User:",
            user.email
        );

        await loadProfile(user);

    }
);


// =====================================
// LOAD PROFILE
// =====================================

async function loadProfile(user) {

    try {

        const studentRef =
            doc(
                db,
                "students",
                user.uid
            );


        const studentSnap =
            await getDoc(
                studentRef
            );


        const student =
            studentSnap.exists()
                ? studentSnap.data()
                : {};

        populateCountrySelect(countrySelect, student.countryCode || "");


        renderProfile(
            user,
            student
        );


        await loadLearningStats(
            user.uid,
            student
        );


    }

    catch (error) {

        console.error(
            "❌ Profile loading failed:",
            error
        );

    }

}


// =====================================
// RENDER PROFILE
// =====================================

function renderProfile(
    user,
    student
) {

    const name =
        student.name ||
        student.fullName ||
        student.studentName ||
        user.displayName ||
        "Student";


    const email =
        student.email ||
        user.email ||
        "—";


    const phone =
        student.phone ||
        student.phoneNumber ||
        "—";


    const admissionNumber =
        student.admissionNumber ||
        student.admissionNo ||
        "—";


    setText(
        "profileName",
        name
    );


    setText(
        "profileEmail",
        email
    );


    setText(
        "fullName",
        name
    );


    setText(
        "email",
        email
    );


    setText(
        "phone",
        phone
    );


    setText(
        "admissionNumber",
        admissionNumber
    );


    const avatar =
        document.getElementById(
            "profileAvatar"
        );


    if (avatar) {

        avatar.textContent =
            name
                .charAt(0)
                .toUpperCase();

    }


    const joinedDate =
        student.createdAt ||
        student.joinedAt;


    setText(
        "joinedDate",
        formatDate(joinedDate)
    );


    const studentBadge =
    document.getElementById("studentBadge");

if (studentBadge) {

    studentBadge.innerHTML = `
        Premium Student

        ${
            student.premium === true
                ? `<span class="premium-badge" title="SSA Premium Verified">✓</span>`
                : ""
        }
    `;

}

}


// =====================================
// LEARNING STATS
// =====================================

async function loadLearningStats(
    uid,
    student
) {

    try {

        let coursesCount = 0;
        let completedCount = 0;


        // ---------------------------------
        // STUDENT ENROLLMENTS
        // ---------------------------------

        const enrollmentRef =
            collection(
                db,
                "students",
                uid,
                "enrollments"
            );


        const enrollmentSnap =
            await getDocs(
                enrollmentRef
            );


        coursesCount =
            enrollmentSnap.size;


        enrollmentSnap.forEach(
            (enrollmentDoc) => {

                const data =
                    enrollmentDoc.data();


                if (
                    Number(
                        data.progress || 0
                    ) >= 100
                ) {

                    completedCount++;

                }

            }
        );


        // ---------------------------------
        // XP
        // ---------------------------------

        const xp =
            Number(
                student.xp || 0
            );


        const level =
            Math.floor(
                xp / 100
            ) + 1;


        setText(
            "coursesCount",
            coursesCount
        );


        setText(
            "completedCount",
            completedCount
        );


        setText(
            "xpCount",
            xp
        );


        setText(
            "levelCount",
            level
        );


        console.log(
            "📊 Profile stats:",
            {
                coursesCount,
                completedCount,
                xp,
                level
            }
        );

    }

    catch (error) {

        console.error(
            "❌ Stats loading failed:",
            error
        );

    }

}


// =====================================
// TEXT HELPER
// =====================================

function setText(
    id,
    value
) {

    const element =
        document.getElementById(id);


    if (element) {

        element.textContent =
            value ?? "—";

    }

}


// =====================================
// DATE
// =====================================

function formatDate(
    timestamp
) {

    if (!timestamp) {

        return "—";

    }


    try {

        const date =
            timestamp.toDate
                ? timestamp.toDate()
                : new Date(timestamp);


        return date.toLocaleDateString(
            "en-KE",
            {
                day: "numeric",
                month: "short",
                year: "numeric"
            }
        );

    }

    catch {

        return "—";

    }

}
countryForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const countryCode = countrySelect?.value || "";
  if (!countryCode) { countryMessage.textContent = "Select a country first."; return; }
  saveCountryButton.disabled = true;
  countryMessage.textContent = "Saving country…";
  try {
    await saveMyCountry({ countryCode });
    countryMessage.textContent = "Country saved successfully.";
  } catch (error) {
    console.error("Country profile update failed:", error);
    countryMessage.textContent = error.message || "Unable to save your country. Please try again.";
  } finally { saveCountryButton.disabled = false; }
});
