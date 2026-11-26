/* ===================================
   PAYMENT INTEGRATION
   FOUNDER OS
=================================== */

import "./js/founder-app.js";

import { app, db, auth, storage }

from "../js/firebase.js";

import {

collection,
doc,
getDoc,
getDocs,
query,
orderBy,
limit,
onSnapshot,
setDoc

} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const paymentFunctions = getFunctions(app, "us-central1");
import { getDownloadURL, ref as storageRef } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
const reviewManualPayment = httpsCallable(paymentFunctions, "reviewStudentManualPayment");
const getManualSettings = httpsCallable(paymentFunctions, "getManualMpesaSettings");
const saveManualSettings = httpsCallable(paymentFunctions, "saveManualMpesaSettings");
const getGatewaySettings = httpsCallable(paymentFunctions, "getFounderPaymentGatewaySettings");
const saveGatewaySettings = httpsCallable(paymentFunctions, "saveFounderPaymentGatewaySettings");


import {

onAuthStateChanged

} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


/* ===================================
   AUTH GUARD
=================================== */

onAuthStateChanged(

auth,

(user)=>{

if(!user){

window.location.href="../login.html";

return;

}

initializePayments();

}

);


/* ===================================
   DOM ELEMENTS
=================================== */

const refreshBtn =
document.getElementById("refreshPayments");

const transactionTable =
document.getElementById("transactionsTable");

const transactionSearch =
document.getElementById("transactionSearch");

const transactionFilter =
document.getElementById("transactionFilter");

const receiptPreview =
document.getElementById("receiptPreview");

const gatewayProvider =
document.getElementById("gatewayProvider");

const gatewayEnvironment =
document.getElementById("gatewayEnvironment");

const callbackUrl =
document.getElementById("callbackUrl");

const webhookUrl =
document.getElementById("webhookUrl");

const gatewayStatus =
document.getElementById("gatewayStatus");

const lastGatewaySync =
document.getElementById("lastGatewaySync");

const paymentsToday =
document.getElementById("paymentsToday");

const pendingPaymentsCount =
document.getElementById("pendingPaymentsCount");

const successfulPaymentsCount =
document.getElementById("successfulPaymentsCount");

const lastBackup =
document.getElementById("lastBackup");


/* ===================================
   COLLECTIONS
=================================== */

const transactionsRef =
collection(db,"payments");

const gatewaysRef =
collection(db,"payment_gateways");

const settingsRef =
doc(db,"system","payment_settings");


/* ===================================
   INITIALIZER
=================================== */

async function initializePayments() {
  await Promise.allSettled([loadGatewaySettings(), loadManualMpesaSettings()]);
  listenForTransactions();
  attachEvents();
}

async function loadManualMpesaSettings() {
  const status = document.getElementById("manualMpesaSettingsStatus");
  try {
    const result = await getManualSettings();
    const data = result.data || {};
    const fields = {
      manualMpesaEnabled: data.enabled === true,
      manualMpesaMethod: data.method || "paybill",
      manualMpesaBusinessName: data.businessName || "",
      manualMpesaNumber: data.number || "",
      manualMpesaAccount: data.account || "",
      manualMpesaInstructions: data.instructions || ""
    };
    for (const [id, value] of Object.entries(fields)) {
      const node = document.getElementById(id);
      if (!node) continue;
      if (node.type === "checkbox") node.checked = value;
      else node.value = value;
    }
    if (status) status.textContent = data.enabled ? "Manual M-Pesa is enabled." : "Manual M-Pesa is currently disabled.";
  } catch (error) {
    console.error("Manual M-Pesa settings load failed:", error);
    if (status) status.textContent = "Could not load manual M-Pesa settings. Check Founder access.";
  }
}

async function saveManualMpesaSettings() {
  const button = document.getElementById("saveManualMpesaSettings");
  const status = document.getElementById("manualMpesaSettingsStatus");
  if (!button) return;
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    await saveManualSettings({
      enabled: document.getElementById("manualMpesaEnabled")?.checked === true,
      method: document.getElementById("manualMpesaMethod")?.value || "paybill",
      businessName: document.getElementById("manualMpesaBusinessName")?.value.trim() || "",
      number: document.getElementById("manualMpesaNumber")?.value.trim() || "",
      account: document.getElementById("manualMpesaAccount")?.value.trim() || "",
      instructions: document.getElementById("manualMpesaInstructions")?.value.trim() || ""
    });
    if (status) status.textContent = "Manual M-Pesa instructions saved.";
    showToast("Manual M-Pesa instructions saved.", "success");
  } catch (error) {
    console.error("Manual M-Pesa settings save failed:", error);
    if (status) status.textContent = error.message || "Could not save manual M-Pesa settings.";
  } finally {
    button.disabled = false;
    button.textContent = "Save Manual M-Pesa Instructions";
  }
}


/* ===================================
   EVENTS
=================================== */

function attachEvents(){
  document.getElementById("saveManualMpesaSettings")?.addEventListener("click", saveManualMpesaSettings);

refreshBtn?.addEventListener(

"click",

()=>{

loadGatewaySettings();

loadManualMpesaSettings();

listenForTransactions();

}

);

}


/* ===================================
   DATE FORMATTER
=================================== */

function formatDate(date){

return new Intl.DateTimeFormat(

"en-KE",

{

dateStyle:"medium",

timeStyle:"short"

}

).format(date);

}
/* ===================================
   GATEWAY SETTINGS
=================================== */

async function loadGatewaySettings(){
 try{
  const result=await getGatewaySettings();
  const gateways=result.data?.gateways||[];
  const gateway=gateways.find(item=>item.provider===gatewayProvider.value);
  gatewayEnvironment.value=gateway?.environment||"sandbox";
  callbackUrl.value=gateway?.callbackUrl||"";
  webhookUrl.value=gateway?.webhookUrl||"";
  gatewayStatus.textContent=gateway?.enabled?"Configured":"Disabled";
  lastGatewaySync.textContent=gateway?.lastSync?.toDate?formatDate(gateway.lastSync.toDate()):"Never";
 }catch(error){console.error("Gateway settings load failed:",error);gatewayStatus.textContent="Unavailable — Founder access required";}
}

/* ===================================
   SAVE GATEWAY
=================================== */
document.getElementById("saveGateway")?.addEventListener("click",saveGatewayConfiguration);
async function saveGatewayConfiguration(){
 const button=document.getElementById("saveGateway");if(button)button.disabled=true;
 try{
  const result=await saveGatewaySettings({provider:gatewayProvider.value,environment:gatewayEnvironment.value,callbackUrl:callbackUrl.value.trim(),webhookUrl:webhookUrl.value.trim(),enabled:true});
  gatewayStatus.textContent=result.data?.enabled?"Configured":"Disabled";lastGatewaySync.textContent=formatDate(new Date());
  showToast("Gateway configuration saved and audit-logged. Live checkout activation remains separate.","success");
 }catch(error){console.error(error);showToast(error.message||"Unable to save gateway.","error");}
 finally{if(button)button.disabled=false;}
}
const providerButtons=["Mpesa","Cards","Bank","Paypal"];
providerButtons.forEach(name=>{
 const button=document.getElementById("toggle"+name);
 button?.addEventListener("click",async()=>{
  const enabled=!button.classList.contains("active");button.disabled=true;
  try{
   await saveGatewaySettings({provider:name.toLowerCase(),enabled,environment:gatewayEnvironment.value,callbackUrl:callbackUrl.value.trim(),webhookUrl:webhookUrl.value.trim()});
   button.classList.toggle("active",enabled);button.textContent=enabled?"ON":"OFF";
   showToast(enabled?"Provider configuration enabled. Checkout remains separate.":"Provider configuration disabled.","success");
  }catch(error){showToast(error.message||"Provider setting could not be saved.","error");}
  finally{button.disabled=false;}
 });
});

/* ===================================
   TEST CONNECTION
=================================== */

document

.getElementById("testGateway")

?.addEventListener(

"click",

()=>{

alert(
"Backend gateway test endpoint will be connected during deployment."
);

});

/* ===================================
   REAL-TIME TRANSACTIONS
=================================== */

let allTransactions = [];

function listenForTransactions(){

const paymentsQuery = query(

transactionsRef,
orderBy("createdAt","desc"),
limit(500)

);

onSnapshot(

paymentsQuery,

(snapshot)=>{

allTransactions = [];

snapshot.forEach((doc)=>{

allTransactions.push({

id:doc.id,

...doc.data()

});

});

renderTransactions(allTransactions);

updatePaymentStats(allTransactions);

},

(error)=>{

console.error(

"Transaction Listener Error:",

error

);

});

}


/* ===================================
   RENDER TRANSACTIONS
=================================== */

function renderTransactions(data) {
  transactionTable.innerHTML = "";
  if (!data.length) {
    transactionTable.innerHTML = '<tr><td colspan="10" class="empty-table">No transactions found.</td></tr>';
    return;
  }

  data.forEach(payment => {
    const row = document.createElement("tr");
    const created = payment.createdAt?.toDate ? formatDate(payment.createdAt.toDate()) : "-";
    const safe = value => String(value ?? "-").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
    const needsReview = payment.method === "manual_mpesa" && payment.status === "pending_review";
    row.innerHTML = `
      <td>${safe(payment.receiptNumber || payment.manualReceiptCode || "-")}</td>
      <td>${safe(payment.studentName || payment.studentEmail || "-")}</td>
      <td>${safe(payment.admissionNumber || "-")}</td>
      <td>${safe(payment.paymentType || payment.purchaseType || "-")}</td>
      <td>${safe(payment.method || "-")}</td>
      <td>KES ${Number(payment.amount || 0).toLocaleString()}</td>
      <td>${safe(payment.transactionId || payment.mpesaReceiptNumber || "-")}</td>
      <td><span class="status ${safe(payment.status)}">${safe(payment.status)}</span></td>
      <td>${safe(created)}</td>
      <td><div class="table-actions">
        <button class="table-action" type="button" data-preview-payment="${safe(payment.id)}">View</button>
        ${payment.proofStoragePath ? `<button class="table-action" type="button" data-proof-path="${safe(payment.proofStoragePath)}">Proof</button>` : ""}
        ${needsReview ? `
          <button class="table-action" type="button" data-review-payment="${safe(payment.id)}" data-decision="approve">Approve</button>
          <button class="table-action" type="button" data-review-payment="${safe(payment.id)}" data-decision="reject">Reject</button>
        ` : ""}
      </div></td>`;
    transactionTable.appendChild(row);
  });

  transactionTable.querySelectorAll("[data-preview-payment]").forEach(button => {
    button.addEventListener("click", () => previewReceipt(button.dataset.previewPayment));
  });
  transactionTable.querySelectorAll("[data-proof-path]").forEach(button => {
    button.addEventListener("click", () => openManualPaymentProof(button.dataset.proofPath, button));
  });
  transactionTable.querySelectorAll("[data-review-payment]").forEach(button => {
    button.addEventListener("click", () => reviewManualStudentPayment(button.dataset.reviewPayment, button.dataset.decision, button));
  });
}

async function openManualPaymentProof(path, button) {
  if (!path || !path.startsWith("student-payment-proofs/")) return;
  button.disabled = true;
  try {
    const url = await getDownloadURL(storageRef(storage, path));
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (error) {
    console.error("Manual payment proof could not be opened:", error);
    window.ssaToast?.("Payment proof could not be opened.", "error", "Payment Review");
  } finally {
    button.disabled = false;
  }
}

async function reviewManualStudentPayment(paymentId, decision, button) {
  if (!paymentId || !["approve", "reject"].includes(decision)) return;
  const promptText = decision === "approve"
    ? "Optional review note (confirm the receipt against the M-Pesa statement before approving):"
    : "Reason for rejecting this M-Pesa receipt:";
  const note = window.prompt(promptText, "");
  if (note === null) return;
  if (decision === "reject" && !note.trim()) {
    window.ssaToast?.("Add a reason before rejecting a payment.", "error", "Payment Review");
    return;
  }
  button.disabled = true;
  try {
    await reviewManualPayment({ paymentId, decision, note: note.trim() });
    window.ssaToast?.(decision === "approve" ? "Payment verified and access activated." : "Payment rejected.", "success", "Payment Review");
  } catch (error) {
    console.error("Manual student payment review failed:", error);
    window.ssaToast?.(error.message || "Payment review failed.", "error", "Payment Review");
    button.disabled = false;
  }
}

/* ===================================
   PAYMENT KPIs
=================================== */

function updatePaymentStats(payments){

const today = new Date();

today.setHours(0,0,0,0);

let todayCount = 0;

let pending = 0;

let successful = 0;

payments.forEach((payment)=>{

if(

payment.createdAt &&

payment.createdAt.toDate() >= today

){

todayCount++;

}

if(["pending","pending_review","verification_pending"].includes(payment.status)){

pending++;

}

if(["completed","paid"].includes(payment.status)){

successful++;

}

});

paymentsToday.textContent =
todayCount;

pendingPaymentsCount.textContent =
pending;

successfulPaymentsCount.textContent =
successful;

}


/* ===================================
   SEARCH
=================================== */

transactionSearch?.addEventListener(

"input",

filterTransactions

);


/* ===================================
   FILTER
=================================== */

transactionFilter?.addEventListener(

"change",

filterTransactions

);

function filterTransactions(){

const keyword =

transactionSearch.value

.toLowerCase()

.trim();

const status =

transactionFilter.value;

const filtered =

allTransactions.filter((payment)=>{

const matchesSearch =

(payment.studentName || "")

.toLowerCase()

.includes(keyword)

||

(payment.receiptNumber || payment.manualReceiptCode || "")

.toLowerCase()

.includes(keyword)

||

(payment.transactionId || payment.mpesaReceiptNumber || "" )

.toLowerCase()

.includes(keyword);

const matchesStatus =

status==="all"

||

payment.status===status;

return matchesSearch && matchesStatus;

});

renderTransactions(filtered);

}
/* ===================================
   RECEIPT ENGINE
=================================== */

window.previewReceipt = previewReceipt;

async function previewReceipt(paymentId){

try{

const paymentDoc =
await getDoc(

doc(db,"payments",paymentId)

);

if(!paymentDoc.exists()) return;

const payment =
paymentDoc.data();

document.getElementById("receiptNumber").textContent =
payment.receiptNumber || payment.manualReceiptCode || "-";

document.getElementById("receiptDate").textContent =
payment.createdAt
? formatDate(payment.createdAt.toDate())
: "-";

document.getElementById("receiptStudent").textContent =
payment.studentName || "-";

document.getElementById("receiptAdmission").textContent =
payment.admissionNumber || "-";

document.getElementById("receiptType").textContent =
payment.paymentType || "-";

document.getElementById("receiptMethod").textContent =
payment.method || "-";

document.getElementById("receiptTransaction").textContent =
payment.transactionId || payment.mpesaReceiptNumber || payment.manualReceiptCode || "-";

document.getElementById("receiptAmount").textContent =
`KES ${Number(payment.amount || 0).toLocaleString()}`;

receiptPreview.scrollIntoView({

behavior:"smooth",

block:"start"

});

}

catch(error){

console.error(error);

alert("Unable to load receipt.");

}

}


/* ===================================
   PRINT RECEIPT
=================================== */

document

.getElementById("printReceipt")

?.addEventListener(

"click",

()=>{

const printWindow =
window.open("","PRINT");

printWindow.document.write(`

<html>

<head>

<title>

Official Receipt

</title>

<link rel="stylesheet"

href="payments.css">

</head>

<body>

${receiptPreview.outerHTML}

</body>

</html>

`);

printWindow.document.close();

printWindow.focus();

printWindow.print();

printWindow.close();

}

);


/* ===================================
   GENERATE RECEIPT
=================================== */

document

.getElementById("generateReceipt")

?.addEventListener(

"click",

()=>{

alert(

"Select a payment from the transaction ledger to generate its official receipt."

);

});
/* ===================================
   STABLE PAYMENT ACTIONS
=================================== */

document.getElementById("refreshPayments")?.addEventListener("click", () => {
    loadGatewaySettings();
    listenForTransactions();
    showToast("Payments refreshed successfully.", "success");
});

document.getElementById("exportTransactions")?.addEventListener("click", exportTransactions);

function exportTransactions() {
    try {
        const rows = [
            ["Receipt","Student","Admission","Method","Amount","Status","Date"],
            ...allTransactions.map(payment => [
                payment.receiptNumber || "",
                payment.studentName || "",
                payment.admissionNumber || "",
                payment.method || "",
                payment.amount ?? "",
                payment.status || "",
                payment.createdAt?.toDate ? formatDate(payment.createdAt.toDate()) : ""
            ])
        ];
        const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "academy-payments.csv";
        link.click();
        URL.revokeObjectURL(url);
        showToast("CSV exported.", "success");
    } catch (error) {
        console.error("Payment export failed:", error);
        showToast("Export failed.", "error");
    }
}

document.getElementById("testGateway")?.addEventListener("click", () => {
    alert("Gateway connectivity is controlled by the unified SSA payment service. Browser-side gateway secrets are never used here.");
});

document.getElementById("generateReceipt")?.addEventListener("click", () => {
    alert("Select a transaction from the ledger to preview its receipt.");
});

function showToast(message, type="success") {
    console.log(`[SSA Payments:${type}] ${message}`);
}

