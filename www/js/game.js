/*
 * Quillpix game controller: screens, board rendering, input (tap / drag-a-line / cross / pinch-zoom / pan),
 * undo/redo, mistake or free mode, timer, auto-save + resume, colour reveal, stats, themes, daily puzzle, ads hooks.
 * Pure puzzle rules live in logic.js (NL); puzzle data in puzzles.js (PUZZLES).
 */
(function () {
  'use strict';
  var L = window.NL, D = window.PUZZLES, PAL = D.palette;
  var KEY = 'quillpix.save.v1';
  var $ = function (id) { return document.getElementById(id); };
  var TOTAL = D.packs.reduce(function (a, p) { return a + p.puzzles.length; }, 0);
  var BY_ID = {};
  D.packs.forEach(function (pk) { pk.puzzles.forEach(function (p, i) { BY_ID[p.id] = { p: p, pack: pk, index: i }; }); });

  // ---------------- save ----------------
  function defaults() {
    return {
      v: 1, coins: 0, owned: ['paper', 'midnight'], theme: 'paper',
      settings: { mistakes: true, autox: true, hl: true, timer: true, sound: true, haptics: true },
      solved: {}, progress: {}, current: null,
      stats: { solved: 0, flawless: 0, totalMs: 0, hints: 0, mistakes: 0, sizes: {} },
      daily: { done: {}, streak: 0, best: 0, last: null }, ad: {}, seenHowto: false
    };
  }
  var save = (function () {
    var d = defaults();
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.v === 1) {
        Object.keys(d).forEach(function (k) { if (s[k] === undefined) s[k] = d[k]; });
        Object.keys(d.settings).forEach(function (k) { if (s.settings[k] === undefined) s.settings[k] = d.settings[k]; });
        Object.keys(d.stats).forEach(function (k) { if (s.stats[k] === undefined) s.stats[k] = d.stats[k]; });
        return s;
      }
    } catch (e) {}
    return d;
  })();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }

  var cfg = window.ADS_CONFIG || {};
  var gate = window.AdGate.create(cfg, save.ad);
  save.ad = gate.state;

  // ---------------- helpers ----------------
  function haptic() { if (!save.settings.haptics) return; try { var H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics; if (H) H.impact({ style: 'LIGHT' }); else if (navigator.vibrate) navigator.vibrate(8); } catch (e) {} }
  function sfx(name) { try { if (window.SFX) window.SFX[name](); } catch (e) {} }
  var toastT = null;
  function toast(msg, ms) { var t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.add('hidden'); }, ms || 1800); }
  function sizeKey(p) { return p.w + '×' + p.h; }
  function colorOf(p, key) { return (p.palette && p.palette[key]) || PAL[key] || '#555'; }
  function parseKeyDate(k) { var a = k.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function getPuzzle(id) {
    if (!id) return null;
    if (id.indexOf('daily-') === 0) { var p = L.dailyPuzzle(parseKeyDate(id.slice(6))); return p ? { p: p, pack: null, index: 0 } : null; }
    return BY_ID[id] || null;
  }
  function packName(entry) { return entry.pack ? entry.pack.name : 'Daily'; }
  function fmtDate(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }

  /** Draw a puzzle picture on a canvas. state (optional) = draw the player's marks in one colour instead. */
  function drawArt(cv, p, state, fillColor) {
    var ctx = cv.getContext('2d'), n = Math.max(p.w, p.h), W = cv.width, s = W / n, ox = (W - p.w * s) / 2, oy = (W - p.h * s) / 2;
    ctx.clearRect(0, 0, W, W);
    for (var r = 0; r < p.h; r++) for (var c = 0; c < p.w; c++) {
      var ch = p.rows[r].charAt(c), i = r * p.w + c;
      if (state) { if (state[i] !== 1) continue; ctx.fillStyle = fillColor; }
      else { if (ch === '.') continue; ctx.fillStyle = colorOf(p, ch); }
      ctx.fillRect(Math.floor(ox + c * s), Math.floor(oy + r * s), Math.ceil(s), Math.ceil(s));
    }
  }
  function cssVar(name) { return getComputedStyle(document.body).getPropertyValue(name).trim(); }

  // ---------------- screens & history ----------------
  var screen = 'home', depth = 0;
  var SCREENS = ['home', 'packs', 'pack', 'game'];
  function show(name) {
    if (screen === 'game' && name !== 'game') leaveGameScreen();
    screen = name;
    SCREENS.forEach(function (s) { $(s).classList.toggle('hidden', s !== name); });
    closeOverlays();
    if (name === 'home') renderHome();
    if (name === 'packs') renderPacks();
    if (name === 'pack') renderPack();
    if (name === 'game') { layout(true); requestAnimationFrame(function () { layout(true); }); window.Ads.showBanner(); } else { window.Ads.hideBanner(); }
  }
  function go(name) { depth++; try { history.pushState({ s: name, d: depth }, ''); } catch (e) {} show(name); }
  function back() { if (depth > 0) history.back(); else show('home'); }
  function goHome() { if (depth > 0) history.go(-depth); else show('home'); }
  window.addEventListener('popstate', function (e) {
    var st = e.state || { s: 'home', d: 0 };
    depth = st.d || 0;
    if (st.s === 'game' && !G) st.s = 'home';
    if (st.s === 'pack' && !curPack) st.s = 'packs';
    show(st.s);
  });
  var OVERLAYS = ['pause', 'complete', 'outl', 'confirm', 'stats', 'shop', 'settings', 'howto'];
  function closeOverlays() { OVERLAYS.forEach(function (o) { $(o).classList.add('hidden'); }); document.body.classList.remove('paused'); }
  function openOverlay(id) { $(id).classList.remove('hidden'); }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { $(b.getAttribute('data-close')).classList.add('hidden'); sfx('click'); if (b.getAttribute('data-close') === 'shop' || b.getAttribute('data-close') === 'settings') refreshCoins(); }); });
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { sfx('click'); back(); }); });

  // ---------------- home ----------------
  function refreshCoins() { document.querySelectorAll('.coins-val').forEach(function (e) { e.textContent = save.coins; }); }
  function solvedCount() { return Object.keys(save.solved).filter(function (k) { return BY_ID[k]; }).length; }
  function renderHome() {
    refreshCoins();
    var today = new Date(), key = L.dateKey(today), size = L.DAILY_SIZES[today.getDay()];
    $('daily-date').textContent = fmtDate(today);
    $('daily-sub').textContent = size + '×' + size + (save.daily.streak ? ' · streak ' + currentDailyStreak() : '');
    var done = !!save.daily.done[key], st = $('daily-state');
    st.textContent = done ? '✓ Solved' : (save.progress['daily-' + key] ? 'Resume' : 'Play');
    st.classList.toggle('done', done);
    var cur = save.current && save.progress[save.current] ? getPuzzle(save.current) : null;
    $('btn-continue').classList.toggle('hidden', !cur);
    if (cur) $('continue-sub').textContent = packName(cur) + ' · ' + sizeKey(cur.p) + ' · ' + L.formatTime(save.progress[save.current].t || 0);
    $('play-sub').textContent = solvedCount() + ' / ' + TOTAL + ' solved';
  }
  function currentDailyStreak() {
    var d = save.daily; if (!d.last) return 0;
    var y = new Date(); y.setDate(y.getDate() - 1);
    return (d.last === L.dateKey() || d.last === L.dateKey(y)) ? d.streak : 0;
  }
  function drawLogo() {
    var cv = $('logo-mark'), ctx = cv.getContext('2d'), W = cv.width;
    var art = ['.rr.rr.', 'rrrrPrr', 'rrrrrPr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
    ctx.fillStyle = cssVar('--surface') || '#fff'; ctx.fillRect(0, 0, W, W);
    var s = W / 9, line = cssVar('--line') || '#ddd';
    ctx.strokeStyle = line; ctx.lineWidth = 1;
    for (var i = 1; i < 9; i++) { ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, W); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(W, i * s); ctx.stroke(); }
    art.forEach(function (row, r) { for (var c = 0; c < 7; c++) { var ch = row.charAt(c); if (ch === '.') continue; ctx.fillStyle = ch === 'r' ? '#d1495b' : '#f3b1c2'; ctx.fillRect((c + 1) * s + 1, (r + 1) * s + 1, s - 2, s - 2); } });
  }
  $('btn-play').addEventListener('click', function () { sfx('click'); go('packs'); });
  $('btn-continue').addEventListener('click', function () { sfx('click'); if (startPuzzle(save.current)) go('game'); });
  function openDaily() { sfx('click'); if (startPuzzle('daily-' + L.dateKey())) go('game'); }
  $('daily-card').addEventListener('click', openDaily);
  $('daily-card').addEventListener('keydown', function (e) { if (e.key === 'Enter') openDaily(); });

  // ---------------- packs ----------------
  var curPack = null;
  function packSolved(pk) { return pk.puzzles.filter(function (p) { return save.solved[p.id]; }).length; }
  function renderPacks() {
    refreshCoins();
    var list = $('pack-list'); list.innerHTML = '';
    D.packs.forEach(function (pk) {
      var n = packSolved(pk), b = document.createElement('button');
      b.className = 'pack-card'; b.setAttribute('data-pack', pk.id);
      var cv = document.createElement('canvas'); cv.width = 60; cv.height = 60;
      var last = null; pk.puzzles.forEach(function (p) { if (save.solved[p.id]) last = p; });
      if (last) drawArt(cv, last); else drawPackIcon(cv, pk);
      var mid = document.createElement('div'); mid.className = 'pc-mid';
      mid.innerHTML = '<div class="pc-name"></div><div class="pc-desc"></div><div class="bar"><i></i></div>';
      mid.querySelector('.pc-name').textContent = pk.name; mid.querySelector('.pc-desc').textContent = pk.desc;
      mid.querySelector('.bar i').style.width = (100 * n / pk.puzzles.length) + '%';
      var cnt = document.createElement('div'); cnt.className = 'pc-count'; cnt.textContent = n + '/' + pk.puzzles.length;
      b.appendChild(cv); b.appendChild(mid); b.appendChild(cnt);
      b.addEventListener('click', function () { sfx('click'); curPack = pk; go('pack'); });
      list.appendChild(b);
    });
  }
  function drawPackIcon(cv, pk) {
    var ctx = cv.getContext('2d'), col = PAL[pk.icon] || '#888', s = cv.width / 5;
    var pat = ['.###.', '#.#.#', '#####', '#.#.#', '.###.'];
    ctx.globalAlpha = 0.55; ctx.fillStyle = col;
    pat.forEach(function (row, r) { for (var c = 0; c < 5; c++) if (row.charAt(c) === '#') ctx.fillRect(c * s + 1, r * s + 1, s - 2, s - 2); });
    ctx.globalAlpha = 1;
  }
  function renderPack() {
    var pk = curPack; if (!pk) return;
    $('pack-title').textContent = pk.name; $('pack-desc').textContent = pk.desc;
    $('pack-count').textContent = packSolved(pk) + '/' + pk.puzzles.length;
    var grid = $('pack-grid'); grid.innerHTML = '';
    pk.puzzles.forEach(function (p, i) {
      var t = document.createElement('button'); t.className = 'tile'; t.setAttribute('data-id', p.id);
      if (save.solved[p.id]) { t.classList.add('solved'); var cv = document.createElement('canvas'); cv.width = cv.height = 80; drawArt(cv, p); t.appendChild(cv); t.setAttribute('aria-label', p.name); }
      else { var q = document.createElement('span'); q.className = 'q'; q.textContent = '?'; t.appendChild(q); t.setAttribute('aria-label', 'Puzzle ' + (i + 1)); if (save.progress[p.id]) t.classList.add('inprog'); }
      var sz = document.createElement('span'); sz.className = 'sz'; sz.textContent = sizeKey(p); t.appendChild(sz);
      var num = document.createElement('span'); num.className = 'num'; num.textContent = i + 1; t.appendChild(num);
      t.addEventListener('click', function () { sfx('click'); if (startPuzzle(p.id)) go('game'); });
      grid.appendChild(t);
    });
  }

  // ---------------- game state ----------------
  var G = null;           // current game
  var cellEls = [], rowEls = [], colEls = [];
  var view = { base: 24, zoom: 1, cs: 24, tx: 0, ty: 0, maxZoom: 1 };
  var mode = 'fill';

  function startPuzzle(id, fresh) {
    var entry = getPuzzle(id); if (!entry) return false;
    var p = entry.p, parsed = L.parsePuzzle(p), cl = L.cluesOf(parsed.sol, p.w, p.h);
    var pr = !fresh && save.progress[id];
    G = {
      id: id, p: p, pack: entry.pack, index: entry.index, w: p.w, h: p.h, sol: parsed.sol, colors: parsed.colors,
      rows: cl.rows, cols: cl.cols, state: new Array(p.w * p.h).fill(0), elapsed: 0,
      mistakeMode: save.settings.mistakes, lives: 3, mistakes: 0, hints: 0, undo: [], redo: [], done: false, lost: false
    };
    if (pr) {
      for (var i = 0; i < G.state.length; i++) G.state[i] = +pr.s.charAt(i) || 0;
      G.elapsed = pr.t || 0; G.mistakeMode = pr.mm !== undefined ? pr.mm : G.mistakeMode; G.lives = pr.l !== undefined ? pr.l : 3;
      G.mistakes = pr.m || 0; G.hints = pr.h || 0; G.lost = G.mistakeMode && G.lives <= 0;
    }
    save.current = id;
    if (!pr) saveProgress();
    view.zoom = 1; view.tx = 0; view.ty = 0; mode = 'fill'; setMode('fill');
    buildBoard();
    $('g-pack').textContent = entry.pack ? entry.pack.name : 'Daily';
    $('g-size').textContent = sizeKey(p);
    updateHud();
    lastTick = Date.now();
    if (!save.seenHowto) { save.seenHowto = true; persist(); setTimeout(function () { openOverlay('howto'); }, 250); }
    if (G.lost) setTimeout(function () { openOverlay('outl'); }, 50);
    return true;
  }
  function saveProgress() {
    if (!G || G.done) return;
    save.progress[G.id] = { s: G.state.join(''), t: Math.round(G.elapsed), mm: G.mistakeMode, l: G.lives, m: G.mistakes, h: G.hints };
    save.current = G.id;
    persist();
  }
  function leaveGameScreen() { if (G && !G.done) saveProgress(); document.body.classList.remove('paused'); }

  // ---------------- board ----------------
  function buildBoard() {
    var grid = $('grid'), rc = $('rowclues'), cc = $('colclues');
    grid.innerHTML = ''; rc.innerHTML = ''; cc.innerHTML = '';
    grid.classList.remove('reveal');
    grid.style.gridTemplateColumns = 'repeat(' + G.w + ', var(--cs))';
    cellEls = []; rowEls = []; colEls = [];
    var frag = document.createDocumentFragment();
    for (var r = 0; r < G.h; r++) for (var c = 0; c < G.w; c++) {
      var d = document.createElement('div'), i = r * G.w + c;
      d.className = 'c' + ((c % 5 === 4 && c < G.w - 1) ? ' b5r' : '') + ((r % 5 === 4 && r < G.h - 1) ? ' b5b' : '') + (c === G.w - 1 ? ' er' : '') + (r === G.h - 1 ? ' eb' : '');
      d.setAttribute('data-i', i); d.setAttribute('data-r', r); d.setAttribute('data-c', c);
      frag.appendChild(d); cellEls.push(d);
    }
    grid.appendChild(frag);
    function clueEl(cls, clue, idx) {
      var e = document.createElement('div'); e.className = cls; e.setAttribute('data-k', idx);
      (clue.length ? clue : [0]).forEach(function (n) { var s = document.createElement('span'); s.className = 'n'; s.textContent = n; e.appendChild(s); });
      return e;
    }
    G.rows.forEach(function (cl, r) { var e = clueEl('rc', cl, r); rc.appendChild(e); rowEls.push(e); });
    G.cols.forEach(function (cl, c) { var e = clueEl('cc', cl, c); cc.appendChild(e); colEls.push(e); });
    for (var k = 0; k < cellEls.length; k++) paintCell(k);
    for (r = 0; r < G.h; r++) updateClue('r', r);
    for (c = 0; c < G.w; c++) updateClue('c', c);
    layout(true);
    drawPreview();
  }
  function paintCell(i) {
    var e = cellEls[i], v = G.state[i];
    e.classList.toggle('f', v === 1); e.classList.toggle('x', v === 2);
  }
  function lineOf(t, k) { return t === 'r' ? L.row(G.state, G.w, k) : L.col(G.state, G.w, G.h, k); }
  function updateClue(t, k) {
    var el = (t === 'r' ? rowEls : colEls)[k], clue = (t === 'r' ? G.rows : G.cols)[k], line = lineOf(t, k);
    var sat = L.lineSatisfied(line, clue), st = clue.length ? L.clueStatus(line, clue) : [sat];
    var spans = el.children;
    for (var j = 0; j < spans.length; j++) spans[j].classList.toggle('done', !!st[j]);
    el.classList.toggle('sat', sat);
  }
  function drawPreview() {
    var cv = $('preview'); if (!G) return;
    drawArt(cv, G.p, G.done ? null : G.state, cssVar('--fill') || '#333');
  }

  // sizing: fit the board to the stage, then apply zoom; clue strips follow the grid when panning
  function clueFont(cs) { return Math.max(9, Math.min(15, Math.round(cs * 0.5))); }
  function dims(cs) {
    var cf = clueFont(cs), mr = 1, mc = 1;
    G.rows.forEach(function (c) { mr = Math.max(mr, c.length); }); G.cols.forEach(function (c) { mc = Math.max(mc, c.length); });
    var twoDigit = G.w >= 10 || G.h >= 10 ? 1.25 : 0.8;
    return { cf: cf, rw: Math.ceil(mr * cf * (0.45 + twoDigit * 0.6) + 10), ch: Math.ceil(mc * cf * 1.14 + 8) };
  }
  function layout(refit) {
    if (!G) return;
    var st = $('stage'), W = st.clientWidth - 16, H = st.clientHeight - 12;
    if (W <= 0 || H <= 0) return;
    if (refit) {
      var base = 8;
      for (var cs = 46; cs >= 8; cs--) { var d = dims(cs); if (d.rw + G.w * cs + 4 <= W && d.ch + G.h * cs + 4 <= H) { base = cs; break; } }
      view.base = base;
      view.maxZoom = Math.max(1, Math.min(3, 34 / base));
      if (view.zoom > view.maxZoom) view.zoom = view.maxZoom;
    }
    view.cs = Math.max(8, Math.round(view.base * view.zoom));
    var dd = dims(view.cs);
    var gw = G.w * view.cs + 4, gh = G.h * view.cs + 4;
    var vw = Math.min(W - dd.rw, gw), vh = Math.min(H - dd.ch, gh);
    view.vw = vw; view.vh = vh; view.gw = gw; view.gh = gh;
    clampPan();
    var s = document.body.style;
    s.setProperty('--cs', view.cs + 'px'); s.setProperty('--cf', dd.cf + 'px');
    s.setProperty('--rw', dd.rw + 'px'); s.setProperty('--ch', dd.ch + 'px');
    s.setProperty('--vw', vw + 'px'); s.setProperty('--vh', vh + 'px');
    applyPan();
    $('t-zoom').disabled = view.maxZoom <= 1.05;
    $('zoom-lbl').textContent = view.zoom > 1.01 ? '×' + view.zoom.toFixed(1) : 'Zoom';
  }
  function clampPan() {
    if (view.gw <= view.vw) view.tx = (view.vw - view.gw) / 2; else view.tx = Math.min(0, Math.max(view.vw - view.gw, view.tx));
    if (view.gh <= view.vh) view.ty = (view.vh - view.gh) / 2; else view.ty = Math.min(0, Math.max(view.vh - view.gh, view.ty));
  }
  function applyPan() {
    var s = document.body.style;
    s.setProperty('--tx', view.tx + 'px'); s.setProperty('--ty', view.ty + 'px');
    $('colclues').style.left = '2px'; $('rowclues').style.top = '2px';
  }
  function setZoom(z, cx, cy) {
    if (!G) return;
    z = Math.max(1, Math.min(view.maxZoom, z));
    if (cx === undefined) { cx = view.vw / 2; cy = view.vh / 2; }
    var ux = (cx - view.tx) / view.cs, uy = (cy - view.ty) / view.cs;
    view.zoom = z; layout(false);
    view.tx = cx - ux * view.cs; view.ty = cy - uy * view.cs; clampPan(); applyPan();
  }
  window.addEventListener('resize', function () { if (screen === 'game') layout(true); });
  $('t-zoom').addEventListener('click', function () {
    sfx('click');
    var levels = [1, Math.min(view.maxZoom, 1.6), view.maxZoom].filter(function (v, i, a) { return a.indexOf(v) === i; });
    var idx = levels.findIndex(function (v) { return Math.abs(v - view.zoom) < 0.05; });
    setZoom(levels[(idx + 1) % levels.length]);
  });

  // ---------------- input ----------------
  var stroke = null, pointers = {}, pinch = null;
  var vp = $('gridvp');
  function cellFromPoint(x, y, clamp) {
    var r = vp.getBoundingClientRect();
    var cx = Math.floor((x - r.left - view.tx - 2) / view.cs), cy = Math.floor((y - r.top - view.ty - 2) / view.cs);
    if (clamp) { cx = Math.max(0, Math.min(G.w - 1, cx)); cy = Math.max(0, Math.min(G.h - 1, cy)); }
    else if (cx < 0 || cy < 0 || cx >= G.w || cy >= G.h) return -1;
    return cy * G.w + cx;
  }
  function canPlay() { return G && !G.done && !G.lost && screen === 'game' && !document.body.classList.contains('paused'); }
  function beginStroke(i) {
    var m = mode;
    stroke = { start: i, last: i, mode: m, target: L.gestureTarget(m, G.state[i]), snapshot: G.state.slice(), changed: [], mistake: -1, closed: false };
    previewStroke([i]);
    highlight(i);
    sfx(stroke.target === 1 ? 'place' : stroke.target === 2 ? 'note' : 'erase');
  }
  function previewStroke(cells) {
    var s = stroke, touched = {};
    s.changed.forEach(function (i) { G.state[i] = s.snapshot[i]; touched[i] = 1; });
    var res = L.applyStroke(G.state, cells, s.target, s.mode, G.mistakeMode ? G.sol : null);
    s.changed = res.changes.map(function (c) { touched[c[0]] = 1; return c[0]; });
    s.mistake = res.mistake;
    Object.keys(touched).forEach(function (i) { paintCell(+i); });
    var lines = linesOf(Object.keys(touched).map(Number));
    lines.r.forEach(function (r) { updateClue('r', r); }); lines.c.forEach(function (c) { updateClue('c', c); });
    if (s.mistake >= 0) commitStroke();
  }
  function moveStroke(i) {
    if (!stroke || stroke.closed || i === stroke.last) return;
    stroke.last = i;
    var cells = L.dragLine(stroke.start, i, G.w);
    previewStroke(cells);
    highlight(i);
  }
  function linesOf(cells) {
    var r = {}, c = {};
    cells.forEach(function (i) { r[Math.floor(i / G.w)] = 1; c[i % G.w] = 1; });
    return { r: Object.keys(r).map(Number), c: Object.keys(c).map(Number) };
  }
  function commitStroke() {
    var s = stroke; if (!s || s.closed) return;
    s.closed = true;
    var changes = s.changed.map(function (i) { return [i, s.snapshot[i], G.state[i]]; }).filter(function (c) { return c[1] !== c[2]; });
    if (changes.length) {
      if (s.mistake >= 0) {
        G.mistakes++; save.stats.mistakes++;
        if (G.mistakeMode) G.lives = Math.max(0, G.lives - 1);
        var el = cellEls[s.mistake]; el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad');
        sfx('error'); haptic();
      } else haptic();
      finishChange(changes);
    }
  }
  /** Common tail of every change (stroke, hint, undo/redo): auto-cross, clues, save, win/lose checks. */
  function finishChange(changes, noUndo) {
    var extra = autoCross(changes);
    changes = changes.concat(extra);
    if (!noUndo) { G.undo.push(changes); if (G.undo.length > 400) G.undo.shift(); G.redo = []; }
    var lines = linesOf(changes.map(function (c) { return c[0]; }));
    lines.r.forEach(function (r) { updateClue('r', r); }); lines.c.forEach(function (c) { updateClue('c', c); });
    updateHud(); drawPreview();
    if (L.isWin(G.state, G.sol)) { onWin(); return; }
    saveProgress();
    if (G.mistakeMode && G.lives <= 0 && !G.lost) { G.lost = true; saveProgress(); sfx('lose'); setTimeout(function () { openOverlay('outl'); }, 450); }
  }
  function autoCross(changes) {
    if (!save.settings.autox) return [];
    var out = [], lines = linesOf(changes.map(function (c) { return c[0]; }));
    function doLine(cells, clue) {
      var line = cells.map(function (i) { return G.state[i]; });
      if (!L.lineSatisfied(line, clue)) return;
      cells.forEach(function (i) { if (G.state[i] === 0) { out.push([i, 0, 2]); G.state[i] = 2; paintCell(i); } });
    }
    lines.r.forEach(function (r) { var cells = []; for (var c = 0; c < G.w; c++) cells.push(r * G.w + c); doLine(cells, G.rows[r]); });
    lines.c.forEach(function (c) { var cells = []; for (var r = 0; r < G.h; r++) cells.push(r * G.w + c); doLine(cells, G.cols[c]); });
    if (out.length) { var l2 = linesOf(out.map(function (x) { return x[0]; })); l2.r.forEach(function (r) { updateClue('r', r); }); l2.c.forEach(function (c) { updateClue('c', c); }); }
    return out;
  }
  var hlCells = [], hlClues = [];
  function highlight(i) {
    hlCells.forEach(function (e) { e.classList.remove('hl'); }); hlClues.forEach(function (e) { e.classList.remove('hl'); });
    hlCells = []; hlClues = [];
    if (i < 0 || !G) return;
    var r = Math.floor(i / G.w), c = i % G.w;
    hlClues = [rowEls[r], colEls[c]]; hlClues.forEach(function (e) { e.classList.add('hl'); });
    if (save.settings.hl) {
      for (var k = 0; k < G.w; k++) hlCells.push(cellEls[r * G.w + k]);
      for (k = 0; k < G.h; k++) hlCells.push(cellEls[k * G.w + c]);
      hlCells.forEach(function (e) { e.classList.add('hl'); });
    }
  }
  function cancelStroke() {
    if (!stroke) return;
    if (!stroke.closed) { stroke.changed.forEach(function (i) { G.state[i] = stroke.snapshot[i]; paintCell(i); }); for (var r = 0; r < G.h; r++) updateClue('r', r); for (var c = 0; c < G.w; c++) updateClue('c', c); }
    stroke = null;
  }
  vp.addEventListener('pointerdown', function (e) {
    if (!G) return;
    e.preventDefault();
    try { vp.setPointerCapture(e.pointerId); } catch (x) {}
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      if (stroke && !stroke.closed && stroke.changed.length <= 1) cancelStroke(); else if (stroke) { commitStroke(); stroke = null; }
      highlight(-1);
      var a = pointers[ids[0]], b = pointers[ids[1]], rct = vp.getBoundingClientRect();
      pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: view.zoom, mx: (a.x + b.x) / 2 - rct.left, my: (a.y + b.y) / 2 - rct.top, tx0: view.tx, ty0: view.ty, cs0: view.cs };
      return;
    }
    if (ids.length > 2 || pinch) return;
    if (!canPlay()) return;
    var i = cellFromPoint(e.clientX, e.clientY, false);
    if (i >= 0) beginStroke(i);
  });
  vp.addEventListener('pointermove', function (e) {
    if (!pointers[e.pointerId]) return;
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (pinch) {
      var ids = Object.keys(pointers); if (ids.length < 2) return;
      var a = pointers[ids[0]], b = pointers[ids[1]], rct = vp.getBoundingClientRect();
      var d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2 - rct.left, my = (a.y + b.y) / 2 - rct.top;
      var z = Math.max(1, Math.min(view.maxZoom, pinch.z0 * d / pinch.d0));
      var ux = (pinch.mx - pinch.tx0) / pinch.cs0, uy = (pinch.my - pinch.ty0) / pinch.cs0;
      view.zoom = z; layout(false);
      view.tx = mx - ux * view.cs; view.ty = my - uy * view.cs; clampPan(); applyPan();
      return;
    }
    if (stroke && canPlay()) moveStroke(cellFromPoint(e.clientX, e.clientY, true));
  });
  function endPointer(e) {
    if (!pointers[e.pointerId]) return;
    delete pointers[e.pointerId];
    if (pinch) { if (Object.keys(pointers).length === 0) pinch = null; return; }
    if (stroke) { commitStroke(); stroke = null; }
    highlight(-1);
  }
  vp.addEventListener('pointerup', endPointer);
  vp.addEventListener('pointercancel', function (e) { if (stroke && !stroke.closed) cancelStroke(); stroke = null; endPointer(e); });
  vp.addEventListener('wheel', function (e) {
    if (!G) return; e.preventDefault();
    var r = vp.getBoundingClientRect();
    if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey && view.zoom <= 1.01 && e.deltaY < 0) setZoom(view.zoom * (e.deltaY < 0 ? 1.15 : 0.87), e.clientX - r.left, e.clientY - r.top);
    else { view.tx -= e.deltaX || (e.shiftKey ? e.deltaY : 0); view.ty -= e.shiftKey ? 0 : e.deltaY; clampPan(); applyPan(); }
  }, { passive: false });

  function setMode(m) {
    mode = m;
    $('m-fill').classList.toggle('on', m === 'fill'); $('m-cross').classList.toggle('on', m === 'cross');
    $('m-fill').setAttribute('aria-checked', m === 'fill'); $('m-cross').setAttribute('aria-checked', m === 'cross');
  }
  $('m-fill').addEventListener('click', function () { sfx('click'); setMode('fill'); });
  $('m-cross').addEventListener('click', function () { sfx('click'); setMode('cross'); });

  function applyChanges(list, dir) {
    list.forEach(function (c) { G.state[c[0]] = dir < 0 ? c[1] : c[2]; paintCell(c[0]); });
    var lines = linesOf(list.map(function (c) { return c[0]; }));
    lines.r.forEach(function (r) { updateClue('r', r); }); lines.c.forEach(function (c) { updateClue('c', c); });
    drawPreview(); updateHud();
    if (L.isWin(G.state, G.sol)) { onWin(); return; }
    saveProgress();
  }
  function undo() { if (!canPlay() || !G.undo.length) return; var ch = G.undo.pop(); G.redo.push(ch); applyChanges(ch.slice().reverse(), -1); sfx('erase'); }
  function redo() { if (!canPlay() || !G.redo.length) return; var ch = G.redo.pop(); G.undo.push(ch); applyChanges(ch, 1); sfx('place'); }
  $('t-undo').addEventListener('click', undo);
  $('t-redo').addEventListener('click', redo);
  document.addEventListener('keydown', function (e) {
    if (screen !== 'game') return;
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'x') setMode(mode === 'fill' ? 'cross' : 'fill');
  });

  // ---------------- HUD / timer ----------------
  function updateHud() {
    if (!G) return;
    var lv = $('g-lives');
    if (G.mistakeMode) { lv.classList.remove('free'); lv.innerHTML = ''; for (var i = 0; i < 3; i++) { var s = document.createElement(i < G.lives ? 'span' : 'i'); s.textContent = '♥'; lv.appendChild(s); } lv.parentNode.querySelector('.lbl').textContent = 'Lives'; }
    else { lv.classList.add('free'); lv.textContent = 'Free'; lv.parentNode.querySelector('.lbl').textContent = 'Mode'; }
    $('g-time').textContent = L.formatTime(G.elapsed);
    $('t-undo').disabled = !G.undo.length; $('t-redo').disabled = !G.redo.length;
  }
  var lastTick = Date.now(), saveTick = 0;
  setInterval(function () {
    var now = Date.now(), dt = now - lastTick; lastTick = now;
    if (!G || screen !== 'game' || G.done || G.lost || document.body.classList.contains('paused') || document.visibilityState !== 'visible') return;
    if (!$('howto').classList.contains('hidden')) return;
    if (dt > 0 && dt < 5000) { G.elapsed += dt; gate.addPlayTime(dt); save.stats.totalMs += dt; }
    $('g-time').textContent = L.formatTime(G.elapsed);
    if (++saveTick % 5 === 0) saveProgress();
  }, 1000);
  document.addEventListener('visibilitychange', function () { lastTick = Date.now(); if (document.visibilityState !== 'visible' && G && screen === 'game' && !G.done) { saveProgress(); if (!G.lost) pause(); } });

  function pause() {
    if (!G || G.done) return;
    document.body.classList.add('paused');
    $('pause-time').textContent = L.formatTime(G.elapsed);
    $('pause-sub').textContent = (G.pack ? G.pack.name : 'Daily') + ' · ' + sizeKey(G.p);
    openOverlay('pause');
    saveProgress();
  }
  $('btn-pause').addEventListener('click', function () { sfx('click'); pause(); });
  $('btn-resume').addEventListener('click', function () { sfx('click'); $('pause').classList.add('hidden'); document.body.classList.remove('paused'); lastTick = Date.now(); });
  function confirmBox(title, text, yes, cb) {
    $('confirm-title').textContent = title; $('confirm-text').textContent = text; $('confirm-yes').textContent = yes;
    openOverlay('confirm');
    $('confirm-yes').onclick = function () { $('confirm').classList.add('hidden'); cb(); };
    $('confirm-no').onclick = function () { $('confirm').classList.add('hidden'); };
  }
  function restart() {
    delete save.progress[G.id]; persist();
    startPuzzle(G.id, true); closeOverlays();
  }
  $('btn-restart').addEventListener('click', function () { confirmBox('Restart puzzle?', 'All marks and the timer will be cleared.', 'Restart', restart); });
  $('btn-o-restart').addEventListener('click', function () { sfx('click'); restart(); });
  $('btn-o-home').addEventListener('click', function () { sfx('click'); goHome(); });
  $('btn-home').addEventListener('click', function () { sfx('click'); back(); });

  // ---------------- rewarded: hint & extra life (only from these taps) ----------------
  function revealLine() {
    var pick = L.pickHintLine(G.state, G.sol, G.w, G.h);
    if (!pick) { toast('Nothing left to reveal'); return; }
    var cells = [], k;
    if (pick.type === 'row') for (k = 0; k < G.w; k++) cells.push(pick.index * G.w + k);
    else for (k = 0; k < G.h; k++) cells.push(k * G.w + pick.index);
    var changes = [];
    cells.forEach(function (i) { var want = G.sol[i] ? 1 : 2; if (G.state[i] !== want) { changes.push([i, G.state[i], want]); G.state[i] = want; } paintCell(i); var e = cellEls[i]; e.classList.remove('hint'); void e.offsetWidth; e.classList.add('hint'); });
    G.hints++; save.stats.hints++;
    sfx('hint');
    toast((pick.type === 'row' ? 'Row ' : 'Column ') + (pick.index + 1) + ' revealed');
    finishChange(changes);
  }
  $('t-hint').addEventListener('click', function () {
    if (!canPlay()) return;
    sfx('click');
    window.Ads.showRewarded(function () { if (G && !G.done) revealLine(); }, function () { toast('No video available right now. Try again soon.'); });
  });
  $('btn-extra').addEventListener('click', function () {
    sfx('click');
    window.Ads.showRewarded(function () {
      if (!G) return;
      G.lives = 1; G.lost = false; saveProgress(); updateHud();
      $('outl').classList.add('hidden'); lastTick = Date.now(); toast('Extra life: carry on!');
    }, function () { toast('No video available right now. Try again soon.'); });
  });

  // ---------------- win ----------------
  function onWin() {
    if (G.done) return;
    G.done = true; stroke = null; highlight(-1);
    var ms = Math.round(G.elapsed), flawless = !G.mistakes && !G.hints, first = !save.solved[G.id];
    var coins = first ? L.coinsFor(G.w, G.h) + (G.p.daily ? 10 : 0) : 0;
    var st = save.stats, sk = sizeKey(G.p), z = st.sizes[sk] || (st.sizes[sk] = { n: 0, best: 0, total: 0 });
    var prevBest = z.best;
    z.n++; z.total += ms; if (!z.best || ms < z.best) z.best = ms;
    st.solved++; if (flawless) st.flawless++;
    if (G.p.daily) {
      var dd = save.daily, key = G.p.key;
      if (!dd.done[key]) {
        dd.done[key] = ms;
        var y = parseKeyDate(key); y.setDate(y.getDate() - 1);
        dd.streak = dd.last === L.dateKey(y) ? dd.streak + 1 : 1; dd.last = key; dd.best = Math.max(dd.best, dd.streak);
      }
    }
    var prev = save.solved[G.id];
    save.solved[G.id] = { ms: prev ? Math.min(prev.ms, ms) : ms, f: flawless || !!(prev && prev.f) };
    save.coins += coins;
    delete save.progress[G.id];
    if (save.current === G.id) save.current = null;
    gate.puzzleCompleted();
    persist();
    if (gate.state.puzzlesCompleted >= (cfg.INTERSTITIAL_MIN_PUZZLES || 5) - 1) window.Ads.prepareInterstitial();
    sfx('win'); haptic();
    // colour reveal: a diagonal wave paints every square with the picture's colours
    var grid = $('grid'), empty = cssVar('--empty-rev') || '#eee';
    cellEls.forEach(function (e, i) {
      var r = Math.floor(i / G.w), c = i % G.w;
      e.style.setProperty('--rc', G.sol[i] ? colorOf(G.p, G.colors[i]) : empty);
      e.style.setProperty('--d', ((r + c) * 28) + 'ms');
    });
    requestAnimationFrame(function () { grid.classList.add('reveal'); });
    drawPreview();
    $('c-title').textContent = G.p.name;
    $('c-kicker').textContent = G.p.daily ? 'DAILY PUZZLE SOLVED' : (flawless ? 'FLAWLESS' : 'PUZZLE SOLVED');
    $('c-time').textContent = L.formatTime(ms);
    $('c-best').textContent = L.formatTime(z.best);
    $('c-coins').textContent = '+' + coins;
    var notes = [];
    if (prevBest && ms < prevBest) notes.push('New best time for ' + sk + '!');
    if (G.p.daily) notes.push('Daily streak: ' + save.daily.streak);
    if (!first) notes.push('Replayed: coins are earned on the first solve.');
    $('c-note').textContent = notes.join(' · ');
    var nx = nextPuzzleId();
    $('c-next-sub').textContent = nx ? (BY_ID[nx].pack.name + ' · ' + sizeKey(BY_ID[nx].p)) : 'All puzzles solved!';
    $('btn-c-next').disabled = !nx;
    drawArt($('c-art'), G.p);
    var delay = (G.w + G.h) * 28 + 900;
    setTimeout(function () { if (G && G.done && screen === 'game') openOverlay('complete'); }, delay);
  }
  function nextPuzzleId() {
    var list = [];
    D.packs.forEach(function (pk) { pk.puzzles.forEach(function (p) { list.push(p.id); }); });
    var start = G && G.pack ? list.indexOf(G.id) + 1 : 0;
    for (var k = 0; k < list.length; k++) { var id = list[(start + k) % list.length]; if (!save.solved[id] && id !== (G && G.id)) return id; }
    return null;
  }
  /** The ONLY place an interstitial may be requested: leaving the puzzle-complete screen (AdGate decides). */
  function leaveComplete(action) {
    $('complete').classList.add('hidden');
    window.Ads.maybeInterstitial(gate).then(function () {
      persist();
      if (action === 'next') { var nx = nextPuzzleId(); if (nx && startPuzzle(nx)) { if (BY_ID[nx]) curPack = BY_ID[nx].pack; return; } }
      goHome();
    });
  }
  $('btn-c-next').addEventListener('click', function () { sfx('click'); leaveComplete('next'); });
  $('btn-c-home').addEventListener('click', function () { sfx('click'); leaveComplete('home'); });

  // ---------------- stats ----------------
  function openStats() {
    var st = save.stats, b = $('stats-body');
    var tiles = [
      [solvedCount() + ' / ' + TOTAL, 'Puzzles solved'], [st.flawless, 'Flawless solves'],
      [L.formatTime(st.totalMs), 'Total play time'], [st.hints, 'Lines revealed'],
      [currentDailyStreak(), 'Daily streak'], [save.daily.best, 'Best daily streak']
    ];
    b.innerHTML = '';
    tiles.forEach(function (t) { var d = document.createElement('div'); var x = document.createElement('b'); x.textContent = t[0]; var s = document.createElement('span'); s.textContent = t[1]; d.appendChild(x); d.appendChild(s); b.appendChild(d); });
    var tb = $('stats-sizes'); tb.innerHTML = '<div class="tr th"><span>Size</span><span>Solved</span><span>Best</span><span>Average</span></div>';
    ['5×5', '8×8', '10×10', '12×12', '15×15', '20×20'].forEach(function (k) {
      var z = st.sizes[k] || { n: 0, best: 0, total: 0 }, tr = document.createElement('div'); tr.className = 'tr';
      [k, z.n, z.n ? L.formatTime(z.best) : '–', z.n ? L.formatTime(z.total / z.n) : '–'].forEach(function (v) { var s = document.createElement('span'); s.textContent = v; tr.appendChild(s); });
      tb.appendChild(tr);
    });
    $('daily-stats').textContent = 'Daily puzzles solved: ' + Object.keys(save.daily.done).length;
    openOverlay('stats');
  }
  $('btn-stats').addEventListener('click', function () { sfx('click'); openStats(); });

  // ---------------- themes ----------------
  function applyTheme() {
    document.body.className = document.body.className.replace(/theme-\S+/g, '').trim() + ' theme-' + save.theme;
    if (!(window.Ads && window.Ads.isNative())) document.body.classList.add('web');
    document.body.classList.toggle('no-timer', !save.settings.timer);
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', cssVar('--bg') || '#f6f3ec');
    drawLogo();
    if (G && screen === 'game') drawPreview();
  }
  function renderShop() {
    var g = $('shop-grid'); g.innerHTML = '';
    window.THEMES.forEach(function (t) {
      var owned = save.owned.indexOf(t.id) >= 0, it = document.createElement('div');
      it.className = 'item' + (save.theme === t.id ? ' selected' : ''); it.setAttribute('data-theme', t.id);
      var prev = document.createElement('div'); prev.className = 'prev'; prev.style.background = t.swatch[0];
      var mini = document.createElement('div'); mini.className = 'mini'; mini.style.borderColor = t.swatch[1];
      var pat = [1, 1, 0, 2, 0, 1, 1, 0, 2, 1, 1, 1, 0, 0, 1, 2];
      pat.forEach(function (v) { var i = document.createElement('i'); if (v === 1) i.style.background = t.swatch[2]; if (v === 2) i.style.background = 'transparent'; mini.appendChild(i); });
      prev.appendChild(mini);
      var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = t.name + (t.dark ? ' · dark' : '');
      var btn = document.createElement('button'); btn.className = 'buy';
      if (save.theme === t.id) btn.textContent = 'In use';
      else if (owned) { btn.textContent = 'Use'; btn.classList.add('can'); }
      else { btn.innerHTML = '<span class="coin-ico"></span>' + t.price; if (save.coins >= t.price) btn.classList.add('can'); }
      btn.addEventListener('click', function () {
        if (save.theme === t.id) return;
        if (!owned) {
          if (save.coins < t.price) { toast('Solve more puzzles to earn ' + (t.price - save.coins) + ' more coins'); return; }
          save.coins -= t.price; save.owned.push(t.id); sfx('coin');
        } else sfx('click');
        save.theme = t.id; persist(); applyTheme(); refreshCoins(); renderShop();
      });
      it.appendChild(prev); it.appendChild(nm); it.appendChild(btn); g.appendChild(it);
    });
  }
  $('btn-shop').addEventListener('click', function () { sfx('click'); refreshCoins(); renderShop(); openOverlay('shop'); });

  // ---------------- settings ----------------
  var SET = { 'set-mistakes': 'mistakes', 'set-autox': 'autox', 'set-hl': 'hl', 'set-timer': 'timer', 'set-sound': 'sound', 'set-haptics': 'haptics' };
  Object.keys(SET).forEach(function (id) {
    $(id).addEventListener('change', function () {
      save.settings[SET[id]] = $(id).checked; persist();
      if (SET[id] === 'sound' && window.SFX) window.SFX.setEnabled(save.settings.sound);
      applyTheme();
    });
  });
  function openSettings() {
    Object.keys(SET).forEach(function (id) { $(id).checked = !!save.settings[SET[id]]; });
    $('btn-privacy-options').classList.toggle('hidden', !(window.Ads && window.Ads.privacyOptionsRequired()));
    openOverlay('settings');
  }
  $('btn-settings-home').addEventListener('click', function () { sfx('click'); openSettings(); });
  $('btn-howto').addEventListener('click', function () { $('settings').classList.add('hidden'); openOverlay('howto'); });
  $('btn-privacy-options').addEventListener('click', function () { window.Ads.showPrivacyOptions(); });
  $('btn-reset').addEventListener('click', function () {
    confirmBox('Reset everything?', 'Statistics, solved pictures, coins, themes and saved games will be deleted. This cannot be undone.', 'Reset', function () {
      var ad = save.ad; save = defaults(); save.ad = ad; gate = window.AdGate.create(cfg, save.ad); save.ad = gate.state; save.seenHowto = true;
      persist(); applyTheme(); G = null; $('settings').classList.add('hidden'); goHome(); renderHome(); toast('Progress reset');
    });
  });

  // ---------------- boot ----------------
  if (window.SFX) window.SFX.setEnabled(save.settings.sound);
  document.addEventListener('pointerdown', function () { if (window.SFX && save.settings.sound) window.SFX.unlock(); }, { once: true });
  applyTheme();
  try { history.replaceState({ s: 'home', d: 0 }, ''); } catch (e) {}
  show('home');
  window.Ads.init(); // UMP consent + SDK init only; no ad is shown on launch

  // test / debug hook (used by the headless browser test)
  window.__qp = {
    get game() { return G; }, get save() { return save; }, get gate() { return gate; }, get view() { return view; },
    L: L, D: D, nextPuzzleId: nextPuzzleId
  };
})();
