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
  const historyKey = 'loto-winning-simulations-v1';
  function readHistory() {
    const data = JSON.parse(localStorage.getItem(historyKey) || '[]');
    return Array.isArray(data) ? data : [];
  }
  function renderHistory() {
    const list = document.getElementById('simulation-history-list');
    const status = document.getElementById('simulation-history-status');
    try {
      const items = readHistory();
      list.replaceChildren();
      items.slice().reverse().forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      });
      status.textContent = items.length ? 'הדמיות שמורות: ' + items.length : 'עדיין אין הדמיות שמורות עם זכייה מדומה.';
    } catch { status.textContent = 'לא ניתן לטעון את ההיסטוריה במכשיר זה.'; }
  }
  function saveHistory(kind, result, details, output) {
    if (!details.length) return;
    const entry = new Date().toLocaleString('he-IL') + ' · ' +
      (kind === 'regular' ? 'טופס רגיל' : 'טופס שיטתי') +
      ' · הגרלה מדומה: ' + result.numbers.join(', ') + ' · חזק: ' + result.strong +
      ' · ' + details.join(' | ');
    try {
      const items = readHistory();
      items.push(entry);
      localStorage.setItem(historyKey, JSON.stringify(items.slice(-500)));
      renderHistory();
    } catch { output.textContent += ' לא ניתן לשמור את ההדמיה בדפדפן.'; }
  }
  document.getElementById('simulation-history-clear').addEventListener('click', () => {
    try { localStorage.removeItem(historyKey); renderHistory(); }
    catch { document.getElementById('simulation-history-status').textContent = 'לא ניתן למחוק את ההיסטוריה.'; }
  });
  renderHistory();
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
        const winners = [];
        const lines = ticket.tables.map((t, i) => {
          if (t.numbers.length !== 6 || t.strong === null) return null;
          const count = t.numbers.filter(n => result.numbers.includes(n)).length;
          const strong = t.strong === result.strong;
          if (count >= 3) winners.push('טבלה ' + (i + 1) + ': ' + t.numbers.join(', ') + ' · חזק: ' + t.strong + ' · ' + count + (strong ? ' + חזק' : '') + ' תואמים');
          return 'טבלה ' + (i + 1) + ': ' + count + '/6' + (strong ? ' + חזק' : '') +
            (count >= 3 ? ' (דרגת פרס בהדמיה)' : '');
        }).filter(Boolean);
        output.textContent = lead + lines.join(' · ') + '. ההשוואה לפי הטופס ברגע הלחיצה.';
        saveHistory(kind, result, winners, output);
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
        saveHistory(kind, result, tiers.length ? ['מספרים שנבחרו: ' + ticket.numbers.join(', ') + ' · חזק: ' + ticket.strong + ' · ' + tiers.join(' · ')] : [], output);
      }
    } catch { output.textContent = 'לא ניתן להגריל כרגע. נסה שוב.'; }
  }
  document.getElementById('simulate-regular').addEventListener('click', () => show('regular'));
  document.getElementById('simulate-systematic').addEventListener('click', () => show('systematic'));
})();

