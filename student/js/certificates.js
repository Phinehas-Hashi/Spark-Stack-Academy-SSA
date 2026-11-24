// Spark Stack Academy — Student Certificates
import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const container = document.getElementById("certificatesContainer");
const certificateCount = document.getElementById("certificateCount");
const completedCourses = document.getElementById("completedCourses");
let activeUid = null;

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("../login.html");
        return;
    }
    activeUid = user.uid;
    await loadCertificates();
});

container?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    const certificateId = button.dataset.certificateId;
    if (!certificateId) return;
    openCertificate(certificateId, button.dataset.action === "download");
});

async function loadCertificates() {
    if (!container || !activeUid) return;
    setLoading();
    try {
        const certificatesQuery = query(
            collection(db, "certificates"),
            where("studentId", "==", activeUid)
        );
        const snapshot = await getDocs(certificatesQuery);
        const certificates = snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => timestampValue(b.issuedAt) - timestampValue(a.issuedAt));
        updateStats(certificates);
        renderCertificates(certificates);
    } catch (error) {
        console.error("Certificate loading failed:", error);
        setError();
    }
}

function renderCertificates(certificates) {
    container.replaceChildren();
    container.setAttribute("aria-busy", "false");
    if (!certificates.length) {
        const empty = document.createElement("section");
        empty.className = "certificate-empty";
        empty.innerHTML = '<span class="empty-icon" aria-hidden="true"><i data-lucide="award"></i></span>';
        const title = document.createElement("h3");
        title.textContent = "No certificates yet";
        const message = document.createElement("p");
        message.textContent = "When the Academy issues a certificate for you, it will appear here.";
        empty.append(title, message);
        container.append(empty);
        refreshIcons();
        return;
    }

    certificates.forEach((certificate) => {
        const card = document.createElement("article");
        card.className = "certificate-card";

        const preview = document.createElement("div");
        preview.className = "certificate-preview";
        preview.setAttribute("aria-hidden", "true");
        preview.innerHTML = '<span class="preview-frame"><i data-lucide="award"></i><small>SPARK STACK ACADEMY</small><strong>CERTIFICATE</strong><span>OF COMPLETION</span></span>';

        const content = document.createElement("div");
        content.className = "certificate-content";
        const title = document.createElement("h3");
        title.textContent = certificate.courseTitle || "Spark Stack Academy Course";
        const description = document.createElement("p");
        description.className = "certificate-description";
        description.textContent = "Certificate of completion";

        const meta = document.createElement("div");
        meta.className = "certificate-meta";
        const number = document.createElement("span");
        number.textContent = "No. " + (certificate.certificateNumber || certificate.id);
        const issued = document.createElement("span");
        issued.textContent = "Issued " + formatDate(certificate.issuedAt);
        meta.append(number, issued);

        const actions = document.createElement("div");
        actions.className = "certificate-actions";
        actions.append(
            createActionButton("View certificate", "eye", "view", certificate.id),
            createActionButton("Save PDF", "download", "download", certificate.id)
        );
        content.append(title, description, meta, actions);
        card.append(preview, content);
        container.append(card);
    });
    refreshIcons();
}

function createActionButton(label, icon, action, certificateId) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action === "view" ? "certificate-btn primary" : "certificate-btn secondary";
    button.dataset.action = action;
    button.dataset.certificateId = certificateId;
    button.innerHTML = '<i data-lucide="' + icon + '" aria-hidden="true"></i><span>' + label + '</span>';
    return button;
}

function updateStats(certificates) {
    if (certificateCount) certificateCount.textContent = String(certificates.length);
    const uniqueCourses = new Set(certificates.map((item) => item.courseId || item.id));
    if (completedCourses) completedCourses.textContent = String(uniqueCourses.size);
}

function openCertificate(certificateId, download) {
    const url = new URL("certificate-view.html", window.location.href);
    url.searchParams.set("id", certificateId);
    if (download) url.searchParams.set("download", "true");
    window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function setLoading() {
    container.setAttribute("aria-busy", "true");
    container.innerHTML = '<div class="certificate-loading" role="status"><i data-lucide="loader-circle" aria-hidden="true"></i><h3>Loading certificates</h3><p>Retrieving your verified achievements.</p></div>';
    refreshIcons();
}

function setError() {
    container.setAttribute("aria-busy", "false");
    container.replaceChildren();
    const panel = document.createElement("section");
    panel.className = "certificate-empty certificate-error";
    panel.innerHTML = '<span class="empty-icon" aria-hidden="true"><i data-lucide="alert-circle"></i></span>';
    const title = document.createElement("h3");
    title.textContent = "Unable to load certificates";
    const message = document.createElement("p");
    message.textContent = "Check your connection and try again.";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "certificate-btn primary retry-button";
    retry.textContent = "Try again";
    retry.addEventListener("click", loadCertificates);
    panel.append(title, message, retry);
    container.append(panel);
    refreshIcons();
}

function timestampValue(value) {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value && typeof value.toDate === "function") return value.toDate().getTime();
    const parsed = value ? new Date(value).getTime() : 0;
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value) {
    const time = timestampValue(value);
    if (!time) return "Date not recorded";
    return new Date(time).toLocaleDateString("en-KE", {
        day: "numeric", month: "short", year: "numeric"
    });
}

function refreshIcons() {
    if (window.lucide?.createIcons) window.lucide.createIcons();
}