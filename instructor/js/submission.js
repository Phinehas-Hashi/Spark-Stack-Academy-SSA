import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    doc,
    getDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = selector => document.querySelector(selector);
const params = new URLSearchParams(window.location.search);
const assignmentId = params.get("assignmentId") || "";
const submissionId = params.get("submissionId") || "";

let activeAssignment = null;
let activeSubmission = null;
let saving = false;

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function toast(message, type = "info") {
    if (window.ssaToast) window.ssaToast(message, type);
    else if (window.showToast) window.showToast(message, type);
    else console.log(message);
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
    const date = toDate(value);
    if (!date) return "Date unavailable";
    return new Intl.DateTimeFormat("en-KE", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function isGraded(submission) {
    const status = String(submission.status || "").toLowerCase();
    return ["graded", "reviewed", "returned"].includes(status)
        || submission.score !== undefined && submission.score !== null
        || submission.grade !== undefined && submission.grade !== null;
}

async function load(user) {
    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    if (!assignmentId || !submissionId || assignmentId.length > 180 || submissionId.length > 180) {
        renderError("This review link is incomplete or invalid.");
        return;
    }

    try {
        const [assignmentSnapshot, submissionSnapshot] = await Promise.all([
            getDoc(doc(db, "assignments", assignmentId)),
            getDoc(doc(db, "submissions", submissionId))
        ]);

        if (!assignmentSnapshot.exists() || !submissionSnapshot.exists()) {
            renderError("The assignment or submission could not be found.");
            return;
        }

        const assignment = { id: assignmentSnapshot.id, ...assignmentSnapshot.data() };
        const submission = { id: submissionSnapshot.id, ...submissionSnapshot.data() };

        if (assignment.instructorId !== user.uid) {
            renderError("You do not have permission to review this assignment.");
            return;
        }

        if (submission.assignmentId !== assignmentId || !submission.studentId) {
            renderError("This submission does not belong to the selected assignment.");
            return;
        }

        const maxScore = Number(assignment.maxScore ?? 100);
        if (!Number.isFinite(maxScore) || maxScore <= 0) {
            renderError("This assignment has an invalid maximum score. Correct the assignment settings before grading.");
            return;
        }

        activeAssignment = assignment;
        activeSubmission = submission;
        renderReview();
    } catch (error) {
        console.error("Submission review load failed:", error);
        renderError("We couldn't load this submission. Check your connection and try again.");
    }
}

function renderReview() {
    const assignment = activeAssignment;
    const submission = activeSubmission;
    if (!assignment || !submission) return;

    const maxScore = Number(assignment.maxScore ?? 100);
    const studentName = submission.studentName || submission.fullName || submission.name || "Student";
    const studentContact = submission.studentEmail || submission.email || "Student account";
    const work = submission.content || submission.answer || submission.text
        || submission.body || submission.submission || submission.description
        || "No written response was provided.";
    const score = submission.score ?? submission.grade ?? "";
    const feedback = submission.feedback || submission.instructorFeedback || "";
    const graded = isGraded(submission);

    const backLink = $("#backToAssignment");
    if (backLink) {
        backLink.href = `assignment.html?id=${encodeURIComponent(assignment.id)}`;
    }

    const state = $("#submissionState");
    state.setAttribute("aria-busy", "false");
    state.innerHTML = `
        <div class="review-context">
            <div>
                <span class="eyebrow">ASSIGNMENT</span>
                <h2>${escapeHTML(assignment.title || "Untitled assignment")}</h2>
                <p>${escapeHTML(assignment.courseName || "Course")} <span aria-hidden="true">·</span> Maximum ${escapeHTML(maxScore)} marks</p>
            </div>
            <span class="review-status ${graded ? "graded" : "pending"}">${graded ? "Previously graded" : "Awaiting review"}</span>
        </div>

        <div class="review-grid">
            <section class="panel work-panel" aria-labelledby="studentWorkHeading">
                <div class="panel-heading">
                    <div>
                        <span class="eyebrow">STUDENT SUBMISSION</span>
                        <h2 id="studentWorkHeading">Submitted work</h2>
                    </div>
                    <span class="work-date">${escapeHTML(formatDate(submission.submittedAt))}</span>
                </div>

                <div class="student-row">
                    <div class="avatar" aria-hidden="true">${escapeHTML(studentName.trim().charAt(0).toUpperCase() || "S")}</div>
                    <div class="student-identity">
                        <strong>${escapeHTML(studentName)}</strong>
                        <span>${escapeHTML(studentContact)}</span>
                    </div>
                </div>

                <div class="work-content">${escapeHTML(work)}</div>
                <p class="work-footnote">This is the written response saved by the student. Attachments are not enabled for this assignment workflow.</p>
            </section>

            <section class="panel grading-panel" aria-labelledby="gradingHeading">
                <div class="panel-heading">
                    <div>
                        <span class="eyebrow">ASSESSMENT</span>
                        <h2 id="gradingHeading">${graded ? "Review or update grade" : "Grade submission"}</h2>
                    </div>
                    <span class="grading-icon"><i data-lucide="clipboard-check" aria-hidden="true"></i></span>
                </div>

                ${graded ? '<div class="existing-grade-note">A grade has already been saved. Changes here will update the student's displayed result.</div>' : '<p class="grading-intro">Enter a mark within the assignment's maximum score and add feedback the student can act on.</p>'}

                <div class="score-box">
                    <label for="score">Awarded mark</label>
                    <div class="score-input">
                        <input id="score" name="score" type="number" inputmode="decimal" min="0" max="${maxScore}" step="any" value="${escapeHTML(score)}" required aria-describedby="scoreHelp">
                        <strong>/ ${escapeHTML(maxScore)}</strong>
                    </div>
                    <small id="scoreHelp">Use a value from 0 to ${escapeHTML(maxScore)}. Decimal marks are allowed.</small>
                </div>

                <div class="feedback">
                    <label for="feedback">Instructor feedback <span>Optional</span></label>
                    <textarea id="feedback" name="feedback" maxlength="5000" rows="8" placeholder="Explain what was done well, what needs improvement and the next step…">${escapeHTML(feedback)}</textarea>
                    <div class="feedback-footer"><span>Visible to the student after saving</span><span id="feedbackCount">${String(feedback).length}/5,000</span></div>
                </div>

                <p id="gradeMessage" class="grade-message" role="status" aria-live="polite"></p>
                <button class="save-btn" id="saveGrade" type="button">
                    <i data-lucide="save" aria-hidden="true"></i>
                    <span>${graded ? "Update grade & feedback" : "Save grade & feedback"}</span>
                </button>
                <p class="save-disclaimer">Saving publishes the mark and feedback to the student's assignment results.</p>
            </section>
        </div>
    `;

    $("#feedback").addEventListener("input", event => {
        $("#feedbackCount").textContent = `${event.target.value.length.toLocaleString("en-KE")}/5,000`;
    });
    $("#saveGrade").addEventListener("click", saveGrade);
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

async function saveGrade() {
    if (saving || !activeAssignment || !activeSubmission) return;

    if (!window.SSAOnlineActionGuard?.requireOnline("Saving a grade and feedback")) {
        return;
    }

    const scoreInput = $("#score");
    const feedbackInput = $("#feedback");
    const message = $("#gradeMessage");
    const button = $("#saveGrade");
    const maxScore = Number(activeAssignment.maxScore ?? 100);
    const rawScore = scoreInput.value.trim();
    const score = Number(rawScore);
    const feedback = feedbackInput.value.trim();

    if (!rawScore || !Number.isFinite(score) || score < 0 || score > maxScore) {
        message.textContent = `Enter a valid mark between 0 and ${maxScore}.`;
        scoreInput.setAttribute("aria-invalid", "true");
        scoreInput.focus();
        return;
    }

    scoreInput.removeAttribute("aria-invalid");
    saving = true;
    button.disabled = true;
    button.querySelector("span").textContent = "Saving grade…";
    message.textContent = "";

    try {
        // Re-check ownership and submission linkage before writing. Firestore
        // rules independently enforce the same ownership boundary.
        const [assignmentSnapshot, submissionSnapshot] = await Promise.all([
            getDoc(doc(db, "assignments", activeAssignment.id)),
            getDoc(doc(db, "submissions", activeSubmission.id))
        ]);

        if (!assignmentSnapshot.exists()
            || assignmentSnapshot.data().instructorId !== auth.currentUser?.uid
            || !submissionSnapshot.exists()
            || submissionSnapshot.data().assignmentId !== activeAssignment.id
            || submissionSnapshot.data().studentId !== activeSubmission.studentId) {
            throw new Error("The assignment or submission changed, or access is no longer available.");
        }

        const latestMax = Number(assignmentSnapshot.data().maxScore ?? 100);
        if (!Number.isFinite(latestMax) || latestMax !== maxScore || score > latestMax) {
            throw new Error("The assignment's maximum score changed. Reload this review before saving.");
        }

        const now = serverTimestamp();
        await updateDoc(doc(db, "submissions", activeSubmission.id), {
            score,
            grade: score,
            maxScore,
            feedback,
            instructorFeedback: feedback,
            status: "graded",
            gradedAt: now,
            reviewedAt: now,
            updatedAt: now
        });

        activeSubmission = {
            ...activeSubmission,
            score,
            grade: score,
            maxScore,
            feedback,
            instructorFeedback: feedback,
            status: "graded"
        };

        message.textContent = "Grade and feedback saved. The student's results are now updated.";
        message.classList.add("success");
        button.querySelector("span").textContent = "Update grade & feedback";
        toast("Grade and feedback saved successfully.", "success");
    } catch (error) {
        console.error("Saving the grade failed:", error);
        message.textContent = error.message || "The grade could not be saved. Please try again.";
        message.classList.remove("success");
        button.querySelector("span").textContent = "Try saving again";
        toast("We couldn't save the grade. Please review the message and try again.", "error");
    } finally {
        saving = false;
        button.disabled = false;
    }
}

function renderError(message) {
    const state = $("#submissionState");
    state.setAttribute("aria-busy", "false");
    state.innerHTML = `
        <div class="review-error" role="alert">
            <span class="error-icon"><i data-lucide="shield-alert" aria-hidden="true"></i></span>
            <h2>Submission unavailable</h2>
            <p>${escapeHTML(message)}</p>
            <a href="assignments.html" class="error-back-link">Return to assignments</a>
        </div>
    `;
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

onAuthStateChanged(auth, load);
