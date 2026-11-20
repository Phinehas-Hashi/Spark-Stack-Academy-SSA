// Spark Stack Academy — Smart Connectivity Monitor + Diagnostics
// Connection awareness only. No downloads, offline storage, caching or write queue.
(() => {
  if (window.__SSA_SMART_CONNECTIVITY__) return;
  window.__SSA_SMART_CONNECTIVITY__ = true;

  const style = document.createElement("style");
  style.textContent = `
    #ssa-connectivity-status{position:fixed;top:12px;right:12px;z-index:2147482500;display:flex;align-items:center;gap:8px;max-width:calc(100vw - 24px);padding:8px 12px;border:1px solid rgba(148,163,184,.28);border-radius:999px;background:rgba(255,255,255,.97);box-shadow:0 5px 20px rgba(15,23,42,.12);color:#0f172a;font:600 12px/1.2 system-ui,-apple-system,sans-serif;backdrop-filter:blur(12px);cursor:pointer}
    #ssa-connectivity-status:focus-visible,#ssa-connectivity-panel button:focus-visible{outline:3px solid #60a5fa;outline-offset:3px}
    #ssa-connectivity-status .ssa-net-dot{width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:#16a34a}
    #ssa-connectivity-status[data-state="checking"] .ssa-net-dot,#ssa-connectivity-status[data-state="reconnecting"] .ssa-net-dot,#ssa-connectivity-status[data-state="weak"] .ssa-net-dot{background:#d97706}
    #ssa-connectivity-status[data-state="offline"] .ssa-net-dot{background:#dc2626}
    #ssa-connectivity-status .ssa-net-detail{font-weight:500;color:#64748b}
    #ssa-connectivity-notice{position:fixed;top:54px;left:50%;transform:translateX(-50%);z-index:2147482499;width:min(560px,calc(100vw - 24px));padding:11px 14px;border:1px solid #f3d18a;border-radius:12px;background:#fffbeb;color:#854d0e;box-shadow:0 8px 24px rgba(15,23,42,.12);font:500 12px/1.5 system-ui,-apple-system,sans-serif;text-align:center}
    #ssa-connectivity-notice[hidden],#ssa-connectivity-panel[hidden]{display:none}
    #ssa-connectivity-panel{position:fixed;top:54px;right:12px;z-index:2147482501;width:min(340px,calc(100vw - 24px));padding:16px;border:1px solid #e2e8f0;border-radius:16px;background:#fff;color:#0f172a;box-shadow:0 16px 44px rgba(15,23,42,.2);font:13px/1.45 system-ui,-apple-system,sans-serif}
    #ssa-connectivity-panel .ssa-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
    #ssa-connectivity-panel h2{margin:0;font-size:15px;font-weight:700}
    #ssa-connectivity-panel .ssa-panel-close{border:0;background:transparent;color:#475569;font-size:22px;line-height:1;cursor:pointer;padding:2px 6px}
    #ssa-connectivity-panel .ssa-panel-state{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:10px;border-radius:10px;background:#f8fafc;font-weight:700}
    #ssa-connectivity-panel .ssa-panel-state[data-state="offline"]{background:#fef2f2;color:#991b1b}
    #ssa-connectivity-panel .ssa-panel-state[data-state="weak"],#ssa-connectivity-panel .ssa-panel-state[data-state="checking"],#ssa-connectivity-panel .ssa-panel-state[data-state="reconnecting"]{background:#fffbeb;color:#92400e}
    #ssa-connectivity-panel dl{display:grid;grid-template-columns:1fr auto;gap:8px 12px;margin:0}
    #ssa-connectivity-panel dt{color:#64748b}
    #ssa-connectivity-panel dd{margin:0;text-align:right;font-weight:600;overflow-wrap:anywhere}
    #ssa-connectivity-panel .ssa-panel-help{margin:12px 0;color:#64748b;font-size:12px}
    #ssa-connectivity-panel .ssa-panel-check{width:100%;border:0;border-radius:10px;padding:10px 12px;background:#1d4ed8;color:#fff;font:600 13px system-ui,sans-serif;cursor:pointer}
    #ssa-connectivity-panel .ssa-panel-check:disabled{opacity:.65;cursor:wait}
    @media(max-width:600px){#ssa-connectivity-status{top:8px;right:8px;padding:7px 10px;font-size:11px}#ssa-connectivity-notice{top:48px}#ssa-connectivity-panel{top:48px;right:8px}}
    @media(prefers-reduced-motion:no-preference){#ssa-connectivity-status .ssa-net-dot{transition:background .2s ease}}
  `;
  (document.head || document.documentElement).appendChild(style);

  const status = document.createElement("button");
  status.id = "ssa-connectivity-status";
  status.type = "button";
  status.dataset.state = "checking";
  status.setAttribute("aria-label", "Connection status. Open network diagnostics.");
  status.setAttribute("aria-expanded", "false");
  status.setAttribute("aria-controls", "ssa-connectivity-panel");
  status.innerHTML = '<span class="ssa-net-dot" aria-hidden="true"></span><span class="ssa-net-label">Checking connection</span><span class="ssa-net-detail"></span>';

  const notice = document.createElement("div");
  notice.id = "ssa-connectivity-notice";
  notice.hidden = true;
  notice.setAttribute("role", "alert");
  notice.textContent = "You are offline. Course lessons, quizzes, assignments, payments and account changes require an internet connection. Offline lesson downloads are not enabled yet.";

  const panel = document.createElement("section");
  panel.id = "ssa-connectivity-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "ssa-connectivity-title");
  panel.innerHTML = `
    <div class="ssa-panel-head"><h2 id="ssa-connectivity-title">Network diagnostics</h2><button class="ssa-panel-close" type="button" aria-label="Close diagnostics">&times;</button></div>
    <p class="ssa-panel-state" data-state="checking"><span class="ssa-net-dot" aria-hidden="true"></span><span class="ssa-panel-state-label">Checking connection</span></p>
    <dl>
      <dt>Browser connection</dt><dd data-field="browser">Checking</dd>
      <dt>Network type</dt><dd data-field="type">Not reported</dd>
      <dt>Estimated download speed</dt><dd data-field="speed">Not reported</dd>
      <dt>Network round-trip time</dt><dd data-field="rtt">Not reported</dd>
      <dt>Data saver</dt><dd data-field="saveData">Not reported</dd>
      <dt>Last connection check</dt><dd data-field="checked">Not checked yet</dd>
      <dt>Last response time</dt><dd data-field="latency">Not measured</dd>
    </dl>
    <p class="ssa-panel-help">Some network details depend on browser support. A weak connection can still access online features, but loading may be slower.</p>
    <button class="ssa-panel-check" type="button">Recheck connection</button>
  `;

  const mount = () => {
    if (!status.isConnected) document.body.appendChild(status);
    if (!notice.isConnected) document.body.appendChild(notice);
    if (!panel.isConnected) document.body.appendChild(panel);
  };
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });

  let state = "checking";
  let lastProbeAt = 0;
  let lastCheckedAt = 0;
  let lastLatencyMs = null;
  let probeInFlight = false;
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const field = name => panel.querySelector('[data-field="' + name + '"]');

  function formatTime(value) {
    if (!value) return "Not checked yet";
    try { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
    catch (_) { return "Recently"; }
  }

  function refreshDiagnostics() {
    const labels = { checking: "Checking connection", online: "Online", weak: "Weak connection", offline: "Offline", reconnecting: "Reconnecting" };
    const panelState = panel.querySelector(".ssa-panel-state");
    panelState.dataset.state = state;
    panelState.querySelector(".ssa-panel-state-label").textContent = labels[state] || "Connection status";
    field("browser").textContent = navigator.onLine ? "Connected" : "Offline";
    field("type").textContent = connection?.effectiveType ? String(connection.effectiveType).toUpperCase() : "Not reported by browser";
    field("speed").textContent = Number.isFinite(connection?.downlink) && connection.downlink > 0 ? connection.downlink + " Mbps (estimate)" : "Not reported by browser";
    field("rtt").textContent = Number.isFinite(connection?.rtt) && connection.rtt > 0 ? connection.rtt + " ms (estimate)" : "Not reported by browser";
    field("saveData").textContent = typeof connection?.saveData === "boolean" ? (connection.saveData ? "On" : "Off") : "Not reported by browser";
    field("checked").textContent = formatTime(lastCheckedAt);
    field("latency").textContent = lastLatencyMs === null ? "Not measured" : Math.round(lastLatencyMs) + " ms";
    const checkButton = panel.querySelector(".ssa-panel-check");
    checkButton.disabled = probeInFlight;
    checkButton.textContent = probeInFlight ? "Checking…" : "Recheck connection";
  }

  function setState(next, detail = "") {
    state = next;
    status.dataset.state = next;
    const label = status.querySelector(".ssa-net-label");
    const extra = status.querySelector(".ssa-net-detail");
    const labels = { checking: "Checking connection", online: "Online", weak: "Weak connection", offline: "Offline", reconnecting: "Reconnecting" };
    if (label) label.textContent = labels[next] || "Connection status";
    if (extra) extra.textContent = detail ? "· " + detail : "";
    notice.hidden = next !== "offline";
    refreshDiagnostics();
    window.dispatchEvent(new CustomEvent("ssa:connectivity-change", {
      detail: { state: next, online: next === "online" || next === "weak", checkedAt: lastCheckedAt || Date.now() }
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
      lastCheckedAt = Date.now();
      lastLatencyMs = null;
      setState("offline");
      return;
    }

    probeInFlight = true;
    if (state === "offline") setState("reconnecting");
    refreshDiagnostics();
    const started = performance.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5500);

    try {
      await fetch("https://www.gstatic.com/generate_204?ssa_ping=" + Date.now(), {
        method: "GET", mode: "no-cors", cache: "no-store", signal: controller.signal
      });
      lastLatencyMs = performance.now() - started;
      lastCheckedAt = Date.now();
      const result = classifyNetwork(lastLatencyMs);
      setState(result.state, result.detail);
    } catch (error) {
      lastLatencyMs = null;
      lastCheckedAt = Date.now();
      setState("offline");
    } finally {
      clearTimeout(timeout);
      probeInFlight = false;
      refreshDiagnostics();
    }
  }

  function setPanelOpen(open) {
    panel.hidden = !open;
    status.setAttribute("aria-expanded", String(open));
    if (open) {
      refreshDiagnostics();
      panel.querySelector(".ssa-panel-close").focus();
    } else {
      status.focus();
    }
  }

  status.addEventListener("click", () => setPanelOpen(panel.hidden));
  panel.querySelector(".ssa-panel-close").addEventListener("click", () => setPanelOpen(false));
  panel.querySelector(".ssa-panel-check").addEventListener("click", () => checkConnection(true));
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) setPanelOpen(false);
  });

  window.addEventListener("online", () => {
    setState("reconnecting");
    checkConnection(true);
  });
  window.addEventListener("offline", () => {
    lastCheckedAt = Date.now();
    setState("offline");
  });
  window.addEventListener("focus", () => checkConnection());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkConnection();
  });
  connection?.addEventListener?.("change", () => {
    refreshDiagnostics();
    checkConnection(true);
  });

  const intervalId = setInterval(() => {
    if (!document.hidden) checkConnection(true);
  }, 60000);

  window.SSASmartConnectivity = Object.freeze({
    getState: () => state,
    isOnline: () => state === "online" || state === "weak",
    check: () => checkConnection(true),
    getDiagnostics: () => Object.freeze({
      state,
      browserOnline: navigator.onLine,
      networkType: connection?.effectiveType || null,
      downlinkMbps: connection?.downlink || null,
      rttMs: connection?.rtt || null,
      saveData: typeof connection?.saveData === "boolean" ? connection.saveData : null,
      lastCheckedAt: lastCheckedAt || null,
      lastLatencyMs
    })
  });

  refreshDiagnostics();
  checkConnection(true);
})();
