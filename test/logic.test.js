// Line solver, clue generation, full line-solving, uniqueness counter and daily seed. Run: node test/logic.test.js
const assert = require('assert');
const L = require('../www/js/logic.js');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok -', name); } catch (e) { fail++; console.log('  FAIL -', name, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); } }
const allLines = n => { const o = []; for (let m = 0; m < 1 << n; m++) { const a = []; for (let i = 0; i < n; i++) a.push((m >> i) & 1); o.push(a); } return o; };

console.log('logic.test.js');
t('clueOf: runs, empty line, full line', () => {
  assert.deepStrictEqual(L.clueOf([1, 1, 0, 1, 0, 0, 1, 1, 1]), [2, 1, 3]);
  assert.deepStrictEqual(L.clueOf([0, 0, 0]), []);
  assert.deepStrictEqual(L.clueOf([1, 1, 1, 1]), [4]);
  assert.deepStrictEqual(L.clueOf([2, 1, 2, 1, 1]), [1, 2]); // crosses (2) count as empty
});
t('cluesOf: rows and columns of a 3x3 picture', () => {
  const c = L.cluesOf([1, 0, 1, 1, 1, 1, 0, 0, 1], 3, 3);
  assert.deepStrictEqual(c.rows, [[1, 1], [3], [1]]); assert.deepStrictEqual(c.cols, [[2], [1], [3]]);
});
t('solveLine: classic overlap cases', () => {
  assert.deepStrictEqual(L.solveLine([-1, -1, -1, -1, -1], [3]), [-1, -1, 1, -1, -1]);
  assert.deepStrictEqual(L.solveLine([-1, -1, -1, -1, -1], [5]), [1, 1, 1, 1, 1]);
  assert.deepStrictEqual(L.solveLine([-1, -1, -1, -1, -1], [2, 2]), [1, 1, 0, 1, 1]);
  assert.deepStrictEqual(L.solveLine([-1, -1, -1], []), [0, 0, 0]);
  assert.deepStrictEqual(L.solveLine([-1, 1, -1, -1, -1], [1, 1]), [0, 1, 0, -1, -1]);
  assert.strictEqual(L.solveLine([1, 1, 1], [2]), null); // contradiction
});
t('solveLine equals brute force on 20,000 random partial lines (n <= 11)', () => {
  const rng = L.makeRng(12345);
  for (let k = 0; k < 20000; k++) {
    const n = 1 + rng.int(11), sol = Array.from({ length: n }, () => rng.next() < 0.55 ? 1 : 0), clue = L.clueOf(sol);
    const cells = sol.map(v => rng.next() < 0.3 ? v : -1); if (rng.next() < 0.15) cells[rng.int(n)] = rng.int(2);
    const cons = allLines(n).filter(a => L.clueOf(a).join() === clue.join() && a.every((v, i) => cells[i] < 0 || cells[i] === v));
    const res = L.solveLine(cells, clue);
    if (!cons.length) { assert.strictEqual(res, null); continue; }
    const exp = cells.map((_, i) => cons.every(a => a[i] === 1) ? 1 : cons.every(a => a[i] === 0) ? 0 : -1);
    assert.deepStrictEqual(res, exp, JSON.stringify({ cells, clue }));
  }
});
function bruteCount(rows, cols, limit) {
  const h = rows.length, w = cols.length, cand = rows.map(cl => allLines(w).filter(a => L.clueOf(a).join() === cl.join()));
  let cnt = 0; const g = [];
  (function rec(r) { if (cnt >= limit) return; if (r === h) { for (let c = 0; c < w; c++) if (L.clueOf(g.map(x => x[c])).join() !== cols[c].join()) return; cnt++; return; } for (const a of cand[r]) { g[r] = a; rec(r + 1); } g.length = r; })(0);
  return cnt;
}
t('line-solvable => unique, and countSolutions agrees with an independent brute force (1,000 random grids)', () => {
  const rng = L.makeRng(777); let solvable = 0, multi = 0;
  for (let k = 0; k < 1000; k++) {
    const w = 3 + rng.int(4), h = 3 + rng.int(4), sol = Array.from({ length: w * h }, () => rng.next() < 0.55 ? 1 : 0), cl = L.cluesOf(sol, w, h);
    const b = bruteCount(cl.rows, cl.cols, 2), s = L.isLineSolvable(sol, w, h);
    if (s) { solvable++; assert.strictEqual(b, 1, 'line-solvable but not unique'); }
    if (b > 1) multi++;
    assert.strictEqual(L.countSolutions(cl.rows, cl.cols, 2), b);
  }
  assert.ok(solvable > 100 && multi > 20, 'sample covers both cases (' + solvable + ' solvable, ' + multi + ' multi)');
});
t('a known ambiguous picture (2x2 diagonal) is rejected', () => {
  assert.strictEqual(L.isLineSolvable([1, 0, 0, 1], 2, 2), false);
  const c = L.cluesOf([1, 0, 0, 1], 2, 2); assert.strictEqual(L.countSolutions(c.rows, c.cols, 5), 2);
});
t('lineSolve reports rounds and solves a picture from clues alone', () => {
  const sol = [0, 1, 0, 1, 1, 1, 0, 1, 0], c = L.cluesOf(sol, 3, 3), r = L.lineSolve(c.rows, c.cols);
  assert.ok(r.solved && r.rounds >= 1); assert.deepStrictEqual(r.grid, sol);
});
t('makeSolvable repairs an ambiguous image into a line-solvable one (deterministic)', () => {
  const rng = L.makeRng(3), img = [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1];
  assert.strictEqual(L.isLineSolvable(img, 4, 4), false);
  const a = L.makeSolvable(img, 4, 4, L.makeRng(9)), b = L.makeSolvable(img, 4, 4, L.makeRng(9));
  assert.ok(a && L.isLineSolvable(a.sol, 4, 4)); assert.deepStrictEqual(a.sol, b.sol);
});
t('daily puzzle: deterministic per date, line-solvable, size follows the weekday, differs day to day', () => {
  const seen = new Set();
  for (let k = 0; k < 60; k++) {
    const d = new Date(2026, 0, 1 + k), p = L.dailyPuzzle(d), q = L.dailyPuzzle(new Date(2026, 0, 1 + k, 18, 30));
    assert.ok(p, 'daily generated for ' + L.dateKey(d));
    assert.strictEqual(JSON.stringify(p), JSON.stringify(q), 'same puzzle all day');
    assert.strictEqual(p.key, L.dateKey(d)); assert.strictEqual(p.w, L.DAILY_SIZES[d.getDay()]);
    const parsed = L.parsePuzzle(p); assert.ok(L.isLineSolvable(parsed.sol, p.w, p.h), 'daily line-solvable ' + p.key);
    const fill = parsed.sol.reduce((a, b) => a + b, 0) / parsed.sol.length; assert.ok(fill > 0.25 && fill < 0.85);
    seen.add(p.rows.join(''));
  }
  assert.strictEqual(seen.size, 60, 'all 60 days different');
});
t('dateKey / hashString / makeRng basics', () => {
  assert.strictEqual(L.dateKey(new Date(2026, 8, 5)), '2026-09-05');
  assert.strictEqual(L.hashString('abc'), L.hashString('abc')); assert.notStrictEqual(L.hashString('abc'), L.hashString('abd'));
  const a = L.makeRng(1), b = L.makeRng(1); for (let i = 0; i < 5; i++) assert.strictEqual(a.next(), b.next());
});
t('formatTime and coins', () => {
  assert.strictEqual(L.formatTime(0), '0:00'); assert.strictEqual(L.formatTime(65000), '1:05'); assert.strictEqual(L.formatTime(3725000), '1:02:05');
  assert.strictEqual(L.coinsFor(5, 5), 5); assert.strictEqual(L.coinsFor(15, 15), 30); assert.strictEqual(L.coinsFor(20, 20), 50);
});
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
