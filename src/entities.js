import * as THREE from 'three';
import { loadModel, cloneModel, toyUrl } from './assets.js';

const TYPES = ['gold', 'silver', 'bronze', 'box', 'banana'];
const MODEL = { gold: 'item-coin-gold', silver: 'item-coin-silver', bronze: 'item-coin-bronze', box: 'item-box', banana: 'item-banana' };
const SCALE = 2.0;

export async function buildCollectibles(scene, items) {
  const groups = {};
  for (const t of TYPES) {
    const entry = await loadModel(toyUrl(MODEL[t]));
    const members = items.filter(i => i.type === t);
    const geo = (() => { let g = null; cloneModel(entry).traverse(o => { if (o.isMesh && !g) g = o.geometry; }); return g; })();
    const mat = (() => { let m = null; cloneModel(entry).traverse(o => { if (o.isMesh && !m) m = o.material; }); return m; })();
    const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, members.length));
    inst.castShadow = true;
    inst.userData.members = members;
    scene.add(inst);
    groups[t] = { inst, members, entry };
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const zero = new THREE.Vector3(0, 0, 0);

  function update(time) {
    for (const t of TYPES) {
      const g = groups[t];
      g.members.forEach((it, i) => {
        if (it.taken) { m4.compose(v.set(it.x, -50, it.z), q.identity(), zero); }
        else {
          const spin = t === 'box' ? time * 1.5 : time * 3;
          e.set(t.startsWith('gold') || t === 'silver' || t === 'bronze' ? Math.PI / 2 : 0, spin, 0);
          const bob = Math.sin(time * 2 + i) * 0.12;
          m4.compose(v.set(it.x, it.y + 0.7 + bob, it.z), q.setFromEuler(e), one.setScalar(SCALE));
        }
        g.inst.setMatrixAt(i, m4);
      });
      g.inst.instanceMatrix.needsUpdate = true;
    }
  }
  update(0);
  return { groups, update };
}
