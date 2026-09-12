import { db } from "../../js/firebase.js";

import {
    collection,
    getDocs,
    query,
    orderBy,
    where,
    doc,
    getDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);

let applications = [];
let filteredApplications = [];
let currentApplication = null;

const escapeHTML = value =>
    String(value ?? "").replace(/[&<>'"]/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[char]));

function normalizeStatus(status) {
    return String(status || "Pending").toLowerCase();
}

function formatDate(value) {
    if (!value) return "—";

    try {
        const date = value.toDate
            ? value.toDate()
            : new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });
    } catch {
        return "—";
    }
}

function getInitials(name) {
    return String(name || "Applicant")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(part => part[0])
        .join("")
        .toUpperCase();
}

document.addEventListener("DOMContentLoaded", () => {

    $("refreshAdmissionsBtn")
        ?.addEventListener("click", loadApplications);

    $("admissionSearch")
        ?.addEventListener("input", applyFilters);

    $("admissionStatusFilter")
        ?.addEventListener("change", applyFilters);

    $("admissionSort")
        ?.addEventListener("change", applyFilters);

    $("clearAdmissionFilters")
        ?.addEventListener("click", clearFilters);

    $("closeAdmissionModal")
        ?.addEventListener("click", closeModal);

    $("admissionModal")
        ?.querySelector(".admin-modal-backdrop")
        ?.addEventListener("click", closeModal);

    $("approveAdmissionBtn")
        ?.addEventListener("click", () => {
            if (currentApplication) {
                approveApplication(currentApplication.id);
            }
        });

    $("rejectAdmissionBtn")
        ?.addEventListener("click", () => {
            if (currentApplication) {
                rejectApplication(currentApplication.id);
            }
        });

    loadApplications();
});

async function loadApplications() {

    const button = $("refreshAdmissionsBtn");

    if (button) button.disabled = true;

    showLoading();

    try {

        let snapshot;

        try {

            snapshot = await getDocs(
                query(
                    collection(db, "applications"),
                    orderBy("createdAt", "desc")
                )
            );

        } catch {

            snapshot = await getDocs(
                collection(db, "applications")
            );

        }

        applications = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data()
        }));

        updateStats();
        applyFilters();

    } catch (error) {

        console.error("Failed loading admissions:", error);

        $("admissionsTableBody").innerHTML = `
            <tr>
                <td colspan="6" class="table-state-cell">
                    Unable to load applications.
                    Check Firestore permissions.
                </td>
            </tr>
        `;

    } finally {

        if (button) button.disabled = false;

    }
}

function updateStats() {

    const pending = applications.filter(
        item => normalizeStatus(item.status) === "pending"
    ).length;

    const approved = applications.filter(
        item => normalizeStatus(item.status) === "approved"
    ).length;

    const rejected = applications.filter(
        item => normalizeStatus(item.status) === "rejected"
    ).length;

    $("totalApplications").textContent = applications.length;
    $("pendingApplications").textContent = pending;
    $("approvedApplications").textContent = approved;
    $("rejectedApplications").textContent = rejected;
}

function applyFilters() {

    const search =
        ($("admissionSearch")?.value || "")
            .trim()
            .toLowerCase();

    const status =
        $("admissionStatusFilter")?.value || "all";

    const sort =
        $("admissionSort")?.value || "newest";

    filteredApplications = applications.filter(application => {

        const name =
            String(application.name || "")
                .toLowerCase();

        const email =
            String(application.email || "")
                .toLowerCase();

        const applicationStatus =
            normalizeStatus(application.status);

        const matchesSearch =
            !search ||
            name.includes(search) ||
            email.includes(search);

        const matchesStatus =
            status === "all" ||
            applicationStatus === status;

        return matchesSearch && matchesStatus;
    });

    filteredApplications.sort((a, b) => {

        if (sort === "name" || sort === "name-desc") {

            const result =
                String(a.name || "")
                    .localeCompare(
                        String(b.name || "")
                    );

            return sort === "name"
                ? result
                : -result;
        }

        const timeA = getTime(a.createdAt);
        const timeB = getTime(b.createdAt);

        return sort === "oldest"
            ? timeA - timeB
            : timeB - timeA;
    });

    renderApplications();
}

function renderApplications() {

    const body = $("admissionsTableBody");
    const empty = $("admissionsEmpty");

    $("admissionResultsCount").textContent =
        filteredApplications.length;

    if (!filteredApplications.length) {

        body.innerHTML = "";

        empty?.classList.remove("hidden");

        return;
    }

    empty?.classList.add("hidden");

    body.innerHTML =
        filteredApplications
            .map(application => {

                const status =
                    normalizeStatus(application.status);

                return `
                    <tr>

                        <td>
                            <div class="admission-user">

                                <div class="admission-table-avatar">
                                    ${escapeHTML(
                                        getInitials(
                                            application.name
                                        )
                                    )}
                                </div>

                                <div>
                                    <strong>
                                        ${escapeHTML(
                                            application.name ||
                                            "Unknown"
                                        )}
                                    </strong>

                                    <span>
                                        ${escapeHTML(
                                            application.phone ||
                                            "No phone"
                                        )}
                                    </span>
                                </div>

                            </div>
                        </td>

                        <td>
                            ${escapeHTML(
                                application.course || "—"
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                application.email || "—"
                            )}
                        </td>

                        <td>
                            <span class="admission-status ${status}">
                                ${escapeHTML(
                                    application.status ||
                                    "Pending"
                                )}
                            </span>
                        </td>

                        <td>
                            ${formatDate(
                                application.createdAt
                            )}
                        </td>

                        <td>

                            <button
                                type="button"
                                class="icon-action"
                                title="Review application"
                                data-review="${escapeHTML(
                                    application.id
                                )}"
                            >
                                <i data-lucide="eye"></i>
                            </button>

                        </td>

                    </tr>
                `;
            })
            .join("");

    body.querySelectorAll("[data-review]")
        .forEach(button => {

            button.addEventListener("click", () => {

                const application =
                    applications.find(
                        item =>
                            item.id ===
                            button.dataset.review
                    );

                if (application) {
                    openModal(application);
                }
            });
        });

    if (window.lucide) {
        lucide.createIcons();
    }
}

function openModal(application) {

    currentApplication = application;

    $("modalAvatar").textContent =
        getInitials(application.name);

    $("modalName").textContent =
        application.name || "Applicant";

    $("modalEmail").textContent =
        application.email || "No email";

    $("modalApplicationId").textContent =
        application.id;

    $("modalStudentUid").textContent =
        application.studentUid || "Missing";

    $("modalCourse").textContent =
        application.course || "Not specified";

    $("modalPhone").textContent =
        application.phone || "Not provided";

    $("modalStatus").textContent =
        application.status || "Pending";

    $("modalDate").textContent =
        formatDate(application.createdAt);

    const pending =
        normalizeStatus(application.status) === "pending";

    $("approveAdmissionBtn").disabled = !pending;
    $("rejectAdmissionBtn").disabled = !pending;

    const modal = $("admissionModal");

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");

    if (window.lucide) {
        lucide.createIcons();
    }
}

function closeModal() {

    const modal = $("admissionModal");

    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");

    currentApplication = null;
}

async function approveApplication(id) {

    const application =
        applications.find(item => item.id === id);

    if (!application) return;

    if (normalizeStatus(application.status) !== "pending") {
        return;
    }

    if (!application.studentUid) {
        alert(
            "This application is missing its student account."
        );
        return;
    }

    const confirmed =
        window.ssaConfirm
            ? await window.ssaConfirm(
                `Approve ${application.name || "this applicant"}? The student will receive an admission number and Student Portal access.`,
                {
                    title: "Approve admission",
                    confirmText: "Approve student",
                    cancelText: "Keep pending"
                }
            )
            : confirm(
                `Approve ${application.name || "this applicant"}?`
            );

    if (!confirmed) return;

    const button = $("approveAdmissionBtn");

    if (button) button.disabled = true;

    try {

        const studentRef =
            doc(db, "students", application.studentUid);

        const userRef =
            doc(db, "users", application.studentUid);

        const [studentSnap, userSnap] =
            await Promise.all([
                getDoc(studentRef),
                getDoc(userRef)
            ]);

        if (!studentSnap.exists()) {
            throw new Error(
                "Student profile was not found."
            );
        }

        const admissionNumber =
            await generateAdmissionNumber();

        const approvedAt =
            serverTimestamp();

        await updateDoc(studentRef, {

            admissionNumber,
            admissionNo: admissionNumber,
            username: admissionNumber,

            status: "Active",
            onboardingStatus: "approved",

            approvedAt,
            approvedBy: "admin"

        });

        if (userSnap.exists()) {

            await updateDoc(userRef, {

                status: "active",
                active: true,
                verified: true,

                admissionNumber,
                admissionNo: admissionNumber,

                approvedAt
            });
        }

        await updateDoc(
            doc(db, "applications", id),
            {
                status: "Approved",
                admissionNumber,
                admissionNo: admissionNumber,
                studentUid: application.studentUid,
                processedAt: approvedAt,
                processedBy: "admin"
            }
        );

        closeModal();

        window.ssaToast?.(
            `Admission approved — ${admissionNumber}`,
            "success",
            "Admissions"
        );

        await loadApplications();

    } catch (error) {

        console.error(
            "Admission approval failed:",
            error
        );

        window.ssaToast?.(
            error.message ||
            "Unable to approve admission.",
            "error",
            "Admissions"
        );

    } finally {

        if (button) button.disabled = false;

    }
}

async function rejectApplication(id) {

    const application =
        applications.find(item => item.id === id);

    if (!application) return;

    if (normalizeStatus(application.status) !== "pending") {
        return;
    }

    const confirmed =
        window.ssaConfirm
            ? await window.ssaConfirm(
                `Reject ${application.name || "this application"}?`,
                {
                    title: "Reject application",
                    confirmText: "Reject application",
                    cancelText: "Keep pending",
                    danger: true
                }
            )
            : confirm(
                `Reject ${application.name || "this application"}?`
            );

    if (!confirmed) return;

    try {

        await updateDoc(
            doc(db, "applications", id),
            {
                status: "Rejected",
                processedAt: serverTimestamp(),
                processedBy: "admin"
            }
        );

        closeModal();

        window.ssaToast?.(
            "Application rejected.",
            "success",
            "Admissions"
        );

        await loadApplications();

    } catch (error) {

        console.error(
            "Application rejection failed:",
            error
        );

        window.ssaToast?.(
            error.message ||
            "Unable to reject application.",
            "error",
            "Admissions"
        );
    }
}

async function generateAdmissionNumber() {

    const year =
        new Date().getFullYear();

    const snapshot =
        await getDocs(
            query(
                collection(db, "students"),
                where(
                    "admissionNumber",
                    "!=",
                    "Pending"
                )
            )
        );

    return `SSA-${year}-${String(
        snapshot.size + 1
    ).padStart(4, "0")}`;
}

function getTime(value) {

    if (!value) return 0;

    try {

        return value.toDate
            ? value.toDate().getTime()
            : new Date(value).getTime();

    } catch {

        return 0;
    }
}

function showLoading() {

    $("admissionsTableBody").innerHTML = `
        <tr>
            <td colspan="6" class="table-state-cell">
                <div class="table-loading">
                    <div class="loading-spinner"></div>
                    <span>Loading applications...</span>
                </div>
            </td>
        </tr>
    `;

    $("admissionsEmpty")
        ?.classList.add("hidden");
}

function clearFilters() {

    $("admissionSearch").value = "";
    $("admissionStatusFilter").value = "all";
    $("admissionSort").value = "newest";

    applyFilters();
}
