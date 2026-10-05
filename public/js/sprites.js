// Sprites em pixel art das classes, desenhados por código.
// Cada sprite é uma grade de 20x30 pixels, ampliada 2x, com 3 vistas
// (frente, costas e perfil; a esquerda é o perfil espelhado) e 4 quadros:
// 0 parado, 1 e 2 passos de caminhada, 3 ataque.

export const SW = 20;
export const SH = 30;
export const SCALE = 2;
const OUT = '#1a1219';

// Paleta compartilhada
const SKIN = '#f0c39a', SKIN_D = '#d39a70', EYE = '#2a1c18';

class Pix {
  constructor() {
    this.g = new Array(SW * SH).fill(null);
    this.s = new Array(SW * SH).fill(null);
  }
  px(x, y, c) { x = Math.round(x); y = Math.round(y); if (c && x >= 0 && y >= 0 && x < SW && y < SH) this.g[y * SW + x] = c; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  row(y, x0, x1, c) { for (let x = x0; x <= x1; x++) this.px(x, y, c); }
  col(x, y0, y1, c) { for (let y = y0; y <= y1; y++) this.px(x, y, c); }
  line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) this.px(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, c);
  }
  clear(x, y) { if (x >= 0 && y >= 0 && x < SW && y < SH) this.g[y * SW + x] = null; }
  // Camada "suave" (brilhos, auréolas): desenhada por cima, sem contorno
  soft(x, y, c) { if (x >= 0 && y >= 0 && x < SW && y < SH) this.s[y * SW + x] = c; }
  get(x, y) { return x < 0 || y < 0 || x >= SW || y >= SH ? null : this.g[y * SW + x]; }
  outline() {
    const add = [];
    for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * SW + x);
    }
    for (const i of add) this.g[i] = OUT;
  }
  toCanvas(mirror) {
    const c = document.createElement('canvas');
    c.width = SW * SCALE; c.height = SH * SCALE;
    const g = c.getContext('2d');
    for (const layer of [this.g, this.s]) {
      for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
        const col = layer[y * SW + x];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect((mirror ? SW - 1 - x : x) * SCALE, y * SCALE, SCALE, SCALE);
      }
    }
    return c;
  }
}

// ======================= Partes comuns =======================
// Pernas na vista frontal/traseira. Nos passos, uma perna sobe 1px.
function legsFront(p, f, pants, pantsD, boots, bootsD) {
  const leg = (x, lift) => {
    p.rect(x, 23 - lift, 3, 3, pants); p.col(x + 2, 23 - lift, 25 - lift, pantsD);
    p.rect(x, 26 - lift, 3, 2, boots); p.row(28 - lift, x, x + 2, bootsD);
  };
  leg(6, f === 1 ? 1 : 0);
  leg(11, f === 2 ? 1 : 0);
}

// Pernas de perfil (virado para a direita)
function legsSide(p, f, pants, pantsD, boots, bootsD) {
  const leg = (x, c, cd, b, bd) => {
    p.rect(x, 23, 3, 3, c); p.col(x + 2, 23, 25, cd);
    p.rect(x, 26, 4, 2, b); p.row(28, x, x + 3, bd);
  };
  if (f === 0 || f === 3) leg(8, pants, pantsD, boots, bootsD);
  else if (f === 1) { leg(5, pantsD, pantsD, bootsD, bootsD); leg(10, pants, pantsD, boots, bootsD); }
  else { leg(10, pantsD, pantsD, bootsD, bootsD); leg(6, pants, pantsD, boots, bootsD); }
}

// Pés sob túnicas longas
function feetRobe(p, v, f, boot) {
  if (v === 'side') {
    if (f === 1) { p.rect(12, 28, 3, 1, boot); p.rect(5, 28, 3, 1, boot); }
    else if (f === 2) { p.rect(9, 28, 3, 1, boot); }
    else p.rect(9, 28, 4, 1, boot);
  } else {
    if (f !== 2) p.rect(6, 28, 3, 1, boot);
    if (f !== 1) p.rect(11, 28, 3, 1, boot);
  }
}

// Túnica longa (mago e sacerdote): tronco + saia que alarga
function robe(p, v, f, c, cl, cd, trim) {
  const sway = f === 1 ? -1 : f === 2 ? 1 : 0;
  if (v === 'side') {
    p.rect(7, 16, 6, 7, c);
    for (let y = 23; y <= 27; y++) p.row(y, 6 - (y > 25 ? 1 : 0) + sway, 13 + (y > 24 ? 1 : 0) + sway, c);
    p.col(7, 16, 27, cd);
    p.row(27, 5 + sway, 14 + sway, trim);
  } else {
    p.rect(5, 16, 10, 7, c);
    for (let y = 23; y <= 27; y++) p.row(y, 5 - (y - 22 >> 1) + sway, 14 + (y - 22 >> 1) + sway, c);
    p.col(6, 16, 26, cl);
    p.col(13, 16, 27, cd);
    p.row(27, 3 + sway, 16 + sway, trim);
  }
}

// Braços (mangas) e mãos; retorna a posição da mão da frente
function armsFront(p, f, sleeve, sleeveD, hand) {
  const l = f === 1 ? -1 : f === 2 ? 1 : 0;
  p.rect(3, 16, 2, 6 + l, sleeve); p.col(3, 16, 21 + l, sleeveD);
  p.rect(3, 22 + l, 2, 1, hand);
  p.rect(15, 16, 2, 6 - l, sleeve); p.col(16, 16, 21 - l, sleeveD);
  p.rect(15, 22 - l, 2, 1, hand);
}

function armSide(p, f, sleeve, sleeveD, hand) {
  if (f === 1) { p.line(9, 16, 11, 20, sleeve); p.line(10, 16, 12, 20, sleeve); p.rect(11, 21, 2, 1, hand); return [12, 21]; }
  if (f === 2) { p.line(9, 16, 8, 20, sleeve); p.line(10, 16, 9, 20, sleeveD); p.rect(8, 21, 2, 1, hand); return [8, 21]; }
  if (f === 3) { p.line(9, 16, 13, 17, sleeve); p.line(9, 17, 13, 18, sleeveD); p.rect(14, 17, 2, 2, hand); return [15, 17]; }
  p.rect(9, 16, 2, 6, sleeve); p.col(9, 16, 21, sleeveD); p.rect(9, 22, 2, 1, hand);
  return [10, 22];
}

function faceFront(p) {
  p.rect(7, 10, 6, 6, SKIN);
  p.px(7, 15, SKIN_D); p.px(12, 15, SKIN_D);
  p.px(8, 12, EYE); p.px(11, 12, EYE);
  p.px(8, 11, SKIN_D); p.px(11, 11, SKIN_D);
  p.px(10, 14, '#c47a5a');
}

function faceSide(p) {
  p.rect(10, 10, 4, 6, SKIN);
  p.px(14, 12, SKIN);
  p.px(12, 12, EYE); p.px(12, 11, SKIN_D);
  p.px(13, 14, '#c47a5a'); p.px(10, 15, SKIN_D);
}

// ======================= Guerreiro =======================
function guerreiro(p, v, f) {
  const st = '#c3cad6', stL = '#eef2f7', stD = '#7a8394', red = '#b8322a', redD = '#7e1f1a', gold = '#e8b84a', lea = '#7a4b2a', leaD = '#4e2f18';
  const wood = '#8a5a2e', woodD = '#5e3b1c';
  if (v === 'down') {
    // escudo (braço esquerdo do personagem = direita da tela)
    legsFront(p, f, stD, '#5d6575', lea, leaD);
    p.rect(5, 16, 10, 7, st); p.col(6, 16, 21, stL); p.col(13, 16, 22, stD);
    p.rect(8, 17, 4, 6, red); p.col(11, 17, 22, redD);
    p.row(21, 5, 14, lea); p.rect(9, 21, 2, 1, gold);
    armsFront(p, f === 3 ? 0 : f, st, stD, lea);
    p.rect(3, 15, 3, 2, stL); p.rect(14, 15, 3, 2, stL); p.row(17, 3, 5, stD); p.row(17, 14, 16, stD);
    // cabeça com elmo
    faceFront(p);
    p.rect(5, 7, 10, 4, st); p.row(7, 6, 13, stL); p.clear(5, 7); p.clear(14, 7);
    p.row(10, 5, 14, stD);
    p.rect(6, 11, 1, 4, st); p.rect(13, 11, 1, 4, st);
    p.rect(9, 10, 2, 2, stD);
    p.rect(9, 3, 2, 4, red); p.col(10, 3, 6, redD); p.px(8, 4, red);
    // escudo
    p.rect(15, 17, 4, 7, red); p.row(16, 16, 17, gold); p.row(24, 16, 17, gold);
    p.col(19, 18, 22, gold); p.col(14, 18, 22, gold);
    p.rect(16, 19, 2, 2, gold);
    // espada (mão direita = esquerda da tela)
    if (f === 3) {
      p.rect(3, 12, 2, 5, st); p.rect(3, 11, 2, 1, lea);
      p.row(10, 1, 6, gold); p.rect(3, 1, 2, 9, stL); p.col(4, 1, 9, st); p.clear(3, 1);
      for (const [x, y] of [[6, 1], [8, 0], [10, 0], [12, 1], [13, 2]]) p.soft(x, y, 'rgba(255,255,255,0.75)');
    } else {
      p.rect(1, 21, 3, 1, gold); p.col(2, 22, 24, lea);
      p.col(1, 9, 20, stL); p.col(2, 9, 20, st); p.px(1, 8, stL);
    }
  } else if (v === 'up') {
    legsFront(p, f, stD, '#5d6575', lea, leaD);
    p.rect(5, 16, 10, 7, st);
    armsFront(p, f, st, stD, lea);
    p.rect(3, 15, 3, 2, stL); p.rect(14, 15, 3, 2, stL);
    p.rect(6, 16, 8, 8, red); p.col(8, 17, 23, redD); p.col(11, 17, 23, redD); p.row(24, 6, 13, redD);
    p.rect(5, 7, 10, 8, st); p.row(7, 6, 13, stL); p.clear(5, 7); p.clear(14, 7); p.row(14, 5, 14, stD); p.col(9, 8, 13, stD);
    p.rect(9, 3, 2, 4, red); p.col(9, 3, 6, redD);
    // escudo nas costas do braço esquerdo (esquerda da tela)
    p.rect(1, 17, 4, 7, wood); p.col(1, 17, 23, woodD); p.row(19, 1, 4, leaD); p.row(22, 1, 4, leaD);
    if (f !== 3) { p.col(17, 9, 20, st); p.col(18, 9, 20, stL); p.rect(16, 21, 3, 1, gold); }
    else { p.col(17, 2, 11, st); p.col(18, 2, 11, stL); p.row(12, 15, 19, gold); }
  } else {
    // perfil (direita)
    p.rect(4, 17, 3, 7, red); p.col(4, 17, 23, gold); p.rect(5, 19, 1, 2, gold);
    legsSide(p, f, stD, '#5d6575', lea, leaD);
    p.rect(7, 16, 6, 7, st); p.col(7, 16, 22, stD); p.rect(10, 17, 3, 6, red); p.col(12, 17, 22, redD);
    p.row(21, 7, 12, lea);
    faceSide(p);
    p.rect(7, 7, 7, 4, st); p.row(7, 8, 12, stL); p.clear(13, 7);
    p.rect(7, 11, 3, 4, st); p.col(7, 11, 14, stD); p.row(10, 7, 13, stD);
    p.rect(7, 3, 2, 4, red); p.px(6, 4, red); p.px(6, 5, redD);
    const [hx, hy] = armSide(p, f, st, stD, lea);
    p.rect(8, 15, 4, 2, stL);
    if (f === 3) {
      p.col(hx, hy - 2, hy + 2, gold);
      p.row(hy, hx + 1, 19, stL); p.row(hy + 1, hx + 1, 18, st);
      for (let x = 12; x <= 19; x += 2) p.soft(x, hy - 3, 'rgba(255,255,255,0.6)');
    } else {
      p.row(hy - 1, hx - 1, hx + 1, gold);
      p.line(hx + 1, hy - 1, hx + 8, hy - 6, stL); p.line(hx + 1, hy - 2, hx + 7, hy - 7, st);
      p.px(hx, hy + 1, lea);
    }
  }
}

// ======================= Mago =======================
function mago(p, v, f) {
  const c = '#3557b8', cl = '#5a80dd', cd = '#223a80', trim = '#e8b84a', hat = '#2b3f8f', hatL = '#4566c4', hatD = '#1b2a66';
  const star = '#ffe680', staff = '#7a4e26', staffL = '#a06a36', orb = '#8fe9ff', orbL = '#e6fbff', hair = '#d6d8e2', hairD = '#a6a9b8';
  const glow = 'rgba(143,233,255,0.45)';
  const orbAt = (x, y, big) => {
    p.rect(x - 1, y - 1, 3, 3, orb); p.px(x, y, orbL);
    if (big) { p.px(x - 2, y, orb); p.px(x + 2, y, orb); p.px(x, y - 2, orb); p.px(x, y + 2, orb); }
    for (const [dx, dy] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, -3], [-3, 0], [3, 0]]) p.soft(x + dx, y + dy, glow);
    if (big) for (const [dx, dy] of [[-4, -1], [4, 1], [1, -4], [-1, 4]]) p.soft(x + dx, y + dy, 'rgba(230,251,255,0.8)');
  };
  if (v === 'down') {
    feetRobe(p, v, f, '#3a2a3a');
    robe(p, v, f, c, cl, cd, trim);
    p.row(20, 5, 14, trim); p.col(9, 21, 26, cd); p.col(10, 21, 26, cl);
    armsFront(p, f === 3 ? 0 : f, c, cd, SKIN); p.row(21, 3, 4, trim); p.row(21, 15, 16, trim);
    faceFront(p);
    p.col(6, 10, 14, hair); p.col(13, 10, 14, hair); p.col(7, 14, 15, hair); p.col(12, 14, 15, hair); p.row(16, 7, 12, hairD);
    // chapéu pontudo
    p.row(9, 3, 16, hat); p.row(8, 4, 15, hatL); p.row(7, 6, 13, trim);
    p.row(6, 7, 12, hat); p.row(5, 7, 11, hat); p.row(4, 8, 11, hat); p.row(3, 9, 11, hat); p.row(2, 10, 12, hat); p.row(1, 11, 13, hatD); p.px(14, 0, hatD);
    p.col(8, 4, 6, hatL); p.px(10, 4, star); p.px(9, 5, star);
    if (f === 3) { p.col(3, 9, 21, staff); p.col(2, 9, 21, staffL); orbAt(3, 6, true); p.rect(3, 12, 2, 5, c); }
    else { p.col(2, 5, 28, staff); p.col(1, 6, 27, staffL); orbAt(2, 3, false); }
  } else if (v === 'up') {
    feetRobe(p, v, f, '#3a2a3a');
    robe(p, v, f, c, cl, cd, trim);
    p.row(20, 5, 14, trim);
    armsFront(p, f, c, cd, SKIN);
    p.rect(6, 10, 8, 7, hair); p.col(9, 11, 16, hairD); p.row(16, 7, 12, hairD);
    p.row(9, 3, 16, hat); p.row(8, 4, 15, hatD); p.row(7, 6, 13, trim);
    p.row(6, 7, 12, hat); p.row(5, 7, 11, hat); p.row(4, 8, 11, hat); p.row(3, 9, 11, hat); p.row(2, 8, 10, hat); p.row(1, 6, 8, hatD); p.px(5, 0, hatD);
    if (f === 3) { p.col(17, 6, 20, staff); orbAt(17, 4, true); }
    else { p.col(17, 5, 28, staff); p.col(18, 6, 27, staffL); orbAt(17, 3, false); }
  } else {
    feetRobe(p, v, f, '#3a2a3a');
    robe(p, v, f, c, cl, cd, trim);
    p.row(20, 7, 12, trim);
    faceSide(p);
    p.rect(7, 10, 3, 7, hair); p.col(7, 10, 16, hairD); p.px(13, 15, hair); p.px(12, 16, hair);
    p.row(9, 4, 15, hat); p.row(8, 5, 14, hatL); p.row(7, 6, 12, trim);
    p.row(6, 7, 11, hat); p.row(5, 7, 10, hat); p.row(4, 6, 9, hat); p.row(3, 5, 8, hat); p.row(2, 4, 6, hatD); p.row(1, 3, 4, hatD);
    p.px(8, 5, star);
    const [hx, hy] = armSide(p, f, c, cd, SKIN);
    if (f === 3) { p.line(hx - 3, hy + 4, hx + 2, hy - 5, staff); orbAt(hx + 3, hy - 7, true); }
    else { p.col(hx + 5, 6, 28, staff); p.col(hx + 6, 7, 27, staffL); orbAt(hx + 5, 4, false); }
  }
}

// ======================= Caçador =======================
function cacador(p, v, f) {
  const cl = '#2f6e3c', clL = '#4b9455', clD = '#1e4a28', lea = '#8b5a2e', leaL = '#ad7744', leaD = '#5c391b';
  const pants = '#4a3a2a', pantsD = '#33281c', boots = '#3b2a1c', bootsD = '#241910';
  const bow = '#9a6528', bowL = '#c48a44', str = '#efe6d2', fl = '#d9473a', shaft = '#c8a070';
  const bowArc = (x, y0, pulled) => {
    // arco vertical com a curva para a direita
    p.px(x, y0, bowL); p.px(x + 1, y0 + 1, bow); p.col(x + 2, y0 + 2, y0 + 10, bow); p.col(x + 3, y0 + 4, y0 + 8, bowL);
    p.px(x + 1, y0 + 11, bow); p.px(x, y0 + 12, bowL);
    if (pulled) { p.line(x, y0 + 1, x - 3, y0 + 6, str); p.line(x - 3, y0 + 6, x, y0 + 11, str); }
    else p.col(x, y0 + 1, y0 + 11, str);
  };
  if (v === 'down') {
    legsFront(p, f, pants, pantsD, boots, bootsD);
    p.rect(5, 16, 10, 7, lea); p.col(6, 16, 21, leaL); p.col(9, 17, 20, leaD); p.col(10, 17, 20, leaD);
    p.rect(5, 15, 2, 9, cl); p.rect(13, 15, 2, 9, clD);
    p.row(21, 7, 12, leaD); p.px(10, 21, '#e8b84a');
    armsFront(p, f, lea, leaD, SKIN); p.row(20, 3, 4, leaD); p.row(20, 15, 16, leaD);
    // aljava espiando sobre o ombro
    p.px(3, 15, fl); p.px(4, 14, fl); p.px(4, 15, shaft);
    // capuz
    faceFront(p);
    p.rect(5, 7, 10, 3, cl); p.row(7, 6, 13, clL); p.clear(5, 7); p.clear(14, 7);
    p.rect(5, 10, 2, 6, cl); p.rect(13, 10, 2, 6, clD); p.row(10, 7, 12, clD);
    p.row(16, 6, 13, clD);
    bowArc(16, 12, f === 3);
    if (f === 3) { p.col(14, 17, 19, shaft); p.px(14, 16, '#d8d8d8'); }
  } else if (v === 'up') {
    legsFront(p, f, pants, pantsD, boots, bootsD);
    p.rect(5, 16, 10, 7, lea);
    armsFront(p, f, lea, leaD, SKIN);
    p.rect(5, 15, 10, 10, cl); p.col(7, 17, 24, clD); p.col(12, 17, 24, clD); p.row(25, 6, 13, clD);
    p.line(12, 15, 8, 23, leaD); p.line(13, 15, 9, 23, lea); p.line(13, 16, 9, 24, leaD);
    p.px(12, 13, fl); p.px(13, 12, fl); p.px(14, 13, fl); p.px(13, 14, shaft);
    p.rect(5, 7, 10, 9, cl); p.row(7, 6, 13, clL); p.clear(5, 7); p.clear(14, 7); p.col(9, 9, 15, clD); p.row(16, 8, 11, clD);
    p.px(3, 12, bowL); p.px(2, 13, bow); p.col(1, 14, 22, bow); p.col(0, 16, 20, bowL); p.px(2, 23, bow); p.px(3, 24, bowL); p.col(3, 13, 23, str);
  } else {
    legsSide(p, f, pants, pantsD, boots, bootsD);
    p.rect(5, 15, 3, 10, clD); p.col(5, 17, 24, cl); p.row(25, 5, 7, clD);
    p.rect(7, 16, 6, 7, lea); p.col(12, 16, 22, leaD); p.row(21, 7, 12, leaD);
    p.line(5, 15, 8, 21, leaD); p.px(4, 14, fl); p.px(4, 13, fl); p.px(5, 14, shaft);
    faceSide(p);
    p.rect(7, 7, 7, 3, cl); p.row(7, 8, 12, clL); p.clear(13, 7);
    p.rect(7, 10, 3, 6, cl); p.col(7, 10, 15, clD); p.px(6, 9, cl); p.px(6, 10, clD);
    p.row(10, 10, 13, clD);
    const [hx, hy] = armSide(p, f, lea, leaD, SKIN);
    if (f === 3) {
      bowArc(hx, hy - 6, true);
      p.row(hy, hx - 4, 19, shaft); p.px(19, hy, '#d8d8d8'); p.px(hx - 4, hy - 1, fl); p.px(hx - 4, hy + 1, fl);
    } else bowArc(hx + 3, hy - 8, false);
  }
}

// ======================= Sacerdote =======================
function sacerdote(p, v, f) {
  const c = '#f3efe3', cl = '#ffffff', cd = '#cfc6ad', gold = '#e8b84a', goldD = '#b0842a', blue = '#5a9fd6';
  const hair = '#c88a3c', hairD = '#9a6428';
  const halo = 'rgba(255,236,140,0.9)', haloS = 'rgba(255,236,140,0.4)';
  const haloAt = (x0, x1, y) => {
    for (let x = x0 + 1; x < x1; x++) { p.soft(x, y - 1, halo); p.soft(x, y + 1, halo); }
    p.soft(x0, y, halo); p.soft(x1, y, halo);
  };
  const sun = (x, y, big) => {
    p.rect(x - 1, y - 1, 3, 3, gold); p.px(x, y, '#fff6c8');
    p.px(x, y - 2, goldD); p.px(x, y + 2, goldD); p.px(x - 2, y, goldD); p.px(x + 2, y, goldD);
    const r = big ? 4 : 3;
    for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [-2, -2], [2, -2], [2, 2], [-2, 2]]) p.soft(x + dx, y + dy, big ? halo : haloS);
  };
  if (v === 'down') {
    feetRobe(p, v, f, '#7a5a3a');
    robe(p, v, f, c, cl, cd, gold);
    p.line(7, 16, 7, 26, gold); p.line(12, 16, 12, 26, gold); p.px(8, 16, gold); p.px(11, 16, gold);
    p.row(20, 5, 14, blue);
    armsFront(p, f === 3 ? 0 : f, c, cd, SKIN); p.row(21, 3, 4, gold); p.row(21, 15, 16, gold);
    faceFront(p);
    p.rect(6, 7, 8, 3, hair); p.row(7, 7, 12, hairD); p.clear(6, 7); p.clear(13, 7);
    p.rect(5, 10, 2, 8, hair); p.rect(13, 10, 2, 8, hair); p.col(5, 12, 17, hairD); p.col(14, 12, 17, hairD);
    p.row(9, 6, 13, gold); p.rect(9, 9, 2, 1, blue);
    haloAt(6, 13, 4);
    if (f === 3) { p.col(3, 9, 21, gold); p.rect(3, 12, 2, 5, c); sun(3, 6, true); }
    else { p.col(2, 8, 28, gold); p.col(1, 9, 27, goldD); sun(2, 5, false); }
  } else if (v === 'up') {
    feetRobe(p, v, f, '#7a5a3a');
    robe(p, v, f, c, cl, cd, gold);
    p.row(20, 5, 14, blue);
    armsFront(p, f, c, cd, SKIN);
    p.rect(6, 7, 8, 13, hair); p.rect(5, 10, 10, 9, hair); p.clear(6, 7); p.clear(13, 7);
    p.col(8, 9, 19, hairD); p.col(11, 9, 19, hairD); p.row(9, 6, 13, gold);
    haloAt(6, 13, 4);
    if (f === 3) { p.col(17, 8, 20, gold); sun(17, 5, true); }
    else { p.col(17, 8, 28, gold); p.col(18, 9, 27, goldD); sun(17, 5, false); }
  } else {
    feetRobe(p, v, f, '#7a5a3a');
    robe(p, v, f, c, cl, cd, gold);
    p.col(11, 16, 26, gold); p.row(20, 7, 12, blue);
    faceSide(p);
    p.rect(7, 7, 6, 3, hair); p.row(7, 8, 11, hairD); p.clear(12, 7);
    p.rect(6, 10, 4, 9, hair); p.col(6, 11, 18, hairD); p.px(13, 9, hair);
    p.row(9, 8, 13, gold);
    haloAt(7, 13, 4);
    const [hx, hy] = armSide(p, f, c, cd, SKIN);
    if (f === 3) { p.line(hx, hy + 3, hx + 2, hy - 6, gold); sun(hx + 3, hy - 9, true); }
    else { p.col(hx + 5, 8, 28, gold); p.col(hx + 6, 9, 27, goldD); sun(hx + 5, 5, false); }
  }
}

const DRAW = { guerreiro, mago, cacador, sacerdote };
const cache = new Map();

// dir: 0 baixo, 1 esquerda, 2 direita, 3 cima (mesmo código usado pelo jogo)
export function getSprite(cls, dir, frame) {
  const key = `${cls}|${dir}|${frame}`;
  let c = cache.get(key);
  if (c) return c;
  const draw = DRAW[cls] || guerreiro;
  const view = dir === 0 ? 'down' : dir === 3 ? 'up' : 'side';
  const p = new Pix();
  draw(p, view, frame);
  p.outline();
  c = p.toCanvas(dir === 1);
  cache.set(key, c);
  return c;
}

// Ciclo de caminhada: passo, parado, outro passo, parado
export function walkFrame(t) {
  return [1, 0, 2, 0][Math.floor(t * 8) % 4];
}

export const CLASS_KEYS = Object.keys(DRAW);
