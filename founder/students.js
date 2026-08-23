/* ===================================
   SSA FOUNDER OS
   STUDENTS MANAGEMENT
=================================== */

import { db } from "../js/firebase.js";
import {
    collection,
    onSnapshot,
    addDoc,
    doc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const tableBody = $("studentsTableBody");
const studentCount = $("studentCount");
const activeCount = $("activeStudentCount");
const newCount = $("newStudentCount");
const graduatedCount = $("graduatedCount");
const suspendedCount = $("suspendedCount");
const completionRate = $("completionRate");
const totalText = $("studentTotal");
const searchInput = $("studentSearch");
const courseFilter = $("courseFilter");
const statusFilter = $("statusFilter");
const sortSelect = $("sortStudents");
const refreshButton = $("refreshStudents");
const prevPage = $("prevPage");
const nextPage = $("nextPage");
const pageInfo = $("pageInfo");
const studentModal = $("studentModal");
const studentForm = $("studentForm");
const saveStudentBtn = $("saveStudentBtn");

let students = [];
let editingStudentId = null;
let currentPage = 1;
const PAGE_SIZE = 10;
let unsubscribeStudents = null;
let isLoading = true;

function normalizedStatus(value = "active") {
    return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
}

function timestampMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
}

function formatDate(value) {
    const time = timestampMillis(value);
    return time ? new Date(time).toLocaleDateString() : "--";
}

function escapeHtml(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function generateAdmissionNumber() {
    const year = new Date().getFullYear();
    const used = new Set(students.map(student => String(student.admissionNumber || "")));
    let index = students.length + 1;
    let number = `SSA-${year}-${String(index).padStart(4, "0")}`;
    while (used.has(number)) {
        index += 1;
        number = `SSA-${year}-${String(index).padStart(4, "0")}`;
    }
    return number;
}

function setLoading(loading) {
    isLoading = loading;
    if (refreshButton) refreshButton.disabled = loading;
    if (loading && tableBody) {
        tableBody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-content"><div class="empty-icon">⏳</div><h3>Loading Students</h3><p>Fetching the latest student records...</p></div></td></tr>`;
    }
}

function showLoadError() {
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-content"><div class="empty-icon">⚠️</div><h3>Unable to Load Students</h3><p>Check your Firestore connection and try again.</p><button type="button" class="secondary-btn" id="retryStudents">Retry</button></div></td></tr>`;
    $("retryStudents")?.addEventListener("click", () => subscribeStudents(true));
}

function updateStats() {
    const active = students.filter(s => String(s.status || "").toLowerCase() === "active").length;
    const graduated = students.filter(s => String(s.status || "").toLowerCase() === "graduated").length;
    const suspended = students.filter(s => String(s.status || "").toLowerCase() === "suspended").length;
    const now = new Date();
    const newThisMonth = students.filter(s => {
        const time = timestampMillis(s.createdAt);
        if (!time) return false;
        const date = new Date(time);
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;
    const progress = students.reduce((sum, s) => sum + Math.max(0, Math.min(100, Number(s.progress) || 0)), 0);

    if (studentCount) studentCount.textContent = students.length;
    if (activeCount) activeCount.textContent = active;
    if (graduatedCount) graduatedCount.textContent = graduated;
    if (suspendedCount) suspendedCount.textContent = suspended;
    if (newCount) newCount.textContent = newThisMonth;
    if (completionRate) completionRate.textContent = students.length ? `${Math.round(progress / students.length)}%` : "0%";
    if (totalText) totalText.textContent = `${students.length} ${students.length === 1 ? "Student" : "Students"}`;
}

function populateCourseFilter() {
    if (!courseFilter) return;
    const current = courseFilter.value;
    const courses = [...new Set(students.map(s => s.courseName || s.course).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b)));
    courseFilter.innerHTML = `<option value="">All Courses</option>` +
        courses.map(course => `<option value="${escapeHtml(course)}">${escapeHtml(course)}</option>`).join("");
    if (courses.includes(current)) courseFilter.value = current;
}

function getFilteredStudents() {
    const search = String(searchInput?.value || "").trim().toLowerCase();
    const course = String(courseFilter?.value || "").toLowerCase();
    const status = String(statusFilter?.value || "").toLowerCase();
    const result = students.filter(student => {
        const name = String(student.name || "").toLowerCase();
        const email = String(student.email || "").toLowerCase();
        const admission = String(student.admissionNumber || "").toLowerCase();
        const studentCourse = String(student.courseName || student.course || "").toLowerCase();
        const studentStatus = String(student.status || "").toLowerCase();
        return (!search || name.includes(search) || email.includes(search) || admission.includes(search))
            && (!course || studentCourse === course)
            && (!status || studentStatus === status);
    });

    const sort = sortSelect?.value || "newest";
    if (sort === "name") result.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    else if (sort === "oldest") result.sort((a, b) => timestampMillis(a.createdAt) - timestampMillis(b.createdAt));
    else result.sort((a, b) => timestampMillis(b.createdAt) - timestampMillis(a.createdAt));
    return result;
}

function renderStudents() {
    if (!tableBody || isLoading) return;
    const filtered = getFilteredStudents();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAGE_SIZE);

    if (!pageRows.length) {
        tableBody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-content"><div class="empty-icon">🎓</div><h3>No Students Found</h3><p>Try changing your search or filters.</p></div></td></tr>`;
    } else {
        tableBody.innerHTML = pageRows.map(student => {
            const name = escapeHtml(student.name || "Unnamed Student");
            const status = normalizedStatus(student.status || "Pending");
            const statusClass = status.toLowerCase();
            const progress = Math.max(0, Math.min(100, Number(student.progress) || 0));
            const course = escapeHtml(student.courseName || student.course || "Not Assigned");
            const email = escapeHtml(student.email || "--");
            const phone = escapeHtml(student.phone || "--");
            const admission = escapeHtml(student.admissionNumber || "Pending");
            const initial = escapeHtml((student.name || "S").charAt(0).toUpperCase());
            const actionLabel = statusClass === "suspended" ? "Restore student" : "Suspend student";
            const actionIcon = statusClass === "suspended" ? "play" : "pause";
            return `<tr>
                <td><div class="student-info"><div class="student-avatar">${initial}</div><div class="student-details"><strong>${name}</strong><small>${admission}</small></div></div></td>
                <td>${course}</td><td>${email}</td><td>${phone}</td>
                <td><span class="status status-badge ${statusClass}">${escapeHtml(status)}</span></td>
                <td><div class="progress"><div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div><span>${progress}%</span></div></td>
                <td>${formatDate(student.createdAt)}</td>
                <td><div class="action-buttons"><button type="button" class="action-btn view" title="View / edit student" aria-label="View / edit ${name}" data-student-action="edit" data-id="${escapeHtml(student.id)}"><i data-lucide="eye"></i></button><button type="button" class="action-btn" title="${actionLabel}" aria-label="${actionLabel}" data-student-action="toggle-status" data-id="${escapeHtml(student.id)}"><i data-lucide="${actionIcon}"></i></button></div></td>
            </tr>`;
        }).join("");
    }

    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
    if (prevPage) prevPage.disabled = currentPage <= 1;
    if (nextPage) nextPage.disabled = currentPage >= totalPages;
    if (window.lucide) window.lucide.createIcons();
}

function subscribeStudents(showLoading = true) {
    if (unsubscribeStudents) unsubscribeStudents();
    if (showLoading) setLoading(true);
    unsubscribeStudents = onSnapshot(collection(db, "students"), snapshot => {
        students = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        updateStats();
        populateCourseFilter();
        currentPage = 1;
        setLoading(false);
        renderStudents();
    }, error => {
        console.error("Students realtime listener failed:", error);
        setLoading(false);
        showLoadError();
    });
}

function openStudentModal(student = null) {
    if (!studentModal || !studentForm) return;
    editingStudentId = student?.id || null;
    const title = studentModal.querySelector(".modal-header h3");
    if (title) title.textContent = student ? "Edit Student" : "Add New Student";
    if (saveStudentBtn) saveStudentBtn.textContent = student ? "Save Changes" : "Save Student";
    studentForm.reset();
    $("studentStatus").value = String(student?.status || "active").toLowerCase();
    if (student) {
        $("studentName").value = student.name || "";
        $("studentEmail").value = student.email || "";
        $("studentPhone").value = student.phone || "";
        $("studentCourse").value = student.courseName || student.course || "";
    }
    studentModal.classList.add("active");
    document.body.classList.add("modal-open");
    setTimeout(() => $("studentName")?.focus(), 50);
}

function closeStudentModal() {
    if (!studentModal) return;
    studentModal.classList.remove("active");
    document.body.classList.remove("modal-open");
    editingStudentId = null;
}

$("addStudentBtn")?.addEventListener("click", () => openStudentModal());
$("closeStudentModal")?.addEventListener("click", closeStudentModal);
studentModal?.addEventListener("click", event => {
    if (event.target === studentModal) closeStudentModal();
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && studentModal?.classList.contains("active")) closeStudentModal();
});

studentForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (saveStudentBtn) saveStudentBtn.disabled = true;
    const name = $("studentName")?.value.trim();
    const email = $("studentEmail")?.value.trim();
    const phone = $("studentPhone")?.value.trim();
    const course = $("studentCourse")?.value.trim();
    const status = normalizedStatus($("studentStatus")?.value || "active");
    const record = { name, email, phone, courseName: course, course, status, updatedAt: serverTimestamp() };
    try {
        if (editingStudentId) await updateDoc(doc(db, "students", editingStudentId), record);
        else await addDoc(collection(db, "students"), { ...record, admissionNumber: generateAdmissionNumber(), role: "student", progress: 0, createdAt: serverTimestamp() });
        closeStudentModal();
    } catch (error) {
        console.error("Saving student failed:", error);
        alert("Unable to save this student. Please check your Firestore permissions.");
    } finally {
        if (saveStudentBtn) saveStudentBtn.disabled = false;
    }
});

tableBody?.addEventListener("click", async event => {
    const button = event.target.closest("[data-student-action]");
    if (!button) return;
    const student = students.find(item => item.id === button.dataset.id);
    if (!student) return;
    if (button.dataset.studentAction === "edit") {
        openStudentModal(student);
        return;
    }
    const nextStatus = String(student.status || "").toLowerCase() === "suspended" ? "Active" : "Suspended";
    button.disabled = true;
    try {
        await updateDoc(doc(db, "students", student.id), { status: nextStatus, updatedAt: serverTimestamp() });
    } catch (error) {
        console.error("Updating student status failed:", error);
        alert("Unable to update this student.");
    } finally {
        button.disabled = false;
    }
});

[searchInput, courseFilter, statusFilter, sortSelect].forEach(control => {
    control?.addEventListener("input", () => { currentPage = 1; renderStudents(); });
    control?.addEventListener("change", () => { currentPage = 1; renderStudents(); });
});

refreshButton?.addEventListener("click", () => subscribeStudents(true));
prevPage?.addEventListener("click", () => { if (currentPage > 1) { currentPage--; renderStudents(); } });
nextPage?.addEventListener("click", () => { const totalPages = Math.max(1, Math.ceil(getFilteredStudents().length / PAGE_SIZE)); if (currentPage < totalPages) { currentPage++; renderStudents(); } });

$("exportStudentsBtn")?.addEventListener("click", () => {
    const rows = [["Name", "Email", "Phone", "Course", "Status", "Admission Number"]];
    getFilteredStudents().forEach(student => rows.push([student.name || "", student.email || "", student.phone || "", student.courseName || student.course || "", student.status || "", student.admissionNumber || ""]));
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "spark-stack-students.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
});

window.addEventListener("beforeunload", () => unsubscribeStudents?.());
subscribeStudents(true);
