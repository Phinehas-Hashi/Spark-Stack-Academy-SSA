// ============================================================
// SPARK STACK ACADEMY
// ADMIN — REPORTS / MODERATION ENGINE
// ============================================================

import {
    auth,
    db
} from "../../js/firebase.js";

import {
    collection,
    getDocs,
    getDoc,
    doc,
    query,
    orderBy,
    limit,
    addDoc,
    updateDoc,
    setDoc,
    serverTimestamp,
    where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


// ============================================================
// STATE
// ============================================================

let reports = [];
let filteredReports = [];
let currentReport = null;

let currentPage = 1;
const reportsPerPage = 10;


// ============================================================
// DOM
// ============================================================

const $ = id => document.getElementById(id);


// ============================================================
// INIT
// ============================================================

document.addEventListener("DOMContentLoaded", () => {

    setupEvents();

    if (window.lucide) {
        lucide.createIcons();
    }

});


onAuthStateChanged(auth, async user => {

    if (!user) return;

    await loadReports();

});


// ============================================================
// LOAD REPORTS
// ============================================================

async function loadReports() {

    try {

        const snapshot = await getDocs(
            collection(db, "reports")
        );

        reports = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
        }));

        reports.sort((a, b) => {

            const aTime = getTimestamp(a.createdAt);
            const bTime = getTimestamp(b.createdAt);

            return bTime - aTime;

        });

        updateStats();

        populateFilters();

        applyFilters();

        await loadPriorityReports();

        await loadAuditLog();

        loadAnalytics();

    } catch (error) {

        console.error(
            "🔥 Failed to load reports:",
            error
        );

        showToast(
            "Failed to load reports.",
            "error"
        );

    }

}


// ============================================================
// TIMESTAMP HELPER
// ============================================================

function getTimestamp(value) {

    if (!value) return 0;

    if (value.seconds) {
        return value.seconds * 1000;
    }

    if (value.toDate) {
        return value.toDate().getTime();
    }

    const date = new Date(value);

    return isNaN(date.getTime())
        ? 0
        : date.getTime();

}


// ============================================================
// FORMAT DATE
// ============================================================

function formatDate(value) {

    const time = getTimestamp(value);

    if (!time) return "—";

    return new Intl.DateTimeFormat(
        "en-KE",
        {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }
    ).format(new Date(time));

}


// ============================================================
// FORMAT DATE + TIME
// ============================================================

function formatDateTime(value) {

    const time = getTimestamp(value);

    if (!time) return "—";

    return new Intl.DateTimeFormat(
        "en-KE",
        {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }
    ).format(new Date(time));

}


// ============================================================
// UPDATE STATS
// ============================================================

function updateStats() {

    const total = reports.length;

    const pending = reports.filter(
        r => normalize(r.status) === "pending"
    ).length;

    const reviewing = reports.filter(
        r => normalize(r.status) === "reviewing"
    ).length;

    const resolved = reports.filter(
        r => normalize(r.status) === "resolved"
    ).length;

    const critical = reports.filter(
        r => normalize(r.priority) === "critical"
    ).length;


    setText("totalReports", total);
    setText("pendingReports", pending);
    setText("reviewingReports", reviewing);
    setText("resolvedReports", resolved);
    setText("criticalReports", critical);

}


// ============================================================
// FILTERS
// ============================================================

function populateFilters() {

    const instructorFilter =
        $("reportTypeFilter");

    if (!instructorFilter) return;

}


// ============================================================
// APPLY FILTERS
// ============================================================

function applyFilters() {

    const search =
        normalize(
            $("reportSearch")?.value
        );

    const status =
        $("reportStatusFilter")?.value || "all";

    const priority =
        $("reportPriorityFilter")?.value || "all";

    const type =
        $("reportTypeFilter")?.value || "all";

    const sort =
        $("reportSort")?.value || "newest";


    filteredReports = reports.filter(report => {

        const searchable = [

            report.title,
            report.reason,
            report.description,
            report.reporterName,
            report.reportedUserName,
            report.category,
            report.type

        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();


        const matchesSearch =
            !search ||
            searchable.includes(search);


        const matchesStatus =
            status === "all" ||
            normalize(report.status) === status;


        const matchesPriority =
            priority === "all" ||
            normalize(report.priority) === priority;


        const matchesType =
            type === "all" ||
            normalize(report.type) === type;


        return (
            matchesSearch &&
            matchesStatus &&
            matchesPriority &&
            matchesType
        );

    });


    sortReports(sort);

    currentPage = 1;

    renderReports();

}


// ============================================================
// SORT
// ============================================================

function sortReports(sort) {

    if (sort === "oldest") {

        filteredReports.sort(
            (a, b) =>
                getTimestamp(a.createdAt) -
                getTimestamp(b.createdAt)
        );

        return;
    }


    if (sort === "critical") {

        const weight = {
            critical: 4,
            high: 3,
            medium: 2,
            low: 1
        };

        filteredReports.sort(
            (a, b) =>
                (weight[normalize(b.priority)] || 0) -
                (weight[normalize(a.priority)] || 0)
        );

        return;
    }


    filteredReports.sort(
        (a, b) =>
            getTimestamp(b.createdAt) -
            getTimestamp(a.createdAt)
    );

}


// ============================================================
// RENDER REPORTS
// ============================================================

function renderReports() {

    const tbody =
        $("reportsTableBody");

    if (!tbody) return;


    tbody.innerHTML = "";


    const totalPages =
        Math.ceil(
            filteredReports.length /
            reportsPerPage
        );


    if (!filteredReports.length) {

        $("reportsEmptyState")
            ?.classList.remove("hidden");

        setText(
            "reportResultsCount",
            0
        );

        renderPagination(0);

        return;

    }


    $("reportsEmptyState")
        ?.classList.add("hidden");


    setText(
        "reportResultsCount",
        filteredReports.length
    );


    const start =
        (currentPage - 1) *
        reportsPerPage;

    const pageReports =
        filteredReports.slice(
            start,
            start + reportsPerPage
        );


    pageReports.forEach(report => {

        tbody.appendChild(
            createReportRow(report)
        );

    });


    renderPagination(totalPages);

    refreshIcons();

}


// ============================================================
// CREATE REPORT ROW
// ============================================================

function createReportRow(report) {

    const tr =
        document.createElement("tr");


    const priority =
        normalize(report.priority) || "medium";

    const status =
        normalize(report.status) || "pending";


    tr.innerHTML = `

        <td>

            <div class="report-table-cell">

                <div class="report-table-icon">

                    <i data-lucide="flag"></i>

                </div>

                <div>

                    <strong>
                        ${escapeHTML(
                            report.title ||
                            report.reason ||
                            "Report"
                        )}
                    </strong>

                    <span>
                        #${escapeHTML(report.id)}
                    </span>

                </div>

            </div>

        </td>


        <td>

            <div class="report-user-cell">

                <strong>
                    ${escapeHTML(
                        report.reportedUserName ||
                        "Unknown User"
                    )}
                </strong>

                <span>
                    ${escapeHTML(
                        report.reportedUserEmail ||
                        "No email"
                    )}
                </span>

            </div>

        </td>


        <td>

            <span class="report-category">

                ${escapeHTML(
                    report.category ||
                    report.type ||
                    "General"
                )}

            </span>

        </td>


        <td>

            <span class="report-priority ${priority}">

                ${capitalize(priority)}

            </span>

        </td>


        <td>

            <span class="report-status ${status}">

                ${capitalize(
                    status === "reviewing"
                        ? "Under Review"
                        : status
                )}

            </span>

        </td>


        <td>

            <span class="report-date">

                ${formatDate(
                    report.createdAt
                )}

            </span>

        </td>


        <td>

            <div class="report-row-actions">

                <button
                    type="button"
                    class="report-action-btn"
                    data-action="view"
                    data-id="${escapeHTML(report.id)}"
                    title="Investigate"
                >

                    <i data-lucide="eye"></i>

                </button>

            </div>

        </td>

    `;


    return tr;

}


// ============================================================
// PRIORITY QUEUE
// ============================================================

async function loadPriorityReports() {

    const container =
        $("priorityReportsList");

    if (!container) return;


    const priorityReports =
        reports
            .filter(r =>
                ["critical", "high"]
                    .includes(
                        normalize(r.priority)
                    )
            )
            .filter(r =>
                !["resolved", "dismissed"]
                    .includes(
                        normalize(r.status)
                    )
            )
            .slice(0, 5);


    if (!priorityReports.length) {

        container.innerHTML = `

            <div class="priority-empty">

                <i data-lucide="shield-check"></i>

                <strong>
                    Queue Clear
                </strong>

                <span>
                    No high-priority reports require attention.
                </span>

            </div>

        `;

        refreshIcons();

        return;

    }


    container.innerHTML =
        priorityReports
            .map(report => `

                <button
                    type="button"
                    class="priority-report-item"
                    data-action="view"
                    data-id="${escapeHTML(report.id)}"
                >

                    <div class="priority-report-icon">

                        <i data-lucide="siren"></i>

                    </div>

                    <div class="priority-report-content">

                        <strong>
                            ${escapeHTML(
                                report.title ||
                                report.reason ||
                                "Report"
                            )}
                        </strong>

                        <span>
                            ${escapeHTML(
                                report.reportedUserName ||
                                "Unknown user"
                            )}
                        </span>

                    </div>

                    <span
                        class="report-priority ${normalize(report.priority)}"
                    >
                        ${capitalize(
                            normalize(report.priority)
                        )}
                    </span>

                </button>

            `)
            .join("");


    refreshIcons();

}


// ============================================================
// OPEN REPORT
// ============================================================

async function openReport(reportId) {

    const report =
        reports.find(
            r => r.id === reportId
        );

    if (!report) return;


    currentReport = report;


    setText(
        "reportModalTitle",
        report.title ||
        report.reason ||
        "Report"
    );

    setText(
        "reportModalId",
        `#${report.reportId || report.id}`
    );

    setText(
        "reportModalReporter",
        report.reporterName ||
        report.reporterEmail ||
        report.reporterId ||
        "Unknown"
    );

    setText(
        "reportModalReportedUser",
        report.reportedUserName ||
        report.reportedUserEmail ||
        report.reportedUserId ||
        "Unknown"
    );

    setText(
        "reportModalCategory",
        report.category ||
        report.type ||
        "General"
    );

    setText(
        "reportModalDate",
        formatDateTime(
            report.createdAt
        )
    );

    setText(
        "reportModalDescription",
        report.description ||
        report.reason ||
        "No description provided."
    );


    const priority =
        $("reportModalPriority");

    if (priority) {

        priority.textContent =
            capitalize(
                normalize(
                    report.priority
                ) || "medium"
            );

        priority.className =
            `report-priority ${
                normalize(
                    report.priority
                ) || "medium"
            }`;

    }


    $("moderatorNotes").value =
        report.moderatorNotes || "";


    await loadEvidence(report);

    await loadTimeline(report);


    $("reportDetailsModal")
        ?.classList.remove("hidden");

    $("reportDetailsModal")
        ?.setAttribute(
            "aria-hidden",
            "false"
        );


    if (
        normalize(report.status) ===
        "pending"
    ) {

        await updateReportStatus(
            report.id,
            "reviewing"
        );

    }


    refreshIcons();

}


// ============================================================
// CLOSE MODAL
// ============================================================

function closeReportModal() {

    $("reportDetailsModal")
        ?.classList.add("hidden");

    $("reportDetailsModal")
        ?.setAttribute(
            "aria-hidden",
            "true"
        );

    currentReport = null;

}


// ============================================================
// EVIDENCE
// ============================================================

async function loadEvidence(report) {

    const container =
        $("reportEvidenceList");

    if (!container) return;


    const evidence =
        report.evidence || [];


    if (!evidence.length) {

        container.innerHTML = `

            <div class="evidence-empty">

                <i data-lucide="paperclip"></i>

                <span>
                    No evidence attached.
                </span>

            </div>

        `;

        refreshIcons();

        return;

    }


    container.innerHTML =
        evidence.map(item => `

            <a
                class="evidence-item"
                href="${escapeAttribute(
                    item.url || "#"
                )}"
                target="_blank"
                rel="noopener"
            >

                <i data-lucide="paperclip"></i>

                <span>
                    ${escapeHTML(
                        item.name ||
                        "Evidence"
                    )}
                </span>

                <i data-lucide="external-link"></i>

            </a>

        `).join("");


    refreshIcons();

}


// ============================================================
// SAVE MODERATOR NOTES
// ============================================================

async function saveModeratorNotes() {

    if (!currentReport) return;


    const notes =
        $("moderatorNotes")?.value.trim();


    try {

        await updateDoc(
            doc(
                db,
                "reports",
                currentReport.id
            ),
            {
                moderatorNotes: notes,
                updatedAt: serverTimestamp()
            }
        );


        currentReport.moderatorNotes =
            notes;


        await createAuditLog(
            "Moderator notes updated",
            currentReport.id
        );


        showToast(
            "Moderator notes saved.",
            "success"
        );


    } catch (error) {

        console.error(error);

        showToast(
            "Failed to save notes.",
            "error"
        );

    }

}


// ============================================================
// SEND RESPONSE
// ============================================================

async function sendReportResponse() {

    if (!currentReport) return;


    const response =
        $("reportResponse")
            ?.value
            .trim();


    if (!response) {

        showToast(
            "Write a response first.",
            "error"
        );

        return;

    }


    try {

        const admin =
            auth.currentUser;


        // Save response to report

        await addDoc(
            collection(
                db,
                "reports",
                currentReport.id,
                "responses"
            ),
            {
                message: response,

                senderId:
                    admin?.uid || null,

                senderName:
                    admin?.displayName ||
                    "Moderator",

                createdAt:
                    serverTimestamp()
            }
        );


        // Keep the parent ticket's activity timestamp current for student tracking.
        await updateDoc(
            doc(db, "reports", currentReport.id),
            {
                lastResponseAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            }
        );


        // Optional notification

        if (
            $("sendReportNotification")?.checked &&
            currentReport.reporterId
        ) {

            await addDoc(
                collection(
                    db,
                    "notifications"
                ),
                {
                    userId:
                        currentReport.reporterId,

                    title:
                        "Report Update",

                    message:
                        response,

                    type:
                        "report_response",

                    reportId:
                        currentReport.id,

                    read:
                        false,

                    createdAt:
                        serverTimestamp()
                }
            );

        }


        await createAuditLog(
            "Response sent to reporter",
            currentReport.id
        );


        $("reportResponse").value = "";


        showToast(
            "Response sent successfully.",
            "success"
        );


        await loadTimeline(
            currentReport
        );

    } catch (error) {

        console.error(error);

        showToast(
            "Failed to send response.",
            "error"
        );

    }

}


// ============================================================
// UPDATE STATUS
// ============================================================

async function updateReportStatus(
    reportId,
    status
) {

    try {

        await updateDoc(
            doc(
                db,
                "reports",
                reportId
            ),
            {
                status,
                updatedAt:
                    serverTimestamp(),

                ...(status === "resolved"
                    ? {
                        resolvedAt:
                            serverTimestamp(),

                        resolvedBy:
                            auth.currentUser?.uid ||
                            null
                    }
                    : {})
            }
        );


        const index =
            reports.findIndex(
                r => r.id === reportId
            );


        if (index !== -1) {

            reports[index].status =
                status;

            reports[index].updatedAt =
                new Date();

        }


        updateStats();

        applyFilters();

    } catch (error) {

        console.error(
            "Status update failed:",
            error
        );

    }

}


// ============================================================
// RESOLVE
// ============================================================

async function resolveReport() {

    if (!currentReport) return;


    const confirmed =
        confirm(
            "Resolve this moderation report?"
        );


    if (!confirmed) return;


    try {

        await updateReportStatus(
            currentReport.id,
            "resolved"
        );


        await createAuditLog(
            "Report resolved",
            currentReport.id
        );


        showToast(
            "Report resolved.",
            "success"
        );


        closeReportModal();


    } catch (error) {

        console.error(error);

        showToast(
            "Failed to resolve report.",
            "error"
        );

    }

}


// ============================================================
// DISMISS
// ============================================================

async function dismissReport() {

    if (!currentReport) return;


    if (
        !confirm(
            "Dismiss this report?"
        )
    ) return;


    await updateReportStatus(
        currentReport.id,
        "dismissed"
    );


    await createAuditLog(
        "Report dismissed",
        currentReport.id
    );


    showToast(
        "Report dismissed.",
        "success"
    );


    closeReportModal();

}


// ============================================================
// WARN USER
// ============================================================

async function warnReportedUser() {

    if (!currentReport) return;


    const userId =
        currentReport.reportedUserId;


    if (!userId) {

        showToast(
            "Reported user ID is missing.",
            "error"
        );

        return;

    }


    try {

        await addDoc(
            collection(
                db,
                "notifications"
            ),
            {
                userId,

                title:
                    "Community Guidelines Warning",

                message:
                    "Your account has received a moderation warning. Please review the academy's community guidelines.",

                type:
                    "moderation_warning",

                reportId:
                    currentReport.id,

                read:
                    false,

                createdAt:
                    serverTimestamp()
            }
        );


        await createAuditLog(
            "Warning issued to reported user",
            currentReport.id
        );


        showToast(
            "Warning sent.",
            "success"
        );


    } catch (error) {

        console.error(error);

        showToast(
            "Failed to issue warning.",
            "error"
        );

    }

}


// ============================================================
// SUSPEND USER
// ============================================================

async function suspendReportedUser() {

    if (!currentReport) return;


    const userId =
        currentReport.reportedUserId;


    if (!userId) {

        showToast(
            "Reported user ID is missing.",
            "error"
        );

        return;

    }


    if (
        !confirm(
            "Suspend this user's account?"
        )
    ) return;


    try {

        await updateDoc(
            doc(
                db,
                "users",
                userId
            ),
            {
                accountStatus:
                    "suspended",

                suspendedAt:
                    serverTimestamp(),

                suspendedBy:
                    auth.currentUser?.uid ||
                    null
            }
        );


        await addDoc(
            collection(
                db,
                "notifications"
            ),
            {
                userId,

                title:
                    "Account Suspended",

                message:
                    "Your Spark Stack Academy account has been suspended following a moderation review.",

                type:
                    "account_suspended",

                reportId:
                    currentReport.id,

                read:
                    false,

                createdAt:
                    serverTimestamp()
            }
        );


        await createAuditLog(
            "User account suspended",
            currentReport.id
        );


        showToast(
            "User suspended.",
            "success"
        );


    } catch (error) {

        console.error(error);

        showToast(
            "Failed to suspend user.",
            "error"
        );

    }

}


// ============================================================
// AUDIT LOG
// ============================================================

async function createAuditLog(
    action,
    reportId
) {

    try {

        await addDoc(
            collection(
                db,
                "moderationAuditLogs"
            ),
            {
                action,

                reportId,

                moderatorId:
                    auth.currentUser?.uid ||
                    null,

                moderatorName:
                    auth.currentUser?.displayName ||
                    "Moderator",

                createdAt:
                    serverTimestamp()
            }
        );

    } catch (error) {

        console.error(
            "Audit log failed:",
            error
        );

    }

}


// ============================================================
// LOAD AUDIT LOG
// ============================================================

async function loadAuditLog() {

    const container =
        $("moderationAuditLog");

    if (!container) return;


    try {

        const snapshot =
            await getDocs(
                query(
                    collection(
                        db,
                        "moderationAuditLogs"
                    ),
                    orderBy(
                        "createdAt",
                        "desc"
                    ),
                    limit(10)
                )
            );


        if (snapshot.empty) {

            container.innerHTML = `

                <div class="audit-empty">

                    <i data-lucide="shield"></i>

                    <span>
                        No moderation activity yet.
                    </span>

                </div>

            `;

            refreshIcons();

            return;

        }


        container.innerHTML =
            snapshot.docs
                .map(docSnap => {

                    const log =
                        docSnap.data();

                    return `

                        <div class="audit-log-item">

                            <div class="audit-log-icon">

                                <i data-lucide="shield-check"></i>

                            </div>

                            <div>

                                <strong>
                                    ${escapeHTML(
                                        log.action ||
                                        "Moderation action"
                                    )}
                                </strong>

                                <span>
                                    ${formatDateTime(
                                        log.createdAt
                                    )}
                                </span>

                            </div>

                        </div>

                    `;

                })
                .join("");


        refreshIcons();

    } catch (error) {

        console.error(
            "Audit log error:",
            error
        );

    }

}


// ============================================================
// TIMELINE
// ============================================================

async function loadTimeline(report) {

    const container =
        $("reportActivityTimeline");

    if (!container) return;


    try {

        const snapshot =
            await getDocs(
                query(
                    collection(
                        db,
                        "moderationAuditLogs"
                    ),
                    where(
                        "reportId",
                        "==",
                        report.id
                    ),
                    limit(30)
                )
            );


        const logs =
            snapshot.docs
                .map(d => d.data())
                .sort(
                    (a, b) =>
                        getTimestamp(
                            b.createdAt
                        ) -
                        getTimestamp(
                            a.createdAt
                        )
                );


        if (!logs.length) {

            container.innerHTML = `

                <div class="timeline-empty">

                    <span>
                        No case activity recorded yet.
                    </span>

                </div>

            `;

            return;

        }


        container.innerHTML =
            logs.map(log => `

                <div class="timeline-item">

                    <div class="timeline-dot"></div>

                    <div>

                        <strong>
                            ${escapeHTML(
                                log.action ||
                                "Activity"
                            )}
                        </strong>

                        <span>
                            ${formatDateTime(
                                log.createdAt
                            )}
                        </span>

                    </div>

                </div>

            `).join("");


    } catch (error) {

        console.error(
            "Timeline error:",
            error
        );

    }

}


// ============================================================
// ANALYTICS
// ============================================================

function loadAnalytics() {

    const resolved =
        reports.filter(
            r =>
                normalize(r.status) ===
                "resolved"
        ).length;


    const total =
        reports.length;


    const rate =
        total
            ? Math.round(
                (resolved / total) * 100
            )
            : 0;


    setText(
        "resolutionRate",
        `${rate}%`
    );


    setText(
        "averageResolutionTime",
        "Calculating..."
    );


    const categoryCounts = {};


    reports.forEach(report => {

        const category =
            report.category ||
            report.type ||
            "Other";


        categoryCounts[category] =
            (categoryCounts[category] || 0) +
            1;

    });


    const container =
        $("reportCategoryBreakdown");

    if (!container) return;


    container.innerHTML =
        Object.entries(categoryCounts)
            .sort(
                (a, b) =>
                    b[1] - a[1]
            )
            .map(
                ([category, count]) => {

                    const percent =
                        total
                            ? Math.round(
                                (count / total) * 100
                            )
                            : 0;

                    return `

                        <div class="category-breakdown-item">

                            <div>

                                <span>
                                    ${escapeHTML(
                                        category
                                    )}
                                </span>

                                <strong>
                                    ${count}
                                </strong>

                            </div>

                            <div class="category-breakdown-bar">

                                <span
                                    style="width:${percent}%"
                                ></span>

                            </div>

                        </div>

                    `;

                }
            )
            .join("");

}


// ============================================================
// PAGINATION
// ============================================================

function renderPagination(
    totalPages
) {

    const container =
        $("reportsPagination");

    if (!container) return;


    if (totalPages <= 1) {

        container.innerHTML = "";

        return;

    }


    let html = "";


    html += `

        <button
            class="report-page-btn"
            data-page="${currentPage - 1}"
            ${currentPage === 1 ? "disabled" : ""}
        >
            ‹
        </button>

    `;


    for (
        let i = 1;
        i <= totalPages;
        i++
    ) {

        html += `

            <button
                class="report-page-btn ${
                    i === currentPage
                        ? "active"
                        : ""
                }"
                data-page="${i}"
            >
                ${i}
            </button>

        `;

    }


    html += `

        <button
            class="report-page-btn"
            data-page="${currentPage + 1}"
            ${currentPage === totalPages ? "disabled" : ""}
        >
            ›
        </button>

    `;


    container.innerHTML = html;

}


// ============================================================
// EVENTS
// ============================================================

function setupEvents() {

    $("reportSearch")
        ?.addEventListener(
            "input",
            applyFilters
        );


    $("reportStatusFilter")
        ?.addEventListener(
            "change",
            applyFilters
        );


    $("reportPriorityFilter")
        ?.addEventListener(
            "change",
            applyFilters
        );


    $("reportTypeFilter")
        ?.addEventListener(
            "change",
            applyFilters
        );


    $("reportSort")
        ?.addEventListener(
            "change",
            applyFilters
        );


    $("clearReportFilters")
        ?.addEventListener(
            "click",
            () => {

                $("reportSearch").value = "";

                $("reportStatusFilter").value =
                    "all";

                $("reportPriorityFilter").value =
                    "all";

                $("reportTypeFilter").value =
                    "all";

                $("reportSort").value =
                    "newest";

                applyFilters();

            }
        );


    $("refreshReportsBtn")
        ?.addEventListener(
            "click",
            loadReports
        );


    $("viewCriticalBtn")
        ?.addEventListener(
            "click",
            () => {

                $("reportPriorityFilter").value =
                    "critical";

                applyFilters();

                window.scrollTo({
                    top:
                        document.querySelector(
                            ".reports-management-card"
                        )?.offsetTop || 0,
                    behavior:
                        "smooth"
                });

            }
        );


    document.addEventListener(
        "click",
        event => {

            const actionElement =
                event.target.closest(
                    "[data-action]"
                );


            if (!actionElement) return;


            const action =
                actionElement.dataset.action;

            const id =
                actionElement.dataset.id;


            if (
                action === "view" &&
                id
            ) {

                openReport(id);

            }

        }
    );


    $("closeReportDetails")
        ?.addEventListener(
            "click",
            closeReportModal
        );


    document.querySelector(
        "#reportDetailsModal .admin-modal-backdrop"
    )?.addEventListener(
        "click",
        closeReportModal
    );


    $("saveModeratorNotesBtn")
        ?.addEventListener(
            "click",
            saveModeratorNotes
        );


    $("sendReportResponseBtn")
        ?.addEventListener(
            "click",
            sendReportResponse
        );


    $("warnReportedUserBtn")
        ?.addEventListener(
            "click",
            warnReportedUser
        );


    $("suspendReportedUserBtn")
        ?.addEventListener(
            "click",
            suspendReportedUser
        );


    $("resolveReportBtn")
        ?.addEventListener(
            "click",
            resolveReport
        );


    $("dismissReportBtn")
        ?.addEventListener(
            "click",
            dismissReport
        );


    $("reportsPagination")
        ?.addEventListener(
            "click",
            event => {

                const button =
                    event.target.closest(
                        "[data-page]"
                    );

                if (!button) return;


                const page =
                    Number(
                        button.dataset.page
                    );


                if (
                    page < 1 ||
                    page >
                    Math.ceil(
                        filteredReports.length /
                        reportsPerPage
                    )
                ) return;


                currentPage = page;

                renderReports();

            }
        );


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Escape" &&
                currentReport
            ) {

                closeReportModal();

            }

        }
    );

}


// ============================================================
// HELPERS
// ============================================================

function normalize(value) {

    return String(
        value || ""
    )
        .trim()
        .toLowerCase();

}


function capitalize(value) {

    if (!value) return "";

    return value.charAt(0).toUpperCase() +
        value.slice(1);

}


function setText(
    id,
    value
) {

    const element = $(id);

    if (element) {
        element.textContent = value;
    }

}


function refreshIcons() {

    if (window.lucide) {
        lucide.createIcons();
    }

}


function escapeHTML(value) {

    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

}


function escapeAttribute(value) {

    return escapeHTML(value);

}


// ============================================================
// TOAST
// ============================================================

function showToast(
    message,
    type = "success"
) {

    let toast =
        document.querySelector(
            ".admin-toast"
        );


    if (!toast) {

        toast =
            document.createElement(
                "div"
            );

        toast.className =
            "admin-toast";

        document.body.appendChild(
            toast
        );

    }


    toast.className =
        `admin-toast ${type}`;


    toast.textContent =
        message;


    requestAnimationFrame(() => {

        toast.classList.add(
            "show"
        );

    });


    setTimeout(() => {

        toast.classList.remove(
            "show"
        );

    }, 3000);

}


// ============================================================
// GLOBAL
// ============================================================

window.SSAReports = {

    refresh:
        loadReports,

    open:
        openReport,

    resolve:
        resolveReport,

    dismiss:
        dismissReport

};