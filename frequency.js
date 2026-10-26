'use strict';

(async function loadFrequency() {
  const status = document.getElementById('frequency-status');
  const period = document.getElementById('frequency-period');
  const results = document.getElementById('frequency-results');
  const format = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 2 });
  const displayDate = date => date.split('-').reverse().join('/');

  try {
    const response = await fetch('data/draws.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('Could not load draws');
    const draws = await response.json();
    if (!Array.isArray(draws) || draws.length < 2 || draws.some(draw =>
      !/^\d{4}-\d{2}-\d{2}$/.test(draw.date) ||
      !Array.isArray(draw.numbers) || draw.numbers.length !== 6 ||
      new Set(draw.numbers).size !== 6 ||
      draw.numbers.some(n => !Number.isInteger(n) || n < 1 || n > 37)
    )) throw new Error('Invalid draw data');
    draws.sort((a, b) => a.date.localeCompare(b.date));

    function renderFrequency() {
      const selected = period.value === 'all' ? draws : draws.slice(-Number(period.value));
      const stats = Array.from({ length: 37 }, (_, i) => ({ number: i + 1, positions: [] }));
      let overlap = 0;
      let sharedPairs = 0;
      selected.forEach((draw, index) => {
        draw.numbers.forEach(n => stats[n - 1].positions.push(index));
        if (index > 0) {
          const common = draw.numbers.filter(n => selected[index - 1].numbers.includes(n)).length;
          overlap += common;
          if (common > 0) sharedPairs++;
        }
      });
      stats.sort((a, b) => b.positions.length - a.positions.length || a.number - b.number);
      const rows = stats.map(({ number, positions }) => {
        const gap = positions.length > 1
          ? format.format((positions[positions.length - 1] - positions[0]) / (positions.length - 1))
          : 'אין מספיק הופעות';
        const tr = document.createElement('tr');
        [number, positions.length, format.format(100 * positions.length / selected.length) + '%', gap]
          .forEach((value, i) => {
            const cell = document.createElement(i === 0 ? 'th' : 'td');
            if (i === 0) cell.scope = 'row';
            cell.textContent = value;
            tr.appendChild(cell);
          });
        return tr;
      });
      document.getElementById('frequency-rows').replaceChildren(...rows);
      document.getElementById('frequency-count').textContent = format.format(selected.length);
      document.getElementById('frequency-overlap').textContent = format.format(overlap / (selected.length - 1));
      document.getElementById('frequency-shared').textContent = format.format(100 * sharedPairs / (selected.length - 1)) + '%';
      status.textContent = `נבדקו ${format.format(selected.length)} הגרלות, מ־${displayDate(selected[0].date)} עד ${displayDate(selected[selected.length - 1].date)}.`;
      results.hidden = false;
    }

    renderFrequency();
    period.addEventListener('change', renderFrequency);
  } catch (error) {
    results.hidden = true;
    status.textContent = 'לא ניתן לטעון את נתוני ההגרלות. יש לרענן את הדף ולנסות שוב.';
  }
})();

