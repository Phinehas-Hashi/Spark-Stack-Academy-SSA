// =====================================
// SPARK STACK ACADEMY
// STUDENT HELP CENTER
// help-center.js
// =====================================

import {
    auth,
    db
} from "../../js/firebase.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    addDoc, collection, doc, onSnapshot, orderBy, query,
    serverTimestamp, updateDoc, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { submitReport } from "../../js/reports.js";


console.log("🛟 Help Center Loaded");


let currentUser = null;
let unsubscribeTickets = null;
let unsubscribeThread = null;
let openTicketId = null;


// =====================================
// AUTH
// =====================================

onAuthStateChanged(
    auth,
    user => {

        if (!user) {

            window.location.href =
                "../login.html";

            return;

        }

        currentUser = user;
        unsubscribeTickets?.();
        unsubscribeTickets = subscribeToTickets(user.uid);

    }
);


// =====================================
// DOM READY
// =====================================

document.addEventListener(
    "DOMContentLoaded",
    () => {

        initializeFAQ();

        initializeSearch();

        initializeCategories();

        initializeGuides();

        initializeSupport();

        initializeKeyboard();

        refreshIcons();

    }
);


// =====================================
// FAQ
// =====================================

function initializeFAQ() {

    const questions =
        document.querySelectorAll(
            ".faq-question"
        );


    questions.forEach(
        question => {

            question.addEventListener(
                "click",
                () => {

                    const item =
                        question.closest(
                            ".faq-item"
                        );


                    const isOpen =
                        item.classList.contains(
                            "active"
                        );


                    // Close other FAQs

                    document
                        .querySelectorAll(
                            ".faq-item.active"
                        )
                        .forEach(
                            openItem => {

                                if (
                                    openItem !== item
                                ) {

                                    openItem.classList.remove(
                                        "active"
                                    );

                                    const button =
                                        openItem.querySelector(
                                            ".faq-question"
                                        );

                                    button?.setAttribute(
                                        "aria-expanded",
                                        "false"
                                    );

                                }

                            }
                        );


                    // Toggle current

                    item.classList.toggle(
                        "active",
                        !isOpen
                    );


                    question.setAttribute(
                        "aria-expanded",
                        String(!isOpen)
                    );

                }
            );

        }
    );

}


// =====================================
// SEARCH
// =====================================

function initializeSearch() {

    const search =
        document.getElementById(
            "helpSearch"
        );


    const results =
        document.getElementById(
            "searchResults"
        );


    const faqItems =
        document.querySelectorAll(
            ".faq-item"
        );


    const empty =
        document.getElementById(
            "faqEmpty"
        );


    if (!search) return;


    search.addEventListener(
        "input",
        () => {

            const query =
                search.value
                    .trim()
                    .toLowerCase();


            let matches = 0;


            faqItems.forEach(
                item => {

                    const text =
                        (
                            item.textContent +
                            " " +
                            (
                                item.dataset.search ||
                                ""
                            )
                        ).toLowerCase();


                    const match =
                        !query ||
                        text.includes(query);


                    item.style.display =
                        match
                            ? ""
                            : "none";


                    if (match) {
                        matches++;
                    }

                }
            );


            if (empty) {

                empty.hidden =
                    matches !== 0;

            }


            renderSearchResults(
                query,
                faqItems,
                results
            );

        }
    );

}


// =====================================
// SEARCH RESULTS
// =====================================

function renderSearchResults(
    query,
    faqItems,
    container
) {

    if (!container) return;


    container.innerHTML = "";


    if (!query) return;


    const matches = [];


    faqItems.forEach(
        item => {

            const text =
                (
                    item.textContent +
                    " " +
                    (
                        item.dataset.search ||
                        ""
                    )
                ).toLowerCase();


            if (
                text.includes(query)
            ) {

                const question =
                    item.querySelector(
                        ".faq-question span"
                    );


                if (question) {

                    matches.push(
                        question.textContent.trim()
                    );

                }

            }

        }
    );


    matches
        .slice(0, 5)
        .forEach(
            title => {

                const button =
                    document.createElement(
                        "button"
                    );


                button.type =
                    "button";


                button.className =
                    "help-search-result";


                button.innerHTML = `
                    <strong>${escapeHTML(title)}</strong>
                    <span>View answer</span>
                `;


                button.addEventListener(
                    "click",
                    () => {

                        const item =
                            [...faqItems]
                                .find(
                                    faq => {

                                        const span =
                                            faq.querySelector(
                                                ".faq-question span"
                                            );

                                        return (
                                            span &&
                                            span.textContent.trim() ===
                                            title
                                        );

                                    }
                                );


                        if (item) {

                            item.scrollIntoView({
                                behavior: "smooth",
                                block: "center"
                            });


                            item.classList.add(
                                "active"
                            );


                            item.querySelector(
                                ".faq-question"
                            )?.setAttribute(
                                "aria-expanded",
                                "true"
                            );

                        }


                        container.innerHTML = "";

                    }
                );


                container.appendChild(
                    button
                );

            }
        );

}


// =====================================
// QUICK CATEGORIES
// =====================================

function initializeCategories() {

    const buttons =
        document.querySelectorAll(
            ".help-action"
        );


    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const category =
                        button.dataset.category;


                    const faqItems =
                        document.querySelectorAll(
                            ".faq-item"
                        );


                    let found = false;


                    faqItems.forEach(
                        item => {

                            const matches =
                                item.dataset.category ===
                                category;


                            item.style.display =
                                matches
                                    ? ""
                                    : "none";


                            if (matches) {
                                found = true;
                            }

                        }
                    );


                    const faqEmpty =
                        document.getElementById(
                            "faqEmpty"
                        );


                    if (faqEmpty) {

                        faqEmpty.hidden =
                            found;

                    }


                    document
                        .querySelector(
                            ".faq-section"
                        )
                        ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start"
                        });

                }
            );

        }
    );

}


// =====================================
// GUIDES
// =====================================

function initializeGuides() {

    const buttons =
        document.querySelectorAll(
            "[data-guide]"
        );


    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    const guide =
                        button.dataset.guide;


                    const messages = {

                        "getting-started":
                            "Start with your Dashboard, explore the Course Library, then enroll in a course to begin learning.",

                        "courses":
                            "Your Courses area lets you continue lessons, track progress and complete assignments.",

                        "achievements":
                            "Complete learning activities to earn XP, level up and unlock achievements and certificates.",

                        "payments":
                            "Payments and Premium subscriptions can be managed from the Payments and Premium sections of your student portal."

                    };


                    alert(
                        messages[guide] ||
                        "This guide is currently being prepared."
                    );

                }
            );

        }
    );

}


// =====================================
// SUPPORT
// =====================================

function initializeSupport() {

    const modal =
        document.getElementById(
            "supportModal"
        );


    const contact =
        document.getElementById(
            "contactSupportBtn"
        );


    const report =
        document.getElementById(
            "reportProblemBtn"
        );


    const close =
        document.getElementById(
            "closeSupportModal"
        );


    const backdrop =
        modal?.querySelector(
            ".modal-backdrop"
        );


    const form =
        document.getElementById(
            "supportForm"
        );


    contact?.addEventListener(
        "click",
        () => {

            openSupportModal(
                "Contact Spark Support"
            );

        }
    );


    report?.addEventListener(
        "click",
        () => {

            openSupportModal(
                "Report a Problem"
            );

        }
    );


    close?.addEventListener(
        "click",
        closeSupportModal
    );


    backdrop?.addEventListener(
        "click",
        closeSupportModal
    );


    form?.addEventListener(
        "submit",
        submitSupportRequest
    );


    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Escape"
            ) {

                closeSupportModal();

            }

        }
    );

}


// =====================================
// OPEN SUPPORT MODAL
// =====================================

function openSupportModal(title) {

    const modal =
        document.getElementById(
            "supportModal"
        );


    const subject =
        document.getElementById(
            "supportSubject"
        );


    const modalTitle =
        document.getElementById(
            "supportModalTitle"
        );


    if (!modal) return;


    modal.classList.add(
        "active"
    );


    modal.setAttribute(
        "aria-hidden",
        "false"
    );


    if (modalTitle) {

        modalTitle.textContent =
            title;

    }


    if (
        title.includes(
            "Report"
        )
    ) {

        if (subject) {

            subject.value =
                "Report a Problem";

        }

    }


    setTimeout(
        () => {

            subject?.focus();

        },
        100
    );

}


// =====================================
// CLOSE MODAL
// =====================================

function closeSupportModal() {

    const modal =
        document.getElementById(
            "supportModal"
        );


    if (!modal) return;


    modal.classList.remove(
        "active"
    );


    modal.setAttribute(
        "aria-hidden",
        "true"
    );

}


// =====================================
// SUBMIT SUPPORT REQUEST
// =====================================

async function submitSupportRequest(event) {
    event.preventDefault();
    if (!currentUser) {
        alert("Please sign in again before contacting support.");
        return;
    }
    const subject = document.getElementById("supportSubject")?.value.trim();
    const message = document.getElementById("supportMessage")?.value.trim();
    const category = document.getElementById("supportCategory")?.value || "other";
    const priority = document.getElementById("supportPriority")?.value || "medium";
    if (!subject || !message) {
        alert("Please complete the subject and description.");
        return;
    }
    const button = document.querySelector(".submit-support");
    const original = button?.innerHTML;
    try {
        if (button) { button.disabled = true; button.textContent = "Creating ticket…"; }
        const ticket = await submitReport({
            title: subject,
            description: message,
            category,
            type: "support",
            priority,
            metadata: { portal: "student", channel: "help-center" }
        });
        const result = document.getElementById("ticketCreationNotice");
        if (result) result.textContent = `Ticket ${ticket.reportId} created successfully. Keep this reference for follow-up.`;
        document.getElementById("supportForm")?.reset();
        closeSupportModal();
        document.getElementById("mySupportTicketsSection")?.scrollIntoView({ behavior: "smooth" });
        window.ssaToast?.(`Ticket ${ticket.reportId} created successfully.`, "success", "Spark Support");
    } catch (error) {
        console.error("Support ticket submission failed:", error);
        window.ssaToast?.(window.ssaFriendlyError?.(error, "We couldn't create your ticket. Please try again.") || "We couldn't create your ticket. Please try again.", "error", "Spark Support");
    } finally {
        if (button) { button.disabled = false; button.innerHTML = original || "Send Request"; }
    }
}

function subscribeToTickets(uid) {
    const root = document.getElementById("mySupportTickets");
    const summary = document.getElementById("ticketSummary");
    if (!root) return null;
    const q = query(collection(db, "reports"), where("reporterId", "==", uid));
    return onSnapshot(q, snapshot => {
        const tickets = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
            .filter(item => item.type === "support" || item.metadata?.channel === "help-center")
            .sort((a, b) => timestamp(b.updatedAt || b.createdAt) - timestamp(a.updatedAt || a.createdAt));
        const open = tickets.filter(item => !["resolved", "closed", "dismissed"].includes(item.status)).length;
        if (summary) summary.innerHTML = `<span><strong>${tickets.length}</strong> total tickets</span><span><strong>${open}</strong> awaiting resolution</span><span><strong>${tickets.length-open}</strong> closed or resolved</span>`;
        if (!tickets.length) {
            root.innerHTML = '<div class="ticket-empty"><strong>No support tickets yet</strong><p>When you contact Spark Support, your ticket and every response will appear here.</p></div>';
            return;
        }
        root.innerHTML = tickets.map(ticket => {
            const status = normalizeStatus(ticket.status);
            return `<article class="ticket-card">
                <div class="ticket-card-top"><span class="ticket-reference">${escapeHTML(ticket.reportId || ticket.id)}</span><span class="ticket-status ${status}">${escapeHTML(statusLabel(status))}</span></div>
                <h3>${escapeHTML(ticket.title || "Support request")}</h3>
                <p class="ticket-description">${escapeHTML(ticket.description || "")}</p>
                <div class="ticket-meta"><span>${escapeHTML(ticket.category || "General")}</span><span>${escapeHTML(ticket.priority || "medium")} priority</span><span>${escapeHTML(formatTicketDate(ticket.createdAt))}</span></div>
                ${ticket.feedback ? `<div class="ticket-feedback"><strong>Latest review</strong><p>${escapeHTML(ticket.feedback)}</p></div>` : ""}
                <div class="ticket-actions"><button type="button" data-ticket-thread="${escapeHTML(ticket.id)}">View conversation</button>
                ${status === "resolved" ? `<button type="button" data-ticket-close="${escapeHTML(ticket.id)}">Yes, resolved</button><button type="button" data-ticket-reopen="${escapeHTML(ticket.id)}">Not resolved — reopen</button>` : ""}
                ${status === "dismissed" || status === "closed" ? `<button type="button" data-ticket-reopen="${escapeHTML(ticket.id)}">Reopen ticket</button>` : ""}
                </div>
                <div class="ticket-thread" id="ticket-thread-${escapeHTML(ticket.id)}" hidden></div>
            </article>`;
        }).join("");
        refreshIcons();
        if (openTicketId) {
            const activePanel = document.getElementById(`ticket-thread-${openTicketId}`);
            if (activePanel) {
                activePanel.hidden = false;
                openTicketThread(openTicketId, activePanel);
            }
        }
    }, error => {
        console.error("Ticket subscription failed:", error);
        root.textContent = "We couldn't load your tickets. Refresh the page or try again later.";
    });
}

function timestamp(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.seconds === "number") return value.seconds * 1000;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
}
function formatTicketDate(value) {
    const time = timestamp(value);
    return time ? new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(time)) : "Just now";
}
function normalizeStatus(value) {
    return String(value || "pending").toLowerCase().replaceAll(" ", "_");
}
function statusLabel(value) {
    return ({ pending: "Open", reviewing: "Under review", resolved: "Resolved — awaiting your confirmation", dismissed: "Closed by support", closed: "Closed" })[value] || value;
}
function escapeTicket(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
document.addEventListener("click", async event => {
    const threadButton = event.target.closest("[data-ticket-thread]");
    const replyButton = event.target.closest("[data-ticket-reply]");
    const reopenButton = event.target.closest("[data-ticket-reopen]");
    const closeButton = event.target.closest("[data-ticket-close]");
    if (threadButton) {
        const id = threadButton.dataset.ticketThread;
        const panel = document.getElementById(`ticket-thread-${id}`);
        if (!panel) return;
        panel.hidden = !panel.hidden;
        if (!panel.hidden) openTicketThread(id, panel);
        else if (openTicketId === id) { unsubscribeThread?.(); unsubscribeThread = null; openTicketId = null; }
    }
    if (replyButton) await sendTicketReply(replyButton.dataset.ticketReply, replyButton.closest(".ticket-thread"));
    if (reopenButton) await setStudentTicketStatus(reopenButton.dataset.ticketReopen, "pending");
    if (closeButton) await setStudentTicketStatus(closeButton.dataset.ticketClose, "closed");
});

function openTicketThread(id, panel) {
    unsubscribeThread?.();
    openTicketId = id;
    panel.innerHTML = '<div class="ticket-thread-loading">Loading conversation…</div>';
    const q = query(collection(db, "reports", id, "responses"), orderBy("createdAt", "asc"));
    unsubscribeThread = onSnapshot(q, snapshot => {
        const messages = snapshot.docs.map(item => item.data());
        panel.innerHTML = `<div class="ticket-conversation">${messages.length ? messages.map(message => `
            <article class="ticket-message ${message.senderId === currentUser?.uid ? "student-message" : "support-message"}">
                <strong>${escapeHTML(message.senderName || (message.senderId === currentUser?.uid ? "You" : "Spark Support"))}</strong>
                <p>${escapeHTML(message.message || "")}</p><time>${escapeHTML(formatTicketDate(message.createdAt))}</time>
            </article>`).join("") : '<p class="ticket-thread-empty">No replies yet. Spark Support will respond here.</p>'}</div>
            <form class="ticket-reply-form"><label for="ticket-reply-${escapeHTML(id)}">Reply to this ticket</label><textarea id="ticket-reply-${escapeHTML(id)}" maxlength="5000" required placeholder="Add details or respond to the support team…"></textarea><button type="button" data-ticket-reply="${escapeHTML(id)}">Send reply</button><small>Never share your password, M-Pesa PIN or verification codes.</small></form>`;
        panel.scrollTop = panel.scrollHeight;
    }, error => { console.error(error); panel.textContent = "Conversation unavailable. Please try again later."; });
}
async function sendTicketReply(id, panel) {
    const textarea = panel?.querySelector("textarea");
    const message = textarea?.value.trim();
    if (!message || !currentUser) return;
    const button = panel.querySelector("[data-ticket-reply]");
    button.disabled = true;
    try {
        await addDoc(collection(db, "reports", id, "responses"), {
            message,
            senderId: currentUser.uid,
            senderName: currentUser.displayName || currentUser.email || "Student",
            senderRole: "student",
            createdAt: serverTimestamp()
        });
        textarea.value = "";
        window.ssaToast?.("Your reply has been added to the ticket.", "success", "Spark Support");
    } catch (error) {
        console.error(error);
        window.ssaToast?.("Your reply could not be sent. Please retry.", "error", "Spark Support");
    } finally { button.disabled = false; }
}
async function setStudentTicketStatus(id, status) {
    if (!currentUser || !["pending", "closed"].includes(status)) return;
    try {
        await updateDoc(doc(db, "reports", id), {
            status,
            studentStatusUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        window.ssaToast?.(status === "closed" ? "Ticket marked as resolved." : "Ticket reopened. Support can continue assisting you.", "success", "Spark Support");
    } catch (error) {
        console.error(error);
        window.ssaToast?.("Ticket status could not be updated.", "error", "Spark Support");
    }
}

// =====================================
// KEYBOARD SHORTCUT
// =====================================

function initializeKeyboard() {

    document.addEventListener(
        "keydown",
        event => {

            const target =
                event.target;


            const typing =
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA";


            if (
                event.key === "/" &&
                !typing
            ) {

                event.preventDefault();

                document
                    .getElementById(
                        "helpSearch"
                    )
                    ?.focus();

            }

        }
    );

}


// =====================================
// ICON REFRESH
// =====================================

function refreshIcons() {

    if (
        window.lucide &&
        typeof lucide.createIcons ===
            "function"
    ) {

        lucide.createIcons();

    }

}


// =====================================
// SECURITY
// =====================================

function escapeHTML(
    value
) {

    return String(value)
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}