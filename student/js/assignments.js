// ============================================================
// SPARK STACK ACADEMY — STUDENT ASSIGNMENTS
// Loads course tasks and the signed-in student's own submissions.
// ============================================================

import { db, auth } from "../../js/firebase.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

let assignments = [];
let submissionByAssignment = new Map();

const container = document.getElementById("assignmentContainer");
const searchInput = document.getElementById("assignmentSearch");
const statusFilter = document.getElementById("statusFilter");

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    await loadAssignments(user.uid);
});

searchInput?.addEventListener("input", filterAssignments);
statusFilter?.addEventListener("change", filterAssignments);

async function loadAssignments(uid) {
    if (!container) return;

    setBusy(true);
    showLoading();

    try {
        const courseIds = await loadEnrolledCourseIds(uid);

        if (!courseIds.size) {
            assignments = [];
            submissionByAssignment = new Map();
            updateStats();
            showEmpty("No active course enrolments found", "Assignments will appear here when you are enrolled in a course.");
            return;
        }

        const [assignmentResult, submissionResult] = await Promise.allSettled([
            getDocs(query(
                collection(db, "assignments"),
                where("status", "in", ["published", "pending", "active"])
            )),
            getDocs(query(
                collection(db, "submissions"),
                where("studentId", "==", uid)
            ))
        ]);

        if (assignmentResult.status === "rejected") {
            throw assignmentResult.reason;
        }

        submissionByAssignment = new Map();

        if (submissionResult.status === "fulfilled") {
            submissionResult.value.forEach(submissionDoc => {
                const data = submissionDoc.data();
                const assignmentId = data.assignmentId || inferAssignmentId(submissionDoc.id, uid);
                if (assignmentId) submissionByAssignment.set(assignmentId, data);
            });
        } else {
            console.warn("Student submissions could not be loaded:", submissionResult.reason);
        }

        assignments = [];
        assignmentResult.value.forEach(assignmentDoc => {
            const data = assignmentDoc.data();
            const status = String(data.status || "published").toLowerCase();
            const isStudentVisible = ["published", "pending", "active"].includes(status);
            if (!isStudentVisible || data.published === false) return;
            if (!data.courseId || !courseIds.has(String(data.courseId))) return;

            assignments.push({
                id: assignmentDoc.id,
                ...data,
                studentSubmission: submissionByAssignment.get(assignmentDoc.id) || null
            });
        });

        assignments.sort((a, b) => {
            const dateA = getDateValue(a.dueDate);
            const dateB = getDateValue(b.dueDate);
            return dateA - dateB;
        });

        updateStats();
        filterAssignments();
    } catch (error) {
        console.error("Failed to load student assignments:", error);
        showError();
    } finally {
        setBusy(false);
    }
}

async function loadEnrolledCourseIds(uid) {
    const queries = [
        getDocs(query(collection(db, "enrollments"), where("userId", "==", uid))),
        getDocs(query(collection(db, "enrollments"), where("studentId", "==", uid))),
        getDocs(collection(db, "students", uid, "enrollments"))
    ];

    const results = await Promise.allSettled(queries);
    const courseIds = new Set();

    results.forEach((result, index) => {
        if (result.status === "rejected") {
            console.warn("An enrolment source could not be read:", index, result.reason);
            return;
        }

        result.value.forEach(enrollmentDoc => {
            const data = enrollmentDoc.data();
            if (hasCourseAccess(data) && data.courseId) {
                courseIds.add(String(data.courseId));
            }
        });
    });

    return courseIds;
}

function hasCourseAccess(enrollment = {}) {
    const status = String(enrollment.status || "").toLowerCase();
    const paymentStatus = String(enrollment.paymentStatus || "").toLowerCase();

    const allowedStatus = ["active", "approved", "completed"].includes(status);
    const allowedPayment = ["paid", "free"].includes(paymentStatus) || status === "paid";

    if (enrollment.institutionId) {
        return allowedStatus;
    }

    return allowedStatus && allowedPayment;
}

function inferAssignmentId(submissionDocumentId, uid) {
    const suffix = `_${uid}`;
    return submissionDocumentId.endsWith(suffix)
        ? submissionDocumentId.slice(0, -suffix.length)
        : "";
}

function getStudentStatus(assignment) {
    const submission = assignment.studentSubmission;
    if (!submission) return "pending";

    const status = String(submission.status || "").toLowerCase();
    const hasGrade = submission.grade !== undefined && submission.grade !== null && submission.grade !== "";

    if (hasGrade || ["graded", "reviewed", "returned"].includes(status)) {
        return "graded";
    }
    if (["submitted", "resubmitted", "under_review", "pending_review"].includes(status)) {
        return "submitted";
    }

    return "pending";
}

function getDisplayStatus(assignment) {
    if (getStudentStatus(assignment) === "pending" && isOverdue(assignment.dueDate)) {
        return "overdue";
    }
    return getStudentStatus(assignment);
}

function updateStats() {
    const counts = {
        pending: 0,
        submitted: 0,
        graded: 0
    };

    assignments.forEach(assignment => {
        counts[getStudentStatus(assignment)] += 1;
    });

    setText("pendingAssignments", counts.pending);
    setText("submittedAssignments", counts.submitted);
    setText("gradedAssignments", counts.graded);
}

function filterAssignments() {
    const keyword = (searchInput?.value || "").trim().toLowerCase();
    const selectedStatus = statusFilter?.value || "all";

    const filtered = assignments.filter(assignment => {
        const searchable = [
            assignment.title,
            assignment.description,
            assignment.instructions,
            assignment.courseName
        ].map(value => String(value || "").toLowerCase()).join(" ");

        const matchesSearch = searchable.includes(keyword);
        const status = getStudentStatus(assignment);
        const matchesStatus = selectedStatus === "all" || status === selectedStatus;

        return matchesSearch && matchesStatus;
    });

    renderAssignments(filtered);
}

function renderAssignments(list) {
    if (!container) return;

    if (!list.length) {
        showEmpty(
            assignments.length ? "No matching assignments" : "No assignments yet",
            assignments.length
                ? "Try another search term or change the status filter."
                : "Tasks from your enrolled courses will appear here when instructors publish them."
        );
        return;
    }

    container.replaceChildren(...list.map(createAssignmentCard));
    refreshIcons();
}

function createAssignmentCard(assignment) {
    const card = document.createElement("article");
    card.className = "assignment-card";

    const status = getStudentStatus(assignment);
    const displayStatus = getDisplayStatus(assignment);
    const title = escapeHTML(assignment.title || "Untitled assignment");
    const description = escapeHTML(assignment.description || assignment.instructions || "No description provided.");
    const courseName = escapeHTML(assignment.courseName || "Course");
    const dueDate = escapeHTML(formatDate(assignment.dueDate));
    const assignmentId = escapeHTML(assignment.id);

    const statusLabel = displayStatus === "overdue"
        ? "Overdue"
        : capitalize(status);

    card.innerHTML = `
        <div class="assignment-card-top">
            <span class="assignment-card-icon" aria-hidden="true">
                <i data-lucide="file-check-2"></i>
            </span>
            <span class="assignment-status status-${displayStatus}">${statusLabel}</span>
        </div>

        <div class="assignment-card-content">
            <span class="assignment-course">${courseName}</span>
            <h3>${title}</h3>
            <p>${description}</p>
        </div>

        <div class="assignment-card-meta">
            <span><i data-lucide="calendar-clock" aria-hidden="true"></i> Due ${dueDate}</span>
        </div>

        <div class="assignment-card-actions">
            <button class="assignment-open-btn" type="button" data-open-assignment="${assignmentId}">
                View assignment
                <i data-lucide="arrow-up-right" aria-hidden="true"></i>
            </button>
            <button
                class="assignment-submit-btn"
                type="button"
                data-submit-assignment="${assignmentId}"
                ${status === "graded" ? "disabled" : ""}
            >${status === "submitted" ? "View submission" : status === "graded" ? "Graded" : "Submit work"}</button>
        </div>
    `;

    return card;
}

container?.addEventListener("click", event => {
    const openButton = event.target.closest("[data-open-assignment]");
    const submitButton = event.target.closest("[data-submit-assignment]");
    const button = openButton || submitButton;
    if (!button || button.disabled) return;

    const id = button.dataset.openAssignment || button.dataset.submitAssignment;
    if (!id || !assignments.some(item => item.id === id)) return;

    const action = submitButton ? "&action=submit" : "";
    window.location.href = `assignment-details.html?id=${encodeURIComponent(id)}${action}`;
});

function showLoading() {
    if (!container) return;
    container.innerHTML = `
        <div class="assignment-state" role="status">
            <span class="assignment-state-icon"><i data-lucide="loader-circle"></i></span>
            <h3>Loading your assignments</h3>
            <p>Checking your enrolled courses and submissions.</p>
        </div>
    `;
    refreshIcons();
}

function showEmpty(title, message) {
    if (!container) return;
    container.innerHTML = `
        <div class="assignment-state" role="status">
            <span class="assignment-state-icon"><i data-lucide="clipboard-list"></i></span>
            <h3>${escapeHTML(title)}</h3>
            <p>${escapeHTML(message)}</p>
        </div>
    `;
    refreshIcons();
}

function showError() {
    if (!container) return;
    container.innerHTML = `
        <div class="assignment-state assignment-state-error" role="alert">
            <span class="assignment-state-icon"><i data-lucide="cloud-alert"></i></span>
            <h3>Assignments could not load</h3>
            <p>Check your connection, then try again.</p>
            <button class="assignment-retry-btn" id="retryAssignments" type="button">
                <i data-lucide="refresh-cw" aria-hidden="true"></i>
                Try again
            </button>
        </div>
    `;
    document.getElementById("retryAssignments")?.addEventListener("click", () => {
        const user = auth.currentUser;
        if (user) loadAssignments(user.uid);
    }, { once: true });
    refreshIcons();
}

function setBusy(value) {
    container?.setAttribute("aria-busy", String(value));
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
}

function getDateValue(value) {
    const date = toDate(value);
    return date ? date.getTime() : Infinity;
}

function toDate(value) {
    if (!value) return null;
    try {
        const date = typeof value.toDate === "function"
            ? value.toDate()
            : value instanceof Date
                ? value
                : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    } catch {
        return null;
    }
}

function isOverdue(value) {
    const date = toDate(value);
    return Boolean(date && date.getTime() < Date.now());
}

function formatDate(value) {
    const date = toDate(value);
    if (!date) return "Not specified";
    return new Intl.DateTimeFormat("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(date);
}

function capitalize(value) {
    const text = String(value || "");
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function refreshIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
}
