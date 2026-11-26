import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export function installSecurityTelemetry(auth) {
  const base = String(window.SSA_SECURITY_API_BASE || "").replace(/\/$/, "");
  async function report(event, metadata = {}) {
    if (!base) return false;
    try {
      const user = auth.currentUser;
      const token = user ? await user.getIdToken() : "";
      const response = await fetch(`${base}/v1/events`, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        keepalive: true,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          event,
          portal: metadata.portal || detectPortal(),
          path: location.pathname,
          code: metadata.code || "",
          note: metadata.note || ""
        })
      });
      return response.ok;
    } catch {
      // Telemetry must never block authentication or portal workflows.
      return false;
    }
  }
  window.ssaSecuritySignal = report;
  onAuthStateChanged(auth, user => {
    if (!user) return;
    const portal = detectPortal();
    const key = `ssa_security_session_reported_${portal}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    report("portal_session_start", { portal });
  });
}
function detectPortal() {
  const path = location.pathname.toLowerCase();
  if (path.includes("/founder/")) return "founder";
  if (path.includes("/instructor/")) return "instructor";
  if (path.includes("/student/")) return "student";
  if (path.includes("/admin/")) return "admin";
  if (path.includes("/institution/")) return "institution";
  return "login";
}