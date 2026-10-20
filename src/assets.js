import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

export const TOY_DIR = 'kenney_toy-car-kit/Models/GLB%20format/';
export const TOWN_DIR = 'kenney_fantasy-town-kit_2/Models/GLB%20format/';

export function toyUrl(name) { return TOY_DIR + name + '.glb'; }
export function townUrl(name) { return TOWN_DIR + name + '.glb'; }

export function loadGLB(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej)));
  }
  return cache.get(url);
}

// Load a model once, measure it with Box3, return { scene, size, min } of the ORIGINAL.
const measured = new Map();
export async function loadModel(url) {
  if (measured.has(url)) return measured.get(url);
  const gltf = await loadGLB(url);
  const root = gltf.scene;
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(); box.getSize(size);
  const min = box.min.clone();
  const entry = { scene: root, size, min };
  measured.set(url, entry);
  return entry;
}

// Clone a cached model for repeated use.
export function cloneModel(entry) { return entry.scene.clone(true); }

// Clone and scale so the model's longest horizontal axis matches `targetLen`.
export function cloneScaled(entry, targetLen) {
  const obj = cloneModel(entry);
  const s = targetLen / Math.max(entry.size.x, entry.size.z);
  obj.scale.setScalar(s);
  return obj;
}

export function setTextureFilter(root) {
  root.traverse(o => {
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m.map) { m.map.anisotropy = 4; m.map.colorSpace = THREE.SRGBColorSpace; }
      }
    }
  });
}
