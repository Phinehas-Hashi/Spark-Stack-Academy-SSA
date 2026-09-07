import { auth, db } from "./firebase.js";
import { collection, doc, getDocs, query, where, limit, updateDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const POLL_MS = 15000;
let timer = null;
let lastIds = new Set();
let started = false;
let audioContext = null;

function time(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  return new Date(value).getTime() || 0;
}

export function notificationTime(value) {
  const ms = time(value);
  if (!ms) return "Just now";
  const minutes = Math.max(0, Math.floor((Date.now() - ms) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : new Date(ms).toLocaleDateString("en-KE");
}

export function setNotificationSound(enabled) {
  localStorage.setItem("ssa_notification_sound", enabled ? "on" : "off");
}

export function playNotificationSound({ priority = "normal" } = {}) {
  if (localStorage.getItem("ssa_notification_sound") === "off") return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = priority === "high" || priority === "critical" ? 880 : 660;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, audioContext.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.16);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.17);
  } catch (_) {}
}

async function listNotifications() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const snapshot = await getDocs(query(collection(db, "notifications"), where("userId", "==", uid), limit(50)));
    return snapshot.docs.map(item => {
      const data = item.data();
      return { id: item.id, ...data, read: Boolean(data.read), read_at: data.readAt || data.read_at || null, created_at: data.createdAt || data.created_at || null };
    }).sort((a, b) => time(b.created_at) - time(a.created_at));
  } catch (error) {
    console.warn("Notification query failed:", error);
    return [];
  }
}

async function refresh() {
  const notifications = await listNotifications();
  const fresh = notifications.filter(item => !lastIds.has(item.id));
  if (started && fresh.some(item => !item.read)) playNotificationSound({ priority: fresh[0]?.priority });
  lastIds = new Set(notifications.map(item => item.id));
  window.dispatchEvent(new CustomEvent("ssa:notifications", { detail: notifications }));
  return notifications;
}

export async function startNotificationRuntime() {
  if (started) return;
  started = true;
  try { await refresh(); } catch (error) { console.warn("SSA notification runtime unavailable:", error.message); }
  timer = setInterval(() => refresh().catch(() => {}), POLL_MS);
}

export function stopNotificationRuntime() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

export async function markNotificationRead(id) {
  if (!id) return refresh();
  await updateDoc(doc(db, "notifications", id), { read: true, readAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return refresh();
}

export async function markAllNotificationsRead() {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const snapshot = await getDocs(query(collection(db, "notifications"), where("userId", "==", uid), limit(100)));
  const batch = writeBatch(db);
  snapshot.docs.forEach(item => batch.update(item.ref, { read: true, readAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  if (snapshot.size) await batch.commit();
  return refresh();
}
