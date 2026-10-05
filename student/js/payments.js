// ============================================================
// SPARK STACK ACADEMY
// STUDENT PAYMENTS — FAST PREMIUM CHECKOUT
// ============================================================

import { auth, db } from "../../js/firebase.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

console.log("⚡ Fast Payments Engine Loaded");

const PAYMENT_API_URL =
    window.SSA_PAYMENT_API_URL || "";

const params = new URLSearchParams(window.location.search);
const selectedCourseId = params.get("courseId");

let currentUser = null;
let selectedCourse = null;
let historyStarted = false;

const courseList = document.getElementById("courseList");
const transactionList = document.getElementById("transactionList");
const totalPaid = document.getElementById("totalPaid");
const balanceElement = document.getElementById("balance");
const paymentStatus = document.getElementById("paymentStatus");
const backBtn = document.getElementById("backBtn");

backBtn?.addEventListener("click", () => {
    window.location.href = "dashboard.html";
});

// ============================================================
// BOOT
// Checkout is the ONLY blocking operation.
// Payment history never blocks the page.
// ============================================================

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    currentUser = user;

    if (!selectedCourseId) {
        renderMessage("Select a course to continue with payment.");
        startHistoryInBackground();
        return;
    }

    await loadPremiumCourse();

    // Start history only after checkout is rendered.
    startHistoryInBackground();
});

// ============================================================
// PREMIUM COURSE
// ============================================================

async function loadPremiumCourse() {
    const cached = readCourseCache(selectedCourseId);

    if (cached) {
        selectedCourse = cached;
        renderCheckout(cached);
        refreshCourseSilently();
        return;
    }

    renderLoading();

    try {
        const snapshot = await getDoc(
            doc(db, "courses", selectedCourseId)
        );

        if (!snapshot.exists()) {
            renderMessage("This course could not be found.");
            return;
        }

        selectedCourse = {
            id: snapshot.id,
            ...snapshot.data()
        };

        writeCourseCache(selectedCourse);
        renderCheckout(selectedCourse);
    } catch (error) {
        console.error("Course loading failed:", error);
        renderMessage("Unable to load this course. Please retry.");
    }
}

async function refreshCourseSilently() {
    try {
        const snapshot = await getDoc(
            doc(db, "courses", selectedCourseId)
        );

        if (!snapshot.exists()) return;

        selectedCourse = {
            id: snapshot.id,
            ...snapshot.data()
        };

        writeCourseCache(selectedCourse);
        updateCheckout(selectedCourse);
    } catch (error) {
        console.warn("Silent course refresh failed:", error);
    }
}

// ============================================================
// CHECKOUT UI
// ============================================================

function renderCheckout(course) {
    if (!courseList) return;

    const title = escapeHTML(course.title || "Premium Course");
    const price = Number(course.price || 0);

    courseList.innerHTML = `
        <div class="course-card payment-checkout-card">
            <div class="checkout-course-info">
                <span class="checkout-badge">PREMIUM COURSE</span>
                <h3>${title}</h3>
                <p>Unlock full access to this course.</p>
            </div>

            <div class="checkout-price">
                <span>Course fee</span>
                <strong>KSh ${price.toLocaleString()}</strong>
            </div>

            <button
                type="button"
                class="pay-btn"
                id="payCourseBtn"
                ${price <= 0 ? "disabled" : ""}
            >
                Pay KSh ${price.toLocaleString()}
            </button>

            <div id="checkoutMessage" class="checkout-message"></div>
        </div>
    `;

    document
        .getElementById("payCourseBtn")
        ?.addEventListener("click", startPayment);

    if (balanceElement) {
        balanceElement.textContent = `KSh ${price.toLocaleString()}`;
    }

    if (paymentStatus) {
        paymentStatus.textContent = "Ready for payment";
    }
}

function updateCheckout(course) {
    const title = document.querySelector(".payment-checkout-card h3");
    const price = document.querySelector(".payment-checkout-card .checkout-price strong");
    const button = document.getElementById("payCourseBtn");
    const amount = Number(course.price || 0);

    if (title) title.textContent = course.title || "Premium Course";
    if (price) price.textContent = `KSh ${amount.toLocaleString()}`;
    if (button) button.textContent = `Pay KSh ${amount.toLocaleString()}`;
}

// ============================================================
// PAYMENT
// ============================================================

async function startPayment() {
    if (!currentUser || !selectedCourse) return;

    const amount = Number(selectedCourse.price || 0);
    const button = document.getElementById("payCourseBtn");

    if (amount <= 0) {
        showCheckoutMessage("This course has an invalid price.", true);
        return;
    }

    if (button) {
        button.disabled = true;
        button.textContent = "Opening secure checkout...";
    }

    try {
        if (!PAYMENT_API_URL) {
            throw new Error("Secure payments are temporarily unavailable while the unified SSA payment service is being configured.");
        }

        const response = await fetch(PAYMENT_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                userId: currentUser.uid,
                email: currentUser.email,
                courseId: selectedCourse.id,
                course: selectedCourse.title || "Premium Course",
                amount,
                currency: "KES"
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "Payment initialization failed."
            );
        }

        const checkoutUrl =
            data.redirect_url ||
            data.authorization_url ||
            data.checkout_url;

        if (!checkoutUrl) {
            throw new Error("No checkout URL was returned.");
        }

        window.location.replace(checkoutUrl);
    } catch (error) {
        console.error("Payment initialization failed:", error);
        showCheckoutMessage(
            error.message || "Unable to start payment. Please try again.",
            true
        );

        if (button) {
            button.disabled = false;
            button.textContent = `Pay KSh ${amount.toLocaleString()}`;
        }
    }
}

// ============================================================
// PAYMENT HISTORY — BACKGROUND ONLY
// ============================================================

function startHistoryInBackground() {
    if (historyStarted || !currentUser) return;
    historyStarted = true;

    const run = () => loadPaymentHistory();

    if ("requestIdleCallback" in window) {
        window.requestIdleCallback(run, { timeout: 2500 });
    } else {
        setTimeout(run, 800);
    }
}

function loadPaymentHistory() {
    if (!transactionList || !currentUser) return;

    try {
        const paymentsQuery = query(
            collection(db, "payments"),
            where("userId", "==", currentUser.uid),
            orderBy("createdAt", "desc"),
            limit(20)
        );

        onSnapshot(
            paymentsQuery,
            (snapshot) => {
                let paid = 0;
                transactionList.innerHTML = "";

                if (snapshot.empty) {
                    transactionList.innerHTML =
                        `<div class="empty-payment">No transactions yet.</div>`;
                    updateSummary(0);
                    return;
                }

                snapshot.forEach((paymentDoc) => {
                    const payment = paymentDoc.data();
                    const status = normalizeStatus(payment.status);

                    if (status === "success" || status === "completed") {
                        paid += Number(payment.amount || 0);
                    }

                    renderTransaction(payment);
                });

                updateSummary(paid);
            },
            (error) => {
                console.warn("Payment history unavailable:", error);
            }
        );
    } catch (error) {
        console.warn("Payment history setup failed:", error);
    }
}

function updateSummary(paid) {
    if (totalPaid) {
        totalPaid.textContent = `KSh ${paid.toLocaleString()}`;
    }

    if (paymentStatus) {
        paymentStatus.textContent =
            paid > 0 ? "Payments recorded" : "No payments yet";
    }
}

function renderTransaction(payment) {
    const card = document.createElement("div");
    card.className = "transaction-card";

    const course = escapeHTML(
        payment.course || payment.courseName || "Academy Payment"
    );

    const method = escapeHTML(payment.method || "PesaPal");
    const status = normalizeStatus(payment.status);
    const amount = Number(payment.amount || 0);

    card.innerHTML = `
        <div>
            <h3>${course}</h3>
            <p>${method}</p>
        </div>
        <div>
            <h3>KSh ${amount.toLocaleString()}</h3>
            <span class="${status}">${capitalize(status)}</span>
        </div>
    `;

    transactionList.appendChild(card);
}

// ============================================================
// UI STATES
// ============================================================

function renderLoading() {
    if (!courseList) return;

    courseList.innerHTML = `
        <div class="payment-loading">
            <p>Loading checkout...</p>
        </div>
    `;
}

function renderMessage(message) {
    if (!courseList) return;
    courseList.innerHTML = `
        <div class="empty-payment">
            ${escapeHTML(message)}
        </div>
    `;
}

function showCheckoutMessage(message, error = false) {
    const element = document.getElementById("checkoutMessage");
    if (!element) return;

    element.textContent = message;
    element.classList.toggle("error", error);
}

// ============================================================
// CACHE
// ============================================================

function writeCourseCache(course) {
    try {
        sessionStorage.setItem(
            `ssa_course_${course.id}`,
            JSON.stringify(course)
        );
    } catch {}
}

function readCourseCache(courseId) {
    try {
        const value = sessionStorage.getItem(`ssa_course_${courseId}`);
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
}

// ============================================================
// HELPERS
// ============================================================

function normalizeStatus(status) {
    return String(status || "pending")
        .toLowerCase()
        .replace(/\s+/g, "");
}

function capitalize(value) {
    return value
        ? value.charAt(0).toUpperCase() + value.slice(1)
        : "";
}

function escapeHTML(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

console.log("⚡ Fast Premium Checkout Ready");
