'use strict';
// O Reino de Valoria: ciclo de reinado → candidaturas → debate → votação.

const { FOCI, DEBATE_TOPICS, NPC_CANDIDATES, MOBS } = require('./data');
const { FORUM } = require('./world');

const FAST = !!process.env.ELECTION_FAST;
const MIN = 60 * 1000;
const DUR = FAST
  ? { reinado: 3 * MIN, candidatura: 1.5 * MIN, debate: 2.5 * MIN, votacao: 1.5 * MIN }
  : { reinado: 20 * MIN, candidatura: 4 * MIN, debate: 6 * MIN, votacao: 3 * MIN };
// ELECTION_DURATIONS="reinado,candidatura,debate,votacao" em segundos (ex: "1200,240,360,180")
if (process.env.ELECTION_DURATIONS) {
  const v = process.env.ELECTION_DURATIONS.split(',').map(Number);
  ['reinado', 'candidatura', 'debate', 'votacao'].forEach((k, i) => { if (v[i] > 0) DUR[k] = v[i] * 1000; });
}
const PHASE_NAMES = { reinado: 'Reinado', candidatura: 'Candidaturas Abertas', debate: 'Grande Debate', votacao: 'Votação' };

const CANDIDACY_FEE = 50;
const CANDIDACY_LEVEL = 3;
const NPC_CITIZEN_VOTES = 9;
const MAX_STATEMENTS_PER_TOPIC = 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

class Politics {
  constructor(game, saved) {
    this.game = game;
    const s = saved || {};
    this.phase = s.phase || 'reinado';
    this.phaseEnds = Date.now() + (s.phaseLeft != null ? s.phaseLeft : DUR.reinado);
    this.king = s.king || { name: 'Rei Aldric I', isNpc: true, focus: 'militar', since: Date.now() };
    this.tax = s.tax != null ? s.tax : 15;
    this.treasury = s.treasury != null ? s.treasury : 600;
    this.decrees = s.decrees || [{ text: 'Que a paz reine em Valoria. Aventureiros são bem-vindos.', by: this.king.name, at: Date.now() }];
    this.candidates = s.candidates || [];
    this.debate = s.debate || { topicIdx: 0, topicEnds: 0, feed: [] };
    this.votes = s.votes || {};
    this.petition = s.petition || [];
    this.history = s.history || [];
    this.bounties = s.bounties || [];
    this.guards = s.guards || [];
    this.festivalUntil = s.festivalUntil || 0;
    this.term = s.term || 1;
    this.feedId = s.feedId || 1;
    this.cds = {};
    this.nextSalary = Date.now() + MIN;
    this.nextNpcKing = Date.now() + 90 * 1000;
    this.dirty = true;
  }

  serialize() {
    return {
      phase: this.phase, phaseLeft: Math.max(0, this.phaseEnds - Date.now()), king: this.king, tax: this.tax,
      treasury: this.treasury, decrees: this.decrees, candidates: this.candidates, debate: this.debate,
      votes: this.votes, petition: this.petition, history: this.history, bounties: this.bounties,
      guards: this.guards, festivalUntil: this.festivalUntil, term: this.term, feedId: this.feedId,
    };
  }

  // ---------- Consultas usadas pelo jogo ----------
  isKing(p) { return !this.king.isNpc && this.king.playerName === p.name; }
  isGuard(p) { return this.guards.includes(p.name); }
  isCandidate(p) { return this.candidates.some(c => c.playerName === p.name); }
  focus() { return this.king.focus; }
  festival() { return Date.now() < this.festivalUntil; }

  taxFor(p) {
    let t = this.tax / 100;
    if (p && p.char.prof === 'mercador') t *= 0.5 * (1 - (p.char.skills.mercador || 0) / 200);
    if (this.focus() === 'comercio') t *= 0.8;
    return t;
  }

  deposit(amount) {
    if (amount > 0) { this.treasury += amount; this.dirty = true; }
  }

  withdraw(amount) {
    if (this.treasury < amount) return false;
    this.treasury -= amount; this.dirty = true;
    return true;
  }

  onMobKill(p, mobType) {
    const b = this.bounties.find(x => x.mob === mobType && x.left > 0);
    if (!b) return;
    b.left--;
    this.game.giveGold(p, b.reward, `Recompensa real: ${MOBS[mobType].name}`);
    if (b.left <= 0) {
      this.bounties = this.bounties.filter(x => x.left > 0);
      this.game.announce(`📜 A recompensa por ${MOBS[mobType].name} foi totalmente paga.`);
    }
    this.dirty = true;
  }

  // ---------- Ciclo ----------
  tick(now) {
    if (now >= this.phaseEnds) {
      if (this.phase === 'reinado') this.startCandidacy('O mandato chegou ao fim.');
      else if (this.phase === 'candidatura') this.startDebate();
      else if (this.phase === 'debate') this.startVoting();
      else if (this.phase === 'votacao') this.finishElection();
    }

    if (this.phase === 'debate') {
      if (now >= this.debate.topicEnds && this.debate.topicIdx < DEBATE_TOPICS.length - 1) {
        this.debate.topicIdx++;
        this.debate.topicEnds = now + DUR.debate / DEBATE_TOPICS.length;
        this.feed('system', 'Moderador', `Próximo tema: ${DEBATE_TOPICS[this.debate.topicIdx].title}`);
        this.scheduleNpcLines();
      }
      for (const c of this.candidates) {
        if (c.isNpc && c.nextLineAt && now >= c.nextLineAt) {
          const topic = DEBATE_TOPICS[this.debate.topicIdx].key;
          const def = NPC_CANDIDATES[c.npcIdx];
          const said = c.said[topic] || 0;
          const lines = def.lines[topic];
          if (said < lines.length) {
            this.statement(c, lines[said]);
            c.said[topic] = said + 1;
            c.nextLineAt = said + 1 < lines.length ? now + (DUR.debate / DEBATE_TOPICS.length) * (0.35 + Math.random() * 0.3) : 0;
          } else c.nextLineAt = 0;
        }
      }
      // NPCs da plateia reagem aleatoriamente
      if (Math.random() < 0.02 && this.debate.feed.length) {
        const st = pick(this.debate.feed.slice(-6).filter(f => f.kind === 'statement'));
        if (st) {
          const c = this.candidates.find(x => x.name === st.who);
          const likes = c ? (30 - c.tax) / 30 + 0.3 : 0.5;
          if (Math.random() < likes) st.npcApplause = (st.npcApplause || 0) + 1; else st.npcBoos = (st.npcBoos || 0) + 1;
          this.dirty = true;
        }
      }
    }

    if (this.phase === 'reinado' && this.king.isNpc && now >= this.nextNpcKing) {
      this.nextNpcKing = now + 120 * 1000;
      this.npcKingAct();
    }

    if (now >= this.nextSalary) {
      this.nextSalary = now + MIN;
      this.paySalaries();
    }
  }

  setPhase(phase, dur) {
    this.phase = phase;
    this.phaseEnds = Date.now() + dur;
    this.dirty = true;
    this.game.broadcast({ t: 'phase', phase, name: PHASE_NAMES[phase] });
  }

  startCandidacy(reason) {
    this.candidates = [];
    this.votes = {};
    this.petition = [];
    this.debate = { topicIdx: 0, topicEnds: 0, feed: [] };
    // Dois candidatos NPC sempre disputam
    const idxs = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, 2);
    for (const i of idxs) {
      const d = NPC_CANDIDATES[i];
      this.candidates.push({ name: d.name, isNpc: true, npcIdx: i, focus: d.focus, tax: d.tax, slogan: d.slogan, applause: 0, boos: 0, said: {}, statements: 0 });
    }
    this.setPhase('candidatura', DUR.candidatura);
    this.game.announce(`👑 ${reason} Candidaturas abertas para o trono de Valoria! Fale com o Arauto Real (nível ${CANDIDACY_LEVEL}+, taxa ${CANDIDACY_FEE} de ouro).`);
  }

  startDebate() {
    this.debate = { topicIdx: 0, topicEnds: Date.now() + DUR.debate / DEBATE_TOPICS.length, feed: [] };
    this.setPhase('debate', DUR.debate);
    const names = this.candidates.map(c => c.name).join(', ');
    this.feed('system', 'Moderador', `Bem-vindos ao Grande Debate! Candidatos: ${names}. Primeiro tema: ${DEBATE_TOPICS[0].title}`);
    this.game.announce('🎙️ O Grande Debate começou na Praça do Fórum! Abra o painel de Política (O) para acompanhar.');
    this.scheduleNpcLines();
  }

  scheduleNpcLines() {
    const span = DUR.debate / DEBATE_TOPICS.length;
    for (const c of this.candidates) if (c.isNpc) c.nextLineAt = Date.now() + span * (0.08 + Math.random() * 0.3);
  }

  startVoting() {
    this.votes = {};
    this.setPhase('votacao', DUR.votacao);
    this.game.announce('🗳️ A votação está aberta! Todo cidadão de Valoria pode votar uma vez (painel de Política, tecla O).');
  }

  popularity(c) {
    let pop = 10 + c.applause * 3 - c.boos * 2 + (30 - c.tax) / 3 + Math.min(c.statements, 10);
    for (const f of this.debate.feed) {
      if (f.who === c.name) pop += (f.npcApplause || 0) * 1.5 - (f.npcBoos || 0);
    }
    return Math.max(1, pop);
  }

  finishElection() {
    const tally = {};
    for (const c of this.candidates) tally[c.name] = 0;
    for (const v of Object.values(this.votes)) if (tally[v] != null) tally[v]++;
    // Votos dos cidadãos NPC, proporcionais à popularidade (maiores restos)
    const pops = this.candidates.map(c => ({ c, p: this.popularity(c) }));
    const total = pops.reduce((a, b) => a + b.p, 0);
    const shares = pops.map(x => ({ c: x.c, q: (x.p / total) * NPC_CITIZEN_VOTES }));
    let given = 0;
    for (const s of shares) { s.n = Math.floor(s.q); given += s.n; }
    shares.sort((a, b) => (b.q - b.n) - (a.q - a.n));
    for (let i = 0; given < NPC_CITIZEN_VOTES; i++, given++) shares[i % shares.length].n++;
    const npcVotes = {};
    for (const s of shares) { tally[s.c.name] += s.n; npcVotes[s.c.name] = s.n; }

    const ranked = [...this.candidates].sort((a, b) => (tally[b.name] - tally[a.name]) || (this.popularity(b) - this.popularity(a)));
    const winner = ranked[0];
    const prevKing = this.king.name;
    this.king = { name: winner.name, isNpc: winner.isNpc, playerName: winner.playerName, focus: winner.focus, since: Date.now(), slogan: winner.slogan };
    this.tax = winner.tax;
    this.guards = [];
    this.term++;
    this.history.unshift({
      term: this.term, king: winner.name, prev: prevKing, at: Date.now(),
      results: ranked.map(c => ({ name: c.name, votes: tally[c.name], npc: npcVotes[c.name] || 0 })),
    });
    this.history = this.history.slice(0, 10);
    this.decrees.unshift({ text: `${winner.name} foi coroado(a)! Foco do reinado: ${FOCI[winner.focus].name}. Imposto: ${winner.tax}%.`, by: 'Conselho Real', at: Date.now() });
    this.decrees = this.decrees.slice(0, 12);
    const summary = ranked.map(c => `${c.name}: ${tally[c.name]}`).join(' | ');
    this.game.announce(`👑 ${winner.name} é o novo soberano de Valoria! Resultado — ${summary}`);
    this.candidates = [];
    this.setPhase('reinado', DUR.reinado);
    this.nextNpcKing = Date.now() + 60 * 1000;
    if (!winner.isNpc) {
      const p = this.game.findOnline(winner.playerName);
      if (p) this.game.toast(p, '👑 Você foi coroado! Fale com o Trono de Valoria (no castelo) para governar.', 'gold');
    }
  }

  npcKingAct() {
    if (this.bounties.length < 2 && this.treasury > 250) {
      const opts = ['lobo', 'javali', 'bandido', 'gosma', 'kobold', 'golem', 'esqueleto', 'espectro', 'crocodilo', 'aranha'];
      const mob = pick(opts.filter(m => !this.bounties.some(b => b.mob === m)));
      const reward = Math.max(2, Math.round(MOBS[mob].lv * 1.2));
      const count = 20;
      if (this.withdraw(reward * count)) {
        this.bounties.push({ mob, reward, left: count, by: this.king.name });
        this.game.announce(`📜 Decreto de ${this.king.name}: recompensa de ${reward} de ouro por cada ${MOBS[mob].name} abatido!`);
      }
    } else if (Math.random() < 0.4) {
      const lines = ['Os mercados de Valoria estão abertos a todos os viajantes.', 'Que os ferreiros trabalhem dia e noite!', 'A Guarda Real reforçará as estradas.', 'O tesouro real cresce graças ao povo trabalhador.'];
      this.addDecree(pick(lines), this.king.name);
    }
  }

  paySalaries() {
    const salary = this.focus() === 'militar' ? 12 : 8;
    for (const name of this.guards) {
      const p = this.game.findOnline(name);
      if (p && this.withdraw(salary)) this.game.giveGold(p, salary, 'Salário da Guarda Real');
    }
    if (!this.king.isNpc) {
      const k = this.game.findOnline(this.king.playerName);
      if (k && this.withdraw(10)) this.game.giveGold(k, 10, 'Estipêndio real');
    }
  }

  addDecree(text, by) {
    this.decrees.unshift({ text, by, at: Date.now() });
    this.decrees = this.decrees.slice(0, 12);
    this.game.announce(`📜 Decreto de ${by}: ${text}`);
    this.dirty = true;
  }

  feed(kind, who, text, extra = {}) {
    const entry = { id: this.feedId++, kind, who, text, topic: this.debate.topicIdx, at: Date.now(), applause: [], boos: [], ...extra };
    this.debate.feed.push(entry);
    if (this.debate.feed.length > 120) this.debate.feed.shift();
    this.dirty = true;
    return entry;
  }

  statement(c, text) {
    c.statements = (c.statements || 0) + 1;
    this.feed('statement', c.name, text);
    if (c.isNpc) this.game.npcSay(this.stageId(c), text);
    else {
      const p = this.game.findOnline(c.playerName);
      if (p) this.game.bubble(p, text);
    }
  }

  stageId(c) { return 'cand' + c.npcIdx; }

  stageNpcs() {
    if (this.phase === 'reinado') return [];
    const out = [];
    let i = 0;
    for (const c of this.candidates) {
      if (!c.isNpc) continue;
      const d = NPC_CANDIDATES[c.npcIdx];
      out.push({ id: this.stageId(c), name: d.name, x: FORUM.cx + 0.5 + (i === 0 ? -2.5 : 2.5), y: FORUM.cy + 0.5 - 1, color: '#c9a227', title: 'Candidato(a)', role: 'candidate' });
      i++;
    }
    return out;
  }

  // ---------- Ações de jogadores ----------
  action(p, m) {
    const g = this.game;
    const err = text => g.toast(p, text, 'err');
    const now = Date.now();
    const inCity = g.map.inCity(p.x, p.y);

    switch (m.a) {
      case 'candidate': {
        if (this.phase !== 'candidatura') return err('As candidaturas não estão abertas.');
        if (!g.near(p, 'arauto', 4)) return err('Fale com o Arauto Real, em frente ao castelo, para se candidatar.');
        if (this.isCandidate(p)) return err('Você já é candidato.');
        if (p.char.lv < CANDIDACY_LEVEL) return err(`É preciso nível ${CANDIDACY_LEVEL} para se candidatar.`);
        if (this.candidates.length >= 8) return err('Número máximo de candidatos atingido.');
        if (!FOCI[m.focus]) return err('Escolha um foco de governo.');
        const tax = clamp(Math.round(Number(m.tax) || 0), 0, 30);
        const slogan = clean(m.slogan, 80) || 'Por uma Valoria melhor!';
        if (p.char.gold < CANDIDACY_FEE) return err(`A taxa de candidatura é ${CANDIDACY_FEE} de ouro.`);
        p.char.gold -= CANDIDACY_FEE;
        this.deposit(CANDIDACY_FEE);
        this.candidates.push({ name: p.char.name, playerName: p.name, isNpc: false, focus: m.focus, tax, slogan, applause: 0, boos: 0, statements: 0 });
        g.announce(`🗳️ ${p.char.name} (${g.className(p)} nível ${p.char.lv}) se candidatou ao trono! Lema: "${slogan}"`);
        this.dirty = true;
        return;
      }
      case 'withdraw': {
        if (this.phase === 'reinado' || this.phase === 'votacao') return err('Não é possível desistir agora.');
        if (!this.isCandidate(p)) return;
        this.candidates = this.candidates.filter(c => c.playerName !== p.name);
        g.announce(`${p.char.name} retirou sua candidatura.`);
        this.dirty = true;
        return;
      }
      case 'speak': {
        if (this.phase !== 'debate') return err('Não há debate em andamento.');
        const c = this.candidates.find(x => x.playerName === p.name);
        if (!c) return err('Apenas candidatos falam no púlpito. Use "Perguntar" para fazer perguntas.');
        if (!g.map.inForum(p.x, p.y)) return err('Suba ao púlpito na Praça do Fórum (centro de Valoria) para discursar.');
        const text = clean(m.text, 220);
        if (text.length < 3) return;
        const topic = DEBATE_TOPICS[this.debate.topicIdx].key;
        c.said = c.said || {};
        if ((c.said[topic] || 0) >= MAX_STATEMENTS_PER_TOPIC) return err('Você já usou seu tempo neste tema. Aguarde o próximo.');
        c.said[topic] = (c.said[topic] || 0) + 1;
        this.statement(c, text);
        return;
      }
      case 'ask': {
        if (this.phase !== 'debate') return err('Não há debate em andamento.');
        if (!inCity) return err('Você precisa estar em Valoria para participar do debate.');
        if (this.cds['ask' + p.name] > now) return err('Aguarde antes de fazer outra pergunta.');
        const text = clean(m.text, 160);
        if (text.length < 3) return;
        this.cds['ask' + p.name] = now + 30000;
        this.feed('question', p.char.name, text);
        g.bubble(p, text);
        return;
      }
      case 'react': {
        if (this.phase !== 'debate' && this.phase !== 'votacao') return;
        const f = this.debate.feed.find(x => x.id === m.id);
        if (!f || f.kind !== 'statement' || f.who === p.char.name) return;
        if (f.applause.includes(p.name) || f.boos.includes(p.name)) return err('Você já reagiu a esta fala.');
        const c = this.candidates.find(x => x.name === f.who);
        if (m.kind === 'boo') { f.boos.push(p.name); if (c) c.boos++; }
        else { f.applause.push(p.name); if (c) c.applause++; }
        this.dirty = true;
        return;
      }
      case 'vote': {
        if (this.phase !== 'votacao') return err('A votação não está aberta.');
        if (!inCity) return err('As urnas ficam em Valoria. Vá até a cidade para votar.');
        if (this.votes[p.name]) return err('Você já votou nesta eleição.');
        const c = this.candidates.find(x => x.name === m.name);
        if (!c) return err('Candidato inválido.');
        this.votes[p.name] = c.name;
        g.toast(p, `Voto registrado para ${c.name}. Obrigado, cidadão!`, 'ok');
        this.dirty = true;
        return;
      }
      case 'petition': {
        if (this.phase !== 'reinado') return err('Petições só podem ser assinadas durante um reinado.');
        if (now - this.king.since < (FAST ? 30000 : 2 * MIN)) return err('O novo soberano acabou de assumir. Aguarde um pouco.');
        if (p.char.lv < 3) return err('É preciso nível 3 para assinar a petição.');
        if (!inCity) return err('Assine a petição em Valoria.');
        if (this.petition.includes(p.name)) return err('Você já assinou.');
        if (this.isKing(p)) return err('O rei não pode assinar contra si mesmo!');
        this.petition.push(p.name);
        const need = this.petitionNeeded();
        g.announce(`✍️ ${p.char.name} assinou a Petição de Desconfiança contra ${this.king.name} (${this.petition.length}/${need}).`);
        if (this.petition.length >= need) this.startCandidacy(`A Petição de Desconfiança derrubou ${this.king.name}!`);
        this.dirty = true;
        return;
      }
    }

    // ---- Ações do rei ----
    if (!this.isKing(p)) return err('Apenas o soberano pode fazer isso.');
    if (!g.near(p, 'trono', 5) && m.a !== 'decree') return err('Você deve estar no Trono de Valoria para governar.');
    switch (m.a) {
      case 'setTax': {
        if (this.cds.tax > now) return err('Aguarde antes de alterar os impostos novamente.');
        const tax = clamp(Math.round(Number(m.tax) || 0), 0, 30);
        this.cds.tax = now + 60000;
        this.tax = tax;
        this.addDecree(`O imposto do reino passa a ser ${tax}%.`, this.king.name);
        return;
      }
      case 'decree': {
        if (this.cds.decree > now) return err('Aguarde antes de emitir outro decreto.');
        const text = clean(m.text, 140);
        if (text.length < 3) return;
        this.cds.decree = now + 45000;
        this.addDecree(text, this.king.name);
        return;
      }
      case 'bounty': {
        if (!MOBS[m.mob]) return err('Monstro inválido.');
        const reward = clamp(Math.round(Number(m.reward) || 0), 1, 60);
        const count = clamp(Math.round(Number(m.count) || 0), 1, 50);
        if (this.bounties.length >= 4) return err('Já existem recompensas demais ativas.');
        if (!this.withdraw(reward * count)) return err('O tesouro não tem ouro suficiente.');
        this.bounties.push({ mob: m.mob, reward, left: count, by: this.king.name });
        this.addDecree(`Recompensa de ${reward} de ouro por cada ${MOBS[m.mob].name} abatido (${count} vagas).`, this.king.name);
        return;
      }
      case 'festival': {
        if (this.festival()) return err('Já há um festival em andamento.');
        if (!this.withdraw(300)) return err('O festival custa 300 de ouro do tesouro.');
        this.festivalUntil = now + 5 * MIN;
        this.addDecree('Festival Real! +25% de experiência para todos por 5 minutos!', this.king.name);
        return;
      }
      case 'appoint': {
        const t = g.findOnline(String(m.name || ''));
        if (!t) return err('Jogador não encontrado online.');
        if (t.char.prof !== 'empregado') return err('Apenas Empregados podem servir na Guarda Real.');
        if (this.guards.includes(t.name)) return err('Já é guarda.');
        if (this.guards.length >= 6) return err('A Guarda Real está completa (6).');
        this.guards.push(t.name);
        g.announce(`🛡️ ${t.char.name} foi nomeado(a) Guarda Real por ${this.king.name}!`);
        this.dirty = true;
        return;
      }
      case 'dismiss': {
        const key = String(m.name || '').toLowerCase();
        if (!this.guards.includes(key)) return;
        this.guards = this.guards.filter(n => n !== key);
        g.announce(`${this.displayName(key)} foi dispensado(a) da Guarda Real.`);
        this.dirty = true;
        return;
      }
      case 'abdicate': {
        this.startCandidacy(`${this.king.name} abdicou do trono!`);
        return;
      }
    }
  }

  displayName(key) {
    const c = this.game.getChar(key);
    return c ? c.name : key;
  }

  petitionNeeded() {
    return Math.max(3, Math.ceil(this.game.players.size * 0.5));
  }

  publicState(p) {
    const now = Date.now();
    return {
      t: 'pol',
      phase: this.phase, phaseName: PHASE_NAMES[this.phase], endsIn: Math.max(0, this.phaseEnds - now), term: this.term,
      king: { name: this.king.name, isNpc: this.king.isNpc, focus: this.king.focus, since: this.king.since, slogan: this.king.slogan },
      tax: this.tax, treasury: Math.floor(this.treasury), decrees: this.decrees.slice(0, 8),
      candidates: this.candidates.map(c => ({
        name: c.name, isNpc: c.isNpc, focus: c.focus, tax: c.tax, slogan: c.slogan,
        pop: Math.round(this.popularity(c)), statements: c.statements || 0,
      })),
      debate: {
        topicIdx: this.debate.topicIdx,
        topic: DEBATE_TOPICS[this.debate.topicIdx] ? DEBATE_TOPICS[this.debate.topicIdx].title : '',
        topicEndsIn: Math.max(0, this.debate.topicEnds - now),
        feed: this.debate.feed.slice(-40).map(f => ({
          id: f.id, kind: f.kind, who: f.who, text: f.text, topic: f.topic,
          up: f.applause.length + (f.npcApplause || 0), down: f.boos.length + (f.npcBoos || 0),
          mine: f.applause.includes(p.name) ? 'up' : f.boos.includes(p.name) ? 'down' : null,
        })),
      },
      totalVotes: Object.keys(this.votes).length,
      myVote: this.votes[p.name] || null,
      petition: { count: this.petition.length, need: this.petitionNeeded(), signed: this.petition.includes(p.name) },
      history: this.history.slice(0, 5),
      bounties: this.bounties,
      guards: this.guards.map(n => this.displayName(n)),
      festivalLeft: Math.max(0, this.festivalUntil - now),
      isKing: this.isKing(p), isCandidate: this.isCandidate(p), isGuard: this.isGuard(p),
      stage: this.stageNpcs(),
      fee: CANDIDACY_FEE, minLevel: CANDIDACY_LEVEL,
    };
  }
}

module.exports = { Politics, DUR };
