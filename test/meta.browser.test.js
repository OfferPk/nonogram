// v1.1 headless test: how-to + first-puzzle coach, win -> achievements + challenge, daily reward,
// shop (themes + ink styles, preview, buy), awards/stats, accessibility settings, no ad in session 1.
// Usage: node test/meta.browser.test.js http://localhost:8765/ [outdir]
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const URL = process.argv[2] || 'http://localhost:8765/';
const OUT = process.argv[3] || '/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ok(c, m) { if (!c) throw new Error(m); console.log('ok -', m); }
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'],
    userDataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'qp-meta-')) });
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'networkidle0' }); await sleep(400);
  ok(await page.evaluate(() => window.__qp.gate.state.sessions === 1), 'first session counted');
  ok(!(await page.$eval('#daily-dot', e => e.classList.contains('hidden'))), 'Rewards button shows a ready dot');
  await page.click('#btn-play'); await sleep(300);
  await page.evaluate(() => window.__qp.startPuzzle('first-01')); await sleep(600);
  ok(await page.$eval('#howto', e => !e.classList.contains('hidden')), 'how-to card on the first puzzle');
  await page.click('#howto .btn.primary'); await sleep(700);
  ok(!!(await page.$('.coach')), 'first-puzzle coach starts after the how-to card');
  await page.screenshot({ path: path.join(OUT, 'qp-meta-coach.png') });
  for (let i = 0; i < 8 && await page.$('.coach-next'); i++) { await page.click('.coach-next'); await sleep(150); }
  ok(!(await page.$('.coach')) && await page.evaluate(() => localStorage.getItem('quillpix.meta.v1.coach') === '1'), 'coach finished and remembered');

  // solve: fill every solution square through the game's own state, then tap the last one
  const last = await page.evaluate(() => { const G = window.__qp.game; const idx = G.sol.map((v, i) => v ? i : -1).filter(i => i >= 0); idx.slice(0, -1).forEach(i => { G.state[i] = 1; }); return idx[idx.length - 1]; });
  const box = await (await page.$(`.c[data-i="${last}"]`)).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await sleep(2600);
  ok(await page.evaluate(() => window.__qp.game.done), 'puzzle solved');
  ok(await page.evaluate(() => Meta.ach().get('wins') === 1 && Meta.ach().state().done.qp_first === 1), 'First Picture achievement unlocked');
  ok(await page.evaluate(() => Meta.state().chal && Meta.state().chal.day === MetaLogic.dateKey()), 'daily challenge progress tracked');
  ok(await page.evaluate(() => window.__qp.gate.canShow(Date.now() + 1e9) === false), 'no interstitial possible in the first session');
  await page.evaluate(() => document.getElementById('btn-c-home').click()); await sleep(500);

  // daily reward
  await page.click('#btn-daily'); await sleep(300);
  ok((await page.$$eval('.daily-day', l => l.length)) === 7, '7-day reward calendar');
  const c0 = await page.evaluate(() => window.__qp.save.coins);
  await page.click('.daily-claim'); await sleep(200);
  ok((await page.evaluate(() => window.__qp.save.coins)) >= c0 + 10, 'day-1 reward goes into the game wallet');
  await page.screenshot({ path: path.join(OUT, 'qp-meta-daily.png') });
  await page.click('.daily-x'); await sleep(200);

  // shop
  await page.evaluate(() => { window.__qp.save.coins += 1000; window.__qp.persist(); });
  await page.click('#btn-shop'); await sleep(300);
  ok((await page.$$('#shop [data-theme]')).length === 5 && (await page.$$('#shop [data-ink]')).length === 6, 'shop: 5 themes + 6 ink styles');
  await page.evaluate(() => document.querySelector('#shop [data-theme="dusk"] .prev').click()); await sleep(100);
  ok(await page.evaluate(() => document.body.classList.contains('theme-dusk') && window.__qp.save.theme === 'paper'), 'theme preview applies without buying');
  await page.evaluate(() => document.querySelector('[data-close="shop"]').click()); await sleep(100);
  ok(await page.evaluate(() => document.body.classList.contains('theme-paper')), 'closing the shop ends the preview');
  await page.click('#btn-shop'); await sleep(200);
  await page.evaluate(() => document.querySelector('#shop [data-ink="dot"] .buy').click()); await sleep(100);
  ok(await page.evaluate(() => window.__qp.save.ink === 'dot' && window.__qp.save.ownedInk.includes('dot') && document.body.classList.contains('ink-dot')), 'ink style bought and applied');
  await page.evaluate(() => document.querySelector('#shop [data-theme="sage"] .buy').click()); await sleep(100);
  ok(await page.evaluate(() => window.__qp.save.theme === 'sage'), 'theme bought and applied');
  await page.screenshot({ path: path.join(OUT, 'qp-meta-shop.png') });
  await page.evaluate(() => document.querySelector('[data-close="shop"]').click());
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(300);
  ok(await page.evaluate(() => document.body.classList.contains('ink-dot') && document.body.classList.contains('theme-sage')), 'skins persist across launches');
  ok(await page.evaluate(() => window.__qp.gate.state.sessions === 2), 'second session counted');

  // awards + stats
  await page.click('#btn-awards'); await sleep(200);
  await page.evaluate(() => document.querySelector('.ach-tabs [data-t="stats"]').click()); await sleep(100);
  ok(/Puzzles solved/.test(await page.$eval('.ach-body', e => e.textContent)), 'stats tab shows puzzle stats');
  await page.evaluate(() => document.querySelector('.ach-x').click());

  // accessibility
  await page.click('#btn-settings-home'); await sleep(200);
  for (const id of ['set-large', 'set-contrast', 'set-motion']) await page.evaluate(id => document.getElementById(id).click(), id);
  ok(await page.evaluate(() => ['a11y-large', 'a11y-contrast', 'a11y-reduce'].every(c => document.documentElement.classList.contains(c))), 'accessibility settings apply');
  await page.screenshot({ path: path.join(OUT, 'qp-meta-settings.png') });
  await page.reload({ waitUntil: 'networkidle0' }); await sleep(200);
  ok(await page.evaluate(() => ['a11y-large', 'a11y-contrast', 'a11y-reduce'].every(c => document.documentElement.classList.contains(c))), 'accessibility settings persist');
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  console.log('ALL META BROWSER TESTS PASSED');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
