// Entrada do cliente: login, rede, entrada do jogador e laço principal.
import { S, send, blocked, dist, allNpcs, entityById, SPEED } from './state.js';
import { initRender, render, screenToWorld } from './render.js';
import { getSprite } from './sprites.js';
import { initUI, updateHUD, renderPanel, addChat, toast, togglePanel, openPanel, closePanel, usePotionSlot } from './ui.js';

const $ = id => document.getElementById(id);
let selectedClass = null;
let started = false;

// ======================= Login =======================
async function setupLogin() {
  $('lname').value = localStorage.getItem('valoria_name') || '';
  try {
    const r = await fetch('/api/classes');
    const { classes, abilities, online } = await r.json();
    $('classes').innerHTML = Object.entries(classes).map(([k, c]) => `
      <div class="cls" data-cls="${k}"><div class="portrait" data-portrait="${k}"></div><h3><span class="dot" style="background:${c.color}"></span>${c.name}</h3>
      <p>${c.desc}</p><p>Vida ${c.hp} · ${c.resource} ${c.mana}</p>
      <div class="abs" title="${c.abilities.map(a => abilities[a].name).join(', ')}">${c.abilities.map(a => abilities[a].icon).join('')}</div></div>`).join('');
    document.querySelectorAll('[data-portrait]').forEach(el => {
      const spr = getSprite(el.dataset.portrait, 0, 0);
      const c = document.createElement('canvas');
      c.width = spr.width; c.height = spr.height;
      c.getContext('2d').drawImage(spr, 0, 0);
      el.appendChild(c);
    });
    document.querySelectorAll('.cls').forEach(el => el.addEventListener('click', () => {
      document.querySelectorAll('.cls').forEach(x => x.classList.remove('sel'));
      el.classList.add('sel');
      selectedClass = el.dataset.cls;
    }));
    if (online) $('lerr').innerHTML = `<span style="color:#9ef0a0">${online} aventureiro(s) online agora.</span>`;
  } catch {
    $('lerr').textContent = 'Não foi possível contatar o servidor.';
  }
  const go = () => connect($('lname').value.trim(), $('lpass').value);
  $('lbtn').addEventListener('click', go);
  $('lpass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

function connect(name, pass) {
  if (!name || !pass) { $('lerr').textContent = 'Informe nome e senha.'; return; }
  $('lerr').textContent = 'Conectando...';
  localStorage.setItem('valoria_name', name);
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
  S.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ t: 'login', name, pass, cls: selectedClass }));
  ws.onmessage = e => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    if (started) { toast('Conexão perdida. Recarregue a página.', 'err'); addChat({ ch: 'a', msg: '⚠️ Conexão com o servidor perdida. Recarregue a página para reconectar.' }); }
    else $('lerr').textContent = $('lerr').textContent === 'Conectando...' ? 'Falha na conexão.' : $('lerr').textContent;
  };
}

// ======================= Mensagens =======================
function decode(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

const lastPos = new Map();
function posOf(id) {
  const e = entityById(id);
  if (e) { const p = { x: e.x, y: e.y }; lastPos.set(id, p); return p; }
  return lastPos.get(id) || { x: S.x, y: S.y };
}

function onMessage(m) {
  switch (m.t) {
    case 'loginFail': $('lerr').textContent = m.text; S.ws.close(); break;
    case 'welcome':
      S.myId = m.id;
      S.defs = m.defs;
      S.map = { W: m.map.W, H: m.map.H, tiles: decode(m.map.tiles), zones: decode(m.map.zones) };
      for (const n of m.nodes) S.nodes.set(n.id, n);
      break;
    case 'pos': S.x = m.x; S.y = m.y; break;
    case 'me': {
      const first = !S.me;
      S.me = m;
      if (first) start();
      break;
    }
    case 's': {
      const seenP = new Set(), seenM = new Set();
      for (const a of m.p) {
        const [id, name, x, y, cls, hp, maxHp, lv, flags, dir, prof] = a;
        seenP.add(id);
        let p = S.players.get(id);
        if (!p) { p = { id, x, y }; S.players.set(id, p); }
        Object.assign(p, { name, tx: x, ty: y, cls, hp, maxHp, lv, flags, dir, prof });
      }
      for (const a of m.m) {
        const [id, type, x, y, hp, maxHp, aggro] = a;
        seenM.add(id);
        let mob = S.mobs.get(id);
        if (!mob) { mob = { id, type, x, y, face: 1, dir: 0 }; S.mobs.set(id, mob); }
        Object.assign(mob, { tx: x, ty: y, hp, maxHp, aggro });
      }
      for (const id of S.players.keys()) if (!seenP.has(id)) S.players.delete(id);
      for (const id of S.mobs.keys()) if (!seenM.has(id)) { S.mobs.delete(id); if (S.target === id) S.target = null; }
      break;
    }
    case 'node': { const n = S.nodes.get(m.id); if (n) n.avail = m.avail; break; }
    case 'fx': for (const f of m.l) handleFx(f); break;
    case 'chat': addChat(m); break;
    case 'toast': toast(m.text, m.kind); break;
    case 'pol': S.pol = m; S.polAt = Date.now(); break;
    case 'phase': toast(`Nova fase política: ${m.name}`, 'gold'); break;
    case 'mkt': S.mkt = m; renderPanel(true); break;
    case 'jobs': S.jobs = m; renderPanel(true); break;
    case 'trade': S.trade = m; renderPanel(true); break;
  }
}

function handleFx(f) {
  const now = performance.now();
  const at = () => posOf(f.id);
  switch (f.k) {
    case 'dmg': {
      const mine = f.id === S.myId;
      const color = f.h ? '#60ff80' : f.ab ? '#fff3a0' : mine ? '#ff5040' : f.c ? '#ffd040' : '#ffffff';
      const text = (f.h ? '+' : f.ab ? 'Absorvido ' : mine ? '-' : '') + f.v + (f.c ? '!' : '');
      S.texts.push({ at, text, color, size: f.c ? 20 : 15, t0: now, dur: 1100, ox: (Math.random() - 0.5) * 24 });
      break;
    }
    case 'xp':
      if (f.id === S.myId) S.texts.push({ at, text: f.txt || `+${f.v} XP`, color: '#c890ff', size: 13, t0: now, dur: 1500, ox: 20 });
      break;
    case 'proj': {
      const a = posOf(f.a);
      S.fx.push({ k: 'proj', sx: a.x, sy: a.y, to: () => posOf(f.b), c: f.c, t0: now, dur: 260 });
      break;
    }
    case 'aoe': S.fx.push({ k: 'aoe', x: f.x, y: f.y, r: f.r, c: f.c, t0: now, dur: 650 }); break;
    case 'lvl':
      S.fx.push({ k: 'lvl', at, t0: now, dur: 1600 });
      S.texts.push({ at, text: 'NOVO NÍVEL!', color: '#ffe060', size: 20, t0: now, dur: 2000, ox: 0 });
      break;
    case 'say': S.bubbles.set(f.id, { text: f.text, until: Date.now() + 6500, at }); break;
    case 'cast': S.attackAt.set(f.id, now + 320); break;
  }
}

// ======================= Início do jogo =======================
function start() {
  started = true;
  $('login').classList.add('hidden');
  $('hud').classList.remove('hidden');
  initRender();
  initUI();
  setupInput();
  addChat({ ch: 'a', msg: `Bem-vindo a Valoria, ${S.me.name}! Pressione H para o guia. Fale com NPCs usando E.` });
  if (!S.me.prof) addChat({ ch: 's', msg: 'Dica: visite a Mestra das Guildas (leste da praça) para escolher uma profissão.' });
  let last = performance.now(), lastSend = 0, lastHud = 0, sentX = S.x, sentY = S.y;
  const frame = now => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    S.time += dt;
    update(dt);
    if (now - lastSend > 100 && (Math.abs(S.x - sentX) > 0.001 || Math.abs(S.y - sentY) > 0.001)) {
      send({ t: 'mv', x: +S.x.toFixed(3), y: +S.y.toFixed(3), d: S.dir });
      sentX = S.x; sentY = S.y; lastSend = now;
    }
    render();
    if (now - lastHud > 100) { updateHUD(); renderPanel(); lastHud = now; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  setInterval(() => { if (S.panel === 'npc') { const n = allNpcs().find(x => x.id === S.panelArg); if (n && n.role === 'market') send({ t: 'mkt', a: 'get' }); if (n && n.role === 'jobs') send({ t: 'job', a: 'get' }); } }, 4000);
}

function update(dt) {
  const me = S.me;
  // Movimento local (previsão)
  let vx = 0, vy = 0;
  const k = S.keys;
  if (k.KeyW || k.ArrowUp) vy -= 1;
  if (k.KeyS || k.ArrowDown) vy += 1;
  if (k.KeyA || k.ArrowLeft) vx -= 1;
  if (k.KeyD || k.ArrowRight) vx += 1;
  S.moving = false;
  if ((vx || vy) && !me.dead && !me.stun && !me.root) {
    const len = Math.hypot(vx, vy);
    const sp = SPEED * (me.slow ? 0.55 : 1) * 0.97 * dt;
    const nx = S.x + (vx / len) * sp, ny = S.y + (vy / len) * sp;
    if (!blocked(nx, ny)) { S.x = nx; S.y = ny; S.moving = true; }
    else if (!blocked(nx, S.y)) { S.x = nx; S.moving = true; }
    else if (!blocked(S.x, ny)) { S.y = ny; S.moving = true; }
    S.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0);
  }
  // Interpolação dos outros
  const a = 1 - Math.exp(-dt * 14);
  for (const p of S.players.values()) {
    const dx = p.tx - p.x, dy = p.ty - p.y;
    p.moving = Math.hypot(dx, dy) > 0.05;
    if (Math.hypot(dx, dy) > 6) { p.x = p.tx; p.y = p.ty; } else { p.x += dx * a; p.y += dy * a; }
  }
  for (const m of S.mobs.values()) {
    const dx = m.tx - m.x, dy = m.ty - m.y;
    m.moving = Math.hypot(dx, dy) > 0.03;
    if (Math.abs(dx) > 0.02) m.face = dx > 0 ? 1 : -1;
    if (m.moving) m.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : (dy < 0 ? 3 : 0);
    if (Math.hypot(dx, dy) > 6) { m.x = m.tx; m.y = m.ty; } else { m.x += dx * a; m.y += dy * a; }
  }
  // Fecha painel de NPC ao se afastar
  if (S.panel === 'npc') {
    const n = allNpcs().find(x => x.id === S.panelArg);
    if (!n || dist(S.x, S.y, n.x, n.y) > 7) closePanel();
  }
}

// ======================= Entrada =======================
function nearestEnemy(maxD = 20, exclude) {
  let best = null, bd = maxD;
  for (const m of S.mobs.values()) {
    const d = dist(S.x, S.y, m.x, m.y);
    if (d < bd && m.id !== exclude) { bd = d; best = m; }
  }
  return best;
}

function interact() {
  let best = null, bd = 3.2;
  for (const n of allNpcs()) { const d = dist(S.x, S.y, n.x, n.y); if (d < bd) { bd = d; best = n; } }
  if (best) { S.target = best.id; openPanel('npc', best.id); return; }
  let node = null, nd = 2;
  for (const n of S.nodes.values()) { if (!n.avail) continue; const d = dist(S.x, S.y, n.x, n.y); if (d < nd) { nd = d; node = n; } }
  if (node) { send({ t: 'gather', id: node.id }); return; }
  toast('Nada por perto para interagir.', 'err');
}

function cast(ab) {
  const A = S.defs.abilities[ab];
  let tg = S.target;
  if ((A.kind === 'dmg' || (A.kind === 'aoe' && !A.self)) && (!tg || !S.mobs.has(tg))) {
    const m = nearestEnemy(Math.max(A.range + 1, 12));
    if (m) { S.target = m.id; tg = m.id; }
  }
  send({ t: 'cast', ab, tg });
}

function setupInput() {
  const chatInput = $('chatinput');
  window.addEventListener('cast', e => cast(e.detail));
  window.addEventListener('keydown', e => {
    if (document.activeElement === chatInput) {
      if (e.key === 'Enter') {
        let msg = chatInput.value.trim();
        let ch = $('chatch').value;
        if (msg.startsWith('!')) { ch = 'g'; msg = msg.slice(1).trim(); }
        if (msg) send({ t: 'chat', ch, msg });
        chatInput.value = '';
        chatInput.blur();
      } else if (e.key === 'Escape') chatInput.blur();
      return;
    }
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') { if (e.key === 'Escape') document.activeElement.blur(); return; }
    S.keys[e.code] = true;
    const C = S.defs.classes[S.me.cls];
    switch (e.code) {
      case 'Enter': e.preventDefault(); chatInput.focus(); break;
      case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': cast(C.abilities[Number(e.code.slice(5)) - 1]); break;
      case 'Digit5': case 'Digit6': case 'Digit7': case 'Digit8': usePotionSlot(e.code.slice(5)); break;
      case 'Tab': { e.preventDefault(); const m = nearestEnemy(20, S.target); if (m) S.target = m.id; break; }
      case 'Escape': if (S.panel) closePanel(); else S.target = null; break;
      case 'KeyE': case 'KeyF': interact(); break;
      case 'KeyC': togglePanel('char'); break;
      case 'KeyB': case 'KeyI': togglePanel('inv'); break;
      case 'KeyP': togglePanel('prof'); break;
      case 'KeyL': case 'KeyJ': togglePanel('quests'); break;
      case 'KeyO': togglePanel('pol'); break;
      case 'KeyM': togglePanel('map'); break;
      case 'KeyH': togglePanel('help'); break;
    }
  });
  window.addEventListener('keyup', e => { S.keys[e.code] = false; });
  window.addEventListener('blur', () => { S.keys = {}; });

  const canvas = $('game');
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousedown', e => {
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    const w = screenToWorld(e.clientX, e.clientY);
    const hit = (x, y, r) => dist(w.x, w.y, x, y - 0.35) < r;
    const hitTall = (x, y) => Math.abs(w.x - x) < 0.6 && w.y > y - 1.6 && w.y < y + 0.4;
    for (const m of S.mobs.values()) if (hit(m.x, m.y, S.defs.mobs[m.type].size + 0.3)) { S.target = m.id; return; }
    for (const n of allNpcs()) {
      if (hit(n.x, n.y, 0.7)) {
        S.target = n.id;
        if (dist(S.x, S.y, n.x, n.y) < 3.5) openPanel('npc', n.id);
        else toast(`Aproxime-se de ${n.name} e pressione E.`);
        return;
      }
    }
    for (const p of S.players.values()) if (p.id !== S.myId && hitTall(p.x, p.y)) { S.target = p.id; return; }
    for (const n of S.nodes.values()) {
      if (n.avail && dist(w.x, w.y, n.x, n.y) < 0.7) {
        if (dist(S.x, S.y, n.x, n.y) < 2) send({ t: 'gather', id: n.id });
        else toast(`${S.defs.nodes[n.type].name}: aproxime-se para coletar (E).`);
        return;
      }
    }
    if (e.button === 0) S.target = null;
  });
}

setupLogin();
