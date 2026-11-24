// ============================================================
// SPARK STACK ACADEMY — ASSIGNMENT DETAILS
// Student-owned written submissions; no file upload in this phase.
// ============================================================

import { db, auth } from "../../js/firebase.js";
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const params = new URLSearchParams(window.location.search);
const assignmentId = params.get("id") || "";

let assignmentData = null;
let currentSubmission = null;
let signedInUser = null;
let submissionLoaded = false;

const submitButton = document.getElementById("submitAssignmentBtn");
const notesInput = document.getElementById("submissionNotes");
const fileInput = document.getElementById("submissionFile");
const charCount = document.getElementById("submissionCharCount");

onAuthStateChanged(auth, async user => {
    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    signedInUser = user;

    if (!assignmentId || assignmentId.length > 180) {
        showPageError("Invalid assignment link", "Return to your assignments and open a valid task.");
        return;
    }

    setSubmitState(false, "Loading assignment…");

    try {
        const assignmentRef = doc(db, "assignments", assignmentId);
        const assignmentSnapshot = await getDoc(assignmentRef);

        if (!assignmentSnapshot.exists()) {
            showPageError("Assignment not found", "This task may have been removed or the link may be incorrect.");
            return;
        }

        assignmentData = assignmentSnapshot.data();
        renderAssignment();

        await loadSubmission(user.uid);
        setupSubmission();
        updateCharacterCount();
    } catch (error) {
        console.error("Unable to open assignment:", error);
        showPageError(
            "Unable to load this assignment",
            "Check your connection and access permissions, then return to the assignments page."
        );
    }
});

function renderAssignment() {
    setText("assignmentTitle", assignmentData.title || "Untitled assignment");
    setText("assignmentCourse", assignmentData.courseName || "Course assignment");

    const instructions = document.getElementById("assignmentInstructions");
    if (instructions) {
        instructions.textContent = assignmentData.instructions || assignmentData.description || "No instructions have been provided.";
    }

    const meta = document.getElementById("assignmentMeta");
    if (meta) {
        const dueDate = toDate(assignmentData.dueDate);
        const dueLabel = dueDate ? formatDate(dueDate) : "No deadline specified";
        const points = Number(assignmentData.totalMarks ?? assignmentData.maxMarks ?? assignmentData.points);
        const pointsLabel = Number.isFinite(points) && points > 0 ? `${points} marks` : "";

        meta.replaceChildren(
            createMetaItem("calendar-clock", `Due ${dueLabel}`),
            ...(pointsLabel ? [createMetaItem("award", pointsLabel)] : [])
        );
    }

    renderResources(assignmentData.resources);
    setAssignmentStatus("pending");
}

function renderResources(resources) {
    const container = document.getElementById("assignmentResources");
    if (!container) return;

    container.replaceChildren();

    if (!Array.isArray(resources) || resources.length === 0) {
        const empty = document.createElement("p");
        empty.className = "assignment-muted";
        empty.textContent = "No resources have been attached to this assignment.";
        container.append(empty);
        return;
    }

    resources.forEach((resource, index) => {
        const item = typeof resource === "string"
            ? { name: resource }
            : resource && typeof resource === "object"
                ? resource
                : { name: `Resource ${index + 1}` };

        const name = String(item.name || item.title || `Resource ${index + 1}`);
        const url = safeHttpUrl(item.url || item.downloadURL || item.link);

        const row = document.createElement("div");
        row.className = "resource-item";

        const icon = document.createElement("span");
        icon.className = "resource-item-icon";
        icon.innerHTML = '<i data-lucide="file-text" aria-hidden="true"></i>';

        const label = document.createElement("span");
        label.className = "resource-item-name";
        label.textContent = name;

        row.append(icon, label);

        if (url) {
            const link = document.createElement("a");
            link.className = "resource-item-link";
            link.href = url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.setAttribute("aria-label", `Open resource: ${name}`);
            link.innerHTML = '<i data-lucide="external-link" aria-hidden="true"></i>';
            row.append(link);
        } else {
            const unavailable = document.createElement("span");
            unavailable.className = "resource-item-unavailable";
            unavailable.textContent = "No link";
            row.append(unavailable);
        }

        container.append(row);
    });

    refreshIcons();
}

async function loadSubmission(uid) {
    const submissionRef = doc(db, "submissions", `${assignmentId}_${uid}`);

    try {
        const snapshot = await getDoc(submissionRef);
        currentSubmission = snapshot.exists() ? snapshot.data() : null;
        submissionLoaded = true;

        if (currentSubmission) {
            if (notesInput) {
                notesInput.value = String(currentSubmission.content || currentSubmission.notes || "");
            }
            updateSubmissionStatus(currentSubmission);
            renderGrade(currentSubmission);
        } else {
            setAssignmentStatus("pending");
            renderNoGrade();
        }
    } catch (error) {
        submissionLoaded = false;
        console.warn("Could not read the student's existing submission:", error);
        setPageNotice("Your previous submission could not be checked. You can still review the assignment, but submission is temporarily unavailable.");
        setSubmitState(false, "Submission status unavailable");
        renderNoGrade();
    }
}

function setupSubmission() {
    if (!submitButton || !notesInput) return;

    notesInput.addEventListener("input", updateCharacterCount);
    submitButton.addEventListener("click", submitWrittenResponse);

    if (!submissionLoaded) {
        setSubmitState(false, "Submission unavailable");
        return;
    }

    const status = getSubmissionStatus(currentSubmission);
    if (status === "graded") {
        notesInput.readOnly = true;
        setSubmitState(false, "Already graded");
        setPageNotice("This assignment has been graded. Your response is available for review.");
    } else {
        setSubmitState(true, currentSubmission ? "Update submission" : "Submit assignment");
    }

    // Uploads are intentionally disabled until a secure storage workflow is implemented.
    if (fileInput) {
        fileInput.disabled = true;
        fileInput.value = "";
    }
}

async function submitWrittenResponse() {
    if (!signedInUser || !assignmentData || !assignmentId || !submissionLoaded) return;

    const onlineGuard = window.SSAOnlineActionGuard;
    if (onlineGuard?.requireOnline) {
        if (!onlineGuard.requireOnline("Submitting an assignment")) return;
    } else if (navigator.onLine === false) {
        setPageNotice("An internet connection is required. Nothing has been submitted.");
        return;
    }

    if (getSubmissionStatus(currentSubmission) === "graded") {
        setPageNotice("This assignment has already been graded. Contact your instructor if you need a correction.");
        return;
    }

    const content = notesInput?.value.trim() || "";
    if (!content) {
        setPageNotice("Write your response before submitting.");
        notesInput?.focus();
        return;
    }

    if (content.length > 20000) {
        setPageNotice("Your response is too long. Keep it within 20,000 characters.");
        return;
    }

    if (fileInput?.files?.length) {
        setPageNotice("File uploads are not enabled. Submit your written response only.");
        return;
    }

    setSubmitState(false, "Submitting…");
    clearPageNotice();

    try {
        const now = serverTimestamp();
        const submissionPayload = {
            assignmentId,
            userId: signedInUser.uid,
            studentId: signedInUser.uid,
            studentName: signedInUser.displayName || signedInUser.email?.split("@")[0] || "Student",
            studentEmail: signedInUser.email || "",
            content,
            notes: content,
            status: "submitted",
            submittedAt: now,
            updatedAt: now
        };

        await setDoc(
            doc(db, "submissions", `${assignmentId}_${signedInUser.uid}`),
            submissionPayload,
            { merge: true }
        );

        currentSubmission = {
            ...(currentSubmission || {}),
            ...submissionPayload,
            status: "submitted"
        };

        updateSubmissionStatus(currentSubmission);
        renderNoGrade();
        setPageNotice("Your written response has been submitted.");
        setSubmitState(true, "Update submission");
    } catch (error) {
        console.error("Assignment submission failed:", error);
        setPageNotice("Your response could not be submitted. Check your connection and try again.");
        setSubmitState(true, currentSubmission ? "Update submission" : "Try again");
    }
}

function updateSubmissionStatus(submission) {
    const status = getSubmissionStatus(submission);
    const overdue = status === "pending" && isOverdue(assignmentData?.dueDate);
    setAssignmentStatus(overdue ? "overdue" : status);
}

function getSubmissionStatus(submission) {
    if (!submission) return "pending";

    const status = String(submission.status || "").toLowerCase();
    const hasGrade = submission.grade !== undefined
        && submission.grade !== null
        && submission.grade !== "";

    if (hasGrade || ["graded", "reviewed", "returned"].includes(status)) return "graded";
    if (["submitted", "resubmitted", "under_review", "pending_review"].includes(status)) return "submitted";
    return "pending";
}

function renderGrade(submission) {
    const box = document.getElementById("gradeBox");
    if (!box) return;

    box.replaceChildren();

    const hasGrade = submission.grade !== undefined
        && submission.grade !== null
        && submission.grade !== "";

    if (hasGrade) {
        const score = document.createElement("div");
        score.className = "grade-score";
        score.textContent = String(submission.grade);

        const label = document.createElement("span");
        label.className = "grade-score-label";
        label.textContent = "Your grade";

        box.append(score, label);
    } else {
        const icon = document.createElement("div");
        icon.className = "grade-empty-icon";
        icon.innerHTML = '<i data-lucide="hourglass" aria-hidden="true"></i>';

        const title = document.createElement("h3");
        title.textContent = "Awaiting review";

        box.append(icon, title);
    }

    const feedbackText = String(submission.feedback || "").trim();
    const feedback = document.createElement("p");
    feedback.className = "feedback";
    feedback.textContent = feedbackText || "Your instructor has not added feedback yet.";
    box.append(feedback);

    refreshIcons();
}

function renderNoGrade() {
    const box = document.getElementById("gradeBox");
    if (!box) return;

    box.innerHTML = `
        <div class="grade-empty-icon"><i data-lucide="hourglass" aria-hidden="true"></i></div>
        <h3>Not graded yet</h3>
        <p>Your instructor's grade and feedback will appear here after review.</p>
    `;
    refreshIcons();
}

function setAssignmentStatus(status) {
    const element = document.getElementById("assignmentStatus");
    if (!element) return;

    const labels = {
        pending: "Pending",
        submitted: "Submitted",
        graded: "Graded",
        overdue: "Overdue"
    };

    element.textContent = labels[status] || "Pending";
    element.className = `status status-${status}`;
}

function createMetaItem(iconName, label) {
    const item = document.createElement("span");
    item.className = "assignment-meta-item";
    item.innerHTML = `<i data-lucide="${iconName}" aria-hidden="true"></i>`;
    const text = document.createElement("span");
    text.textContent = label;
    item.append(text);
    return item;
}

function updateCharacterCount() {
    if (!charCount || !notesInput) return;
    charCount.textContent = `${notesInput.value.length.toLocaleString("en-KE")} / 20,000`;
}

function setSubmitState(enabled, label) {
    if (!submitButton) return;
    submitButton.disabled = !enabled;
    submitButton.innerHTML = `<i data-lucide="send" aria-hidden="true"></i> ${escapeHTML(label)}`;
    refreshIcons();
}

function setPageNotice(message) {
    const element = document.getElementById("assignmentPageStatus");
    if (element) element.textContent = message;
}

function clearPageNotice() {
    const element = document.getElementById("assignmentPageStatus");
    if (element) element.textContent = "";
}

function showPageError(title, message) {
    setText("assignmentTitle", title);
    setText("assignmentInstructions", message);
    setAssignmentStatus("pending");
    setSubmitState(false, "Unavailable");
    setPageNotice(message);
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value ?? "");
}

function safeHttpUrl(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
        const url = new URL(value, window.location.origin);
        return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch {
        return "";
    }
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

function formatDate(value) {
    const date = value instanceof Date ? value : toDate(value);
    if (!date) return "Not specified";
    return new Intl.DateTimeFormat("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric"
    }).format(date);
}

function isOverdue(value) {
    const date = toDate(value);
    return Boolean(date && date.getTime() < Date.now());
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
