import * as THREE from 'three';

const N = 48;
export function createSmoke(scene) {
  const geo = new THREE.SphereGeometry(0.22, 6, 5);
  const pool = [];
  for (let i = 0; i < N; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0 }));
    m.visible = false;
    scene.add(m);
    pool.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  let cursor = 0, spawnAcc = 0;
  return {
    emit(x, y, z, dt) {
      spawnAcc += dt * 30;
      while (spawnAcc >= 1) {
        spawnAcc -= 1;
        const p = pool[cursor]; cursor = (cursor + 1) % N;
        p.life = 0.7;
        p.vx = (Math.random() - 0.5) * 1.2; p.vy = 1.2 + Math.random(); p.vz = (Math.random() - 0.5) * 1.2;
        p.mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.1, z + (Math.random() - 0.5) * 0.4);
        p.mesh.visible = true;
      }
    },
    update(dt) {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.mesh.visible = false; continue; }
        const k = p.life / 0.7;
        p.mesh.material.opacity = k * 0.5;
        p.mesh.scale.setScalar(1 + (1 - k) * 2.2);
        p.mesh.position.x += p.vx * dt; p.mesh.position.y += p.vy * dt; p.mesh.position.z += p.vz * dt;
      }
    },
  };
}
