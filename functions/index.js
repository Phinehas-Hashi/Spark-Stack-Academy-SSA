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

      transaction.create(institutionRef, {
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
        createdAt: now,
        updatedAt: now
      });

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
