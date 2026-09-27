// Captures raw 1080x1920 screenshots from the real game (360x640 CSS px @3x) for the store kit.
// Usage: PUPPETEER=puppeteer-core node store/capture_screens.js <url> <outdir>
const puppeteer = require(process.env.PUPPETEER || 'puppeteer-core');
const L = require('../www/js/logic.js');
const D = require('../www/js/puzzles.js');
const URL = (process.argv[2] || 'http://127.0.0.1:18731/').replace(/\/?$/, '/');
const OUT = process.argv[3] || 'store/raw';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEY = 'quillpix.save.v1';
const byId = {}; D.packs.forEach(p => p.puzzles.forEach(q => { byId[q.id] = q; }));

// a solved-looking history: most of the first packs solved, some elsewhere
function solvedMap() {
  const s = {}; const rng = L.makeRng(42);
  D.packs.forEach((p, pi) => p.puzzles.forEach((q, i) => { const share = [1, 0.9, 0.8, 0.55, 0.45, 0.35, 0.5, 0.3, 0.2, 0.25, 0.12][pi]; if (rng.next() < share || (pi < 3 && i < 18)) s[q.id] = { ms: 40000 + q.w * q.h * 900 * (0.6 + rng.next()), f: rng.next() < 0.5 }; }));
  return s;
}
function stats(solved) {
  const sizes = {}; Object.keys(solved).forEach(id => { const q = byId[id], k = q.w + '×' + q.h, z = sizes[k] || (sizes[k] = { n: 0, best: 0, total: 0 }); z.n++; z.total += solved[id].ms; z.best = z.best ? Math.min(z.best, solved[id].ms * 0.7) : solved[id].ms * 0.7; });
  const n = Object.keys(solved).length;
  return { solved: n + 9, flawless: Math.round(n * 0.46), totalMs: Object.values(solved).reduce((a, b) => a + b.ms, 0), hints: 14, mistakes: 57, sizes };
}
function daily() { const done = {}; const t = new Date(); for (let k = 1; k <= 9; k++) { const d = new Date(t); d.setDate(t.getDate() - k); done[L.dateKey(d)] = 300000; } return { done, streak: 9, best: 16, last: L.dateKey(new Date(Date.now() - 864e5)) }; }
// in-progress state: solve some whole rows and columns correctly (fills + crosses), plus a few loose fills
function progress(id, rowsDone, colsDone, elapsed, loose) {
  const q = byId[id], { sol } = L.parsePuzzle(q), st = new Array(q.w * q.h).fill(0);
  rowsDone.forEach(r => { for (let c = 0; c < q.w; c++) st[r * q.w + c] = sol[r * q.w + c] ? 1 : 2; });
  colsDone.forEach(c => { for (let r = 0; r < q.h; r++) st[r * q.w + c] = sol[r * q.w + c] ? 1 : 2; });
  (loose || []).forEach(i => { if (sol[i]) st[i] = 1; });
  return { s: st.join(''), t: elapsed, mm: true, l: 2, m: 1, h: 0 };
}
function base(theme, extra) {
  const solved = solvedMap();
  return Object.assign({ v: 1, coins: 740, owned: ['paper', 'midnight', 'sage', 'dusk'], theme, settings: { mistakes: true, autox: true, hl: true, timer: true, sound: false, haptics: false },
    solved, progress: {}, current: null, stats: stats(solved), daily: daily(), ad: {}, seenHowto: true }, extra || {});
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.emulate({ viewport: { width: 360, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile' });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const shot = async n => { await sleep(400); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
  async function load(save, open) {
    await page.goto(URL + 'privacy.html', { waitUntil: 'networkidle0' });
    await page.evaluate((k, s) => localStorage.setItem(k, JSON.stringify(s)), KEY, save);
    await page.goto(URL, { waitUntil: 'networkidle0' }); await sleep(300);
    if (open === 'continue') { await page.tap('#btn-continue'); await sleep(700); }
  }
  // 1) paper: 15x15 garden puzzle in progress (clues greying out, crosses)
  { const id = 'garden-18', q = byId[id]; const s = base('paper'); delete s.solved[id]; s.progress[id] = progress(id, [0, 1, 2, 3, 4, 12, 13, 14], [0, 1, 2, 13, 14], 312000, [96, 97, 98, 111, 112, 113]); s.current = id;
    await load(s, 'continue'); await shot('1-playing'); }
  // 2) the colour reveal of a 20x20 (Grand Canvas): place the last square, capture the finished picture
  { const id = 'grand-11', q = byId[id], { sol } = L.parsePuzzle(q); const s = base('paper'); delete s.solved[id];
    const st = sol.map(v => v ? 1 : 2); const last = sol.lastIndexOf(1); st[last] = 0;
    s.progress[id] = { s: st.join(''), t: 1234000, mm: true, l: 3, m: 0, h: 0 }; s.current = id;
    await load(s, 'continue');
    await page.evaluate(i => { const e = document.querySelector('.c[data-i="' + i + '"]'); const b = e.getBoundingClientRect(); window.__pt = { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, last);
    const pt = await page.evaluate(() => window.__pt); await page.touchscreen.tap(pt.x, pt.y);
    await sleep(1750); await page.screenshot({ path: `${OUT}/2-reveal.png` }); console.log('shot 2-reveal');
    await sleep(1400); await shot('3-complete'); }
  // 4) pack list
  { await load(base('paper')); await page.tap('#btn-play'); await sleep(500); await shot('4-packs'); }
  // 5) a pack full of solved pictures (sage)
  { const s = base('sage'); D.packs[3].puzzles.forEach((q, i) => { if (i < 26) s.solved[q.id] = { ms: 200000, f: true }; }); await load(s); await page.tap('#btn-play'); await sleep(300); await page.tap('[data-pack="sea"]'); await sleep(500); await shot('5-pack'); }
  // 6) midnight: 20x20 zoomed in, in progress
  { const id = 'grand-12', s = base('midnight'); delete s.solved[id]; s.progress[id] = progress(id, [0, 1, 2, 3, 4, 5, 6, 7, 8], [0, 1, 2, 3, 4, 5, 6, 16, 17, 18, 19], 845000); s.current = id;
    await load(s, 'continue'); await page.tap('#t-zoom'); await sleep(300);
    await page.evaluate(() => { const v = window.__qp.view; v.tx = -v.cs * 1; v.ty = -v.cs * 1; }); await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await sleep(200);
    await shot('6-dark-zoom'); }
  // 7) home with the daily puzzle (dusk) and a game to continue
  { const id = 'sky-20', s = base('dusk'); delete s.solved[id]; s.progress[id] = progress(id, [0, 1], [0], 124000); s.current = id; await load(s); await shot('7-home'); }
  // 8) statistics
  { await load(base('paper')); await page.tap('#btn-stats'); await sleep(400); await shot('8-stats'); }
  // 9) themes
  { await load(base('blush', { owned: ['paper', 'midnight', 'sage', 'dusk', 'blush'], coins: 260 })); await page.tap('#btn-shop'); await sleep(500); await shot('9-themes'); }
  console.log('errors:', errors);
  await browser.close();
})();
