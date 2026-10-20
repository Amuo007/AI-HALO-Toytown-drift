import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModel, cloneModel, townUrl, toyUrl } from './assets.js';
import { T as TSCALE, K as KSCALE, terrainHeight } from './village.js';

// Build the whole static world from a layout. Returns handles for animation + collision.
export async function buildWorld(scene, layout) {
  const colliders = [...layout.boxes];
  for (const h of layout.houses) colliders.push(h.box);
  for (const s of layout.scenery) {
    if (s.model.startsWith('tree') || s.model.startsWith('rock')) {
      const r = s.model.startsWith('rock') ? 0.9 : 0.7;
      colliders.push({ x: s.x, z: s.z, hx: r * s.scale, hz: r * s.scale });
    }
  }

  // ---- terrain ----
  const terrGeo = new THREE.PlaneGeometry(900, 900, 160, 160);
  terrGeo.rotateX(-Math.PI / 2);
  const pos = terrGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i), layout));
  }
  terrGeo.computeVertexNormals();
  const terrain = new THREE.Mesh(terrGeo, new THREE.MeshLambertMaterial({ color: 0x7fb069 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---- water (stream) ----
  const st = layout.stream;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(st.width, st.len),
    new THREE.MeshLambertMaterial({ color: 0x4fa4d8, transparent: true, opacity: 0.85 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(st.x, -0.15, st.z);
  scene.add(water);

  // ---- collect every static town-kit placement ----
  const placements = [];
  for (const r of layout.roads) placements.push({ model: 'road', x: r.x, z: r.z, rot: 0, y: 0 });
  for (const p of layout.props) placements.push({ model: p.model, x: p.x, z: p.z, rot: p.rot || 0, y: p.y || 0 });
  for (const h of layout.houses) for (const p of h.pieces) placements.push({ model: p.model, x: p.x, z: p.z, rot: p.rot || 0, y: p.y || 0 });
  for (const s of layout.scenery) placements.push({ model: s.model, x: s.x, z: s.z, rot: s.rot || 0, y: 0, scale: s.scale || 1 });

  const lanternPlacements = placements.filter(p => p.model === 'lantern');
  const staticPlacements = placements.filter(p => p.model !== 'lantern');

  const names = [...new Set(staticPlacements.map(p => p.model))];
  const entries = {};
  // load special animated models first, then the rest
  const special = ['lantern', 'windmill', 'watermill'];
  await Promise.all(special.map(async n => { entries[n] = await loadModel(townUrl(n)); }));
  await Promise.all(names.map(async n => { entries[n] = await loadModel(townUrl(n)); }));

  const dummy = new THREE.Object3D();
  const geoms = [];
  let material = null;
  for (const p of staticPlacements) {
    const entry = entries[p.model];
    if (!entry) continue;
    const obj = cloneModel(entry);
    obj.position.set(p.x, p.y, p.z);
    obj.rotation.y = p.rot;
    obj.scale.setScalar((p.scale || 1) * TSCALE);
    obj.updateMatrixWorld(true);
    obj.traverse(o => {
      if (o.isMesh) {
        const g = o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        geoms.push(g);
        if (!material) material = o.material;
      }
    });
  }
  const merged = mergeGeometries(geoms, false);
  geoms.forEach(g => g.dispose());
  const staticMesh = new THREE.Mesh(merged, material);
  staticMesh.castShadow = true;
  staticMesh.receiveShadow = true;
  scene.add(staticMesh);

  // ---- lanterns (separate so they can glow at night) ----
  const lanterns = [];
  try {
  const lanternEntry = await loadModel(townUrl('lantern'));
  for (const lp of lanternPlacements) {
    const obj = cloneModel(lanternEntry);
    obj.position.set(lp.x, 0, lp.z);
    obj.scale.setScalar(TSCALE);
    obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); } });
    scene.add(obj);
    const light = new THREE.PointLight(0xffc46b, 0, 14, 1.8);
    light.position.set(lp.x, 3.6, lp.z);
    scene.add(light);
    lanterns.push({ light, meshes: obj });
  }
  } catch (e) { console.error('lanterns failed', e); }

  // ---- windmill rotor ----
  const wmEntry = await loadModel(townUrl('windmill'));
  const wmGroup = new THREE.Group();
  const wmBase = terrainHeight(layout.windmill.x, layout.windmill.z, layout);
  wmGroup.position.set(layout.windmill.x, wmBase + 3 * TSCALE + 1.4, layout.windmill.z);
  wmGroup.rotation.y = layout.windmill.rot;
  const rotor = cloneModel(wmEntry);
  rotor.scale.setScalar(TSCALE);
  wmGroup.add(rotor);
  scene.add(wmGroup);

  // ---- watermill wheel ----
  const wmillEntry = await loadModel(townUrl('watermill'));
  const wheel = cloneModel(wmillEntry);
  wheel.scale.setScalar(TSCALE * 1.15);
  wheel.position.set(st.x + 4.2, 0.9, layout.watermill.z);
  scene.add(wheel);

  const groundMeshes = [terrain, staticMesh];

  // ---- stunt park (toy-kit track pieces, merged) ----
  const parkMeshes = [];
  const gateObjs = [];
  if (layout.park) {
    const parkNames = [...new Set(layout.park.pieces.map(p => p.model)), 'gate', 'gate-finish'];
    const parkEntries = {};
    await Promise.all(parkNames.map(async n => { parkEntries[n] = await loadModel(toyUrl(n)); }));
    const parkGeoms = [];
    let parkMat = null;
    const bake = (p, scale) => {
      const entry = parkEntries[p.model];
      if (!entry) return;
      const obj = cloneModel(entry);
      obj.position.set(p.x, (p.y || 0) + 2, p.z);
      obj.rotation.y = p.rot || 0;
      obj.scale.setScalar(scale);
      obj.updateMatrixWorld(true);
      obj.traverse(o => {
        if (o.isMesh) {
          const g = o.geometry.clone();
          g.applyMatrix4(o.matrixWorld);
          parkGeoms.push(g);
          if (!parkMat) parkMat = o.material;
        }
      });
    };
    for (const p of layout.park.pieces) bake(p, KSCALE);
    const mergedPark = mergeGeometries(parkGeoms, false);
    parkGeoms.forEach(g => g.dispose());
    const parkMesh = new THREE.Mesh(mergedPark, parkMat);
    parkMesh.castShadow = true;
    parkMesh.receiveShadow = true;
    scene.add(parkMesh);
    parkMeshes.push(parkMesh);
    // gates stand on the ground
    for (const key of ['start', 'finish']) {
      const g = layout.park.gates[key];
      const obj = cloneModel(parkEntries[key === 'start' ? 'gate' : 'gate-finish']);
      obj.position.set(g.x, 0, g.z);
      obj.rotation.y = g.rot;
      obj.scale.setScalar(KSCALE);
      obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(obj);
      gateObjs.push(obj);
    }
  }
  groundMeshes.push(...parkMeshes);

  function update(dt, night) {
    rotor.rotation.x += dt * 0.7;
    wheel.rotation.x += dt * 1.1;
    for (const l of lanterns) {
      l.light.intensity = night * 26;
      l.meshes.traverse(o => {
        if (o.isMesh && o.material) {
          o.material.emissive = new THREE.Color(0xffb347);
          o.material.emissiveIntensity = night * 0.9;
        }
      });
    }
  }

  return { colliders, groundMeshes, update, lanterns };
}
