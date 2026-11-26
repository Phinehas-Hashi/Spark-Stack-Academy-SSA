import { auth, db } from "../js/firebase.js";
import { onAuthStateChanged, multiFactor, TotpMultiFactorGenerator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import "./js/founder-app.js";
import {
  collection, doc, getDoc, getDocs, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import "../js/ssa-ui.js";

const usersRoot = document.getElementById("premiumUsers");
const statusRoot = document.getElementById("premiumManagerStatus");
const pricingForm = document.getElementById("premiumPricingForm");
const savePricingButton = document.getElementById("savePremiumPricing");
const pricingRef = doc(db, "premiumPricing", "global");

const fields = {
  learner_plus: { monthly: "learnerPlusMonthly", quarterly: "learnerPlusQuarterly", benefits: "learnerPlusBenefits", enabled: "learnerPlusEnabled" },
  pro_learner: { monthly: "proLearnerMonthly", quarterly: "proLearnerQuarterly", benefits: "proLearnerBenefits", enabled: "proLearnerEnabled" },
  career_accelerator: { monthly: "careerAcceleratorMonthly", quarterly: "careerAcceleratorQuarterly", benefits: "careerAcceleratorBenefits", enabled: "careerAcceleratorEnabled" }
};
const labels = {
  learner_plus: "Learner Plus",
  pro_learner: "Pro Learner",
  career_accelerator: "Career Accelerator"
};

function setStatus(message, isError = false) {
  if (!statusRoot) return;
  statusRoot.textContent = message;
  statusRoot.style.background = isError ? "#fff1f0" : "#f5f1fb";
  statusRoot.style.color = isError ? "#9f1c13" : "#4c3470";
}
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function setInput(id, value) {
  const element = document.getElementById(id);
  if (element) element.value = Number.isSafeInteger(Number(value)) && Number(value) > 0 ? String(value) : "";
}
function populatePricing(data = {}) {
  for (const [key, ids] of Object.entries(fields)) {
    const plan = data.plans?.[key] || {};
    setInput(ids.monthly, plan.monthlyPrice);
    setInput(ids.quarterly, plan.quarterlyPrice);
    const benefits = document.getElementById(ids.benefits);
    if (benefits) benefits.value = Array.isArray(plan.benefits) ? plan.benefits.join("\n") : "";
    const enabled = document.getElementById(ids.enabled);
    if (enabled) enabled.checked = plan.enabled !== false;
  }
  const published = document.getElementById("premiumPricingPublished");
  if (published) published.checked = data.published === true;
}
function readPrice(id) {
  const raw = document.getElementById(id)?.value.trim() ?? "";
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Prices must be whole KSh amounts greater than zero.");
  }
  return value;
}
async function loadPricing() {
  const snap = await getDoc(pricingRef);
  populatePricing(snap.exists() ? snap.data() : {});
}
async function savePricing(event) {
  event.preventDefault();
  savePricingButton.disabled = true;
  try {
    const plans = {};
    let configuredCount = 0;
    for (const [key, ids] of Object.entries(fields)) {
      const monthlyPrice = readPrice(ids.monthly);
      const quarterlyPrice = readPrice(ids.quarterly);
      const enabled = document.getElementById(ids.enabled).checked;
      const benefits = document.getElementById(ids.benefits).value
        .split(/\r?\n/).map(value => value.trim()).filter(Boolean).slice(0, 8);
      if (enabled && (monthlyPrice || quarterlyPrice)) configuredCount++;
      plans[key] = { name: labels[key], monthlyPrice, quarterlyPrice, benefits, enabled };
    }
    const published = document.getElementById("premiumPricingPublished").checked;
    if (published && configuredCount === 0) {
      throw new Error("Configure at least one enabled membership price before publishing.");
    }
    await setDoc(pricingRef, {
      currency: "KSh",
      published,
      plans,
      updatedBy: auth.currentUser.uid,
      updatedAt: serverTimestamp()
    });
    setStatus(published
      ? "Founder pricing saved and published to the Student Portal."
      : "Founder pricing saved as unpublished. Students will not see prices.");
    window.ssaToast?.("Membership pricing saved.", "success", "Founder Pricing");
  } catch (error) {
    setStatus(error.message || "Pricing could not be saved.", true);
    window.ssaToast?.(error.message || "Pricing could not be saved.", "error", "Founder Pricing");
  } finally {
    savePricingButton.disabled = false;
  }
}
async function loadUsers() {
  const [usersSnap, premiumSnap] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "premiumSubscriptions"))
  ]);
  const premiumByUid = new Map(premiumSnap.docs.map(item => [item.id, item.data()]));
  const users = usersSnap.docs.map(item => ({ id: item.id, ...item.data() }))
    .filter(user => {
      const role = String(user.role || "").toLowerCase();
      if (role === "student") return user.status === "active" && user.active !== false;
      if (role === "instructor") return user.status === "active" && user.active === true && user.verified === true;
      return false;
    });

  if (!users.length) {
    usersRoot.textContent = "No active student or verified instructor accounts found.";
    return;
  }
  usersRoot.innerHTML = users.map(user => {
    const subscription = premiumByUid.get(user.id) || {};
    const active = subscription.status === "active";
    const name = user.name || user.displayName || user.fullName || user.email || "Account";
    return `<article class="pm-user">
      <strong>${escapeHtml(name)}</strong>
      <span>${escapeHtml(user.role)} · ${active ? `Premium ${escapeHtml(labels[subscription.plan] || subscription.plan || "")}` : "Free"}</span>
      <button type="button" data-uid="${escapeHtml(user.id)}" data-action="${active ? "revoke" : "activate"}" class="${active ? "danger" : ""}">${active ? "Revoke Premium" : "Grant Premium"}</button>
    </article>`;
  }).join("");
  usersRoot.querySelectorAll("button[data-uid]").forEach(button => {
    button.addEventListener("click", () => changePremium(button.dataset.uid, button.dataset.action, button));
  });
}
async function changePremium(uid, action, button) {
  if (!uid || !["activate", "revoke"].includes(action)) return;
  button.disabled = true;
  try {
    const active = action === "activate";
    await setDoc(doc(db, "premiumSubscriptions", uid), active ? {
      status: "active",
      plan: "founder_granted",
      source: "founder",
      managedBy: auth.currentUser.uid,
      grantedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    } : {
      status: "inactive",
      plan: "none",
      source: "founder",
      managedBy: auth.currentUser.uid,
      revokedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    window.ssaToast?.(active ? "Premium access granted." : "Premium access revoked.", "success", "Premium");
    await loadUsers();
  } catch (error) {
    button.disabled = false;
    window.ssaToast?.(window.ssaFriendlyError?.(error, "Premium access could not be changed.") || "Premium access could not be changed.", "error", "Premium");
  }
}
async function verifyFounder(user) {
  if (!user.emailVerified) throw new Error("Verify the Founder email address before continuing.");
  const tokenResult = await user.getIdTokenResult();
  const hasTotp = multiFactor(user).enrolledFactors.some(factor => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  const mfaVerified = tokenResult.claims.firebase?.sign_in_second_factor === "totp";
  if (!hasTotp || !mfaVerified) throw new Error("Complete authenticator-app verification before managing Premium access.");
  const founderSnap = await getDoc(doc(db, "founder", user.uid));
  const founder = founderSnap.exists() ? founderSnap.data() : {};
  if (founder.role !== "founder" || founder.status !== "active" ||
      founder.active === false || founder.verified === false) {
    throw new Error("Founder authorization required.");
  }
}
pricingForm?.addEventListener("submit", savePricing);
onAuthStateChanged(auth, async user => {
  if (!user) {
    location.href = "../login.html";
    return;
  }
  try {
    await verifyFounder(user);
    setStatus("Founder access verified. You control the published membership prices.");
    await Promise.all([loadPricing(), loadUsers()]);
  } catch (error) {
    setStatus(error.message || "Access denied.", true);
    if (usersRoot) usersRoot.textContent = error.message || "Access denied.";
    if (pricingForm) pricingForm.hidden = true;
  }
});
