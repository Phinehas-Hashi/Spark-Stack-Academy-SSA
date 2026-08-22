/* SSA FOUNDER OS — ADMISSIONS MANAGEMENT */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db } from "../js/firebase.js";
import { collection, getDocs, doc, updateDoc, addDoc, serverTimestamp, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const applicationsTable = $("applicationsTable");
const pendingCount = $("pendingCount");
const approvedCount = $("approvedCount");
const rejectedCount = $("rejectedCount");
const totalCount = $("totalCount");
const applicationTotal = $("applicationTotal");
const refreshBtn = $("refreshAdmissions");
let applications = [];
let unsubscribe = null;

// Secondary Auth instance prevents approving an application from replacing the Founder session.
const firebaseConfig = {
    apiKey: "AIzaSyBlPs-9EU_YYiP4qZ6gFF9ZorJbbktXqC4",
    authDomain: "spark-stack-academy.firebaseapp.com",
    projectId: "spark-stack-academy",
    storageBucket: "spark-stack-academy.firebasestorage.app",
    messagingSenderId: "691304828755",
    appId: "1:691304828755:web:41ef7a43d5e5a51ce39ba6"
};
const authApp = getApps().find(app => app.name === "AdmissionsAuth") || initializeApp(firebaseConfig, "AdmissionsAuth");
const admissionsAuth = getAuth(authApp);

function escapeHTML(value = "") {
    return String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
}

function normalizeStatus(status) {
    return String(status || "Pending").toLowerCase();
}

function formatDate(timestamp) {
    if (!timestamp) return "—";
    try {
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
    } catch { return "—"; }
}

function setLoading(isLoading) {
    if (!refreshBtn) return;
    refreshBtn.disabled = isLoading;
    refreshBtn.classList.toggle("is-loading", isLoading);
    refreshBtn.setAttribute("aria-busy", String(isLoading));
}

function updateStats() {
    const counts = applications.reduce((acc, app) => {
        const status = normalizeStatus(app.status);
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});
    pendingCount.textContent = counts.pending || 0;
    approvedCount.textContent = counts.approved || 0;
    rejectedCount.textContent = counts.rejected || 0;
    totalCount.textContent = applications.length;
    applicationTotal.textContent = `${applications.length} ${applications.length === 1 ? "Application" : "Applications"}`;
}

function renderApplications() {
    if (!applications.length) {
        applicationsTable.innerHTML = `<tr><td colspan="6"><div class="empty-state"><strong>No applications found</strong><span>New applications will appear here automatically.</span></div></td></tr>`;
        return;
    }

    applicationsTable.innerHTML = applications.map(app => {
        const status = normalizeStatus(app.status);
        const isPending = status === "pending";
        return `<tr>
            <td><div class="applicant-cell"><strong>${escapeHTML(app.name || "Unknown")}</strong><span>${escapeHTML(app.phone || "No phone")}</span></div></td>
            <td>${escapeHTML(app.course || "—")}</td>
            <td><a class="email-link" href="mailto:${escapeHTML(app.email || "")}">${escapeHTML(app.email || "—")}</a></td>
            <td><span class="status ${status}">${escapeHTML(app.status || "Pending")}</span></td>
            <td>${formatDate(app.createdAt)}</td>
            <td><div class="action-buttons">
                ${isPending ? `<button class="action-btn approve" data-action="approve" data-id="${escapeHTML(app.id)}" title="Approve application" aria-label="Approve application">✓</button><button class="action-btn reject" data-action="reject" data-id="${escapeHTML(app.id)}" title="Reject application" aria-label="Reject application">×</button>` : `<span class="action-complete">Processed</span>`}
            </div></td>
        </tr>`;
    }).join("");
}

function subscribeApplications() {
    unsubscribe?.();
    const applicationsQuery = query(collection(db, "applications"), orderBy("createdAt", "desc"));
    unsubscribe = onSnapshot(applicationsQuery, snapshot => {
        applications = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        updateStats();
        renderApplications();
        setLoading(false);
    }, error => {
        console.error("Admissions listener failed:", error);
        applicationsTable.innerHTML = `<tr><td colspan="6"><div class="empty-state error"><strong>Unable to load applications</strong><span>Check your connection or Firestore permissions, then refresh.</span></div></td></tr>`;
        setLoading(false);
    });
}

async function generateAdmissionNumber() {
    const year = new Date().getFullYear();
    const snapshot = await getDocs(collection(db, "students"));
    return `SSA-${year}-${String(snapshot.size + 1).padStart(4, "0")}`;
}

async function approveApplication(id) {
    const application = applications.find(app => app.id === id);
    if (!application || normalizeStatus(application.status) !== "pending") return;
    if (!application.email) throw new Error("This application has no email address.");

    const confirmed = window.confirm(`Approve ${application.name || "this applicant"}? A student account will be created and a password-reset email will be sent.`);
    if (!confirmed) return;

    const button = document.querySelector(`.approve[data-id="${CSS.escape(id)}"]`);
    if (button) button.disabled = true;

    try {
        const admissionNo = await generateAdmissionNumber();
        const temporaryPassword = `${crypto.randomUUID()}!Aa9`;
        const credential = await createUserWithEmailAndPassword(admissionsAuth, application.email.trim(), temporaryPassword);

        await addDoc(collection(db, "students"), {
            uid: credential.user.uid,
            name: application.name || "",
            email: application.email.trim(),
            phone: application.phone || "",
            course: application.course || "",
            admissionNo,
            username: admissionNo,
            role: "student",
            status: "Active",
            onboardingStatus: "password_reset_required",
            coursesEnrolled: 1,
            progress: 0,
            certificates: 0,
            createdAt: serverTimestamp()
        });

        await updateDoc(doc(db, "applications", id), {
            status: "Approved",
            admissionNo,
            studentUid: credential.user.uid,
            processedAt: serverTimestamp()
        });

        await sendPasswordResetEmail(admissionsAuth, application.email.trim());
        alert(`Admission approved.\n\n${admissionNo}\n\nA password setup link was sent to ${application.email}.`);
    } catch (error) {
        console.error("Approval failed:", error);
        alert(error.code === "auth/email-already-in-use" ? "This email already has a Firebase account. Review the existing account before approving." : `Approval failed: ${error.message}`);
    } finally {
        if (button) button.disabled = false;
    }
}

async function rejectApplication(id) {
    const application = applications.find(app => app.id === id);
    if (!application || normalizeStatus(application.status) !== "pending") return;
    if (!window.confirm(`Reject ${application.name || "this application"}?`)) return;
    try {
        await updateDoc(doc(db, "applications", id), { status: "Rejected", processedAt: serverTimestamp() });
    } catch (error) {
        console.error("Rejection failed:", error);
        alert(`Unable to reject application: ${error.message}`);
    }
}

document.addEventListener("click", event => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    if (button.dataset.action === "approve") approveApplication(button.dataset.id);
    if (button.dataset.action === "reject") rejectApplication(button.dataset.id);
});

refreshBtn?.addEventListener("click", async () => {
    setLoading(true);
    try {
        // The realtime listener normally makes this unnecessary; this simply forces a fresh read.
        await getDocs(collection(db, "applications"));
    } catch (error) {
        console.error("Refresh failed:", error);
        alert(`Refresh failed: ${error.message}`);
        setLoading(false);
    }
});

subscribeApplications();
