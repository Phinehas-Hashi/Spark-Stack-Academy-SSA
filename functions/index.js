const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const adminAuth = getAuth();
const platformRef = db.doc("platform_controls/global");

// Safaricom Daraja credentials are managed in Firebase Secret Manager.
const MPESA_CONSUMER_KEY = defineSecret("MPESA_CONSUMER_KEY");
const MPESA_CONSUMER_SECRET = defineSecret("MPESA_CONSUMER_SECRET");
const MPESA_SHORTCODE = defineSecret("MPESA_SHORTCODE");
const MPESA_PASSKEY = defineSecret("MPESA_PASSKEY");
const MPESA_ENVIRONMENT = defineSecret("MPESA_ENVIRONMENT");
const MPESA_TRANSACTION_TYPE = defineSecret("MPESA_TRANSACTION_TYPE");

function safeText(value, fallback = "") { return String(value ?? fallback).trim(); }
function eventKey(event, suffix) {
  const raw = safeText(event.id || event.params?.docId || Date.now());
  return `${raw}-${suffix}`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140);
}

function normalizeInstructorMpesaPhone(value) {
  let phone = safeText(value).replace(/[^0-9]/g, "");
  if (phone.startsWith("0")) phone = "254" + phone.slice(1);
  else if (phone.startsWith("7") || phone.startsWith("1")) phone = "254" + phone;
  if (!/^254[17][0-9]{8}$/.test(phone)) {
    throw new HttpsError("invalid-argument", "Enter a valid Kenyan M-Pesa phone number.");
  }
  return "+" + phone;
}

exports.requestInstructorWithdrawal = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before requesting a withdrawal.");

  const amount = Number(request.data?.amount);
  if (!Number.isFinite(amount) || amount <= 0 || Number(amount.toFixed(2)) !== amount) {
    throw new HttpsError("invalid-argument", "Enter a valid withdrawal amount with no more than two decimal places.");
  }
  const phone = normalizeInstructorMpesaPhone(request.data?.phone);

  const userRef = db.doc("users/" + uid);
  const settingsRef = db.doc("platformSettings/earnings");
  const monetizationRef = db.doc("settings/monetization");
  const financeSecurityRef = db.doc("finance/security");
  const walletRef = db.doc("withdrawalLocks/" + uid);
  const earningsQuery = db.collection("instructorEarnings").where("instructorId", "==", uid);
  const withdrawalsQuery = db.collection("withdrawalRequests").where("instructorId", "==", uid);
  const requestRef = db.collection("withdrawalRequests").doc();

  return db.runTransaction(async transaction => {
    const [userSnap, controlsSnap, settingsSnap, monetizationSnap, financeSecuritySnap, earningsSnap, withdrawalsSnap, walletSnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(platformRef),
      transaction.get(settingsRef),
      transaction.get(monetizationRef),
      transaction.get(financeSecurityRef),
      transaction.get(earningsQuery),
      transaction.get(withdrawalsQuery),
      transaction.get(walletRef)
    ]);

    if (!userSnap.exists) throw new HttpsError("permission-denied", "Instructor profile not found.");
    const user = userSnap.data() || {};
    if (user.role !== "instructor" || user.status !== "active" || user.active !== true || user.verified !== true) {
      throw new HttpsError("permission-denied", "Only active, verified instructors can request withdrawals.");
    }

    const controls = controlsSnap.exists ? controlsSnap.data() || {} : {};
    const maintenance = controls.maintenance || {};
    const nowMs = Date.now();
    const startMs = maintenance.startAt?.toMillis ? maintenance.startAt.toMillis() : new Date(maintenance.startAt || 0).getTime();
    const endMs = maintenance.endAt?.toMillis ? maintenance.endAt.toMillis() : new Date(maintenance.endAt || 0).getTime();
    const maintenanceBlocked = maintenance.scheduled === true
      && (maintenance.target === "instructor" || maintenance.target === "all")
      && nowMs >= startMs && nowMs < endMs;
    if (controls.lockdown === true || controls.instructor?.suspended === true || maintenanceBlocked) {
      throw new HttpsError("failed-precondition", "Instructor withdrawals are unavailable while the portal is restricted.");
    }

    const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
    const monetization = monetizationSnap.exists ? monetizationSnap.data() || {} : {};
    if (settings.withdrawalsEnabled === false || monetization.enableWithdrawals === false) {
      throw new HttpsError("failed-precondition", "Instructor withdrawals are currently disabled by the Founder.");
    }
    if (settings.mpesaWithdrawalsEnabled === false || monetization.enableMpesa === false) {
      throw new HttpsError("failed-precondition", "M-Pesa withdrawals are currently disabled by the Founder.");
    }
    if (settings.withdrawalApproval === false || monetization.withdrawalApproval === false || monetization.automaticPayouts === true) {
      throw new HttpsError("failed-precondition", "Manual Founder approval is required. Automatic payouts are not enabled for this workflow.");
    }
    const minimum = Number(monetization.minimumWithdrawal ?? settings.minimumWithdrawal ?? 1000);
    const financeSecurity = financeSecuritySnap.exists ? financeSecuritySnap.data() || {} : {};
    const withdrawalLimit = Number(financeSecurity.withdrawalLimit ?? 50000);
    const taxRate = Number(settings.platformTaxPercent ?? 0);
    const feeRate = Number(monetization.withdrawalFeePercent ?? settings.withdrawalFeePercent ?? 0);
    if (!Number.isFinite(minimum) || minimum < 0
        || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100
        || !Number.isFinite(feeRate) || feeRate < 0 || feeRate > 100) {
      throw new HttpsError("failed-precondition", "Withdrawal settings are invalid. Contact the Founder.");
    }

    const earningsTotal = earningsSnap.docs.reduce((sum, item) => {
      const data = item.data() || {};
      const value = Number(data.netAmount ?? data.amount ?? data.total ?? data.earnings ?? 0);
      return sum + (Number.isFinite(value) && value > 0 ? value : 0);
    }, 0);
    const releasedStatuses = ["rejected", "declined", "cancelled", "canceled", "failed"];
    const reservedTotal = withdrawalsSnap.docs.reduce((sum, item) => {
      const data = item.data() || {};
      const status = safeText(data.status, "pending").toLowerCase();
      const value = Number(data.amount || 0);
      return releasedStatuses.includes(status) || !Number.isFinite(value) || value <= 0 ? sum : sum + value;
    }, 0);
    const available = Math.max(0, Math.round((earningsTotal - reservedTotal) * 100) / 100);

    if (!Number.isFinite(withdrawalLimit) || withdrawalLimit <= 0) {
      throw new HttpsError("failed-precondition", "The Founder withdrawal limit is not configured correctly.");
    }
    if (amount < minimum) {
      throw new HttpsError("failed-precondition", "The minimum withdrawal is KES " + minimum.toLocaleString("en-KE") + ".");
    }
    if (amount > withdrawalLimit) {
      throw new HttpsError("failed-precondition", "The maximum withdrawal request is KES " + withdrawalLimit.toLocaleString("en-KE") + ".");
    }
    if (amount > available) {
      throw new HttpsError("failed-precondition", "Insufficient available balance. Current available balance: KES " + available.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ".");
    }

    const platformTax = Math.round(amount * taxRate) / 100;
    const withdrawalFee = Math.round(amount * feeRate) / 100;
    const netAmount = Math.round((amount - platformTax - withdrawalFee) * 100) / 100;
    if (netAmount <= 0) throw new HttpsError("failed-precondition", "The configured fees leave no payable amount.");

    const now = Timestamp.now();
    transaction.create(requestRef, {
      instructorId: uid,
      amount,
      platformTax,
      withdrawalFee,
      netAmount,
      method: "mpesa",
      account: phone,
      currency: "KES",
      status: "pending",
      createdAt: now
    });
    transaction.set(walletRef, {
      instructorId: uid,
      withdrawalGuardUpdatedAt: now,
      updatedAt: now
    }, { merge: true });

    return {
      success: true,
      requestId: requestRef.id,
      amount,
      platformTax,
      withdrawalFee,
      netAmount,
      availableBalance: Math.max(0, Math.round((available - amount) * 100) / 100)
    };
  });
});

exports.getInstructorEarningsSettings = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to load instructor earnings settings.");
  const [userSnap, controlsSnap, settingsSnap, monetizationSnap] = await Promise.all([
    db.doc("users/" + uid).get(),
    platformRef.get(),
    db.doc("platformSettings/earnings").get(),
    db.doc("settings/monetization").get()
  ]);
  if (!userSnap.exists) throw new HttpsError("permission-denied", "Instructor profile not found.");
  const user = userSnap.data() || {};
  if (user.role !== "instructor" || user.status !== "active" || user.active !== true || user.verified !== true) {
    throw new HttpsError("permission-denied", "Only active, verified instructors can view earnings settings.");
  }
  const controls = controlsSnap.exists ? controlsSnap.data() || {} : {};
  const maintenance = controls.maintenance || {};
  const now = Date.now();
  const start = maintenance.startAt?.toMillis ? maintenance.startAt.toMillis() : new Date(maintenance.startAt || 0).getTime();
  const end = maintenance.endAt?.toMillis ? maintenance.endAt.toMillis() : new Date(maintenance.endAt || 0).getTime();
  const maintenanceBlocked = maintenance.scheduled === true
    && (maintenance.target === "instructor" || maintenance.target === "all")
    && now >= start && now < end;
  if (controls.lockdown === true || controls.instructor?.suspended === true || maintenanceBlocked) {
    throw new HttpsError("failed-precondition", "Instructor portal access is currently restricted.");
  }

  const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};
  const monetization = monetizationSnap.exists ? monetizationSnap.data() || {} : {};
  return {
    minimumWithdrawal: Number(monetization.minimumWithdrawal ?? settings.minimumWithdrawal ?? 1000),
    withdrawalFeePercent: Number(monetization.withdrawalFeePercent ?? settings.withdrawalFeePercent ?? 0),
    platformTaxPercent: Number(settings.platformTaxPercent ?? 0),
    premiumMonthlyPrice: Number(settings.premiumMonthlyPrice ?? monetization.premiumMonthly ?? 999),
    withdrawalsEnabled: settings.withdrawalsEnabled !== false && monetization.enableWithdrawals !== false,
    mpesaWithdrawalsEnabled: settings.mpesaWithdrawalsEnabled !== false && monetization.enableMpesa !== false,
    withdrawalApproval: settings.withdrawalApproval !== false && monetization.withdrawalApproval !== false && monetization.automaticPayouts !== true
  };
});

async function requireFounder(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "You must be signed in as a founder.");
  const founder = await db.doc(`founder/${uid}`).get();
  const data = founder.exists ? founder.data() : null;
  if (!data || data.role !== "founder" || data.status !== "active"
      || data.active === false || data.verified === false) {
    throw new HttpsError("permission-denied", "Only the active, verified Founder Super Admin can perform this operation.");
  }
  return { uid, data };
}

exports.createAdminAccount = onCall(async request => {
  const founder = await requireFounder(request);
  const email = safeText(request.data?.email).toLowerCase();
  const password = String(request.data?.password || "");
  const fullName = safeText(request.data?.fullName);
  const status = safeText(request.data?.status, "active").toLowerCase() === "active" ? "active" : "suspended";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Enter a valid administrator email address.");
  }
  if (password.length < 8) {
    throw new HttpsError("invalid-argument", "Administrator passwords must be at least 8 characters.");
  }
  if (!fullName || fullName.length < 2) {
    throw new HttpsError("invalid-argument", "Enter the administrator's full name.");
  }

  try {
    const existing = await adminAuth.getUserByEmail(email).catch(error => {
      if (error.code === "auth/user-not-found") return null;
      throw error;
    });
    if (existing) throw new HttpsError("already-exists", "An account with that email already exists.");

    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: fullName,
      disabled: status !== "active",
      emailVerified: false
    });

    const now = Timestamp.now();
    await db.doc(`users/${userRecord.uid}`).set({
      uid: userRecord.uid,
      email,
      fullName,
      name: fullName,
      role: "admin",
      status,
      active: status === "active",
      verified: false,
      createdAt: now,
      createdBy: founder.uid,
      updatedAt: now
    });

    await db.collection("audit_logs").add({
      action: "admin_account_created",
      actorId: founder.uid,
      targetId: userRecord.uid,
      targetEmail: email,
      targetName: fullName,
      createdAt: now
    });

    return { success: true, uid: userRecord.uid, message: `Administrator account created for ${fullName}.` };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("createAdminAccount failed:", error);
    throw new HttpsError("internal", "The administrator account could not be created. Please try again.");
  }
});


// ============================================================
// INSTITUTION APPLICATION REVIEW — TRUSTED ADMIN OPERATIONS
// ============================================================

async function requireInstitutionReviewer(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before reviewing applications.");
  const [userSnap, founderSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`founder/${uid}`).get()
  ]);
  const user = userSnap.exists ? userSnap.data() : {};
  const founder = founderSnap.exists ? founderSnap.data() : {};
  const isAdmin = ["admin", "administrator", "moderator"].includes(safeText(user.role).toLowerCase())
    && user.active === true && user.status === "active";
  const isFounder = founder.role === "founder" && founder.status === "active"
    && founder.active !== false && founder.verified !== false;
  if (!isAdmin && !isFounder) {
    throw new HttpsError("permission-denied", "Only active Academy administrators or the Founder can review institution applications.");
  }
  return { uid, email: request.auth.token.email || "", role: isFounder ? "founder" : "admin" };
}



// ============================================================
// DARAJA — INSTITUTION ONBOARDING COLLECTION
// STK callbacks are independently verified using STK Query.
// ============================================================

const DARAJA_SECRETS = [
  MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE,
  MPESA_PASSKEY, MPESA_ENVIRONMENT, MPESA_TRANSACTION_TYPE
];

function darajaBaseUrl() {
  return MPESA_ENVIRONMENT.value().toLowerCase() === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";
}

function normalizeKenyanPhone(value) {
  let phone = safeText(value).replace(/[\s()+-]/g, "");
  if (phone.startsWith("0")) phone = "254" + phone.slice(1);
  if (phone.startsWith("7") || phone.startsWith("1")) phone = "254" + phone;
  if (!/^254[17]\d{8}$/.test(phone)) {
    throw new HttpsError("invalid-argument", "The institution contact number must be a valid Kenyan M-Pesa number, for example 0712345678 or 254712345678.");
  }
  return phone;
}

function darajaTimestamp(date = new Date()) {
  const pad = value => String(value).padStart(2, "0");
  return date.getUTCFullYear()
    + pad(date.getUTCMonth() + 1)
    + pad(date.getUTCDate())
    + pad(date.getUTCHours())
    + pad(date.getUTCMinutes())
    + pad(date.getUTCSeconds());
}

async function getDarajaAccessToken() {
  const credentials = Buffer.from(
    MPESA_CONSUMER_KEY.value() + ":" + MPESA_CONSUMER_SECRET.value()
  ).toString("base64");
  const response = await fetch(darajaBaseUrl() + "/oauth/v1/generate?grant_type=client_credentials", {
    headers: { Authorization: "Basic " + credentials }
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    console.error("Daraja OAuth failed:", payload.errorCode || payload.errorMessage || response.status);
    throw new HttpsError("failed-precondition", "M-Pesa payment service is not configured or could not authenticate.");
  }
  return payload.access_token;
}

function darajaCallbackUrl() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!projectId) throw new Error("Firebase project ID is unavailable for the Daraja callback URL.");
  return "https://us-central1-" + projectId + ".cloudfunctions.net/darajaInstitutionCallback";
}

async function startInstitutionStkPayment({ applicationId, institutionId, ownerUid, phone, amount, currency, initiatedBy }) {
  if (currency !== "KES") throw new HttpsError("failed-precondition", "M-Pesa STK Push can collect this onboarding fee only when the pricing currency is KES.");
  if (!Number.isInteger(Number(amount)) || Number(amount) < 1) throw new HttpsError("failed-precondition", "The M-Pesa onboarding amount must be a whole KES amount greater than zero.");
  const phoneNumber = normalizeKenyanPhone(phone);
  const shortcode = MPESA_SHORTCODE.value();
  const passkey = MPESA_PASSKEY.value();
  if (!shortcode || !passkey) throw new HttpsError("failed-precondition", "M-Pesa shortcode and passkey have not been configured.");

  const paymentRef = db.collection("institutionPayments").doc();
  const now = Timestamp.now();
  await paymentRef.set({
    paymentId: paymentRef.id, type: "institution_onboarding",
    institutionId, applicationId, ownerUid, phoneNumber,
    amount: Number(amount), currency: "KES", provider: "safaricom_daraja",
    status: "initiating", initiatedBy, createdAt: now, updatedAt: now
  });

  try {
    const token = await getDarajaAccessToken();
    const timestamp = darajaTimestamp();
    const password = Buffer.from(shortcode + passkey + timestamp).toString("base64");
    const response = await fetch(darajaBaseUrl() + "/mpesa/stkpush/v1/processrequest", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: MPESA_TRANSACTION_TYPE.value() || "CustomerPayBillOnline",
        Amount: Number(amount),
        PartyA: phoneNumber,
        PartyB: shortcode,
        PhoneNumber: phoneNumber,
        CallBackURL: darajaCallbackUrl(),
        AccountReference: ("SSA" + applicationId.replace(/[^a-zA-Z0-9]/g, "").slice(-9)).slice(0, 12),
        TransactionDesc: "Institution onboarding"
      })
    });
    const result = await response.json();
    if (!response.ok || String(result.ResponseCode) !== "0" || !result.CheckoutRequestID) {
      console.error("Daraja STK initiation rejected:", result.errorCode || result.errorMessage || result.ResponseDescription || response.status);
      throw new Error("Safaricom did not accept the STK Push request.");
    }

    await paymentRef.update({
      status: "pending",
      merchantRequestId: result.MerchantRequestID || "",
      checkoutRequestId: result.CheckoutRequestID,
      customerMessage: result.CustomerMessage || "STK Push sent.",
      responseDescription: result.ResponseDescription || "",
      updatedAt: Timestamp.now()
    });
    await Promise.all([
      db.doc("institutions/" + institutionId).set({
        onboardingFee: {
          status: "pending", amount: Number(amount), currency: "KES",
          paymentId: paymentRef.id, provider: "safaricom_daraja",
          phoneNumber, updatedAt: Timestamp.now()
        },
        updatedAt: Timestamp.now()
      }, { merge: true }),
      db.doc("institutionApplications/" + applicationId).set({
        onboardingFeeStatus: "pending", currentOnboardingPaymentId: paymentRef.id,
        updatedAt: Timestamp.now()
      }, { merge: true })
    ]);
    await db.collection("audit_logs").add({
      action: "institution_onboarding_stk_initiated",
      actorId: initiatedBy, targetId: institutionId,
      paymentId: paymentRef.id, amount: Number(amount), currency: "KES",
      createdAt: Timestamp.now()
    });
    return { success: true, paymentId: paymentRef.id, status: "pending", customerMessage: result.CustomerMessage || "Check the institution phone and enter your M-Pesa PIN." };
  } catch (error) {
    await paymentRef.set({ status: "initiation_failed", failureMessage: "M-Pesa request could not be initiated.", updatedAt: Timestamp.now() }, { merge: true });
    if (error instanceof HttpsError) throw error;
    console.error("Institution STK initiation failed:", error.message);
    throw new HttpsError("unavailable", "The M-Pesa prompt could not be sent. The application remains approved and payment can be retried from Institution Applications.");
  }
}

async function verifyDarajaStkCheckout(checkoutRequestId) {
  const token = await getDarajaAccessToken();
  const shortcode = MPESA_SHORTCODE.value();
  const timestamp = darajaTimestamp();
  const password = Buffer.from(shortcode + MPESA_PASSKEY.value() + timestamp).toString("base64");
  const response = await fetch(darajaBaseUrl() + "/mpesa/stkpushquery/v1/query", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    })
  });
  const result = await response.json();
  return response.ok && String(result.ResultCode) === "0";
}

exports.retryInstitutionOnboardingPayment = onCall({ secrets: DARAJA_SECRETS }, async request => {
  const reviewer = await requireInstitutionReviewer(request);
  const applicationId = safeText(request.data?.applicationId);
  if (!applicationId) throw new HttpsError("invalid-argument", "Application ID is required.");
  const [applicationSnap, institutionSnap] = await Promise.all([
    db.doc("institutionApplications/" + applicationId).get(),
    db.doc("institutions/" + applicationId).get()
  ]);
  if (!applicationSnap.exists || !institutionSnap.exists) throw new HttpsError("not-found", "Institution application or workspace was not found.");
  const application = applicationSnap.data();
  const institution = institutionSnap.data();
  const retryableStatuses = ["due", "failed", "initiation_failed"];
  const retryable = retryableStatuses.includes(application.onboardingFeeStatus)
    || retryableStatuses.includes(institution.onboardingFee?.status);
  if (!retryable) {
    throw new HttpsError("failed-precondition", "There is no failed or due onboarding payment to retry. Check the current payment status before sending another prompt.");
  }
  const fee = institution.pricingSnapshot || {};
  if (fee.onboardingFeeEnabled !== true || Number(fee.onboardingFeeAmount) <= 0) {
    throw new HttpsError("failed-precondition", "No payable onboarding fee is configured for this institution.");
  }
  return startInstitutionStkPayment({
    applicationId, institutionId: applicationId,
    ownerUid: application.institutionOwnerUid,
    phone: application.institutionPhone,
    amount: Number(fee.onboardingFeeAmount),
    currency: fee.currency || "KES",
    initiatedBy: reviewer.uid
  });
});


async function completeInstitutionOnboardingPayment(paymentDoc, payment, metadata) {
  if (Number(metadata.Amount) !== Number(payment.amount)) throw new Error("Daraja callback amount does not match the expected onboarding fee.");
  if (String(metadata.PhoneNumber || "") !== String(payment.phoneNumber || "")) throw new Error("Daraja callback phone number does not match the STK recipient.");
  if (!safeText(metadata.MpesaReceiptNumber)) throw new Error("Daraja callback did not contain an M-Pesa receipt number.");

  const now = Timestamp.now();
  const institutionRef = db.doc("institutions/" + payment.institutionId);
  const applicationRef = db.doc("institutionApplications/" + payment.applicationId);
  const userRef = db.doc("users/" + payment.ownerUid);
  await db.runTransaction(async transaction => {
    const [institutionSnap, paymentSnap] = await Promise.all([
      transaction.get(institutionRef), transaction.get(paymentDoc.ref)
    ]);
    if (!institutionSnap.exists) throw new Error("Institution record missing during payment verification.");
    if (paymentSnap.data()?.status === "paid") return;
    const institution = institutionSnap.data();
    const requiresPaymentBeforeActivation = institution.pricingSnapshot?.onboardingTiming === "before_activation";
    const trialDays = Number(institution.subscription?.trialDays ?? 14);
    const trialEndsAt = Timestamp.fromMillis(now.toMillis() + trialDays * 86400000);
    transaction.set(paymentDoc.ref, {
      status: "paid", resultCode: 0, resultDescription: "Payment verified by Daraja STK Query.",
      mpesaReceiptNumber: safeText(metadata.MpesaReceiptNumber),
      transactionDate: metadata.TransactionDate || null,
      paidAmount: Number(metadata.Amount),
      paidPhoneNumber: String(metadata.PhoneNumber),
      verifiedAt: now, updatedAt: now
    }, { merge: true });
    transaction.set(institutionRef, {
      status: "active",
      onboardingFee: {
        status: "paid", amount: payment.amount, currency: "KES",
        paymentId: paymentDoc.id, provider: "safaricom_daraja",
        mpesaReceiptNumber: safeText(metadata.MpesaReceiptNumber), paidAt: now
      },
      ...(requiresPaymentBeforeActivation ? {
        subscription: {
          ...(institution.subscription || {}),
          plan: "trial", status: "trialing",
          trialStartedAt: now, trialEndsAt, trialDays
        },
        updatedAt: now
      } : { updatedAt: now })
    }, { merge: true });
    transaction.set(applicationRef, {
      onboardingFeeStatus: "paid", onboardingFeePaidAt: now, updatedAt: now,
      ...(requiresPaymentBeforeActivation ? { status: "approved" } : {})
    }, { merge: true });
    if (requiresPaymentBeforeActivation) {
      transaction.set(userRef, { status: "active", active: true, verified: true, activatedAt: now, updatedAt: now }, { merge: true });
    }
  });
  await db.collection("audit_logs").add({
    action: "institution_onboarding_payment_verified",
    actorId: "daraja_callback", targetId: payment.institutionId,
    paymentId: paymentDoc.id, receipt: safeText(metadata.MpesaReceiptNumber),
    amount: payment.amount, currency: "KES", createdAt: now
  });
}

exports.darajaInstitutionCallback = onRequest({ secrets: DARAJA_SECRETS, invoker: "public" }, async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;
    const checkoutRequestId = safeText(callback?.CheckoutRequestID);
    if (!checkoutRequestId) { res.status(400).json({ received: false }); return; }
    const matches = await db.collection("institutionPayments")
      .where("checkoutRequestId", "==", checkoutRequestId).limit(1).get();
    if (matches.empty) { res.status(200).json({ ResultCode: 0, ResultDesc: "Callback acknowledged." }); return; }
    const paymentDoc = matches.docs[0];
    const payment = paymentDoc.data();
    if (payment.status === "paid") { res.status(200).json({ ResultCode: 0, ResultDesc: "Already processed." }); return; }

    if (Number(callback.ResultCode) !== 0) {
      const description = safeText(callback.ResultDesc).slice(0, 250);
      await paymentDoc.ref.set({
        status: "failed", resultCode: Number(callback.ResultCode),
        resultDescription: description, updatedAt: Timestamp.now()
      }, { merge: true });
      await Promise.all([
        db.doc("institutions/" + payment.institutionId).set({
          onboardingFee: { status: "due", lastFailure: description, updatedAt: Timestamp.now() }
        }, { merge: true }),
        db.doc("institutionApplications/" + payment.applicationId).set({
          onboardingFeeStatus: "due", lastPaymentFailure: description, updatedAt: Timestamp.now()
        }, { merge: true })
      ]);
      res.status(200).json({ ResultCode: 0, ResultDesc: "Callback acknowledged." });
      return;
    }

    const metadataItems = callback.CallbackMetadata?.Item || [];
    const metadata = Object.fromEntries(metadataItems.map(item => [item.Name, item.Value]));
    await paymentDoc.ref.set({
      status: "verification_pending", callbackMetadata: metadata,
      callbackReceivedAt: Timestamp.now(), updatedAt: Timestamp.now()
    }, { merge: true });
    const verified = await verifyDarajaStkCheckout(checkoutRequestId);
    if (!verified) {
      res.status(200).json({ ResultCode: 0, ResultDesc: "Payment verification is pending." });
      return;
    }
    await completeInstitutionOnboardingPayment(paymentDoc, payment, metadata);
    res.status(200).json({ ResultCode: 0, ResultDesc: "Payment processed." });
  } catch (error) {
    console.error("Daraja institution callback processing failed:", error.message);
    res.status(200).json({ ResultCode: 0, ResultDesc: "Callback received for processing." });
  }
});

exports.reconcileInstitutionOnboardingPayments = onSchedule({
  schedule: "every 5 minutes",
  secrets: DARAJA_SECRETS,
  timeZone: "Africa/Nairobi"
}, async () => {
  const pending = await db.collection("institutionPayments")
    .where("status", "==", "verification_pending").limit(50).get();
  for (const paymentDoc of pending.docs) {
    const payment = paymentDoc.data();
    try {
      if (!payment.checkoutRequestId || !payment.callbackMetadata) continue;
      if (await verifyDarajaStkCheckout(payment.checkoutRequestId)) {
        await completeInstitutionOnboardingPayment(paymentDoc, payment, payment.callbackMetadata);
      }
    } catch (error) {
      console.error("Pending institution payment reconciliation failed:", paymentDoc.id, error.message);
    }
  }
});



function requireActiveInstitutionMember(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to manage institution courses.");
  return db.doc("users/" + uid).get().then(snap => {
    const p = snap.exists ? snap.data() : {};
    const role = safeText(p.role).toLowerCase();
    if (!["institution", "institution_owner", "institution_admin"].includes(role)
      || p.status !== "active" || p.active !== true || p.verified !== true
      || !p.institutionId) {
      throw new HttpsError("permission-denied", "An active, verified institution account is required.");
    }
    return { uid, profile: p, institutionId: p.institutionId };
  });
}

exports.createInstitutionCourse = onCall(async request => {
  const member = await requireActiveInstitutionMember(request);
  const title = safeText(request.data?.title);
  const description = safeText(request.data?.description);
  const category = safeText(request.data?.category);
  const level = safeText(request.data?.level, "Beginner");
  const price = Number(request.data?.price ?? 0);
  const currency = safeText(request.data?.currency, "KES");
  const instructorId = safeText(request.data?.instructorId);
  if (title.length < 3 || title.length > 140) throw new HttpsError("invalid-argument", "Course title must be 3–140 characters.");
  if (description.length < 20 || description.length > 4000) throw new HttpsError("invalid-argument", "Course description must be 20–4,000 characters.");
  if (!category || category.length > 80) throw new HttpsError("invalid-argument", "Choose a valid course category.");
  if (!Number.isFinite(price) || price < 0 || price > 10000000) throw new HttpsError("invalid-argument", "Enter a valid course price.");
  if (!["KES", "USD", "EUR", "GBP"].includes(currency)) throw new HttpsError("invalid-argument", "Unsupported course currency.");
  if (instructorId) {
    const instructorSnap = await db.doc("users/" + instructorId).get();
    const instructor = instructorSnap.exists ? instructorSnap.data() : {};
    if (instructor.role !== "instructor" || instructor.institutionId !== member.institutionId || instructor.status !== "active" || instructor.active !== true || instructor.verified !== true) {
      throw new HttpsError("failed-precondition", "The selected instructor is not an active verified member of this institution.");
    }
  }
  const institutionRef = db.doc("institutions/" + member.institutionId);
  const courseRef = db.collection("courses").doc();
  const now = Timestamp.now();
  await db.runTransaction(async tx => {
    const institutionSnap = await tx.get(institutionRef);
    if (!institutionSnap.exists || institutionSnap.data().status !== "active") throw new HttpsError("failed-precondition", "The institution workspace is not active.");
    const institution = institutionSnap.data();
    const used = Number(institution.usage?.courses || 0);
    const maximum = Number(institution.limits?.courses || 100);
    if (used >= maximum) throw new HttpsError("resource-exhausted", "Your institution has reached its 100-course limit.");
    tx.create(courseRef, {
      title, description, category, level, price, currency,
      instructorId: instructorId || null,
      institutionId: member.institutionId,
      institutionName: institution.institutionName || institution.legalName || "",
      createdBy: member.uid,
      ownerType: "institution",
      sourceType: "institution",
      status: "draft",
      published: false,
      reviewStatus: "not_submitted",
      marketplaceVisibility: "hidden",
      createdAt: now,
      updatedAt: now
    });
    tx.update(institutionRef, { "usage.courses": used + 1, updatedAt: now });
  });
  await db.collection("audit_logs").add({ action: "institution_course_created", actorId: member.uid, targetId: courseRef.id, institutionId: member.institutionId, createdAt: now });
  return { success: true, courseId: courseRef.id, status: "draft" };
});

exports.submitInstitutionCourseForReview = onCall(async request => {
  const member = await requireActiveInstitutionMember(request);
  const courseId = safeText(request.data?.courseId);
  if (!courseId) throw new HttpsError("invalid-argument", "Course ID is required.");
  const ref = db.doc("courses/" + courseId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Course not found.");
  const course = snap.data();
  if (course.institutionId !== member.institutionId) throw new HttpsError("permission-denied", "This course belongs to another institution.");
  if (!["draft", "rejected"].includes(safeText(course.status).toLowerCase())) throw new HttpsError("failed-precondition", "Only draft or previously rejected courses can be submitted.");
  const now = Timestamp.now();
  await ref.update({ status: "pending_review", published: false, reviewStatus: "awaiting_admin_review", reviewRequestedAt: now, reviewRequestedBy: member.uid, updatedAt: now });
  await db.collection("audit_logs").add({ action: "institution_course_submitted_for_review", actorId: member.uid, targetId: courseId, institutionId: member.institutionId, createdAt: now });
  return { success: true, status: "pending_review" };
});



/* ============================================================
   CANONICAL COURSE ENTITLEMENTS — LEGACY COMPATIBILITY BRIDGE
   A student can only receive grants derived from trusted records.
   Client applications cannot create or modify courseEntitlements.
============================================================ */

function entitlementRecordStatus(value) {
  return safeText(value).toLowerCase();
}

function safeGrantKey(source, recordId) {
  return (source + "_" + recordId).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140);
}

exports.syncMyCourseEntitlements = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to check your course access.");

  const userSnap = await db.doc("users/" + uid).get();
  const user = userSnap.exists ? userSnap.data() : {};
  if (user.role !== "student" || user.status !== "active" || user.active !== true) {
    throw new HttpsError("permission-denied", "An active student account is required.");
  }

  const [nestedSnap, userEnrollmentSnap, studentEnrollmentSnap, existingSnap] = await Promise.all([
    db.collection("students").doc(uid).collection("enrollments").limit(400).get(),
    db.collection("enrollments").where("userId", "==", uid).limit(400).get(),
    db.collection("enrollments").where("studentId", "==", uid).limit(400).get(),
    db.collection("courseEntitlements").where("studentUid", "==", uid).limit(400).get()
  ]);

  const currentLegacyGrants = new Map();
  const courseCache = new Map();
  const institutionCache = new Map();

  async function getCourse(courseId) {
    if (!courseCache.has(courseId)) {
      courseCache.set(courseId, db.doc("courses/" + courseId).get());
    }
    return courseCache.get(courseId);
  }

  async function institutionIsValid(institutionId) {
    if (!institutionCache.has(institutionId)) {
      institutionCache.set(institutionId, (async () => {
        const [institutionSnap, membershipSnap] = await Promise.all([
          db.doc("institutions/" + institutionId).get(),
          db.doc("institutions/" + institutionId + "/members/" + uid).get()
        ]);
        const institution = institutionSnap.exists ? institutionSnap.data() : {};
        const member = membershipSnap.exists ? membershipSnap.data() : {};
        const institutionActive = institutionSnap.exists && institution.status === "active";
        const canonicalMemberActive = membershipSnap.exists
          && member.status === "active" && member.active !== false;
        const legacyMemberActive = user.institutionId === institutionId
          && user.status === "active" && user.active === true;
        return institutionActive && (canonicalMemberActive || legacyMemberActive);
      })());
    }
    return institutionCache.get(institutionId);
  }

  function addGrant(courseId, grantKey, grant) {
    if (!currentLegacyGrants.has(courseId)) currentLegacyGrants.set(courseId, {});
    currentLegacyGrants.get(courseId)[grantKey] = grant;
  }

  const institutionRecords = nestedSnap.docs.map(s => ({ id: s.id, data: s.data(), kind: "institution" }));
  const marketplaceRecords = [...userEnrollmentSnap.docs, ...studentEnrollmentSnap.docs]
    .map(s => ({ id: s.id, data: s.data(), kind: "marketplace" }));
  const checks = [];

  for (const record of institutionRecords) {
    checks.push((async () => {
      const data = record.data || {};
      const courseId = safeText(data.courseId || data.courseID || data.course);
      const institutionId = safeText(data.institutionId);
      const status = entitlementRecordStatus(data.status);
      if (!courseId || !institutionId || !["active", "approved", "completed"].includes(status)) return;
      if (!(await institutionIsValid(institutionId))) return;
      const courseSnap = await getCourse(courseId);
      if (!courseSnap.exists) return;
      const course = courseSnap.data();
      if (course.institutionId && course.institutionId !== institutionId) return;
      addGrant(courseId, safeGrantKey("legacy_institution", record.id), {
        source: "institution_enrollment",
        sourceRecordId: record.id,
        institutionId,
        institutionName: safeText(data.institutionName || data.schoolName),
        progress: Number(data.progress ?? data.progressPercent ?? 0),
        status: "active"
      });
    })());
  }

  for (const record of marketplaceRecords) {
    checks.push((async () => {
      const data = record.data || {};
      const recordUid = safeText(data.userId || data.studentId);
      if (recordUid !== uid) return;
      const courseId = safeText(data.courseId || data.courseID || data.course);
      if (!courseId) return;
      const status = entitlementRecordStatus(data.status);
      const paymentStatus = entitlementRecordStatus(data.paymentStatus);
      if (["revoked", "suspended", "cancelled", "canceled", "rejected", "pending"].includes(status)) return;
      const isPaid = (["active", "approved", "completed"].includes(status) && paymentStatus === "paid")
        || (status === "paid" && (paymentStatus === "" || paymentStatus === "paid"));
      const courseSnap = await getCourse(courseId);
      if (!courseSnap.exists) return;
      const course = courseSnap.data();
      const isFree = ["active", "approved", "completed"].includes(status)
        && paymentStatus === "free" && course.isFree === true;
      if (!isPaid && !isFree) return;
      addGrant(courseId, safeGrantKey("legacy_marketplace", record.id), {
        source: isPaid ? "verified_legacy_purchase" : "approved_free_enrollment",
        sourceRecordId: record.id,
        paymentStatus: isPaid ? "paid" : "free",
        progress: Number(data.progress ?? data.progressPercent ?? 0),
        status: "active"
      });
    })());
  }

  await Promise.all(checks);

  const existingByCourse = new Map(existingSnap.docs.map(s => [s.id, s.data()]));
  const courseIds = new Set([
    ...existingSnap.docs.map(s => safeText(s.data().courseId)),
    ...currentLegacyGrants.keys()
  ]);
  let batch = db.batch();
  let pendingWrites = 0;
  const now = Timestamp.now();
  const entitledCourseIds = [];

  for (const courseId of courseIds) {
    if (!courseId) continue;
    const entitlementId = uid + "_" + courseId;
    const existing = existingByCourse.get(entitlementId) || {};
    const grants = { ...(existing.grants || {}) };

    // Rebuild only migration grants. Future trusted payment/institution
    // grants remain intact and can coexist with legacy access grants.
    for (const key of Object.keys(grants)) {
      if (key.startsWith("legacy_institution_") || key.startsWith("legacy_marketplace_")) delete grants[key];
    }
    Object.assign(grants, currentLegacyGrants.get(courseId) || {});

    const activeGrants = Object.values(grants).filter(g => g && g.status === "active");
    const status = activeGrants.length ? "active" : "revoked";
    if (status === "active") entitledCourseIds.push(courseId);

    const grantsUnchanged = JSON.stringify(existing.grants || {}) === JSON.stringify(grants);
    const statusUnchanged = existing.status === status
      && Number(existing.activeGrantCount || 0) === activeGrants.length
      && existing.migrationVersion === 1;
    if (grantsUnchanged && statusUnchanged) continue;

    const payload = {
      studentUid: uid,
      courseId,
      status,
      grants,
      activeGrantCount: activeGrants.length,
      migrationVersion: 1,
      updatedAt: now
    };
    if (!existing.createdAt) payload.createdAt = now;
    batch.set(db.doc("courseEntitlements/" + entitlementId), payload, { merge: true });
    pendingWrites++;
    if (pendingWrites >= 400) {
      await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  }

  if (pendingWrites > 0) await batch.commit();

  return {
    success: true,
    entitledCourseIds,
    activeCourseCount: entitledCourseIds.length,
    checkedRecords: institutionRecords.length + marketplaceRecords.length
  };
});


// ============================================================
// INSTITUTION ENROLMENT -> CANONICAL COURSE ENTITLEMENTS
// Trusted Firestore triggers keep grants current as staff enrol,
// update or revoke institution learners. Each source grant is
// independent, so revoking one institution record cannot erase
// a separate marketplace purchase or another institution grant.
// ============================================================

async function syncInstitutionGrant({ studentUid, sourceId, data, deleted = false }) {
  const institutionId = safeText(data?.institutionId);
  const courseId = safeText(data?.courseId || data?.courseID || data?.course);
  if (!studentUid || !institutionId || !courseId) return;

  const entitlementId = studentUid + "_" + courseId;
  const grantKey = ("institution_" + institutionId + "_" + sourceId)
    .replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 140);
  const entitlementRef = db.doc("courseEntitlements/" + entitlementId);
  let grant = null;

  if (!deleted) {
    const status = entitlementRecordStatus(data.status);
    if (["active", "approved", "completed"].includes(status)) {
      const [userSnap, institutionSnap, memberSnap, courseSnap] = await Promise.all([
        db.doc("users/" + studentUid).get(),
        db.doc("institutions/" + institutionId).get(),
        db.doc("institutions/" + institutionId + "/members/" + studentUid).get(),
        db.doc("courses/" + courseId).get()
      ]);
      const user = userSnap.exists ? userSnap.data() : {};
      const institution = institutionSnap.exists ? institutionSnap.data() : {};
      const member = memberSnap.exists ? memberSnap.data() : {};
      const course = courseSnap.exists ? courseSnap.data() : {};
      const studentActive = user.role === "student" && user.status === "active" && user.active === true;
      const institutionActive = institutionSnap.exists && institution.status === "active";
      const memberActive = memberSnap.exists
        ? member.status === "active" && member.active !== false
        : user.institutionId === institutionId && user.status === "active" && user.active === true;
      const courseBelongsToInstitution = !course.institutionId || course.institutionId === institutionId;
      if (studentActive && institutionActive && memberActive && courseSnap.exists && courseBelongsToInstitution) {
        grant = {
          source: "institution_enrollment",
          sourceRecordId: sourceId,
          institutionId,
          institutionName: safeText(data.institutionName || data.schoolName || institution.institutionName),
          status: "active",
          grantedAt: Timestamp.now()
        };
      }
    }
  }

  await db.runTransaction(async transaction => {
    const snap = await transaction.get(entitlementRef);
    const current = snap.exists ? snap.data() : {};
    const grants = { ...(current.grants || {}) };
    if (grant) grants[grantKey] = grant;
    else delete grants[grantKey];
    const activeGrants = Object.values(grants).filter(item => item?.status === "active");
    const now = Timestamp.now();
    const payload = {
      studentUid, courseId, grants,
      status: activeGrants.length ? "active" : "revoked",
      activeGrantCount: activeGrants.length,
      migrationVersion: 1,
      updatedAt: now
    };
    if (!current.createdAt) payload.createdAt = now;
    transaction.set(entitlementRef, payload, { merge: true });
  });
}

exports.syncInstitutionNestedEnrollmentEntitlement = onDocumentWritten(
  "students/{studentUid}/enrollments/{enrollmentId}",
  async event => {
    const after = event.data?.after;
    const before = event.data?.before;
    const data = after?.exists ? after.data() : (before?.data() || {});
    await syncInstitutionGrant({
      studentUid: event.params.studentUid,
      sourceId: event.params.enrollmentId,
      data,
      deleted: !after?.exists
    });
  }
);

exports.syncInstitutionTopLevelEnrollmentEntitlement = onDocumentWritten(
  "enrollments/{enrollmentId}",
  async event => {
    const after = event.data?.after;
    const before = event.data?.before;
    const data = after?.exists ? after.data() : (before?.data() || {});
    if (!data.institutionId) return;
    const studentUid = safeText(data.studentId || data.userId || data.studentUid);
    if (!studentUid) return;
    await syncInstitutionGrant({
      studentUid,
      sourceId: event.params.enrollmentId,
      data,
      deleted: !after?.exists
    });
  }
);


// ============================================================

/* ============================================================
   INSTITUTION LEARNER MANAGER — TRUSTED ENROLMENT OPERATIONS
============================================================ */

exports.getInstitutionLearnerManagerData = onCall(async request => {
  const actor = await requireActiveInstitutionMember(request);
  const institutionRef = db.doc("institutions/" + actor.institutionId);
  const institutionSnap = await institutionRef.get();
  if (!institutionSnap.exists || institutionSnap.data().status !== "active") {
    throw new HttpsError("failed-precondition", "The institution workspace is not active.");
  }
  const [membersSnap, enrolmentsSnap, coursesSnap] = await Promise.all([
    db.collection("institutions").doc(actor.institutionId).collection("members")
      .where("role", "==", "student").limit(5000).get(),
    db.collection("enrollments").where("institutionId", "==", actor.institutionId).limit(5000).get(),
    db.collection("courses").where("institutionId", "==", actor.institutionId).limit(100).get()
  ]);
  const learners = membersSnap.docs.map(item => ({ uid: item.id, ...item.data() }))
    .filter(item => item.status === "active" && item.active !== false)
    .map(item => ({
      uid: item.uid,
      fullName: safeText(item.fullName || item.name, "Student"),
      email: safeText(item.email),
      phone: safeText(item.phone),
      status: item.status
    }));
  const courses = coursesSnap.docs.map(item => ({ id: item.id, ...item.data() }))
    .filter(item => item.status === "published" || item.published === true)
    .map(item => ({ id: item.id, title: safeText(item.title, "Untitled course"), category: safeText(item.category), status: safeText(item.status) }));
  const enrolments = enrolmentsSnap.docs.map(item => {
    const data = item.data();
    return {
      id: item.id,
      studentUid: safeText(data.studentId || data.userId || data.studentUid),
      courseId: safeText(data.courseId || data.courseID || data.course),
      status: safeText(data.status, "pending"),
      createdAt: data.createdAt?.toMillis?.() || null
    };
  });
  return {
    success: true,
    institutionId: actor.institutionId,
    institutionName: safeText(institutionSnap.data().institutionName || institutionSnap.data().legalName),
    learners,
    courses,
    enrolments,
    limits: { students: Number(institutionSnap.data().limits?.students || 5000), currentStudents: learners.length }
  };
});

exports.enrollStudentInInstitutionCourse = onCall(async request => {
  const actor = await requireActiveInstitutionMember(request);
  const email = safeText(request.data?.studentEmail).toLowerCase();
  const courseId = safeText(request.data?.courseId);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Enter the learner's registered email address.");
  }
  if (!courseId) throw new HttpsError("invalid-argument", "Choose a course.");
  const institutionRef = db.doc("institutions/" + actor.institutionId);
  const courseRef = db.doc("courses/" + courseId);
  const [institutionSnap, courseSnap] = await Promise.all([institutionRef.get(), courseRef.get()]);
  if (!institutionSnap.exists || institutionSnap.data().status !== "active") {
    throw new HttpsError("failed-precondition", "The institution workspace is not active.");
  }
  if (!courseSnap.exists) throw new HttpsError("not-found", "The selected course does not exist.");
  const course = courseSnap.data();
  if (course.institutionId !== actor.institutionId) {
    throw new HttpsError("permission-denied", "You can only enrol learners in your institution's courses.");
  }
  if (course.status !== "published" && course.published !== true) {
    throw new HttpsError("failed-precondition", "Only published institution courses can be assigned to learners.");
  }
  let studentAuth;
  try {
    studentAuth = await adminAuth.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "No Spark Stack student account uses that email. Ask the learner to create an account first.");
    }
    throw error;
  }
  const studentUid = studentAuth.uid;
  const studentRef = db.doc("users/" + studentUid);
  const memberRef = db.doc("institutions/" + actor.institutionId + "/members/" + studentUid);
  const enrolmentId = ("inst_" + actor.institutionId + "_" + studentUid + "_" + courseId)
    .replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 240);
  const enrolmentRef = db.doc("enrollments/" + enrolmentId);
  const now = Timestamp.now();
  await db.runTransaction(async transaction => {
    const [studentSnap, memberSnap, existingEnrolmentSnap, freshInstitutionSnap] = await Promise.all([
      transaction.get(studentRef), transaction.get(memberRef),
      transaction.get(enrolmentRef), transaction.get(institutionRef)
    ]);
    const student = studentSnap.exists ? studentSnap.data() : {};
    if (!studentSnap.exists || student.role !== "student" || student.status !== "active" || student.active !== true) {
      throw new HttpsError("failed-precondition", "Only active Spark Stack student accounts can be enrolled.");
    }
    if (!freshInstitutionSnap.exists || freshInstitutionSnap.data().status !== "active") {
      throw new HttpsError("failed-precondition", "The institution workspace is no longer active.");
    }
    if (memberSnap.exists && memberSnap.data().role !== "student") {
      throw new HttpsError("failed-precondition", "This account is already registered in the institution under another role.");
    }
    const memberIsActive = memberSnap.exists && memberSnap.data().status === "active" && memberSnap.data().active !== false;
    const limits = freshInstitutionSnap.data().limits || {};
    const usage = freshInstitutionSnap.data().usage || {};
    const maximum = Number(limits.students || 5000);
    const current = Number(usage.students || 0);
    if (!memberIsActive && current >= maximum) {
      throw new HttpsError("resource-exhausted", "The institution has reached its learner capacity.");
    }
    transaction.set(memberRef, {
      uid: studentUid,
      email: safeText(student.email || studentAuth.email).toLowerCase(),
      fullName: safeText(student.fullName || student.name || student.displayName, "Student"),
      name: safeText(student.fullName || student.name || student.displayName, "Student"),
      phone: safeText(student.phone),
      role: "student", status: "active", active: true,
      enrolledBy: actor.uid, institutionId: actor.institutionId,
      createdAt: memberSnap.exists ? (memberSnap.data().createdAt || now) : now,
      updatedAt: now
    }, { merge: true });
    transaction.set(enrolmentRef, {
      enrollmentId: enrolmentId,
      studentId: studentUid, userId: studentUid,
      courseId, institutionId: actor.institutionId,
      institutionName: safeText(freshInstitutionSnap.data().institutionName || freshInstitutionSnap.data().legalName),
      status: "active", paymentStatus: "institution_grant",
      source: "institution_enrollment", createdBy: actor.uid,
      createdAt: existingEnrolmentSnap.exists ? (existingEnrolmentSnap.data().createdAt || now) : now,
      updatedAt: now,
      ...(existingEnrolmentSnap.exists ? { reactivatedAt: now, reactivatedBy: actor.uid } : {})
    }, { merge: true });
    if (!memberIsActive) {
      transaction.update(institutionRef, { "usage.students": current + 1, updatedAt: now });
    }
  });
  await db.collection("audit_logs").add({
    action: "institution_student_course_enrolled", actorId: actor.uid,
    targetId: studentUid, targetEmail: email, institutionId: actor.institutionId,
    courseId, enrollmentId: enrolmentId, createdAt: now
  });
  return { success: true, studentUid, enrollmentId: enrolmentId, message: "Learner enrolled. Course access is being synchronised securely." };
});

exports.revokeInstitutionCourseEnrollment = onCall(async request => {
  const actor = await requireActiveInstitutionMember(request);
  const enrollmentId = safeText(request.data?.enrollmentId);
  if (!enrollmentId) throw new HttpsError("invalid-argument", "Choose an enrolment to revoke.");
  const enrollmentRef = db.doc("enrollments/" + enrollmentId);
  const snapshot = await enrollmentRef.get();
  if (!snapshot.exists || snapshot.data().institutionId !== actor.institutionId) {
    throw new HttpsError("not-found", "The institution enrolment could not be found.");
  }
  if (snapshot.data().status === "revoked") return { success: true, alreadyRevoked: true };
  const now = Timestamp.now();
  await enrollmentRef.set({ status: "revoked", revokedAt: now, revokedBy: actor.uid, updatedAt: now }, { merge: true });
  await db.collection("audit_logs").add({
    action: "institution_student_course_access_revoked", actorId: actor.uid,
    targetId: safeText(snapshot.data().studentId || snapshot.data().userId),
    institutionId: actor.institutionId,
    courseId: safeText(snapshot.data().courseId || snapshot.data().courseID),
    enrollmentId, createdAt: now
  });
  return { success: true, message: "This institution's course access has been revoked." };
});

// MANUAL M-PESA COURSE PAYMENTS
// Students submit a Safaricom receipt code after paying the
// configured personal M-Pesa receiver. No entitlement is granted
// until an authorised Finance reviewer matches the incoming
// transaction against the actual receiving-account records.
// ============================================================

async function requirePaymentReviewer(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to review payments.");
  const [userSnap, founderSnap] = await Promise.all([
    db.doc("users/" + uid).get(),
    db.doc("founder/" + uid).get()
  ]);
  const user = userSnap.exists ? userSnap.data() : {};
  const founder = founderSnap.exists ? founderSnap.data() : {};
  const isFounder = founder.role === "founder" && founder.status === "active"
    && founder.active !== false && founder.verified !== false;
  const labels = [user.adminRole, user.department, user.position]
    .map(value => safeText(value).toLowerCase().replace(/\s+/g, "_"));
  const financeRole = ["finance", "finance_manager", "financial_manager"].includes(safeText(user.role).toLowerCase())
    || labels.some(value => ["finance", "finance_manager", "financial_manager"].includes(value));
  const financePermission = user.permissions?.verifyPayments === true
    || user.permissions?.managePayments === true;
  const activeAdmin = ["admin", "administrator", "moderator", "finance_manager", "financial_manager"]
    .includes(safeText(user.role).toLowerCase()) && user.status === "active" && user.active === true;
  if (!isFounder && !(activeAdmin && (financeRole || financePermission))) {
    throw new HttpsError("permission-denied", "Only the Founder or an authorised Finance reviewer can verify M-Pesa receipts.");
  }
  return { uid, role: isFounder ? "founder" : "finance" };
}

function normalizeManualMpesaPhone(value) {
  let phone = safeText(value).replace(/[\s()+-]/g, "");
  if (phone.startsWith("0")) phone = "254" + phone.slice(1);
  if (phone.startsWith("7") || phone.startsWith("1")) phone = "254" + phone;
  if (!/^254[17]\d{8}$/.test(phone)) {
    throw new HttpsError("invalid-argument", "Enter a valid Kenyan M-Pesa phone number.");
  }
  return phone;
}

exports.getFounderManualMpesaPaymentConfig = onCall(async request => {
  await requireFounder(request);
  const snap = await db.doc("platform_controls/global").get();
  const config = snap.data()?.manualMpesa || {};
  return {
    enabled: config.enabled === true,
    receiverName: safeText(config.receiverName),
    receiverPhone: safeText(config.receiverPhone),
    instructions: safeText(config.instructions)
  };
});

exports.saveFounderManualMpesaPaymentConfig = onCall(async request => {
  const founder = await requireFounder(request);
  const input = request.data || {};
  const enabled = input.enabled === true;
  const receiverName = safeText(input.receiverName);
  const receiverPhone = safeText(input.receiverPhone);
  const instructions = safeText(input.instructions);
  if (enabled && (!receiverName || receiverName.length < 2 || receiverName.length > 100)) {
    throw new HttpsError("invalid-argument", "Enter the personal M-Pesa account holder name.");
  }
  let normalizedPhone = "";
  if (enabled) normalizedPhone = normalizeManualMpesaPhone(receiverPhone);
  if (instructions.length > 300) throw new HttpsError("invalid-argument", "Payment instructions must be 300 characters or fewer.");
  const now = Timestamp.now();
  await db.doc("platform_controls/global").set({
    manualMpesa: {
      enabled,
      receiverName,
      receiverPhone: normalizedPhone,
      instructions,
      receivingArrangement: "personal",
      currency: "KES",
      updatedBy: founder.uid,
      updatedAt: now
    },
    updatedAt: now
  }, { merge: true });
  await db.collection("audit_logs").add({
    action: "manual_mpesa_collection_settings_updated",
    actorId: founder.uid,
    enabled,
    receiverName,
    receiverPhone: normalizedPhone,
    receivingArrangement: "personal",
    createdAt: now
  });
  return { success: true, enabled, receiverName, receiverPhone: normalizedPhone };
});

exports.getManualMpesaPaymentConfig = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to view payment instructions.");
  const [userSnap, controlsSnap] = await Promise.all([
    db.doc("users/" + uid).get(),
    db.doc("platform_controls/global").get()
  ]);
  const user = userSnap.exists ? userSnap.data() : {};
  if (user.role !== "student" || user.status !== "active" || user.active !== true) {
    throw new HttpsError("permission-denied", "An active student account is required.");
  }
  const config = controlsSnap.data()?.manualMpesa || {};
  return {
    enabled: config.enabled === true,
    receiverName: safeText(config.receiverName),
    receiverPhone: safeText(config.receiverPhone),
    instructions: safeText(config.instructions, "Send the exact amount to the personal M-Pesa number shown. Keep your Safaricom confirmation message."),
    currency: "KES"
  };
});

exports.submitManualCoursePayment = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in before submitting a payment.");
  const [userSnap, controlsSnap] = await Promise.all([
    db.doc("users/" + uid).get(),
    db.doc("platform_controls/global").get()
  ]);
  const user = userSnap.exists ? userSnap.data() : {};
  if (user.role !== "student" || user.status !== "active" || user.active !== true) {
    throw new HttpsError("permission-denied", "An active student account is required.");
  }
  const config = controlsSnap.data()?.manualMpesa || {};
  if (config.enabled !== true || !safeText(config.receiverPhone) || !safeText(config.receiverName)) {
    throw new HttpsError("failed-precondition", "M-Pesa collection is not configured yet. Please contact Academy support.");
  }

  const courseId = safeText(request.data?.courseId);
  const mpesaCode = safeText(request.data?.mpesaCode).toUpperCase();
  const payerPhone = normalizeManualMpesaPhone(request.data?.payerPhone);
  if (!courseId) throw new HttpsError("invalid-argument", "Course ID is required.");
  if (!/^[A-Z0-9]{8,12}$/.test(mpesaCode)) {
    throw new HttpsError("invalid-argument", "Enter the M-Pesa receipt code exactly as shown in your Safaricom message.");
  }

  const courseSnap = await db.doc("courses/" + courseId).get();
  if (!courseSnap.exists) throw new HttpsError("not-found", "This course could not be found.");
  const course = courseSnap.data();
  const courseStatus = safeText(course.status, "published").toLowerCase();
  if (["draft", "archived", "deleted", "rejected", "suspended"].includes(courseStatus)) {
    throw new HttpsError("failed-precondition", "This course is not currently available for purchase.");
  }
  if (course.institutionId) {
    throw new HttpsError("failed-precondition", "Institution-issued courses are settled directly by the institution and cannot be paid through the Academy personal M-Pesa collection.");
  }
  const basePrice = Number(course.price || 0);
  const discountPrice = Number(course.discountPrice || 0);
  const amount = discountPrice > 0 && discountPrice < basePrice ? discountPrice : basePrice;
  const currency = safeText(course.currency, "KES").toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount) || currency !== "KES") {
    throw new HttpsError("failed-precondition", "This course does not have a valid KES price for manual M-Pesa payment.");
  }

  const entitlementRef = db.doc("courseEntitlements/" + uid + "_" + courseId);
  const entitlementSnap = await entitlementRef.get();
  if (entitlementSnap.exists && entitlementSnap.data().status === "active") {
    throw new HttpsError("already-exists", "You already have access to this course.");
  }

  const receiptRef = db.doc("mpesaReceipts/" + mpesaCode);
  const paymentRef = db.collection("payments").doc();
  const now = Timestamp.now();
  await db.runTransaction(async transaction => {
    const receiptSnap = await transaction.get(receiptRef);
    if (receiptSnap.exists) {
      throw new HttpsError("already-exists", "This M-Pesa receipt code has already been submitted. Contact Finance if you believe this is an error.");
    }
    transaction.create(receiptRef, {
      receiptCode: mpesaCode,
      paymentId: paymentRef.id,
      studentUid: uid,
      status: "pending_verification",
      createdAt: now
    });
    transaction.create(paymentRef, {
      paymentId: paymentRef.id,
      userId: uid,
      studentId: uid,
      studentName: safeText(user.fullName || user.name || request.auth.token.name, "Student"),
      studentEmail: safeText(user.email || request.auth.token.email),
      courseId,
      courseName: safeText(course.title || course.name, "Course"),
      instructorId: safeText(course.instructorId || course.instructorUid),
      amount,
      currency: "KES",
      method: "M-Pesa",
      provider: "manual_safaricom_receipt",
      mpesaCode,
      payerPhone,
      receiverPhone: safeText(config.receiverPhone),
      status: "pending_verification",
      verificationStatus: "pending",
      entitlementGranted: false,
      createdAt: now,
      updatedAt: now
    });
  });

  await db.collection("audit_logs").add({
    action: "manual_mpesa_payment_submitted",
    actorId: uid,
    targetId: paymentRef.id,
    courseId,
    receiptCode: mpesaCode,
    amount,
    currency: "KES",
    createdAt: Timestamp.now()
  });

  return {
    success: true,
    paymentId: paymentRef.id,
    status: "pending_verification",
    amount,
    currency: "KES",
    message: "Your receipt has been submitted. Course access remains locked while Finance verifies the payment."
  };
});

exports.verifyManualCoursePayment = onCall(async request => {
  const reviewer = await requirePaymentReviewer(request);
  const paymentId = safeText(request.data?.paymentId);
  const verifiedAmount = Number(request.data?.verifiedAmount);
  const verificationNote = safeText(request.data?.verificationNote);
  if (!paymentId) throw new HttpsError("invalid-argument", "Payment ID is required.");

  const paymentRef = db.doc("payments/" + paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment submission was not found.");
  const payment = paymentSnap.data();
  if (payment.provider !== "manual_safaricom_receipt" || payment.method !== "M-Pesa") {
    throw new HttpsError("failed-precondition", "This is not a manual M-Pesa course payment.");
  }
  if (payment.status !== "pending_verification") {
    throw new HttpsError("failed-precondition", "This payment is no longer awaiting verification.");
  }
  if (!Number.isFinite(verifiedAmount) || verifiedAmount !== Number(payment.amount)) {
    throw new HttpsError("failed-precondition", "The verified incoming amount must exactly match the course amount.");
  }

  const courseSnap = await db.doc("courses/" + payment.courseId).get();
  if (!courseSnap.exists) throw new HttpsError("not-found", "The course linked to this payment no longer exists.");
  const course = courseSnap.data();
  const studentUid = safeText(payment.userId);
  const courseId = safeText(payment.courseId);
  const entitlementRef = db.doc("courseEntitlements/" + studentUid + "_" + courseId);
  const receiptRef = db.doc("mpesaReceipts/" + payment.mpesaCode);
  const ledgerRef = db.doc("paymentLedger/" + paymentId);
  const now = Timestamp.now();
  const gross = Number(payment.amount);
  const instructorShare = Math.round(gross * 0.75 * 100) / 100;
  const academyShare = Math.round((gross - instructorShare) * 100) / 100;
  const grantKey = "manual_mpesa_" + paymentId;

  await db.runTransaction(async transaction => {
    const [freshPayment, receiptSnap, entitlementSnap] = await Promise.all([
      transaction.get(paymentRef),
      transaction.get(receiptRef),
      transaction.get(entitlementRef)
    ]);
    if (!freshPayment.exists || freshPayment.data().status !== "pending_verification") {
      throw new HttpsError("failed-precondition", "This payment has already been processed.");
    }
    if (!receiptSnap.exists || receiptSnap.data().paymentId !== paymentId) {
      throw new HttpsError("failed-precondition", "The M-Pesa receipt lock does not match this payment.");
    }
    const current = entitlementSnap.exists ? entitlementSnap.data() : {};
    const grants = { ...(current.grants || {}) };
    grants[grantKey] = {
      source: "verified_manual_mpesa_purchase",
      sourceRecordId: paymentId,
      paymentId,
      status: "active",
      amount: gross,
      currency: "KES",
      grantedAt: now
    };
    const activeGrantCount = Object.values(grants).filter(item => item?.status === "active").length;
    transaction.update(paymentRef, {
      status: "paid",
      verificationStatus: "verified",
      verifiedBy: reviewer.uid,
      verifiedByRole: reviewer.role,
      verifiedAmount,
      verificationNote,
      verifiedAt: now,
      entitlementGranted: true,
      updatedAt: now
    });
    transaction.update(receiptRef, {
      status: "verified",
      verifiedBy: reviewer.uid,
      verifiedAt: now
    });
    transaction.set(entitlementRef, {
      studentUid,
      courseId,
      status: "active",
      grants,
      activeGrantCount,
      migrationVersion: 1,
      updatedAt: now,
      ...(current.createdAt ? {} : { createdAt: now })
    }, { merge: true });
    transaction.create(ledgerRef, {
      paymentId,
      studentUid,
      courseId,
      instructorId: safeText(payment.instructorId || course.instructorId || course.instructorUid),
      grossAmount: gross,
      instructorShare,
      academyShare,
      currency: "KES",
      status: "posted",
      source: "manual_mpesa",
      verifiedBy: reviewer.uid,
      createdAt: now
    });
  });

  await db.collection("audit_logs").add({
    action: "manual_mpesa_payment_verified",
    actorId: reviewer.uid,
    actorRole: reviewer.role,
    targetId: paymentId,
    studentUid,
    courseId,
    receiptCode: payment.mpesaCode,
    amount: gross,
    currency: "KES",
    createdAt: Timestamp.now()
  });

  return { success: true, paymentId, status: "paid", entitlementGranted: true };
});

const MARKETPLACE_PRICE_TYPES = [
  { key: "course", label: "Individual courses", unit: "per course", proposed: 2500 },
  { key: "mentorship", label: "Mentorship", unit: "per session", proposed: 1500 },
  { key: "professional_service", label: "Professional services", unit: "starting price", proposed: 5000 },
  { key: "course_bundle", label: "Course bundles", unit: "per bundle", proposed: 5500 },
  { key: "bootcamp", label: "Boot camps", unit: "per learner / cohort", proposed: 7500 },
  { key: "digital_product", label: "Digital products", unit: "per item", proposed: 500 },
  { key: "addon", label: "Platform add-ons", unit: "per add-on / month", proposed: 300 },
  { key: "corporate_training", label: "Corporate training", unit: "starting price per cohort", proposed: 75000 },
  { key: "institution_onboarding", label: "Institution onboarding", unit: "one-time per institution", proposed: 15000 },
  { key: "institution_monthly", label: "Institution subscription", unit: "per institution / month", proposed: 7500 },
  { key: "institution_annual", label: "Institution subscription", unit: "per institution / year", proposed: 75000 },
  { key: "student_membership_monthly", label: "Student membership", unit: "per student / month", proposed: 499 },
  { key: "student_membership_annual", label: "Student membership", unit: "per student / year", proposed: 4999 }
];

exports.getMarketplacePricing = onCall(async request => {
  await requireFounder(request);
  const ref = db.doc("marketplacePricing/global");
  const [snap, versionsSnap] = await Promise.all([ref.get(), ref.collection("versions").limit(12).get()]);
  const saved = snap.exists ? snap.data() : {};
  const supportedCurrencies = ["KES", "USD", "EUR", "GBP"];
  const prices = Object.fromEntries(MARKETPLACE_PRICE_TYPES.map(item => {
    const configured = saved.prices?.[item.key] || {};
    const amounts = {};
    for (const code of supportedCurrencies) {
      const legacyAmount = configured.currency === code || (!configured.currency && (saved.currency || "KES") === code) ? configured.amount : undefined;
      const candidate = configured.amounts?.[code] ?? legacyAmount ?? (code === "KES" ? item.proposed : null);
      amounts[code] = Number.isFinite(Number(candidate)) && candidate !== null ? Number(candidate) : null;
    }
    return [item.key, { label: item.label, unit: item.unit, proposedAmount: item.proposed, amounts, enabled: configured.enabled === true }];
  }));
  const history = versionsSnap.docs.map(doc => {
    const value = doc.data();
    return { version: value.version || 0, currency: value.currency || "KES", createdAt: value.createdAt?.toDate?.()?.toISOString?.() || null, actorEmail: value.actorEmail || "", summary: value.summary || "Price book updated" };
  }).sort((a,b) => (b.version || 0) - (a.version || 0));
  return { currency: saved.currency || "KES", prices, transactionFeeEnabled: saved.transactionFeeEnabled === true, transactionFeePercent: Number(saved.transactionFeePercent || 0), pricingStatus: saved.pricingStatus || "proposed", version: Number(saved.version || 0), history };
});

exports.saveMarketplacePricing = onCall(async request => {
  const founder = await requireFounder(request);
  const payload = request.data || {};
  const currency = safeText(payload.currency, "KES").toUpperCase();
  if (!["KES", "USD", "EUR", "GBP"].includes(currency)) throw new HttpsError("invalid-argument", "Unsupported marketplace currency.");
  const supportedCurrencies = ["KES", "USD", "EUR", "GBP"];
  const incoming = payload.prices || {};
  const prices = {};
  for (const item of MARKETPLACE_PRICE_TYPES) {
    const value = incoming[item.key] || {};
    const amounts = {};
    for (const code of supportedCurrencies) {
      const raw = value.amounts && Object.prototype.hasOwnProperty.call(value.amounts, code) ? value.amounts[code] : (code === currency ? value.amount : null);
      if (raw === null || raw === undefined || raw === "") { amounts[code] = null; continue; }
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount < 0 || amount > 100000000 || Number(amount.toFixed(2)) !== amount) throw new HttpsError("invalid-argument", "Invalid " + code + " price for " + item.label + ".");
      amounts[code] = amount;
    }
    if (amounts[currency] === null) throw new HttpsError("invalid-argument", "Enter a price in the selected primary currency for " + item.label + ".");
    prices[item.key] = { amounts, amount: amounts[currency], currency, enabled: value.enabled === true, unit: item.unit, label: item.label };
  }
  const transactionFeePercent = Number(payload.transactionFeePercent || 0);
  if (!Number.isFinite(transactionFeePercent) || transactionFeePercent < 0 || transactionFeePercent > 20) throw new HttpsError("invalid-argument", "Transaction fee must be between 0 and 20 percent.");
  if (payload.transactionFeeEnabled === true && transactionFeePercent <= 0) throw new HttpsError("failed-precondition", "Enter a transaction fee above zero or disable the fee.");
  const now = Timestamp.now();
  const rootRef = db.doc("marketplacePricing/global");
  const version = await db.runTransaction(async tx => {
    const current = await tx.get(rootRef);
    const nextVersion = Number(current.data()?.version || 0) + 1;
    const snapshot = {
      version: nextVersion, currency, supportedCurrencies: ["KES", "USD", "EUR", "GBP"], prices,
      transactionFeeEnabled: payload.transactionFeeEnabled === true,
      transactionFeePercent, pricingStatus: "proposed",
      createdAt: now, actorId: founder.uid,
      actorEmail: request.auth.token.email || "",
      summary: "Founder price book revision " + nextVersion
    };
    tx.set(rootRef, { ...snapshot, updatedAt: now, updatedBy: founder.uid }, { merge: true });
    tx.create(rootRef.collection("versions").doc(String(nextVersion).padStart(8, "0")), snapshot);
    return nextVersion;
  });
  await db.collection("audit_logs").add({ action: "marketplace_pricing_proposals_updated", actorId: founder.uid, currency, version, createdAt: now });
  return { success: true, pricingStatus: "proposed", version, prices };
});



const GLOBAL_CURRENCY_CODES = ["KES","USD","EUR","GBP","UGX","TZS","NGN","ZAR","INR","AED","CAD","AUD"];
const GLOBAL_PRICE_KEYS = MARKETPLACE_PRICE_TYPES.map(item => item.key);

exports.getMarketplaceCurrencyConfig = onCall(async request => {
  await requireFounder(request);
  const ref = db.doc("marketplaceCurrencyConfig/global");
  const [snap, versionsSnap] = await Promise.all([ref.get(), ref.collection("versions").limit(12).get()]);
  const saved = snap.exists ? snap.data() : {};
  const rates = {};
  for (const code of GLOBAL_CURRENCY_CODES) {
    rates[code] = code === "KES" ? 1 : (Number.isFinite(Number(saved.rates?.[code])) && Number(saved.rates?.[code]) > 0 ? Number(saved.rates[code]) : null);
  }
  const overrides = {};
  for (const key of GLOBAL_PRICE_KEYS) {
    overrides[key] = {};
    for (const code of GLOBAL_CURRENCY_CODES) {
      const value = saved.regionalOverrides?.[key]?.[code];
      overrides[key][code] = value === null || value === undefined || value === "" ? null : Number(value);
    }
  }
  const history = versionsSnap.docs.map(doc => {
    const v = doc.data();
    return { version: v.version || 0, createdAt: v.createdAt?.toDate?.()?.toISOString?.() || null, actorEmail: v.actorEmail || "", summary: v.summary || "Currency configuration updated" };
  }).sort((a,b) => b.version-a.version);
  return { baseCurrency: "KES", supportedCurrencies: GLOBAL_CURRENCY_CODES, rates, regionalOverrides: overrides, version: Number(saved.version || 0), status: saved.status || "proposed", history };
});

exports.saveMarketplaceCurrencyConfig = onCall(async request => {
  const founder = await requireFounder(request);
  const payload = request.data || {};
  if (payload.baseCurrency && safeText(payload.baseCurrency).toUpperCase() !== "KES") {
    throw new HttpsError("failed-precondition", "KES remains the accounting and settlement base currency in this phase.");
  }
  const incomingRates = payload.rates || {};
  const rates = { KES: 1 };
  for (const code of GLOBAL_CURRENCY_CODES.filter(code => code !== "KES")) {
    const raw = incomingRates[code];
    if (raw === null || raw === undefined || raw === "") { rates[code] = null; continue; }
    const rate = Number(raw);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 100000000 || Number(rate.toFixed(6)) !== rate) {
      throw new HttpsError("invalid-argument", "Exchange rate for " + code + " must be a positive KES-per-unit value with up to six decimal places.");
    }
    rates[code] = rate;
  }
  const incomingOverrides = payload.regionalOverrides || {};
  const regionalOverrides = {};
  for (const key of GLOBAL_PRICE_KEYS) {
    regionalOverrides[key] = {};
    for (const code of GLOBAL_CURRENCY_CODES) {
      const raw = incomingOverrides[key]?.[code];
      if (raw === null || raw === undefined || raw === "") { regionalOverrides[key][code] = null; continue; }
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount < 0 || amount > 100000000 || Number(amount.toFixed(2)) !== amount) {
        throw new HttpsError("invalid-argument", "Invalid " + code + " regional override for " + key + ".");
      }
      regionalOverrides[key][code] = amount;
    }
  }
  const now = Timestamp.now();
  const rootRef = db.doc("marketplaceCurrencyConfig/global");
  const version = await db.runTransaction(async tx => {
    const current = await tx.get(rootRef);
    const nextVersion = Number(current.data()?.version || 0) + 1;
    const snapshot = {
      version: nextVersion, baseCurrency: "KES", supportedCurrencies: GLOBAL_CURRENCY_CODES,
      rates, regionalOverrides, status: "proposed", createdAt: now,
      actorId: founder.uid, actorEmail: request.auth.token.email || "",
      summary: "Global currency configuration revision " + nextVersion
    };
    tx.set(rootRef, { ...snapshot, updatedAt: now, updatedBy: founder.uid }, { merge: true });
    tx.create(rootRef.collection("versions").doc(String(nextVersion).padStart(8, "0")), snapshot);
    return nextVersion;
  });
  await db.collection("audit_logs").add({
    action: "marketplace_currency_config_updated", actorId: founder.uid,
    version, baseCurrency: "KES", createdAt: now
  });
  return { success: true, status: "proposed", version };
});

// Founder-only country-level aggregate. Country is taken only from explicit account/profile fields;
// no IP geolocation or inferred location is used.


const SSA_COUNTRY_CODES = new Set(["KE","UG","TZ","RW","BI","ET","SO","SS","SD","ZA","NG","GH","EG","MA","DZ","SN","CI","CM","ZM","ZW","MW","MZ","BW","NA","US","CA","GB","IE","FR","DE","ES","IT","NL","BE","CH","SE","NO","DK","FI","PL","PT","GR","TR","AE","SA","QA","IN","PK","BD","CN","JP","KR","SG","MY","ID","PH","TH","VN","AU","NZ","BR","MX","AR","CL","CO","RU","UA","IL","JO","LB","OM","KW","BH"]);
exports.updateMyCountry = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to update your profile.");
  const countryCode = safeText(request.data?.countryCode).toUpperCase();
  if (!SSA_COUNTRY_CODES.has(countryCode)) throw new HttpsError("invalid-argument", "Select a supported country.");
  const countryNames = {"KE":"Kenya","UG":"Uganda","TZ":"Tanzania","RW":"Rwanda","BI":"Burundi","ET":"Ethiopia","SO":"Somalia","SS":"South Sudan","SD":"Sudan","ZA":"South Africa","NG":"Nigeria","GH":"Ghana","EG":"Egypt","MA":"Morocco","DZ":"Algeria","SN":"Senegal","CI":"Côte d’Ivoire","CM":"Cameroon","ZM":"Zambia","ZW":"Zimbabwe","MW":"Malawi","MZ":"Mozambique","BW":"Botswana","NA":"Namibia","US":"United States","CA":"Canada","GB":"United Kingdom","IE":"Ireland","FR":"France","DE":"Germany","ES":"Spain","IT":"Italy","NL":"Netherlands","BE":"Belgium","CH":"Switzerland","SE":"Sweden","NO":"Norway","DK":"Denmark","FI":"Finland","PL":"Poland","PT":"Portugal","GR":"Greece","TR":"Türkiye","AE":"United Arab Emirates","SA":"Saudi Arabia","QA":"Qatar","IN":"India","PK":"Pakistan","BD":"Bangladesh","CN":"China","JP":"Japan","KR":"South Korea","SG":"Singapore","MY":"Malaysia","ID":"Indonesia","PH":"Philippines","TH":"Thailand","VN":"Vietnam","AU":"Australia","NZ":"New Zealand","BR":"Brazil","MX":"Mexico","AR":"Argentina","CL":"Chile","CO":"Colombia","RU":"Russia","UA":"Ukraine","IL":"Israel","JO":"Jordan","LB":"Lebanon","OM":"Oman","KW":"Kuwait","BH":"Bahrain"};
  const country = countryNames[countryCode];
  const now = Timestamp.now();
  const userSnap = await db.doc("users/" + uid).get();
  const role = safeText(userSnap.data()?.role).toLowerCase();
  const profileCollection = role === "student" ? "students" : role === "instructor" ? "instructors" : "";
  const writes = [
    db.doc("users/" + uid).set({ countryCode, country, countryUpdatedAt: now }, { merge: true })
  ];
  if (profileCollection) {
    writes.push(db.doc(profileCollection + "/" + uid).set({ countryCode, country, countryUpdatedAt: now }, { merge: true }));
  }
  await Promise.all(writes);
  await db.collection("audit_logs").add({ action: "profile_country_updated", actorId: uid, countryCode, createdAt: now });
  return { success: true, countryCode, country };
});

exports.getFounderGlobalStats = onCall(async request => {
  await requireFounder(request);
  const countries = {};
  const roles = {};
  const monthlyRegistrations = {};
  const topCourses = {};
  const userCountries = {};
  const totals = {
    totalUsers: 0, activeUsers: 0, unknownCountry: 0,
    institutions: 0, activeInstitutions: 0, unknownInstitutionCountry: 0,
    verifiedCourseSales: 0, verifiedCourseRevenueKES: 0,
    verifiedOnboardingPayments: 0, verifiedOnboardingRevenueKES: 0,
    courseRevenueByCurrency: {}, onboardingRevenueByCurrency: {}
  };
  const limits = { users: 20000, institutions: 10000, paymentLedger: 20000, institutionPayments: 10000 };
  const scanned = { users: 0, institutions: 0, paymentLedger: 0, institutionPayments: 0 };
  const pageSize = 500;
  const getCountry = data => {
    const raw = safeText(data?.countryCode || data?.country || data?.location?.countryCode || data?.location?.country || data?.address?.countryCode || data?.address?.country).toUpperCase();
    return /^[A-Z]{2,3}$/.test(raw) ? raw : "";
  };
  const ensureCountry = code => {
    if (!countries[code]) countries[code] = {
      countryCode: code, users: 0, activeUsers: 0, roles: {},
      institutions: 0, activeInstitutions: 0,
      courseSales: 0, courseRevenueKES: 0, courseCounts: {},
      onboardingPayments: 0, onboardingRevenueKES: 0
    };
    return countries[code];
  };
  const scanCollection = async (name, max, handler) => {
    let cursor = null;
    while (scanned[name] < max) {
      let q = db.collection(name).orderBy("__name__").limit(Math.min(pageSize, max - scanned[name]));
      if (cursor) q = q.startAfter(cursor);
      const snap = await q.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        scanned[name]++;
        await handler(doc.id, doc.data() || {});
      }
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }
  };

  await scanCollection("users", limits.users, async (uid, u) => {
    totals.totalUsers++;
    const role = safeText(u.role, "unknown").toLowerCase() || "unknown";
    roles[role] = (roles[role] || 0) + 1;
    const status = safeText(u.status, "active").toLowerCase();
    const active = u.active !== false && ["active", "approved"].includes(status);
    if (active) totals.activeUsers++;
    const code = getCountry(u);
    userCountries[uid] = code;
    if (!code) totals.unknownCountry++;
    else {
      const row = ensureCountry(code);
      row.users++;
      if (active) row.activeUsers++;
      row.roles[role] = (row.roles[role] || 0) + 1;
    }
    const created = u.createdAt?.toDate ? u.createdAt.toDate() : (u.createdAt ? new Date(u.createdAt) : null);
    if (created && !Number.isNaN(created.getTime())) {
      const month = created.getUTCFullYear() + "-" + String(created.getUTCMonth()+1).padStart(2,"0");
      monthlyRegistrations[month] = (monthlyRegistrations[month] || 0) + 1;
    }
  });

  await scanCollection("institutions", limits.institutions, async (_id, institution) => {
    totals.institutions++;
    const active = safeText(institution.status).toLowerCase() === "active" || safeText(institution.subscription?.status).toLowerCase() === "active";
    if (active) totals.activeInstitutions++;
    const code = getCountry(institution);
    if (!code) { totals.unknownInstitutionCountry++; return; }
    const row = ensureCountry(code);
    row.institutions++;
    if (active) row.activeInstitutions++;
  });

  await scanCollection("paymentLedger", limits.paymentLedger, async (_id, ledger) => {
    if (ledger.status !== "posted" || ledger.source !== "manual_mpesa") return;
    const amount = Number(ledger.grossAmount);
    const currency = safeText(ledger.currency, "KES").toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0) return;
    totals.verifiedCourseSales++;
    totals.courseRevenueByCurrency[currency] = (totals.courseRevenueByCurrency[currency] || 0) + amount;
    if (currency === "KES") totals.verifiedCourseRevenueKES += amount;
    const code = userCountries[safeText(ledger.studentUid)] || "";
    if (code) {
      const row = ensureCountry(code);
      row.courseSales++;
      row.courseCounts[safeText(ledger.courseId, "unknown")] = (row.courseCounts[safeText(ledger.courseId, "unknown")] || 0) + 1;
      if (currency === "KES") row.courseRevenueKES += amount;
    }
    const courseId = safeText(ledger.courseId);
    if (courseId) {
      if (!topCourses[courseId]) topCourses[courseId] = { courseId, sales: 0, revenueKES: 0 };
      topCourses[courseId].sales++;
      if (currency === "KES") topCourses[courseId].revenueKES += amount;
    }
  });

  await scanCollection("institutionPayments", limits.institutionPayments, async (_id, payment) => {
    if (payment.status !== "paid") return;
    const amount = Number(payment.paidAmount || payment.amount);
    const currency = safeText(payment.currency, "KES").toUpperCase();
    if (!Number.isFinite(amount) || amount <= 0) return;
    totals.verifiedOnboardingPayments++;
    totals.onboardingRevenueByCurrency[currency] = (totals.onboardingRevenueByCurrency[currency] || 0) + amount;
    if (currency === "KES") totals.verifiedOnboardingRevenueKES += amount;
    const code = userCountries[safeText(payment.ownerUid)] || "";
    if (code) {
      const row = ensureCountry(code);
      row.onboardingPayments++;
      if (currency === "KES") row.onboardingRevenueKES += amount;
    }
  });

  const countryRows = Object.values(countries).map(row => ({ ...row, popularCourses: Object.entries(row.courseCounts || {}).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([courseId,sales])=>({courseId,sales})) })).sort((a,b) => b.users-a.users);
  const recentMonths = Object.entries(monthlyRegistrations).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12).map(([month,count])=>({month,count}));
  const courses = await Promise.all(Object.values(topCourses).sort((a,b)=>b.sales-a.sales).slice(0,10).map(async item => {
    const courseSnap = await db.doc("courses/" + item.courseId).get();
    const course = courseSnap.exists ? courseSnap.data() : {};
    return { ...item, title: safeText(course.title || course.name, item.courseId) };
  }));
  return {
    generatedAt: Timestamp.now().toDate().toISOString(),
    ...totals,
    countriesTracked: countryRows.filter(row=>row.users>0).length,
    countries: countryRows,
    roles,
    monthlyRegistrations: recentMonths,
    topCourses: courses,
    scanned,
    scanLimits: limits,
    scanLimitReached: Object.keys(limits).some(key=>scanned[key]>=limits[key])
  };
});

exports.founderModerateCourse = onCall(async request => {
  const founder = await requireFounder(request);
  const courseId = safeText(request.data?.courseId);
  const action = safeText(request.data?.action);
  if (!courseId || !["request_admin_review", "delete"].includes(action)) throw new HttpsError("invalid-argument", "Choose a valid course moderation action.");
  const ref = db.doc("courses/" + courseId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Course not found.");
  const now = Timestamp.now();
  if (action === "request_admin_review") {
    await ref.update({ status: "pending_review", published: false, reviewStatus: "awaiting_admin_review", reviewRouting: "admin", reviewRequestedByFounder: founder.uid, reviewRequestedAt: now, marketplaceVisibility: "hidden", updatedAt: now });
  } else {
    // Soft-delete to protect historical enrolments, certificates and financial records.
    await ref.update({ status: "deleted", published: false, reviewStatus: "closed", deletedAt: now, deletedBy: founder.uid, marketplaceVisibility: "hidden", updatedAt: now });
  }
  await db.collection("audit_logs").add({ action: action === "delete" ? "course_soft_deleted_by_founder" : "course_routed_to_admin_review", actorId: founder.uid, targetId: courseId, createdAt: now });
  return { success: true, status: action === "delete" ? "deleted" : "pending_review" };
});


const SELLABLE_MARKETPLACE_TYPES = new Set([
  "mentorship", "professional_service", "course_bundle", "bootcamp",
  "digital_product", "addon", "corporate_training"
]);

exports.getMarketplaceProducts = onCall(async request => {
  const founder = await requireFounder(request); // Founder is the platform Super Admin.
  const snap = await db.collection("marketplaceItems").orderBy("updatedAt", "desc").limit(200).get();
  return {
    products: snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id, itemId: data.itemId, productType: data.productType,
        title: data.title, description: data.description, category: data.category,
        price: data.price, currency: data.currency, status: data.status,
        sourceCollection: data.sourceCollection, checkoutEnabled: false,
        createdAt: data.createdAt?.toDate?.().toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.().toISOString() || null
      };
    }),
    actor: { uid: founder.uid, role: "founder", accessLevel: "super_admin" }
  };
});

exports.saveMarketplaceProduct = onCall(async request => {
  const founder = await requireFounder(request); // Super Admin-only product governance.
  const payload = request.data || {};
  const productType = safeText(payload.productType);
  const title = safeText(payload.title);
  const description = safeText(payload.description);
  const category = safeText(payload.category);
  const currency = safeText(payload.currency, "KES");
  const amount = Number(payload.price);
  const status = safeText(payload.status, "draft");
  const productId = safeText(payload.productId);
  if (!SELLABLE_MARKETPLACE_TYPES.has(productType)) throw new HttpsError("invalid-argument", "Unsupported marketplace product type.");
  if (title.length < 3 || title.length > 120) throw new HttpsError("invalid-argument", "Product title must be 3–120 characters.");
  if (description.length < 10 || description.length > 3000) throw new HttpsError("invalid-argument", "Description must be 10–3,000 characters.");
  if (category.length > 80) throw new HttpsError("invalid-argument", "Category is too long.");
  if (!["KES", "USD", "EUR", "GBP"].includes(currency)) throw new HttpsError("invalid-argument", "Unsupported currency.");
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) throw new HttpsError("invalid-argument", "Enter a valid product price.");
  if (!["draft", "published"].includes(status)) throw new HttpsError("invalid-argument", "Products can only be saved as draft or published.");
  const pricingSnap = await db.doc("marketplacePricing/global").get();
  const priceConfig = pricingSnap.data()?.prices?.[productType];
  if (status === "published" && (!priceConfig || priceConfig.enabled !== true)) {
    throw new HttpsError("failed-precondition", "Enable this product type in the Founder price book before publishing its catalogue listing.");
  }
  const now = Timestamp.now();
  const ref = productId ? db.doc("marketplaceItems/" + productId) : db.collection("marketplaceItems").doc();
  if (productId) {
    const existing = await ref.get();
    if (!existing.exists || existing.data().productType !== productType || existing.data().sourceCollection === "courses") {
      throw new HttpsError("not-found", "Editable marketplace product not found.");
    }
  }
  const data = {
    itemId: ref.id, productType, title, description, category,
    price: amount, currency, ownerType: "academy",
    sourceCollection: "marketplaceProducts", sourceId: ref.id,
    status, published: status === "published",
    checkoutEnabled: false, fulfilmentStatus: "not_configured",
    updatedAt: now, updatedBy: founder.uid
  };
  if (!productId) data.createdAt = now;
  await ref.set(data, { merge: true });
  await db.collection("audit_logs").add({
    action: productId ? "marketplace_product_updated" : "marketplace_product_created",
    actorId: founder.uid, targetId: ref.id, productType, status, createdAt: now
  });
  return { success: true, productId: ref.id, status, checkoutEnabled: false };
});

exports.archiveMarketplaceProduct = onCall(async request => {
  const founder = await requireFounder(request); // Super Admin-only archival.
  const productId = safeText(request.data?.productId);
  if (!productId) throw new HttpsError("invalid-argument", "Product ID is required.");
  const ref = db.doc("marketplaceItems/" + productId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().sourceCollection !== "marketplaceProducts") {
    throw new HttpsError("not-found", "Marketplace product not found.");
  }
  const now = Timestamp.now();
  await ref.update({ status: "archived", published: false, checkoutEnabled: false, archivedAt: now, updatedAt: now, updatedBy: founder.uid });
  await db.collection("audit_logs").add({ action: "marketplace_product_archived", actorId: founder.uid, targetId: productId, createdAt: now });
  return { success: true, status: "archived" };
});

exports.syncPublishedCourseToMarketplace = onDocumentWritten("courses/{courseId}", async event => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const course = after.data() || {};
  const listingRef = db.doc("marketplaceItems/course_" + event.params.courseId);
  const visible = (course.published === true || safeText(course.status).toLowerCase() === "published")
    && safeText(course.status).toLowerCase() !== "deleted"
    && safeText(course.reviewStatus).toLowerCase() === "approved"
    && course.marketplaceVisibility !== "hidden";
  if (!visible) {
    await listingRef.delete().catch(() => {});
    return;
  }
  await listingRef.set({
    itemId: "course_" + event.params.courseId,
    sourceCollection: "courses", sourceId: event.params.courseId,
    productType: "course", title: safeText(course.title, "Untitled course"),
    description: safeText(course.description), category: safeText(course.category),
    price: Number(course.price || 0), currency: safeText(course.currency, "KES"),
    instructorId: safeText(course.instructorId), institutionId: safeText(course.institutionId),
    ownerType: safeText(course.ownerType, course.institutionId ? "institution" : "instructor"),
    status: "published", published: true, updatedAt: Timestamp.now(),
    createdAt: course.createdAt || Timestamp.now()
  }, { merge: true });
});

exports.approveInstitutionApplication = onCall({ secrets: DARAJA_SECRETS }, async request => {
  const reviewer = await requireInstitutionReviewer(request);
  const applicationId = safeText(request.data?.applicationId);
  if (!applicationId || applicationId.length > 128) {
    throw new HttpsError("invalid-argument", "A valid application ID is required.");
  }

  const applicationRef = db.doc(`institutionApplications/${applicationId}`);
  const userRef = db.doc(`users/${applicationId}`);
  const institutionRef = db.doc(`institutions/${applicationId}`);
  const now = Timestamp.now();
  const pricingSnap = await institutionPricingRef.get();
  const institutionPricing = pricingSnap.exists
    ? { ...defaultInstitutionPricing(), ...pricingSnap.data() }
    : defaultInstitutionPricing();
  const requiresPaymentBeforeActivation = institutionPricing.onboardingFeeEnabled === true
    && institutionPricing.onboardingTiming === "before_activation";
  const trialDays = Number.isInteger(institutionPricing.trialDays) ? institutionPricing.trialDays : 14;
  const trialEndsAt = requiresPaymentBeforeActivation ? null : Timestamp.fromMillis(now.toMillis() + trialDays * 24 * 60 * 60 * 1000);

  try {
    await db.runTransaction(async transaction => {
      const applicationSnap = await transaction.get(applicationRef);
      if (!applicationSnap.exists) throw new HttpsError("not-found", "Institution application not found.");
      const application = applicationSnap.data();
      if (application.status !== "pending_review") {
        throw new HttpsError("failed-precondition", "This application has already been reviewed.");
      }
      const ownerUid = application.institutionOwnerUid;
      if (ownerUid !== applicationId) {
        throw new HttpsError("failed-precondition", "Application owner identity does not match its record.");
      }
      const institutionSnap = await transaction.get(institutionRef);
      if (institutionSnap.exists) {
        const existingInstitution = institutionSnap.data();
        const existingOwnerUid = existingInstitution.ownerUid || existingInstitution.institutionOwnerUid;
        if (existingOwnerUid && existingOwnerUid !== ownerUid) {
          throw new HttpsError("already-exists", "An institution record with a different owner already exists. Manual review is required.");
        }
      }
      const userSnap = await transaction.get(userRef);
      if (userSnap.exists && userSnap.data().role && userSnap.data().role !== "institution_applicant") {
        throw new HttpsError("already-exists", "The applicant already has a different Academy account role. Manual review is required.");
      }

      transaction.set(userRef, {
        uid: ownerUid,
        countryCode: application.countryCode || "",
        country: application.country || "",
        email: application.ownerEmail,
        fullName: application.ownerName,
        name: application.ownerName,
        displayName: application.ownerName,
        role: "institution",
        institutionRole: "owner",
        institutionId: applicationId,
        institutionName: application.institutionName,
        status: requiresPaymentBeforeActivation ? "pending_payment" : "active",
        active: !requiresPaymentBeforeActivation,
        verified: !requiresPaymentBeforeActivation,
        createdAt: userSnap.exists ? (userSnap.data().createdAt || now) : now,
        approvedAt: now,
        approvedBy: reviewer.uid,
        updatedAt: now
      }, { merge: true });

      transaction.set(institutionRef, {
        institutionId: applicationId,
        legalName: application.institutionName,
        institutionName: application.institutionName,
        institutionType: application.institutionType,
        countryCode: application.countryCode || "",
        country: application.country,
        website: application.website || "",
        contactPhone: application.institutionPhone,
        ownerUid,
        ownerName: application.ownerName,
        ownerEmail: application.ownerEmail,
        estimatedLearnerRange: application.learnerRange,
        status: requiresPaymentBeforeActivation ? "pending_payment" : "active",
        verificationStatus: "verified",
        limits: { instructors: 20, courses: 100, students: 5000, adminAccounts: 10 },
        usage: { instructors: 0, courses: 0, students: 0, adminAccounts: 1 },
        subscription: {
          plan: "trial",
          status: requiresPaymentBeforeActivation ? "pending_payment" : "trialing",
          trialStartedAt: requiresPaymentBeforeActivation ? null : now,
          trialEndsAt,
          trialDays
        },
        onboardingFee: institutionPricing.onboardingFeeEnabled === true ? {
          status: requiresPaymentBeforeActivation ? "due" : "due",
          amount: institutionPricing.onboardingFeeAmount,
          currency: institutionPricing.currency,
          collectionTiming: institutionPricing.onboardingTiming
        } : { status: "not_required", amount: 0, currency: institutionPricing.currency },
        pricingSnapshot: {
          currency: institutionPricing.currency,
          onboardingFeeEnabled: institutionPricing.onboardingFeeEnabled,
          onboardingFeeAmount: institutionPricing.onboardingFeeAmount,
          onboardingTiming: institutionPricing.onboardingTiming,
          monthlySubscriptionAmount: institutionPricing.monthlySubscriptionAmount,
          annualSubscriptionAmount: institutionPricing.annualSubscriptionAmount,
          transactionFeeEnabled: institutionPricing.transactionFeeEnabled,
          transactionFeePercent: institutionPricing.transactionFeePercent,
          capturedAt: now
        },
        createdAt: institutionSnap.exists ? (institutionSnap.data().createdAt || now) : now,
        updatedAt: now
      }, { merge: true });

      transaction.update(applicationRef, {
        status: requiresPaymentBeforeActivation ? "approved_awaiting_payment" : "approved",
        reviewedAt: now,
        reviewedBy: reviewer.uid,
        reviewerRole: reviewer.role,
        institutionId: applicationId,
        trialStartedAt: requiresPaymentBeforeActivation ? null : now,
        trialEndsAt,
        onboardingFeeStatus: institutionPricing.onboardingFeeEnabled === true ? "due" : "not_required"
      });

      transaction.create(db.collection("audit_logs").doc(), {
        action: "institution_application_approved",
        actorId: reviewer.uid,
        actorRole: reviewer.role,
        targetId: applicationId,
        targetEmail: application.ownerEmail,
        targetName: application.institutionName,
        createdAt: now
      });
    });

    if (institutionPricing.onboardingFeeEnabled === true && Number(institutionPricing.onboardingFeeAmount) > 0) {
      try {
        const payment = await startInstitutionStkPayment({
          applicationId, institutionId: applicationId, ownerUid: applicationId,
          phone: (await applicationRef.get()).data()?.institutionPhone,
          amount: Number(institutionPricing.onboardingFeeAmount),
          currency: institutionPricing.currency || "KES",
          initiatedBy: reviewer.uid
        });
        return {
          success: true, institutionId: applicationId,
          activationPendingPayment: requiresPaymentBeforeActivation,
          trialDays, payment
        };
      } catch (paymentError) {
        console.error("Institution approved but onboarding payment prompt failed:", paymentError.message);
        return {
          success: true, institutionId: applicationId,
          activationPendingPayment: requiresPaymentBeforeActivation,
          trialDays, payment: { success: false, status: "initiation_failed", message: paymentError.message }
        };
      }
    }
    return { success: true, institutionId: applicationId, trialDays, trialEndsAt: trialEndsAt?.toDate?.().toISOString() || null };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("approveInstitutionApplication failed:", error);
    throw new HttpsError("internal", "The institution could not be approved. No further action is required; check the application status before retrying.");
  }
});

exports.rejectInstitutionApplication = onCall(async request => {
  const reviewer = await requireInstitutionReviewer(request);
  const applicationId = safeText(request.data?.applicationId);
  const reason = safeText(request.data?.reason);
  if (!applicationId || applicationId.length > 128) {
    throw new HttpsError("invalid-argument", "A valid application ID is required.");
  }
  if (!reason || reason.length < 5 || reason.length > 500) {
    throw new HttpsError("invalid-argument", "Provide a rejection reason between 5 and 500 characters.");
  }

  const applicationRef = db.doc(`institutionApplications/${applicationId}`);
  const now = Timestamp.now();
  try {
    await db.runTransaction(async transaction => {
      const snap = await transaction.get(applicationRef);
      if (!snap.exists) throw new HttpsError("not-found", "Institution application not found.");
      const application = snap.data();
      if (application.status !== "pending_review") {
        throw new HttpsError("failed-precondition", "This application has already been reviewed.");
      }
      transaction.update(applicationRef, {
        status: "rejected",
        rejectionReason: reason,
        reviewedAt: now,
        reviewedBy: reviewer.uid,
        reviewerRole: reviewer.role
      });
      transaction.create(db.collection("audit_logs").doc(), {
        action: "institution_application_rejected",
        actorId: reviewer.uid,
        actorRole: reviewer.role,
        targetId: applicationId,
        targetEmail: application.ownerEmail || "",
        targetName: application.institutionName || "",
        reason,
        createdAt: now
      });
    });
    return { success: true };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("rejectInstitutionApplication failed:", error);
    throw new HttpsError("internal", "The application could not be rejected. Check its status before retrying.");
  }
});



exports.createInstitutionTeamAccount = onCall(async request => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError("unauthenticated", "Sign in to manage your institution team.");
  const callerSnap = await db.doc(`users/${callerUid}`).get();
  const caller = callerSnap.exists ? callerSnap.data() : {};
  if (caller.role !== "institution" || caller.institutionRole !== "owner" || caller.status !== "active" || caller.active !== true || caller.verified !== true) {
    throw new HttpsError("permission-denied", "Only the verified institution owner can add team accounts.");
  }

  const institutionId = safeText(caller.institutionId);
  const institutionRef = db.doc(`institutions/${institutionId}`);
  const email = safeText(request.data?.email).toLowerCase();
  const fullName = safeText(request.data?.fullName);
  const role = safeText(request.data?.role).toLowerCase();
  const password = String(request.data?.temporaryPassword || "");
  if (!institutionId || !["institution_admin", "instructor"].includes(role)) throw new HttpsError("invalid-argument", "Choose a valid team role.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || fullName.length < 2 || password.length < 12) {
    throw new HttpsError("invalid-argument", "Provide a valid email, full name and temporary password of at least 12 characters.");
  }

  const institutionSnap = await institutionRef.get();
  if (!institutionSnap.exists || institutionSnap.data().status !== "active") throw new HttpsError("failed-precondition", "Institution workspace is not active.");
  const institution = institutionSnap.data();
  const limitKey = role === "instructor" ? "instructors" : "adminAccounts";
  const roleQuery = db.collection("users").where("institutionId", "==", institutionId).where("institutionRole", "==", role);
  const existing = await adminAuth.getUserByEmail(email).catch(error => error.code === "auth/user-not-found" ? null : Promise.reject(error));
  if (existing) throw new HttpsError("already-exists", "An account with this email already exists.");

  let created;
  try {
    created = await adminAuth.createUser({ email, password, displayName: fullName, emailVerified: false, disabled: false });
    await db.runTransaction(async transaction => {
      const [freshInstitution, members] = await Promise.all([
        transaction.get(institutionRef),
        transaction.get(roleQuery)
      ]);
      if (!freshInstitution.exists || freshInstitution.data().status !== "active") throw new HttpsError("failed-precondition", "Institution workspace is not active.");
      const limits = freshInstitution.data().limits || {};
      const max = Number(limits[limitKey] ?? (role === "instructor" ? 20 : 10));
      const effectiveMax = role === "institution_admin" ? Math.max(0, max - 1) : max;
      if (members.size >= effectiveMax) throw new HttpsError("resource-exhausted", `Institution limit reached: maximum ${max} ${limitKey === "instructors" ? "instructors" : "admin accounts including the owner"}.`);
      const memberRef = db.doc(`institutions/${institutionId}/members/${created.uid}`);
      transaction.create(db.doc(`users/${created.uid}`), {
        uid: created.uid, email, fullName, name: fullName, displayName: fullName,
        role: role === "instructor" ? "instructor" : "institution_admin",
        institutionRole: role, institutionId, institutionName: institution.institutionName,
        status: "active", active: true, verified: true,
        createdAt: Timestamp.now(), createdBy: callerUid
      });
      transaction.create(memberRef, {
        uid: created.uid, email, fullName, role, status: "active",
        createdAt: Timestamp.now(), createdBy: callerUid
      });
      transaction.update(institutionRef, {
        usage: { ...(freshInstitution.data().usage || {}), [limitKey]: role === "institution_admin" ? members.size + 2 : members.size + 1 },
        updatedAt: Timestamp.now()
      });
    });
    await db.collection("audit_logs").add({
      action: "institution_team_account_created", actorId: callerUid,
      targetId: created.uid, targetEmail: email, targetName: fullName,
      institutionId, memberRole: role, createdAt: Timestamp.now()
    });
    return { success: true, uid: created.uid, role };
  } catch (error) {
    if (created) await adminAuth.deleteUser(created.uid).catch(() => {});
    if (error instanceof HttpsError) throw error;
    console.error("createInstitutionTeamAccount failed:", error);
    throw new HttpsError("internal", "The team account could not be created.");
  }
});

async function writeNotification({ event, recipientId = null, role = null, audience = "user", title, message, type = "general", priority = "normal", metadata = {} }) {
  const id = eventKey(event, recipientId || role || audience);
  await db.collection("notifications").doc(id).set({
    title, message, type, priority, audience, role,
    recipientId,
    userId: recipientId,
    senderId: "system",
    metadata,
    read: false,
    createdAt: Timestamp.now(),
    eventId: safeText(event.id || "system")
  }, { merge: true });
}

async function notifyLeadership(event, title, message, type, metadata = {}) {
  await Promise.all([
    writeNotification({ event, role: "admin", audience: "role", title, message, type, priority: "high", metadata }),
    writeNotification({ event, role: "founder", audience: "role", title, message, type, priority: "high", metadata })
  ]);
}

async function notifyUser(event, userId, title, message, type, metadata = {}, priority = "normal") {
  if (userId) await writeNotification({ event, recipientId: userId, audience: "user", title, message, type, priority, metadata });
}

async function notifyCourseStudents(event, courseId, title, message, type, metadata = {}) {
  if (!courseId) return;
  const snapshot = await db.collection("enrollments").where("courseId", "==", courseId).get();
  const studentIds = [...new Set(snapshot.docs.map(item => {
    const data = item.data() || {};
    return data.studentId || data.userId || data.uid || null;
  }).filter(Boolean))];

  for (let i = 0; i < studentIds.length; i += 450) {
    const chunk = studentIds.slice(i, i + 450);
    const batch = db.batch();
    chunk.forEach(studentId => {
      const id = eventKey(event, studentId);
      batch.set(db.collection("notifications").doc(id), {
        title, message, type, priority: "normal", audience: "user",
        recipientId: studentId, userId: studentId, senderId: "system", courseId,
        metadata: { ...metadata, courseId }, read: false,
        createdAt: Timestamp.now(), eventId: safeText(event.id || "system")
      }, { merge: true });
    });
    if (chunk.length) await batch.commit();
  }
}

async function getCourse(courseId) {
  if (!courseId) return null;
  const snapshot = await db.collection("courses").doc(courseId).get();
  return snapshot.exists ? snapshot.data() : null;
}

exports.notifyPaymentSuccess = onDocumentCreated("payments/{paymentId}", async event => {
  const payment = event.data?.data();
  if (!payment) return;
  const status = safeText(payment.status || payment.paymentStatus).toLowerCase();
  if (status && !["success", "successful", "completed", "paid"].includes(status)) return;

  const studentId = payment.studentId || payment.userId || payment.uid;
  const courseId = payment.courseId;
  const amount = Number(payment.amount || payment.total || payment.price || 0);
  const course = await getCourse(courseId);
  const courseName = payment.courseName || payment.course || course?.title || "your course";

  await notifyUser(event, studentId, "💳 Payment confirmed", `Your payment for ${courseName} was received successfully.`, "payment", { paymentId: event.params.paymentId, courseId, courseName, amount }, "high");
  await notifyLeadership(event, "💰 New course payment", `${courseName} received a successful payment${amount ? ` of KSh ${amount.toLocaleString()}` : ""}.`, "payment", { paymentId: event.params.paymentId, studentId, courseId, amount });
});

exports.notifyEnrollmentCreated = onDocumentCreated("enrollments/{enrollmentId}", async event => {
  const enrollment = event.data?.data();
  if (!enrollment) return;
  const studentId = enrollment.studentId || enrollment.userId || enrollment.uid;
  const instructorId = enrollment.instructorId || enrollment.instructorUID || enrollment.instructorUid;
  const courseId = enrollment.courseId;
  const course = await getCourse(courseId);
  const courseName = enrollment.courseName || enrollment.course || course?.title || "your course";
  const studentName = enrollment.studentName || enrollment.name || "A student";
  const amount = Number(enrollment.amountPaid || enrollment.amount || 0);

  await notifyUser(event, studentId, "🎓 Enrollment confirmed", `You are now enrolled in ${courseName}. Start learning whenever you're ready.`, "enrollment", { enrollmentId: event.params.enrollmentId, courseId, courseName, amount }, "high");
  await notifyUser(event, instructorId, "🎓 New student enrolled", `${studentName} has enrolled in ${courseName}.`, "enrollment", { enrollmentId: event.params.enrollmentId, studentId, studentName, courseId, courseName, amount }, "high");
});

exports.notifyCourseCreated = onDocumentCreated("courses/{courseId}", async event => {
  const course = event.data?.data();
  if (!course) return;
  const status = safeText(course.status || "published").toLowerCase();
  if (["draft", "archived", "deleted"].includes(status)) return;
  const title = course.title || course.name || "New course";
  const courseId = event.params.courseId;

  await writeNotification({ event, role: "student", audience: "role", title: "📚 New course available", message: `${title} is now available in Spark Stack Academy.`, type: "course", metadata: { courseId, courseName: title } });
  await notifyLeadership(event, "📚 New course added", `${title} has been added to the academy catalog.`, "course", { courseId, courseName: title });
});

function registerCourseContentTrigger(collectionName, label, icon, type) {
  return onDocumentCreated(`${collectionName}/{contentId}`, async event => {
    const content = event.data?.data();
    if (!content) return;
    const courseId = content.courseId || content.courseID;
    if (!courseId) return;
    const name = content.title || content.name || label;
    await notifyCourseStudents(event, courseId, `${icon} New ${label}`, `${name} has been added to your course.`, type, { contentId: event.params.contentId, contentName: name });
    await notifyLeadership(event, `${icon} New ${label}`, `${name} was added to a course.`, type, { contentId: event.params.contentId, courseId, contentName: name });
  });
}

exports.notifyLessonCreated = registerCourseContentTrigger("lessons", "lesson", "📖", "lesson");
exports.notifyAssignmentCreated = registerCourseContentTrigger("assignments", "assignment", "📝", "assignment");
exports.notifyQuizCreated = registerCourseContentTrigger("quizzes", "quiz", "🧠", "quiz");

exports.notifyReportCreated = onDocumentCreated("reports/{reportId}", async event => {
  const report = event.data?.data();
  if (!report) return;
  const reportId = report.reportId || event.params.reportId;
  const title = report.title || report.reason || "New report";
  const priority = safeText(report.priority || "medium").toLowerCase();
  await notifyLeadership(event, `🚩 New report ${reportId}`, `${report.reporterName || "A user"} submitted a ${priority} priority report: ${title}.`, "report", { reportId, category: report.category, type: report.type, priority });
});

exports.notifyReportUpdated = onDocumentUpdated("reports/{reportId}", async event => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  if (!after.reporterId) return;
  const changed = before.status !== after.status || before.feedback !== after.feedback || before.moderatorNotes !== after.moderatorNotes;
  if (!changed) return;
  const reportId = after.reportId || event.params.reportId;
  const message = after.feedback || `Your report has been moved to ${after.status || "reviewing"}.`;
  await notifyUser(event, after.reporterId, `📋 Report ${reportId} updated`, message, "report", { reportId, status: after.status || "reviewing" }, "normal");
});

exports.applyScheduledMaintenance = onSchedule("every 5 minutes", async () => {
  const snap = await platformRef.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  const maintenance = data.maintenance;
  if (!maintenance?.startAt) return;
  const start = maintenance.startAt instanceof Timestamp ? maintenance.startAt.toMillis() : new Date(maintenance.startAt).getTime();
  const end = maintenance.endAt instanceof Timestamp ? maintenance.endAt.toMillis() : new Date(maintenance.endAt || 0).getTime();
  const now = Date.now();
  if (now < start || (end && now >= end)) {
    if (maintenance.active === true && end && now >= end) {
      await platformRef.update({ "maintenance.active": false, updated_at: Timestamp.now() });
      await db.collection("systemCommandLog").add({ command: "Scheduled maintenance ended", details: { target: maintenance.target }, actor: "system", createdAt: Timestamp.now() });
    }
    return;
  }
  if (maintenance.active === true) return;
  await platformRef.update({ "maintenance.active": true, updated_at: Timestamp.now() });
  await db.collection("systemCommandLog").add({ command: "Scheduled maintenance activated", details: { target: maintenance.target, message: maintenance.message || "" }, actor: "system", createdAt: Timestamp.now() });
});


// ============================================================
// CENTRALISED INSTITUTION PRICING — FOUNDER / FINANCE MANAGER
// ============================================================

const institutionPricingRef = db.doc("platform_pricing/institutions");

async function requirePricingManager(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to access institution pricing.");
  const [userSnap, founderSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`founder/${uid}`).get()
  ]);
  const user = userSnap.exists ? userSnap.data() : {};
  const founder = founderSnap.exists ? founderSnap.data() : {};
  const isFounder = founder.role === "founder" && founder.status === "active"
    && founder.active !== false && founder.verified !== false;
  const role = safeText(user.role).toLowerCase();
  const permissions = user.permissions || {};
  const financeLabels = [user.adminRole, user.department, user.position].map(value => safeText(value).toLowerCase().replace(/\s+/g, "_"));
  const financeDesignation = financeLabels.some(value => ["finance", "finance_manager", "financial_manager"].includes(value));
  const activeAdmin = ["admin", "administrator", "moderator", "finance_manager", "financial_manager"].includes(role)
    && user.active === true && user.status === "active";
  const canManagePricing = isFounder || (activeAdmin && (["finance_manager", "financial_manager"].includes(role) || financeDesignation || permissions.manageInstitutionPricing === true || permissions.managePricing === true));
  if (!canManagePricing) throw new HttpsError("permission-denied", "Institution pricing is restricted to the Founder/Super Admin and explicitly authorised Finance Managers.");
  return { uid, role: isFounder ? "founder" : role, email: request.auth.token.email || "" };
}

function defaultInstitutionPricing() {
  return {
    currency: "KES",
    onboardingFeeEnabled: false,
    onboardingFeeAmount: 0,
    onboardingTiming: "before_activation",
    monthlySubscriptionAmount: 0,
    annualSubscriptionAmount: 0,
    transactionFeeEnabled: false,
    transactionFeePercent: 0,
    trialDays: 14
  };
}

exports.getInstitutionPricing = onCall(async request => {
  await requirePricingManager(request);
  const snap = await institutionPricingRef.get();
  return { pricing: snap.exists ? { ...defaultInstitutionPricing(), ...snap.data() } : defaultInstitutionPricing(), configured: snap.exists };
});

exports.saveInstitutionPricing = onCall(async request => {
  const actor = await requirePricingManager(request);
  const input = request.data || {};
  const currency = safeText(input.currency).toUpperCase();
  const allowedCurrencies = ["KES", "USD", "EUR", "GBP"];
  const amountFields = ["onboardingFeeAmount", "monthlySubscriptionAmount", "annualSubscriptionAmount"];
  if (!allowedCurrencies.includes(currency)) throw new HttpsError("invalid-argument", "Choose a supported currency.");
  for (const field of amountFields) {
    const value = Number(input[field]);
    if (!Number.isFinite(value) || value < 0 || value > 1000000000 || Number(value.toFixed(2)) !== value) {
      throw new HttpsError("invalid-argument", `${field} must be an amount between 0 and 1,000,000,000 with at most two decimal places.`);
    }
  }
  const feePercent = Number(input.transactionFeePercent);
  const trialDays = Number(input.trialDays);
  if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 20) throw new HttpsError("invalid-argument", "Transaction fee must be between 0 and 20 percent.");
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 90) throw new HttpsError("invalid-argument", "Trial duration must be between 0 and 90 days.");
  if (!["before_activation", "after_approval"].includes(input.onboardingTiming)) throw new HttpsError("invalid-argument", "Choose a valid onboarding fee collection timing.");
  if (input.onboardingFeeEnabled === true && Number(input.onboardingFeeAmount) <= 0) throw new HttpsError("failed-precondition", "Enter an onboarding fee greater than zero or disable the fee.");
  if (input.onboardingFeeEnabled === true && currency !== "KES") throw new HttpsError("failed-precondition", "Institution onboarding collection currently uses M-Pesa Daraja and must be priced in KES.");
  if (input.onboardingFeeEnabled === true && !Number.isInteger(Number(input.onboardingFeeAmount))) throw new HttpsError("invalid-argument", "M-Pesa onboarding fees must be whole KES amounts.");
  if (input.transactionFeeEnabled === true && feePercent <= 0) throw new HttpsError("failed-precondition", "Enter a transaction fee percentage greater than zero or disable the fee.");

  const pricing = {
    currency,
    onboardingFeeEnabled: input.onboardingFeeEnabled === true,
    onboardingFeeAmount: Number(input.onboardingFeeAmount),
    onboardingTiming: input.onboardingTiming,
    monthlySubscriptionAmount: Number(input.monthlySubscriptionAmount),
    annualSubscriptionAmount: Number(input.annualSubscriptionAmount),
    transactionFeeEnabled: input.transactionFeeEnabled === true,
    transactionFeePercent: feePercent,
    trialDays
  };
  const now = Timestamp.now();
  const auditRef = db.collection("audit_logs").doc();
  await db.runTransaction(async transaction => {
    transaction.set(institutionPricingRef, { ...pricing, updatedAt: now, updatedBy: actor.uid, updatedByRole: actor.role }, { merge: true });
    transaction.create(auditRef, {
      action: "institution_pricing_updated",
      actorId: actor.uid,
      actorRole: actor.role,
      actorEmail: actor.email,
      changes: pricing,
      createdAt: now
    });
  });
  return { success: true, pricing };
});
