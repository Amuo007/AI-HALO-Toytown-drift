// Pure collectible + time-trial rules. No Three.js imports.

export const COIN_POINTS = { gold: 3, silver: 2, bronze: 1 };
export const PICKUP_RADIUS = 1.6;

export function createItemState(list) {
  return list.map((c, i) => ({ ...c, i, taken: false, y: 0 }));
}

// Returns array of pickup events for this frame.
export function checkPickups(car, items) {
  const events = [];
  for (const it of items) {
    if (it.taken) continue;
    const dx = car.x - it.x, dz = car.z - it.z;
    if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS && Math.abs(car.y - it.y) < 2.5) {
      it.taken = true;
      if (it.type === 'banana') events.push({ type: 'banana' });
      else if (it.type === 'box') events.push({ type: 'box', points: 5 });
      else events.push({ type: 'coin', coin: it.type, points: COIN_POINTS[it.type] });
    }
  }
  return events;
}

// ---- time trial ----
// gates: { start: {x,z,rot}, finish: {x,z,rot} } — the gate line is perpendicular to rot.
export function createTrial() {
  return { phase: 'idle', t: 0, best: null, crossedStart: false };
}

function side(gate, x, z) {
  // signed distance along gate facing direction
  return (x - gate.x) * Math.sin(gate.rot) + (z - gate.z) * Math.cos(gate.rot);
}
function withinLine(gate, x, z, half) {
  const lat = (x - gate.x) * Math.cos(gate.rot) - (z - gate.z) * Math.sin(gate.rot);
  return Math.abs(lat) < half;
}

// Call every frame with car position. Returns event string or null.
export function stepTrial(trial, car, prev, gates, dt) {
  const s0 = side(gates.start, prev.x, prev.z), s1 = side(gates.start, car.x, car.z);
  const f0 = side(gates.finish, prev.x, prev.z), f1 = side(gates.finish, car.x, car.z);
  const crossS = s0 <= 0 && s1 > 0 && withinLine(gates.start, car.x, car.z, 4);
  const crossF = f0 <= 0 && f1 > 0 && withinLine(gates.finish, car.x, car.z, 4);

  if (trial.phase === 'idle' && crossS) {
    trial.phase = 'running'; trial.t = 0;
    return 'start';
  }
  if (trial.phase === 'running') {
    trial.t += dt;
    if (crossF) {
      trial.phase = 'done';
      if (trial.best === null || trial.t < trial.best) trial.best = trial.t;
      return 'finish';
    }
  }
  return null;
}

export function formatTime(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return (m > 0 ? m + ':' : '') + s.toFixed(2).padStart(m > 0 ? 5 : 2, '0');
}
