// Private-build compatibility with existing version-1 saved forms.
// Runs after the regular form's inline script and after systematic.js.
(function () {
  function validate(row, max) {
    if (!row || !Array.isArray(row.numbers) || row.numbers.length > max ||
        new Set(row.numbers).size !== row.numbers.length ||
        row.numbers.some(n => !Number.isInteger(n) || n < 1 || n > 37) ||
        (row.strong !== null && (!Number.isInteger(row.strong) || row.strong < 1 || row.strong > 7))) {
      throw Error('Invalid saved form');
    }
  }
  window.lotoSavedFormEdited = false;
  const originalFill = window.lotoForm.fill;
  window.lotoForm.fill = function (...args) {
    if (!window.lotoSavedFormEdited) originalFill(...args);
  };
  const apply = (index, row) => {
    states[index].numbers = new Set(row.numbers);
    states[index].strong = row.strong;
    states[index].source = '';
  };
  Object.assign(window.lotoForm, {
    snapshot() { return {version: 1, tables: states.map(s => ({numbers: [...s.numbers].sort((a,b) => a-b), strong: s.strong}))}; },
    restore(value) {
      if (value?.version !== 1 || !Array.isArray(value.tables) || value.tables.length !== states.length) throw Error('Invalid saved form');
      value.tables.forEach(row => validate(row, 6));
      value.tables.forEach((row, i) => apply(i, row));
      window.lotoSavedFormEdited = true;
      resetComparison();
    },
    setPrivateFirst(row) {
      validate(row, 6);
      apply(0, row);
      resetComparison();
    },
    resetSaved() {
      states.forEach((s, i) => apply(i, {numbers: [], strong: null}));
      window.lotoSavedFormEdited = true;
      resetComparison();
    }
  });
  document.getElementById('random').addEventListener('click', () => { window.lotoSavedFormEdited = false; }, {capture: true});
  for (const id of ['tables', 'clear']) document.getElementById(id).addEventListener('click', () => { window.lotoSavedFormEdited = true; });
})();
