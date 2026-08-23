import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "https://esm.sh/jose@6";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIREBASE_PROJECT_ID = "spark-stack-academy";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_KEYS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" }
  });

async function authenticate(req: Request) {
  const header = req.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) throw new Error("Authentication required.");

  const { payload } = await jwtVerify(header.slice(7), FIREBASE_KEYS, {
    issuer: FIREBASE_ISSUER,
    audience: FIREBASE_PROJECT_ID
  });

  const uid = String(payload.sub || "");
  if (!uid) throw new Error("Invalid authentication token.");

  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, firebase_uid, role, status, email, full_name")
    .eq("firebase_uid", uid)
    .maybeSingle();

  if (error) throw error;
  if (!profile || profile.status === "suspended") throw new Error("Active profile required.");

  return { uid, profile };
}

function isLeadership(role: string) {
  return role === "admin" || role === "founder";
}

function isStaff(role: string) {
  return ["admin", "founder", "instructor"].includes(role);
}

function cleanIds(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.map(v => String(v || "").trim()).filter(Boolean))]
    : [];
}

async function listNotifications(uid: string, role: string, courseIds: string[], limit = 50) {
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const results: any[] = [];

  const { data: userRows, error: userError } = await admin
    .from("notifications")
    .select("*")
    .eq("recipient_firebase_uid", uid)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (userError) throw userError;
  results.push(...(userRows || []));

  const { data: roleRows, error: roleError } = await admin
    .from("notifications")
    .select("*")
    .eq("audience", "role")
    .eq("recipient_role", role)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (roleError) throw roleError;
  results.push(...(roleRows || []));

  const { data: globalRows, error: globalError } = await admin
    .from("notifications")
    .select("*")
    .eq("audience", "all")
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (globalError) throw globalError;
  results.push(...(globalRows || []));

  for (const courseId of courseIds.slice(0, 25)) {
    const { data: courseRows, error } = await admin
      .from("notifications")
      .select("*")
      .eq("audience", "course")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false })
      .limit(safeLimit);
    if (error) throw error;
    results.push(...(courseRows || []));
  }

  const unique = new Map<string, any>();
  for (const row of results) unique.set(row.id, row);
  return [...unique.values()]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, safeLimit);
}

async function createNotifications(body: any, actor: { uid: string; role: string }) {
  if (!isStaff(actor.role)) throw new Error("Staff access required for system events.");

  const title = String(body.title || "").trim();
  const message = String(body.message || "").trim();
  if (!title || !message) throw new Error("Notification title and message are required.");

  const recipients = cleanIds(body.recipient_ids);
  const rows: any[] = [];

  for (const uid of recipients) {
    rows.push({
      recipient_firebase_uid: uid,
      audience: "user",
      type: String(body.type || "general"),
      title,
      message,
      priority: String(body.priority || "normal"),
      action_url: body.action_url ? String(body.action_url) : null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      dedupe_key: body.dedupe_key ? `${body.dedupe_key}:${uid}` : null
    });
  }

  const role = body.recipient_role ? String(body.recipient_role) : null;
  if (role) {
    rows.push({
      audience: "role",
      recipient_role: role,
      type: String(body.type || "general"),
      title,
      message,
      priority: String(body.priority || "normal"),
      action_url: body.action_url ? String(body.action_url) : null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      dedupe_key: body.dedupe_key ? `${body.dedupe_key}:role:${role}` : null
    });
  }

  if (body.course_id) {
    rows.push({
      audience: "course",
      course_id: String(body.course_id),
      type: String(body.type || "course"),
      title,
      message,
      priority: String(body.priority || "normal"),
      action_url: body.action_url ? String(body.action_url) : null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      dedupe_key: body.dedupe_key ? `${body.dedupe_key}:course:${body.course_id}` : null
    });
  }

  if (body.audience === "all") {
    rows.push({
      audience: "all",
      type: String(body.type || "announcement"),
      title,
      message,
      priority: String(body.priority || "normal"),
      action_url: body.action_url ? String(body.action_url) : null,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
      dedupe_key: body.dedupe_key ? `${body.dedupe_key}:all` : null
    });
  }

  if (!rows.length) throw new Error("No notification audience was supplied.");

  const { data, error } = await admin
    .from("notifications")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true })
    .select("id, audience, recipient_firebase_uid, recipient_role, course_id");
  if (error) throw error;

  return data || [];
}

async function createReport(body: any, actor: { uid: string; role: string }) {
  const title = String(body.title || "").trim();
  const description = String(body.description || "").trim();
  if (!title || !description) throw new Error("Report title and description are required.");

  const code = `SSA-RPT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const { data, error } = await admin
    .from("reports")
    .insert({
      report_code: code,
      reporter_firebase_uid: actor.uid,
      reporter_role: actor.role,
      category: String(body.category || "general"),
      priority: String(body.priority || "medium"),
      title,
      description
    })
    .select("*")
    .single();
  if (error) throw error;

  await admin.from("notifications").insert([
    {
      audience: "role",
      recipient_role: "admin",
      type: "new_report",
      title: "New report received",
      message: `${actor.role} submitted ${code}: ${title}`,
      priority: data.priority === "critical" ? "critical" : "high",
      action_url: `/admin/reports.html?id=${data.id}`,
      metadata: { report_id: data.id, report_code: code }
    },
    {
      audience: "role",
      recipient_role: "founder",
      type: "new_report",
      title: "New report received",
      message: `${actor.role} submitted ${code}: ${title}`,
      priority: data.priority === "critical" ? "critical" : "high",
      action_url: `/founder/reports.html?id=${data.id}`,
      metadata: { report_id: data.id, report_code: code }
    }
  ]);

  return data;
}

async function reportMessage(body: any, actor: { uid: string; role: string }) {
  const reportId = String(body.report_id || "").trim();
  const message = String(body.message || "").trim();
  if (!reportId || !message) throw new Error("report_id and message are required.");

  const { data: report, error: reportError } = await admin
    .from("reports")
    .select("id, report_code, reporter_firebase_uid, title")
    .eq("id", reportId)
    .maybeSingle();
  if (reportError) throw reportError;
  if (!report) throw new Error("Report not found.");

  if (actor.uid !== report.reporter_firebase_uid && !isLeadership(actor.role)) {
    throw new Error("You cannot access this report.");
  }

  const { data, error } = await admin
    .from("report_messages")
    .insert({
      report_id: reportId,
      sender_firebase_uid: actor.uid,
      sender_role: actor.role,
      message
    })
    .select("*")
    .single();
  if (error) throw error;

  const recipient = actor.uid === report.reporter_firebase_uid
    ? report.reporter_firebase_uid
    : report.reporter_firebase_uid;

  if (recipient !== actor.uid) {
    await admin.from("notifications").insert({
      recipient_firebase_uid: recipient,
      audience: "user",
      type: "report_feedback",
      title: "Report update",
      message: `There is a new update on ${report.report_code}.`,
      priority: "high",
      action_url: `/student/report.html?id=${report.id}`,
      metadata: { report_id: report.id, report_code: report.report_code }
    });
  }

  return data;
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "POST") return json({ error: "POST request required." }, 405);
    const actor = await authenticate(req);
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "list") {
      const courseIds = cleanIds(body.course_ids);
      return json({ notifications: await listNotifications(actor.uid, actor.profile.role, courseIds, body.limit) });
    }

    if (action === "mark_read") {
      const id = String(body.notification_id || "").trim();
      if (!id) throw new Error("notification_id is required.");
      const { error } = await admin
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("recipient_firebase_uid", actor.uid);
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "mark_all_read") {
      const { error } = await admin
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("recipient_firebase_uid", actor.uid)
        .is("read_at", null);
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "preferences") {
      const preferences = body.preferences && typeof body.preferences === "object" ? body.preferences : {};
      const { data, error } = await admin
        .from("notification_preferences")
        .upsert({ firebase_uid: actor.uid, ...preferences }, { onConflict: "firebase_uid" })
        .select("*")
        .single();
      if (error) throw error;
      return json({ preferences: data });
    }

    if (action === "create_report") {
      return json({ report: await createReport(body, { uid: actor.uid, role: actor.profile.role }) });
    }

    if (action === "report_message") {
      return json({ message: await reportMessage(body, { uid: actor.uid, role: actor.profile.role }) });
    }

    if (action === "submit_event") {
      return json({ notifications: await createNotifications(body, { uid: actor.uid, role: actor.profile.role }) });
    }

    if (action === "report_list") {
      const isLeader = isLeadership(actor.profile.role);
      let query = admin.from("reports").select("*").order("created_at", { ascending: false }).limit(100);
      if (!isLeader) query = query.eq("reporter_firebase_uid", actor.uid);
      const { data, error } = await query;
      if (error) throw error;
      return json({ reports: data || [] });
    }

    if (action === "report_thread") {
      const reportId = String(body.report_id || "").trim();
      const { data: report, error: reportError } = await admin.from("reports").select("*").eq("id", reportId).maybeSingle();
      if (reportError) throw reportError;
      if (!report) throw new Error("Report not found.");
      if (report.reporter_firebase_uid !== actor.uid && !isLeadership(actor.profile.role)) throw new Error("You cannot access this report.");
      const { data: messages, error } = await admin.from("report_messages").select("*").eq("report_id", reportId).order("created_at", { ascending: true });
      if (error) throw error;
      return json({ report, messages: messages || [] });
    }

    throw new Error("Unknown action.");
  } catch (error) {
    console.error("SSA notification API error:", error);
    return json({ error: error instanceof Error ? error.message : "Request failed." }, 400);
  }
});
