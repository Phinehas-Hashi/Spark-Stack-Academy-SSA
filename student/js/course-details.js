// ============================================
// SPARK STACK ACADEMY
// COURSE DETAILS CONTROLLER V3
// ============================================

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
    setDoc,
    collection,
    query,
    where,
    getDocs,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================
// STATE
// ============================================

let currentUser = null;
let course = null;
let modules = [];
let lessons = [];

function isCourseFree(courseData) {
    if (!courseData) return false;
    if (courseData.isFree === true) return true;
    return typeof courseData.price === "number" && courseData.price <= 0;
}

const params = new URLSearchParams(
    window.location.search
);

const courseId = params.get("id");

console.log("🚀 Course Details V3 Loaded");
console.log("🎯 Course ID:", courseId);


// ============================================
// DOM
// ============================================

const loading =
    document.getElementById("courseLoading");

const content =
    document.getElementById("courseDetailsContent");

const errorBox =
    document.getElementById("courseError");

const errorMessage =
    document.getElementById("courseErrorMessage");

const enrollBtn =
    document.getElementById("enrollBtn");


// ============================================
// START
// ============================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        document
            .getElementById("backBtn")
            ?.addEventListener(
                "click",
                goBack
            );

        document
            .getElementById("errorBackBtn")
            ?.addEventListener(
                "click",
                goBack
            );

        initialize();

    }
);


// ============================================
// AUTH
// ============================================

onAuthStateChanged(
    auth,
    async user => {

        currentUser = user;

        console.log(
            "👤 Current student:",
            user?.uid || "Guest"
        );

        if (!courseId) {

            showError(
                "No course was selected."
            );

            return;

        }

        await loadCourse();

    }
);


// ============================================
// INITIALIZE
// ============================================

function initialize() {

    if (!courseId) {

        showError(
            "No course ID was provided."
        );

        return;

    }

    showLoading();

}


// ============================================
// LOAD COURSE
// ============================================

async function loadCourse() {

    try {

        showLoading();

        const courseRef =
            doc(
                db,
                "courses",
                courseId
            );

        const snapshot =
            await getDoc(courseRef);

        if (!snapshot.exists()) {

            showError(
                "This course no longer exists."
            );

            return;

        }

        course = {
            id: snapshot.id,
            ...snapshot.data()
        };

        const courseStatus = String(course.status || "").trim().toLowerCase();
        if (courseStatus === "deleted" || course.deletedAt
            || (course.published !== true && courseStatus !== "published")) {
            showError("This course is no longer available in the Academy Marketplace.");
            return;
        }

        console.log(
            "📚 COURSE:",
            course
        );


        const enrollment = currentUser
            ? await checkEnrollment()
            : false;

        await loadModules();
        await loadLessons(Boolean(enrollment));

        renderCourse();

        if (!currentUser) setGuestState();

        showContent();

    }

    catch (error) {

        console.error("COURSE DETAILS LOAD FAILED", {
            courseId,
            code: error?.code || "unknown",
            message: error?.message || String(error),
            error
        });

        const permissionDenied = error?.code === "permission-denied";
        showError(
            permissionDenied
                ? "We couldn't access this course. Refresh the page and try again. If the problem continues, contact support."
                : "Unable to load this course right now. Please check your connection and try again."
        );

    }

}


// ============================================
// LOAD LESSONS
// ============================================

async function loadModules() {
    try {
        const lookups = [
            query(collection(db, "courseModules"), where("courseId", "==", courseId)),
            query(collection(db, "courseModules"), where("courseID", "==", courseId))
        ];
        const results = await Promise.allSettled(lookups.map(item => getDocs(item)));
        const byId = new Map();
        for (const result of results) {
            if (result.status !== "fulfilled") {
                console.warn("A course module lookup was unavailable:", result.reason);
                continue;
            }
            result.value.docs.forEach(item => {
                if (!byId.has(item.id)) byId.set(item.id, { id: item.id, ...item.data() });
            });
        }
        modules = [...byId.values()];
        modules.sort((a, b) =>
            Number(a.order ?? a.position ?? 0) - Number(b.order ?? b.position ?? 0)
        );
    } catch (error) {
        console.warn("Course module lookup was unavailable:", error);
        modules = [];
    }
}

async function loadLessons(hasEnrollment = false) {
    const lessonQueries = hasEnrollment
        ? [
            query(collection(db, "courseLessons"), where("courseId", "==", courseId)),
            query(collection(db, "courseLessons"), where("courseID", "==", courseId))
        ]
        : [
            query(collection(db, "courseLessons"), where("courseId", "==", courseId), where("isPreview", "==", true)),
            query(collection(db, "courseLessons"), where("courseID", "==", courseId), where("isPreview", "==", true))
        ];

    const results = await Promise.allSettled(
        lessonQueries.map(lessonQuery => getDocs(lessonQuery))
    );

    const byId = new Map();
    for (const result of results) {
        if (result.status !== "fulfilled") {
            console.warn("A course curriculum lookup was unavailable:", result.reason);
            continue;
        }
        result.value.docs.forEach(lessonDoc => {
            if (!byId.has(lessonDoc.id)) {
                byId.set(lessonDoc.id, {
                    id: lessonDoc.id,
                    ...lessonDoc.data()
                });
            }
        });
    }

    lessons = [...byId.values()];
    lessons.sort((a, b) =>
        Number(a.order ?? a.position ?? 0) - Number(b.order ?? b.position ?? 0)
    );

    console.log("COURSE LESSONS:", lessons.length);
}

// ============================================
// RENDER COURSE
// ============================================

function renderCourse() {

    setText(
        "courseTitle",
        course.title ||
        "Untitled Course"
    );

    const coverImage = document.getElementById("courseCoverImage");
    const coverFallback = document.getElementById("courseCoverFallback");
    const coverUrl = course.thumbnail || course.image || course.coverImage || "";
    if (coverImage && /^https:\/\//i.test(String(coverUrl))) {
        coverImage.src = coverUrl;
        coverImage.alt = course.title || "Course cover";
        coverImage.hidden = false;
        if (coverFallback) coverFallback.hidden = true;
    } else if (coverImage) {
        coverImage.hidden = true;
        coverImage.removeAttribute("src");
        if (coverFallback) coverFallback.hidden = false;
    }


    setText(
        "courseDescription",
        course.description ||
        "Start your learning journey with Spark Stack Academy."
    );


    setText(
        "aboutCourse",
        course.description ||
        "This course is designed to help you build practical technology skills."
    );


    setText(
        "courseCategory",
        course.category ||
        "Technology"
    );


    const level =
        course.level ||
        "Beginner";


    setText(
        "courseLevel",
        level
    );


    setText(
        "courseLevelInfo",
        level
    );


    const instructor =
        course.instructorName ||
        course.instructor ||
        "Spark Stack Academy";


    setText(
        "instructorName",
        instructor
    );


    setText(
        "sideInstructorName",
        instructor
    );


    setInitial(
        "instructorAvatar",
        instructor
    );


    setInitial(
        "sideInstructorAvatar",
        instructor
    );


    setText(
        "courseDuration",
        course.duration
            ? formatDuration(
                course.duration
            )
            : "Self-paced"
    );


    setText(
        "studentCount",
        Number(
            course.studentCount ??
            course.students ??
            0
        )
    );


    setText(
        "lessonCount",
        lessons.length
    );


    renderPricing();

    renderLearningPoints();

    renderCurriculum();

}


// ============================================
// PRICING
// ============================================

function renderPricing() {

    const price =
        Number(
            course.price || 0
        );

    const discount =
        Number(
            course.discountPrice || 0
        );

    const isFree = isCourseFree(course);


    const priceElement =
        document.getElementById(
            "coursePrice"
        );

    const discountElement =
        document.getElementById(
            "discountPrice"
        );

    const freeBadge =
        document.getElementById(
            "courseFreeBadge"
        );


    if (isFree) {

        if (priceElement) {

            priceElement.textContent =
                "Free";

        }

        if (freeBadge) {

            freeBadge.style.display =
                "inline-flex";

        }

        if (discountElement) {

            discountElement.style.display =
                "none";

        }

        return;

    }


    if (
        discount > 0 &&
        discount < price
    ) {

        if (priceElement) {

            priceElement.textContent =
                `KSh ${discount.toLocaleString()}`;

        }


        if (discountElement) {

            discountElement.textContent =
                `Regular price: KSh ${price.toLocaleString()}`;

            discountElement.style.display =
                "block";

        }

        return;

    }


    if (priceElement) {

        priceElement.textContent =
            `KSh ${price.toLocaleString()}`;

    }

}


// ============================================
// LEARNING POINTS
// ============================================

function renderLearningPoints() {

    const list =
        document.getElementById(
            "learningList"
        );

    if (!list)
        return;


    const points =
        Array.isArray(
            course.learningPoints
        )
            ? course.learningPoints
            : [];


    if (!points.length) {

        list.innerHTML = `

            <li>
                <i data-lucide="check"></i>
                <span>Practical course content</span>
            </li>

            <li>
                <i data-lucide="check"></i>
                <span>Structured learning experience</span>
            </li>

            <li>
                <i data-lucide="check"></i>
                <span>Progress tracking</span>
            </li>

        `;

        refreshIcons();

        return;

    }


    list.innerHTML =
        points
            .map(
                point => `

                    <li>

                        <i data-lucide="check"></i>

                        <span>
                            ${escapeHTML(point)}
                        </span>

                    </li>

                `
            )
            .join("");


    refreshIcons();

}


// ============================================
// CURRICULUM
// ============================================

function renderCurriculum() {
    const box = document.getElementById("curriculumList");
    if (!box) return;

    if (!lessons.length) {
        box.innerHTML = `
            <div class="curriculum-empty">
                <i data-lucide="book-open"></i>
                <h3>Curriculum coming soon</h3>
                <p>Lessons are being prepared by the instructor.</p>
            </div>
        `;
        refreshIcons();
        return;
    }

    const lessonMarkup = (lesson, index) => {
        const type = String(lesson.type || "lesson").toLowerCase();
        const duration = lesson.duration ? `${lesson.duration} min` : "Lesson";
        const icon = type === "video" ? "play-circle" : type === "quiz" ? "clipboard-check" : "file-text";
        return `
            <div class="curriculum-item">
                <div class="lesson-number">${index + 1}</div>
                <div class="lesson-icon"><i data-lucide="${icon}"></i></div>
                <div class="lesson-info">
                    <strong>${escapeHTML(lesson.title || `Lesson ${index + 1}`)}</strong>
                    <span>${escapeHTML(duration)}</span>
                </div>
                <i class="lesson-lock" data-lucide="lock"></i>
            </div>
        `;
    };

    const groupedIds = new Set();
    const groups = modules.map((module, moduleIndex) => {
        const moduleLessons = lessons.filter(lesson => (lesson.moduleId || lesson.moduleID) === module.id);
        moduleLessons.forEach(lesson => groupedIds.add(lesson.id));
        if (!moduleLessons.length) return "";
        return `
            <section class="course-curriculum-module">
                <header class="course-curriculum-module-header">
                    <span>MODULE ${moduleIndex + 1}</span>
                    <h3>${escapeHTML(module.title || `Module ${moduleIndex + 1}`)}</h3>
                    ${module.description ? `<p>${escapeHTML(module.description)}</p>` : ""}
                    <small>${moduleLessons.length} ${moduleLessons.length === 1 ? "lesson" : "lessons"}</small>
                </header>
                <div class="course-curriculum-module-lessons">
                    ${moduleLessons.map((lesson, index) => lessonMarkup(lesson, index)).join("")}
                </div>
            </section>
        `;
    }).filter(Boolean);

    const ungrouped = lessons.filter(lesson => !groupedIds.has(lesson.id));
    if (ungrouped.length || !groups.length) {
        groups.push(`
            <section class="course-curriculum-module">
                <header class="course-curriculum-module-header">
                    <span>${groups.length ? "ADDITIONAL CONTENT" : "COURSE LESSONS"}</span>
                    <h3>${groups.length ? "Additional lessons" : "Course lessons"}</h3>
                    <small>${ungrouped.length || lessons.length} ${(ungrouped.length || lessons.length) === 1 ? "lesson" : "lessons"}</small>
                </header>
                <div class="course-curriculum-module-lessons">
                    ${(ungrouped.length ? ungrouped : lessons).map((lesson, index) => lessonMarkup(lesson, index)).join("")}
                </div>
            </section>
        `);
    }

    box.innerHTML = groups.join("");
    refreshIcons();
}

// ============================================
// CHECK ENROLLMENT
// ============================================

async function checkEnrollment() {
    if (!currentUser) return false;

    const enrollmentQueries = [
        query(
            collection(db, "enrollments"),
            where("userId", "==", currentUser.uid),
            where("courseId", "==", courseId)
        ),
        query(
            collection(db, "enrollments"),
            where("studentId", "==", currentUser.uid),
            where("courseId", "==", courseId)
        )
    ];

    const results = await Promise.allSettled(
        enrollmentQueries.map(enrollmentQuery => getDocs(enrollmentQuery))
    );

    const candidates = [];
    for (const result of results) {
        if (result.status !== "fulfilled") {
            console.warn("An enrollment lookup was unavailable:", result.reason);
            continue;
        }
        result.value.docs.forEach(item => {
            if (!candidates.some(candidate => candidate.id === item.id)) {
                candidates.push({ id: item.id, ...item.data() });
            }
        });
    }

    // Legacy institution enrollments are stored under students/{uid}/enrollments.
    try {
        const nested = await getDoc(
            doc(db, "students", currentUser.uid, "enrollments", courseId)
        );
        if (nested.exists()) {
            candidates.push({ id: nested.id, ...nested.data() });
        }
    } catch (error) {
        console.warn("Legacy enrollment lookup was unavailable:", error);
    }

    const enrollment = candidates.find(hasAccess);
    if (enrollment) {
        console.log("Student enrollment found:", enrollment);
        setEnrolledState(enrollment);
        return enrollment;
    }

    setAvailableState();
    return false;
}

// ============================================
// ACCESS RULE
// ============================================

function hasAccess(enrollment) {
    if (!enrollment) return false;
    const status = String(enrollment.status || "").trim().toLowerCase();
    const paymentStatus = String(enrollment.paymentStatus || "").trim().toLowerCase();
    if (["revoked","suspended","cancelled","canceled","rejected","pending"].includes(status)) return false;
    if (enrollment.institutionId && ["active","approved","completed"].includes(status)) return true;
    if (["active","approved","completed"].includes(status) && ["paid","free"].includes(paymentStatus)) return true;
    return status === "paid" && (paymentStatus === "" || paymentStatus === "paid");
}


// ============================================
// ENROLLMENT BUTTON
// ============================================

enrollBtn?.addEventListener(
    "click",
    async () => {

        if (!currentUser) {

            window.location.href =
                "../login.html";

            return;

        }


        if (!course)
            return;


        const price =
            Number(
                course.price || 0
            );


        const isFree = isCourseFree(course);


        enrollBtn.disabled =
            true;


        enrollBtn.innerHTML = `

            <span class="button-spinner"></span>

            Enrolling...

        `;


        try {

            if (isFree) {

                await enrollFree();

            } else {

                window.location.href =
                    `payments.html?courseId=${encodeURIComponent(
                        courseId
                    )}`;

            }

        }

        catch (error) {

            console.error(
                "❌ ENROLLMENT FAILED:",
                error
            );


            enrollBtn.disabled =
                false;


            setAvailableState();


            const reason = error?.code === "permission-denied"
                ? "Enrollment was blocked by Firestore permissions. Confirm the published rules and that this course is marked free."
                : error?.code === "already-exists"
                    ? "An enrollment record already exists. Please refresh your course access or contact support."
                    : "Enrollment failed. Check your connection and try again.";
            showToast(reason, "error");

        }

    }
);


// ============================================
// FREE ENROLLMENT
// ============================================

async function enrollFree() {

    if (!currentUser || !course) return;

    const enrollmentRef = doc(
        db,
        "enrollments",
        `${currentUser.uid}_${courseId}`
    );

    // A merge write to an existing document is an UPDATE in Firestore.
    // Students cannot rewrite entitlement fields, so reuse a valid existing record.
    const existingSnapshot = await getDoc(enrollmentRef);
    if (existingSnapshot.exists()) {
        const existing = existingSnapshot.data();
        const ownerId = existing.userId || existing.studentId;
        if (
            ownerId === currentUser.uid &&
            existing.courseId === courseId &&
            ["active", "approved", "completed"].includes(String(existing.status || "").toLowerCase()) &&
            ["free", "paid"].includes(String(existing.paymentStatus || "").toLowerCase())
        ) {
            setEnrolledState(existing);
            showToast("You already have access to this course. Continue learning.", "success");
            window.location.href = `course-player.html?id=${encodeURIComponent(courseId)}`;
            return;
        }
        throw new Error("An enrollment record already exists but does not grant active access. Contact Academy support to review it.");
    }

    if (!isCourseFree(course)) {
        throw new Error("This course is not marked as free in the course record. Refresh the page and try again.");
    }

    const enrollmentData = {

        userId:
            currentUser.uid,

        courseId:

            courseId,

        courseTitle:

            course.title ||
            "Untitled Course",

        paymentStatus:

            "free",

        status:

            "active",

        progress:

            0,

        completedLessons:

            [],

        enrolledAt:

            serverTimestamp(),

        updatedAt:

            serverTimestamp()

    };


    // ========================================
    // SAVE MAIN ENROLLMENT
    // ========================================

    await setDoc(
        enrollmentRef,
        enrollmentData,
        {
            merge: true
        }
    );


    console.log(
        "🎉 FREE COURSE ENROLLED:",
        course.title
    );


    // ========================================
    // SUCCESS STATE
    // ========================================

    setEnrolledState(
        enrollmentData
    );


    showToast(
        `Enrollment successful! You're now enrolled in ${course.title || "this course"}.`,
        "success"
    );


    // ========================================
    // GIVE USER TIME TO SEE TOAST
    // ========================================

    setTimeout(
        () => {

            window.location.href =
                `course-player.html?id=${encodeURIComponent(
                    courseId
                )}`;

        },
        1400
    );

}


// ============================================
// BUTTON STATES
// ============================================

function setAvailableState() {

    if (!enrollBtn)
        return;


    const price =
        Number(
            course?.price || 0
        );


    const isFree = isCourseFree(course);


    enrollBtn.disabled =
        false;


    enrollBtn.innerHTML = `

        <i data-lucide="${
            isFree
                ? "book-open"
                : "credit-card"
        }"></i>

        ${
            isFree
                ? "Enroll for Free"
                : "Enroll Now"
        }

    `;


    setText(
        "enrollmentNote",
        isFree
            ? "Start learning instantly."
            : "Secure your place in this course."
    );


    refreshIcons();

}


// ============================================
// ENROLLED STATE
// ============================================

function setEnrolledState(
    enrollment
) {

    if (!enrollBtn)
        return;


    enrollBtn.disabled =
        false;


    enrollBtn.innerHTML = `

        <i data-lucide="play"></i>

        Start Learning

    `;


    enrollBtn.onclick = () => {

        window.location.href =
            `course-player.html?id=${encodeURIComponent(
                courseId
            )}`;

    };


    const progress =
        Number(
            enrollment?.progress || 0
        );


    setText(
        "enrollmentNote",
        progress > 0
            ? `${progress}% complete • Continue learning`
            : "You're enrolled. Start learning now."
    );


    refreshIcons();

}


// ============================================
// GUEST STATE
// ============================================

function setGuestState() {

    if (!enrollBtn)
        return;


    enrollBtn.disabled =
        false;


    enrollBtn.innerHTML = `

        <i data-lucide="log-in"></i>

        Login to Enroll

    `;


    enrollBtn.onclick = () => {

        window.location.href =
            "../login.html";

    };


    refreshIcons();

}


// ============================================
// PREMIUM TOAST
// ============================================

function showToast(
    message,
    type = "success"
) {

    let toast =
        document.getElementById(
            "enrollmentToast"
        );


    // Create toast if HTML doesn't already have one
    if (!toast) {

        toast =
            document.createElement(
                "div"
            );

        toast.id =
            "enrollmentToast";

        toast.className =
            "enrollment-toast";


        document.body.appendChild(
            toast
        );

    }


    toast.className =
        `enrollment-toast ${type}`;


    toast.innerHTML = `

        <div class="enrollment-toast-icon">

            <i data-lucide="${
                type === "success"
                    ? "check-circle-2"
                    : "alert-circle"
            }"></i>

        </div>


        <div class="enrollment-toast-content">

            <strong>
                ${
                    type === "success"
                        ? "Enrollment Successful"
                        : "Something went wrong"
                }
            </strong>

            <span>
                ${escapeHTML(message)}
            </span>

        </div>

    `;


    refreshIcons();


    requestAnimationFrame(
        () => {

            toast.classList.add(
                "show"
            );

        }
    );


    clearTimeout(
        window.enrollmentToastTimer
    );


    window.enrollmentToastTimer =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            1800
        );

}


// ============================================
// UI STATES
// ============================================

function showLoading() {

    if (loading)
        loading.style.display =
            "flex";


    if (content)
        content.style.display =
            "none";


    if (errorBox)
        errorBox.style.display =
            "none";

}


function showContent() {

    if (loading)
        loading.style.display =
            "none";


    if (content)
        content.style.display =
            "block";

}


function showError(
    message
) {

    if (loading)
        loading.style.display =
            "none";


    if (content)
        content.style.display =
            "none";


    if (errorBox)
        errorBox.style.display =
            "flex";


    if (errorMessage)
        errorMessage.textContent =
            message;


    refreshIcons();

}


// ============================================
// HELPERS
// ============================================

function setText(
    id,
    value
) {

    const element =
        document.getElementById(
            id
        );


    if (element) {

        element.textContent =
            value;

    }

}


function setInitial(
    id,
    name
) {

    const element =
        document.getElementById(
            id
        );


    if (!element)
        return;


    element.textContent =
        String(
            name || "S"
        )
            .charAt(0)
            .toUpperCase();

}


function formatDuration(
    value
) {

    if (
        typeof value ===
        "number"
    ) {

        return `${value} hours`;

    }


    return String(value);

}


function escapeHTML(
    value
) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        String(
            value ?? ""
        );


    return div.innerHTML;

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


function goBack() {
    window.location.href = "marketplace.html";
}