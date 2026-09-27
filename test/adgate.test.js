// Unit tests for the interstitial frequency rules. Run: node test/adgate.test.js
const assert = require('assert');
const AdGate = require('../www/js/adgate.js');
// load the shipped browser config (it assigns window.ADS_CONFIG)
const vm = require('vm'); const sandbox = { window: {} };
vm.runInNewContext(require('fs').readFileSync(__dirname + '/../www/js/ads-config.js', 'utf8'), sandbox);
const CFG = sandbox.window.ADS_CONFIG;
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ok -', name); } catch (e) { fail++; console.log('  FAIL -', name, '\n   ', e.message); } }
const MIN = 60000;
const fresh = () => AdGate.create(CFG, {});

console.log('adgate.test.js');
t('shipped config: 5 puzzles, 3 min, every 3 puzzles, 90 s', () => {
  assert.strictEqual(CFG.INTERSTITIAL_MIN_PUZZLES, 5); assert.strictEqual(CFG.INTERSTITIAL_MIN_PLAY_MS, 3 * MIN);
  assert.strictEqual(CFG.INTERSTITIAL_EVERY_N_PUZZLES, 3); assert.strictEqual(CFG.INTERSTITIAL_MIN_INTERVAL_MS, 90000);
});
t('never on a fresh install (launch)', () => assert.strictEqual(fresh().canShow(Date.now()), false));
t('not before 5 solved puzzles even with lots of play time', () => {
  const g = fresh(); g.addPlayTime(30000); for (let i = 0; i < 40; i++) g.addPlayTime(30000);
  for (let i = 0; i < 4; i++) { g.puzzleCompleted(); assert.strictEqual(g.canShow(1e12), false, 'puzzle ' + (i + 1)); }
  g.puzzleCompleted(); assert.strictEqual(g.canShow(1e12), true);
});
t('not before 3 minutes of play even after many puzzles', () => {
  const g = fresh(); for (let i = 0; i < 10; i++) g.puzzleCompleted();
  for (let s = 0; s < 179; s++) g.addPlayTime(1000);
  assert.strictEqual(g.canShow(1e12), false);
  g.addPlayTime(1000); assert.strictEqual(g.canShow(1e12), true);
});
t('play-time ignores bogus deltas (negative / huge)', () => { const g = fresh(); g.addPlayTime(-5); g.addPlayTime(10 * MIN); assert.strictEqual(g.state.playMs, 0); });
function eligible() { const g = fresh(); for (let i = 0; i < 5; i++) g.puzzleCompleted(); for (let i = 0; i < 180; i++) g.addPlayTime(1000); return g; }
t('after one ad: needs 3 more solved puzzles', () => {
  const g = eligible(); let now = 1e9;
  assert.ok(g.canShow(now)); g.shown(now);
  now += 10 * MIN;
  g.puzzleCompleted(); assert.strictEqual(g.canShow(now), false);
  g.puzzleCompleted(); assert.strictEqual(g.canShow(now), false);
  g.puzzleCompleted(); assert.strictEqual(g.canShow(now), true);
});
t('at most one per 90 s even if puzzles are quick', () => {
  const g = eligible(); let now = 1e9; g.shown(now);
  for (let i = 0; i < 6; i++) g.puzzleCompleted();
  assert.strictEqual(g.canShow(now + 30000), false); assert.strictEqual(g.canShow(now + 89999), false); assert.strictEqual(g.canShow(now + 90000), true);
});
t('an unfinished puzzle does not count toward the 3', () => {
  const g = eligible(); const now = 1e9; g.shown(now);
  // restart transitions only ask canShow; they do not call puzzleCompleted
  for (let i = 0; i < 10; i++) assert.strictEqual(g.canShow(now + 10 * MIN), false);
});
t('clock moving backwards resets the interval instead of blocking forever', () => {
  const g = eligible(); g.shown(2e9); for (let i = 0; i < 3; i++) g.puzzleCompleted();
  assert.strictEqual(g.canShow(1e9), false); assert.strictEqual(g.canShow(1e9 + 90000), true);
});
t('state persists through JSON round trip', () => {
  const g = eligible(); g.shown(1e9); g.puzzleCompleted();
  const g2 = AdGate.create(CFG, JSON.parse(JSON.stringify(g.state)));
  assert.strictEqual(g2.state.puzzlesCompleted, 6); assert.strictEqual(g2.state.puzzlesSince, 1); assert.strictEqual(g2.state.playMs, 180000);
  g2.puzzleCompleted(); g2.puzzleCompleted(); assert.strictEqual(g2.canShow(1e9 + 90000), true);
});
t('simulated session: ads only on qualifying transitions', () => {
  const g = fresh(); let now = 1e9, shown = [];
  for (let puzzle = 1; puzzle <= 30; puzzle++) {
    for (let s = 0; s < 40; s++) { g.addPlayTime(1000); now += 1000; } // 40 s per puzzle
    g.puzzleCompleted();
    if (g.canShow(now)) { g.shown(now); shown.push({ puzzle, now }); }
  }
  assert.ok(shown.length > 0); assert.ok(shown[0].puzzle >= 5);
  assert.ok(shown[0].now - 1e9 >= 3 * MIN);
  for (let i = 1; i < shown.length; i++) { assert.ok(shown[i].puzzle - shown[i - 1].puzzle >= 3); assert.ok(shown[i].now - shown[i - 1].now >= 90000); }
});
t('game.js asks for an interstitial in exactly one place: leaving the puzzle-complete screen', () => {
  const fs = require('fs'); const game = fs.readFileSync(__dirname + '/../www/js/game.js', 'utf8');
  const calls = game.match(/maybeInterstitial\(/g) || []; assert.strictEqual(calls.length, 1);
  const i = game.indexOf('maybeInterstitial('); const fn = game.lastIndexOf('function ', i); assert.ok(/function leaveComplete/.test(game.slice(fn, fn + 40)));
  assert.ok(!/showInterstitial/.test(game), 'no direct interstitial calls');
  // leaveComplete is only wired to the two buttons of the complete overlay
  const uses = game.match(/leaveComplete\(/g) || []; assert.strictEqual(uses.length, 3);
  assert.ok(/btn-c-next'\)\.addEventListener\('click', function \(\) \{ sfx\('click'\); leaveComplete\('next'\)/.test(game));
  assert.ok(/btn-c-home'\)\.addEventListener\('click', function \(\) \{ sfx\('click'\); leaveComplete\('home'\)/.test(game));
  // the back button / history handler never calls it
  const pop = game.slice(game.indexOf("addEventListener('popstate'"), game.indexOf("addEventListener('popstate'") + 400); assert.ok(!/leaveComplete|maybeInterstitial/.test(pop));
});
t('rewarded ads only from the Hint and Extra-life buttons', () => {
  const game = require('fs').readFileSync(__dirname + '/../www/js/game.js', 'utf8');
  assert.strictEqual((game.match(/Ads\.showRewarded\(/g) || []).length, 2);
  const h = game.indexOf("$('t-hint').addEventListener"), x = game.indexOf("$('btn-extra').addEventListener");
  assert.ok(h > 0 && x > 0 && game.indexOf('Ads.showRewarded(', h) - h < 200 && game.indexOf('Ads.showRewarded(', x) - x < 200);
});
t('boot only initialises the SDK (no ad on launch) and the banner is tied to the game screen', () => {
  const game = require('fs').readFileSync(__dirname + '/../www/js/game.js', 'utf8');
  assert.ok(/window\.Ads\.init\(\);/.test(game));
  assert.strictEqual((game.match(/Ads\.showBanner\(/g) || []).length, 1);
  assert.ok(/if \(name === 'game'\) \{.*window\.Ads\.showBanner\(\); \} else \{ window\.Ads\.hideBanner\(\); \}/.test(game));
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
