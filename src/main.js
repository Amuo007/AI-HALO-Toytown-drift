import * as THREE from 'three';
import { loadModel, cloneModel, toyUrl } from './assets.js';
import { VEHICLES, createCarState, stepCar, resolveCollisions } from './car.js';
import { sampleInput } from './input.js';
import { generateWorld } from './village.js';
import { buildWorld } from './world.js';
import { buildCollectibles } from './entities.js';
import { createHUD } from './hud.js';
import { createItemState, checkPickups, createTrial, stepTrial } from './collectibles.js';
import { createSmoke } from './fx.js';
import { initAudio, setEngine, sfx } from './audio.js';
import { createAutopilot } from './autopilot.js';

const params = new URLSearchParams(location.search);
const demo = params.get('demo') === '1';
const demoView = params.get('view') || 'car';
const auto = params.get('auto') === '1';
let autoStarted = false;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b5e0);
scene.fog = new THREE.Fog(0x87b5e0, 120, 420);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1200);
camera.position.set(0, 8, -14);

// --- lighting ---
const sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0006;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x8a9a6a, 1.4);
scene.add(hemi);

// --- day/night cycle ---
const DAY_LEN = 240;
const dayParam = parseFloat(params.get('day'));
let dayT = Number.isFinite(dayParam) ? dayParam : 0.22;
const skyDay = new THREE.Color(0x87b5e0), skyNight = new THREE.Color(0x0c1330);
const sunDay = new THREE.Color(0xfff2d8), sunNight = new THREE.Color(0x5a6a9a);
const tmpSky = new THREE.Color();
let night = 0;

// --- ground ---
const groundMat = new THREE.MeshLambertMaterial({ color: 0x7fb069 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.visible = false; // replaced by world terrain
scene.add(ground);

// --- world ---
const layout = generateWorld(7);
const autopilot = auto && layout.park ? createAutopilot(layout.park.centerline) : null;
let world = null;
const smoke = createSmoke(scene);
let prevImpact = 0;
const items = createItemState(layout.collectibles);
const trial = createTrial();
try { trial.best = parseFloat(localStorage.getItem('toytown-best')) || null; } catch (e) {}
let collectibles = null;
const hud = createHUD(layout);
let coinCount = 0;
buildWorld(scene, layout).then(async w => {
  world = w;
  groundMeshes.length = 0;
  groundMeshes.push(...w.groundMeshes);
  colliders.push(...w.colliders);
  collectibles = await buildCollectibles(scene, items);
});

// --- car ---
const CAR_SCALE = 2.0;          // toy kit is small; scale up to village scale
const CAR_LIFT = 0.13 * CAR_SCALE; // model origin sits above wheel bottom
let stats = VEHICLES[0];
let carObj = null, wheels = {};
let carState = createCarState(stats, layout.spawn.x, layout.spawn.z, layout.spawn.heading);
let started = demo, paused = false;

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const groundMeshes = [ground];
function groundHeight(x, z) {
  raycaster.set(new THREE.Vector3(x, 80, z), down);
  const hits = raycaster.intersectObjects(groundMeshes, false);
  return hits.length ? hits[0].point.y : 0;
}

function loadCar(v) {
  stats = v;
  const p = loadModel(toyUrl(v.id)).then(entry => {
    if (carObj) { scene.remove(carObj); }
    wheels = {};
    carObj = cloneModel(entry);
    carObj.scale.setScalar(CAR_SCALE);
    carObj.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
    carObj.traverse(o => {
      if (o.name && o.name.startsWith('wheel-')) wheels[o.name] = o;
    });
    scene.add(carObj);
  });
  return p;
}
loadCar(stats);

const colliders = []; // filled by world builder later

// --- camera ---
let orbitMode = false;
let orbitAngle = 0.6;
window.addEventListener('keyaction', e => { if (e.detail === 'KeyC') orbitMode = !orbitMode; });

const clock = new THREE.Clock();
const hudSpeed = document.getElementById('speed');
const hudEl = document.getElementById('hud');
const garageEl = document.getElementById('garage');
const pauseEl = document.getElementById('pause');
if (demo) { garageEl.classList.add('hidden'); hudEl.classList.remove('hidden'); }

// --- garage ---
let selected = 0;
const carlist = document.getElementById('carlist');
VEHICLES.forEach((v, i) => {
  const card = document.createElement('div');
  card.className = 'carcard' + (i === 0 ? ' sel' : '');
  const bar = (lbl, val) => `<div class="bar"><i style="width:${Math.round(val * 100)}%"></i></div><div class="lbl">${lbl}</div>`;
  card.innerHTML = `<div class="swatch" style="--c:${v.color}"></div><div class="nm">${v.name}</div>` +
    bar('Speed', v.maxSpeed / 38) + bar('Accel', v.accel / 24) + bar('Grip', v.grip / 9);
  card.onclick = () => {
    selected = i;
    carlist.querySelectorAll('.carcard').forEach((c, j) => c.classList.toggle('sel', j === i));
  };
  carlist.appendChild(card);
});

function resetRun() {
  carState = createCarState(stats, layout.spawn.x, layout.spawn.z, layout.spawn.heading);
  coinCount = 0;
  for (const it of items) it.taken = false;
  trial.phase = 'idle'; trial.t = 0; trial.crossedStart = false;
}
function startGame() {
  initAudio();
  loadCar(VEHICLES[selected]).then(() => {
    resetRun();
    garageEl.classList.add('hidden');
    pauseEl.classList.add('hidden');
    hudEl.classList.remove('hidden');
    started = true; paused = false;
  });
}
document.getElementById('startbtn').onclick = startGame;
document.getElementById('resumebtn').onclick = () => { paused = false; pauseEl.classList.add('hidden'); };
document.getElementById('changecarbtn').onclick = () => {
  paused = true;
  pauseEl.classList.add('hidden');
  garageEl.classList.remove('hidden');
};
document.getElementById('restartbtn').onclick = () => { resetRun(); paused = false; pauseEl.classList.add('hidden'); };
window.addEventListener('keyaction', e => {
  if (e.detail !== 'Escape' || demo || !started) return;
  paused = !paused;
  pauseEl.classList.toggle('hidden', !paused);
});

function updateCamera(dt) {
  if (demo && demoView === 'village') {
    const t = clock.elapsedTime * 0.05;
    camera.position.set(Math.sin(t) * 70, 45, Math.cos(t) * 70);
    camera.lookAt(0, 0, 0);
    return;
  }
  if (demo && demoView === 'windmill') {
    const a = layout.windmill.rot;
    camera.position.set(layout.windmill.x + Math.cos(a) * 26, layout.hill.h + 10, layout.windmill.z - Math.sin(a) * 26);
    camera.lookAt(layout.windmill.x, layout.hill.h + 8, layout.windmill.z);
    return;
  }
  if (demo && demoView === 'watermill') {
    camera.position.set(layout.stream.x - 18, 8, layout.watermill.z + 16);
    camera.lookAt(layout.stream.x, 2, layout.watermill.z);
    return;
  }
  if (demo && demoView === 'park') {
    camera.position.set(-26, 70, 118);
    camera.lookAt(-26, 0, 118);
    return;
  }
  if (!carObj) return;
  if (orbitMode) {
    orbitAngle += dt * 0.4;
    const r = 10;
    camera.position.set(carState.x + Math.sin(orbitAngle) * r, carState.y + 5, carState.z + Math.cos(orbitAngle) * r);
    camera.lookAt(carState.x, carState.y + 1, carState.z);
    return;
  }
  const h = carState.heading;
  const back = new THREE.Vector3(carState.x - Math.sin(h) * 6.5, carState.y + 3.4, carState.z - Math.cos(h) * 6.5);
  camera.position.lerp(back, Math.min(1, dt * 5));
  camera.lookAt(carState.x + Math.sin(h) * 3, carState.y + 1, carState.z + Math.cos(h) * 3);
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (auto && !autoStarted && carObj && world) {
    carState = createCarState(stats, -40, 100, Math.PI / 2);
    autoStarted = true;
  }
  if (!window.__ready && carObj && world && collectibles) {
    window.__ready = true;
    Object.defineProperty(window, '__car', { get: () => carState });
  }
  if (started && !paused) {
    const inp = autopilot && autoStarted ? autopilot(carState) : sampleInput();
    const prev = { x: carState.x, z: carState.z };
    stepCar(carState, stats, inp, dt, groundHeight);
    resolveCollisions(carState, 0.9, colliders);

    // collectibles
    if (collectibles) {
      for (const ev of checkPickups(carState, items)) {
        if (ev.type === 'coin' || ev.type === 'box') { coinCount += ev.points; hud.showBanner('+' + ev.points); sfx('coin'); }
        if (ev.type === 'banana') { carState.spinout = 1.1; hud.showBanner('BANANA!'); sfx('banana'); }
      }
      collectibles.update(clock.elapsedTime);
    }
    // time trial
    if (layout.park) {
      const ev = stepTrial(trial, carState, prev, layout.park.gates, dt);
      if (ev === 'start') hud.showBanner('GO!', 900);
      if (ev === 'finish') {
        hud.showBanner('FINISH! ' + trial.best.toFixed(2) + 's');
        sfx('finish');
        try { localStorage.setItem('toytown-best', String(trial.best)); } catch (e) {}
      }
    }
    // drift smoke + engine audio + crash sfx
    if (carState.drifting && carState.grounded && Math.abs(carState.speed) > 6) {
      smoke.emit(carState.x - Math.sin(carState.heading) * 0.8, carState.y, carState.z - Math.cos(carState.heading) * 0.8, dt);
    }
    if (carState.lastImpact > prevImpact + 0.02) sfx('crash');
    prevImpact = carState.lastImpact;
    setEngine(Math.min(1, Math.abs(carState.speed) / stats.maxSpeed), inp.throttle || 0, carState.drifting);
  }
  smoke.update(dt);
  // day/night
  dayT = (dayT + dt / DAY_LEN) % 1;
  const elev = Math.sin(dayT * Math.PI * 2);
  const dayF = THREE.MathUtils.clamp(elev * 2.2, 0, 1);
  night = 1 - dayF;
  sun.intensity = 0.3 + 2.1 * dayF;
  sun.color.copy(sunNight).lerp(sunDay, dayF);
  hemi.intensity = 0.35 + 1.05 * dayF;
  tmpSky.copy(skyNight).lerp(skyDay, dayF);
  scene.background.copy(tmpSky);
  scene.fog.color.copy(tmpSky);
  sun.position.set(carState.x + Math.cos(dayT * Math.PI * 2) * 70, 25 + elev * 85, carState.z + 35);

  if (carObj) {
    carObj.position.set(carState.x, carState.y + CAR_LIFT, carState.z);
    carObj.rotation.y = carState.heading;
    for (const [name, w] of Object.entries(wheels)) {
      w.rotation.order = 'YXZ';
      if (name.includes('fl') || name.includes('fr')) w.rotation.y = carState.steerVis;
      w.rotation.x = -carState.wheelSpin;
    }
  }
  hudSpeed.textContent = Math.round(Math.abs(carState.speed) * 3.6);
  hud.update(carState, coinCount, trial);
  if (world) world.update(dt, night);
  if (world) { sun.target.position.set(carState.x, 0, carState.z); sun.target.updateMatrixWorld(); }
  updateCamera(dt);
  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
