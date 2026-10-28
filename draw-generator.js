'use strict';

(async function setupDrawGenerator() {
  const tabs = [...document.querySelectorAll('.draw-tabs [role="tab"]')];
  const status = document.getElementById('generator-status');
  const fillButton = document.getElementById('random');
  const ticket = document.getElementById('ticket-panel');
  const analysis = document.getElementById('analysis-panel');
  const systematic = document.getElementById('systematic-panel');
  const returnButton = document.getElementById('return-regular');
  let activeMode = 'past';
  let fillTicket;

  function selectTab(selected, refill = true) {
    tabs.forEach(tab => {
      const active = tab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    const isAnalysis = selected.id === 'analysis-tab';
    const isSystematic = selected.id === 'systematic-tab';
    ticket.hidden = isAnalysis || isSystematic;
    analysis.hidden = !isAnalysis;
    systematic.hidden = !isSystematic;
    status.hidden = isAnalysis || isSystematic;
    returnButton.hidden = !isAnalysis && !isSystematic;
    if (!isAnalysis && !isSystematic) {
      activeMode = selected.id === 'past-tab' ? 'past' : 'new';
      ticket.setAttribute('aria-labelledby', selected.id);
      document.getElementById('mode-description').textContent = activeMode === 'past'
        ? 'טבלאות 2–14 מתמלאות מהגרלות עבר ללא צירופים כפולים ובניסיון לצמצם חפיפה, עם המספר החזק המקורי. אפשר לשנות ידנית או להגריל שוב.'
        : 'טבלאות 2–14 מתמלאות בצירופים שונים שלא נמצאו בכל ההגרלות בקובץ, ובפיזור מספרים חזקים. אפשר לשנות ידנית או להגריל שוב.';
      if (fillTicket && refill) fillTicket();
    }
  }
  returnButton.addEventListener('click', () => {
    const tab = document.getElementById(activeMode === 'past' ? 'past-tab' : 'new-tab');
    selectTab(tab, false);
    tab.focus();
  });
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
  window.lotoNavigation = {
    showSaved(kind) {
      const id = kind === 'systematic' ? 'systematic-tab' : (activeMode === 'past' ? 'past-tab' : 'new-tab');
      selectTab(document.getElementById(id), false);
    }
  };
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
    window.lotoForm.setLatestDraw(latest);
    document.getElementById('latest-draw').textContent =
      `ההגרלה האחרונה במאגר: ${latest.id} · ${latest.date.split('-').reverse().join('/')} · מספרים: ${[...latest.numbers].sort((a, b) => a - b).join(', ')} · חזק: ${latest.strong}`;

    fillTicket = () => {
      try {
        const result = window.lotoDiversity.generate({
          history: eligible, historicalKeys, count: window.lotoForm.count,
          fixed: window.lotoForm.getFixedDraw(), mode: activeMode
        });
        window.lotoForm.fill(result.draws, activeMode === 'past'
          ? 'מולאו 13 טבלאות שונות מהגרלות עבר, עם המספר החזק המקורי ובפיזור בין הטבלאות.'
          : 'מולאו 13 טבלאות שונות שלא נמצאו בהיסטוריה, בפיזור מספרים ומספרים חזקים.');
        status.textContent = `במילוי האחרון של 14 הטבלאות: ${result.covered} מתוך 37 מספרים. חפיפה מרבית בין שתי טבלאות: ${result.maxOverlap} מספרים. ההשוואה מבוססת על ${history.length.toLocaleString('he-IL')} הגרלות. אין בכך חיזוי תוצאות.`;
      } catch (error) {
        status.textContent = 'לא ניתן להשלים את ההגרלה. הטופס הקודם נשמר; נסו להגריל שוב.';
      }
    };
    fillButton.addEventListener('click', () => fillTicket());
    fillButton.disabled = false;
    status.textContent = `נטענו ${history.length.toLocaleString('he-IL')} הגרלות.`;
    selectTab(tabs.find(tab => tab.getAttribute('aria-selected') === 'true'), !window.lotoForm.hasRestoredTicket);
  } catch (error) {
    document.getElementById('latest-draw').textContent = 'לא ניתן לטעון את תוצאת ההגרלה האחרונה במאגר.';
    status.textContent = 'לא ניתן לטעון את ההיסטוריה. המילוי האוטומטי מושבת; אפשר למלא ידנית או לרענן ולנסות שוב.';
  }
})();



