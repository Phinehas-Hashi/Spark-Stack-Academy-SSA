/* ===================================
   PAYMENT INTEGRATION
   FOUNDER OS
=================================== */

import "./js/founder-app.js";

import { db, auth }

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

async function initializePayments(){

loadGatewaySettings();

listenForTransactions();

loadPaymentSettings();

attachEvents();

}


/* ===================================
   EVENTS
=================================== */

function attachEvents(){

refreshBtn?.addEventListener(

"click",

()=>{

loadGatewaySettings();

loadPaymentSettings();

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

const snapshot =
await getDocs(gatewaysRef);

snapshot.forEach((docSnap)=>{

const gateway = docSnap.data();

if(
gateway.provider ===
gatewayProvider.value
){

gatewayEnvironment.value =
gateway.environment || "sandbox";

callbackUrl.value =
gateway.callbackUrl || "";

webhookUrl.value =
gateway.webhookUrl || "";

gatewayStatus.textContent =
gateway.enabled ?
"🟢 Connected" :
"🔴 Disabled";

lastGatewaySync.textContent =
gateway.lastSync ?
formatDate(
gateway.lastSync.toDate()
)
:
"Never";

}

});

}

catch(error){

console.error(
"Gateway Load Error:",
error
);

}

}


/* ===================================
   SAVE GATEWAY
=================================== */

document

.getElementById("saveGateway")

?.addEventListener(

"click",

saveGatewayConfiguration

);

async function saveGatewayConfiguration(){

try{

const gatewayDoc =
doc(
db,
"payment_gateways",
gatewayProvider.value
);

await setDoc(

gatewayDoc,

{

provider:
gatewayProvider.value,

environment:
gatewayEnvironment.value,

callbackUrl:
callbackUrl.value.trim(),

webhookUrl:
webhookUrl.value.trim(),

enabled:true,

lastSync:new Date()

},

{merge:true}

);

gatewayStatus.textContent =
"🟢 Connected";

lastGatewaySync.textContent =
formatDate(new Date());

alert(
"Gateway configuration saved."
);

}

catch(error){

console.error(error);

alert(
"Unable to save gateway."
);

}

}


/* ===================================
   PROVIDER TOGGLES
=================================== */

const providerButtons=[

"Mpesa",
"Cards",
"Bank",
"Paypal"

];

providerButtons.forEach((name)=>{

const button =
document.getElementById(
`toggle${name}`
);

button?.addEventListener(

"click",

async()=>{

const enabled =
!button.classList.contains("active");

button.classList.toggle(
"active",
enabled
);

button.textContent =
enabled ? "ON" : "OFF";

try{

await setDoc(

doc(
db,
"payment_gateways",
name.toLowerCase()
),

{

enabled

},

{merge:true}

);

}

catch(error){

console.error(error);

}

}

);

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

function renderTransactions(data){

transactionTable.innerHTML = "";

if(data.length===0){

transactionTable.innerHTML = `

<tr>

<td colspan="10"
class="empty-table">

No transactions found.

</td>

</tr>

`;

return;

}

data.forEach((payment)=>{

const row = document.createElement("tr");

row.innerHTML = `

<td>${payment.receiptNumber || "-"}</td>

<td>${payment.studentName || "-"}</td>

<td>${payment.admissionNumber || "-"}</td>

<td>${payment.paymentType || "-"}</td>

<td>${payment.method || "-"}</td>

<td>KES ${Number(payment.amount || 0).toLocaleString()}</td>

<td>${payment.transactionId || "-"}</td>

<td>

<span class="status ${payment.status}">

${payment.status}

</span>

</td>

<td>

${payment.createdAt

?

formatDate(

payment.createdAt.toDate()

)

:

"-"

}

</td>

<td>

<div class="table-actions">

<button
class="table-action"

onclick="previewReceipt('${payment.id}')">

View

</button>

</div>

</td>

`;

transactionTable.appendChild(row);

});

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

if(payment.status==="pending"){

pending++;

}

if(payment.status==="completed"){

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

(payment.receiptNumber || "")

.toLowerCase()

.includes(keyword)

||

(payment.transactionId || "")

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
payment.receiptNumber || "-";

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
payment.transactionId || "-";

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

initPayments();
