// ============================================================
// SPARK STACK ACADEMY
// ADMIN — COURSES
// ============================================================

console.log("📚 COURSES JS LOADED");

import { db } from "../../js/firebase.js";

import {
    collection,
    getDocs,
    query,
    orderBy,
    updateDoc,
    writeBatch,
    doc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let courses = [];
let instructors = [];
let filteredCourses = [];

let currentCourse = null;


// ============================================================
// HELPER
// ============================================================

const $ = id => document.getElementById(id);


// ============================================================
// INITIALIZE
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

    initEvents();

    if (window.lucide) {
        lucide.createIcons();
    }

    loadCourses();

});


// ============================================================
// EVENTS
// ============================================================

function initEvents() {

    $("refreshCoursesBtn")
        ?.addEventListener("click", loadCourses);

    $("courseSearch")
        ?.addEventListener("input", applyFilters);

    $("courseStatusFilter")
        ?.addEventListener("change", applyFilters);

    $("courseInstructorFilter")
        ?.addEventListener("change", applyFilters);

    $("courseSort")
        ?.addEventListener("change", applyFilters);

    $("clearCourseFilters")
        ?.addEventListener("click", clearFilters);

    $("closeCourseDetails")
        ?.addEventListener("click", closeModal);

    $("courseDetailsModal")
        ?.querySelector(".admin-modal-backdrop")
        ?.addEventListener("click", closeModal);

    $("toggleCourseStatusBtn")
        ?.addEventListener("click", toggleCourseStatus);

    $("syncCourseMarketplaceBtn")
        ?.addEventListener("click", syncCurrentCourseToMarketplace);

    $("viewCourseProfileBtn")
        ?.addEventListener("click", () => {

            if (!currentCourse) return;

            window.location.href =
                `course-profile.html?id=${currentCourse.id}`;

        });

}


// ============================================================
// LOAD COURSES
// ============================================================

async function loadCourses() {

    const button = $("refreshCoursesBtn");

    if (button) {
        button.disabled = true;
    }

    showTableLoading();

    try {

        await loadInstructors();

        let snapshot;

        try {

            snapshot = await getDocs(
                query(
                    collection(db, "courses"),
                    orderBy("createdAt", "desc")
                )
            );

        } catch (error) {

            console.warn(
                "⚠️ Ordered course query failed. Using fallback.",
                error
            );

            snapshot = await getDocs(
                collection(db, "courses")
            );

        }


        courses = [];

        snapshot.forEach(courseDoc => {

            courses.push({

                id: courseDoc.id,

                ...courseDoc.data()

            });

        });


        updateInstructorFilter();

        updateStats();

        applyFilters();


        console.log(
            `✓ Loaded ${courses.length} courses`
        );


    } catch (error) {

        console.error(
            "❌ Failed loading courses:",
            error
        );

        showTableError();

    } finally {

        if (button) {
            button.disabled = false;
        }

    }

}


// ============================================================
// LOAD INSTRUCTORS
// ============================================================

async function loadInstructors() {

    const snapshot =
        await getDocs(
            collection(db, "instructors")
        );

    instructors = [];

    snapshot.forEach(instructorDoc => {

        instructors.push({

            id: instructorDoc.id,

            ...instructorDoc.data()

        });

    });

}


// ============================================================
// STATS
// ============================================================

function updateStats() {

    const total =
        courses.length;

    const published =
        courses.filter(
            course =>
                getStatus(course) === "published"
        ).length;

    const drafts =
        courses.filter(
            course =>
                getStatus(course) === "draft"
        ).length;

    const enrollments =
        courses.reduce(
            (total, course) =>
                total + getStudentCount(course),
            0
        );


    setText(
        "totalCourses",
        total
    );

    setText(
        "publishedCourses",
        published
    );

    setText(
        "draftCourses",
        drafts
    );

    setText(
        "totalEnrollments",
        enrollments
    );

}


// ============================================================
// INSTRUCTOR FILTER
// ============================================================

function updateInstructorFilter() {

    const select =
        $("courseInstructorFilter");

    if (!select) return;


    const current =
        select.value;


    select.innerHTML = `

        <option value="all">
            All Instructors
        </option>

    `;


    instructors
        .sort(
            (a, b) =>
                getInstructorName(a)
                    .localeCompare(
                        getInstructorName(b)
                    )
        )
        .forEach(instructor => {

            const option =
                document.createElement("option");

            option.value =
                instructor.id;

            option.textContent =
                getInstructorName(instructor);

            select.appendChild(option);

        });


    if (
        Array.from(select.options)
            .some(
                option =>
                    option.value === current
            )
    ) {

        select.value = current;

    }

}


// ============================================================
// FILTERS
// ============================================================

function applyFilters() {

    const search =
        ($("courseSearch")?.value || "")
            .trim()
            .toLowerCase();


    const status =
        $("courseStatusFilter")?.value ||
        "all";


    const instructor =
        $("courseInstructorFilter")?.value ||
        "all";


    const sort =
        $("courseSort")?.value ||
        "newest";


    filteredCourses =
        courses.filter(course => {

            const name =
                getCourseName(course)
                    .toLowerCase();


            const description =
                String(
                    course.description || ""
                ).toLowerCase();


            const courseStatus =
                getStatus(course);


            const instructorId =
                getInstructorId(course);


            const matchesSearch =
                !search ||
                name.includes(search) ||
                description.includes(search);


            const matchesStatus =
                status === "all" ||
                courseStatus === status;


            const matchesInstructor =
                instructor === "all" ||
                instructorId === instructor;


            return (
                matchesSearch &&
                matchesStatus &&
                matchesInstructor
            );

        });


    sortCourses(sort);

    renderCourses();

}


// ============================================================
// SORT
// ============================================================

function sortCourses(sort) {

    filteredCourses.sort(
        (a, b) => {

            if (
                sort === "name" ||
                sort === "name-desc"
            ) {

                const nameA =
                    getCourseName(a)
                        .toLowerCase();

                const nameB =
                    getCourseName(b)
                        .toLowerCase();

                return sort === "name"
                    ? nameA.localeCompare(nameB)
                    : nameB.localeCompare(nameA);

            }


            if (sort === "popular") {

                return (
                    getStudentCount(b) -
                    getStudentCount(a)
                );

            }


            const timeA =
                getCreatedTime(a);

            const timeB =
                getCreatedTime(b);


            return sort === "oldest"
                ? timeA - timeB
                : timeB - timeA;

        }
    );

}


// ============================================================
// RENDER COURSES
// ============================================================

function renderCourses() {

    const body =
        $("coursesTableBody");

    const empty =
        $("coursesEmptyState");


    if (!body) return;


    body.innerHTML = "";


    setText(
        "courseResultsCount",
        filteredCourses.length
    );


    if (!filteredCourses.length) {

        empty?.classList.remove("hidden");

        return;

    }


    empty?.classList.add("hidden");


    filteredCourses.forEach(course => {

        body.appendChild(
            createCourseRow(course)
        );

    });


    if (window.lucide) {
        lucide.createIcons();
    }

}


// ============================================================
// CREATE ROW
// ============================================================

function createCourseRow(course) {

    const row =
        document.createElement("tr");


    const name =
        getCourseName(course);

    const instructor =
        getInstructorNameByCourse(course);

    const students =
        getStudentCount(course);

    const price =
        formatPrice(
            getCoursePrice(course)
        );

    const status =
        getStatus(course);

    const created =
        formatDate(
            course.createdAt
        );


    row.innerHTML = `

        <td>

            <div class="course-cell">

                <div class="course-icon">

                    <i data-lucide="book-open"></i>

                </div>

                <div class="course-cell-info">

                    <strong>
                        ${escapeHTML(name)}
                    </strong>

                    <span>
                        ${escapeHTML(
                            course.category ||
                            course.level ||
                            "Academy Course"
                        )}
                    </span>

                </div>

            </div>

        </td>


        <td>

            <div class="course-instructor">

                <div class="course-instructor-avatar">

                    ${escapeHTML(
                        getInitials(instructor)
                    )}

                </div>

                <span>
                    ${escapeHTML(instructor)}
                </span>

            </div>

        </td>


        <td>

            <span class="course-count">
                ${students}
            </span>

            <span class="course-count-label">
                enrolled
            </span>

        </td>


        <td>

            <span class="course-price">
                ${escapeHTML(price)}
            </span>

        </td>


        <td>

            <span class="course-status ${status}">
                ${capitalize(status)}
            </span>

        </td>


        <td>

            <span class="course-date">
                ${created}
            </span>

        </td>


        <td>

            <div class="course-actions">

                <button
                    type="button"
                    class="course-action-btn"
                    title="View course"
                    data-action="view"
                    data-id="${course.id}"
                >

                    <i data-lucide="eye"></i>

                </button>


                <button
                    type="button"
                    class="course-action-btn ${
                        status === "published"
                            ? "danger"
                            : ""
                    }"
                    title="${
                        status === "published"
                            ? "Unpublish course"
                            : "Publish course"
                    }"
                    data-action="toggle"
                    data-id="${course.id}"
                >

                    <i data-lucide="${
                        status === "published"
                            ? "eye-off"
                            : "eye"
                    }"></i>

                </button>

            </div>

        </td>

    `;


    row.querySelectorAll("[data-action]")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const id =
                        button.dataset.id;

                    const action =
                        button.dataset.action;


                    const course =
                        courses.find(
                            item =>
                                item.id === id
                        );


                    if (!course) return;


                    if (action === "view") {

                        openModal(course);

                    }


                    if (action === "toggle") {

                        currentCourse =
                            course;

                        toggleCourseStatus();

                    }

                }
            );

        });


    return row;

}


// ============================================================
// OPEN MODAL
// ============================================================

function openModal(course) {

    currentCourse =
        course;


    const name =
        getCourseName(course);


    const instructor =
        getInstructorNameByCourse(course);


    setText(
        "courseModalName",
        name
    );

    setText(
        "courseModalInstructor",
        instructor
    );

    setText(
        "courseModalId",
        course.id
    );

    setText(
        "courseModalStudents",
        getStudentCount(course)
    );

    setText(
        "courseModalPrice",
        formatPrice(
            getCoursePrice(course)
        )
    );

    setText(
        "courseModalCreated",
        formatDate(
            course.createdAt
        )
    );


    const status =
        getStatus(course);


    const statusElement =
        $("courseModalStatus");


    if (statusElement) {

        statusElement.textContent =
            capitalize(status);

        statusElement.className =
            `admin-badge ${status}`;

    }


    const syncButton = $("syncCourseMarketplaceBtn");
    if (syncButton) syncButton.hidden = status !== "published";

    const toggleButton =
        $("toggleCourseStatusBtn");


    if (toggleButton) {

        toggleButton.innerHTML =
            status === "published"

                ? `
                    <i data-lucide="eye-off"></i>
                    Unpublish Course
                  `

                : `
                    <i data-lucide="eye"></i>
                    Publish Course
                  `;

    }


    $("courseDetailsModal")
        ?.classList.remove("hidden");


    $("courseDetailsModal")
        ?.setAttribute(
            "aria-hidden",
            "false"
        );


    if (window.lucide) {
        lucide.createIcons();
    }

}


// ============================================================
// CLOSE MODAL
// ============================================================

function closeModal() {

    const modal =
        $("courseDetailsModal");


    modal?.classList.add("hidden");


    modal?.setAttribute(
        "aria-hidden",
        "true"
    );


    currentCourse = null;

}


// ============================================================
// TOGGLE STATUS
// ============================================================

function buildMarketplaceCourseListing(course) {
    const title = String(course.title || course.name || course.courseName || "Untitled course").trim();
    const now = Timestamp.now();
    const priceValue = Number(course.price || 0);
    return {
        itemId: "course_" + course.id,
        sourceCollection: "courses",
        sourceId: course.id,
        productType: "course",
        title,
        description: String(course.description || "").trim(),
        category: String(course.category || "").trim(),
        price: Number.isFinite(priceValue) ? priceValue : 0,
        currency: String(course.currency || "KES"),
        instructorId: String(course.instructorId || course.instructorID || course.teacherId || course.createdBy || ""),
        institutionId: String(course.institutionId || ""),
        ownerType: String(course.ownerType || (course.institutionId ? "institution" : "instructor")),
        status: "published",
        published: true,
        updatedAt: now,
        createdAt: course.createdAt || now
    };
}

async function syncCurrentCourseToMarketplace() {
    if (!currentCourse || getStatus(currentCourse) !== "published") return;
    const button = $("syncCourseMarketplaceBtn");
    if (button) button.disabled = true;
    try {
        const batch = writeBatch(db);
        batch.set(doc(db, "marketplaceItems", "course_" + currentCourse.id), buildMarketplaceCourseListing(currentCourse), { merge: true });
        await batch.commit();
        console.log("✓ Course marketplace listing synchronized:", currentCourse.id);
        alert("Course listing synchronized. Refresh the student Academy Marketplace to verify it.");
    } catch (error) {
        console.error("Failed syncing course to marketplace:", error);
        alert("Unable to sync this course listing. Check administrator access and Firestore rules.");
    } finally {
        if (button) button.disabled = false;
    }
}

async function toggleCourseStatus() {
    if (!currentCourse) return;
    const course = currentCourse;
    const oldStatus = getStatus(course);
    const newStatus = oldStatus === "published" ? "draft" : "published";
    const button = $("toggleCourseStatusBtn");
    if (button) button.disabled = true;

    try {
        const batch = writeBatch(db);
        const courseRef = doc(db, "courses", course.id);
        const listingRef = doc(db, "marketplaceItems", "course_" + course.id);
        batch.update(courseRef, {
            status: newStatus,
            published: newStatus === "published",
            marketplaceVisibility: newStatus === "published" ? "public" : "hidden",
            reviewStatus: newStatus === "published" ? "approved" : "not_submitted",
            reviewedAt: Timestamp.now()
        });

        if (newStatus === "published") {
            const listingCourse = { ...course, status: "published", published: true, marketplaceVisibility: "public", reviewStatus: "approved" };
            batch.set(listingRef, buildMarketplaceCourseListing(listingCourse), { merge: true });
        } else {
            batch.delete(listingRef);
        }

        await batch.commit();
        course.status = newStatus;
        course.published = newStatus === "published";
        course.marketplaceVisibility = newStatus === "published" ? "public" : "hidden";
        course.reviewStatus = newStatus === "published" ? "approved" : "not_submitted";
        updateStats();
        applyFilters();

        if ($("courseDetailsModal") && !$("courseDetailsModal").classList.contains("hidden")) openModal(course);
        console.log(`✓ Course ${newStatus}; marketplace listing ${newStatus === "published" ? "created" : "removed"}`);
    } catch (error) {
        console.error("❌ Failed updating course and marketplace listing:", error);
        alert("Unable to update the course and its Marketplace listing. No partial publish should be applied.");
    } finally {
        if (button) button.disabled = false;
    }
}

// ============================================================
// CLEAR FILTERS
// ============================================================

function clearFilters() {

    if ($("courseSearch")) {
        $("courseSearch").value = "";
    }

    if ($("courseStatusFilter")) {
        $("courseStatusFilter").value = "all";
    }

    if ($("courseInstructorFilter")) {
        $("courseInstructorFilter").value = "all";
    }

    if ($("courseSort")) {
        $("courseSort").value = "newest";
    }


    applyFilters();

}


// ============================================================
// COURSE NAME
// ============================================================

function getCourseName(course) {

    return (
        course.title ||
        course.name ||
        course.courseName ||
        "Untitled Course"
    );

}


// ============================================================
// COURSE STATUS
// ============================================================

function getStatus(course) {

    return String(
        course.status ||
        course.courseStatus ||
        "draft"
    ).toLowerCase();

}


// ============================================================
// INSTRUCTOR ID
// ============================================================

function getInstructorId(course) {

    return (
        course.instructorId ||
        course.instructorID ||
        course.teacherId ||
        course.createdBy ||
        ""
    );

}


// ============================================================
// INSTRUCTOR NAME
// ============================================================

function getInstructorName(instructor) {

    return (
        instructor.displayName ||
        instructor.name ||
        instructor.fullName ||
        [
            instructor.firstName,
            instructor.lastName
        ]
            .filter(Boolean)
            .join(" ") ||
        "Instructor"
    );

}


function getInstructorNameByCourse(course) {

    const id =
        getInstructorId(course);


    const instructor =
        instructors.find(
            item =>
                item.id === id
        );


    if (instructor) {
        return getInstructorName(instructor);
    }


    return (
        course.instructorName ||
        course.teacherName ||
        "Unassigned"
    );

}


// ============================================================
// STUDENT COUNT
// ============================================================

function getStudentCount(course) {

    if (Array.isArray(course.studentIds)) {
        return course.studentIds.length;
    }

    if (Array.isArray(course.students)) {
        return course.students.length;
    }

    return Number(
        course.studentCount ||
        course.enrollmentCount ||
        course.studentsCount ||
        course.enrollments ||
        0
    );

}


// ============================================================
// PRICE
// ============================================================

function getCoursePrice(course) {

    return (
        course.price ??
        course.amount ??
        course.coursePrice ??
        0
    );

}


function formatPrice(value) {

    const number =
        Number(value) || 0;


    if (number === 0) {
        return "Free";
    }


    return (
        "KSh " +
        number.toLocaleString("en-KE")
    );

}


// ============================================================
// CREATED TIME
// ============================================================

function getCreatedTime(course) {

    const value =
        course.createdAt;


    if (!value) return 0;


    if (
        typeof value.toMillis ===
        "function"
    ) {

        return value.toMillis();

    }


    if (value instanceof Timestamp) {

        return value.toMillis();

    }


    if (value.seconds) {

        return value.seconds * 1000;

    }


    const date =
        new Date(value);


    return isNaN(date)
        ? 0
        : date.getTime();

}


// ============================================================
// FORMAT DATE
// ============================================================

function formatDate(value) {

    const time =
        getCreatedTime({
            createdAt: value
        });


    if (!time) {
        return "—";
    }


    return new Date(time)
        .toLocaleDateString(
            "en-KE",
            {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }
        );

}


// ============================================================
// INITIALS
// ============================================================

function getInitials(name) {

    return String(name)
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map(
            word =>
                word.charAt(0)
        )
        .join("")
        .toUpperCase();

}


// ============================================================
// CAPITALIZE
// ============================================================

function capitalize(value) {

    return String(value)
        .charAt(0)
        .toUpperCase() +
        String(value)
            .slice(1);

}


// ============================================================
// SET TEXT
// ============================================================

function setText(id, value) {

    const element =
        $(id);

    if (element) {

        element.textContent =
            value ?? "0";

    }

}


// ============================================================
// LOADING
// ============================================================

function showTableLoading() {

    const body =
        $("coursesTableBody");


    if (!body) return;


    body.innerHTML = `

        <tr>

            <td
                colspan="7"
                class="table-state-cell"
            >

                <div class="table-loading">

                    <div class="loading-spinner"></div>

                    <span>
                        Loading courses...
                    </span>

                </div>

            </td>

        </tr>

    `;

}


// ============================================================
// ERROR
// ============================================================

function showTableError() {

    const body =
        $("coursesTableBody");


    if (!body) return;


    body.innerHTML = `

        <tr>

            <td
                colspan="7"
                class="table-state-cell"
            >

                <div class="table-error">

                    <i data-lucide="triangle-alert"></i>

                    <strong>
                        Unable to load courses
                    </strong>

                    <span>
                        Check your connection and try again.
                    </span>

                </div>

            </td>

        </tr>

    `;


    if (window.lucide) {
        lucide.createIcons();
    }

}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHTML(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


// ============================================================
// ESC KEY
// ============================================================

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape" &&
            $("courseDetailsModal") &&
            !$("courseDetailsModal")
                .classList.contains("hidden")
        ) {

            closeModal();

        }

    }
);