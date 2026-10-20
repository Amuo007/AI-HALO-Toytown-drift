let ctx = null, engOsc = null, engGain = null, whineOsc = null, whineGain = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    engOsc = ctx.createOscillator(); engOsc.type = 'sawtooth';
    engGain = ctx.createGain(); engGain.gain.value = 0;
    engOsc.connect(engGain).connect(ctx.destination); engOsc.start();
    whineOsc = ctx.createOscillator(); whineOsc.type = 'triangle';
    whineGain = ctx.createGain(); whineGain.gain.value = 0;
    whineOsc.connect(whineGain).connect(ctx.destination); whineOsc.start();
  } catch (e) { ctx = null; }
}

export function setEngine(speedFrac, throttle, drifting) {
  if (!ctx) return;
  const t = ctx.currentTime;
  engGain.gain.setTargetAtTime(0.015 + speedFrac * 0.05, t, 0.1);
  engOsc.frequency.setTargetAtTime(55 + speedFrac * 130 + throttle * 18, t, 0.08);
  whineGain.gain.setTargetAtTime(drifting ? 0.03 : 0, t, 0.05);
  whineOsc.frequency.setTargetAtTime(700 + speedFrac * 900, t, 0.05);
}

function blip(freq, dur, type = 'square', vol = 0.08) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + dur);
}

export function sfx(name) {
  if (name === 'coin') { blip(880, 0.12, 'square', 0.06); setTimeout(() => blip(1320, 0.15, 'square', 0.06), 70); }
  else if (name === 'banana') blip(160, 0.35, 'sawtooth', 0.1);
  else if (name === 'crash') blip(90, 0.25, 'sawtooth', 0.12);
  else if (name === 'finish') [660, 880, 1100].forEach((f, i) => setTimeout(() => blip(f, 0.2, 'square', 0.07), i * 120));
}
