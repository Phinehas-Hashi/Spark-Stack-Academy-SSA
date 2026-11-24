// Boot the authenticated Admin shell before handling institution applications.
import "./admin-app.js";
import { db } from "../../js/firebase.js";
import { collection, getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const functions = getFunctions(getApp());
const approveApplication = httpsCallable(functions, "approveInstitutionApplication");
const rejectApplication = httpsCallable(functions, "rejectInstitutionApplication");
const retryOnboardingPayment = httpsCallable(functions, "retryInstitutionOnboardingPayment");
const list = document.getElementById("applicationsList");
const filter = document.getElementById("applicationFilter");
const message = document.getElementById("applicationMessage");
let applications = [];

function setMessage(text, kind = "") { message.textContent = text; message.className = "application-message " + kind; }
function dateText(value) {
  if (!value) return "Not recorded";
  const date = value.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}
function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function detail(parent, label, value) {
  const wrap = node("div");
  wrap.append(node("span", "", label), node("strong", "", value || "—"));
  parent.append(wrap);
}
function render() {
  const selected = filter.value;
  const rows = applications.filter(item => selected === "all" || item.status === selected);
  list.replaceChildren();
  if (!rows.length) {
    list.append(node("div", "application-empty", selected === "pending_review" ? "No institution applications are awaiting review." : "No applications found for this filter."));
    return;
  }
  rows.forEach(item => {
    const card = node("article", "application-card");
    const head = node("div", "application-card-head");
    const title = node("div");
    title.append(node("h3", "", item.institutionName || "Unnamed institution"));
    const meta = node("div", "application-meta");
    meta.append(node("span", "", item.institutionType || "Type not supplied"), node("span", "", item.country || "Country not supplied"), node("span", "", "Submitted " + dateText(item.submittedAt)));
    title.append(meta);
    const status = node("span", "application-status " + item.status, String(item.status || "unknown").replaceAll("_", " "));
    head.append(title, status);
    card.append(head);
    const details = node("div", "application-details");
    detail(details, "Primary contact", item.ownerName);
    detail(details, "Work email", item.ownerEmail);
    detail(details, "Position", item.ownerPosition);
    detail(details, "Phone", item.institutionPhone);
    if (item.onboardingFeeStatus && item.onboardingFeeStatus !== "not_required") detail(details, "Onboarding fee", item.onboardingFeeStatus.replaceAll("_", " "));
    detail(details, "Estimated learners", item.learnerRange);
    detail(details, "Website", item.website);
    card.append(details);
    if (item.rejectionReason) card.append(node("div", "application-reason", "Rejection reason: " + item.rejectionReason));
    if (["due", "failed", "initiation_failed"].includes(item.onboardingFeeStatus)) {
      const actions = node("div", "application-actions");
      const retry = node("button", "approve-button", "Resend M-Pesa payment prompt");
      retry.type = "button";
      retry.addEventListener("click", () => handleRetryPayment(item, retry));
      card.append(actions);
      actions.append(retry);
    }
    if (item.status === "pending_review") {
      const actions = node("div", "application-actions");
      const approve = node("button", "approve-button", "Approve & activate");
      approve.type = "button";
      approve.addEventListener("click", () => handleApprove(item, approve, reject));
      const reject = node("button", "reject-button", "Reject application");
      reject.type = "button";
      reject.addEventListener("click", () => handleReject(item, reject, approve));
      actions.append(approve, reject);
      card.append(actions);
    }
    list.append(card);
  });
}
async function loadApplications() {
  list.replaceChildren(node("div", "application-empty", "Loading institution applications…"));
  setMessage("");
  try {
    const snap = await getDocs(query(collection(db, "institutionApplications"), orderBy("submittedAt", "desc")));
    applications = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    document.getElementById("pendingCount").textContent = applications.filter(x => x.status === "pending_review").length;
    document.getElementById("approvedCount").textContent = applications.filter(x => ["approved", "approved_awaiting_payment"].includes(x.status)).length;
    document.getElementById("rejectedCount").textContent = applications.filter(x => x.status === "rejected").length;
    render();
    window.lucide?.createIcons();
  } catch (error) {
    console.error("Institution applications load failed:", error);
    list.replaceChildren(node("div", "application-empty", error.code === "permission-denied" ? "You do not have permission to view institution applications." : "Could not load applications. Check your connection and try again."));
  }
}
async function handleApprove(item, button, otherButton) {
  if (!window.SSAOnlineActionGuard?.requireOnline("Approving an institution")) return;
  if (!window.confirm("Approve " + item.institutionName + " using the current institution trial and onboarding fee settings? An M-Pesa payment prompt may be sent to its registered contact number.")) return;
  button.disabled = true; otherButton.disabled = true; setMessage("Approving institution…");
  try {
    const result = await approveApplication({ applicationId: item.id });
    const data = result.data || {};
    setMessage(data.payment?.success
      ? (data.activationPendingPayment
          ? "Application approved. Workspace activation is waiting for verified M-Pesa payment. STK Push sent to the registered phone."
          : "Institution approved and trial started. Onboarding fee payment prompt sent to the registered phone.")
      : (data.payment?.status === "initiation_failed"
          ? "Application approved, but M-Pesa prompt could not be sent. Use Resend M-Pesa payment prompt after checking Daraja configuration."
          : "Institution approved. Its trial has started."), data.payment?.status === "initiation_failed" ? "error" : "success");
    await loadApplications();
  } catch (error) {
    console.error("Institution approval failed:", error);
    setMessage(error.message || "Approval failed. Check application status before retrying.", "error");
    button.disabled = false; otherButton.disabled = false;
  }
}
async function handleRetryPayment(item, button) {
  if (!window.SSAOnlineActionGuard?.requireOnline("Sending an institution M-Pesa prompt")) return;
  if (!window.confirm("Send a new M-Pesa STK Push to " + (item.institutionPhone || "the registered institution phone") + "?")) return;
  button.disabled = true;
  setMessage("Sending a new M-Pesa payment prompt…");
  try {
    const result = await retryOnboardingPayment({ applicationId: item.id });
    setMessage(result.data?.customerMessage || "M-Pesa prompt sent. Ask the institution contact to complete payment on their phone.", "success");
    await loadApplications();
  } catch (error) {
    console.error("Institution onboarding payment retry failed:", error);
    setMessage(error.message || "Payment prompt could not be sent.", "error");
    button.disabled = false;
  }
}
async function handleReject(item, button, otherButton) {
  if (!window.SSAOnlineActionGuard?.requireOnline("Rejecting an institution application")) return;
  const reason = window.prompt("Enter the reason for rejecting this institution application:");
  if (reason === null) return;
  if (reason.trim().length < 5) { setMessage("Please enter a reason of at least 5 characters.", "error"); return; }
  button.disabled = true; otherButton.disabled = true; setMessage("Recording rejection…");
  try {
    await rejectApplication({ applicationId: item.id, reason: reason.trim() });
    setMessage("Application rejected and the decision recorded.", "success");
    await loadApplications();
  } catch (error) {
    console.error("Institution rejection failed:", error);
    setMessage(error.message || "Rejection failed. Check application status before retrying.", "error");
    button.disabled = false; otherButton.disabled = false;
  }
}
filter.addEventListener("change", render);
document.getElementById("refreshApplications").addEventListener("click", loadApplications);
document.addEventListener("admin:ready", loadApplications);
if (document.readyState === "complete") setTimeout(() => { if (window.AdminApp?.getCurrentUser?.()) loadApplications(); }, 0);
