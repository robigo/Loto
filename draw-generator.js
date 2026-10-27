'use strict';

(async function setupDrawGenerator() {
  const tabs = [...document.querySelectorAll('.draw-tabs [role="tab"]')];
  const status = document.getElementById('generator-status');
  const fillButton = document.getElementById('random');
  const ticket = document.getElementById('ticket-panel');
  const analysis = document.getElementById('analysis-panel');
  let activeMode = 'past';
  let fillTicket;

  function selectTab(selected) {
    tabs.forEach(tab => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    const isAnalysis = selected.id === 'analysis-tab';
    ticket.hidden = isAnalysis;
    analysis.hidden = !isAnalysis;
    if (!isAnalysis) {
      activeMode = selected.id === 'past-tab' ? 'past' : 'new';
      ticket.setAttribute('aria-labelledby', selected.id);
      document.getElementById('mode-description').textContent = activeMode === 'past'
        ? 'טבלאות 2–14 מתמלאות אקראית מהגרלות עבר, עם המספר החזק המקורי. אפשר לשנות ידנית או להגריל שוב.'
        : 'טבלאות 2–14 מתמלאות בצירופים שונים שלא נמצאו בכל ההגרלות בקובץ, עם מספר חזק אקראי. אפשר לשנות ידנית או להגריל שוב.';
      if (fillTicket) fillTicket();
    }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowLeft') target = tabs[(index + 1) % tabs.length];
      else if (event.key === 'ArrowRight') target = tabs[(index + tabs.length - 1) % tabs.length];
      else if (event.key === 'Home') target = tabs[0];
      else if (event.key === 'End') target = tabs[tabs.length - 1];
      if (target) { event.preventDefault(); selectTab(target); target.focus(); }
    });
  });
  const key = numbers => [...numbers].sort((a, b) => a - b).join(',');
  try {
    const response = await fetch('data/history.json', {cache: 'no-store'});
    if (!response.ok) throw new Error('History unavailable');
    const history = await response.json();
    if (!Array.isArray(history) || history.length === 0 || history.some(draw =>
      typeof draw.id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(draw.date) ||
      !Array.isArray(draw.numbers) || draw.numbers.length !== 6 ||
      new Set(draw.numbers).size !== 6 || !Number.isInteger(draw.strong) ||
      draw.numbers.some(n => !Number.isInteger(n) || n < 1 || n > 49)
    )) throw new Error('Invalid history');
    const historicalKeys = new Set(history.map(draw => key(draw.numbers)));
    const eligible = history.filter(draw => draw.numbers.every(n => n <= 37) && draw.strong >= 1 && draw.strong <= 7);
    if (eligible.length === 0) throw new Error('No eligible draws');
    const latest = eligible.reduce((a, b) => a.date > b.date ? a : b);
    document.getElementById('latest-draw').textContent =
      `ההגרלה האחרונה במאגר: ${latest.id} · ${latest.date.split('-').reverse().join('/')} · מספרים: ${[...latest.numbers].sort((a, b) => a - b).join(', ')} · חזק: ${latest.strong}`;

    fillTicket = () => {
      try {
        const chosen = [];
        const used = new Set();
        for (let table = 0; table < window.lotoForm.count; table++) {
          if (activeMode === 'past') {
            const draw = eligible[Math.floor(Math.random() * eligible.length)];
            chosen.push({numbers: draw.numbers, strong: draw.strong,
              source: `הגרלה ${draw.id}, ${draw.date.split('-').reverse().join('/')}`});
          } else {
            let found = false;
            for (let attempt = 0; attempt < 1000; attempt++) {
              const pool = Array.from({ length: 37 }, (_, i) => i + 1);
              for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
              }
              const numbers = pool.slice(0, 6);
              const candidate = key(numbers);
              if (!historicalKeys.has(candidate) && !used.has(candidate)) {
                used.add(candidate);
                chosen.push({numbers, strong: Math.floor(Math.random() * 7) + 1,
                  source: 'הצירוף לא נמצא בקובץ ההיסטורי'});
                found = true;
                break;
              }
            }
            if (!found) throw new Error('No new combination found');
          }
        }
        window.lotoForm.fill(chosen, activeMode === 'past'
          ? 'מולאו 13 טבלאות מהגרלות עבר, עם המספר החזק המקורי.'
          : 'מולאו 13 טבלאות בצירופים שלא נמצאו בהיסטוריה, עם מספר חזק אקראי.');
        status.textContent = `הטופס מולא. ההשוואה מבוססת על ${history.length.toLocaleString('he-IL')} הגרלות בקובץ.`;
      } catch (error) {
        status.textContent = 'לא ניתן להשלים את ההגרלה. הטופס הקודם נשמר; נסו להגריל שוב.';
      }
    };
    fillButton.addEventListener('click', () => fillTicket());
    fillButton.disabled = false;
    status.textContent = `נטענו ${history.length.toLocaleString('he-IL')} הגרלות.`;
    selectTab(tabs.find(tab => tab.getAttribute('aria-selected') === 'true'));
  } catch (error) {
    document.getElementById('latest-draw').textContent = 'לא ניתן לטעון את תוצאת ההגרלה האחרונה במאגר.';
    status.textContent = 'לא ניתן לטעון את ההיסטוריה. המילוי האוטומטי מושבת; אפשר למלא ידנית או לרענן ולנסות שוב.';
  }
})();


