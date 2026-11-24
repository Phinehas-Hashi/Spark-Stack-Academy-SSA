// ============================================================
// SPARK STACK ACADEMY
// INSTRUCTOR DASHBOARD V2
// DASHBOARD ENGINE
// ============================================================

import { db } from "../../js/firebase.js";

import {
    collection,
    query,
    where,
    getDocs,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

let instructor = null;


// ============================================================
// DOM HELPER
// ============================================================

const $ = id => document.getElementById(id);


// ============================================================
// BOOT
// ============================================================

async function initDashboard() {

    try {

        await waitForInstructor();

        instructor = window.currentInstructor;

        if (!instructor) {

            console.warn(
                "Instructor dashboard: instructor not available."
            );

            return;
        }


        setInstructorName();

        await Promise.allSettled([

            loadCourses(),

            loadStudents(),

            loadAssignments(),

            loadEarnings(),

            loadRecentActivity(),

            loadSubmissionMetrics()

        ]);


        refreshIcons();


        console.log(
            "✓ Instructor dashboard loaded"
        );

    } catch (error) {

        console.error(
            "Instructor dashboard failed:",
            error
        );

    }

}


// ============================================================
// WAIT FOR APP SHELL AUTH
// ============================================================

function waitForInstructor() {

    return new Promise(resolve => {

        let attempts = 0;

        const maxAttempts = 100;

        const timer = setInterval(() => {

            attempts++;


            if (window.currentInstructor) {

                clearInterval(timer);

                resolve();

                return;

            }


            if (attempts >= maxAttempts) {

                clearInterval(timer);

                resolve();

            }

        }, 100);

    });

}


// ============================================================
// INSTRUCTOR NAME
// ============================================================

function setInstructorName() {

    const name =
        instructor.displayName ||
        instructor.name ||
        instructor.email?.split("@")[0] ||
        "Instructor";


    setText(
        "instructorName",
        name
    );


    // Supports the current HTML if the
    // welcome heading contains a separate span.

    const welcomeName =
        $("instructorWelcomeName");

    if (welcomeName) {

        welcomeName.textContent =
            name;

    }

}


// ============================================================
// COURSES
// ============================================================

async function loadCourses() {
    try {
        const snapshot = await getDocs(query(
            collection(db, "courses"),
            where("instructorId", "==", instructor.uid)
        ));

        const courses = snapshot.docs.map(courseDoc => ({
            id: courseDoc.id,
            ...courseDoc.data()
        }));

        courses.sort((a, b) =>
            getDateValue(b.updatedAt || b.createdAt) -
            getDateValue(a.updatedAt || a.createdAt)
        );

        setText("statCourses", courses.length);
        renderCourses(courses);
    } catch (error) {
        console.error("Failed to load courses:", error);
        setText("statCourses", "—");
        renderCourses([]);
    }
}

// ============================================================
// COURSE LIST
// ============================================================

function renderCourses(courses) {

    const container =
        $("courseList");


    if (!container) return;


    if (!courses.length) {

        container.innerHTML = `

            <div class="empty-state">

                <div class="empty-icon">

                    <i data-lucide="book-open"></i>

                </div>

                <h3>
                    No courses yet
                </h3>

                <p>
                    Create your first course
                    and start teaching.
                </p>

                <button
                    class="empty-action"
                    id="dashboardCreateCourse"
                    type="button"
                >

                    <i data-lucide="plus"></i>

                    Create Course

                </button>

            </div>

        `;


        const button =
            $("dashboardCreateCourse");


        button?.addEventListener(
            "click",
            () => {

                window.location.href =
                    "courses.html";

            }
        );


        refreshIcons();

        return;

    }


    const recent =
        courses.slice(0, 5);


    container.innerHTML =
        recent.map(course => {

            const title =
                escapeHTML(
                    course.title ||
                    course.name ||
                    "Untitled Course"
                );


            const status =
                String(
                    course.status ||
                    (course.published
                        ? "Published"
                        : "Draft")
                );


            const students =
                Number(
                    course.studentCount ||
                    course.studentsCount ||
                    0
                );


            return `

                <article class="course-item">

                    <div class="course-item-icon">

                        <i data-lucide="book-open"></i>

                    </div>


                    <div class="course-item-info">

                        <h3>
                            ${title}
                        </h3>

                        <p>
                            ${escapeHTML(status)}
                            · ${students} students
                        </p>

                    </div>


                    <a
                        href="courses.html?id=${encodeURIComponent(course.id)}"
                        class="course-item-action"
                        aria-label="Open course"
                    >

                        <i data-lucide="arrow-up-right"></i>

                    </a>

                </article>

            `;

        }).join("");


    refreshIcons();

}


// ============================================================
// STUDENTS
// ============================================================

async function loadStudents() {
    try {
        const snapshot = await getDocs(query(
            collection(db, "enrollments"),
            where("instructorId", "==", instructor.uid)
        ));

        const enrollments = snapshot.docs.map(enrollmentDoc => ({
            id: enrollmentDoc.id,
            ...enrollmentDoc.data()
        }));

        const activeEnrollments = enrollments.filter(isActiveEnrollment);
        const uniqueStudents = new Set(
            activeEnrollments
                .map(enrollment => enrollment.studentId || enrollment.userId)
                .filter(Boolean)
        );

        setText("statStudents", uniqueStudents.size);
        updateEnrollmentMetrics(activeEnrollments);
        renderStudentActivity(
            [...activeEnrollments].sort((a, b) =>
                getDateValue(b.lastAccessedAt || b.updatedAt || b.createdAt) -
                getDateValue(a.lastAccessedAt || a.updatedAt || a.createdAt)
            )
        );
    } catch (error) {
        console.error("Failed to load students:", error);
        setText("statStudents", "—");
        updateEnrollmentMetrics([]);
        renderStudentActivity([]);
    }
}

function isActiveEnrollment(enrollment) {
    const status = String(enrollment.status || "").trim().toLowerCase();
    const paymentStatus = String(enrollment.paymentStatus || "").trim().toLowerCase();
    const activeStatuses = ["active", "approved", "completed"];

    if (["revoked", "suspended", "cancelled", "canceled", "rejected", "pending"].includes(status)) {
        return false;
    }
    if (enrollment.institutionId && activeStatuses.includes(status)) return true;
    if (activeStatuses.includes(status) && ["paid", "free"].includes(paymentStatus)) return true;
    return status === "paid" && (!paymentStatus || paymentStatus === "paid");
}

function updateEnrollmentMetrics(enrollments) {
    const total = enrollments.length;
    const progressValues = enrollments.map(item => {
        const value = Number(item.progress);
        return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
    });
    const averageProgress = total
        ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / total)
        : 0;

    const completed = enrollments.filter(item =>
        item.completed === true ||
        String(item.status || "").toLowerCase() === "completed" ||
        Number(item.progress) >= 100
    ).length;

    const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentlyActive = enrollments.filter(item =>
        getDateValue(item.lastAccessedAt) >= cutoff
    ).length;

    const completionRate = total ? Math.round((completed / total) * 100) : 0;
    const engagementRate = total ? Math.round((recentlyActive / total) * 100) : 0;

    setText("statProgress", `${averageProgress}%`);
    setText("statCompletions", completed);
    setText("completionPercent", `${completionRate}%`);
    setText("engagementPercent", `${engagementRate}%`);
    setProgressBar("completionBar", completionRate);
    setProgressBar("engagementBar", engagementRate);
}

function setProgressBar(id, value) {
    const bar = $(id);
    if (!bar) return;
    const percent = Math.min(100, Math.max(0, Number(value) || 0));
    bar.style.width = `${percent}%`;
    bar.setAttribute("aria-valuenow", String(percent));
}

function getDateValue(value) {
    if (!value) return 0;
    let date = null;
    if (typeof value.toDate === "function") date = value.toDate();
    else if (value instanceof Date) date = value;
    else if (typeof value === "string" || typeof value === "number") date = new Date(value);
    return date && Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

// ============================================================
// STUDENT ACTIVITY
// ============================================================

function renderStudentActivity(
    enrollments
) {

    const container =
        $("activityList");


    if (!container) return;


    if (!enrollments.length) {

        container.innerHTML = `

            <div class="empty-activity">

                <i data-lucide="users"></i>

                <p>
                    Student activity will appear here.
                </p>

            </div>

        `;


        refreshIcons();

        return;

    }


    const recent =
        enrollments.slice(0, 5);


    container.innerHTML =
        recent.map(enrollment => {

            const name =
                escapeHTML(
                    enrollment.studentName ||
                    enrollment.name ||
                    "Student"
                );


            return `

                <div class="activity-item">

                    <div class="activity-icon">

                        <i data-lucide="user-plus"></i>

                    </div>


                    <div class="activity-content">

                        <h4>
                            ${name}
                        </h4>

                        <p>
                            Recently enrolled
                        </p>

                    </div>

                </div>

            `;

        }).join("");


    refreshIcons();

}


// ============================================================
// ASSIGNMENTS / COMPLETIONS
// ============================================================

async function loadAssignments() {
    const container = $("upcomingTasks");
    try {
        const snapshot = await getDocs(query(
            collection(db, "assignments"),
            where("instructorId", "==", instructor.uid)
        ));

        const now = Date.now();
        const upcoming = snapshot.docs
            .map(item => ({ id: item.id, ...item.data() }))
            .filter(item => item.status === "published" || item.published === true)
            .map(item => ({ ...item, dueAt: parseDueDate(item.dueDate) }))
            .filter(item => item.dueAt && item.dueAt.getTime() >= now)
            .sort((a, b) => a.dueAt - b.dueAt)
            .slice(0, 5);

        renderUpcomingTasks(upcoming);
    } catch (error) {
        console.error("Failed to load upcoming tasks:", error);
        if (container) {
            container.innerHTML = '<div class="empty-state small"><p>Upcoming tasks are temporarily unavailable.</p></div>';
        }
    }
}

function parseDueDate(value) {
    if (!value) return null;
    let date = null;
    if (typeof value.toDate === "function") date = value.toDate();
    else if (value instanceof Date) date = new Date(value.getTime());
    else if (typeof value === "string") {
        date = /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? new Date(`${value}T23:59:59`)
            : new Date(value);
    } else if (typeof value === "number") {
        date = new Date(value);
    }
    return date && Number.isFinite(date.getTime()) ? date : null;
}

function renderUpcomingTasks(tasks) {
    const container = $("upcomingTasks");
    if (!container) return;

    if (!tasks.length) {
        container.innerHTML = '<div class="empty-state small"><div class="empty-icon"><i data-lucide="check-circle"></i></div><p>No upcoming assignment deadlines.</p></div>';
        refreshIcons();
        return;
    }

    container.innerHTML = tasks.map(task => {
        const title = escapeHTML(task.title || "Untitled assignment");
        const course = escapeHTML(task.courseName || "Course assignment");
        const due = task.dueAt.toLocaleDateString("en-KE", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
        return `
            <a class="task-item" href="assignments.html">
                <div class="activity-icon"><i data-lucide="clipboard-list"></i></div>
                <div>
                    <h4>${title}</h4>
                    <p>${course} · Due ${escapeHTML(due)}</p>
                </div>
            </a>
        `;
    }).join("");

    refreshIcons();
}

async function loadSubmissionMetrics() {
    try {
        const snapshot = await getDocs(query(
            collection(db, "submissions"),
            where("instructorId", "==", instructor.uid)
        ));
        const submissions = snapshot.docs.map(item => item.data());
        const graded = submissions.filter(item =>
            ["graded", "reviewed"].includes(String(item.status || "").toLowerCase()) ||
            item.graded === true ||
            item.score !== undefined
        ).length;
        const percent = submissions.length
            ? Math.round((graded / submissions.length) * 100)
            : 0;

        setText("gradingPercent", submissions.length ? `${percent}%` : "—");
        setProgressBar("gradingBar", percent);
    } catch (error) {
        console.warn("Assignment grading metric unavailable:", error);
        setText("gradingPercent", "—");
        setProgressBar("gradingBar", 0);
    }
}

// ============================================================
// EARNINGS
// ============================================================

async function loadEarnings() {
    try {
        const snapshot = await getDocs(query(
            collection(db, "instructorEarnings"),
            where("instructorId", "==", instructor.uid)
        ));

        const total = snapshot.docs.reduce((sum, item) => {
            const amount = Number(item.data().netAmount || 0);
            return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0);

        setText("statEarnings", formatCurrency(total));
    } catch (error) {
        console.error("Failed to load earnings:", error);
        setText("statEarnings", "—");
    }
}

// ============================================================
// RECENT ACTIVITY
// ============================================================

async function loadRecentActivity() {

    const container =
        $("activityList");


    if (!container) return;


    try {

        const activityRef =
            collection(
                db,
                "instructorActivity"
            );


        const q =
            query(
                activityRef,

                where(
                    "instructorId",
                    "==",
                    instructor.uid
                ),

                orderBy(
                    "createdAt",
                    "desc"
                ),

                limit(5)
            );


        const snapshot =
            await getDocs(q);


        if (snapshot.empty) {

            return;

        }


        container.innerHTML =
            snapshot.docs.map(doc => {

                const data =
                    doc.data();


                return `

                    <div class="activity-item">

                        <div class="activity-icon">

                            <i data-lucide="activity"></i>

                        </div>


                        <div class="activity-content">

                            <h4>
                                ${escapeHTML(
                                    data.title ||
                                    "Instructor activity"
                                )}
                            </h4>

                            <p>
                                ${escapeHTML(
                                    data.description ||
                                    "Recent activity"
                                )}
                            </p>

                        </div>

                    </div>

                `;

            }).join("");


        refreshIcons();


    } catch (error) {

        // Activity is optional.
        // Do not break the dashboard.

        console.warn(
            "Activity feed unavailable:",
            error
        );

    }

}


// ============================================================
// BUTTON ACTIONS
// ============================================================

function setupDashboardActions() {

    const createCourseBtn =
        $("createCourseBtn");


    const emptyCreateCourseBtn =
        $("emptyCreateCourseBtn");


    const viewStudentsBtn =
        $("viewStudentsBtn");


    createCourseBtn?.addEventListener(
        "click",
        () => {

            window.location.href =
                "courses.html";

        }
    );


    emptyCreateCourseBtn?.addEventListener(
        "click",
        () => {

            window.location.href =
                "course-builder.html";

        }
    );


    viewStudentsBtn?.addEventListener(
        "click",
        () => {

            window.location.href =
                "students.html";

        }
    );


    document
        .querySelectorAll(
            ".quick-action"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const action =
                        button.dataset.action;


                    const routes = {

                        course:
                            "courses.html",

                        lesson:
                            "courses.html",

                        assignment:
                            "create-assignment.html",

                        quiz:
                            "quizzes.html",

                        announcement:
                            "announcements.html"

                    };


                    if (routes[action]) {

                        window.location.href =
                            routes[action];

                    }

                }
            );

        });

}


// ============================================================
// TEXT
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


// ============================================================
// CURRENCY
// ============================================================

function formatCurrency(
    amount
) {

    return new Intl.NumberFormat(
        "en-KE",
        {
            style: "currency",
            currency: "KES",
            maximumFractionDigits: 0
        }
    ).format(amount);

}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHTML(
    value
) {

    return String(value)

        .replaceAll("&", "&amp;")

        .replaceAll("<", "&lt;")

        .replaceAll(">", "&gt;")

        .replaceAll('"', "&quot;")

        .replaceAll("'", "&#039;");

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


// ============================================================
// START AFTER DOM
// ============================================================

if (
    document.readyState === "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            setupDashboardActions();

            initDashboard();

        }
    );

} else {

    setupDashboardActions();

    initDashboard();

}