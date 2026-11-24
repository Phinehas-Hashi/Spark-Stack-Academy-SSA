import { auth, db } from "./firebase.js";
import {
  addDoc, collection, doc, getDoc, onSnapshot, orderBy, query,
  serverTimestamp, updateDoc, where, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const prefix = "SSA-TKT";
const makeTicketNumber = () =>
  `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

export async function submitReport({
  title, description, category = "general", type = "support",
  priority = "medium", reportedUserId = null, courseId = null, metadata = {}
}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in before submitting a support ticket.");
  const cleanTitle = String(title || "").trim();
  const cleanDescription = String(description || "").trim();
  if (cleanTitle.length < 4 || cleanTitle.length > 120) throw new Error("The subject must be between 4 and 120 characters.");
  if (cleanDescription.length < 10 || cleanDescription.length > 5000) throw new Error("Please provide a description between 10 and 5,000 characters.");

  let reporterRole = "unknown";
  let reporterName = user.displayName || "";
  try {
    const profile = await getDoc(doc(db, "users", user.uid));
    if (profile.exists()) {
      reporterRole = profile.data().role || reporterRole;
      reporterName = profile.data().name || profile.data().fullName || reporterName;
    }
  } catch (error) {
    console.warn("Support profile details unavailable:", error);
  }

  const ticketNumber = makeTicketNumber();
  const ref = await addDoc(collection(db, "reports"), {
    reportId: ticketNumber,
    ticketNumber,
    title: cleanTitle,
    description: cleanDescription,
    category,
    type,
    priority: ["low", "medium", "high", "critical"].includes(priority) ? priority : "medium",
    status: "pending",
    reporterId: user.uid,
    reporterName: reporterName || "Student",
    reporterEmail: user.email || "",
    reporterRole,
    reportedUserId,
    courseId,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    founderVisible: true,
    adminVisible: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return { id: ref.id, reportId: ticketNumber, ticketNumber };
}

export function subscribeToMyReports(uid, callback, onError = () => {}) {
  if (!uid) return () => {};
  const reportsQuery = query(collection(db, "reports"), where("reporterId", "==", uid));
  return onSnapshot(reportsQuery, snapshot => {
    const items = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    items.sort((a, b) => (b.updatedAt?.seconds || b.createdAt?.seconds || 0) - (a.updatedAt?.seconds || a.createdAt?.seconds || 0));
    callback(items);
  }, onError);
}

export function subscribeToReportMessages(reportDocId, callback, onError = () => {}) {
  if (!reportDocId) return () => {};
  const messagesQuery = query(
    collection(db, "reports", reportDocId, "responses"),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(messagesQuery, snapshot => {
    callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}

export async function sendReportMessage({ reportDocId, body }) {
  const user = auth.currentUser;
  const message = String(body || "").trim();
  if (!user) throw new Error("Please sign in again.");
  if (!reportDocId) throw new Error("Ticket reference is missing.");
  if (message.length < 2 || message.length > 5000) throw new Error("Your reply must be between 2 and 5,000 characters.");

  const reportRef = doc(db, "reports", reportDocId);
  const reportSnap = await getDoc(reportRef);
  if (!reportSnap.exists()) throw new Error("This ticket could not be found.");
  const report = reportSnap.data();

  let senderRole = "student";
  let senderName = user.displayName || user.email || "Student";
  try {
    const profile = await getDoc(doc(db, "users", user.uid));
    if (profile.exists()) {
      senderRole = profile.data().role || senderRole;
      senderName = profile.data().name || profile.data().fullName || senderName;
    }
  } catch {}

  const batch = writeBatch(db);
  const messageRef = doc(collection(db, "reports", reportDocId, "responses"));
  batch.set(messageRef, {
    senderId: user.uid,
    senderRole,
    senderName,
    message,
    createdAt: serverTimestamp()
  });

  const isReporter = report.reporterId === user.uid;
  const isStaffSender = ["admin", "founder"].includes(String(senderRole).toLowerCase());
  if (isReporter && ["resolved", "dismissed", "closed"].includes(report.status)) {
    batch.update(reportRef, {
      status: "pending",
      studentStatusUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } else if (isStaffSender) {
    batch.update(reportRef, { updatedAt: serverTimestamp() });
  }
  await batch.commit();
  return messageRef.id;
}

export async function reviewReport({ reportDocId, status, moderatorNotes = "" }) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in.");
  if (!reportDocId) throw new Error("Ticket reference is missing.");
  const allowed = ["pending", "reviewing", "resolved", "dismissed", "closed", "reopened"];
  const nextStatus = allowed.includes(status) ? status : "reviewing";
  await updateDoc(doc(db, "reports", reportDocId), {
    status: nextStatus,
    moderatorNotes: String(moderatorNotes || "").trim().slice(0, 5000),
    reviewedBy: user.uid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}
