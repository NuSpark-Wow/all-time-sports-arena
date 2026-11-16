/* The All-Time Sports Arena — football dream teams.
   Builds a 45-man roster from every player who suited up for a franchise (or for any team) in a range of seasons,
   and rates the team from the real offenses and defenses those players starred on. */
(function (root) {
  'use strict';
  const SIZE = { QB: 3, RB: 4, WR: 5, TE: 2, OL: 8, DL: 7, LB: 6, CB: 5, S: 3, K: 1, P: 1 }; // 45
  const ORDER = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
  // how much each starter's real season counts toward the dream team's offense / defense
  const OFFW = { QB: [0.3], RB: [0.12], WR: [0.12, 0.09, 0.06], TE: [0.06], OL: [0.05, 0.05, 0.05, 0.05, 0.05] };
  const DEFW = { DL: [0.08, 0.08, 0.07, 0.07], LB: [0.08, 0.07, 0.06], CB: [0.12, 0.1], S: [0.09, 0.08] };
  let BONUS = 1.0;
  // fitted on every real team-season 1960-2025: points scored / allowed vs league against the starters' ratings
  const FIT = { oMean: 79.5, oB: 0.035, dMean: 71.4, dB: 0.036 };
  let MIX = +(typeof process !== 'undefined' && process.env && process.env.MIX) || 0.5; // share from players' ratings vs. from their real teams

  let POOL = null;
  function setPool(raw) {
    POOL = raw.map(([pid, n, g, f, hof, h, s]) => ({
      pid, n, g, f, hof: !!hof, h,
      seasons: s.split(',').map((x) => { const [yy, r] = x.split(':'); return { y: 1900 + +yy, r: +r }; }),
    }));
    return POOL;
  }

  // players available for a franchise (or 'ANY') between two seasons; each keeps his best seasons inside the range
  function candidates(fr, from, to) {
    const byPid = new Map();
    POOL.forEach((p) => {
      if (fr !== 'ANY' && p.f !== fr) return;
      const ss = p.seasons.filter((s) => s.y >= from && s.y <= to).map((s) => ({ y: s.y, r: s.r, f: p.f }));
      if (!ss.length) return;
      const key = p.pid + '|' + p.g;
      const cur = byPid.get(key);
      if (cur) { cur.ss = cur.ss.concat(ss); cur.fs.add(p.f); cur.hof = cur.hof || p.hof; cur.h += p.h; }
      else byPid.set(key, { pid: p.pid, n: p.n, g: p.g, hof: p.hof, h: p.h, ss, fs: new Set([p.f]) });
    });
    const out = [];
    byPid.forEach((c) => {
      c.ss.sort((a, b) => b.r - a.r);
      const top = c.ss.slice(0, 3);
      // peak: best three seasons, so one fluke year doesn't make a Hall of Famer
      c.peak = top.reduce((s, x) => s + x.r, 0) / top.length - (c.ss.length < 3 ? (3 - c.ss.length) * 1.5 : 0);
      c.best = c.ss[0];
      c.years = c.ss.map((s) => s.y);
      out.push(c);
    });
    return out.sort((a, b) => b.peak - a.peak || b.h - a.h);
  }

  // older rosters often list defensive backs only as "DB", so corners and safeties fill in for each other
  const SUBS = { S: ['CB'], CB: ['S'], TE: ['WR'], P: ['K'], K: ['P'], RB: ['WR'] };
  function autoPick(cands) {
    const pick = {}; const used = new Set();
    ORDER.forEach((g) => { pick[g] = cands.filter((c) => c.g === g).slice(0, SIZE[g]); pick[g].forEach((c) => used.add(c)); });
    ORDER.forEach((g) => {
      if (pick[g].length >= SIZE[g]) return;
      (SUBS[g] || []).forEach((alt) => {
        cands.filter((c) => c.g === alt && !used.has(c)).forEach((c) => { if (pick[g].length < SIZE[g]) { pick[g].push(c); used.add(c); } });
      });
    });
    return pick;
  }

  function span(c) { const ys = c.years.slice().sort((a, b) => a - b); return ys[0] === ys[ys.length - 1] ? String(ys[0]) : ys[0] + '–' + ys[ys.length - 1]; }

  // turn a picked roster into a team the engine can play
  function teamFrom(pick, idx, meta) {
    const lookup = (y, f) => (idx.teams[y] || []).find((t) => t.fr === f);
    const roster = [];
    ORDER.forEach((g) => (pick[g] || []).forEach((c) => {
      roster.push({ pos: g, n: c.n, ln: c.n.split(' ').pop(), r: Math.round(Math.min(95, c.peak)), star: c.peak >= 88 || c.hof, best: c.best, yrs: span(c), hof: c.hof });
    }));
    const wsum = (W, side) => {
      let lw = 0, tw = 0, rw = 0; const yrs = [];
      Object.keys(W).forEach((g) => {
        const list = roster.filter((p) => p.pos === g).sort((a, b) => b.r - a.r);
        W[g].forEach((w, i) => {
          const p = list[i]; if (!p) return;
          const t = lookup(p.best.y, p.best.f); if (!t) return;
          lw += w * Math.log(side === 'O' ? t.O : t.D); tw += w; rw += w * p.r; yrs.push([p.best.y, w]);
        });
      });
      // missing starters count as an ordinary player
      Object.keys(W).forEach((g) => { const have = roster.filter((p) => p.pos === g).length; W[g].forEach((w, i) => { if (i >= have) rw += w * 72; }); });
      const totW = Object.values(W).reduce((s, a) => s + a.reduce((x, y) => x + y, 0), 0);
      const R = rw / totW;
      const fromTeams = tw ? lw / tw : 0;
      const fromRatings = side === 'O' ? FIT.oB * (R - FIT.oMean) : -FIT.dB * (R - FIT.dMean);
      return { v: Math.exp((1 - MIX) * fromTeams + MIX * fromRatings), yrs, R };
    };
    const o = wsum(OFFW, 'O'), d = wsum(DEFW, 'D');
    const O = o.v * BONUS, D = d.v / BONUS;
    // the era the team "plays in" is the weighted middle of its starters' best seasons
    const all = o.yrs.concat(d.yrs).sort((a, b) => a[0] - b[0]);
    const half = all.reduce((s, x) => s + x[1], 0) / 2; let acc = 0, y = all.length ? all[0][0] : 1990;
    for (const [yy, w] of all) { acc += w; if (acc >= half) { y = yy; break; } }
    const lgs = all.map(([yy]) => idx.lgppg[yy]).filter(Boolean);
    const lg = lgs.length ? lgs.reduce((a, b) => a + b, 0) / lgs.length : 21;
    return {
      y, fr: meta.fr === 'ANY' ? 'ALL' : meta.fr, key: 'DREAM-' + meta.label, name: meta.label, nick: meta.nick, city: '',
      W: 0, L: 0, T: 0, G: 1, PF: +(O * lg).toFixed(1), PA: +(D * lg).toFixed(1), O, D, roster, dream: true, lgppg: lg, badge: 'dream',
    };
  }

  const api = { SIZE, ORDER, setPool, candidates, autoPick, teamFrom, span, setBonus(b) { BONUS = b; }, setMix(m) { MIX = m; }, pool: () => POOL };
  root.Arena = root.Arena || {}; root.Arena.fbDream = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
