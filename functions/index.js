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
const { getStorage } = require("firebase-admin/storage");
const adminStorage = getStorage();
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
// INSTITUTION APPLICATION — TRUSTED PROVISIONING
// Creates the application, restricted provisional workspace,
// global applicant profile and pending owner membership atomically.
// ============================================================

exports.submitInstitutionApplication = onCall(async request => {
  const uid = request.auth?.uid;
  const email = safeText(request.auth?.token?.email).toLowerCase();
  if (!uid || !email) {
    throw new HttpsError("unauthenticated", "Sign in with a valid email before submitting an institution application.");
  }

  const data = request.data || {};
  const institutionName = safeText(data.institutionName);
  const institutionType = safeText(data.institutionType);
  const country = safeText(data.country);
  const website = safeText(data.website);
  const learnerRange = safeText(data.learnerRange);
  const institutionPhone = safeText(data.institutionPhone);
  const ownerName = safeText(data.ownerName);
  const ownerPosition = safeText(data.ownerPosition);

  if (institutionName.length < 2 || institutionName.length > 120
    || ownerName.length < 2 || ownerName.length > 120
    || !institutionType || institutionType.length > 80
    || !country || country.length > 80
    || !institutionPhone || institutionPhone.length > 40
    || !ownerPosition || ownerPosition.length > 80
    || !learnerRange || learnerRange.length > 80
    || website.length > 240
    || (website && !/^https?:\/\//i.test(website))) {
    throw new HttpsError("invalid-argument", "Complete the institution details with valid values before submitting.");
  }

  const applicationRef = db.doc("institutionApplications/" + uid);
  const institutionRef = db.doc("institutions/" + uid);
  const userRef = db.doc("users/" + uid);
  const membershipRef = db.doc("institutions/" + uid + "/members/" + uid);
  const now = Timestamp.now();

  try {
    await db.runTransaction(async transaction => {
      const [applicationSnap, institutionSnap, userSnap] = await Promise.all([
        transaction.get(applicationRef),
        transaction.get(institutionRef),
        transaction.get(userRef)
      ]);
      if (applicationSnap.exists || institutionSnap.exists) {
        throw new HttpsError("already-exists", "An institution application or workspace already exists for this account.");
      }
      if (userSnap.exists) {
        throw new HttpsError("already-exists", "This Academy account already has a profile. Sign in and contact the Academy team to link an institution application.");
      }

      transaction.create(userRef, {
        uid,
        email,
        fullName: ownerName,
        name: ownerName,
        displayName: ownerName,
        role: "institution_applicant",
        status: "pending_review",
        active: false,
        verified: false,
        createdAt: now,
        updatedAt: now
      });

      transaction.create(applicationRef, {
        institutionOwnerUid: uid,
        institutionName,
        institutionType,
        country,
        website,
        learnerRange,
        institutionPhone,
        ownerName,
        ownerEmail: email,
        ownerPosition,
        status: "pending_review",
        submittedAt: now,
        source: "institution_registration"
      });

      transaction.create(institutionRef, {
        institutionId: uid,
        legalName: institutionName,
        institutionName,
        institutionType,
        country,
        website,
        contactPhone: institutionPhone,
        ownerUid: uid,
        ownerName,
        ownerEmail: email,
        estimatedLearnerRange: learnerRange,
        status: "provisional",
        workspaceStage: "provisional",
        verificationStatus: "pending_review",
        limits: { instructors: 0, courses: 0, students: 0, adminAccounts: 0 },
        usage: { instructors: 0, courses: 0, students: 0, adminAccounts: 0 },
        subscription: { plan: "none", status: "not_started" },
        createdAt: now,
        updatedAt: now
      });

      transaction.create(membershipRef, {
        uid,
        institutionId: uid,
        memberType: "institution_owner",
        role: "institution_owner",
        status: "pending_verification",
        verified: false,
        email,
        fullName: ownerName,
        createdAt: now,
        updatedAt: now
      });
    });

    return { success: true, applicationId: uid, institutionId: uid, status: "pending_review", workspaceStatus: "provisional" };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error("submitInstitutionApplication failed:", error);
    throw new HttpsError("internal", "The institution application could not be saved. Check the application status before retrying.");
  }
});

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
    throw new HttpsError("invalid-argument", "Enter a valid Kenyan M-Pesa number, for example 0712345678 or 254712345678.");
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
  const ownerMembershipRef = db.doc("institutions/" + payment.institutionId + "/members/" + payment.ownerUid);
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
    transaction.set(ownerMembershipRef, {
      uid: payment.ownerUid,
      institutionId: payment.institutionId,
      memberType: "institution_owner",
      role: "institution_owner",
      status: "active",
      verified: true,
      activatedAt: now,
      updatedAt: now
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



// ============================================================
// STUDENT PAYMENTS — COURSE + PREMIUM
// Both M-Pesa STK Push and manual receipt review use the same
// server-owned payment ledger and entitlement activation path.
// ============================================================

async function requireActiveStudent(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in with your student account.");
  const snap = await db.doc("users/" + uid).get();
  const user = snap.exists ? snap.data() : {};
  if (safeText(user.role).toLowerCase() !== "student"
      || user.status !== "active" || user.active === false) {
    throw new HttpsError("permission-denied", "An active student account is required.");
  }
  return { uid, user };
}

async function requireActiveInstructor(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in with your instructor account.");

  const [userSnap, controlsSnap] = await Promise.all([
    db.doc("users/" + uid).get(),
    platformRef.get()
  ]);

  const user = userSnap.exists ? userSnap.data() : {};
  if (safeText(user.role).toLowerCase() !== "instructor"
      || user.status !== "active" || user.active !== true || user.verified !== true) {
    throw new HttpsError("permission-denied", "An active, verified instructor account is required.");
  }

  const controls = controlsSnap.exists ? controlsSnap.data() : {};
  const maintenance = controls.maintenance || {};
  const target = safeText(maintenance.target).toLowerCase();
  const startValue = maintenance.startAt?.toMillis
    ? maintenance.startAt.toMillis()
    : (maintenance.start ? new Date(maintenance.start).getTime() : NaN);
  const endValue = maintenance.endAt?.toMillis
    ? maintenance.endAt.toMillis()
    : (maintenance.end ? new Date(maintenance.end).getTime() : NaN);
  const maintenanceActive = maintenance.scheduled === true
    && (target === "instructor" || target === "all")
    && Number.isFinite(startValue) && Number.isFinite(endValue)
    && Date.now() >= startValue && Date.now() < endValue;

  if (controls.lockdown === true
      || controls.instructor?.suspended === true
      || maintenanceActive) {
    throw new HttpsError("failed-precondition", "The Instructor Portal is temporarily unavailable.");
  }

  return { uid, user };
}

function instructorEnrollmentIsActive(enrollment) {
  const status = safeText(enrollment.status).toLowerCase();
  const paymentStatus = safeText(enrollment.paymentStatus).toLowerCase();
  const activeStatuses = ["active", "approved", "completed"];

  if (["revoked", "suspended", "cancelled", "canceled", "rejected", "pending"].includes(status)) {
    return false;
  }
  if (enrollment.institutionId && activeStatuses.includes(status)) return true;
  if (activeStatuses.includes(status) && ["paid", "free"].includes(paymentStatus)) return true;
  return status === "paid" && (!paymentStatus || paymentStatus === "paid");
}

exports.getInstructorFinanceData = onCall(async request => {
  const { uid } = await requireActiveInstructor(request);
  const [coursesSnap, earningsSnap, withdrawalsSnap, settingsSnap, walletSnap] = await Promise.all([
    db.collection("courses").where("instructorId", "==", uid).get(),
    db.collection("instructorEarnings").where("instructorId", "==", uid).get(),
    db.collection("withdrawalRequests").where("instructorId", "==", uid).get(),
    db.doc("platformSettings/earnings").get(),
    db.doc("instructorWallets/" + uid).get()
  ]);
  const courses = new Map(coursesSnap.docs.map(item => [item.id, item.data()]));
  const ids = [...courses.keys()];
  const paymentDocs = [];
  for (let i = 0; i < ids.length; i += 8) {
    const batch = ids.slice(i, i + 8);
    const snapshots = await Promise.all(batch.map(courseId =>
      db.collection("payments").where("courseId", "==", courseId).get()
    ));
    snapshots.forEach(snapshot => paymentDocs.push(...snapshot.docs));
  }
  const payments = paymentDocs.map(item => {
    const p = item.data();
    const course = courses.get(safeText(p.courseId)) || {};
    return {
      id: item.id, courseName: safeText(p.courseName || p.course || course.title, "Course payment"),
      studentName: safeText(p.studentName || p.name || p.studentEmail, "Student"),
      studentEmail: safeText(p.studentEmail || p.email),
      amount: Number(p.amount || p.total || 0), currency: safeText(p.currency, "KES"),
      status: safeText(p.status || p.paymentStatus, "pending").toLowerCase(),
      reference: safeText(p.mpesaReceiptNumber || p.manualReceiptCode || p.reference || p.transactionId || item.id),
      createdAt: p.createdAt?.toMillis ? p.createdAt.toMillis() : null
    };
  }).sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0,500);
  const earnings = earningsSnap.docs.map(item => {
    const e = item.data();
    return { id:item.id, description:safeText(e.description,"Instructor earning"),
      netAmount:Number(e.netAmount || 0), status:safeText(e.status,"earned").toLowerCase(),
      createdAt:e.createdAt?.toMillis ? e.createdAt.toMillis() : null };
  }).sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
  const withdrawals = withdrawalsSnap.docs.map(item => {
    const w = item.data();
    return { id:item.id, amount:Number(w.amount || 0), withdrawalFee:Number(w.withdrawalFee || 0),
      netAmount:Number(w.netAmount || 0), method:safeText(w.method),
      status:safeText(w.status,"pending").toLowerCase(),
      walletBalanceDebited:w.walletBalanceDebited === true,
      createdAt:w.createdAt?.toMillis ? w.createdAt.toMillis() : null };
  }).sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0));
  const walletRecord = walletSnap.exists ? walletSnap.data() : {};
  const walletBalance = Math.max(0, Number(walletRecord.balance || 0));
  const reserved = withdrawals.filter(w => ["pending","approved","processing"].includes(w.status))
    .reduce((sum,w) => sum + w.amount,0);
  const legacyPaid = withdrawals.filter(w => ["paid","completed","successful"].includes(w.status) && w.walletBalanceDebited !== true)
    .reduce((sum,w) => sum + w.amount,0);
  const paidOut = Math.max(0, Number(walletRecord.totalPaid || 0)) + legacyPaid;
  const earned = walletBalance + paidOut;
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const stats = payments.reduce((out,p) => {
    if (["paid","success","successful","completed"].includes(p.status)) out.successful += p.amount;
    else if (["pending","pending_review","verification_pending","initiating"].includes(p.status)) out.pending += p.amount;
    else if (["failed","initiation_failed","cancelled","canceled"].includes(p.status)) out.failed += p.amount;
    return out;
  }, {successful:0,pending:0,failed:0});
  return { payments, earnings, withdrawals, wallet:{
    earned, reserved, paidOut, available:Math.max(0,walletBalance-reserved-legacyPaid),
    pending:reserved, lifetime:earned, walletStatus:safeText(walletRecord.status, walletSnap.exists ? "active" : "not_created")
  }, settings:{
    minimumWithdrawal:Number(settings.minimumWithdrawal || 100),
    withdrawalFeePercent:Number(settings.withdrawalFeePercent || 0),
    platformTaxPercent:Number(settings.platformTaxPercent || 0)
  }, paymentStats:stats };
});

exports.requestInstructorWithdrawal = onCall(async request => {
  const { uid } = await requireActiveInstructor(request);
  const amount = Number(request.data?.amount);
  const method = safeText(request.data?.method).toLowerCase();
  let account = safeText(request.data?.account).slice(0,120);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new HttpsError("invalid-argument","Enter a whole-number withdrawal amount.");
  if (!["mpesa","bank"].includes(method) || account.length < 5) throw new HttpsError("invalid-argument","Enter valid payout details.");
  if (method === "mpesa") account = normalizeKenyanPhone(account);
  const settingsSnap = await db.doc("platformSettings/earnings").get();
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const minimum = Number(settings.minimumWithdrawal || 100);
  const feePercent = Number(settings.withdrawalFeePercent || 0);
  if (amount < minimum) throw new HttpsError("failed-precondition","The amount is below the minimum withdrawal.");
  if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 100) throw new HttpsError("failed-precondition","Withdrawal fee settings are invalid.");
  const fee = Math.round(amount * feePercent) / 100;
  const requestRef = db.collection("withdrawalRequests").doc();
  const walletRef = db.doc("instructorWallets/" + uid);
  await db.runTransaction(async transaction => {
    const [walletSnap, requestsSnap] = await Promise.all([
      transaction.get(walletRef),
      transaction.get(db.collection("withdrawalRequests").where("instructorId","==",uid))
    ]);
    if (!walletSnap.exists) throw new HttpsError("failed-precondition","Your instructor wallet has not been provisioned. Contact Academy Finance.");
    const wallet = walletSnap.data();
    if (safeText(wallet.status,"active").toLowerCase() !== "active") throw new HttpsError("failed-precondition","Your instructor wallet is currently restricted. Contact Academy Finance.");
    const committed = requestsSnap.docs.reduce((sum,item) => {
      const w=item.data(), status=safeText(w.status).toLowerCase();
      if (["pending","approved","processing"].includes(status)) return sum+Number(w.amount||0);
      if (["paid","completed","successful"].includes(status) && w.walletBalanceDebited !== true) return sum+Number(w.amount||0);
      return sum;
    },0);
    const available = Math.max(0,Number(wallet.balance||0)-committed);
    if (amount > available) throw new HttpsError("failed-precondition","Your available wallet balance changed. Refresh the wallet and try again.");
    transaction.create(requestRef,{instructorId:uid,amount,withdrawalFee:fee,netAmount:Math.max(0,amount-fee),
      method,account,status:"pending",createdAt:Timestamp.now(),updatedAt:Timestamp.now()});
  });
  return {success:true,requestId:requestRef.id,status:"pending"};
});

exports.getInstructorCourseEnrollmentStats = onCall(async request => {
  const { uid } = await requireActiveInstructor(request);

  const coursesSnapshot = await db.collection("courses")
    .where("instructorId", "==", uid)
    .get();

  const courseStudentCounts = {};
  const allStudents = new Set();
  const ownedCourses = coursesSnapshot.docs;

  // Keep the number of concurrent Firestore reads bounded for instructors
  // with larger course libraries.
  for (let index = 0; index < ownedCourses.length; index += 8) {
    const batch = ownedCourses.slice(index, index + 8);
    const results = await Promise.all(batch.map(async courseDoc => {
      const enrollments = await db.collection("enrollments")
        .where("courseId", "==", courseDoc.id)
        .get();

      const students = new Set();
      enrollments.docs.forEach(enrollmentDoc => {
        const enrollment = enrollmentDoc.data();
        if (!instructorEnrollmentIsActive(enrollment)) return;
        const studentId = safeText(enrollment.studentId || enrollment.userId);
        if (studentId) students.add(studentId);
      });

      return { courseId: courseDoc.id, students };
    }));

    results.forEach(result => {
      courseStudentCounts[result.courseId] = result.students.size;
      result.students.forEach(studentId => allStudents.add(studentId));
    });
  }

  return {
    totalStudents: allStudents.size,
    courseStudentCounts
  };
});

async function resolveStudentPurchase(uid, data) {
  const purchaseType = safeText(data.purchaseType).toLowerCase();
  if (purchaseType === "course") {
    const courseId = safeText(data.courseId);
    if (!courseId) throw new HttpsError("invalid-argument", "Course ID is required.");
    const courseSnap = await db.doc("courses/" + courseId).get();
    if (!courseSnap.exists) throw new HttpsError("not-found", "Course not found.");
    const course = courseSnap.data();
    if (course.published !== true && safeText(course.status).toLowerCase() !== "published") {
      throw new HttpsError("failed-precondition", "This course is not currently available for purchase.");
    }
    const amount = Number(course.price);
    if (!Number.isSafeInteger(amount) || amount < 1 || safeText(course.currency, "KES").toUpperCase() !== "KES") {
      throw new HttpsError("failed-precondition", "This course does not have a valid KES payment price.");
    }
    const enrollmentRef = db.doc("enrollments/" + uid + "_" + courseId);
    const enrollmentSnap = await enrollmentRef.get();
    if (enrollmentSnap.exists) {
      const enrollment = enrollmentSnap.data();
      if (["active", "approved", "completed", "paid"].includes(safeText(enrollment.status).toLowerCase())
          && ["paid", "free"].includes(safeText(enrollment.paymentStatus).toLowerCase())) {
        throw new HttpsError("already-exists", "You already have access to this course.");
      }
    }
    return {
      purchaseType, courseId, courseTitle: safeText(course.title, "Academy Course"),
      amount, currency: "KES", plan: "", billingPeriod: ""
    };
  }

  if (purchaseType === "premium") {
    const plan = safeText(data.plan).toLowerCase();
    const billingPeriod = safeText(data.billingPeriod).toLowerCase();
    if (!["learner_plus", "pro_learner", "career_accelerator"].includes(plan)
        || !["monthly", "quarterly"].includes(billingPeriod)) {
      throw new HttpsError("invalid-argument", "Choose a valid membership plan and billing period.");
    }
    const pricingSnap = await db.doc("premiumPricing/global").get();
    const pricing = pricingSnap.exists ? pricingSnap.data() : {};
    const planData = pricing.plans?.[plan] || {};
    const priceKey = billingPeriod === "monthly" ? "monthlyPrice" : "quarterlyPrice";
    const amount = Number(planData[priceKey]);
    if (pricing.published !== true || planData.enabled === false
        || !Number.isSafeInteger(amount) || amount < 1
        || safeText(pricing.currency, "KSh") !== "KSh") {
      throw new HttpsError("failed-precondition", "This membership price is not currently published by the Founder.");
    }
    return {
      purchaseType, courseId: "", courseTitle: "Premium — " + safeText(planData.name, plan),
      amount, currency: "KES", plan, billingPeriod
    };
  }

  throw new HttpsError("invalid-argument", "Unsupported student payment type.");
}

async function createStudentPaymentRecord({ uid, user, purchase, method, phoneNumber, status }) {
  const paymentRef = db.collection("payments").doc();
  const now = Timestamp.now();
  await paymentRef.set({
    paymentId: paymentRef.id,
    userId: uid,
    studentId: uid,
    studentName: safeText(user.name || user.displayName || user.fullName, requestNameFallback(user)),
    studentEmail: safeText(user.email),
    admissionNumber: safeText(user.admissionNumber),
    purchaseType: purchase.purchaseType,
    paymentType: purchase.purchaseType === "course" ? "course" : "premium_membership",
    courseId: purchase.courseId || null,
    course: purchase.courseTitle,
    plan: purchase.plan || null,
    billingPeriod: purchase.billingPeriod || null,
    amount: purchase.amount,
    currency: purchase.currency,
    method,
    provider: method === "mpesa_stk" ? "safaricom_daraja" : "manual_mpesa",
    phoneNumber: phoneNumber || "",
    status,
    createdAt: now,
    updatedAt: now
  });
  return paymentRef;
}

function requestNameFallback(user) {
  return safeText(user.email, "Student");
}

function studentDarajaCallbackUrl() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!projectId) throw new Error("Firebase project ID is unavailable for the student M-Pesa callback URL.");
  return "https://us-central1-" + projectId + ".cloudfunctions.net/darajaStudentCallback";
}

exports.getStudentPaymentQuote = onCall(async request => {
  const { uid } = await requireActiveStudent(request);
  const purchase = await resolveStudentPurchase(uid, request.data || {});
  const settingsSnap = await db.doc("system/payment_settings").get();
  const manualMpesa = settingsSnap.exists ? (settingsSnap.data().manualMpesa || {}) : {};
  return {
    purchaseType: purchase.purchaseType,
    courseId: purchase.courseId || null,
    plan: purchase.plan || null,
    billingPeriod: purchase.billingPeriod || null,
    title: purchase.courseTitle,
    amount: purchase.amount,
    currency: purchase.currency,
    manualMpesa: {
      enabled: manualMpesa.enabled === true,
      method: safeText(manualMpesa.method),
      businessName: safeText(manualMpesa.businessName),
      number: safeText(manualMpesa.number),
      account: safeText(manualMpesa.account),
      instructions: safeText(manualMpesa.instructions)
    }
  };
});

exports.initiateStudentStkPayment = onCall({ secrets: DARAJA_SECRETS }, async request => {
  const { uid, user } = await requireActiveStudent(request);
  const phoneNumber = normalizeKenyanPhone(request.data?.phoneNumber);
  const purchase = await resolveStudentPurchase(uid, request.data || {});
  const paymentRef = await createStudentPaymentRecord({
    uid, user, purchase, method: "mpesa_stk", phoneNumber, status: "initiating"
  });

  try {
    const token = await getDarajaAccessToken();
    const shortcode = MPESA_SHORTCODE.value();
    const passkey = MPESA_PASSKEY.value();
    if (!shortcode || !passkey) throw new HttpsError("failed-precondition", "M-Pesa shortcode and passkey are not configured.");
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
        Amount: purchase.amount,
        PartyA: phoneNumber,
        PartyB: shortcode,
        PhoneNumber: phoneNumber,
        CallBackURL: studentDarajaCallbackUrl(),
        AccountReference: ("SSA" + paymentRef.id.replace(/[^a-zA-Z0-9]/g, "").slice(-9)).slice(0, 12),
        TransactionDesc: purchase.purchaseType === "course" ? "SSA Course Fee" : "SSA Premium"
      })
    });
    const result = await response.json();
    if (!response.ok || String(result.ResponseCode) !== "0" || !result.CheckoutRequestID) {
      throw new Error("Safaricom did not accept the STK Push request.");
    }
    await paymentRef.set({
      status: "pending",
      merchantRequestId: safeText(result.MerchantRequestID),
      checkoutRequestId: safeText(result.CheckoutRequestID),
      customerMessage: safeText(result.CustomerMessage, "Check your phone and enter your M-Pesa PIN."),
      updatedAt: Timestamp.now()
    }, { merge: true });
    return {
      success: true, paymentId: paymentRef.id, status: "pending",
      customerMessage: safeText(result.CustomerMessage, "Check your phone and enter your M-Pesa PIN.")
    };
  } catch (error) {
    await paymentRef.set({
      status: "initiation_failed",
      failureMessage: "The M-Pesa prompt could not be started.",
      updatedAt: Timestamp.now()
    }, { merge: true });
    if (error instanceof HttpsError) throw error;
    console.error("Student STK initiation failed:", error.message);
    throw new HttpsError("unavailable", "The M-Pesa prompt could not be sent. You can retry or use manual M-Pesa submission.");
  }
});

exports.getManualMpesaSettings = onCall(async request => {
  await requireFounder(request);
  const snap = await db.doc("system/payment_settings").get();
  const settings = snap.exists ? (snap.data().manualMpesa || {}) : {};
  return {
    enabled: settings.enabled === true,
    method: safeText(settings.method, "paybill"),
    businessName: safeText(settings.businessName),
    number: safeText(settings.number),
    account: safeText(settings.account),
    instructions: safeText(settings.instructions)
  };
});

exports.saveManualMpesaSettings = onCall(async request => {
  const founder = await requireFounder(request);
  const input = request.data || {};
  const enabled = input.enabled === true;
  const method = safeText(input.method).toLowerCase();
  const businessName = safeText(input.businessName).slice(0, 100);
  const number = safeText(input.number).replace(/[^0-9]/g, "").slice(0, 20);
  const account = safeText(input.account).slice(0, 80);
  const instructions = safeText(input.instructions).slice(0, 1000);
  if (enabled && !["paybill", "till", "other"].includes(method)) {
    throw new HttpsError("invalid-argument", "Choose Paybill, Buy Goods Till or Other.");
  }
  if (enabled && (!businessName || !instructions || (method !== "other" && number.length < 5))) {
    throw new HttpsError("invalid-argument", "Add the business name, payment number and clear payment instructions before enabling manual M-Pesa.");
  }
  await db.doc("system/payment_settings").set({
    manualMpesa: { enabled, method, businessName, number, account, instructions, updatedAt: Timestamp.now(), updatedBy: founder.uid },
    updatedAt: Timestamp.now()
  }, { merge: true });
  await db.collection("audit_logs").add({
    action: "manual_mpesa_settings_updated", actorId: founder.uid,
    enabled, method, createdAt: Timestamp.now()
  });
  return { success: true, enabled };
});

exports.submitStudentManualPayment = onCall(async request => {
  const { uid, user } = await requireActiveStudent(request);
  const settingsSnap = await db.doc("system/payment_settings").get();
  const manualMpesa = settingsSnap.exists ? (settingsSnap.data().manualMpesa || {}) : {};
  if (manualMpesa.enabled !== true) {
    throw new HttpsError("failed-precondition", "Manual M-Pesa submission is not currently configured by the Founder.");
  }
  const purchase = await resolveStudentPurchase(uid, request.data || {});
  const receiptCode = safeText(request.data?.receiptCode).toUpperCase().replace(/\s+/g, "");
  const payerPhone = normalizeKenyanPhone(request.data?.phoneNumber);
  if (!/^[A-Z0-9]{8,16}$/.test(receiptCode)) {
    throw new HttpsError("invalid-argument", "Enter the M-Pesa receipt code exactly as shown in your confirmation message.");
  }
  const receiptRef = db.doc("manualMpesaReceipts/" + receiptCode);
  const paymentRef = db.collection("payments").doc();
  const now = Timestamp.now();
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(receiptRef);
    if (existing.exists) throw new HttpsError("already-exists", "This M-Pesa receipt code has already been submitted.");
    transaction.create(receiptRef, {
      receiptCode, paymentId: paymentRef.id, userId: uid,
      status: "pending_review", createdAt: now
    });
    transaction.create(paymentRef, {
      paymentId: paymentRef.id,
      userId: uid, studentId: uid,
      studentName: safeText(user.name || user.displayName || user.fullName, requestNameFallback(user)),
      studentEmail: safeText(user.email),
      admissionNumber: safeText(user.admissionNumber),
      purchaseType: purchase.purchaseType,
      paymentType: purchase.purchaseType === "course" ? "course" : "premium_membership",
      courseId: purchase.courseId || null,
      course: purchase.courseTitle,
      plan: purchase.plan || null,
      billingPeriod: purchase.billingPeriod || null,
      amount: purchase.amount, currency: purchase.currency,
      method: "manual_mpesa", provider: "manual_mpesa",
      phoneNumber: payerPhone, manualReceiptCode: receiptCode,
      status: "pending_review",
      createdAt: now, updatedAt: now
    });
  });
  return { success: true, paymentId: paymentRef.id, status: "pending_review" };
});

async function activateStudentPayment(paymentRef, payment, verification) {
  const now = Timestamp.now();
  const courseRef = payment.purchaseType === "course"
    ? db.doc("enrollments/" + payment.userId + "_" + payment.courseId) : null;
  const subscriptionRef = payment.purchaseType === "premium"
    ? db.doc("premiumSubscriptions/" + payment.userId) : null;

  await db.runTransaction(async transaction => {
    const paymentSnap = await transaction.get(paymentRef);
    if (!paymentSnap.exists) throw new Error("Student payment record was not found.");
    if (paymentSnap.data().status === "paid" || paymentSnap.data().status === "completed") return;
    if (courseRef) {
      const enrollmentSnap = await transaction.get(courseRef);
      if (!enrollmentSnap.exists) {
        transaction.create(courseRef, {
          userId: payment.userId, studentId: payment.userId,
          courseId: payment.courseId, courseName: payment.course,
          status: "active", paymentStatus: "paid", source: "student_payment",
          paymentId: paymentRef.id, amountPaid: payment.amount,
          currency: payment.currency, enrolledAt: now, createdAt: now, updatedAt: now
        });
      } else {
        const existing = enrollmentSnap.data();
        if (safeText(existing.paymentStatus).toLowerCase() !== "paid"
            && !["active", "approved", "completed"].includes(safeText(existing.status).toLowerCase())) {
          transaction.set(courseRef, {
            userId: payment.userId, studentId: payment.userId,
            courseId: payment.courseId, courseName: payment.course,
            status: "active", paymentStatus: "paid", source: "student_payment",
            paymentId: paymentRef.id, amountPaid: payment.amount,
            currency: payment.currency, enrolledAt: now, updatedAt: now
          }, { merge: true });
        }
      }
    }
    if (subscriptionRef) {
      const subscriptionSnap = await transaction.get(subscriptionRef);
      const current = subscriptionSnap.exists ? subscriptionSnap.data() : {};
      const nowMillis = now.toMillis();
      const existingExpiry = current.expiresAt?.toMillis ? current.expiresAt.toMillis() : 0;
      const startMillis = Math.max(nowMillis, existingExpiry);
      const durationDays = payment.billingPeriod === "quarterly" ? 90 : 30;
      transaction.set(subscriptionRef, {
        status: "active", plan: payment.plan, source: "payment",
        billingPeriod: payment.billingPeriod,
        startsAt: current.status === "active" && existingExpiry > nowMillis ? current.startsAt || now : now,
        expiresAt: Timestamp.fromMillis(startMillis + durationDays * 86400000),
        lastPaymentId: paymentRef.id, updatedAt: now
      }, { merge: true });
    }
    transaction.set(paymentRef, {
      status: "paid", verificationMethod: verification.method,
      mpesaReceiptNumber: verification.receiptCode || null,
      transactionDate: verification.transactionDate || null,
      verifiedAt: now, updatedAt: now
    }, { merge: true });
  });
}

exports.attachStudentPaymentProof = onCall(async request => {
  const { uid } = await requireActiveStudent(request);
  const paymentId = safeText(request.data?.paymentId);
  const storagePath = safeText(request.data?.storagePath);
  const expectedPrefix = "student-payment-proofs/" + uid + "/" + paymentId + "/";
  if (!paymentId || !storagePath.startsWith(expectedPrefix)
      || !/\.(jpg|jpeg|png|webp)$/i.test(storagePath)) {
    throw new HttpsError("invalid-argument", "The payment proof path is invalid.");
  }
  const paymentRef = db.doc("payments/" + paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment record not found.");
  const payment = paymentSnap.data();
  let proofMetadata;
  try {
    const [metadata] = await adminStorage.bucket().file(storagePath).getMetadata();
    proofMetadata = metadata;
  } catch (_) {
    throw new HttpsError("failed-precondition", "Upload the M-Pesa confirmation screenshot before submitting proof.");
  }
  const proofSize = Number(proofMetadata.size || 0);
  if (!/^image\/(jpeg|png|webp)$/.test(safeText(proofMetadata.contentType))
      || proofSize < 1 || proofSize > 5 * 1024 * 1024) {
    throw new HttpsError("failed-precondition", "The uploaded proof must be a valid image no larger than 5 MB.");
  }
  if (payment.userId !== uid || payment.method !== "manual_mpesa" || payment.status !== "pending_review") {
    throw new HttpsError("permission-denied", "This payment cannot accept proof from this account.");
  }
  await paymentRef.set({
    proofStoragePath: storagePath,
    proofUploadedAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  }, { merge: true });
  return { success: true };
});

exports.reviewStudentManualPayment = onCall(async request => {
  const reviewer = await requireInstitutionReviewer(request);
  const paymentId = safeText(request.data?.paymentId);
  const decision = safeText(request.data?.decision).toLowerCase();
  const note = safeText(request.data?.note).slice(0, 500);
  if (!paymentId || !["approve", "reject"].includes(decision)) {
    throw new HttpsError("invalid-argument", "Choose a payment and an approve or reject decision.");
  }
  const paymentRef = db.doc("payments/" + paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment record not found.");
  const payment = paymentSnap.data();
  if (payment.method !== "manual_mpesa" || payment.status !== "pending_review") {
    throw new HttpsError("failed-precondition", "This payment is not awaiting manual M-Pesa review.");
  }
  if (decision === "approve" && !safeText(payment.proofStoragePath)) {
    throw new HttpsError("failed-precondition", "A payment proof image must be uploaded before approval.");
  }
  if (decision === "reject") {
    await paymentRef.set({
      status: "rejected", reviewNote: note, reviewedBy: reviewer.uid,
      reviewedAt: Timestamp.now(), updatedAt: Timestamp.now()
    }, { merge: true });
    if (payment.manualReceiptCode) {
      await db.doc("manualMpesaReceipts/" + payment.manualReceiptCode).set({
        status: "rejected", reviewedBy: reviewer.uid, reviewedAt: Timestamp.now()
      }, { merge: true });
    }
    await db.collection("audit_logs").add({
      action: "student_manual_mpesa_payment_rejected", actorId: reviewer.uid,
      targetId: payment.userId, paymentId, receiptCode: payment.manualReceiptCode || "",
      amount: payment.amount, currency: payment.currency, reviewNote: note,
      createdAt: Timestamp.now()
    });
    return { success: true, status: "rejected" };
  }
  await activateStudentPayment(paymentRef, payment, {
    method: "manual_admin_verification",
    receiptCode: payment.manualReceiptCode
  });
  await paymentRef.set({
    reviewedBy: reviewer.uid, reviewedAt: Timestamp.now(),
    reviewNote: note, status: "paid", updatedAt: Timestamp.now()
  }, { merge: true });
  if (payment.manualReceiptCode) {
    await db.doc("manualMpesaReceipts/" + payment.manualReceiptCode).set({
      status: "verified", reviewedBy: reviewer.uid, reviewedAt: Timestamp.now()
    }, { merge: true });
  }
  await db.collection("audit_logs").add({
    action: "student_manual_mpesa_payment_verified", actorId: reviewer.uid,
    targetId: payment.userId, paymentId, amount: payment.amount,
    currency: payment.currency, receiptCode: payment.manualReceiptCode || "",
    createdAt: Timestamp.now()
  });
  return { success: true, status: "paid" };
});

exports.darajaStudentCallback = onRequest({ secrets: DARAJA_SECRETS, invoker: "public" }, async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;
    const checkoutRequestId = safeText(callback?.CheckoutRequestID);
    if (!checkoutRequestId) { res.status(400).json({ received: false }); return; }
    const matches = await db.collection("payments")
      .where("checkoutRequestId", "==", checkoutRequestId).limit(1).get();
    if (matches.empty) { res.status(200).json({ ResultCode: 0, ResultDesc: "Callback acknowledged." }); return; }
    const paymentDoc = matches.docs[0];
    const payment = paymentDoc.data();
    if (payment.status === "paid") { res.status(200).json({ ResultCode: 0, ResultDesc: "Already processed." }); return; }
    if (Number(callback.ResultCode) !== 0) {
      await paymentDoc.ref.set({
        status: "failed", resultCode: Number(callback.ResultCode),
        resultDescription: safeText(callback.ResultDesc).slice(0, 250),
        updatedAt: Timestamp.now()
      }, { merge: true });
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
    if (Number(metadata.Amount) !== Number(payment.amount)
        || String(metadata.PhoneNumber || "") !== String(payment.phoneNumber || "")
        || !safeText(metadata.MpesaReceiptNumber)) {
      throw new Error("Student payment callback metadata did not match the payment record.");
    }
    await activateStudentPayment(paymentDoc.ref, payment, {
      method: "daraja_stk_query",
      receiptCode: safeText(metadata.MpesaReceiptNumber),
      transactionDate: metadata.TransactionDate || null
    });
    await db.collection("audit_logs").add({
      action: "student_mpesa_stk_payment_verified", actorId: "daraja_callback",
      targetId: payment.userId, paymentId: paymentDoc.id,
      receiptCode: safeText(metadata.MpesaReceiptNumber), amount: payment.amount,
      currency: payment.currency, createdAt: Timestamp.now()
    });
    res.status(200).json({ ResultCode: 0, ResultDesc: "Payment processed." });
  } catch (error) {
    console.error("Student Daraja callback processing failed:", error.message);
    res.status(200).json({ ResultCode: 0, ResultDesc: "Callback received for processing." });
  }
});


exports.reconcileStudentStkPayments = onSchedule({
  schedule: "every 5 minutes",
  secrets: DARAJA_SECRETS,
  timeZone: "Africa/Nairobi"
}, async () => {
  const pending = await db.collection("payments")
    .where("status", "==", "verification_pending").limit(50).get();
  for (const paymentDoc of pending.docs) {
    const payment = paymentDoc.data();
    const metadata = payment.callbackMetadata || {};
    try {
      if (!payment.checkoutRequestId || !safeText(metadata.MpesaReceiptNumber)) continue;
      if (!await verifyDarajaStkCheckout(payment.checkoutRequestId)) continue;
      if (Number(metadata.Amount) !== Number(payment.amount)
          || String(metadata.PhoneNumber || "") !== String(payment.phoneNumber || "")) {
        throw new Error("Pending student payment metadata did not match the payment record.");
      }
      await activateStudentPayment(paymentDoc.ref, payment, {
        method: "daraja_stk_query",
        receiptCode: safeText(metadata.MpesaReceiptNumber),
        transactionDate: metadata.TransactionDate || null
      });
      await db.collection("audit_logs").add({
        action: "student_mpesa_stk_payment_reconciled",
        actorId: "daraja_reconciliation", targetId: payment.userId,
        paymentId: paymentDoc.id, receiptCode: safeText(metadata.MpesaReceiptNumber),
        amount: payment.amount, currency: payment.currency, createdAt: Timestamp.now()
      });
    } catch (error) {
      console.error("Student STK reconciliation failed:", paymentDoc.id, error.message);
    }
  }
});


async function requireActiveInstitutionMember(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to manage institution courses.");

  const profileSnap = await db.doc("users/" + uid).get();
  const profile = profileSnap.exists ? profileSnap.data() : {};
  // The requested tenant is navigation context only. The canonical membership
  // document is the authorization grant; legacy profile fields are a temporary
  // compatibility fallback for accounts that have not yet been migrated.
  const institutionId = safeText(request.data?.institutionId || profile.institutionId);
  if (!institutionId || institutionId.length > 128) {
    throw new HttpsError("permission-denied", "Choose an institution where you have an active membership.");
  }

  const [institutionSnap, membershipSnap] = await Promise.all([
    db.doc("institutions/" + institutionId).get(),
    db.doc("institutions/" + institutionId + "/members/" + uid).get()
  ]);
  const membership = membershipSnap.exists ? membershipSnap.data() : {};
  const canonicalAllowed = membershipSnap.exists
    && safeText(membership.uid || uid) === uid
    && safeText(membership.institutionId || institutionId) === institutionId
    && membership.status === "active"
    && membership.verified === true;
  const legacyRole = safeText(profile.role).toLowerCase();
  const legacyAllowed = profile.institutionId === institutionId
    && ["institution", "institution_owner", "institution_admin"].includes(legacyRole)
    && profile.status === "active" && profile.active === true && profile.verified === true;

  if (!institutionSnap.exists || institutionSnap.data().status !== "active") {
    throw new HttpsError("failed-precondition", "Institution workspace is not active.");
  }
  if (!canonicalAllowed && !legacyAllowed) {
    throw new HttpsError("permission-denied", "An active, verified membership in this institution is required.");
  }
  const institutionRole = canonicalAllowed
    ? safeText(membership.role)
    : safeText(profile.institutionRole);
  const managerRoles = ["institution_owner", "owner", "institution_admin", "department_manager"];
  if (canonicalAllowed && !managerRoles.includes(institutionRole)) {
    throw new HttpsError("permission-denied", "Your institution membership does not include course-management permissions.");
  }
  if (legacyAllowed && !["owner", "institution_admin"].includes(institutionRole)) {
    throw new HttpsError("permission-denied", "Your legacy institution role does not include course-management permissions.");
  }
  return { uid, profile, membership, institutionId, institutionRole };
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
    const [instructorSnap, instructorMembershipSnap] = await Promise.all([
      db.doc("users/" + instructorId).get(),
      db.doc("institutions/" + member.institutionId + "/members/" + instructorId).get()
    ]);
    const instructor = instructorSnap.exists ? instructorSnap.data() : {};
    const instructorMembership = instructorMembershipSnap.exists ? instructorMembershipSnap.data() : {};
    const canonicalInstructor = instructorMembershipSnap.exists
      && instructorMembership.institutionId === member.institutionId
      && instructorMembership.uid === instructorId
      && instructorMembership.memberType === "instructor"
      && instructorMembership.role === "instructor"
      && instructorMembership.status === "active"
      && instructorMembership.verified === true;
    const legacyInstructor = instructor.role === "instructor"
      && instructor.institutionId === member.institutionId
      && instructor.status === "active"
      && instructor.active === true
      && instructor.verified === true;
    if (!canonicalInstructor && !legacyInstructor) {
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
  const snap = await db.doc("marketplacePricing/global").get();
  const saved = snap.exists ? snap.data() : {};
  const prices = Object.fromEntries(MARKETPLACE_PRICE_TYPES.map(item => {
    const configured = saved.prices?.[item.key] || {};
    return [item.key, {
      label: item.label, unit: item.unit,
      proposedAmount: item.proposed,
      amount: Number.isFinite(Number(configured.amount)) ? Number(configured.amount) : item.proposed,
      currency: configured.currency || "KES",
      enabled: configured.enabled === true
    }];
  }));
  return { currency: saved.currency || "KES", prices, transactionFeeEnabled: saved.transactionFeeEnabled === true, transactionFeePercent: Number(saved.transactionFeePercent || 0), pricingStatus: saved.pricingStatus || "proposed" };
});

exports.saveMarketplacePricing = onCall(async request => {
  const founder = await requireFounder(request);
  const payload = request.data || {};
  const currency = safeText(payload.currency, "KES");
  if (!["KES", "USD", "EUR", "GBP"].includes(currency)) throw new HttpsError("invalid-argument", "Unsupported marketplace currency.");
  const incoming = payload.prices || {};
  const prices = {};
  for (const item of MARKETPLACE_PRICE_TYPES) {
    const value = incoming[item.key] || {};
    const amount = Number(value.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) throw new HttpsError("invalid-argument", "Invalid price for " + item.label + ".");
    prices[item.key] = { amount, currency, enabled: value.enabled === true, unit: item.unit, label: item.label };
  }
  const transactionFeePercent = Number(payload.transactionFeePercent || 0);
  if (!Number.isFinite(transactionFeePercent) || transactionFeePercent < 0 || transactionFeePercent > 20) throw new HttpsError("invalid-argument", "Transaction fee must be between 0 and 20 percent.");
  const now = Timestamp.now();
  await db.doc("marketplacePricing/global").set({
    currency, prices,
    transactionFeeEnabled: payload.transactionFeeEnabled === true,
    transactionFeePercent,
    pricingStatus: "proposed",
    updatedAt: now, updatedBy: founder.uid
  }, { merge: true });
  await db.collection("audit_logs").add({ action: "marketplace_pricing_proposals_updated", actorId: founder.uid, currency, createdAt: now });
  return { success: true, pricingStatus: "proposed", prices };
});

exports.getFounderPaymentGatewaySettings = onCall(async request => {
  await requireFounder(request);
  const snapshot = await db.collection("payment_gateways").get();
  return { gateways: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) };
});

exports.saveFounderPaymentGatewaySettings = onCall(async request => {
  const founder = await requireFounder(request);
  const input = request.data || {};
  const provider = safeText(input.provider).toLowerCase();
  const allowed = ["mpesa","cards","bank","paypal"];
  if (!allowed.includes(provider)) throw new HttpsError("invalid-argument","Unsupported payment provider.");
  const environment = safeText(input.environment).toLowerCase();
  if (!["sandbox","production"].includes(environment)) throw new HttpsError("invalid-argument","Invalid gateway environment.");
  const validateEndpoint = value => {
    const raw = safeText(value).trim();
    if (!raw) return "";
    let parsed;
    try { parsed = new URL(raw); } catch { throw new HttpsError("invalid-argument","Gateway URLs must be valid HTTPS URLs."); }
    if (parsed.protocol !== "https:") throw new HttpsError("invalid-argument","Gateway URLs must use HTTPS.");
    return parsed.toString().slice(0, 500);
  };
  const ref = db.doc("payment_gateways/" + provider);
  const now = Timestamp.now();
  const enabled = input.enabled === true;
  await db.runTransaction(async tx => {
    tx.set(ref, {
      provider, environment,
      callbackUrl: validateEndpoint(input.callbackUrl),
      webhookUrl: validateEndpoint(input.webhookUrl),
      enabled, lastSync: now, updatedAt: now, updatedBy: founder.uid
    }, { merge: true });
    tx.set(db.collection("audit_logs").doc(), {
      action: "founder_payment_gateway_updated", actorId: founder.uid,
      targetId: provider, enabled, environment, createdAt: now
    });
  });
  return { success: true, provider, enabled };
});

exports.saveFounderSparkAISettings = onCall(async request => {
  const founder = await requireFounder(request);
  const input = request.data?.settings;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpsError("invalid-argument", "Spark AI settings are required.");
  }
  const provider = safeText(input.aiProvider).toLowerCase();
  const model = safeText(input.aiModel).trim().slice(0, 120);
  const endpoint = safeText(input.apiEndpoint).trim();
  const temperature = Number(input.temperature);
  const maxTokens = Number(input.maxTokens);
  const rateLimit = Number(input.rateLimit);
  const conversationLimit = Number(input.conversationLimit);
  if (provider !== "groq") throw new HttpsError("invalid-argument", "Only the configured Groq provider is currently supported.");
  if (endpoint && endpoint !== "https://api.groq.com/openai/v1") {
    throw new HttpsError("invalid-argument", "Only the verified Groq API endpoint is allowed.");
  }
  if (!model || !Number.isFinite(temperature) || temperature < 0 || temperature > 2
      || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 32768
      || !Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 10000
      || !Number.isInteger(conversationLimit) || conversationLimit < 1 || conversationLimit > 1000) {
    throw new HttpsError("invalid-argument", "One or more Spark AI settings are outside the permitted range.");
  }
  const settings = {
    aiProvider: provider, aiModel: model,
    apiEndpoint: "https://api.groq.com/openai/v1",
    temperature, maxTokens, rateLimit, conversationLimit,
    systemPrompt: safeText(input.systemPrompt).slice(0, 12000),
    aiPersonality: safeText(input.aiPersonality).slice(0, 2000),
    defaultLanguage: safeText(input.defaultLanguage).slice(0, 40),
    responseStyle: safeText(input.responseStyle).slice(0, 40),
    enableStreaming: input.enableStreaming === true,
    enableMemory: input.enableMemory === true,
    enableWeb: input.enableWeb === true,
    enableCode: input.enableCode === true,
    enableImages: input.enableImages === true,
    updatedAt: Timestamp.now(), updatedBy: founder.uid
  };
  const batch = db.batch();
  batch.set(db.doc("settings/sparkAI"), settings, { merge: true });
  batch.set(db.collection("audit_logs").doc(), {
    action: "founder_spark_ai_settings_updated", actorId: founder.uid,
    changedFields: Object.keys(settings).filter(key => key !== "updatedAt"),
    createdAt: settings.updatedAt
  });
  await batch.commit();
  return { success: true };
});

exports.founderManageAnnouncement = onCall(async request => {
  const founder = await requireFounder(request);
  const action = safeText(request.data?.action).toLowerCase();
  const id = safeText(request.data?.announcementId);
  const now = Timestamp.now();
  if (action === "create") {
    const input = request.data?.announcement || {};
    const title = safeText(input.title).trim().slice(0, 140);
    const message = safeText(input.message).trim().slice(0, 12000);
    const category = safeText(input.category).slice(0, 60);
    const audience = safeText(input.audience).slice(0, 40);
    const status = safeText(input.status).toLowerCase();
    const publishDate = input.publishDate ? new Date(input.publishDate) : null;
    const expiryDate = input.expiryDate ? new Date(input.expiryDate) : null;
    if (!title || !message || !["draft","published"].includes(status)) {
      throw new HttpsError("invalid-argument", "Provide a title, message and valid publication status.");
    }
    if ((publishDate && Number.isNaN(publishDate.getTime())) || (expiryDate && Number.isNaN(expiryDate.getTime()))) {
      throw new HttpsError("invalid-argument", "Announcement dates are invalid.");
    }
    if (publishDate && expiryDate && expiryDate <= publishDate) {
      throw new HttpsError("invalid-argument", "Expiry must be later than the publication date.");
    }
    const docRef = db.collection("announcements").doc();
    await db.runTransaction(async tx => {
      tx.create(docRef, {
        title, message, category, audience, status,
        publishDate: publishDate ? Timestamp.fromDate(publishDate) : null,
        expiryDate: expiryDate ? Timestamp.fromDate(expiryDate) : null,
        pinned: input.pinned === true, important: input.important === true,
        push: input.push === true, email: input.email === true, popup: input.popup === true,
        createdAt: now, createdBy: founder.uid, updatedAt: now
      });
      tx.set(db.collection("audit_logs").doc(), {
        action: "founder_announcement_created", actorId: founder.uid,
        targetId: docRef.id, status, createdAt: now
      });
    });
    return { success: true, announcementId: docRef.id };
  }
  if (!id) throw new HttpsError("invalid-argument", "Announcement ID is required.");
  const ref = db.doc("announcements/" + id);
  if (action === "pin") {
    const pinned = request.data?.pinned === true;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "Announcement not found.");
      tx.update(ref, { pinned, updatedAt: now, updatedBy: founder.uid });
      tx.set(db.collection("audit_logs").doc(), {
        action: pinned ? "founder_announcement_pinned" : "founder_announcement_unpinned",
        actorId: founder.uid, targetId: id, createdAt: now
      });
    });
    return { success: true, pinned };
  }
  if (action === "delete") {
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "Announcement not found.");
      tx.update(ref, { status: "archived", archivedAt: now, archivedBy: founder.uid, updatedAt: now });
      tx.set(db.collection("audit_logs").doc(), {
        action: "founder_announcement_archived", actorId: founder.uid,
        targetId: id, createdAt: now
      });
    });
    return { success: true, archived: true };
  }
  throw new HttpsError("invalid-argument", "Unsupported announcement action.");
});

exports.saveFounderMonetizationSettings = onCall(async request => {
  const founder = await requireFounder(request);
  const input = request.data?.settings;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new HttpsError("invalid-argument", "Monetization settings are required.");
  }
  const numeric = [
    "courseFee","registrationFee","examinationFee","certificateFee",
    "premiumMonthly","premiumQuarterly","premiumYearly","instructorCommission",
    "platformCommission","maxDiscount","couponExpiry","minimumWithdrawal",
    "withdrawalFeePercent","vatRate","decimalPlaces"
  ];
  const boolean = [
    "enablePremium","premiumCertificates","enableMpesa","enableCards","enablePaypal",
    "enableBank","enableInstructorEarnings","automaticPayouts","allowCoupons",
    "allowScholarships","enableWithdrawals","withdrawalApproval","enableRevenueDashboard",
    "trackStudentPurchases","trackInstructorRevenue","monthlyRevenueReports","enablePayments",
    "allowRefunds"
  ];
  const textFields = ["withdrawalTime","billingCycle","invoicePrefix","currency","currencySymbol"];
  const settings = {};
  for (const key of numeric) {
    const value = Number(input[key]);
    if (!Number.isFinite(value) || value < 0 || value > 100000000) {
      throw new HttpsError("invalid-argument", "Invalid numeric monetization value: " + key);
    }
    settings[key] = value;
  }
  for (const key of boolean) settings[key] = input[key] === true;
  for (const key of textFields) settings[key] = safeText(input[key]).slice(0, 40);
  if (settings.instructorCommission + settings.platformCommission !== 100) {
    throw new HttpsError("invalid-argument", "Instructor and platform shares must total 100%.");
  }
  if (settings.withdrawalFeePercent > 100 || settings.maxDiscount > 100 || settings.vatRate > 100
      || settings.decimalPlaces > 4 || settings.couponExpiry > 3650) {
    throw new HttpsError("invalid-argument", "One or more percentage or range settings are invalid.");
  }
  if (!["KES","USD","EUR","GBP"].includes(settings.currency)) {
    throw new HttpsError("invalid-argument", "Unsupported platform currency.");
  }
  if (!["Monthly","Quarterly","Yearly"].includes(settings.billingCycle)) {
    throw new HttpsError("invalid-argument", "Unsupported billing cycle.");
  }
  if (settings.automaticPayouts) {
    throw new HttpsError("failed-precondition", "Automatic payouts are not enabled for production. Keep this setting disabled until payout reconciliation is deployed.");
  }
  const now = Timestamp.now();
  const batch = db.batch();
  batch.set(db.doc("settings/monetization"), { ...settings, updatedAt: now, updatedBy: founder.uid }, { merge: true });
  batch.set(db.doc("platformSettings/earnings"), {
    minimumWithdrawal: settings.minimumWithdrawal,
    withdrawalFeePercent: settings.withdrawalFeePercent,
    withdrawalsEnabled: settings.enableWithdrawals,
    withdrawalApproval: settings.withdrawalApproval,
    withdrawalProcessingTime: settings.withdrawalTime,
    updatedAt: now,
    updatedBy: founder.uid
  }, { merge: true });
  batch.set(db.collection("audit_logs").doc(), {
    action: "founder_monetization_settings_updated",
    actorId: founder.uid,
    changedFields: [...numeric, ...boolean, ...textFields],
    createdAt: now
  });
  await batch.commit();
  return { success: true, updatedAt: now.toMillis() };
});

exports.founderReviewWithdrawal = onCall(async request => {
  const founder = await requireFounder(request);
  const withdrawalId = safeText(request.data?.withdrawalId);
  const decision = safeText(request.data?.decision).toLowerCase();
  const reason = safeText(request.data?.reason).slice(0, 1000);
  if (!withdrawalId || !["approve", "reject"].includes(decision)) {
    throw new HttpsError("invalid-argument", "Choose a valid withdrawal and decision.");
  }
  if (decision === "reject" && reason.length < 5) {
    throw new HttpsError("invalid-argument", "Provide a clear rejection reason of at least five characters.");
  }
  const ref = db.doc("withdrawals/" + withdrawalId);
  const now = Timestamp.now();
  let result;
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Withdrawal request was not found.");
    const data = snap.data();
    const status = safeText(data.status).toLowerCase();
    if (status !== "pending") throw new HttpsError("failed-precondition", "This request is no longer pending. Refresh the queue.");
    const nextStatus = decision === "approve" ? "approved" : "rejected";
    tx.update(ref, {
      status: nextStatus,
      reviewReason: decision === "reject" ? reason : "",
      reviewedAt: now,
      reviewedBy: founder.uid,
      updatedAt: now
    });
    result = { status: nextStatus, instructorId: safeText(data.instructorId || data.userId) };
  });
  await db.collection("audit_logs").add({
    action: "founder_withdrawal_" + result.status,
    actorId: founder.uid,
    targetId: withdrawalId,
    instructorId: result.instructorId || null,
    reason: decision === "reject" ? reason : null,
    createdAt: now
  });
  return { success: true, status: result.status, note: decision === "approve"
    ? "Approved for payout processing. No funds have been transferred."
    : "Request rejected and the reason recorded." };
});

exports.founderSendBroadcast = onCall(async request => {
  const founder = await requireFounder(request);
  const title = safeText(request.data?.title);
  const message = safeText(request.data?.message);
  const target = safeText(request.data?.target || "all");
  const priority = safeText(request.data?.priority || "normal");
  const roles = { students:"student", instructors:"instructor", admins:"admin" };

  if (!title || title.length > 120) throw new HttpsError("invalid-argument","Announcement title must be 1–120 characters.");
  if (!message || message.length > 4000) throw new HttpsError("invalid-argument","Announcement message must be 1–4,000 characters.");
  if (!["all","students","instructors","admins"].includes(target)) throw new HttpsError("invalid-argument","Choose a valid announcement audience.");
  if (!["normal","high","critical"].includes(priority)) throw new HttpsError("invalid-argument","Choose a valid announcement priority.");

  const dayKey = new Date().toISOString().slice(0,10);
  const limitRef = db.doc(`founderBroadcastLimits/${founder.uid}`);
  await db.runTransaction(async tx => {
    const snap = await tx.get(limitRef);
    const data = snap.exists ? snap.data() : {};
    const count = data.dayKey === dayKey ? Number(data.count || 0) : 0;
    if (count >= 10) throw new HttpsError("resource-exhausted","Daily broadcast limit reached. Try again tomorrow.");
    tx.set(limitRef,{dayKey,count:count+1,updatedAt:Timestamp.now()},{merge:true});
  });

  const recipientQuery = target === "all"
    ? db.collection("users")
    : db.collection("users").where("role","==",roles[target]);
  const recipientSnap = await recipientQuery.get();
  if (recipientSnap.size > 5000) throw new HttpsError("resource-exhausted","Audience exceeds the 5,000-recipient broadcast limit.");

  const now = Timestamp.now();
  const broadcastRef = db.collection("broadcasts").doc();
  const announcementRef = db.collection("announcements").doc();
  const audience = target === "all" ? "Everyone" : target[0].toUpperCase()+target.slice(1);
  const notificationDocs = recipientSnap.docs.map(userDoc => ({
    ref:db.collection("notifications").doc(),
    data:{userId:userDoc.id,title,message,type:"broadcast",priority,read:false,broadcastId:broadcastRef.id,createdAt:now,createdBy:founder.uid}
  }));

  const firstBatch = db.batch();
  firstBatch.create(broadcastRef,{title,message,target,priority,channels:["in-app","announcement"],status:"sent",sentBy:founder.uid,sentAt:now,recipientCount:notificationDocs.length});
  firstBatch.create(announcementRef,{title,message,category:"System",audience,priority,important:priority!=="normal",pinned:priority==="critical",push:true,email:false,popup:priority==="critical",status:"published",createdAt:now,createdBy:founder.uid});
  notificationDocs.slice(0,450).forEach(item=>firstBatch.create(item.ref,item.data));
  await firstBatch.commit();

  for(let index=450;index<notificationDocs.length;index+=450){
    const batch=db.batch();
    notificationDocs.slice(index,index+450).forEach(item=>batch.create(item.ref,item.data));
    await batch.commit();
  }
  await db.collection("audit_logs").add({action:"founder_broadcast_sent",actorId:founder.uid,target,priority,recipientCount:notificationDocs.length,targetId:broadcastRef.id,createdAt:now});
  return {success:true,broadcastId:broadcastRef.id,recipientCount:notificationDocs.length};
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

      // Canonical owner membership is the tenant authorization record.
      // A pre-activation payment requirement keeps this membership pending.
      transaction.set(db.doc(`institutions/${applicationId}/members/${ownerUid}`), {
        uid: ownerUid,
        institutionId: applicationId,
        memberType: "institution_owner",
        role: "institution_owner",
        status: requiresPaymentBeforeActivation ? "pending_verification" : "active",
        verified: !requiresPaymentBeforeActivation,
        email: application.ownerEmail,
        fullName: application.ownerName,
        createdAt: institutionSnap.exists ? (institutionSnap.data().createdAt || now) : now,
        updatedAt: now,
        ...(requiresPaymentBeforeActivation ? {} : { activatedAt: now })
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



// ============================================================
// INSTITUTION PEOPLE MANAGEMENT — TENANT-SCOPED OPERATIONS
// ============================================================

const INSTITUTION_MEMBER_ROLES = [
  "student",
  "instructor",
  "institution_staff",
  "institution_moderator",
  "department_manager",
  "institution_admin"
];
const INSTITUTION_ADMIN_ROLES = ["institution_owner", "owner", "institution_admin"];
const INSTITUTION_LEADERSHIP_ROLES = [
  "institution_owner", "owner", "institution_admin",
  "institution_moderator", "department_manager", "institution_staff"
];

async function requireInstitutionPeopleManager(request, institutionIdInput = "") {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in to manage institution members.");
  const userSnap = await db.doc("users/" + uid).get();
  const profile = userSnap.exists ? userSnap.data() : {};
  const institutionId = safeText(institutionIdInput || profile.institutionId);
  if (!institutionId || institutionId.length > 128) {
    throw new HttpsError("invalid-argument", "Choose a valid institution workspace.");
  }
  const [institutionSnap, membershipSnap] = await Promise.all([
    db.doc("institutions/" + institutionId).get(),
    db.doc("institutions/" + institutionId + "/members/" + uid).get()
  ]);
  if (!institutionSnap.exists || institutionSnap.data().status !== "active") {
    throw new HttpsError("failed-precondition", "The institution workspace is not active.");
  }
  const membership = membershipSnap.exists ? membershipSnap.data() : {};
  const canonical = membershipSnap.exists
    && membership.uid === uid
    && membership.institutionId === institutionId
    && membership.status === "active"
    && membership.verified === true;
  const legacy = profile.institutionId === institutionId
    && profile.status === "active" && profile.active === true && profile.verified === true
    && ["institution", "institution_owner", "institution_admin"].includes(safeText(profile.role));
  const role = canonical ? safeText(membership.role) : legacy ? safeText(profile.institutionRole) : "";
  if ((!canonical && !legacy) || !INSTITUTION_ADMIN_ROLES.includes(role)) {
    throw new HttpsError("permission-denied", "Only the active institution owner or administrator can manage members.");
  }
  return { uid, institutionId, role, institution: institutionSnap.data(), profile };
}

async function refreshInstitutionPeopleUsage(institutionId) {
  const snapshot = await db.collection("institutions").doc(institutionId).collection("members")
    .where("status", "==", "active").get();
  const usage = { instructors: 0, students: 0, adminAccounts: 0 };
  snapshot.forEach(memberDoc => {
    const role = safeText(memberDoc.data().role);
    if (role === "instructor") usage.instructors += 1;
    else if (role === "student") usage.students += 1;
    else if (INSTITUTION_LEADERSHIP_ROLES.includes(role)) usage.adminAccounts += 1;
  });
  await db.doc("institutions/" + institutionId).set({
    usage: {
      instructors: usage.instructors,
      students: usage.students,
      adminAccounts: usage.adminAccounts
    },
    updatedAt: Timestamp.now()
  }, { merge: true });
  return usage;
}

exports.createInstitutionTeamAccount = onCall(async request => {
  const manager = await requireInstitutionPeopleManager(request, request.data?.institutionId);
  const email = safeText(request.data?.email).toLowerCase();
  const fullName = safeText(request.data?.fullName);
  const role = safeText(request.data?.role).toLowerCase();
  const password = String(request.data?.temporaryPassword || "");

  if (!INSTITUTION_MEMBER_ROLES.includes(role)) {
    throw new HttpsError("invalid-argument", "Choose a supported institution member role.");
  }
  if (role === "institution_admin" && manager.role !== "institution_owner" && manager.role !== "owner") {
    throw new HttpsError("permission-denied", "Only the institution owner can appoint another administrator.");
  }
  if (["institution_moderator", "department_manager"].includes(role)
      && manager.role !== "institution_owner" && manager.role !== "owner") {
    throw new HttpsError("permission-denied", "Only the institution owner can appoint moderators or department managers.");
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || fullName.length < 2 || fullName.length > 100 || password.length < 12) {
    throw new HttpsError("invalid-argument", "Provide a valid email, full name and temporary password of at least 12 characters.");
  }

  const existing = await adminAuth.getUserByEmail(email).catch(error =>
    error.code === "auth/user-not-found" ? null : Promise.reject(error)
  );
  if (existing) {
    throw new HttpsError("already-exists", "This email already has an Academy account. Existing-account invitations will be handled through the member-linking workflow.");
  }

  let created;
  try {
    created = await adminAuth.createUser({
      email, password, displayName: fullName, emailVerified: false, disabled: false
    });
    const now = Timestamp.now();
    const institutionRef = db.doc("institutions/" + manager.institutionId);
    const memberRef = db.doc("institutions/" + manager.institutionId + "/members/" + created.uid);
    const userRef = db.doc("users/" + created.uid);
    const memberQuery = db.collection("institutions").doc(manager.institutionId).collection("members")
      .where("status", "==", "active");

    await db.runTransaction(async transaction => {
      const [institutionSnap, membersSnap, existingProfile] = await Promise.all([
        transaction.get(institutionRef),
        transaction.get(memberQuery),
        transaction.get(userRef)
      ]);
      if (!institutionSnap.exists || institutionSnap.data().status !== "active") {
        throw new HttpsError("failed-precondition", "Institution workspace is not active.");
      }
      if (existingProfile.exists) {
        throw new HttpsError("already-exists", "This Academy identity already has a profile. Use the existing-account invitation workflow.");
      }
      const limits = institutionSnap.data().limits || {};
      const counts = { instructors: 0, students: 0, adminAccounts: 0 };
      membersSnap.forEach(memberDoc => {
        const memberRole = safeText(memberDoc.data().role);
        if (memberRole === "instructor") counts.instructors += 1;
        else if (memberRole === "student") counts.students += 1;
        else if (INSTITUTION_LEADERSHIP_ROLES.includes(memberRole)) counts.adminAccounts += 1;
      });
      const bucket = role === "instructor" ? "instructors"
        : role === "student" ? "students" : "adminAccounts";
      const defaults = { instructors: 20, students: 5000, adminAccounts: 10 };
      const maximum = Number(limits[bucket] ?? defaults[bucket]);
      if (counts[bucket] >= maximum) {
        throw new HttpsError("resource-exhausted", "Institution capacity reached for " + bucket + ".");
      }

      const globalRole = role === "student" ? "student"
        : role === "instructor" ? "instructor" : role;
      transaction.create(userRef, {
        uid: created.uid, email, fullName, name: fullName, displayName: fullName,
        role: globalRole, institutionRole: role, institutionId: manager.institutionId,
        institutionName: manager.institution.institutionName || manager.institution.legalName || "",
        status: "active", active: true, verified: true,
        createdAt: now, createdBy: manager.uid, updatedAt: now
      });
      transaction.create(memberRef, {
        uid: created.uid, institutionId: manager.institutionId, email, fullName,
        memberType: role, role, status: "active", verified: true,
        createdAt: now, createdBy: manager.uid, updatedAt: now,
        provisionedBy: manager.uid
      });
      transaction.update(institutionRef, {
        ["usage." + bucket]: counts[bucket] + 1,
        updatedAt: now
      });
    });

    await db.collection("audit_logs").add({
      action: "institution_member_account_created", actorId: manager.uid,
      targetId: created.uid, targetEmail: email, targetName: fullName,
      institutionId: manager.institutionId, memberRole: role, createdAt: now
    });
    return { success: true, uid: created.uid, role, institutionId: manager.institutionId };
  } catch (error) {
    if (created) await adminAuth.deleteUser(created.uid).catch(() => {});
    if (error instanceof HttpsError) throw error;
    console.error("createInstitutionTeamAccount failed:", error);
    throw new HttpsError("internal", "The institution member account could not be created.");
  }
});

exports.updateInstitutionMember = onCall(async request => {
  const manager = await requireInstitutionPeopleManager(request, request.data?.institutionId);
  const memberUid = safeText(request.data?.memberUid);
  const action = safeText(request.data?.action).toLowerCase();
  const nextRole = safeText(request.data?.role).toLowerCase();
  const nextStatus = safeText(request.data?.status).toLowerCase();
  if (!memberUid || memberUid === manager.uid) {
    throw new HttpsError("invalid-argument", "Choose another member. You cannot change your own institution access here.");
  }
  if (!["change_role", "set_status", "revoke"].includes(action)) {
    throw new HttpsError("invalid-argument", "Unsupported member-management action.");
  }
  const memberRef = db.doc("institutions/" + manager.institutionId + "/members/" + memberUid);
  const now = Timestamp.now();
  let previous = {};
  let changes = {};

  await db.runTransaction(async transaction => {
    const activeMembersQuery = db.collection("institutions").doc(manager.institutionId)
      .collection("members").where("status", "==", "active");
    const [memberSnap, institutionSnap, activeMembersSnap] = await Promise.all([
      transaction.get(memberRef),
      transaction.get(db.doc("institutions/" + manager.institutionId)),
      transaction.get(activeMembersQuery)
    ]);
    if (!memberSnap.exists) throw new HttpsError("not-found", "Institution member not found.");
    if (!institutionSnap.exists || institutionSnap.data().status !== "active") {
      throw new HttpsError("failed-precondition", "Institution workspace is not active.");
    }
    previous = memberSnap.data();
    const currentRole = safeText(previous.role);
    if (["institution_owner", "owner"].includes(currentRole)) {
      throw new HttpsError("permission-denied", "The institution owner cannot be changed from the member directory.");
    }
    if (manager.role !== "institution_owner" && manager.role !== "owner"
        && INSTITUTION_ADMIN_ROLES.includes(currentRole)) {
      throw new HttpsError("permission-denied", "Only the institution owner can manage another administrator.");
    }

    if (action === "change_role") {
      if (!INSTITUTION_MEMBER_ROLES.includes(nextRole) || nextRole === "institution_owner") {
        throw new HttpsError("invalid-argument", "Choose a valid non-owner institution role.");
      }
      if (["institution_admin", "institution_moderator", "department_manager"].includes(nextRole)
          && manager.role !== "institution_owner" && manager.role !== "owner") {
        throw new HttpsError("permission-denied", "Only the institution owner can assign leadership roles.");
      }
      changes = { role: nextRole, memberType: nextRole, updatedAt: now, updatedBy: manager.uid };
    } else {
      const status = action === "revoke" ? "revoked" : nextStatus;
      if (!["active", "suspended", "revoked"].includes(status)) {
        throw new HttpsError("invalid-argument", "Choose active, suspended or revoked.");
      }
      changes = {
        status, verified: status === "active" ? true : previous.verified === true,
        updatedAt: now, updatedBy: manager.uid,
        ...(status === "revoked" ? { revokedAt: now, revokedBy: manager.uid } : {})
      };
    }

    const bucketForRole = value => value === "student" ? "students"
      : value === "instructor" ? "instructors"
      : INSTITUTION_LEADERSHIP_ROLES.includes(value) ? "adminAccounts" : null;
    const oldBucket = bucketForRole(currentRole);
    const targetRole = action === "change_role" ? nextRole : currentRole;
    const newBucket = bucketForRole(targetRole);
    const targetStatus = action === "revoke" ? "revoked"
      : action === "set_status" ? nextStatus : safeText(previous.status);
    const counts = { students: 0, instructors: 0, adminAccounts: 0 };
    activeMembersSnap.forEach(item => {
      const bucket = bucketForRole(safeText(item.data().role));
      if (bucket) counts[bucket] += 1;
    });
    const limits = institutionSnap.data().limits || {};
    const defaults = { students: 5000, instructors: 20, adminAccounts: 10 };
    if (targetStatus === "active" && newBucket
        && (previous.status !== "active" || oldBucket !== newBucket)) {
      const effectiveCount = counts[newBucket] - (previous.status === "active" && oldBucket === newBucket ? 1 : 0);
      if (effectiveCount >= Number(limits[newBucket] ?? defaults[newBucket])) {
        throw new HttpsError("resource-exhausted", "Institution capacity reached for " + newBucket + ".");
      }
    }
    transaction.update(memberRef, changes);
  });

  const userRef = db.doc("users/" + memberUid);
  if (action === "change_role") {
    const profileSnap = await userRef.get();
    if (profileSnap.exists) {
      const globalRole = nextRole === "student" ? "student"
        : nextRole === "instructor" ? "instructor" : nextRole;
      await userRef.set({
        role: globalRole, institutionRole: nextRole,
        institutionId: manager.institutionId, updatedAt: now
      }, { merge: true });
    }
  }
  const usage = await refreshInstitutionPeopleUsage(manager.institutionId);
  await db.collection("audit_logs").add({
    action: "institution_member_" + action,
    actorId: manager.uid, targetId: memberUid,
    institutionId: manager.institutionId,
    previousRole: safeText(previous.role),
    nextRole: action === "change_role" ? nextRole : safeText(previous.role),
    previousStatus: safeText(previous.status),
    nextStatus: action === "revoke" ? "revoked" : action === "set_status" ? nextStatus : safeText(previous.status),
    createdAt: now
  });
  return { success: true, memberUid, changes, usage };
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
