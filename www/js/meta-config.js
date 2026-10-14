/* Quillpix v1.1 meta wiring: Daily reward + challenge, achievements + stats, first-puzzle coach, accessibility. */
(function () {
  'use strict';
  var Q = window.__qp;
  if (!Q || !window.Meta) return;
  function g(st, k) { return st.m[k] || 0; }
  window.QUILLPIX_META = {
    key: 'quillpix.meta.v1', salt: 'quillpix', settingsAnchor: '#settings .panel-actions', previewBar: false,
    row: function (label, id, sub) { return '<label class="row"><span>' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span><input type="checkbox" id="' + id + '"><i class="sw"></i></label>'; },
    settingsButtons: '<div class="panel-actions col"><button id="btn-tour-again" class="btn plate">Replay tutorial</button></div>',
    sfx: function (k) { Q.sfx(k === 'coin' ? 'coin' : k === 'error' ? 'error' : 'click'); },
    toast: function (msg, ms) { Q.toast(msg, ms); },
    rewarded: function (ok, fail) { window.Ads.showRewarded(ok, fail); },
    wallet: { get: function () { return Q.save.coins; }, add: function (n) { Q.save.coins += n; Q.persist(); Q.refreshCoins(); } },
    winCoins: function () { return 0; }, // puzzles already pay coins on the first solve (game.js)
    bought: function () { return Math.max(0, Q.save.owned.length - 2) + (Q.save.ownedInk || []).length; },
    closeSettings: function () { document.getElementById('settings').classList.add('hidden'); },
    beforeCoach: function () {},
    onA11y: function () { Q.applyTheme(); try { window.dispatchEvent(new Event('resize')); } catch (e) {} },
    onWinStats: function (ach, d) {
      if (d.daily) ach.bump('dailies');
      if (d.size >= 15) ach.bump('big');
      if (d.ms < 180000) ach.bump('quick');
      ach.max('solved_total', Q.solvedCount());
    },
    coach: [
      { target: '#colstrip', text: 'Column clues: each number is a run of filled squares, top to bottom, with a gap between runs.' },
      { target: '#rowstrip', text: 'Row clues work the same way, left to right.' },
      { target: '#gridvp', text: 'Tap a square to fill it. Drag along a row or column to fill a whole line.' },
      { target: '#m-cross', text: 'Switch to ✕ to mark squares you know are empty.' },
      { target: '#t-undo', text: 'Undo and Redo fix any slip. Every puzzle solves with logic alone.' }
    ],
    challenges: [
      { id: 'daily', title: 'Daily Sketch', desc: "Solve today's Daily puzzle", count: 1, test: function (d) { return d.daily; } },
      { id: 'three', title: 'Three Pictures', desc: 'Solve 3 puzzles', count: 3, test: function () { return true; } },
      { id: 'flawless', title: 'Steady Quill', desc: 'Solve a puzzle with no mistakes or hints', count: 1, test: function (d) { return d.flawless; } },
      { id: 'big', title: 'Bigger Canvas', desc: 'Solve a puzzle of 10×10 or larger', count: 1, test: function (d) { return d.size >= 10; } },
      { id: 'quick', title: 'Quick Sketch', desc: 'Solve a puzzle in under 3 minutes', count: 1, test: function (d) { return d.ms < 180000; } }
    ],
    playChallenge: function (ch) { if (ch.id === 'daily') Q.openDaily(); else if (Q.screen !== 'game') Q.openPacks(); },
    achDefs: window.ACH_DEFS || [],
    stats: function (st) {
      var s = Q.save.stats;
      return [['Puzzles solved', Q.solvedCount() + ' / ' + Q.total], ['Flawless solves', String(s.flawless)],
        ['Daily puzzles solved', String(Object.keys(Q.save.daily.done).length)], ['15×15+ solved', String(g(st, 'big'))], ['Solved in under 3 min', String(g(st, 'quick'))]];
    }
  };
  window.Meta.init(window.QUILLPIX_META);
})();
