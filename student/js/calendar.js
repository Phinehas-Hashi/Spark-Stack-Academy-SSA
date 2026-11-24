// ============================================================
// SPARK STACK ACADEMY
// STUDENT CALENDAR
//
// Derives scheduled items from Firestore collections readable by students.
// Does not query the unruled calendarEvents collection.
// ============================================================

import { auth, db } from "../../js/firebase.js";

import {
    collection,
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ============================================================
// STATE
// ============================================================

const state = {
    currentDate: new Date(),
    events: [],
    selectedEvent: null
};


// ============================================================
// DOM
// ============================================================

const elements = {
    monthTitle: document.getElementById("calendarMonth"),
    grid: document.getElementById("calendarGrid"),
    upcoming: document.getElementById("upcomingEvents"),

    previousMonth: document.getElementById("previousMonthBtn"),
    nextMonth: document.getElementById("nextMonthBtn"),
    today: document.getElementById("todayBtn"),

    modal: document.getElementById("calendarEventModal"),
    modalClose: document.getElementById("calendarModalClose"),
    modalIcon: document.getElementById("calendarModalIcon"),
    modalType: document.getElementById("calendarModalType"),
    modalTitle: document.getElementById("calendarModalTitle"),
    modalDate: document.getElementById("calendarModalDate"),
    modalDescription: document.getElementById("calendarModalDescription"),
    modalCourse: document.getElementById("calendarModalCourse")
};


// ============================================================
// EVENT TYPE CONFIG
// ============================================================

const EVENT_TYPES = {
    assignment: {
        label: "Assignment",
        icon: "clipboard-check"
    },

    quiz: {
        label: "Quiz / Exam",
        icon: "clipboard-list"
    },

    course: {
        label: "Course",
        icon: "book-open"
    },

    announcement: {
        label: "Announcement",
        icon: "megaphone"
    },

    event: {
        label: "Event",
        icon: "calendar-days"
    }
};


// ============================================================
// DATE HELPERS
// ============================================================

function startOfDay(date) {
    const result = new Date(date);

    result.setHours(0, 0, 0, 0);

    return result;
}


function isSameDay(first, second) {
    return (
        first.getFullYear() === second.getFullYear() &&
        first.getMonth() === second.getMonth() &&
        first.getDate() === second.getDate()
    );
}


function formatMonth(date) {
    return new Intl.DateTimeFormat("en-KE", {
        month: "long",
        year: "numeric"
    }).format(date);
}


function formatDate(date) {
    return new Intl.DateTimeFormat("en-KE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    }).format(date);
}


function formatShortDate(date) {
    return new Intl.DateTimeFormat("en-KE", {
        day: "numeric",
        month: "short"
    }).format(date);
}


function formatTime(date) {
    return new Intl.DateTimeFormat("en-KE", {
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}


// ============================================================
// FIRESTORE DATE NORMALIZER
// ============================================================

function normalizeDate(value) {
    if (!value) return null;

    if (value instanceof Date) {
        return Number.isNaN(value.getTime())
            ? null
            : value;
    }

    if (
        typeof value === "object" &&
        typeof value.toDate === "function"
    ) {
        const date = value.toDate();

        return Number.isNaN(date.getTime())
            ? null
            : date;
    }

    if (
        typeof value === "object" &&
        typeof value.seconds === "number"
    ) {
        const date = new Date(
            value.seconds * 1000 +
            Math.floor((value.nanoseconds || 0) / 1000000)
        );

        return Number.isNaN(date.getTime())
            ? null
            : date;
    }

    if (typeof value === "number") {
        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? null
            : date;
    }

    if (typeof value === "string") {
        const date = new Date(value);

        return Number.isNaN(date.getTime())
            ? null
            : date;
    }

    return null;
}


// ============================================================
// NORMALIZE EVENT
// ============================================================

function normalizeEvent(id, data) {

    const start =
        normalizeDate(
            data.startAt ??
            data.start_at ??
            data.date ??
            data.eventDate
        );

    if (!start) {
        return null;
    }

    const end =
        normalizeDate(
            data.endAt ??
            data.end_at
        );

    let type = String(
        data.type ||
        "event"
    ).toLowerCase();

    if (!EVENT_TYPES[type]) {
        type = "event";
    }

    return {
        id,

        title:
            String(
                data.title ||
                "Untitled event"
            ).trim(),

        description:
            String(
                data.description ||
                ""
            ).trim(),

        type,

        startAt: start,

        endAt: end,

        courseId:
            data.courseId ||
            data.course_id ||
            "",

        courseName:
            data.courseName ||
            data.course_name ||
            "",

        userId:
            data.userId ||
            data.user_id ||
            "",

        audience:
            String(
                data.audience ||
                "all"
            ).toLowerCase(),

        createdAt:
            normalizeDate(
                data.createdAt ||
                data.created_at
            )
    };
}


// ============================================================
// EVENT VISIBILITY
// ============================================================

function eventBelongsToStudent(event, user) {

    if (!user) {
        return false;
    }

    const audience = event.audience;

    if (
        audience === "all" ||
        audience === "students" ||
        audience === "student"
    ) {
        return true;
    }

    if (
        audience === "user" ||
        audience === "private"
    ) {
        return event.userId === user.uid;
    }

    if (event.userId) {
        return event.userId === user.uid;
    }

    return true;
}


// ============================================================
// LOAD FIRESTORE EVENTS
// ============================================================

async function loadEvents(user) {
    state.events = [];
    if (!user) return;

    const enrollmentReads = [
        getDocs(query(collection(db, "enrollments"), where("userId", "==", user.uid))),
        getDocs(query(collection(db, "enrollments"), where("studentId", "==", user.uid))),
        getDocs(collection(db, "students", user.uid, "enrollments"))
    ];
    const enrollmentResults = await Promise.allSettled(enrollmentReads);
    const courseIds = new Set();

    enrollmentResults.forEach(result => {
        if (result.status !== "fulfilled") {
            console.warn("SSA Calendar: enrollment source unavailable.", result.reason);
            return;
        }
        result.value.forEach(item => {
            const enrollment = item.data();
            const status = String(enrollment.status || "").toLowerCase();
            const payment = String(enrollment.paymentStatus || "").toLowerCase();
            const active = ["active", "approved", "completed"].includes(status);
            const paidOrFree = ["paid", "free"].includes(payment) || status === "paid";
            if (enrollment.courseId && (enrollment.institutionId ? active : active && paidOrFree)) {
                courseIds.add(String(enrollment.courseId));
            }
        });
    });

    const sourceResults = await Promise.allSettled([
        getDocs(collection(db, "assignments")),
        getDocs(collection(db, "quizzes")),
        getDocs(collection(db, "announcements"))
    ]);
    const successfulSources = sourceResults.filter(result => result.status === "fulfilled").length;
    if (!successfulSources) throw new Error("No student-readable calendar sources responded.");

    const events = [];
    const addEvent = (id, data, type, dateValue) => {
        if (!dateValue) return;
        const event = normalizeEvent(id, {
            ...data,
            type,
            startAt: dateValue
        });
        if (event && eventBelongsToStudent(event, user)) events.push(event);
    };

    const assignments = sourceResults[0];
    if (assignments.status === "fulfilled") {
        assignments.value.forEach(item => {
            const data = item.data();
            if (!data.courseId || !courseIds.has(String(data.courseId))) return;
            addEvent(item.id, data, "assignment", data.dueDate || data.due_at || data.deadline);
        });
    } else console.warn("SSA Calendar: assignments unavailable.", assignments.reason);

    const quizzes = sourceResults[1];
    if (quizzes.status === "fulfilled") {
        quizzes.value.forEach(item => {
            const data = item.data();
            if (!data.courseId || !courseIds.has(String(data.courseId))) return;
            const published = data.published === true || String(data.status || "").toLowerCase() === "published";
            if (!published) return;
            addEvent(item.id, data, "quiz", data.dueDate || data.dueAt || data.scheduledAt || data.startAt || data.date);
        });
    } else console.warn("SSA Calendar: quizzes unavailable.", quizzes.reason);

    const announcements = sourceResults[2];
    if (announcements.status === "fulfilled") {
        announcements.value.forEach(item => {
            const data = item.data();
            addEvent(item.id, data, "announcement", data.eventDate || data.scheduledAt || data.createdAt);
        });
    } else console.warn("SSA Calendar: announcements unavailable.", announcements.reason);

    const unique = new Map();
    events.forEach(event => unique.set(`${event.type}:${event.id}`, event));
    state.events = Array.from(unique.values()).sort(
        (a, b) => a.startAt.getTime() - b.startAt.getTime()
    );
    console.info(`SSA Calendar: loaded ${state.events.length} item(s) from ${successfulSources} source(s).`);
}


// GET EVENTS FOR DAY
// ============================================================

function getEventsForDay(date) {

    return state.events
        .filter(event =>
            isSameDay(
                event.startAt,
                date
            )
        )
        .sort(
            (first, second) =>
                first.startAt.getTime() -
                second.startAt.getTime()
        );
}


// ============================================================
// CREATE EVENT BUTTON
// ============================================================

function createEventElement(event) {

    const type = EVENT_TYPES[event.type] || EVENT_TYPES.event;

    const button = document.createElement("button");

    button.type = "button";

    button.className =
        `calendar-event ${event.type}`;

    button.title = event.title;

    button.setAttribute(
        "aria-label",
        `${type.label}: ${event.title}`
    );

    button.innerHTML = `
        ${escapeHtml(event.title)}
    `;

    button.addEventListener(
        "click",
        () => openEventModal(event)
    );

    return button;
}


// ============================================================
// RENDER CALENDAR
// ============================================================

function renderCalendar() {

    if (!elements.grid) return;

    const current = state.currentDate;

    const year = current.getFullYear();
    const month = current.getMonth();

    if (elements.monthTitle) {
        elements.monthTitle.textContent =
            formatMonth(current);
    }

    elements.grid.innerHTML = "";

    /*
     * JavaScript:
     *     Sunday = 0
     *     Monday = 1
     *
     * SSA calendar:
     *     Monday = first day
     *
     * Convert Sunday from 0 to 6.
     */

    const firstDay = new Date(
        year,
        month,
        1
    );

    let startingDay =
        firstDay.getDay() - 1;

    if (startingDay < 0) {
        startingDay = 6;
    }

    const daysInMonth =
        new Date(
            year,
            month + 1,
            0
        ).getDate();

    const previousMonthDays =
        new Date(
            year,
            month,
            0
        ).getDate();

    const totalCells =
        Math.ceil(
            (startingDay + daysInMonth) / 7
        ) * 7;

    const today = startOfDay(
        new Date()
    );

    for (
        let cellIndex = 0;
        cellIndex < totalCells;
        cellIndex++
    ) {

        let date;
        let dayNumber;
        let isOtherMonth = false;

        if (cellIndex < startingDay) {

            dayNumber =
                previousMonthDays -
                startingDay +
                cellIndex +
                1;

            date = new Date(
                year,
                month - 1,
                dayNumber
            );

            isOtherMonth = true;

        } else if (
            cellIndex >=
            startingDay + daysInMonth
        ) {

            dayNumber =
                cellIndex -
                startingDay -
                daysInMonth +
                1;

            date = new Date(
                year,
                month + 1,
                dayNumber
            );

            isOtherMonth = true;

        } else {

            dayNumber =
                cellIndex -
                startingDay +
                1;

            date = new Date(
                year,
                month,
                dayNumber
            );
        }

        const day = document.createElement("div");

        day.className = "calendar-day";

        if (isOtherMonth) {
            day.classList.add("other-month");
        }

        if (isSameDay(date, today)) {
            day.classList.add("today");
        }

        const number = document.createElement("div");

        number.className = "day-number";
        number.textContent = dayNumber;

        day.appendChild(number);

        const eventsContainer =
            document.createElement("div");

        eventsContainer.className =
            "day-events";

        const events =
            getEventsForDay(date);

        const maxVisibleEvents =
            window.innerWidth <= 600
                ? 2
                : 3;

        events
            .slice(
                0,
                maxVisibleEvents
            )
            .forEach(event => {

                eventsContainer.appendChild(
                    createEventElement(event)
                );

            });

        if (
            events.length >
            maxVisibleEvents
        ) {

            const more =
                document.createElement("span");

            more.className =
                "calendar-more";

            more.textContent =
                `+${events.length - maxVisibleEvents} more`;

            eventsContainer.appendChild(more);
        }

        day.appendChild(
            eventsContainer
        );

        elements.grid.appendChild(day);
    }

    window.lucide?.createIcons();

    renderUpcoming();
}


// ============================================================
// RENDER UPCOMING EVENTS
// ============================================================

function renderUpcoming() {

    if (!elements.upcoming) return;

    const now = new Date();

    const upcoming =
        state.events
            .filter(event =>
                event.startAt.getTime() >=
                now.getTime()
            )
            .slice(0, 8);

    if (!upcoming.length) {

        elements.upcoming.innerHTML = `
            <div class="upcoming-empty">

                <div class="upcoming-empty-icon">
                    <i data-lucide="calendar-off"></i>
                </div>

                <strong>No upcoming events</strong>

                <p>
                    Your upcoming assignments,
                    quizzes and events will appear here.
                </p>

            </div>
        `;

        window.lucide?.createIcons();

        return;
    }

    elements.upcoming.innerHTML = "";

    upcoming.forEach(event => {

        const type =
            EVENT_TYPES[event.type] ||
            EVENT_TYPES.event;

        const item =
            document.createElement("button");

        item.type = "button";

        item.className =
            `upcoming-event ${event.type}`;

        item.innerHTML = `
            <span class="upcoming-event-icon">
                <i data-lucide="${type.icon}"></i>
            </span>

            <span class="upcoming-event-content">

                <span class="upcoming-event-title">
                    ${escapeHtml(event.title)}
                </span>

                <span class="upcoming-event-date">
                    ${escapeHtml(formatShortDate(event.startAt))}
                    ·
                    ${escapeHtml(formatTime(event.startAt))}
                </span>

                ${
                    event.courseName
                        ? `
                            <span class="upcoming-event-course">
                                ${escapeHtml(event.courseName)}
                            </span>
                        `
                        : ""
                }

            </span>
        `;

        item.addEventListener(
            "click",
            () => openEventModal(event)
        );

        elements.upcoming.appendChild(item);
    });

    window.lucide?.createIcons();
}


// ============================================================
// EVENT MODAL
// ============================================================

function openEventModal(event) {

    if (!elements.modal) return;

    state.selectedEvent = event;

    const type =
        EVENT_TYPES[event.type] ||
        EVENT_TYPES.event;

    if (elements.modalIcon) {

        elements.modalIcon.innerHTML = `
            <i data-lucide="${type.icon}"></i>
        `;
    }

    if (elements.modalType) {
        elements.modalType.textContent =
            type.label;
    }

    if (elements.modalTitle) {
        elements.modalTitle.textContent =
            event.title;
    }

    if (elements.modalDate) {

        let dateText =
            formatDate(event.startAt);

        if (event.endAt) {

            dateText +=
                ` · ${formatTime(event.startAt)} – ${formatTime(event.endAt)}`;

        } else {

            dateText +=
                ` · ${formatTime(event.startAt)}`;
        }

        elements.modalDate.textContent =
            dateText;
    }

    if (elements.modalDescription) {

        elements.modalDescription.textContent =
            event.description ||
            "No additional details have been provided for this event.";
    }

    if (elements.modalCourse) {

        if (event.courseName) {

            elements.modalCourse.textContent =
                `Course: ${event.courseName}`;

            elements.modalCourse.style.display =
                "block";

        } else {

            elements.modalCourse.textContent = "";

            elements.modalCourse.style.display =
                "none";
        }
    }

    elements.modal.classList.add("show");

    elements.modal.setAttribute(
        "aria-hidden",
        "false"
    );

    document.body.classList.add(
        "calendar-modal-open"
    );

    window.lucide?.createIcons();

    elements.modalClose?.focus();
}


// ============================================================
// CLOSE MODAL
// ============================================================

function closeEventModal() {

    if (!elements.modal) return;

    elements.modal.classList.remove("show");

    elements.modal.setAttribute(
        "aria-hidden",
        "true"
    );

    document.body.classList.remove(
        "calendar-modal-open"
    );

    state.selectedEvent = null;
}


// ============================================================
// ESCAPE HTML
// ============================================================

function escapeHtml(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


// ============================================================
// NAVIGATION
// ============================================================

function goToPreviousMonth() {

    state.currentDate =
        new Date(
            state.currentDate.getFullYear(),
            state.currentDate.getMonth() - 1,
            1
        );

    renderCalendar();
}


function goToNextMonth() {

    state.currentDate =
        new Date(
            state.currentDate.getFullYear(),
            state.currentDate.getMonth() + 1,
            1
        );

    renderCalendar();
}


function goToToday() {

    state.currentDate =
        new Date();

    renderCalendar();
}


// ============================================================
// EVENT LISTENERS
// ============================================================

elements.previousMonth?.addEventListener(
    "click",
    goToPreviousMonth
);

elements.nextMonth?.addEventListener(
    "click",
    goToNextMonth
);

elements.today?.addEventListener(
    "click",
    goToToday
);

elements.modalClose?.addEventListener(
    "click",
    closeEventModal
);

document
    .querySelectorAll("[data-calendar-modal-close]")
    .forEach(element => {

        element.addEventListener(
            "click",
            closeEventModal
        );

    });

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Escape" &&
            elements.modal?.classList.contains("show")
        ) {
            closeEventModal();
        }

    }
);


// ============================================================
// RESIZE
// ============================================================

let resizeTimer = null;

window.addEventListener(
    "resize",
    () => {

        clearTimeout(resizeTimer);

        resizeTimer = setTimeout(
            () => renderCalendar(),
            120
        );

    }
);


// ============================================================
// AUTH + BOOT
// ============================================================

auth.onAuthStateChanged(
    async user => {

        if (!user) {

            window.location.replace(
                "../login.html"
            );

            return;
        }

        await loadEvents(user);

        renderCalendar();

    }
);