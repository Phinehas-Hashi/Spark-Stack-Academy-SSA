const { onRequest } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { ObjectId } = require("mongodb");
const { getDb, ensurePaymentIndexes } = require("./mongo");
const { initiateStkPush, normalizePhone } = require("./mpesa");

const auth = getAuth();
const db = getFirestore();
let indexesReady;

function json(res, status, body) {
  res.status(status).set("Content-Type", "application/json").send(body);
}

function cors(req, res) {
  const origin = req.headers.origin;
  const allowed = (process.env.PAYMENT_ALLOWED_ORIGINS || "https://phinehas-hashi.github.io,http://localhost:5000,http://localhost:3000").split(",").map(v => v.trim()).filter(Boolean);
  if (origin && (allowed.length === 0 || allowed.includes(origin))) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
}

async function requireUser(req) {
  const header = String(req.headers.authorization || "");
  if (!header.startsWith("Bearer ")) {
    const error = new Error("Authentication required.");
    error.status = 401;
    throw error;
  }
  return auth.verifyIdToken(header.slice(7));
}

async function prepareDb() {
  if (!indexesReady) {
    indexesReady = getDb().then(ensurePaymentIndexes);
  }
  await indexesReady;
}

async function initiate(req, res) {
  const user = await requireUser(req);
  const { courseId, phoneNumber } = req.body || {};
  if (!courseId || !phoneNumber) return json(res, 400, { success: false, message: "courseId and phoneNumber are required." });

  const courseSnap = await db.collection("courses").doc(String(courseId)).get();
  if (!courseSnap.exists) return json(res, 404, { success: false, message: "Course not found." });

  const course = courseSnap.data() || {};
  const amount = Number(course.price ?? course.amount ?? course.coursePrice ?? 0);
  const isFree = course.isFree === true || amount <= 0;
  if (isFree) return json(res, 400, { success: false, message: "This course does not require payment." });
  if (!Number.isFinite(amount) || amount <= 0) return json(res, 400, { success: false, message: "Course price is not configured." });

  await prepareDb();
  const mongo = await getDb();
  const internalReference = `SSA-${Date.now()}-${user.uid.slice(0, 8)}`;
  const now = new Date();

  const payment = {
    internalReference,
    studentId: user.uid,
    courseId: String(courseId),
    courseName: course.title || course.name || "SSA Course",
    amount,
    currency: "KES",
    provider: "mpesa",
    status: "initiated",
    phoneNumber: normalizePhone(phoneNumber),
    createdAt: now,
    updatedAt: now
  };

  const inserted = await mongo.collection("payments").insertOne(payment);

  try {
    const stk = await initiateStkPush({
      amount,
      phoneNumber,
      accountReference: internalReference,
      transactionDesc: "SSA Course Payment"
    });

    await mongo.collection("payments").updateOne(
      { _id: inserted.insertedId },
      {
        $set: {
          status: "pending",
          merchantRequestId: stk.MerchantRequestID || null,
          checkoutRequestId: stk.CheckoutRequestID || null,
          responseCode: stk.ResponseCode || null,
          responseDescription: stk.ResponseDescription || null,
          updatedAt: new Date()
        }
      }
    );

    return json(res, 200, {
      success: true,
      paymentId: inserted.insertedId.toString(),
      reference: internalReference,
      checkoutRequestId: stk.CheckoutRequestID || null,
      status: "pending"
    });
  } catch (error) {
    await mongo.collection("payments").updateOne(
      { _id: inserted.insertedId },
      { $set: { status: "failed", failureReason: error.message, updatedAt: new Date() } }
    );
    throw error;
  }
}

async function history(req, res) {
  const user = await requireUser(req);
  await prepareDb();
  const mongo = await getDb();
  const payments = await mongo.collection("payments")
    .find({ studentId: user.uid })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  return json(res, 200, {
    success: true,
    payments: payments.map(payment => ({
      id: payment._id.toString(),
      courseId: payment.courseId,
      courseName: payment.courseName,
      amount: payment.amount,
      currency: payment.currency,
      provider: payment.provider,
      status: payment.status,
      receiptNumber: payment.receiptNumber || null,
      reference: payment.internalReference,
      createdAt: payment.createdAt,
      verifiedAt: payment.verifiedAt || null
    }))
  });
}

async function callback(req, res) {
  await prepareDb();
  const mongo = await getDb();
  const body = req.body || {};
  const callback = body.Body?.stkCallback || {};
  const checkoutRequestId = callback.CheckoutRequestID;
  if (!checkoutRequestId) return json(res, 400, { ResultCode: 1, ResultDesc: "Missing CheckoutRequestID" });

  const eventKey = `mpesa:${checkoutRequestId}:${callback.ResultCode}`;
  const existingEvent = await mongo.collection("payment_events").findOne({ eventKey });
  if (existingEvent) return json(res, 200, { ResultCode: 0, ResultDesc: "Accepted" });

  const payment = await mongo.collection("payments").findOne({ checkoutRequestId });
  if (!payment) {
    await mongo.collection("payment_events").insertOne({
      eventKey,
      provider: "mpesa",
      checkoutRequestId,
      type: "orphan_callback",
      payload: body,
      createdAt: new Date()
    });
    return json(res, 200, { ResultCode: 0, ResultDesc: "Accepted" });
  }

  const items = Array.isArray(callback.CallbackMetadata?.Item)
    ? callback.CallbackMetadata.Item
    : [];
  const meta = Object.fromEntries(items.map(item => [item.Name, item.Value]));
  const successful = Number(callback.ResultCode) === 0;

  await mongo.collection("payment_events").insertOne({
    eventKey,
    provider: "mpesa",
    paymentId: payment._id,
    checkoutRequestId,
    type: successful ? "success_callback" : "failure_callback",
    payload: body,
    createdAt: new Date()
  });

  const update = {
    status: successful ? "successful" : "failed",
    resultCode: callback.ResultCode,
    resultDescription: callback.ResultDesc || null,
    receiptNumber: meta.MpesaReceiptNumber || null,
    transactionDate: meta.TransactionDate || null,
    callbackPhone: meta.PhoneNumber || null,
    verifiedAt: successful ? new Date() : null,
    updatedAt: new Date()
  };

  await mongo.collection("payments").updateOne(
    { _id: payment._id, status: { $in: ["initiated", "pending"] } },
    { $set: update }
  );

  if (successful) {
    const fresh = await mongo.collection("payments").findOne({ _id: payment._id });
    if (fresh?.status === "successful") {
      const enrollmentKey = `${fresh.studentId}_${fresh.courseId}`;
      await mongo.collection("enrollments").updateOne(
        { studentId: fresh.studentId, courseId: fresh.courseId },
        {
          $set: {
            studentId: fresh.studentId,
            courseId: fresh.courseId,
            paymentId: fresh._id,
            paymentReference: fresh.internalReference,
            provider: "mpesa",
            paymentStatus: "paid",
            status: "active",
            amountPaid: fresh.amount,
            currency: fresh.currency,
            updatedAt: new Date()
          },
          $setOnInsert: {
            enrollmentKey,
            enrolledAt: new Date(),
            progress: 0,
            completedLessons: []
          }
        },
        { upsert: true }
      );

      await db.collection("payments").doc(fresh._id.toString()).set({
        userId: fresh.studentId,
        studentId: fresh.studentId,
        courseId: fresh.courseId,
        courseName: fresh.courseName,
        amount: fresh.amount,
        currency: fresh.currency,
        provider: "mpesa",
        method: "M-Pesa",
        status: "successful",
        internalReference: fresh.internalReference,
        merchantRequestId: fresh.merchantRequestId || null,
        checkoutRequestId: fresh.checkoutRequestId || null,
        receiptNumber: fresh.receiptNumber || null,
        createdAt: fresh.createdAt ? Timestamp.fromDate(fresh.createdAt) : Timestamp.now(),
        verifiedAt: fresh.verifiedAt ? Timestamp.fromDate(fresh.verifiedAt) : Timestamp.now(),
        updatedAt: Timestamp.now()
      }, { merge: true });

      await db.collection("enrollments").doc(enrollmentKey).set({
        studentId: fresh.studentId,
        userId: fresh.studentId,
        courseId: fresh.courseId,
        paymentId: fresh._id.toString(),
        paymentReference: fresh.internalReference,
        provider: "mpesa",
        paymentStatus: "paid",
        status: "active",
        amountPaid: fresh.amount,
        currency: fresh.currency,
        enrolledAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        progress: 0,
        completedLessons: []
      }, { merge: true });
    }
  }

  return json(res, 200, { ResultCode: 0, ResultDesc: "Accepted" });
}

exports.mpesaPayments = onRequest(
  { region: "africa-south1", timeoutSeconds: 60, memory: "256MiB" },
  async (req, res) => {
    cors(req, res);
    if (req.method === "OPTIONS") return res.status(204).send("");
    try {
      if (req.method === "POST" && req.path.endsWith("/initiate")) return await initiate(req, res);
      if (req.method === "POST" && req.path.endsWith("/callback")) return await callback(req, res);\n      if (req.method === "GET" && req.path.endsWith("/history")) return await history(req, res);
      return json(res, 404, { success: false, message: "Payment endpoint not found." });
    } catch (error) {
      console.error("mpesaPayments:", error);
      const status = error.status || 500;
      return json(res, status, { success: false, message: status === 500 ? "Payment service error." : error.message });
    }
  }
);
