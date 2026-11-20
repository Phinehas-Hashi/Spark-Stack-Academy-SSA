const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const adminAuth = getAuth();
const platformRef = db.doc("platform_controls/global");

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
  if (!data || data.role !== "founder" || data.status !== "active") {
    throw new HttpsError("permission-denied", "Only an active founder can create administrator accounts.");
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

exports.approveInstitutionApplication = onCall(async request => {
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
  const trialDays = Number.isInteger(institutionPricing.trialDays) ? institutionPricing.trialDays : 14;
  const trialEndsAt = Timestamp.fromMillis(now.toMillis() + trialDays * 24 * 60 * 60 * 1000);

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
        status: "active",
        active: true,
        verified: true,
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
        status: "active",
        verificationStatus: "verified",
        limits: { instructors: 20, courses: 100, students: 5000, adminAccounts: 10 },
        usage: { instructors: 0, courses: 0, students: 0, adminAccounts: 1 },
        subscription: {
          plan: "trial",
          status: "trialing",
          trialStartedAt: now,
          trialEndsAt,
          trialDays
        },
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
        status: "approved",
        reviewedAt: now,
        reviewedBy: reviewer.uid,
        reviewerRole: reviewer.role,
        institutionId: applicationId,
        trialStartedAt: now,
        trialEndsAt
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

    return { success: true, institutionId: applicationId, trialDays, trialEndsAt: trialEndsAt.toDate().toISOString() };
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
  if (!email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || fullName.length < 2 || password.length < 12) {
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
    if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) {
      throw new HttpsError("invalid-argument", `${field} must be a whole amount between 0 and 1,000,000,000.`);
    }
  }
  const feePercent = Number(input.transactionFeePercent);
  const trialDays = Number(input.trialDays);
  if (!Number.isFinite(feePercent) || feePercent < 0 || feePercent > 20) throw new HttpsError("invalid-argument", "Transaction fee must be between 0 and 20 percent.");
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 90) throw new HttpsError("invalid-argument", "Trial duration must be between 0 and 90 days.");
  if (!["before_activation", "after_approval"].includes(input.onboardingTiming)) throw new HttpsError("invalid-argument", "Choose a valid onboarding fee collection timing.");
  if (input.onboardingFeeEnabled === true && Number(input.onboardingFeeAmount) <= 0) throw new HttpsError("failed-precondition", "Enter an onboarding fee greater than zero or disable the fee.");
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
  await institutionPricingRef.set({ ...pricing, updatedAt: now, updatedBy: actor.uid, updatedByRole: actor.role }, { merge: true });
  await db.collection("audit_logs").add({
    action: "institution_pricing_updated",
    actorId: actor.uid,
    actorRole: actor.role,
    actorEmail: actor.email,
    changes: pricing,
    createdAt: now
  });
  return { success: true, pricing };
});
