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
const search = document.getElementById("applicationSearch");
const message = document.getElementById("applicationMessage");
let applications = [];

function setMessage(text, kind = "") {
  message.textContent = text;
  message.className = "application-message" + (kind ? " " + kind : "");
}
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
  const wrap = node("div", "application-detail");
  wrap.append(node("span", "detail-label", label), node("strong", "detail-value", value || "—"));
  parent.append(wrap);
}
function render() {
  const selected = filter.value;
  const term = (search?.value || "").trim().toLocaleLowerCase();
  const rows = applications.filter(item => {
    const statusMatch = selected === "all" || item.status === selected;
    const searchable = [item.institutionName, item.institutionType, item.country, item.ownerName, item.ownerEmail, item.ownerPosition, item.institutionPhone, item.website]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    return statusMatch && (!term || searchable.includes(term));
  });
  list.replaceChildren();
  if (!rows.length) {
    const empty = node("div", "application-empty");
    const icon = node("span", "empty-icon");
    const iconEl = document.createElement("i");
    iconEl.setAttribute("data-lucide", term ? "search-x" : "inbox");
    icon.append(iconEl);
    empty.append(icon, node("strong", "", term ? "No matching applications" : selected === "pending_review" ? "No applications awaiting review" : "No applications in this view"));
    empty.append(node("span", "", term ? "Try another institution name, contact or email address." : "New institution submissions will appear here."));
    list.append(empty);
    window.lucide?.createIcons();
    return;
  }
  rows.forEach(item => {
    const card = node("article", "application-card");
    const head = node("div", "application-card-head");
    const identity = node("div", "application-identity");
    const monogram = node("span", "institution-monogram", (item.institutionName || "I").trim().slice(0, 1).toUpperCase());
    const title = node("div", "application-title");
    title.append(node("h3", "", item.institutionName || "Unnamed institution"));
    const meta = node("div", "application-meta");
    meta.append(node("span", "meta-type", item.institutionType || "Type not supplied"));
    meta.append(node("span", "meta-separator", "•"));
    meta.append(node("span", "", item.country || "Country not supplied"));
    meta.append(node("span", "meta-separator", "•"));
    meta.append(node("span", "", "Submitted " + dateText(item.submittedAt)));
    title.append(meta);
    identity.append(monogram, title);
    const statusValue = String(item.status || "unknown");
    const status = node("span", "application-status " + statusValue.replace(/[^a-z_]/g, ""), statusValue.replaceAll("_", " "));
    head.append(identity, status);
    card.append(head);

    const details = node("div", "application-details");
    detail(details, "Primary contact", item.ownerName);
    detail(details, "Work email", item.ownerEmail);
    detail(details, "Position", item.ownerPosition);
    detail(details, "Phone number", item.institutionPhone);
    detail(details, "Estimated learners", item.learnerRange);
    detail(details, "Website", item.website);
    if (item.onboardingFeeStatus && item.onboardingFeeStatus !== "not_required") {
      detail(details, "Onboarding fee", item.onboardingFeeStatus.replaceAll("_", " "));
    }
    card.append(details);
    if (item.rejectionReason) {
      const reason = node("div", "application-reason");
      reason.append(node("strong", "", "Decision note"), node("span", "", item.rejectionReason));
      card.append(reason);
    }

    const actions = node("div", "application-actions");
    if (["due", "failed", "initiation_failed"].includes(item.onboardingFeeStatus)) {
      const retry = node("button", "retry-button", "Resend M-Pesa prompt");
      retry.type = "button";
      const retryIcon = document.createElement("i");
      retryIcon.setAttribute("data-lucide", "send");
      retry.prepend(retryIcon);
      retry.addEventListener("click", () => handleRetryPayment(item, retry));
      actions.append(retry);
    }
    if (item.status === "pending_review") {
      const approve = node("button", "approve-button", "Approve institution");
      approve.type = "button";
      const approveIcon = document.createElement("i");
      approveIcon.setAttribute("data-lucide", "check");
      approve.prepend(approveIcon);
      approve.addEventListener("click", () => handleApprove(item, approve, reject));
      const reject = node("button", "reject-button", "Decline");
      reject.type = "button";
      const rejectIcon = document.createElement("i");
      rejectIcon.setAttribute("data-lucide", "x");
      reject.prepend(rejectIcon);
      reject.addEventListener("click", () => handleReject(item, reject, approve));
      actions.append(approve, reject);
    }
    if (actions.childElementCount) card.append(actions);
    list.append(card);
  });
  window.lucide?.createIcons();
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
    const text = error.code === "permission-denied"
      ? "You do not have permission to view institution applications."
      : "Could not load applications. Check your connection and try again.";
    list.replaceChildren(node("div", "application-empty", text));
  }
}
async function handleApprove(item, button, otherButton) {
  if (!window.SSAOnlineActionGuard?.requireOnline("Approving an institution")) return;
  if (!window.confirm("Approve " + item.institutionName + " using the current institution trial and onboarding fee settings? An M-Pesa payment prompt may be sent to its registered contact number.")) return;
  button.disabled = true;
  otherButton.disabled = true;
  setMessage("Approving institution…");
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
    button.disabled = false;
    otherButton.disabled = false;
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
  if (reason.trim().length < 5) {
    setMessage("Please enter a reason of at least 5 characters.", "error");
    return;
  }
  button.disabled = true;
  otherButton.disabled = true;
  setMessage("Recording rejection…");
  try {
    await rejectApplication({ applicationId: item.id, reason: reason.trim() });
    setMessage("Application rejected and the decision recorded.", "success");
    await loadApplications();
  } catch (error) {
    console.error("Institution rejection failed:", error);
    setMessage(error.message || "Rejection failed. Check application status before retrying.", "error");
    button.disabled = false;
    otherButton.disabled = false;
  }
}
filter.addEventListener("change", render);
search?.addEventListener("input", render);
document.getElementById("refreshApplications").addEventListener("click", loadApplications);
document.addEventListener("admin:ready", loadApplications);
if (document.readyState === "complete") {
  setTimeout(() => {
    if (window.AdminApp?.getCurrentUser?.()) loadApplications();
  }, 0);
}