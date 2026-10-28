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

  function render() {
    const target = Number(size.value);
    const numbers = [...selected].sort((a, b) => a - b);
    numberGrid.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(selected.has(Number(button.dataset.number))));
    });
    strongGrid.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(strong === Number(button.dataset.number)));
    });
    selection.textContent = `המספרים שנבחרו: ${numbers.join(', ') || 'טרם נבחרו'} · חזק: ${strong === null ? 'לא נבחר' : strong}`;
    list.replaceChildren();
    details.hidden = true;
    summary.textContent = '';
    if (numbers.length !== target || strong === null) {
      status.textContent = `נבחרו ${numbers.length} מתוך ${target} מספרים` +
        (strong === null ? '; יש לבחור מספר חזק.' : '.');
      return;
    }
    const rows = combinations(numbers);
    rows.forEach(row => {
      const item = document.createElement('li');
      item.textContent = `${row.join(', ')} · חזק: ${strong}`;
      list.appendChild(item);
    });
    status.textContent = `טופס שיטתי ${target} מלא.`;
    summary.textContent = `${format.format(rows.length)} צירופים שונים · עלות מחושבת ללוטו רגיל: ${format.format(rows.length * 3)} ₪, ללא Extra.`;
    details.hidden = false;
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
  render();
})();
