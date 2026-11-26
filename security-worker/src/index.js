import { createRemoteJWKSet, jwtVerify } from "jose";

const EVENT_TYPES = new Set([
  "login_failed", "mfa_failed", "portal_session_start",
  "portal_access_denied", "suspicious_action", "account_lockout", "founder_control_changed", "founder_action"
]);
const PORTALS = new Set(["login", "student", "instructor", "admin", "institution", "founder"]);
const SEVERITY = {
  login_failed: "low",
  mfa_failed: "high",
  portal_session_start: "info",
  portal_access_denied: "medium",
  suspicious_action: "high",
  account_lockout: "high",
  founder_control_changed: "medium",
  founder_action: "info",
};
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "Authorization,Content-Type",
      "vary": "Origin",
    },
  });
}
function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : "";
}
async function verifyFirebaseToken(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
    audience: env.FIREBASE_PROJECT_ID,
    algorithms: ["RS256"],
  });
  if (!payload.sub || !payload.user_id) throw new Error("Invalid Firebase identity token.");
  return { uid: payload.sub, email: typeof payload.email === "string" ? payload.email : "", secondFactor: payload.firebase?.sign_in_second_factor || "" };
}
async function isFounder(identity, env) {
  if (!identity || identity.secondFactor !== "totp") return false;
  const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/founder/${encodeURIComponent(identity.uid)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${identity.token}` } });
  if (!response.ok) return false;
  const document = await response.json();
  const fields = document.fields || {};
  const value = key => fields[key]?.stringValue ?? fields[key]?.booleanValue ?? null;
  return value("role") === "founder"
    && value("status") === "active"
    && value("active") !== false
    && value("verified") !== false;
}
async function authenticate(request, env) {
  const identity = await verifyFirebaseToken(request, env);
  if (!identity) return null;
  const header = request.headers.get("Authorization") || "";
  identity.token = header.slice(7);
  return identity;
}
async function insertEvent(db, event) {
  await db.prepare(`INSERT INTO security_events
    (id, occurred_at, event_type, severity, source, portal, actor_uid, actor_email,
     ip_address, country, region, city, user_agent, request_path, detail)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(), new Date().toISOString(), event.eventType, event.severity,
      event.source, event.portal, event.actorUid, event.actorEmail, event.ip,
      event.country, event.region, event.city, event.userAgent, event.path,
      JSON.stringify(event.detail || {})
    ).run();
}
async function handleEvent(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const recent = await env.DB.prepare(
    "SELECT COUNT(*) AS total FROM security_events WHERE ip_address = ? AND occurred_at >= ?"
  ).bind(ip, windowStart).first();
  if ((recent?.total || 0) >= 30) {
    await insertEvent(env.DB, {
      eventType: "edge_rate_limit", severity: "high", source: "edge_observed",
      portal: "login", actorUid: null, actorEmail: null, ip,
      country: request.cf?.country || null, region: request.cf?.region || null,
      city: request.cf?.city || null, userAgent: request.headers.get("User-Agent") || "",
      path: new URL(request.url).pathname, detail: { threshold: 30, windowSeconds: 60 },
    });
    return json({ error: "Rate limit exceeded." }, 429, allowedOrigin(request, env));
  }

  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > 8192) return json({ error: "Request too large." }, 413, allowedOrigin(request, env));
  let body;
  try {
    const rawBody = await request.text();
    if (rawBody.length > 8192) return json({ error: "Request too large." }, 413, allowedOrigin(request, env));
    body = JSON.parse(rawBody);
  } catch { return json({ error: "Invalid JSON." }, 400, allowedOrigin(request, env)); }
  const eventType = String(body.event || "");
  const portal = String(body.portal || "login");
  if (!EVENT_TYPES.has(eventType) || !PORTALS.has(portal)) {
    return json({ error: "Unsupported event type or portal." }, 400, allowedOrigin(request, env));
  }
  let identity = null;
  try { identity = await authenticate(request, env); }
  catch { return json({ error: "Invalid identity token." }, 401, allowedOrigin(request, env)); }
  if (!identity && !["login_failed", "mfa_failed"].includes(eventType)) {
    return json({ error: "Authentication required for this event." }, 401, allowedOrigin(request, env));
  }
  if (["founder_control_changed", "founder_action"].includes(eventType) && (portal !== "founder" || !(await isFounder(identity, env)))) {
    return json({ error: "Verified Founder identity required for this event." }, 403, allowedOrigin(request, env));
  }

  await insertEvent(env.DB, {
    eventType, severity: SEVERITY[eventType] || "medium",
    source: "client_reported", portal,
    actorUid: identity?.uid || null, actorEmail: identity?.email || null,
    ip, country: request.cf?.country || null, region: request.cf?.region || null,
    city: request.cf?.city || null, userAgent: request.headers.get("User-Agent") || "",
    path: String(body.path || "").slice(0, 300),
    detail: { code: String(body.code || "").slice(0, 80), note: String(body.note || "").slice(0, 300) },
  });
  return json({ accepted: true }, 202, allowedOrigin(request, env));
}
async function handleIncidents(request, env) {
  let identity;
  try { identity = await authenticate(request, env); }
  catch { return json({ error: "Invalid identity token." }, 401, allowedOrigin(request, env)); }
  if (!identity || !(await isFounder(identity, env))) return json({ error: "Founder access required." }, 403, allowedOrigin(request, env));
  const rows = await env.DB.prepare(
    "SELECT id, occurred_at, event_type, severity, source, portal, actor_uid, actor_email, ip_address, country, region, city, user_agent, request_path, detail FROM security_events ORDER BY occurred_at DESC LIMIT 150"
  ).all();
  return json({ events: rows.results || [] }, 200, allowedOrigin(request, env));
}
export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "Authorization,Content-Type",
        "access-control-max-age": "86400",
        "vary": "Origin",
      }});
    }
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") return json({ status: "ok", service: "ssa-security-edge" });
    if (url.pathname === "/v1/events" && request.method === "POST") {
      if (!origin) return json({ error: "Origin not allowed." }, 403, "null");
      return handleEvent(request, env);
    }
    if (url.pathname === "/v1/incidents" && request.method === "GET") {
      if (!origin) return json({ error: "Origin not allowed." }, 403, "null");
      return handleIncidents(request, env);
    }
    return json({ error: "Not found." }, 404, origin || "null");
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(env.DB.prepare("DELETE FROM security_events WHERE occurred_at < ?")
      .bind(new Date(Date.now() - 30 * 86400_000).toISOString()).run());
  },
};