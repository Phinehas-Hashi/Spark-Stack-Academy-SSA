// ============================================================
// SPARK STACK ACADEMY
// INSTRUCTOR PORTAL
// QUIZZES WORKSPACE
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
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let instructor = null;
let courseId = null;
let course = null;

let quizzes = [];
let submissions = [];

let currentFilter = "all";
let searchTerm = "";


// ============================================================
// HELPERS
// ============================================================

const $ = id =>
    document.getElementById(id);


function getCourseId() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return (
        params.get("courseId") ||
        params.get("id") ||
        null
    );

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
                        "Please sign in to access quizzes."
                    );

                    return;

                }

                instructor = user;

                window.currentInstructor =
                    user;

                courseId =
                    getCourseId();

                try {

                    await loadCourse();

                    await loadQuizzes();

                    await loadSubmissions();

                    setupEvents();

                    renderPage();

                    refreshIcons();

                    console.log(
                        "✓ Quizzes workspace loaded"
                    );

                } catch (error) {

                    console.error(
                        "❌ Quizzes error:",
                        error
                    );

                    showError(
                        "Unable to load quizzes."
                    );

                }

            }
        );

    }
);


// ============================================================
// LOAD COURSE
// ============================================================

async function loadCourse() {

    if (!courseId) {

        setText(
            "courseName",
            "All Courses"
        );

        return;

    }


    const snapshot =
        await getDoc(
            doc(
                db,
                "courses",
                courseId
            )
        );


    if (!snapshot.exists()) {

        throw new Error(
            "Course not found."
        );

    }


    course = {

        id: snapshot.id,

        ...snapshot.data()

    };


    if (
        course.instructorId &&
        course.instructorId !== instructor.uid
    ) {

        throw new Error(
            "You do not own this course."
        );

    }


    setText(
        "courseName",
        course.title ||
        "Untitled Course"
    );


    setText(
        "courseCategory",
        course.category ||
        "Technology"
    );


    setText(
        "courseLevel",
        course.level ||
        "Beginner"
    );

}


// ============================================================
// LOAD QUIZZES
// ============================================================

async function loadQuizzes() {

    const ref =
        collection(
            db,
            "quizzes"
        );


    let snapshot;


    if (courseId) {

        const q =
            query(
                ref,
                where("courseId", "==", courseId),
                where("instructorId", "==", instructor.uid)
            );

        snapshot =
            await getDocs(q);

    } else {

        const q =
            query(
                ref,
                where(
                    "instructorId",
                    "==",
                    instructor.uid
                )
            );

        snapshot =
            await getDocs(q);

    }


    quizzes =
        snapshot.docs
            .map(item => ({

                id: item.id,

                ...item.data()

            }))
            .filter(
                quiz =>
                    !quiz.instructorId ||
                    quiz.instructorId ===
                    instructor.uid
            );


    quizzes.sort(
        (a, b) =>
            getTime(
                b.createdAt
            ) -
            getTime(
                a.createdAt
            )
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


    let snapshot;


    if (courseId) {

        const q =
            query(
                ref,
                where(
                    "courseId",
                    "==",
                    courseId
                )
            );

        snapshot =
            await getDocs(q);

    } else {

        const q =
            query(
                ref,
                where(
                    "instructorId",
                    "==",
                    instructor.uid
                )
            );

        snapshot =
            await getDocs(q);

    }


    submissions =
        snapshot.docs
            .map(item => ({

                id: item.id,

                ...item.data()

            }));

}


// ============================================================
// RENDER PAGE
// ============================================================

function renderPage() {

    updateStats();

    renderQuizList();

    updateQuizCount();

    refreshIcons();

}


// ============================================================
// STATS
// ============================================================

function updateStats() {

    const total =
        quizzes.length;


    const published =
        quizzes.filter(
            quiz =>
                String(
                    quiz.status || ""
                ).toLowerCase() ===
                "published"
        ).length;


    const quizIds =
        new Set(
            quizzes.map(
                quiz => quiz.id
            )
        );


    const courseSubmissions =
        submissions.filter(
            submission =>
                quizIds.has(
                    submission.quizId
                )
        );


    const totalSubmissions =
        courseSubmissions.length;


    const graded =
        courseSubmissions.filter(
            isGraded
        ).length;


    const pending =
        totalSubmissions -
        graded;


    setText(
        "totalQuizzes",
        total
    );


    setText(
        "publishedQuizzes",
        published
    );


    setText(
        "totalSubmissions",
        totalSubmissions
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

function isGraded(
    submission
) {

    const status =
        String(
            submission.status || ""
        ).toLowerCase();


    return (
        status === "graded" ||
        status === "reviewed" ||
        submission.graded === true ||
        submission.score !== undefined &&
        submission.score !== null
    );

}


// ============================================================
// FILTER
// ============================================================

function getFilteredQuizzes() {

    return quizzes.filter(
        quiz => {

            const status =
                String(
                    quiz.status ||
                    "draft"
                ).toLowerCase();


            if (
                currentFilter ===
                "published" &&
                status !== "published"
            ) {

                return false;

            }


            if (
                currentFilter ===
                "draft" &&
                status !== "draft"
            ) {

                return false;

            }


            if (searchTerm) {

                const title =
                    String(
                        quiz.title || ""
                    ).toLowerCase();


                const description =
                    String(
                        quiz.description ||
                        ""
                    ).toLowerCase();


                if (
                    !title.includes(
                        searchTerm
                    ) &&
                    !description.includes(
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
// RENDER QUIZ LIST
// ============================================================

function renderQuizList() {

    const list =
        $("quizList");


    const empty =
        $("quizEmpty");


    const searchEmpty =
        $("quizSearchEmpty");


    if (!list) return;


    const filtered =
        getFilteredQuizzes();


    list.innerHTML = "";


    if (!filtered.length) {

        if (searchTerm) {

            empty?.classList.add(
                "hidden"
            );

            searchEmpty?.classList.remove(
                "hidden"
            );

        } else {

            searchEmpty?.classList.add(
                "hidden"
            );

            empty?.classList.toggle(
                "hidden",
                quizzes.length > 0
            );

            if (!quizzes.length) {

                empty?.classList.remove(
                    "hidden"
                );

            }

        }

        refreshIcons();

        return;

    }


    empty?.classList.add(
        "hidden"
    );


    searchEmpty?.classList.add(
        "hidden"
    );


    list.innerHTML =
        filtered
            .map(
                renderQuiz
            )
            .join("");


    attachQuizEvents();

    refreshIcons();

}


// ============================================================
// QUIZ CARD
// ============================================================

function renderQuiz(
    quiz
) {

    const status =
        String(
            quiz.status ||
            "draft"
        ).toLowerCase();


    const quizSubmissions =
        submissions.filter(
            submission =>
                submission.quizId ===
                quiz.id
        );


    const graded =
        quizSubmissions.filter(
            isGraded
        ).length;


    const pending =
        quizSubmissions.length -
        graded;


    const questions =
        quiz.questions?.length ??
        quiz.questionCount ??
        quiz.totalQuestions ??
        0;


    const passingScore =
        quiz.passingScore ??
        70;


    return `

        <article
            class="quiz-card"
            data-quiz-id="${escapeHTML(
                quiz.id
            )}"
        >

            <div class="quiz-card-main">

                <div class="quiz-card-icon">

                    <i data-lucide="clipboard-check"></i>

                </div>


                <div class="quiz-card-info">

                    <div class="quiz-card-top">

                        <h3>
                            ${escapeHTML(
                                quiz.title ||
                                "Untitled Quiz"
                            )}
                        </h3>


                        <span
                            class="quiz-status ${escapeHTML(
                                status
                            )}"
                        >

                            ${
                                status ===
                                "published"
                                    ? "Published"
                                    : "Draft"
                            }

                        </span>

                    </div>


                    <p>

                        ${escapeHTML(
                            quiz.description ||
                            "No quiz description."
                        )}

                    </p>


                    <div class="quiz-meta">

                        <span>

                            <i data-lucide="list-checks"></i>

                            ${questions}
                            ${
                                questions === 1
                                    ? "Question"
                                    : "Questions"
                            }

                        </span>


                        <span>

                            <i data-lucide="target"></i>

                            Pass:
                            ${escapeHTML(
                                String(
                                    passingScore
                                )
                            )}%

                        </span>


                        <span>

                            <i data-lucide="clock-3"></i>

                            ${
                                quiz.duration
                                    ? `${escapeHTML(
                                        String(
                                            quiz.duration
                                        )
                                    )} min`
                                    : "No limit"
                            }

                        </span>

                    </div>

                </div>

            </div>


            <div class="quiz-card-stats">

                <div>

                    <span>
                        Submissions
                    </span>

                    <strong>
                        ${quizSubmissions.length}
                    </strong>

                </div>


                <div>

                    <span>
                        Pending
                    </span>

                    <strong>
                        ${pending}
                    </strong>

                </div>


                <div>

                    <span>
                        Graded
                    </span>

                    <strong>
                        ${graded}
                    </strong>

                </div>

            </div>


            <div class="quiz-card-actions">

                <button
                    type="button"
                    class="quiz-action"
                    data-view-quiz="${escapeHTML(
                        quiz.id
                    )}"
                    title="View quiz"
                >

                    <i data-lucide="eye"></i>

                </button>


                <button
                    type="button"
                    class="quiz-action"
                    data-edit-quiz="${escapeHTML(
                        quiz.id
                    )}"
                    title="Edit quiz"
                >

                    <i data-lucide="square-pen"></i>

                </button>


                <button
                    type="button"
                    class="quiz-action"
                    data-delete-quiz="${escapeHTML(
                        quiz.id
                    )}"
                    title="Delete quiz"
                >

                    <i data-lucide="trash-2"></i>

                </button>

            </div>

        </article>

    `;

}


// ============================================================
// EVENTS
// ============================================================

function attachQuizEvents() {

    document
        .querySelectorAll(
            "[data-view-quiz]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const id =
                        button.dataset.viewQuiz;

                    window.location.href =
                        `quiz.html?id=${encodeURIComponent(
                            id
                        )}`;

                }
            );

        });


    document
        .querySelectorAll(
            "[data-edit-quiz]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const id =
                        button.dataset.editQuiz;

                    window.location.href =
                        `create-quiz.html?quizId=${encodeURIComponent(
                            id
                        )}&courseId=${encodeURIComponent(
                            courseId || ""
                        )}`;

                }
            );

        });


    document
        .querySelectorAll(
            "[data-delete-quiz]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    deleteQuiz(
                        button.dataset.deleteQuiz
                    );

                }
            );

        });

}


// ============================================================
// SETUP EVENTS
// ============================================================

function setupEvents() {

    $("createQuizBtn")
        ?.addEventListener(
            "click",
            createQuiz
        );


    $("emptyCreateQuizBtn")
        ?.addEventListener(
            "click",
            createQuiz
        );


    document
        .querySelectorAll(
            ".quiz-filter"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            ".quiz-filter"
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


                    renderQuizList();

                    updateQuizCount();

                }
            );

        });


    $("quizSearch")
        ?.addEventListener(
            "input",
            event => {

                searchTerm =
                    event.target.value
                        .trim()
                        .toLowerCase();


                renderQuizList();

                updateQuizCount();

            }
        );

}


// ============================================================
// CREATE QUIZ
// ============================================================

function createQuiz() {

    if (!courseId) {

        window.location.href =
            "create-quiz.html";

        return;

    }


    window.location.href =
        `create-quiz.html?courseId=${encodeURIComponent(
            courseId
        )}`;

}


// ============================================================
// DELETE QUIZ
// ============================================================

async function deleteQuiz(
    id
) {

    const quiz =
        quizzes.find(
            item =>
                item.id === id
        );


    if (!quiz) return;


    const confirmed =
        confirm(
            `Delete "${quiz.title || "this quiz"}"?\n\nThis action cannot be undone.`
        );


    if (!confirmed) return;


    try {

        await deleteDoc(
            doc(
                db,
                "quizzes",
                id
            )
        );


        quizzes =
            quizzes.filter(
                item =>
                    item.id !== id
            );


        submissions =
            submissions.filter(
                item =>
                    item.quizId !== id
            );


        renderPage();

        showToast(
            "Quiz deleted successfully."
        );


    } catch (error) {

        console.error(
            "Delete quiz error:",
            error
        );

        alert(
            "Unable to delete quiz."
        );

    }

}


// ============================================================
// COUNT
// ============================================================

function updateQuizCount() {

    const count =
        getFilteredQuizzes().length;


    const element =
        $("quizCount");


    if (!element) return;


    element.textContent =
        `${count} ${
            count === 1
                ? "quiz"
                : "quizzes"
        }`;

}


// ============================================================
// ERROR
// ============================================================

function showError(
    message
) {

    setText(
        "courseName",
        "Unable to load"
    );


    setText(
        "courseCategory",
        "—"
    );


    setText(
        "courseLevel",
        "—"
    );


    const list =
        $("quizList");


    if (list) {

        list.innerHTML = `

            <div class="quiz-error">

                <i data-lucide="alert-circle"></i>

                <h3>
                    Something went wrong
                </h3>

                <p>
                    ${escapeHTML(
                        message
                    )}
                </p>

            </div>

        `;

    }


    refreshIcons();

}


// ============================================================
// DATE
// ============================================================

function convertDate(
    value
) {

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


function getTime(value) {

    const date =
        convertDate(value);


    return date
        ? date.getTime()
        : 0;

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
// TOAST
// ============================================================

function showToast(
    message
) {

    let toast =
        $("quizToast");


    if (!toast) {

        toast =
            document.createElement(
                "div"
            );


        toast.id =
            "quizToast";


        toast.className =
            "quiz-toast";


        document.body.appendChild(
            toast
        );

    }


    toast.textContent =
        message;


    toast.classList.add(
        "show"
    );


    clearTimeout(
        toast._timer
    );


    toast._timer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            3000
        );

}


// ============================================================
// LUCIDE
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