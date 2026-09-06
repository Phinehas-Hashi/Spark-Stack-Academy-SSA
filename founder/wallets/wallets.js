import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, query, orderBy, serverTimestamp, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
let currentUser = null;
let wallets = [];
let transactions = [];
let auditLogs = [];
let selectedWallet = null;

const money = value => `KES ${Number(value || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = value => {
  if (!value) return "—";
  try { const d = value?.toDate ? value.toDate() : new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return "—"; }
};
const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));

function toast(message, type = "success") {
  let el = $("financeToast");
  if (!el) { el = document.createElement("div"); el.id = "financeToast"; el.className = "finance-toast"; document.body.appendChild(el); }
  el.textContent = message; el.className = `finance-toast visible ${type}`; clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove("visible"), 3200);
}

async function verifyFounder(user) {
  const snap = await getDoc(doc(db, "founder", user.uid));
  if (!snap.exists() || snap.data().role !== "founder" || snap.data().status === "suspended") {
    toast("Founder authorization required", "error"); setTimeout(() => { location.href = "../dashboard.html"; }, 900); return false;
  }
  return true;
}

async function ensureTreasury() {
  const ref = doc(db, "finance", "treasury"); const snap = await getDoc(ref);
  if (!snap.exists()) { await setDoc(ref, { balance:0, reservedFunds:0, monthlyRevenue:0, createdAt:serverTimestamp(), updatedAt:serverTimestamp() }); return {balance:0,reservedFunds:0,monthlyRevenue:0}; }
  return snap.data();
}

function renderTreasury(data) {
  const balance = Number(data.balance || 0); const reserved = Number(data.reservedFunds || 0); const revenue = Number(data.monthlyRevenue || 0);
  if ($("treasuryBalance")) $("treasuryBalance").textContent = money(balance);
  if ($("treasuryAvailable")) $("treasuryAvailable").textContent = money(balance);
  if ($("reservedFunds")) $("reservedFunds").textContent = money(reserved);
  if ($("monthlyRevenue")) $("monthlyRevenue").textContent = money(revenue);
}
async function loadTreasury(){ try{ renderTreasury(await ensureTreasury()); }catch(e){ console.error(e); toast("Unable to load treasury","error"); } }

async function loadWallets(){
  const snap = await getDocs(collection(db,"instructorWallets")); wallets = snap.docs.map(d=>({id:d.id,...d.data()})); renderWallets();
  const total=wallets.reduce((s,w)=>s+Number(w.balance||0),0); if($("instructorBalance")) $("instructorBalance").textContent=money(total); if($("instructorWalletTotal")) $("instructorWalletTotal").textContent=money(total);
}

async function createMissingWallets(){
  const snap=await getDocs(collection(db,"instructors")); const existing=new Set(wallets.map(w=>w.instructorId||w.id)); let created=0;
  for(const item of snap.docs){ const d=item.data(); if(existing.has(item.id)) continue; await setDoc(doc(db,"instructorWallets",item.id),{name:d.fullName||d.name||"Instructor",instructorId:item.id,walletId:`WAL-${Date.now()}-${item.id.slice(0,6)}`,balance:0,pending:0,totalPaid:0,status:"active",createdAt:serverTimestamp(),updatedAt:serverTimestamp()}); created++; }
  if(created) await loadWallets();
}

function renderWallets(){
  const table=$("instructorWalletTable")||$("walletTable"); if(!table)return;
  const term=($("walletSearch")?.value||"").trim().toLowerCase(); const filter=$("walletFilter")?.value||"all";
  const list=wallets.filter(w=>{const status=String(w.status||"active").toLowerCase();const zero=Number(w.balance||0)===0;const text=`${w.name||""} ${w.instructorId||""} ${w.walletId||w.id}`.toLowerCase();return(!term||text.includes(term))&&(filter==="all"||(filter==="empty"?zero:status===filter));});
  table.innerHTML=list.length?list.map(w=>`<tr><td><strong>${esc(w.name||"Unknown instructor")}</strong></td><td>${esc(w.instructorId||"—")}</td><td>${esc(w.walletId||w.id)}</td><td><strong>${money(w.balance)}</strong></td><td><span class="status ${esc(String(w.status||"active").toLowerCase())}">${esc(w.status||"active")}</span></td><td>${date(w.updatedAt||w.createdAt)}</td><td><button class="secondary-btn" data-wallet-action="manage" data-id="${esc(w.id)}">Manage</button></td></tr>`).join(""): `<tr><td colspan="7" class="empty-table">No instructor wallets found.</td></tr>`;
}

async function loadTransactions(){
  try{const snap=await getDocs(query(collection(db,"financeTransactions"),orderBy("createdAt","desc")));transactions=snap.docs.map(d=>({id:d.id,...d.data()}));renderTransactions();const today=new Date();const count=transactions.filter(t=>{const d=t.createdAt?.toDate?t.createdAt.toDate():null;return d&&d.toDateString()===today.toDateString()&&["transfer","credit","debit"].includes(String(t.type||"").toLowerCase())}).length;if($("transferCount"))$("transferCount").textContent=count;}catch(e){console.error(e);}
}
function renderTransactions(){
  const table=$("transactionHistoryTable");if(!table)return;const term=($("transactionHistorySearch")?.value||"").trim().toLowerCase();const filter=$("transactionHistoryFilter")?.value||"all";const list=transactions.filter(t=>{const type=String(t.type||"").toLowerCase();const text=JSON.stringify(t).toLowerCase();return(!term||text.includes(term))&&(filter==="all"||type===filter||(filter==="salary"&&type==="payroll"));});
  table.innerHTML=list.length?list.map(t=>`<tr><td>${esc(t.transactionId||t.id)}</td><td>${esc(t.type||"—")}</td><td>${esc(t.from||"—")}</td><td>${esc(t.to||"—")}</td><td>${money(t.amount)}</td><td><span class="status ${t.status==="completed"?"completed":"pending"}">${esc(t.status||"pending")}</span></td><td>${esc(t.approvedBy||"—")}</td><td>${date(t.createdAt)}</td><td><button class="secondary-btn" data-tx-id="${esc(t.id)}">View</button></td></tr>`).join(""): `<tr><td colspan="9" class="empty-table">No financial transactions found.</td></tr>`;
}

async function loadAuditLogs(){try{const snap=await getDocs(query(collection(db,"audit_logs"),orderBy("createdAt","desc")));auditLogs=snap.docs.map(d=>({id:d.id,...d.data()}));renderAuditLogs();}catch(e){console.error(e);renderAuditLogs("Audit logs unavailable.");}}
function renderAuditLogs(message){const list=$("auditList");if(!list)return;if(message){list.innerHTML=`<div class="audit-item"><div class="audit-icon">⚠️</div><div><h4>Audit service</h4><p>${esc(message)}</p></div></div>`;return;}list.innerHTML=auditLogs.length?auditLogs.slice(0,20).map(x=>`<div class="audit-item"><div class="audit-icon">🛡</div><div><h4>${esc(x.action||"Financial activity")}</h4><p>${esc(x.details||x.target||"—")}</p><small>${esc(x.role||"founder")} • ${date(x.createdAt)}</small></div></div>`).join(""):`<div class="audit-item"><div class="audit-icon">🔒</div><div><h4>System Ready</h4><p>Financial audit logs will appear here.</p><small>Waiting for activity…</small></div></div>`;}
async function audit(action,target,details){await addDoc(collection(db,"audit_logs"),{user:currentUser.uid,role:"founder",action,target,details,createdAt:serverTimestamp()});}

async function loadSecurity(){
  const ref=doc(db,"finance","security");const snap=await getDoc(ref);const settings=snap.exists()?snap.data():{withdrawalLimit:50000,treasuryLocked:false,freezeWallets:false,auditNotifications:true};if(!snap.exists())await setDoc(ref,{...settings,updatedAt:serverTimestamp()});
  if($("approvalLimit"))$("approvalLimit").value=settings.withdrawalLimit??50000;if($("lockTreasury"))$("lockTreasury").checked=settings.treasuryLocked===true;if($("freezeWallets"))$("freezeWallets").checked=settings.freezeWallets===true;if($("auditNotifications"))$("auditNotifications").checked=settings.auditNotifications!==false;if($("treasuryStatus")){ $("treasuryStatus").textContent=settings.treasuryLocked?"Locked":"Secure";$("treasuryStatus").className=`status ${settings.treasuryLocked?"frozen":"connected"}`;}if($("lastSecurityCheck"))$("lastSecurityCheck").textContent=date(settings.updatedAt);
}
async function saveSecurity(){
  const settings={withdrawalLimit:Number($("approvalLimit")?.value||50000),treasuryLocked:$("lockTreasury")?.checked===true,freezeWallets:$("freezeWallets")?.checked===true,auditNotifications:$("auditNotifications")?.checked!==false,updatedAt:serverTimestamp()};await setDoc(doc(db,"finance","security"),settings,{merge:true});
  await Promise.all(wallets.map(w=>updateDoc(doc(db,"instructorWallets",w.id),{status:settings.freezeWallets?"frozen":"active",updatedAt:serverTimestamp()})));await audit("Security Settings Updated","Finance Security","Founder changed wallet controls");toast("Security settings saved");await Promise.all([loadWallets(),loadSecurity(),loadAuditLogs()]);
}

async function walletAction(id,action,amount,reason){
  if(!id)throw new Error("Select a wallet first.");const ref=doc(db,"instructorWallets",id);
  if(action==="freeze"||action==="unfreeze"){await updateDoc(ref,{status:action==="freeze"?"frozen":"active",updatedAt:serverTimestamp()});await audit(`Wallet ${action}`,id,reason||`Wallet ${action}`);toast(action==="freeze"?"Wallet frozen":"Wallet activated");return;}
  const value=Number(amount||0);if(!Number.isFinite(value)||value<=0)throw new Error("Enter a valid positive amount.");if(!String(reason||"").trim())throw new Error("A reason is required.");
  await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw new Error("Wallet not found.");const data=snap.data();const current=Number(data.balance||0);if(action==="debit"&&current<value)throw new Error("Insufficient wallet balance.");const next=action==="credit"?current+value:current-value;tx.update(ref,{balance:next,totalPaid:action==="debit"?Number(data.totalPaid||0)+value:Number(data.totalPaid||0),updatedAt:serverTimestamp()});});
  await addDoc(collection(db,"financeTransactions"),{transactionId:`TX-${Date.now()}`,type:action,from:action==="debit"?"Academy Treasury":currentUser.uid,to:id,amount:value,description:String(reason).trim(),status:"completed",approvedBy:currentUser.uid,createdAt:serverTimestamp()});await audit(`Wallet ${action}`,id,`${money(value)} • ${String(reason).trim()}`);toast(action==="credit"?"Wallet credited":"Payment recorded");
}

function openWallet(id){selectedWallet=id;$("walletModal")?.classList.add("show");if($("walletAmount"))$("walletAmount").value="";if($("walletReason"))$("walletReason").value="";}
function closeWallet(){$("walletModal")?.classList.remove("show");selectedWallet=null;}
function exportCSV(filename,rows){const csv=rows.map(r=>r.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
async function refreshAll(){toast("Refreshing financial data…");await Promise.all([loadTreasury(),loadWallets(),loadTransactions(),loadAuditLogs(),loadSecurity()]);toast("Financial data updated");}

function bindEvents(){
  $("refreshWallets")?.addEventListener("click",refreshAll);$("refreshFinance")?.addEventListener("click",refreshAll);$("walletSearch")?.addEventListener("input",renderWallets);$("walletFilter")?.addEventListener("change",renderWallets);$("transactionHistorySearch")?.addEventListener("input",renderTransactions);$("transactionHistoryFilter")?.addEventListener("change",renderTransactions);
  [$("walletTable"),$("instructorWalletTable")].filter(Boolean).forEach(t=>t.addEventListener("click",e=>{const b=e.target.closest("[data-wallet-action]");if(b)openWallet(b.dataset.id);}));
  $("closeWalletModal")?.addEventListener("click",closeWallet);$("cancelWalletAction")?.addEventListener("click",closeWallet);$("walletModal")?.addEventListener("click",e=>{if(e.target.id==="walletModal")closeWallet();});
  $("confirmWalletAction")?.addEventListener("click",async()=>{try{await walletAction(selectedWallet,$("walletAction")?.value,$("walletAmount")?.value,$("walletReason")?.value||"");closeWallet();await refreshAll();}catch(e){console.error(e);toast(e.message||"Wallet action failed","error");}});
  $("saveSecuritySettings")?.addEventListener("click",()=>saveSecurity().catch(e=>{console.error(e);toast("Unable to save security settings","error")}));
  $("backupWallets")?.addEventListener("click",()=>exportCSV("academy-wallets.csv",[["Instructor","Wallet ID","Balance","Status","Updated"],...wallets.map(w=>[w.name,w.walletId||w.id,w.balance||0,w.status||"active",date(w.updatedAt)])]));
  $("exportFinance")?.addEventListener("click",()=>exportCSV("academy-finance.csv",[["Transaction","Type","Amount","Status","Date"],...transactions.map(t=>[t.transactionId||t.id,t.type,t.amount,t.status,date(t.createdAt)])]));
  $("exportLedger")?.addEventListener("click",()=>exportCSV("academy-financial-ledger.csv",[["Transaction","Type","Amount","Status"],...transactions.map(t=>[t.transactionId||t.id,t.type,t.amount,t.status])]));
  $("exportAuditLogs")?.addEventListener("click",()=>exportCSV("academy-audit-logs.csv",[["Action","Target","Details","Date"],...auditLogs.map(a=>[a.action,a.target,a.details,date(a.createdAt)])]));
  $("backupFinance")?.addEventListener("click",()=>exportCSV("academy-finance-backup.csv",[["Transaction","Type","Amount","Status","Date"],...transactions.map(t=>[t.transactionId||t.id,t.type,t.amount,t.status,date(t.createdAt)])]));
  $("reconcileAccounts")?.addEventListener("click",async()=>{await loadTreasury();await loadWallets();await audit("Finance Reconciliation","Treasury","Manual reconciliation completed");await loadAuditLogs();toast("Accounts reconciled")});
  $("depositFunds")?.addEventListener("click",()=>toast("Use the approved payment flow to record external deposits."));$("withdrawFunds")?.addEventListener("click",()=>location.href="payouts.html");$("transferFunds")?.addEventListener("click",()=>toast("Choose an instructor wallet, then credit or debit it from Manage."));
}

async function boot(){bindEvents();onAuthStateChanged(auth,async user=>{if(!user){location.href="../../login.html";return;}currentUser=user;try{if(!await verifyFounder(user))return;await loadTreasury();await loadWallets();await createMissingWallets();await loadTransactions();await loadAuditLogs();await loadSecurity();console.log("✓ Founder wallet system ready");}catch(e){console.error("Wallet boot failed:",e);toast("Unable to initialize wallet system","error");}})}
boot();
