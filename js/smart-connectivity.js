// Spark Stack Academy — Smart Connectivity Monitor
// Phase 1: connection awareness only. No downloads, offline storage or write queue.
(() => {
  if (window.__SSA_SMART_CONNECTIVITY__) return;
  window.__SSA_SMART_CONNECTIVITY__ = true;

  const style = document.createElement("style");
  style.textContent = `
    #ssa-connectivity-status{position:fixed;top:12px;right:12px;z-index:2147482500;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 24px);padding:8px 12px;border:1px solid rgba(148,163,184,.28);border-radius:999px;background:rgba(255,255,255,.96);box-shadow:0 5px 20px rgba(15,23,42,.12);color:#0f172a;font:600 12px/1.2 system-ui,-apple-system,sans-serif;backdrop-filter:blur(12px)}
    #ssa-connectivity-status .ssa-net-dot{width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:#16a34a}
    #ssa-connectivity-status[data-state="checking"] .ssa-net-dot,#ssa-connectivity-status[data-state="reconnecting"] .ssa-net-dot{background:#d97706}
    #ssa-connectivity-status[data-state="weak"] .ssa-net-dot{background:#d97706}
    #ssa-connectivity-status[data-state="offline"] .ssa-net-dot{background:#dc2626}
    #ssa-connectivity-status[data-state="sync-error"] .ssa-net-dot{background:#dc2626}
    #ssa-connectivity-status .ssa-net-detail{font-weight:500;color:#64748b}
    #ssa-connectivity-notice{position:fixed;top:54px;left:50%;transform:translateX(-50%);z-index:2147482499;width:min(560px,calc(100vw - 24px));padding:11px 14px;border:1px solid #f3d18a;border-radius:12px;background:#fffbeb;color:#854d0e;box-shadow:0 8px 24px rgba(15,23,42,.12);font:500 12px/1.5 system-ui,-apple-system,sans-serif;text-align:center}
    #ssa-connectivity-notice[hidden]{display:none}
    @media(max-width:600px){#ssa-connectivity-status{top:8px;right:8px;padding:7px 10px;font-size:11px}#ssa-connectivity-notice{top:48px}}
    @media(prefers-reduced-motion:no-preference){#ssa-connectivity-status .ssa-net-dot{transition:background .2s ease}}
  `;
  (document.head || document.documentElement).appendChild(style);

  const status = document.createElement("div");
  status.id = "ssa-connectivity-status";
  status.dataset.state = "checking";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.innerHTML = '<span class="ssa-net-dot" aria-hidden="true"></span><span class="ssa-net-label">Checking connection</span><span class="ssa-net-detail"></span>';

  const notice = document.createElement("div");
  notice.id = "ssa-connectivity-notice";
  notice.hidden = true;
  notice.setAttribute("role", "alert");
  notice.textContent = "You are offline. Course lessons, quizzes, assignments, payments and account changes require an internet connection. Offline lesson downloads are not enabled yet.";

  const mount = () => {
    if (!status.isConnected) document.body.appendChild(status);
    if (!notice.isConnected) document.body.appendChild(notice);
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });

  let state = "checking";
  let lastProbeAt = 0;
  let probeInFlight = false;
  let intervalId = null;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  function setState(next, detail = "") {
    state = next;
    status.dataset.state = next;
    const label = status.querySelector(".ssa-net-label");
    const extra = status.querySelector(".ssa-net-detail");
    const labels = {
      checking: "Checking connection",
      online: "Online",
      weak: "Weak connection",
      offline: "Offline",
      reconnecting: "Reconnecting"
    };
    if (label) label.textContent = labels[next] || "Connection status";
    if (extra) extra.textContent = detail ? "· " + detail : "";
    notice.hidden = next !== "offline";
    window.dispatchEvent(new CustomEvent("ssa:connectivity-change", {
      detail: { state: next, online: next === "online" || next === "weak", checkedAt: Date.now() }
    }));
  }

  function classifyNetwork(elapsed) {
    const type = String(connection?.effectiveType || "").toLowerCase();
    const rtt = Number(connection?.rtt || 0);
    const saveData = connection?.saveData === true;
    if (saveData || type === "slow-2g" || type === "2g" || elapsed >= 1800 || rtt >= 1200) {
      return { state: "weak", detail: saveData ? "Data saver" : (type.toUpperCase() || "Slow response") };
    }
    return { state: "online", detail: type ? type.toUpperCase() : "" };
  }

  async function checkConnection(force = false) {
    if (probeInFlight) return;
    const now = Date.now();
    if (!force && now - lastProbeAt < 12000) return;
    lastProbeAt = now;

    if (!navigator.onLine) {
      setState("offline");
      return;
    }

    probeInFlight = true;
    if (state === "offline") setState("reconnecting");
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5500);

    try {
      // A tiny no-cors request tests actual reachability without reading remote data.
      await fetch("https://www.gstatic.com/generate_204?ssa_ping=" + Date.now(), {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal
      });
      const elapsed = performance.now() - started;
      const result = classifyNetwork(elapsed);
      setState(result.state, result.detail);
    } catch (error) {
      setState("offline");
    } finally {
      clearTimeout(timeout);
      probeInFlight = false;
    }
  }

  window.addEventListener("online", () => {
    setState("reconnecting");
    checkConnection(true);
  });
  window.addEventListener("offline", () => setState("offline"));
  window.addEventListener("focus", () => checkConnection());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkConnection();
  });
  connection?.addEventListener?.("change", () => checkConnection(true));

  // Recheck periodically only while the tab is visible; no background polling.
  intervalId = setInterval(() => {
    if (!document.hidden) checkConnection(true);
  }, 60000);

  window.SSASmartConnectivity = Object.freeze({
    getState: () => state,
    isOnline: () => state === "online" || state === "weak",
    check: () => checkConnection(true)
  });

  checkConnection(true);
})();
