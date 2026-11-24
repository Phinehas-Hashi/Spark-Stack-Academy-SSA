// ============================================================
// SPARK STACK ACADEMY
// INSTRUCTOR PORTAL
// ASSIGNMENT WORKSPACE
// ============================================================

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
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let instructor = null;
let assignmentId = null;
let assignment = null;

let submissions = [];

let currentFilter = "all";
let searchTerm = "";


// ============================================================
// HELPERS
// ============================================================

const $ = id =>
    document.getElementById(id);


function getAssignmentId() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return (
        params.get("id") ||
        params.get("assignmentId")
    );

}


// ============================================================
// BOOT
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        waitForAuth();

    }
);


// ============================================================
// AUTH
// ============================================================

function waitForAuth() {

    onAuthStateChanged(
        auth,
        async user => {

            if (!user) {

                console.error(
                    "❌ Instructor not authenticated."
                );

                showAssignmentError(
                    "Please sign in to access this assignment."
                );

                return;

            }


            instructor = user;


            window.currentInstructor =
                user;


            await initAssignment();

        }
    );

}


// ============================================================
// INIT
// ============================================================

async function initAssignment() {

    assignmentId =
        getAssignmentId();


    if (!assignmentId) {

        showAssignmentError(
            "No assignment was selected."
        );

        return;

    }


    try {

        await loadAssignment();

        await loadSubmissions();

        setupFilters();

        setupSearch();

        refreshIcons();


        console.log(
            "✓ Assignment workspace loaded"
        );


    } catch (error) {

        console.error(
            "❌ Assignment initialization error:",
            error
        );

        showAssignmentError(
            "Unable to load this assignment."
        );

    }

}


// ============================================================
// LOAD ASSIGNMENT
// ============================================================

async function loadAssignment() {

    const assignmentRef =
        doc(
            db,
            "assignments",
            assignmentId
        );


    const snapshot =
        await getDoc(
            assignmentRef
        );


    if (!snapshot.exists()) {

        showAssignmentError(
            "This assignment does not exist."
        );

        return;

    }


    const data =
        snapshot.data();


    // ========================================================
    // SECURITY CHECK
    // ========================================================

    if (
        data.instructorId !== instructor.uid
    ) {

        console.error(
            "❌ Assignment belongs to another instructor."
        );

        showAssignmentError(
            "You do not have access to this assignment."
        );

        return;

    }


    assignment = {

        id:
            snapshot.id,

        ...data

    };


    renderAssignment();

}


// ============================================================
// RENDER ASSIGNMENT
// ============================================================

function renderAssignment() {

    if (!assignment) return;


    $("assignmentTitle").textContent =
        assignment.title ||
        "Untitled Assignment";


    $("assignmentDescription").textContent =
        assignment.description ||
        "No description available.";


    $("assignmentCourse").textContent =
        assignment.courseName ||
        "Unknown Course";


    $("assignmentDueDate").textContent =
        formatDueDate(
            assignment.dueDate
        );


    $("assignmentMaxScore").textContent =
        assignment.maxScore ??
        100;


    $("assignmentInstructions").innerHTML =
        formatInstructions(
            assignment.instructions ||
            assignment.description ||
            "No instructions provided."
        );


    renderStatus(
        assignment.status
    );

}


// ============================================================
// STATUS
// ============================================================

function renderStatus(status) {

    const element =
        $("assignmentStatus");


    if (!element) return;


    const value =
        String(
            status || "published"
        ).toLowerCase();


    element.className =
        "assignment-status " +
        value;


    const labels = {

        published: "Published",

        active: "Active",

        draft: "Draft",

        closed: "Closed",

        archived: "Archived"

    };


    element.textContent =
        labels[value] ||
        capitalize(value);

}


// ============================================================
// INSTRUCTIONS
// ============================================================

function formatInstructions(value) {

    if (Array.isArray(value)) {

        return value
            .map(item => `
                <p>
                    ${escapeHTML(item)}
                </p>
            `)
            .join("");

    }


    return escapeHTML(
        String(value)
    ).replace(
        /\n/g,
        "<br>"
    );

}


// ============================================================
// LOAD SUBMISSIONS
// ============================================================

async function loadSubmissions() {

    const submissionsRef =
        collection(
            db,
            "submissions"
        );


    const q =
        query(
            submissionsRef,
            where(
                "assignmentId",
                "==",
                assignmentId
            )
        );


    const snapshot =
        await getDocs(q);


    submissions =
        snapshot.docs.map(
            item => ({

                id:
                    item.id,

                ...item.data()

            })
        );


    submissions.sort(
        (a, b) => {

            return (
                getTime(
                    b.submittedAt
                ) -
                getTime(
                    a.submittedAt
                )
            );

        }
    );


    updateStats();

    renderSubmissions();

}


// ============================================================
// STATS
// ============================================================

function updateStats() {

    const total =
        submissions.length;


    const graded =
        submissions.filter(
            isGraded
        ).length;


    const pending =
        total - graded;


    setText(
        "assignmentSubmissionCount",
        total
    );


    setText(
        "totalSubmissions",
        total
    );


    setText(
        "pendingSubmissions",
        pending
    );


    setText(
        "gradedSubmissions",
        graded
    );

}


// ============================================================
// GRADED CHECK
// ============================================================

function isGraded(submission) {

    const status =
        String(
            submission.status || ""
        ).toLowerCase();


    return (
        status === "graded" ||
        status === "reviewed" ||
        status === "returned" ||
        submission.score !== undefined && submission.score !== null ||
        submission.grade !== undefined && submission.grade !== null
    );

}


// ============================================================
// FILTER
// ============================================================

function getFilteredSubmissions() {

    return submissions.filter(
        submission => {

            if (
                currentFilter ===
                "pending_review"
            ) {

                if (
                    isGraded(
                        submission
                    )
                ) {

                    return false;

                }

            }


            if (
                currentFilter ===
                "graded"
            ) {

                if (
                    !isGraded(
                        submission
                    )
                ) {

                    return false;

                }

            }


            if (searchTerm) {

                const name =
                    getStudentName(
                        submission
                    ).toLowerCase();


                const email =
                    String(
                        submission.studentEmail ||
                        submission.email ||
                        ""
                    ).toLowerCase();


                if (
                    !name.includes(
                        searchTerm
                    ) &&
                    !email.includes(
                        searchTerm
                    )
                ) {

                    return false;

                }

            }


            return true;

        }
    );

}


// ============================================================
// RENDER SUBMISSIONS
// ============================================================

function renderSubmissions() {

    const list =
        $("submissionList");


    const empty =
        $("submissionEmpty");


    if (!list || !empty) return;


    const filtered =
        getFilteredSubmissions();


    if (!filtered.length) {

        list.innerHTML = "";

        empty.classList.remove(
            "hidden"
        );

        updateEmptyState();

        refreshIcons();

        return;

    }


    empty.classList.add(
        "hidden"
    );


    list.innerHTML =
        filtered
            .map(
                renderSubmission
            )
            .join("");


    list
        .querySelectorAll(
            "[data-review-submission]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    openSubmission(
                        button.dataset
                            .reviewSubmission
                    );

                }
            );

        });


    refreshIcons();

}


// ============================================================
// SUBMISSION CARD
// ============================================================

function renderSubmission(
    submission
) {

    const name =
        getStudentName(
            submission
        );


    const initials =
        getInitials(
            name
        );


    const graded =
        isGraded(
            submission
        );


    const score =
        submission.score ??
        submission.grade ??
        "—";


    const maxScore =
        assignment?.maxScore ??
        100;


    return `

        <article
            class="submission-item"
        >

            <div class="submission-student">

                <div class="student-avatar">

                    ${escapeHTML(
                        initials
                    )}

                </div>


                <div class="student-info">

                    <strong>

                        ${escapeHTML(
                            name
                        )}

                    </strong>


                    <span>

                        ${escapeHTML(
                            submission.studentEmail ||
                            submission.email ||
                            "Student"
                        )}

                    </span>

                </div>

            </div>


            <div class="submission-date">

                <span>
                    Submitted
                </span>

                <strong>

                    ${escapeHTML(
                        formatDate(
                            submission.submittedAt
                        )
                    )}

                </strong>

            </div>


            <div class="submission-score">

                <span>
                    Score
                </span>

                <strong>

                    ${escapeHTML(
                        String(score)
                    )}
                    /
                    ${escapeHTML(
                        String(maxScore)
                    )}

                </strong>

            </div>


            <div class="submission-status">

                <span
                    class="submission-badge ${
                        graded
                            ? "graded"
                            : "pending_review"
                    }"
                >

                    ${
                        graded
                            ? "Graded"
                            : "Pending Review"
                    }

                </span>

            </div>


            <button
                type="button"
                class="submission-review-btn"
                data-review-submission="${escapeHTML(
                    submission.id
                )}"
            >

                <i data-lucide="eye"></i>

                Review

            </button>

        </article>

    `;

}


// ============================================================
// REVIEW
// ============================================================

function openSubmission(
    submissionId
) {

    window.location.href =
        `submission.html?assignmentId=${
            encodeURIComponent(
                assignmentId
            )
        }&submissionId=${
            encodeURIComponent(
                submissionId
            )
        }`;

}


// ============================================================
// FILTER EVENTS
// ============================================================

function setupFilters() {

    document
        .querySelectorAll(
            ".submission-filter"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            ".submission-filter"
                        )
                        .forEach(
                            item =>
                                item.classList
                                    .remove(
                                        "active"
                                    )
                        );


                    button.classList.add(
                        "active"
                    );


                    currentFilter =
                        button.dataset.filter ||
                        "all";


                    renderSubmissions();

                }
            );

        });

}


// ============================================================
// SEARCH
// ============================================================

function setupSearch() {

    const input =
        $("submissionSearch");


    if (!input) return;


    input.addEventListener(
        "input",
        event => {

            searchTerm =
                event.target.value
                    .trim()
                    .toLowerCase();


            renderSubmissions();

        }
    );

}


// ============================================================
// EMPTY STATE
// ============================================================

function updateEmptyState() {

    const heading =
        $("submissionEmpty")
            ?.querySelector("h3");


    const paragraph =
        $("submissionEmpty")
            ?.querySelector("p");


    if (!heading || !paragraph)
        return;


    if (searchTerm) {

        heading.textContent =
            "No students found";


        paragraph.textContent =
            "Try another student name or email.";

        return;

    }


    if (
        currentFilter ===
        "pending_review"
    ) {

        heading.textContent =
            "No pending submissions";


        paragraph.textContent =
            "All submissions have been reviewed.";

        return;

    }


    if (
        currentFilter ===
        "graded"
    ) {

        heading.textContent =
            "No graded submissions";


        paragraph.textContent =
            "Graded submissions will appear here.";

        return;

    }


    heading.textContent =
        "No submissions yet";


    paragraph.textContent =
        "Student submissions will appear here.";

}


// ============================================================
// ERROR
// ============================================================

function showAssignmentError(
    message
) {

    setText(
        "assignmentTitle",
        "Assignment unavailable"
    );


    setText(
        "assignmentDescription",
        message
    );


    setText(
        "assignmentCourse",
        "—"
    );


    setText(
        "assignmentDueDate",
        "—"
    );


    setText(
        "assignmentInstructions",
        message
    );


    setText(
        "assignmentStatus",
        "Unavailable"
    );


    $("assignmentStatus")
        ?.classList.add(
            "error"
        );

}


// ============================================================
// DATE HELPERS
// ============================================================

function convertDate(value) {

    if (!value)
        return null;


    if (
        typeof value.toDate ===
        "function"
    ) {

        return value.toDate();

    }


    if (
        value instanceof Date
    ) {

        return value;

    }


    if (
        typeof value ===
        "number"
    ) {

        return new Date(value);

    }


    if (
        typeof value ===
        "string"
    ) {

        const date =
            new Date(value);


        return isNaN(
            date.getTime()
        )
            ? null
            : date;

    }


    if (
        typeof value ===
        "object" &&
        value.seconds
    ) {

        return new Date(
            value.seconds * 1000
        );

    }


    return null;

}


function formatDueDate(value) {

    const date =
        convertDate(value);


    if (!date)
        return "No deadline";


    return date.toLocaleDateString(
        "en-KE",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );

}


function formatDate(value) {

    const date =
        convertDate(value);


    if (!date)
        return "Unknown date";


    return date.toLocaleDateString(
        "en-KE",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );

}


function getTime(value) {

    const date =
        convertDate(value);


    return date
        ? date.getTime()
        : 0;

}


// ============================================================
// STUDENT HELPERS
// ============================================================

function getStudentName(
    submission
) {

    return (
        submission.studentName ||
        submission.userName ||
        submission.name ||
        "Unknown Student"
    );

}


function getInitials(name) {

    const parts =
        String(name)
            .trim()
            .split(/\s+/)
            .filter(Boolean);


    if (!parts.length)
        return "?";


    if (parts.length === 1) {

        return parts[0]
            .slice(0, 2)
            .toUpperCase();

    }


    return (
        parts[0][0] +
        parts.at(-1)[0]
    ).toUpperCase();

}


// ============================================================
// GENERAL
// ============================================================

function setText(
    id,
    value
) {

    const element =
        $(id);


    if (element) {

        element.textContent =
            value;

    }

}


function capitalize(value) {

    const text =
        String(value || "");


    return text
        ? text.charAt(0).toUpperCase() +
          text.slice(1)
        : "";

}


function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
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