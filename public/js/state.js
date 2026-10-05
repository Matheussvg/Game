// Estado compartilhado do cliente.
export const S = {
  ws: null, myId: null, me: null, defs: null, map: null,
  players: new Map(), mobs: new Map(), nodes: new Map(),
  x: 0, y: 0, dir: 0, moving: false,
  target: null, keys: {},
  fx: [], texts: [], bubbles: new Map(),
  pol: null, polAt: 0, mkt: null, jobs: null, trade: null,
  panel: null, panelArg: null, panelTab: null,
  zoneKey: null, time: 0,
};

export const T = {
  GRASS: 0, WATER: 1, SAND: 2, TREE: 3, ROCK: 4, ROAD: 5, STONE: 6, WALL: 7, SWAMP: 8,
  DARK: 9, FIELD: 10, BRIDGE: 11, GRAVEL: 12, ROOF: 13, DOOR: 14, FLOWERS: 15, SNOW: 16,
  PLAZA: 17, DEADTREE: 18, PODIUM: 19, RUIN: 20,
};
export const SOLID = new Set([T.WATER, T.TREE, T.ROCK, T.WALL, T.ROOF, T.DEADTREE, T.RUIN]);
export const RADIUS = 0.3;
export const SPEED = 4.6;

export function send(o) {
  if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o));
}

export function tileAt(x, y) {
  const m = S.map;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) return T.WATER;
  return m.tiles[ty * m.W + tx];
}

export function zoneAt(x, y) {
  const m = S.map;
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= m.W || ty >= m.H) return S.defs.zones[0];
  return S.defs.zones[m.zones[ty * m.W + tx]];
}

export const isSolid = (x, y) => SOLID.has(tileAt(x, y));
export const blocked = (x, y) =>
  isSolid(x - RADIUS, y - RADIUS) || isSolid(x + RADIUS, y - RADIUS) ||
  isSolid(x - RADIUS, y + RADIUS) || isSolid(x + RADIUS, y + RADIUS);

export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

export function allNpcs() {
  const base = S.defs ? S.defs.npcs : [];
  return S.pol && S.pol.stage ? base.concat(S.pol.stage) : base;
}

export function npcById(id) { return allNpcs().find(n => n.id === id); }

export function entityById(id) {
  if (id === S.myId) return { id, x: S.x, y: S.y, me: true };
  return S.players.get(id) || S.mobs.get(id) || npcById(id) || null;
}

export function item(id) { return S.defs.items[id] || { name: id, icon: '❔', type: 'material', value: 0 }; }

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
