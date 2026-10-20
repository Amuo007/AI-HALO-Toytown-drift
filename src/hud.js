import { formatTime } from './collectibles.js';

const el = (id) => document.getElementById(id);

export function createHUD(layout) {
  const coinsEl = el('coins');
  const timerEl = el('timerbox');
  const timerVal = el('timer');
  const banner = el('banner');
  const mm = el('minimap');
  const ctx = mm.getContext('2d');
  const S = 170, WORLD = 340; // world spans -170..170 on the map
  const toMap = (x, z) => [(x / WORLD + 0.5) * S, (0.5 - z / WORLD) * S];

  let bannerTimer = null;
  function showBanner(text, ms = 1600) {
    banner.textContent = text;
    banner.style.opacity = 1;
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.style.opacity = 0, ms);
  }

  function update(car, coins, trial) {
    coinsEl.textContent = coins;
    if (trial.phase !== 'idle') {
      timerEl.classList.remove('hidden');
      timerEl.classList.toggle('best', trial.phase === 'done');
      timerVal.textContent = trial.phase === 'done'
        ? 'BEST ' + formatTime(trial.best)
        : formatTime(trial.t);
    } else if (trial.best !== null) {
      timerEl.classList.remove('hidden');
      timerEl.classList.add('best');
      timerVal.textContent = 'BEST ' + formatTime(trial.best);
    }
    // minimap
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(120,160,100,.5)';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(230,230,240,.8)';
    ctx.lineWidth = 3;
    for (const line of layout.ROAD_LINES) {
      let [x0, y0] = toMap(line, -46), [x1, y1] = toMap(line, 46);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      [x0, y0] = toMap(-46, line); [x1, y1] = toMap(46, line);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
    if (layout.park) {
      const r = layout.park.rect;
      const [px, py] = toMap(r.x0, r.z1);
      const [px2, py2] = toMap(r.x1, r.z0);
      ctx.strokeStyle = '#ffb040';
      ctx.strokeRect(px, py, px2 - px, py2 - py);
    }
    ctx.fillStyle = '#ffe27a';
    for (const it of layout.collectibles) {
      if (it.taken || it.type === 'banana') continue;
      const [x, y] = toMap(it.x, it.z);
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    const [cx, cy] = toMap(car.x, car.z);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-car.heading);
    ctx.fillStyle = '#ff5040';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  return { update, showBanner };
}
