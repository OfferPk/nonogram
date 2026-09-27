// Headless Chrome phone-size play test for Quillpix (run against the live site for release checks).
// Plays like a player with taps and a drag: mistake mode (wrong fill -> life lost, auto-corrected), cross mode,
// drag-to-fill a line, clue grey-out, undo/redo, reload + resume, solving a 5x5 (win, reveal, stats, coins, ad gate),
// persistence after reload, hint (rewarded, granted on web), daily puzzle, zoom on a 20x20, dark theme,
// and fails on any console error or failed request.
// Usage: PUPPETEER=puppeteer-core node test/browser.test.js <url> [outdir]   (Chrome at /usr/bin/google-chrome or CHROME=...)
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const L = require('../www/js/logic.js');
const URL = (process.argv[2] || 'http://127.0.0.1:18731/').replace(/\/?$/, '/');
const OUT = process.argv[3] || '/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('  ok -', m); };

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Mobile Safari/537.36' });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

  const game = () => page.evaluate(() => { const g = window.__qp.game; return g && { id: g.id, w: g.w, h: g.h, sol: g.sol, state: g.state, lives: g.lives, mistakes: g.mistakes, hints: g.hints, elapsed: g.elapsed, done: g.done, undo: g.undo.length, redo: g.redo.length, daily: !!g.p.daily, key: g.p.key, rows: g.p.rows }; });
  const visible = sel => page.$eval(sel, e => !e.classList.contains('hidden'));
  const tapCell = async i => { await page.tap(`.c[data-i="${i}"]`); await sleep(60); };
  const center = i => page.$eval(`.c[data-i="${i}"]`, e => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });

  console.log('Testing', URL);
  await page.goto(URL + 'privacy.html', { waitUntil: 'networkidle0' });
  assert((await page.title()).includes('Privacy'), 'privacy page loads');
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL, { waitUntil: 'networkidle0' }); await sleep(300);
  const today = new Date();
  assert(await visible('#home') && !(await visible('#btn-continue')), 'home on launch, nothing to continue');
  assert((await page.$eval('#daily-sub', e => e.textContent)).startsWith(L.DAILY_SIZES[today.getDay()] + '×'), 'daily card shows today\'s size');
  const total = await page.evaluate(() => window.__qp.D.packs.reduce((a, p) => a + p.puzzles.length, 0));
  assert(total >= 300 && (await page.$eval('#play-sub', e => e.textContent)) === '0 / ' + total + ' solved', total + ' puzzles bundled');

  // ---- packs -> first pack -> first puzzle ----
  await page.tap('#btn-play'); await sleep(300);
  assert((await page.$$('.pack-card')).length >= 8, 'pack list shows themed packs');
  await page.tap('[data-pack="first"]'); await sleep(300);
  assert((await page.$$('#pack-grid .tile')).length >= 20, 'pack grid shows puzzle tiles');
  await page.tap('[data-id="first-01"]'); await sleep(500);
  assert(await visible('#howto'), 'how-to-play shown on the first puzzle');
  await page.tap('#howto .btn.primary'); await sleep(200);
  let g = await game();
  assert(await visible('#game') && g.id === 'first-01' && g.w === 5 && g.lives === 3, '5×5 puzzle started with 3 lives');
  const { sol } = L.parsePuzzle({ rows: g.rows }), cl = L.cluesOf(sol, 5, 5);
  const rowText = await page.$$eval('.rc', els => els.map(e => [...e.children].map(s => s.textContent).join(' ')));
  assert(JSON.stringify(rowText) === JSON.stringify(cl.rows.map(r => r.length ? r.join(' ') : '0')), 'row clues rendered from the picture');

  // ---- mistake mode: a wrong fill costs a life and is corrected to a cross ----
  const wrong = sol.findIndex(v => !v);
  await tapCell(wrong); await sleep(100);
  g = await game();
  assert(g.lives === 2 && g.mistakes === 1 && g.state[wrong] === 2 && (await page.$eval(`.c[data-i="${wrong}"]`, e => e.classList.contains('x') && e.classList.contains('bad'))), 'wrong fill: life lost, square crossed and flagged');
  await page.tap('#t-undo'); await sleep(100); g = await game();
  assert(g.state[wrong] === 0 && g.lives === 2, 'undo removes the mark (the life stays lost)');
  await page.tap('#t-redo'); await sleep(100); g = await game();
  assert(g.state[wrong] === 2, 'redo puts it back');
  await page.tap('#t-undo'); await sleep(100);

  // ---- cross mode ----
  await page.tap('#m-cross'); await sleep(50);
  const empties = sol.map((v, i) => v ? -1 : i).filter(i => i >= 0);
  await tapCell(empties[1]); g = await game();
  assert(g.state[empties[1]] === 2 && g.lives === 2, 'cross mode marks an empty square with ✕');
  await page.tap('#m-fill'); await sleep(50);

  // ---- drag to fill a line: longest run in any row ----
  let best = null;
  for (let r = 0; r < 5; r++) { let c = 0; while (c < 5) { if (sol[r * 5 + c]) { let e = c; while (e + 1 < 5 && sol[r * 5 + e + 1]) e++; if (!best || e - c > best.e - best.c) best = { r, c, e }; c = e + 1; } else c++; } }
  const a = await center(best.r * 5 + best.c), b = await center(best.r * 5 + best.e);
  await page.touchscreen.touchStart(a.x, a.y);
  for (let k = 1; k <= 6; k++) { await page.touchscreen.touchMove(a.x + (b.x - a.x) * k / 6, a.y + (b.y - a.y) * k / 6); await sleep(30); }
  await page.touchscreen.touchEnd(); await sleep(600);
  g = await game();
  const dragged = []; for (let c = best.c; c <= best.e; c++) dragged.push(best.r * 5 + c);
  assert(dragged.every(i => g.state[i] === 1) && g.undo >= 1, 'drag filled ' + dragged.length + ' squares of row ' + (best.r + 1) + ' in one stroke');
  await page.tap('#t-undo'); await sleep(100); g = await game();
  assert(dragged.every(i => g.state[i] === 0), 'the whole drag is one undo step');
  await page.tap('#t-redo'); await sleep(100);

  // ---- clue grey-out on a finished row ----
  const doneRow = [0, 1, 2, 3, 4].find(r => [0, 1, 2, 3, 4].every(c => !sol[r * 5 + c] || dragged.includes(r * 5 + c)));
  if (doneRow !== undefined) assert(await page.$eval(`.rc[data-k="${doneRow}"]`, e => e.classList.contains('sat') && [...e.children].every(s => s.classList.contains('done'))), 'finished row clue greys out');
  else {
    for (let c = 0; c < 5; c++) if (sol[best.r * 5 + c] && !dragged.includes(best.r * 5 + c)) await tapCell(best.r * 5 + c);
    assert(await page.$eval(`.rc[data-k="${best.r}"]`, e => e.classList.contains('sat')), 'finished row clue greys out');
  }

  // ---- solve all but one, reload, resume ----
  g = await game();
  let rest = sol.map((v, i) => v && g.state[i] !== 1 ? i : -1).filter(i => i >= 0);
  const last = rest.pop();
  for (const i of rest) await tapCell(i);
  await sleep(1200);
  const before = await game();
  assert(before.elapsed >= 1000, 'timer running (' + Math.round(before.elapsed) + ' ms)');
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert(await visible('#btn-continue'), 'home offers Continue after reload');
  await page.tap('#btn-continue'); await sleep(400);
  const after = await game();
  assert(after.id === 'first-01' && after.state.join('') === before.state.join('') && after.lives === before.lives && after.elapsed >= before.elapsed - 1500, 'marks, lives and time restored after reload');

  // ---- win ----
  await tapCell(last); await sleep(200);
  g = await game();
  assert(g.done && await page.$eval('#grid', e => e.classList.contains('reveal')), 'last square: puzzle solved, colour reveal starts');
  await sleep(1400);
  assert(await visible('#complete'), 'complete screen after the reveal');
  await page.screenshot({ path: `${OUT}/qp-complete.png` });
  const s1 = await page.evaluate(() => ({ solved: window.__qp.save.solved['first-01'], coins: window.__qp.save.coins, pc: window.__qp.gate.state.puzzlesCompleted, prog: window.__qp.save.progress['first-01'], sz: window.__qp.save.stats.sizes['5×5'] }));
  assert(s1.solved && !s1.prog && s1.coins === L.coinsFor(5, 5) && s1.pc === 1 && s1.sz.n === 1 && s1.sz.best > 0, 'stats + best time, +' + L.coinsFor(5, 5) + ' coins, ad gate counted 1 puzzle, saved game cleared');
  assert(await page.evaluate(() => window.__qp.gate.canShow(Date.now())) === false, 'no interstitial before 5 puzzles + 3 minutes');
  await page.tap('#btn-c-home'); await sleep(500);
  assert(await visible('#home') && (await page.$eval('#play-sub', e => e.textContent)).startsWith('1 /'), 'home shows 1 solved');
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  assert((await page.$eval('#play-sub', e => e.textContent)).startsWith('1 /') && (await page.$eval('.coins-val', e => e.textContent)) === String(L.coinsFor(5, 5)), 'solved picture and coins persist after reload');

  // ---- hint (rewarded; granted immediately on web) ----
  await page.tap('#btn-play'); await sleep(250); await page.tap('[data-pack="first"]'); await sleep(250);
  assert(await page.$eval('[data-id="first-01"]', e => e.classList.contains('solved') && !!e.querySelector('canvas')), 'solved tile shows the colour picture');
  await page.tap('[data-id="first-02"]'); await sleep(400);
  await page.tap('#t-hint'); await sleep(300);
  g = await game();
  const p2 = L.parsePuzzle({ rows: g.rows }).sol;
  const revealedRow = [0, 1, 2, 3, 4].some(r => [0, 1, 2, 3, 4].every(c => g.state[r * 5 + c] === (p2[r * 5 + c] ? 1 : 2)));
  const revealedCol = [0, 1, 2, 3, 4].some(c => [0, 1, 2, 3, 4].every(r => g.state[r * 5 + c] === (p2[r * 5 + c] ? 1 : 2)));
  assert(g.hints === 1 && (revealedRow || revealedCol), 'Hint revealed a whole line correctly');

  // ---- daily ----
  await page.evaluate(() => history.go(-3)); await sleep(500);
  assert(await visible('#home'), 'back to home');
  await page.tap('#daily-card'); await sleep(500);
  g = await game();
  const exp = L.dailyPuzzle(today);
  assert(g.daily && g.key === L.dateKey(today) && g.rows.join() === exp.rows.join(), 'daily puzzle is today\'s seeded puzzle (' + g.key + ')');
  await page.evaluate(() => history.back()); await sleep(400);

  // ---- zoom on a 20x20 ----
  await page.tap('#btn-play'); await sleep(250); await page.tap('[data-pack="grand"]'); await sleep(250); await page.tap('[data-id="grand-01"]'); await sleep(500);
  const z0 = await page.evaluate(() => window.__qp.view.cs);
  await page.tap('#t-zoom'); await sleep(200);
  const z1 = await page.evaluate(() => ({ cs: window.__qp.view.cs, zoom: window.__qp.view.zoom }));
  assert(z1.zoom > 1 && z1.cs > z0, '20×20 zooms in (cell ' + z0 + 'px -> ' + z1.cs + 'px)');
  const bannerSafe = await page.evaluate(() => { const g = document.getElementById('gridvp').getBoundingClientRect(), t = document.querySelector('.tools').getBoundingClientRect(); return g.bottom <= t.top + 1; });
  assert(bannerSafe, 'grid never overlaps the toolbar / banner area');
  await page.evaluate(() => history.go(-3)); await sleep(400);

  // ---- dark theme ----
  await page.tap('#btn-shop'); await sleep(300);
  await page.tap('[data-theme="midnight"] .buy'); await sleep(200);
  assert(await page.evaluate(() => document.body.classList.contains('theme-midnight') && window.__qp.save.theme === 'midnight'), 'Midnight (dark) theme applied for free');
  await page.tap('[data-close="shop"]'); await sleep(200);
  await page.screenshot({ path: `${OUT}/qp-home-dark.png` });

  assert(errors.length === 0, 'no console errors or failed requests' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log('\nBROWSER TEST PASSED');
})().catch(e => { console.error(e); process.exit(1); });
