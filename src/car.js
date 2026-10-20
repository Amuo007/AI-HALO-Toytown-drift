// Pure arcade car physics — no Three.js imports.

export const VEHICLES = [
  { id: 'vehicle-racer',          name: 'Racer',         color: '#e8543f', maxSpeed: 26, accel: 16, grip: 7.5, mass: 1.0 },
  { id: 'vehicle-racer-low',      name: 'Low Racer',     color: '#8a63d2', maxSpeed: 29, accel: 17, grip: 6.2, mass: 0.9 },
  { id: 'vehicle-speedster',      name: 'Speedster',     color: '#3fae5a', maxSpeed: 33, accel: 19, grip: 5.4, mass: 0.8 },
  { id: 'vehicle-drag-racer',     name: 'Drag Racer',    color: '#f28c28', maxSpeed: 38, accel: 24, grip: 4.6, mass: 0.9 },
  { id: 'vehicle-vintage-racer',  name: 'Vintage',       color: '#d94f8a', maxSpeed: 24, accel: 13, grip: 5.0, mass: 0.85 },
  { id: 'vehicle-suv',            name: 'SUV',           color: '#4a90d9', maxSpeed: 23, accel: 13, grip: 8.5, mass: 1.3 },
  { id: 'vehicle-truck',          name: 'Truck',         color: '#e8c33f', maxSpeed: 20, accel: 10, grip: 7.0, mass: 1.6 },
  { id: 'vehicle-monster-truck',  name: 'Monster Truck', color: '#59c4c4', maxSpeed: 21, accel: 12, grip: 9.0, mass: 1.5 },
];

export function createCarState(stats, x = 0, z = 0, heading = 0) {
  return {
    x, y: 0, z, heading,
    vx: 0, vz: 0, vy: 0,
    speed: 0,            // signed forward speed (m/s)
    grounded: true,
    airborne: false,
    climbRate: 0,        // smoothed ground climb rate for ramp launches
    spinout: 0,          // seconds of spin-out left
    wheelSpin: 0,
    steerVis: 0,         // smoothed visual steering angle
    drifting: false,
    lastImpact: 0,
  };
}

const GRAVITY = 26;

// input: { throttle: -1..1, steer: -1..1, handbrake: bool }
// groundFn(x, z) -> ground height at that spot
export function stepCar(s, stats, input, dt, groundFn) {
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);

  // decompose velocity into forward + lateral
  let vf = s.vx * fx + s.vz * fz;
  let latx = s.vx - fx * vf, latz = s.vz - fz * vf;

  // engine / brake / reverse
  const thr = input.throttle || 0;
  if (thr > 0) vf += thr * stats.accel * dt;
  else if (thr < 0) {
    if (vf > 0.5) vf += thr * stats.accel * 1.7 * dt;   // braking
    else vf += thr * stats.accel * 0.55 * dt;           // reverse
  }
  // rolling drag + air drag
  vf -= vf * (0.55 / stats.mass) * dt;
  const maxS = stats.maxSpeed;
  vf = Math.max(-maxS * 0.4, Math.min(maxS, vf));

  // steering
  const speedFactor = Math.min(1, Math.abs(vf) / 6);
  let turnRate = 2.1 * (0.6 + 0.4 * Math.min(1, stats.grip / 8));
  let turn = (input.steer || 0) * turnRate * speedFactor * (vf >= 0 ? 1 : -1);
  if (input.handbrake) turn *= 1.45;
  if (s.spinout > 0) { s.spinout = Math.max(0, s.spinout - dt); s.heading += 9.5 * dt; }
  s.heading += turn * dt;

  // lateral grip: handbrake and spinout cut grip -> drift
  let grip = stats.grip * (input.handbrake ? 0.22 : 1);
  if (s.spinout > 0) grip *= 0.25;
  if (!s.grounded) grip *= 0.4;
  const decay = Math.exp(-grip * dt);
  latx *= decay; latz *= decay;
  // steering pushes the tail out a bit (arcade drift feel)
  const slide = -turn * vf * 0.16 * (input.handbrake ? 2.2 : 1);
  latx += Math.cos(s.heading) * slide * dt * 8;
  latz += -Math.sin(s.heading) * slide * dt * 8;

  s.drifting = Math.hypot(latx, latz) > 2.2 && s.grounded;

  // recompose with new heading
  const nfx = Math.sin(s.heading), nfz = Math.cos(s.heading);
  s.vx = nfx * vf + latx;
  s.vz = nfz * vf + latz;
  s.speed = vf;

  // horizontal move
  s.x += s.vx * dt;
  s.z += s.vz * dt;

  // vertical: follow ground, launch off ramps
  const gh = groundFn(s.x, s.z);
  if (s.airborne) {
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y <= gh) { s.y = gh; s.vy = 0; s.airborne = false; s.climbRate = 0; }
  } else {
    const climb = (gh - s.y) / Math.max(dt, 1e-4);
    if (climb < -2.5 && s.climbRate > 4 && vf > 6) {
      // ground dropped away after a climb -> launch
      s.airborne = true;
      s.vy = Math.min(s.climbRate, 14);
    } else {
      s.y = gh;
      s.climbRate = Math.max(0, s.climbRate * 0.7 + Math.max(0, climb) * 0.3);
    }
  }

  // wheel + visual smoothing
  s.wheelSpin += (vf / 0.26) * dt;
  const targetSteer = (input.steer || 0) * 0.5;
  s.steerVis += (targetSteer - s.steerVis) * Math.min(1, dt * 10);

  return s;
}

// Circle vs AABB list collision. boxes: [{x,z,hx,hz}]. Mutates s, returns true if hit.
export function resolveCollisions(s, radius, boxes) {
  let hit = false;
  for (const b of boxes) {
    const cx = Math.max(b.x - b.hx, Math.min(s.x, b.x + b.hx));
    const cz = Math.max(b.z - b.hz, Math.min(s.z, b.z + b.hz));
    const dx = s.x - cx, dz = s.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      const d = Math.sqrt(d2) || 1e-4;
      const push = (radius - d) / d;
      s.x += dx * push; s.z += dz * push;
      // kill the velocity component into the wall
      const nx = dx / d, nz = dz / d;
      const vn = s.vx * nx + s.vz * nz;
      if (vn < 0) {
        s.vx -= vn * nx * 1.6; s.vz -= vn * nz * 1.6;
        s.vx *= 0.55; s.vz *= 0.55;
        s.lastImpact = Math.min(1, -vn / 12);
      }
    }
  }
  return hit;
}
