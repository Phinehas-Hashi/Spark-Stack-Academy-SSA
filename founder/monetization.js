import { db } from "../js/firebase.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const ref = doc(db, "settings", "monetization");
const earningsRef = doc(db, "platformSettings", "earnings");
const $ = id => document.getElementById(id);

const defaults = {
  totalRevenue: 0, monthlyRevenue: 0, todayRevenue: 0, pendingWithdrawals: 0,
  courseFee: 5000, registrationFee: 1000, examinationFee: 500, certificateFee: 1000,
  premiumMonthly: 500, premiumQuarterly: 1350, premiumYearly: 4500,
  enablePremium: true, premiumCertificates: true,
  instructorCommission: 70, platformCommission: 30, enableInstructorEarnings: true, automaticPayouts: false,
  enableMpesa: true, enableCards: false, enablePaypal: false, enableBank: false,
  maxDiscount: 50, couponExpiry: 30, allowCoupons: true, allowScholarships: true,
  minimumWithdrawal: 1000, withdrawalFeePercent: 2, withdrawalTime: "24 Hours", enableWithdrawals: true, withdrawalApproval: true,
  enableRevenueDashboard: true, trackStudentPurchases: true, trackInstructorRevenue: true, monthlyRevenueReports: true,
  vatRate: 16, billingCycle: "Monthly", invoicePrefix: "SSA-INV",
  currency: "KES", currencySymbol: "KSh", decimalPlaces: 2,
  enablePayments: true, allowRefunds: false, refundDays: 7
};

const fields = [
  "courseFee","registrationFee","examinationFee","certificateFee","premiumMonthly","premiumQuarterly","premiumYearly",
  "instructorCommission","platformCommission","maxDiscount","couponExpiry","minimumWithdrawal","withdrawalFee",
  "withdrawalTime","vatRate","billingCycle","invoicePrefix","defaultCurrency","currencySymbol","decimalPlaces"
];
const checks = [
  "enablePremium","premiumCertificates","enableMpesa","enableCards","enablePaypal","enableBank","enableInstructorEarnings",
  "automaticPayouts","enableCoupons","scholarships","enableWithdrawals","withdrawalApproval","enableRevenueDashboard",
  "trackStudentPurchases","trackInstructorRevenue","monthlyRevenueReports"
];

function setValue(id, value) { if ($(id)) $(id).value = value ?? ""; }
function setChecked(id, value) { if ($(id)) $(id).checked = !!value; }

function populate(data) {
  const d = { ...defaults, ...data };
  const currency = d.currency || d.defaultCurrency || "KES";
  ["totalRevenue","monthlyRevenue","todayRevenue","pendingWithdrawals"].forEach(id => {
    if ($(id)) $(id).textContent = `${currency} ${Number(d[id] || 0).toLocaleString()}`;
  });
  fields.forEach(id => setValue(id, d[id]));
  setValue("defaultCurrency", currency);
  checks.forEach(id => setChecked(id, d[id]));
}

function readForm() {
  const data = {};
  fields.forEach(id => {
    const el = $(id);
    if (!el) return;
    data[id] = el.type === "number" ? Number(el.value || 0) : el.value;
  });
  checks.forEach(id => { if ($(id)) data[id] = $(id).checked; });
  data.currency = $("defaultCurrency")?.value || "KES";
  data.withdrawalFeePercent = Number($("withdrawalFee")?.value || 0);
  return data;
}

async function load() {
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const initial = { ...defaults, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      await setDoc(ref, initial);
      populate(initial);
      return;
    }
    populate(snap.data());
  } catch (error) {
    console.error("Monetization load failed:", error);
    window.showFounderToast?.("Could not load monetization settings.", "error");
  }
}

async function save() {
  const data = readForm();
  if (data.instructorCommission + data.platformCommission !== 100) {
    window.showFounderToast?.("Instructor share + platform commission must equal 100%.", "error");
    return;
  }
  if (data.minimumWithdrawal < 0 || data.withdrawalFeePercent < 0 || data.withdrawalFeePercent > 100) {
    window.showFounderToast?.("Check withdrawal values.", "error");
    return;
  }
  try {
    await setDoc(ref, { ...data, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(earningsRef, {
      minimumWithdrawal: data.minimumWithdrawal,
      withdrawalFeePercent: data.withdrawalFeePercent,
      withdrawalsEnabled: data.enableWithdrawals,
      withdrawalApproval: data.withdrawalApproval,
      withdrawalProcessingTime: data.withdrawalTime,
      updatedAt: serverTimestamp()
    }, { merge: true });
    window.showFounderToast?.("Monetization settings saved successfully.", "success");
  } catch (error) {
    console.error("Monetization save failed:", error);
    window.showFounderToast?.("Failed to save monetization settings.", "error");
  }
}

function downloadJSON() {
  const blob = new Blob([JSON.stringify(readForm(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `ssa-monetization-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
}

function bind() {
  ["saveMonetization"].forEach(id => $(id)?.addEventListener("click", save));
  $("exportRevenue")?.addEventListener("click", downloadJSON);
  $("exportMonetization")?.addEventListener("click", downloadJSON);
  $("restoreDefaults")?.addEventListener("click", () => {
    populate(defaults);
    window.showFounderToast?.("Defaults restored locally. Save changes to apply them.", "success");
  });
  $("disablePayments")?.addEventListener("click", async () => {
    setChecked("enableMpesa", false); setChecked("enableCards", false); setChecked("enablePaypal", false); setChecked("enableBank", false);
    setChecked("enableWithdrawals", false); await save();
  });
  $("resetMonetization")?.addEventListener("click", async () => {
    if (!confirm("Reset all monetization settings to defaults?")) return;
    populate(defaults); await save();
  });
  $("clearTransactions")?.addEventListener("click", () => {
    window.showFounderToast?.("Transactions are not deleted from this settings page. Use the Payments/Revenue pages for transaction management.", "error");
  });
}

document.addEventListener("DOMContentLoaded", () => { bind(); load(); });
