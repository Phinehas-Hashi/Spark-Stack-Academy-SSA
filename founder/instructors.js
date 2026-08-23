// ============================================================
// SPARK STACK ACADEMY — FOUNDER OS — INSTRUCTORS
// Firestore-backed management, filters, pagination and modals
// ============================================================

import { db } from "../js/firebase.js";
import {
    collection,
    addDoc,
    getDocs,
    query,
    orderBy,
    serverTimestamp,
    doc,
    getDoc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const state = {
    instructors: [],
    filtered: [],
    courses: [],
    page: 1,
    pageSize: 10,
    editingId: null
};

const table = $("instructorsTableBody");
const modal = $("instructorModal");
const form = $("instructorForm");

const esc = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function showMessage(message, type = "success") {
    if (window.showFounderToast) window.showFounderToast(message, type);
    else window.showToast?.(message, type);
}

function refreshIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

function closeModal() {
    modal?.classList.remove("active");
    document.body.classList.remove("modal-open");
    state.editingId = null;
}

async function loadCourses() {
    const select = $("instructorCourses");
    if (!select) return;

    try {
        const snap = await getDocs(collection(db, "courses"));
        state.courses = snap.docs.map(item => ({ id: item.id, ...item.data() }));
        select.innerHTML = state.courses.length
            ? state.courses.map(course => `<option value="${esc(course.id)}">${esc(course.title || course.name || "Untitled course")}</option>`).join("")
            : "<option disabled>No courses available</option>";
    } catch (error) {
        console.error("Loading courses failed:", error);
        state.courses = [];
        select.innerHTML = "<option disabled>Unable to load courses</option>";
    }
}

async function loadInstructors() {
    if (!table) return;
    table.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-content"><div class="empty-icon">⏳</div><h3>Loading instructors...</h3><p>Fetching the teaching team from Firestore.</p></div></td></tr>`;

    try {
        const ref = collection(db, "instructors");
        let snap;
        try {
            snap = await getDocs(query(ref, orderBy("createdAt", "desc")));
        } catch {
            snap = await getDocs(ref);
        }

        state.instructors = snap.docs.map(item => ({ id: item.id, ...item.data() }));
        buildSpecializations();
        applyFilters();
    } catch (error) {
        console.error("Loading instructors failed:", error);
        table.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-content"><div class="empty-icon">⚠️</div><h3>Unable to load instructors</h3><p>${esc(error.message || "Firestore request failed.")}</p><button class="secondary-btn" id="retryInstructors">Retry</button></div></td></tr>`;
        $("retryInstructors")?.addEventListener("click", loadInstructors);
    }
}

function buildSpecializations() {
    const select = $("specializationFilter");
    if (!select) return;
    const current = select.value;
    const values = [...new Set(state.instructors.map(i => String(i.specialization || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    select.innerHTML = `<option value="">All Specializations</option>` + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    select.value = values.includes(current) ? current : "";
}

function applyFilters() {
    const search = ($( "instructorSearch")?.value || "").trim().toLowerCase();
    const specialization = $("specializationFilter")?.value || "";
    const status = $("statusFilter")?.value || "";
    const sort = $("sortInstructors")?.value || "newest";

    state.filtered = state.instructors.filter(item => {
        const haystack = [item.name, item.email, item.phone, item.specialization, item.bio].join(" ").toLowerCase();
        const matchesSearch = !search || haystack.includes(search);
        const matchesSpec = !specialization || item.specialization === specialization;
        const matchesStatus = !status || String(item.status || "active").toLowerCase() === status;
        return matchesSearch && matchesSpec && matchesStatus;
    });

    state.filtered.sort((a, b) => {
        if (sort === "name") return String(a.name || "").localeCompare(String(b.name || ""));
        const ta = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const tb = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return sort === "oldest" ? ta - tb : tb - ta;
    });

    state.page = Math.min(state.page, Math.max(1, Math.ceil(state.filtered.length / state.pageSize)));
    render();
}

function render() {
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    const start = (state.page - 1) * state.pageSize;
    const rows = state.filtered.slice(start, start + state.pageSize);

    $("instructorTotal") && ($( "instructorTotal").textContent = `${state.filtered.length} Instructor${state.filtered.length === 1 ? "" : "s"}`);
    $("pageInfo") && ($( "pageInfo").textContent = `Page ${state.page} of ${totalPages}`);
    $("prevPage") && ($( "prevPage").disabled = state.page <= 1);
    $("nextPage") && ($( "nextPage").disabled = state.page >= totalPages);

    updateStats();

    if (!rows.length) {
        table.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-content"><div class="empty-icon">👨‍🏫</div><h3>No instructors found</h3><p>Try changing your filters or add a new instructor.</p></div></td></tr>`;
        return;
    }

    table.innerHTML = rows.map(item => {
        const name = item.name || "Unnamed Instructor";
        const status = String(item.status || "active").toLowerCase();
        const courses = Array.isArray(item.courses) ? item.courses.length : 0;
        const joined = formatDate(item.createdAt);
        return `<tr>
            <td><div class="instructor-info"><div class="instructor-avatar">${esc(name.charAt(0).toUpperCase())}</div><div class="instructor-details"><span class="instructor-name">${esc(name)}</span><span class="instructor-specialization">${esc(item.specialization || "No specialization")}</span></div></div></td>
            <td>${esc(item.specialization || "—")}</td>
            <td>${courses}</td>
            <td>${Number(item.studentsCount ?? item.studentCount ?? 0)}</td>
            <td>${esc(item.email || "—")}</td>
            <td><span class="status ${esc(status)}">${esc(status)}</span></td>
            <td>${esc(joined)}</td>
            <td><div class="action-buttons">
                <button class="action-btn view-instructor" data-id="${esc(item.id)}" title="View" aria-label="View instructor"><i data-lucide="eye"></i></button>
                <button class="action-btn edit-instructor" data-id="${esc(item.id)}" title="Edit" aria-label="Edit instructor"><i data-lucide="pencil"></i></button>
                <button class="action-btn delete-instructor" data-id="${esc(item.id)}" title="Suspend" aria-label="Suspend instructor"><i data-lucide="user-x"></i></button>
            </div></td>
        </tr>`;
    }).join("");
    refreshIcons();
}

function updateStats() {
    const all = state.instructors;
    const active = all.filter(i => String(i.status || "active").toLowerCase() === "active");
    const suspended = all.filter(i => String(i.status || "").toLowerCase() === "suspended");
    const assigned = all.reduce((sum, i) => sum + (Array.isArray(i.courses) ? i.courses.length : 0), 0);
    const managed = all.reduce((sum, i) => sum + Number(i.studentsCount ?? i.studentCount ?? 0), 0);
    const month = new Date();
    const newThisMonth = all.filter(i => {
        const date = toDate(i.createdAt);
        return date && date.getMonth() === month.getMonth() && date.getFullYear() === month.getFullYear();
    }).length;

    $("instructorCount") && ($("instructorCount").textContent = all.length);
    $("activeInstructorCount") && ($("activeInstructorCount").textContent = active.length);
    $("assignedCourseCount") && ($("assignedCourseCount").textContent = assigned);
    $("newInstructorCount") && ($("newInstructorCount").textContent = newThisMonth);
    $("managedStudentCount") && ($("managedStudentCount").textContent = managed);
    $("suspendedInstructorCount") && ($("suspendedInstructorCount").textContent = suspended.length);
}

function toDate(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate();
    if (value.seconds) return new Date(value.seconds * 1000);
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value) {
    const date = toDate(value);
    return date ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

async function openInstructorModal(instructor = null) {
    state.editingId = instructor?.id || null;
    await loadCourses();
    form?.reset();

    const title = modal?.querySelector(".modal-header h3");
    if (title) title.textContent = instructor ? "Edit Instructor" : "Add New Instructor";

    if (instructor) {
        $("instructorName").value = instructor.name || "";
        $("instructorEmail").value = instructor.email || "";
        $("instructorPhone").value = instructor.phone || "";
        $("instructorSpecialization").value = instructor.specialization || "";
        $("instructorBio").value = instructor.bio || "";
        $("instructorStatus").value = instructor.status || "active";
        const selected = new Set(Array.isArray(instructor.courses) ? instructor.courses : []);
        Array.from($("instructorCourses")?.options || []).forEach(option => option.selected = selected.has(option.value));
    }

    modal?.classList.add("active");
    document.body.classList.add("modal-open");
    setTimeout(() => $("instructorName")?.focus(), 50);
}

async function saveInstructor(event) {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;

    const data = {
        name: $("instructorName").value.trim(),
        email: $("instructorEmail").value.trim(),
        phone: $("instructorPhone").value.trim(),
        specialization: $("instructorSpecialization").value.trim(),
        bio: $("instructorBio").value.trim(),
        status: $("instructorStatus").value,
        role: "instructor",
        courses: Array.from($("instructorCourses")?.selectedOptions || []).map(option => option.value),
        permissions: {
            canCreateCourse: true,
            canEditOwnCourses: true,
            canUploadMaterials: true,
            canCreateAssignments: true,
            canGradeStudents: true,
            canViewAssignedStudents: true,
            canManageRevenue: false,
            canAccessFounderData: false,
            canManageAcademySettings: false
        }
    };

    try {
        if (state.editingId) {
            await updateDoc(doc(db, "instructors", state.editingId), { ...data, updatedAt: serverTimestamp() });
            showMessage("Instructor updated successfully.");
        } else {
            await addDoc(collection(db, "instructors"), { ...data, createdAt: serverTimestamp() });
            showMessage("Instructor added successfully.");
        }
        closeModal();
        await loadInstructors();
    } catch (error) {
        console.error("Saving instructor failed:", error);
        showMessage(error.message || "Unable to save instructor.", "error");
    } finally {
        if (submit) submit.disabled = false;
    }
}

async function handleTableAction(event) {
    const button = event.target.closest("button[data-id]");
    if (!button) return;
    const id = button.dataset.id;
    const instructor = state.instructors.find(item => item.id === id);
    if (!instructor) return;

    if (button.classList.contains("view-instructor")) {
        window.location.href = `instructors-profile.html?id=${encodeURIComponent(id)}`;
        return;
    }

    if (button.classList.contains("edit-instructor")) {
        await openInstructorModal(instructor);
        return;
    }

    if (button.classList.contains("delete-instructor")) {
        const currentlySuspended = String(instructor.status || "").toLowerCase() === "suspended";
        const next = currentlySuspended ? "active" : "suspended";
        const confirmed = await window.ssaConfirm?.(
            `${currentlySuspended ? "Restore" : "Suspend"} ${instructor.name || "this instructor"}?`,
            {
                title: currentlySuspended ? "Restore instructor" : "Suspend instructor",
                confirmText: currentlySuspended ? "Restore" : "Suspend",
                cancelText: "Keep as is",
                tone: currentlySuspended ? "info" : "danger",
                icon: currentlySuspended ? "↻" : "🚫"
            }
        );
        if (!confirmed) return;
        try {
            await updateDoc(doc(db, "instructors", id), { status: next, updatedAt: serverTimestamp() });
            showMessage(next === "suspended" ? "Instructor suspended." : "Instructor restored.");
            await loadInstructors();
        } catch (error) {
            console.error(error);
            showMessage(error.message || "Unable to update instructor.", "error");
        }
    }
}

function exportCSV() {
    const rows = state.filtered;
    if (!rows.length) return showMessage("No instructors to export.", "error");
    const headers = ["Name", "Email", "Phone", "Specialization", "Courses", "Students", "Status", "Joined"];
    const lines = [headers, ...rows.map(i => [i.name || "", i.email || "", i.phone || "", i.specialization || "", Array.isArray(i.courses) ? i.courses.length : 0, Number(i.studentsCount ?? i.studentCount ?? 0), i.status || "active", formatDate(i.createdAt)])];
    const csv = lines.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ssa-instructors-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

function bindEvents() {
    $("addInstructorBtn")?.addEventListener("click", () => openInstructorModal());
    $("closeInstructorModal")?.addEventListener("click", closeModal);
    modal?.addEventListener("click", event => { if (event.target === modal) closeModal(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && modal?.classList.contains("active")) closeModal(); });
    form?.addEventListener("submit", saveInstructor);
    table?.addEventListener("click", handleTableAction);
    $("exportInstructorBtn")?.addEventListener("click", exportCSV);
    $("refreshInstructors")?.addEventListener("click", loadInstructors);
    $("instructorSearch")?.addEventListener("input", () => { state.page = 1; applyFilters(); });
    $("specializationFilter")?.addEventListener("change", () => { state.page = 1; applyFilters(); });
    $("statusFilter")?.addEventListener("change", () => { state.page = 1; applyFilters(); });
    $("sortInstructors")?.addEventListener("change", () => { state.page = 1; applyFilters(); });
    $("prevPage")?.addEventListener("click", () => { if (state.page > 1) { state.page--; render(); } });
    $("nextPage")?.addEventListener("click", () => { if (state.page < Math.ceil(state.filtered.length / state.pageSize)) { state.page++; render(); } });
}

bindEvents();
await Promise.all([loadCourses(), loadInstructors()]);
refreshIcons();
console.log("🔥 Founder Instructors module ready.");