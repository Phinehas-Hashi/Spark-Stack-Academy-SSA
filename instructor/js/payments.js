import { app, auth } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const $=id=>document.getElementById(id);
const money=value=>`KSh ${Number(value||0).toLocaleString("en-KE",{maximumFractionDigits:2})}`;
const dateText=value=>value?new Date(Number(value)).toLocaleDateString("en-KE",{day:"2-digit",month:"short",year:"numeric"}):"—";
const financeCall=httpsCallable(getFunctions(app),"getInstructorFinanceData");
let payments=[],filter="all",search="";
function groupStatus(value){
 const status=String(value||"pending").toLowerCase().replace(/\s+/g,"_");
 if(["paid","success","successful","completed"].includes(status))return "successful";
 if(["pending","pending_review","verification_pending","initiating"].includes(status))return "pending";
 if(["failed","initiation_failed","cancelled","canceled"].includes(status))return "failed";
 if(["refunded","reversed"].includes(status))return "refunded";
 return "pending";
}
function setText(id,value){if($(id))$(id).textContent=String(value);}
function renderStats(){
 const successful=payments.filter(p=>groupStatus(p.status)==="successful");
 const pending=payments.filter(p=>groupStatus(p.status)==="pending");
 setText("totalPayments",money(payments.reduce((s,p)=>s+Number(p.amount||0),0)));
 setText("successfulPayments",money(successful.reduce((s,p)=>s+Number(p.amount||0),0)));
 setText("pendingPayments",money(pending.reduce((s,p)=>s+Number(p.amount||0),0)));
 setText("paymentTransactions",payments.length);
}
function filtered(){
 const q=search.trim().toLowerCase();
 return payments.filter(p=>(filter==="all"||groupStatus(p.status)===filter)&&(!q||[p.courseName,p.studentName,p.studentEmail,p.reference,p.id].join(" ").toLowerCase().includes(q)));
}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function render(){
 const host=$("paymentList"),empty=$("paymentEmpty");if(!host||!empty)return;
 const items=filtered();
 if(!items.length){host.innerHTML="";empty.classList.remove("hidden");return;}
 empty.classList.add("hidden");
 host.innerHTML=items.map(p=>{
  const state=groupStatus(p.status);
  return `<article class="payment-row"><div class="payment-course"><div class="payment-course-icon"><i data-lucide="book-open"></i></div><div><strong>${escapeHtml(p.courseName||"Course payment")}</strong><span>${escapeHtml(p.studentName||"Student")}</span></div></div><div class="payment-meta"><strong>${escapeHtml(p.reference||p.id)}</strong><span>${dateText(p.createdAt)}</span></div><div class="payment-amount">${money(p.amount)}</div><div><span class="payment-status ${state}">${state.charAt(0).toUpperCase()+state.slice(1)}</span></div><div class="payment-meta"><span>${escapeHtml(p.currency||"KES")}</span></div></article>`;
 }).join("");
 window.lucide?.createIcons?.();
}
function setup(){
 $("paymentSearch")?.addEventListener("input",event=>{search=event.target.value;render();});
 document.querySelectorAll(".payment-filter").forEach(button=>button.addEventListener("click",()=>{
  document.querySelectorAll(".payment-filter").forEach(item=>item.classList.remove("active"));
  button.classList.add("active");filter=button.dataset.filter||"all";render();
 }));
 const upgrade=()=>window.location.href="pro.html";
 $("upgradeProBtn")?.addEventListener("click",upgrade);
 $("proBannerBtn")?.addEventListener("click",upgrade);
}
setup();
onAuthStateChanged(auth,async user=>{
 if(!user){return;}
 try{const result=await financeCall();payments=result.data.payments||[];renderStats();render();}
 catch(error){console.error("Instructor payments load failed:",error);const host=$("paymentList");if(host)host.innerHTML='<div class="payment-loading"><strong>Unable to load payments</strong><span>Refresh the page or contact support if this continues.</span></div>';}
});
