/* Crowd sound for The All-Time Sports Arena — synthesized in the browser, no audio files. */
(function (root) {
  'use strict';
  let ctx = null, master = null, bed = null, bedGain = null, on = false, vol = 0.6;

  function noiseBuffer(sec, pink) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (pink) { b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18; }
        else d[i] = w * 0.5;
      }
    }
    return buf;
  }

  function init() {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);
    root.__arenaNoise = noiseBuffer(4, true);
    return true;
  }

  function startBed() {
    if (!ctx || bed) return;
    bed = ctx.createBufferSource(); bed.buffer = root.__arenaNoise; bed.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 900; lp.Q.value = 0.5;
    bedGain = ctx.createGain(); bedGain.gain.value = 0.0;
    bed.connect(lp); lp.connect(bedGain); bedGain.connect(master); bed.start();
    bedGain.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 1.5);
  }
  function stopBed() { if (bed) { try { bed.stop(); } catch (e) { /* already stopped */ } bed = null; } }

  // one crowd swell: freq band, peak level, attack, length
  function swell(opts) {
    if (!on || !ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = root.__arenaNoise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = opts.f || 1100; bp.Q.value = opts.q || 0.7;
    const g = ctx.createGain(); g.gain.value = 0.0001;
    src.connect(bp); bp.connect(g); g.connect(master);
    if (opts.trem) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = opts.trem; const lg = ctx.createGain(); lg.gain.value = opts.peak * 0.35;
      lfo.connect(lg); lg.connect(g.gain); lfo.start(t); lfo.stop(t + opts.len + 0.2);
    }
    if (opts.sweep) bp.frequency.linearRampToValueAtTime(opts.sweep, t + opts.len);
    g.gain.exponentialRampToValueAtTime(opts.peak, t + (opts.atk || 0.15));
    g.gain.setValueAtTime(opts.peak, t + opts.len * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t + opts.len);
    src.start(t); src.stop(t + opts.len + 0.1);
  }

  function crack() {
    if (!on || !ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = root.__arenaNoise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    src.connect(hp); hp.connect(g); g.connect(master); src.start(t, Math.random()); src.stop(t + 0.1);
  }

  function note(freq, start, len, type, level) {
    const o = ctx.createOscillator(); o.type = type || 'square'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(level || 0.08, start + 0.02); g.gain.setValueAtTime(level || 0.08, start + len * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, start + len);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(master);
    o.start(start); o2.start(start); o.stop(start + len + 0.05); o2.stop(start + len + 0.05);
  }
  // an original rising organ riff (not any real stadium tune)
  function organ() {
    if (!on || !ctx) return;
    const t = ctx.currentTime + 0.05;
    const seq = [[349.2, 0.16], [440, 0.16], [523.3, 0.16], [440, 0.16], [523.3, 0.16], [698.5, 0.5]];
    let s = t; seq.forEach(([f, l]) => { note(f, s, l, 'square', 0.06); s += l + 0.03; });
  }

  const S = {
    enable() { if (!init()) return false; if (ctx.state === 'suspended') ctx.resume(); on = true; startBed(); return true; },
    disable() { on = false; stopBed(); },
    isOn() { return on; },
    setVolume(v) { vol = v; if (master) master.gain.value = v; },
    play(kind) {
      if (!on) return;
      switch (kind) {
        case 'crack': crack(); break;
        case 'cheer': crack(); swell({ f: 1200, peak: 0.55, len: 2.2, sweep: 1500 }); break;
        case 'roar': crack(); swell({ f: 1000, peak: 0.9, len: 4.2, sweep: 1600, atk: 0.3 }); swell({ f: 2200, peak: 0.35, len: 3.6, atk: 0.4 }); break;
        case 'cheerDef': swell({ f: 1300, peak: 0.4, len: 1.8 }); break;
        case 'boo': swell({ f: 320, q: 1.2, peak: 0.6, len: 2.6, trem: 5, atk: 0.35 }); break;
        case 'groan': swell({ f: 700, peak: 0.35, len: 1.6, sweep: 300, atk: 0.1 }); break;
        case 'buzz': swell({ f: 1000, peak: 0.25, len: 2.5, sweep: 1400, atk: 1.2 }); break;
        case 'organ': organ(); break;
        default: break;
      }
    },
  };
  root.ArenaSound = S;
})(window);
