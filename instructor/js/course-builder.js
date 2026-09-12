// ============================================================
// SPARK STACK ACADEMY
// COURSE BUILDER ENGINE V1
// ============================================================

import {
    db
} from "../../js/firebase.js";

import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    serverTimestamp,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let instructor = null;
let course = null;
let courseId = null;

let modules = [];
let lessons = [];

let editingModuleId = null;
let editingLessonId = null;

let quizzes = [];
let assignments = [];

// ============================================================
// HELPERS
// ============================================================

const $ = id =>
    document.getElementById(id);


function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}



    function getCourseId() {

    const params =
        new URLSearchParams(
            window.location.search
        );

    return (
        params.get("courseId") ||
        params.get("id")
    );

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
    async () => {

        try {

            courseId = getCourseId();

            if (!courseId) {

                showFatalError(
                    "No course was selected."
                );

                return;

            }


            await waitForInstructor();

            instructor =
                window.currentInstructor;


            if (!instructor) {

                showFatalError(
                    "Instructor authentication unavailable."
                );

                return;

            }


            await loadCourse();

await loadModules();

await loadQuizzes();

await loadAssignments();

setupEvents();

renderBuilder();

refreshIcons();

            console.log(
                "✓ Course Builder loaded"
            );


        } catch (error) {

            console.error(
                "❌ Course Builder error:",
                error
            );

            showFatalError(
                `Unable to load the course builder.<br><br>
                 <strong>${escapeHTML(error?.message || String(error))}</strong>`
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

        const timer =
            setInterval(() => {

                attempts++;


                if (
                    window.currentInstructor
                ) {

                    clearInterval(timer);

                    resolve();

                    return;

                }


                if (
                    attempts >= 100
                ) {

                    clearInterval(timer);

                    resolve();

                }

            }, 100);

    });

}


// ============================================================
// LOAD COURSE
// ============================================================

async function loadCourse() {

    const courseRef =
        doc(
            db,
            "courses",
            courseId
        );


    const snapshot =
        await getDoc(courseRef);


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
        course.instructorId !==
        instructor.uid
    ) {

        throw new Error(
            "You do not own this course."
        );

    }


    renderCourseHeader();

}


// ============================================================
// COURSE HEADER
// ============================================================

function renderCourseHeader() {

    const title =
        course.title ||
        "Untitled Course";


    const description =
        course.description ||
        "Build your learning experience.";


    setText(
        "builderCourseTitle",
        title
    );


    setText(
        "builderCourseDescription",
        description
    );


    setText(
        "overviewCourseName",
        title
    );


    setText(
        "overviewCourseMeta",
        `${course.category || "Technology"} • ${course.level || "Beginner"}`
    );


    updateStatus();

}


// ============================================================
// LOAD MODULES
// ============================================================

async function loadModules() {

    const ref =
        collection(
            db,
            "courseModules"
        );


    const q =
        query(
            ref,
            where(
                "courseId",
                "==",
                courseId
            )
        );


    const snapshot =
        await getDocs(q);


    modules =
        snapshot.docs
            .map(item => ({

                id: item.id,

                ...item.data()

            }))
            .sort(
                sortByOrder
            );


    await loadLessons();

}


// ============================================================
// LOAD LESSONS
// ============================================================

async function loadLessons() {

    if (!modules.length) {

        lessons = [];

        return;

    }


    const ref =
        collection(
            db,
            "courseLessons"
        );


    const q =
        query(
            ref,
            where(
                "courseId",
                "==",
                courseId
            )
        );


    const snapshot =
        await getDocs(q);


    lessons =
        snapshot.docs
            .map(item => ({

                id: item.id,

                ...item.data()

            }))
            .sort(
                sortByOrder
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

    const q =
        query(
            ref,
            where(
                "courseId",
                "==",
                courseId
            )
        );

    const snapshot =
        await getDocs(q);

    quizzes =
        snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

}


// ============================================================
// LOAD ASSIGNMENTS
// ============================================================

async function loadAssignments() {

    const ref =
        collection(
            db,
            "assignments"
        );

    const q =
        query(
            ref,
            where(
                "courseId",
                "==",
                courseId
            )
        );

    const snapshot =
        await getDocs(q);

    assignments =
        snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

}

// ============================================================
// SORT
// ============================================================

function sortByOrder(a, b) {

    return Number(a.order || 0) -
           Number(b.order || 0);

}


// ============================================================
// RENDER BUILDER
// ============================================================

function renderBuilder() {

    renderModules();

    updateCounters();

    updateEmptyState();

    updateStatus();

    refreshIcons();

}


// ============================================================
// RENDER MODULES
// ============================================================

function renderModules() {

    const container =
        $("moduleList");


    if (!container) return;


    if (!modules.length) {

        container.innerHTML = "";

        return;

    }


    container.innerHTML =
        modules
            .map(
                (module, index) =>
                    renderModule(
                        module,
                        index
                    )
            )
            .join("");


    container
        .querySelectorAll(
            "[data-add-lesson]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    openLessonModal(
                        button.dataset.addLesson
                    );

                }
            );

        });


    container
        .querySelectorAll(
            "[data-edit-module]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    openModuleModal(
                        button.dataset.editModule
                    );

                }
            );

        });


    container
        .querySelectorAll(
            "[data-delete-module]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    deleteModule(
                        button.dataset.deleteModule
                    );

                }
            );

        });


    container
        .querySelectorAll(
            "[data-edit-lesson]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    openLessonModal(
                        null,
                        button.dataset.editLesson
                    );

                }
            );

        });


    container
        .querySelectorAll(
            "[data-delete-lesson]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    deleteLesson(
                        button.dataset.deleteLesson
                    );

                }
            );

        });

}


// ============================================================
// MODULE CARD
// ============================================================

function renderModule(
    module,
    index
) {

    const moduleLessons =
        lessons.filter(
            lesson =>
                lesson.moduleId ===
                module.id
        );


    return `

        <article class="module-card">

            <div class="module-header">

                <div class="module-drag">
                    <i data-lucide="grip-vertical"></i>
                </div>


                <div class="module-number">
                    ${index + 1}
                </div>


                <div class="module-info">

                    <h3>
                        ${escapeHTML(
                            module.title ||
                            "Untitled Module"
                        )}
                    </h3>

                    <p>
                        ${escapeHTML(
                            module.description ||
                            "No description"
                        )}
                    </p>

                </div>


                <div class="module-actions">

                    <button
                        type="button"
                        class="module-action"
                        data-edit-module="${module.id}"
                        title="Edit module"
                    >

                        <i data-lucide="square-pen"></i>

                    </button>


                    <button
                        type="button"
                        class="module-action danger"
                        data-delete-module="${module.id}"
                        title="Delete module"
                    >

                        <i data-lucide="trash-2"></i>

                    </button>

                </div>

            </div>


            <div class="lesson-list">

                ${
                    moduleLessons.length

                    ? moduleLessons
                        .map(
                            renderLesson
                        )
                        .join("")

                    : `
                        <p style="
                            margin:12px 0;
                            color:#94a3b8;
                            font-size:12px;
                        ">
                            No lessons yet.
                        </p>
                    `
                }


                <button
                    type="button"
                    class="add-lesson-btn"
                    data-add-lesson="${module.id}"
                >

                    <i data-lucide="plus"></i>

                    Add Lesson

                </button>

            </div>

        </article>

    `;

}


// ============================================================
// LESSON
// ============================================================

function renderLesson(
    lesson
) {

    const icon =
        lesson.type === "video"
            ? "play-circle"
            : lesson.type === "mixed"
                ? "layers-2"
                : "file-text";


    return `

        <div class="lesson-item">

            <div class="lesson-icon">

                <i data-lucide="${icon}"></i>

            </div>


            <div class="lesson-info">

                <strong>
                    ${escapeHTML(
                        lesson.title ||
                        "Untitled Lesson"
                    )}
                </strong>

                <small>
                    ${
                        lesson.duration
                            ? `${lesson.duration} min`
                            : "Lesson"
                    }
                    ${
                        lesson.videoUrl
                            ? " • Video"
                            : ""
                    }
                </small>

            </div>


            <span class="lesson-status ${
                lesson.status === "published"
                    ? "published"
                    : ""
            }">

                ${
                    lesson.status === "published"
                        ? "Published"
                        : "Draft"
                }

            </span>


            <div class="lesson-actions">

                <button
                    type="button"
                    class="lesson-action"
                    data-edit-lesson="${lesson.id}"
                    title="Edit lesson"
                >

                    <i data-lucide="square-pen"></i>

                </button>


                <button
                    type="button"
                    class="lesson-action"
                    data-delete-lesson="${lesson.id}"
                    title="Delete lesson"
                >

                    <i data-lucide="trash-2"></i>

                </button>

            </div>

        </div>

    `;

}


// ============================================================
// EVENTS
// ============================================================

function setupEvents() {

    $("addModuleBtn")
        ?.addEventListener(
            "click",
            () => openModuleModal()
        );


    $("emptyAddModuleBtn")
        ?.addEventListener(
            "click",
            () => openModuleModal()
        );


    $("closeModuleModal")
        ?.addEventListener(
            "click",
            closeModuleModal
        );


    $("cancelModuleBtn")
        ?.addEventListener(
            "click",
            closeModuleModal
        );


    $("moduleModal")
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target.matches(
                        "[data-close-module]"
                    )
                ) {

                    closeModuleModal();

                }

            }
        );


    $("moduleForm")
        ?.addEventListener(
            "submit",
            saveModule
        );


    $("closeLessonModal")
        ?.addEventListener(
            "click",
            closeLessonModal
        );


    $("cancelLessonBtn")
        ?.addEventListener(
            "click",
            closeLessonModal
        );


    $("lessonModal")
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target.matches(
                        "[data-close-lesson]"
                    )
                ) {

                    closeLessonModal();

                }

            }
        );


    $("lessonForm")
        ?.addEventListener(
            "submit",
            saveLesson
        );


    $("quickAddLessonBtn")
        ?.addEventListener(
            "click",
            quickAddLesson
        );


    $("quickAddQuizBtn")
    ?.addEventListener(
        "click",
        () => {

            window.location.href =
                `create-quiz.html?courseId=${encodeURIComponent(courseId)}`;

        }
    );


    $("quickAddAssignmentBtn")
        ?.addEventListener(
            "click",
            () => {

                window.location.href =
                    `create-assignment.html?courseId=${encodeURIComponent(courseId)}`;

            }
        );


    $("saveCourseBtn")
        ?.addEventListener(
            "click",
            saveCourse
        );


    $("previewCourseBtn")
        ?.addEventListener(
            "click",
            previewCourse
        );


    $("publishCourseBtn")
        ?.addEventListener(
            "click",
            publishCourse
        );


    $("sidePublishBtn")
        ?.addEventListener(
            "click",
            publishCourse
        );

}


// ============================================================
// MODULE MODAL
// ============================================================

function openModuleModal(
    id = null
) {

    editingModuleId = id;


    const module =
        modules.find(
            item => item.id === id
        );


    setText(
        "moduleModalTitle",
        module
            ? "Edit Module"
            : "Add Module"
    );


    $("moduleTitle").value =
        module?.title || "";


    $("moduleDescription").value =
        module?.description || "";


    $("moduleStatus").value =
        module?.status || "draft";


    showModal(
        "moduleModal"
    );


    setTimeout(
        () =>
            $("moduleTitle")?.focus(),
        100
    );

}


// ============================================================
// SAVE MODULE
// ============================================================

async function saveModule(
    event
) {

    event.preventDefault();


    const title =
        $("moduleTitle")
            ?.value
            .trim();


    const description =
        $("moduleDescription")
            ?.value
            .trim();


    const status =
        $("moduleStatus")
            ?.value ||
        "draft";


    if (!title) {

        alert(
            "Please enter a module title."
        );

        return;

    }


    const button =
        $("saveModuleBtn");


    try {

        button.disabled = true;

        button.textContent =
            "Saving...";


        const existing =
            modules.find(
                item =>
                    item.id ===
                    editingModuleId
            );


        const data = {

            courseId,

            instructorId:
                instructor.uid,

            title,

            description,

            status,

            order:
                existing?.order ??
                modules.length,

            updatedAt:
                serverTimestamp()

        };


        if (editingModuleId) {

            await updateDoc(

                doc(
                    db,
                    "courseModules",
                    editingModuleId
                ),

                data

            );

        } else {

            await addDoc(

                collection(
                    db,
                    "courseModules"
                ),

                {

                    ...data,

                    createdAt:
                        serverTimestamp()

                }

            );

        }


        closeModuleModal();

        await reloadBuilder();


    } catch (error) {

        console.error(
            "Save module error:",
            error
        );

        alert(
            "Unable to save module."
        );


    } finally {

        button.disabled = false;

        button.innerHTML = `
            <i data-lucide="save"></i>
            Save Module
        `;

        refreshIcons();

    }

}


// ============================================================
// DELETE MODULE
// ============================================================

async function deleteModule(
    id
) {

    const module =
        modules.find(
            item => item.id === id
        );


    if (!module) return;


    const confirmed =
        confirm(
            `Delete "${module.title}"?\n\nAll lessons inside this module will also be deleted.`
        );


    if (!confirmed) return;


    try {

        const moduleLessons =
            lessons.filter(
                lesson =>
                    lesson.moduleId === id
            );


        for (
            const lesson of moduleLessons
        ) {

            await deleteDoc(
                doc(
                    db,
                    "courseLessons",
                    lesson.id
                )
            );

        }


        await deleteDoc(
            doc(
                db,
                "courseModules",
                id
            )
        );


        await reloadBuilder();


    } catch (error) {

        console.error(
            "Delete module error:",
            error
        );

        alert(
            "Unable to delete module."
        );

    }

}


// ============================================================
// LESSON MODAL
// ============================================================

function openLessonModal(
    moduleId = null,
    lessonId = null
) {

    editingLessonId =
        lessonId;


    const lesson =
        lessons.find(
            item =>
                item.id === lessonId
        );


    if (!moduleId && lesson) {

        moduleId =
            lesson.moduleId;

    }


    if (!moduleId) {

        if (!modules.length) {

            alert(
                "Create a module first."
            );

            return;

        }


        moduleId =
            modules[0].id;

    }


    $("lessonModuleId").value =
        moduleId;


    setText(
        "lessonModalTitle",
        lesson
            ? "Edit Lesson"
            : "Add Lesson"
    );


    $("lessonTitle").value =
        lesson?.title || "";


    $("lessonType").value =
        lesson?.type || "text";


    $("lessonDescription").value =
        lesson?.description || "";


    $("lessonContent").value =
        lesson?.content || "";


    $("lessonVideoUrl").value =
        lesson?.videoUrl || "";


    $("lessonDuration").value =
        lesson?.duration || "";


    $("lessonStatus").value =
        lesson?.status || "draft";


    showModal(
        "lessonModal"
    );


    setTimeout(
        () =>
            $("lessonTitle")?.focus(),
        100
    );

}


// ============================================================
// QUICK LESSON
// ============================================================

function quickAddLesson() {

    if (!modules.length) {

        alert(
            "Create a module first."
        );

        return;

    }


    openLessonModal(
        modules[0].id
    );

}


// ============================================================
// SAVE LESSON
// ============================================================

async function saveLesson(
    event
) {

    event.preventDefault();


    const moduleId =
        $("lessonModuleId")
            ?.value;


    const title =
        $("lessonTitle")
            ?.value
            .trim();


    const type =
        $("lessonType")
            ?.value ||
        "text";


    const description =
        $("lessonDescription")
            ?.value
            .trim();


    const content =
        $("lessonContent")
            ?.value
            .trim();


    const videoUrl =
        $("lessonVideoUrl")
            ?.value
            .trim();


    const duration =
        Number(
            $("lessonDuration")
                ?.value || 0
        );


    const status =
        $("lessonStatus")
            ?.value ||
        "draft";


    if (!moduleId) {

        alert(
            "Please select a module."
        );

        return;

    }


    if (!title) {

        alert(
            "Please enter a lesson title."
        );

        return;

    }


    if (
        type === "video" &&
        videoUrl &&
        !isYouTubeUrl(videoUrl)
    ) {

        alert(
            "Please enter a valid YouTube URL."
        );

        return;

    }


    const button =
        $("saveLessonBtn");


    try {

        button.disabled = true;

        button.textContent =
            "Saving...";


        const existing =
            lessons.find(
                item =>
                    item.id ===
                    editingLessonId
            );


        const moduleLessons =
            lessons.filter(
                lesson =>
                    lesson.moduleId ===
                    moduleId &&
                    lesson.id !==
                    editingLessonId
            );


        const data = {

            courseId,

            moduleId,

            instructorId:
                instructor.uid,

            title,

            type,

            description,

            content,

            videoUrl,

            youtubeId:
                extractYouTubeId(
                    videoUrl
                ),

            duration:
                duration > 0
                    ? duration
                    : 0,

            status,

            order:
                existing?.order ??
                moduleLessons.length,

            updatedAt:
                serverTimestamp()

        };


        if (editingLessonId) {

            await updateDoc(

                doc(
                    db,
                    "courseLessons",
                    editingLessonId
                ),

                data

            );

        } else {

            await addDoc(

                collection(
                    db,
                    "courseLessons"
                ),

                {

                    ...data,

                    createdAt:
                        serverTimestamp()

                }

            );

        }


        closeLessonModal();

        await reloadBuilder();


    } catch (error) {

        console.error(
            "Save lesson error:",
            error
        );

        alert(
            "Unable to save lesson."
        );


    } finally {

        button.disabled = false;

        button.innerHTML = `
            <i data-lucide="save"></i>
            Save Lesson
        `;

        refreshIcons();

    }

}


// ============================================================
// DELETE LESSON
// ============================================================

async function deleteLesson(
    id
) {

    const lesson =
        lessons.find(
            item =>
                item.id === id
        );


    if (!lesson) return;


    if (
        !confirm(
            `Delete "${lesson.title}"?`
        )
    ) return;


    try {

        await deleteDoc(
            doc(
                db,
                "courseLessons",
                id
            )
        );


        await reloadBuilder();


    } catch (error) {

        console.error(
            "Delete lesson error:",
            error
        );

        alert(
            "Unable to delete lesson."
        );

    }

}


// ============================================================
// SAVE COURSE
// ============================================================

async function saveCourse() {

    if (!courseId) return;


    try {

        await updateDoc(

            doc(
                db,
                "courses",
                courseId
            ),

            {
                updatedAt:
                    serverTimestamp()
            }

        );


        showToast(
            "Course saved successfully."
        );


    } catch (error) {

        console.error(
            "Save course error:",
            error
        );

        alert(
            "Unable to save course."
        );

    }

}


// ============================================================
// PUBLISH COURSE
// ============================================================

async function publishCourse() {

    if (!modules.length) {

        alert(
            "Add at least one module before publishing."
        );

        return;

    }


    if (!lessons.length) {

        alert(
            "Add at least one lesson before publishing."
        );

        return;

    }


    const confirmed =
        confirm(
            "Publish this course?\n\nStudents will be able to access its published content."
        );


    if (!confirmed) return;


    try {

        await updateDoc(

            doc(
                db,
                "courses",
                courseId
            ),

            {

                status:
                    "published",

                published:
                    true,

                updatedAt:
                    serverTimestamp(),

                publishedAt:
                    serverTimestamp()

            }

        );


        course.status =
            "published";

        course.published =
            true;


        updateStatus();

        showToast(
            "Course published successfully 🚀"
        );


    } catch (error) {

        console.error(
            "Publish course error:",
            error
        );

        alert(
            "Unable to publish course."
        );

    }

}


// ============================================================
// PREVIEW
// ============================================================

function previewCourse() {

    const url =
        `course-preview.html?id=${encodeURIComponent(courseId)}`;


    window.open(
        url,
        "_blank"
    );

}


// ============================================================
// YOUTUBE
// ============================================================

function isYouTubeUrl(
    url
) {

    return Boolean(
        extractYouTubeId(url)
    );

}


function extractYouTubeId(
    url
) {

    if (!url) return "";


    try {

        const parsed =
            new URL(url);


        if (
            parsed.hostname.includes(
                "youtube.com"
            )
        ) {

            return (
                parsed.searchParams.get(
                    "v"
                ) ||
                parsed.pathname
                    .split("/")
                    .filter(Boolean)
                    .pop() ||
                ""
            );

        }


        if (
            parsed.hostname ===
            "youtu.be"
        ) {

            return parsed.pathname
                .split("/")
                .filter(Boolean)
                .pop() || "";

        }


        return "";

    } catch {

        return "";

    }

}


function getYouTubeEmbedUrl(
    url
) {

    const id =
        extractYouTubeId(url);


    if (!id) return "";


    return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;

}


// ============================================================
// MODALS
// ============================================================

function showModal(
    id
) {

    const modal =
        $(id);


    if (!modal) return;


    modal.classList.remove(
        "hidden"
    );


    modal.setAttribute(
        "aria-hidden",
        "false"
    );


    document.body.classList.add(
        "modal-open"
    );


    refreshIcons();

}


function closeModuleModal() {

    const modal =
        $("moduleModal");


    modal?.classList.add(
        "hidden"
    );


    modal?.setAttribute(
        "aria-hidden",
        "true"
    );


    editingModuleId =
        null;


    document.body.classList.remove(
        "modal-open"
    );

}


function closeLessonModal() {

    const modal =
        $("lessonModal");


    modal?.classList.add(
        "hidden"
    );


    modal?.setAttribute(
        "aria-hidden",
        "true"
    );


    editingLessonId =
        null;


    document.body.classList.remove(
        "modal-open"
    );

}


// ============================================================
// COUNTERS
// ============================================================

function updateCounters() {

    setText(
        "moduleCount",
        modules.length
    );

    setText(
        "lessonCount",
        lessons.length
    );

    setText(
        "quizCount",
        quizzes.length
    );

    setText(
        "assignmentCount",
        assignments.length
    );

}

// ============================================================
// EMPTY STATE
// ============================================================

function updateEmptyState() {

    const empty =
        $("builderEmpty");


    if (!empty) return;


    empty.classList.toggle(
        "hidden",
        modules.length > 0
    );

}


// ============================================================
// STATUS
// ============================================================

function updateStatus() {

    const published =
        course?.status ===
        "published";


    const headerStatus =
        $("courseBuilderStatus");


    const sideStatus =
        $("sideCourseStatus");


    if (headerStatus) {

        headerStatus.textContent =
            published
                ? "Published"
                : "Draft";


        headerStatus.className =
            `builder-status ${
                published
                    ? "published"
                    : "draft"
            }`;

    }


    if (sideStatus) {

        sideStatus.className =
            `side-status ${
                published
                    ? "published"
                    : "draft"
            }`;


        sideStatus.innerHTML = `

            <span></span>

            ${
                published
                    ? "Published"
                    : "Draft"
            }

        `;

    }

}


// ============================================================
// RELOAD
// ============================================================

async function reloadBuilder() {

    await loadModules();

    await loadQuizzes();

    await loadAssignments();

    renderBuilder();

}


// ============================================================
// UI
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


function showToast(
    message
) {

    let toast =
        $("builderToast");


    if (!toast) {

        toast =
            document.createElement(
                "div"
            );


        toast.id =
            "builderToast";


        toast.style.cssText = `
            position:fixed;
            right:24px;
            bottom:24px;
            z-index:10000;
            padding:13px 17px;
            border-radius:10px;
            background:#081c3a;
            color:#fff;
            font:600 13px Poppins,sans-serif;
            box-shadow:0 12px 30px rgba(0,0,0,.2);
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


function showFatalError(
    message
) {

    const container =
        $("moduleList");


    if (!container) {

        alert(message);

        return;

    }


    container.innerHTML = `

        <div style="
            padding:40px;
            text-align:center;
            color:#64748b;
        ">

            <i data-lucide="alert-circle"></i>

            <h3 style="
                color:#0f172a;
                margin:12px 0 6px;
            ">
                Something went wrong
            </h3>

            <p>
                ${escapeHTML(message)}
            </p>

        </div>

    `;


    refreshIcons();

}