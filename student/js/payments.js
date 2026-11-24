// ============================================================
// SPARK STACK ACADEMY — STUDENT M-PESA PAYMENTS
// Supports server-priced STK Push and manual M-Pesa receipt review.
// ============================================================

import { app, auth, db, storage } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, onSnapshot, orderBy, query, where, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { ref as storageRef, uploadBytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const functions = getFunctions(app, "us-central1");
const getQuote = httpsCallable(functions, "getStudentPaymentQuote");
const initiateStk = httpsCallable(functions, "initiateStudentStkPayment");
const submitManual = httpsCallable(functions, "submitStudentManualPayment");
const attachProof = httpsCallable(functions, "attachStudentPaymentProof");

const params = new URLSearchParams(location.search);
const purchaseType = params.get("purchaseType") || (params.get("courseId") ? "course" : "");
const courseId = params.get("courseId") || "";
const plan = params.get("plan") || "";
const billingPeriod = params.get("period") || "monthly";

const $ = id => document.getElementById(id);
const courseList = $("courseList");
const transactionList = $("transactionList");
const totalPaid = $("totalPaid");
const balance = $("balance");
const paymentStatus = $("paymentStatus");
const backBtn = $("backBtn");

let currentUser = null;
let purchase = null;
let activePaymentUnsubscribe = null;
let pendingProofPaymentId = "";
let pendingProofStoragePath = "";
let pendingProofUploaded = false;

backBtn?.addEventListener("click", () => {
  location.href = purchaseType === "premium" ? "premium.html" : "courses.html";
});

function money(amount) {
  return "KSh " + Number(amount || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 });
}
function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function message(text, isError = false) {
  const node = $("checkoutMessage");
  if (!node) return;
  node.textContent = text;
  node.classList.toggle("error", isError);
  node.hidden = false;
}
function setBusy(id, busy, label) {
  const button = $(id);
  if (!button) return;
  button.disabled = busy;
  if (label) button.textContent = label;
}

async function loadPurchase() {
  let request;
  if (purchaseType === "course" && courseId) {
    request = { purchaseType: "course", courseId };
  } else if (purchaseType === "premium" && plan) {
    request = { purchaseType: "premium", plan, billingPeriod };
  } else {
    throw new Error("No valid course or membership was selected.");
  }

  // The server calculates the amount from the published course or Founder
  // pricing record. Never use a browser-supplied amount for checkout.
  const result = await getQuote(request);
  const data = result.data || {};
  purchase = {
    purchaseType: data.purchaseType,
    courseId: data.courseId || "",
    plan: data.plan || "",
    billingPeriod: data.billingPeriod || "",
    title: data.title || "Academy Purchase",
    amount: Number(data.amount),
    manualMpesa: data.manualMpesa || { enabled: false }
  };
  if (!Number.isSafeInteger(purchase.amount) || purchase.amount < 1) {
    throw new Error("The Academy returned an invalid payment amount.");
  }
}

function renderCheckout() {
  if (!courseList || !purchase) return;
  const periodLabel = purchase.billingPeriod
    ? purchase.billingPeriod.charAt(0).toUpperCase() + purchase.billingPeriod.slice(1)
    : "Course access";

  courseList.innerHTML = `
    <article class="course-card payment-checkout-card">
      <div class="checkout-course-info">
        <span class="checkout-badge">${purchase.purchaseType === "premium" ? "STUDENT MEMBERSHIP" : "COURSE PAYMENT"}</span>
        <h3 id="checkoutTitle"></h3>
        <p>${esc(periodLabel)} · Payment is verified by the Academy before access is activated.</p>
      </div>
      <div class="checkout-price">
        <span>Amount due</span>
        <strong id="checkoutAmount"></strong>
      </div>

      <section class="student-payment-method">
        <h3>Option 1 — M-Pesa STK Push</h3>
        <p>Enter the M-Pesa number that should receive the payment prompt.</p>
        <label for="stkPhone">M-Pesa phone number</label>
        <input id="stkPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07XXXXXXXX" maxlength="16">
        <button type="button" class="pay-btn" id="payWithStk">Send M-Pesa Prompt</button>
      </section>

      <section class="student-payment-method manual-payment-method">
        <h3>Option 2 — Manual M-Pesa Payment</h3>
        ${purchase.manualMpesa.enabled ? `
          <p>Follow the Academy's current payment instructions, then submit your receipt and confirmation screenshot for administrator verification.</p>
          <div class="payment-detail"><span>Payment type</span><strong id="manualMethod"></strong></div>
          <div class="payment-detail"><span>Business / account</span><strong id="manualBusinessName"></strong></div>
          <div class="payment-detail"><span>Paybill / Till number</span><strong id="manualNumber"></strong></div>
          <div class="payment-detail"><span>Account / reference</span><strong id="manualAccount"></strong></div>
          <div class="payment-detail"><span>Exact amount</span><strong id="manualAmount"></strong></div>
          <p id="manualInstructions" class="manual-instructions"></p>
          <label for="manualPhone">Phone number used to pay</label>
          <input id="manualPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07XXXXXXXX" maxlength="16">
          <label for="manualReceipt">M-Pesa transaction code</label>
          <input id="manualReceipt" type="text" autocomplete="off" placeholder="e.g. QGH7ABC123" maxlength="16">
          <label for="manualProof">M-Pesa confirmation screenshot (JPG, PNG or WebP, max 5 MB)</label>
          <input id="manualProof" type="file" accept="image/jpeg,image/png,image/webp">
          <button type="button" class="pay-btn manual-submit-btn" id="submitManualPayment">Submit Receipt and Proof</button>
          <button type="button" class="pay-btn manual-submit-btn" id="retryProofUpload" hidden>Retry Proof Upload</button>
        ` : `
          <p>Manual M-Pesa payment is not configured at the moment. Use STK Push or contact Academy support for payment assistance.</p>
        `}
      </section>

      <p id="checkoutMessage" class="checkout-message" role="status" aria-live="polite" hidden></p>
    </article>
  `;

  $("checkoutTitle").textContent = purchase.title;
  $("checkoutAmount").textContent = money(purchase.amount);
  if ($("manualAmount")) $("manualAmount").textContent = money(purchase.amount);
  if ($("manualMethod")) $("manualMethod").textContent = purchase.manualMpesa.method === "till" ? "Buy Goods Till" : purchase.manualMpesa.method === "paybill" ? "Paybill" : "Other";
  if ($("manualBusinessName")) $("manualBusinessName").textContent = purchase.manualMpesa.businessName || "—";
  if ($("manualNumber")) $("manualNumber").textContent = purchase.manualMpesa.number || "—";
  if ($("manualAccount")) $("manualAccount").textContent = purchase.manualMpesa.account || "—";
  if ($("manualInstructions")) $("manualInstructions").textContent = purchase.manualMpesa.instructions || "";
  $("payWithStk")?.addEventListener("click", startStkPayment);
  $("submitManualPayment")?.addEventListener("click", submitManualPayment);
  $("retryProofUpload")?.addEventListener("click", retryManualProofUpload);
  if (balance) balance.textContent = money(purchase.amount);
  if (paymentStatus) paymentStatus.textContent = "Awaiting payment";
}

async function startStkPayment() {
  if (!window.SSAOnlineActionGuard?.requireOnline("Starting an M-Pesa payment")) return;
  const phoneNumber = $("stkPhone")?.value.trim() || "";
  if (!phoneNumber) return message("Enter the M-Pesa phone number first.", true);
  setBusy("payWithStk", true, "Sending prompt…");
  try {
    const payload = purchase.purchaseType === "course"
      ? { purchaseType: "course", courseId: purchase.courseId, phoneNumber }
      : { purchaseType: "premium", plan: purchase.plan, billingPeriod: purchase.billingPeriod, phoneNumber };
    const result = await initiateStk(payload);
    message(result.data.customerMessage || "M-Pesa prompt sent. Check your phone and enter your PIN.");
    watchPayment(result.data.paymentId);
  } catch (error) {
    console.error("Student STK Push failed:", error);
    message(error.message || "The M-Pesa prompt could not be sent. You can use manual payment instead.", true);
  } finally {
    setBusy("payWithStk", false, "Send M-Pesa Prompt");
  }
}

async function submitManualPayment() {
  if (!window.SSAOnlineActionGuard?.requireOnline("Submitting manual M-Pesa payment")) return;
  const phoneNumber = $("manualPhone")?.value.trim() || "";
  const receiptCode = $("manualReceipt")?.value.trim().toUpperCase() || "";
  const file = $("manualProof")?.files?.[0];
  if (!phoneNumber || !receiptCode || !file) {
    return message("Enter the payer phone number, M-Pesa transaction code, and attach the confirmation screenshot.", true);
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
    return message("Use a JPG, PNG or WebP screenshot no larger than 5 MB.", true);
  }
  setBusy("submitManualPayment", true, "Submitting…");
  try {
    const payload = purchase.purchaseType === "course"
      ? { purchaseType: "course", courseId: purchase.courseId, phoneNumber, receiptCode }
      : { purchaseType: "premium", plan: purchase.plan, billingPeriod: purchase.billingPeriod, phoneNumber, receiptCode };
    const result = await submitManual(payload);
    pendingProofPaymentId = result.data.paymentId;
    await uploadManualProof(file);
  } catch (error) {
    console.error("Manual M-Pesa submission failed:", error);
    message(error.message || "Your payment details could not be submitted.", true);
    if (pendingProofPaymentId) $("retryProofUpload").hidden = false;
  } finally {
    setBusy("submitManualPayment", false, "Submit Receipt and Proof");
  }
}

async function uploadManualProof(file) {
  if (!currentUser || !pendingProofPaymentId || !file) return;
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = pendingProofStoragePath || `student-payment-proofs/${currentUser.uid}/${pendingProofPaymentId}/receipt.${extension}`;
  pendingProofStoragePath = path;
  try {
    if (!pendingProofUploaded) {
      await uploadBytes(storageRef(storage, path), file, {
        contentType: file.type,
        customMetadata: { paymentId: pendingProofPaymentId }
      });
      pendingProofUploaded = true;
    }
    await attachProof({ paymentId: pendingProofPaymentId, storagePath: path });
    $("retryProofUpload").hidden = true;
    $("manualProof").value = "";
    message("Your M-Pesa receipt and screenshot have been submitted. Payment status: Pending administrator verification. Access activates only after approval.");
    watchPayment(pendingProofPaymentId);
  } catch (error) {
    console.error("Manual payment proof upload failed:", error);
    $("retryProofUpload").hidden = false;
    message("Your receipt code was recorded, but the screenshot did not upload. Tap Retry Proof Upload to complete your submission.", true);
    throw error;
  }
}

async function retryManualProofUpload() {
  const file = $("manualProof")?.files?.[0];
  if (!file || !pendingProofPaymentId) {
    return message("Select the payment screenshot again, then retry.", true);
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
    return message("Use a JPG, PNG or WebP screenshot no larger than 5 MB.", true);
  }
  setBusy("retryProofUpload", true, "Uploading…");
  try {
    await uploadManualProof(file);
  } finally {
    setBusy("retryProofUpload", false, "Retry Proof Upload");
  }
}

function watchPayment(paymentId) {
  if (!paymentId) return;
  activePaymentUnsubscribe?.();
  activePaymentUnsubscribe = onSnapshot(doc(db, "payments", paymentId), snap => {
    if (!snap.exists()) return;
    const payment = snap.data();
    if (payment.status === "paid" || payment.status === "completed") {
      message("Payment verified. Your access has been activated.");
      if (purchase.purchaseType === "course") {
        const go = document.createElement("a");
        go.href = `course-player.html?id=${encodeURIComponent(purchase.courseId)}`;
        go.textContent = "Open Course";
        go.className = "pay-btn";
        $("checkoutMessage")?.append(document.createTextNode(" "), go);
      } else {
        const go = document.createElement("a");
        go.href = "premium.html";
        go.textContent = "View Premium Membership";
        go.className = "pay-btn";
        $("checkoutMessage")?.append(document.createTextNode(" "), go);
      }
    } else if (payment.status === "pending_review") {
      message("Receipt submitted. An administrator will review it. Your access remains pending until verification.");
    } else if (payment.status === "failed" || payment.status === "rejected" || payment.status === "initiation_failed") {
      message(payment.reviewNote || payment.resultDescription || "Payment was not completed. You can retry or submit manual payment.", true);
    } else if (payment.status === "verification_pending") {
      message("M-Pesa confirmed the request. The Academy is completing payment verification.");
    }
  }, error => console.warn("Payment status listener failed:", error));
}

function loadPaymentHistory(user) {
  if (!transactionList) return;
  const q = query(
    collection(db, "payments"),
    where("userId", "==", user.uid),
    orderBy("createdAt", "desc"),
    limit(25)
  );
  return onSnapshot(q, snapshot => {
    let paid = 0;
    transactionList.replaceChildren();
    if (snapshot.empty) {
      transactionList.textContent = "No transactions yet.";
      if (totalPaid) totalPaid.textContent = money(0);
      return;
    }
    snapshot.forEach(item => {
      const payment = item.data();
      if (["paid", "completed"].includes(String(payment.status || "").toLowerCase())) {
        paid += Number(payment.amount || 0);
      }
      const row = document.createElement("article");
      row.className = "transaction-card";
      const details = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = payment.course || payment.courseName || "Academy Payment";
      const method = document.createElement("p");
      method.textContent = payment.method === "mpesa_stk" ? "M-Pesa STK Push" : payment.method === "manual_mpesa" ? "Manual M-Pesa" : payment.method || "M-Pesa";
      details.append(title, method);
      const amount = document.createElement("strong");
      amount.textContent = money(payment.amount);
      const status = document.createElement("span");
      status.className = "payment-history-status";
      status.textContent = String(payment.status || "pending").replaceAll("_", " ");
      const right = document.createElement("div");
      right.append(amount, status);
      row.append(details, right);
      transactionList.append(row);
    });
    if (totalPaid) totalPaid.textContent = money(paid);
  }, error => {
    console.error("Payment history could not be loaded:", error);
    transactionList.textContent = "Payment history is temporarily unavailable.";
  });
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    location.href = "../login.html";
    return;
  }
  currentUser = user;
  try {
    if (courseList) courseList.textContent = "Loading secure payment details…";
    await loadPurchase();
    renderCheckout();
    loadPaymentHistory(user);
  } catch (error) {
    console.error("Payment checkout could not be loaded:", error);
    if (courseList) courseList.textContent = error.message || "Payment details could not be loaded.";
  }
});

window.addEventListener("beforeunload", () => activePaymentUnsubscribe?.());
