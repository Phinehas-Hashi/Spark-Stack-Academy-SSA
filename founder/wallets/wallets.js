
/* ===================================
   FOUNDER OS
   ACADEMY WALLET ENGINE
   PART 1/6

   CORE SETUP
=================================== */


/* ===================================
   FIREBASE IMPORTS
=================================== */

import { auth, db } 
from "../../js/firebase.js";


import {

onAuthStateChanged

} 
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


import {

collection,
doc,
getDoc,
getDocs,
setDoc,
updateDoc,
addDoc,
query,
where,
orderBy,
serverTimestamp,
onSnapshot

}
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";





/* ===================================
   GLOBAL STATE
=================================== */


let currentUser = null;

let currentRole = null;

let selectedWallet = null;

let walletCache = [];

let transactionCache = [];





/* ===================================
   DOM REFERENCES
=================================== */


const treasuryBalance =
document.getElementById(
"treasuryBalance"
);


const founderBalance =
document.getElementById(
"founderBalance"
);


const instructorBalance =
document.getElementById(
"instructorBalance"
);


const transferCount =
document.getElementById(
"transferCount"
);


const walletTable =
document.getElementById(
"walletTable"
);


const transactionHistoryTable =
document.getElementById(
"transactionHistoryTable"
);


const auditTable =
document.getElementById(
"auditTable"
);


const walletModal =
document.getElementById(
"walletModal"
);





/* ===================================
   TOAST SYSTEM
=================================== */


function showToast(
message,
type="success"
){

const toast =
document.createElement(
"div"
);


toast.className =
`toast ${type}`;


toast.textContent =
message;


document.body.appendChild(
toast
);


setTimeout(()=>{

toast.classList.add(
"show"
);

},50);



setTimeout(()=>{

toast.remove();

},3500);


}





/* ===================================
   CURRENCY FORMATTER
=================================== */


function formatMoney(
amount=0
){

return (

"KES " +

Number(amount)
.toLocaleString(
"en-KE",
{
minimumFractionDigits:2
}

)

);

}





/* ===================================
   DATE FORMATTER
=================================== */


function formatDate(
timestamp
){

if(!timestamp)
return "-";


return timestamp
.toDate()
.toLocaleString(
"en-KE"
);


}





/* ===================================
   AUTHENTICATION GUARD
=================================== */


onAuthStateChanged(
auth,
async(user)=>{


if(!user){

window.location.href =
"../../login.html";

return;

}



currentUser = user;



await verifyFounderAccess(
user.uid
);



}
);







/* ===================================
   VERIFY FOUNDER ACCESS
=================================== */


async function verifyFounderAccess(
uid
){


try{


const userRef =
doc(
db,
"users",
uid
);


const userSnap =
await getDoc(
userRef
);



if(!userSnap.exists()){

showToast(
"Account profile missing",
"error"
);

return;

}



const userData =
userSnap.data();



currentRole =
userData.role;



if(

currentRole !==
"founder"

&&

currentRole !==
"super_admin"

){

showToast(
"Unauthorized wallet access",
"error"
);


setTimeout(()=>{

window.location.href =
"../dashboard.html";

},2000);


return;

}



console.log(
"Wallet access granted:",
currentRole
);






}

catch(error){

console.error(error);


showToast(
"Security verification failed",
"error"
);


}



}





/* ===================================
   INITIALIZATION PLACEHOLDER
=================================== */


function initializeWalletSystem(){


console.log(
"💰 Wallet System Initializing..."
);


// Parts 2-6 will connect here


}

/* ===================================
   TREASURY ENGINE
   PART 2/6
=================================== */


/* ===================================
   LOAD TREASURY DATA
=================================== */


async function loadTreasury(){


try{


const treasuryRef =
doc(
db,
"finance",
"treasury"
);



const treasurySnap =
await getDoc(
treasuryRef
);



if(!treasurySnap.exists()){


await createTreasury();


return;


}



const treasury =
treasurySnap.data();



updateTreasuryUI(
treasury
);



}


catch(error){


console.error(
" Treasury error:",
error
);


showToast(
"Unable to load treasury",
"error"
);


}



}





/* ===================================
   CREATE DEFAULT TREASURY
=================================== */


async function createTreasury(){


await setDoc(

doc(
db,
"finance",
"treasury"
),

{

balance:0,

reservedFunds:0,

monthlyRevenue:0,

createdAt:
serverTimestamp(),

updatedAt:
serverTimestamp()

}

);


showToast(
"Treasury created"
);


}





/* ===================================
   UPDATE TREASURY UI
=================================== */


function updateTreasuryUI(
data
){


const balance =
data.balance || 0;


const reserved =
data.reservedFunds || 0;


const revenue =
data.monthlyRevenue || 0;



if(treasuryBalance)

treasuryBalance.textContent =
formatMoney(
balance
);



const treasuryAvailable =
document.getElementById(
"treasuryAvailable"
);



if(treasuryAvailable)

treasuryAvailable.textContent =
formatMoney(
balance
);



const reservedElement =
document.getElementById(
"reservedFunds"
);



if(reservedElement)

reservedElement.textContent =
formatMoney(
reserved
);



const revenueElement =
document.getElementById(
"monthlyRevenue"
);



if(revenueElement)

revenueElement.textContent =
formatMoney(
revenue
);



}





/* ===================================
   REALTIME TREASURY LISTENER
=================================== */


function watchTreasury(){


const treasuryRef =
doc(
db,
"finance",
"treasury"
);



onSnapshot(

treasuryRef,

(snapshot)=>{


if(snapshot.exists()){


updateTreasuryUI(
snapshot.data()
);


}



}

);


}





/* ===================================
   CALCULATE REVENUE
=================================== */


async function calculateRevenue(){


try{


const paymentsRef =
collection(
db,
"payments"
);



const snapshot =
await getDocs(
paymentsRef
);



let total = 0;



snapshot.forEach(
(doc)=>{


const payment =
doc.data();



if(
payment.status ===
"completed"
){

total +=
Number(
payment.amount || 0
);

}


}

);



await updateDoc(

doc(
db,
"finance",
"treasury"
),

{

monthlyRevenue:
total,

updatedAt:
serverTimestamp()

}

);



}


catch(error){


console.error(
error
);


}



}





/* ===================================
   CASH FLOW SUMMARY
=================================== */


async function calculateCashFlow(){


const transactions =
collection(
db,
"financeTransactions"
);



const snapshot =
await getDocs(
transactions
);



let moneyIn = 0;

let moneyOut = 0;



snapshot.forEach(
(item)=>{


const data =
item.data();



if(
data.type ===
"credit"
){

moneyIn +=
Number(
data.amount || 0
);


}


if(
data.type ===
"debit"
){

moneyOut +=
Number(
data.amount || 0
);


}



}

);



const net =
moneyIn -
moneyOut;



document.getElementById(
"moneyIn"
).textContent =
formatMoney(
moneyIn
);



document.getElementById(
"moneyOut"
).textContent =
formatMoney(
moneyOut
);



document.getElementById(
"netBalance"
).textContent =
formatMoney(
net
);



}





/* ===================================
   INITIALIZE TREASURY
=================================== */


async function initializeTreasury(){


await loadTreasury();


watchTreasury();


await calculateRevenue();


await calculateCashFlow();



}

/* ===================================
   INSTRUCTOR WALLET SYSTEM
   PART 3/6
=================================== */



/* ===================================
   LOAD INSTRUCTOR WALLETS
=================================== */


async function loadInstructorWallets(){


try{


const walletsRef =
collection(
db,
"instructorWallets"
);


const snapshot =
await getDocs(
walletsRef
);



walletCache = [];


snapshot.forEach(
(item)=>{


walletCache.push({

id:item.id,

...item.data()

});


});



renderInstructorWallets();



calculateInstructorBalance();



}


catch(error){


console.error(
"Wallet loading error:",
error
);


showToast(
"Unable to load instructor wallets",
"error"
);


}



}





/* ===================================
   RENDER WALLET TABLE
=================================== */


function renderInstructorWallets(){


if(!walletTable)
return;



if(walletCache.length === 0){


walletTable.innerHTML = `

<tr>

<td colspan="8"
class="empty-table">

No instructor wallets found.

</td>

</tr>

`;


return;


}



walletTable.innerHTML = "";


walletCache.forEach(
(wallet)=>{


walletTable.innerHTML += `

<tr>


<td>

${wallet.name || "Unknown"}

</td>


<td>

${wallet.instructorId || "-"}

</td>


<td>

${wallet.walletId || wallet.id}

</td>


<td>

${formatMoney(wallet.balance)}

</td>


<td>

${formatMoney(wallet.pending || 0)}

</td>


<td>

${formatMoney(wallet.totalPaid || 0)}

</td>


<td>

<span class="status ${wallet.status}">

${wallet.status || "active"}

</span>

</td>


<td>


<button

class="secondary-btn"

onclick="openWalletManager('${wallet.id}')">

Manage

</button>


</td>


</tr>

`;

});


}





/* ===================================
   CALCULATE INSTRUCTOR TOTAL
=================================== */


function calculateInstructorBalance(){


let total = 0;


walletCache.forEach(
(wallet)=>{


total +=
Number(
wallet.balance || 0
);


});


if(instructorBalance)

instructorBalance.textContent =
formatMoney(
total
);



const instructorWalletTotal =
document.getElementById(
"instructorWalletTotal"
);


if(instructorWalletTotal)

instructorWalletTotal.textContent =
formatMoney(
total
);



}





/* ===================================
   CREATE INSTRUCTOR WALLET
=================================== */


async function createInstructorWallet(
instructor
){


const walletId =
`WAL-${Date.now()}`;



await setDoc(

doc(
db,
"instructorWallets",
instructor.uid
),

{

name:
instructor.name,

instructorId:
instructor.uid,

walletId,

balance:0,

pending:0,

totalPaid:0,

status:"active",

createdAt:
serverTimestamp()

}

);



showToast(
"Instructor wallet created"
);



}





/* ===================================
   CREDIT WALLET
=================================== */


async function creditWallet(
walletId,
amount,
reason
){


const walletRef =
doc(
db,
"instructorWallets",
walletId
);



const walletSnap =
await getDoc(
walletRef
);



if(!walletSnap.exists())
return;



const wallet =
walletSnap.data();



const newBalance =
Number(wallet.balance || 0)
+
Number(amount);



await updateDoc(

walletRef,

{

balance:newBalance,

updatedAt:
serverTimestamp()

}

);



await recordWalletAction({

type:"credit",

walletId,

amount,

reason

});



showToast(
"Wallet credited"
);



}





/* ===================================
   DEBIT WALLET
=================================== */


async function debitWallet(
walletId,
amount,
reason
){


const walletRef =
doc(
db,
"instructorWallets",
walletId
);



const walletSnap =
await getDoc(
walletRef
);



if(!walletSnap.exists())
return;



const wallet =
walletSnap.data();



if(
Number(wallet.balance)
<
Number(amount)
){


showToast(
"Insufficient balance",
"error"
);


return;

}



await updateDoc(

walletRef,

{

balance:

Number(wallet.balance)
-
Number(amount),

totalPaid:

Number(wallet.totalPaid || 0)
+
Number(amount),

updatedAt:
serverTimestamp()

}

);



await recordWalletAction({

type:"debit",

walletId,

amount,

reason

});



showToast(
"Payment completed"
);



}





/* ===================================
   FREEZE WALLET
=================================== */


async function freezeWallet(
walletId
){


await updateDoc(

doc(
db,
"instructorWallets",
walletId
),

{

status:"frozen",

updatedAt:
serverTimestamp()

}

);



showToast(
"Wallet frozen",
"warning"
);



}





/* ===================================
   UNFREEZE WALLET
=================================== */


async function unfreezeWallet(
walletId
){


await updateDoc(

doc(
db,
"instructorWallets",
walletId
),

{

status:"active",

updatedAt:
serverTimestamp()

}

);



showToast(
"Wallet activated"
);



}





/* ===================================
   RECORD WALLET ACTION
=================================== */


async function recordWalletAction(
data
){


await addDoc(

collection(
db,
"walletActions"
),

{

...data,

performedBy:
currentUser.uid,

createdAt:
serverTimestamp()

}

);


}

/* ===================================
   TRANSACTION LEDGER & AUDIT CENTER
   PART 4/6
=================================== */


/* ===================================
   RECORD FINANCIAL TRANSACTION
=================================== */


async function recordTransaction(data){


try{


await addDoc(

collection(
db,
"financeTransactions"
),

{

transactionId:
`TX-${Date.now()}`,

type:
data.type || "unknown",

from:
data.from || "-",

to:
data.to || "-",

description:
data.description || "-",

amount:
Number(data.amount || 0),

status:
data.status || "completed",

approvedBy:
currentUser.uid,

createdAt:
serverTimestamp()

}

);



await createAuditLog({

action:
"Financial Transaction",

target:
data.description || "Unknown",

details:
`${data.type} ${formatMoney(data.amount)}`

});



}


catch(error){


console.error(
"Transaction error:",
error
);


showToast(
"Transaction failed",
"error"
);


}



}





/* ===================================
   LOAD TRANSACTION HISTORY
=================================== */


async function loadTransactions(){


try{


const transactionRef =
collection(
db,
"financeTransactions"
);



const q =
query(

transactionRef,

orderBy(
"createdAt",
"desc"
)

);



const snapshot =
await getDocs(
q
);



transactionCache = [];



snapshot.forEach(
(item)=>{


transactionCache.push({

id:item.id,

...item.data()

});


});



renderTransactions();



}


catch(error){


console.error(error);


}



}





/* ===================================
   RENDER TRANSACTIONS
=================================== */


function renderTransactions(){


if(!transactionHistoryTable)
return;



if(transactionCache.length === 0){


transactionHistoryTable.innerHTML = `

<tr>

<td colspan="9"
class="empty-table">

No financial transactions found.

</td>

</tr>

`;

return;


}



transactionHistoryTable.innerHTML="";



transactionCache.forEach(
(tx)=>{


transactionHistoryTable.innerHTML += `

<tr>


<td>

${tx.transactionId}

</td>


<td>

${tx.type}

</td>


<td>

${tx.from}

</td>


<td>

${tx.to}

</td>


<td>

${formatMoney(tx.amount)}

</td>


<td>

<span class="status connected">

${tx.status}

</span>

</td>


<td>

${tx.approvedBy || "-"}

</td>


<td>

${formatDate(tx.createdAt)}

</td>


<td>

<button

class="secondary-btn"

onclick="viewTransaction('${tx.id}')">

View

</button>

</td>


</tr>

`;

});


}





/* ===================================
   VIEW TRANSACTION
=================================== */


window.viewTransaction =
async function(id){


const ref =
doc(
db,
"financeTransactions",
id
);



const snap =
await getDoc(
ref
);



if(!snap.exists())
return;



const data =
snap.data();



alert(`

Transaction:

${data.transactionId}


Amount:

${formatMoney(data.amount)}


Status:

${data.status}

`);



};






/* ===================================
   AUDIT LOG CREATOR
=================================== */


async function createAuditLog(data){


try{


await addDoc(

collection(
db,
"auditLogs"
),

{

user:
currentUser.uid,

role:
currentRole,

action:
data.action,

target:
data.target,

details:
data.details,

createdAt:
serverTimestamp()

}

);


}

catch(error){


console.error(
"Audit error:",
error
);


}



}





/* ===================================
   LOAD AUDIT LOGS
=================================== */


async function loadAuditLogs(){


try{


const auditRef =
collection(
db,
"auditLogs"
);



const q =
query(

auditRef,

orderBy(
"createdAt",
"desc"
)

);



const snapshot =
await getDocs(
q
);



if(!auditTable)
return;



auditTable.innerHTML="";



snapshot.forEach(
(item)=>{


const log =
item.data();



auditTable.innerHTML += `

<tr>


<td>

${log.user}

</td>


<td>

${log.role}

</td>


<td>

${log.action}

</td>


<td>

${log.target}

</td>


<td>

Founder Device

</td>


<td>

${formatDate(log.createdAt)}

</td>


</tr>

`;

});


}


catch(error){


console.error(
error
);


}



}





/* ===================================
   EXPORT LEDGER
=================================== */


document

.getElementById(
"exportLedger"
)

?.addEventListener(
"click",
()=>{


let csv =
"Transaction,Type,Amount,Status\n";



transactionCache.forEach(
(tx)=>{


csv +=

`${tx.transactionId},${tx.type},${tx.amount},${tx.status}\n`;



});



const blob =
new Blob(
[csv],
{
type:"text/csv"
}
);



const url =
URL.createObjectURL(
blob
);



const link =
document.createElement(
"a"
);



link.href=url;

link.download=
"academy-financial-ledger.csv";


link.click();



showToast(
"Ledger exported"
);



}

);

/* ===================================
   SECURITY & APPROVAL ENGINE
   PART 5/6
=================================== */


/* ===================================
   LOAD SECURITY SETTINGS
=================================== */


async function loadSecuritySettings(){


try{


const securityRef =
doc(
db,
"finance",
"security"
);



const snapshot =
await getDoc(
securityRef
);



if(!snapshot.exists()){


await createSecuritySettings();

return;


}



const settings =
snapshot.data();



applySecuritySettings(
settings
);



}

catch(error){


console.error(
"Security load error:",
error
);


showToast(
"Unable to load security settings",
"error"
);


}



}





/* ===================================
   CREATE DEFAULT SETTINGS
=================================== */


async function createSecuritySettings(){


await setDoc(

doc(
db,
"finance",
"security"
),

{

founderApprovalLock:true,

withdrawalLimit:50000,

transactionAlerts:true,

largeTransactionApproval:true,

auditNotifications:true,

treasuryLocked:false,

updatedAt:
serverTimestamp()

}

);



}





/* ===================================
   APPLY SETTINGS TO UI
=================================== */


function applySecuritySettings(
settings
){


const founderLock =
document.getElementById(
"founderApprovalLock"
);



if(founderLock)

founderLock.checked =
settings.founderApprovalLock;



const withdrawalLimit =
document.getElementById(
"withdrawalLimit"
);



if(withdrawalLimit)

withdrawalLimit.value =
settings.withdrawalLimit;



const alerts =
document.getElementById(
"transactionAlerts"
);



if(alerts)

alerts.checked =
settings.transactionAlerts;



const lockTreasury =
document.getElementById(
"lockTreasury"
);



if(lockTreasury)

lockTreasury.checked =
settings.treasuryLocked;



}





/* ===================================
   SAVE SECURITY SETTINGS
=================================== */


document

.getElementById(
"saveSecuritySettings"
)

?.addEventListener(

"click",

async()=>{


const settings = {


founderApprovalLock:

document.getElementById(
"founderApprovalLock"
).checked,


withdrawalLimit:

Number(
document.getElementById(
"withdrawalLimit"
).value || 50000
),


transactionAlerts:

document.getElementById(
"transactionAlerts"
).checked,


treasuryLocked:

document.getElementById(
"lockTreasury"
).checked,


largeTransactionApproval:

document.getElementById(
"largeTransactionApproval"
)?.checked || true,


auditNotifications:

document.getElementById(
"auditNotifications"
)?.checked || true,


updatedAt:
serverTimestamp()


};



await setDoc(

doc(
db,
"finance",
"security"
),

settings

);



await createAuditLog({

action:
"Security Settings Updated",

target:
"Finance Security",

details:
"Administrator changed wallet controls"

});



showToast(
"Security settings saved"
);



}

);






/* ===================================
   CHECK TRANSACTION APPROVAL
=================================== */


async function checkApproval(
amount
){


const securitySnap =
await getDoc(

doc(
db,
"finance",
"security"
)

);



if(!securitySnap.exists())

return true;



const settings =
securitySnap.data();



if(
settings.treasuryLocked
){


showToast(
"Treasury is locked",
"error"
);


return false;


}



if(

settings.largeTransactionApproval &&

amount >
settings.withdrawalLimit

){


const approved =
confirm(

`Founder approval required for ${formatMoney(amount)}`

);



if(!approved)

return false;



}



return true;



}





/* ===================================
   SECURE WITHDRAWAL REQUEST
=================================== */


async function requestWithdrawal(
walletId,
amount,
method
){



const allowed =
await checkApproval(
amount
);



if(!allowed)
return;




await addDoc(

collection(
db,
"withdrawalRequests"
),

{

walletId,

amount:

Number(amount),


method,


status:
"pending",


requestedBy:
currentUser.uid,


createdAt:
serverTimestamp()

}

);



await createAuditLog({

action:
"Withdrawal Requested",

target:
walletId,

details:
`Request ${formatMoney(amount)}`

});



showToast(
"Withdrawal request submitted"
);



}





/* ===================================
   APPROVE WITHDRAWAL
=================================== */


async function approveWithdrawal(
requestId
){


const requestRef =
doc(
db,
"withdrawalRequests",
requestId
);



const requestSnap =
await getDoc(
requestRef
);



if(!requestSnap.exists())
return;



const request =
requestSnap.data();



await debitWallet(

request.walletId,

request.amount,

"Approved withdrawal"

);



await updateDoc(

requestRef,

{

status:
"approved",

approvedBy:
currentUser.uid,

approvedAt:
serverTimestamp()

}

);



await createAuditLog({

action:
"Withdrawal Approved",

target:
request.walletId,

details:
formatMoney(request.amount)

});



showToast(
"Withdrawal approved"
);



}





/* ===================================
   REJECT WITHDRAWAL
=================================== */


async function rejectWithdrawal(
requestId
){


await updateDoc(

doc(
db,
"withdrawalRequests",
requestId
),

{

status:
"rejected",

rejectedBy:
currentUser.uid,

rejectedAt:
serverTimestamp()

}

);



await createAuditLog({

action:
"Withdrawal Rejected",

target:
requestId,

details:
"Request denied"

});



showToast(
"Withdrawal rejected",
"warning"
);



}





/* ===================================
   TREASURY LOCK
=================================== */


async function lockTreasury(state){


await updateDoc(

doc(
db,
"finance",
"security"
),

{

treasuryLocked:
state,

updatedAt:
serverTimestamp()

}

);



showToast(

state ?

"Treasury locked 🔒"

:

"Treasury unlocked 🔓"

);



}

/* ===================================
   FINAL INITIALIZATION & UTILITIES
   PART 6/6
=================================== */


/* ===================================
   REFRESH ALL FINANCE DATA
=================================== */


async function refreshFinanceData(){


showToast(
"Refreshing financial data..."
);



await Promise.all([

loadInstructorWallets(),

loadTransactions(),

loadAuditLogs(),

loadSecuritySettings()

]);



showToast(
"Financial data updated"
);



}





/* ===================================
   BUTTON CONNECTIONS
=================================== */



document

.getElementById(
"refreshFinance"
)

?.addEventListener(

"click",

refreshFinanceData

);



document

.getElementById(
"refreshWallets"
)

?.addEventListener(

"click",

loadInstructorWallets

);



document

.getElementById(
"backupWallet"
)

?.addEventListener(

"click",

()=>{


createAuditLog({

action:
"Finance Backup",

target:
"Wallet Database",

details:
"Manual backup initiated"

});


showToast(
"Backup created"
);


}

);






document

.getElementById(
"backupWallets"
)

?.addEventListener(

"click",

()=>{


showToast(
"Wallet backup completed"
);


}

);






document

.getElementById(
"freezeWallet"
)

?.addEventListener(

"click",

async()=>{


const state = true;


await lockTreasury(
state
);


}

);






/* ===================================
   SEARCH INSTRUCTOR WALLETS
=================================== */


document

.getElementById(
"walletSearch"
)

?.addEventListener(

"input",

(e)=>{


const value =
e.target.value
.toLowerCase();



const filtered =

walletCache.filter(

(wallet)=>


(wallet.name || "")
.toLowerCase()
.includes(value)

);



renderFilteredWallets(
filtered
);



}

);





function renderFilteredWallets(
wallets
){


if(!walletTable)
return;



walletTable.innerHTML="";



wallets.forEach(

(wallet)=>{


walletTable.innerHTML += `

<tr>

<td>
${wallet.name || "-"}
</td>

<td>
${wallet.instructorId || "-"}
</td>

<td>
${wallet.walletId || "-"}
</td>

<td>
${formatMoney(wallet.balance)}
</td>

<td>
${formatMoney(wallet.pending)}
</td>

<td>
${formatMoney(wallet.totalPaid)}
</td>

<td>

<span class="status connected">
${wallet.status}
</span>

</td>

<td>

<button
class="secondary-btn"
onclick="openWalletManager('${wallet.id}')">

Manage

</button>

</td>

</tr>

`;

});


}





/* ===================================
   WALLET MODAL
=================================== */


window.openWalletManager =
function(id){


selectedWallet =
id;



const modal =
document.getElementById(
"walletModal"
);



if(modal)

modal.classList.add(
"show"
);



};





document

.getElementById(
"closeWalletModal"
)

?.addEventListener(

"click",

()=>{


document

.getElementById(
"walletModal"
)

.classList.remove(
"show"
);


}

);





document

.getElementById(
"cancelWalletAction"
)

?.addEventListener(

"click",

()=>{


document

.getElementById(
"walletModal"
)

.classList.remove(
"show"
);


}

);






document

.getElementById(
"confirmWalletAction"
)

?.addEventListener(

"click",

async()=>{


const action =
document.getElementById(
"walletAction"
).value;



const amount =
Number(
document.getElementById(
"walletAmount"
).value
);



const reason =
document.getElementById(
"walletReason"
).value;



if(action==="credit"){


await creditWallet(

selectedWallet,

amount,

reason

);


}



if(action==="debit"){


await debitWallet(

selectedWallet,

amount,

reason

);


}



if(action==="freeze"){


await freezeWallet(
selectedWallet
);


}



if(action==="unfreeze"){


await unfreezeWallet(
selectedWallet
);


}



document

.getElementById(
"walletModal"
)

.classList.remove(
"show"
);



await refreshFinanceData();



}

);







/* ===================================
   TOAST SYSTEM
=================================== */


function showToast(
message,
type="success"
){


let toast =
document.querySelector(
".finance-toast"
);



if(!toast){


toast =
document.createElement(
"div"
);


toast.className =
"finance-toast";


document.body.appendChild(
toast
);


}



toast.className =
`finance-toast ${type}`;


toast.textContent =
message;



setTimeout(

()=>{


toast.classList.add(
"visible"
);


},

50);



setTimeout(

()=>{


toast.classList.remove(
"visible"
);


},

3000);



}






/* ===================================
   MONEY FORMATTER
=================================== */


function formatMoney(
amount
){


return (

"KES " +

Number(
amount || 0
)

.toLocaleString(
"en-KE",
{

minimumFractionDigits:2

}

)

);


}





/* ===================================
   DATE FORMATTER
=================================== */


function formatDate(
timestamp
){


if(!timestamp)

return "-";



try{


return timestamp
.toDate()
.toLocaleString();


}

catch{


return "-";


}



}





/* ===================================
   APPLICATION START
=================================== */


async function initWalletSystem() {
    try {
        await verifyFounderAccess();

        await initializeTreasury();
        await loadInstructorWallets();
        await loadTransactions();
        await loadAuditLogs();
        await loadSecuritySettings();

        await calculateCashFlow();

        console.log("💰 Founder Wallet System initialized");

    } catch (error) {
        console.error("Wallet initialization failed:", error);

        showToast(
            "Unable to initialize wallet system.",
            "error"
        );
    }
}

initWalletSystem();
