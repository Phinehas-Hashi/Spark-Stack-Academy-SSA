// ============================================================
// SPARK STACK ACADEMY — FIREBASE NOTIFICATION RUNTIME
//
// Shared Firebase/Firestore notification service.
// Includes real-time notifications + notification sounds.
// ============================================================

import { auth, db } from "./firebase.js";

import {
  collection,
  query,
  where,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ============================================================
   CONFIG
   ============================================================ */

const MAX_NOTIFICATIONS = 50;

const SOUND_STORAGE_KEY = "ssa_notification_sound";

const NORMAL_FREQUENCY = 660;
const HIGH_FREQUENCY = 880;

const NORMAL_VOLUME = 0.045;
const HIGH_VOLUME = 0.055;

/* ============================================================
   STATE
   ============================================================ */

let unsubscribe = null;
let started = false;

let notifications = [];

let lastIds = new Set();

let audioContext = null;
let audioUnlocked = false;

/* ============================================================
   TIME HELPERS
   ============================================================ */

function time(value) {

  if (!value) {
    return 0;
  }

  if (typeof value.toMillis === "function") {
    return value.toMillis();
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

export function notificationTime(value) {

  const ms = time(value);

  if (!ms) {
    return "Just now";
  }

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - ms) / 60000)
  );

  if (minutes < 1) {
    return "Just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  return days < 7
    ? `${days}d ago`
    : new Date(ms).toLocaleDateString("en-KE");
}

/* ============================================================
   SOUND PREFERENCES
   ============================================================ */

export function isNotificationSoundEnabled() {

  return localStorage.getItem(
    SOUND_STORAGE_KEY
  ) !== "off";
}

export function setNotificationSound(enabled) {

  const value = enabled ? "on" : "off";

  localStorage.setItem(
    SOUND_STORAGE_KEY,
    value
  );

  return enabled;
}

export function toggleNotificationSound() {

  const enabled =
    !isNotificationSoundEnabled();

  setNotificationSound(enabled);

  if (enabled) {
    unlockNotificationAudio();
  }

  window.dispatchEvent(
    new CustomEvent(
      "ssa:notification-sound",
      {
        detail: {
          enabled
        }
      }
    )
  );

  return enabled;
}

/* ============================================================
   AUDIO CONTEXT
   ============================================================ */

function getAudioContext() {

  if (typeof window === "undefined") {
    return null;
  }

  const AudioContext =
    window.AudioContext ||
    window.webkitAudioContext;

  if (!AudioContext) {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  return audioContext;
}

/* ============================================================
   AUDIO UNLOCK
   ============================================================ */

/*
 * Browsers may create Web Audio contexts in a suspended state
 * until the user interacts with the page.
 *
 * We unlock/resume the context from a real user gesture.
 */

export async function unlockNotificationAudio() {

  if (!isNotificationSoundEnabled()) {
    return false;
  }

  try {

    const context = getAudioContext();

    if (!context) {
      return false;
    }

    if (
      context.state === "suspended" ||
      context.state === "interrupted"
    ) {
      await context.resume();
    }

    audioUnlocked =
      context.state === "running";

    return audioUnlocked;

  } catch (_) {

    return false;
  }
}

/* ============================================================
   INSTALL USER-GESTURE AUDIO UNLOCK
   ============================================================ */

function installAudioUnlockListeners() {

  if (
    typeof document === "undefined"
  ) {
    return;
  }

  const unlock = () => {

    unlockNotificationAudio();

    if (audioUnlocked) {

      document.removeEventListener(
        "pointerdown",
        unlock
      );

      document.removeEventListener(
        "keydown",
        unlock
      );

      document.removeEventListener(
        "touchstart",
        unlock
      );
    }
  };

  document.addEventListener(
    "pointerdown",
    unlock,
    {
      passive: true
    }
  );

  document.addEventListener(
    "keydown",
    unlock,
    {
      passive: true
    }
  );

  document.addEventListener(
    "touchstart",
    unlock,
    {
      passive: true
    }
  );
}

/* ============================================================
   LOW LEVEL TONE
   ============================================================ */

function playTone(
  context,
  frequency,
  startTime,
  duration,
  volume
) {

  const oscillator =
    context.createOscillator();

  const gain =
    context.createGain();

  oscillator.type = "sine";

  oscillator.frequency.setValueAtTime(
    frequency,
    startTime
  );

  gain.gain.setValueAtTime(
    0.0001,
    startTime
  );

  gain.gain.exponentialRampToValueAtTime(
    volume,
    startTime + 0.015
  );

  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    startTime + duration
  );

  oscillator
    .connect(gain)
    .connect(context.destination);

  oscillator.start(startTime);

  oscillator.stop(
    startTime + duration + 0.01
  );
}

/* ============================================================
   NOTIFICATION SOUND
   ============================================================ */

export async function playNotificationSound({
  priority = "normal"
} = {}) {

  if (!isNotificationSoundEnabled()) {
    return false;
  }

  try {

    const context = getAudioContext();

    if (!context) {
      return false;
    }

    if (
      context.state === "suspended" ||
      context.state === "interrupted"
    ) {
      await context.resume();
    }

    if (context.state !== "running") {
      return false;
    }

    audioUnlocked = true;

    const now =
      context.currentTime;

    const urgent =
      priority === "high" ||
      priority === "critical";

    if (urgent) {

      /*
       * High/critical:
       * two-tone alert.
       */

      playTone(
        context,
        HIGH_FREQUENCY,
        now,
        0.14,
        HIGH_VOLUME
      );

      playTone(
        context,
        NORMAL_FREQUENCY,
        now + 0.17,
        0.18,
        HIGH_VOLUME
      );

    } else {

      /*
       * Normal:
       * soft single chime.
       */

      playTone(
        context,
        NORMAL_FREQUENCY,
        now,
        0.16,
        NORMAL_VOLUME
      );
    }

    return true;

  } catch (_) {

    /*
     * Audio is non-critical.
     * Notification functionality must continue
     * even if the browser blocks sound.
     */

    return false;
  }
}

/* ============================================================
   NORMALIZE FIREBASE NOTIFICATION
   ============================================================ */

function normalizeNotification(snapshot) {

  const data =
    snapshot.data() || {};

  const createdAt =
    data.createdAt ||
    data.created_at ||
    null;

  const read =
    data.read === true ||
    Boolean(data.readAt) ||
    Boolean(data.read_at);

  const normalized = {

    id: snapshot.id,

    title:
      data.title ||
      "Notification",

    message:
      data.message ||
      "",

    type:
      data.type ||
      "general",

    priority:
      data.priority ||
      "normal",

    read_at:
      read
        ? (
            data.readAt ||
            data.read_at ||
            true
          )
        : null,

    created_at:
      createdAt,

    action_url:
      data.actionUrl ||
      data.action_url ||
      null,

    ...data
  };

  /*
   * Re-apply normalized fields after spreading
   * backend data so the UI always gets the
   * expected names.
   */

  normalized.id =
    snapshot.id;

  normalized.read_at =
    read
      ? (
          data.readAt ||
          data.read_at ||
          true
        )
      : null;

  normalized.created_at =
    createdAt;

  normalized.action_url =
    data.actionUrl ||
    data.action_url ||
    null;

  return normalized;
}

/* ============================================================
   SORT
   ============================================================ */

function sortNotifications(items) {

  return items.sort(
    (a, b) =>
      time(b.created_at) -
      time(a.created_at)
  );
}

/* ============================================================
   PUBLISH
   ============================================================ */

function publish(nextNotifications) {

  notifications =
    sortNotifications(
      nextNotifications
    );

  window.dispatchEvent(
    new CustomEvent(
      "ssa:notifications",
      {
        detail: notifications
      }
    )
  );
}

/* ============================================================
   FIREBASE LISTENER
   ============================================================ */

function subscribeToNotifications(uid) {

  const notificationsRef =
    collection(
      db,
      "notifications"
    );

  /*
   * Deliberately avoid orderBy(createdAt)
   * so Firestore does not require a
   * composite index for notifications.
   */

  const notificationQuery =
    query(
      notificationsRef,

      where(
        "userId",
        "==",
        uid
      ),

      limit(
        MAX_NOTIFICATIONS
      )
    );

  unsubscribe =
    onSnapshot(

      notificationQuery,

      snapshot => {

        const next =
          snapshot.docs.map(
            normalizeNotification
          );

        const nextIds =
          new Set(
            next.map(
              item => item.id
            )
          );

        const fresh =
          next.filter(
            item =>
              !lastIds.has(
                item.id
              )
          );

        /*
         * Never play sounds for the
         * first Firestore snapshot.
         *
         * This prevents old unread
         * notifications from sounding
         * when the dashboard opens.
         */

        if (lastIds.size > 0) {

          const freshUnread =
            fresh.filter(
              item =>
                !item.read_at
            );

          if (freshUnread.length) {

            const urgent =
              freshUnread.find(
                item =>
                  item.priority === "critical" ||
                  item.priority === "high"
              );

            playNotificationSound({
              priority:
                urgent?.priority ||
                freshUnread[0]?.priority ||
                "normal"
            });
          }
        }

        lastIds =
          nextIds;

        publish(next);
      },

      error => {

        console.warn(
          "SSA notification listener error:",
          error?.message ||
          error
        );
      }
    );
}

/* ============================================================
   START
   ============================================================ */

export async function startNotificationRuntime() {

  if (started) {
    return;
  }

  started = true;

  installAudioUnlockListeners();

  const user =
    auth.currentUser;

  if (!user) {

    started = false;

    return;
  }

  /*
   * Reset notification IDs for
   * a clean initial snapshot.
   */

  lastIds =
    new Set();

  subscribeToNotifications(
    user.uid
  );
}

/* ============================================================
   STOP
   ============================================================ */

export function stopNotificationRuntime() {

  if (unsubscribe) {
    unsubscribe();
  }

  unsubscribe = null;

  started = false;

  notifications = [];

  lastIds =
    new Set();
}

/* ============================================================
   MARK ONE AS READ
   ============================================================ */

export async function markNotificationRead(id) {

  if (!id) {
    return;
  }

  await updateDoc(
    doc(
      db,
      "notifications",
      id
    ),
    {
      read: true,
      readAt: serverTimestamp()
    }
  );
}

/* ============================================================
   MARK ALL AS READ
   ============================================================ */

export async function markAllNotificationsRead() {

  /*
   * We intentionally avoid a broad client-side
   * batch update here because Firestore rules
   * should remain the authority for notification
   * ownership.
   *
   * Update currently loaded unread notifications
   * individually.
   */

  const unread =
    notifications.filter(
      item =>
        !item.read_at
    );

  await Promise.all(
    unread.map(
      item =>
        markNotificationRead(
          item.id
        )
    )
  );
}

/* ============================================================
   AUTH LIFECYCLE
   ============================================================ */

auth.onAuthStateChanged(
  user => {

    stopNotificationRuntime();

    if (user) {
      startNotificationRuntime();
    }
  }
);
