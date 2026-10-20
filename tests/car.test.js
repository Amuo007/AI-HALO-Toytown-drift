import test from 'node:test';
import assert from 'node:assert/strict';
import { VEHICLES, createCarState, stepCar, resolveCollisions } from '../src/car.js';

const flat = () => 0;
const stats = VEHICLES[0];
const none = { throttle: 0, steer: 0, handbrake: false };

test('all 8 vehicles have distinct stats', () => {
  assert.equal(VEHICLES.length, 8);
  const ids = new Set(VEHICLES.map(v => v.id));
  assert.equal(ids.size, 8);
  for (const v of VEHICLES) {
    assert.ok(v.maxSpeed > 0 && v.accel > 0 && v.grip > 0 && v.mass > 0);
  }
});

test('throttle accelerates up to max speed', () => {
  const s = createCarState(stats);
  for (let i = 0; i < 600; i++) stepCar(s, stats, { ...none, throttle: 1 }, 1 / 60, flat);
  assert.ok(s.speed > stats.maxSpeed * 0.9, `speed ${s.speed}`);
  assert.ok(s.speed <= stats.maxSpeed + 0.01);
});

test('braking stops and reverses', () => {
  const s = createCarState(stats);
  s.vx = 10; s.speed = 10;
  for (let i = 0; i < 120; i++) stepCar(s, stats, { ...none, throttle: -1 }, 1 / 60, flat);
  assert.ok(s.speed < 0, 'should be reversing');
});

test('steering turns the heading while moving', () => {
  const s = createCarState(stats);
  const h0 = s.heading;
  for (let i = 0; i < 60; i++) stepCar(s, stats, { throttle: 1, steer: 1, handbrake: false }, 1 / 60, flat);
  assert.ok(s.heading > h0 + 0.5, `heading ${s.heading}`);
});

test('no steering when stopped', () => {
  const s = createCarState(stats);
  for (let i = 0; i < 30; i++) stepCar(s, stats, { throttle: 0, steer: 1, handbrake: false }, 1 / 60, flat);
  assert.equal(s.heading, 0);
});

test('handbrake reduces grip so lateral velocity persists (drift)', () => {
  const gripDrift = (hb) => {
    const s = createCarState(stats);
    s.vx = 12; s.speed = 12;
    for (let i = 0; i < 20; i++) stepCar(s, stats, { throttle: 0, steer: 0.8, handbrake: hb }, 1 / 60, flat);
    // lateral speed = component perpendicular to heading
    const lat = Math.abs(-Math.cos(s.heading) * s.vx + Math.sin(s.heading) * s.vz);
    return lat;
  };
  assert.ok(gripDrift(true) > gripDrift(false), 'handbrake should leave more lateral slip');
});

test('car falls and rests on raised ground', () => {
  const s = createCarState(stats);
  s.y = 10;
  const step5 = () => stepCar(s, stats, none, 1 / 60, () => 5);
  for (let i = 0; i < 120; i++) step5();
  assert.ok(Math.abs(s.y - 5) < 0.01, `y=${s.y}`);
  assert.ok(!s.airborne);
});

test('launches off a ramp and lands', () => {
  const s = createCarState(stats, 0, 0, Math.PI / 2);
  s.speed = 20; s.vx = 20;
  const gh = (x) => (x < 24) ? Math.max(0, x) * 0.5 : 0;
  let launched = false;
  for (let i = 0; i < 400; i++) {
    stepCar(s, stats, { throttle: 1, steer: 0, handbrake: false }, 1 / 60, (x) => gh(x));
    if (s.airborne) launched = true;
    if (launched && !s.airborne) break;
  }
  assert.ok(launched, 'should have gone airborne off the ramp');
});

test('spinout decays to zero', () => {
  const s = createCarState(stats);
  s.spinout = 1;
  const h0 = s.heading;
  for (let i = 0; i < 120; i++) stepCar(s, stats, none, 1 / 60, flat);
  assert.equal(s.spinout, 0);
  assert.ok(s.heading > h0 + 3);
});

test('collisions push the car out of a box', () => {
  const s = createCarState(stats, 0, 0, 0);
  s.vx = 8; s.speed = 8;
  const boxes = [{ x: 0, z: 6, hx: 1, hz: 1 }];
  for (let i = 0; i < 60; i++) {
    stepCar(s, stats, { throttle: 1, steer: 0, handbrake: false }, 1 / 60, flat);
    resolveCollisions(s, 0.9, boxes);
  }
  assert.ok(s.z < 6 - 1 + 0.9 + 0.01, `z=${s.z}`);
  assert.ok(Math.abs(s.speed) < 8);
});
