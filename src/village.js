// Pure village/world layout generator from a seed. No Three.js imports.
// All coordinates are in world meters. Town kit scale T=2.5, toy kit scale=2.

export const T = 2.5;   // town-kit scale (1 model unit = 2.5 m)
export const K = 2.0;   // toy-kit scale
export const CELL = T;  // one town-kit tile = 2.5 m

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROAD_LINES = [-36, -12, 12, 36];
const VILLAGE_R = 46;

export function generateWorld(seed = 1) {
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];

  const roads = [];       // {x,z} tile centers for road.glb
  const props = [];       // {model,x,z,rot,y,scale} generic town-kit placements
  const houses = [];      // {pieces:[...], box:{x,z,hx,hz}}
  const scenery = [];     // {model,x,z,rot,scale} trees/rocks/hedges/fences
  const collectibles = []; // {type,x,z}
  const boxes = [];       // extra collision boxes

  // ---- road network (grid) ----
  const tileSet = new Set();
  const addTile = (x, z) => { const k = `${x.toFixed(1)},${z.toFixed(1)}`; if (!tileSet.has(k)) { tileSet.add(k); roads.push({ x, z }); } };
  for (const line of ROAD_LINES) {
    for (let t = -VILLAGE_R; t <= VILLAGE_R; t += CELL) {
      for (const off of [-CELL, 0, CELL]) {
        addTile(line + off, t);   // vertical roads
        addTile(t, line + off);   // horizontal roads
      }
    }
  }

  // ---- town square (center block) ----
  const plaza = [];
  for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) plaza.push({ model: 'planks', x: i * CELL, z: j * CELL, rot: 0 });
  props.push(...plaza);
  props.push({ model: 'fountain-round', x: 0, z: 0, rot: 0 });
  props.push({ model: 'fountain-round-detail', x: 0, z: 0, rot: 0 });
  boxes.push({ x: 0, z: 0, hx: 2.6, hz: 2.6 });
  // market stalls + carts + benches around the square
  const stallModels = ['stall-red', 'stall-green', 'stall-red', 'stall-green'];
  const stallPos = [[-7, -7, 0.78], [7, -7, -0.78], [-7, 7, 2.35], [7, 7, -2.35]];
  stallPos.forEach(([sx, sz, rot], i) => {
    props.push({ model: stallModels[i], x: sx, z: sz, rot });
    boxes.push({ x: sx, z: sz, hx: 1.4, hz: 1.4 });
    props.push({ model: 'stall-bench', x: sx + Math.sin(rot) * 2, z: sz + Math.cos(rot) * 2, rot });
  });
  props.push({ model: 'cart', x: -3, z: 9, rot: 1.2 });
  props.push({ model: 'cart-high', x: 4, z: -9, rot: -2 });
  boxes.push({ x: -3, z: 9, hx: 1.2, hz: 1.2 }, { x: 4, z: -9, hx: 1.2, hz: 1.2 });
  // lanterns + banners at square corners
  for (const [lx, lz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
    props.push({ model: 'lantern', x: lx, z: lz, rot: 0 });
    props.push({ model: 'poles', x: lx + 1.5, z: lz, rot: 0 });
    props.push({ model: pick(['banner-red', 'banner-green']), x: lx + 1.5, z: lz, rot: rng() * Math.PI * 2 });
    boxes.push({ x: lx, z: lz, hx: 0.4, hz: 0.4 });
  }
  // coin ring around the fountain
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
    collectibles.push({ type: 'gold', x: Math.sin(a) * 5.5, z: Math.cos(a) * 5.5 });
  }

  // ---- houses in the 8 outer blocks ----
  const blockCenters = [];
  for (const bx of [-24, 0, 24]) for (const bz of [-24, 0, 24]) {
    if (bx === 0 && bz === 0) continue; // square
    blockCenters.push([bx, bz]);
  }
  const stoneWalls = { wall: 'wall', door: 'wall-door', win: 'wall-window-shutters', corner: 'wall-corner', block: 'wall-block' };
  const woodWalls = { wall: 'wall-wood', door: 'wall-wood-door', win: 'wall-wood-window-shutters', corner: 'wall-wood-corner', block: 'wall-wood-block' };

  function house(cx, cz) {
    const style = rng() < 0.5 ? stoneWalls : woodWalls;
    const w = 3 + Math.floor(rng() * 2);   // 3-4 cells
    const d = 3 + Math.floor(rng() * 2);
    const floors = rng() < 0.45 ? 2 : 1;
    const W = w * CELL, D = d * CELL;
    const pieces = [];
    const wallY = (f) => f * T;
    for (let f = 0; f < floors; f++) {
      const y = wallY(f);
      // north / south walls
      for (let i = 0; i < w; i++) {
        const x = cx - W / 2 + (i + 0.5) * CELL;
        const mid = i === Math.floor(w / 2);
        pieces.push({ model: (f === 0 && mid) ? style.door : (rng() < 0.4 ? style.win : style.wall), x, z: cz + D / 2, rot: -Math.PI / 2, y });
        pieces.push({ model: rng() < 0.4 ? style.win : style.wall, x, z: cz - D / 2, rot: Math.PI / 2, y });
      }
      // east / west walls
      for (let j = 0; j < d; j++) {
        const z = cz - D / 2 + (j + 0.5) * CELL;
        pieces.push({ model: rng() < 0.4 ? style.win : style.wall, x: cx + W / 2, z, rot: 0, y });
        pieces.push({ model: rng() < 0.4 ? style.win : style.wall, x: cx - W / 2, z, rot: Math.PI, y });
      }
      // corner posts
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        pieces.push({ model: style.corner, x: cx + sx * W / 2, z: cz + sz * D / 2, rot: 0, y });
      }
      // floor slab
      if (f > 0) for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
        pieces.push({ model: 'planks', x: cx - W / 2 + (i + 0.5) * CELL, z: cz - D / 2 + (j + 0.5) * CELL, rot: 0, y: wallY(f) });
      }
    }
    // gable roof, ridge along z
    const roofY = wallY(floors);
    const midI = Math.floor(w / 2);
    for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
      const x = cx - W / 2 + (i + 0.5) * CELL, z = cz - D / 2 + (j + 0.5) * CELL;
      let model = 'roof-gable';
      if (i === midI) model = (j === 0 || j === d - 1) ? 'roof-gable-end' : 'roof-gable-top';
      pieces.push({ model, x, z, rot: 0, y: roofY });
    }
    if (rng() < 0.5) pieces.push({ model: 'chimney', x: cx + W / 4, z: cz, rot: 0, y: roofY + 0.3 });
    houses.push({ pieces, box: { x: cx, z: cz, hx: W / 2 + 0.4, hz: D / 2 + 0.4 } });
  }

  for (const [bx, bz] of blockCenters) {
    const spots = [[-6, -6], [6, -6], [-6, 6], [6, 6]];
    for (const [ox, oz] of spots) {
      if (rng() < 0.8) house(bx + ox, bz + oz);
    }
  }

  // ---- windmill on a hill ----
  const windmill = { x: -72, z: -78, rot: 0.6 };
  const hill = { x: -72, z: -78, r: 22, h: 8 };
  // ---- stream + watermill ----
  const stream = { x: 84, z: 0, width: 7, len: 150 };
  const watermill = { x: 91.5, z: 18, rot: Math.PI / 2 };
  const layout0 = { hill, stream };
  // tower: stacked stone blocks + point roof, sitting on the hill
  const wm = [];
  const tiers = [[1, 3], [2, 2], [3, 1]]; // [floor, half-size in cells]
  for (const [f, hs] of tiers) {
    for (let i = -hs + 1; i < hs; i++) for (let j = -hs + 1; j < hs; j++) {
      const bx = windmill.x + i * CELL * 0.9, bz = windmill.z + j * CELL * 0.9;
      wm.push({ model: 'wall-block', x: bx, z: bz, rot: 0, y: terrainHeight(bx, bz, layout0) + (f - 1) * T });
    }
  }
  wm.push({ model: 'roof-point', x: windmill.x, z: windmill.z, rot: 0, y: terrainHeight(windmill.x, windmill.z, layout0) + 3 * T });
  props.push(...wm);
  boxes.push({ x: windmill.x, z: windmill.z, hx: 3, hz: 3 });

  const millPieces = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    millPieces.push({ model: (i + j) % 2 ? 'wall-wood-block' : 'wall-block', x: watermill.x + (i - 1) * CELL, z: watermill.z + (j - 1) * CELL, rot: 0, y: 0 });
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    millPieces.push({ model: j === 1 ? 'roof-gable-top' : 'roof-gable', x: watermill.x + (i - 1) * CELL, z: watermill.z + (j - 1) * CELL, rot: Math.PI / 2, y: T });
  }
  props.push(...millPieces);
  boxes.push({ x: watermill.x, z: watermill.z, hx: 4, hz: 4 });

  // ---- countryside scenery ----
  const treeModels = ['tree', 'tree-high', 'tree-crooked', 'tree-high-round', 'tree-high-crooked'];
  const near = (x, z, cx, cz, r) => Math.hypot(x - cx, z - cz) < r;
  let placed = 0, guard = 0;
  while (placed < 170 && guard++ < 3000) {
    const x = (rng() * 2 - 1) * 260, z = (rng() * 2 - 1) * 260;
    if (Math.abs(x) < VILLAGE_R + 6 && Math.abs(z) < VILLAGE_R + 6) continue;
    if (near(x, z, windmill.x, windmill.z, hill.r + 4)) continue;
    if (Math.abs(x - stream.x) < stream.width + 6) continue;
    if (near(x, z, 0, 120, 60)) continue; // stunt park area
    const onRoad = ROAD_LINES.some(l => Math.abs(x - l) < 5 || Math.abs(z - l) < 5);
    if (onRoad && Math.abs(x) < VILLAGE_R && Math.abs(z) < VILLAGE_R) continue;
    const r = rng();
    if (r < 0.62) scenery.push({ model: pick(treeModels), x, z, rot: rng() * 6.28, scale: 0.8 + rng() * 0.6 });
    else if (r < 0.8) scenery.push({ model: pick(['rock-small', 'rock-large', 'rock-wide']), x, z, rot: rng() * 6.28, scale: 0.7 + rng() * 0.7 });
    else if (r < 0.9) scenery.push({ model: 'hedge', x, z, rot: rng() * 6.28, scale: 1 });
    else scenery.push({ model: 'fence', x, z, rot: rng() < 0.5 ? 0 : Math.PI / 2, scale: 1 });
    placed++;
  }
  // hedges + fences lining a couple of village roads
  for (const line of [-36, 36]) {
    for (let t = -40; t <= 40; t += CELL) {
      if (rng() < 0.5) scenery.push({ model: 'fence', x: line + 4.5, z: t, rot: 0, scale: 1 });
      if (rng() < 0.5) scenery.push({ model: 'hedge', x: line - 4.5, z: t, rot: Math.PI / 2, scale: 1 });
    }
  }

  // ---- coins along the roads ----
  for (const line of ROAD_LINES) {
    for (let t = -40; t <= 40; t += 8) {
      const type = rng() < 0.2 ? 'gold' : rng() < 0.5 ? 'silver' : 'bronze';
      collectibles.push({ type, x: line, z: t });
      collectibles.push({ type, x: t, z: line });
    }
  }
  for (let i = 0; i < 8; i++) collectibles.push({ type: 'box', x: (rng() * 2 - 1) * 40, z: (rng() * 2 - 1) * 40 });
  for (let i = 0; i < 6; i++) collectibles.push({ type: 'banana', x: (rng() * 2 - 1) * 44, z: (rng() * 2 - 1) * 44 });

  const spawn = { x: 0, z: -40, heading: 0 };

  return { roads, props, houses, scenery, collectibles, boxes, windmill, hill, stream, watermill, spawn, ROAD_LINES, VILLAGE_R };
}

// Terrain height (analytic, used for the ground mesh and for flatness checks).
export function terrainHeight(x, z, layout) {
  let h = 0;
  const { hill, stream } = layout;
  const d = Math.hypot(x - hill.x, z - hill.z);
  if (d < hill.r) h += hill.h * Math.pow(Math.cos((d / hill.r) * Math.PI / 2), 2);
  // gentle countryside undulation far from village
  const far = Math.max(0, (Math.max(Math.abs(x), Math.abs(z)) - 60) / 60);
  h += far * (Math.sin(x * 0.02) * Math.cos(z * 0.017) * 3.5);
  // carve the stream bed and flatten its banks
  if (stream) {
    const sd = Math.abs(x - stream.x);
    if (sd < 14 && Math.abs(z) < stream.len / 2 + 10) {
      const k = Math.min(1, Math.max(0, (sd - 4) / 10));
      h = h * k - (1 - k) * 0.9;
    }
  }
  return h;
}
