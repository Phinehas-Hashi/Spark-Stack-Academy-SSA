// ============================================================
// SPARK STACK ACADEMY
// INSTRUCTOR PORTAL
// QUIZ WORKSPACE ENGINE V1
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
    getDocs,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let instructor = null;

let quizId = null;
let quiz = null;

let course = null;
let lesson = null;

let questions = [];
let submissions = [];

let currentFilter = "all";
let searchTerm = "";


// ============================================================
// HELPERS
// ============================================================

const $ = id =>
    document.getElementById(id);


function getQuizId() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return (
        params.get("id") ||
        params.get("quizId")
    );

}


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

document.addEventListener(
    "DOMContentLoaded",
    () => {

        onAuthStateChanged(
            auth,
            async user => {

                if (!user) {

                    showError(
                        "Please sign in to access this quiz."
                    );

                    return;

                }

                instructor = user;

                window.currentInstructor =
                    user;

                await initQuiz();

            }
        );

    }
);


// ============================================================
// INIT
// ============================================================

async function initQuiz() {

    quizId =
        getQuizId();


    if (!quizId) {

        showError(
            "No quiz was selected."
        );

        return;

    }


    try {

        await loadQuiz();

        await loadQuestions();

        await loadSubmissions();

        setupEvents();

        renderEverything();

        console.log(
            "✓ Quiz workspace loaded"
        );

    } catch (error) {

        console.error(
            "❌ Quiz workspace error:",
            error
        );

        showError(
            "Unable to load this quiz."
        );

    }

}


// ============================================================
// LOAD QUIZ
// ============================================================

async function loadQuiz() {

    const quizRef =
        doc(
            db,
            "quizzes",
            quizId
        );


    const snapshot =
        await getDoc(
            quizRef
        );


    if (!snapshot.exists()) {

        throw new Error(
            "Quiz not found."
        );

    }


    const data =
        snapshot.data();


    if (
        data.instructorId &&
        data.instructorId !==
            instructor.uid
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


    await loadCourse();

    await loadLesson();

}


// ============================================================
// LOAD COURSE
// ============================================================

async function loadCourse() {

    if (!quiz.courseId) {

        course = null;

        return;

    }


    const courseRef =
        doc(
            db,
            "courses",
            quiz.courseId
        );


    const snapshot =
        await getDoc(
            courseRef
        );


    if (
        snapshot.exists()
    ) {

        course = {

            id:
                snapshot.id,

            ...snapshot.data()

        };

    }

}


// ============================================================
// LOAD LESSON
// ============================================================

async function loadLesson() {

    const lessonId =
        quiz.lessonId;


    if (!lessonId) {

        lesson = null;

        return;

    }


    const lessonRef =
        doc(
            db,
            "courseLessons",
            lessonId
        );


    const snapshot =
        await getDoc(
            lessonRef
        );


    if (
        snapshot.exists()
    ) {

        lesson = {

            id:
                snapshot.id,

            ...snapshot.data()

        };

    }

}


// ============================================================
// LOAD QUESTIONS
// ============================================================

async function loadQuestions() {

    const ref =
        collection(
            db,
            "quizQuestions"
        );


    const q =
        query(
            ref,
            where(
                "quizId",
                "==",
                quizId
            )
        );


    const snapshot =
        await getDocs(q);


    questions =
        snapshot.docs
            .map(item => ({

                id:
                    item.id,

                ...item.data()

            }))
            .sort(
                (a, b) =>
                    Number(a.order || 0) -
                    Number(b.order || 0)
            );

}


// ============================================================
// LOAD SUBMISSIONS
// ============================================================

async function loadSubmissions() {

    const ref =
        collection(
            db,
            "quizSubmissions"
        );


    // The Firestore read rule requires instructorId == current UID.
    // Query that authorized scope first, then keep this quiz's attempts.
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

    submissions =
        snapshot.docs
            .map(item => ({
                id: item.id,
                ...item.data()
            }))
            .filter(submission =>
                submission.quizId === quizId
            );


    submissions.sort(
        (a, b) =>
            getTime(
                b.submittedAt
            ) -
            getTime(
                a.submittedAt
            )
    );

}


// ============================================================
// RENDER EVERYTHING
// ============================================================

function renderEverything() {

    renderQuizHeader();

    renderQuizMeta();

    renderStats();

    renderQuestions();

    renderSubmissions();

    refreshIcons();

}


// ============================================================
// HEADER
// ============================================================

function renderQuizHeader() {

    setText(
        "quizTitle",
        quiz.title ||
        "Untitled Quiz"
    );


    setText(
        "quizDescription",
        quiz.description ||
        "No quiz description available."
    );

}


// ============================================================
// META
// ============================================================

function renderQuizMeta() {

    setText(
        "quizCourse",
        course?.title ||
        quiz.courseName ||
        "Unknown Course"
    );


    setText(
        "quizLesson",
        lesson?.title ||
        quiz.lessonName ||
        "All Lessons"
    );


    setText(
        "quizTimeLimit",
        quiz.timeLimit ??
        quiz.duration ??
        0
    );


    setText(
        "quizPassMark",
        quiz.passMark ??
        quiz.passingScore ??
        0
    );


    renderStatus();

}


// ============================================================
// STATUS
// ============================================================

function renderStatus() {

    const element =
        $("quizStatus");


    if (!element) return;


    const status =
        String(
            quiz.status ||
            "draft"
        ).toLowerCase();


    const labels = {

        published:
            "Published",

        draft:
            "Draft",

        active:
            "Active",

        closed:
            "Closed",

        archived:
            "Archived"

    };


    element.className =
        `quiz-status ${status}`;


    element.textContent =
        labels[status] ||
        capitalize(status);


    const publishBtn =
        $("publishQuizBtn");


    if (publishBtn) {

        if (
            status ===
            "published"
        ) {

            publishBtn.innerHTML = `
                <i data-lucide="check"></i>
                Published
            `;

            publishBtn.disabled =
                true;

        }

    }

}


// ============================================================
// STATS
// ============================================================

function renderStats() {

    const total =
        submissions.length;


    const graded =
        submissions.filter(
            isGraded
        ).length;


    const pending =
        total - graded;


    setText(
        "questionCount",
        questions.length
    );


    setText(
        "submissionCount",
        total
    );


    setText(
        "pendingCount",
        pending
    );


    setText(
        "gradedCount",
        graded
    );


    setText(
        "infoQuestionCount",
        questions.length
    );


    setText(
        "submissionLabel",
        `${total} ${
            total === 1
                ? "submission"
                : "submissions"
        }`
    );


    const average =
        calculateAverage();


    setText(
        "averageScore",
        average === null
            ? "—"
            : `${average}%`
    );


    setText(
        "totalMarks",
        calculateTotalMarks()
    );


    setText(
        "maxAttempts",
        quiz.maxAttempts ??
        quiz.attempts ??
        "Unlimited"
    );


    setText(
        "quizCreatedAt",
        formatDate(
            quiz.createdAt
        )
    );


    setText(
        "quizUpdatedAt",
        formatDate(
            quiz.updatedAt
        )
    );

}


// ============================================================
// QUESTIONS
// ============================================================

function renderQuestions() {

    const container =
        $("questionList");


    const empty =
        $("questionEmpty");


    if (!container) return;


    if (!questions.length) {

        container.innerHTML = "";

        empty?.classList.remove(
            "hidden"
        );

        return;

    }


    empty?.classList.add(
        "hidden"
    );


    container.innerHTML =
        questions
            .map(
                renderQuestion
            )
            .join("");


    refreshIcons();

}


// ============================================================
// QUESTION CARD
// ============================================================

function renderQuestion(
    question,
    index
) {

    const type =
        String(
            question.type ||
            "multiple_choice"
        ).toLowerCase();


    const typeLabels = {

        multiple_choice:
            "Multiple Choice",

        true_false:
            "True / False",

        short_answer:
            "Short Answer",

        essay:
            "Essay",

        text:
            "Text"

    };


    const options =
        Array.isArray(
            question.options
        )
            ? question.options
            : [];


    return `

        <article class="quiz-question-card">

            <div class="question-number">

                ${index + 1}

            </div>


            <div class="question-main">

                <div class="question-top">

                    <span class="question-type">

                        ${escapeHTML(
                            typeLabels[type] ||
                            capitalize(
                                type.replaceAll(
                                    "_",
                                    " "
                                )
                            )
                        )}

                    </span>


                    <span class="question-marks">

                        ${escapeHTML(
                            String(
                                question.marks ??
                                question.points ??
                                1
                            )
                        )}
                        ${
                            Number(
                                question.marks ??
                                question.points ??
                                1
                            ) === 1
                                ? "mark"
                                : "marks"
                        }

                    </span>

                </div>


                <h3>

                    ${escapeHTML(
                        question.question ||
                        question.text ||
                        "Untitled Question"
                    )}

                </h3>


                ${
                    options.length
                        ? `
                            <div class="question-options">

                                ${options
                                    .map(
                                        (option, optionIndex) => {

                                            const value =
                                                typeof option ===
                                                "object"
                                                    ? option.text ||
                                                      option.label ||
                                                      ""
                                                    : option;

                                            const correct =
                                                typeof option ===
                                                "object" &&
                                                option.correct;

                                            return `

                                                <div
                                                    class="question-option ${
                                                        correct
                                                            ? "correct"
                                                            : ""
                                                    }"
                                                >

                                                    <span>
                                                        ${
                                                            String.fromCharCode(
                                                                65 +
                                                                optionIndex
                                                            )
                                                        }
                                                    </span>

                                                    ${escapeHTML(
                                                        value
                                                    )}

                                                    ${
                                                        correct
                                                            ? `
                                                                <i
                                                                    data-lucide="check"
                                                                ></i>
                                                            `
                                                            : ""
                                                    }

                                                </div>

                                            `;

                                        }
                                    )
                                    .join("")}

                            </div>
                        `
                        : ""
                }

            </div>

        </article>

    `;

}


// ============================================================
// SUBMISSIONS
// ============================================================

function renderSubmissions() {

    const list =
        $("submissionList");


    const empty =
        $("submissionEmpty");


    if (!list) return;


    const filtered =
        getFilteredSubmissions();


    if (!filtered.length) {

        list.innerHTML = "";

        empty?.classList.remove(
            "hidden"
        );

        updateSubmissionEmpty();

        refreshIcons();

        return;

    }


    empty?.classList.add(
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
            "[data-review]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    openSubmission(
                        button.dataset.review
                    );

                }
            );

        });


    refreshIcons();

}


// ============================================================
// FILTERED SUBMISSIONS
// ============================================================

function getFilteredSubmissions() {

    return submissions.filter(
        submission => {

            if (
                currentFilter ===
                "pending" &&
                isGraded(
                    submission
                )
            ) {

                return false;

            }


            if (
                currentFilter ===
                "graded" &&
                !isGraded(
                    submission
                )
            ) {

                return false;

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
// SUBMISSION CARD
// ============================================================

function renderSubmission(
    submission
) {

    const name =
        getStudentName(
            submission
        );


    const graded =
        isGraded(
            submission
        );


    const score =
        submission.score ??
        "—";


    const maxScore =
        quiz.maxScore ??
        100;


    return `

        <article class="quiz-submission-item">

            <div class="submission-student">

                <div class="student-avatar">

                    ${escapeHTML(
                        getInitials(
                            name
                        )
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


            <div class="submission-time">

                <span>
                    Submitted
                </span>

                <strong>

                    ${escapeHTML(
                        formatDateTime(
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


            <span
                class="submission-badge ${
                    graded
                        ? "graded"
                        : "pending"
                }"
            >

                ${
                    graded
                        ? "Graded"
                        : "Pending"
                }

            </span>


            <button
                type="button"
                class="submission-review-btn"
                data-review="${escapeHTML(
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
// GRADED CHECK
// ============================================================

function isGraded(
    submission
) {

    const status =
        String(
            submission.status ||
            ""
        ).toLowerCase();


    return (
        status === "graded" ||
        status === "reviewed" ||
        submission.graded === true ||
        (
            submission.score !==
            undefined &&
            submission.score !==
            null
        )
    );

}


// ============================================================
// EVENTS
// ============================================================

function setupEvents() {

    $("editQuizBtn")
        ?.addEventListener(
            "click",
            editQuiz
        );


    $("editQuestionsBtn")
        ?.addEventListener(
            "click",
            editQuestions
        );


    $("editQuizQuestionsBtn")
        ?.addEventListener(
            "click",
            editQuestions
        );


    $("previewQuizBtn")
        ?.addEventListener(
            "click",
            previewQuiz
        );


    $("backToQuizzesBtn")
        ?.addEventListener(
            "click",
            () => {

                window.location.href =
                    `quizzes.html?courseId=${
                        encodeURIComponent(
                            quiz.courseId ||
                            ""
                        )
                    }`;

            }
        );


    $("publishQuizBtn")
        ?.addEventListener(
            "click",
            publishQuiz
        );


    setupFilters();

    setupSearch();

}


// ============================================================
// FILTERS
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
// PUBLISH
// ============================================================

async function publishQuiz() {

    if (!quiz) return;


    if (!questions.length) {

        alert(
            "Add at least one question before publishing."
        );

        return;

    }


    if (
        !confirm(
            "Publish this quiz?\n\nStudents will be able to access it."
        )
    ) {

        return;

    }


    const button =
        $("publishQuizBtn");


    try {

        if (button) {

            button.disabled =
                true;

            button.innerHTML = `
                <i data-lucide="loader-circle"></i>
                Publishing...
            `;

            refreshIcons();

        }


        await updateDoc(

            doc(
                db,
                "quizzes",
                quizId
            ),

            {

                status:
                    "published",

                published:
                    true,

                publishedAt:
                    serverTimestamp(),

                updatedAt:
                    serverTimestamp()

            }

        );


        quiz.status =
            "published";


        quiz.published =
            true;


        renderStatus();

        showToast(
            "Quiz published successfully 🚀"
        );


    } catch (error) {

        console.error(
            "Publish quiz error:",
            error
        );

        alert(
            "Unable to publish quiz."
        );

    } finally {

        if (button) {

            button.disabled =
                quiz.status ===
                "published";

            if (
                quiz.status !==
                "published"
            ) {

                button.innerHTML = `
                    <i data-lucide="send"></i>
                    Publish Quiz
                `;

            }

            refreshIcons();

        }

    }

}


// ============================================================
// NAVIGATION
// ============================================================

function editQuiz() {

    window.location.href =
        `create-quiz.html?id=${
            encodeURIComponent(
                quizId
            )
        }`;

}


function editQuestions() {

    window.location.href =
        `create-quiz.html?id=${
            encodeURIComponent(
                quizId
            )
        }&tab=questions`;

}


function previewQuiz() {

    window.open(
        `quiz-preview.html?id=${
            encodeURIComponent(
                quizId
            )
        }`,
        "_blank"
    );

}


function openSubmission(
    submissionId
) {

    window.location.href =
        `quiz-submission.html?quizId=${
            encodeURIComponent(
                quizId
            )
        }&submissionId=${
            encodeURIComponent(
                submissionId
            )
        }`;

}


// ============================================================
// EMPTY STATE
// ============================================================

function updateSubmissionEmpty() {

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
        "pending"
    ) {

        heading.textContent =
            "No pending submissions";


        paragraph.textContent =
            "All quiz submissions have been graded.";

        return;

    }


    if (
        currentFilter ===
        "graded"
    ) {

        heading.textContent =
            "No graded submissions";


        paragraph.textContent =
            "Graded attempts will appear here.";

        return;

    }


    heading.textContent =
        "No submissions yet";


    paragraph.textContent =
        "Student quiz attempts will appear here.";

}


// ============================================================
// CALCULATIONS
// ============================================================

function calculateTotalMarks() {

    return questions.reduce(
        (total, question) => {

            return (
                total +
                Number(
                    question.marks ??
                    question.points ??
                    1
                )
            );

        },
        0
    );

}


function calculateAverage() {

    const graded =
        submissions.filter(
            submission =>
                submission.score !==
                undefined &&
                submission.score !==
                null
        );


    if (!graded.length)
        return null;


    const maxScore =
        Number(
            quiz.maxScore ||
            calculateTotalMarks() ||
            100
        );


    if (!maxScore)
        return null;


    const total =
        graded.reduce(
            (sum, submission) =>
                sum +
                Number(
                    submission.score || 0
                ),
            0
        );


    return Math.round(
        (
            total /
            (
                graded.length *
                maxScore
            )
        ) *
        100
    );

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


function formatDate(value) {

    const date =
        convertDate(value);


    if (!date)
        return "—";


    return date.toLocaleDateString(
        "en-KE",
        {
            day: "numeric",
            month: "short",
            year: "numeric"
        }
    );

}


function formatDateTime(value) {

    const date =
        convertDate(value);


    if (!date)
        return "Unknown";


    return date.toLocaleString(
        "en-KE",
        {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
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
// ERROR
// ============================================================

function showError(message) {

    setText(
        "quizTitle",
        "Quiz unavailable"
    );


    setText(
        "quizDescription",
        message
    );


    setText(
        "quizCourse",
        "—"
    );


    setText(
        "quizLesson",
        "—"
    );


    setText(
        "quizStatus",
        "Unavailable"
    );


    $("quizStatus")
        ?.classList.add(
            "error"
        );

}


// ============================================================
// TOAST
// ============================================================

function showToast(message) {

    let toast =
        $("quizToast");


    if (!toast) {

        toast =
            document.createElement(
                "div"
            );


        toast.id =
            "quizToast";


        toast.style.cssText = `
            position:fixed;
            left:50%;
            bottom:20px;
            transform:translateX(-50%);
            z-index:9999;
            max-width:calc(100% - 32px);
            padding:12px 16px;
            border-radius:12px;
            background:#081c3a;
            color:#fff;
            font:600 13px Poppins,sans-serif;
            box-shadow:0 12px 30px rgba(0,0,0,.2);
            text-align:center;
        `;


        document.body.appendChild(
            toast
        );

    }


    toast.textContent =
        message;


    clearTimeout(
        toast._timer
    );


    toast._timer =
        setTimeout(
            () => {

                toast.remove();

            },
            3000
        );

}


// ============================================================
// GENERAL
// ============================================================

function capitalize(value) {

    const text =
        String(value || "");


    return text
        ? text.charAt(0).toUpperCase() +
          text.slice(1)
        : "";

}