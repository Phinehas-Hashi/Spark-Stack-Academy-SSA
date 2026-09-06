import "../js/founder-app.js";
import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  query, orderBy, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
let currentUser = null;
let wallets = [];
let transactions = [];
let auditLogs = [];
let selectedWallet = null;
let financeSecurity = {
  withdrawalLimit: 50000,
  treasuryLocked: false,
  freezeWallets: false,
  auditNotifications: true
};

const money = value => `KES ${Number(value || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = value => {
  if (!value) return "—";
  try { const d = value?.toDate ? value.toDate() : new Date(value); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return "—"; }
};
const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" }[c]));

function toast(message, type = "success") {
  let el = $("financeToast");
  if (!el) { el = document.createElement("div"); el.id = "financeToast"; el.className = "finance-toast"; document.body.appendChild(el); }
  el.textContent = message; el.className = `finance-toast visible ${type}`;
  clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove("visible"), 3200);
}

async function verifyFounder(user) {
  const snap = await getDoc(doc(db, "founder", user.uid));
  const data = snap.exists() ? snap.data() : {};
  if (!snap.exists() || data.role !== "founder" || data.status !== "active") {
    toast("Founder authorization required", "error");
    setTimeout(() => { location.href = "../dashboard.html"; }, 900);
    return false;
  }
  return true;
}

async function ensureTreasury() {
  const ref = doc(db, "finance", "treasury");
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const initial = { balance:0, reservedFunds:0, monthlyRevenue:0, pendingWithdrawals:0, createdAt:serverTimestamp(), updatedAt:serverTimestamp() };
    await setDoc(ref, initial);
    return { ...initial, balance:0, reservedFunds:0, monthlyRevenue:0, pendingWithdrawals:0 };
  }
  return snap.data();
}

function renderTreasury(data) {
  const balance = Number(data.balance || 0), reserved = Number(data.reservedFunds || 0), revenue = Number(data.monthlyRevenue || 0), pending = Number(data.pendingWithdrawals || 0);
  if ($("treasuryBalance")) $("treasuryBalance").textContent = money(balance);
  if ($("treasuryAvailable")) $("treasuryAvailable").textContent = money(balance);
  if ($("reservedFunds")) $("reservedFunds").textContent = money(reserved);
  if ($("monthlyRevenue")) $("monthlyRevenue").textContent = money(revenue);
  if ($("pendingWithdrawals")) $("pendingWithdrawals").textContent = money(pending);
  if ($("lastReconciliation")) $("lastReconciliation").textContent = date(data.lastReconciliationAt);
  if ($("treasuryStatus")) { $("treasuryStatus").textContent = financeSecurity.treasuryLocked ? "Locked" : "Secure"; $("treasuryStatus").className = `status ${financeSecurity.treasuryLocked ? "danger" : "connected"}`; }
}

async function loadTreasury() {
  try { renderTreasury(await ensureTreasury()); }
  catch (e) { console.error(e); toast("Unable to load treasury", "error"); }
}

async function loadSecurity() {
  try {
    const snap = await getDoc(doc(db, "finance", "security"));
    if (snap.exists()) financeSecurity = { ...financeSecurity, ...snap.data() };
    if ($("approvalLimit")) $("approvalLimit").value = Number(financeSecurity.withdrawalLimit || 50000);
    if ($("lockTreasury")) $("lockTreasury").checked = !!financeSecurity.treasuryLocked;
    if ($("freezeWallets")) $("freezeWallets").checked = !!financeSecurity.freezeWallets;
    if ($("auditNotifications")) $("auditNotifications").checked = financeSecurity.auditNotifications !== false;
  } catch (e) { console.error("Finance security load failed:", e); }
}

async function loadPendingWithdrawals() {
  try {
    const snap = await getDocs(query(collection(db, "withdrawalRequests"), orderBy("createdAt", "desc")));
    const pending = snap.docs.map(d => d.data()).filter(x => String(x.status || "pending").toLowerCase() === "pending").reduce((sum, x) => sum + Number(x.amount || 0), 0);
    if ($("pendingWithdrawals")) $("pendingWithdrawals").textContent = money(pending);
  } catch (e) { console.error("Pending withdrawals load failed:", e); }
}

async function loadWallets() {
  try {
    const snap = await getDocs(collection(db, "instructorWallets"));
    wallets = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    const total = wallets.reduce((sum, x) => sum + Number(x.balance || 0), 0);
    if ($("instructorBalance")) $("instructorBalance").textContent = money(total);
    renderWallets();
  } catch (e) { console.error(e); toast("Unable to load instructor wallets", "error"); }
}

function renderWallets() {
  const table = $("instructorWalletTable"); if (!table) return;
  const term = ($("walletSearch")?.value || "").trim().toLowerCase(), filter = $("walletFilter")?.value || "all";
  const list = wallets.filter(w => {
    const status = String(w.status || "active").toLowerCase();
    const text = `${w.name || ""} ${w.email || ""} ${w.instructorId || ""} ${w.walletId || w.id}`.toLowerCase();
    return (!term || text.includes(term)) && (filter === "all" || (filter === "empty" ? Number(w.balance || 0) === 0 : status === filter));
  });
  table.innerHTML = list.length ? list.map(w => `<tr><td>${esc(w.name || w.email || "Instructor")}</td><td>${esc(w.instructorId || w.staffId || "—")}</td><td>${esc(w.walletId || w.id)}</td><td><strong>${money(w.balance)}</strong></td><td><span class="status ${esc(String(w.status || "active").toLowerCase())}">${esc(w.status || "active")}</span></td><td>${date(w.updatedAt || w.lastTransactionAt)}</td><td><button class="action-btn" data-wallet="${esc(w.id)}">Manage</button></td></tr>`).join("") : `<tr><td colspan="7" class="empty-table">No instructor wallets found.</td></tr>`;
}

async function loadTransactions() {
  try { const snap = await getDocs(query(collection(db, "financeTransactions"), orderBy("createdAt", "desc"))); transactions = snap.docs.map(d => ({ id:d.id, ...d.data() })); renderTransactions(); }
  catch (e) { console.error("Transaction history load failed:", e); }
}
function renderTransactions() {
  const table = $("transactionHistoryTable"); if (!table) return;
  const term = ($("transactionHistorySearch")?.value || "").trim().toLowerCase(), filter = $("transactionHistoryFilter")?.value || "all";
  const list = transactions.filter(x => (filter === "all" || String(x.type || "").toLowerCase() === filter) && (!term || JSON.stringify(x).toLowerCase().includes(term)));
  table.innerHTML = list.length ? list.map(x => `<tr><td>${esc(x.transactionId || x.id)}</td><td>${esc(x.type || "—")}</td><td>${esc(x.from || "—")}</td><td>${esc(x.to || "—")}</td><td>${money(x.amount)}</td><td>${esc(x.status || "—")}</td><td>${esc(x.approvedBy || "—")}</td><td>${date(x.createdAt)}</td><td>—</td></tr>`).join("") : `<tr><td colspan="9" class="empty-table">No financial transactions found.</td></tr>`;
}

async function loadAuditLogs() {
  try { const snap = await getDocs(query(collection(db, "audit_logs"), orderBy("createdAt", "desc"))); auditLogs = snap.docs.map(d => ({ id:d.id, ...d.data() })).slice(0, 50); const list = $("auditList"); if (list) list.innerHTML = auditLogs.length ? auditLogs.map(x => `<div class="audit-item"><div class="audit-icon">🛡</div><div><h4>${esc(x.action || "Security event")}</h4><p>${esc(x.details || x.target || "—")}</p><small>${date(x.createdAt)}</small></div></div>`).join("") : `<div class="audit-item"><div class="audit-icon">🔒</div><div><h4>System Ready</h4><p>No financial audit activity yet.</p></div></div>`; }
  catch (e) { console.error("Audit log load failed:", e); }
}

async function saveSecuritySettings() {
  if (!currentUser) return;
  const limit = Math.max(0, Number($("approvalLimit")?.value || 50000));
  const next = { withdrawalLimit:limit, treasuryLocked:!!$("lockTreasury")?.checked, freezeWallets:!!$("freezeWallets")?.checked, auditNotifications:!!$("auditNotifications")?.checked, updatedAt:serverTimestamp(), updatedBy:currentUser.uid };
  try { await setDoc(doc(db, "finance", "security"), next, { merge:true }); financeSecurity = { ...financeSecurity, ...next }; renderTreasury(await ensureTreasury()); await addDoc(collection(db, "audit_logs"), { user:currentUser.uid, role:"founder", action:"finance_security_updated", target:"finance/security", details:`Limit ${money(limit)} • Treasury ${next.treasuryLocked ? "locked" : "unlocked"} • Wallet freeze ${next.freezeWallets ? "enabled" : "disabled"}`, createdAt:serverTimestamp() }); toast("Finance security settings saved"); await loadAuditLogs(); }
  catch (e) { console.error(e); toast("Unable to save security settings", "error"); }
}

function openWallet(id) { selectedWallet = wallets.find(w => w.id === id); if (!selectedWallet) return; $("walletModal")?.classList.add("open"); }
function closeWallet() { $("walletModal")?.classList.remove("open"); selectedWallet = null; }

async function confirmWalletAction() {
  if (!selectedWallet || !currentUser) return;
  if (financeSecurity.treasuryLocked) { toast("Treasury is locked. Wallet operations are disabled.", "error"); return; }
  const action = $("walletAction")?.value, amount = Number($("walletAmount")?.value || 0), reason = ($("walletReason")?.value || "").trim();
  if (["credit","debit"].includes(action) && (!Number.isFinite(amount) || amount <= 0)) { toast("Enter a valid amount", "error"); return; }
  if (!reason) { toast("A reason is required", "error"); return; }
  const ref = doc(db, "instructorWallets", selectedWallet.id);
  try {
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref); if (!snap.exists()) throw new Error("Wallet no longer exists.");
      const data = snap.data(), balance = Number(data.balance || 0), next = action === "credit" ? balance + amount : action === "debit" ? balance - amount : balance;
      if (action === "debit" && next < 0) throw new Error("Insufficient wallet balance.");
      const status = action === "freeze" ? "frozen" : action === "unfreeze" ? "active" : String(data.status || "active");
      tx.update(ref, { balance:next, status, updatedAt:serverTimestamp(), lastTransactionAt:serverTimestamp() });
    });
    await addDoc(collection(db, "walletActions"), { walletId:selectedWallet.id, instructorId:selectedWallet.instructorId || selectedWallet.userId || selectedWallet.id, action, amount:["credit","debit"].includes(action) ? amount : 0, reason, performedBy:currentUser.uid, createdAt:serverTimestamp() });
    await addDoc(collection(db, "audit_logs"), { user:currentUser.uid, role:"founder", action:`wallet_${action}`, target:selectedWallet.id, details:`${money(amount)} • ${reason}`, createdAt:serverTimestamp() });
    toast("Wallet operation completed"); closeWallet(); await Promise.all([loadWallets(), loadTransactions(), loadAuditLogs()]);
  } catch (e) { console.error(e); toast(e.message || "Wallet operation failed", "error"); }
}

function exportRows(filename, rows) {
  const csv = rows.map(row => row.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" }), url = URL.createObjectURL(blob), a = document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}

$("walletSearch")?.addEventListener("input", renderWallets); $("walletFilter")?.addEventListener("change", renderWallets);
$("transactionHistorySearch")?.addEventListener("input", renderTransactions); $("transactionHistoryFilter")?.addEventListener("change", renderTransactions);
$("instructorWalletTable")?.addEventListener("click", e => { const b=e.target.closest("[data-wallet]"); if(b) openWallet(b.dataset.wallet); });
$("closeWalletModal")?.addEventListener("click", closeWallet); $("cancelWalletAction")?.addEventListener("click", closeWallet); $("confirmWalletAction")?.addEventListener("click", confirmWalletAction); $("saveSecuritySettings")?.addEventListener("click", saveSecuritySettings);
$("refreshWallets")?.addEventListener("click", async () => { await Promise.all([loadSecurity(), loadTreasury(), loadPendingWithdrawals(), loadWallets(), loadTransactions(), loadAuditLogs()]); toast("Finance workspace refreshed"); });
$("exportFinance")?.addEventListener("click", () => exportRows("ssa-finance-transactions.csv", [["Transaction ID","Type","From","To","Amount","Status","Approved By","Date"], ...transactions.map(x => [x.transactionId || x.id,x.type,x.from,x.to,x.amount,x.status,x.approvedBy,date(x.createdAt)])]));
$("exportAuditLogs")?.addEventListener("click", () => exportRows("ssa-finance-audit-logs.csv", [["Action","Target","Details","Date"], ...auditLogs.map(x => [x.action,x.target,x.details,date(x.createdAt)])]));
$("backupWallets")?.addEventListener("click", () => exportRows("ssa-instructor-wallets.csv", [["Wallet ID","Instructor","Balance","Status","Updated"], ...wallets.map(x => [x.walletId || x.id,x.instructorId || x.email,x.balance,x.status,date(x.updatedAt)])]));
$("backupFinance")?.addEventListener("click", () => $("exportFinance")?.click());
$("reconcileAccounts")?.addEventListener("click", async () => { if (!currentUser) return; try { await updateDoc(doc(db,"finance","treasury"), { lastReconciliationAt:serverTimestamp(), updatedAt:serverTimestamp() }); await addDoc(collection(db,"audit_logs"), { user:currentUser.uid, role:"founder", action:"finance_reconciliation", target:"finance/treasury", details:"Founder initiated reconciliation", createdAt:serverTimestamp() }); toast("Reconciliation recorded"); await loadTreasury(); await loadAuditLogs(); } catch(e) { console.error(e); toast("Reconciliation failed","error"); } });
$("depositFunds")?.addEventListener("click", () => toast("External deposits must be recorded through the approved payment gateway.", "error"));
$("withdrawFunds")?.addEventListener("click", () => toast("Use the payout queue for instructor withdrawals.", "error"));
$("transferFunds")?.addEventListener("click", () => toast("Internal transfer workflow is protected and will be enabled after payment ledger validation.", "error"));

onAuthStateChanged(auth, async user => {
  if (!user) { location.href = "../../login.html"; return; }
  currentUser = user;
  try { if (!await verifyFounder(user)) return; if ($("currentAdmin")) $("currentAdmin").textContent = user.email || "Founder"; if ($("lastSecurityCheck")) $("lastSecurityCheck").textContent = date(new Date()); await loadSecurity(); await loadTreasury(); await Promise.all([loadPendingWithdrawals(), loadWallets(), loadTransactions(), loadAuditLogs()]); }
  catch (e) { console.error(e); toast("Security verification failed", "error"); }
});