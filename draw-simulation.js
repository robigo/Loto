'use strict';
(function () {
  function randomBelow(limit) {
    const bound = Math.floor(0x100000000 / limit) * limit;
    const buffer = new Uint32Array(1);
    do { crypto.getRandomValues(buffer); } while (buffer[0] >= bound);
    return buffer[0] % limit;
  }
  function draw() {
    const pool = Array.from({length: 37}, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = randomBelow(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return {numbers: pool.slice(0, 6).sort((a, b) => a - b), strong: randomBelow(7) + 1};
  }
  function choose(n, k) {
    if (k < 0 || n < k) return 0;
    let value = 1;
    for (let i = 1; i <= k; i++) value = value * (n - i + 1) / i;
    return Math.round(value);
  }
  function show(kind) {
    const output = document.getElementById('simulation-' + kind + '-result');
    const ticket = kind === 'regular' ? window.lotoForm.snapshot() : window.lotoSystematic.snapshot();
    const valid = kind === 'regular'
      ? ticket.tables.some(t => t.numbers.length === 6 && t.strong !== null)
      : ticket.numbers.length === ticket.size && ticket.strong !== null;
    if (!valid) { output.textContent = 'יש למלא לפחות טבלה מלאה לפני ההדמיה.'; return; }
    try {
      const result = draw();
      const lead = 'הדמיה בלבד — לא תוצאת לוטו אמיתית. מספרים: ' +
        result.numbers.join(', ') + ' · חזק: ' + result.strong + '. ';
      if (kind === 'regular') {
        const lines = ticket.tables.map((t, i) => {
          if (t.numbers.length !== 6 || t.strong === null) return null;
          const count = t.numbers.filter(n => result.numbers.includes(n)).length;
          const strong = t.strong === result.strong;
          return 'טבלה ' + (i + 1) + ': ' + count + '/6' + (strong ? ' + חזק' : '') +
            (count >= 3 ? ' (דרגת פרס בהדמיה)' : '');
        }).filter(Boolean);
        output.textContent = lead + lines.join(' · ') + '. ההשוואה לפי הטופס ברגע הלחיצה.';
      } else {
        const matches = ticket.numbers.filter(n => result.numbers.includes(n)).length;
        const strong = ticket.strong === result.strong;
        const tiers = [];
        for (let n = 6; n >= 3; n--) {
          const count = choose(matches, n) * choose(ticket.size - matches, 6 - n);
          if (count) tiers.push(count + ' צירופים עם ' + n + (strong ? ' + חזק' : ''));
        }
        output.textContent = lead + matches + ' מספרים תואמים' + (strong ? ' וגם חזק' : '') + '. ' +
          (tiers.length ? 'דרגות פרס בהדמיה: ' + tiers.join(' · ') + '. ' : 'אין צירופים בדרגת פרס בהדמיה. ') +
          'ההשוואה לפי הטופס ברגע הלחיצה.';
      }
    } catch { output.textContent = 'לא ניתן להגריל כרגע. נסה שוב.'; }
  }
  document.getElementById('simulate-regular').addEventListener('click', () => show('regular'));
  document.getElementById('simulate-systematic').addEventListener('click', () => show('systematic'));
})();
