// Spark Stack Academy — secure certificate viewer
import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const certificateId = params.get("id");
const statusNode = document.getElementById("certificateStatus");
const certificateNode = document.getElementById("certificate");
const printButton = document.getElementById("printCertificate");

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.replace("../login.html");
        return;
    }

    if (!certificateId || certificateId.length > 180) {
        showUnavailable("A valid certificate reference was not provided.");
        return;
    }

    try {
        const certificateRef = doc(db, "certificates", certificateId);
        const certificateSnapshot = await getDoc(certificateRef);

        if (!certificateSnapshot.exists()) {
            showUnavailable("This certificate could not be found.");
            return;
        }

        const certificate = certificateSnapshot.data();

        // Firestore rules enforce ownership; this is an additional client-side check.
        if (certificate.studentId !== user.uid) {
            showUnavailable("You do not have access to this certificate.");
            return;
        }

        const status = String(certificate.status || "").toLowerCase();
        if (status && !["valid", "issued", "active"].includes(status)) {
            showUnavailable("This certificate is not currently marked as valid.");
            return;
        }

        renderCertificate(certificate);
        if (statusNode) statusNode.textContent = "Verified certificate record";
        if (printButton) printButton.disabled = false;

        if (params.get("download") === "true") {
            window.setTimeout(() => window.print(), 700);
        }
    } catch (error) {
        console.error("Certificate verification failed:", error);
        showUnavailable("Unable to verify this certificate. Check your connection and try again.");
    }
});

function renderCertificate(certificate) {
    setText("studentName", certificate.studentName || "Student");
    setText("courseTitle", certificate.courseTitle || "Course Completion");
    setText("certificateNumber", certificate.certificateNumber || "—");
    setText("admissionNumber", certificate.admissionNumber || "—");
    setText("instructorName", certificate.instructorName || "Academy Instructor");
    setText("headquarters", certificate.headquarters || "Kenya");
    setText("website", certificate.website || "sparkstackacademy.com");
    setText("issuedAt", formatDate(certificate.issuedAt));
    document.title = (certificate.courseTitle || "Certificate") + " | Spark Stack Academy";
}

function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = String(value);
}

function showUnavailable(message) {
    if (statusNode) statusNode.textContent = message;
    if (certificateNode) certificateNode.hidden = true;
    if (printButton) printButton.disabled = true;
    document.title = "Certificate unavailable | Spark Stack Academy";
}

function formatDate(value) {
    let date = null;
    if (value && typeof value.toDate === "function") date = value.toDate();
    else if (value) date = new Date(value);
    if (!date || Number.isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-KE", {
        day: "numeric", month: "long", year: "numeric"
    });
}

printButton?.addEventListener("click", () => window.print());

document.getElementById("closeCertificate")?.addEventListener("click", () => {
    if (window.opener) window.close();
    else window.location.href = "certificates.html";
});