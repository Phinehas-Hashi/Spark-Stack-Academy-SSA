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

const money = value => `KES ${Number(value || 0).toLocaleString("en-KE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})}`;

const date = value => {
  if (!value) return "—";
  try {
    const d = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-KE", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  } catch {
    return "—";
  }
};

const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#039;"
}[c]));

function toast(message, type = "success") {
  let el = $("financeToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "financeToast";
    el.className = "finance-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `finance-toast visible ${type}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("visible"), 3200);
}

async function verifyFounder(user) {
  const snap = await getDoc(doc(db, "founder", user.uid));
  const data = snap.exists() ? snap.data() : {};
  if (!snap.exists() || data.role !== "founder" || data.status === "suspended") {
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
    const initial = {
      balance: 0,
      reservedFunds: 0,
      monthlyRevenue: 0,
      pendingWithdrawals: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    await setDoc(ref, initial);
    return { ...initial, balance: 0, reservedFunds: 0, monthlyRevenue: 0, pendingWithdrawals: 0 };
  }
  return snap.data();
}

function renderTreasury(data) {
  const balance = Number(data.balance || 0);
  const reserved = Number(data.reservedFunds || 0);
  const revenue = Number(data.monthlyRevenue || 0);
  const pending = Number(data.pendingWithdrawals || 0);

  if ($("treasuryBalance")) $("treasuryBalance").textContent = money(balance);
  if ($("treasuryAvailable")) $("treasuryAvailable").textContent = money(balance);
  if ($("reservedFunds")) $("reservedFunds").textContent = money(reserved);
  if ($("monthlyRevenue")) $("monthlyRevenue").textContent = money(revenue);
  if ($("pendingWithdrawals")) $("pendingWithdrawals").textContent = money(pending);
  if ($("lastReconciliation")) $("lastReconciliation").textContent = date(data.lastReconciliationAt);
}

async function loadTreasury() {
  try {
    renderTreasury(await ensureTreasury());
  } catch (e) {
    console.error(e);
    toast("Unable to load treasury", "error");
  }
}

async function loadPendingWithdrawals() {
  try {
    const snap = await getDocs(query(collection(db, "withdrawalRequests"), orderBy("createdAt", "desc")));
    const pending = snap.docs
      .map(d => d.data())
      .filter(x => String(x.status || "pending").toLowerCase() === "pending")
      .reduce((sum, x) => sum + Number(x.amount || 0), 0);

    const ref = doc(db, "finance", "treasury");
    await updateDoc(ref, { pendingWithdrawals: pending, updatedAt: serverTimestamp() });
    const treasury = await getDoc(ref);
    if (treasury.exists()) renderTreasury(treasury.data());
  } catch (e) {
    console.error("Pending withdrawals load failed:", e);
  }
}

async function loadWallets() {
  const snap = await getDocs(collection(db, "instructorWallets"));
  wallets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderWallets();

  const total = wallets.reduce((sum, w) => sum + Number(w.balance || 0), 0);
  if ($("instructorBalance")) $("instructorBalance").textContent = money(total);
  if ($("instructorWalletTotal")) $("instructorWalletTotal").textContent = money(total);
}

async function createMissingWallets() {
  const snap = await getDocs(collection(db, "instructors"));
  const existing = new Set(wallets.map(w => w.instructorId || w.id));
  let created = 0;

  for (const item of snap.docs) {
    if (existing.has(item.id)) continue;
    const data = item.data();
    await setDoc(doc(db, "instructorWallets", item.id), {
      name: data.fullName || data.name || "Instructor",
      instructorId: item.id,
      walletId: `WAL-${Date.now()}-${item.id.slice(0, 6)}`,
      balance: 0,
      pending: 0,
      totalPaid: 0,
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    created++;
  }

  if (created) await loadWallets();
}

function renderWallets() {
  const table = $("instructorWalletTable") || $("walletTable");
  if (!table) return;

  const term = ($("walletSearch")?.value || "").trim().toLowerCase();
  const filter = $("walletFilter")?.value || "all";

  const list = wallets.filter(w => {
    const status = String(w.status || "active").toLowerCase();
    const zero = Number(w.balance || 0) === 0;
    const text = `${w.name || ""} ${w.instructorId || ""} ${w.walletId || w.id}`.toLowerCase();
    return (!term || text.includes(term)) &&
      (filter === "all" || (filter === "empty" ? zero : status === filter));
  });

  table.innerHTML = list.length
    ? list.map(w => `<tr>
        <td><strong>${esc(w.name || "Unknown instructor")}</strong></td>
        <td>${esc(w.instructorId || "—")}</td>
        <td>${esc(w.walletId || w.id)}</td>
        <td><strong>${money(w.balance)}</strong></td>
        <td><span class="status ${esc(String(w.status || "active").toLowerCase())}">${esc(w.status || "active")}</span></td>
        <td>${date(w.updatedAt || w.createdAt)}</td>
        <td><button class="secondary-btn" data-wallet-action="manage" data-id="${esc(w.id)}">Manage</button></td>
      </tr>`).join("")
    : `<tr><td colspan="7" class="empty-table">No instructor wallets found.</td></tr>`;
}

async function loadTransactions() {
  try {
    const snap = await getDocs(query(collection(db, "financeTransactions"), orderBy("createdAt", "desc")));
    transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTransactions();

    const today = new Date();
    const count = transactions.filter(t => {
      const d = t.createdAt?.toDate ? t.createdAt.toDate() : null;
      return d && d.toDateString() === today.toDateString() &&
        ["transfer", "credit", "debit", "deposit", "withdrawal"].includes(String(t.type || "").toLowerCase());
    }).length;
    if ($("transferCount")) $("transferCount").textContent = count;
  } catch (e) {
    console.error("Transaction load failed:", e);
  }
}

function renderTransactions() {
  const table = $("transactionHistoryTable");
  if (!table) return;

  const term = ($( "transactionHistorySearch")?.value || "").trim().toLowerCase();
  const filter = $("transactionHistoryFilter")?.value || "all";
  const list = transactions.filter(t => {
    const type = String(t.type || "").toLowerCase();
    const text = JSON.stringify(t).toLowerCase();
    return (!term || text.includes(term)) &&
      (filter === "all" || type === filter || (filter === "salary" && type === "payroll"));
  });

  table.innerHTML = list.length
    ? list.map(t => `<tr>
        <td>${esc(t.transactionId || t.id)}</td>
        <td>${esc(t.type || "—")}</td>
        <td>${esc(t.from || "—")}</td>
        <td>${esc(t.to || "—")}</td>
        <td>${money(t.amount)}</td>
        <td><span class="status ${t.status === "completed" ? "completed" : "pending"}">${esc(t.status || "pending")}</span></td>
        <td>${esc(t.approvedBy || "—")}</td>
        <td>${date(t.createdAt)}</td>
        <td><button class="secondary-btn" data-tx-id="${esc(t.id)}">View</button></td>
      </tr>`).join("")
    : `<tr><td colspan="9" class="empty-table">No financial transactions found.</td></tr>`;
}

async function loadAuditLogs() {
  try {
    const snap = await getDocs(query(collection(db, "audit_logs"), orderBy("createdAt", "desc")));
    auditLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderAuditLogs();
  } catch (e) {
    console.error(e);
    renderAuditLogs("Audit logs unavailable.");
  }
}

function renderAuditLogs(message) {
  const list = $("auditList");
  if (!list) return;
  if (message) {
    list.innerHTML = `<div class="audit-item"><div class="audit-icon">⚠️</div><div><h4>Audit service</h4><p>${esc(message)}</p></div></div>`;
    return;
  }

  list.innerHTML = auditLogs.length
    ? auditLogs.slice(0, 20).map(x => `<div class="audit-item">
        <div class="audit-icon">🛡</div>
        <div><h4>${esc(x.action || "Financial activity")}</h4>
        <p>${esc(x.details || x.target || "—")}</p>
        <small>${esc(x.role || "founder")} • ${date(x.createdAt)}</small></div>
      </div>`).join("")
    : `<div class="audit-item"><div class="audit-icon">🔒</div><div><h4>System Ready</h4><p>Financial audit logs will appear here.</p><small>Waiting for activity…</small></div></div>`;
}

async function audit(action, target, details) {
  await addDoc(collection(db, "audit_logs"), {
    user: currentUser.uid,
    role: "founder",
    action,
    target,
    details,
    createdAt: serverTimestamp()
  });
}

async function loadSecurity() {
  const ref = doc(db, "finance", "security");
  const snap = await getDoc(ref);
  financeSecurity = snap.exists()
    ? { ...financeSecurity, ...snap.data() }
    : { ...financeSecurity };

  if (!snap.exists()) await setDoc(ref, { ...financeSecurity, updatedAt: serverTimestamp() });

  if ($("approvalLimit")) $("approvalLimit").value = financeSecurity.withdrawalLimit ?? 50000;
  if ($("lockTreasury")) $("lockTreasury").checked = financeSecurity.treasuryLocked === true;
  if ($("freezeWallets")) $("freezeWallets").checked = financeSecurity.freezeWallets === true;
  if ($("auditNotifications")) $("auditNotifications").checked = financeSecurity.auditNotifications !== false;
  if ($("treasuryStatus")) {
    $("treasuryStatus").textContent = financeSecurity.treasuryLocked ? "Locked" : "Secure";
    $("treasuryStatus").className = `status ${financeSecurity.treasuryLocked ? "frozen" : "connected"}`;
  }
  if ($("lastSecurityCheck")) $("lastSecurityCheck").textContent = date(financeSecurity.updatedAt);
}

async function saveSecurity() {
  const limit = Number($("approvalLimit")?.value || 50000);
  if (!Number.isFinite(limit) || limit < 0) throw new Error("Approval limit must be zero or higher.");

  financeSecurity = {
    withdrawalLimit: limit,
    treasuryLocked: $("lockTreasury")?.checked === true,
    freezeWallets: $("freezeWallets")?.checked === true,
    auditNotifications: $("auditNotifications")?.checked !== false
  };

  await setDoc(doc(db, "finance", "security"), {
    ...financeSecurity,
    updatedAt: serverTimestamp()
  }, { merge: true });

  await Promise.all(wallets.map(w => updateDoc(doc(db, "instructorWallets", w.id), {
    status: financeSecurity.freezeWallets ? "frozen" : (w.status === "frozen" ? "active" : w.status || "active"),
    updatedAt: serverTimestamp()
  })));

  await audit("Security Settings Updated", "Finance Security", "Founder changed wallet controls");
  toast("Security settings saved");
  await Promise.all([loadWallets(), loadSecurity(), loadAuditLogs()]);
}

async function walletAction(id, action, amount, reason) {
  if (!id) throw new Error("Select a wallet first.");
  if (financeSecurity.freezeWallets) throw new Error("All instructor wallets are currently frozen.");

  const ref = doc(db, "instructorWallets", id);
  const wallet = wallets.find(w => w.id === id);
  if (!wallet) throw new Error("Wallet not found.");

  if (action === "freeze" || action === "unfreeze") {
    await updateDoc(ref, {
      status: action === "freeze" ? "frozen" : "active",
      updatedAt: serverTimestamp()
    });
    await audit(`Wallet ${action}`, id, reason || `Wallet ${action}`);
    toast(action === "freeze" ? "Wallet frozen" : "Wallet activated");
    return;
  }

  const value = Number(amount || 0);
  const note = String(reason || "").trim();
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter a valid positive amount.");
  if (!note) throw new Error("A reason is required.");
  if (wallet.status === "frozen") throw new Error("This wallet is frozen.");

  if (value > Number(financeSecurity.withdrawalLimit || 50000)) {
    throw new Error(`Amount exceeds the configured approval limit of ${money(financeSecurity.withdrawalLimit)}.`);
  }
  if (financeSecurity.treasuryLocked) throw new Error("Treasury is locked. Unlock it before moving funds.");

  const treasuryRef = doc(db, "finance", "treasury");
  let transactionId = `TX-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  await runTransaction(db, async tx => {
    const [walletSnap, treasurySnap] = await Promise.all([tx.get(ref), tx.get(treasuryRef)]);
    if (!walletSnap.exists()) throw new Error("Wallet not found.");
    if (!treasurySnap.exists()) throw new Error("Treasury is not initialized.");

    const walletData = walletSnap.data();
    const treasuryData = treasurySnap.data();
    const walletBalance = Number(walletData.balance || 0);
    const treasuryBalance = Number(treasuryData.balance || 0);

    if (action === "credit" && treasuryBalance < value) {
      throw new Error(`Insufficient treasury funds. Available: ${money(treasuryBalance)}.`);
    }
    if (action === "debit" && walletBalance < value) {
      throw new Error("Insufficient wallet balance.");
    }

    const nextWallet = action === "credit" ? walletBalance + value : walletBalance - value;
    const nextTreasury = action === "credit" ? treasuryBalance - value : treasuryBalance + value;

    tx.update(ref, {
      balance: nextWallet,
      totalPaid: action === "debit" ? Number(walletData.totalPaid || 0) + value : Number(walletData.totalPaid || 0),
      updatedAt: serverTimestamp()
    });

    tx.update(treasuryRef, {
      balance: nextTreasury,
      updatedAt: serverTimestamp()
    });
  });

  await addDoc(collection(db, "financeTransactions"), {
    transactionId,
    type: "transfer",
    direction: action,
    from: action === "credit" ? "Academy Treasury" : id,
    to: action === "credit" ? id : "Academy Treasury",
    amount: value,
    description: note,
    status: "completed",
    approvedBy: currentUser.uid,
    createdAt: serverTimestamp()
  });

  await audit(`Wallet ${action}`, id, `${money(value)} • ${note}`);
  toast(action === "credit" ? "Funds transferred to wallet" : "Funds returned to treasury");
}

function openWallet(id) {
  selectedWallet = id;
  $("walletModal")?.classList.add("show");
  if ($("walletAmount")) $("walletAmount").value = "";
  if ($("walletReason")) $("walletReason").value = "";
}

function closeWallet() {
  $("walletModal")?.classList.remove("show");
  selectedWallet = null;
}

function showTransaction(id) {
  const tx = transactions.find(item => item.id === id);
  if (!tx) return;
  toast(`${tx.transactionId || tx.id} • ${money(tx.amount)} • ${tx.type || "transaction"}`);
}

function exportCSV(filename, rows) {
  const csv = rows.map(row => row.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function reconcileAccounts() {
  const treasuryRef = doc(db, "finance", "treasury");
  await updateDoc(treasuryRef, { lastReconciliationAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await audit("Finance Reconciliation", "Treasury", "Manual reconciliation completed");
  await Promise.all([loadTreasury(), loadWallets(), loadAuditLogs()]);
  toast("Accounts reconciled");
}

async function refreshAll() {
  toast("Refreshing financial data…");
  await Promise.all([loadTreasury(), loadWallets(), loadTransactions(), loadAuditLogs(), loadSecurity()]);
  await loadPendingWithdrawals();
  toast("Financial data updated");
}

function bindEvents() {
  $("refreshWallets")?.addEventListener("click", refreshAll);
  $("refreshFinance")?.addEventListener("click", refreshAll);
  $("walletSearch")?.addEventListener("input", renderWallets);
  $("walletFilter")?.addEventListener("change", renderWallets);
  $("transactionHistorySearch")?.addEventListener("input", renderTransactions);
  $("transactionHistoryFilter")?.addEventListener("change", renderTransactions);

  [$("walletTable"), $("instructorWalletTable")].filter(Boolean).forEach(table => {
    table.addEventListener("click", e => {
      const button = e.target.closest("[data-wallet-action]");
      if (button) openWallet(button.dataset.id);
    });
  });

  $("transactionHistoryTable")?.addEventListener("click", e => {
    const button = e.target.closest("[data-tx-id]");
    if (button) showTransaction(button.dataset.txId);
  });

  $("closeWalletModal")?.addEventListener("click", closeWallet);
  $("cancelWalletAction")?.addEventListener("click", closeWallet);
  $("walletModal")?.addEventListener("click", e => {
    if (e.target.id === "walletModal") closeWallet();
  });

  $("confirmWalletAction")?.addEventListener("click", async () => {
    try {
      await walletAction(
        selectedWallet,
        $("walletAction")?.value,
        $("walletAmount")?.value,
        $("walletReason")?.value || ""
      );
      closeWallet();
      await refreshAll();
    } catch (e) {
      console.error(e);
      toast(e.message || "Wallet action failed", "error");
    }
  });

  $("saveSecuritySettings")?.addEventListener("click", () => saveSecurity().catch(e => {
    console.error(e);
    toast(e.message || "Unable to save security settings", "error");
  }));

  $("backupWallets")?.addEventListener("click", () => exportCSV("academy-wallets.csv", [
    ["Instructor", "Wallet ID", "Balance", "Status", "Updated"],
    ...wallets.map(w => [w.name, w.walletId || w.id, w.balance || 0, w.status || "active", date(w.updatedAt)])
  ]));

  $("exportFinance")?.addEventListener("click", () => exportCSV("academy-finance.csv", [
    ["Transaction", "Type", "Amount", "Status", "Date"],
    ...transactions.map(t => [t.transactionId || t.id, t.type, t.amount, t.status, date(t.createdAt)])
  ]));

  $("exportLedger")?.addEventListener("click", () => exportCSV("academy-financial-ledger.csv", [
    ["Transaction", "Type", "From", "To", "Amount", "Status", "Date"],
    ...transactions.map(t => [t.transactionId || t.id, t.type, t.from, t.to, t.amount, t.status, date(t.createdAt)])
  ]));

  $("exportAuditLogs")?.addEventListener("click", () => exportCSV("academy-audit-logs.csv", [
    ["Action", "Target", "Details", "Date"],
    ...auditLogs.map(a => [a.action, a.target, a.details, date(a.createdAt)])
  ]));

  $("backupFinance")?.addEventListener("click", () => exportCSV("academy-finance-backup.csv", [
    ["Transaction", "Type", "From", "To", "Amount", "Status", "Date"],
    ...transactions.map(t => [t.transactionId || t.id, t.type, t.from, t.to, t.amount, t.status, date(t.createdAt)])
  ]));

  $("reconcileAccounts")?.addEventListener("click", () => reconcileAccounts().catch(e => {
    console.error(e);
    toast(e.message || "Reconciliation failed", "error");
  }));

  $("depositFunds")?.addEventListener("click", () => toast("External deposits must be recorded through the approved payment flow."));
  $("withdrawFunds")?.addEventListener("click", () => { location.href = "payouts.html"; });
  $("transferFunds")?.addEventListener("click", () => toast("Select an instructor wallet and use Manage to transfer funds."));
}

async function boot() {
  bindEvents();

  onAuthStateChanged(auth, async user => {
    if (!user) {
      location.href = "../../login.html";
      return;
    }

    currentUser = user;
    try {
      if (!await verifyFounder(user)) return;
      await loadSecurity();
      await loadTreasury();
      await loadWallets();
      await createMissingWallets();
      await loadTransactions();
      await loadAuditLogs();
      await loadPendingWithdrawals();
      console.log("✓ Founder wallet system ready");
    } catch (e) {
      console.error("Wallet boot failed:", e);
      toast("Unable to initialize wallet system", "error");
    }
  });
}

boot();
