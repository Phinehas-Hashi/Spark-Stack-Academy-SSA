/* ============================================================
   SSA FOUNDER OS — INSTRUCTOR ADMISSIONS
   Founder-only instructor approval workflow
   ============================================================ */

import { auth, db } from "../js/firebase.js";

import {
    collection,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const $ = id => document.getElementById(id);

const table = $("instructorsTable");
const refreshBtn = $("refreshInstructorAdmissions");

const pendingCount = $("pendingCount");
const activeCount = $("activeCount");
const rejectedCount = $("rejectedCount");
const totalCount = $("totalCount");
const applicationTotal = $("applicationTotal");

let instructors = [];
let currentFilter = "all";
let unsubscribe = null;
let founderUser = null;
let founderVerified = false;

const escapeHTML = (value = "") =>
    String(value).replace(/[&<>'"]/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[char]));

function formatDate(timestamp) {

    if (!timestamp) {
        return "—";
    }

    try {

        const date = timestamp?.toDate
            ? timestamp.toDate()
            : new Date(timestamp);

        if (Number.isNaN(date.getTime())) {
            return "—";
        }

        return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric"
        });

    } catch {
        return "—";
    }
}

function normalizeStatus(status) {

    const value = String(status || "pending_review")
        .trim()
        .toLowerCase();

    if (value === "active") {
        return "active";
    }

    if (value === "rejected") {
        return "rejected";
    }

    return "pending_review";
}

function initials(name = "") {

    const parts = String(name)
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) {
        return "IN";
    }

    return parts
        .slice(0, 2)
        .map(part => part.charAt(0).toUpperCase())
        .join("");
}

function setLoading(value) {

    if (!refreshBtn) {
        return;
    }

    refreshBtn.disabled = value;
    refreshBtn.classList.toggle("is-loading", value);
    refreshBtn.setAttribute("aria-busy", String(value));
}

function showToast(message, type = "success") {

    if (typeof window.showFounderToast === "function") {
        window.showFounderToast(message, type);
        return;
    }

    console[type === "error" ? "error" : "log"](
        `[SSA Instructor Admissions] ${message}`
    );
}

async function verifyFounder(user) {

    if (!user) {
        throw new Error("You must be signed in.");
    }

    const founderRef = doc(db, "founder", user.uid);
    const snapshot = await getDoc(founderRef);

    if (!snapshot.exists()) {
        throw new Error("Founder access required.");
    }

    const profile = snapshot.data() || {};

    if (profile.role && profile.role !== "founder") {
        throw new Error("Founder access required.");
    }

    if (profile.status && profile.status !== "active") {
        throw new Error("Founder account is not active.");
    }

    founderUser = user;
    founderVerified = true;
}

function updateStats() {

    const counts = instructors.reduce((acc, instructor) => {

        const status = normalizeStatus(instructor.status);

        acc[status] = (acc[status] || 0) + 1;

        return acc;

    }, {});

    pendingCount.textContent = counts.pending_review || 0;
    activeCount.textContent = counts.active || 0;
    rejectedCount.textContent = counts.rejected || 0;
    totalCount.textContent = instructors.length;

    applicationTotal.textContent =
        `${instructors.length} ${
            instructors.length === 1
                ? "Instructor"
                : "Instructors"
        }`;
}

function renderTable() {

    if (!instructors.length) {

        table.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <strong>No instructor applications found</strong>
                        <span>New instructor registrations will appear here.</span>
                    </div>
                </td>
            </tr>
        `;

        return;
    }

    const filtered = instructors.filter(instructor => {

        const status = normalizeStatus(instructor.status);

        return currentFilter === "all"
            || status === currentFilter;
    });

    if (!filtered.length) {

        table.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state">
                        <strong>No matching instructors</strong>
                        <span>There are no instructors in this category.</span>
                    </div>
                </td>
            </tr>
        `;

        return;
    }

    table.innerHTML = filtered.map(instructor => {

        const status = normalizeStatus(instructor.status);

        const name =
            instructor.fullName ||
            instructor.name ||
            "Unnamed Instructor";

        const email =
            instructor.email ||
            "No email";

        const expertise =
            instructor.expertise ||
            "Not specified";

        const uid = instructor.uid || instructor.id;

        const pending = status === "pending_review";

        return `
            <tr>

                <td>
                    <div class="instructor-cell">

                        <div class="instructor-avatar">
                            ${escapeHTML(initials(name))}
                        </div>

                        <div class="instructor-info">

                            <strong>
                                ${escapeHTML(name)}
                            </strong>

                            <span>
                                ${escapeHTML(uid || "No UID")}
                            </span>

                        </div>

                    </div>
                </td>

                <td>
                    ${escapeHTML(expertise)}
                </td>

                <td>
                    <a
                        class="email-link"
                        href="mailto:${escapeHTML(email)}"
                    >
                        ${escapeHTML(email)}
                    </a>
                </td>

                <td>
                    <span class="status ${status}">
                        ${escapeHTML(status.replace("_", " "))}
                    </span>
                </td>

                <td>
                    ${formatDate(
                        instructor.createdAt ||
                        instructor.appliedAt
                    )}
                </td>

                <td>

                    <div class="action-buttons">

                        ${
                            pending
                                ? `
                                    <button
                                        class="action-btn approve"
                                        data-action="approve"
                                        data-id="${escapeHTML(uid)}"
                                        type="button"
                                    >
                                        ✓ Approve
                                    </button>

                                    <button
                                        class="action-btn reject"
                                        data-action="reject"
                                        data-id="${escapeHTML(uid)}"
                                        type="button"
                                    >
                                        × Reject
                                    </button>
                                  `
                                : `
                                    <span class="action-complete">
                                        Processed
                                    </span>
                                  `
                        }

                    </div>

                </td>

            </tr>
        `;

    }).join("");
}

function subscribeInstructors() {

    unsubscribe?.();

    unsubscribe = onSnapshot(
        collection(db, "users"),

        snapshot => {

            instructors = snapshot.docs
                .map(item => ({
                    id: item.id,
                    ...item.data()
                }))
                .filter(item =>
                    String(item.role || "").toLowerCase() === "instructor"
                )
                .sort((a, b) => {

                    const aDate =
                        a.createdAt?.toMillis?.() ||
                        new Date(a.createdAt || 0).getTime() ||
                        0;

                    const bDate =
                        b.createdAt?.toMillis?.() ||
                        new Date(b.createdAt || 0).getTime() ||
                        0;

                    return bDate - aDate;
                });

            updateStats();
            renderTable();
            setLoading(false);

        },

        error => {

            console.error(
                "[SSA Instructor Admissions] Listener failed:",
                error
            );

            table.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="empty-state error">
                            <strong>
                                Unable to load instructor applications
                            </strong>

                            <span>
                                Check your Founder permissions and Firestore rules.
                            </span>
                        </div>
                    </td>
                </tr>
            `;

            setLoading(false);
        }
    );
}

async function approveInstructor(uid) {

    if (!founderVerified || !founderUser) {
        throw new Error("Founder verification is required.");
    }

    const instructor = instructors.find(
        item => (item.uid || item.id) === uid
    );

    if (!instructor) {
        throw new Error("Instructor account not found.");
    }

    if (normalizeStatus(instructor.status) !== "pending_review") {
        return;
    }

    const name =
        instructor.fullName ||
        instructor.name ||
        "this instructor";

    const confirmed = window.ssaConfirm
        ? await window.ssaConfirm(
            `Approve ${name}? This will activate the instructor account and allow access to the Instructor Portal.`,
            {
                title: "Approve instructor",
                confirmText: "Approve instructor",
                cancelText: "Keep pending"
            }
        )
        : window.confirm(
            `Approve ${name}?`
        );

    if (!confirmed) {
        return;
    }

    const button = document.querySelector(
        `.approve[data-id="${CSS.escape(uid)}"]`
    );

    if (button) {
        button.disabled = true;
    }

    try {

        await updateDoc(
            doc(db, "users", uid),
            {
                status: "active",
                active: true,
                verified: true,

                approvedBy: founderUser.uid,
                approvedByEmail: founderUser.email || "",

                approvedAt: serverTimestamp(),

                rejectedBy: null,
                rejectedByEmail: null,
                rejectedAt: null,
                rejectionReason: "",

                updatedAt: serverTimestamp()
            }
        );

        showToast(
            `${name} has been approved as an instructor.`,
            "success"
        );

    } catch (error) {

        console.error(
            "[SSA Instructor Admissions] Approval failed:",
            error
        );

        showToast(
            error.message || "Unable to approve instructor.",
            "error"
        );

    } finally {

        if (button) {
            button.disabled = false;
        }
    }
}

async function rejectInstructor(uid) {

    if (!founderVerified || !founderUser) {
        throw new Error("Founder verification is required.");
    }

    const instructor = instructors.find(
        item => (item.uid || item.id) === uid
    );

    if (!instructor) {
        throw new Error("Instructor account not found.");
    }

    if (normalizeStatus(instructor.status) !== "pending_review") {
        return;
    }

    const name =
        instructor.fullName ||
        instructor.name ||
        "this instructor";

    let reason = "";

    if (typeof window.ssaPrompt === "function") {

        reason = await window.ssaPrompt(
            "Why are you rejecting this instructor application?",
            {
                title: "Reject instructor",
                placeholder: "Optional rejection reason..."
            }
        );

        if (reason === null) {
            return;
        }

    } else {

        reason =
            window.prompt(
                "Rejection reason (optional):",
                ""
            ) ?? "";
    }

    const confirmed = window.ssaConfirm
        ? await window.ssaConfirm(
            `Reject ${name}? The instructor will remain blocked from the Instructor Portal.`,
            {
                title: "Reject instructor",
                confirmText: "Reject instructor",
                cancelText: "Keep pending",
                danger: true
            }
        )
        : window.confirm(
            `Reject ${name}?`
        );

    if (!confirmed) {
        return;
    }

    const button = document.querySelector(
        `.reject[data-id="${CSS.escape(uid)}"]`
    );

    if (button) {
        button.disabled = true;
    }

    try {

        await updateDoc(
            doc(db, "users", uid),
            {
                status: "rejected",
                active: false,
                verified: false,

                rejectedBy: founderUser.uid,
                rejectedByEmail: founderUser.email || "",

                rejectedAt: serverTimestamp(),

                rejectionReason:
                    String(reason || "").trim(),

                approvedBy: null,
                approvedByEmail: null,
                approvedAt: null,

                updatedAt: serverTimestamp()
            }
        );

        showToast(
            `${name}'s instructor application was rejected.`,
            "success"
        );

    } catch (error) {

        console.error(
            "[SSA Instructor Admissions] Rejection failed:",
            error
        );

        showToast(
            error.message || "Unable to reject instructor.",
            "error"
        );

    } finally {

        if (button) {
            button.disabled = false;
        }
    }
}

document.addEventListener("click", event => {

    const filter = event.target.closest("[data-filter]");

    if (filter) {

        currentFilter = filter.dataset.filter;

        document
            .querySelectorAll("[data-filter]")
            .forEach(button =>
                button.classList.toggle(
                    "active",
                    button.dataset.filter === currentFilter
                )
            );

        renderTable();

        return;
    }

    const action = event.target.closest("[data-action]");

    if (!action) {
        return;
    }

    const uid = action.dataset.id;

    if (action.dataset.action === "approve") {
        approveInstructor(uid);
    }

    if (action.dataset.action === "reject") {
        rejectInstructor(uid);
    }
});

refreshBtn?.addEventListener("click", async () => {

    setLoading(true);

    try {

        const snapshot =
            await getDocs(collection(db, "users"));

        instructors = snapshot.docs
            .map(item => ({
                id: item.id,
                ...item.data()
            }))
            .filter(item =>
                String(item.role || "").toLowerCase() === "instructor"
            );

        updateStats();
        renderTable();

    } catch (error) {

        console.error(
            "[SSA Instructor Admissions] Refresh failed:",
            error
        );

        showToast(
            error.message || "Refresh failed.",
            "error"
        );

    } finally {

        setLoading(false);
    }
});

onAuthStateChanged(auth, async user => {

    if (!user) {

        founderVerified = false;

        table.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state error">
                        <strong>Founder authentication required</strong>
                        <span>Please sign in again.</span>
                    </div>
                </td>
            </tr>
        `;

        return;
    }

    try {

        await verifyFounder(user);

        subscribeInstructors();

    } catch (error) {

        founderVerified = false;

        console.error(
            "[SSA Instructor Admissions] Founder verification failed:",
            error
        );

        table.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state error">
                        <strong>Founder access required</strong>
                        <span>
                            ${escapeHTML(error.message)}
                        </span>
                    </div>
                </td>
            </tr>
        `;
    }
});
