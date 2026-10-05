'use strict';
// Geração determinística do mapa do mundo de Valoria.

const W = 220, H = 220;

const T = {
  GRASS: 0, WATER: 1, SAND: 2, TREE: 3, ROCK: 4, ROAD: 5, STONE: 6, WALL: 7, SWAMP: 8,
  DARK: 9, FIELD: 10, BRIDGE: 11, GRAVEL: 12, ROOF: 13, DOOR: 14, FLOWERS: 15, SNOW: 16,
  PLAZA: 17, DEADTREE: 18, PODIUM: 19, RUIN: 20,
};
const SOLID = new Set([T.WATER, T.TREE, T.ROCK, T.WALL, T.ROOF, T.DEADTREE, T.RUIN]);

const ZONES = [
  { key: 'mar', name: 'Mar Esmeralda', lv: '-' },
  { key: 'planicies', name: 'Planícies de Valoria', lv: '1-3', lx: 136, ly: 124 },
  { key: 'valoria', name: 'Valoria, a Capital', lv: 'Cidade', lx: 110, ly: 88, safe: true },
  { key: 'bosque', name: 'Bosque Sussurrante', lv: '1-5', lx: 38, ly: 140 },
  { key: 'campos', name: 'Campos Dourados', lv: '2-6', lx: 122, ly: 182 },
  { key: 'pantano', name: 'Pântano Sombrio', lv: '6-9', lx: 176, ly: 138 },
  { key: 'montanhas', name: 'Montanhas de Ferro', lv: '7-12', lx: 80, ly: 32 },
  { key: 'ruinas', name: 'Ruínas Malditas', lv: '12-18', lx: 194, ly: 62 },
  { key: 'porto', name: 'Porto Sereno', lv: 'Vila', lx: 186, ly: 172, safe: true },
  { key: 'posto', name: 'Posto Avançado do Norte', lv: 'Forte', lx: 110, ly: 52, safe: true },
  { key: 'fazenda', name: 'Fazenda do Joaquim', lv: 'Fazenda', lx: 98, ly: 160, safe: true },
];
const Z = {};
ZONES.forEach((z, i) => { Z[z.key] = i; });

// Cidade de Valoria
const CITY = { x0: 92, y0: 92, x1: 128, y1: 124 };
const BUILDINGS = [
  { name: 'Castelo Real', x0: 101, y0: 94, x1: 119, y1: 100, door: [110, 100], color: '#6b6f8a' },
  { name: 'Forja', x0: 94, y0: 101, x1: 100, y1: 106, door: [97, 106], color: '#7a4b3a' },
  { name: 'Alquimia', x0: 94, y0: 111, x1: 100, y1: 116, door: [97, 116], color: '#4b6a5a' },
  { name: 'Taverna do Javali Dourado', x0: 120, y0: 101, x1: 126, y1: 106, door: [123, 106], color: '#8a6a3a' },
  { name: 'Salão das Guildas', x0: 120, y0: 111, x1: 126, y1: 116, door: [123, 116], color: '#5a4a7a' },
];
const FORUM = { cx: 110, cy: 108, r: 5.5 };

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const G = 64;
  const grid = new Float32Array(G * G);
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();
  const at = (x, y) => grid[((y % G + G) % G) * G + ((x % G + G) % G)];
  const smooth = t => t * t * (3 - 2 * t);
  function noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  }
  return function fbm(x, y) {
    let v = 0, amp = 0.5, f = 1 / 8, tot = 0;
    for (let o = 0; o < 4; o++) { v += noise(x * f, y * f) * amp; tot += amp; amp *= 0.5; f *= 2; }
    return v / tot;
  };
}

const clamp = v => Math.max(0, Math.min(W - 1, v));

function generate(seed = 1337) {
  const rnd = mulberry32(seed);
  const n1 = makeNoise(seed + 1), n2 = makeNoise(seed + 2), n3 = makeNoise(seed + 3);
  const tiles = new Uint8Array(W * H);
  const zones = new Uint8Array(W * H);
  const idx = (x, y) => y * W + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const set = (x, y, t) => { if (inb(x, y)) tiles[idx(x, y)] = t; };
  const get = (x, y) => (inb(x, y) ? tiles[idx(x, y)] : T.WATER);
  const setZ = (x, y, z) => { if (inb(x, y)) zones[idx(x, y)] = z; };

  // 1) Zonas
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let z = Z.planicies;
      const wob = (n3(x, y) - 0.5) * 18;
      if (x >= 168 + wob && y < 86 + wob) z = Z.ruinas;
      else if (y < 82 + wob && x > 52 + wob) z = Z.montanhas;
      else if (x > 136 + wob && y >= 86 && y < 168 + wob) z = Z.pantano;
      else if (x < 86 + wob && y > 56) z = Z.bosque;
      else if (y > 130 + wob && x >= 78) z = Z.campos;
      setZ(x, y, z);
    }
  }

  // 2) Terreno base por zona
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const z = zones[idx(x, y)];
      const a = n1(x, y), b = n2(x * 2, y * 2), r = rnd();
      let t = T.GRASS;
      switch (z) {
        case Z.bosque:
          t = a > 0.52 ? T.TREE : (b > 0.62 ? T.FLOWERS : T.GRASS);
          if (t === T.TREE && r < 0.18) t = T.GRASS;
          break;
        case Z.montanhas:
          t = a > 0.58 ? T.ROCK : (y < 30 ? T.SNOW : T.GRAVEL);
          if (t !== T.ROCK && r < 0.012) t = T.ROCK;
          break;
        case Z.pantano:
          t = a > 0.64 ? T.WATER : T.SWAMP;
          if (t === T.SWAMP && r < 0.05) t = T.DEADTREE;
          break;
        case Z.ruinas:
          t = T.DARK;
          if (r < 0.04) t = T.DEADTREE;
          else if (a > 0.66) t = T.ROCK;
          break;
        case Z.campos:
          t = b > 0.7 ? T.FLOWERS : T.GRASS;
          if (r < 0.006) t = T.TREE;
          break;
        default:
          t = b > 0.68 ? T.FLOWERS : T.GRASS;
          if (r < 0.015) t = T.TREE;
      }
      tiles[idx(x, y)] = t;
    }
  }

  // 3) Ruínas: muros quebrados
  for (let i = 0; i < 26; i++) {
    const cx = 176 + Math.floor(rnd() * 34), cy = 12 + Math.floor(rnd() * 64);
    const w = 4 + Math.floor(rnd() * 5), h = 4 + Math.floor(rnd() * 5);
    for (let x = cx; x <= cx + w; x++) for (let y = cy; y <= cy + h; y++) {
      const edge = x === cx || x === cx + w || y === cy || y === cy + h;
      if (edge && rnd() < 0.6) set(x, y, T.RUIN);
      else if (!edge) set(x, y, T.DARK);
    }
  }

  // 4) Campos de cultivo
  for (let i = 0; i < 18; i++) {
    const cx = 86 + Math.floor(rnd() * 60), cy = 136 + Math.floor(rnd() * 60);
    const w = 5 + Math.floor(rnd() * 6), h = 4 + Math.floor(rnd() * 5);
    for (let x = cx; x < cx + w; x++) for (let y = cy; y < cy + h; y++) if (zones[idx(x, y)] === Z.campos) set(x, y, T.FIELD);
  }

  // 5) Lago no bosque e rio
  const disc = (cx, cy, r, t) => {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      const d = Math.hypot(x - cx, y - cy) + (n2(x * 3, y * 3) - 0.5) * 3;
      if (d < r) set(x, y, t);
      else if (d < r + 1.6 && t === T.WATER && get(x, y) !== T.WATER) set(x, y, T.SAND);
    }
  };
  disc(42, 104, 9, T.WATER);
  disc(68, 172, 6, T.WATER);
  // Rio: das montanhas (130,30) até o pântano (170,130)
  let rx = 132, ry = 24;
  while (ry < 140) {
    for (let dx = -1; dx <= 1; dx++) set(Math.round(rx) + dx, Math.round(ry), T.WATER);
    rx += (n1(ry * 0.7, 99) - 0.5) * 1.6 + 0.28;
    ry += 1;
  }

  // 6) Mar nas bordas
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.min(x, y, W - 1 - x, H - 1 - y);
    const coast = 4 + n2(x * 1.5, y * 1.5) * 6;
    if (d < coast) { tiles[idx(x, y)] = T.WATER; zones[idx(x, y)] = Z.mar; }
    else if (d < coast + 2 && zones[idx(x, y)] !== Z.montanhas) tiles[idx(x, y)] = T.SAND;
  }
  // Costa extra a sudeste (Porto Sereno)
  for (let y = 186; y < H; y++) for (let x = 140; x < W; x++) {
    const bay = y > 196 + (n2(x * 2, y * 2) - 0.5) * 8 - Math.max(0, x - 200) * 0.6 && x > 150 + (n3(x * 2, y * 2) - 0.5) * 12 + Math.max(0, 200 - y) * 1.5;
    if (bay) { set(x, y, T.WATER); setZ(x, y, Z.mar); }
  }
  for (let y = 180; y < H; y++) for (let x = 136; x < W; x++) {
    if (get(x, y) === T.WATER) continue;
    let coast = false;
    for (let oy = -2; oy <= 2 && !coast; oy++) for (let ox = -2; ox <= 2; ox++) if (zones[idx(clamp(x + ox), clamp(y + oy))] === Z.mar) { coast = true; break; }
    if (coast) set(x, y, T.SAND);
  }

  // 7) Estradas
  function road(points, width = 1) {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i], [bx, by] = points[i + 1];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let s = 0; s <= steps; s++) {
        const px = Math.round(ax + (bx - ax) * s / steps), py = Math.round(ay + (by - ay) * s / steps);
        for (let ox = -width; ox <= width; ox++) for (let oy = -width; oy <= width; oy++) {
          if (Math.abs(ox) + Math.abs(oy) > width + 0) continue;
          const cur = get(px + ox, py + oy);
          if (zones[idx(px + ox, py + oy)] === Z.mar && cur === T.WATER) continue;
          set(px + ox, py + oy, cur === T.WATER ? T.BRIDGE : T.ROAD);
        }
      }
    }
  }
  road([[92, 108], [70, 108], [55, 118], [30, 120], [16, 122]]);          // oeste → bosque
  road([[110, 92], [110, 70], [104, 55], [110, 44]]);                     // norte → posto
  road([[110, 44], [140, 40], [165, 44], [186, 36]]);                     // posto → ruínas
  road([[128, 108], [150, 110], [168, 122], [180, 150], [188, 182]]);     // leste → pântano → porto
  road([[110, 124], [110, 145], [100, 152], [104, 175], [96, 196]]);      // sul → campos
  road([[110, 145], [140, 160], [170, 172], [188, 182]]);                 // campos → porto

  // 8) Cidade de Valoria
  for (let y = CITY.y0; y <= CITY.y1; y++) for (let x = CITY.x0; x <= CITY.x1; x++) {
    const edge = x === CITY.x0 || x === CITY.x1 || y === CITY.y0 || y === CITY.y1;
    set(x, y, edge ? T.WALL : T.STONE);
    setZ(x, y, Z.valoria);
  }
  for (let d = -1; d <= 1; d++) {
    set(CITY.x0, 108 + d, T.ROAD); set(CITY.x1, 108 + d, T.ROAD);
    set(110 + d, CITY.y0, T.ROAD); set(110 + d, CITY.y1, T.ROAD);
  }
  for (const b of BUILDINGS) {
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) set(x, y, T.ROOF);
    set(b.door[0], b.door[1], T.DOOR);
  }
  // Praça do Fórum (debates)
  for (let y = FORUM.cy - 7; y <= FORUM.cy + 7; y++) for (let x = FORUM.cx - 7; x <= FORUM.cx + 7; x++) {
    if (Math.hypot(x - FORUM.cx, y - FORUM.cy) < FORUM.r) set(x, y, T.PLAZA);
  }
  set(FORUM.cx, FORUM.cy, T.PODIUM); set(FORUM.cx - 1, FORUM.cy, T.PODIUM); set(FORUM.cx + 1, FORUM.cy, T.PODIUM);
  // Ruas internas
  for (let x = CITY.x0 + 1; x < CITY.x1; x++) if (get(x, 108) === T.STONE) set(x, 108, T.ROAD);
  for (let y = CITY.y0 + 1; y < CITY.y1; y++) if (get(110, y) === T.STONE) set(110, y, T.ROAD);

  // 9) Vilas pequenas
  function village(cx, cy, r, zone) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (!inb(x, y) || get(x, y) === T.WATER && zones[idx(x, y)] === Z.mar) continue;
      set(x, y, Math.abs(x - cx) === r || Math.abs(y - cy) === r ? (rnd() < 0.85 ? T.WALL : T.STONE) : T.STONE);
      setZ(x, y, zone);
    }
    for (let d = -1; d <= 1; d++) { set(cx + d, cy - r, T.ROAD); set(cx + d, cy + r, T.ROAD); set(cx - r, cy + d, T.ROAD); set(cx + r, cy + d, T.ROAD); }
  }
  village(110, 42, 6, Z.posto);
  village(186, 182, 7, Z.porto);
  // Fazenda (sem muralha)
  for (let y = 146; y <= 156; y++) for (let x = 92; x <= 104; x++) { setZ(x, y, Z.fazenda); if (get(x, y) === T.TREE) set(x, y, T.GRASS); }
  for (let y = 147; y <= 150; y++) for (let x = 94; x <= 98; x++) set(x, y, T.ROOF);
  set(96, 150, T.DOOR);
  // Covil do Lich
  for (let y = 22; y <= 38; y++) for (let x = 188; x <= 204; x++) {
    const d = Math.hypot(x - 196, y - 30);
    if (d < 7.5) set(x, y, T.DARK);
    else if (d < 8.5) set(x, y, rnd() < 0.75 ? T.RUIN : T.DARK);
  }
  road([[186, 36], [190, 33]]);

  const map = {
    W, H, tiles, zones, seed,
    isSolid(x, y) {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
      return SOLID.has(tiles[ty * W + tx]);
    },
    tileAt(x, y) { return get(Math.floor(x), Math.floor(y)); },
    zoneAt(x, y) {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (!inb(tx, ty)) return ZONES[0];
      return ZONES[zones[ty * W + tx]];
    },
    inCity(x, y) { return x > CITY.x0 && x < CITY.x1 && y > CITY.y0 && y < CITY.y1; },
    inForum(x, y) { return Math.hypot(x - FORUM.cx - 0.5, y - FORUM.cy - 0.5) < FORUM.r + 1.5; },
    randomFree(rect, r = rnd) {
      for (let i = 0; i < 400; i++) {
        const x = rect.x0 + Math.floor(r() * (rect.x1 - rect.x0));
        const y = rect.y0 + Math.floor(r() * (rect.y1 - rect.y0));
        if (rect.zone !== undefined && zones[idx(x, y)] !== rect.zone) continue;
        if (rect.tile !== undefined && tiles[idx(x, y)] !== rect.tile) continue;
        if (!map.isSolid(x, y)) return { x: x + 0.5, y: y + 0.5 };
      }
      return null;
    },
    clear(x, y) { const t = get(x, y); if (SOLID.has(t) && t !== T.ROOF && t !== T.WALL) set(x, y, T.GRASS); },
    rnd,
  };
  return map;
}

// NPCs fixos (posições em tiles)
const NPCS = [
  { id: 'trono', name: 'Trono de Valoria', role: 'throne', x: 110.5, y: 101.6, color: '#d4af37', title: 'Sala do Trono' },
  { id: 'arauto', name: 'Arauto Real', role: 'herald', x: 106.5, y: 102.6, color: '#e67e22', title: 'Eleições e Petições' },
  { id: 'ferreiro', name: 'Mestre Ferreiro Gunnar', role: 'station', station: 'forja', x: 97.5, y: 107.4, color: '#a0522d', title: 'Forja', sells: ['carvao'] },
  { id: 'alquimista', name: 'Alquimista Ysolde', role: 'station', station: 'alquimia', x: 97.5, y: 117.4, color: '#2e8b57', title: 'Bancada de Alquimia', sells: ['erva'] },
  { id: 'taverneiro', name: 'Taverneiro Olaf', role: 'station', station: 'forno', x: 123.5, y: 107.4, color: '#cd853f', title: 'Taverna e Forno', sells: ['pao', 'trigo'] },
  { id: 'guildas', name: 'Mestra das Guildas Helena', role: 'guild', x: 123.5, y: 117.4, color: '#8e44ad', title: 'Escolher Profissão' },
  { id: 'leiloeiro', name: 'Leiloeiro Fausto', role: 'market', x: 110.5, y: 117.5, color: '#f39c12', title: 'Mercado de Valoria' },
  { id: 'vendedor', name: 'Vendedora Rosa', role: 'vendor', x: 105.5, y: 119.5, color: '#16a085', title: 'Suprimentos', sells: ['pocao_vida', 'pocao_mana', 'pao', 'espada_velha', 'cajado_velho', 'arco_velho', 'roupas_simples'] },
  { id: 'comerciante_valoria', name: 'Comerciante Tobias', role: 'trader', town: 'valoria', x: 115.5, y: 119.5, color: '#b7950b', title: 'Mercadorias (Mercadores)' },
  { id: 'quadro', name: 'Quadro de Empregos', role: 'jobs', x: 101.5, y: 109.5, color: '#795548', title: 'Tarefas e Contratos', board: true },
  { id: 'capitao', name: 'Capitão Rodrik', role: 'quest', x: 118.5, y: 109.5, color: '#2c3e50', title: 'Capitão da Guarda', deliver: true },
  { id: 'eldrin', name: 'Arquimago Eldrin', role: 'quest', x: 103.5, y: 113.5, color: '#3742fa', title: 'Arquimago' },
  { id: 'lumen', name: 'Sacerdotisa Lúmen', role: 'quest', x: 114.5, y: 102.6, color: '#fff200', title: 'Templo da Luz' },
  { id: 'joaquim', name: 'Fazendeiro Joaquim', role: 'quest', x: 96.5, y: 151.6, color: '#6ab04c', title: 'Fazenda', deliver: true, sells: ['trigo', 'pao'] },
  { id: 'durin', name: 'Mestre Mineiro Durin', role: 'quest', x: 108.5, y: 41.5, color: '#95a5a6', title: 'Posto do Norte', deliver: true },
  { id: 'comerciante_posto', name: 'Intendente Hilda', role: 'trader', town: 'posto', x: 112.5, y: 43.5, color: '#b7950b', title: 'Mercadorias do Norte', deliver: true },
  { id: 'comerciante_porto', name: 'Mercadora Lia', role: 'trader', town: 'porto', x: 186.5, y: 182.5, color: '#b7950b', title: 'Mercadorias do Porto', deliver: true },
  { id: 'pescador', name: 'Pescador Tomé', role: 'vendor', x: 183.5, y: 185.5, color: '#1e90ff', title: 'Peixaria', sells: ['pao', 'pocao_vida', 'pocao_mana'] },
];

// Rotas comerciais: o que cada cidade vende (barato) e compra (caro)
const TRADE = {
  valoria: { sells: { caixa_ferramentas: 25 }, buys: { caixa_especiarias: 34, fardo_peles: 33 } },
  porto: { sells: { caixa_especiarias: 20 }, buys: { caixa_ferramentas: 38, fardo_peles: 30 } },
  posto: { sells: { fardo_peles: 22 }, buys: { caixa_especiarias: 36, caixa_ferramentas: 35 } },
};

// Pontos de surgimento de monstros e nós de coleta
const SPAWNS = [
  { mob: 'ratazana', count: 26, rect: { x0: 74, y0: 78, x1: 146, y1: 134, zone: 1 } },
  { mob: 'lobo', count: 26, rect: { x0: 40, y0: 76, x1: 84, y1: 145 } },
  { mob: 'aranha', count: 20, rect: { x0: 14, y0: 64, x1: 54, y1: 160 } },
  { mob: 'javali', count: 24, rect: { x0: 84, y0: 128, x1: 150, y1: 170 } },
  { mob: 'javali', count: 8, rect: { x0: 60, y0: 140, x1: 86, y1: 180 } },
  { mob: 'bandido', count: 18, rect: { x0: 92, y0: 168, x1: 170, y1: 194 } },
  { mob: 'gosma', count: 22, rect: { x0: 150, y0: 90, x1: 178, y1: 165 } },
  { mob: 'crocodilo', count: 14, rect: { x0: 170, y0: 90, x1: 212, y1: 168 } },
  { mob: 'kobold', count: 22, rect: { x0: 60, y0: 46, x1: 165, y1: 82 } },
  { mob: 'golem', count: 16, rect: { x0: 60, y0: 10, x1: 165, y1: 44 } },
  { mob: 'esqueleto', count: 20, rect: { x0: 172, y0: 40, x1: 212, y1: 86 } },
  { mob: 'espectro', count: 14, rect: { x0: 172, y0: 8, x1: 212, y1: 50 } },
];
const BOSS = { mob: 'lich', x: 196.5, y: 30.5 };

const NODE_SPAWNS = [
  { node: 'erva', count: 40, rect: { x0: 12, y0: 60, x1: 90, y1: 165, zone: 3 } },
  { node: 'erva', count: 14, rect: { x0: 80, y0: 128, x1: 150, y1: 190, zone: 4 } },
  { node: 'flor_lunar', count: 18, rect: { x0: 138, y0: 88, x1: 212, y1: 168, zone: 5 } },
  { node: 'flor_lunar', count: 6, rect: { x0: 170, y0: 8, x1: 212, y1: 86, zone: 7 } },
  { node: 'trigo', count: 40, rect: { x0: 80, y0: 130, x1: 150, y1: 200, tile: T.FIELD } },
  { node: 'veio_ferro', count: 30, rect: { x0: 56, y0: 40, x1: 166, y1: 82, zone: 6 } },
  { node: 'veio_carvao', count: 24, rect: { x0: 56, y0: 30, x1: 166, y1: 82, zone: 6 } },
  { node: 'veio_mithril', count: 14, rect: { x0: 56, y0: 8, x1: 166, y1: 42, zone: 6 } },
];

const SPAWN_POINT = { x: 110.5, y: 110.5 };

module.exports = { generate, T, SOLID, ZONES, NPCS, TRADE, SPAWNS, BOSS, NODE_SPAWNS, SPAWN_POINT, CITY, BUILDINGS, FORUM, W, H };
