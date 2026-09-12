// ============================================================
// SPARK STACK ACADEMY
// Portal Control / Founder Lockdown / Maintenance Gate
// ============================================================

import {
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import { db, auth } from "./firebase.js";

const LOCKOUT_GRACE_PERIOD = 30 * 1000;

let unsubscribeControl = null;
let unsubscribeAuth = null;

let currentUser = null;
let portalName = null;

let blocker = null;
let countdownTimer = null;
let logoutTimer = null;

let blocked = false;
let blockedReason = "";


// ============================================================
// PUBLIC API
// ============================================================

export function watchPortalControl(portal) {
  portalName = portal;

  stopPortalControl();

  unsubscribeAuth = onAuthStateChanged(auth, (user) => {
    currentUser = user;

    if (!user) {
      clearLockoutTimers();
      removeBlocker();
      return;
    }

    subscribeToControls();
  });
}


// ============================================================
// FIRESTORE CONTROL WATCHER
// ============================================================

function subscribeToControls() {
  if (unsubscribeControl) {
    unsubscribeControl();
    unsubscribeControl = null;
  }

  const controlRef = doc(db, "platform_controls", "global");

  unsubscribeControl = onSnapshot(
    controlRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        clearLockoutTimers();
        removeBlocker();
        return;
      }

      const controls = snapshot.data() || {};

      evaluatePortalState(controls);
    },
    (error) => {
      console.error("[SSA Portal Control] Firestore listener error:", error);
    }
  );
}


// ============================================================
// PORTAL STATE
// ============================================================

function evaluatePortalState(controls) {
  const portalControl = controls?.[portalName] || {};

  const lockdown = controls.lockdown === true;

  const suspended =
    portalControl.suspended === true;

  const maintenance =
    isMaintenanceActive(
      controls.maintenance
    );

  let reason = "";

  if (lockdown) {
    reason =
      controls.lockdownReason ||
      "SSA is temporarily unavailable due to an emergency platform lockdown.";
  } else if (suspended) {
    reason =
      portalControl.reason ||
      `Your ${portalName} portal has been temporarily suspended by the Founder.`;
  } else if (maintenance.active) {
    reason =
      maintenance.message ||
      "SSA is temporarily offline for scheduled maintenance.";
  }

  const shouldBlock =
    lockdown ||
    suspended ||
    maintenance.active;

  if (shouldBlock) {
    activateBlocker(reason);
  } else {
    clearLockoutTimers();
    removeBlocker();
  }
}


// ============================================================
// MAINTENANCE CHECK
// ============================================================

function isMaintenanceActive(maintenance) {
  if (!maintenance || maintenance.scheduled !== true) {
    return {
      active: false
    };
  }

  const target = maintenance.target || "";

  if (
    target !== portalName &&
    target !== "all"
  ) {
    return {
      active: false
    };
  }

  let start = null;
  let end = null;

  // New Timestamp-based fields
  if (maintenance.startAt?.toDate) {
    start = maintenance.startAt.toDate();
  }

  if (maintenance.endAt?.toDate) {
    end = maintenance.endAt.toDate();
  }

  // Legacy ISO fallback
  if (!start && maintenance.start) {
    start = new Date(maintenance.start);
  }

  if (!end && maintenance.end) {
    end = new Date(maintenance.end);
  }

  if (!start || !end) {
    return {
      active: false
    };
  }

  const now = new Date();

  return {
    active:
      now >= start &&
      now < end,
    start,
    end,
    message:
      maintenance.message ||
      "SSA is temporarily offline for scheduled maintenance."
  };
}


// ============================================================
// ACTIVATE BLOCKER
// ============================================================

function activateBlocker(reason) {
  blocked = true;
  blockedReason = reason;

  if (!blocker) {
    createBlocker();
  }

  updateBlockerContent(reason);

  /*
   * Don't restart the 30-second countdown every time
   * Firestore sends another snapshot.
   */
  if (!logoutTimer) {
    startGracePeriod();
  }
}


// ============================================================
// 30-SECOND GRACE PERIOD
// ============================================================

function startGracePeriod() {
  let remaining = 30;

  updateCountdown(remaining);

  countdownTimer = setInterval(() => {
    remaining--;

    updateCountdown(remaining);

    if (remaining <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);

  logoutTimer = setTimeout(async () => {
    logoutTimer = null;

    /*
     * Before signing out, verify that the portal is still blocked.
     * If the Founder restored access during the 30 seconds,
     * evaluatePortalState() would already have cleared these timers.
     */
    if (!blocked) {
      return;
    }

    try {
      await signOut(auth);
    } catch (error) {
      console.error(
        "[SSA Portal Control] Sign-out failed:",
        error
      );
    }

    redirectToLogin();
  }, LOCKOUT_GRACE_PERIOD);
}


// ============================================================
// BLOCKER UI
// ============================================================

function createBlocker() {
  blocker = document.createElement("div");

  blocker.id = "ssaPortalControlBlocker";

  blocker.innerHTML = `
    <div class="ssa-control-card">
      <div class="ssa-control-icon">
        <span>⚠</span>
      </div>

      <div class="ssa-control-label">
        SPARK STACK ACADEMY
      </div>

      <h1 class="ssa-control-title">
        Portal Temporarily Locked
      </h1>

      <p class="ssa-control-message">
        ${escapeHtml(blockedReason)}
      </p>

      <div class="ssa-control-countdown">
        <span id="ssaControlCountdown">30</span>
      </div>

      <p class="ssa-control-subtext">
        You will be signed out automatically in
        <strong id="ssaControlSeconds">30 seconds</strong>.
      </p>

      <div class="ssa-control-progress">
        <div id="ssaControlProgress"></div>
      </div>

      <p class="ssa-control-footer">
        If access is restored before the countdown ends,
        you can continue using the portal.
      </p>
    </div>
  `;

  injectBlockerStyles();

  document.body.appendChild(blocker);
}


function updateBlockerContent(reason) {
  if (!blocker) {
    return;
  }

  const message =
    blocker.querySelector(".ssa-control-message");

  if (message) {
    message.textContent = reason;
  }
}


function updateCountdown(seconds) {
  if (!blocker) {
    return;
  }

  const circle =
    blocker.querySelector("#ssaControlCountdown");

  const text =
    blocker.querySelector("#ssaControlSeconds");

  const progress =
    blocker.querySelector("#ssaControlProgress");

  if (circle) {
    circle.textContent = seconds;
  }

  if (text) {
    text.textContent =
      `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  if (progress) {
    const percentage =
      Math.max(0, Math.min(100, (seconds / 30) * 100));

    progress.style.width =
      `${percentage}%`;
  }
}


// ============================================================
// REMOVE BLOCKER
// ============================================================

function removeBlocker() {
  blocked = false;
  blockedReason = "";

  if (blocker) {
    blocker.remove();
    blocker = null;
  }
}


// ============================================================
// CLEAR TIMERS
// ============================================================

function clearLockoutTimers() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }

  if (logoutTimer) {
    clearTimeout(logoutTimer);
    logoutTimer = null;
  }
}


// ============================================================
// LOGIN REDIRECT
// ============================================================

function redirectToLogin() {
  const currentPath =
    window.location.pathname;

  if (currentPath.includes("/student/")) {
    window.location.href = "../login.html";
    return;
  }

  if (currentPath.includes("/instructor/")) {
    window.location.href = "../login.html";
    return;
  }

  window.location.href = "login.html";
}


// ============================================================
// STOP WATCHER
// ============================================================

function stopPortalControl() {
  clearLockoutTimers();

  if (unsubscribeControl) {
    unsubscribeControl();
    unsubscribeControl = null;
  }

  if (unsubscribeAuth) {
    unsubscribeAuth();
    unsubscribeAuth = null;
  }

  removeBlocker();
}


// ============================================================
// HTML ESCAPE
// ============================================================

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ============================================================
// BLOCKER STYLES
// ============================================================

function injectBlockerStyles() {
  if (document.getElementById("ssaPortalControlStyles")) {
    return;
  }

  const style = document.createElement("style");

  style.id = "ssaPortalControlStyles";

  style.textContent = `
    #ssaPortalControlBlocker {
      position: fixed;
      inset: 0;
      z-index: 2147483647;

      display: flex;
      align-items: center;
      justify-content: center;

      padding: 24px;

      background:
        radial-gradient(
          circle at top,
          rgba(41, 121, 255, 0.18),
          transparent 42%
        ),
        rgba(8, 28, 58, 0.98);

      color: #ffffff;

      font-family:
        Poppins,
        Inter,
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
    }

    #ssaPortalControlBlocker .ssa-control-card {
      width: min(100%, 520px);

      padding: 38px 28px;

      text-align: center;

      border:
        1px solid
        rgba(255, 193, 7, 0.35);

      border-radius: 24px;

      background:
        linear-gradient(
          145deg,
          rgba(255,255,255,0.08),
          rgba(255,255,255,0.035)
        );

      box-shadow:
        0 30px 90px rgba(0,0,0,0.45),
        inset 0 1px 0 rgba(255,255,255,0.08);

      backdrop-filter: blur(18px);
    }

    #ssaPortalControlBlocker .ssa-control-icon {
      width: 72px;
      height: 72px;

      margin: 0 auto 20px;

      display: flex;
      align-items: center;
      justify-content: center;

      border-radius: 50%;

      background:
        rgba(255, 193, 7, 0.12);

      border:
        1px solid
        rgba(255, 193, 7, 0.35);

      color: #ffc107;

      font-size: 32px;
    }

    #ssaPortalControlBlocker .ssa-control-label {
      margin-bottom: 10px;

      color: #8ab4ff;

      font-size: 11px;
      font-weight: 700;

      letter-spacing: 2px;
    }

    #ssaPortalControlBlocker .ssa-control-title {
      margin: 0 0 14px;

      font-size: clamp(24px, 6vw, 34px);

      line-height: 1.15;
    }

    #ssaPortalControlBlocker .ssa-control-message {
      margin: 0 auto 24px;

      max-width: 430px;

      color: rgba(255,255,255,0.78);

      font-size: 14px;
      line-height: 1.7;
    }

    #ssaPortalControlBlocker .ssa-control-countdown {
      width: 76px;
      height: 76px;

      margin: 0 auto 14px;

      display: flex;
      align-items: center;
      justify-content: center;

      border-radius: 50%;

      border:
        3px solid
        #ffc107;

      color: #ffc107;

      font-size: 24px;
      font-weight: 800;
    }

    #ssaPortalControlBlocker .ssa-control-subtext {
      margin: 0 0 18px;

      color: rgba(255,255,255,0.68);

      font-size: 12px;
    }

    #ssaPortalControlBlocker .ssa-control-subtext strong {
      color: #ffffff;
    }

    #ssaPortalControlBlocker .ssa-control-progress {
      width: 100%;
      height: 5px;

      overflow: hidden;

      margin-bottom: 20px;

      border-radius: 999px;

      background:
        rgba(255,255,255,0.10);
    }

    #ssaPortalControlBlocker #ssaControlProgress {
      width: 100%;
      height: 100%;

      border-radius: inherit;

      background: #2979ff;

      transition:
        width 1s linear;
    }

    #ssaPortalControlBlocker .ssa-control-footer {
      margin: 0;

      color: rgba(255,255,255,0.48);

      font-size: 11px;
      line-height: 1.6;
    }

    @media (max-width: 480px) {
      #ssaPortalControlBlocker {
        padding: 16px;
      }

      #ssaPortalControlBlocker .ssa-control-card {
        padding: 30px 20px;
        border-radius: 20px;
      }
    }
  `;

  document.head.appendChild(style);
}
