import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const currentPlan = document.getElementById("currentPlan");
const subscriptionStatus = document.getElementById("subscriptionStatus");
const premiumPlansStatus = document.getElementById("premiumPlansStatus");
const premiumPlansContainer = document.getElementById("premiumPlansContainer");
const premiumMessage = document.getElementById("premiumMessage");

const planLabels = {
  learner_plus: "Learner Plus",
  pro_learner: "Pro Learner",
  career_accelerator: "Career Accelerator"
};

function showMessage(message) {
  if (!premiumMessage) return;
  premiumMessage.style.display = "flex";
  const target = premiumMessage.querySelector("span");
  if (target) target.textContent = message;
  const icon = premiumMessage.querySelector("[data-lucide]");
  if (icon) icon.setAttribute("data-lucide", "info");
  if (window.lucide) window.lucide.createIcons();
}

function formatMoney(value, currency = "KSh") {
  return `${currency} ${Number(value).toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;
}

function formatDate(value) {
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric"
  });
}

function setFreePlan() {
  if (currentPlan) currentPlan.textContent = "Free Student";
  if (subscriptionStatus) subscriptionStatus.textContent = "Choose a membership to view the benefits and current Founder-approved price.";
}

async function loadSubscription(user) {
  try {
    const snap = await getDoc(doc(db, "premiumSubscriptions", user.uid));
    if (!snap.exists() || snap.data().status !== "active") {
      setFreePlan();
      return;
    }
    const data = snap.data();
    const planName = planLabels[data.plan] || (data.plan === "founder_granted" ? "Founder granted" : "Premium");
    if (currentPlan) currentPlan.textContent = `Premium — ${planName}`;
    if (subscriptionStatus) {
      const expires = formatDate(data.expiresAt);
      subscriptionStatus.textContent = expires ? `Active until ${expires}` : "Your premium membership is active.";
    }
  } catch (error) {
    console.error("Premium subscription could not be loaded:", error);
    setFreePlan();
    showMessage("We could not verify your membership status. Refresh the page or contact support.");
  }
}

function renderPlans(data) {
  if (!premiumPlansContainer || !premiumPlansStatus) return;
  premiumPlansContainer.replaceChildren();

  if (!data || data.published !== true || !data.plans) {
    premiumPlansStatus.hidden = false;
    premiumPlansStatus.textContent = "Membership pricing is being finalised by Academy management. No membership price is currently published.";
    return;
  }

  const entries = Object.entries(planLabels).filter(([key]) => {
    const plan = data.plans[key];
    return plan && plan.enabled !== false &&
      (Number.isSafeInteger(Number(plan.monthlyPrice)) && Number(plan.monthlyPrice) > 0 ||
       Number.isSafeInteger(Number(plan.quarterlyPrice)) && Number(plan.quarterlyPrice) > 0);
  });

  if (!entries.length) {
    premiumPlansStatus.hidden = false;
    premiumPlansStatus.textContent = "No membership plans are currently available.";
    return;
  }

  premiumPlansStatus.hidden = true;
  const currency = typeof data.currency === "string" && data.currency.trim() ? data.currency : "KSh";

  for (const [key, label] of entries) {
    const plan = data.plans[key];
    const card = document.createElement("article");
    card.className = "premium-plan-card";
    const top = document.createElement("div");
    top.className = "plan-top";
    const name = document.createElement("span");
    name.className = "plan-name";
    name.textContent = label;
    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", key === "career_accelerator" ? "gem" : key === "pro_learner" ? "flame" : "calendar");
    top.append(name, icon);
    card.append(top);

    const description = document.createElement("p");
    description.className = "plan-description";
    description.textContent = key === "learner_plus"
      ? "A stronger foundation for consistent learning."
      : key === "pro_learner"
        ? "More tools for learners building practical skills."
        : "A focused membership for career development.";
    card.append(description);

    const periods = document.createElement("div");
    periods.className = "premium-plan-periods";
    for (const [period, title] of [["monthly", "Monthly"], ["quarterly", "Quarterly"]]) {
      const price = plan[period === "monthly" ? "monthlyPrice" : "quarterlyPrice"];
      if (!Number.isSafeInteger(Number(price)) || Number(price) <= 0) continue;
      const row = document.createElement("div");
      row.className = "premium-plan-period";
      const periodName = document.createElement("span");
      periodName.textContent = title;
      const amount = document.createElement("strong");
      amount.textContent = formatMoney(price, currency);
      row.append(periodName, amount);
      periods.append(row);
    }
    card.append(periods);

    const list = document.createElement("ul");
    for (const benefit of (Array.isArray(plan.benefits) ? plan.benefits : [])) {
      if (typeof benefit !== "string" || !benefit.trim()) continue;
      const item = document.createElement("li");
      const check = document.createElement("i");
      check.setAttribute("data-lucide", "check");
      const text = document.createElement("span");
      text.textContent = benefit;
      item.append(check, text);
      list.append(item);
    }
    if (list.children.length) {
      card.append(list);
    } else {
      const benefitsNote = document.createElement("p");
      benefitsNote.className = "premium-purchase-note";
      benefitsNote.textContent = "Included benefits will be published by Academy management.";
      card.append(benefitsNote);
    }

    const note = document.createElement("p");
    note.className = "premium-purchase-note";
    note.textContent = "Online membership checkout is not yet available.";
    card.append(note);
    premiumPlansContainer.append(card);
  }
  if (window.lucide) window.lucide.createIcons();
}

async function loadFounderPricing() {
  if (premiumPlansStatus) {
    premiumPlansStatus.hidden = false;
    premiumPlansStatus.textContent = "Loading Founder-published membership pricing…";
  }
  try {
    const snap = await getDoc(doc(db, "premiumPricing", "global"));
    renderPlans(snap.exists() ? snap.data() : null);
  } catch (error) {
    console.error("Founder pricing could not be loaded:", error);
    if (premiumPlansStatus) {
      premiumPlansStatus.hidden = false;
      premiumPlansStatus.textContent = "Membership pricing is temporarily unavailable. Please try again later.";
    }
  }
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "../login.html";
    return;
  }
  await Promise.all([loadSubscription(user), loadFounderPricing()]);
});

