// ============================================================
// SPARK STACK ACADEMY
// INSTRUCTOR COURSES
// COURSE MANAGEMENT ENGINE V3
// ============================================================

import {
    app,
    db
} from "../../js/firebase.js";

import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let instructor = null;
let courses = [];
let currentFilter = "all";
let editingCourseId = null;
let courseStudentCounts = {};

const functions = getFunctions(app);
const getInstructorCourseEnrollmentStats = httpsCallable(
    functions,
    "getInstructorCourseEnrollmentStats"
);


// ============================================================
// HELPERS
// ============================================================

const $ = id => document.getElementById(id);


function setText(id, value) {

    const element = $(id);

    if (element) {
        element.textContent = value;
    }

}


function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function formatNumber(value) {

    return new Intl.NumberFormat("en-KE")
        .format(Number(value) || 0);

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
    initCourses
);


async function initCourses() {

    try {

        await waitForInstructor();

        instructor = window.currentInstructor;

        if (!instructor) {

            showCourseError(
                "Instructor authentication unavailable."
            );

            return;

        }


        setupEvents();

        await loadCourses();

        await loadStudentCount();

        refreshIcons();


        console.log(
            "✓ Instructor Courses V3 loaded"
        );

    } catch (error) {

        console.error(
            "❌ Courses boot error:",
            error
        );

        showCourseError(
            "Unable to load your courses."
        );

    }

}


// ============================================================
// AUTH
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

    $("createCourseBtn")
        ?.addEventListener(
            "click",
            () => openCourseModal()
        );


    $("emptyCreateCourseBtn")
        ?.addEventListener(
            "click",
            () => openCourseModal()
        );


    $("courseSearch")
        ?.addEventListener(
            "input",
            renderCourses
        );


    document
        .querySelectorAll(".course-filter")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(".course-filter")
                        .forEach(btn => {

                            btn.classList.remove(
                                "active"
                            );

                        });


                    button.classList.add(
                        "active"
                    );


                    currentFilter =
                        button.dataset.filter ||
                        "all";


                    renderCourses();

                }
            );

        });


    document.addEventListener(
        "click",
        handleCourseActions
    );

}


// ============================================================
// COURSE ACTIONS
// ============================================================

function handleCourseActions(event) {

    const builderButton =
        event.target.closest(
            "[data-open-builder]"
        );


    if (builderButton) {

        openBuilder(
            builderButton.dataset.openBuilder
        );

        return;

    }


    const editButton =
        event.target.closest(
            "[data-edit-course]"
        );


    if (editButton) {

        const course =
            courses.find(
                item =>
                    item.id ===
                    editButton.dataset.editCourse
            );


        if (course) {

            openCourseModal(course);

        }

        return;

    }


    const deleteButton =
        event.target.closest(
            "[data-delete-course]"
        );


    if (deleteButton) {

        deleteCourse(
            deleteButton.dataset.deleteCourse
        );

    }

}


// ============================================================
// LOAD COURSES
// ============================================================

async function loadCourses() {

    const grid =
        $("courseGrid");


    try {

        const coursesRef =
            collection(
                db,
                "courses"
            );


        const q =
            query(
                coursesRef,
                where(
                    "instructorId",
                    "==",
                    instructor.uid
                )
            );


        const snapshot =
            await getDocs(q);


        courses =
            snapshot.docs
                .map(item => ({

                    id: item.id,

                    ...item.data()

                }))
                .sort(
                    (a, b) => {

                        const aTime =
                            a.createdAt?.seconds ||
                            0;

                        const bTime =
                            b.createdAt?.seconds ||
                            0;

                        return bTime - aTime;

                    }
                );


        updateStats();

        renderCourses();


    } catch (error) {

        console.error(
            "❌ Failed to load courses:",
            error
        );


        if (grid) {

            grid.innerHTML = `

                <div class="course-error">

                    <i data-lucide="alert-circle"></i>

                    <h3>
                        Unable to load courses
                    </h3>

                    <p>
                        Please refresh and try again.
                    </p>

                </div>

            `;

        }


        refreshIcons();

    }

}


// ============================================================
// STATS
// ============================================================

function updateStats() {

    const published =
        courses.filter(
            course =>
                course.status === "published"
        );


    const drafts =
        courses.filter(
            course =>
                course.status !== "published"
        );


    setText(
        "totalCourses",
        courses.length
    );


    setText(
        "publishedCourses",
        published.length
    );


    setText(
        "draftCourses",
        drafts.length
    );

}


// ============================================================
// STUDENTS
// ============================================================
async function loadStudentCount() {
    try {
        const response = await getInstructorCourseEnrollmentStats();
        const data = response.data || {};

        courseStudentCounts = Object.fromEntries(
            Object.entries(data.courseStudentCounts || {}).map(([courseId, count]) => [
                courseId,
                Math.max(0, Number(count) || 0)
            ])
        );

        setText("totalStudents", Math.max(0, Number(data.totalStudents) || 0));
        renderCourses();
    } catch (error) {
        console.warn("Instructor enrolment statistics unavailable:", error);
        courseStudentCounts = {};
        setText("totalStudents", "—");
        renderCourses();
    }
}

// ============================================================
// RENDER COURSES
// ============================================================

function renderCourses() {

    const grid =
        $("courseGrid");


    const empty =
        $("courseEmpty");


    if (!grid) return;


    const search =
        (
            $("courseSearch")
                ?.value ||
            ""
        )
            .trim()
            .toLowerCase();


    const filtered =
        courses.filter(course => {

            const status =
                course.status === "published"
                    ? "published"
                    : "draft";


            const matchesFilter =
                currentFilter === "all" ||
                currentFilter === status;


            const title =
                String(
                    course.title || ""
                ).toLowerCase();


            const description =
                String(
                    course.description || ""
                ).toLowerCase();


            const category =
                String(
                    course.category || ""
                ).toLowerCase();


            return (
                matchesFilter &&
                (
                    !search ||
                    title.includes(search) ||
                    description.includes(search) ||
                    category.includes(search)
                )
            );

        });


    if (!filtered.length) {
        grid.innerHTML = "";

        if (empty) {
            const title = empty.querySelector("h3");
            const description = empty.querySelector("p");
            const createButton = $("emptyCreateCourseBtn");

            if (search) {
                if (title) title.textContent = "No matching courses";
                if (description) description.textContent = "Try a different search term or clear your search.";
                if (createButton) createButton.hidden = true;
            } else if (courses.length && currentFilter !== "all") {
                if (title) title.textContent = currentFilter === "published"
                    ? "No published courses yet"
                    : "No draft courses";
                if (description) description.textContent = "Create a course or switch to another filter.";
                if (createButton) createButton.hidden = false;
            } else {
                if (title) title.textContent = "No courses yet";
                if (description) description.textContent = "Create your first course and start teaching.";
                if (createButton) createButton.hidden = false;
            }

            empty.classList.remove("hidden");
        }

        refreshIcons();
        return;
    }


    empty?.classList.add(
        "hidden"
    );

    const emptyCreateButton = $("emptyCreateCourseBtn");
    if (emptyCreateButton) emptyCreateButton.hidden = false;


    grid.innerHTML =
        filtered
            .map(renderCourseCard)
            .join("");


    refreshIcons();

}


// ============================================================
// COURSE CARD
// ============================================================

function renderCourseCard(course) {

    const published =
        course.status === "published";


    const price =
        Number(course.price || 0);


    const discount =
        Number(course.discountPrice || 0);


    const finalPrice =
        discount > 0
            ? discount
            : price;


    let priceHTML;


    if (
        course.isFree ||
        finalPrice <= 0
    ) {

        priceHTML = `

            <strong class="course-price">
                FREE
            </strong>

        `;

    } else {

        priceHTML = `

            <strong class="course-price">
                KSh ${formatNumber(finalPrice)}
            </strong>

            ${
                discount > 0 &&
                discount < price

                ? `
                    <del>
                        KSh ${formatNumber(price)}
                    </del>
                `

                : ""
            }

        `;

    }


    return `

        <article class="course-card">

            <div class="course-card-top">

                <div class="course-cover">

                    <i data-lucide="book-open"></i>

                </div>


                <span class="course-status ${
                    published
                        ? "published"
                        : "draft"
                }">

                    ${
                        published
                            ? "Published"
                            : "Draft"
                    }

                </span>

            </div>


            <div class="course-card-body">

                <span class="course-category">

                    ${escapeHTML(
                        course.category ||
                        "Technology"
                    )}

                </span>


                <h3>

                    ${escapeHTML(
                        course.title ||
                        "Untitled Course"
                    )}

                </h3>


                <p>

                    ${escapeHTML(
                        course.description ||
                        "No description provided."
                    )}

                </p>


                <div class="course-meta">

                    <span>

                        <i data-lucide="signal"></i>

                        ${escapeHTML(
                            course.level ||
                            "Beginner"
                        )}

                    </span>


                    <span>

                        <i data-lucide="users"></i>

                        ${formatNumber(
    courseStudentCounts[course.id] || 0
)}
                    </span>

                </div>


                <div class="course-pricing">

                    ${priceHTML}

                </div>

            </div>


            <div class="course-card-actions">

                <button
                    type="button"
                    class="course-action primary"
                    data-open-builder="${course.id}"
                >

                    <i data-lucide="blocks"></i>

                    Course Builder

                </button>


                <button
                    type="button"
                    class="course-action"
                    data-edit-course="${course.id}"
                >

                    <i data-lucide="square-pen"></i>

                    Edit

                </button>


                <button
                    type="button"
                    class="course-action danger"
                    data-delete-course="${course.id}"
                >

                    <i data-lucide="trash-2"></i>

                    Delete

                </button>

            </div>

        </article>

    `;

}


// ============================================================
// COURSE MODAL
// ============================================================

function openCourseModal(course = null) {

    editingCourseId =
        course?.id || null;


    const modal =
        createCourseModal();


    setText(
        "courseModalTitle",
        editingCourseId
            ? "Edit Course"
            : "Create Course"
    );


    $("courseTitle").value =
        course?.title || "";


    $("courseDescription").value =
        course?.description || "";


    $("courseCategory").value =
        course?.category ||
        "Technology";


    $("courseLevel").value =
        course?.level ||
        "Beginner";


    $("coursePrice").value =
        course?.price || 0;


    $("courseDiscount").value =
        course?.discountPrice || "";


    $("courseFree").checked =
        course?.isFree === true;


    $("courseStatus").value =
        course?.status ||
        "draft";


    togglePricing();


    modal.classList.add(
        "open"
    );


    document.body.classList.add(
        "modal-open"
    );


    setTimeout(
        () =>
            $("courseTitle")?.focus(),
        100
    );

}


// ============================================================
// CREATE MODAL
// ============================================================

function createCourseModal() {

    let modal =
        $("courseModal");


    if (modal) return modal;


    modal =
        document.createElement(
            "div"
        );


    modal.id =
        "courseModal";


    modal.className =
        "course-modal";


    modal.innerHTML = `

        <div
            class="course-modal-backdrop"
            data-close-modal
        ></div>


        <div class="course-modal-content">

            <div class="course-modal-header">

                <div>

                    <span>
                        COURSE SETUP
                    </span>

                    <h2 id="courseModalTitle">
                        Create Course
                    </h2>

                </div>


                <button
                    type="button"
                    class="modal-close"
                    id="closeCourseModal"
                    aria-label="Close"
                >

                    <i data-lucide="x"></i>

                </button>

            </div>


            <form id="courseForm">

                <div class="form-group">

                    <label for="courseTitle">
                        Course Title
                    </label>

                    <input
                        id="courseTitle"
                        type="text"
                        placeholder="e.g. Full Stack Web Development"
                        required
                    >

                </div>


                <div class="form-group">

                    <label for="courseDescription">
                        Description
                    </label>

                    <textarea
                        id="courseDescription"
                        rows="4"
                        placeholder="What will students learn?"
                        required
                    ></textarea>

                </div>


                <div class="form-row">

                    <div class="form-group">

                        <label for="courseCategory">
                            Category
                        </label>

                        <select id="courseCategory">

                            <option value="Technology">
                                Technology
                            </option>

                            <option value="Programming">
                                Programming
                            </option>

                            <option value="Web Development">
                                Web Development
                            </option>

                            <option value="Mobile Development">
                                Mobile Development
                            </option>

                            <option value="Business">
                                Business
                            </option>

                            <option value="Design">
                                Design
                            </option>

                        </select>

                    </div>


                    <div class="form-group">

                        <label for="courseLevel">
                            Level
                        </label>

                        <select id="courseLevel">

                            <option value="Beginner">
                                Beginner
                            </option>

                            <option value="Intermediate">
                                Intermediate
                            </option>

                            <option value="Advanced">
                                Advanced
                            </option>

                        </select>

                    </div>

                </div>


                <div class="pricing-box">

                    <div class="pricing-header">

                        <div>

                            <strong>
                                Pricing
                            </strong>

                            <span>
                                Set the student price.
                            </span>

                        </div>


                        <label class="switch">

                            <input
                                type="checkbox"
                                id="courseFree"
                            >

                            <span>
                                Free Course
                            </span>

                        </label>

                    </div>


                    <div class="form-row">

                        <div class="form-group">

                            <label for="coursePrice">
                                Price (KSh)
                            </label>

                            <input
                                id="coursePrice"
                                type="number"
                                min="0"
                                step="50"
                                value="0"
                            >

                        </div>


                        <div class="form-group">

                            <label for="courseDiscount">
                                Discount (KSh)
                            </label>

                            <input
                                id="courseDiscount"
                                type="number"
                                min="0"
                                step="50"
                            >

                        </div>

                    </div>

                </div>


                <div class="form-group">

                    <label for="courseStatus">
                        Initial Status
                    </label>

                    <select id="courseStatus">

                        <option value="draft">
                            Save as Draft
                        </option>

                        <option value="published">
                            Publish Course
                        </option>

                    </select>

                </div>


                <div
                    id="courseFormMessage"
                    class="form-message"
                    hidden
                ></div>


                <div class="modal-actions">

                    <button
                        type="button"
                        id="cancelCourseBtn"
                        class="secondary-btn"
                    >
                        Cancel
                    </button>


                    <button
                        type="submit"
                        id="saveCourseBtn"
                        class="primary-btn"
                    >

                        <i data-lucide="arrow-right"></i>

                        Continue to Builder

                    </button>

                </div>

            </form>

        </div>

    `;


    document.body.appendChild(
        modal
    );


    $("closeCourseModal")
        ?.addEventListener(
            "click",
            closeCourseModal
        );


    $("cancelCourseBtn")
        ?.addEventListener(
            "click",
            closeCourseModal
        );


    modal.addEventListener(
        "click",
        event => {

            if (
                event.target.closest(
                    "[data-close-modal]"
                )
            ) {

                closeCourseModal();

            }

        }
    );


    $("courseForm")
        ?.addEventListener(
            "submit",
            saveCourse
        );


    $("courseFree")
        ?.addEventListener(
            "change",
            togglePricing
        );


    refreshIcons();


    return modal;

}


// ============================================================
// PRICING
// ============================================================

function togglePricing() {

    const free =
        $("courseFree")?.checked;


    const price =
        $("coursePrice");


    const discount =
        $("courseDiscount");


    if (price) {

        price.disabled =
            free;

        if (free) {
            price.value = 0;
        }

    }


    if (discount) {

        discount.disabled =
            free;

        if (free) {
            discount.value = "";
        }

    }

}


// ============================================================
// SAVE COURSE
// ============================================================

async function saveCourse(event) {

    event.preventDefault();


    const title =
        $("courseTitle")
            ?.value
            .trim();


    const description =
        $("courseDescription")
            ?.value
            .trim();


    const category =
        $("courseCategory")
            ?.value ||
        "Technology";


    const level =
        $("courseLevel")
            ?.value ||
        "Beginner";


    const isFree =
        $("courseFree")
            ?.checked ||
        false;


    const price =
        isFree
            ? 0
            : Number(
                $("coursePrice")
                    ?.value ||
                0
            );


    const discountPrice =
        isFree
            ? 0
            : Number(
                $("courseDiscount")
                    ?.value ||
                0
            );


    const status =
        $("courseStatus")
            ?.value ||
        "draft";


    // ========================================================
    // VALIDATION
    // ========================================================

    if (!title) {

        showFormMessage(
            "Please enter a course title.",
            "error"
        );

        return;

    }


    if (!description) {

        showFormMessage(
            "Please enter a course description.",
            "error"
        );

        return;

    }


    if (
        !isFree &&
        (
            !Number.isFinite(price) ||
            price <= 0
        )
    ) {

        showFormMessage(
            "Enter a valid course price or make it free.",
            "error"
        );

        return;

    }


    if (
        discountPrice > 0 &&
        discountPrice >= price
    ) {

        showFormMessage(
            "Discount price must be lower than the original price.",
            "error"
        );

        return;

    }


    const button =
        $("saveCourseBtn");


    try {

        button.disabled = true;


        button.innerHTML = `
            <span class="loading-spinner"></span>
            Saving...
        `;


        const existing =
            editingCourseId
                ? courses.find(
                    item =>
                        item.id ===
                        editingCourseId
                )
                : null;


        const courseData = {

            instructorId:
                instructor.uid,

            instructorName:
                instructor.displayName ||
                instructor.name ||
                "Instructor",

            title,

            description,

            category,

            level,

            isFree,

            price,

            discountPrice,

            status,

            published:
                status === "published",

            studentCount:
                existing?.studentCount ||
                0,

            moduleCount:
                existing?.moduleCount ||
                0,

            lessonCount:
                existing?.lessonCount ||
                0,

            updatedAt:
                serverTimestamp()

        };


        let savedCourseId;


        // ====================================================
        // UPDATE
        // ====================================================

        if (editingCourseId) {

            await updateDoc(

                doc(
                    db,
                    "courses",
                    editingCourseId
                ),

                courseData

            );


            savedCourseId =
                editingCourseId;

        }


        // ====================================================
        // CREATE
        // ====================================================

        else {

            const courseRef =
                await addDoc(

                    collection(
                        db,
                        "courses"
                    ),

                    {

                        ...courseData,

                        createdAt:
                            serverTimestamp()

                    }

                );


            savedCourseId =
                courseRef.id;

        }


        console.log(
            "✓ Course saved:",
            savedCourseId
        );


        closeCourseModal();


        // ====================================================
        // IMPORTANT
        // BUILDER EXPECTS ?id=
        // ====================================================

        window.location.href =
            `course-builder.html?id=${encodeURIComponent(
                savedCourseId
            )}`;


    } catch (error) {

        console.error(
            "❌ Failed to save course:",
            error
        );


        showFormMessage(
            "Unable to save course. Please try again.",
            "error"
        );


        button.disabled = false;


        button.innerHTML = `
            <i data-lucide="arrow-right"></i>
            Continue to Builder
        `;


        refreshIcons();

    }

}


// ============================================================
// DELETE COURSE
// ============================================================

async function deleteCourse(id) {

    const course =
        courses.find(
            item =>
                item.id === id
        );


    if (!course) return;


    const confirmed =
        confirm(
            `Delete "${course.title || "this course"}"?\n\nThis cannot be undone.`
        );


    if (!confirmed) return;


    try {

        await deleteDoc(

            doc(
                db,
                "courses",
                id
            )

        );


        courses =
            courses.filter(
                item =>
                    item.id !== id
            );


        updateStats();

        renderCourses();


        console.log(
            "✓ Course deleted:",
            id
        );


    } catch (error) {

        console.error(
            "❌ Failed to delete course:",
            error
        );


        alert(
            "Unable to delete course."
        );

    }

}


// ============================================================
// BUILDER
// ============================================================

function openBuilder(id) {

    if (!id) return;


    window.location.href =
        `course-builder.html?id=${encodeURIComponent(id)}`;

}


// ============================================================
// CLOSE MODAL
// ============================================================

function closeCourseModal() {

    const modal =
        $("courseModal");


    modal?.classList.remove(
        "open"
    );


    document.body.classList.remove(
        "modal-open"
    );


    editingCourseId = null;

}


// ============================================================
// FORM MESSAGE
// ============================================================

function showFormMessage(
    message,
    type
) {

    const element =
        $("courseFormMessage");


    if (!element) {

        alert(message);

        return;

    }


    element.hidden = false;


    element.className =
        `form-message ${type}`;


    element.textContent =
        message;

}


// ============================================================
// ERROR
// ============================================================

function showCourseError(
    message
) {

    const grid =
        $("courseGrid");


    if (!grid) return;


    grid.innerHTML = `

        <div class="course-error">

            <i data-lucide="alert-circle"></i>

            <h3>
                Something went wrong
            </h3>

            <p>
                ${escapeHTML(message)}
            </p>

        </div>

    `;


    refreshIcons();

}