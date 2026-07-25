// Tiny WebAudio bleep synth — no asset loading, no licensing, no 404s on gh-pages.

let ctx = null;
let master = null;
let enabled = true;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { enabled = false; return null; }
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.32;
  master.connect(ctx.destination);
  return ctx;
}

export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

function tone({ freq = 440, to = null, dur = 0.12, type = 'square', gain = 0.5, delay = 0 }) {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.2, gain = 0.35, delay = 0, hp = 400 }) {
  if (!enabled) return;
  const c = ensure();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filt = c.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = hp;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t0);
}

export const sfx = {
  tick:    () => tone({ freq: 620, dur: 0.03, gain: 0.16, type: 'square' }),
  lockHit: (n) => tone({ freq: 420 + n * 90, to: 720 + n * 90, dur: 0.13, gain: 0.4, type: 'triangle' }),
  lockFail:() => { tone({ freq: 220, to: 70, dur: 0.34, gain: 0.45, type: 'sawtooth' }); noise({ dur: 0.2, gain: 0.18 }); },
  lockOpen:() => { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.16, gain: 0.4, type: 'triangle', delay: i * 0.085 })); },
  eat:     () => { tone({ freq: 300, to: 460, dur: 0.09, gain: 0.3, type: 'sine' }); noise({ dur: 0.08, gain: 0.12, hp: 800 }); },
  throw:   () => { noise({ dur: 0.14, gain: 0.24, hp: 900 }); tone({ freq: 180, to: 90, dur: 0.12, gain: 0.22, type: 'sine' }); },
  splat:   () => { noise({ dur: 0.26, gain: 0.4, hp: 240 }); tone({ freq: 130, to: 55, dur: 0.24, gain: 0.35, type: 'sine' }); },
  boom:    () => { noise({ dur: 0.5, gain: 0.5, hp: 120 }); tone({ freq: 90, to: 35, dur: 0.5, gain: 0.45, type: 'sine' }); },
  coin:    () => { tone({ freq: 988, dur: 0.07, gain: 0.34, type: 'square' }); tone({ freq: 1319, dur: 0.13, gain: 0.3, type: 'square', delay: 0.06 }); },
  empty:   () => tone({ freq: 150, dur: 0.06, gain: 0.18, type: 'square' }),
  alert:   () => { tone({ freq: 880, dur: 0.1, gain: 0.34, type: 'square' }); tone({ freq: 660, dur: 0.14, gain: 0.34, type: 'square', delay: 0.11 }); },
  taze:    () => { for (let i = 0; i < 6; i++) noise({ dur: 0.05, gain: 0.4, delay: i * 0.05, hp: 1600 }); tone({ freq: 70, to: 40, dur: 0.6, gain: 0.4, type: 'sawtooth' }); },
  buy:     () => { [660, 880, 1100].forEach((f, i) => tone({ freq: f, dur: 0.1, gain: 0.3, type: 'triangle', delay: i * 0.06 })); },
  deny:    () => tone({ freq: 200, to: 140, dur: 0.16, gain: 0.3, type: 'sawtooth' }),
  night:   () => { [330, 262, 196, 147].forEach((f, i) => tone({ freq: f, dur: 0.5, gain: 0.28, type: 'sine', delay: i * 0.22 })); },
  dawn:    () => { [262, 330, 392, 523].forEach((f, i) => tone({ freq: f, dur: 0.45, gain: 0.26, type: 'sine', delay: i * 0.2 })); },
  win:     () => { [523, 659, 784, 1046, 1319].forEach((f, i) => tone({ freq: f, dur: 0.42, gain: 0.36, type: 'triangle', delay: i * 0.16 })); },
};
