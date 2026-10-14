// v1.1 meta layer unit tests: daily challenge seeding, save normalisation, achievement + shop data, policy rules.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const W = p => path.join(__dirname, '..', 'www', p);
const ML = require(W('js/metakit.js'));
const DailyLogic = require(W('js/daily.js'));
const Shop = require(W('js/shopcore.js'));

// challenge list from meta-config.js (evaluated with a stub Meta so init is captured, not run)
const ctx = { window: { __qp: {}, ACH_DEFS: [], Meta: { init() {} } } };
vm.runInNewContext(fs.readFileSync(W('js/meta-config.js'), 'utf8'), ctx);
const C = ctx.window.QUILLPIX_META;
assert.ok(C.challenges.length >= 5);
assert.equal(ML.challengeFor('2026-10-14', C.challenges, C.salt).id, ML.challengeFor('2026-10-14', C.challenges, C.salt).id);
const ids = new Set(); for (let d = 1; d <= 30; d++) ids.add(ML.challengeFor('2026-11-' + String(d).padStart(2, '0'), C.challenges, C.salt).id);
assert.ok(ids.size >= 3, 'challenge rotates');
const byId = Object.fromEntries(C.challenges.map(c => [c.id, c]));
assert.equal(byId.daily.test({ daily: true }), true); assert.equal(byId.daily.test({ daily: false }), false);
assert.equal(byId.big.test({ size: 10 }), true); assert.equal(byId.big.test({ size: 8 }), false);
assert.equal(byId.quick.test({ ms: 179999 }), true); assert.equal(byId.quick.test({ ms: 180000 }), false);
let r = ML.progressChallenge(null, 'D', byId.three, {}); r = ML.progressChallenge(r.prog, 'D', byId.three, {}); assert.equal(r.done, false);
r = ML.progressChallenge(r.prog, 'D', byId.three, {}); assert.equal(r.done, true);
assert.equal(C.winCoins(), 0, 'puzzle coins stay in game.js (no double pay)');
assert.equal(ML.normalize({ coins: -1 }).coins, 0);

// achievements
const actx = { window: {} }; vm.runInNewContext(fs.readFileSync(W('js/ach-defs.js'), 'utf8'), actx);
const defs = actx.window.ACH_DEFS; assert.equal(new Set(defs.map(d => d.id)).size, defs.length);
defs.forEach(d => assert.ok(d.goal > 0 && d.reward > 0 && d.reward <= 250));
assert.ok(defs.find(d => d.id === 'qp_all').goal <= 348);

// shop: ink styles keep the fill colour; trials work
const css = fs.readFileSync(W('css/meta.css'), 'utf8');
css.split('\n').filter(l => /^body\.ink-/.test(l)).forEach(l => assert.ok(!/#[0-9a-f]{3,6}\b/i.test(l.replace(/rgba\([^)]*\)/g, '')), 'ink style must not hard-code a colour: ' + l.slice(0, 50)));
const game = fs.readFileSync(W('js/game.js'), 'utf8');
const inks = [...game.matchAll(/\{ id: '(\w+)', name: '[^']+', price: (\d+) \}/g)];
assert.ok(inks.length >= 6 && inks[0][2] === '0');
inks.slice(1).forEach(m => assert.ok(new RegExp('body\\.ink-' + m[1]).test(css), 'css for ink ' + m[1]));
const save = { coins: 300, trial: {}, ink: 'solid' }, owned = [];
assert.equal(Shop.buy(save, owned, { id: 'dot', price: 250 }).ok, true); assert.equal(save.coins, 50);
Shop.startTrial(save, 'ink', 'hatch'); assert.equal(Shop.effective(save, 'ink', 'ink'), 'hatch');
assert.equal(DailyLogic.REWARDS.length, 7);

// policy
const ui = ['index.html', 'js/metakit.js', 'js/meta-config.js', 'js/ach-defs.js'].map(f => fs.readFileSync(W(f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '')).join('\n').toLowerCase();
['withdraw', 'paypal', 'real money', 'loot box', 'lootbox', 'wager', 'gamble', 'buy coins'].forEach(w => assert.ok(!ui.includes(w), 'policy word: ' + w));
assert.ok(!/showRewarded\(|showInterstitial|maybeInterstitial/.test(fs.readFileSync(W('js/metakit.js'), 'utf8')), 'metakit never triggers ads itself');
console.log('ALL META TESTS PASSED');
