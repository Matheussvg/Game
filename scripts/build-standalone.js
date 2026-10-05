'use strict';
// Gera uma versão single-player em um único HTML: o servidor do jogo roda dentro
// da página e conversa com o cliente por um WebSocket simulado.
// Uso: node scripts/build-standalone.js [saida.html]

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const out = process.argv[2] || path.join(ROOT, 'dist', 'valoria.html');

// ---- Módulos do servidor (CommonJS) ----
const serverModules = ['data', 'world', 'politics', 'game'];
const storageShim = `
const KEY = 'valoria_save_v1';
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.accounts) return s; } catch (e) {}
  return { accounts: {}, world: null };
}
function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
function h(s) { let x = 2166136261; for (const c of s) { x ^= c.codePointAt(0); x = Math.imul(x, 16777619) >>> 0; } return x.toString(16); }
function hashPassword(pass, salt = Math.random().toString(36).slice(2)) { return { salt, hash: h(salt + pass) }; }
function checkPassword(pass, salt, hash) { return h(salt + pass) === hash; }
module.exports = { load, save, hashPassword, checkPassword };`;

let serverJs = 'const __defs = {};\n';
const wrap = (name, src) => `__defs[${JSON.stringify(name)}] = function (module, exports, require) {\n${src}\n};\n`;
for (const m of serverModules) serverJs += wrap(m, read(`server/${m}.js`));
serverJs += wrap('storage', storageShim);
serverJs += `
const __cache = {};
function __require(name) {
  const key = name.replace(/^\\.\\//, '').replace(/\\.js$/, '');
  if (__cache[key]) return __cache[key].exports;
  if (!__defs[key]) throw new Error('Módulo ausente: ' + name);
  const module = { exports: {} };
  __cache[key] = module;
  __defs[key](module, module.exports, __require);
  return module.exports;
}`;

// ---- Módulos do cliente (ES modules → IIFEs) ----
function convertClient(name, src) {
  const exported = [];
  src = src.replace(/^import \{([^}]+)\} from '\.\/(\w+)\.js';$/gm, (_, names, mod) => `const {${names}} = __mods.${mod};`);
  src = src.replace(/^export (function|const|let) (\w+)/gm, (_, kw, id) => { exported.push(id); return `${kw} ${id}`; });
  src = src.replace(/^export \{([^}]+)\};$/gm, (_, names) => { exported.push(...names.split(',').map(s => s.trim())); return ''; });
  return `__mods.${name} = (function () {\n${src}\nreturn { ${exported.join(', ')} };\n})();\n`;
}
let clientJs = 'const __mods = {};\n';
for (const m of ['state', 'render', 'ui', 'main']) clientJs += convertClient(m, read(`public/js/${m}.js`));

// ---- Ponte servidor ↔ cliente ----
const bridge = `
var process = { env: { ELECTION_DURATIONS: '420,120,240,120' } };
var Buffer = {
  from(u8) {
    return { toString() { let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return btoa(s); } };
  },
};
${serverJs}
const { Game } = __require('game');
const { CLASSES, ABILITIES } = __require('data');
const __game = new Game();
__game.start();
window.addEventListener('pagehide', () => { try { __game.save(); } catch (e) {} });
setInterval(() => { try { __game.save(); } catch (e) {} }, 10000);

class FakeWebSocket {
  constructor() {
    this.readyState = 1;
    this.handlers = {};
    const self = this;
    this.server = {
      readyState: 1,
      send(s) { setTimeout(() => self.onmessage && self.onmessage({ data: s }), 0); },
      on(ev, cb) { self.handlers[ev] = cb; },
      close() { this.readyState = 3; self.readyState = 3; setTimeout(() => self.onclose && self.onclose(), 0); },
    };
    __game.onConnect(this.server);
    setTimeout(() => this.onopen && this.onopen(), 0);
  }
  send(s) { setTimeout(() => this.handlers.message && this.handlers.message(s), 0); }
  close() {
    if (this.readyState === 3) return;
    this.readyState = 3; this.server.readyState = 3;
    this.handlers.close && this.handlers.close();
    setTimeout(() => this.onclose && this.onclose(), 0);
  }
}
window.WebSocket = FakeWebSocket;
const __fetch = window.fetch;
window.fetch = (url, ...rest) => url === '/api/classes'
  ? Promise.resolve({ json: async () => ({ classes: CLASSES, abilities: ABILITIES, online: 0 }) })
  : __fetch(url, ...rest);
`;

// ---- HTML ----
const html = read('public/index.html');
const body = html.split(/<body>/)[1].split(/<\/body>/)[0].replace(/<script[^>]*><\/script>/g, '');
const css = read('public/style.css') + '\n:root { color-scheme: dark; }\nhtml, body { height: 100%; }\n';
const page = `<title>Reinos de Valoria</title>
<style>
${css}
</style>
${body}
<script>
(function () {
${bridge}
${clientJs}
})();
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`Gerado ${out} (${(page.length / 1024).toFixed(0)} KB)`);
