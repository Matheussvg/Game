// HUD e painéis da interface.
import { S, send, item, esc, fmtTime, npcById, zoneAt, dist } from './state.js';
import { drawWorldMap } from './render.js';

const $ = id => document.getElementById(id);
let lastHtml = '';
let mouseDownInPanel = false;
const POTION_SLOTS = [
  { key: '5', items: ['pocao_grande_vida', 'pocao_vida'], icon: '🧪' },
  { key: '6', items: ['pocao_mana'], icon: '🔵' },
  { key: '7', items: ['banquete', 'ensopado', 'pao'], icon: '🍞' },
  { key: '8', items: ['elixir_forca'], icon: '💪' },
];

// ======================= Inicialização =======================
export function initUI() {
  const panel = $('panel');
  panel.addEventListener('mousedown', () => { mouseDownInPanel = true; });
  window.addEventListener('mouseup', () => { setTimeout(() => { mouseDownInPanel = false; }, 0); });
  panel.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (el) doAction(el.dataset.act, el);
  });
  panel.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.enter) doAction(e.target.dataset.enter, e.target);
    e.stopPropagation();
  });
  document.querySelectorAll('#menu button').forEach(b => b.addEventListener('click', () => togglePanel(b.dataset.open)));
  $('minimap').addEventListener('click', () => togglePanel('map'));

  // Tooltip
  const tip = $('tooltip');
  document.addEventListener('mousemove', e => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (!el) { tip.classList.add('hidden'); return; }
    tip.innerHTML = el.dataset.tip;
    tip.classList.remove('hidden');
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 8, e.clientX + 14) + 'px';
    tip.style.top = Math.min(window.innerHeight - r.height - 8, e.clientY + 14) + 'px';
  });

  buildActionBar();
}

function buildActionBar() {
  const bar = $('actionbar');
  bar.innerHTML = '';
  const C = S.defs.classes[S.me.cls];
  C.abilities.forEach((ab, i) => {
    const A = S.defs.abilities[ab];
    const d = document.createElement('div');
    d.className = 'slot';
    d.dataset.ab = ab;
    d.dataset.tip = `<b>${esc(A.name)}</b><br>${esc(A.desc)}<br><span class="muted">Custo: ${A.cost} ${C.resource} · Recarga: ${A.cd}s${A.range ? ' · Alcance: ' + A.range : ''}</span>`;
    d.innerHTML = `<span class="key">${i + 1}</span>${A.icon}<div class="cd hidden"></div>`;
    d.addEventListener('click', () => window.dispatchEvent(new CustomEvent('cast', { detail: ab })));
    bar.appendChild(d);
  });
  const sep = document.createElement('div'); sep.className = 'slot sep'; bar.appendChild(sep);
  POTION_SLOTS.forEach(ps => {
    const d = document.createElement('div');
    d.className = 'slot';
    d.dataset.pot = ps.key;
    d.innerHTML = `<span class="key">${ps.key}</span><span class="ic">${ps.icon}</span><span class="qty"></span><div class="cd hidden"></div>`;
    d.addEventListener('click', () => usePotionSlot(ps.key));
    bar.appendChild(d);
  });
}

export function usePotionSlot(key) {
  const ps = POTION_SLOTS.find(p => p.key === key);
  if (!ps || !S.me) return;
  const it = ps.items.find(i => S.me.inv[i]);
  if (it) send({ t: 'use', item: it });
  else toast(`Você não tem ${ps.items.map(i => item(i).name).join(' / ')}.`, 'err');
}

// ======================= HUD =======================
export function updateHUD() {
  const me = S.me;
  if (!me) return;
  const C = S.defs.classes[me.cls];
  const prof = me.prof ? S.defs.professions[me.prof] : null;
  $('pframe').innerHTML = `
    <div class="nm"><span style="color:${me.king ? '#f0c050' : '#fff'}">${me.king ? '👑 ' : me.guard ? '🛡️ ' : ''}${esc(me.name)}</span><span>Nv ${me.lv}</span></div>
    <div class="bar hp"><div class="fill" style="width:${(me.hp / me.maxHp) * 100}%"></div><span>${me.hp} / ${me.maxHp}</span></div>
    ${me.shield > 0 ? `<div class="bar shield" style="height:6px"><div class="fill" style="width:${Math.min(100, (me.shield / me.maxHp) * 100)}%"></div></div>` : ''}
    <div class="bar mp"><div class="fill" style="width:${(me.mana / me.maxMana) * 100}%"></div><span>${C.resource}: ${me.mana} / ${me.maxMana}</span></div>
    <div class="meta"><span>${C.name}${prof ? ' · ' + prof.icon + ' ' + prof.name : ''}</span><span style="color:#f0c050">💰 ${me.gold}</span></div>
    <div class="buffs">${me.buffs.map(b => `<span>${esc(b.name)} ${Math.ceil(b.left / 1000)}s</span>`).join('')}${me.stun ? '<span>💫 Atordoado</span>' : ''}${me.root ? '<span>⛓️ Preso</span>' : ''}${me.slow ? '<span>🐌 Lento</span>' : ''}</div>`;

  // Alvo
  const tf = $('tframe');
  const tid = S.target;
  let th = '';
  if (tid) {
    const mob = S.mobs.get(tid), pl = S.players.get(tid), npc = npcById(tid);
    if (mob) {
      const d = S.defs.mobs[mob.type];
      th = `<div class="nm"><span style="color:#ff8070">${esc(d.name)}${d.boss ? ' ☠️' : ''}</span><span>Nv ${d.lv}</span></div>
        <div class="bar ehp"><div class="fill" style="width:${(mob.hp / mob.maxHp) * 100}%"></div><span>${mob.hp} / ${mob.maxHp}</span></div>
        <div class="meta"><span>${mob.aggro ? 'Em combate' : 'Monstro'}</span><span>${dist(S.x, S.y, mob.x, mob.y).toFixed(1)} m</span></div>`;
    } else if (pl) {
      const pc = S.defs.classes[pl.cls];
      th = `<div class="nm"><span style="color:#80c0ff">${pl.flags & 1 ? '👑 ' : ''}${esc(pl.name)}</span><span>Nv ${pl.lv}</span></div>
        <div class="bar hp"><div class="fill" style="width:${(pl.hp / pl.maxHp) * 100}%"></div><span>${pl.hp} / ${pl.maxHp}</span></div>
        <div class="meta"><span>${pc.name}${pl.prof ? ' · ' + S.defs.professions[pl.prof].name : ''}</span><span>${pl.flags & 2 ? 'Guarda Real' : ''}</span></div>`;
    } else if (npc) {
      th = `<div class="nm"><span style="color:#9ef0a0">${esc(npc.name)}</span></div><div class="meta"><span>${esc(npc.title)}</span><span>[E] Interagir</span></div>`;
    } else S.target = null;
  }
  tf.classList.toggle('hidden', !th);
  if (th) tf.innerHTML = th;

  // Barra de ações
  for (const el of document.querySelectorAll('#actionbar .slot[data-ab]')) {
    const ab = el.dataset.ab, A = S.defs.abilities[ab];
    const cd = Math.max(me.cds[ab] || 0, me.gcd || 0);
    const cdEl = el.querySelector('.cd');
    cdEl.classList.toggle('hidden', cd <= 0);
    cdEl.textContent = cd > 1000 ? Math.ceil(cd / 1000) : '';
    el.classList.toggle('nomana', me.mana < A.cost);
  }
  for (const el of document.querySelectorAll('#actionbar .slot[data-pot]')) {
    const ps = POTION_SLOTS.find(p => p.key === el.dataset.pot);
    const it = ps.items.find(i => me.inv[i]);
    const qty = ps.items.reduce((a, i) => a + (me.inv[i] || 0), 0);
    el.querySelector('.ic').textContent = it ? item(it).icon : ps.icon;
    el.querySelector('.qty').textContent = qty || '';
    el.style.opacity = qty ? 1 : 0.45;
    el.dataset.tip = it ? `<b>${esc(item(it).name)}</b><br>${itemStats(it)}` : `Sem ${esc(ps.items.map(i => item(i).name).join(' / '))}`;
    const cdEl = el.querySelector('.cd');
    cdEl.classList.toggle('hidden', !(me.ccd > 0));
    cdEl.textContent = me.ccd > 0 ? Math.ceil(me.ccd / 1000) : '';
  }

  // XP
  const xpPct = me.xpNext ? (me.xp / me.xpNext) * 100 : 100;
  $('xpbar').querySelector('.fill').style.width = xpPct + '%';
  $('xpbar').querySelector('span').textContent = me.lv >= S.defs.maxLevel ? 'Nível máximo' : `XP ${me.xp} / ${me.xpNext} (${xpPct.toFixed(1)}%)`;

  // Coleta
  const cb = $('castbar');
  if (me.gather) {
    cb.classList.remove('hidden');
    cb.querySelector('.fill').style.width = (1 - me.gather.left / me.gather.total) * 100 + '%';
    cb.querySelector('span').textContent = 'Coletando...';
  } else cb.classList.add('hidden');

  // Morte
  $('death').classList.toggle('hidden', !me.dead);
  if (me.dead) $('death').querySelector('p').textContent = `Renascendo em Valoria em ${Math.ceil(me.respawnIn / 1000)}s...`;

  // Fase política
  const pol = S.pol;
  if (pol) {
    const left = pol.endsIn - (Date.now() - S.polAt);
    const icon = { reinado: '👑', candidatura: '📜', debate: '🎙️', votacao: '🗳️' }[pol.phase];
    $('phase').innerHTML = `${icon} <b>${esc(pol.phaseName)}</b> · ${fmtTime(left)} · Soberano: <b style="color:#f0c050">${esc(pol.king.name)}</b> · Imposto ${pol.tax}% · Tesouro ${pol.treasury} 💰 · Online: ${me.online}${pol.festivalLeft > 0 ? ' · 🎉 Festival!' : ''}`;
  }

  // Zona
  const z = zoneAt(S.x, S.y);
  if (z.key !== S.zoneKey) {
    S.zoneKey = z.key;
    const el = $('zone');
    el.innerHTML = `${esc(z.name)}<small>${z.safe ? 'Zona segura' : 'Nível ' + z.lv}</small>`;
    el.style.opacity = 1;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = 0; }, 2800);
    $('mmzone').textContent = z.name;
  }
}

// ======================= Chat e avisos =======================
export function addChat(m) {
  const log = $('chatlog');
  const atBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
  const d = document.createElement('div');
  d.className = 'ch-' + m.ch;
  const prefix = { g: '[Geral] ', w: '[Sussurro] ', l: '', s: '', a: '' }[m.ch] || '';
  d.innerHTML = m.from ? `${prefix}<b>${esc(m.from)}:</b> ${esc(m.msg)}` : esc(m.msg);
  log.appendChild(d);
  while (log.children.length > 150) log.removeChild(log.firstChild);
  if (atBottom) log.scrollTop = log.scrollHeight;
}

export function toast(text, kind = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = text;
  $('toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'gold' ? 4500 : 3000);
  while ($('toasts').children.length > 5) $('toasts').firstChild.remove();
}

// ======================= Painéis =======================
const TITLES = { char: 'Personagem', inv: 'Inventário', prof: 'Profissão', quests: 'Missões e Tarefas', pol: 'Reino de Valoria — Política', map: 'Mapa do Mundo', help: 'Guia de Valoria' };

export function togglePanel(name, arg) {
  if (S.panel === name && S.panelArg === arg) return closePanel();
  openPanel(name, arg);
}

export function openPanel(name, arg) {
  S.panel = name; S.panelArg = arg; S.panelTab = null;
  lastHtml = '';
  $('panel').classList.remove('hidden');
  if (name === 'npc') {
    const n = npcById(arg);
    if (n && n.role === 'market') send({ t: 'mkt', a: 'get' });
    if (n && n.role === 'jobs') send({ t: 'job', a: 'get' });
    if (n && n.role === 'trader') send({ t: 'trade', a: 'get', npc: n.id });
  }
  renderPanel(true);
}

export function closePanel() {
  S.panel = null; S.panelArg = null;
  $('panel').classList.add('hidden');
}

export function renderPanel(force) {
  if (!S.panel || !S.me) return;
  if (!force && mouseDownInPanel) return;
  let title = TITLES[S.panel] || '', html = '';
  switch (S.panel) {
    case 'char': html = charPanel(); break;
    case 'inv': html = invPanel(); break;
    case 'prof': html = profPanel(); break;
    case 'quests': html = questsPanel(); break;
    case 'pol': html = polPanel(); break;
    case 'help': html = helpPanel(); break;
    case 'map': html = '<canvas id="worldmap"></canvas><p class="muted">Quadrados amarelos marcam objetivos da sua Tarefa Real. Pressione M para fechar.</p>'; break;
    case 'npc': {
      const n = npcById(S.panelArg);
      if (!n) return closePanel();
      if (dist(S.x, S.y, n.x, n.y) > 7) return closePanel();
      title = `${n.name} — ${n.title}`;
      html = npcPanel(n);
      break;
    }
  }
  const panel = $('panel');
  const body = panel.querySelector('.pbody');
  if (html === lastHtml) return;
  if (S.panel === 'map' && lastHtml) return;
  // Preserva entradas e rolagem
  const vals = {};
  body.querySelectorAll('input[id], select[id], textarea[id]').forEach(i => { vals[i.id] = i.value; });
  const focused = document.activeElement && body.contains(document.activeElement) ? document.activeElement.id : null;
  const scroll = body.scrollTop;
  const feeds = [...body.querySelectorAll('.feed')].map(f => ({ top: f.scrollTop, bottom: f.scrollTop + f.clientHeight >= f.scrollHeight - 20 }));
  lastHtml = html;
  panel.querySelector('.ptitle span').textContent = title;
  body.innerHTML = html;
  for (const [id, v] of Object.entries(vals)) { const el = body.querySelector('#' + CSS.escape(id)); if (el && el.dataset.keep !== 'no') el.value = v; }
  if (focused) { const el = body.querySelector('#' + CSS.escape(focused)); if (el) el.focus(); }
  body.scrollTop = scroll;
  body.querySelectorAll('.feed').forEach((f, i) => { const st = feeds[i]; f.scrollTop = !st || st.bottom ? f.scrollHeight : st.top; });
  if (S.panel === 'map') drawWorldMap(body.querySelector('#worldmap'));
}

// ---------- Utilidades ----------
function itemStats(id) {
  const d = item(id);
  const parts = [];
  if (d.dmg) parts.push(`Dano da arma: ${d.dmg}`);
  if (d.armor) parts.push(`Armadura: ${d.armor}`);
  if (d.lvl) parts.push(`Requer nível ${d.lvl}`);
  if (d.wtype) parts.push(`Tipo: ${d.wtype}`);
  if (d.heal) parts.push(`Restaura ${d.heal} de vida`);
  if (d.mana) parts.push(`Restaura ${d.mana} de mana`);
  if (d.buff) parts.push(`+${Math.round(d.buff.dmg * 100)}% de dano por ${d.buff.dur}s`);
  if (d.type === 'trade') parts.push('Mercadoria — venda em outra cidade');
  if (d.type === 'quest') parts.push('Item de tarefa');
  parts.push(`Valor base: ${d.value} ouro`);
  return parts.map(esc).join('<br>');
}
const tip = id => `data-tip="${esc(`<b class="${item(id).epic ? 'epic' : ''}">${esc(item(id).name)}</b><br>${itemStats(id)}`)}"`;
const itemLine = (id, extra = '') => `<span class="ic" ${tip(id)}>${item(id).icon}</span><div class="grow"><span class="${item(id).epic ? 'epic' : ''}">${esc(item(id).name)}</span>${extra}</div>`;
const invItems = () => Object.entries(S.me.inv).filter(([, q]) => q > 0).sort((a, b) => item(a[0]).name.localeCompare(item(b[0]).name));
const val = id => { const el = $('panel').querySelector('#' + id); return el ? el.value : ''; };
const tabs = (list, def) => {
  const cur = S.panelTab || def;
  return { cur, html: `<div class="tabs">${list.map(([k, l]) => `<button class="${k === cur ? 'on' : ''}" data-act="tab|${k}">${l}</button>`).join('')}</div>` };
};
const timeAgo = at => { const m = Math.floor((Date.now() - at) / 60000); return m < 1 ? 'agora' : m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`; };

// ---------- Personagem ----------
function charPanel() {
  const me = S.me, C = S.defs.classes[me.cls];
  const w = me.equip.weapon, a = me.equip.armor;
  return `
    <h3>${esc(me.name)} — ${C.name} nível ${me.lv}</h3>
    <div class="stats">
      <div><span>Vida</span><b>${me.hp}/${me.maxHp}</b></div>
      <div><span>${C.resource}</span><b>${me.mana}/${me.maxMana}</b></div>
      <div><span>Poder de Ataque</span><b>${me.power}</b></div>
      <div><span>Armadura</span><b>${me.armor}</b></div>
      <div><span>Ouro</span><b>${me.gold}</b></div>
      <div><span>Monstros abatidos</span><b>${me.kills || 0}</b></div>
      <div><span>Profissão</span><b>${me.prof ? S.defs.professions[me.prof].name : 'Nenhuma'}</b></div>
      <div><span>Título</span><b>${me.king ? 'Soberano de Valoria' : me.guard ? 'Guarda Real' : 'Cidadão'}</b></div>
    </div>
    <h3>Equipamento</h3>
    <div class="list">
      <div class="li">${w ? itemLine(w, '<small>Arma</small>') : '<div class="grow">Sem arma</div>'}</div>
      <div class="li">${a ? itemLine(a, '<small>Armadura</small>') : '<div class="grow">Sem armadura</div>'}</div>
    </div>
    <h3>Habilidades</h3>
    <div class="list">${C.abilities.map((ab, i) => { const A = S.defs.abilities[ab]; return `<div class="li"><span class="ic">${A.icon}</span><div class="grow"><b>${i + 1}. ${esc(A.name)}</b><small>${esc(A.desc)} — Custo ${A.cost}, recarga ${A.cd}s</small></div></div>`; }).join('')}</div>
    <p class="muted">${esc(C.desc)}</p>`;
}

// ---------- Inventário ----------
function invPanel() {
  const items = invItems();
  return `
    <p>💰 <b style="color:#f0c050">${S.me.gold}</b> ouro · Clique para usar ou equipar.</p>
    <div class="grid">${items.map(([id, q]) => {
      const d = item(id);
      const act = d.type === 'consumable' ? `use|${id}` : d.type === 'weapon' || d.type === 'armor' ? `equip|${id}` : '';
      return `<div class="cell ${d.epic ? 'epic' : ''}" ${act ? `data-act="${act}"` : ''} ${tip(id)}>${d.icon}<span class="qty">${q > 1 ? q : ''}</span></div>`;
    }).join('') || '<p class="muted">Inventário vazio.</p>'}</div>
    <p class="muted">Dica: venda itens a vendedores NPC, a Mercadores (com /dar e /pagar) ou anuncie no Mercado se você for Mercador.</p>`;
}

// ---------- Profissão ----------
function recipeList(stationFilter) {
  const me = S.me;
  const recs = Object.values(S.defs.recipes).filter(r => (stationFilter ? r.station === stationFilter : r.prof === me.prof));
  if (!recs.length) return '<p class="muted">Nenhuma receita.</p>';
  return `<div class="list">${recs.map(r => {
    const skill = me.skills[r.prof] || 0;
    const can = me.prof === r.prof && skill >= r.req;
    const have = Object.entries(r.inputs).every(([i, q]) => (me.inv[i] || 0) >= q);
    const maxN = Math.min(...Object.entries(r.inputs).map(([i, q]) => Math.floor((me.inv[i] || 0) / q)));
    const inputs = Object.entries(r.inputs).map(([i, q]) => `<span style="color:${(me.inv[i] || 0) >= q ? '#9ef0a0' : '#ff9070'}">${item(i).icon} ${q}x ${esc(item(i).name)} (${me.inv[i] || 0})</span>`).join(' · ');
    return `<div class="li">${itemLine(r.output, `<small>${r.qty > 1 ? r.qty + 'x · ' : ''}Requer ${S.defs.professions[r.prof].name} ${r.req}</small><small>${inputs}</small>`)}
      <button ${can && have ? '' : 'disabled'} data-act="craft|${r.id}|1">Criar</button>
      <button ${can && maxN > 1 ? '' : 'disabled'} data-act="craft|${r.id}|${Math.min(20, maxN)}">x${Math.max(1, Math.min(20, maxN))}</button></div>`;
  }).join('')}</div>`;
}

function profPanel() {
  const me = S.me;
  const P = S.defs.professions;
  let html = '';
  if (!me.prof) {
    html += `<div class="pc"><h4>Você ainda não tem profissão</h4><p>Visite a <b>Mestra das Guildas Helena</b> no Salão das Guildas (leste de Valoria) para escolher seu ofício. A primeira escolha é gratuita.</p></div>`;
  } else {
    const p = P[me.prof], sk = me.skills[me.prof] || 0;
    html += `<div class="pc on"><h4>${p.icon} ${p.name} — habilidade ${sk}/100</h4><div class="skillbar"><div style="width:${sk}%"></div></div><p class="muted">${esc(p.desc)}</p></div>`;
    if (['ferreiro', 'alquimista', 'fazendeiro'].includes(me.prof)) {
      const where = { ferreiro: 'na Forja (Mestre Ferreiro Gunnar, oeste de Valoria)', alquimista: 'na Bancada de Alquimia (Alquimista Ysolde)', fazendeiro: 'no Forno da Taverna (Taverneiro Olaf)' }[me.prof];
      html += `<h3>Receitas</h3><p class="muted">Produza ${where}.</p>${recipeList()}`;
    }
    if (me.prof === 'mercador') {
      const T = S.defs.trade;
      const names = { valoria: 'Valoria', porto: 'Porto Sereno', posto: 'Posto do Norte' };
      html += `<h3>Rotas Comerciais</h3><p class="muted">Compre mercadorias baratas em uma cidade e venda caro em outra. Cada venda baixa o preço local temporariamente.</p>
        <div class="list">${Object.entries(T).map(([town, t]) => `<div class="li"><div class="grow"><b>${names[town]}</b>
          <small>Vende: ${Object.entries(t.sells).map(([i, p]) => `${item(i).icon} ${esc(item(i).name)} (${p})`).join(', ')}</small>
          <small>Compra: ${Object.entries(t.buys).map(([i, p]) => `${item(i).icon} ${esc(item(i).name)} (~${p})`).join(', ')}</small></div></div>`).join('')}</div>
        <h3>Mercado de Valoria</h3><p>Como Mercador, você pode anunciar itens no Leiloeiro Fausto (sul da praça). Outros jogadores compram mesmo com você offline. Seu imposto é reduzido pela metade.</p>`;
    }
    if (me.prof === 'empregado') {
      html += `<h3>Trabalho</h3><p>Aceite <b>Tarefas Reais</b> e <b>Contratos</b> no Quadro de Empregos (oeste da praça). Sua habilidade aumenta o pagamento em até +100%.</p>
        <p>${me.guard ? '🛡️ Você é <b>Guarda Real</b> e recebe salário do tesouro a cada minuto online, além de bônus de dano.' : 'O soberano pode nomeá-lo <b>Guarda Real</b>, com salário pago pelo tesouro.'}</p>`;
    }
  }
  html += `<h3>Todas as profissões</h3><div class="list">${Object.entries(P).map(([k, p]) => `<div class="li"><span class="ic">${p.icon}</span><div class="grow"><b>${p.name}</b> <span class="muted">(habilidade ${me.skills[k] || 0})</span><small>${esc(p.desc)}</small></div></div>`).join('')}</div>`;
  return html;
}

// ---------- Missões ----------
function questsPanel() {
  const me = S.me;
  let html = '<h3>Tarefa Real</h3>';
  html += me.task ? taskBox(me.task) : '<p class="muted">Nenhuma tarefa. Empregados podem aceitar tarefas no Quadro de Empregos.</p>';
  html += '<h3>Missões ativas</h3>';
  const act = Object.entries(me.quests);
  html += act.length ? `<div class="list">${act.map(([id, q]) => {
    const Q = S.defs.quests[id];
    const n = Q.type === 'kill' ? q.n : Math.min(me.inv[Q.target] || 0, Q.count);
    const giver = S.defs.npcs.find(x => x.id === Q.giver);
    return `<div class="li"><span class="ic">${n >= Q.count ? '✅' : '📜'}</span><div class="grow"><b>${esc(Q.name)}</b> — ${n}/${Q.count}<small>${esc(Q.text)}</small><small>Entregar a: ${esc(giver.name)}</small></div><button class="red" data-act="qabandon|${id}">✕</button></div>`;
  }).join('')}</div>` : '<p class="muted">Nenhuma missão ativa. Procure NPCs com <b style="color:#ffd000">!</b> sobre a cabeça.</p>';
  html += `<p class="muted">Missões concluídas: ${me.questsDone.length}/${Object.keys(S.defs.quests).length}</p>`;
  return html;
}

function taskBox(task) {
  let det = '';
  if (task.type === 'entrega') det = `Leve o Pacote Real até <b>${esc(npcById(task.npc).name)}</b> (marcado no mapa).`;
  if (task.type === 'patrulha') det = task.points.map(p => `${p.ok ? '✅' : '⬜'} ${esc(p.name)}`).join('<br>') + '<br>Depois volte ao Quadro.';
  if (task.type === 'coleta') det = `Entregue ${task.qty}x ${esc(item(task.item).name)} no Quadro (você tem ${S.me.inv[task.item] || 0}).`;
  if (task.type === 'caca') det = `Progresso: ${task.n}/${task.count}. Depois volte ao Quadro.`;
  return `<div class="pc on"><h4>${esc(task.title)}</h4><p>${det}</p><p class="muted">Pagamento base: ${task.pay} ouro · ${task.xp} XP</p><button class="red" data-act="jabandon">Abandonar</button></div>`;
}

// ---------- Política ----------
function polPanel(context) {
  const pol = S.pol, me = S.me;
  if (!pol) return '<p>Carregando...</p>';
  const F = S.defs.foci;
  const left = pol.endsIn - (Date.now() - S.polAt);
  let html = `<div class="kingbox"><span class="crown">👑</span><div class="grow"><b style="font-size:16px;color:#f0c050">${esc(pol.king.name)}</b> ${pol.king.isNpc ? '<span class="tag npc">NPC</span>' : '<span class="tag">Jogador</span>'}
    <div class="muted">Foco: ${F[pol.king.focus].name} — ${esc(F[pol.king.focus].desc)}</div>
    <div>Imposto: <b>${pol.tax}%</b> · Tesouro: <b>${pol.treasury}</b> ouro · Mandato nº ${pol.term}</div></div></div>
    <p style="margin-top:8px">Fase atual: <b>${esc(pol.phaseName)}</b> — termina em <b>${fmtTime(left)}</b></p>`;

  if (pol.phase === 'reinado') {
    html += `<h3>Petição de Desconfiança</h3><p>Se cidadãos suficientes assinarem, novas eleições começam imediatamente. Assinaturas: <b>${pol.petition.count}/${pol.petition.need}</b></p>
      <button ${pol.petition.signed || pol.isKing ? 'disabled' : ''} data-act="polpet">${pol.petition.signed ? 'Você já assinou' : '✍️ Assinar petição'}</button>
      <p class="muted">As próximas eleições começam quando o mandato terminar. Candidatos precisam de nível ${pol.minLevel} e ${pol.fee} de ouro.</p>`;
  }

  if (pol.phase === 'candidatura') {
    html += '<h3>Candidatos</h3>' + candList(pol, false);
    if (!pol.isCandidate) {
      html += `<h3>Candidate-se ao trono</h3>
        <p class="muted">Fale com o <b>Arauto Real</b> (em frente ao castelo). Taxa: ${pol.fee} ouro (vai para o tesouro). Nível mínimo: ${pol.minLevel}.</p>
        <div class="form">
          <select id="pfocus">${Object.entries(F).map(([k, f]) => `<option value="${k}">${f.name}</option>`).join('')}</select>
          <label>Imposto proposto <input id="ptax" type="number" min="0" max="30" value="12">%</label>
        </div>
        <div class="form"><input id="pslogan" maxlength="80" placeholder="Seu lema de campanha" style="flex:1"><button class="gold" data-act="polcand">Candidatar-me</button></div>
        <p class="muted">${Object.values(F).map(f => `<b>${f.name}:</b> ${esc(f.desc)}`).join('<br>')}</p>`;
    } else html += `<p>Você é candidato! Prepare seus argumentos para o debate. <button class="red" data-act="polwithdraw">Desistir</button></p>`;
  }

  if (pol.phase === 'debate' || (pol.phase === 'votacao' && pol.debate.feed.length)) {
    if (pol.phase === 'debate') html += `<h3>🎙️ Tema: ${esc(pol.debate.topic)} <span class="muted">(${fmtTime(pol.debate.topicEndsIn - (Date.now() - S.polAt))})</span></h3>`;
    else html += '<h3>Registro do Debate</h3>';
    html += '<div class="feed">' + pol.debate.feed.map(f => {
      const reacts = f.kind === 'statement' ? `<div class="reacts">
        <button class="${f.mine === 'up' ? 'on' : ''}" ${f.mine || f.who === me.name ? 'disabled' : ''} data-act="polreact|${f.id}|up">👏 ${f.up}</button>
        <button class="${f.mine === 'down' ? 'on' : ''}" ${f.mine || f.who === me.name ? 'disabled' : ''} data-act="polreact|${f.id}|boo">👎 ${f.down}</button></div>` : '';
      return `<div class="st ${f.kind}"><span class="who">${f.kind === 'question' ? '❓ ' : ''}${esc(f.who)}:</span> ${esc(f.text)}${reacts}</div>`;
    }).join('') + '</div>';
    if (pol.phase === 'debate') {
      if (pol.isCandidate) html += `<div class="form"><input id="pspeak" data-keep="no" data-enter="polspeak" maxlength="220" placeholder="Seu discurso (suba ao púlpito na Praça do Fórum)" style="flex:1"><button class="gold" data-act="polspeak">Discursar</button></div>`;
      html += `<div class="form"><input id="pask" data-keep="no" data-enter="polask" maxlength="160" placeholder="Pergunte algo aos candidatos" style="flex:1"><button data-act="polask">Perguntar</button></div>
        <p class="muted">Aplausos e vaias mudam a popularidade dos candidatos, que decide o voto dos cidadãos NPC.</p>`;
    }
  }

  if (pol.phase === 'debate' || pol.phase === 'votacao') {
    html += '<h3>Candidatos</h3>' + candList(pol, pol.phase === 'votacao');
    if (pol.phase === 'votacao') html += `<p>${pol.myVote ? `✅ Você votou em <b>${esc(pol.myVote)}</b>.` : 'Vote em Valoria (cada cidadão tem um voto).'} Votos de jogadores até agora: ${pol.totalVotes}. Além disso, 9 votos de cidadãos NPC serão divididos pela popularidade.</p>`;
  }

  if (pol.isKing) html += kingControls(pol);

  if (pol.bounties.length) html += `<h3>Recompensas Reais</h3><div class="list">${pol.bounties.map(b => `<div class="li"><span class="ic">🎯</span><div class="grow">${esc(S.defs.mobs[b.mob].name)} — <b>${b.reward}</b> ouro cada<small>${b.left} restantes · por ${esc(b.by)}</small></div></div>`).join('')}</div>`;
  html += `<h3>Decretos</h3><div class="list">${pol.decrees.map(d => `<div class="li"><span class="ic">📜</span><div class="grow">${esc(d.text)}<small>${esc(d.by)} · há ${timeAgo(d.at)}</small></div></div>`).join('')}</div>`;
  if (pol.guards.length) html += `<h3>Guarda Real</h3><p>${pol.guards.map(esc).join(', ')}</p>`;
  if (pol.history.length) {
    html += `<h3>Eleições anteriores</h3><div class="list">${pol.history.map(h => `<div class="li"><span class="ic">🗳️</span><div class="grow"><b>${esc(h.king)}</b> venceu (mandato ${h.term})<small>${h.results.map(r => `${esc(r.name)}: ${r.votes} (${r.npc} NPC)`).join(' · ')}</small></div></div>`).join('')}</div>`;
  }
  return html;
}

function candList(pol, voting) {
  if (!pol.candidates.length) return '<p class="muted">Nenhum candidato ainda.</p>';
  const maxPop = Math.max(...pol.candidates.map(c => c.pop), 1);
  return pol.candidates.map(c => `<div class="cand"><span class="crown" style="font-size:24px">${c.isNpc ? '🎭' : '🧑'}</span><div class="grow">
    <b>${esc(c.name)}</b> ${c.isNpc ? '<span class="tag npc">NPC</span>' : '<span class="tag">Jogador</span>'} <span class="tag">${S.defs.foci[c.focus].name}</span> <span class="tag">Imposto ${c.tax}%</span>
    <div class="muted">"${esc(c.slogan)}" · ${c.statements} falas</div>
    <div class="pop" data-tip="Popularidade: ${c.pop}"><div style="width:${(c.pop / maxPop) * 100}%"></div></div></div>
    ${voting ? `<button class="gold" ${S.pol.myVote ? 'disabled' : ''} data-act="polvote|${esc(c.name)}">Votar</button>` : ''}</div>`).join('');
}

function kingControls(pol) {
  const mobs = Object.entries(S.defs.mobs).filter(([, m]) => !m.boss);
  return `<h3>👑 Governar (no Trono de Valoria)</h3>
    <div class="form"><label>Imposto <input id="ktax" type="number" min="0" max="30" value="${pol.tax}">%</label><button data-act="ktax">Definir</button></div>
    <div class="form"><input id="kdecree" maxlength="140" placeholder="Texto do decreto" style="flex:1"><button data-act="kdecree">Decretar</button></div>
    <div class="form"><select id="kbmob">${mobs.map(([k, m]) => `<option value="${k}">${esc(m.name)}</option>`).join('')}</select>
      <label>Ouro/abate <input id="kbrew" type="number" min="1" max="60" value="5"></label><label>Vagas <input id="kbcnt" type="number" min="1" max="50" value="20"></label><button data-act="kbounty">Recompensa</button></div>
    <div class="form"><input id="kguard" placeholder="Nome do Empregado" style="flex:1"><button data-act="kappoint">Nomear Guarda</button></div>
    ${pol.guards.map(g => `<div class="form">🛡️ ${esc(g)} <button class="red" data-act="kdismiss|${esc(g)}">Dispensar</button></div>`).join('')}
    <div class="form"><button class="gold" data-act="kfest">🎉 Festival Real (300 ouro)</button><button class="red" data-act="kabdicate">Abdicar</button></div>
    <p class="muted">Guardas recebem salário do tesouro a cada minuto. Você recebe um estipêndio real de 10 ouro/min enquanto o tesouro permitir.</p>`;
}

// ---------- NPCs ----------
function deliverBox(n) {
  const t = S.me.task;
  if (t && t.type === 'entrega' && t.npc === n.id) return `<div class="pc on"><h4>✉️ Tarefa Real</h4><p>Você tem um Pacote Real para ${esc(n.name)}.</p><button class="gold" data-act="jdeliver|${n.id}">Entregar Pacote</button></div>`;
  return '';
}

function buyList(n) {
  if (!n.sells) return '';
  const tax = S.pol ? S.pol.tax : 0;
  return `<div class="list">${n.sells.map(i => {
    const unit = Math.ceil(item(i).value * 1.25);
    return `<div class="li">${itemLine(i, `<small>${unit} ouro + imposto (~${tax}%)</small>`)}<button data-act="buy|${n.id}|${i}|1">Comprar</button><button data-act="buy|${n.id}|${i}|5">x5</button></div>`;
  }).join('')}</div>`;
}

function sellList(n) {
  const mult = S.me.prof === 'mercador' ? 0.55 : 0.35;
  const items = invItems().filter(([i]) => !['quest', 'trade'].includes(item(i).type));
  if (!items.length) return '<p class="muted">Nada para vender.</p>';
  return `<p class="muted">Vendedores pagam ${Math.round(mult * 100)}% do valor${S.me.prof === 'mercador' ? ' (bônus de Mercador)' : ''}, menos imposto.</p><div class="list">${items.map(([i, q]) => {
    const unit = Math.max(1, Math.floor(item(i).value * mult));
    return `<div class="li">${itemLine(i, `<small>${q}x · ${unit} ouro cada</small>`)}<button data-act="sell|${n.id}|${i}|1">Vender 1</button>${q > 1 ? `<button data-act="sell|${n.id}|${i}|${q}">Todos</button>` : ''}</div>`;
  }).join('')}</div>`;
}

function questBox(n) {
  const me = S.me;
  const qs = Object.entries(S.defs.quests).filter(([, q]) => q.giver === n.id);
  if (!qs.length) return '';
  return `<h3>Missões</h3><div class="list">${qs.map(([id, Q]) => {
    const active = me.quests[id], done = me.questsDone.includes(id);
    let btn = '', st = '';
    if (done) st = '✅ Concluída';
    else if (active) {
      const n2 = Q.type === 'kill' ? active.n : Math.min(me.inv[Q.target] || 0, Q.count);
      st = `${n2}/${Q.count}`;
      btn = `<button class="gold" ${n2 >= Q.count ? '' : 'disabled'} data-act="qturnin|${id}">Entregar</button>`;
    } else if (me.lv < Q.lvl) st = `Requer nível ${Q.lvl}`;
    else btn = `<button class="green" data-act="qaccept|${id}">Aceitar</button>`;
    const rew = `Recompensa: ${Q.xp} XP, ${Q.gold} ouro${Q.item ? ', ' + item(Q.item).name : ''}`;
    return `<div class="li"><span class="ic">${done ? '✅' : active ? '📜' : '❗'}</span><div class="grow"><b>${esc(Q.name)}</b> <span class="muted">${st}</span><small>${esc(Q.text)}</small><small>${rew}</small></div>${btn}</div>`;
  }).join('')}</div>`;
}

function npcPanel(n) {
  const me = S.me;
  let html = deliverBox(n);
  switch (n.role) {
    case 'throne':
      if (S.pol && S.pol.isKing) html += kingControls(S.pol);
      else html += `<p>O trono de Valoria pertence a <b>${esc(S.pol ? S.pol.king.name : '...')}</b>.</p><p class="muted">Apenas o soberano eleito pode governar daqui. Quer o trono? Candidate-se na próxima eleição com o Arauto Real.</p>`;
      return html;
    case 'herald':
      return html + `<p><i>"Ouçam, ouçam! O destino de Valoria está nas mãos de seus cidadãos!"</i></p>` + polPanel();
    case 'guild': {
      const P = S.defs.professions;
      const cost = me.profChanges > 0 ? 50 : 0;
      return html + `<p><i>"Todo valoriano precisa de um ofício. Qual será o seu?"</i></p><p class="muted">${cost ? `Trocar de profissão custa ${cost} ouro. Sua habilidade em cada ofício é mantida.` : 'Sua primeira escolha é gratuita!'}</p>` +
        Object.entries(P).map(([k, p]) => `<div class="pc ${me.prof === k ? 'on' : ''}"><h4>${p.icon} ${p.name} <span class="muted">(habilidade ${me.skills[k] || 0})</span></h4><p class="muted">${esc(p.desc)}</p>
          ${me.prof === k ? '<b>Sua profissão atual</b>' : `<button class="gold" data-act="prof|${k}">Tornar-me ${p.name}</button>`}</div>`).join('');
    }
    case 'station': {
      const t = tabs([['craft', 'Ofício'], ['buy', 'Comprar'], ['sell', 'Vender']], 'craft');
      html += t.html;
      if (t.cur === 'craft') {
        const prof = Object.values(S.defs.recipes).find(r => r.station === n.station).prof;
        html += me.prof !== prof ? `<p class="muted">Apenas ${S.defs.professions[prof].name}s podem trabalhar aqui. Escolha a profissão no Salão das Guildas.</p>` : '';
        html += recipeList(n.station);
      }
      if (t.cur === 'buy') html += buyList(n);
      if (t.cur === 'sell') html += sellList(n);
      return html;
    }
    case 'vendor': {
      const t = tabs([['buy', 'Comprar'], ['sell', 'Vender']], 'buy');
      return html + t.html + (t.cur === 'buy' ? buyList(n) : sellList(n));
    }
    case 'quest': {
      html += questBox(n);
      if (n.sells) html += '<h3>Comprar</h3>' + buyList(n);
      return html || '<p class="muted">Nada a fazer aqui agora.</p>';
    }
    case 'market': return html + marketPanel();
    case 'jobs': return html + jobsPanel();
    case 'trader': return html + tradePanel(n);
    case 'candidate': {
      const c = S.pol && S.pol.candidates.find(x => x.name === n.name);
      return c ? `<p><i>"${esc(c.slogan)}"</i></p><p>Foco: <b>${S.defs.foci[c.focus].name}</b> — ${esc(S.defs.foci[c.focus].desc)}</p><p>Imposto proposto: <b>${c.tax}%</b></p><button data-act="open|pol">Abrir painel de Política</button>` : '<p>...</p>';
    }
  }
  return html;
}

function marketPanel() {
  const me = S.me, mkt = S.mkt;
  if (!mkt) return '<p>Carregando mercado...</p>';
  const t = tabs([['browse', 'Comprar'], ['mine', 'Meus anúncios'], ['sell', 'Anunciar']], 'browse');
  let html = t.html;
  if (t.cur === 'browse') {
    const list = mkt.list.filter(l => l.seller !== me.name.toLowerCase());
    html += list.length ? `<div class="list">${list.slice().reverse().map(l => `<div class="li">${itemLine(l.item, `<small>${l.qty}x · <b style="color:#f0c050">${l.price}</b> ouro cada · vendedor: ${esc(l.sellerName)}</small>`)}
      <input id="mq${l.id}" type="number" min="1" max="${l.qty}" value="1" style="width:60px"><button data-act="mktbuy|${l.id}">Comprar</button></div>`).join('')}</div>` : '<p class="muted">Nenhum anúncio no momento. Mercadores podem anunciar itens aqui.</p>';
  }
  if (t.cur === 'mine') {
    const list = mkt.list.filter(l => l.seller === me.name.toLowerCase());
    html += list.length ? `<div class="list">${list.map(l => `<div class="li">${itemLine(l.item, `<small>${l.qty}x a ${l.price} ouro</small>`)}<button class="red" data-act="mktcancel|${l.id}">Cancelar</button></div>`).join('')}</div>` : '<p class="muted">Você não tem anúncios.</p>';
  }
  if (t.cur === 'sell') {
    if (me.prof !== 'mercador') html += '<p>Apenas <b>Mercadores</b> podem anunciar no Mercado de Valoria. Torne-se Mercador no Salão das Guildas — ou venda seus itens para um Mercador!</p>';
    else {
      const items = invItems().filter(([i]) => item(i).type !== 'quest');
      html += `<p class="muted">Imposto sobre suas vendas: ${(mkt.tax * 100).toFixed(1)}%.</p><div class="form">
        <select id="mitem">${items.map(([i, q]) => `<option value="${i}">${esc(item(i).name)} (${q})</option>`).join('')}</select>
        <label>Qtd <input id="mqty" type="number" min="1" value="1"></label><label>Preço/un <input id="mprice" type="number" min="1" value="10"></label>
        <button class="gold" data-act="mktlist">Anunciar</button></div>`;
    }
  }
  return html;
}

function jobsPanel() {
  const me = S.me, jobs = S.jobs;
  if (!jobs) return '<p>Carregando quadro...</p>';
  const t = tabs([['tasks', 'Tarefas Reais'], ['contracts', 'Contratos'], ['post', 'Publicar contrato']], 'tasks');
  let html = t.html;
  if (t.cur === 'tasks') {
    if (me.task) {
      html += taskBox(me.task);
      if (me.task.type !== 'entrega') html += `<button class="gold" data-act="jturnin">Entregar tarefa</button>`;
    }
    if (me.prof !== 'empregado') html += '<p class="muted">Apenas <b>Empregados</b> podem aceitar Tarefas Reais (escolha no Salão das Guildas).</p>';
    html += `<div class="list">${jobs.tasks.map(tk => `<div class="li"><span class="ic">${{ entrega: '✉️', patrulha: '🚶', coleta: '📦', caca: '🎯' }[tk.type]}</span><div class="grow">${esc(tk.title)}<small>${tk.pay} ouro · ${tk.xp} XP (pago pelo Tesouro Real)</small></div>
      <button ${me.prof === 'empregado' && !me.task ? '' : 'disabled'} data-act="jtake|${tk.id}">Aceitar</button></div>`).join('')}</div>`;
  }
  if (t.cur === 'contracts') {
    html += '<p class="muted">Contratos são pedidos de jogadores. O pagamento fica guardado em garantia até ser cumprido. Apenas Empregados cumprem contratos.</p>';
    html += jobs.contracts.length ? `<div class="list">${jobs.contracts.map(k => `<div class="li">${itemLine(k.item, `<small>${k.qty}x pedido por ${esc(k.posterName)} · paga <b style="color:#f0c050">${k.reward}</b> ouro · você tem ${me.inv[k.item] || 0}</small>`)}
      ${k.poster === me.name.toLowerCase() ? `<button class="red" data-act="jcancel|${k.id}">Cancelar</button>` : `<button ${me.prof === 'empregado' && (me.inv[k.item] || 0) >= k.qty ? '' : 'disabled'} data-act="jfulfill|${k.id}">Cumprir</button>`}</div>`).join('')}</div>` : '<p class="muted">Nenhum contrato aberto.</p>';
  }
  if (t.cur === 'post') {
    const all = Object.entries(S.defs.items).filter(([, d]) => d.type !== 'quest').sort((a, b) => a[1].name.localeCompare(b[1].name));
    html += `<p>Contrate trabalhadores! Peça itens e pague em ouro. O valor é retirado agora e devolvido se você cancelar.</p><div class="form">
      <select id="citem">${all.map(([k, d]) => `<option value="${k}">${esc(d.name)}</option>`).join('')}</select>
      <label>Qtd <input id="cqty" type="number" min="1" value="5"></label><label>Pagamento <input id="creward" type="number" min="1" value="30"></label>
      <button class="gold" data-act="jpost">Publicar</button></div>`;
  }
  return html;
}

function tradePanel(n) {
  const tr = S.trade;
  if (!tr || tr.npc !== n.id) return '<p>Carregando...</p>';
  let html = `<p class="muted">Mercadores compram mercadorias por atacado e as revendem em outras cidades com lucro. Qualquer um pode vender mercadorias aqui.</p>`;
  html += '<h3>Vende</h3><div class="list">' + tr.sells.map(s => `<div class="li">${itemLine(s.item, `<small>${s.price} ouro cada</small>`)}
    <input id="tb_${s.item}" type="number" min="1" max="20" value="1" style="width:56px"><button ${S.me.prof === 'mercador' ? '' : 'disabled'} data-act="tbuy|${n.id}|${s.item}">Comprar</button></div>`).join('') + '</div>';
  html += '<h3>Compra</h3><div class="list">' + tr.buys.map(s => `<div class="li">${itemLine(s.item, `<small>Paga ${s.price} ouro cada · você tem ${S.me.inv[s.item] || 0}</small>`)}
    <button ${(S.me.inv[s.item] || 0) ? '' : 'disabled'} data-act="tsell|${n.id}|${s.item}|1">Vender 1</button><button ${(S.me.inv[s.item] || 0) > 1 ? '' : 'disabled'} data-act="tsell|${n.id}|${s.item}|${S.me.inv[s.item] || 0}">Todos</button></div>`).join('') + '</div>';
  if (S.me.prof !== 'mercador') html += '<p class="muted">Torne-se Mercador para comprar mercadorias.</p>';
  return html;
}

function helpPanel() {
  return `
    <h3>Controles</h3>
    <p><kbd>WASD</kbd>/<kbd>setas</kbd> mover · <kbd>Clique</kbd> selecionar alvo · <kbd>Tab</kbd> próximo inimigo · <kbd>1</kbd>-<kbd>4</kbd> habilidades · <kbd>5</kbd>-<kbd>8</kbd> poções e comida · <kbd>E</kbd> interagir/coletar · <kbd>Enter</kbd> chat · <kbd>Esc</kbd> fechar</p>
    <p><kbd>C</kbd> personagem · <kbd>B</kbd> inventário · <kbd>P</kbd> profissão · <kbd>L</kbd> missões · <kbd>O</kbd> política · <kbd>M</kbd> mapa · <kbd>H</kbd> ajuda</p>
    <h3>Aventura</h3>
    <p>Explore Valoria: o <b>Bosque Sussurrante</b> (oeste) e os <b>Campos Dourados</b> (sul) são para iniciantes. Depois enfrente o <b>Pântano Sombrio</b> (leste), as <b>Montanhas de Ferro</b> (norte) e as <b>Ruínas Malditas</b> (nordeste), onde mora o Lich Morvath. NPCs com <b style="color:#ffd000">!</b> têm missões.</p>
    <h3>Profissões</h3>
    <p>Escolha um ofício no <b>Salão das Guildas</b>. <b>Ferreiros</b> mineram e forjam armas e armaduras. <b>Alquimistas</b> fazem poções. <b>Fazendeiros</b> colhem trigo e cozinham. <b>Mercadores</b> controlam o Mercado e as rotas comerciais entre Valoria, Porto Sereno e o Posto do Norte. <b>Empregados</b> aceitam Tarefas Reais, cumprem contratos de outros jogadores e podem virar Guardas Reais.</p>
    <p>Qualquer um pode coletar (ervas, trigo, minério) com <kbd>E</kbd> — seu ofício dobra a coleta do material ligado a ele.</p>
    <h3>Política</h3>
    <p>Valoria é governada por um soberano eleito. O ciclo é: <b>Reinado → Candidaturas → Grande Debate → Votação</b>. Candidate-se com o <b>Arauto Real</b>, defenda suas ideias no púlpito da <b>Praça do Fórum</b>, receba aplausos ou vaias da plateia e conquiste votos. Os cidadãos NPC votam de acordo com a popularidade.</p>
    <p>O soberano define o <b>imposto</b> (cobrado em todas as vendas e vai para o Tesouro), emite <b>decretos</b>, cria <b>recompensas</b> por monstros, nomeia <b>Guardas Reais</b> e organiza <b>festivais</b>. Um rei impopular pode ser derrubado por uma <b>Petição de Desconfiança</b>.</p>
    <h3>Comandos</h3>
    <p><kbd>/w nome mensagem</kbd> sussurrar · <kbd>/pagar nome qtd</kbd> · <kbd>/dar nome item qtd</kbd> · <kbd>/quem</kbd> jogadores online · Comece a mensagem com <kbd>!</kbd> para o chat Geral.</p>`;
}

// ======================= Ações =======================
function doAction(act, el) {
  const [a, b, c, d] = act.split('|');
  switch (a) {
    case 'close': return closePanel();
    case 'tab': S.panelTab = b; return renderPanel(true);
    case 'open': return openPanel(b);
    case 'use': return send({ t: 'use', item: b });
    case 'equip': return send({ t: 'equip', item: b });
    case 'craft': return send({ t: 'craft', id: b, n: Number(c) });
    case 'buy': return send({ t: 'buy', npc: b, item: c, n: Number(d) });
    case 'sell': return send({ t: 'sell', npc: b, item: c, n: Number(d) });
    case 'prof': return send({ t: 'prof', id: b });
    case 'mktbuy': return send({ t: 'mkt', a: 'buy', id: Number(b), qty: Number(val('mq' + b)) || 1 });
    case 'mktcancel': return send({ t: 'mkt', a: 'cancel', id: Number(b) });
    case 'mktlist': return send({ t: 'mkt', a: 'list', item: val('mitem'), qty: Number(val('mqty')), price: Number(val('mprice')) });
    case 'tbuy': return send({ t: 'trade', a: 'buy', npc: b, item: c, n: Number(val('tb_' + c)) || 1 });
    case 'tsell': return send({ t: 'trade', a: 'sell', npc: b, item: c, n: Number(d) });
    case 'jtake': return send({ t: 'job', a: 'take', id: b });
    case 'jabandon': return send({ t: 'job', a: 'abandon' });
    case 'jturnin': return send({ t: 'job', a: 'turnin' });
    case 'jdeliver': return send({ t: 'job', a: 'deliver', npc: b });
    case 'jpost': return send({ t: 'job', a: 'post', item: val('citem'), qty: Number(val('cqty')), reward: Number(val('creward')) });
    case 'jfulfill': return send({ t: 'job', a: 'fulfill', id: Number(b) });
    case 'jcancel': return send({ t: 'job', a: 'cancel', id: Number(b) });
    case 'qaccept': return send({ t: 'quest', a: 'accept', id: b });
    case 'qturnin': return send({ t: 'quest', a: 'turnin', id: b });
    case 'qabandon': return send({ t: 'quest', a: 'abandon', id: b });
    case 'polcand': return send({ t: 'pol', a: 'candidate', focus: val('pfocus'), tax: Number(val('ptax')), slogan: val('pslogan') });
    case 'polwithdraw': return send({ t: 'pol', a: 'withdraw' });
    case 'polvote': return send({ t: 'pol', a: 'vote', name: b });
    case 'polreact': return send({ t: 'pol', a: 'react', id: Number(b), kind: c });
    case 'polspeak': { const v = val('pspeak'); if (v) send({ t: 'pol', a: 'speak', text: v }); const i = $('panel').querySelector('#pspeak'); if (i) i.value = ''; return; }
    case 'polask': { const v = val('pask'); if (v) send({ t: 'pol', a: 'ask', text: v }); const i = $('panel').querySelector('#pask'); if (i) i.value = ''; return; }
    case 'polpet': return send({ t: 'pol', a: 'petition' });
    case 'ktax': return send({ t: 'pol', a: 'setTax', tax: Number(val('ktax')) });
    case 'kdecree': return send({ t: 'pol', a: 'decree', text: val('kdecree') });
    case 'kbounty': return send({ t: 'pol', a: 'bounty', mob: val('kbmob'), reward: Number(val('kbrew')), count: Number(val('kbcnt')) });
    case 'kfest': return send({ t: 'pol', a: 'festival' });
    case 'kappoint': return send({ t: 'pol', a: 'appoint', name: val('kguard') });
    case 'kdismiss': return send({ t: 'pol', a: 'dismiss', name: b });
    case 'kabdicate': if (confirm('Abdicar do trono? Novas eleições começarão.')) send({ t: 'pol', a: 'abdicate' }); return;
  }
}
