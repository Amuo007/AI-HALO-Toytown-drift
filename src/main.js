import * as THREE from 'three';
import { loadModel, cloneModel, toyUrl } from './assets.js';
import { VEHICLES, createCarState, stepCar, resolveCollisions } from './car.js';
import { sampleInput } from './input.js';
import { generateWorld } from './village.js';
import { buildWorld } from './world.js';

const params = new URLSearchParams(location.search);
const demo = params.get('demo') === '1';
const demoView = params.get('view') || 'car';

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
scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x8a9a6a, 1.4));

// --- ground ---
const groundMat = new THREE.MeshLambertMaterial({ color: 0x7fb069 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
ground.visible = false; // replaced by world terrain
scene.add(ground);

// --- world ---
const layout = generateWorld(7);
let world = null;
buildWorld(scene, layout).then(w => {
  world = w;
  groundMeshes.length = 0;
  groundMeshes.push(...w.groundMeshes);
  colliders.push(...w.colliders);
});

// --- car ---
const CAR_SCALE = 2.0;          // toy kit is small; scale up to village scale
const CAR_LIFT = 0.13 * CAR_SCALE; // model origin sits above wheel bottom
const stats = VEHICLES[0];
let carObj = null, wheels = {};
const carState = createCarState(stats, layout.spawn.x, layout.spawn.z, layout.spawn.heading);

const raycaster = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);
const groundMeshes = [ground];
function groundHeight(x, z) {
  raycaster.set(new THREE.Vector3(x, 80, z), down);
  const hits = raycaster.intersectObjects(groundMeshes, false);
  return hits.length ? hits[0].point.y : 0;
}

loadModel(toyUrl(stats.id)).then(entry => {
  carObj = cloneModel(entry);
  carObj.scale.setScalar(CAR_SCALE);
  carObj.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  carObj.traverse(o => {
    if (o.name && o.name.startsWith('wheel-')) wheels[o.name] = o;
  });
  scene.add(carObj);
});

const colliders = []; // filled by world builder later

// --- camera ---
let orbitMode = false;
let orbitAngle = 0.6;
window.addEventListener('keyaction', e => { if (e.detail === 'KeyC') orbitMode = !orbitMode; });

const clock = new THREE.Clock();
const hudSpeed = document.getElementById('speed');
document.getElementById('hud').classList.remove('hidden');
if (demo) document.getElementById('garage').classList.add('hidden');

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
  const inp = sampleInput();
  stepCar(carState, stats, inp, dt, groundHeight);
  resolveCollisions(carState, 0.9, colliders);

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
  if (world) world.update(dt, 0);
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
