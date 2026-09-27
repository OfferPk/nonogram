/* Synthesized SFX with WebAudio (no audio files): soft pencil taps, gentle chimes. */
(function () {
  'use strict';
  var ctx = null, master = null, enabled = true;
  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  var noiseBuf = null;
  function noise(c) {
    if (noiseBuf) return noiseBuf;
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  // short filtered noise burst = thread "tick"
  function tick(t, freq, vol, dur) {
    var c = ctx, src = c.createBufferSource(); src.buffer = noise(c);
    var f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 8;
    var g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.02);
  }
  // inharmonic partials = metal "ting"
  function ting(t, base, vol, dur) {
    var c = ctx, ratios = [1, 2.76, 5.4, 8.93];
    ratios.forEach(function (r, i) {
      var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = base * r;
      var g = c.createGain(); var v = vol / (i + 1.3);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur / (1 + i * 0.6));
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  function thud(t, vol) {
    var c = ctx, o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    var g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.2);
  }
  var S = {
    setEnabled: function (v) { enabled = !!v; },
    unlock: function () { if (enabled) ac(); },
    select: function () { if (!enabled || !ac()) return; tick(ctx.currentTime, 2600, 0.12, 0.02); },
    place: function () { if (!enabled || !ac()) return; var t = ctx.currentTime; tick(t, 1500, 0.28, 0.04); tick(t + 0.015, 700, 0.14, 0.05); },
    note: function () { if (!enabled || !ac()) return; tick(ctx.currentTime, 3600, 0.14, 0.02); },
    erase: function () { if (!enabled || !ac()) return; var t = ctx.currentTime; tick(t, 900, 0.2, 0.06); },
    error: function () { if (!enabled || !ac()) return; thud(ctx.currentTime, 0.4); },
    unit: function () { if (!enabled || !ac()) return; var t = ctx.currentTime; [784, 988, 1175].forEach(function (f, i) { ting(t + i * 0.05, f, 0.12, 0.6); }); },
    hint: function () { if (!enabled || !ac()) return; var t = ctx.currentTime; ting(t, 1320, 0.14, 0.5); ting(t + 0.08, 1760, 0.12, 0.6); },
    win: function () { if (!enabled || !ac()) return; var t = ctx.currentTime; [523, 659, 784, 1046, 1318].forEach(function (f, i) { ting(t + i * 0.1, f, 0.22, 1.3); }); },
    lose: function () { if (!enabled || !ac()) return; var t = ctx.currentTime; [523, 440, 349].forEach(function (f, i) { ting(t + i * 0.16, f, 0.2, 1.0); }); },
    click: function () { if (!enabled || !ac()) return; tick(ctx.currentTime, 3200, 0.18, 0.025); },
    coin: function () { if (!enabled || !ac()) return; var t = ctx.currentTime; ting(t, 1760, 0.18, 0.3); ting(t + 0.07, 2350, 0.16, 0.35); }
  };
  window.SFX = S;
})();
