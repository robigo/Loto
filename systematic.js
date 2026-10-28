'use strict';

(function setupSystematic() {
  const size = document.getElementById('systematic-size');
  const numberGrid = document.getElementById('systematic-numbers');
  const strongGrid = document.getElementById('systematic-strong');
  const status = document.getElementById('systematic-status');
  const selection = document.getElementById('systematic-selection');
  const summary = document.getElementById('systematic-summary');
  const details = document.getElementById('systematic-details');
  const list = document.getElementById('systematic-combinations');
  const checkResult = document.getElementById('systematic-check-result');
  const selected = new Set();
  let strong = 5;
  const format = new Intl.NumberFormat('he-IL');

  function combinations(numbers) {
    const result = [];
    function choose(start, chosen) {
      if (chosen.length === 6) { result.push([...chosen]); return; }
      for (let i = start; i <= numbers.length - (6 - chosen.length); i++) {
        chosen.push(numbers[i]);
        choose(i + 1, chosen);
        chosen.pop();
      }
    }
    choose(0, []);
    return result;
  }

  function render(draw = null) {
    const target = Number(size.value);
    const numbers = [...selected].sort((a, b) => a - b);
    numberGrid.querySelectorAll('button').forEach(button => {
      const number = Number(button.dataset.number);
      const matched = Boolean(draw && selected.has(number) && draw.numbers.includes(number));
      button.setAttribute('aria-pressed', String(selected.has(number)));
      button.dataset.match = String(matched);
      button.setAttribute('aria-label', `מספר ${number}` + (matched ? ' · תואם להגרלה האחרונה' : ''));
    });
    strongGrid.querySelectorAll('button').forEach(button => {
      const number = Number(button.dataset.number);
      const matched = Boolean(draw && strong === number && draw.strong === number);
      button.setAttribute('aria-pressed', String(strong === number));
      button.dataset.match = String(matched);
      button.setAttribute('aria-label', `מספר חזק ${number}` + (matched ? ' · תואם להגרלה האחרונה' : ''));
    });
    selection.textContent = `המספרים שנבחרו: ${numbers.join(', ') || 'טרם נבחרו'} · חזק: ${strong === null ? 'לא נבחר' : strong}`;
    list.replaceChildren();
    details.hidden = true;
    summary.textContent = '';
    checkResult.textContent = '';
    if (numbers.length !== target || strong === null) {
      status.textContent = `נבחרו ${numbers.length} מתוך ${target} מספרים` +
        (strong === null ? '; יש לבחור מספר חזק.' : '.');
      return;
    }
    const rows = combinations(numbers);
    rows.forEach(row => {
      const item = document.createElement('li');
      item.textContent = `${row.join(', ')} · חזק: ${strong}`;
      if (draw) {
        const matches = row.filter(number => draw.numbers.includes(number)).length;
        item.textContent += ` · התאמות: ${matches}/6 · ` +
          (strong === draw.strong ? 'המספר החזק תואם ✓' : 'המספר החזק לא תואם');
      }
      list.appendChild(item);
    });
    status.textContent = `טופס שיטתי ${target} מלא.`;
    summary.textContent = `${format.format(rows.length)} צירופים שונים · עלות מחושבת ללוטו רגיל: ${format.format(rows.length * 3)} ₪, ללא Extra.`;
    details.hidden = false;
    if (draw) {
      const matches = numbers.filter(number => draw.numbers.includes(number)).length;
      checkResult.textContent = `נבדק מול הגרלה ${draw.id} מ־${draw.date.split('-').reverse().join('/')}: ` +
        `${matches} מתוך 6 המספרים שעלו נמצאים בבחירה שלך. ` +
        (strong === draw.strong ? 'המספר החזק תואם ✓. ' : 'המספר החזק לא תואם. ') +
        'התאמות מסומנות בירוק; פירוט לכל צירוף מוצג ברשימה. זו השוואת מספרים בלבד, לא אישור זכייה.';
    }
  }

  function makeNumber(number, isStrong) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.number = number;
    button.textContent = number;
    button.setAttribute('aria-label', `${isStrong ? 'מספר חזק' : 'מספר'} ${number}`);
    button.addEventListener('click', () => {
      if (isStrong) strong = strong === number ? null : number;
      else if (selected.has(number)) selected.delete(number);
      else {
        if (selected.size >= Number(size.value)) {
          status.textContent = `כבר נבחרו ${size.value} מספרים. בטל מספר כדי להחליפו.`;
          return;
        }
        selected.add(number);
      }
      render();
    });
    return button;
  }

  for (let number = 1; number <= 37; number++) numberGrid.appendChild(makeNumber(number, false));
  for (let number = 1; number <= 7; number++) strongGrid.appendChild(makeNumber(number, true));
  size.addEventListener('change', () => {
    const target = Number(size.value);
    if (selected.size > target) {
      // Keep the user's choices and ask which ones to remove.
      render();
      status.textContent = `נבחרו ${selected.size} מספרים. יש לבטל ${selected.size - target} מספרים כדי להשלים שיטתי ${target}.`;
      return;
    }
    render();
  });
  document.getElementById('systematic-fixed').addEventListener('click', () => {
    const fixed = window.lotoForm.getFixedDraw();
    selected.clear();
    fixed.numbers.forEach(number => selected.add(number));
    strong = fixed.strong;
    render();
  });
  document.getElementById('systematic-random').addEventListener('click', () => {
    const pool = Array.from({length: 37}, (_, i) => i + 1);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    selected.clear();
    pool.slice(0, Number(size.value)).forEach(number => selected.add(number));
    strong = Math.floor(Math.random() * 7) + 1;
    render();
  });
  document.getElementById('systematic-clear').addEventListener('click', () => {
    selected.clear();
    strong = null;
    render();
  });
  document.getElementById('systematic-validate').addEventListener('click', () => {
    if (selected.size !== Number(size.value) || strong === null) {
      render();
      status.textContent += ' יש להשלים את הטופס לפני בדיקת התאמות.';
      return;
    }
    const draw = window.lotoForm.getLatestDraw();
    if (!draw) {
      render();
      checkResult.textContent = 'לא ניתן לבדוק התאמות: תוצאת ההגרלה האחרונה עדיין לא נטענה. יש לרענן ולנסות שוב.';
      return;
    }
    render(draw);
  });
  window.lotoSystematic = {
    snapshot() {
      return {version: 1, size: Number(size.value), numbers: [...selected].sort((a, b) => a - b), strong};
    },
    restore(saved) {
      if (!saved || saved.version !== 1 || ![8, 9, 10, 11, 12].includes(saved.size) ||
        !Array.isArray(saved.numbers) || saved.numbers.length > 12 ||
        new Set(saved.numbers).size !== saved.numbers.length ||
        saved.numbers.some(n => !Number.isInteger(n) || n < 1 || n > 37) ||
        (saved.strong !== null && (!Number.isInteger(saved.strong) || saved.strong < 1 || saved.strong > 7))
      ) throw new Error('Invalid saved systematic ticket');
      size.value = String(saved.size);
      selected.clear();
      saved.numbers.forEach(n => selected.add(n));
      strong = saved.strong;
      render();
    },
    resetSaved() {
      selected.clear(); strong = 5; size.value = '8'; render();
    }
  };
  render();
})();

