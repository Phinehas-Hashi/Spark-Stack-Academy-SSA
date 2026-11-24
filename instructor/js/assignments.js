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
                        .querySelectorAll(".assignment-filter")
                        .forEach(btn => {
                            const active = btn === button;
                            btn.classList.toggle("active", active);
                            btn.setAttribute("aria-pressed", String(active));
                        });


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

    // Student submissions are keyed by assignmentId + studentId and do
    // not carry a client-supplied instructorId. Query each owned assignment
    // separately; Firestore rules verify ownership through the parent assignment.
    const results = await Promise.allSettled(
        assignments.map(async assignment => {
            const snapshot = await getDocs(query(
                collection(db, "submissions"),
                where("assignmentId", "==", assignment.id)
            ));

            let pending = 0;
            let graded = 0;

            snapshot.forEach(submissionDoc => {
                const data = submissionDoc.data();
                const status = String(data.status || "").toLowerCase();
                const hasGrade = data.grade != null || data.score != null;

                if (hasGrade || ["graded", "reviewed", "returned"].includes(status)) {
                    graded++;
                } else if (["submitted", "resubmitted", "pending_review", "under_review"].includes(status)) {
                    pending++;
                }
            });

            return {
                id: assignment.id,
                total: snapshot.size,
                pending,
                graded
            };
        })
    );

    const stats = new Map();
    results.forEach((result, index) => {
        if (result.status === "fulfilled") {
            stats.set(result.value.id, result.value);
        } else {
            console.warn(
                "Submission statistics unavailable for assignment:",
                assignments[index]?.id,
                result.reason
            );
        }
    });

    assignments = assignments.map(assignment => {
        const data = stats.get(assignment.id);
        return {
            ...assignment,
            submissionCount: data?.total ?? Number(assignment.submissionCount || 0),
            pendingReviewCount: data?.pending ?? 0,
            gradedSubmissionCount: data?.graded ?? 0
        };
    });
}


// ============================================================
// STATS
// ============================================================

function calculateStats() {

    const total =
        assignments.length;


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


    if (["published", "pending", "active"].includes(status)) {
        return "published";
    }

    if (["closed", "archived", "scheduled"].includes(status)) {
        return status;
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

    list.setAttribute("aria-busy", "false");

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

                const description =
                    String(
                        assignment.description ||
                        assignment.instructions ||
                        ""
                    ).toLowerCase();

                const matchesSearch =
                    !search ||
                    title.includes(search) ||
                    course.includes(search) ||
                    description.includes(search);


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

function createAssignmentHTML(assignment) {
    const status = getAssignmentStatus(assignment);
    const title = escapeHTML(assignment.title || "Untitled Assignment");
    const course = escapeHTML(assignment.courseName || assignment.courseTitle || "Course");
    const submissions = Number(assignment.submissionCount || 0);
    const pending = Number(assignment.pendingReviewCount || 0);
    const dueDate = formatDate(assignment.dueDate);

    const statusLabels = {
        published: "Published",
        draft: "Draft",
        closed: "Closed",
        archived: "Archived",
        scheduled: "Scheduled"
    };
    const statusLabel = statusLabels[status] || "Draft";
    const submissionText = `${submissions} submission${submissions === 1 ? "" : "s"}${pending ? ` · ${pending} pending review` : ""}`;

    return `
        <article class="assignment-item">
            <div class="assignment-main">
                <div class="assignment-icon" aria-hidden="true">
                    <i data-lucide="clipboard-list"></i>
                </div>
                <div class="assignment-info">
                    <h3>${title}</h3>
                    <p class="assignment-course">${course}</p>
                    <p class="assignment-summary">${submissionText}${dueDate ? ` · Due ${escapeHTML(dueDate)}` : ""}</p>
                </div>
            </div>
            <div class="assignment-meta">
                <span class="assignment-status ${status}">${statusLabel}</span>
                <a class="assignment-open" href="assignment.html?id=${encodeURIComponent(assignment.id)}" aria-label="Review submissions for ${title}">
                    Review submissions
                    <i data-lucide="arrow-up-right" aria-hidden="true"></i>
                </a>
            </div>
        </article>
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