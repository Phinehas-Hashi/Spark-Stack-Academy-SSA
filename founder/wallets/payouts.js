import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc,
  serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
let me = null;
let rows = [];
let financeSecurity = { treasuryLocked: false, withdrawalLimit: 50000 };
const names = new Map();

const money = n => `KES ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = v => {
  if (!v) return "—";
  try {
    const d = v?.toDate ? v.toDate() : new Date(v);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
  } catch { return "—"; }
};
const esc = v => String(v ?? "").replace(/[&<>\"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#039;" }[c]));

function toast(message, type = "success") {
  const t = $("toast");
  if (!t) return;
  t.textContent = message;
  t.className = `toast show ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2800);
}

async function verifyFounder(user) {
  const snap = await getDoc(doc(db, "founder", user.uid));
  const data = snap.exists() ? snap.data() : {};
  if (!snap.exists() || data.role !== "founder" || data.status !== "active" || data.active === false || data.verified === false) {
    toast("Founder authorization required", "error");
    setTimeout(() => { location.href = "../dashboard.html"; }, 900);
    return false;
  }
  return true;
}

async function loadFinanceSecurity() {
  try {
    const snap = await getDoc(doc(db, "finance", "security"));
    if (snap.exists()) financeSecurity = { ...financeSecurity, ...snap.data() };
  } catch (e) { console.error("Finance security load failed:", e); }
}

async function resolveNames(items) {
  const ids = [...new Set(items.map(x => x.instructorId).filter(Boolean))];
  await Promise.all(ids.map(async uid => {
    if (names.has(uid)) return;
    try {
      const snap = await getDoc(doc(db, "users", uid));
      names.set(uid, snap.exists() ? (snap.data().fullName || snap.data().name || snap.data().email || uid) : uid);
    } catch { names.set(uid, uid); }
  }));
}

function render() {
  const term = ($("payoutSearch")?.value || "").trim().toLowerCase();
  const filter = $("payoutStatus")?.value || "all";
  const totals = { pending:[0,0], approved:[0,0], paid:[0,0], rejected:[0,0] };

  rows.forEach(x => {
    const status = String(x.status || "pending").toLowerCase();
    if (totals[status]) { totals[status][0] += Number(x.amount || 0); totals[status][1]++; }
  });

  ["pending", "approved", "paid", "rejected"].forEach(status => {
    if ($(`${status}Amount`)) $(`${status}Amount`).textContent = money(totals[status][0]);
    if ($(`${status}Count`)) $(`${status}Count`).textContent = `${totals[status][1]} ${status === "paid" ? "payouts" : "requests"}`;
  });

  const list = rows.filter(x => {
    const status = String(x.status || "pending").toLowerCase();
    const text = JSON.stringify({ ...x, instructorName: names.get(x.instructorId) || "" }).toLowerCase();
    return (filter === "all" || status === filter) && (!term || text.includes(term));
  });

  const table = $("payoutTable");
  if (!table) return;
  table.innerHTML = list.length ? list.map(x => {
    const status = String(x.status || "pending").toLowerCase();
    const name = names.get(x.instructorId) || x.instructorName || "Instructor";
    const actions = status === "pending"
      ? `<button class="action approve" data-a="approve" data-id="${esc(x.id)}">Approve</button><button class="action reject" data-a="reject" data-id="${esc(x.id)}">Reject</button>`
      : status === "approved"
        ? `<button class="action approve" data-a="paid" data-id="${esc(x.id)}">Mark paid</button>`
        : `<button class="action" data-a="view" data-id="${esc(x.id)}">View</button>`;
    return `<tr>
      <td><div class="person-cell"><span class="person-avatar">${esc(name.slice(0,1).toUpperCase())}</span><div><strong>${esc(name)}</strong><small>${esc(x.instructorId || "—")}</small></div></div></td>
      <td><strong>${money(x.amount)}</strong><small class="sub-value">Net ${money(x.netAmount ?? Math.max(Number(x.amount || 0) - Number(x.withdrawalFee || 0), 0))}</small></td>
      <td><strong>${esc(x.method || "M-PESA")}</strong><small class="sub-value">${esc(x.account || "—")}</small></td>
      <td>${date(x.createdAt || x.requestedAt)}</td>
      <td><span class="status ${esc(status)}">${esc(status)}</span></td>
      <td><div class="actions">${actions}</div></td>
    </tr>`;
  }).join("") : `<tr><td colspan="6" class="empty">No payout requests found.</td></tr>`;
}


async function action(id, type) {
  if (type === "view") {
    const row = rows.find(x => x.id === id);
    if (row) toast(`${names.get(row.instructorId) || "Instructor"} • ${money(row.amount)} • ${row.status || "pending"}`);
    return;
  }

  if (!window.SSAOnlineActionGuard?.requireOnline("Processing an instructor payout")) return;
  if (financeSecurity.treasuryLocked) throw new Error("Treasury is locked. Unlock it before processing payouts.");

  const payoutRef = doc(db, "withdrawalRequests", id);
  const snapshot = await getDoc(payoutRef);
  if (!snapshot.exists()) throw new Error("Payout request no longer exists.");
  const row = snapshot.data();
  const current = String(row.status || "pending").toLowerCase();
  if (["approve", "reject"].includes(type) && current !== "pending") throw new Error("Only pending requests can be reviewed.");
  if (type === "paid" && current !== "approved") throw new Error("Only approved requests can be marked paid.");

  const amount = Number(row.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid payout amount.");
  if (amount > Number(financeSecurity.withdrawalLimit || 50000)) throw new Error(`Payout exceeds the configured limit of ${money(financeSecurity.withdrawalLimit)}.`);

  let reviewReason = "";
  if (type === "reject") {
    const rawReason = await window.ssaPrompt?.("Provide a reason for rejecting this payout request.", { title: "Reject payout", confirmText: "Continue", placeholder: "Explain why this payout cannot proceed..." });
    reviewReason = String(rawReason || "").trim().slice(0, 500);
    if (!reviewReason) throw new Error("A rejection reason is required.");
  }
  const confirmMessage = type === "paid"
    ? `Mark ${money(amount)} as paid to ${names.get(row.instructorId) || "this instructor"}? This will debit the treasury and instructor wallet.`
    : type === "approve"
      ? `Approve the ${money(amount)} payout request for ${names.get(row.instructorId) || "this instructor"}?`
      : `Reject the ${money(amount)} payout request? The reason will be recorded.`;
  const confirmed = window.ssaConfirm
    ? await window.ssaConfirm(confirmMessage, { title: type === "paid" ? "Confirm settlement" : type === "approve" ? "Approve payout" : "Reject payout", confirmText: type === "paid" ? "Mark paid" : type === "approve" ? "Approve" : "Reject", cancelText: "Cancel", danger: type === "reject" })
    : window.confirm(confirmMessage);
  if (!confirmed) return;

  const treasuryRef = doc(db, "finance", "treasury");
  const walletRef = doc(db, "instructorWallets", row.instructorId || "");
  const ledgerRef = doc(collection(db, "financeTransactions"));
  const transactionId = `PAY-${Date.now()}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;

  await runTransaction(db, async tx => {
    const latestSnap = await tx.get(payoutRef);
    if (!latestSnap.exists()) throw new Error("Payout request no longer exists.");
    const latest = latestSnap.data();
    const latestStatus = String(latest.status || "pending").toLowerCase();

    if (type === "approve" || type === "reject") {
      if (latestStatus !== "pending") throw new Error("This payout request has already been reviewed.");
      tx.update(payoutRef, {
        status: type === "approve" ? "approved" : "rejected",
        reviewedBy: me.uid,
        reviewedAt: serverTimestamp(),
        reviewReason: type === "reject" ? reviewReason : "",
        updatedAt: serverTimestamp()
      });
      return;
    }

    if (type !== "paid" || latestStatus !== "approved") throw new Error("Only approved requests can be settled.");
    if (latest.instructorId !== row.instructorId) throw new Error("Payout owner changed. Refresh and review again.");

    const [treasurySnap, walletSnap] = await Promise.all([tx.get(treasuryRef), tx.get(walletRef)]);
    if (!treasurySnap.exists()) throw new Error("Treasury is not initialized.");
    if (!walletSnap.exists()) throw new Error("Instructor wallet is missing. Reconcile the wallet before paying this request.");

    const treasuryBalance = Number(treasurySnap.data().balance || 0);
    const walletBalance = Number(walletSnap.data().balance || 0);
    if (String(walletSnap.data().status || "active").toLowerCase() !== "active") throw new Error("This instructor wallet is restricted and cannot be paid.");
    if (treasuryBalance < amount) throw new Error(`Insufficient treasury funds. Available: ${money(treasuryBalance)}.`);
    if (walletBalance < amount) throw new Error(`Insufficient instructor wallet balance. Available: ${money(walletBalance)}.`);

    tx.update(payoutRef, { status:"paid", walletBalanceDebited:true, paidBy:me.uid, paidAt:serverTimestamp(), updatedAt:serverTimestamp() });
    tx.update(treasuryRef, { balance:treasuryBalance-amount, updatedAt:serverTimestamp() });
    tx.update(walletRef, { balance:walletBalance-amount, totalPaid:Number(walletSnap.data().totalPaid||0)+amount, updatedAt:serverTimestamp() });
    tx.set(ledgerRef, {
      transactionId, type:"withdrawal", from:"Academy Treasury",
      to:row.instructorId || "Instructor", amount, status:"completed",
      payoutRequestId:id, approvedBy:me.uid, createdAt:serverTimestamp()
    });
  });

  window.ssaSecuritySignal?.("founder_action", { portal:"founder", note:`Payout request ${type === "paid" ? "settled" : type === "approve" ? "approved" : "rejected"}` });
  toast(`Payout ${type === "paid" ? "paid" : type === "approve" ? "approved" : "rejected"}.`);
}

function watch() {
  const q = query(collection(db, "withdrawalRequests"), orderBy("createdAt", "desc"));
  onSnapshot(q, async snapshot => {
    rows = snapshot.docs.map(d => ({ id:d.id, ...d.data() }));
    await resolveNames(rows);
    render();
  }, error => {
    console.error(error);
    toast("Unable to load payout requests.", "error");
  });
}

$("payoutSearch")?.addEventListener("input", render);
$("payoutStatus")?.addEventListener("change", render);
$("refreshPayouts")?.addEventListener("click", async () => {
  await loadFinanceSecurity();
  render();
  toast("Payout queue refreshed");
});
$("payoutTable")?.addEventListener("click", e => {
  const button = e.target.closest("button[data-a]");
  if (!button) return;
  action(button.dataset.id, button.dataset.a).catch(error => {
    console.error(error);
    toast(error.message || "Payout action failed", "error");
  });
});

onAuthStateChanged(auth, async user => {
  if (!user) { location.href = "../../login.html"; return; }
  me = user;
  try {
    if (!await verifyFounder(user)) return;
    await loadFinanceSecurity();
    watch();
  } catch (e) {
    console.error(e);
    toast("Security verification failed", "error");
  }
});
