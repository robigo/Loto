const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const ctx = vm.createContext({window: {}});
vm.runInContext(fs.readFileSync(path.join(root, 'ticket-diversity.js'), 'utf8'), ctx);
const history = JSON.parse(fs.readFileSync(path.join(root, 'data/history.json'), 'utf8'));
const key = numbers => [...numbers].sort((a, b) => a - b).join(',');
const historicalKeys = new Set(history.map(d => key(d.numbers)));
const eligible = history.filter(d => d.numbers.every(n => n <= 37) && d.strong >= 1 && d.strong <= 7);
const fixed = {numbers: [1, 8, 10, 12, 14, 23], strong: 5};
const rng = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const overlap = draws => draws.reduce((sum, d, i) => sum + draws.slice(i + 1).reduce((subtotal, other) => {
  const common = d.numbers.filter(n => other.numbers.includes(n)).length;
  return subtotal + common * (common - 1);
}, 0), 0);
const before = JSON.stringify({history, fixed});
let spreadOverlap = 0, randomOverlap = 0, minimumCoverage = 37;
for (const mode of ['past', 'new']) for (let seed = 1; seed <= 20; seed++) {
  const result = ctx.window.lotoDiversity.generate({history: eligible, historicalKeys, count: 13, fixed, mode, random: rng(seed)});
  const all = [fixed, ...result.draws];
  assert.equal(all.length, 14);
  assert.equal(new Set(all.map(d => key(d.numbers))).size, 14);
  assert.equal(result.covered, new Set(all.flatMap(d => d.numbers)).size);
  for (const d of result.draws) {
    assert.equal(new Set(d.numbers).size, 6);
    assert(d.numbers.every(n => Number.isInteger(n) && n >= 1 && n <= 37));
    assert(d.strong >= 1 && d.strong <= 7);
    if (mode === 'past') assert(eligible.some(old => key(old.numbers) === key(d.numbers) && old.strong === d.strong));
    else assert(!historicalKeys.has(key(d.numbers)));
  }
  if (mode === 'new') {
    const counts = Array(8).fill(0); all.forEach(d => counts[d.strong]++);
    assert(counts.slice(1).every(c => c === 2));
    minimumCoverage = Math.min(minimumCoverage, result.covered);
  } else {
    const random = rng(seed);
    spreadOverlap += overlap(all);
    randomOverlap += overlap([fixed, ...Array.from({length: 13}, () => eligible[Math.floor(random() * eligible.length)])]);
  }
}
assert(spreadOverlap < randomOverlap);
assert(minimumCoverage >= 35);
assert.equal(JSON.stringify({history, fixed}), before);
assert.throws(() => ctx.window.lotoDiversity.generate({history: [fixed], historicalKeys, count: 13, fixed, mode: 'past'}));
console.log(JSON.stringify({passed: true, runs: 40, spreadOverlap, randomOverlap, minimumNewCoverage: minimumCoverage, strongCounts: '2 each including fixed'}));

