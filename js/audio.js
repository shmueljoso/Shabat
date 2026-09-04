// ===== סאונד: סינתזה קלה ב-Web Audio, בלי קבצי אודיו חיצוניים =====
// כך שהמשחק נשאר קליל, וממשיך לעבוד גם אופליין (PWA) בלי בקשות רשת נוספות.

const MUTE_STORAGE_KEY = 'yosovich_muted';

let audioCtx = null;
let muted = false;
try { muted = localStorage.getItem(MUTE_STORAGE_KEY) === '1'; } catch (e) { /* אחסון חסום - ברירת מחדל: לא מושתק */ }

function isMuted() { return muted; }

function setMuted(val) {
  muted = val;
  try { localStorage.setItem(MUTE_STORAGE_KEY, val ? '1' : '0'); } catch (e) { /* ignore */ }
}

function toggleMuted() {
  setMuted(!muted);
  return muted;
}

function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    audioCtx = null;
  }
  return audioCtx;
}

// תדרי תווים (Hz)
const N = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, E6: 1318.51, G6: 1567.98,
};

function tone(ctx, freq, startTime, duration, type, peakGain) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startTime);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.03);
}

// כל צליל מוגדר כרשימת תווים {f, t, d, type, g} (תדר, זמן התחלה יחסי, משך, סוג גל, עוצמה)
const SOUND_DEFS = {
  tap: [{ f: 600, t: 0, d: 0.05, type: 'square', g: 0.05 }],
  denied: [{ f: 180, t: 0, d: 0.09, type: 'sawtooth', g: 0.07 }],
  taskDone: [
    { f: N.C5, t: 0, d: 0.09, type: 'triangle', g: 0.15 },
    { f: N.G5, t: 0.08, d: 0.14, type: 'triangle', g: 0.15 },
  ],
  criticalDone: [
    { f: N.C5, t: 0, d: 0.09, type: 'triangle', g: 0.18 },
    { f: N.E5, t: 0.09, d: 0.09, type: 'triangle', g: 0.18 },
    { f: N.G5, t: 0.18, d: 0.09, type: 'triangle', g: 0.18 },
    { f: N.C6, t: 0.27, d: 0.24, type: 'triangle', g: 0.2 },
  ],
  guestArrive: [
    { f: N.E6, t: 0, d: 0.14, type: 'sine', g: 0.14 },
    { f: N.C6, t: 0.15, d: 0.18, type: 'sine', g: 0.14 },
  ],
  alarm: [
    { f: N.A4, t: 0, d: 0.11, type: 'sawtooth', g: 0.13 },
    { f: N.G4, t: 0.13, d: 0.13, type: 'sawtooth', g: 0.13 },
  ],
  jokerPoof: [
    { f: 320, t: 0, d: 0.06, type: 'square', g: 0.11 },
    { f: 940, t: 0.05, d: 0.12, type: 'square', g: 0.11 },
  ],
  showerDone: [{ f: N.B5, t: 0, d: 0.1, type: 'sine', g: 0.12 }],
  perfect: [
    { f: N.C5, t: 0, d: 0.09, type: 'triangle', g: 0.18 },
    { f: N.E5, t: 0.09, d: 0.09, type: 'triangle', g: 0.18 },
    { f: N.G5, t: 0.18, d: 0.09, type: 'triangle', g: 0.18 },
    { f: N.C6, t: 0.27, d: 0.16, type: 'triangle', g: 0.2 },
    { f: N.C6, t: 0.45, d: 0.5, type: 'sine', g: 0.16 },
    { f: N.E6, t: 0.45, d: 0.5, type: 'sine', g: 0.13 },
    { f: N.G6, t: 0.45, d: 0.5, type: 'sine', g: 0.13 },
  ],
  good: [
    { f: N.C5, t: 0, d: 0.1, type: 'sine', g: 0.16 },
    { f: N.E5, t: 0.1, d: 0.1, type: 'sine', g: 0.16 },
    { f: N.G5, t: 0.2, d: 0.22, type: 'sine', g: 0.16 },
  ],
  ok: [{ f: N.A4, t: 0, d: 0.22, type: 'triangle', g: 0.13 }],
  fail: [
    { f: N.G4, t: 0, d: 0.18, type: 'sawtooth', g: 0.12 },
    { f: N.E4, t: 0.17, d: 0.18, type: 'sawtooth', g: 0.12 },
    { f: N.C4, t: 0.34, d: 0.35, type: 'sawtooth', g: 0.12 },
  ],
};

function playSound(name) {
  if (muted) return;
  const notes = SOUND_DEFS[name];
  if (!notes) return;
  const ctx = ensureAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const now = ctx.currentTime;
  notes.forEach(n => tone(ctx, n.f, now + n.t, n.d, n.type, n.g));
}
