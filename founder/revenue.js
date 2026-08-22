import { db } from "../js/firebase.js";
import { collection, query, orderBy, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const money = value => `KES ${Number(value || 0).toLocaleString()}`;
const dateValue = value => value?.toDate ? value.toDate() : value ? new Date(value) : null;
const dateText = value => { const d = dateValue(value); return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString() : "--"; };
const toast = (message, type = "success") => window.showFounderToast ? window.showFounderToast(message, type) : console.log(message);
let payments = [], withdrawals = [], chart, chartDays = 30;

function completedAmount(list) { return list.filter(p => p.status === "completed").reduce((sum,p) => sum + Number(p.amount || 0), 0); }
function monthStart(offset = 0) { const d = new Date(); d.setMonth(d.getMonth() + offset, 1); d.setHours(0,0,0,0); return d; }
function sameDay(a,b) { return a && a.toDateString() === b.toDateString(); }

function renderTransactions() {
    const tbody = $("transactionsTable");
    const search = ($("transactionSearch")?.value || "").trim().toLowerCase();
    const filter = $("transactionFilter")?.value || "all";
    const rows = payments.filter(p => {
        const haystack = [p.receipt,p.studentName,p.admissionNo,p.type,p.method,p.status].join(" ").toLowerCase();
        return (!search || haystack.includes(search)) && (filter === "all" || p.status === filter);
    });
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-table">No transactions match your filters.</td></tr>'; return; }
    tbody.innerHTML = rows.map(p => `<tr>
        <td>${p.receipt || "--"}</td><td>${p.studentName || "Unknown"}</td><td>${p.admissionNo || "--"}</td>
        <td>${p.type || "--"}</td><td>${p.method || "--"}</td><td>${money(p.amount)}</td>
        <td><span class="status ${p.status || "pending"}">${p.status || "pending"}</span></td><td>${dateText(p.createdAt)}</td>
        <td><button class="table-action" data-payment-id="${p.id}">View</button></td>
    </tr>`).join("");
}

function renderRevenue() {
    const completed = payments.filter(p => p.status === "completed");
    const now = new Date(), currentMonth = monthStart(), previousMonth = monthStart(-1);
    const lifetime = completedAmount(completed);
    const monthly = completed.filter(p => { const d = dateValue(p.createdAt); return d && d >= currentMonth; });
    const previous = completed.filter(p => { const d = dateValue(p.createdAt); return d && d >= previousMonth && d < currentMonth; });
    const today = completed.filter(p => { const d = dateValue(p.createdAt); return d && sameDay(d, now); });
    const monthlyValue = completedAmount(monthly), previousValue = completedAmount(previous);
    const todayValue = completedAmount(today);
    $("totalRevenue").textContent = money(lifetime); $("monthlyRevenue").textContent = money(monthlyValue); $("todayRevenue").textContent = money(todayValue);
    $("transactionCount").textContent = payments.length; $("successfulPayments").textContent = completed.length;
    $("pendingPayments").textContent = payments.filter(p=>p.status === "pending").length; $("failedPayments").textContent = payments.filter(p=>p.status === "failed").length;

    const typeTotals = {course:0, registration:0, certificate:0, exam:0};
    const methodTotals = {mpesa:0, card:0, bank:0, paypal:0};
    completed.forEach(p => { const amount=Number(p.amount||0); if(typeTotals[p.type] !== undefined) typeTotals[p.type]+=amount; if(methodTotals[p.method] !== undefined) methodTotals[p.method]+=amount; });
    $("courseRevenue").textContent=money(typeTotals.course); $("registrationRevenue").textContent=money(typeTotals.registration); $("certificateRevenue").textContent=money(typeTotals.certificate); $("examRevenue").textContent=money(typeTotals.exam); $("breakdownTotal").textContent=money(lifetime);
    $("mpesaRevenue").textContent=money(methodTotals.mpesa); $("cardRevenue").textContent=money(methodTotals.card); $("bankRevenue").textContent=money(methodTotals.bank); $("paypalRevenue").textContent=money(methodTotals.paypal);

    const growth = previousValue ? ((monthlyValue - previousValue) / previousValue) * 100 : monthlyValue ? 100 : 0;
    $("monthlyGrowth").textContent = `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`;
    const daysElapsed = Math.max(1, now.getDate()); $("dailyAverage").textContent = money(monthlyValue / daysElapsed);
    const dayTotals = {};
    completed.forEach(p => { const d=dateValue(p.createdAt); if(d) { const key=d.toLocaleDateString(); dayTotals[key]=(dayTotals[key]||0)+Number(p.amount||0); } });
    const best = Object.entries(dayTotals).sort((a,b)=>b[1]-a[1])[0]; $("bestRevenueDay").textContent = best ? `${best[0]} · ${money(best[1])}` : "--";
    $("highestTransaction").textContent = money(Math.max(0,...completed.map(p=>Number(p.amount||0))));
    renderChart(completed); renderTransactions();
}

function renderChart(completed) {
    const canvas=$("revenueChart"); if(!canvas || typeof Chart === "undefined") return;
    const now=new Date(), labels=[], values=[];
    if(chartDays === 365) {
        for(let i=11;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); const next=new Date(d.getFullYear(),d.getMonth()+1,1); labels.push(d.toLocaleDateString(undefined,{month:"short",year:"numeric"})); values.push(completed.filter(p=>{const x=dateValue(p.createdAt);return x&&x>=d&&x<next;}).reduce((s,p)=>s+Number(p.amount||0),0)); }
    } else {
        for(let i=chartDays-1;i>=0;i--){const d=new Date(now);d.setHours(0,0,0,0);d.setDate(d.getDate()-i);labels.push(d.toLocaleDateString(undefined,{month:"short",day:"numeric"}));values.push(completed.filter(p=>{const x=dateValue(p.createdAt);return x&&sameDay(x,d);}).reduce((s,p)=>s+Number(p.amount||0),0));}
    }
    if(chart) chart.destroy(); chart=new Chart(canvas,{type:"line",data:{labels,datasets:[{label:"Revenue (KES)",data:values,tension:.35,fill:true}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true}},scales:{y:{beginAtZero:true}}}});
}

function renderWithdrawals() {
    const tbody=$("withdrawalsTable"), pending=withdrawals.filter(w=>w.status==="pending");
    $("pendingWithdrawals").textContent=money(pending.reduce((s,w)=>s+Number(w.amount||0),0));
    if(!withdrawals.length){tbody.innerHTML='<tr><td colspan="6" class="empty-table">No withdrawal requests found.</td></tr>';return;}
    tbody.innerHTML=withdrawals.map(w=>`<tr><td>${w.instructor||"Unknown"}</td><td>${w.method||"--"}</td><td>${money(w.amount)}</td><td><span class="status ${w.status||"pending"}">${w.status||"pending"}</span></td><td>${dateText(w.requestedAt)}</td><td>${w.status==="pending"?`<button class="withdraw-action approve" data-id="${w.id}">Approve</button> <button class="withdraw-action reject" data-id="${w.id}">Reject</button>`:"—"}</td></tr>`).join("");
}

const paymentsQuery=query(collection(db,"payments"),orderBy("createdAt","desc"));
onSnapshot(paymentsQuery,snapshot=>{payments=snapshot.docs.map(d=>({id:d.id,...d.data()}));renderRevenue();$("loadingOverlay")?.style.setProperty("display","none");},error=>{console.error(error);toast("Unable to load payments. Check Firestore permissions.","error");$("loadingOverlay")?.style.setProperty("display","none");});
const withdrawalsQuery=query(collection(db,"withdrawals"),orderBy("requestedAt","desc"));
onSnapshot(withdrawalsQuery,snapshot=>{withdrawals=snapshot.docs.map(d=>({id:d.id,...d.data()}));renderWithdrawals();},error=>{console.error(error);toast("Unable to load withdrawals.","error");});

$("transactionSearch")?.addEventListener("input",renderTransactions); $("transactionFilter")?.addEventListener("change",renderTransactions);
$("chartPeriod")?.addEventListener("change",e=>{chartDays=Number(e.target.value);renderChart(payments.filter(p=>p.status==="completed"));});
$("refreshRevenue")?.addEventListener("click",()=>location.reload()); $("refreshRevenueDashboard")?.addEventListener("click",()=>location.reload()); $("refreshWithdrawals")?.addEventListener("click",()=>location.reload()); $("printReport")?.addEventListener("click",()=>window.print());

document.addEventListener("click",async e=>{
    const id=e.target.dataset.id;
    if(id && (e.target.classList.contains("approve")||e.target.classList.contains("reject"))){
        const status=e.target.classList.contains("approve")?"completed":"failed";
        if(!confirm(`${status === "completed" ? "Approve" : "Reject"} this withdrawal?`)) return;
        try { await updateDoc(doc(db,"withdrawals",id),{status,processedAt:new Date()}); toast(`Withdrawal ${status}.`); } catch(err){console.error(err);toast(err.message||"Unable to update withdrawal.","error");}
    }
    if(e.target.dataset.paymentId) toast("Transaction details are available in the payment record.");
});

function exportCSV(){
    const rows=[["Receipt","Student","Admission No.","Type","Method","Amount","Status","Date"],...payments.map(p=>[p.receipt||"",p.studentName||"",p.admissionNo||"",p.type||"",p.method||"",p.amount||0,p.status||"",dateText(p.createdAt)])];
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n"); const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`ssa-revenue-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);
}
$("exportCSV")?.addEventListener("click",exportCSV);
$("exportPDF")?.addEventListener("click",()=>{toast("PDF export uses the browser print dialog. Choose Save as PDF.");window.print();});
$("monthlyReport")?.addEventListener("click",()=>{chartDays=30;$("chartPeriod").value="30";renderChart(payments.filter(p=>p.status==="completed"));toast("Monthly report prepared from live payment data.");});
$("annualReport")?.addEventListener("click",()=>{chartDays=365;$("chartPeriod").value="365";renderChart(payments.filter(p=>p.status==="completed"));toast("Annual report prepared from live payment data.");});
$("forecastReport")?.addEventListener("click",()=>{const completed=payments.filter(p=>p.status==="completed");const last30=completed.filter(p=>{const d=dateValue(p.createdAt);return d&&d>=new Date(Date.now()-30*86400000)});const avg=completedAmount(last30)/30;toast(`30-day revenue forecast: approximately ${money(avg*30)} at the current run rate.`);});
