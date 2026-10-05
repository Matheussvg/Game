'use strict';
// Testes de integração do servidor (sem rede): jogadores simulados com WebSocket falso.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'valoria-test-'));
const { Game } = require('../server/game');
const World = require('../server/world');

function fakeWs() {
  return { readyState: 1, msgs: [], send(s) { this.msgs.push(JSON.parse(s)); }, on() {}, close() { this.readyState = 3; } };
}

function join(game, name, cls = 'guerreiro', pass = 'segredo') {
  const ws = fakeWs();
  const conn = { ws, player: null, msgCount: 0, msgWindow: Date.now() };
  game.handle(conn, { t: 'login', name, pass, cls });
  const p = conn.player;
  const act = m => game.handle(conn, m);
  const toasts = () => ws.msgs.filter(m => m.t === 'toast').map(m => m.text);
  const at = (x, y) => { p.x = x; p.y = y; };
  const atNpc = id => { const n = World.NPCS.find(x => x.id === id); at(n.x, n.y + 0.8); };
  return { conn, ws, p, act, toasts, at, atNpc };
}

const game = new Game();

test('cria conta, recusa senha errada e carrega personagem', () => {
  const a = join(game, 'Arthur', 'guerreiro');
  assert.ok(a.p, 'jogador conectado');
  assert.equal(a.p.char.cls, 'guerreiro');
  assert.equal(a.p.char.equip.weapon, 'espada_velha');
  const ws = fakeWs();
  const conn = { ws, player: null };
  game.handle(conn, { t: 'login', name: 'arthur', pass: 'errada' });
  assert.equal(conn.player, null);
  assert.match(ws.msgs[0].text, /Senha incorreta/);
});

test('ferreiro forja barras e ganha habilidade', () => {
  const b = join(game, 'Brunhilda', 'guerreiro');
  b.atNpc('guildas');
  b.act({ t: 'prof', id: 'ferreiro' });
  assert.equal(b.p.char.prof, 'ferreiro');
  b.p.char.inv.minerio_ferro = 4; b.p.char.inv.carvao = 2;
  b.atNpc('ferreiro');
  b.act({ t: 'craft', id: 'barra_ferro', n: 5 });
  assert.equal(b.p.char.inv.barra_ferro, 2);
  assert.equal(b.p.char.skills.ferreiro, 2);
  assert.equal(b.p.char.inv.minerio_ferro, undefined);
});

test('somente mercadores anunciam; compra transfere ouro e cobra imposto', () => {
  const s = join(game, 'Mercia', 'cacador');
  const buyer = join(game, 'Comprador', 'mago');
  s.p.char.inv.couro = 10;
  s.at(110.5, 112.5);
  s.act({ t: 'mkt', a: 'list', item: 'couro', qty: 5, price: 10 });
  assert.equal(game.market.length, 0, 'não-mercador não anuncia');
  s.atNpc('guildas');
  s.act({ t: 'prof', id: 'mercador' });
  s.at(110.5, 112.5);
  s.act({ t: 'mkt', a: 'list', item: 'couro', qty: 5, price: 10 });
  assert.equal(game.market.length, 1);
  const treasury = game.politics.treasury;
  const goldBefore = s.p.char.gold;
  buyer.p.char.gold = 100;
  buyer.at(110.5, 112.5);
  buyer.act({ t: 'mkt', a: 'buy', id: game.market[0].id, qty: 3 });
  assert.equal(buyer.p.char.inv.couro, 3);
  assert.equal(buyer.p.char.gold, 70);
  const tax = Math.floor(30 * game.politics.taxFor(s.p));
  assert.equal(s.p.char.gold, goldBefore + 30 - tax);
  assert.equal(game.politics.treasury, treasury + tax);
  assert.equal(game.market[0].qty, 2);
});

test('contratos: publicar com garantia e cumprir como empregado', () => {
  const boss = join(game, 'Patrao', 'sacerdote');
  const worker = join(game, 'Operario', 'guerreiro');
  boss.p.char.gold = 200;
  boss.at(110.5, 112.5);
  boss.act({ t: 'job', a: 'post', item: 'trigo', qty: 10, reward: 50 });
  assert.equal(boss.p.char.gold, 150);
  const k = game.contracts.find(c => c.poster === 'patrao');
  assert.ok(k);
  worker.atNpc('guildas');
  worker.act({ t: 'prof', id: 'empregado' });
  worker.p.char.inv.trigo = 12;
  worker.atNpc('quadro');
  const g0 = worker.p.char.gold;
  worker.act({ t: 'job', a: 'fulfill', id: k.id });
  assert.equal(worker.p.char.inv.trigo, 2);
  assert.equal(boss.p.char.inv.trigo, 10);
  assert.ok(worker.p.char.gold > g0);
  assert.ok(!game.contracts.includes(k));
});

test('tarefa real de entrega paga o empregado', () => {
  const w = game.findOnline('operario');
  w.x = game.npcById.quadro.x; w.y = game.npcById.quadro.y + 0.8;
  game.royalTasks[0] = { id: 'tx1', type: 'entrega', npc: 'capitao', title: 'teste', pay: 20, xp: 80 };
  game.handle({ player: w }, { t: 'job', a: 'take', id: 'tx1' });
  assert.equal(w.char.task.id, 'tx1');
  assert.equal(w.char.inv.pacote_real, 1);
  const g0 = w.char.gold;
  w.x = game.npcById.capitao.x; w.y = game.npcById.capitao.y + 0.8;
  game.handle({ player: w }, { t: 'job', a: 'deliver', npc: 'capitao' });
  assert.equal(w.char.task, null);
  assert.ok(w.char.gold > g0);
});

test('combate: matar monstro dá XP, saque e progresso de missão', () => {
  const h = join(game, 'Heroina', 'mago');
  h.atNpc('capitao');
  h.act({ t: 'quest', a: 'accept', id: 'q_ratos' });
  assert.ok(h.p.char.quests.q_ratos);
  const mob = [...game.mobs.values()].find(m => m.type === 'ratazana');
  h.at(mob.x, mob.y);
  for (let i = 0; i < 10 && !mob.dead; i++) {
    h.p.gcdUntil = 0; h.p.cds = {}; h.p.char.mana = 999;
    h.act({ t: 'cast', ab: 'bola_fogo', tg: mob.id });
  }
  assert.ok(mob.dead, 'monstro morreu');
  assert.ok(h.p.char.xp > 0 || h.p.char.lv > 1);
  assert.equal(h.p.char.quests.q_ratos.n, 1);
});

test('ciclo político completo: candidatura, debate, votação e coroação', () => {
  const pol = game.politics;
  const c = join(game, 'Candidata', 'sacerdote');
  c.p.char.lv = 5; c.p.char.gold = 100;
  pol.phaseEnds = 0; pol.tick(Date.now());
  assert.equal(pol.phase, 'candidatura');
  assert.equal(pol.candidates.filter(x => x.isNpc).length, 2);
  c.at(World.CITY.x0 + 3, World.CITY.y0 + 3);
  c.act({ t: 'pol', a: 'candidate', focus: 'povo', tax: 3, slogan: 'Pão para todos' });
  assert.ok(!pol.isCandidate(c.p), 'precisa estar perto do Arauto');
  c.atNpc('arauto');
  c.act({ t: 'pol', a: 'candidate', focus: 'povo', tax: 3, slogan: 'Pão para todos' });
  assert.ok(pol.isCandidate(c.p));
  assert.equal(c.p.char.gold, 50);

  pol.phaseEnds = 0; pol.tick(Date.now());
  assert.equal(pol.phase, 'debate');
  c.at(World.FORUM.cx + 0.5, World.FORUM.cy + 1.5);
  c.act({ t: 'pol', a: 'speak', text: 'Reduzirei os impostos e darei trabalho ao povo!' });
  const st = pol.debate.feed.find(f => f.who === 'Candidata');
  assert.ok(st, 'discurso registrado');

  // Plateia aplaude
  const voters = ['Arthur', 'Brunhilda', 'Mercia', 'Comprador', 'Patrao', 'Heroina'].map(n => game.findOnline(n));
  for (const v of voters) {
    v.x = World.FORUM.cx + 2; v.y = World.FORUM.cy + 3;
    game.handle({ player: v }, { t: 'pol', a: 'react', id: st.id, kind: 'up' });
  }
  assert.equal(st.applause.length, voters.length);

  pol.phaseEnds = 0; pol.tick(Date.now());
  assert.equal(pol.phase, 'votacao');
  for (const v of voters) game.handle({ player: v }, { t: 'pol', a: 'vote', name: 'Candidata' });
  assert.equal(Object.keys(pol.votes).length, voters.length);

  pol.phaseEnds = 0; pol.tick(Date.now());
  assert.equal(pol.phase, 'reinado');
  assert.equal(pol.king.name, 'Candidata');
  assert.ok(pol.isKing(c.p));
  assert.equal(pol.tax, 3);

  // Rei governa no trono
  c.atNpc('trono');
  c.act({ t: 'pol', a: 'setTax', tax: 25 });
  assert.equal(pol.tax, 25);
  const t0 = pol.treasury;
  c.act({ t: 'pol', a: 'bounty', mob: 'lobo', reward: 2, count: 5 });
  assert.equal(pol.treasury, t0 - 10);
  const op = game.findOnline('operario');
  c.act({ t: 'pol', a: 'appoint', name: 'Operario' });
  assert.ok(pol.isGuard(op));
});

test('petição de desconfiança derruba o rei', () => {
  const pol = game.politics;
  pol.king.since = 0;
  const names = ['Arthur', 'Brunhilda', 'Mercia', 'Comprador', 'Patrao'];
  for (const n of names) {
    const p = game.findOnline(n);
    p.char.lv = 5;
    p.x = World.FORUM.cx + 2; p.y = World.FORUM.cy + 3;
    game.handle({ player: p }, { t: 'pol', a: 'petition' });
    if (pol.phase !== 'reinado') break;
  }
  assert.equal(pol.phase, 'candidatura');
});

test('rotas comerciais: mercador compra barato e vende caro', () => {
  const m = game.findOnline('mercia');
  m.char.gold = 500;
  const porto = game.npcById.comerciante_porto, valoria = game.npcById.comerciante_valoria;
  m.x = porto.x; m.y = porto.y + 0.8;
  game.handle({ player: m }, { t: 'trade', a: 'buy', npc: 'comerciante_porto', item: 'caixa_especiarias', n: 5 });
  assert.equal(m.char.inv.caixa_especiarias, 5);
  assert.equal(m.char.gold, 400);
  m.x = valoria.x; m.y = valoria.y + 0.8;
  game.handle({ player: m }, { t: 'trade', a: 'sell', npc: 'comerciante_valoria', item: 'caixa_especiarias', n: 5 });
  assert.ok(!m.char.inv.caixa_especiarias);
  assert.ok(m.char.gold > 500, 'lucro com a rota: ' + m.char.gold);
});

test('movimento: servidor rejeita teleporte e paredes', () => {
  const a = game.findOnline('arthur');
  a.x = World.SPAWN_POINT.x; a.y = World.SPAWN_POINT.y; a.moveBudget = 5;
  game.onMove(a, { x: a.x + 30, y: a.y });
  assert.equal(a.x, World.SPAWN_POINT.x);
  game.onMove(a, { x: a.x + 0.4, y: a.y });
  assert.ok(Math.abs(a.x - (World.SPAWN_POINT.x + 0.4)) < 1e-9);
  a.x = World.CITY.x0 + 1.5; a.y = World.CITY.y0 + 5.5; a.moveBudget = 5;
  game.onMove(a, { x: World.CITY.x0 + 0.5, y: a.y });
  assert.equal(a.x, World.CITY.x0 + 1.5, 'muralha bloqueia');
});

test('persistência salva e recarrega', () => {
  game.save();
  const g2 = new Game();
  assert.ok(g2.db.accounts.arthur);
  assert.equal(g2.politics.phase, game.politics.phase);
  assert.equal(g2.market.length, game.market.length);
});
