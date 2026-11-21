// ============================================================
// SPARK STACK ACADEMY — SMART PAYMENTS CENTRE
// Manual M-Pesa submission with server-side pricing and review.
// A receipt submission is NOT proof of payment and never grants
// course access. Finance verification is the only grant pathway.
// ============================================================

import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, where, orderBy, limit, onSnapshot, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const courseId = params.get("courseId") || params.get("id") || "";
const functions = getFunctions(auth.app, "us-central1");
const getPaymentConfig = httpsCallable(functions, "getManualMpesaPaymentConfig");
const submitPayment = httpsCallable(functions, "submitManualCoursePayment");

let currentUser = null;
let selectedCourse = null;
let paymentConfig = null;
let latestPayments = [];

const courseList = $("courseList");
const form = $("manualPaymentForm");
const submitButton = $("submitPaymentBtn");
const paymentMessage = $("paymentMessage");

$("backBtn")?.addEventListener("click", () => {
  window.location.href = courseId ? `course-details.html?id=${encodeURIComponent(courseId)}` : "marketplace.html";
});

$("copyReceiver")?.addEventListener("click", async () => {
  const phone = paymentConfig?.receiverPhone || "";
  if (!phone) return;
  try {
    await navigator.clipboard.writeText(phone);
    $("copyReceiver").innerHTML = '<i data-lucide="check"></i> Copied';
    refreshIcons();
  } catch {
    showMessage("Copy is unavailable on this device. Please copy the number manually.", true);
  }
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.replace("../login.html");
    return;
  }
  currentUser = user;
  if (!courseId) {
    renderCourseMessage("No course was selected. Return to the marketplace and choose a course to pay for.");
    $("paymentStatus").textContent = "No course selected";
    loadPaymentHistory();
    return;
  }
  await Promise.allSettled([loadCourse(), loadPaymentConfig()]);
  loadPaymentHistory();
});

async function loadCourse() {
  renderCourseLoading();
  try {
    const snapshot = await getDoc(doc(db, "courses", courseId));
    if (!snapshot.exists()) {
      renderCourseMessage("This course could not be found. It may have been removed.");
      return;
    }
    selectedCourse = { id: snapshot.id, ...snapshot.data() };
    renderCourse();
    updateSubmitAvailability();
  } catch (error) {
    console.error("[SSA Payments] Course lookup failed:", error);
    renderCourseMessage("We could not load the course details. Check your connection and retry.");
  }
}

async function loadPaymentConfig() {
  try {
    const response = await getPaymentConfig();
    paymentConfig = response.data || {};
    const configured = paymentConfig.enabled === true
      && Boolean(paymentConfig.receiverName)
      && Boolean(paymentConfig.receiverPhone);
    $("receiverDetails").hidden = !configured;
    $("receiverUnavailable").hidden = configured;
    if (configured) {
      $("receiverName").textContent = paymentConfig.receiverName;
      $("receiverPhone").textContent = paymentConfig.receiverPhone;
      $("receiverInstructions").textContent = paymentConfig.instructions
        || "Send the exact amount and keep your Safaricom confirmation message.";
    }
    updateSubmitAvailability();
    refreshIcons();
  } catch (error) {
    console.error("[SSA Payments] Payment configuration unavailable:", error);
    paymentConfig = { enabled: false };
    $("receiverDetails").hidden = true;
    $("receiverUnavailable").hidden = false;
    updateSubmitAvailability();
  }
}

function renderCourse() {
  if (!selectedCourse || !courseList) return;
  const course = selectedCourse;
  const basePrice = Number(course.price || 0);
  const discount = Number(course.discountPrice || 0);
  const amount = discount > 0 && discount < basePrice ? discount : basePrice;
  const title = escapeHTML(course.title || course.name || "Selected course");
  const instructor = escapeHTML(course.instructorName || course.instructor || "Spark Stack Academy");
  const institutionCourse = Boolean(course.institutionId);
  const invalid = amount <= 0 || String(course.currency || "KES").toUpperCase() !== "KES" || institutionCourse;
  const note = institutionCourse
    ? "This course is issued and settled by its institution. Use your institution's payment instructions."
    : amount <= 0
      ? "This course does not require a paid checkout."
      : String(course.currency || "KES").toUpperCase() !== "KES"
        ? "Manual M-Pesa checkout currently supports KES-priced courses only."
        : "Your course access is activated only after Finance confirms the incoming payment.";
  courseList.innerHTML = `
    <div class="selected-course-card">
      <div class="course-art"><i data-lucide="graduation-cap"></i><span>SPARK STACK ACADEMY</span></div>
      <div class="selected-course-copy">
        <span class="course-tag">COURSE ENROLMENT</span>
        <h3>${title}</h3>
        <p>Provided by ${instructor}</p>
        <div class="course-payment-note"><i data-lucide="info"></i><span>${escapeHTML(note)}</span></div>
      </div>
      <div class="course-total">
        <small>Amount payable</small>
        <strong>${formatMoney(amount)}</strong>
        <span>One-time payment</span>
      </div>
    </div>
  `;
  $("balance").textContent = formatMoney(amount);
  if (invalid) {
    $("paymentStatus").textContent = institutionCourse ? "Institution course" : "Not payable";
  } else {
    $("paymentStatus").textContent = "Awaiting payment";
  }
  updateSubmitAvailability();
  refreshIcons();
}

function renderCourseLoading() {
  if (courseList) courseList.innerHTML = '<div class="checkout-skeleton"><span></span><span></span><span></span></div>';
}

function renderCourseMessage(message) {
  if (courseList) courseList.innerHTML = `<div class="course-state"><i data-lucide="alert-circle"></i><p>${escapeHTML(message)}</p></div>`;
  refreshIcons();
}

function updateSubmitAvailability() {
  if (!submitButton) return;
  const amount = selectedCourse ? Number(selectedCourse.price || 0) : 0;
  const discount = selectedCourse ? Number(selectedCourse.discountPrice || 0) : 0;
  const finalAmount = discount > 0 && discount < amount ? discount : amount;
  const canPay = Boolean(currentUser && selectedCourse && paymentConfig?.enabled === true
    && paymentConfig.receiverName && paymentConfig.receiverPhone
    && finalAmount > 0 && !selectedCourse.institutionId
    && String(selectedCourse.currency || "KES").toUpperCase() === "KES");
  submitButton.disabled = !canPay;
}

form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!window.SSAOnlineActionGuard?.requireOnline("Submitting an M-Pesa receipt")) return;
  if (!currentUser || !selectedCourse || !paymentConfig?.enabled) return;

  const payerPhone = String($("payerPhone")?.value || "").trim();
  const mpesaCode = String($("mpesaCode")?.value || "").trim().toUpperCase();
  if (!payerPhone || !/^[A-Z0-9]{8,12}$/.test(mpesaCode)) {
    showMessage("Enter the payer phone number and the 8–12 character M-Pesa receipt code.", true);
    return;
  }

  submitButton.disabled = true;
  submitButton.innerHTML = '<i data-lucide="loader-circle"></i><span>Submitting securely…</span>';
  refreshIcons();
  showMessage("Submitting your receipt for Finance review…", false);

  try {
    const response = await submitPayment({ courseId: selectedCourse.id, payerPhone, mpesaCode });
    const result = response.data || {};
    form.reset();
    showMessage(`Receipt submitted. Reference: ${result.paymentId || "pending"}. Your course remains locked until Finance verifies the payment.`, false);
    $("paymentStatus").textContent = "Pending verification";
    await loadPaymentHistory();
  } catch (error) {
    console.error("[SSA Payments] Receipt submission failed:", error);
    const message = error?.message || "We could not submit this receipt. Check the details and try again.";
    showMessage(message, true);
  } finally {
    submitButton.innerHTML = '<i data-lucide="lock-keyhole"></i><span>Submit receipt securely</span><i data-lucide="arrow-right"></i>';
    updateSubmitAvailability();
    refreshIcons();
  }
});

function loadPaymentHistory() {
  if (!currentUser || !$("transactionList")) return;
  const paymentsQuery = query(
    collection(db, "payments"),
    where("userId", "==", currentUser.uid),
    orderBy("createdAt", "desc"),
    limit(20)
  );
  onSnapshot(paymentsQuery, snapshot => {
    latestPayments = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    renderPaymentHistory();
  }, error => {
    console.warn("[SSA Payments] History read failed:", error);
    $("transactionList").innerHTML = '<div class="history-empty">Transaction history is temporarily unavailable.</div>';
  });
}

function renderPaymentHistory() {
  const list = $("transactionList");
  if (!list) return;
  const paid = latestPayments.filter(item => ["paid", "success", "successful", "completed"].includes(normalizeStatus(item.status)));
  const paidTotal = paid.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  $("totalPaid").textContent = formatMoney(paidTotal);
  if (!latestPayments.length) {
    list.innerHTML = '<div class="history-empty"><i data-lucide="receipt"></i><strong>No transactions yet</strong><span>Your submitted M-Pesa receipts will appear here.</span></div>';
    refreshIcons();
    return;
  }
  list.innerHTML = latestPayments.map(payment => {
    const status = normalizeStatus(payment.status);
    const label = status === "paid" || status === "completed" || status === "success" ? "Verified"
      : status === "pending_verification" ? "Under review"
      : status === "rejected" || status === "failed" ? "Needs attention" : "Pending";
    const code = escapeHTML(payment.mpesaCode || payment.reference || "—");
    return `
      <article class="transaction-row">
        <div class="transaction-icon"><i data-lucide="smartphone"></i></div>
        <div class="transaction-description"><strong>${escapeHTML(payment.courseName || payment.course || "Course payment")}</strong><span>M-Pesa receipt · ${code}</span></div>
        <div class="transaction-amount"><strong>${formatMoney(Number(payment.amount || 0))}</strong><span class="transaction-status ${escapeHTML(status)}">${label}</span></div>
      </article>`;
  }).join("");
  const latest = latestPayments[0];
  if (latest && courseId && latest.courseId === courseId) {
    const status = normalizeStatus(latest.status);
    $("paymentStatus").textContent = ["paid", "completed", "success", "successful"].includes(status)
      ? "Verified"
      : status === "pending_verification" ? "Pending review" : "Awaiting payment";
  }
  refreshIcons();
}

function showMessage(message, error) {
  if (!paymentMessage) return;
  paymentMessage.textContent = message;
  paymentMessage.classList.toggle("error", Boolean(error));
  paymentMessage.classList.toggle("success", !error);
}

function formatMoney(value) {
  return "KSh " + new Intl.NumberFormat("en-KE", { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function normalizeStatus(value) {
  return String(value || "pending").toLowerCase().replace(/\s+/g, "_");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[char]));
}

function refreshIcons() {
  window.lucide?.createIcons();
}
