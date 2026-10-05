'use strict';
// Núcleo do servidor: jogadores, combate, monstros, profissões, economia e missões.

const D = require('./data');
const World = require('./world');
const { Politics } = require('./politics');
const storage = require('./storage');

const TICK_MS = 50;
const VIEW = 30;
const PLAYER_SPEED = 4.6;
const RADIUS = 0.3;
const GCD = 500;
const CONSUMABLE_CD = 6000;
const NAME_RE = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9_]{3,16}$/;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const int = (v, a, b) => clamp(Math.floor(Number(v) || 0), a, b);

const LANDMARKS = [
  { name: 'Lago do Bosque', x: 42, y: 92 },
  { name: 'Clareira das Aranhas', x: 30, y: 135 },
  { name: 'Fazenda do Joaquim', x: 99, y: 153 },
  { name: 'Portão das Minas', x: 110, y: 62 },
  { name: 'Margem do Pântano', x: 152, y: 112 },
  { name: 'Estrada do Sul', x: 104, y: 178 },
  { name: 'Posto do Norte', x: 110, y: 46 },
  { name: 'Porto Sereno', x: 186, y: 178 },
  { name: 'Ponte do Rio', x: 140, y: 41 },
];
const BOARD_ITEMS = [['trigo', 10], ['erva', 8], ['minerio_ferro', 6], ['couro', 5], ['carvao', 6], ['seda', 4], ['gosma', 5]];
const BOARD_MOBS = ['ratazana', 'lobo', 'javali', 'aranha', 'bandido', 'gosma', 'kobold', 'crocodilo'];

class Game {
  constructor() {
    this.db = storage.load();
    if (!this.db.accounts) this.db.accounts = {};
    const w = this.db.world || {};
    this.map = World.generate(1337);
    this.players = new Map();
    this.mobs = new Map();
    this.nodes = new Map();
    this.nextId = 1;
    this.market = w.market || [];
    this.contracts = w.contracts || [];
    this.tradeMult = w.tradeMult || {};
    this.listingId = w.listingId || 1;
    this.politics = new Politics(this, w.politics);
    this.npcById = Object.fromEntries(World.NPCS.map(n => [n.id, n]));
    this.royalTasks = [];
    while (this.royalTasks.length < 5) this.royalTasks.push(this.newRoyalTask());
    this.fx = [];
    this.lastTick = Date.now();
    this.tickCount = 0;
    this.spawnWorld();
    this.mapPayload = {
      W: World.W, H: World.H,
      tiles: Buffer.from(this.map.tiles).toString('base64'),
      zones: Buffer.from(this.map.zones).toString('base64'),
    };
    this.defs = {
      classes: D.CLASSES, abilities: D.ABILITIES, items: D.ITEMS, recipes: D.RECIPES, professions: D.PROFESSIONS,
      nodes: D.NODES, quests: D.QUESTS, foci: D.FOCI, topics: D.DEBATE_TOPICS, xp: D.XP_TABLE, maxLevel: D.MAX_LEVEL,
      mobs: Object.fromEntries(Object.entries(D.MOBS).map(([k, m]) => [k, { name: m.name, lv: m.lv, color: m.color, size: m.size, boss: !!m.boss }])),
      zones: World.ZONES, npcs: World.NPCS, trade: World.TRADE, buildings: World.BUILDINGS, forum: World.FORUM,
    };
  }

  id(prefix) { return prefix + (this.nextId++); }

  // ======================= Mundo =======================
  spawnWorld() {
    for (const s of World.SPAWNS) {
      for (let i = 0; i < s.count; i++) {
        const pos = this.map.randomFree(s.rect, Math.random);
        if (pos && !this.map.zoneAt(pos.x, pos.y).safe) this.addMob(s.mob, pos.x, pos.y);
      }
    }
    this.addMob(World.BOSS.mob, World.BOSS.x, World.BOSS.y);
    for (const s of World.NODE_SPAWNS) {
      for (let i = 0; i < s.count; i++) {
        const pos = this.map.randomFree(s.rect, Math.random);
        if (!pos) continue;
        const id = this.id('n');
        this.nodes.set(id, { id, type: s.node, x: pos.x, y: pos.y, avail: true, respawnAt: 0 });
      }
    }
  }

  addMob(type, x, y) {
    const def = D.MOBS[type];
    const id = this.id('m');
    this.mobs.set(id, {
      id, type, def, x, y, sx: x, sy: y, hp: def.hp, maxHp: def.hp, target: null, state: 'idle',
      atkReady: 0, wanderAt: Date.now() + Math.random() * 5000, wx: x, wy: y, dead: false, respawnAt: 0,
      stunUntil: 0, rootUntil: 0, slowUntil: 0, dmgBy: new Map(), novaAt: 0, lastScan: 0,
    });
  }

  blocked(x, y) {
    const m = this.map;
    return m.isSolid(x - RADIUS, y - RADIUS) || m.isSolid(x + RADIUS, y - RADIUS) ||
      m.isSolid(x - RADIUS, y + RADIUS) || m.isSolid(x + RADIUS, y + RADIUS);
  }

  near(p, npcId, d = 4) {
    const n = this.npcById[npcId];
    return n && Math.hypot(p.x - n.x, p.y - n.y) <= d;
  }

  // ======================= Conexões =======================
  onConnect(ws) {
    const conn = { ws, player: null, msgCount: 0, msgWindow: Date.now() };
    ws.on('message', raw => {
      const now = Date.now();
      if (now - conn.msgWindow > 1000) { conn.msgWindow = now; conn.msgCount = 0; }
      if (++conn.msgCount > 60) return;
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      try { this.handle(conn, m); } catch (e) { console.error('Erro ao processar mensagem', m.t, e); }
    });
    ws.on('close', () => { if (conn.player) this.logout(conn.player); });
    ws.on('error', () => {});
  }

  send(p, msg) {
    if (p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
  }

  broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.ws.readyState === 1) p.ws.send(s);
  }

  announce(text) { this.broadcast({ t: 'chat', ch: 'a', msg: text }); }
  toast(p, text, kind = 'info') { this.send(p, { t: 'toast', text, kind }); }
  findOnline(name) { return this.players.get(String(name).toLowerCase()) || null; }
  getChar(name) { const a = this.db.accounts[String(name).toLowerCase()]; return a ? a.char : null; }
  className(p) { return D.CLASSES[p.char.cls].name; }

  login(conn, m) {
    const name = clean(m.name, 16);
    const pass = String(m.pass || '');
    const ws = conn.ws;
    const fail = text => ws.send(JSON.stringify({ t: 'loginFail', text }));
    if (!NAME_RE.test(name)) return fail('Nome inválido (3-16 letras, números ou _).');
    if (pass.length < 3 || pass.length > 64) return fail('Senha deve ter entre 3 e 64 caracteres.');
    const key = name.toLowerCase();
    let acc = this.db.accounts[key];
    if (acc) {
      if (!storage.checkPassword(pass, acc.salt, acc.hash)) return fail('Senha incorreta.');
    } else {
      if (!D.CLASSES[m.cls]) return fail('Personagem novo: escolha uma classe.');
      if (World.NPCS.some(n => n.name.toLowerCase() === key)) return fail('Nome reservado.');
      const { salt, hash } = storage.hashPassword(pass);
      acc = this.db.accounts[key] = { salt, hash, char: this.newChar(name, m.cls), created: Date.now() };
    }
    const old = this.players.get(key);
    if (old) {
      this.toast(old, 'Sua conta conectou em outro lugar.', 'err');
      old.kicked = true;
      old.ws.close();
      this.logout(old);
    }
    const c = acc.char;
    this.migrateChar(c);
    const p = {
      id: this.id('p'), name: key, ws, char: c, x: c.x, y: c.y, dir: 0,
      buffs: [], hots: [], shield: 0, cds: {}, gcdUntil: 0, consumeCd: 0, stunUntil: 0, rootUntil: 0, slowUntil: 0,
      lastCombat: 0, dead: false, respawnAt: 0, gathering: null, moveBudget: PLAYER_SPEED, lastChat: 0, lastPol: '',
    };
    if (this.blocked(p.x, p.y)) { p.x = World.SPAWN_POINT.x; p.y = World.SPAWN_POINT.y; }
    conn.player = p;
    this.players.set(key, p);
    this.recalc(p);
    if (c.hp == null || c.hp <= 0) c.hp = p.maxHp;
    if (c.mana == null) c.mana = p.maxMana;
    this.send(p, { t: 'welcome', id: p.id, map: this.mapPayload, defs: this.defs, nodes: [...this.nodes.values()].map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y, avail: n.avail })) });
    this.send(p, { t: 'pos', x: p.x, y: p.y });
    this.sendSelf(p);
    this.send(p, this.politics.publicState(p));
    this.announce(`${c.name} (${this.className(p)} nível ${c.lv}) entrou em Valoria.`);
    if (c.notes && c.notes.length) {
      for (const n of c.notes) this.send(p, { t: 'chat', ch: 's', msg: n });
      c.notes = [];
    }
  }

  newChar(name, cls) {
    const C = D.CLASSES[cls];
    const weapon = { espada: 'espada_velha', cajado: 'cajado_velho', arco: 'arco_velho' }[C.weapon];
    return {
      name, cls, lv: 1, xp: 0, gold: 25, x: World.SPAWN_POINT.x, y: World.SPAWN_POINT.y, hp: null, mana: null,
      inv: { pocao_vida: 3, pao: 3 }, equip: { weapon, armor: 'roupas_simples' },
      prof: null, profChanges: 0, skills: {}, quests: {}, questsDone: [], task: null, kills: 0, notes: [],
    };
  }

  migrateChar(c) {
    c.inv = c.inv || {}; c.skills = c.skills || {}; c.quests = c.quests || {};
    c.questsDone = c.questsDone || []; c.notes = c.notes || []; c.equip = c.equip || {};
  }

  logout(p) {
    if (this.players.get(p.name) !== p) return;
    p.char.x = p.x; p.char.y = p.y;
    if (p.dead) { p.char.x = World.SPAWN_POINT.x; p.char.y = World.SPAWN_POINT.y; p.char.hp = p.maxHp; }
    this.players.delete(p.name);
    for (const mob of this.mobs.values()) if (mob.target === p.id) mob.target = null;
    if (!p.kicked) this.announce(`${p.char.name} deixou Valoria.`);
  }

  // ======================= Roteamento =======================
  handle(conn, m) {
    if (m.t === 'login') { if (!conn.player) this.login(conn, m); return; }
    const p = conn.player;
    if (!p) return;
    switch (m.t) {
      case 'mv': return this.onMove(p, m);
      case 'cast': return this.cast(p, m);
      case 'use': return this.useItem(p, m.item);
      case 'equip': return this.equip(p, m.item);
      case 'gather': return this.startGather(p, m.id);
      case 'craft': return this.craft(p, m);
      case 'prof': return this.chooseProfession(p, m.id);
      case 'buy': return this.vendorBuy(p, m);
      case 'sell': return this.vendorSell(p, m);
      case 'mkt': return this.marketAction(p, m);
      case 'trade': return this.tradeAction(p, m);
      case 'job': return this.jobAction(p, m);
      case 'quest': return this.questAction(p, m);
      case 'pol': this.politics.action(p, m); p.lastPol = ''; return;
      case 'chat': return this.chat(p, m);
      case 'ping': return this.send(p, { t: 'pong', ts: m.ts });
    }
  }

  // ======================= Estatísticas =======================
  recalc(p) {
    const c = p.char, C = D.CLASSES[c.cls];
    const w = D.ITEMS[c.equip.weapon], a = D.ITEMS[c.equip.armor];
    p.maxHp = Math.round(C.hp + (c.lv - 1) * C.hpPerLv);
    p.maxMana = Math.round(C.mana + (c.lv - 1) * C.manaPerLv);
    p.power = 4 + c.lv * 2.2 + (w ? w.dmg : 0) * 1.6;
    p.armor = C.armor + (a ? a.armor : 0) + c.lv * 0.5;
    if (c.hp != null) c.hp = Math.min(c.hp, p.maxHp);
    if (c.mana != null) c.mana = Math.min(c.mana, p.maxMana);
  }

  dmgMult(p) {
    let m = 1;
    const now = Date.now();
    for (const b of p.buffs) if (b.until > now && b.dmg) m += b.dmg;
    if (this.politics.isGuard(p)) m += this.politics.focus() === 'militar' ? 0.2 : 0.1;
    return m;
  }

  sendSelf(p) {
    const c = p.char, now = Date.now();
    const cds = {};
    for (const [k, v] of Object.entries(p.cds)) if (v > now) cds[k] = v - now;
    this.send(p, {
      t: 'me', id: p.id, name: c.name, cls: c.cls, lv: c.lv, xp: c.xp, xpNext: D.XP_TABLE[c.lv] || 0,
      hp: Math.ceil(c.hp), maxHp: p.maxHp, mana: Math.floor(c.mana), maxMana: p.maxMana, gold: c.gold,
      inv: c.inv, equip: c.equip, prof: c.prof, skills: c.skills, quests: c.quests, questsDone: c.questsDone,
      task: c.task, power: Math.round(p.power), armor: Math.round(p.armor), shield: Math.round(p.shield),
      buffs: p.buffs.filter(b => b.until > now).map(b => ({ name: b.name, left: b.until - now })),
      cds, gcd: Math.max(0, p.gcdUntil - now), ccd: Math.max(0, p.consumeCd - now),
      stun: p.stunUntil > now, root: p.rootUntil > now, slow: p.slowUntil > now,
      dead: p.dead, respawnIn: p.dead ? Math.max(0, p.respawnAt - now) : 0,
      gather: p.gathering ? { left: p.gathering.until - now, total: p.gathering.total } : null,
      kills: c.kills, profChanges: c.profChanges, king: this.politics.isKing(p), guard: this.politics.isGuard(p),
      online: this.players.size,
    });
  }

  // ======================= Movimento =======================
  onMove(p, m) {
    if (p.dead) return;
    const x = Number(m.x), y = Number(m.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const now = Date.now();
    const d = Math.hypot(x - p.x, y - p.y);
    const frozen = p.stunUntil > now || p.rootUntil > now;
    if ((frozen && d > 0.01) || d > p.moveBudget + 0.6 || this.blocked(x, y)) {
      this.send(p, { t: 'pos', x: p.x, y: p.y });
      return;
    }
    p.moveBudget -= d;
    if (d > 0.02 && p.gathering) { p.gathering = null; this.toast(p, 'Coleta interrompida.', 'err'); }
    p.x = x; p.y = y;
    p.dir = int(m.d, 0, 3);
  }

  // ======================= Combate =======================
  entity(id) {
    if (typeof id !== 'string') return null;
    if (id[0] === 'm') return this.mobs.get(id) || null;
    if (id[0] === 'p') for (const p of this.players.values()) if (p.id === id) return p;
    return null;
  }

  cast(p, m) {
    const now = Date.now();
    const C = D.CLASSES[p.char.cls];
    const abId = m.ab;
    if (!C.abilities.includes(abId)) return;
    const ab = D.ABILITIES[abId];
    if (p.dead) return;
    if (p.stunUntil > now) return this.toast(p, 'Você está atordoado!', 'err');
    if (p.gcdUntil > now || (p.cds[abId] || 0) > now) return;
    if (p.char.mana < ab.cost) return this.toast(p, `${C.resource} insuficiente.`, 'err');
    if (this.map.zoneAt(p.x, p.y).safe && (ab.kind === 'dmg' || ab.kind === 'aoe')) return this.toast(p, 'Combate proibido em zonas seguras.', 'err');

    const target = this.entity(m.tg);
    const isMob = target && target.def && !target.dead;
    const allyTarget = target && target.char && !target.dead ? target : p;

    if (ab.kind === 'dmg' || (ab.kind === 'aoe' && !ab.self)) {
      if (!isMob) return this.toast(p, 'Selecione um inimigo (clique ou Tab).', 'err');
      if (dist(p, target) > ab.range + target.def.size) return this.toast(p, 'Alvo fora de alcance.', 'err');
    }
    if ((ab.kind === 'heal' || ab.kind === 'shield' || ab.kind === 'hot') && dist(p, allyTarget) > ab.range) {
      return this.toast(p, 'Aliado fora de alcance.', 'err');
    }

    p.char.mana -= ab.cost;
    p.cds[abId] = now + ab.cd * 1000;
    p.gcdUntil = now + GCD;
    p.gathering = null;
    const amount = () => {
      let v = (ab.base + p.power * ab.coef) * this.dmgMult(p) * (0.9 + Math.random() * 0.2);
      const crit = Math.random() < 0.1;
      if (crit) v *= 1.6;
      return { v, crit };
    };

    switch (ab.kind) {
      case 'dmg': {
        if (ab.dash) {
          const ang = Math.atan2(p.y - target.y, p.x - target.x);
          const nx = target.x + Math.cos(ang) * (target.def.size + 0.6), ny = target.y + Math.sin(ang) * (target.def.size + 0.6);
          if (!this.blocked(nx, ny)) { p.x = nx; p.y = ny; this.send(p, { t: 'pos', x: nx, y: ny }); }
        }
        if (ab.proj) this.addFx({ k: 'proj', a: p.id, b: target.id, c: ab.proj }, p);
        const { v, crit } = amount();
        this.damageMob(target, v, p, crit);
        if (ab.stun) target.stunUntil = now + ab.stun * 1000;
        if (ab.root) target.rootUntil = now + ab.root * 1000;
        if (ab.slow) target.slowUntil = now + ab.slow * 1000;
        break;
      }
      case 'aoe': {
        const cx = ab.self ? p.x : target.x, cy = ab.self ? p.y : target.y;
        this.addFx({ k: 'aoe', x: cx, y: cy, r: ab.radius, c: abId === 'nova_gelida' ? '#9be7ff' : abId === 'tiro_multiplo' ? '#e0c080' : '#ff6060' }, p);
        for (const mob of this.mobs.values()) {
          if (mob.dead || Math.hypot(mob.x - cx, mob.y - cy) > ab.radius + mob.def.size) continue;
          const { v, crit } = amount();
          this.damageMob(mob, v, p, crit);
          if (ab.root) mob.rootUntil = now + ab.root * 1000;
        }
        break;
      }
      case 'buff':
        p.buffs.push({ name: ab.name, dmg: ab.buff.dmg, until: now + ab.buff.dur * 1000 });
        this.addFx({ k: 'aoe', x: p.x, y: p.y, r: 1.5, c: '#ffcc00' }, p);
        break;
      case 'heal': {
        const v = (ab.base + p.power * ab.coef) * (0.9 + Math.random() * 0.2);
        this.healPlayer(allyTarget, v, p);
        break;
      }
      case 'shield':
        allyTarget.shield = Math.max(allyTarget.shield, ab.base + p.power * ab.coef);
        allyTarget.shieldUntil = now + 15000;
        this.addFx({ k: 'aoe', x: allyTarget.x, y: allyTarget.y, r: 1, c: '#ffffaa' }, allyTarget);
        break;
      case 'hot':
        allyTarget.hots = allyTarget.hots.filter(h => h.name !== ab.name);
        allyTarget.hots.push({ name: ab.name, per: ab.base + p.power * ab.coef, until: now + ab.dur * 1000, next: now + 1000, src: p });
        this.addFx({ k: 'aoe', x: allyTarget.x, y: allyTarget.y, r: 1, c: '#66ff88' }, allyTarget);
        break;
    }
    this.addFx({ k: 'cast', id: p.id, ab: abId }, p);
  }

  healPlayer(t, v, src) {
    const c = t.char;
    const before = c.hp;
    c.hp = Math.min(t.maxHp, c.hp + v);
    if (c.hp - before >= 1) this.addFx({ k: 'dmg', id: t.id, v: Math.round(c.hp - before), h: 1 }, t);
    if (src && src !== t) src.lastCombat = Math.max(src.lastCombat, t.lastCombat);
  }

  damageMob(mob, v, p, crit) {
    if (mob.dead) return;
    const dmg = Math.max(1, Math.round(v * 60 / (60 + mob.def.armor * 2)));
    mob.hp -= dmg;
    mob.dmgBy.set(p.id, (mob.dmgBy.get(p.id) || 0) + dmg);
    p.lastCombat = Date.now();
    if (!mob.target || mob.state === 'idle') { mob.target = p.id; mob.state = 'chase'; }
    this.addFx({ k: 'dmg', id: mob.id, v: dmg, c: crit ? 1 : 0 }, mob);
    if (mob.hp <= 0) this.killMob(mob);
  }

  damagePlayer(p, v, src) {
    if (p.dead) return;
    const now = Date.now();
    let dmg = Math.max(1, Math.round(v * 80 / (80 + p.armor * 2)));
    if (p.shield > 0 && (p.shieldUntil || 0) > now) {
      const ab = Math.min(p.shield, dmg);
      p.shield -= ab; dmg -= ab;
      if (ab > 0) this.addFx({ k: 'dmg', id: p.id, v: ab, ab: 1 }, p);
    }
    p.lastCombat = now;
    if (dmg <= 0) return;
    p.char.hp -= dmg;
    p.gathering = null;
    this.addFx({ k: 'dmg', id: p.id, v: dmg, p: 1 }, p);
    if (p.char.hp <= 0) this.killPlayer(p, src);
  }

  killPlayer(p, src) {
    p.dead = true;
    p.char.hp = 0;
    p.respawnAt = Date.now() + 6000;
    p.buffs = []; p.hots = []; p.shield = 0;
    for (const mob of this.mobs.values()) if (mob.target === p.id) { mob.target = null; mob.state = 'return'; }
    this.addFx({ k: 'death', id: p.id }, p);
    this.toast(p, `Você foi derrotado${src ? ' por ' + src.def.name : ''}. Renascerá em Valoria...`, 'err');
  }

  respawn(p) {
    p.dead = false;
    p.x = World.SPAWN_POINT.x; p.y = World.SPAWN_POINT.y;
    p.char.hp = Math.round(p.maxHp * 0.6); p.char.mana = Math.round(p.maxMana * 0.6);
    this.send(p, { t: 'pos', x: p.x, y: p.y });
  }

  killMob(mob) {
    const def = mob.def;
    mob.dead = true;
    mob.respawnAt = Date.now() + (def.respawn || 25) * 1000;
    this.addFx({ k: 'death', id: mob.id }, mob);
    let total = 0, topId = null, top = 0;
    for (const [pid, d] of mob.dmgBy) { total += d; if (d > top) { top = d; topId = pid; } }
    const contributors = [];
    for (const [pid, d] of mob.dmgBy) {
      const p = this.entity(pid);
      if (p && !p.dead && (d / total >= 0.15 || pid === topId) && dist(p, mob) < 40) contributors.push(p);
    }
    for (const p of contributors) {
      const diff = def.lv - p.char.lv;
      let mult = diff <= -6 ? 0.1 : clamp(1 + diff * 0.12, 0.1, 1.6);
      if (this.politics.focus() === 'militar') mult *= 1.15;
      if (this.politics.festival()) mult *= 1.25;
      this.giveXp(p, Math.round(def.xp * mult));
      p.char.kills = (p.char.kills || 0) + 1;
      for (const [qid, q] of Object.entries(p.char.quests)) {
        const Q = D.QUESTS[qid];
        if (Q && Q.type === 'kill' && Q.target === mob.type && q.n < Q.count) {
          q.n++;
          this.toast(p, `${Q.name}: ${q.n}/${Q.count}`, q.n >= Q.count ? 'ok' : 'info');
        }
      }
      const task = p.char.task;
      if (task && task.type === 'caca' && task.mob === mob.type && task.n < task.count) {
        task.n++;
        if (task.n >= task.count) this.toast(p, 'Tarefa Real concluída! Volte ao Quadro de Empregos.', 'ok');
      }
    }
    const killer = this.entity(topId);
    if (killer && killer.char) {
      const gold = rint(def.gold[0], def.gold[1]);
      killer.char.gold += gold;
      const got = [`${gold} ouro`];
      for (const [item, chance] of def.loot) {
        if (Math.random() < chance) {
          this.addItem(killer, item, 1);
          got.push(D.ITEMS[item].name);
          if (D.ITEMS[item].epic) this.announce(`⭐ ${killer.char.name} obteve o lendário [${D.ITEMS[item].name}]!`);
        }
      }
      this.send(killer, { t: 'chat', ch: 's', msg: `Saque de ${def.name}: ${got.join(', ')}` });
      this.politics.onMobKill(killer, mob.type);
      if (def.boss) this.announce(`☠️ ${def.name} foi derrotado por ${contributors.map(c => c.char.name).join(', ')}!`);
    }
    mob.dmgBy.clear();
    mob.target = null;
  }

  giveXp(p, xp) {
    const c = p.char;
    if (c.lv >= D.MAX_LEVEL) return;
    c.xp += xp;
    this.addFx({ k: 'xp', id: p.id, v: xp }, p);
    while (c.lv < D.MAX_LEVEL && c.xp >= D.XP_TABLE[c.lv]) {
      c.xp -= D.XP_TABLE[c.lv];
      c.lv++;
      this.recalc(p);
      c.hp = p.maxHp; c.mana = p.maxMana;
      this.addFx({ k: 'lvl', id: p.id }, p);
      this.toast(p, `Você alcançou o nível ${c.lv}!`, 'gold');
      if (c.lv % 5 === 0 || c.lv === D.MAX_LEVEL) this.announce(`🎉 ${c.name} alcançou o nível ${c.lv}!`);
    }
    if (c.lv >= D.MAX_LEVEL) c.xp = 0;
  }

  giveGold(p, amount, reason) {
    p.char.gold += amount;
    this.send(p, { t: 'chat', ch: 's', msg: `+${amount} ouro (${reason})` });
  }

  // ======================= Itens =======================
  addItem(p, item, qty) {
    const c = p.char || p;
    c.inv[item] = (c.inv[item] || 0) + qty;
  }

  removeItem(c, item, qty) {
    if ((c.inv[item] || 0) < qty) return false;
    c.inv[item] -= qty;
    if (c.inv[item] <= 0) delete c.inv[item];
    return true;
  }

  useItem(p, item) {
    const def = D.ITEMS[item];
    const now = Date.now();
    if (!def || def.type !== 'consumable' || p.dead) return;
    if (!p.char.inv[item]) return;
    if (p.consumeCd > now) return this.toast(p, 'Aguarde para usar outro consumível.', 'err');
    this.removeItem(p.char, item, 1);
    p.consumeCd = now + CONSUMABLE_CD;
    if (def.heal) this.healPlayer(p, def.heal);
    if (def.mana) p.char.mana = Math.min(p.maxMana, p.char.mana + def.mana);
    if (def.buff) p.buffs.push({ name: def.name, dmg: def.buff.dmg, until: now + def.buff.dur * 1000 });
  }

  equip(p, item) {
    const def = D.ITEMS[item];
    const c = p.char;
    if (!def || !c.inv[item]) return;
    if (def.type !== 'weapon' && def.type !== 'armor') return;
    if (def.lvl > c.lv) return this.toast(p, `Requer nível ${def.lvl}.`, 'err');
    if (def.type === 'weapon' && def.wtype !== D.CLASSES[c.cls].weapon) return this.toast(p, `Sua classe não usa ${def.name}.`, 'err');
    const slot = def.type;
    this.removeItem(c, item, 1);
    if (c.equip[slot]) this.addItem(p, c.equip[slot], 1);
    c.equip[slot] = item;
    this.recalc(p);
    this.toast(p, `Equipado: ${def.name}`, 'ok');
  }

  // ======================= Coleta =======================
  startGather(p, id) {
    const n = this.nodes.get(id);
    if (!n || !n.avail || p.dead) return;
    const def = D.NODES[n.type];
    if (dist(p, n) > 2) return this.toast(p, 'Aproxime-se para coletar.', 'err');
    if (def.lvl && p.char.lv < def.lvl) return this.toast(p, `Requer nível ${def.lvl}.`, 'err');
    const total = 1800;
    p.gathering = { id, until: Date.now() + total, total };
  }

  finishGather(p) {
    const n = this.nodes.get(p.gathering.id);
    p.gathering = null;
    if (!n || !n.avail || dist(p, n) > 2.2) return;
    const def = D.NODES[n.type];
    let qty = rint(def.qty[0], def.qty[1]);
    if (p.char.prof === def.bonus) qty *= 2;
    this.addItem(p, def.item, qty);
    const got = [`${qty}x ${D.ITEMS[def.item].name}`];
    if (def.extra && Math.random() < def.extra.chance) { this.addItem(p, def.extra.item, 1); got.push(D.ITEMS[def.extra.item].name); }
    this.send(p, { t: 'chat', ch: 's', msg: `Coletado: ${got.join(', ')}` });
    this.addFx({ k: 'xp', id: p.id, v: 0, txt: `+${qty} ${D.ITEMS[def.item].icon}` }, p);
    n.avail = false;
    n.respawnAt = Date.now() + def.respawn * 1000;
    this.broadcast({ t: 'node', id: n.id, avail: false });
    for (const [qid, q] of Object.entries(p.char.quests)) {
      const Q = D.QUESTS[qid];
      if (Q && Q.type === 'collect' && Q.target === def.item) this.toast(p, `${Q.name}: ${Math.min(p.char.inv[def.item] || 0, Q.count)}/${Q.count}`);
    }
  }

  // ======================= Profissões =======================
  chooseProfession(p, id) {
    if (!D.PROFESSIONS[id]) return;
    if (!this.near(p, 'guildas', 5)) return this.toast(p, 'Fale com a Mestra das Guildas Helena.', 'err');
    const c = p.char;
    if (c.prof === id) return;
    const cost = c.profChanges > 0 ? 50 : 0;
    if (c.gold < cost) return this.toast(p, `Trocar de profissão custa ${cost} de ouro.`, 'err');
    c.gold -= cost;
    this.politics.deposit(cost);
    c.profChanges++;
    if (c.prof === 'empregado' && this.politics.isGuard(p)) {
      this.politics.guards = this.politics.guards.filter(n => n !== p.name);
      this.politics.dirty = true;
    }
    if (c.prof === 'empregado' && c.task) c.task = null;
    c.prof = id;
    c.skills[id] = c.skills[id] || 0;
    this.toast(p, `Você agora é ${D.PROFESSIONS[id].name}!`, 'gold');
    this.announce(`${c.name} tornou-se ${D.PROFESSIONS[id].name} ${D.PROFESSIONS[id].icon}`);
  }

  craft(p, m) {
    const r = D.RECIPES[m.id];
    const c = p.char;
    if (!r) return;
    if (c.prof !== r.prof) return this.toast(p, `Apenas ${D.PROFESSIONS[r.prof].name}s conhecem esta receita.`, 'err');
    const station = World.NPCS.find(n => n.station === r.station);
    if (!station || dist(p, station) > 5) return this.toast(p, `Você precisa estar junto a: ${station ? station.title : r.station}.`, 'err');
    const skill = c.skills[r.prof] || 0;
    if (skill < r.req) return this.toast(p, `Requer habilidade ${r.req} em ${D.PROFESSIONS[r.prof].name}.`, 'err');
    const times = int(m.n, 1, 20);
    let made = 0, gained = 0;
    const artesaos = this.politics.focus() === 'artesaos';
    for (let i = 0; i < times; i++) {
      if (!Object.entries(r.inputs).every(([it, q]) => (c.inv[it] || 0) >= q)) break;
      for (const [it, q] of Object.entries(r.inputs)) this.removeItem(c, it, q);
      let out = r.qty;
      if (artesaos && Math.random() < 0.2) out++;
      this.addItem(p, r.output, out);
      made += out;
      if ((c.skills[r.prof] || 0) < 100 && (c.skills[r.prof] || 0) < r.req + 30) {
        const g = artesaos ? 2 : 1;
        c.skills[r.prof] = Math.min(100, (c.skills[r.prof] || 0) + g);
        gained += g;
      }
    }
    if (!made) return this.toast(p, 'Materiais insuficientes.', 'err');
    this.giveXp(p, made * 4 + r.req);
    this.toast(p, `Produzido: ${made}x ${D.ITEMS[r.output].name}${gained ? ` (+${gained} habilidade)` : ''}`, 'ok');
    this.addFx({ k: 'aoe', x: station.x, y: station.y, r: 1.2, c: '#ffaa33' }, p);
  }

  // ======================= Vendedores NPC =======================
  vendorBuy(p, m) {
    const npc = this.npcById[m.npc];
    const def = D.ITEMS[m.item];
    if (!npc || !def || !npc.sells || !npc.sells.includes(m.item)) return;
    if (dist(p, npc) > 5) return this.toast(p, 'Aproxime-se do vendedor.', 'err');
    const n = int(m.n, 1, 50);
    const tax = this.politics.taxFor(p);
    let unit = Math.ceil(def.value * 1.25);
    if (m.item === 'pao' && this.politics.focus() === 'povo' && p.char.lv <= 5) unit = 0;
    const taxPart = Math.ceil(unit * n * tax);
    const total = unit * n + taxPart;
    if (p.char.gold < total) return this.toast(p, `Você precisa de ${total} de ouro.`, 'err');
    p.char.gold -= total;
    this.politics.deposit(taxPart);
    this.addItem(p, m.item, n);
    this.toast(p, `Comprou ${n}x ${def.name} por ${total} ouro (imposto: ${taxPart}).`, 'ok');
  }

  vendorSell(p, m) {
    const npc = this.npcById[m.npc];
    const def = D.ITEMS[m.item];
    if (!npc || !def || !['vendor', 'station', 'quest', 'trader'].includes(npc.role)) return;
    if (dist(p, npc) > 5) return this.toast(p, 'Aproxime-se do vendedor.', 'err');
    if (def.type === 'quest' || def.type === 'trade') return this.toast(p, 'Este item não pode ser vendido aqui.', 'err');
    const n = int(m.n, 1, 9999);
    if (!this.removeItem(p.char, m.item, n)) return;
    const unit = Math.max(1, Math.floor(def.value * (p.char.prof === 'mercador' ? 0.55 : 0.35)));
    const gross = unit * n;
    const taxPart = Math.floor(gross * this.politics.taxFor(p));
    p.char.gold += gross - taxPart;
    this.politics.deposit(taxPart);
    this.toast(p, `Vendeu ${n}x ${def.name} por ${gross - taxPart} ouro (imposto: ${taxPart}).`, 'ok');
  }

  // ======================= Mercado de jogadores =======================
  marketAction(p, m) {
    const c = p.char;
    const err = t => this.toast(p, t, 'err');
    const reply = () => this.send(p, { t: 'mkt', list: this.market.slice(-300), tax: this.politics.taxFor(p) });
    if (m.a === 'get') return reply();
    if (!this.map.inCity(p.x, p.y)) return err('O Mercado fica em Valoria.');
    if (m.a === 'list') {
      if (c.prof !== 'mercador') return err('Apenas Mercadores podem anunciar no Mercado. Venda para um Mercador ou para NPCs.');
      const def = D.ITEMS[m.item];
      if (!def || def.type === 'quest') return;
      const qty = int(m.qty, 1, 9999), price = int(m.price, 1, 100000);
      if (this.market.filter(l => l.seller === p.name).length >= 15) return err('Limite de 15 anúncios.');
      if (!this.removeItem(c, m.item, qty)) return err('Você não tem itens suficientes.');
      this.market.push({ id: this.listingId++, seller: p.name, sellerName: c.name, item: m.item, qty, price, at: Date.now() });
      this.toast(p, `Anunciado: ${qty}x ${def.name} a ${price} ouro cada.`, 'ok');
      return reply();
    }
    if (m.a === 'buy') {
      const l = this.market.find(x => x.id === m.id);
      if (!l) return err('Anúncio não existe mais.');
      if (l.seller === p.name) return err('Use "Cancelar" para retirar seu anúncio.');
      const qty = int(m.qty, 1, l.qty);
      const total = qty * l.price;
      if (c.gold < total) return err('Ouro insuficiente.');
      c.gold -= total;
      this.addItem(p, l.item, qty);
      l.qty -= qty;
      if (l.qty <= 0) this.market = this.market.filter(x => x !== l);
      const seller = this.findOnline(l.seller);
      const sc = seller ? seller.char : this.getChar(l.seller);
      if (sc) {
        const tax = Math.floor(total * this.politics.taxFor(seller || { char: sc }));
        sc.gold += total - tax;
        this.politics.deposit(tax);
        if (sc.prof === 'mercador') sc.skills.mercador = Math.min(100, (sc.skills.mercador || 0) + 1);
        const note = `💰 ${c.name} comprou ${qty}x ${D.ITEMS[l.item].name} do seu anúncio: +${total - tax} ouro (imposto ${tax}).`;
        if (seller) this.send(seller, { t: 'chat', ch: 's', msg: note });
        else (sc.notes = sc.notes || []).push(note);
      }
      this.toast(p, `Comprou ${qty}x ${D.ITEMS[l.item].name} por ${total} ouro.`, 'ok');
      return reply();
    }
    if (m.a === 'cancel') {
      const l = this.market.find(x => x.id === m.id && x.seller === p.name);
      if (!l) return;
      this.market = this.market.filter(x => x !== l);
      this.addItem(p, l.item, l.qty);
      return reply();
    }
  }

  // ======================= Rotas comerciais =======================
  tradePrice(town, item, kind, p) {
    const T = World.TRADE[town];
    if (kind === 'buy') return T.sells[item];
    const key = town + ':' + item;
    const mult = this.tradeMult[key] != null ? this.tradeMult[key] : 1;
    let v = T.buys[item] * mult;
    if (this.politics.focus() === 'comercio') v *= 1.2;
    if (p && p.char.prof === 'mercador') v *= 1 + (p.char.skills.mercador || 0) / 400;
    return Math.max(1, Math.round(v));
  }

  tradeAction(p, m) {
    const npc = this.npcById[m.npc];
    if (!npc || npc.role !== 'trader') return;
    const town = npc.town, T = World.TRADE[town];
    const c = p.char;
    const reply = () => this.send(p, {
      t: 'trade', npc: npc.id, town,
      sells: Object.keys(T.sells).map(i => ({ item: i, price: this.tradePrice(town, i, 'buy', p) })),
      buys: Object.keys(T.buys).map(i => ({ item: i, price: this.tradePrice(town, i, 'sell', p) })),
    });
    if (m.a === 'get') return reply();
    if (dist(p, npc) > 5) return this.toast(p, 'Aproxime-se do comerciante.', 'err');
    const n = int(m.n, 1, 20);
    if (m.a === 'buy') {
      if (c.prof !== 'mercador') return this.toast(p, 'Apenas Mercadores podem comprar mercadorias por atacado.', 'err');
      if (!T.sells[m.item]) return;
      const total = this.tradePrice(town, m.item, 'buy', p) * n;
      if (c.gold < total) return this.toast(p, 'Ouro insuficiente.', 'err');
      c.gold -= total;
      this.addItem(p, m.item, n);
      this.toast(p, `Comprou ${n}x ${D.ITEMS[m.item].name} por ${total} ouro. Leve para outra cidade!`, 'ok');
      return reply();
    }
    if (m.a === 'sell') {
      if (!T.buys[m.item]) return;
      if ((c.inv[m.item] || 0) < n) return this.toast(p, 'Você não tem essa quantidade.', 'err');
      let gross = 0;
      const key = town + ':' + m.item;
      for (let i = 0; i < n; i++) {
        gross += this.tradePrice(town, m.item, 'sell', p);
        this.tradeMult[key] = Math.max(0.5, (this.tradeMult[key] != null ? this.tradeMult[key] : 1) - 0.04);
      }
      this.removeItem(c, m.item, n);
      const tax = Math.floor(gross * this.politics.taxFor(p));
      c.gold += gross - tax;
      this.politics.deposit(tax);
      if (c.prof === 'mercador') c.skills.mercador = Math.min(100, (c.skills.mercador || 0) + n);
      this.giveXp(p, n * 15);
      this.toast(p, `Vendeu ${n}x ${D.ITEMS[m.item].name} por ${gross - tax} ouro (imposto ${tax}).`, 'ok');
      return reply();
    }
  }

  // ======================= Quadro de Empregos =======================
  newRoyalTask() {
    const board = this.npcById ? this.npcById.quadro : World.NPCS.find(n => n.id === 'quadro');
    const type = pick(['entrega', 'entrega', 'patrulha', 'coleta', 'caca']);
    const t = { id: this.id('t'), type };
    if (type === 'entrega') {
      const target = pick(World.NPCS.filter(n => n.deliver));
      const d = Math.hypot(target.x - board.x, target.y - board.y);
      Object.assign(t, { npc: target.id, title: `Entregar Pacote Real a ${target.name}`, pay: Math.round(10 + d * 0.55) });
    } else if (type === 'patrulha') {
      const pts = [...LANDMARKS].sort(() => Math.random() - 0.5).slice(0, 3);
      let d = 0, prev = board;
      for (const q of pts) { d += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; }
      Object.assign(t, { points: pts.map(q => ({ ...q, ok: false })), title: `Patrulhar: ${pts.map(q => q.name).join(', ')}`, pay: Math.round(15 + d * 0.3) });
    } else if (type === 'coleta') {
      const [item, qty] = pick(BOARD_ITEMS);
      Object.assign(t, { item, qty, title: `Abastecer o reino: ${qty}x ${D.ITEMS[item].name}`, pay: Math.round(qty * D.ITEMS[item].value * 3 + 12) });
    } else {
      const mob = pick(BOARD_MOBS);
      const count = 6;
      Object.assign(t, { mob, count, n: 0, title: `Caçar ${count}x ${D.MOBS[mob].name}`, pay: Math.round(D.MOBS[mob].lv * 7 + 10) });
    }
    t.xp = t.pay * 4;
    return t;
  }

  taskPay(p, base) {
    let pay = base * (1 + (p.char.skills.empregado || 0) / 100);
    if (this.politics.focus() === 'povo') pay *= 1.5;
    pay = Math.round(pay);
    if (this.politics.withdraw(pay)) return { pay, note: 'pago pelo Tesouro Real' };
    return { pay: Math.round(pay / 2), note: 'Tesouro vazio: pagamento reduzido pela metade' };
  }

  jobAction(p, m) {
    const c = p.char;
    const err = t => this.toast(p, t, 'err');
    const reply = () => this.send(p, { t: 'jobs', tasks: this.royalTasks, contracts: this.contracts });
    if (m.a === 'get') return reply();
    const atBoard = this.near(p, 'quadro', 5);
    switch (m.a) {
      case 'take': {
        if (c.prof !== 'empregado') return err('Apenas Empregados podem aceitar Tarefas Reais. Escolha a profissão no Salão das Guildas.');
        if (!atBoard) return err('Vá até o Quadro de Empregos.');
        if (c.task) return err('Você já tem uma tarefa. Conclua ou abandone.');
        const i = this.royalTasks.findIndex(t => t.id === m.id);
        if (i < 0) return err('Tarefa indisponível.');
        const task = this.royalTasks.splice(i, 1)[0];
        this.royalTasks.push(this.newRoyalTask());
        c.task = task;
        if (task.type === 'entrega') this.addItem(p, 'pacote_real', 1);
        this.toast(p, `Tarefa aceita: ${task.title}`, 'ok');
        return reply();
      }
      case 'abandon': {
        if (!c.task) return;
        if (c.task.type === 'entrega') this.removeItem(c, 'pacote_real', 1);
        c.task = null;
        this.toast(p, 'Tarefa abandonada.');
        return;
      }
      case 'deliver': {
        const task = c.task;
        if (!task || task.type !== 'entrega' || task.npc !== m.npc) return;
        if (!this.near(p, task.npc, 5)) return err('Aproxime-se do destinatário.');
        if (!this.removeItem(c, 'pacote_real', 1)) return err('Você perdeu o pacote!');
        return this.completeTask(p);
      }
      case 'turnin': {
        const task = c.task;
        if (!task || !atBoard) return err('Entregue no Quadro de Empregos.');
        if (task.type === 'patrulha' && !task.points.every(q => q.ok)) return err('Patrulha incompleta.');
        if (task.type === 'caca' && task.n < task.count) return err('Caçada incompleta.');
        if (task.type === 'coleta' && !this.removeItem(c, task.item, task.qty)) return err(`Você precisa de ${task.qty}x ${D.ITEMS[task.item].name}.`);
        if (task.type === 'entrega') return err('Entregue o pacote ao destinatário.');
        return this.completeTask(p);
      }
      case 'post': {
        if (!this.map.inCity(p.x, p.y)) return err('Publique contratos em Valoria.');
        const def = D.ITEMS[m.item];
        if (!def || def.type === 'quest') return err('Item inválido.');
        const qty = int(m.qty, 1, 500), reward = int(m.reward, 1, 100000);
        if (this.contracts.filter(k => k.poster === p.name).length >= 5) return err('Limite de 5 contratos.');
        if (c.gold < reward) return err('Ouro insuficiente para a garantia do pagamento.');
        c.gold -= reward;
        this.contracts.push({ id: this.listingId++, poster: p.name, posterName: c.name, item: m.item, qty, reward, at: Date.now() });
        this.announce(`📋 Novo contrato de ${c.name}: ${qty}x ${def.name} por ${reward} ouro (Quadro de Empregos).`);
        return reply();
      }
      case 'fulfill': {
        if (c.prof !== 'empregado') return err('Apenas Empregados podem cumprir contratos.');
        if (!atBoard) return err('Vá até o Quadro de Empregos.');
        const k = this.contracts.find(x => x.id === m.id);
        if (!k) return err('Contrato não existe mais.');
        if (k.poster === p.name) return err('Você não pode cumprir seu próprio contrato.');
        if (!this.removeItem(c, k.item, k.qty)) return err(`Você precisa de ${k.qty}x ${D.ITEMS[k.item].name}.`);
        this.contracts = this.contracts.filter(x => x !== k);
        const poster = this.findOnline(k.poster);
        const pc = poster ? poster.char : this.getChar(k.poster);
        if (pc) {
          pc.inv[k.item] = (pc.inv[k.item] || 0) + k.qty;
          const note = `📋 ${c.name} cumpriu seu contrato: você recebeu ${k.qty}x ${D.ITEMS[k.item].name}.`;
          if (poster) this.send(poster, { t: 'chat', ch: 's', msg: note }); else (pc.notes = pc.notes || []).push(note);
        }
        const tax = Math.floor(k.reward * this.politics.taxFor(p));
        c.gold += k.reward - tax;
        this.politics.deposit(tax);
        c.skills.empregado = Math.min(100, (c.skills.empregado || 0) + 2);
        this.giveXp(p, Math.round(k.reward * 2));
        this.toast(p, `Contrato cumprido! +${k.reward - tax} ouro (imposto ${tax}).`, 'gold');
        return reply();
      }
      case 'cancel': {
        const k = this.contracts.find(x => x.id === m.id && x.poster === p.name);
        if (!k) return;
        this.contracts = this.contracts.filter(x => x !== k);
        c.gold += k.reward;
        return reply();
      }
    }
  }

  completeTask(p) {
    const c = p.char, task = c.task;
    const { pay, note } = this.taskPay(p, task.pay);
    c.gold += pay;
    c.task = null;
    c.skills.empregado = Math.min(100, (c.skills.empregado || 0) + 3);
    this.giveXp(p, task.xp);
    this.toast(p, `Tarefa concluída! +${pay} ouro (${note}).`, 'gold');
  }

  // ======================= Missões =======================
  questAction(p, m) {
    const Q = D.QUESTS[m.id];
    const c = p.char;
    if (!Q) return;
    if (!this.near(p, Q.giver, 6)) return this.toast(p, `Fale com ${this.npcById[Q.giver].name}.`, 'err');
    if (m.a === 'accept') {
      if (c.questsDone.includes(m.id) || c.quests[m.id]) return;
      if (c.lv < Q.lvl) return this.toast(p, `Requer nível ${Q.lvl}.`, 'err');
      c.quests[m.id] = { n: 0 };
      this.toast(p, `Missão aceita: ${Q.name}`, 'ok');
    } else if (m.a === 'turnin') {
      const q = c.quests[m.id];
      if (!q) return;
      if (Q.type === 'kill' && q.n < Q.count) return this.toast(p, 'Missão incompleta.', 'err');
      if (Q.type === 'collect' && !this.removeItem(c, Q.target, Q.count)) return this.toast(p, `Você precisa de ${Q.count}x ${D.ITEMS[Q.target].name}.`, 'err');
      delete c.quests[m.id];
      c.questsDone.push(m.id);
      c.gold += Q.gold;
      if (Q.item) this.addItem(p, Q.item, 1);
      this.giveXp(p, Q.xp);
      this.toast(p, `Missão concluída: ${Q.name}! +${Q.gold} ouro, +${Q.xp} XP`, 'gold');
    } else if (m.a === 'abandon') {
      delete c.quests[m.id];
    }
  }

  // ======================= Chat =======================
  chat(p, m) {
    const now = Date.now();
    if (now - p.lastChat < 600) return;
    p.lastChat = now;
    const msg = clean(m.msg, 200);
    if (!msg) return;
    const name = p.char.name;
    const title = this.politics.isKing(p) ? '👑 ' : this.politics.isGuard(p) ? '🛡️ ' : '';
    if (msg[0] === '/') return this.command(p, msg);
    if (m.ch === 'g') return this.broadcast({ t: 'chat', ch: 'g', from: title + name, msg });
    for (const o of this.players.values()) if (dist(o, p) < 25) this.send(o, { t: 'chat', ch: 'l', from: title + name, msg });
    this.bubble(p, msg);
  }

  command(p, msg) {
    const [cmd, ...rest] = msg.slice(1).split(/\s+/);
    const sys = t => this.send(p, { t: 'chat', ch: 's', msg: t });
    switch (cmd.toLowerCase()) {
      case 'w': case 'sussurrar': {
        const t = this.findOnline(rest[0] || '');
        if (!t) return sys('Jogador não encontrado.');
        const text = rest.slice(1).join(' ');
        this.send(t, { t: 'chat', ch: 'w', from: p.char.name, msg: text });
        return this.send(p, { t: 'chat', ch: 'w', from: '→ ' + t.char.name, msg: text });
      }
      case 'pagar': {
        const t = this.findOnline(rest[0] || '');
        const n = int(rest[1], 0, 1e7);
        if (!t || t === p) return sys('Uso: /pagar nome quantidade');
        if (dist(t, p) > 8) return sys('Aproxime-se do jogador para pagar.');
        if (!n || p.char.gold < n) return sys('Ouro insuficiente.');
        p.char.gold -= n; t.char.gold += n;
        sys(`Você pagou ${n} ouro a ${t.char.name}.`);
        return this.send(t, { t: 'chat', ch: 's', msg: `${p.char.name} pagou ${n} ouro a você.` });
      }
      case 'dar': {
        const t = this.findOnline(rest[0] || '');
        const n = int(rest[rest.length - 1], 1, 9999);
        const itemName = rest.slice(1, -1).join(' ').toLowerCase();
        const item = Object.keys(p.char.inv).find(k => k === itemName || D.ITEMS[k].name.toLowerCase() === itemName);
        if (!t || t === p || !item) return sys('Uso: /dar nome item quantidade (ex: /dar Ana Poção de Vida 2)');
        if (dist(t, p) > 8) return sys('Aproxime-se do jogador.');
        if (D.ITEMS[item].type === 'quest') return sys('Não é possível dar este item.');
        if (!this.removeItem(p.char, item, n)) return sys('Você não tem essa quantidade.');
        this.addItem(t, item, n);
        sys(`Você deu ${n}x ${D.ITEMS[item].name} a ${t.char.name}.`);
        return this.send(t, { t: 'chat', ch: 's', msg: `${p.char.name} deu ${n}x ${D.ITEMS[item].name} a você.` });
      }
      case 'quem': {
        const list = [...this.players.values()].map(o => `${o.char.name} (${D.CLASSES[o.char.cls].name} ${o.char.lv}${o.char.prof ? ', ' + D.PROFESSIONS[o.char.prof].name : ''})`);
        return sys(`Online (${list.length}): ${list.join(', ')}`);
      }
      case 'ajuda': default:
        return sys('Comandos: /w nome msg · /pagar nome qtd · /dar nome item qtd · /quem · Chat: Enter (local) · prefixo "!" ou aba Geral (global)');
    }
  }

  bubble(p, text) { this.addFx({ k: 'say', id: p.id, text }, p); }

  npcSay(id, text) {
    const f = World.FORUM;
    this.addFx({ k: 'say', id, text }, { x: f.cx, y: f.cy });
  }

  // ======================= Loop =======================
  addFx(fx, at) {
    fx._x = at.x; fx._y = at.y;
    this.fx.push(fx);
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.2, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.tickCount++;

    for (const p of this.players.values()) this.tickPlayer(p, now, dt);
    for (const mob of this.mobs.values()) this.tickMob(mob, now, dt);
    if (this.tickCount % 10 === 0) {
      for (const n of this.nodes.values()) {
        if (!n.avail && now >= n.respawnAt) { n.avail = true; this.broadcast({ t: 'node', id: n.id, avail: true }); }
      }
    }
    if (this.tickCount % 200 === 0) {
      for (const k of Object.keys(this.tradeMult)) {
        this.tradeMult[k] = Math.min(1, this.tradeMult[k] + 0.01);
        if (this.tradeMult[k] >= 1) delete this.tradeMult[k];
      }
    }
    this.politics.tick(now);

    // Envio de fx
    if (this.fx.length) {
      for (const p of this.players.values()) {
        const list = this.fx.filter(f => Math.abs(f._x - p.x) < VIEW + 5 && Math.abs(f._y - p.y) < VIEW + 5);
        if (list.length) this.send(p, { t: 'fx', l: list.map(({ _x, _y, ...f }) => f) });
      }
      this.fx = [];
    }
    if (this.tickCount % 2 === 0) this.sendSnapshots();
    if (this.tickCount % 4 === 0) for (const p of this.players.values()) this.sendSelf(p);
    if (this.tickCount % 20 === 0) {
      for (const p of this.players.values()) {
        const st = JSON.stringify(this.politics.publicState(p));
        const key = st.replace(/"(endsIn|topicEndsIn|festivalLeft)":\d+/g, '');
        if (key !== p.lastPol) { p.lastPol = key; p.ws.readyState === 1 && p.ws.send(st); }
      }
    }
  }

  tickPlayer(p, now, dt) {
    const c = p.char;
    p.moveBudget = Math.min(PLAYER_SPEED * 1.2, p.moveBudget + PLAYER_SPEED * (p.slowUntil > now ? 0.55 : 1) * dt);
    if (p.dead) {
      if (now >= p.respawnAt) this.respawn(p);
      return;
    }
    const outOfCombat = now - p.lastCombat > 5000;
    c.hp = Math.min(p.maxHp, c.hp + (outOfCombat ? p.maxHp * 0.04 : 0) * dt);
    c.mana = Math.min(p.maxMana, c.mana + p.maxMana * (outOfCombat ? 0.05 : 0.015) * dt);
    if (p.buffs.length) p.buffs = p.buffs.filter(b => b.until > now);
    if (p.shieldUntil && p.shieldUntil < now) p.shield = 0;
    for (const h of p.hots) {
      if (now >= h.next && h.until >= now - 50) { h.next += 1000; this.healPlayer(p, h.per, h.src); }
    }
    if (p.hots.length) p.hots = p.hots.filter(h => h.until > now);
    if (p.gathering && now >= p.gathering.until) this.finishGather(p);
    const task = c.task;
    if (task && task.type === 'patrulha' && this.tickCount % 10 === 0) {
      for (const q of task.points) {
        if (!q.ok && Math.hypot(p.x - q.x, p.y - q.y) < 6) {
          q.ok = true;
          this.toast(p, `Patrulha: ${q.name} verificado(a).${task.points.every(z => z.ok) ? ' Volte ao Quadro de Empregos!' : ''}`, 'ok');
        }
      }
    }
    c.x = p.x; c.y = p.y;
  }

  tickMob(mob, now, dt) {
    const def = mob.def;
    if (mob.dead) {
      if (now >= mob.respawnAt) {
        mob.dead = false; mob.hp = mob.maxHp; mob.x = mob.sx; mob.y = mob.sy; mob.state = 'idle'; mob.target = null;
      }
      return;
    }
    if (mob.stunUntil > now) return;
    let target = mob.target ? this.entity(mob.target) : null;
    if (mob.target && (!target || target.dead || this.map.zoneAt(target.x, target.y).safe)) { target = null; mob.target = null; mob.state = 'return'; }

    if (!target && mob.state !== 'return' && now - mob.lastScan > 400) {
      mob.lastScan = now;
      let best = null, bd = def.aggro;
      for (const p of this.players.values()) {
        if (p.dead || p.char.lv >= def.lv + 8) continue;
        const d = dist(p, mob);
        if (d < bd && !this.map.zoneAt(p.x, p.y).safe) { bd = d; best = p; }
      }
      if (best) { mob.target = best.id; mob.state = 'chase'; target = best; }
    }

    const speed = def.speed * (mob.slowUntil > now ? 0.5 : 1) * (mob.rootUntil > now ? 0 : 1);
    if (target) {
      if (Math.hypot(mob.x - mob.sx, mob.y - mob.sy) > (def.boss ? 18 : 28)) {
        mob.target = null; mob.state = 'return';
        return;
      }
      const d = dist(mob, target);
      if (d > def.range) {
        this.stepMob(mob, target.x, target.y, speed * dt);
      } else if (now >= mob.atkReady) {
        mob.atkReady = now + def.atkCd * 1000;
        if (def.ranged) this.addFx({ k: 'proj', a: mob.id, b: target.id, c: def.ranged }, mob);
        this.damagePlayer(target, def.dmg * (0.85 + Math.random() * 0.3), mob);
      }
      if (def.nova && now >= mob.novaAt) {
        mob.novaAt = now + def.nova.every * 1000;
        this.addFx({ k: 'aoe', x: mob.x, y: mob.y, r: def.nova.radius, c: '#7dff5a' }, mob);
        for (const p of this.players.values()) if (!p.dead && dist(p, mob) < def.nova.radius) this.damagePlayer(p, def.nova.dmg, mob);
      }
    } else if (mob.state === 'return') {
      this.stepMob(mob, mob.sx, mob.sy, def.speed * 1.4 * dt);
      mob.hp = Math.min(mob.maxHp, mob.hp + mob.maxHp * 0.2 * dt);
      if (Math.hypot(mob.x - mob.sx, mob.y - mob.sy) < 0.5) { mob.state = 'idle'; mob.hp = mob.maxHp; mob.dmgBy.clear(); }
    } else {
      if (now >= mob.wanderAt) {
        mob.wanderAt = now + 3000 + Math.random() * 6000;
        mob.wx = mob.sx + (Math.random() - 0.5) * 8;
        mob.wy = mob.sy + (Math.random() - 0.5) * 8;
      }
      if (Math.hypot(mob.wx - mob.x, mob.wy - mob.y) > 0.3) this.stepMob(mob, mob.wx, mob.wy, def.speed * 0.35 * dt);
    }
  }

  stepMob(mob, tx, ty, step) {
    const dx = tx - mob.x, dy = ty - mob.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01 || step <= 0) return;
    const s = Math.min(step, d);
    const nx = mob.x + dx / d * s, ny = mob.y + dy / d * s;
    const ok = (x, y) => !this.blocked(x, y) && !this.map.zoneAt(x, y).safe;
    if (ok(nx, ny)) { mob.x = nx; mob.y = ny; }
    else if (ok(nx, mob.y)) mob.x = nx;
    else if (ok(mob.x, ny)) mob.y = ny;
    else if (mob.state === 'idle') { mob.wx = mob.x; mob.wy = mob.y; }
  }

  sendSnapshots() {
    const r2 = n => Math.round(n * 100) / 100;
    const ps = [...this.players.values()];
    for (const p of ps) {
      const pl = [], ml = [];
      for (const o of ps) {
        if (Math.abs(o.x - p.x) > VIEW || Math.abs(o.y - p.y) > VIEW) continue;
        const flags = (this.politics.isKing(o) ? 1 : 0) | (this.politics.isGuard(o) ? 2 : 0) | (o.dead ? 4 : 0) | (this.politics.isCandidate(o) ? 8 : 0);
        pl.push([o.id, o.char.name, r2(o.x), r2(o.y), o.char.cls, Math.ceil(o.char.hp), o.maxHp, o.char.lv, flags, o.dir, o.char.prof || '']);
      }
      for (const m of this.mobs.values()) {
        if (m.dead || Math.abs(m.x - p.x) > VIEW || Math.abs(m.y - p.y) > VIEW) continue;
        ml.push([m.id, m.type, r2(m.x), r2(m.y), Math.ceil(m.hp), m.maxHp, m.target ? 1 : 0]);
      }
      this.send(p, { t: 's', p: pl, m: ml });
    }
  }

  // ======================= Persistência =======================
  save() {
    for (const p of this.players.values()) { p.char.x = p.x; p.char.y = p.y; }
    this.db.world = {
      market: this.market, contracts: this.contracts, tradeMult: this.tradeMult, listingId: this.listingId,
      politics: this.politics.serialize(),
    };
    storage.save(this.db);
  }

  start() {
    this.loop = setInterval(() => this.tick(), TICK_MS);
    this.saver = setInterval(() => { try { this.save(); } catch (e) { console.error('Falha ao salvar:', e); } }, 30000);
  }

  stop() {
    clearInterval(this.loop);
    clearInterval(this.saver);
  }
}

module.exports = { Game, PLAYER_SPEED, RADIUS };
