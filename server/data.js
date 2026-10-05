'use strict';
// Definições estáticas do mundo de Valoria: classes, habilidades, itens,
// monstros, receitas, profissões, missões e falas dos candidatos NPC.

const CLASSES = {
  guerreiro: {
    name: 'Guerreiro', color: '#c0392b', hp: 150, hpPerLv: 22, mana: 100, manaPerLv: 4, armor: 4,
    weapon: 'espada', resource: 'Fúria',
    desc: 'Combatente corpo a corpo, resistente e devastador de perto.',
    abilities: ['golpe_heroico', 'investida', 'redemoinho', 'grito_batalha'],
  },
  mago: {
    name: 'Mago', color: '#2e86de', hp: 95, hpPerLv: 13, mana: 170, manaPerLv: 14, armor: 1,
    weapon: 'cajado', resource: 'Mana',
    desc: 'Manipula fogo e gelo à distância. Frágil, mas letal.',
    abilities: ['bola_fogo', 'lanca_gelo', 'nova_gelida', 'explosao_arcana'],
  },
  cacador: {
    name: 'Caçador', color: '#27ae60', hp: 115, hpPerLv: 16, mana: 130, manaPerLv: 8, armor: 2,
    weapon: 'arco', resource: 'Foco',
    desc: 'Arqueiro ágil que domina o combate à distância e armadilhas.',
    abilities: ['tiro_certeiro', 'tiro_multiplo', 'armadilha', 'tiro_mortal'],
  },
  sacerdote: {
    name: 'Sacerdote', color: '#f1c40f', hp: 105, hpPerLv: 14, mana: 160, manaPerLv: 12, armor: 2,
    weapon: 'cajado', resource: 'Mana',
    desc: 'Canaliza a luz para curar aliados e punir inimigos.',
    abilities: ['castigo', 'cura', 'escudo_divino', 'renovar'],
  },
};

// kind: dmg | aoe | heal | buff | shield | hot
// range em tiles; cd em segundos
const ABILITIES = {
  golpe_heroico: { name: 'Golpe Heroico', kind: 'dmg', range: 1.9, cd: 1.2, cost: 0, base: 8, coef: 1.0, icon: '⚔️', desc: 'Golpe rápido com a arma.' },
  investida: { name: 'Investida', kind: 'dmg', range: 8, cd: 10, cost: 15, base: 6, coef: 0.6, dash: true, stun: 1.5, icon: '🐎', desc: 'Avança até o alvo e o atordoa.' },
  redemoinho: { name: 'Redemoinho', kind: 'aoe', self: true, radius: 2.6, cd: 7, cost: 25, base: 10, coef: 0.9, icon: '🌀', desc: 'Atinge todos os inimigos ao redor.' },
  grito_batalha: { name: 'Grito de Batalha', kind: 'buff', cd: 30, cost: 20, buff: { dmg: 0.35, dur: 12 }, icon: '📯', desc: '+35% de dano por 12s.' },

  bola_fogo: { name: 'Bola de Fogo', kind: 'dmg', range: 9, cd: 1.6, cost: 12, base: 12, coef: 1.2, proj: '#ff7b22', icon: '🔥', desc: 'Lança uma bola de fogo.' },
  lanca_gelo: { name: 'Lança de Gelo', kind: 'dmg', range: 9, cd: 6, cost: 18, base: 10, coef: 0.9, slow: 4, proj: '#9be7ff', icon: '❄️', desc: 'Dano e lentidão por 4s.' },
  nova_gelida: { name: 'Nova Gélida', kind: 'aoe', self: true, radius: 3.2, cd: 12, cost: 30, base: 8, coef: 0.7, root: 3, icon: '🧊', desc: 'Congela inimigos próximos.' },
  explosao_arcana: { name: 'Explosão Arcana', kind: 'dmg', range: 9, cd: 14, cost: 45, base: 30, coef: 2.4, proj: '#c56cf0', icon: '✨', desc: 'Dano arcano massivo.' },

  tiro_certeiro: { name: 'Tiro Certeiro', kind: 'dmg', range: 10, cd: 1.3, cost: 0, base: 8, coef: 1.0, proj: '#e0c080', icon: '🏹', desc: 'Disparo preciso.' },
  tiro_multiplo: { name: 'Tiro Múltiplo', kind: 'aoe', range: 10, radius: 2.5, cd: 8, cost: 25, base: 9, coef: 0.8, icon: '🎯', desc: 'Chuva de flechas na área do alvo.' },
  armadilha: { name: 'Armadilha', kind: 'dmg', range: 10, cd: 14, cost: 20, base: 4, coef: 0.4, root: 4, proj: '#a0a0a0', icon: '🪤', desc: 'Prende o alvo por 4s.' },
  tiro_mortal: { name: 'Tiro Mortal', kind: 'dmg', range: 11, cd: 12, cost: 35, base: 25, coef: 2.2, proj: '#ff4040', icon: '💀', desc: 'Disparo devastador.' },

  castigo: { name: 'Castigo', kind: 'dmg', range: 9, cd: 1.5, cost: 8, base: 9, coef: 1.0, proj: '#fff3a0', icon: '☀️', desc: 'Raio de luz sagrada.' },
  cura: { name: 'Cura', kind: 'heal', range: 9, cd: 2.5, cost: 22, base: 30, coef: 2.2, icon: '💚', desc: 'Cura o aliado alvo (ou você).' },
  escudo_divino: { name: 'Escudo Divino', kind: 'shield', range: 9, cd: 15, cost: 25, base: 30, coef: 2.0, icon: '🛡️', desc: 'Escudo que absorve dano.' },
  renovar: { name: 'Renovar', kind: 'hot', range: 9, cd: 8, cost: 18, base: 6, coef: 0.5, dur: 10, icon: '🌿', desc: 'Cura ao longo de 10s.' },
};

const ITEMS = {
  // --- Equipamento inicial
  espada_velha: { name: 'Espada Gasta', type: 'weapon', wtype: 'espada', dmg: 2, lvl: 1, value: 2, icon: '🗡️' },
  cajado_velho: { name: 'Cajado de Aprendiz', type: 'weapon', wtype: 'cajado', dmg: 2, lvl: 1, value: 2, icon: '🪄' },
  arco_velho: { name: 'Arco Rústico', type: 'weapon', wtype: 'arco', dmg: 2, lvl: 1, value: 2, icon: '🏹' },
  roupas_simples: { name: 'Roupas Simples', type: 'armor', armor: 1, lvl: 1, value: 1, icon: '👕' },

  // --- Materiais
  minerio_ferro: { name: 'Minério de Ferro', type: 'material', value: 3, icon: '🪨' },
  carvao: { name: 'Carvão', type: 'material', value: 2, icon: '⚫' },
  minerio_mithril: { name: 'Minério de Mithril', type: 'material', value: 12, icon: '💎' },
  barra_ferro: { name: 'Barra de Ferro', type: 'material', value: 9, icon: '▬' },
  barra_aco: { name: 'Barra de Aço', type: 'material', value: 24, icon: '▬' },
  barra_mithril: { name: 'Barra de Mithril', type: 'material', value: 60, icon: '▬' },
  erva: { name: 'Erva-prata', type: 'material', value: 2, icon: '🌿' },
  flor_lunar: { name: 'Flor Lunar', type: 'material', value: 9, icon: '🌸' },
  gosma: { name: 'Gosma Viscosa', type: 'material', value: 3, icon: '🟢' },
  couro: { name: 'Couro', type: 'material', value: 3, icon: '🟫' },
  presa: { name: 'Presa de Lobo', type: 'material', value: 2, icon: '🦷' },
  carne: { name: 'Carne de Javali', type: 'material', value: 3, icon: '🥩' },
  trigo: { name: 'Trigo', type: 'material', value: 1, icon: '🌾' },
  osso: { name: 'Osso Antigo', type: 'material', value: 2, icon: '🦴' },
  seda: { name: 'Seda de Aranha', type: 'material', value: 4, icon: '🕸️' },
  po_arcano: { name: 'Pó Arcano', type: 'material', value: 12, icon: '✨' },

  // --- Consumíveis
  pao: { name: 'Pão', type: 'consumable', heal: 40, value: 5, icon: '🍞' },
  ensopado: { name: 'Ensopado de Javali', type: 'consumable', heal: 110, value: 14, icon: '🍲' },
  banquete: { name: 'Banquete Real', type: 'consumable', heal: 300, mana: 150, value: 45, icon: '🍗' },
  pocao_vida: { name: 'Poção de Vida', type: 'consumable', heal: 80, value: 15, icon: '🧪' },
  pocao_mana: { name: 'Poção de Mana', type: 'consumable', mana: 80, value: 15, icon: '🔵' },
  pocao_grande_vida: { name: 'Grande Poção de Vida', type: 'consumable', heal: 240, value: 45, icon: '❤️' },
  elixir_forca: { name: 'Elixir da Força', type: 'consumable', buff: { dmg: 0.25, dur: 120 }, value: 40, icon: '💪' },

  // --- Mercadorias (rotas comerciais de Mercadores)
  caixa_especiarias: { name: 'Caixa de Especiarias', type: 'trade', value: 20, icon: '📦' },
  caixa_ferramentas: { name: 'Caixa de Ferramentas', type: 'trade', value: 25, icon: '🧰' },
  fardo_peles: { name: 'Fardo de Peles', type: 'trade', value: 22, icon: '🧶' },

  // --- Itens de missão / tarefas
  pacote_real: { name: 'Pacote Real', type: 'quest', value: 0, icon: '✉️' },

  // --- Lendários
  cajado_lich: { name: 'Cajado de Morvath', type: 'weapon', wtype: 'cajado', dmg: 34, lvl: 15, value: 400, icon: '☠️', epic: true },
  lamina_lich: { name: 'Lâmina da Cripta', type: 'weapon', wtype: 'espada', dmg: 34, lvl: 15, value: 400, icon: '⚔️', epic: true },
  arco_lich: { name: 'Arco dos Lamentos', type: 'weapon', wtype: 'arco', dmg: 34, lvl: 15, value: 400, icon: '🏹', epic: true },
  manto_lich: { name: 'Manto do Rei Caído', type: 'armor', armor: 24, lvl: 15, value: 400, icon: '🧥', epic: true },
};

// Gera armas e armaduras em camadas (ferro, aço, mithril)
const TIERS = [
  { key: 'ferro', name: 'de Ferro', lvl: 3, dmg: 7, armor: 6, bar: 'barra_ferro', req: 5 },
  { key: 'aco', name: 'de Aço', lvl: 7, dmg: 13, armor: 11, bar: 'barra_aco', req: 25 },
  { key: 'mithril', name: 'de Mithril', lvl: 12, dmg: 22, armor: 18, bar: 'barra_mithril', req: 50 },
];
const WTYPES = [
  { key: 'espada', name: 'Espada', icon: '🗡️', extra: 'couro', extraQty: 1 },
  { key: 'cajado', name: 'Cajado', icon: '🪄', extra: 'erva', extraQty: 3 },
  { key: 'arco', name: 'Arco', icon: '🏹', extra: 'seda', extraQty: 2 },
];

const RECIPES = {};
function addRecipe(id, prof, req, inputs, output, qty = 1, station) {
  RECIPES[id] = { id, prof, req, inputs, output, qty, station };
}

// Ferreiro
addRecipe('barra_ferro', 'ferreiro', 0, { minerio_ferro: 2, carvao: 1 }, 'barra_ferro', 1, 'forja');
addRecipe('barra_aco', 'ferreiro', 18, { barra_ferro: 2, carvao: 2 }, 'barra_aco', 1, 'forja');
addRecipe('barra_mithril', 'ferreiro', 40, { minerio_mithril: 2, barra_aco: 1 }, 'barra_mithril', 1, 'forja');
for (const t of TIERS) {
  for (const w of WTYPES) {
    const id = `${w.key}_${t.key}`;
    ITEMS[id] = { name: `${w.name} ${t.name}`, type: 'weapon', wtype: w.key, dmg: t.dmg, lvl: t.lvl, value: 12 + t.dmg * 5, icon: w.icon };
    addRecipe(id, 'ferreiro', t.req, { [t.bar]: 3, [w.extra]: w.extraQty }, id, 1, 'forja');
  }
  const aid = `armadura_${t.key}`;
  ITEMS[aid] = { name: `Armadura ${t.name}`, type: 'armor', armor: t.armor, lvl: t.lvl, value: 15 + t.armor * 6, icon: '🛡️' };
  addRecipe(aid, 'ferreiro', t.req + 5, { [t.bar]: 5, couro: 2 }, aid, 1, 'forja');
}

// Alquimista
addRecipe('pocao_vida', 'alquimista', 0, { erva: 3 }, 'pocao_vida', 1, 'alquimia');
addRecipe('pocao_mana', 'alquimista', 5, { erva: 2, gosma: 1 }, 'pocao_mana', 1, 'alquimia');
addRecipe('pocao_grande_vida', 'alquimista', 25, { flor_lunar: 2, pocao_vida: 1 }, 'pocao_grande_vida', 1, 'alquimia');
addRecipe('elixir_forca', 'alquimista', 35, { flor_lunar: 1, presa: 2, po_arcano: 1 }, 'elixir_forca', 1, 'alquimia');

// Fazendeiro / Cozinheiro
addRecipe('pao', 'fazendeiro', 0, { trigo: 3 }, 'pao', 2, 'forno');
addRecipe('ensopado', 'fazendeiro', 10, { carne: 2, trigo: 1, erva: 1 }, 'ensopado', 1, 'forno');
addRecipe('banquete', 'fazendeiro', 30, { carne: 3, trigo: 3, flor_lunar: 1 }, 'banquete', 1, 'forno');

const PROFESSIONS = {
  ferreiro: {
    name: 'Ferreiro', icon: '⚒️',
    desc: 'Forja armas e armaduras na Forja de Valoria. Extrai o dobro de minério dos veios.',
  },
  mercador: {
    name: 'Mercador', icon: '💰',
    desc: 'Único que pode anunciar itens no Mercado de Valoria e negociar mercadorias entre cidades. Paga metade do imposto e vende mais caro aos comerciantes.',
  },
  empregado: {
    name: 'Empregado', icon: '🧹',
    desc: 'Aceita Tarefas Reais e Contratos no Quadro de Empregos. Pode ser nomeado Guarda Real pelo rei e receber salário do tesouro.',
  },
  alquimista: {
    name: 'Alquimista', icon: '⚗️',
    desc: 'Prepara poções e elixires. Colhe o dobro de ervas e flores.',
  },
  fazendeiro: {
    name: 'Fazendeiro', icon: '🌾',
    desc: 'Colhe o dobro de trigo e cozinha pães, ensopados e banquetes no forno da Taverna.',
  },
};

// Nós de coleta
const NODES = {
  veio_ferro: { name: 'Veio de Ferro', item: 'minerio_ferro', qty: [1, 2], bonus: 'ferreiro', extra: { item: 'carvao', chance: 0.4 }, respawn: 35, color: '#9a7b6a' },
  veio_carvao: { name: 'Depósito de Carvão', item: 'carvao', qty: [1, 3], bonus: 'ferreiro', respawn: 30, color: '#333' },
  veio_mithril: { name: 'Veio de Mithril', item: 'minerio_mithril', qty: [1, 2], bonus: 'ferreiro', respawn: 70, color: '#7fe3ff', lvl: 8 },
  erva: { name: 'Erva-prata', item: 'erva', qty: [1, 3], bonus: 'alquimista', respawn: 25, color: '#b8e0b0' },
  flor_lunar: { name: 'Flor Lunar', item: 'flor_lunar', qty: [1, 1], bonus: 'alquimista', respawn: 60, color: '#e8a0ff', lvl: 5 },
  trigo: { name: 'Trigal', item: 'trigo', qty: [2, 4], bonus: 'fazendeiro', respawn: 20, color: '#e8c55a' },
};

// Monstros
const MOBS = {
  ratazana: { name: 'Ratazana Gigante', lv: 1, hp: 32, dmg: 3, armor: 0, xp: 15, speed: 3.2, aggro: 3, range: 1.3, atkCd: 1.6, color: '#7a6a5a', size: 0.35, gold: [0, 2], loot: [['couro', 0.25]] },
  lobo: { name: 'Lobo Cinzento', lv: 2, hp: 50, dmg: 5, armor: 1, xp: 22, speed: 3.6, aggro: 6, range: 1.4, atkCd: 1.6, color: '#8a8a8a', size: 0.45, gold: [1, 4], loot: [['presa', 0.6], ['couro', 0.4]] },
  javali: { name: 'Javali Selvagem', lv: 3, hp: 70, dmg: 6, armor: 2, xp: 28, speed: 3.2, aggro: 4, range: 1.4, atkCd: 1.8, color: '#7a4a2a', size: 0.5, gold: [1, 5], loot: [['carne', 0.7], ['couro', 0.5]] },
  aranha: { name: 'Aranha da Mata', lv: 4, hp: 65, dmg: 8, armor: 2, xp: 34, speed: 3.8, aggro: 6, range: 1.4, atkCd: 1.4, color: '#3a2a4a', size: 0.45, gold: [2, 6], loot: [['seda', 0.7]] },
  bandido: { name: 'Bandido da Estrada', lv: 5, hp: 110, dmg: 10, armor: 4, xp: 45, speed: 3.6, aggro: 7, range: 1.5, atkCd: 1.6, color: '#5a3a3a', size: 0.5, gold: [6, 16], loot: [['pao', 0.3], ['couro', 0.3], ['caixa_especiarias', 0.05]] },
  gosma: { name: 'Gosma do Pântano', lv: 6, hp: 120, dmg: 10, armor: 3, xp: 52, speed: 2.4, aggro: 5, range: 1.4, atkCd: 2, color: '#5fbf3f', size: 0.5, gold: [3, 8], loot: [['gosma', 0.9], ['flor_lunar', 0.1]] },
  crocodilo: { name: 'Crocodilo do Brejo', lv: 8, hp: 180, dmg: 14, armor: 6, xp: 70, speed: 3.0, aggro: 5, range: 1.6, atkCd: 2, color: '#3f6f3f', size: 0.6, gold: [5, 12], loot: [['couro', 0.8], ['carne', 0.4]] },
  kobold: { name: 'Kobold Mineiro', lv: 7, hp: 140, dmg: 12, armor: 5, xp: 62, speed: 3.4, aggro: 6, range: 1.5, atkCd: 1.6, color: '#b5651d', size: 0.45, gold: [5, 14], loot: [['minerio_ferro', 0.6], ['carvao', 0.6]] },
  golem: { name: 'Golem de Pedra', lv: 11, hp: 300, dmg: 20, armor: 12, xp: 120, speed: 2.4, aggro: 5, range: 1.7, atkCd: 2.4, color: '#7d7d6d', size: 0.7, gold: [10, 25], loot: [['minerio_mithril', 0.5], ['po_arcano', 0.3]] },
  esqueleto: { name: 'Esqueleto Errante', lv: 12, hp: 250, dmg: 21, armor: 8, xp: 135, speed: 3.4, aggro: 7, range: 1.5, atkCd: 1.6, color: '#e8e2cf', size: 0.5, gold: [12, 28], loot: [['osso', 0.8], ['po_arcano', 0.25]] },
  espectro: { name: 'Espectro Lamentoso', lv: 14, hp: 280, dmg: 24, armor: 6, xp: 160, speed: 3.2, aggro: 8, range: 6, ranged: '#b0f0ff', atkCd: 2.2, color: '#9fd6e8', size: 0.5, gold: [15, 32], loot: [['po_arcano', 0.5], ['flor_lunar', 0.3]] },
  lich: {
    name: 'Morvath, o Lich', lv: 18, hp: 4200, dmg: 38, armor: 14, xp: 2500, speed: 2.8, aggro: 9, range: 7, ranged: '#8dff6a', atkCd: 1.8,
    color: '#4b1f6f', size: 1.0, boss: true, respawn: 240, gold: [250, 400],
    nova: { every: 9, radius: 4, dmg: 45 },
    loot: [['cajado_lich', 0.33], ['lamina_lich', 0.33], ['arco_lich', 0.33], ['manto_lich', 0.5], ['po_arcano', 1], ['barra_mithril', 0.6]],
  },
};

// Missões (quest givers) — kill ou collect
const QUESTS = {
  q_ratos: { name: 'Pragas nos Portões', giver: 'capitao', lvl: 1, type: 'kill', target: 'ratazana', count: 6, xp: 90, gold: 12, item: 'pao', text: 'Ratazanas gigantes infestam as planícies ao redor de Valoria. Elimine 6 delas.' },
  q_lobos: { name: 'Uivos no Bosque', giver: 'capitao', lvl: 1, type: 'kill', target: 'lobo', count: 8, xp: 180, gold: 25, item: 'pocao_vida', text: 'Os lobos do Bosque Sussurrante atacam viajantes. Abata 8 deles.' },
  q_javalis: { name: 'Praga nas Plantações', giver: 'joaquim', lvl: 2, type: 'kill', target: 'javali', count: 6, xp: 200, gold: 25, item: 'pao', text: 'Javalis estão destruindo meu trigal nos Campos Dourados! Cace 6 deles.' },
  q_seda: { name: 'Fios de Prata', giver: 'eldrin', lvl: 3, type: 'collect', target: 'seda', count: 5, xp: 240, gold: 30, text: 'Preciso de 5 Sedas de Aranha para meus experimentos.' },
  q_bandidos: { name: 'Estradas Seguras', giver: 'capitao', lvl: 5, type: 'kill', target: 'bandido', count: 8, xp: 420, gold: 60, item: 'pocao_vida', text: 'Bandidos assaltam caravanas nas estradas do sul. Restaure a ordem.' },
  q_gosmas: { name: 'Essência do Pântano', giver: 'eldrin', lvl: 6, type: 'collect', target: 'gosma', count: 6, xp: 450, gold: 50, item: 'pocao_mana', text: 'Traga-me 6 Gosmas Viscosas do Pântano Sombrio.' },
  q_kobolds: { name: 'Minas Invadidas', giver: 'durin', lvl: 7, type: 'kill', target: 'kobold', count: 10, xp: 600, gold: 70, text: 'Kobolds tomaram as minas das Montanhas de Ferro. Expulse-os!' },
  q_golems: { name: 'Coração de Pedra', giver: 'durin', lvl: 10, type: 'kill', target: 'golem', count: 6, xp: 900, gold: 110, item: 'pocao_grande_vida', text: 'Golems despertaram nos picos. Destrua 6 antes que desçam ao vale.' },
  q_esqueletos: { name: 'Descanso aos Mortos', giver: 'lumen', lvl: 12, type: 'kill', target: 'esqueleto', count: 10, xp: 1300, gold: 150, text: 'Os mortos das Ruínas Malditas se levantam. Devolva-os ao descanso.' },
  q_lich: { name: 'A Queda de Morvath', giver: 'lumen', lvl: 15, type: 'kill', target: 'lich', count: 1, xp: 4000, gold: 600, item: 'elixir_forca', text: 'O Lich Morvath é a fonte da maldição. Reúna aliados e destrua-o.' },
};

const XP_TABLE = [0];
for (let l = 1; l <= 30; l++) XP_TABLE[l] = Math.floor(80 * Math.pow(l, 1.65));
const MAX_LEVEL = 20;

// Política
const FOCI = {
  militar: { name: 'Militar', desc: '+15% de XP de monstros e Guardas Reais mais fortes.' },
  comercio: { name: 'Comércio', desc: 'Preços das rotas comerciais +20% e taxa do mercado reduzida.' },
  artesaos: { name: 'Artesãos', desc: 'Ofícios rendem o dobro de habilidade e 20% de chance de produção extra.' },
  povo: { name: 'Povo', desc: 'Tarefas Reais pagam +50% e pão grátis no Vendedor para níveis baixos.' },
};

const DEBATE_TOPICS = [
  { key: 'impostos', title: 'Impostos e Tesouro Real' },
  { key: 'seguranca', title: 'Segurança das Estradas e Monstros' },
  { key: 'economia', title: 'Comércio, Guildas e Profissões' },
  { key: 'povo', title: 'O Povo e os Trabalhadores' },
  { key: 'final', title: 'Considerações Finais' },
];

const NPC_CANDIDATES = [
  {
    name: 'Lorde Aldric', focus: 'militar', tax: 20, slogan: 'Força e ordem para Valoria!',
    lines: {
      impostos: ['Impostos financiam espadas, e espadas protegem colheitas. Manterei 20%.', 'Um reino sem tesouro é um reino sem muralhas.'],
      seguranca: ['Cada lobo, cada bandido será caçado. Recompensas para quem limpar as estradas!', 'Dobrarei a Guarda Real.'],
      economia: ['Ferreiros armam nossos soldados — eles serão prioridade.', 'Sem segurança não existe comércio.'],
      povo: ['O povo merece dormir em paz. Eu garantirei isso.', 'Empregados poderão servir na Guarda com bom salário.'],
      final: ['Votem pela força. Votem em Aldric!', 'A escuridão de Morvath se aproxima. Só um líder firme nos salvará.'],
    },
  },
  {
    name: 'Dama Seraphine', focus: 'comercio', tax: 10, slogan: 'Ouro circulando é ouro multiplicando.',
    lines: {
      impostos: ['Reduzirei os impostos para 10%. Deixem o ouro circular!', 'Impostos altos sufocam os mercadores.'],
      seguranca: ['Caravanas seguras significam preços justos. Investirei nas rotas comerciais.', 'Os bandidos temem uma economia forte.'],
      economia: ['Mercadores são o coração de Valoria. As rotas para Porto Sereno pagarão mais!', 'Um mercado livre beneficia todas as profissões.'],
      povo: ['Prosperidade para os mercadores é emprego para o povo.', 'Mais comércio, mais contratos no Quadro de Empregos.'],
      final: ['Escolham a prosperidade. Escolham Seraphine!', 'Meu adversário quer gastar; eu quero que vocês ganhem.'],
    },
  },
  {
    name: 'Mestre Bram', focus: 'artesaos', tax: 15, slogan: 'Mãos que constroem, reino que cresce.',
    lines: {
      impostos: ['15% é justo: nem pesado ao povo, nem fraco ao reino.', 'Usarei o tesouro para fortalecer as oficinas.'],
      seguranca: ['Boas armas vencem guerras. Boas forjas fazem boas armas.', 'Armaduras de mithril para todos os defensores!'],
      economia: ['Ferreiros, alquimistas e fazendeiros: este reino será de vocês!', 'Cada ofício terá o dobro de reconhecimento no meu reinado.'],
      povo: ['O povo trabalhador é a base de tudo.', 'Ensinarei ofícios a qualquer um que quiser aprender.'],
      final: ['Votem em quem sabe construir. Votem em Bram!', 'Martelo na bigorna, Valoria na glória!'],
    },
  },
  {
    name: 'Tia Marta', focus: 'povo', tax: 5, slogan: 'Pão na mesa de todo valoriano.',
    lines: {
      impostos: ['Apenas 5% de imposto! O povo já paga demais.', 'O tesouro deve servir ao povo, não aos nobres.'],
      seguranca: ['Os guardas devem proteger as vilas, não só o castelo.', 'Que os aventureiros sejam bem pagos para nos defender.'],
      economia: ['Mercadores ricos e povo faminto? Não no meu reino.', 'Os contratos de trabalho serão justos.'],
      povo: ['Tarefas Reais pagarão 50% a mais! Trabalho digno para todos!', 'Pão grátis para os recém-chegados!'],
      final: ['Votem com o coração. Votem na Tia Marta!', 'Eu venho do povo e governarei para o povo.'],
    },
  },
];

module.exports = {
  CLASSES, ABILITIES, ITEMS, RECIPES, PROFESSIONS, NODES, MOBS, QUESTS,
  XP_TABLE, MAX_LEVEL, FOCI, DEBATE_TOPICS, NPC_CANDIDATES,
};
