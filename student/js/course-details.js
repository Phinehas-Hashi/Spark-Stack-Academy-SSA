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
let lessons = [];

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


        await loadLessons();

        renderCourse();


        if (currentUser) {

            await checkEnrollment();

        } else {

            setGuestState();

        }


        showContent();

    }

    catch (error) {

        console.error(
            "❌ COURSE LOAD FAILED:",
            error
        );

        showError(
            "Unable to load this course right now."
        );

    }

}


// ============================================
// LOAD LESSONS
// ============================================

async function loadLessons() {
    const lessonQueries = [
        query(
            collection(db, "courseLessons"),
            where("courseId", "==", courseId)
        ),
        query(
            collection(db, "courseLessons"),
            where("courseID", "==", courseId)
        )
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

    const isFree =
        course.isFree === true ||
        price <= 0;


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

    const box =
        document.getElementById(
            "curriculumList"
        );

    if (!box)
        return;


    if (!lessons.length) {

        box.innerHTML = `

            <div class="curriculum-empty">

                <i data-lucide="book-open"></i>

                <h3>
                    Curriculum coming soon
                </h3>

                <p>
                    Lessons are being prepared by the instructor.
                </p>

            </div>

        `;

        refreshIcons();

        return;

    }


    box.innerHTML =
        lessons
            .map(
                (lesson, index) => {

                    const type =
                        lesson.type ||
                        "lesson";


                    const duration =
                        lesson.duration
                            ? `${lesson.duration} min`
                            : "";


                    return `

                        <div class="curriculum-item">

                            <div class="lesson-number">
                                ${index + 1}
                            </div>


                            <div class="lesson-icon">

                                <i data-lucide="${
                                    type === "video"
                                        ? "play-circle"
                                        : "file-text"
                                }"></i>

                            </div>


                            <div class="lesson-info">

                                <strong>
                                    ${escapeHTML(
                                        lesson.title ||
                                        `Lesson ${index + 1}`
                                    )}
                                </strong>

                                <span>
                                    ${
                                        duration ||
                                        "Lesson"
                                    }
                                </span>

                            </div>


                            <i
                                class="lesson-lock"
                                data-lucide="lock">
                            </i>

                        </div>

                    `;

                }
            )
            .join("");


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


        const isFree =
            course.isFree === true ||
            price <= 0;


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


            showToast(
                "Enrollment failed. Please try again.",
                "error"
            );

        }

    }
);


// ============================================
// FREE ENROLLMENT
// ============================================

async function enrollFree() {

    if (!currentUser || !course)
        return;


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

    const enrollmentRef =
        doc(
            db,
            "enrollments",
            `${currentUser.uid}_${courseId}`
        );


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


    const isFree =
        course?.isFree === true ||
        price <= 0;


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