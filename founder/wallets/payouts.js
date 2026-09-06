import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, query, orderBy, onSnapshot, doc, getDoc, updateDoc,
  addDoc, serverTimestamp, runTransaction
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
  if (!snap.exists() || data.role !== "founder" || data.status === "suspended") {
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

async function recordAudit(action, target, details) {
  await addDoc(collection(db, "audit_logs"), {
    user: me.uid, role: "founder", action, target, details, createdAt: serverTimestamp()
  });
}

async function action(id, type) {
  if (type === "view") {
    const row = rows.find(x => x.id === id);
    if (row) toast(`${names.get(row.instructorId) || "Instructor"} • ${money(row.amount)} • ${row.status || "pending"}`);
    return;
  }

  if (financeSecurity.treasuryLocked) throw new Error("Treasury is locked. Unlock it before processing payouts.");

  const ref = doc(db, "withdrawalRequests", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Payout request no longer exists.");

  const row = snap.data();
  const current = String(row.status || "pending").toLowerCase();
  if (["approve", "reject"].includes(type) && current !== "pending") throw new Error("Only pending requests can be reviewed.");
  if (type === "paid" && current !== "approved") throw new Error("Only approved requests can be marked paid.");

  const amount = Number(row.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Invalid payout amount.");
  if (amount > Number(financeSecurity.withdrawalLimit || 50000)) throw new Error(`Payout exceeds the configured limit of ${money(financeSecurity.withdrawalLimit)}.`);

  const status = type === "approve" ? "approved" : type === "reject" ? "rejected" : "paid";
  const treasuryRef = doc(db, "finance", "treasury");

  if (status === "paid") {
    await runTransaction(db, async tx => {
      const [requestSnap, treasurySnap] = await Promise.all([tx.get(ref), tx.get(treasuryRef)]);
      if (!requestSnap.exists()) throw new Error("Payout request no longer exists.");
      if (!treasurySnap.exists()) throw new Error("Treasury is not initialized.");

      const latest = requestSnap.data();
      if (String(latest.status || "pending").toLowerCase() !== "approved") throw new Error("This payout is no longer approved for settlement.");

      const treasuryBalance = Number(treasurySnap.data().balance || 0);
      if (treasuryBalance < amount) throw new Error(`Insufficient treasury funds. Available: ${money(treasuryBalance)}.`);

      tx.update(ref, { status:"paid", paidBy:me.uid, paidAt:serverTimestamp(), updatedAt:serverTimestamp() });
      tx.update(treasuryRef, { balance:treasuryBalance - amount, updatedAt:serverTimestamp() });
    });
  } else {
    await updateDoc(ref, {
      status,
      reviewedBy: me.uid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }

  if (status === "approved" || status === "paid") {
    await addDoc(collection(db, "financeTransactions"), {
      transactionId: `PAY-${Date.now()}-${Math.random().toString(36).slice(2,7).toUpperCase()}`,
      type: "withdrawal",
      from: "Academy Treasury",
      to: row.instructorId || "Instructor",
      amount,
      status: status === "paid" ? "completed" : "approved",
      payoutRequestId: id,
      approvedBy: me.uid,
      createdAt: serverTimestamp()
    });
  }

  await recordAudit(`payout_${status}`, id, `${money(amount)} • ${row.instructorId || "Instructor"}`);
  toast(`Payout ${status}.`);
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
