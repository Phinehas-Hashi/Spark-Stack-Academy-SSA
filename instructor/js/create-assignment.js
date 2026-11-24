// ============================================================
// SPARK STACK ACADEMY
// CREATE ASSIGNMENT ENGINE
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
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


let instructor = null;

const $ = id =>
    document.getElementById(id);


// ============================================================
// BOOT
// ============================================================

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        try {

            await waitForInstructor();

            instructor = await waitForInstructor();


            await loadCourses();

            setupForm();
            const dueDateField = $("dueDate");
            if (dueDateField) {
                const localNow = new Date();
                localNow.setMinutes(localNow.getMinutes() - localNow.getTimezoneOffset());
                dueDateField.min = localNow.toISOString().slice(0, 16);
            }

            refreshIcons();


            console.log(
                "✓ Create Assignment loaded"
            );


        } catch (error) {

            console.error(
                "❌ Create Assignment boot error:",
                error
            );

        }

    }
);


// ============================================================
// WAIT FOR AUTH
// ============================================================

function waitForInstructor() {
    return new Promise((resolve, reject) => {
        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;

            if (window.currentInstructor) {
                clearInterval(timer);
                resolve(window.currentInstructor);
                return;
            }

            if (attempts >= 100) {
                clearInterval(timer);
                reject(new Error("Instructor session was not ready. Refresh and sign in again."));
            }
        }, 100);
    });
}

// ============================================================
// LOAD INSTRUCTOR COURSES
// ============================================================

async function loadCourses() {

    const select =
        $("courseSelect");


    if (!select) return;


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


        select.innerHTML = "";


        if (
            snapshot.empty
        ) {

            select.innerHTML = `
                <option value="">
                    No courses available
                </option>
            `;

            return;

        }


        const defaultOption =
            document.createElement(
                "option"
            );


        defaultOption.value = "";

        defaultOption.textContent =
            "Select a course";


        select.appendChild(
            defaultOption
        );


        snapshot.docs
            .sort((a, b) => {

                const titleA =
                    String(
                        a.data().title || ""
                    );

                const titleB =
                    String(
                        b.data().title || ""
                    );

                return titleA.localeCompare(
                    titleB
                );

            })
            .forEach(courseDoc => {

                const data =
                    courseDoc.data();


                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    courseDoc.id;


                option.textContent =
                    data.title ||
                    "Untitled Course";


                option.dataset.courseName =
                    data.title ||
                    "Untitled Course";


                select.appendChild(
                    option
                );

            });


    } catch (error) {

        console.error(
            "❌ Failed to load courses:",
            error
        );


        select.innerHTML = `
            <option value="">
                Unable to load courses
            </option>
        `;

    }

}


// ============================================================
// FORM
// ============================================================

function setupForm() {

    const form =
        $("assignmentForm");


    if (!form) return;


    form.addEventListener(
        "submit",
        createAssignment
    );

}


// ============================================================
// CREATE ASSIGNMENT
// ============================================================

async function createAssignment(event) {
    event.preventDefault();
    if (!instructor?.uid) {
        showMessage("Your instructor session is unavailable. Refresh and sign in again.", "error");
        return;
    }

    const title = $("assignmentTitle")?.value.trim() || "";
    const description = $("assignmentDescription")?.value.trim() || "";
    const courseSelect = $("courseSelect");
    const courseId = courseSelect?.value || "";
    const selectedCourse = courseSelect?.selectedOptions?.[0];
    const courseName = selectedCourse?.dataset.courseName || selectedCourse?.textContent || "";
    const dueDateInput = $("dueDate")?.value || "";
    const maxScore = Number($("maxScore")?.value);
    const status = $("assignmentStatus")?.value === "draft" ? "draft" : "published";

    if (title.length < 3 || title.length > 160) {
        showMessage("Use an assignment title between 3 and 160 characters.", "error");
        $("assignmentTitle")?.focus();
        return;
    }

    if (!description || description.length > 20000) {
        showMessage("Add instructions (up to 20,000 characters) before continuing.", "error");
        $("assignmentDescription")?.focus();
        return;
    }

    if (!courseId || !selectedCourse || selectedCourse.disabled) {
        showMessage("Select one of your available courses.", "error");
        courseSelect?.focus();
        return;
    }

    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 10000) {
        showMessage("Maximum score must be greater than 0 and no more than 10,000.", "error");
        $("maxScore")?.focus();
        return;
    }

    let dueDate = null;
    if (dueDateInput) {
        const parsedDueDate = new Date(dueDateInput);
        if (Number.isNaN(parsedDueDate.getTime())) {
            showMessage("Enter a valid due date and time.", "error");
            $("dueDate")?.focus();
            return;
        }
        if (parsedDueDate.getTime() <= Date.now()) {
            showMessage("The due date must be in the future. Leave it blank if there is no deadline.", "error");
            $("dueDate")?.focus();
            return;
        }
        dueDate = parsedDueDate.toISOString();
    }

    const button = $("saveAssignmentBtn");
    const originalButton = button?.innerHTML || "";
    if (button) {
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        button.innerHTML = '<span class="loading-spinner" aria-hidden="true"></span> Saving…';
    }

    try {
        const now = serverTimestamp();
        const assignmentData = {
            instructorId: instructor.uid,
            instructorName: instructor.displayName || instructor.name || "Instructor",
            courseId,
            courseName,
            title,
            description,
            instructions: description,
            maxScore,
            totalMarks: maxScore,
            dueDate,
            status,
            published: status === "published",
            ...(status === "published" ? { publishedAt: now } : {}),
            submissionCount: 0,
            submissionStatus: "none",
            gradedCount: 0,
            averageScore: 0,
            createdAt: now,
            updatedAt: now
        };

        const assignmentRef = await addDoc(collection(db, "assignments"), assignmentData);
        console.log("Assignment created:", assignmentRef.id);
        showMessage(
            status === "published"
                ? "Assignment published. It will appear for eligible students enrolled in this course."
                : "Draft saved. Students cannot see it until you publish it.",
            "success"
        );

        if (button) button.textContent = "Saved";
        window.setTimeout(() => {
            window.location.href = "assignments.html";
        }, 900);
    } catch (error) {
        console.error("Failed to save assignment:", error);
        showMessage(
            error?.code === "permission-denied"
                ? "Permission denied. Confirm your instructor account is active and verified."
                : "Unable to save the assignment. Check your connection and try again.",
            "error"
        );
        if (button) {
            button.disabled = false;
            button.removeAttribute("aria-busy");
            button.innerHTML = originalButton || '<i data-lucide="save"></i> Save Assignment';
            refreshIcons();
        }
    }
}

// ============================================================
// MESSAGE
// ============================================================

function showMessage(
    message,
    type
) {

    const element =
        $("formMessage");


    if (!element) return;


    element.hidden = false;

    element.className =
        `form-message ${type}`;

    element.textContent =
        message;

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