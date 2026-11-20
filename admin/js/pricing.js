import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const functions = getFunctions(getApp());
const getPricing = httpsCallable(functions, "getInstitutionPricing");
const savePricing = httpsCallable(functions, "saveInstitutionPricing");
const form = document.getElementById("institutionPricingForm");
const message = document.getElementById("pricingMessage");
const saveButton = document.getElementById("savePricingBtn");
let loaded = false;

function setMessage(value, type="") { message.textContent = value; message.className = "pricing-message " + type; }
function setCurrencyLabels(currency) {
  document.getElementById("currencyPrefix").textContent = currency;
  document.querySelectorAll(".currency-label").forEach(node => node.textContent = currency);
}
function fill(data) {
  const p = data || {};
  document.getElementById("currency").value = p.currency || "KES";
  document.getElementById("onboardingEnabled").checked = p.onboardingFeeEnabled === true;
  document.getElementById("onboardingFeeAmount").value = Number(p.onboardingFeeAmount || 0);
  document.getElementById("onboardingTiming").value = p.onboardingTiming || "before_activation";
  document.getElementById("monthlyAmount").value = Number(p.monthlySubscriptionAmount || 0);
  document.getElementById("annualAmount").value = Number(p.annualSubscriptionAmount || 0);
  document.getElementById("transactionFeeEnabled").checked = p.transactionFeeEnabled === true;
  document.getElementById("transactionFeePercent").value = Number(p.transactionFeePercent || 0);
  document.getElementById("trialDays").value = Number(p.trialDays ?? 14);
  setCurrencyLabels(p.currency || "KES");
}
async function load() {
  setMessage("Loading centrally managed pricing…");
  try {
    const response = await getPricing();
    fill(response.data?.pricing || {});
    loaded = true;
    setMessage("Pricing settings loaded. Review values before saving.", "success");
    window.lucide?.createIcons();
  } catch (error) {
    console.error("Pricing load failed:", error);
    setMessage(error.message || "You do not have permission to view institution pricing.", "error");
  }
}
document.getElementById("currency").addEventListener("change", event => setCurrencyLabels(event.target.value));
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!loaded) { setMessage("Pricing has not loaded. Refresh this page before saving.", "error"); return; }
  const payload = {
    currency: document.getElementById("currency").value,
    onboardingFeeEnabled: document.getElementById("onboardingEnabled").checked,
    onboardingFeeAmount: Number(document.getElementById("onboardingFeeAmount").value),
    onboardingTiming: document.getElementById("onboardingTiming").value,
    monthlySubscriptionAmount: Number(document.getElementById("monthlyAmount").value),
    annualSubscriptionAmount: Number(document.getElementById("annualAmount").value),
    transactionFeeEnabled: document.getElementById("transactionFeeEnabled").checked,
    transactionFeePercent: Number(document.getElementById("transactionFeePercent").value),
    trialDays: Number(document.getElementById("trialDays").value)
  };
  saveButton.disabled = true;
  setMessage("Saving pricing securely…");
  try {
    const result = await savePricing(payload);
    fill(result.data?.pricing || payload);
    setMessage("Pricing saved. The change has been recorded in the audit log.", "success");
  } catch (error) {
    console.error("Pricing save failed:", error);
    setMessage(error.message || "Pricing could not be saved.", "error");
  } finally { saveButton.disabled = false; }
});
document.addEventListener("admin:ready", load);
if (document.readyState === "complete" && window.AdminApp?.getCurrentUser?.()) load();