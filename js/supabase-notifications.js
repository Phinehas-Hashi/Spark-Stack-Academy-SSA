import { auth } from "./firebase.js";

const API_URL = "https://nlnwllpisbqgbeluhdbr.supabase.co/functions/v1/notification-api";

async function request(action, payload = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");

  const token = await user.getIdToken();
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ action, ...payload })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Notification request failed.");
  return data;
}

export const notificationApi = {
  list: (courseIds = [], limit = 50) =>
    request("list", { course_ids: courseIds, limit }),

  markRead: (notificationId) =>
    request("mark_read", { notification_id: notificationId }),

  markAllRead: () =>
    request("mark_all_read"),

  preferences: (preferences) =>
    request("preferences", { preferences }),

  createReport: (report) =>
    request("create_report", report),

  listReports: () =>
    request("report_list"),

  getReportThread: (reportId) =>
    request("report_thread", { report_id: reportId }),

  sendReportMessage: (reportId, message) =>
    request("report_message", { report_id: reportId, message }),

  submitEvent: (event) =>
    request("submit_event", event)
};

export default notificationApi;
