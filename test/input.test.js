// Input rules: tap/drag targets, drag-a-line geometry, stroke application in mistake and free mode,
// clue grey-out status, win detection, hint line choice. Run: node test/input.test.js
const assert = require('assert');
const L = require('../www/js/logic.js');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok -', name); } catch (e) { fail++; console.log('  FAIL -', name, '\n   ', e.message); } }

console.log('input.test.js');
t('gestureTarget: fill mode fills blanks and clears fills; cross mode crosses blanks and clears crosses', () => {
  assert.strictEqual(L.gestureTarget('fill', 0), 1); assert.strictEqual(L.gestureTarget('fill', 1), 0); assert.strictEqual(L.gestureTarget('fill', 2), 0);
  assert.strictEqual(L.gestureTarget('cross', 0), 2); assert.strictEqual(L.gestureTarget('cross', 2), 0); assert.strictEqual(L.gestureTarget('cross', 1), 0);
});
t('applyTarget never overwrites the other mark; clearing only clears the gesture\'s own mark', () => {
  assert.strictEqual(L.applyTarget(2, 1, 'fill'), 2); assert.strictEqual(L.applyTarget(1, 2, 'cross'), 1);
  assert.strictEqual(L.applyTarget(1, 0, 'fill'), 0); assert.strictEqual(L.applyTarget(2, 0, 'fill'), 2);
  assert.strictEqual(L.applyTarget(2, 0, 'cross'), 0); assert.strictEqual(L.applyTarget(1, 0, 'cross'), 1);
});
t('dragLine locks to the dominant axis and includes both ends', () => {
  const w = 10;
  assert.deepStrictEqual(L.dragLine(12, 16, w), [12, 13, 14, 15, 16]);
  assert.deepStrictEqual(L.dragLine(16, 12, w), [16, 15, 14, 13, 12]);
  assert.deepStrictEqual(L.dragLine(12, 42, w), [12, 22, 32, 42]);
  assert.deepStrictEqual(L.dragLine(12, 43, w), [12, 22, 32, 42]);  // mostly vertical -> column of the start
  assert.deepStrictEqual(L.dragLine(12, 27, w), [12, 13, 14, 15, 16, 17]); // mostly horizontal -> row of the start
  assert.deepStrictEqual(L.dragLine(7, 7, w), [7]);
});
t('free mode stroke: fills a whole drag line, skips crossed cells, reports changes', () => {
  const s = [0, 2, 0, 0, 1]; const r = L.applyStroke(s, [0, 1, 2, 3, 4], 1, 'fill', null);
  assert.deepStrictEqual(s, [1, 2, 1, 1, 1]); assert.deepStrictEqual(r.changes, [[0, 0, 1], [2, 0, 1], [3, 0, 1]]); assert.strictEqual(r.mistake, -1);
});
t('mistake mode stroke: a wrong fill becomes a cross and stops the stroke', () => {
  const sol = [1, 1, 0, 1], s = [0, 0, 0, 0]; const r = L.applyStroke(s, [0, 1, 2, 3], 1, 'fill', sol);
  assert.deepStrictEqual(s, [1, 1, 2, 0]); assert.strictEqual(r.mistake, 2);
});
t('mistake mode stroke: a wrong cross becomes a fill', () => {
  const sol = [0, 1, 0], s = [0, 0, 0]; const r = L.applyStroke(s, [0, 1, 2], 2, 'cross', sol);
  assert.deepStrictEqual(s, [2, 1, 0]); assert.strictEqual(r.mistake, 1);
});
t('clearing a correct fill in mistake mode is not a mistake', () => {
  const s = [1, 1]; const r = L.applyStroke(s, [0, 1], 0, 'fill', [1, 1]); assert.deepStrictEqual(s, [0, 0]); assert.strictEqual(r.mistake, -1);
});
t('lineSatisfied: filled runs equal the clue (crosses/blanks are empty)', () => {
  assert.ok(L.lineSatisfied([1, 1, 0, 2, 1], [2, 1])); assert.ok(!L.lineSatisfied([1, 1, 1, 0, 1], [2, 1])); assert.ok(L.lineSatisfied([2, 0, 2], []));
});
t('clueStatus greys numbers anchored from each edge and all numbers when satisfied', () => {
  assert.deepStrictEqual(L.clueStatus([1, 1, 2, 0, 0, 0, 0, 0], [2, 1, 1]), [true, false, false]);
  assert.deepStrictEqual(L.clueStatus([0, 0, 0, 0, 0, 2, 1, 2], [2, 1, 1]), [false, false, true]);
  assert.deepStrictEqual(L.clueStatus([1, 1, 0, 1, 0, 1, 0, 0], [2, 1, 1]), [true, true, true]);
  assert.deepStrictEqual(L.clueStatus([1, 1, 1, 0, 0, 0, 0, 0], [2, 1, 1]), [false, false, false]); // run too long: not done
  assert.deepStrictEqual(L.clueStatus([1, 1, 0, 0, 0, 0, 0, 0], [2, 1, 1]), [false, false, false]); // run not closed by a cross
  assert.deepStrictEqual(L.clueStatus([0, 0, 0], []), []);
});
t('isWin compares filled cells only', () => {
  assert.ok(L.isWin([1, 2, 1, 0], [1, 0, 1, 0])); assert.ok(!L.isWin([1, 1, 1, 0], [1, 0, 1, 0]));
});
t('pickHintLine picks an unfinished line and returns null when the picture is done', () => {
  const sol = [1, 1, 0, 0, 1, 1, 1, 0, 1], w = 3, h = 3;
  const hint = L.pickHintLine([0, 0, 0, 0, 0, 0, 0, 0, 0], sol, w, h); assert.ok(hint && ['row', 'col'].includes(hint.type));
  assert.strictEqual(L.pickHintLine([1, 1, 2, 2, 1, 1, 1, 2, 1], sol, w, h), null);
  // wrong marks are prioritised
  const h2 = L.pickHintLine([1, 1, 2, 2, 1, 1, 1, 1, 1], sol, w, h); assert.ok((h2.type === 'row' && h2.index === 2) || (h2.type === 'col' && h2.index === 1));
});
t('parsePuzzle splits rows into solution and colour keys', () => {
  const p = L.parsePuzzle({ rows: ['r.', '.b'] }); assert.deepStrictEqual(p.sol, [1, 0, 0, 1]); assert.deepStrictEqual(p.colors, ['r', null, null, 'b']);
});
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
