// ============================================================
// SPARK STACK ACADEMY
// INSTRUCTOR PORTAL
// QUIZ SUBMISSION REVIEW ENGINE
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
    updateDoc,
    collection,
    query,
    where,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let instructor = null;

let quizId = null;
let submissionId = null;

let quiz = null;
let submission = null;

let questions = [];
let answers = [];

let marksAwarded = 0;
let totalMarks = 0;
let gradeSaving = false;


// ============================================================
// HELPERS
// ============================================================

const $ = id =>
    document.getElementById(id);


function getParams() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return {
        quizId:
            params.get("quizId") ||
            params.get("id"),

        submissionId:
            params.get("submissionId")
    };

}


// ============================================================
// BOOT
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        const params =
            getParams();

        quizId =
            params.quizId;

        submissionId =
            params.submissionId;


        setupButtons();

        refreshIcons();

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

                showError(
                    "Please sign in to review this submission."
                );

                return;

            }


            instructor = user;

            window.currentInstructor =
                user;


            await initialize();

        }
    );

}


// ============================================================
// INITIALIZE
// ============================================================

async function initialize() {

    if (!quizId || !submissionId) {

        showError(
            "Missing quiz or submission information."
        );

        return;

    }


    try {

        await loadQuiz();

        await loadSubmission();

        await loadQuestions();

        buildAnswers();

        renderPage();

        setupScoreInputs();

        refreshIcons();


        console.log(
            "✓ Quiz submission loaded"
        );

    } catch (error) {

        console.error(
            "❌ Submission initialization error:",
            error
        );

        showError(
            "Unable to load this submission."
        );

    }

}


// ============================================================
// LOAD QUIZ
// ============================================================

async function loadQuiz() {

    const ref =
        doc(
            db,
            "quizzes",
            quizId
        );


    const snapshot =
        await getDoc(ref);


    if (!snapshot.exists()) {

        throw new Error(
            "Quiz does not exist."
        );

    }


    const data =
        snapshot.data();


    // SECURITY CHECK

    if (
        data.instructorId !== instructor.uid
    ) {

        throw new Error(
            "You do not own this quiz."
        );

    }


    quiz = {

        id:
            snapshot.id,

        ...data

    };

}


// ============================================================
// LOAD SUBMISSION
// ============================================================

async function loadSubmission() {

    const ref =
        doc(
            db,
            "quizSubmissions",
            submissionId
        );


    const snapshot =
        await getDoc(ref);


    if (!snapshot.exists()) {

        throw new Error(
            "Submission does not exist."
        );

    }


    submission = {

        id:
            snapshot.id,

        ...snapshot.data()

    };


    // Make sure submission belongs
    // to this quiz.

    if (
        submission.quizId !== quizId ||
        submission.instructorId !== instructor.uid
    ) {
        throw new Error(
            "This submission is not linked to a quiz owned by your account."
        );
    }

}


// ============================================================
// LOAD QUESTIONS
// ============================================================

async function loadQuestions() {
    // Questions are stored in quizQuestions. Restrict the query to the
    // instructor-owned scope required by Firestore rules.
    const questionsRef = collection(db, "quizQuestions");
    const q = query(
        questionsRef,
        where("quizId", "==", quizId),
        where("instructorId", "==", instructor.uid)
    );
    const snapshot = await getDocs(q);
    questions = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
    if (!questions.length) {
        throw new Error("No questions were found for this quiz.");
    }
}

// ============================================================
// BUILD ANSWERS
// ============================================================

function buildAnswers() {

    /*
       Supports:

       submission.answers = {
           questionId: answer
       }

       OR

       submission.answers = [
           {
               questionId,
               answer,
               score
           }
       ]
    */

    const raw =
        submission.answers;


    if (Array.isArray(raw)) {

        answers =
            raw.map(item => ({

                ...item,

                questionId:
                    item.questionId ||
                    item.id

            }));

        return;

    }


    if (
        raw &&
        typeof raw === "object"
    ) {

        answers =
            Object.entries(raw)
                .map(
                    ([questionId, value]) => ({

                        questionId,

                        answer:
                            value

                    })
                );

        return;

    }


    answers = [];

}


// ============================================================
// RENDER PAGE
// ============================================================

function renderPage() {

    renderHeader();

    renderStudent();

    renderStats();

    renderAnswers();

    renderSidebar();

}


// ============================================================
// HEADER
// ============================================================

function renderHeader() {

    setText(
        "submissionTitle",
        `Review Submission`
    );


    setText(
        "submissionSubtitle",
        quiz.title ||
        "Quiz Submission"
    );


    setText(
        "quizBreadcrumb",
        quiz.title ||
        "Quiz"
    );


    const breadcrumb =
        $("quizBreadcrumb");


    if (breadcrumb) {

        breadcrumb.href =
            `quiz.html?id=${encodeURIComponent(
                quizId
            )}`;

    }

}


// ============================================================
// STUDENT
// ============================================================

function renderStudent() {

    const name =
        submission.studentName ||
        submission.userName ||
        submission.name ||
        "Unknown Student";


    const email =
        submission.studentEmail ||
        submission.email ||
        "No email available";


    setText(
        "studentName",
        name
    );


    setText(
        "studentEmail",
        email
    );


    setText(
        "studentAvatar",
        getInitials(name)
    );


    setText(
        "submittedAt",
        formatDateTime(
            submission.submittedAt
        )
    );


    const status =
        getSubmissionStatus();


    setText(
        "submissionStatus",
        status.label
    );


    const statusElement =
        $("submissionStatus");


    if (statusElement) {

        statusElement.className =
            `submission-status ${status.class}`;

    }

}


// ============================================================
// STATS
// ============================================================

function renderStats() {

    totalMarks =
        calculateTotalMarks();


    marksAwarded =
        calculateMarksAwarded();


    const percentage =
        calculatePercentage();


    setText(
        "totalMarks",
        totalMarks
    );


    setText(
        "marksAwarded",
        marksAwarded
    );


    setText(
        "percentageScore",
        `${percentage}%`
    );


    const result =
        getResult(percentage);


    setText(
        "resultStatus",
        result.label
    );


    const resultElement =
        $("resultStatus");


    if (resultElement) {

        resultElement.className =
            `result-${result.class}`;

    }


    setText(
        "submissionScore",
        `${marksAwarded} / ${totalMarks}`
    );

}


// ============================================================
// ANSWERS
// ============================================================

function renderAnswers() {

    const list =
        $("answerList");


    const empty =
        $("answersEmpty");


    if (!list) return;


    if (!questions.length) {

        list.innerHTML = "";

        empty?.classList.remove(
            "hidden"
        );

        setText(
            "answerCount",
            "0 questions"
        );

        return;

    }


    empty?.classList.add(
        "hidden"
    );


    setText(
        "answerCount",
        `${questions.length} ${
            questions.length === 1
                ? "question"
                : "questions"
        }`
    );


    list.innerHTML =
        questions
            .map(
                (question, index) =>
                    renderAnswerCard(
                        question,
                        index
                    )
            )
            .join("");


    refreshIcons();

}


// ============================================================
// ANSWER CARD
// ============================================================

function renderAnswerCard(
    question,
    index
) {

    const answerData =
        getAnswer(question.id);


    const studentAnswer =
        answerData?.answer ??
        answerData?.value ??
        "No answer submitted";


    const marks =
        Number(
            answerData?.score ??
            answerData?.marksAwarded ??
            0
        );


    const questionMarks =
        Number(
            question.marks ??
            question.points ??
            1
        );


    const type =
        question.type ||
        "Question";


    return `

        <article
            class="answer-card"
            data-question-id="${escapeHTML(
                question.id
            )}"
        >

            <div class="answer-card-header">

                <div class="answer-question-number">

                    ${index + 1}

                </div>


                <div class="answer-question">

                    <h3>

                        ${escapeHTML(
                            question.text ||
                            question.question ||
                            "Untitled question"
                        )}

                    </h3>

                </div>


                <span class="answer-type">

                    ${escapeHTML(
                        capitalize(type)
                    )}

                </span>

            </div>


            <div class="student-answer-box">

                <span>
                    STUDENT ANSWER
                </span>

                <p>
                    ${escapeHTML(
                        formatAnswer(
                            studentAnswer
                        )
                    )}
                </p>

            </div>


            <div class="answer-marking">

                <label>

                    Marks awarded
                    / ${questionMarks}

                </label>


                <input
                    type="number"
                    class="answer-score-input"
                    data-score-input
                    data-question-id="${escapeHTML(
                        question.id
                    )}"
                    min="0"
                    max="${questionMarks}"
                    step="0.5"
                    value="${marks}"
                >

            </div>

        </article>

    `;

}


// ============================================================
// SIDEBAR
// ============================================================

function renderSidebar() {

    const percentage =
        calculatePercentage();


    const result =
        getResult(percentage);


    setText(
        "finalScore",
        `${marksAwarded} / ${totalMarks}`
    );


    setText(
        "sidebarPercentage",
        `${percentage}%`
    );


    setText(
        "sidebarResult",
        result.label
    );


    const sidebarResult =
        $("sidebarResult");


    if (sidebarResult) {

        sidebarResult.className =
            `result-${result.class}`;

    }


    setText(
        "infoQuiz",
        quiz.title ||
        "—"
    );


    setText(
        "infoCourse",
        quiz.courseName ||
        submission.courseName ||
        "—"
    );


    setText(
        "infoAttempt",
        submission.attempt ??
        1
    );


    setText(
        "timeSpent",
        formatDuration(
            submission.timeSpent
        )
    );


    setValue(
        "instructorFeedback",
        submission.instructorFeedback ||
        submission.feedback ||
        ""
    );

}


// ============================================================
// SCORE INPUTS
// ============================================================

function setupScoreInputs() {

    document
        .querySelectorAll(
            "[data-score-input]"
        )
        .forEach(input => {

            input.addEventListener(
                "input",
                () => {

                    recalculateLiveScore();

                }
            );

        });

}


// ============================================================
// LIVE SCORE
// ============================================================

function recalculateLiveScore() {

    let score = 0;


    document
        .querySelectorAll(
            "[data-score-input]"
        )
        .forEach(input => {

            const value =
                Number(
                    input.value
                );


            if (
                Number.isFinite(value)
            ) {

                score +=
                    Math.max(
                        0,
                        value
                    );

            }

        });


    marksAwarded =
        score;


    const percentage =
        calculatePercentage();


    setText(
        "marksAwarded",
        score
    );


    setText(
        "submissionScore",
        `${score} / ${totalMarks}`
    );


    setText(
        "percentageScore",
        `${percentage}%`
    );


    setText(
        "finalScore",
        `${score} / ${totalMarks}`
    );


    setText(
        "sidebarPercentage",
        `${percentage}%`
    );


    const result =
        getResult(percentage);


    setText(
        "resultStatus",
        result.label
    );


    setText(
        "sidebarResult",
        result.label
    );

}


// ============================================================
// SAVE GRADE
// ============================================================

async function saveGrade() {

    if (!submission || gradeSaving) return;

    gradeSaving = true;


    const button =
        $("gradeSubmissionBtn");


    const sidebarButton =
        $("sidebarGradeBtn");


    try {

        setButtonLoading(
            button,
            true,
            "Saving..."
        );


        setButtonLoading(
            sidebarButton,
            true,
            "Saving..."
        );


        if (
            submission.quizId !== quizId ||
            submission.instructorId !== instructor.uid ||
            quiz.instructorId !== instructor.uid
        ) {
            throw new Error("Ownership verification failed. The grade was not saved.");
        }

        const gradedAnswers = collectScores();


        const score =
            gradedAnswers.reduce(
                (
                    total,
                    item
                ) =>
                    total +
                    item.score,
                0
            );


        const percentage =
            totalMarks > 0
                ? Math.round(
                    (
                        score /
                        totalMarks
                    ) *
                    100
                )
                : 0;


        const result =
            getResult(
                percentage,
                true
            );


        const feedback =
            $("instructorFeedback")
                ?.value
                ?.trim() ||
            "";

        if (feedback.length > 5000) {
            throw new Error("Feedback must be 5,000 characters or fewer.");
        }


        const submissionRef =
            doc(
                db,
                "quizSubmissions",
                submissionId
            );


        await updateDoc(
            submissionRef,
            {

                answers:
                    gradedAnswers,

                score,

                totalMarks,

                percentage,

                status:
                    "graded",

                result:
                    result.key,

                instructorFeedback:
                    feedback,

                gradedBy:
                    instructor.uid,

                gradedAt:
                    serverTimestamp(),

                reviewedAt:
                    serverTimestamp(),

                updatedAt:
                    serverTimestamp()

            }
        );


        submission = {

            ...submission,

            answers:
                gradedAnswers,

            score,

            totalMarks,

            percentage,

            status:
                "graded",

            result:
                result.key,

            instructorFeedback:
                feedback

        };


        marksAwarded =
            score;


        renderStudent();

        renderStats();

        renderSidebar();


        showMessage(
            "Grade saved successfully."
        );


    } catch (error) {

        console.error(
            "❌ Failed to save grade:",
            error
        );


        showMessage(
            "Unable to save grade.",
            true
        );

    } finally {

        gradeSaving = false;

        setButtonLoading(
            button,
            false,
            "Save Grade"
        );


        setButtonLoading(
            sidebarButton,
            false,
            "Save Grade"
        );

    }

}


// ============================================================
// COLLECT SCORES
// ============================================================

function collectScores() {

    return questions.map(question => {
        const input = document.querySelector(
            `[data-score-input][data-question-id="${CSS.escape(question.id)}"]`
        );
        const maxScore = Number(question.marks ?? question.points ?? 1);
        const rawValue = input?.value ?? "0";
        const score = Number(rawValue);

        if (
            !Number.isFinite(maxScore) ||
            maxScore <= 0 ||
            rawValue.trim() === "" ||
            !Number.isFinite(score) ||
            score < 0 ||
            score > maxScore
        ) {
            input?.setCustomValidity(`Enter a mark between 0 and ${maxScore}.`);
            input?.reportValidity();
            throw new Error("One or more question marks are outside the allowed range.");
        }

        input?.setCustomValidity("");

        const existing = getAnswer(question.id);
        return {
            questionId: question.id,
            answer: existing?.answer ?? existing?.value ?? null,
            score,
            maxScore
        };
    });
}


// ============================================================
// BUTTON EVENTS
// ============================================================

function setupButtons() {

    $("gradeSubmissionBtn")
        ?.addEventListener(
            "click",
            saveGrade
        );


    $("sidebarGradeBtn")
        ?.addEventListener(
            "click",
            saveGrade
        );


    $("backToQuizBtn")
        ?.addEventListener(
            "click",
            () => {

                window.location.href =
                    `quiz.html?id=${encodeURIComponent(
                        quizId
                    )}`;

            }
        );

}


// ============================================================
// CALCULATIONS
// ============================================================

function calculateTotalMarks() {

    return questions.reduce(
        (
            total,
            question
        ) => {

            return total +
                Number(
                    question.marks ??
                    question.points ??
                    1
                );

        },
        0
    );

}


function calculateMarksAwarded() {

    if (
        submission &&
        submission.status ===
            "graded" &&
        submission.score !==
            undefined
    ) {

        return Number(
            submission.score || 0
        );

    }


    return questions.reduce(
        (
            total,
            question
        ) => {

            const answer =
                getAnswer(
                    question.id
                );


            return total +
                Number(
                    answer?.score ??
                    answer?.marksAwarded ??
                    0
                );

        },
        0
    );

}


function calculatePercentage() {

    if (!totalMarks)
        return 0;


    return Math.round(
        (
            marksAwarded /
            totalMarks
        ) *
        100
    );

}


// ============================================================
// RESULT
// ============================================================

function getResult(
    percentage,
    isGraded = submission?.status === "graded"
) {

    const passMark =
        Number(
            quiz?.passMark ??
            quiz?.passingScore ??
            50
        );


    if (!isGraded) {

        return {

            key:
                "pending",

            label:
                "Pending",

            class:
                "pending"

        };

    }


    if (
        percentage >=
        passMark
    ) {

        return {

            key:
                "passed",

            label:
                "Passed",

            class:
                "pass"

        };

    }


    return {

        key:
            "failed",

        label:
            "Failed",

        class:
            "fail"

    };

}


// ============================================================
// STATUS
// ============================================================

function getSubmissionStatus() {

    const status =
        String(
            submission?.status ||
            "pending"
        ).toLowerCase();


    if (
        status === "graded" ||
        status === "reviewed"
    ) {

        return {

            label:
                "Graded",

            class:
                "graded"

        };

    }


    return {

        label:
            "Pending",

        class:
            "pending"

    };

}


// ============================================================
// FIND ANSWER
// ============================================================

function getAnswer(
    questionId
) {

    return answers.find(
        answer =>
            String(
                answer.questionId
            ) ===
            String(
                questionId
            )
    );

}


// ============================================================
// ANSWER FORMAT
// ============================================================

function formatAnswer(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {

        return "No answer submitted";

    }


    if (Array.isArray(value)) {

        return value.join(
            ", "
        );

    }


    if (
        typeof value ===
        "object"
    ) {

        return JSON.stringify(
            value
        );

    }


    return String(value);

}


// ============================================================
// DATE
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
            value.seconds *
            1000
        );

    }


    return null;

}


function formatDateTime(value) {

    const date =
        convertDate(value);


    if (!date)
        return "Unknown";


    return date.toLocaleString(
        "en-KE",
        {

            day:
                "numeric",

            month:
                "short",

            year:
                "numeric",

            hour:
                "2-digit",

            minute:
                "2-digit"

        }
    );

}


// ============================================================
// DURATION
// ============================================================

function formatDuration(
    value
) {

    if (
        value === null ||
        value === undefined
    ) {

        return "—";

    }


    const seconds =
        Number(value);


    if (
        !Number.isFinite(
            seconds
        )
    ) {

        return String(value);

    }


    const minutes =
        Math.floor(
            seconds / 60
        );


    const remaining =
        seconds % 60;


    return `${minutes}m ${remaining}s`;

}


// ============================================================
// INITIALS
// ============================================================

function getInitials(
    name
) {

    const parts =
        String(name)
            .trim()
            .split(/\s+/)
            .filter(Boolean);


    if (!parts.length)
        return "?";


    if (
        parts.length === 1
    ) {

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
// GENERAL HELPERS
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


function setValue(
    id,
    value
) {

    const element =
        $(id);


    if (element) {

        element.value =
            value;

    }

}


function capitalize(
    value
) {

    const text =
        String(
            value || ""
        );


    return text
        ? text.charAt(0)
            .toUpperCase() +
          text.slice(1)
        : "";

}


function escapeHTML(
    value
) {

    return String(
        value ?? ""
    )
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
// BUTTON LOADING
// ============================================================

function setButtonLoading(
    button,
    loading,
    text
) {

    if (!button)
        return;


    if (loading) {

        button.disabled =
            true;

        button.dataset.originalText =
            button.textContent.trim();

        button.textContent =
            text;

        return;

    }


    button.disabled =
        false;

    button.textContent =
        button.dataset.originalText ||
        text;


    refreshIcons();

}


// ============================================================
// ERROR
// ============================================================

function showError(
    message
) {

    console.error(
        message
    );


    setText(
        "submissionTitle",
        "Submission unavailable"
    );


    setText(
        "submissionSubtitle",
        message
    );


    setText(
        "studentName",
        "Unavailable"
    );


    setText(
        "studentEmail",
        "—"
    );


    setText(
        "submissionStatus",
        "Unavailable"
    );

}


// ============================================================
// MESSAGE
// ============================================================

function showMessage(
    message,
    error = false
) {

    let element =
        $("gradeMessage");


    if (!element) {

        element =
            document.createElement(
                "div"
            );

        element.id =
            "gradeMessage";

        element.style.position =
            "fixed";

        element.style.bottom =
            "20px";

        element.style.right =
            "20px";

        element.style.zIndex =
            "9999";

        element.style.padding =
            "12px 16px";

        element.style.borderRadius =
            "10px";

        element.style.fontSize =
            "13px";

        element.style.fontWeight =
            "700";

        element.style.boxShadow =
            "0 8px 25px rgba(0,0,0,.12)";

        document.body.appendChild(
            element
        );

    }


    element.textContent =
        message;

    element.style.background =
        error
            ? "#fff0f0"
            : "#ecf9f0";

    element.style.color =
        error
            ? "#b42318"
            : "#16733d";


    clearTimeout(
        element._timer
    );


    element._timer =
        setTimeout(
            () => {

                element.remove();

            },
            3500
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