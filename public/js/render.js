// Renderização do mundo em canvas 2D (tiles procedurais, entidades, efeitos).
import { S, T, tileAt, zoneAt } from './state.js';

const TS = 32;
let cv, ctx, W = 0, H = 0, dpr = 1;
const tileCache = {};
const sprites = {};
let minimapImg = null;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mk(w = TS, h = TS) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function speckle(g, r, base, cols, n, size = 2) {
  g.fillStyle = base; g.fillRect(0, 0, TS, TS);
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.fillRect(Math.floor(r() * TS), Math.floor(r() * TS), size, size);
  }
}

function drawTile(t, v, frame) {
  const c = mk(), g = c.getContext('2d');
  const r = rng(t * 977 + v * 131 + frame * 7);
  switch (t) {
    case T.GRASS: case T.TREE:
      speckle(g, r, '#4f8a3a', ['#5c9a44', '#447a32', '#3f7330', '#66a64c'], 70);
      g.strokeStyle = '#6aae50';
      for (let i = 0; i < 5; i++) { const x = r() * TS, y = r() * TS; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1, y - 4); g.stroke(); }
      break;
    case T.FLOWERS:
      speckle(g, r, '#4f8a3a', ['#5c9a44', '#447a32', '#66a64c'], 60);
      for (let i = 0; i < 5; i++) { g.fillStyle = ['#f5e05a', '#f08aa0', '#ffffff', '#b8a0ff'][Math.floor(r() * 4)]; g.beginPath(); g.arc(r() * TS, r() * TS, 2, 0, 7); g.fill(); }
      break;
    case T.WATER: {
      speckle(g, r, '#2a5b94', ['#2d62a0', '#26548a', '#3068a8'], 40, 3);
      g.strokeStyle = 'rgba(180,220,255,0.35)'; g.lineWidth = 1.5;
      for (let i = 0; i < 2; i++) {
        const y = (r() * TS + frame * 6) % TS, x = r() * TS;
        g.beginPath(); g.moveTo(x - 6, y); g.quadraticCurveTo(x, y - 3, x + 6, y); g.stroke();
      }
      break;
    }
    case T.SAND: speckle(g, r, '#d9c48c', ['#cdb87c', '#e4d29e', '#c8b070'], 60); break;
    case T.ROAD: speckle(g, r, '#a3855a', ['#94774e', '#b29468', '#8a6c44', '#bba070'], 90); break;
    case T.STONE: {
      g.fillStyle = '#8d8a84'; g.fillRect(0, 0, TS, TS);
      g.strokeStyle = '#6e6b66'; g.lineWidth = 1;
      for (let y = 0; y < TS; y += 8) {
        g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(TS, y + 0.5); g.stroke();
        const off = (y / 8) % 2 ? 8 : 0;
        for (let x = off; x < TS; x += 16) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 8); g.stroke(); }
      }
      for (let i = 0; i < 20; i++) { g.fillStyle = r() < 0.5 ? '#97948e' : '#83807a'; g.fillRect(r() * TS, r() * TS, 2, 2); }
      break;
    }
    case T.PLAZA: {
      g.fillStyle = '#c4b393'; g.fillRect(0, 0, TS, TS);
      g.strokeStyle = '#a8977a';
      for (let y = 0; y < TS; y += 8) for (let x = ((y / 8) % 2) * 4; x < TS; x += 8) g.strokeRect(x + 0.5, y + 0.5, 8, 8);
      break;
    }
    case T.WALL: {
      g.fillStyle = '#4a4744'; g.fillRect(0, 0, TS, TS);
      g.fillStyle = '#5c5955';
      for (let y = 0; y < TS; y += 8) for (let x = (y / 8) % 2 ? -8 : 0; x < TS; x += 16) g.fillRect(x + 1, y + 1, 14, 6);
      g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, TS - 4, TS, 4);
      break;
    }
    case T.SWAMP:
      speckle(g, r, '#4a5a34', ['#55663a', '#3f4e2c', '#5a6a40', '#3a4a40'], 70, 3);
      if (r() < 0.5) { g.fillStyle = 'rgba(60,80,70,.7)'; g.beginPath(); g.ellipse(r() * TS, r() * TS, 6, 3, 0, 0, 7); g.fill(); }
      break;
    case T.DARK: case T.DEADTREE:
      speckle(g, r, '#3b3240', ['#443a4a', '#322a36', '#4a3f4a'], 70, 3);
      if (r() < 0.3) { g.strokeStyle = '#2a222e'; g.beginPath(); g.moveTo(r() * TS, r() * TS); g.lineTo(r() * TS, r() * TS); g.stroke(); }
      break;
    case T.FIELD: {
      g.fillStyle = '#8a6a3a'; g.fillRect(0, 0, TS, TS);
      for (let y = 2; y < TS; y += 8) {
        g.fillStyle = '#6a4e28'; g.fillRect(0, y + 4, TS, 2);
        g.fillStyle = '#d6b44a';
        for (let x = 1; x < TS; x += 3) g.fillRect(x, y + r() * 2, 1, 4);
      }
      break;
    }
    case T.BRIDGE: {
      g.fillStyle = '#7a5530'; g.fillRect(0, 0, TS, TS);
      g.strokeStyle = '#5a3a1e';
      for (let x = 0; x < TS; x += 6) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, TS); g.stroke(); }
      break;
    }
    case T.GRAVEL: case T.ROCK:
      speckle(g, r, '#8a8070', ['#958a7a', '#7d7466', '#a09584', '#706858'], 90);
      if (t === T.ROCK) {
        const grd = g.createRadialGradient(12, 11, 2, 16, 16, 16);
        grd.addColorStop(0, '#a8a29a'); grd.addColorStop(1, '#5a5550');
        g.fillStyle = grd; g.beginPath();
        g.moveTo(3, 24); g.lineTo(6, 8); g.lineTo(16, 2 + r() * 3); g.lineTo(27, 7); g.lineTo(30, 22); g.lineTo(20, 30); g.lineTo(8, 29); g.closePath(); g.fill();
        g.strokeStyle = '#4a4540'; g.stroke();
      }
      break;
    case T.SNOW: speckle(g, r, '#e6ecf2', ['#f4f8fc', '#d4dde6', '#c8d4e0'], 60); break;
    case T.ROOF: {
      g.fillStyle = '#8c3b2e'; g.fillRect(0, 0, TS, TS);
      for (let y = 0; y < TS; y += 6) {
        g.fillStyle = '#a24a38';
        for (let x = (y / 6) % 2 ? -4 : 0; x < TS; x += 8) { g.beginPath(); g.arc(x + 4, y + 6, 4, Math.PI, 0); g.fill(); }
        g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y + 5, TS, 1);
      }
      break;
    }
    case T.DOOR: {
      g.fillStyle = '#8d8a84'; g.fillRect(0, 0, TS, TS);
      g.fillStyle = '#5a3a1e'; g.fillRect(6, 0, 20, 30);
      g.fillStyle = '#7a5230'; g.fillRect(8, 2, 7, 26); g.fillRect(17, 2, 7, 26);
      g.fillStyle = '#f0c050'; g.fillRect(21, 15, 2, 3);
      break;
    }
    case T.PODIUM: {
      g.fillStyle = '#8a5a2a'; g.fillRect(0, 0, TS, TS);
      g.fillStyle = '#b07a3a'; for (let y = 0; y < TS; y += 5) g.fillRect(0, y, TS, 3);
      g.strokeStyle = '#f0c050'; g.lineWidth = 2; g.strokeRect(1, 1, TS - 2, TS - 2);
      break;
    }
    case T.RUIN: {
      speckle(g, r, '#3b3240', ['#443a4a', '#322a36'], 40, 3);
      g.fillStyle = '#6a6470'; g.fillRect(3, 5, 26, 22);
      g.fillStyle = '#7d7784'; g.fillRect(3, 5, 26, 5);
      g.strokeStyle = '#3a343e'; g.strokeRect(3.5, 5.5, 25, 21);
      g.beginPath(); g.moveTo(10, 10); g.lineTo(14, 20); g.lineTo(12, 26); g.stroke();
      break;
    }
    default: g.fillStyle = '#f0f'; g.fillRect(0, 0, TS, TS);
  }
  return c;
}

function buildSprites() {
  // Árvore
  for (let v = 0; v < 3; v++) {
    const c = mk(64, 72), g = c.getContext('2d'), r = rng(500 + v);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(32, 62, 18, 6, 0, 0, 7); g.fill();
    g.fillStyle = '#5a3a1e'; g.fillRect(28, 40, 8, 22);
    const greens = [['#2f6b2a', '#3d8a34', '#4ea044'], ['#2a5e30', '#357a3c', '#459a4a'], ['#3a6a24', '#4a8a2e', '#5ea83a']][v];
    for (let i = 0; i < 3; i++) {
      g.fillStyle = greens[i];
      for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(32 + (r() - 0.5) * (26 - i * 8), 28 + (r() - 0.5) * (22 - i * 6) - i * 3, 13 - i * 2, 0, 7); g.fill(); }
    }
    sprites['tree' + v] = c;
  }
  // Árvore morta
  {
    const c = mk(64, 72), g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(32, 62, 12, 4, 0, 0, 7); g.fill();
    g.strokeStyle = '#3a2a22'; g.lineCap = 'round';
    g.lineWidth = 6; g.beginPath(); g.moveTo(32, 62); g.lineTo(32, 26); g.stroke();
    g.lineWidth = 3;
    [[32, 40, 18, 26], [32, 34, 46, 20], [32, 28, 26, 12], [32, 46, 48, 38]].forEach(([a, b, c2, d]) => { g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); });
    sprites.dead = c;
  }
}

export function initRender() {
  cv = document.getElementById('game');
  ctx = cv.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  for (const t of Object.values(T)) {
    tileCache[t] = [];
    for (let v = 0; v < 4; v++) {
      if (t === T.WATER) tileCache[t].push([0, 1, 2, 3].map(f => drawTile(t, v, f)));
      else tileCache[t].push([drawTile(t, v, 0)]);
    }
  }
  buildSprites();
  buildMinimap();
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

const TILE_COLORS = {
  0: '#4f8a3a', 1: '#2a5b94', 2: '#d9c48c', 3: '#2f6b2a', 4: '#6a6560', 5: '#a3855a', 6: '#8d8a84', 7: '#3a3836',
  8: '#4a5a34', 9: '#3b3240', 10: '#c6a050', 11: '#7a5530', 12: '#8a8070', 13: '#8c3b2e', 14: '#5a3a1e', 15: '#5a9a44',
  16: '#e6ecf2', 17: '#c4b393', 18: '#2a222e', 19: '#d0a040', 20: '#5a5460',
};

export function buildMinimap() {
  const m = S.map;
  const c = mk(m.W, m.H), g = c.getContext('2d');
  const img = g.createImageData(m.W, m.H);
  for (let i = 0; i < m.tiles.length; i++) {
    const hex = TILE_COLORS[m.tiles[i]] || '#f0f';
    img.data[i * 4] = parseInt(hex.slice(1, 3), 16);
    img.data[i * 4 + 1] = parseInt(hex.slice(3, 5), 16);
    img.data[i * 4 + 2] = parseInt(hex.slice(5, 7), 16);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  minimapImg = c;
}

export function screenToWorld(sx, sy) {
  return { x: (sx - W / 2) / TS + S.camX, y: (sy - H / 2) / TS + S.camY };
}

const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

// ======================= Desenho de personagens =======================
function shadow(x, y, rx, ry = rx * 0.4) {
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill();
}

function drawHumanoid(x, y, opts) {
  const { color, dir = 0, bob = 0, weapon, skin = '#f0c8a0', scale = 1, crown, hood, alpha = 1, glow } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  const s = scale;
  shadow(x, y + 10 * s, 10 * s);
  if (glow) { ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y - 4 * s, 20 * s, 0, 7); ctx.fill(); }
  const by = y - bob;
  // pernas
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(x - 5 * s, by + 3 * s, 4 * s, 8 * s + (bob ? 1 : 0));
  ctx.fillRect(x + 1 * s, by + 3 * s, 4 * s, 8 * s - (bob ? 1 : 0));
  // corpo
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(x - 8 * s, by - 8 * s, 16 * s, 14 * s, 4 * s); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.stroke();
  // cabeça
  ctx.fillStyle = hood || skin;
  ctx.beginPath(); ctx.arc(x, by - 13 * s, 7 * s, 0, 7); ctx.fill(); ctx.stroke();
  if (hood) { ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x, by - 12 * s, 4 * s, 0, 7); ctx.fill(); }
  // olhos
  if (dir !== 3) {
    ctx.fillStyle = '#222';
    const ox = dir === 1 ? -2 : dir === 2 ? 2 : 0;
    ctx.fillRect(x - 3 * s + ox * s, by - 14 * s, 2 * s, 2 * s);
    ctx.fillRect(x + 1 * s + ox * s, by - 14 * s, 2 * s, 2 * s);
  }
  // arma
  const side = dir === 1 ? -1 : 1;
  if (weapon === 'espada') {
    ctx.strokeStyle = '#d8d8e0'; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(x + side * 10 * s, by + 2 * s); ctx.lineTo(x + side * 14 * s, by - 14 * s); ctx.stroke();
    ctx.strokeStyle = '#8a6a2a'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(x + side * 7 * s, by - 1 * s); ctx.lineTo(x + side * 13 * s, by - 2 * s); ctx.stroke();
  } else if (weapon === 'cajado') {
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 2.5 * s;
    ctx.beginPath(); ctx.moveTo(x + side * 11 * s, by + 10 * s); ctx.lineTo(x + side * 11 * s, by - 18 * s); ctx.stroke();
    ctx.fillStyle = opts.orb || '#7fd0ff';
    ctx.beginPath(); ctx.arc(x + side * 11 * s, by - 19 * s, 3.5 * s, 0, 7); ctx.fill();
  } else if (weapon === 'arco') {
    const cx0 = x + side * 3 * s, byy = by - 3 * s, rr = 10 * s;
    ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 2.5 * s;
    ctx.beginPath();
    if (side > 0) ctx.arc(cx0, byy, rr, -1.1, 1.1); else ctx.arc(cx0, byy, rr, Math.PI - 1.1, Math.PI + 1.1);
    ctx.stroke();
    const ex = cx0 + side * rr * Math.cos(1.1);
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(ex, byy - rr * Math.sin(1.1)); ctx.lineTo(ex, byy + rr * Math.sin(1.1)); ctx.stroke();
  } else if (weapon === 'picareta') {
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(x + side * 9 * s, by + 4 * s); ctx.lineTo(x + side * 12 * s, by - 10 * s); ctx.stroke();
    ctx.strokeStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(x + side * 6 * s, by - 11 * s); ctx.lineTo(x + side * 18 * s, by - 9 * s); ctx.stroke();
  }
  if (crown) {
    ctx.fillStyle = '#f0c050'; ctx.strokeStyle = '#8a6a10';
    const cy = by - 21 * s;
    ctx.beginPath(); ctx.moveTo(x - 7 * s, cy + 5 * s); ctx.lineTo(x - 7 * s, cy - 2 * s); ctx.lineTo(x - 3.5 * s, cy + 2 * s); ctx.lineTo(x, cy - 4 * s); ctx.lineTo(x + 3.5 * s, cy + 2 * s); ctx.lineTo(x + 7 * s, cy - 2 * s); ctx.lineTo(x + 7 * s, cy + 5 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e03030'; ctx.fillRect(x - 1, cy + 1, 2, 2);
  }
  ctx.restore();
}

function drawMob(m, x, y) {
  const def = S.defs.mobs[m.type];
  const s = (def.size || 0.5) * TS;
  const face = m.face || 1;
  const t = S.time;
  ctx.save();
  switch (m.type) {
    case 'lobo': case 'javali': case 'crocodilo': case 'ratazana': {
      const long = m.type === 'crocodilo' ? 1.5 : m.type === 'ratazana' ? 1.3 : 1.1;
      shadow(x, y + s * 0.45, s * 0.8 * long);
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.ellipse(x, y, s * 0.75 * long, s * 0.42, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
      ctx.beginPath(); ctx.arc(x + face * s * 0.75 * long, y - s * 0.12, s * 0.32, 0, 7); ctx.fill(); ctx.stroke();
      const leg = Math.sin(t * 12 + x) * (m.moving ? 3 : 0);
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      for (const lx of [-0.45, 0.4]) { ctx.fillRect(x + lx * s * long - 2, y + s * 0.3 + leg, 4, s * 0.3); ctx.fillRect(x + lx * s * long + 3, y + s * 0.3 - leg, 4, s * 0.3); }
      ctx.fillStyle = m.type === 'lobo' ? '#ffdd44' : '#200';
      ctx.fillRect(x + face * s * 0.85 * long - 1, y - s * 0.22, 3, 3);
      if (m.type === 'lobo') { ctx.fillStyle = def.color; ctx.beginPath(); ctx.moveTo(x + face * s * 0.6, y - s * 0.3); ctx.lineTo(x + face * s * 0.7, y - s * 0.7); ctx.lineTo(x + face * s * 0.85, y - s * 0.35); ctx.fill(); }
      if (m.type === 'javali') { ctx.fillStyle = '#fff'; ctx.fillRect(x + face * s * 1.05, y - s * 0.05, face * 4, 2); }
      break;
    }
    case 'aranha': {
      shadow(x, y + s * 0.4, s * 0.8);
      ctx.strokeStyle = '#1a1020'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) {
        const a = -0.9 + i * 0.6, w = Math.sin(t * 14 + i) * (m.moving ? 0.15 : 0);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sd * s * 0.7, y + Math.sin(a + w) * s * 0.6 - 4); ctx.lineTo(x + sd * s * 1.0, y + Math.sin(a + w) * s * 0.8 + 4); ctx.stroke();
      }
      ctx.fillStyle = def.color; ctx.beginPath(); ctx.ellipse(x, y, s * 0.45, s * 0.38, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y - s * 0.4, s * 0.25, 0, 7); ctx.fill();
      ctx.fillStyle = '#f33'; ctx.fillRect(x - 4, y - s * 0.45, 2, 2); ctx.fillRect(x + 2, y - s * 0.45, 2, 2);
      break;
    }
    case 'gosma': {
      const sq = 1 + Math.sin(t * 5 + x) * 0.08;
      shadow(x, y + s * 0.4, s * 0.8);
      ctx.fillStyle = 'rgba(95,191,63,.85)';
      ctx.beginPath(); ctx.ellipse(x, y + s * 0.1, s * 0.75 * sq, s * 0.55 / sq, 0, Math.PI, 0); ctx.lineTo(x + s * 0.75 * sq, y + s * 0.35); ctx.lineTo(x - s * 0.75 * sq, y + s * 0.35); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(x - s * 0.25, y - s * 0.15, s * 0.12, 0, 7); ctx.fill();
      ctx.fillStyle = '#123'; ctx.fillRect(x - 6, y - 2, 3, 4); ctx.fillRect(x + 3, y - 2, 3, 4);
      break;
    }
    case 'golem': {
      shadow(x, y + s * 0.5, s * 0.8);
      ctx.fillStyle = def.color; ctx.strokeStyle = '#3a3a30'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x - s * 0.6, y - s * 0.6, s * 1.2, s * 1.0, 6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x - s * 0.35, y - s * 1.0, s * 0.7, s * 0.45, 4); ctx.fill(); ctx.stroke();
      ctx.fillRect(x - s * 0.95, y - s * 0.5, s * 0.35, s * 0.8); ctx.fillRect(x + s * 0.6, y - s * 0.5, s * 0.35, s * 0.8);
      ctx.fillStyle = '#7fe3ff'; ctx.fillRect(x - 6, y - s * 0.85, 4, 3); ctx.fillRect(x + 2, y - s * 0.85, 4, 3);
      ctx.strokeStyle = '#7fe3ff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 4, y - s * 0.4); ctx.lineTo(x + 2, y - s * 0.1); ctx.lineTo(x - 2, y + s * 0.2); ctx.stroke();
      break;
    }
    case 'espectro': {
      const fl = Math.sin(t * 3 + x) * 3;
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(x, y - s * 0.4 + fl, s * 0.5, Math.PI, 0);
      for (let i = 0; i <= 4; i++) ctx.lineTo(x + s * 0.5 - i * s * 0.25, y + s * 0.4 + fl + (i % 2 ? -5 : 3));
      ctx.fill();
      ctx.fillStyle = '#123'; ctx.beginPath(); ctx.arc(x - 5, y - s * 0.45 + fl, 3, 0, 7); ctx.arc(x + 5, y - s * 0.45 + fl, 3, 0, 7); ctx.fill();
      break;
    }
    case 'lich': {
      const pulse = 0.5 + Math.sin(t * 3) * 0.2;
      ctx.fillStyle = `rgba(120,255,90,${0.15 * pulse})`; ctx.beginPath(); ctx.arc(x, y, s * 1.3, 0, 7); ctx.fill();
      drawHumanoid(x, y, { color: def.color, dir: 0, weapon: 'cajado', orb: '#8dff6a', skin: '#d8d8c0', hood: '#2a0f3f', scale: 1.7, crown: true });
      break;
    }
    case 'esqueleto':
      drawHumanoid(x, y, { color: '#cfc8b0', dir: m.dir, bob: m.moving ? Math.abs(Math.sin(t * 10)) * 2 : 0, weapon: 'espada', skin: '#efe8d4' });
      break;
    case 'kobold':
      drawHumanoid(x, y, { color: '#6a4a2a', dir: m.dir, bob: m.moving ? Math.abs(Math.sin(t * 10)) * 2 : 0, weapon: 'picareta', skin: def.color, scale: 0.85 });
      break;
    case 'bandido':
      drawHumanoid(x, y, { color: '#4a2a2a', dir: m.dir, bob: m.moving ? Math.abs(Math.sin(t * 10)) * 2 : 0, weapon: 'espada', hood: '#2a1a1a' });
      break;
    default:
      shadow(x, y + s * 0.4, s * 0.7);
      ctx.fillStyle = def.color; ctx.beginPath(); ctx.arc(x, y, s * 0.6, 0, 7); ctx.fill();
  }
  ctx.restore();
}

function drawNode(n, x, y) {
  const def = S.defs.nodes[n.type];
  if (n.type.startsWith('veio')) {
    shadow(x, y + 8, 12);
    ctx.fillStyle = '#6a645c'; ctx.strokeStyle = '#3a3630';
    ctx.beginPath(); ctx.moveTo(x - 12, y + 8); ctx.lineTo(x - 9, y - 6); ctx.lineTo(x, y - 11); ctx.lineTo(x + 10, y - 5); ctx.lineTo(x + 12, y + 8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = def.color;
    for (const [dx, dy] of [[-5, -2], [3, -6], [5, 3], [-2, 4]]) { ctx.beginPath(); ctx.moveTo(x + dx, y + dy - 3); ctx.lineTo(x + dx + 3, y + dy); ctx.lineTo(x + dx, y + dy + 3); ctx.lineTo(x + dx - 3, y + dy); ctx.fill(); }
    if (n.type === 'veio_mithril' && Math.sin(S.time * 4 + x) > 0.7) { ctx.fillStyle = '#fff'; ctx.fillRect(x + 2, y - 8, 2, 2); }
  } else if (n.type === 'trigo') {
    ctx.strokeStyle = '#c8a030'; ctx.lineWidth = 1.5;
    for (let i = -3; i <= 3; i++) { const sw = Math.sin(S.time * 2 + i + x) * 1.5; ctx.beginPath(); ctx.moveTo(x + i * 3, y + 8); ctx.lineTo(x + i * 3 + sw, y - 8); ctx.stroke(); ctx.fillStyle = '#f0d060'; ctx.fillRect(x + i * 3 + sw - 1.5, y - 12, 3, 6); }
  } else {
    shadow(x, y + 6, 9);
    ctx.fillStyle = '#2f7a2a';
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.5; ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 6, y + Math.sin(a) * 6 + 2, 3, 7, a + Math.PI / 2, 0, 7); ctx.fill(); }
    ctx.fillStyle = def.color;
    for (const [dx, dy] of [[-4, -6], [4, -5], [0, -9]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 2.6, 0, 7); ctx.fill(); }
    if (n.type === 'flor_lunar') { ctx.fillStyle = `rgba(232,160,255,${0.25 + Math.sin(S.time * 3 + x) * 0.15})`; ctx.beginPath(); ctx.arc(x, y - 4, 13, 0, 7); ctx.fill(); }
  }
}

function label(text, x, y, color = '#fff', size = 12, bold = true) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px "Trebuchet MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

function hpBar(x, y, w, frac, color = '#e0533d') {
  ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
  ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 4);
}

function bubble(text, x, y) {
  ctx.font = '12px "Trebuchet MS", sans-serif';
  const words = text.split(' ');
  const lines = []; let cur = '';
  for (const w of words) {
    if (ctx.measureText(cur + ' ' + w).width > 190 && cur) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 5);
  const bw = Math.max(...shown.map(l => ctx.measureText(l).width)) + 14, bh = shown.length * 15 + 8;
  const bx = x - bw / 2, by = y - bh - 8;
  ctx.fillStyle = 'rgba(255,250,235,.95)'; ctx.strokeStyle = '#5a4020'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 5, by + bh); ctx.lineTo(x, by + bh + 7); ctx.lineTo(x + 5, by + bh); ctx.fill();
  ctx.fillStyle = '#2a1a08'; ctx.textAlign = 'center';
  shown.forEach((l, i) => ctx.fillText(l, x, by + 16 + i * 15));
}

// ======================= Quadro principal =======================
export function render() {
  const m = S.map;
  S.camX = S.x; S.camY = S.y;
  const cx = S.camX, cy = S.camY;
  const toSX = wx => Math.round((wx - cx) * TS + W / 2);
  const toSY = wy => Math.round((wy - cy) * TS + H / 2);
  ctx.fillStyle = '#10161f'; ctx.fillRect(0, 0, W, H);

  const x0 = Math.floor(cx - W / 2 / TS) - 1, x1 = Math.ceil(cx + W / 2 / TS) + 1;
  const y0 = Math.floor(cy - H / 2 / TS) - 1, y1 = Math.ceil(cy + H / 2 / TS) + 2;
  const wf = Math.floor(S.time * 2) % 4;
  const objs = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) continue;
      const t = m.tiles[ty * m.W + tx];
      const h = hash(tx, ty);
      const variants = tileCache[t];
      const frames = variants[h % 4];
      ctx.drawImage(frames[t === T.WATER ? (wf + h) % 4 : 0], toSX(tx), toSY(ty));
      if (t === T.TREE) objs.push({ y: ty + 0.9, draw: () => ctx.drawImage(sprites['tree' + (h % 3)], toSX(tx) - 16, toSY(ty) - 44) });
      else if (t === T.DEADTREE) objs.push({ y: ty + 0.9, draw: () => ctx.drawImage(sprites.dead, toSX(tx) - 16, toSY(ty) - 44) });
    }
  }

  // Bordas suaves de água
  // Nós de coleta
  for (const n of S.nodes.values()) {
    if (!n.avail || n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue;
    objs.push({ y: n.y, draw: () => drawNode(n, toSX(n.x), toSY(n.y)) });
  }

  // Alvo
  const tgt = S.target;

  // NPCs
  const qs = questMarkers();
  for (const n of allNpcsForRender()) {
    if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) continue;
    objs.push({
      y: n.y, draw: () => {
        const sx = toSX(n.x), sy = toSY(n.y);
        if (tgt === n.id) ring(sx, sy, '#f0c050');
        if (n.role === 'jobs') drawBoard(sx, sy);
        else if (n.role === 'throne') drawThrone(sx, sy);
        else drawHumanoid(sx, sy, { color: n.color, dir: 0, skin: '#f0c8a0', crown: n.role === 'candidate' ? false : undefined, hood: n.role === 'station' ? '#3a2a1a' : undefined });
        label(n.name, sx, sy - 30, '#9ef0a0', 11);
        label(`<${n.title}>`, sx, sy - 18 + (n.role === 'jobs' || n.role === 'throne' ? -2 : 0), '#d0e8c0', 10, false);
        const mk = qs[n.id];
        if (mk) label(mk, sx, sy - 44, mk === '?' ? '#ffe040' : '#ffd000', 22);
      },
    });
  }

  // Monstros
  for (const mob of S.mobs.values()) {
    objs.push({
      y: mob.y, draw: () => {
        const sx = toSX(mob.x), sy = toSY(mob.y);
        const def = S.defs.mobs[mob.type];
        if (tgt === mob.id) ring(sx, sy, '#ff4030', def.size * TS * 1.1);
        drawMob(mob, sx, sy);
        const top = sy - def.size * TS - (mob.type === 'lich' ? 34 : 12);
        const lv = S.me ? S.me.lv : 1;
        const col = def.lv >= lv + 3 ? '#ff5040' : def.lv <= lv - 5 ? '#a0a0a0' : def.lv >= lv + 1 ? '#ffb040' : '#ffe080';
        if (tgt === mob.id || mob.hp < mob.maxHp || def.boss) {
          label(`${def.name} (${def.lv}${def.boss ? ' ☠' : ''})`, sx, top - 6, col, def.boss ? 13 : 11);
          hpBar(sx, top, def.boss ? 70 : 36, mob.hp / mob.maxHp);
        }
      },
    });
  }

  // Jogadores
  const drawPlayer = (p, sx, sy, me) => {
    const C = S.defs.classes[p.cls];
    if (tgt === p.id) ring(sx, sy, '#40e070');
    const bob = p.moving ? Math.abs(Math.sin(S.time * 11)) * 2 : 0;
    drawHumanoid(sx, sy, {
      color: C.color, dir: p.dir, bob, weapon: C.weapon, crown: p.flags & 1, alpha: p.flags & 4 ? 0.35 : 1,
      orb: p.cls === 'sacerdote' ? '#fff3a0' : '#7fd0ff', glow: p.flags & 2 ? 'rgba(80,150,255,.12)' : null,
    });
    const nameCol = p.flags & 1 ? '#f0c050' : p.flags & 2 ? '#80b8ff' : p.flags & 8 ? '#ffb070' : me ? '#ffffff' : '#c8e0ff';
    const tag = p.flags & 1 ? '👑 ' : p.flags & 2 ? '🛡️ ' : p.flags & 8 ? '🗳️ ' : '';
    label(`${tag}${p.name}`, sx, sy - 32, nameCol, 12);
    const prof = p.prof ? S.defs.professions[p.prof] : null;
    label(`Nv ${p.lv} ${C.name}${prof ? ' · ' + prof.name : ''}`, sx, sy - 20, '#d8d0c0', 10, false);
    if (!me && p.hp < p.maxHp) hpBar(sx, sy - 44, 32, p.hp / p.maxHp, '#4fc36a');
  };
  for (const p of S.players.values()) {
    if (p.id === S.myId) continue;
    objs.push({ y: p.y, draw: () => drawPlayer(p, toSX(p.x), toSY(p.y), false) });
  }
  const meSnap = S.players.get(S.myId);
  if (meSnap && S.me) {
    const me = { ...meSnap, dir: S.dir, moving: S.moving };
    objs.push({ y: S.y, draw: () => drawPlayer(me, toSX(S.x), toSY(S.y), true) });
  }

  objs.sort((a, b) => a.y - b.y);
  for (const o of objs) o.draw();

  // Nomes de prédios
  for (const b of S.defs.buildings) {
    const bx = toSX((b.x0 + b.x1 + 1) / 2), by = toSY(b.y0) - 6;
    if (bx < -200 || bx > W + 200 || by < -50 || by > H + 50) continue;
    label(b.name, bx, by, '#ffe8b0', 13);
  }

  drawFx(toSX, toSY);
  drawNight();
  drawMinimap();
}

function allNpcsForRender() {
  const base = S.defs.npcs;
  return S.pol && S.pol.stage ? base.concat(S.pol.stage) : base;
}

function questMarkers() {
  const out = {};
  if (!S.me) return out;
  for (const [id, q] of Object.entries(S.defs.quests)) {
    const active = S.me.quests[id];
    if (active) {
      const done = q.type === 'kill' ? active.n >= q.count : (S.me.inv[q.target] || 0) >= q.count;
      if (done) out[q.giver] = '?';
    } else if (!S.me.questsDone.includes(id) && S.me.lv >= q.lvl && out[q.giver] !== '?') out[q.giver] = '!';
  }
  const task = S.me.task;
  if (task && task.type === 'entrega') out[task.npc] = '✉';
  return out;
}

function ring(x, y, color, r = 15) {
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(x, y + 8, r, r * 0.45, 0, 0, 7); ctx.stroke();
}

function drawBoard(x, y) {
  shadow(x, y + 10, 14);
  ctx.fillStyle = '#5a3a1e'; ctx.fillRect(x - 12, y - 4, 3, 16); ctx.fillRect(x + 9, y - 4, 3, 16);
  ctx.fillStyle = '#8a6030'; ctx.fillRect(x - 15, y - 16, 30, 16);
  ctx.fillStyle = '#f4ecd0'; ctx.fillRect(x - 12, y - 14, 8, 10); ctx.fillRect(x - 2, y - 13, 9, 8); ctx.fillRect(x + 8, y - 14, 5, 9);
}

function drawThrone(x, y) {
  shadow(x, y + 10, 14);
  ctx.fillStyle = '#8a1a1a'; ctx.fillRect(x - 13, y - 4, 26, 14);
  ctx.fillStyle = '#d4af37'; ctx.fillRect(x - 11, y - 22, 22, 20);
  ctx.fillStyle = '#a01a2a'; ctx.fillRect(x - 8, y - 19, 16, 15);
  ctx.fillStyle = '#d4af37'; ctx.beginPath(); ctx.moveTo(x - 11, y - 22); ctx.lineTo(x - 6, y - 30); ctx.lineTo(x, y - 24); ctx.lineTo(x + 6, y - 30); ctx.lineTo(x + 11, y - 22); ctx.fill();
}

function drawFx(toSX, toSY) {
  const now = performance.now();
  // Efeitos de área
  S.fx = S.fx.filter(f => now - f.t0 < f.dur);
  for (const f of S.fx) {
    const k = (now - f.t0) / f.dur;
    if (f.k === 'aoe') {
      ctx.strokeStyle = f.c; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(toSX(f.x), toSY(f.y), f.r * TS * (0.4 + k * 0.6), f.r * TS * (0.4 + k * 0.6) * 0.6, 0, 0, 7); ctx.stroke();
      ctx.fillStyle = f.c; ctx.globalAlpha = (1 - k) * 0.15; ctx.fill();
      ctx.globalAlpha = 1;
    } else if (f.k === 'proj') {
      const tx = f.to(), sx = f.sx + (tx.x - f.sx) * k, sy = f.sy + (tx.y - f.sy) * k;
      ctx.fillStyle = f.c; ctx.shadowColor = f.c; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(toSX(sx), toSY(sy) - 8, 5, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
    } else if (f.k === 'lvl') {
      const e = f.at();
      const g = ctx.createLinearGradient(0, toSY(e.y) - 120, 0, toSY(e.y));
      g.addColorStop(0, 'rgba(255,220,100,0)'); g.addColorStop(1, `rgba(255,220,100,${0.6 * (1 - k)})`);
      ctx.fillStyle = g; ctx.fillRect(toSX(e.x) - 18, toSY(e.y) - 120, 36, 125);
    }
  }
  // Textos flutuantes
  S.texts = S.texts.filter(t => now - t.t0 < t.dur);
  for (const t of S.texts) {
    const k = (now - t.t0) / t.dur;
    const e = t.at();
    ctx.globalAlpha = Math.min(1, 2 * (1 - k));
    label(t.text, toSX(e.x) + t.ox, toSY(e.y) - 40 - k * 36, t.color, t.size);
    ctx.globalAlpha = 1;
  }
  // Balões de fala
  for (const [id, b] of S.bubbles) {
    if (now > b.until) { S.bubbles.delete(id); continue; }
    const e = b.at();
    if (!e) continue;
    bubble(b.text, toSX(e.x), toSY(e.y) - 46);
  }
}

function drawNight() {
  const cycle = 12 * 60;
  const ph = ((Date.now() / 1000) % cycle) / cycle;
  const dark = Math.max(0, -Math.cos(ph * Math.PI * 2)) * 0.5;
  S.isNight = dark > 0.25;
  if (dark < 0.02) return;
  const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H) * 0.6);
  g.addColorStop(0, `rgba(10,15,45,${dark * 0.35})`);
  g.addColorStop(1, `rgba(10,15,45,${dark})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// ======================= Minimapa =======================
const mm = { cv: null, g: null };
function drawMinimap() {
  if (!mm.cv) { mm.cv = document.getElementById('minimap'); mm.g = mm.cv.getContext('2d'); }
  const g = mm.g, sc = 2, size = 180;
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#10161f'; g.fillRect(0, 0, size, size);
  const ox = S.x - size / sc / 2, oy = S.y - size / sc / 2;
  g.drawImage(minimapImg, ox, oy, size / sc, size / sc, 0, 0, size, size);
  const dot = (x, y, c, r = 2) => { g.fillStyle = c; g.fillRect((x - ox) * sc - r, (y - oy) * sc - r, r * 2, r * 2); };
  for (const n of S.defs.npcs) dot(n.x, n.y, '#ffe040', 2);
  for (const m of S.mobs.values()) dot(m.x, m.y, '#ff4030', 1.5);
  for (const p of S.players.values()) if (p.id !== S.myId) dot(p.x, p.y, '#60a0ff', 2);
  const task = S.me && S.me.task;
  if (task) {
    const pts = task.type === 'entrega' ? [S.defs.npcs.find(n => n.id === task.npc)] : task.type === 'patrulha' ? task.points.filter(p => !p.ok) : [];
    for (const p of pts) if (p) { g.strokeStyle = '#ffd000'; g.lineWidth = 2; g.strokeRect((p.x - ox) * sc - 4, (p.y - oy) * sc - 4, 8, 8); }
  }
  g.fillStyle = '#fff'; g.beginPath(); g.arc(size / 2, size / 2, 3, 0, 7); g.fill();
  g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
}

export function drawWorldMap(canvas) {
  const m = S.map;
  const g = canvas.getContext('2d');
  canvas.width = m.W * 3; canvas.height = m.H * 3;
  g.imageSmoothingEnabled = false;
  g.drawImage(minimapImg, 0, 0, m.W * 3, m.H * 3);
  // Rótulos de zonas
  g.textAlign = 'center';
  for (const Z of S.defs.zones) {
    if (Z.lx == null) continue;
    const x = Z.lx * 3, y = Z.ly * 3;
    g.font = 'bold 15px "Trebuchet MS", sans-serif'; g.lineWidth = 4; g.strokeStyle = '#000';
    g.strokeText(Z.name, x, y); g.fillStyle = '#ffe8a0'; g.fillText(Z.name, x, y);
    const sub = /\d/.test(Z.lv) ? `Nível ${Z.lv}` : Z.lv;
    g.font = '12px "Trebuchet MS", sans-serif'; g.strokeText(sub, x, y + 15); g.fillStyle = '#fff'; g.fillText(sub, x, y + 15);
  }
  const task = S.me && S.me.task;
  if (task) {
    const pts = task.type === 'entrega' ? [S.defs.npcs.find(n => n.id === task.npc)] : task.type === 'patrulha' ? task.points.filter(p => !p.ok) : [];
    for (const p of pts) if (p) { g.strokeStyle = '#ffd000'; g.lineWidth = 3; g.strokeRect(p.x * 3 - 7, p.y * 3 - 7, 14, 14); }
  }
  g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2;
  g.beginPath(); g.arc(S.x * 3, S.y * 3, 6, 0, 7); g.fill(); g.stroke();
  g.font = 'bold 13px "Trebuchet MS", sans-serif'; g.strokeText('Você', S.x * 3, S.y * 3 - 10); g.fillStyle = '#fff'; g.fillText('Você', S.x * 3, S.y * 3 - 10);
}

export { TS };
