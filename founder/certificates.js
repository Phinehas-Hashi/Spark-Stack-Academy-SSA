import { db } from "../js/firebase.js";
import { collection, doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const certificateRef = doc(db, "settings", "certificates");
const certificatesRef = collection(db, "certificates");
const $ = id => document.getElementById(id);

async function loadCertificateSettings() {
    const snapshot = await getDoc(certificateRef);
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    $("certificateTitle").value = data.certificateTitle || "";
    $("certificatePrefix").value = data.certificatePrefix || "SSA";
    $("founderName").value = data.founderName || "";
    $("founderTitle").value = data.founderTitle || "";
    $("enableQR").checked = Boolean(data.enableQR);
    $("autoIssue").checked = Boolean(data.autoIssue);
    $("allowDownloads").checked = Boolean(data.allowDownloads);
}

async function saveCertificateSettings() {
    const settings = {
        certificateTitle: $("certificateTitle").value.trim(),
        certificatePrefix: ($("certificatePrefix").value.trim() || "SSA").toUpperCase(),
        founderName: $("founderName").value.trim(),
        founderTitle: $("founderTitle").value.trim(),
        enableQR: $("enableQR").checked,
        autoIssue: $("autoIssue").checked,
        allowDownloads: $("allowDownloads").checked,
        updatedAt: serverTimestamp()
    };
    if (!settings.certificateTitle) throw new Error("Certificate title is required.");
    await setDoc(certificateRef, settings, { merge: true });
    showNotice("Certificate settings saved successfully.");
}

function statusOf(data) {
    return String(data.status || data.verificationStatus || "issued").toLowerCase();
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" }[c]));
}

function formatDate(value) {
    const date = value?.toDate?.() || (value instanceof Date ? value : null);
    if (date) return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    return value ? escapeHtml(value) : "—";
}

function renderCertificates(records) {
    $("certificateCount").textContent = `${records.length} Certificate${records.length === 1 ? "" : "s"}`;
    if (!records.length) {
        $("certificateList").innerHTML = '<p class="empty-state">No certificates have been issued yet.</p>';
        return;
    }

    $("certificateList").innerHTML = records.slice(0, 30).map(({ id, data }) => {
        const recipient = data.studentName || data.recipientName || data.userName || data.email || "Unknown recipient";
        const number = data.certificateNumber || data.number || id;
        const course = data.courseName || data.courseTitle || "Course completion";
        const status = statusOf(data);
        const issued = data.issuedAt || data.createdAt;
        return `<article class="certificate-item">
            <div class="certificate-main">
                <div>
                    <h4>${escapeHtml(recipient)}</h4>
                    <p>${escapeHtml(course)} · ${escapeHtml(number)}</p>
                </div>
                <span class="status-pill ${escapeHtml(status)}">${escapeHtml(status)}</span>
            </div>
            <small>Issued: ${formatDate(issued)}</small>
        </article>`;
    }).join("");
}

function renderStats(records) {
    const issued = records.filter(({ data }) => ["issued", "verified", "completed"].includes(statusOf(data))).length;
    const verified = records.filter(({ data }) => statusOf(data) === "verified" || data.verified === true).length;
    const pending = records.filter(({ data }) => ["pending", "processing", "requested"].includes(statusOf(data))).length;
    const downloads = records.reduce((total, { data }) => total + Number(data.downloads || data.downloadCount || 0), 0);

    $("issuedCertificates").textContent = issued;
    $("verifiedCertificates").textContent = verified;
    $("pendingCertificates").textContent = pending;
    $("certificateDownloads").textContent = downloads;
}

function showNotice(message, type = "success") {
    const notice = document.createElement("div");
    notice.className = `founder-notice ${type}`;
    notice.textContent = message;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 3000);
}

window.addEventListener("DOMContentLoaded", async () => {
    const list = $("certificateList");
    try {
        await loadCertificateSettings();
    } catch (error) {
        console.error("Certificate settings load error:", error);
        showNotice("Could not load certificate settings.", "error");
    }

    onSnapshot(certificatesRef, snapshot => {
        const records = snapshot.docs.map(item => ({ id: item.id, data: item.data() }));
        records.sort((a, b) =>
            (b.data.issuedAt?.toMillis?.() || b.data.createdAt?.toMillis?.() || 0) -
            (a.data.issuedAt?.toMillis?.() || a.data.createdAt?.toMillis?.() || 0)
        );
        renderStats(records);
        renderCertificates(records);
    }, error => {
        console.error("Certificate realtime error:", error);
        list.innerHTML = '<p class="empty-state">Certificate data is temporarily unavailable.</p>';
        showNotice("Live certificate data could not be loaded.", "error");
    });

    $("saveCertificateSettings")?.addEventListener("click", async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            await saveCertificateSettings();
        } catch (error) {
            console.error(error);
            showNotice(error.message || "Failed to save settings.", "error");
        } finally {
            button.disabled = false;
        }
    });
});
