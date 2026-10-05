import {
    db
} from "../../js/firebase.js";

import {
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let instructor = null;
let assignments = [];
let activeFilter = "all";


// ============================================================
// HELPERS
// ============================================================

const $ = id => document.getElementById(id);


function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function setText(id, value) {

    const element = $(id);

    if (element) {
        element.textContent = value;
    }

}


function getTime(value) {

    if (!value) return 0;

    if (typeof value?.toMillis === "function") {
        return value.toMillis();
    }

    if (typeof value?.toDate === "function") {
        return value.toDate().getTime();
    }

    const time = new Date(value).getTime();

    return Number.isNaN(time) ? 0 : time;

}


function formatDate(value) {

    if (!value) return "";

    let date;

    if (typeof value?.toDate === "function") {
        date = value.toDate();
    } else {
        date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleDateString(
        "en-KE",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );

}


function refreshIcons() {

    if (
        window.lucide &&
        typeof window.lucide.createIcons === "function"
    ) {
        window.lucide.createIcons();
    }

}


// ============================================================
// BOOT
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            await waitForInstructor();

            instructor = window.currentInstructor;

            if (!instructor) {

                console.error(
                    "❌ Instructor authentication unavailable."
                );

                return;
            }

            setupEvents();

            await loadAssignments();

            refreshIcons();

            console.log(
                "✓ Assignments engine loaded"
            );

        } catch (error) {

            console.error(
                "❌ Assignments engine error:",
                error
            );

        }

    }
);


// ============================================================
// WAIT FOR INSTRUCTOR
// ============================================================

function waitForInstructor() {

    return new Promise(resolve => {

        let attempts = 0;

        const timer = setInterval(() => {

            attempts++;

            if (window.currentInstructor) {

                clearInterval(timer);

                resolve();

                return;
            }

            if (attempts >= 100) {

                clearInterval(timer);

                resolve();

            }

        }, 100);

    });

}


// ============================================================
// EVENTS
// ============================================================

function setupEvents() {

    $("createAssignmentBtn")
        ?.addEventListener(
            "click",
            openCreateAssignment
        );


    $("emptyCreateAssignmentBtn")
        ?.addEventListener(
            "click",
            openCreateAssignment
        );


    $("assignmentSearch")
        ?.addEventListener(
            "input",
            renderAssignments
        );


    document
        .querySelectorAll(".assignment-filter")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    activeFilter =
                        button.dataset.filter || "all";


                    document
                        .querySelectorAll(
                            ".assignment-filter"
                        )
                        .forEach(btn => {

                            btn.classList.remove(
                                "active"
                            );

                        });


                    button.classList.add(
                        "active"
                    );


                    renderAssignments();

                }
            );

        });

}


// ============================================================
// LOAD ASSIGNMENTS
// ============================================================

async function loadAssignments() {

    const list = $("assignmentList");

    try {

        const ref =
            collection(
                db,
                "assignments"
            );


        const q =
            query(
                ref,
                where(
                    "instructorId",
                    "==",
                    instructor.uid
                )
            );


        const snapshot =
            await getDocs(q);


        assignments =
            snapshot.docs.map(item => ({

                id: item.id,

                ...item.data()

            }));


        assignments.sort(
            (a, b) =>
                getTime(b.createdAt) -
                getTime(a.createdAt)
        );


        await loadSubmissionStats();


        calculateStats();

        renderAssignments();


    } catch (error) {

        console.error(
            "❌ Failed to load assignments:",
            error
        );


        if (list) {

            list.innerHTML = `

                <div class="assignment-loading">

                    <i data-lucide="alert-circle"></i>

                    <span>
                        Unable to load assignments.
                    </span>

                </div>

            `;

        }

        refreshIcons();

    }

}


// ============================================================
// LOAD SUBMISSION STATS
// ============================================================

async function loadSubmissionStats() {

    try {

        const submissionsRef =
            collection(db, "submissions");


        const q =
            query(
                submissionsRef,
                where(
                    "instructorId",
                    "==",
                    instructor.uid
                )
            );


        const snapshot =
            await getDocs(q);


        const stats = {};


        snapshot.forEach(doc => {

            const data = doc.data();

            const assignmentId =
                data.assignmentId;


            if (!assignmentId) return;


            if (!stats[assignmentId]) {

                stats[assignmentId] = {

                    total: 0,

                    pending: 0,

                    graded: 0

                };

            }


            stats[assignmentId].total++;


            const status =
                String(
                    data.status || ""
                ).toLowerCase();


            if (
                status === "pending_review" ||
                status === "submitted"
            ) {

                stats[assignmentId].pending++;

            }


            if (
                status === "graded"
            ) {

                stats[assignmentId].graded++;

            }

        });


        assignments =
            assignments.map(
                assignment => {

                    const data =
                        stats[assignment.id] || {

                            total: 0,

                            pending: 0,

                            graded: 0

                        };


                    return {

                        ...assignment,

                        submissionCount:
                            data.total,

                        pendingReviewCount:
                            data.pending,

                        gradedSubmissionCount:
                            data.graded

                    };

                }
            );


    } catch (error) {

        console.warn(
            "⚠ Submission statistics unavailable:",
            error
        );


        assignments =
            assignments.map(
                assignment => ({

                    ...assignment,

                    submissionCount:
                        Number(
                            assignment.submissionCount ||
                            0
                        ),

                    pendingReviewCount:
                        0,

                    gradedSubmissionCount:
                        0

                })
            );

    }

}


// ============================================================
// STATS
// ============================================================

function calculateStats() {

    const total =
        assignments.length;


    const published =
        assignments.filter(
            assignment =>
                getAssignmentStatus(
                    assignment
                ) === "published"
        ).length;


    const drafts =
        assignments.filter(
            assignment =>
                getAssignmentStatus(
                    assignment
                ) === "draft"
        ).length;


    const pendingReviews =
        assignments.reduce(
            (total, assignment) =>
                total +
                Number(
                    assignment.pendingReviewCount || 0
                ),
            0
        );


    const submissions =
        assignments.reduce(
            (total, assignment) =>
                total +
                Number(
                    assignment.submissionCount || 0
                ),
            0
        );


    setText(
        "totalAssignments",
        total
    );


    setText(
        "pendingAssignments",
        pendingReviews
    );


    setText(
        "gradedAssignments",
        assignments.reduce(
            (total, assignment) =>
                total +
                Number(
                    assignment.gradedSubmissionCount || 0
                ),
            0
        )
    );


    setText(
        "totalSubmissions",
        submissions
    );

}


// ============================================================
// ASSIGNMENT STATUS
// ============================================================

function getAssignmentStatus(assignment) {

    const status =
        String(
            assignment.status || ""
        ).toLowerCase();


    if (status === "published") {
        return "published";
    }


    if (status === "draft") {
        return "draft";
    }


    // Legacy assignments created with
    // the old "pending" status are treated
    // as published.

    if (status === "pending") {
        return "published";
    }


    return "draft";

}


// ============================================================
// RENDER
// ============================================================

function renderAssignments() {

    const list =
        $("assignmentList");

    const empty =
        $("assignmentEmpty");


    if (!list || !empty) return;


    const search =
        ($("assignmentSearch")?.value || "")
            .trim()
            .toLowerCase();


    const filtered =
        assignments.filter(
            assignment => {

                const status =
                    getAssignmentStatus(
                        assignment
                    );


                const matchesFilter =
                    activeFilter === "all" ||
                    status === activeFilter;


                const title =
                    String(
                        assignment.title || ""
                    ).toLowerCase();


                const course =
                    String(
                        assignment.courseName ||
                        assignment.courseTitle ||
                        ""
                    ).toLowerCase();


                const matchesSearch =
                    !search ||
                    title.includes(search) ||
                    course.includes(search);


                return (
                    matchesFilter &&
                    matchesSearch
                );

            }
        );


    if (!filtered.length) {

        list.innerHTML = "";

        empty.classList.remove(
            "hidden"
        );

        refreshIcons();

        return;

    }


    empty.classList.add(
        "hidden"
    );


    list.innerHTML =
        filtered
            .map(
                createAssignmentHTML
            )
            .join("");


    refreshIcons();


    list
        .querySelectorAll(
            "[data-assignment-id]"
        )
        .forEach(item => {

            item.addEventListener(
                "click",
                () => {

                    const id =
                        item.dataset.assignmentId;


                    window.location.href =
                        `assignment.html?id=${encodeURIComponent(id)}`;

                }
            );

        });

}


// ============================================================
// ASSIGNMENT CARD
// ============================================================

function createAssignmentHTML(
    assignment
) {

    const status =
        getAssignmentStatus(
            assignment
        );


    const title =
        escapeHTML(
            assignment.title ||
            "Untitled Assignment"
        );


    const course =
        escapeHTML(
            assignment.courseName ||
            assignment.courseTitle ||
            "Course"
        );


    const submissions =
        Number(
            assignment.submissionCount || 0
        );


    const pending =
        Number(
            assignment.pendingReviewCount || 0
        );


    const dueDate =
        formatDate(
            assignment.dueDate
        );


    const statusLabel =
        status === "published"
            ? "Published"
            : "Draft";


    let submissionText =
        `${submissions} submission${submissions === 1 ? "" : "s"}`;


    if (pending > 0) {

        submissionText +=
            ` • ${pending} pending review`;

    }


    return `

        <div
            class="assignment-item"
            data-assignment-id="${escapeHTML(
                assignment.id
            )}"
            style="cursor:pointer"
        >

            <div class="assignment-main">

                <div class="assignment-icon">

                    <i data-lucide="clipboard-list"></i>

                </div>


                <div class="assignment-info">

                    <h3>
                        ${title}
                    </h3>


                    <p>

                        ${course}

                        •
                        
                        ${submissionText}

                        ${
                            dueDate
                                ? ` • Due ${dueDate}`
                                : ""
                        }

                    </p>

                </div>

            </div>


            <div class="assignment-meta">

                <span
                    class="assignment-status ${status}"
                >

                    ${statusLabel}

                </span>


                <i data-lucide="chevron-right"></i>

            </div>

        </div>

    `;

}


// ============================================================
// CREATE ASSIGNMENT
// ============================================================

function openCreateAssignment() {

    window.location.href =
        "create-assignment.html";

}


// ============================================================
// START
// ============================================================

console.log(
    "🔥 Instructor Assignments Engine V2 loaded"
);