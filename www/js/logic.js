/*
 * Quillpix nonogram logic: pure functions, no DOM. Runs in the browser (window.NL) and in Node (require).
 *  - clue generation            clueOf(line), cluesOf(sol, w, h)
 *  - line solver                solveLine(cells, clue)  (exact DP: every cell forced by ALL arrangements)
 *  - full line-solving          lineSolve(rowClues, colClues)  (iterates lines to a fixpoint)
 *  - uniqueness / solvability   isLineSolvable(...)  (fully solved by line logic => exactly one solution)
 *  - clue status (grey-out)     clueStatus(line, clue), lineSatisfied(line, clue)
 *  - seeded RNG, date keys, daily puzzle generator, repair-to-solvable, hint line picking
 * Cell values: -1 unknown, 0 empty, 1 filled. Clues are arrays of run lengths; an empty line has clue [].
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------------- clues ----------------
  function clueOf(line) {
    var out = [], run = 0;
    for (var i = 0; i < line.length; i++) {
      if (line[i] === 1) run++;
      else if (run) { out.push(run); run = 0; }
    }
    if (run) out.push(run);
    return out;
  }
  function row(g, w, r) { return g.slice(r * w, r * w + w); }
  function col(g, w, h, c) { var o = new Array(h); for (var r = 0; r < h; r++) o[r] = g[r * w + c]; return o; }
  function cluesOf(sol, w, h) {
    var rows = [], cols = [];
    for (var r = 0; r < h; r++) rows.push(clueOf(row(sol, w, r)));
    for (var c = 0; c < w; c++) cols.push(clueOf(col(sol, w, h, c)));
    return { rows: rows, cols: cols };
  }

  // ---------------- line solver ----------------
  /**
   * Exact line solver. cells: array of -1/0/1, clue: run lengths.
   * Returns a new array where every cell that has the same value in ALL arrangements consistent with
   * the clue and the known cells is set; others stay -1. Returns null if no arrangement exists.
   */
  function solveLine(cells, clue) {
    var n = cells.length, k = clue.length, i, j;
    // prefix count of known-empty cells, to test "no empty inside [s, s+L)" in O(1)
    var emp = new Int32Array(n + 1);
    for (i = 0; i < n; i++) emp[i + 1] = emp[i] + (cells[i] === 0 ? 1 : 0);
    function fits(s, L) {
      if (s + L > n) return false;
      if (emp[s + L] - emp[s] > 0) return false;
      if (s + L < n && cells[s + L] === 1) return false;
      return true;
    }
    var W = k + 1;
    // bw[i*W+j]: cells i..n-1 can hold blocks j..k-1
    var bw = new Uint8Array((n + 1) * W);
    bw[n * W + k] = 1;
    for (i = n - 1; i >= 0; i--) {
      for (j = k; j >= 0; j--) {
        var v = 0;
        if (cells[i] !== 1 && bw[(i + 1) * W + j]) v = 1;
        if (!v && j < k && fits(i, clue[j])) {
          var e = i + clue[j]; if (e < n) e++;
          if (bw[e * W + j + 1]) v = 1;
        }
        bw[i * W + j] = v;
      }
    }
    if (!bw[0]) return null;
    // fw[i*W+j]: cells 0..i-1 hold exactly blocks 0..j-1 and position i may start the next thing
    var fw = new Uint8Array((n + 1) * W);
    fw[0] = 1;
    var canEmpty = new Uint8Array(n), fillDiff = new Int32Array(n + 1);
    for (i = 0; i < n; i++) {
      for (j = 0; j <= k; j++) {
        if (!fw[i * W + j]) continue;
        if (cells[i] !== 1 && bw[(i + 1) * W + j]) { canEmpty[i] = 1; fw[(i + 1) * W + j] = 1; }
        if (j < k && fits(i, clue[j])) {
          var L = clue[j], e2 = i + L; var sep = e2 < n;
          var nx = sep ? e2 + 1 : e2;
          if (bw[nx * W + j + 1]) {
            fillDiff[i]++; fillDiff[e2]--;
            if (sep) canEmpty[e2] = 1;
            fw[nx * W + j + 1] = 1;
          }
        }
      }
    }
    var out = new Array(n), acc = 0;
    for (i = 0; i < n; i++) {
      acc += fillDiff[i];
      var f = acc > 0, em = canEmpty[i] === 1;
      if (f && em) out[i] = -1; else if (f) out[i] = 1; else if (em) out[i] = 0; else return null;
      if (cells[i] !== -1 && out[i] !== cells[i]) { if (out[i] === -1) out[i] = cells[i]; else return null; }
    }
    return out;
  }

  /**
   * Line-solve a whole puzzle from an empty grid (or a given partial grid).
   * Returns { grid, solved, contradiction, rounds } where rounds = number of full sweeps that changed something.
   */
  function lineSolve(rowClues, colClues, start) {
    var h = rowClues.length, w = colClues.length, N = w * h, i, r, c;
    var g = start ? start.slice() : new Array(N).fill(-1);
    var dirtyR = new Uint8Array(h).fill(1), dirtyC = new Uint8Array(w).fill(1);
    var rounds = 0, progress = true;
    while (progress) {
      progress = false;
      var changed = false;
      for (r = 0; r < h; r++) {
        if (!dirtyR[r]) continue; dirtyR[r] = 0;
        var line = g.slice(r * w, r * w + w), res = solveLine(line, rowClues[r]);
        if (!res) return { grid: g, solved: false, contradiction: true, rounds: rounds };
        for (c = 0; c < w; c++) if (res[c] !== line[c]) { g[r * w + c] = res[c]; dirtyC[c] = 1; changed = true; }
      }
      for (c = 0; c < w; c++) {
        if (!dirtyC[c]) continue; dirtyC[c] = 0;
        var cl = col(g, w, h, c), rc = solveLine(cl, colClues[c]);
        if (!rc) return { grid: g, solved: false, contradiction: true, rounds: rounds };
        for (r = 0; r < h; r++) if (rc[r] !== cl[r]) { g[r * w + c] = rc[r]; dirtyR[r] = 1; changed = true; }
      }
      if (changed) { rounds++; progress = true; }
    }
    var unknown = 0; for (i = 0; i < N; i++) if (g[i] === -1) unknown++;
    return { grid: g, solved: unknown === 0, contradiction: false, rounds: rounds, unknown: unknown };
  }

  /** True when line logic alone determines every cell AND the result equals sol (hence the solution is unique). */
  function isLineSolvable(sol, w, h) {
    var cl = cluesOf(sol, w, h), res = lineSolve(cl.rows, cl.cols);
    if (!res.solved) return false;
    for (var i = 0; i < sol.length; i++) if (res.grid[i] !== sol[i]) return false;
    return true;
  }

  /** Brute-force solution counter (backtracking on top of line logic), used by tests on small puzzles. */
  function countSolutions(rowClues, colClues, limit, start) {
    limit = limit || 2;
    var h = rowClues.length, w = colClues.length;
    var res = lineSolve(rowClues, colClues, start);
    if (res.contradiction) return 0;
    if (res.solved) {
      // verify fully (line solver fixpoint is exact per line, so a full grid is consistent)
      return 1;
    }
    var idx = res.grid.indexOf(-1), total = 0;
    for (var v = 1; v >= 0; v--) {
      var g = res.grid.slice(); g[idx] = v;
      total += countSolutions(rowClues, colClues, limit - total, g);
      if (total >= limit) return total;
    }
    return total;
  }

  // ---------------- clue status (grey-out) ----------------
  function sameArr(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; }
  /** A line is satisfied when its filled runs equal the clue exactly (crosses and blanks both count as empty). */
  function lineSatisfied(line, clue) {
    var f = line.map(function (v) { return v === 1 ? 1 : 0; });
    return sameArr(clueOf(f), clue);
  }
  /**
   * Which clue numbers are "done" (greyed). If the whole line is satisfied, all are done.
   * Otherwise runs anchored at the left edge (bounded by edge/crossed cells, no blanks before them) mark
   * clue numbers from the left, and likewise from the right. line uses 1 filled, 2 crossed, 0 blank.
   */
  function clueStatus(line, clue) {
    var k = clue.length, done = new Array(k).fill(false);
    if (lineSatisfied(line, clue)) { for (var q = 0; q < k; q++) done[q] = true; return done; }
    function scan(cells, cl) {
      var res = [], i = 0, n = cells.length, bi = 0;
      while (i < n && bi < cl.length) {
        if (cells[i] === 2) { i++; continue; }
        if (cells[i] === 0) break;               // blank: can't be sure beyond here
        var s = i; while (i < n && cells[i] === 1) i++;
        var len = i - s;
        if (i < n && cells[i] === 0) break;       // run not closed
        if (len !== cl[bi]) break;
        res.push(bi); bi++;
      }
      return res;
    }
    var left = scan(line, clue);
    left.forEach(function (b) { done[b] = true; });
    var rev = line.slice().reverse(), rc = clue.slice().reverse();
    var right = scan(rev, rc);
    // don't let left and right claim overlapping numbers inconsistently
    right.forEach(function (b) { var idx = k - 1 - b; if (idx >= left.length) done[idx] = true; });
    return done;
  }

  // ---------------- RNG / dates ----------------
  function hashString(s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function makeRng(seed) {
    var a = seed >>> 0;
    return {
      next: function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },
      int: function (n) { return Math.floor(this.next() * n); }
    };
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  // ---------------- repair: make an image line-solvable ----------------
  /**
   * Nudges an image until line logic alone solves it: repeatedly flips one still-undetermined cell
   * (keeping the flip only when the number of undetermined cells drops). colors (optional) is kept in sync:
   * a newly filled cell takes the most common neighbouring colour. Returns { sol, colors, flips } or null.
   */
  function makeSolvable(sol, w, h, rng, colors, maxTries) {
    sol = sol.slice(); colors = colors ? colors.slice() : null;
    maxTries = maxTries || 4000;
    var cl = cluesOf(sol, w, h), res = lineSolve(cl.rows, cl.cols), flips = 0;
    var best = res.unknown;
    for (var t = 0; t < maxTries && best > 0; t++) {
      var unk = []; for (var i = 0; i < res.grid.length; i++) if (res.grid[i] === -1) unk.push(i);
      var p = unk[rng.int(unk.length)];
      var old = sol[p], oldC = colors ? colors[p] : 0;
      sol[p] = 1 - old;
      if (colors) colors[p] = sol[p] ? neighbourColor(colors, sol, w, h, p) : 0;
      var cl2 = cluesOf(sol, w, h), r2 = lineSolve(cl2.rows, cl2.cols);
      if (r2.unknown < best) { best = r2.unknown; res = r2; flips++; }
      else { sol[p] = old; if (colors) colors[p] = oldC; }
    }
    if (best > 0) return null;
    return { sol: sol, colors: colors, flips: flips };
  }
  function neighbourColor(colors, sol, w, h, p) {
    var r = Math.floor(p / w), c = p % w, cnt = {}, best = 1, bc = 0;
    for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
      var rr = r + dr, cc = c + dc; if ((!dr && !dc) || rr < 0 || cc < 0 || rr >= h || cc >= w) continue;
      var q = rr * w + cc; if (sol[q] && colors[q]) { cnt[colors[q]] = (cnt[colors[q]] || 0) + 1; if (cnt[colors[q]] > bc) { bc = cnt[colors[q]]; best = colors[q]; } }
    }
    return best;
  }

  // ---------------- mosaic pictures (quilt patterns) ----------------
  /**
   * A symmetric "quilt block": a random field in one octant, smoothed like a cellular automaton and mirrored
   * 8 ways, coloured in bands (square, diamond or round). Returns { sol, colors } with colour indices 1..3.
   */
  function mosaicImage(seed, n) {
    var rng = makeRng(seed), half = Math.ceil(n / 2), sol = new Array(n * n).fill(0), colors = new Array(n * n).fill(0), r, c;
    var f = []; for (r = 0; r < half; r++) { f.push([]); for (c = 0; c < half; c++) f[r].push(rng.next() < 0.52 ? 1 : 0); }
    function get(a, b) { var rr = Math.min(a, b), cc = Math.max(a, b); return (f[rr] && f[rr][cc] !== undefined) ? f[rr][cc] : 0; }
    for (var it = 0; it < 2; it++) {
      var g = f.map(function (x) { return x.slice(); });
      for (r = 0; r < half; r++) for (c = r; c < half; c++) {
        var s = 0; for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) { var ar = Math.abs(r + dr), ac = Math.abs(c + dc); if (ar < half && ac < half) s += get(ar, ac); }
        g[r][c] = s >= 5 ? 1 : (s <= 3 ? 0 : f[r][c]);
      }
      f = g;
    }
    var style = seed % 3, band = Math.max(2, n / 6);
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) {
      var rr2 = r < half ? r : n - 1 - r, cc2 = c < half ? c : n - 1 - c;
      if (!get(rr2, cc2)) continue;
      var a = half - 1 - rr2, b = half - 1 - cc2;
      var d = style === 0 ? Math.max(a, b) : style === 1 ? a + b : Math.round(Math.sqrt(a * a + b * b));
      sol[r * n + c] = 1; colors[r * n + c] = 1 + (Math.floor(d / band) % 3);
    }
    return { sol: sol, colors: colors };
  }

  // ---------------- daily puzzle ----------------
  var DAILY_SIZES = [15, 10, 10, 12, 12, 15, 15]; // Sun..Sat
  var DAILY_PALETTES = [
    ['#2f6f8f', '#e0a458', '#c8553d'], ['#7b4b94', '#f2c14e', '#3d9970'], ['#264653', '#2a9d8f', '#e9c46a'],
    ['#9c3d54', '#f0a868', '#4f7cac'], ['#3d5a80', '#ee6c4d', '#98c1d9'], ['#5b8e7d', '#bc4b51', '#f4e285']
  ];
  /** Today's seeded quilt mosaic, repaired until line logic solves it. Offline and deterministic per local date. */
  function dailyPuzzle(d) {
    d = d || new Date();
    var key = dateKey(d), seed = hashString('quillpix-daily-' + key), size = DAILY_SIZES[d.getDay()];
    for (var attempt = 0; attempt < 200; attempt++) {
      var s = (seed + attempt * 7919) >>> 0, img = mosaicImage(s, size), N = size * size;
      var fill = img.sol.reduce(function (x, y) { return x + y; }, 0) / N;
      if (fill < 0.35 || fill > 0.75) continue;
      var rng = makeRng(s ^ 0x9e3779b9);
      var fixed = isLineSolvable(img.sol, size, size) ? { sol: img.sol, colors: img.colors } : makeSolvable(img.sol, size, size, rng, img.colors, 3000);
      if (!fixed) continue;
      var pal = DAILY_PALETTES[s % DAILY_PALETTES.length];
      var rows = [];
      for (var r = 0; r < size; r++) { var line = ''; for (var c = 0; c < size; c++) { var i = r * size + c; line += fixed.sol[i] ? String(fixed.colors[i] || 1) : '.'; } rows.push(line); }
      return { id: 'daily-' + key, key: key, name: 'Daily quilt', w: size, h: size, rows: rows, palette: { 1: pal[0], 2: pal[1], 3: pal[2] }, daily: true };
    }
    return null;
  }

  // ---------------- hint: pick a line to reveal ----------------
  /**
   * Chooses the most useful line to reveal: a line whose filled cells differ from the solution, preferring
   * lines with wrong fills, then the most missing fills; ties broken by index (rows first). state: 0 blank, 1 filled, 2 crossed. Returns { type: 'row'|'col', index } or null.
   */
  function pickHintLine(state, sol, w, h) {
    var best = null, bestScore = 0, r, c;
    // score = 10 per wrong fill + 1 per missing fill; only lines whose filled cells differ from the solution qualify
    function score(cells, target) {
      var sc = 0;
      for (var i = 0; i < cells.length; i++) {
        var f = cells[i] === 1 ? 1 : 0;
        if (f && !target[i]) sc += 10; else if (!f && target[i]) sc += 1;
      }
      return sc;
    }
    for (r = 0; r < h; r++) { var s1 = score(row(state, w, r), row(sol, w, r)); if (s1 > bestScore) { bestScore = s1; best = { type: 'row', index: r }; } }
    for (c = 0; c < w; c++) { var s2 = score(col(state, w, h, c), col(sol, w, h, c)); if (s2 > bestScore) { bestScore = s2; best = { type: 'col', index: c }; } }
    return best;
  }

  /** Is the player's grid a win? (filled cells exactly equal to the solution; crosses count as empty) */
  function isWin(state, sol) {
    for (var i = 0; i < sol.length; i++) if ((state[i] === 1 ? 1 : 0) !== sol[i]) return false;
    return true;
  }

  /** Cells along a drag from a to b, locked to the row or column of a (whichever axis moved more). */
  function dragLine(a, b, w) {
    var ar = Math.floor(a / w), ac = a % w, br = Math.floor(b / w), bc = b % w, out = [], i;
    if (Math.abs(br - ar) > Math.abs(bc - ac)) { var st = br > ar ? 1 : -1; for (i = ar; i !== br + st; i += st) out.push(i * w + ac); }
    else { var s2 = bc >= ac ? 1 : -1; for (i = ac; i !== bc + s2; i += s2) out.push(ar * w + i); }
    return out;
  }

  /**
   * Input rules shared by taps and drags. mode 'fill' | 'cross'. Returns the target value that the first
   * cell of a gesture decides for all cells of that gesture: filling a blank => 1, tapping a filled => 0 (clear),
   * crossing a blank => 2, crossing a crossed => 0. Cells already holding the "other" mark are left alone.
   */
  function gestureTarget(mode, first) {
    if (mode === 'fill') return first === 1 ? 0 : (first === 2 ? 0 : 1);
    return first === 2 ? 0 : (first === 1 ? 0 : 2);
  }
  function applyTarget(cur, target, mode) {
    if (target === 0) {
      // clearing only clears the mark type that started the gesture
      if (mode === 'fill') return cur === 1 ? 0 : cur;
      return cur === 2 ? 0 : cur;
    }
    if (cur === 0) return target;
    return cur; // never overwrite the other mark
  }

  /**
   * Applies one stroke (a tap or a drag line) to the player's grid in place. cells: ordered cell indices,
   * target: from gestureTarget(), mode: 'fill' | 'cross'. sol: the solution in mistake mode, or null in free mode.
   * In mistake mode a wrong mark is corrected on the spot (a wrong fill becomes a cross, a wrong cross becomes a
   * fill) and the stroke stops there. Returns { changes: [[i, before, after]...], mistake: index or -1 }.
   */
  function applyStroke(state, cells, target, mode, sol) {
    var changes = [], mistake = -1;
    for (var k = 0; k < cells.length; k++) {
      var i = cells[k], cur = state[i], nv = applyTarget(cur, target, mode);
      if (nv === cur) continue;
      if (sol) {
        if (nv === 1 && !sol[i]) { nv = 2; mistake = i; }
        else if (nv === 2 && sol[i]) { nv = 1; mistake = i; }
      }
      changes.push([i, cur, nv]); state[i] = nv;
      if (mistake >= 0) break;
    }
    return { changes: changes, mistake: mistake };
  }
  /** Parses a puzzle's rows ('.' empty, anything else filled with that colour key) into sol + colour keys. */
  function parsePuzzle(p) {
    var sol = [], colors = [];
    p.rows.forEach(function (r) { for (var i = 0; i < r.length; i++) { var ch = r.charAt(i); sol.push(ch === '.' ? 0 : 1); colors.push(ch === '.' ? null : ch); } });
    return { sol: sol, colors: colors };
  }

  function formatTime(ms) {
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60), hh = Math.floor(m / 60);
    s %= 60; if (hh) return hh + ':' + pad2(m % 60) + ':' + pad2(s);
    return m + ':' + pad2(s);
  }
  var COINS = { 5: 5, 8: 10, 10: 15, 12: 20, 15: 30, 20: 50 };
  function coinsFor(w, h) { var n = Math.max(w, h); if (n <= 5) return 5; if (n <= 8) return 10; if (n <= 10) return 15; if (n <= 12) return 20; if (n <= 15) return 30; return 50; }

  return {
    clueOf: clueOf, cluesOf: cluesOf, row: row, col: col, solveLine: solveLine, lineSolve: lineSolve,
    isLineSolvable: isLineSolvable, countSolutions: countSolutions, lineSatisfied: lineSatisfied, clueStatus: clueStatus,
    hashString: hashString, makeRng: makeRng, dateKey: dateKey, makeSolvable: makeSolvable, dailyPuzzle: dailyPuzzle,
    DAILY_SIZES: DAILY_SIZES, mosaicImage: mosaicImage, pickHintLine: pickHintLine, isWin: isWin, dragLine: dragLine, gestureTarget: gestureTarget,
    applyTarget: applyTarget, applyStroke: applyStroke, parsePuzzle: parsePuzzle, formatTime: formatTime, coinsFor: coinsFor, COINS: COINS
  };
});
