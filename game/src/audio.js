// A small WebAudio soundboard, built on demand from oscillators and noise: no files, no network.
// The engine hum tracks the player's car speed, the siren wails only while the force is on you,
// and one-shots cover punches, crashes, pickups and the wanted-level sting. Any failure (no audio
// device, a refused context) leaves the game silent and playable.
let ctx = null;
let master = null;
let engine = null;
let siren = null;
let muted = false;
let noiseBuffer = null;

const VOLUME = 0.22;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);

    // A second of white noise, reused for crashes and punches.
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
  return ctx;
}

/** The browser needs a gesture before audio may play; call this from the first click or key. */
export function unlockAudio() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function setMuted(value) {
  muted = value;
  if (master) master.gain.value = muted ? 0 : VOLUME;
}

export function isMuted() {
  return muted;
}

/** A short envelope on one oscillator: the base of every blip. */
function blip(freq, endFreq, duration, type = 'square', gain = 0.5) {
  const c = ensure();
  if (!c || muted) return;
  const osc = c.createOscillator();
  const env = c.createGain();
  const now = c.currentTime;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(gain, now + 0.008);
  env.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(env).connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function noise(duration, gain = 0.5, cutoff = 1400) {
  const c = ensure();
  if (!c || muted || !noiseBuffer) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const env = c.createGain();
  const now = c.currentTime;
  env.gain.setValueAtTime(gain, now);
  env.gain.exponentialRampToValueAtTime(0.001, now + duration);
  src.connect(filter).connect(env).connect(master);
  src.start(now);
  src.stop(now + duration);
}

/** The engine: a low sawtooth whose pitch follows speed, plus tyre noise at the top. */
export function startEngine() {
  const c = ensure();
  if (!c || engine) return;
  const osc = c.createOscillator();
  const sub = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'sawtooth';
  sub.type = 'triangle';
  osc.frequency.value = 58;
  sub.frequency.value = 29;
  gain.gain.value = 0.0;
  osc.connect(gain);
  sub.connect(gain);
  gain.connect(master);
  osc.start();
  sub.start();
  engine = { osc, sub, gain };
}

export function stopEngine() {
  if (!engine || !ctx) return;
  try {
    engine.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
    engine.osc.stop(ctx.currentTime + 0.3);
    engine.sub.stop(ctx.currentTime + 0.3);
  } catch {
    // Already stopped.
  }
  engine = null;
}

export function updateEngine(speedRatio, throttle) {
  if (!engine || !ctx) return;
  const now = ctx.currentTime;
  const f = 48 + speedRatio * 92 + Math.max(0, throttle) * 12;
  engine.osc.frequency.setTargetAtTime(f, now, 0.06);
  engine.sub.frequency.setTargetAtTime(f * 0.5, now, 0.06);
  engine.gain.gain.setTargetAtTime(0.1 + speedRatio * 0.1, now, 0.1);
}

/** The siren: a two-tone wail that only runs while someone is chasing you. */
export function updateSiren(on, stars) {
  const c = ensure();
  if (!c) return;
  if (on && !siren) {
    const osc = c.createOscillator();
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = 640;
    lfo.type = 'sine';
    lfo.frequency.value = 1.1;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(osc.frequency);
    gain.gain.value = 0;
    osc.connect(gain).connect(master);
    osc.start();
    lfo.start();
    siren = { osc, lfo, gain };
  }
  if (!siren) return;
  const now = c.currentTime;
  const level = on ? 0.05 + Math.min(4, stars) * 0.012 : 0;
  siren.gain.gain.setTargetAtTime(level, now, 0.25);
  siren.lfo.frequency.setTargetAtTime(on ? 0.9 + stars * 0.35 : 0.6, now, 0.3);
}

export function stopSiren() {
  if (!siren || !ctx) return;
  const s = siren;
  siren = null;
  try {
    s.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    s.osc.stop(ctx.currentTime + 0.6);
    s.lfo.stop(ctx.currentTime + 0.6);
  } catch {
    // Already stopped.
  }
}

/* ----------------------------------------------------------- one-shots */

export function sfxPunch() {
  noise(0.09, 0.5, 900);
  blip(220, 90, 0.09, 'square', 0.16);
}

export function sfxCrash(strength = 1) {
  noise(0.28, Math.min(0.9, 0.4 * strength), 1100);
  blip(150, 50, 0.22, 'sawtooth', 0.22 * strength);
}

export function sfxSteal() {
  blip(420, 620, 0.1, 'triangle', 0.2);
  setTimeout(() => blip(620, 820, 0.12, 'triangle', 0.18), 90);
}

export function sfxWanted(stars) {
  blip(300 + stars * 40, 220, 0.16, 'square', 0.2);
  setTimeout(() => blip(240 + stars * 40, 170, 0.2, 'square', 0.16), 130);
}

export function sfxObjective() {
  blip(520, 780, 0.1, 'sine', 0.22);
  setTimeout(() => blip(780, 1040, 0.14, 'sine', 0.2), 110);
}

export function sfxReward() {
  const notes = [523, 659, 784, 1046];
  notes.forEach((f, i) => setTimeout(() => blip(f, f, 0.18, 'triangle', 0.22), i * 110));
}

export function sfxBusted() {
  blip(340, 120, 0.5, 'sawtooth', 0.24);
}

export function sfxDown() {
  blip(200, 60, 0.7, 'sawtooth', 0.26);
}
