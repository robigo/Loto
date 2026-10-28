const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
class Element {
  constructor(tag = 'div') { this.tag = tag; this.children = []; this.dataset = {}; this.attrs = {}; this.events = {}; this.value = '8'; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { this.children.push(c); }
  append(...c) { this.children.push(...c); }
  replaceChildren(...c) { this.children = c; }
  addEventListener(k, f) { this.events[k] = f; }
  querySelectorAll(tag) { return this.children.flatMap(c => [...(c.tag === tag ? [c] : []), ...c.querySelectorAll(tag)]); }
  focus() {}
}
function page() {
  const html = read('index.html');
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size);
  const elements = Object.fromEntries(ids.map(id => { const e = new Element(); e.id = id; return [id, e]; }));
  const tabs = ['past-tab', 'new-tab', 'analysis-tab', 'systematic-tab'].map(id => elements[id]);
  tabs[0].setAttribute('aria-selected', 'true');
  let finishHistory;
  const history = new Promise(resolve => { finishHistory = resolve; });
  const ctx = vm.createContext({window: {}, document: {
    getElementById: id => elements[id], createElement: tag => new Element(tag), querySelectorAll: () => tabs
  }, fetch: () => history});
  vm.runInContext(read('ticket-diversity.js'), ctx);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], ctx);
  vm.runInContext(read('systematic.js'), ctx);
  return {ctx, elements, finishHistory, form: ctx.window.lotoForm, systematic: ctx.window.lotoSystematic};
}
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
(async () => {
  const p = page();
  assert.equal(p.form.snapshot().tables[0].numbers.length, 0);
  p.form.setPrivateFirst({numbers: [1, 8, 10, 12, 14, 23], strong: 5});
  const regular = plain(p.form.snapshot());
  regular.tables[1] = {numbers: [2, 6, 7, 13, 22, 35], strong: 5};
  p.form.restore(regular);
  assert.deepEqual(plain(p.form.snapshot()), regular);
  // Bad payloads cannot partly mutate the screen or change the locked first row.
  for (const mutate of [s => { s.tables[0].strong = 1; }, s => { s.tables[5].numbers = [99]; }, s => { s.tables[2].numbers = [2, 2]; }]) {
    const bad = structuredClone(regular); mutate(bad);
    assert.throws(() => p.form.restore(bad));
    assert.deepEqual(plain(p.form.snapshot()), regular);
  }
  const systematic = {version: 1, size: 8, numbers: [1, 2, 3, 4, 5, 6, 7, 8], strong: 5};
  p.systematic.restore(systematic);
  assert.deepEqual(plain(p.systematic.snapshot()), systematic);
  assert.equal(p.elements['systematic-combinations'].children.length, 28);
  assert.throws(() => p.systematic.restore({...systematic, strong: 8}));
  assert.deepEqual(plain(p.systematic.snapshot()), systematic);
  // A late history request must not regenerate a restored form.
  const setup = vm.runInContext(read('draw-generator.js'), p.ctx);
  p.finishHistory({ok: true, json: async () => [{id: '3979', date: '2026-10-27', numbers: [2, 6, 7, 13, 22, 35], strong: 5}]});
  await setup;
  p.ctx.window.lotoNavigation.showSaved('systematic');
  assert.equal(p.elements['systematic-panel'].hidden, false);
  p.ctx.window.lotoNavigation.showSaved('regular');
  assert.deepEqual(plain(p.form.snapshot()), regular);
  p.form.resetSaved(); p.systematic.resetSaved();
  assert.deepEqual(plain(p.form.snapshot()).tables[0], {numbers: [], strong: null});
  assert.equal(p.form.getFixedDraw().numbers.length, 0);
  assert(p.form.snapshot().tables.slice(1).every(row => row.numbers.length === 0 && row.strong === null));

  const {createAccountStore} = await import('data:text/javascript;base64,' + Buffer.from(read('account-core.js')).toString('base64'));
  let user = {id: 'user-a', email: 'a@example.test'}, change, fail = false, getGate, loadGate;
  const calls = [];
  const client = {auth: {
    onAuthStateChange(fn) { change = fn; },
    async getUser() { return getGate ? getGate.promise : {data: {user}, error: null}; },
    async signInWithOAuth(options) { calls.push(['oauth', options]); return {error: fail ? Error('denied') : null}; },
    async signOut(options) { calls.push(['logout', options]); change('SIGNED_OUT', null); return {error: null}; }
  }, from(table) {
    assert.equal(table, 'loto_saved_forms');
    return {
      async upsert(row) { calls.push(['save', row]); return {error: fail ? Error('offline') : null}; },
      select(columns) { calls.push(['columns', columns]); return this; },
      eq(column, value) { calls.push(['filter', column, value]); return this; },
      async maybeSingle() { return loadGate ? loadGate.promise : {data: {payload: regular, updated_at: '2026-10-28T00:00:00Z'}, error: null}; }
    };
  }};
  const labels = [];
  const store = createAccountStore(client, u => labels.push(u?.id || null));
  await store.init();
  assert.equal(labels.at(-1), 'user-a');
  await store.signIn('https://robigo.github.io/Loto/');
  assert.deepEqual(calls.find(c => c[0] === 'oauth')[1], {provider: 'google', options: {redirectTo: 'https://robigo.github.io/Loto/'}});
  await store.save('regular', regular);
  assert.equal(calls.find(c => c[0] === 'save')[1].user_id, 'user-a');
  assert.deepEqual((await store.load('regular')).payload, regular);
  assert(calls.some(c => c[0] === 'filter' && c[1] === 'user_id' && c[2] === 'user-a'));
  fail = true;
  await assert.rejects(store.save('systematic', systematic), /offline/);
  await assert.rejects(store.signIn('https://robigo.github.io/Loto/'), /denied/);
  fail = false;
  await assert.rejects(store.load('forged-kind'), /INVALID_KIND/);
  // Account switches invalidate both a pending authenticated request and a late response.
  loadGate = deferred();
  const loading = store.load('regular');
  await new Promise(setImmediate);
  user = {id: 'user-b'}; change('SIGNED_IN', {user});
  loadGate.resolve({data: {payload: regular}, error: null});
  await assert.rejects(loading, /SESSION_CHANGED/);
  loadGate = null;
  getGate = deferred();
  const pendingSave = store.save('regular', regular);
  await store.signOut();
  getGate.resolve({data: {user: {id: 'user-b'}}, error: null});
  await assert.rejects(pendingSave, /SESSION_CHANGED/);
  assert.equal(labels.at(-1), null);
  getGate = null; user = null;
  await assert.rejects(store.save('regular', regular), /SESSION_CHANGED/);

  // An unconfigured deployment must not download an SDK or enable fake login.
  const guest = page();
  const noImports = read('account.js').replace(/^import .*;\n/gm, '');
  guest.ctx.accountConfig = {supabaseUrl: '', publishableKey: ''};
  vm.runInContext('(function () {\n' + noImports + '\n})();', guest.ctx);
  assert.match(guest.elements['account-status'].textContent, /עדיין אינה פעילה/);
  console.log('PASS: snapshots, malformed data, fixed row, delayed history, navigation, Google redirect, ownership filters, failures, account-switch races, logout, guest mode.');
})().catch(error => { console.error(error); process.exitCode = 1; });

