import { db } from "../js/firebase.js";
import { collection, query, orderBy, onSnapshot, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const money = value => `KES ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const dateValue = value => value?.toDate ? value.toDate() : value ? new Date(value) : null;
const dateText = value => { const d = dateValue(value); return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString() : "--"; };
const toast = (message, type = "success") => window.showFounderToast ? window.showFounderToast(message, type) : console[type === "error" ? "error" : "log"](message);
const normalize = value => String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
let payments = [], withdrawals = [], chart, chartDays = 30;

function completedAmount(list) { return list.filter(p => normalize(p.status) === "completed" || normalize(p.status) === "success" || normalize(p.status) === "successful").reduce((sum,p) => sum + Number(p.amount || 0), 0); }
function isCompleted(p) { const s = normalize(p.status); return s === "completed" || s === "success" || s === "successful"; }
function isPending(p) { return normalize(p.status) === "pending"; }
function isFailed(p) { const s = normalize(p.status); return s === "failed" || s === "failure" || s === "cancelled" || s === "canceled"; }
function monthStart(offset = 0) { const d = new Date(); d.setMonth(d.getMonth() + offset, 1); d.setHours(0,0,0,0); return d; }
function sameDay(a,b) { return a && b && a.toDateString() === b.toDateString(); }
function escapeHtml(value = "") { return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }

function renderTransactions() {
    const tbody = $("transactionsTable"); if (!tbody) return;
    const search = ($("transactionSearch")?.value || "").trim().toLowerCase();
    const filter = normalize($("transactionFilter")?.value || "all");
    const rows = payments.filter(p => {
        const haystack = [p.receipt,p.studentName,p.admissionNo,p.type,p.method,p.status].map(v => String(v || "")).join(" ").toLowerCase();
        return (!search || haystack.includes(search)) && (filter === "all" || normalize(p.status) === filter);
    });
    if (!rows.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-table">No transactions match your filters.</td></tr>'; return; }
    tbody.innerHTML = rows.map(p => `<tr>
        <td>${escapeHtml(p.receipt || "--")}</td><td>${escapeHtml(p.studentName || "Unknown")}</td><td>${escapeHtml(p.admissionNo || "--")}</td>
        <td>${escapeHtml(p.type || "--")}</td><td>${escapeHtml(p.method || "--")}</td><td>${money(p.amount)}</td>
        <td><span class="status ${escapeHtml(normalize(p.status || "pending"))}">${escapeHtml(p.status || "pending")}</span></td><td>${dateText(p.createdAt)}</td>
        <td><button class="table-action" type="button" data-payment-id="${escapeHtml(p.id)}">View</button></td>
    </tr>`).join("");
}

function renderRevenue() {
    const completed = payments.filter(isCompleted);
    const now = new Date(), currentMonth = monthStart(), previousMonth = monthStart(-1);
    const lifetime = completedAmount(completed);
    const monthly = completed.filter(p => { const d = dateValue(p.createdAt); return d && d >= currentMonth; });
    const previous = completed.filter(p => { const d = dateValue(p.createdAt); return d && d >= previousMonth && d < currentMonth; });
    const today = completed.filter(p => { const d = dateValue(p.createdAt); return d && sameDay(d, now); });
    const monthlyValue = completedAmount(monthly), previousValue = completedAmount(previous), todayValue = completedAmount(today);
    $("totalRevenue").textContent = money(lifetime); $("monthlyRevenue").textContent = money(monthlyValue); $("todayRevenue").textContent = money(todayValue);
    $("transactionCount").textContent = payments.length; $("successfulPayments").textContent = completed.length;
    $("pendingPayments").textContent = payments.filter(isPending).length; $("failedPayments").textContent = payments.filter(isFailed).length;

    const typeTotals = {course:0, registration:0, certificate:0, exam:0};
    const methodTotals = {mpesa:0, card:0, bank:0, paypal:0};
    completed.forEach(p => { const amount=Number(p.amount||0); const type=normalize(p.type); const method=normalize(p.method); if(typeTotals[type] !== undefined) typeTotals[type]+=amount; if(methodTotals[method] !== undefined) methodTotals[method]+=amount; });
    $("courseRevenue").textContent=money(typeTotals.course); $("registrationRevenue").textContent=money(typeTotals.registration); $("certificateRevenue").textContent=money(typeTotals.certificate); $("examRevenue").textContent=money(typeTotals.exam); $("breakdownTotal").textContent=money(lifetime);
    $("mpesaRevenue").textContent=money(methodTotals.mpesa); $("cardRevenue").textContent=money(methodTotals.card); $("bankRevenue").textContent=money(methodTotals.bank); $("paypalRevenue").textContent=money(methodTotals.paypal);

    const growth = previousValue ? ((monthlyValue - previousValue) / previousValue) * 100 : monthlyValue ? 100 : 0;
    $("monthlyGrowth").textContent = `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`;
    const daysElapsed = Math.max(1, now.getDate()); $("dailyAverage").textContent = money(monthlyValue / daysElapsed);
    const dayTotals = {};
    completed.forEach(p => { const d=dateValue(p.createdAt); if(d) { const key=d.toLocaleDateString(); dayTotals[key]=(dayTotals[key]||0)+Number(p.amount||0); } });
    const best = Object.entries(dayTotals).sort((a,b)=>b[1]-a[1])[0]; $("bestRevenueDay").textContent = best ? `${escapeHtml(best[0])} · ${money(best[1])}` : "--";
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
    const tbody=$("withdrawalsTable"), pending=withdrawals.filter(w=>normalize(w.status)==="pending"); if(!tbody) return;
    $("pendingWithdrawals").textContent=money(pending.reduce((s,w)=>s+Number(w.amount||0),0));
    if(!withdrawals.length){tbody.innerHTML='<tr><td colspan="6" class="empty-table">No withdrawal requests found.</td></tr>';return;}
    tbody.innerHTML=withdrawals.map(w=>`<tr><td>${escapeHtml(w.instructor||"Unknown")}</td><td>${escapeHtml(w.method||"--")}</td><td>${money(w.amount)}</td><td><span class="status ${escapeHtml(normalize(w.status||"pending"))}">${escapeHtml(w.status||"pending")}</span></td><td>${dateText(w.requestedAt)}</td><td>${normalize(w.status)==="pending"?`<button type="button" class="withdraw-action approve" data-id="${escapeHtml(w.id)}">Approve</button> <button type="button" class="withdraw-action reject" data-id="${escapeHtml(w.id)}">Reject</button>`:"—"}</td></tr>`).join("");
}

const paymentsQuery=query(collection(db,"payments"),orderBy("createdAt","desc"));
onSnapshot(paymentsQuery,snapshot=>{payments=snapshot.docs.map(d=>({id:d.id,...d.data()}));renderRevenue();$("loadingOverlay")?.style.setProperty("display","none");},error=>{console.error(error);toast("Unable to load payments. Check Firestore permissions.","error");$("loadingOverlay")?.style.setProperty("display","none");});
const withdrawalsQuery=query(collection(db,"withdrawals"),orderBy("requestedAt","desc"));
onSnapshot(withdrawalsQuery,snapshot=>{withdrawals=snapshot.docs.map(d=>({id:d.id,...d.data()}));renderWithdrawals();},error=>{console.error(error);toast("Unable to load withdrawals.","error");});

$("transactionSearch")?.addEventListener("input",renderTransactions); $("transactionFilter")?.addEventListener("change",renderTransactions);
$("chartPeriod")?.addEventListener("change",e=>{chartDays=Number(e.target.value);renderChart(payments.filter(isCompleted));});
$("refreshRevenue")?.addEventListener("click",()=>location.reload()); $("refreshRevenueDashboard")?.addEventListener("click",()=>location.reload()); $("refreshWithdrawals")?.addEventListener("click",()=>location.reload()); $("printReport")?.addEventListener("click",()=>window.print());

document.addEventListener("click",async e=>{
    const target=e.target.closest("button"); if(!target) return;
    const id=target.dataset.id;
    if(id && (target.classList.contains("approve")||target.classList.contains("reject"))){
        const status=target.classList.contains("approve")?"completed":"failed";
        if(!confirm(`${status === "completed" ? "Approve" : "Reject"} this withdrawal?`)) return;
        target.disabled=true;
        try { await updateDoc(doc(db,"withdrawals",id),{status,processedAt:serverTimestamp()}); toast(`Withdrawal ${status}.`); } catch(err){console.error(err);toast(err.message||"Unable to update withdrawal.","error");} finally { target.disabled=false; }
    }
    if(target.dataset.paymentId) toast("Transaction details are available in the payment record.");
});

function exportCSV(){
    const rows=[["Receipt","Student","Admission No.","Type","Method","Amount","Status","Date"],...payments.map(p=>[p.receipt||"",p.studentName||"",p.admissionNo||"",p.type||"",p.method||"",p.amount||0,p.status||"",dateText(p.createdAt)])];
    const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n"); const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})); const a=document.createElement("a");a.href=url;a.download=`ssa-revenue-${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
$("exportCSV")?.addEventListener("click",exportCSV);
$("exportPDF")?.addEventListener("click",()=>{toast("PDF export uses the browser print dialog. Choose Save as PDF.");window.print();});
$("monthlyReport")?.addEventListener("click",()=>{chartDays=30;$("chartPeriod").value="30";renderChart(payments.filter(isCompleted));toast("Monthly report prepared from live payment data.");});
$("annualReport")?.addEventListener("click",()=>{chartDays=365;$("chartPeriod").value="365";renderChart(payments.filter(isCompleted));toast("Annual report prepared from live payment data.");});
$("forecastReport")?.addEventListener("click",()=>{const completed=payments.filter(isCompleted);const last30=completed.filter(p=>{const d=dateValue(p.createdAt);return d&&d>=new Date(Date.now()-30*86400000)});const avg=completedAmount(last30)/30;toast(`30-day revenue run-rate forecast: approximately ${money(avg*30)}.`);});
