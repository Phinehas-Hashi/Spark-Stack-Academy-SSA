import { auth, db } from "../../js/firebase.js";

import {
    collection,
    addDoc,
    getDocs,
    query,
    where,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const EVENTS_COLLECTION = "calendarEvents";

const state = {
    currentDate: new Date(),
    events: []
};

const monthLabel = document.getElementById("calendarMonthLabel");
const calendarGrid = document.getElementById("calendarGrid");
const upcomingEvents = document.getElementById("upcomingEvents");

const detailsModal = document.getElementById("eventDetailsModal");
const createModal = document.getElementById("createEventModal");

const detailsTitle = document.getElementById("detailsTitle");
const detailsType = document.getElementById("detailsType");
const detailsDate = document.getElementById("detailsDate");
const detailsCourse = document.getElementById("detailsCourse");
const detailsDescription = document.getElementById("detailsDescription");

const createForm = document.getElementById("createEventForm");
const eventFormError = document.getElementById("eventFormError");

const TYPE_LABELS = {
    assignment: "Assignment",
    quiz: "Quiz",
    course: "Course",
    announcement: "Announcement",
    event: "Event"
};

function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
        window.lucide.createIcons();
    }
}

function pad(value) {
    return String(value).padStart(2, "0");
}

function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeDate(value) {
    if (!value) return null;

    if (value?.toDate) {
        return value.toDate();
    }

    if (value instanceof Date) {
        return value;
    }

    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof value?.seconds === "number") {
        return new Date(value.seconds * 1000);
    }

    return null;
}

function formatDate(date) {
    if (!date) return "Date not available";

    return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function formatShortDate(date) {
    if (!date) return "";

    return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit"
    }).format(date);
}

function normalizeEvent(docSnap) {
    const data = docSnap.data();

    return {
        id: docSnap.id,
        title: data.title || "Untitled Event",
        description: data.description || "",
        type: data.type || "event",
        startAt: normalizeDate(data.startAt),
        endAt: normalizeDate(data.endAt),
        courseId: data.courseId || "",
        courseName: data.courseName || "",
        userId: data.userId || "",
        audience: data.audience || "students"
    };
}

async function loadEvents() {
    calendarGrid.innerHTML = `
        <div class="calendar-loading">
            <i data-lucide="loader-circle"></i>
            <span>Loading calendar...</span>
        </div>
    `;
    refreshIcons();

    try {
        const user = auth.currentUser;

        if (!user) {
            calendarGrid.innerHTML = `
                <div class="calendar-empty">
                    <i data-lucide="lock"></i>
                    <strong>Sign in required</strong>
                    <span>Please sign in to view your teaching calendar.</span>
                </div>
            `;
            refreshIcons();
            return;
        }

        const snapshot = await getDocs(collection(db, EVENTS_COLLECTION));

        state.events = snapshot.docs
            .map(normalizeEvent)
            .filter(event => {
                if (!event.startAt) return false;

                if (event.audience === "user" || event.audience === "private") {
                    return event.userId === user.uid;
                }

                return (
                    event.audience === "all" ||
                    event.audience === "instructors" ||
                    event.audience === "students" ||
                    event.userId === user.uid
                );
            });

        renderCalendar();
        renderUpcoming();
    } catch (error) {
        console.error("❌ Calendar load failed:", error);

        calendarGrid.innerHTML = `
            <div class="calendar-empty">
                <i data-lucide="triangle-alert"></i>
                <strong>Calendar unavailable</strong>
                <span>We couldn't load calendar events right now.</span>
            </div>
        `;

        refreshIcons();
    }
}

function renderCalendar() {
    const year = state.currentDate.getFullYear();
    const month = state.currentDate.getMonth();

    monthLabel.textContent = new Intl.DateTimeFormat(undefined, {
        month: "long",
        year: "numeric"
    }).format(state.currentDate);

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startOffset = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const previousMonthLastDay = new Date(year, month, 0).getDate();

    calendarGrid.innerHTML = "";

    const cells = [];

    for (let i = startOffset - 1; i >= 0; i--) {
        cells.push({
            date: new Date(year, month - 1, previousMonthLastDay - i),
            otherMonth: true
        });
    }

    for (let day = 1; day <= totalDays; day++) {
        cells.push({
            date: new Date(year, month, day),
            otherMonth: false
        });
    }

    while (cells.length < 42) {
        const nextDay = cells.length - (startOffset + totalDays) + 1;

        cells.push({
            date: new Date(year, month + 1, nextDay),
            otherMonth: true
        });
    }

    const todayKey = dateKey(new Date());

    cells.forEach(cell => {
        const key = dateKey(cell.date);

        const day = document.createElement("div");
        day.className = "calendar-day";

        if (cell.otherMonth) {
            day.classList.add("other-month");
        }

        if (key === todayKey) {
            day.classList.add("today");
        }

        const number = document.createElement("span");
        number.className = "calendar-day-number";
        number.textContent = cell.date.getDate();

        day.appendChild(number);

        const eventsContainer = document.createElement("div");
        eventsContainer.className = "calendar-events";

        const eventsForDay = state.events
            .filter(event => dateKey(event.startAt) === key)
            .sort((a, b) => a.startAt - b.startAt);

        eventsForDay.slice(0, 4).forEach(event => {
            const button = document.createElement("button");

            button.type = "button";
            button.className = `calendar-event-chip ${event.type}`;
            button.textContent = event.title;
            button.title = event.title;

            button.addEventListener("click", eventClick => {
                eventClick.stopPropagation();
                openDetails(event);
            });

            eventsContainer.appendChild(button);
        });

        if (eventsForDay.length > 4) {
            const more = document.createElement("span");
            more.className = "calendar-event-chip";
            more.textContent = `+${eventsForDay.length - 4} more`;
            eventsContainer.appendChild(more);
        }

        day.appendChild(eventsContainer);
        calendarGrid.appendChild(day);
    });

    refreshIcons();
}

function renderUpcoming() {
    const now = new Date();

    const upcoming = state.events
        .filter(event => event.startAt >= now)
        .sort((a, b) => a.startAt - b.startAt)
        .slice(0, 8);

    if (!upcoming.length) {
        upcomingEvents.innerHTML = `
            <div class="calendar-empty">
                <i data-lucide="calendar-off"></i>
                <strong>No upcoming events</strong>
                <span>Your upcoming teaching events will appear here.</span>
            </div>
        `;

        refreshIcons();
        return;
    }

    upcomingEvents.innerHTML = "";

    upcoming.forEach(event => {
        const item = document.createElement("article");
        item.className = "upcoming-event";

        item.innerHTML = `
            <div class="upcoming-event-top">
                <span class="upcoming-event-type">${escapeHtml(TYPE_LABELS[event.type] || "Event")}</span>
            </div>

            <div class="upcoming-event-date">
                ${escapeHtml(formatShortDate(event.startAt))}
            </div>

            <div class="upcoming-event-title">
                ${escapeHtml(event.title)}
            </div>

            ${event.courseName
                ? `<div class="upcoming-event-course">${escapeHtml(event.courseName)}</div>`
                : ""
            }
        `;

        item.addEventListener("click", () => openDetails(event));
        upcomingEvents.appendChild(item);
    });
}

function openDetails(event) {
    detailsType.textContent = TYPE_LABELS[event.type] || "EVENT";
    detailsTitle.textContent = event.title;
    detailsDate.textContent = formatDate(event.startAt);

    if (event.endAt) {
        detailsDate.textContent += ` → ${formatDate(event.endAt)}`;
    }

    detailsCourse.textContent = event.courseName || "General teaching event";
    detailsDescription.textContent =
        event.description || "No additional details were provided.";

    openModal(detailsModal);
}

function openModal(modal) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    refreshIcons();
}

function closeModal(modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
}

function openCreateModal() {
    eventFormError.textContent = "";
    eventFormError.classList.remove("visible");
    openModal(createModal);
}

function closeCreateModal() {
    closeModal(createModal);
}

function toLocalDateTimeValue(date) {
    const d = new Date(date);

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setupFormDefaults() {
    const start = new Date();
    start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30, 0, 0);

    const end = new Date(start);
    end.setHours(end.getHours() + 1);

    document.getElementById("eventStart").value = toLocalDateTimeValue(start);
    document.getElementById("eventEnd").value = toLocalDateTimeValue(end);
}

async function createEvent(event) {
    event.preventDefault();

    const user = auth.currentUser;

    if (!user) {
        showFormError("You must be signed in to create an event.");
        return;
    }

    const title = document.getElementById("eventTitle").value.trim();
    const type = document.getElementById("eventType").value;
    const startValue = document.getElementById("eventStart").value;
    const endValue = document.getElementById("eventEnd").value;
    const courseName = document.getElementById("eventCourse").value.trim();
    const description = document.getElementById("eventDescription").value.trim();

    const startAt = new Date(startValue);
    const endAt = new Date(endValue);

    if (!title) {
        showFormError("Please enter an event title.");
        return;
    }

    if (
        Number.isNaN(startAt.getTime()) ||
        Number.isNaN(endAt.getTime())
    ) {
        showFormError("Please enter valid start and end times.");
        return;
    }

    if (endAt <= startAt) {
        showFormError("The end time must be after the start time.");
        return;
    }

    const submitButton = createForm.querySelector('button[type="submit"]');

    try {
        submitButton.disabled = true;
        submitButton.innerHTML = `
            <i data-lucide="loader-circle"></i>
            Creating...
        `;
        refreshIcons();

        await addDoc(collection(db, EVENTS_COLLECTION), {
            title,
            description,
            type,
            startAt,
            endAt,
            courseId: "",
            courseName,
            userId: user.uid,
            audience: "students",
            createdAt: serverTimestamp()
        });

        createForm.reset();
        setupFormDefaults();
        closeCreateModal();

        await loadEvents();
    } catch (error) {
        console.error("❌ Event creation failed:", error);
        showFormError("Couldn't create the event. Check your Firebase permissions and try again.");
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = `
            <i data-lucide="plus"></i>
            Create Event
        `;
        refreshIcons();
    }
}

function showFormError(message) {
    eventFormError.textContent = message;
    eventFormError.classList.add("visible");
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

document.getElementById("previousMonthBtn")?.addEventListener("click", () => {
    state.currentDate = new Date(
        state.currentDate.getFullYear(),
        state.currentDate.getMonth() - 1,
        1
    );

    renderCalendar();
});

document.getElementById("nextMonthBtn")?.addEventListener("click", () => {
    state.currentDate = new Date(
        state.currentDate.getFullYear(),
        state.currentDate.getMonth() + 1,
        1
    );

    renderCalendar();
});

document.getElementById("todayBtn")?.addEventListener("click", () => {
    state.currentDate = new Date();
    renderCalendar();
});

document.getElementById("createEventBtn")?.addEventListener(
    "click",
    openCreateModal
);

createForm?.addEventListener("submit", createEvent);

document.querySelectorAll("[data-close-modal]").forEach(element => {
    element.addEventListener("click", () => closeModal(detailsModal));
});

document.querySelectorAll("[data-close-create]").forEach(element => {
    element.addEventListener("click", closeCreateModal);
});

document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;

    closeModal(detailsModal);
    closeCreateModal();
});

setupFormDefaults();

window.addEventListener("load", () => {
    refreshIcons();
});

loadEvents();
