'use strict';
// Persistência simples em JSON (contas, personagens e estado do reino).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'save.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { accounts: {}, world: null };
  }
}

function save(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, FILE);
}

function hashPassword(pass, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(pass, salt, 32).toString('hex');
  return { salt, hash };
}

function checkPassword(pass, salt, hash) {
  const h = crypto.scryptSync(pass, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return h.length === expected.length && crypto.timingSafeEqual(h, expected);
}

module.exports = { load, save, hashPassword, checkPassword };
