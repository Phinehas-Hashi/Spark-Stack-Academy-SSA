const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();
const adminAuth = getAuth();
const platformRef = db.doc("systemConfig/platform");

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
      await platformRef.update({ "maintenance.active": false, updatedAt: Timestamp.now() });
      await db.collection("systemCommandLog").add({ command: "Scheduled maintenance ended", details: { target: maintenance.target }, actor: "system", createdAt: Timestamp.now() });
    }
    return;
  }
  if (maintenance.active === true) return;
  const updates = { "maintenance.active": true, updatedAt: Timestamp.now() };
  if (maintenance.target === "student" || maintenance.target === "all") updates["studentPortal.enabled"] = false;
  if (maintenance.target === "instructor" || maintenance.target === "all") updates["instructorPortal.enabled"] = false;
  await platformRef.update(updates);
  await db.collection("systemCommandLog").add({ command: "Scheduled maintenance activated", details: { target: maintenance.target, message: maintenance.message || "" }, actor: "system", createdAt: Timestamp.now() });
});
