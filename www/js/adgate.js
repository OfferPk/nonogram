/*
 * AdGate: the single place that decides whether an interstitial may be shown.
 * Pure logic (no DOM, no SDK) so it runs in Node tests as well.
 *
 * Rules:
 *  - never before the player has completed INTERSTITIAL_MIN_PUZZLES solved puzzles
 *    AND accumulated INTERSTITIAL_MIN_PLAY_MS of play time
 *  - afterwards at most one every INTERSTITIAL_EVERY_N_PUZZLES solved puzzles
 *  - and at most one per INTERSTITIAL_MIN_INTERVAL_MS
 *  - it is only ever asked on the puzzle-complete transition (see game.js), never mid-puzzle,
 *    never on launch, exit or back press.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdGate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DEFAULTS = {
    INTERSTITIAL_MIN_PUZZLES: 5,
    INTERSTITIAL_MIN_PLAY_MS: 180000,
    INTERSTITIAL_EVERY_N_PUZZLES: 3,
    INTERSTITIAL_MIN_INTERVAL_MS: 90000
  };

  function create(cfg, state) {
    var c = {};
    Object.keys(DEFAULTS).forEach(function (k) { c[k] = (cfg && cfg[k] != null) ? cfg[k] : DEFAULTS[k]; });
    var s = state || {};
    if (typeof s.puzzlesSince !== 'number') s.puzzlesSince = 0;
    if (typeof s.lastTs !== 'number') s.lastTs = 0;
    if (typeof s.playMs !== 'number') s.playMs = 0;
    if (typeof s.puzzlesCompleted !== 'number') s.puzzlesCompleted = 0;

    return {
      state: s,
      config: c,
      addPlayTime: function (ms) { if (ms > 0 && ms < 60000) s.playMs += ms; },
      puzzleCompleted: function () { s.puzzlesSince++; s.puzzlesCompleted++; },
      /** May an interstitial be shown right now (called only on the puzzle-complete transition)? */
      canShow: function (now) {
        if (s.puzzlesCompleted < c.INTERSTITIAL_MIN_PUZZLES) return false;
        if (s.playMs < c.INTERSTITIAL_MIN_PLAY_MS) return false;
        if (s.puzzlesSince < c.INTERSTITIAL_EVERY_N_PUZZLES) return false;
        if (s.lastTs > now) s.lastTs = now; // clock moved backwards: restart the interval
        if (s.lastTs && now - s.lastTs < c.INTERSTITIAL_MIN_INTERVAL_MS) return false;
        return true;
      },
      shown: function (now) { s.puzzlesSince = 0; s.lastTs = now; }
    };
  }
  return { create: create, DEFAULTS: DEFAULTS };
});
