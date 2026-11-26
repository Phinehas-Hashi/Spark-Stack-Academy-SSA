import { app, db } from "../js/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const functions = getFunctions(app);
const saveSettingsCallable = httpsCallable(functions, "saveFounderMonetizationSettings");

const ref = doc(db, "settings", "monetization");
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
  ["defaultCourseFee","courseFee"],["registrationFee","registrationFee"],["examFee","examinationFee"],["certificateFee","certificateFee"],
  ["premiumMonthly","premiumMonthly"],["premiumQuarterly","premiumQuarterly"],["premiumYearly","premiumYearly"],
  ["instructorShare","instructorCommission"],["platformCommission","platformCommission"],["maxDiscount","maxDiscount"],
  ["couponExpiry","couponExpiry"],["minimumWithdrawal","minimumWithdrawal"],["withdrawalFee","withdrawalFeePercent"],
  ["withdrawalTime","withdrawalTime"],["vatRate","vatRate"],["billingCycle","billingCycle"],["invoicePrefix","invoicePrefix"],
  ["defaultCurrency","currency"],["currencySymbol","currencySymbol"],["decimalPlaces","decimalPlaces"]
];
const checks = [
  ["enablePremium","enablePremium"],["premiumCertificates","premiumCertificates"],["enableMpesa","enableMpesa"],
  ["enableCards","enableCards"],["enablePaypal","enablePaypal"],["enableBank","enableBank"],
  ["enableInstructorEarnings","enableInstructorEarnings"],["automaticPayouts","automaticPayouts"],
  ["enableCoupons","allowCoupons"],["scholarships","allowScholarships"],["enableWithdrawals","enableWithdrawals"],
  ["withdrawalApproval","withdrawalApproval"],["enableRevenueDashboard","enableRevenueDashboard"],
  ["trackStudentPurchases","trackStudentPurchases"],["trackInstructorRevenue","trackInstructorRevenue"],
  ["monthlyRevenueReports","monthlyRevenueReports"],["enablePayments","enablePayments"],["allowRefunds","allowRefunds"]
];

function setValue(id, value) { if ($(id)) $(id).value = value ?? ""; }
function setChecked(id, value) { if ($(id)) $(id).checked = !!value; }

function populate(data) {
  const d = { ...defaults, ...data };
  const currency = d.currency || d.defaultCurrency || "KES";
  ["totalRevenue","monthlyRevenue","todayRevenue","pendingWithdrawals"].forEach(id => {
    if ($(id)) $(id).textContent = `${currency} ${Number(d[id] || 0).toLocaleString()}`;
  });
  fields.forEach(([id,key]) => setValue(id, d[key]));
  setValue("defaultCurrency", currency);
  checks.forEach(([id,key]) => setChecked(id, d[key]));
}

function readForm() {
  const data = {};
  fields.forEach(([id,key]) => {
    const el = $(id);
    if (!el) return;
    data[key] = el.type === "number" ? Number(el.value || 0) : el.value;
  });
  checks.forEach(([id,key]) => { if ($(id)) data[key] = $(id).checked; });
  data.currency = $("defaultCurrency")?.value || "KES";
  return data;
}

async function load() {
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      populate(defaults);
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
  const button = $("saveMonetization");
  if (button) button.disabled = true;
  try {
    await saveSettingsCallable({ settings: data });
    window.showFounderToast?.("Monetization settings saved and audit-logged.", "success");
  } catch (error) {
    console.error("Monetization save failed:", error);
    window.showFounderToast?.(error.message || "Failed to save monetization settings.", "error");
  } finally {
    if (button) button.disabled = false;
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
