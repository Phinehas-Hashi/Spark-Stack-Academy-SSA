// ============================================================
// SPARK STACK ACADEMY
// STUDENT PORTAL
// TAKE QUIZ ENGINE V1
// ============================================================

import {
    auth,
    db
} from "../../js/firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    collection,
    query,
    where,
    getDocs,
    getDoc,
    doc,
    runTransaction,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let currentUser = null;
let currentStudent = null;

let quiz = null;
let questions = [];

let currentQuestionIndex = 0;

let answers = {};
let flagged = {};

let attemptNumber = 1;
let maxAttempts = 1;

let quizStartTime = null;
let timerInterval = null;
let remainingSeconds = 0;

let submitting = false;
let autoSubmitted = false;


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


function refreshIcons() {

    if (
        window.lucide &&
        typeof window.lucide.createIcons === "function"
    ) {
        window.lucide.createIcons();
    }

}


function getQuizId() {

    const params =
        new URLSearchParams(window.location.search);

    return params.get("quizId");

}


function showToast(message) {

    const toast = $("quizToast");

    if (!toast) return;

    toast.textContent = message;

    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);

}


// ============================================================
// BOOT
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        bindStaticEvents();

        onAuthStateChanged(
            auth,
            async user => {

                if (!user) {

                    window.location.href =
                        "../login.html";

                    return;

                }

                currentUser = user;

                try {

                    await initializeQuiz();

                } catch (error) {

                    console.error(
                        "❌ Quiz initialization failed:",
                        error
                    );

                    hideLoading();

                    showAccessScreen(
                        "Unable to load quiz",
                        "Something went wrong while preparing this quiz."
                    );

                }

            }
        );

    }
);


// ============================================================
// INITIALIZE QUIZ
// ============================================================

async function initializeQuiz() {

    const quizId = getQuizId();

    if (!quizId) {

        showAccessScreen(
            "Quiz Not Found",
            "No quiz was specified."
        );

        hideLoading();

        return;

    }


    setLoadingMessage(
        "Loading your student profile..."
    );

    await loadStudent();


    setLoadingMessage(
        "Checking your course enrollment..."
    );

    const access =
        await checkQuizAccess(quizId);


    if (!access.allowed) {

        hideLoading();

        showAccessScreen(
            access.title,
            access.message,
            access.details
        );

        return;

    }


    quiz = access.quiz;

    attemptNumber = access.attemptNumber;
    maxAttempts = access.maxAttempts;


    setLoadingMessage(
        "Loading quiz questions..."
    );

    await loadQuestions(quizId);


    if (!questions.length) {

        hideLoading();

        showAccessScreen(
            "No Questions Available",
            "This quiz does not have any questions yet."
        );

        return;

    }


    setupQuizUI();

    setupTimer();

    renderQuestion();

    renderQuestionPalette();

    updateProgress();

    hideLoading();

    refreshIcons();

}


// ============================================================
// LOAD STUDENT
// ============================================================

async function loadStudent() {

    const studentRef =
        doc(
            db,
            "students",
            currentUser.uid
        );

    const snapshot =
        await getDoc(studentRef);


    if (snapshot.exists()) {

        currentStudent = {
            id: snapshot.id,
            ...snapshot.data()
        };

        return;

    }


    // Fallback for older accounts

    const userRef =
        doc(
            db,
            "users",
            currentUser.uid
        );

    const userSnap =
        await getDoc(userRef);


    if (userSnap.exists()) {

        currentStudent = {
            id: userSnap.id,
            ...userSnap.data()
        };

    } else {

        currentStudent = {
            id: currentUser.uid
        };

    }

}


// ============================================================
// CHECK QUIZ ACCESS
// ============================================================

async function checkQuizAccess(quizId) {

    const quizRef =
        doc(
            db,
            "quizzes",
            quizId
        );

    const quizSnap =
        await getDoc(quizRef);


    if (!quizSnap.exists()) {

        return {
            allowed: false,
            title: "Quiz Not Found",
            message: "This quiz no longer exists."
        };

    }


    const quizData = {
        id: quizSnap.id,
        ...quizSnap.data()
    };


    const status =
        String(
            quizData.status || ""
        ).toLowerCase();


    if (
        status &&
        status !== "published" &&
        quizData.published !== true
    ) {

        return {
            allowed: false,
            title: "Quiz Unavailable",
            message: "This quiz has not been published."
        };

    }


    if (
        quizData.published !== true &&
        status !== "published"
    ) {

        return {
            allowed: false,
            title: "Quiz Unavailable",
            message: "This quiz is currently unavailable."
        };

    }


    // ========================================================
    // ENROLLMENT CHECK
    // ========================================================

    const enrollmentQuery =
        query(
            collection(db, "enrollments"),
            where(
                "studentId",
                "==",
                currentUser.uid
            ),
            where(
                "courseId",
                "==",
                quizData.courseId
            )
        );


    let enrollmentSnap =
        await getDocs(enrollmentQuery);


    // Support older enrollment records using userId

    if (enrollmentSnap.empty) {

        const fallbackQuery =
            query(
                collection(db, "enrollments"),
                where(
                    "userId",
                    "==",
                    currentUser.uid
                ),
                where(
                    "courseId",
                    "==",
                    quizData.courseId
                )
            );

        enrollmentSnap =
            await getDocs(fallbackQuery);

    }


    if (enrollmentSnap.empty) {

        return {
            allowed: false,
            title: "Quiz Locked",
            message:
                "You can only access quizzes for courses you are enrolled in.",
            details:
                "Enroll in this course to unlock its quizzes."
        };

    }


    // ========================================================
    // GET ALL COURSE QUIZZES
    // ========================================================

    const courseQuizQuery =
        query(
            collection(db, "quizzes"),
            where(
                "courseId",
                "==",
                quizData.courseId
            )
        );


    const courseQuizSnap =
        await getDocs(courseQuizQuery);


    let courseQuizzes =
        courseQuizSnap.docs
            .map(item => ({
                id: item.id,
                ...item.data()
            }))
            .filter(item => {

                const status =
                    String(
                        item.status || ""
                    ).toLowerCase();

                return (
                    status === "published" ||
                    item.published === true
                );

            });


    courseQuizzes.sort(
        (a, b) =>
            Number(a.order || 0) -
            Number(b.order || 0)
    );


    const quizIndex =
        courseQuizzes.findIndex(
            item =>
                item.id === quizId
        );


    if (quizIndex === -1) {

        return {
            allowed: false,
            title: "Quiz Unavailable",
            message:
                "This quiz is not currently available."
        };

    }


    // ========================================================
    // ATTEMPT LIMIT
    // ========================================================

    maxAttempts =
        getAttemptLimit(quizIndex);


    const attempts =
        await getQuizAttempts(quizId);


    const completed =
        attempts.some(
            attempt =>
                isCompletedSubmission(attempt)
        );


    if (completed) {

        return {
            allowed: false,
            title: "Quiz Completed",
            message:
                "You have already completed this quiz.",
            details:
                "Completed quizzes can be reviewed from the quizzes page."
        };

    }


    const usedAttempts =
        attempts.length;


    if (usedAttempts >= maxAttempts) {

        return {
            allowed: false,
            title: "Attempts Exhausted",
            message:
                "You have used all attempts available for this quiz.",
            details:
                `${usedAttempts} of ${maxAttempts} attempts used.`
        };

    }


    // ========================================================
    // PREVIOUS QUIZ LOCK
    // ========================================================

    if (quizIndex > 0) {

        const previousQuiz =
            courseQuizzes[
                quizIndex - 1
            ];


        const previousAttempts =
            await getQuizAttempts(
                previousQuiz.id
            );


        const previousCompleted =
            previousAttempts.some(
                attempt =>
                    isCompletedSubmission(attempt)
            );


        if (!previousCompleted) {

            return {
                allowed: false,
                title: "Quiz Locked",
                message:
                    "Complete the previous quiz before accessing this one.",
                details:
                    `Complete "${previousQuiz.title || "the previous quiz"}" first.`
            };

        }

    }


    return {

        allowed: true,

        quiz: quizData,

        attemptNumber:
            usedAttempts + 1,

        maxAttempts

    };

}


// ============================================================
// ATTEMPT LIMIT
// ============================================================

function getAttemptLimit(index) {

    if (index === 0)
        return 3;

    if (index === 1)
        return 2;

    return 1;

}


// ============================================================
// LOAD ATTEMPTS
// ============================================================

async function getQuizAttempts(quizId) {

    const q =
        query(
            collection(
                db,
                "quizSubmissions"
            ),
            where(
                "studentId",
                "==",
                currentUser.uid
            ),
            where(
                "quizId",
                "==",
                quizId
            )
        );


    const snapshot =
        await getDocs(q);


    return snapshot.docs.map(
        item => ({
            id: item.id,
            ...item.data()
        })
    );

}


function isCompletedSubmission(attempt) {

    return (
        attempt.completed === true ||
        attempt.status === "completed" ||
        attempt.status === "graded" ||
        typeof attempt.score === "number"
    );

}


// ============================================================
// LOAD QUESTIONS
// ============================================================

async function loadQuestions(quizId) {

    const q =
        query(
            collection(
                db,
                "quizQuestions"
            ),
            where(
                "quizId",
                "==",
                quizId
            )
        );


    const snapshot =
        await getDocs(q);


    questions =
        snapshot.docs.map(
            item => ({
                id: item.id,
                ...item.data()
            })
        );


    questions.sort(
        (a, b) =>
            Number(a.order || 0) -
            Number(b.order || 0)
    );

}


// ============================================================
// SETUP QUIZ UI
// ============================================================

function setupQuizUI() {

    $("quizTitle").textContent =
        quiz.title || "Quiz";


    $("quizDescription").textContent =
        quiz.description ||
        "Test your knowledge and continue your learning journey.";


    $("courseName").textContent =
        quiz.courseTitle ||
        quiz.courseName ||
        "Course";


    $("moduleName").textContent =
        quiz.moduleName ||
        "—";


    $("lessonName").textContent =
        quiz.lessonName ||
        quiz.lessonTitle ||
        "—";


    $("attemptNumber").textContent =
        attemptNumber;


    $("maxAttempts").textContent =
        maxAttempts;


    $("passingScore").textContent =
        `${quiz.passingScore || 0}%`;


    $("questionProgress").textContent =
        `1 / ${questions.length}`;


    $("answeredCount").textContent =
        `0/${questions.length}`;


    refreshIcons();

}


// ============================================================
// TIMER
// ============================================================

function setupTimer() {

    clearInterval(timerInterval);


    let duration =
        Number(
            quiz.duration || 0
        );


    if (!duration) {

        $("quizTimer").textContent =
            "∞";

        $("timerStatus").textContent =
            "No time limit";

        return;

    }


    remainingSeconds =
        duration * 60;


    quizStartTime =
        Date.now();


    updateTimerDisplay();


    timerInterval =
        setInterval(
            tickTimer,
            1000
        );

}


function tickTimer() {

    if (submitting)
        return;


    remainingSeconds--;


    updateTimerDisplay();


    if (
        remainingSeconds === 600 ||
        remainingSeconds === 300 ||
        remainingSeconds === 60
    ) {

        const minutes =
            Math.ceil(
                remainingSeconds / 60
            );

        showToast(
            `${minutes} minute${minutes === 1 ? "" : "s"} remaining`
        );

    }


    if (remainingSeconds <= 0) {

        clearInterval(timerInterval);

        autoSubmitted = true;

        showToast(
            "Time is up. Submitting your quiz..."
        );


        setTimeout(
            submitQuiz,
            800
        );

    }

}


function updateTimerDisplay() {

    const timer =
        $("quizTimer");


    if (!timer)
        return;


    if (remainingSeconds <= 0) {

        timer.textContent =
            "00:00";

        return;

    }


    const minutes =
        Math.floor(
            remainingSeconds / 60
        );


    const seconds =
        remainingSeconds % 60;


    timer.textContent =
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;


    const status =
        $("timerStatus");


    if (!status)
        return;


    if (remainingSeconds <= 60) {

        status.textContent =
            "Final minute";

    } else if (remainingSeconds <= 300) {

        status.textContent =
            "Almost done";

    } else {

        status.textContent =
            "In progress";

    }

}


// ============================================================
// RENDER QUESTION
// ============================================================

function renderQuestion() {

    const question =
        questions[
            currentQuestionIndex
        ];


    if (!question)
        return;


    $("questionNumber").textContent =
        `Question ${currentQuestionIndex + 1}`;


    $("questionType").textContent =
        formatQuestionType(
            question.type
        );


    $("questionPoints").textContent =
        `${question.points || 1} ${
            Number(question.points || 1) === 1
                ? "point"
                : "points"
        }`;


    $("questionText").textContent =
        question.question ||
        question.text ||
        "Question";


    hideAnswerInputs();


    const type =
        String(
            question.type ||
            "multiple-choice"
        ).toLowerCase();


    if (
        type === "short-answer" ||
        type === "short_answer" ||
        type === "text"
    ) {

        renderShortAnswer(question);

    } else if (
        type === "code"
    ) {

        renderCodeAnswer(question);

    } else {

        renderMultipleChoice(question);

    }


    $("previousQuestionBtn").disabled =
        currentQuestionIndex === 0;


    updateFlagButton();

    updateProgress();

    refreshIcons();

}


function formatQuestionType(type) {

    const value =
        String(
            type || "multiple-choice"
        )
            .replaceAll("-", " ")
            .replaceAll("_", " ");


    return value
        .replace(/\b\w/g, char =>
            char.toUpperCase()
        );

}


// ============================================================
// ANSWER INPUTS
// ============================================================

function hideAnswerInputs() {

    $("answersContainer")
        ?.classList.add("hidden");

    $("shortAnswerContainer")
        ?.classList.add("hidden");

    $("codeAnswerContainer")
        ?.classList.add("hidden");

}


function renderMultipleChoice(question) {

    const container =
        $("answersContainer");


    if (!container)
        return;


    container.classList.remove(
        "hidden"
    );


    const options =
        Array.isArray(question.options)
            ? question.options
            : [];


    container.innerHTML =
        options.map(
            (option, index) => {

                const value =
                    typeof option === "object"
                        ? (
                            option.value ??
                            option.id ??
                            option.label
                        )
                        : option;


                const label =
                    typeof option === "object"
                        ? (
                            option.label ??
                            option.text ??
                            option.value
                        )
                        : option;


                const selected =
                    answers[question.id] ===
                    String(value);


                return `

                    <button
                        type="button"
                        class="answer-option ${
                            selected
                                ? "selected"
                                : ""
                        }"
                        data-answer-value="${escapeHTML(value)}"
                    >

                        <span class="answer-letter">

                            ${
                                String.fromCharCode(
                                    65 + index
                                )
                            }

                        </span>

                        <span class="answer-label">

                            ${escapeHTML(label)}

                        </span>

                        <i
                            data-lucide="check"
                            class="answer-check"
                        ></i>

                    </button>

                `;

            }
        )
        .join("");


    container
        .querySelectorAll(
            ".answer-option"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        answers[question.id] =
                            button.dataset.answerValue;

                        renderQuestion();

                        saveLocalAttempt();

                    }
                );

            }
        );

}


function renderShortAnswer(question) {

    const container =
        $("shortAnswerContainer");


    const input =
        $("shortAnswer");


    if (!container || !input)
        return;


    container.classList.remove(
        "hidden"
    );


    input.value =
        answers[question.id] || "";


    input.oninput =
        () => {

            answers[question.id] =
                input.value;

            updateProgress();

            saveLocalAttempt();

        };

}


function renderCodeAnswer(question) {

    const container =
        $("codeAnswerContainer");


    const input =
        $("codeAnswer");


    if (!container || !input)
        return;


    container.classList.remove(
        "hidden"
    );


    input.value =
        answers[question.id] || "";


    input.oninput =
        () => {

            answers[question.id] =
                input.value;

            updateProgress();

            saveLocalAttempt();

        };

}


// ============================================================
// NAVIGATION
// ============================================================

function goToQuestion(index) {

    saveCurrentInput();

    if (
        index < 0 ||
        index >= questions.length
    )
        return;


    currentQuestionIndex =
        index;


    renderQuestion();

}


function saveCurrentInput() {

    const question =
        questions[
            currentQuestionIndex
        ];


    if (!question)
        return;


    const type =
        String(
            question.type || ""
        ).toLowerCase();


    if (
        type === "short-answer" ||
        type === "short_answer" ||
        type === "text"
    ) {

        const input =
            $("shortAnswer");

        if (input)
            answers[question.id] =
                input.value;

    }


    if (
        type === "code"
    ) {

        const input =
            $("codeAnswer");

        if (input)
            answers[question.id] =
                input.value;

    }

}


// ============================================================
// PROGRESS
// ============================================================

function updateProgress() {

    const total =
        questions.length;


    const answered =
        questions.filter(
            question => {

                const answer =
                    answers[question.id];

                return (
                    answer !== undefined &&
                    answer !== null &&
                    String(answer).trim() !== ""
                );

            }
        ).length;


    $("questionProgress").textContent =
        `${currentQuestionIndex + 1} / ${total}`;


    $("answeredCount").textContent =
        `${answered}/${total}`;


    const percent =
        total
            ? ((currentQuestionIndex + 1) / total) * 100
            : 0;


    $("quizProgress").style.width =
        `${percent}%`;


    const remaining =
        total - answered;


    $("submitMessage").textContent =
        remaining === 0
            ? "All questions answered. You are ready to submit."
            : `${remaining} question${remaining === 1 ? "" : "s"} remaining.`;

}


// ============================================================
// QUESTION PALETTE
// ============================================================

function renderQuestionPalette() {

    const palette =
        $("questionPalette");


    if (!palette)
        return;


    palette.innerHTML =
        questions.map(
            (question, index) => {

                const answered =
                    answers[question.id] !== undefined &&
                    String(
                        answers[question.id]
                    ).trim() !== "";


                const current =
                    index === currentQuestionIndex;


                const isFlagged =
                    flagged[question.id] === true;


                return `

                    <button
                        type="button"
                        class="
                            palette-question
                            ${current ? "current" : ""}
                            ${answered ? "answered" : ""}
                            ${isFlagged ? "flagged" : ""}
                        "
                        data-question-index="${index}"
                    >

                        ${index + 1}

                    </button>

                `;

            }
        )
        .join("");


    palette
        .querySelectorAll(
            "[data-question-index]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        saveCurrentInput();

                        goToQuestion(
                            Number(
                                button.dataset.questionIndex
                            )
                        );

                    }
                );

            }
        );


    refreshIcons();

}


// ============================================================
// FLAG
// ============================================================

function updateFlagButton() {

    const question =
        questions[
            currentQuestionIndex
        ];


    if (!question)
        return;


    const active =
        flagged[question.id] === true;


    $("flagText").textContent =
        active
            ? "Flagged"
            : "Flag";


    $("flagQuestionBtn")
        ?.classList.toggle(
            "active",
            active
        );


    renderQuestionPalette();

}


function toggleFlag() {

    const question =
        questions[
            currentQuestionIndex
        ];


    if (!question)
        return;


    flagged[question.id] =
        !flagged[question.id];


    updateFlagButton();

    saveLocalAttempt();

}


// ============================================================
// LOCAL AUTO-SAVE
// ============================================================

function getStorageKey() {

    return `ssa_quiz_attempt_${currentUser.uid}_${quiz?.id}`;

}


function saveLocalAttempt() {

    if (!quiz || !currentUser)
        return;


    try {

        localStorage.setItem(
            getStorageKey(),
            JSON.stringify({
                answers,
                flagged,
                currentQuestionIndex,
                savedAt: Date.now()
            })
        );

    } catch (error) {

        console.warn(
            "Local attempt save failed:",
            error
        );

    }

}


function restoreLocalAttempt() {

    if (!quiz || !currentUser)
        return;


    try {

        const raw =
            localStorage.getItem(
                getStorageKey()
            );


        if (!raw)
            return;


        const saved =
            JSON.parse(raw);


        if (
            saved &&
            typeof saved === "object"
        ) {

            answers =
                saved.answers || {};

            flagged =
                saved.flagged || {};

        }

    } catch (error) {

        console.warn(
            "Could not restore attempt:",
            error
        );

    }

}


// ============================================================
// SUBMIT
// ============================================================

function openSubmitModal() {

    saveCurrentInput();


    const answered =
        questions.filter(
            question => {

                const value =
                    answers[question.id];

                return (
                    value !== undefined &&
                    value !== null &&
                    String(value).trim() !== ""
                );

            }
        ).length;


    $("modalAnswered").textContent =
        `${answered} / ${questions.length}`;


    $("modalRemaining").textContent =
        questions.length - answered;


    $("submitModal")
        ?.classList.remove(
            "hidden"
        );


    refreshIcons();

}


function closeSubmitModal() {

    $("submitModal")
        ?.classList.add(
            "hidden"
        );

}


async function submitQuiz() {

    if (submitting)
        return;


    saveCurrentInput();

    closeSubmitModal();

    submitting = true;

    clearInterval(timerInterval);


    try {

        showLoadingScreen(
            "Submitting your attempt..."
        );


        const result =
            gradeQuiz();


        const submissionId =
            `${currentUser.uid}_${quiz.id}_${Date.now()}`;


        const submissionRef =
            doc(
                db,
                "quizSubmissions",
                submissionId
            );


        // ====================================================
        // SAFE XP AWARD
        // ====================================================

        const xpEarned =
            calculateQuizXP(result);


        const submissionData = {

            studentId:
                currentUser.uid,

            quizId:
                quiz.id,

            courseId:
                quiz.courseId || null,

            instructorId:
                quiz.instructorId || null,

            attemptNumber,

            answers,

            score:
                result.score,

            correct:
                result.correct,

            total:
                result.total,

            passed:
                result.passed,

            completed:
                true,

            status:
                "graded",

            xpEarned,

            submittedAt:
                serverTimestamp()

        };


        await runTransaction(
            db,
            async transaction => {

                const studentRef =
                    doc(
                        db,
                        "students",
                        currentUser.uid
                    );


                const studentSnap =
                    await transaction.get(
                        studentRef
                    );


                const existingSubmission =
                    await transaction.get(
                        submissionRef
                    );


                if (
                    existingSubmission.exists()
                ) {

                    return;

                }


                transaction.set(
                    submissionRef,
                    submissionData
                );


                if (
                    studentSnap.exists()
                ) {

                    const student =
                        studentSnap.data();


                    const currentXP =
                        Number(
                            student.xp || 0
                        );


                    const currentQuizXP =
                        Number(
                            student.quizXP || 0
                        );


                    transaction.update(
                        studentRef,
                        {

                            xp:
                                currentXP +
                                xpEarned,

                            quizXP:
                                currentQuizXP +
                                xpEarned,

                            lastQuizAt:
                                serverTimestamp()

                        }
                    );

                }

            }
        );


        localStorage.removeItem(
            getStorageKey()
        );


        hideLoading();

        showResult(
            result,
            xpEarned
        );


    } catch (error) {

        console.error(
            "❌ Quiz submission failed:",
            error
        );


        hideLoading();

        showToast(
            "Submission failed. Please try again."
        );


        submitting = false;

    }

}


// ============================================================
// GRADING
// ============================================================

function gradeQuiz() {

    let correct = 0;

    const total =
        questions.length;


    questions.forEach(
        question => {

            const studentAnswer =
                answers[question.id];


            if (
                isAnswerCorrect(
                    question,
                    studentAnswer
                )
            ) {

                correct++;

            }

        }
    );


    const score =
        total
            ? Math.round(
                (correct / total) * 100
            )
            : 0;


    const passingScore =
        Number(
            quiz.passingScore || 0
        );


    return {

        correct,

        total,

        score,

        passed:
            score >= passingScore

    };

}


function isAnswerCorrect(
    question,
    studentAnswer
) {

    if (
        studentAnswer === undefined ||
        studentAnswer === null
    ) {

        return false;

    }


    const type =
        String(
            question.type || ""
        ).toLowerCase();


    // Short/code answers are not automatically
    // marked correct unless the instructor provides
    // an exact answer.

    const correctAnswer =
        question.correctAnswer ??
        question.answer ??
        question.correctOption;


    if (
        correctAnswer === undefined ||
        correctAnswer === null
    ) {

        return false;

    }


    return normalizeAnswer(
        studentAnswer
    ) ===
    normalizeAnswer(
        correctAnswer
    );

}


function normalizeAnswer(value) {

    return String(
        value ?? ""
    )
        .trim()
        .toLowerCase();

}


// ============================================================
// XP
// ============================================================

function calculateQuizXP(result) {

    const baseXP =
        Number(
            quiz.xpReward ??
            quiz.xp ??
            50
        );


    if (!result.passed)
        return Math.floor(
            baseXP * 0.25
        );


    const scoreBonus =
        Math.floor(
            baseXP *
            (result.score / 100)
        );


    return Math.max(
        scoreBonus,
        1
    );

}


// ============================================================
// RESULT SCREEN
// ============================================================

function showResult(
    result,
    xpEarned
) {

    $("resultScore").textContent =
        `${result.score}%`;


    $("resultCorrect").textContent =
        result.correct;


    $("resultTotal").textContent =
        result.total;


    $("resultXP").textContent =
        xpEarned;


    if (result.passed) {

        $("resultIcon").textContent =
            "🏆";


        $("resultTitle").textContent =
            "Quiz Passed!";


        $("resultMessage").textContent =
            "Excellent work. Your quiz has been completed successfully.";


        $("resultNextStep").innerHTML =
            `
                <strong>Next challenge unlocked.</strong>
                Keep learning and continue your progress.
            `;

    } else {

        $("resultIcon").textContent =
            "📚";


        $("resultTitle").textContent =
            "Keep Learning";


        $("resultMessage").textContent =
            "Your attempt has been recorded. Review the material and keep improving.";


        $("resultNextStep").innerHTML =
            `
                <strong>Don't give up.</strong>
                Use your remaining attempt wisely.
            `;

    }


    $("retryQuizBtn")
        ?.classList.add(
            "hidden"
        );


    $("quizResultScreen")
        ?.classList.remove(
            "hidden"
        );


    refreshIcons();

}


// ============================================================
// ACCESS SCREEN
// ============================================================

function showAccessScreen(
    title,
    message,
    details = ""
) {

    $("accessTitle").textContent =
        title;


    $("accessMessage").textContent =
        message;


    $("accessDetails").textContent =
        details;


    $("quizAccessScreen")
        ?.classList.remove(
            "hidden"
        );


    refreshIcons();

}


// ============================================================
// LOADING
// ============================================================

function setLoadingMessage(message) {

    const element =
        $("loadingMessage");

    if (element)
        element.textContent =
            message;

}


function showLoadingScreen(message) {

    setLoadingMessage(message);

    $("quizLoadingScreen")
        ?.classList.remove(
            "hidden"
        );

}


function hideLoading() {

    $("quizLoadingScreen")
        ?.classList.add(
            "hidden"
        );

}


// ============================================================
// STATIC EVENTS
// ============================================================

function bindStaticEvents() {

    $("backToQuizzesBtn")
        ?.addEventListener(
            "click",
            () => {

                window.location.href =
                    "quizzes.html";

            }
        );


    $("accessBackBtn")
        ?.addEventListener(
            "click",
            () => {

                window.location.href =
                    "quizzes.html";

            }
        );


    $("previousQuestionBtn")
        ?.addEventListener(
            "click",
            () => {

                saveCurrentInput();

                goToQuestion(
                    currentQuestionIndex - 1
                );

            }
        );


    $("nextQuestionBtn")
        ?.addEventListener(
            "click",
            () => {

                saveCurrentInput();

                if (
                    currentQuestionIndex <
                    questions.length - 1
                ) {

                    goToQuestion(
                        currentQuestionIndex + 1
                    );

                } else {

                    openSubmitModal();

                }

            }
        );


    $("flagQuestionBtn")
        ?.addEventListener(
            "click",
            toggleFlag
        );


    $("submitQuizBtn")
        ?.addEventListener(
            "click",
            openSubmitModal
        );


    $("cancelSubmitBtn")
        ?.addEventListener(
            "click",
            closeSubmitModal
        );


    $("confirmSubmitBtn")
        ?.addEventListener(
            "click",
            submitQuiz
        );


    $("continueLearningBtn")
        ?.addEventListener(
            "click",
            () => {

                window.location.href =
                    "quizzes.html";

            }
        );


    $("retryQuizBtn")
        ?.addEventListener(
            "click",
            () => {

                window.location.reload();

            }
        );


    window.addEventListener(
        "beforeunload",
        event => {

            if (
                !submitting &&
                quiz &&
                questions.length
            ) {

                saveCurrentInput();

                event.preventDefault();

                event.returnValue = "";

            }

        }
    );


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Escape"
            ) {

                closeSubmitModal();

            }

        }
    );

}


// ============================================================
// INITIAL RESTORE
// ============================================================

// Restore only after quiz metadata exists.
// This keeps the attempt state local to the
// current student's current quiz.

const originalSetupQuizUI =
    setupQuizUI;


// ============================================================
// READY
// ============================================================

console.log(
    "%cSSA Take Quiz Engine V1 Ready 🚀",
    "color:#2979FF;font-size:16px;font-weight:700;"
);