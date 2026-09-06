// Spark Stack Academy — lightweight notification sound engine
// No external audio asset required. Uses Web Audio after a user gesture.
const SSA_SOUND_KEY = "ssa_notification_sound_enabled";

function soundEnabled() {
  return localStorage.getItem(SSA_SOUND_KEY) !== "false";
}

export function setNotificationSoundEnabled(enabled) {
  localStorage.setItem(SSA_SOUND_KEY, enabled ? "true" : "false");
}

export function isNotificationSoundEnabled() {
  return soundEnabled();
}

export function playNotificationSound(type = "default") {
  if (!soundEnabled()) return false;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const notes = type === "critical" ? [880, 660, 880] : type === "success" ? [660, 880] : [660, 784];
    notes.forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const start = now + index * 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(type === "critical" ? 0.07 : 0.045, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.075);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.08);
    });
    setTimeout(() => ctx.close().catch(() => {}), 500);
    return true;
  } catch (error) {
    console.warn("[SSA SOUND] Notification sound unavailable", error);
    return false;
  }
}

// Expose a tiny compatibility API for existing non-module pages.
window.SSANotificationSound = {
  play: playNotificationSound,
  enable: () => setNotificationSoundEnabled(true),
  disable: () => setNotificationSoundEnabled(false),
  enabled: isNotificationSoundEnabled
};
