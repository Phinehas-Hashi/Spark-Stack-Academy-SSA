// Spark Stack Academy — Online Action Guard
// Protects explicitly marked actions. No storage, offline queue or cached writes.
(() => {
  if (window.SSAOnlineActionGuard) return;

  function requireOnline(actionLabel = "This action") {
    const connectivity = window.SSASmartConnectivity;
    const state = connectivity?.getState?.();
    const browserOnline = navigator.onLine !== false;
    const reachable = state === "online" || state === "weak";

    if (browserOnline && reachable) return true;

    const message = `${actionLabel} requires an internet connection. Reconnect and try again. Nothing has been submitted.`;
    window.dispatchEvent(new CustomEvent("ssa:online-action-blocked", {
      detail: { action: actionLabel, state: state || (browserOnline ? "checking" : "offline") }
    }));

    if (typeof window.ssaToast === "function") {
      window.ssaToast(message, "warning", "Connection required");
    } else {
      window.alert(message);
    }
    connectivity?.check?.();
    return false;
  }

  // Opt-in protection for forms/buttons/links marked in HTML.
  document.addEventListener("submit", event => {
    const form = event.target.closest?.("form[data-requires-online]");
    if (!form) return;
    const label = form.dataset.onlineAction || form.dataset.actionLabel || "Submitting this form";
    if (!requireOnline(label)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  document.addEventListener("click", event => {
    const control = event.target.closest?.("[data-requires-online]:not(form)");
    if (!control) return;
    const label = control.dataset.onlineAction || control.dataset.actionLabel || control.textContent.trim() || "This action";
    if (!requireOnline(label)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.SSAOnlineActionGuard = Object.freeze({ requireOnline });
})();
