// Builds www/js/puzzles.js: every bundled puzzle, generated from original pixel art and verified with the
// line solver (solved from empty clues by line logic alone => exactly one solution). Deterministic.
// Run: node tools/build-puzzles.js
const fs = require('fs'), path = require('path');
const NL = require('../www/js/logic.js');
const PAL = require('./palette.js');
const { S5, S8 } = require('./art-small.js');
const MOTIFS = require('./motifs.js');

// ---------- rasteriser ----------
function inside(s, x, y, px) {
  switch (s.t) {
    case 'circle': return (x - s.cx) ** 2 + (y - s.cy) ** 2 <= s.r * s.r;
    case 'ring': { const d = Math.hypot(x - s.cx, y - s.cy); return d >= s.r0 && d <= s.r1; }
    case 'rect': return x >= s.x0 && x <= s.x1 && y >= s.y0 && y <= s.y1;
    case 'ellipse': { const c = Math.cos(-s.rot), sn = Math.sin(-s.rot), dx = x - s.cx, dy = y - s.cy; const u = dx * c - dy * sn, v = dx * sn + dy * c; return (u / s.rx) ** 2 + (v / s.ry) ** 2 <= 1; }
    case 'poly': { let inn = false; const p = s.pts; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { if (((p[i][1] > y) !== (p[j][1] > y)) && x < (p[j][0] - p[i][0]) * (y - p[i][1]) / (p[j][1] - p[i][1]) + p[i][0]) inn = !inn; } return inn; }
    case 'seg': { const hw = Math.max(s.w / 2, px * 0.45); const vx = s.x2 - s.x1, vy = s.y2 - s.y1; const t = Math.max(0, Math.min(1, ((x - s.x1) * vx + (y - s.y1) * vy) / (vx * vx + vy * vy || 1))); return Math.hypot(x - (s.x1 + t * vx), y - (s.y1 + t * vy)) <= hw; }
  }
  return false;
}
function rasterize(shapes, w, h, thr) {
  const SS = 5, sol = new Array(w * h).fill(0), colors = new Array(w * h).fill(0);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const cnt = {}; let filled = 0;
    for (let a = 0; a < SS; a++) for (let b = 0; b < SS; b++) {
      const x = (c + (b + 0.5) / SS) / w, y = (r + (a + 0.5) / SS) / h;
      let col = null;
      for (const s of shapes) if (inside(s, x, y, 1 / w)) col = s.c;
      if (col) { filled++; cnt[col] = (cnt[col] || 0) + 1; }
    }
    if (filled / (SS * SS) >= thr) { sol[r * w + c] = 1; colors[r * w + c] = Object.keys(cnt).sort((p, q) => cnt[q] - cnt[p])[0]; }
  }
  return { sol, colors };
}
function fromAscii(rows) {
  const h = rows.length, w = rows[0].length, sol = [], colors = [];
  rows.forEach((row, i) => { if (row.length !== w) throw new Error('bad row length in art: ' + rows.join('|') + ' row ' + i); for (const ch of row) { sol.push(ch === '.' ? 0 : 1); colors.push(ch === '.' ? 0 : ch); } });
  return { w, h, sol, colors };
}

// ---------- mosaics (procedural symmetric quilt patterns, shared with the daily puzzle) ----------
const MOSAIC_PALS = [['b', 'y', 'c'], ['r', 'o', 'y'], ['G', 'l', 'y'], ['p', 'P', 'w'], ['e', 't', 'n'], ['B', 'c', 'w'], ['m', 'a', 'o'], ['v', 'c', 'P'], ['S', 'q', 'y'], ['N', 't', 'g']];
function mosaic(seed, n) {
  const img = NL.mosaicImage(seed, n), pal = MOSAIC_PALS[seed % MOSAIC_PALS.length];
  const fill = img.sol.reduce((a, b) => a + b, 0) / (n * n);
  if (fill < 0.32 || fill > 0.78) return null;
  return { w: n, h: n, sol: img.sol, colors: img.colors.map(c => c ? pal[c - 1] : 0) };
}

// ---------- verify / repair ----------
function finalize(img, seedStr) {
  if (!img) return null;
  const { w, h } = img;
  const fill = img.sol.reduce((a, b) => a + b, 0) / (w * h);
  if (fill < 0.12 || fill > 0.9) return null;
  const rng = NL.makeRng(NL.hashString(seedStr));
  const fixed = NL.isLineSolvable(img.sol, w, h) ? { sol: img.sol, colors: img.colors, flips: 0 } : NL.makeSolvable(img.sol, w, h, rng, img.colors.map(c => c || 0), 6000);
  if (!fixed) return null;
  if (!NL.isLineSolvable(fixed.sol, w, h)) throw new Error('repair produced unsolvable puzzle');
  // colour any newly-filled cell that got the numeric default
  const colors = fixed.colors.map((c, i) => fixed.sol[i] ? (typeof c === 'string' ? c : firstColor(fixed.colors)) : 0);
  const cl = NL.cluesOf(fixed.sol, w, h), res = NL.lineSolve(cl.rows, cl.cols);
  return { w, h, sol: fixed.sol, colors, flips: fixed.flips, rounds: res.rounds };
}
function firstColor(cs) { for (const c of cs) if (typeof c === 'string') return c; return 'k'; }
function bestOf(shapes, n, seedStr) {
  let best = null;
  for (const thr of [0.5, 0.42, 0.58, 0.35]) {
    const img = rasterize(shapes, n, n, thr); img.w = n; img.h = n;
    const f = finalize(img, seedStr + ':' + thr);
    if (f && (!best || f.flips < best.flips)) best = f;
    if (best && best.flips === 0) break;
  }
  return best;
}

// ---------- packs ----------
const PACKS = [
  { id: 'first', name: 'First Steps', desc: 'Tiny 5×5 pictures to learn the ropes', icon: 'r' },
  { id: 'little', name: 'Little Things', desc: '8×8 everyday objects', icon: 'o' },
  { id: 'garden', name: 'Garden', desc: 'Flowers, trees and harvest', icon: 'g' },
  { id: 'sea', name: 'Seaside', desc: 'Shells, boats and sea life', icon: 'b' },
  { id: 'sky', name: 'Night & Sky', desc: 'Moons, stars and weather', icon: 'y' },
  { id: 'home', name: 'Cozy Home', desc: 'Tea, lamps and quiet corners', icon: 'n' },
  { id: 'animals', name: 'Animal Friends', desc: 'Original little creatures', icon: 'P' },
  { id: 'treats', name: 'Sweet Treats', desc: 'Cakes, fruit and snacks', icon: 'P' },
  { id: 'road', name: 'On the Road', desc: 'Travel and adventure', icon: 'e' },
  { id: 'mosaic', name: 'Quilt Mosaics', desc: 'Symmetric patterns, 10×10 to 20×20', icon: 'v' },
  { id: 'grand', name: 'Grand Canvas', desc: 'Big 20×20 pictures', icon: 'B' }
];
const out = {}; PACKS.forEach(p => { out[p.id] = []; });
const seen = new Set();
let rejected = [];
function add(pack, name, f) {
  if (!f) { rejected.push(pack + '/' + name); return; }
  const key = f.w + 'x' + f.h + ':' + f.sol.join('');
  if (seen.has(key)) { rejected.push(pack + '/' + name + ' (duplicate)'); return; }
  seen.add(key);
  out[pack].push({ name, w: f.w, h: f.h, rows: rowsOf(f), rounds: f.rounds, flips: f.flips });
}
function rowsOf(f) { const rows = []; for (let r = 0; r < f.h; r++) { let s = ''; for (let c = 0; c < f.w; c++) { const i = r * f.w + c; s += f.sol[i] ? f.colors[i] : '.'; } rows.push(s); } return rows; }

S5.forEach(([name, ...rows]) => add('first', name, finalize(fromAscii(rows), 'first:' + name)));
S8.forEach(([name, ...rows]) => add('little', name, finalize(fromAscii(rows), 'little:' + name)));
// a few rasterised 8x8 motifs round out Little Things
['Star', 'Lollipop', 'Map pin', 'Crescent moon', 'Fried egg', 'Lemon', 'Donut', 'Clover'].forEach(n => { const m = MOTIFS.find(x => x.name === n); add('little', m.name, bestOf(m.draw(3), 8, 'little8:' + n)); });
for (const m of MOTIFS) {
  const small = ['garden', 'sea', 'animals', 'treats'].includes(m.pack) ? 10 : 12;
  add(m.pack, m.name, bestOf(m.draw(0), small, m.pack + ':' + m.name + ':s'));
  add(m.pack, m.name + ' II', bestOf(m.draw(1), 15, m.pack + ':' + m.name + ':l'));
}
const GRAND = ['Sunflower', 'Lighthouse', 'Hot-air balloon', 'Cottage', 'Owl on branch', 'Fox', 'Butterfly', 'Teapot', 'Steam train', 'Castle', 'Windmill', 'Ship', 'Whale', 'Octopus', 'Palm tree',
  'Rocket', 'Rain cloud', 'Snowflake', 'Houseplant', 'Armchair', 'Cat', 'Penguin', 'Bear', 'Songbird', 'Cupcake', 'Ice cream cone', 'Strawberry', 'Car', 'Mountain', 'Pine tree', 'Tulip', 'Mushroom'];
GRAND.forEach(n => { const m = MOTIFS.find(x => x.name === n); if (!m) throw new Error('no motif ' + n); add('grand', m.name, bestOf(m.draw(2), 20, 'grand:' + n)); });
const MOS_SIZES = [10, 10, 12, 12, 15, 15, 20];
let mi = 0; for (let s = 1; out.mosaic.length < 42 && s < 400; s++) {
  const n = MOS_SIZES[mi % MOS_SIZES.length];
  const before = out.mosaic.length;
  add('mosaic', 'Quilt', finalize(mosaic(s * 101, n), 'mosaic:' + s));
  if (out.mosaic.length > before) mi++;
}

// order each pack gently: by size, then by how many line-solving sweeps it needs
const data = { palette: PAL, packs: PACKS.map(p => ({ ...p, puzzles: out[p.id].sort((a, b) => (a.w * a.h - b.w * b.h) || (a.rounds - b.rounds)).map((q, i) => ({ id: p.id + '-' + String(i + 1).padStart(2, '0'), name: p.id === 'mosaic' ? 'Quilt No. ' + (i + 1) : q.name, w: q.w, h: q.h, rows: q.rows })) })) };
const total = data.packs.reduce((a, p) => a + p.puzzles.length, 0);
const js = '/* GENERATED by tools/build-puzzles.js - do not edit. ' + total + ' puzzles, each verified line-solvable (unique). */\n' +
  '(function (root) { var D = ' + JSON.stringify(data) + ';\n if (typeof module === "object" && module.exports) module.exports = D; else root.PUZZLES = D; })(typeof self !== "undefined" ? self : this);\n';
fs.writeFileSync(path.join(__dirname, '..', 'www', 'js', 'puzzles.js'), js);
data.packs.forEach(p => console.log(p.id.padEnd(8), p.puzzles.length, [...new Set(p.puzzles.map(q => q.w + 'x' + q.h))].join(',')));
const flips = Object.values(out).flat();
console.log('total', total, 'rejected', rejected.length, rejected.join('; '));
console.log('avg flips', (flips.reduce((a, b) => a + b.flips, 0) / flips.length).toFixed(2), 'max flips', Math.max(...flips.map(f => f.flips)));
