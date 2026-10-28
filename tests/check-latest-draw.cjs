const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real page and generator scripts with a small DOM adapter.
class Element {
  constructor(tag = 'div', id = '') {
    this.tag = tag; this.id = id; this.children = [];
    this.dataset = {}; this.attrs = {}; this.events = {};
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { this.children.push(c); }
  append(...children) { this.children.push(...children); }
  addEventListener(k, f) { this.events[k] = f; }
  querySelectorAll(tag) {
    return this.children.flatMap(c => [...(c.tag === tag ? [c] : []), ...c.querySelectorAll(tag)]);
  }
  focus() {}
}
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const latest = {id: '3979', date: '2026-10-27', numbers: [2, 6, 7, 13, 22, 35], strong: 5};
function setup(ok = true) {
  const els = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element('div', m[1])]));
  const tabs = ['past-tab', 'new-tab', 'analysis-tab'].map(id => els[id]);
  tabs[0].setAttribute('aria-selected', 'true');
  const ctx = vm.createContext({window: {}, document: {
    getElementById: id => els[id], createElement: tag => new Element(tag), querySelectorAll: () => tabs
  }, fetch: async () => ({ok, json: async () => [
    {...latest, id: '3978', date: '2026-10-24'}, latest
  ]})});
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], ctx);
  return {els, ctx, states: vm.runInContext('states', ctx), form: ctx.window.lotoForm};
}
const marked = element => element.querySelectorAll('button').filter(b => b.dataset.match === 'true').map(b => Number(b.dataset.number));
const picks = (state, strong = false) => (strong ? state.strongElement : state.numbersElement).querySelectorAll('button');

(async () => {
  const {els, ctx, states, form} = setup();
  els.validate.events.click();
  assert.match(els.message.textContent, /עדיין לא נטענה/);
  await vm.runInContext(fs.readFileSync(path.join(root, 'draw-generator.js'), 'utf8'), ctx);
  assert.match(els['latest-draw'].textContent, /3979/);
  assert.equal(states.length, 14);
  form.fill(Array.from({length: 13}, () => ({numbers: [1, 8, 10, 12, 14, 24], strong: 1})), 'fill');
  // Full match, partial match, strong only (fixed table), and zero matches.
  states[1].numbers = new Set(latest.numbers); states[1].strong = 5;
  states[2].numbers = new Set([2, 6]); states[2].strong = null;
  els.validate.events.click();
  assert.deepEqual(marked(states[0].numbersElement), []);
  assert.deepEqual(marked(states[0].strongElement), [5]);
  assert.deepEqual(marked(states[1].numbersElement), latest.numbers);
  assert.deepEqual(marked(states[1].strongElement), [5]);
  assert.deepEqual(marked(states[2].numbersElement), [2, 6]);
  assert.match(states[2].status.textContent, /טבלה חלקית/);
  assert.deepEqual(marked(states[3].numbersElement), []);
  assert.deepEqual(marked(states[3].strongElement), []);
  assert.match(states[3].status.textContent, /0\/6/);
  assert.match(els.message.textContent, /3979.*27\/10\/2026/);
  assert.match(els.message.textContent, /3 טבלאות/);
  // An edit invalidates all old results without changing the fixed table.
  picks(states[2]).find(b => Number(b.dataset.number) === 2).events.click();
  assert(states.every(s => marked(s.numbersElement).length === 0 && marked(s.strongElement).length === 0));
  for (const id of ['past-tab', 'new-tab', 'random', 'clear']) {
    els.validate.events.click();
    els[id].events.click();
    assert(states.every(s => marked(s.numbersElement).length === 0 && marked(s.strongElement).length === 0));
    assert.deepEqual([...states[0].numbers], [1, 8, 10, 12, 14, 24]);
    assert.equal(states[0].strong, 5);
  }
  // Replacing the latest result also removes stale marks.
  els.validate.events.click();
  form.setLatestDraw({...latest, id: '3980', date: '2026-10-31', strong: 1});
  assert.deepEqual(marked(states[0].strongElement), []);
  els.validate.events.click();
  assert.match(els.message.textContent, /3980/);
  assert.deepEqual(marked(states[0].strongElement), []);
  const failed = setup(false);
  await vm.runInContext(fs.readFileSync(path.join(root, 'draw-generator.js'), 'utf8'), failed.ctx);
  failed.els.validate.events.click();
  assert.match(failed.els.message.textContent, /לא ניתן לבדוק התאמות/);
  console.log('PASS: latest draw, full/partial/zero/strong-only matches, fixed table, edit/refill/tab/clear invalidation, missing data.');
})().catch(error => { console.error(error); process.exitCode = 1; });
