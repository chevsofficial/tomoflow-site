const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const buildSite = require('../scripts/build-site');
const root = path.resolve(__dirname, '..');

function timer({ saved = {}, query = '', pro = false, failWrites = false } = {}) {
  const elements = new Map();
  const storage = new Map([['tomoflow_web_v1', JSON.stringify(saved)]]);
  if (pro) storage.set('tomoflow_pro', '1');
  function el(id) {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', hidden: false, value: '', src: '', innerHTML: '', disabled: false, dataset: {}, listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; },
      setAttribute() {}, getAttribute() { return this.src; }, querySelectorAll() { return []; },
      style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} }, focus() {},
    });
    return elements.get(id);
  }
  const window = { TOMOFLOW_CONFIG: { btcAddress: 'REPLACE_WITH_BTC_ADDRESS' }, location: { search: query, pathname: '/', hash: '' }, history: { replaceState() {} } };
  const document = { getElementById: el, querySelectorAll() { return []; }, addEventListener() {}, body: { dataset: {} }, documentElement: { style: { setProperty() {} } } };
  const context = vm.createContext({ window, document, URLSearchParams, localStorage: { getItem: key => storage.get(key) || null, setItem(key, value) { if (failWrites) throw Error('quota'); storage.set(key, value); } }, setTimeout: () => 1, clearTimeout() {}, requestAnimationFrame: () => 1, cancelAnimationFrame() {}, navigator: {} });
  for (const name of ['themes.js', 'characters.js', 'timer.js']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', name), 'utf8'), context);
  return { elements, storage, document, el };
}

test('timer starts with valid defaults even if saved numeric settings are corrupt', () => {
  const app = timer({ saved: { workMin: 'oops', breakMin: -20, longBreakMin: 900, rounds: 0 } });
  assert.equal(app.el('timerDisplay').textContent, '25:00');
  assert.equal(app.el('cfgBreak').value, 1);
  assert.equal(app.el('cfgLong').value, 60);
  assert.equal(app.el('cfgRounds').value, 1);
});
test('free browsers fall back from saved Pro choices; Pro browsers keep them', () => {
  const saved = { themeId: 'sunset', characterId: 'moon' };
  const free = timer({ saved });
  assert.equal(JSON.parse(free.storage.get('tomoflow_web_v1')).themeId, 'classic');
  assert.equal(JSON.parse(free.storage.get('tomoflow_web_v1')).characterId, 'tomo');
  const pro = timer({ saved, pro: true });
  assert.equal(JSON.parse(pro.storage.get('tomoflow_web_v1')).themeId, 'sunset');
  assert.equal(pro.el('tomatoImg').src, '/assets/img/characters/moon.png');
  assert.equal(pro.el('restorePro').hidden, true);
});
test('storage fallback remembers a checkout unlock even when reads work but writes fail', () => {
  const app = timer({ query: '?pro=1', failWrites: true });
  assert.equal(app.el('proBadge').hidden, false);
  assert.equal(app.el('proUnlockedState').hidden, false);
});
test('timer controls and settings remain wired; unconfigured tips make no QR request', () => {
  const app = timer();
  assert.equal(app.el('tip').hidden, true);
  assert.equal(app.elements.has('btcQr'), false);
  app.el('btnStart').listeners.click();
  assert.equal(app.el('btnStart').disabled, true);
  app.el('btnPause').listeners.click();
  assert.equal(app.el('btnStart').disabled, false);
  app.el('btnSkip').listeners.click();
  assert.equal(app.el('modeLabel').textContent, 'Short break');
  app.el('cfgBreak').value = '10';
  app.el('cfgBreak').listeners.change();
  assert.equal(app.el('timerDisplay').textContent, '10:00');
  app.el('btnReset').listeners.click();
  assert.equal(app.el('timerDisplay').textContent, '10:00');
});
test('the static build includes only public pages and assets', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'tomoflow-site-'));
  try {
    for (const entry of ['index.html', '404.html', 'privacy.html', 'terms.html', 'support.html', 'assets']) fs.cpSync(path.join(root, entry), path.join(temporary, entry), { recursive: true });
    fs.writeFileSync(path.join(temporary, '.env'), 'must-not-be-public');
    fs.writeFileSync(path.join(temporary, 'README.md'), 'internal');
    const output = buildSite(temporary);
    assert.deepEqual(fs.readdirSync(output).sort(), ['404.html', 'assets', 'index.html', 'privacy.html', 'support.html', 'terms.html'].sort());
    // Every local image/script/stylesheet linked by a public page exists in the build.
    for (const file of ['index.html', '404.html', 'privacy.html', 'terms.html', 'support.html']) {
      const html = fs.readFileSync(path.join(output, file), 'utf8');
      for (const [, asset] of html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)) assert.ok(fs.existsSync(path.join(output, asset)), `${file}: missing ${asset}`);
    }
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
