import { db } from "../../js/firebase.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = id => document.getElementById(id);
const money = n => `KES ${Number(n || 0).toLocaleString()}`;
const esc = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#039;"}[c]));

let payments = [];
let withdrawals = [];
let chart = null;
let paymentError = false;
let withdrawalError = false;

function dateOf(v) {
  try { return v?.toDate?.() || (v ? new Date(v) : null); } catch { return null; }
}

function statusOf(v) { return String(v || "").toLowerCase().trim(); }
function statusOk(v) { return ["success", "completed"].includes(statusOf(v)); }
function typeOf(d) { return String(d.type || d.paymentType || "course").toLowerCase().trim(); }
function methodOf(d) { return String(d.method || d.paymentMethod || "m-pesa").toLowerCase().trim(); }
function paymentAmount(d) { return Number(d.amount || 0); }

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function renderPayments() {
  const table = $("transactionsTable");
  if (!table) return;
  if (paymentError) {
    table.innerHTML = '<tr><td colspan="9" class="empty-table error-state">Unable to load payments. Refresh and try again.</td></tr>';
    return;
  }

  const search = String($("transactionSearch")?.value || "").toLowerCase().trim();
  const filter = $("transactionFilter")?.value || "all";
  const rows = payments.filter(d => {
    const status = statusOf(d.status);
    const haystack = [
      d.receipt, d.reference, d.studentName, d.name, d.email,
      d.admissionNo, d.type, d.paymentType, d.method, d.paymentMethod, d.course
    ].join(" ").toLowerCase();
    const matchesFilter = filter === "all" || status === filter || (filter === "completed" && status === "success");
    return matchesFilter && haystack.includes(search);
  });

  if (!rows.length) {
    table.innerHTML = '<tr><td colspan="9" class="empty-table">No matching transactions.</td></tr>';
    return;
  }

  table.innerHTML = rows.map(d => {
    const dt = dateOf(d.createdAt);
    const status = statusOf(d.status) || "unknown";
    return `<tr>
      <td>${esc(d.receipt || d.reference || "--")}</td>
      <td>${esc(d.studentName || d.name || d.email || "Unknown")}</td>
      <td>${esc(d.admissionNo || "--")}</td>
      <td>${esc(d.type || d.paymentType || "Course")}</td>
      <td>${esc(d.method || d.paymentMethod || "M-Pesa")}</td>
      <td>${money(paymentAmount(d))}</td>
      <td><span class="status ${esc(status)}">${esc(status)}</span></td>
      <td>${dt && !Number.isNaN(dt.getTime()) ? esc(dt.toLocaleString()) : "--"}</td>
      <td><button class="table-action" data-view="${esc(d.id)}">View</button></td>
    </tr>`;
  }).join("");
}

function completedPayments() { return payments.filter(d => statusOk(d.status)); }

function getRevenueSeries(period) {
  const completed = completedPayments();
  const now = new Date();
  const daily = {};

  if (period === 365) {
    completed.forEach(d => {
      const dt = dateOf(d.createdAt);
      if (!dt || Number.isNaN(dt.getTime())) return;
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      daily[key] = (daily[key] || 0) + paymentAmount(d);
    });
    const keys = Object.keys(daily).sort().slice(-12);
    return { labels: keys, values: keys.map(k => daily[k]) };
  }

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (period - 1));

  for (let i = 0; i < period; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    daily[key] = 0;
  }

  completed.forEach(d => {
    const dt = dateOf(d.createdAt);
    if (!dt || Number.isNaN(dt.getTime())) return;
    const key = dt.toISOString().slice(0, 10);
    if (key in daily) daily[key] += paymentAmount(d);
  });

  const labels = Object.keys(daily);
  return { labels, values: labels.map(k => daily[k]) };
}

function drawChart() {
  const canvas = $("revenueChart");
  if (!canvas || typeof Chart === "undefined") return;
  const period = Number($("chartPeriod")?.value || 30);
  const { labels, values } = getRevenueSeries(period);
  chart?.destroy();
  chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Revenue (KES)",
        data: values,
        tension: 0.35,
        fill: true,
        pointRadius: period === 365 ? 3 : 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { callback: value => `KES ${Number(value).toLocaleString()}` } },
        x: { ticks: { maxTicksLimit: period === 365 ? 12 : 8 } }
      }
    }
  });
}

function renderMetrics() {
  if (paymentError) {
    ["totalRevenue","monthlyRevenue","todayRevenue","courseRevenue","registrationRevenue","certificateRevenue","examRevenue","breakdownTotal","mpesaRevenue","cardRevenue","bankRevenue","paypalRevenue","highestTransaction","dailyAverage","bestRevenueDay","monthlyGrowth"].forEach(id => setText(id, id === "monthlyGrowth" ? "—" : "—"));
    setText("transactionCount", "—");
    setText("successfulPayments", "—");
    setText("pendingPayments", "—");
    setText("failedPayments", "—");
    renderPayments();
    return;
  }

  const now = new Date();
  const currentMonth = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonth = previousMonthDate.getFullYear() + "-" + String(previousMonthDate.getMonth() + 1).padStart(2, "0");
  const todayKey = now.toISOString().slice(0, 10);

  let total = 0, month = 0, previousMonthTotal = 0, today = 0;
  let success = 0, pending = 0, failed = 0;
  let course = 0, registration = 0, certificate = 0, exam = 0;
  let mpesa = 0, card = 0, bank = 0, paypal = 0, highest = 0;
  const daily = {};

  payments.forEach(d => {
    const amount = paymentAmount(d);
    const status = statusOf(d.status);
    const dt = dateOf(d.createdAt);
    const dayKey = dt && !Number.isNaN(dt.getTime()) ? dt.toISOString().slice(0, 10) : null;
    const monthKey = dayKey?.slice(0, 7);

    if (status === "pending") pending++;
    else if (statusOk(status)) {
      success++;
      total += amount;
      highest = Math.max(highest, amount);
      if (dayKey) daily[dayKey] = (daily[dayKey] || 0) + amount;
      if (dayKey === todayKey) today += amount;
      if (monthKey === currentMonth) month += amount;
      if (monthKey === previousMonth) previousMonthTotal += amount;

      switch (typeOf(d)) {
        case "registration": registration += amount; break;
        case "certificate": certificate += amount; break;
        case "exam": case "examination": exam += amount; break;
        default: course += amount;
      }

      switch (methodOf(d)) {
        case "card": case "credit card": case "debit card": card += amount; break;
        case "bank": case "bank transfer": case "bank_transfer": bank += amount; break;
        case "paypal": paypal += amount; break;
        default: mpesa += amount;
      }
    } else failed++;
  });

  const dayKeys = Object.keys(daily).sort();
  const avg = dayKeys.length ? total / dayKeys.length : 0;
  const best = dayKeys.length ? dayKeys.reduce((a, b) => daily[b] > daily[a] ? b : a) : null;
  const growth = previousMonthTotal === 0 ? (month > 0 ? 100 : 0) : ((month - previousMonthTotal) / previousMonthTotal) * 100;

  setText("totalRevenue", money(total));
  setText("monthlyRevenue", money(month));
  setText("todayRevenue", money(today));
  setText("transactionCount", payments.length.toLocaleString());
  setText("successfulPayments", success.toLocaleString());
  setText("pendingPayments", pending.toLocaleString());
  setText("failedPayments", failed.toLocaleString());
  setText("courseRevenue", money(course));
  setText("registrationRevenue", money(registration));
  setText("certificateRevenue", money(certificate));
  setText("examRevenue", money(exam));
  setText("breakdownTotal", money(total));
  setText("mpesaRevenue", money(mpesa));
  setText("cardRevenue", money(card));
  setText("bankRevenue", money(bank));
  setText("paypalRevenue", money(paypal));
  setText("monthlyGrowth", `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}%`);
  setText("dailyAverage", money(avg));
  setText("bestRevenueDay", best ? `${best} (${money(daily[best])})` : "--");
  setText("highestTransaction", money(highest));

  drawChart();
  renderPayments();
}

function renderWithdrawals() {
  const table = $("withdrawalsTable");
  if (!table) return;
  if (withdrawalError) {
    table.innerHTML = '<tr><td colspan="6" class="empty-table error-state">Unable to load withdrawals. Refresh and try again.</td></tr>';
    setText("pendingWithdrawals", "—");
    return;
  }
  if (!withdrawals.length) {
    table.innerHTML = '<tr><td colspan="6" class="empty-table">No withdrawal requests found.</td></tr>';
    setText("pendingWithdrawals", money(0));
    return;
  }

  let pendingAmount = 0;
  table.innerHTML = withdrawals.map(d => {
    const status = statusOf(d.status) || "unknown";
    if (status === "pending") pendingAmount += paymentAmount(d);
    const dt = dateOf(d.requestedAt);
    return `<tr>
      <td>${esc(d.instructor || d.instructorName || d.name || "Unknown")}</td>
      <td>${esc(d.method || "--")}</td>
      <td>${money(paymentAmount(d))}</td>
      <td><span class="status ${esc(status)}">${esc(status)}</span></td>
      <td>${dt && !Number.isNaN(dt.getTime()) ? esc(dt.toLocaleDateString()) : "--"}</td>
      <td>${status === "pending" ? `<button class="withdraw-action approve" data-id="${esc(d.id)}">Approve</button> <button class="withdraw-action reject" data-id="${esc(d.id)}">Reject</button>` : "—"}</td>
    </tr>`;
  }).join("");
  setText("pendingWithdrawals", money(pendingAmount));
}

function showLoadingState() {
  setText("totalRevenue", "Loading…");
  setText("monthlyRevenue", "Loading…");
  setText("todayRevenue", "Loading…");
  setText("pendingWithdrawals", "Loading…");
  if ($("transactionsTable")) $("transactionsTable").innerHTML = '<tr><td colspan="9" class="empty-table">Loading live payment data…</td></tr>';
  if ($("withdrawalsTable")) $("withdrawalsTable").innerHTML = '<tr><td colspan="6" class="empty-table">Loading live withdrawal requests…</td></tr>';
}

showLoadingState();

onSnapshot(
  query(collection(db, "payments"), orderBy("createdAt", "desc")),
  snap => { paymentError = false; payments = snap.docs.map(x => ({ id: x.id, ...x.data() })); renderMetrics(); },
  error => { paymentError = true; console.error("Revenue payments:", error); renderMetrics(); }
);

onSnapshot(
  query(collection(db, "withdrawals"), orderBy("requestedAt", "desc")),
  snap => { withdrawalError = false; withdrawals = snap.docs.map(x => ({ id: x.id, ...x.data() })); renderWithdrawals(); },
  error => { withdrawalError = true; console.error("Revenue withdrawals:", error); renderWithdrawals(); }
);

$("transactionSearch")?.addEventListener("input", renderPayments);
$("transactionFilter")?.addEventListener("change", renderPayments);
$("chartPeriod")?.addEventListener("change", drawChart);
$("refreshRevenue")?.addEventListener("click", () => renderMetrics());
$("refreshRevenueDashboard")?.addEventListener("click", () => renderMetrics());
$("refreshWithdrawals")?.addEventListener("click", renderWithdrawals);

async function updateWithdrawal(id, status) {
  if (!id || !status) return;
  if (!confirm(`Mark this withdrawal as ${status}?`)) return;
  try {
    await updateDoc(doc(db, "withdrawals", id), { status, processedAt: new Date() });
  } catch (error) {
    console.error("Withdrawal update:", error);
    alert("Could not update withdrawal. Check permissions and try again.");
  }
}

document.addEventListener("click", async event => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const id = target.dataset.id;
  if (target.classList.contains("approve")) await updateWithdrawal(id, "completed");
  if (target.classList.contains("reject")) await updateWithdrawal(id, "failed");
});

$("exportCSV")?.addEventListener("click", () => {
  const rows = payments.map(d => [
    d.receipt || d.reference || "",
    d.studentName || d.name || d.email || "",
    d.admissionNo || "",
    d.type || d.paymentType || "Course",
    d.method || d.paymentMethod || "M-Pesa",
    paymentAmount(d),
    d.status || "",
    dateOf(d.createdAt)?.toISOString() || ""
  ]);
  const csv = [["Receipt","Student","Admission","Type","Method","Amount","Status","Date"], ...rows]
    .map(row => row.map(value => `"${String(value).replaceAll('"','""')}"`).join(","))
    .join("\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `SSA-revenue-${new Date().toISOString().slice(0,10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

$("printReport")?.addEventListener("click", () => window.print());
$("exportPDF")?.addEventListener("click", () => {
  document.title = `SSA Revenue Report ${new Date().toISOString().slice(0,10)}`;
  window.print();
  setTimeout(() => { document.title = "Revenue Analytics | Founder OS"; }, 1000);
});

$("monthlyReport")?.addEventListener("click", () => {
  const month = $("monthlyRevenue")?.textContent || "KES 0";
  alert(`Current month completed revenue: ${month}`);
});

$("annualReport")?.addEventListener("click", () => {
  const year = new Date().getFullYear();
  const total = completedPayments().filter(d => dateOf(d.createdAt)?.getFullYear() === year).reduce((sum, d) => sum + paymentAmount(d), 0);
  alert(`${year} completed revenue: ${money(total)}`);
});

$("forecastReport")?.addEventListener("click", () => {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 29);
  const last30Days = completedPayments().filter(d => {
    const dt = dateOf(d.createdAt);
    return dt && dt >= cutoff;
  }).reduce((sum, d) => sum + paymentAmount(d), 0);
  alert(`30-day run-rate estimate: ${money(last30Days)} based on completed revenue from the last 30 days.`);
});
