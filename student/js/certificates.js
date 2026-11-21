// =====================================
// SPARK STACK ACADEMY
// STUDENT CERTIFICATES
// certificates.js
// =====================================

import {
    auth,
    db
} from "../../js/firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    collection,
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


console.log("🎓 Certificates Module Loaded");


// =====================================
// DOM
// =====================================

const certificatesContainer =
    document.getElementById("certificatesContainer");

const certificateCount =
    document.getElementById("certificateCount");

const completedCourses =
    document.getElementById("completedCourses");


// =====================================
// AUTH
// =====================================

onAuthStateChanged(
    auth,
    async (user) => {

        if (!user) {

            window.location.href =
                "../login.html";

            return;
        }

        console.log(
            "👨‍🎓 Certificate Student:",
            user.email
        );

        await loadCertificates(
            user.uid
        );

    }
);


// =====================================
// LOAD CERTIFICATES
// =====================================

async function loadCertificates(uid) {

    try {

        showLoading();


        const certificatesRef =
            collection(
                db,
                "certificates"
            );


        const certificatesQuery =
            query(
                certificatesRef,
                where(
                    "studentId",
                    "==",
                    uid
                )
            );


        const snapshot =
            await getDocs(
                certificatesQuery
            );


        console.log(
            "📜 Certificates Found:",
            snapshot.size
        );


        const certificates = [];


        snapshot.forEach(
            docSnap => {

                certificates.push({

                    id: docSnap.id,

                    ...docSnap.data()

                });

            }
        );


        renderCertificates(
            certificates
        );


        updateStats(
            certificates
        );

    }

    catch (error) {

        console.error(
            "❌ Certificate loading failed:",
            error
        );

        showError();

    }

}


// =====================================
// RENDER CERTIFICATES
// =====================================

function renderCertificates(
    certificates
) {

    if (!certificatesContainer)
        return;


    certificatesContainer.innerHTML =
        "";


    if (!certificates.length) {

        certificatesContainer.innerHTML = `

            <div class="certificate-empty">

                <i data-lucide="award"></i>

                <h3>
                    No Certificates Yet
                </h3>

                <p>
                    Complete your courses to earn
                    verified certificates.
                </p>

            </div>

        `;

        refreshIcons();

        return;
    }


    certificates.forEach(
        certificate => {

            const card =
                document.createElement(
                    "article"
                );


            card.className =
                "certificate-card";


            const courseTitle =
                certificate.courseTitle ||
                "Spark Stack Academy Course";


            const certificateNumber =
                certificate.certificateNumber ||
                certificate.id;


            const issuedDate =
                formatDate(
                    certificate.issuedAt
                );


            card.innerHTML = `

                <div class="certificate-preview">

                    <div class="certificate-badge">

                        <i data-lucide="award"></i>

                    </div>

                </div>


                <div class="certificate-content">

                    <h3>
                        ${escapeHTML(
                            courseTitle
                        )}
                    </h3>


                    <p>
                        Certificate of completion
                        awarded by Spark Stack Academy.
                    </p>


                    <div class="certificate-meta">

                        <span>
                            Certificate:
                            ${escapeHTML(
                                certificateNumber
                            )}
                        </span>

                        <span>
                            Issued:
                            ${issuedDate}
                        </span>

                    </div>


                    <div class="certificate-actions">

                        <button
                            class="certificate-btn primary"
                            data-action="view"
                        >

                            <i data-lucide="eye"></i>

                            View Certificate

                        </button>


                        <button
                            class="certificate-btn secondary"
                            data-action="download"
                        >

                            <i data-lucide="download"></i>

                            Download

                        </button>

                    </div>

                </div>

            `;


            const viewButton =
                card.querySelector(
                    '[data-action="view"]'
                );


            const downloadButton =
                card.querySelector(
                    '[data-action="download"]'
                );


            viewButton?.addEventListener(
                "click",
                () => {

                    openCertificate(
                        certificate
                    );

                }
            );


            downloadButton?.addEventListener(
                "click",
                () => {

                    downloadCertificate(
                        certificate
                    );

                }
            );


            certificatesContainer
                .appendChild(card);

        }
    );


    refreshIcons();

}


// =====================================
// STATS
// =====================================

function updateStats(
    certificates
) {

    if (certificateCount) {

        certificateCount.textContent =
            certificates.length;

    }


    if (completedCourses) {

        completedCourses.textContent =
            certificates.length;

    }

}


// =====================================
// OPEN CERTIFICATE
// =====================================

function openCertificate(certificate) {
    if (!certificate?.id) return;
    window.open(`certificate-view.html?id=${encodeURIComponent(certificate.id)}`, "_blank", "noopener");
}

function downloadCertificate(certificate) {
    if (!certificate?.id) return;
    window.open(`certificate-view.html?id=${encodeURIComponent(certificate.id)}&download=true`, "_blank", "noopener");
}

// =====================================
// FORMAT DATE
// =====================================

function formatDate(
    value
) {

    if (!value)
        return "—";


    try {

        let date;


        if (
            typeof value.toDate ===
            "function"
        ) {

            date =
                value.toDate();

        }

        else {

            date =
                new Date(value);

        }


        return date.toLocaleDateString(
            "en-KE",
            {
                day: "numeric",
                month: "short",
                year: "numeric"
            }
        );

    }

    catch {

        return "—";

    }

}


// =====================================
// SECURITY
// =====================================

function escapeHTML(
    value
) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


// =====================================
// LUCIDE
// =====================================

function refreshIcons() {

    if (
        typeof lucide !==
        "undefined"
    ) {

        lucide.createIcons();

    }

}