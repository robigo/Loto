'use strict';

// Greedy diversity heuristic, not a prediction or a global optimum.
window.lotoDiversity = {
  generate({history, historicalKeys, count, fixed, mode, random = Math.random}) {
    const key = numbers => [...numbers].sort((a, b) => a - b).join(',');
    const shuffle = values => {
      const result = [...values];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    };
    const selected = [fixed];
    const used = new Set([key(fixed.numbers)]);
    const usage = Array(38).fill(0);
    const strongUsage = Array(8).fill(0);
    const record = draw => {
      draw.numbers.forEach(n => usage[n]++);
      if (Number.isInteger(draw.strong) && draw.strong >= 1 && draw.strong <= 7) strongUsage[draw.strong]++;
    };
    record(fixed);
    const score = draw =>
      draw.numbers.reduce((sum, n) => sum + 8 * usage[n], 0) +
      selected.reduce((sum, prior) => {
        const common = draw.numbers.filter(n => prior.numbers.includes(n)).length;
        return sum + common * (common - 1);
      }, 0) + strongUsage[draw.strong] / 4;
    const chosen = [];
    for (let table = 0; table < count; table++) {
      let candidates;
      if (mode === 'past') {
        candidates = shuffle(history.filter(draw => !used.has(key(draw.numbers)))).slice(0, 128);
      } else {
        const lowest = Math.min(...strongUsage.slice(1));
        const strong = shuffle(Array.from({length: 7}, (_, i) => i + 1)
          .filter(n => strongUsage[n] === lowest))[0];
        candidates = [];
        const seen = new Set();
        for (let attempt = 0; attempt < 1000 && candidates.length < 128; attempt++) {
          const numbers = shuffle(Array.from({length: 37}, (_, i) => i + 1)).slice(0, 6);
          const candidateKey = key(numbers);
          if (historicalKeys.has(candidateKey) || used.has(candidateKey) || seen.has(candidateKey)) continue;
          seen.add(candidateKey);
          candidates.push({numbers, strong});
        }
      }
      if (candidates.length === 0) throw new Error('Not enough distinct combinations');
      const best = candidates.reduce((a, b) => score(a) <= score(b) ? a : b);
      const draw = {
        numbers: [...best.numbers], strong: best.strong,
        source: mode === 'past'
          ? `הגרלה ${best.id}, ${best.date.split('-').reverse().join('/')}`
          : 'הצירוף לא נמצא בקובץ ההיסטורי'
      };
      used.add(key(draw.numbers));
      chosen.push(draw);
      selected.push(draw);
      record(draw);
    }
    let maxOverlap = 0;
    selected.forEach((draw, i) => selected.slice(i + 1).forEach(other => {
      maxOverlap = Math.max(maxOverlap, draw.numbers.filter(n => other.numbers.includes(n)).length);
    }));
    return {draws: chosen, covered: usage.filter(n => n > 0).length, maxOverlap};
  }
};

