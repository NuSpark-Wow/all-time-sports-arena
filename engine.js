/* The All-Time Sports Arena — baseball engine
   Every at-bat is decided by the batter's real rates vs the pitcher's real rates,
   each measured against their own league, then placed in a neutral game environment. */
(function (root) {
  'use strict';

  const POS = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  const EV = ['so', 'bb', 'hbp', 'hr', 'tr', 'db', 'sg'];
  // calibration from season-replay testing (sim vs real league totals)
  // neutral environment used to rank pitchers (wOBA allowed, 1.0 = league average)
  const QENV = { so: 0.15, bb: 0.085, hbp: 0.007, hr: 0.022, tr: 0.005, db: 0.045, sg: 0.155 };
  const CAL = { so: 0.985, bb: 1.04, hbp: 1, hr: 0.98, tr: 1.02, db: 1.02, sg: 1.02 };
  const BK = ['G', 'AB', 'H', '2B', '3B', 'HR', 'BB', 'SO', 'HBP', 'SB', 'CS', 'SH', 'SF', 'GIDP', 'R', 'RBI', 'IBB'];
  const PK = ['G', 'GS', 'IPOuts', 'H', 'ER', 'HR', 'BB', 'SO', 'HBP', 'BFP', 'W', 'L', 'SV', 'CG', 'WP'];

  let rng = Math.random;
  function setSeed(seed) {
    let s = seed >>> 0;
    rng = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const R = () => rng();
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  const odds = (p) => p / (1 - p);
  const prob = (o) => o / (1 + o);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function bs(row) { const o = {}; BK.forEach((k, i) => { o[k] = row.s[i]; }); return o; }
  function ps(row) { const o = {}; PK.forEach((k, i) => { o[k] = row.s[i]; }); return o; }

  /* ---------- league environment ---------- */
  function leagueRates(L) {
    const pa = L.pa || 1;
    const hbp = L.hbp != null ? L.hbp / pa : 0.006;
    const so = L.so != null ? L.so / pa : 0.07;
    const sg = (L.h - L.d - L.t - L.hr) / pa;
    const sbAtt = (L.sb != null && L.cs != null && L.sb + L.cs > 0) ? L.sb / (L.sb + L.cs) : 0.66;
    return {
      so, bb: L.bb / pa, hbp, hr: L.hr / pa, tr: L.t / pa, db: L.d / pa, sg,
      rpg: L.r && L.g ? L.r / L.g : 4.5, errPg: L.e && L.g ? L.e / L.g : 1.0, sbPct: sbAtt,
      sbPg: L.sb && L.g ? L.sb / L.g : 0.6,
    };
  }
  function blendEnv(a, b) { const o = {}; Object.keys(a).forEach((k) => { o[k] = (a[k] + b[k]) / 2; }); return o; }

  /* ---------- players ---------- */
  function relFrom(counts, pa, lg, K) {
    const rel = {};
    EV.forEach((e) => {
      const lr = lg[e];
      const c = counts[e];
      const rate = c == null ? lr : (c + K * lr) / (pa + K);
      rel[e] = odds(clamp(rate, 0.0005, 0.6)) / odds(lr);
    });
    return rel;
  }

  function makeBatter(row, lg) {
    const s = bs(row);
    const ab = s.AB || 0;
    const pa = ab + (s.BB || 0) + (s.HBP || 0) + (s.SF || 0) + (s.SH || 0);
    const games = row.pos;
    const pitchG = games[0];
    const fieldG = games.slice(1).reduce((a, b) => a + b, 0);
    const isPitcher = row.p === 1 && pitchG >= fieldG;
    const h = s.H || 0, d = s['2B'] || 0, t = s['3B'] || 0, hr = s.HR || 0;
    const counts = { so: s.SO, bb: s.BB, hbp: s.HBP, hr, tr: t, db: d, sg: h - d - t - hr };
    let rel;
    if (isPitcher) {
      const base = { so: 2.1, bb: 0.5, hbp: 0.6, hr: 0.3, tr: 0.45, db: 0.5, sg: 0.62 };
      const pr = {}; EV.forEach((e) => { pr[e] = lg[e] * base[e]; });
      rel = relFrom(counts, pa, pr, 60);
      EV.forEach((e) => { rel[e] *= odds(pr[e]) / odds(lg[e]); });
    } else {
      rel = relFrom(counts, pa, lg, 45);
    }
    const sb = s.SB || 0, cs = s.CS;
    const onBase = Math.max(1, (h - d - t - hr) + (s.BB || 0) + (s.HBP || 0) + d);
    const att = cs != null ? sb + cs : sb * 1.45;
    const speed = clamp(0.35 + 2.2 * (att / onBase) + 6 * (t / Math.max(ab, 1)), 0.2, 1.6);
    let sbPct = cs != null && sb + cs >= 4 ? (sb + 4 * lg.sbPct) / (sb + cs + 4) : clamp(lg.sbPct + (speed - 0.6) * 0.12, 0.45, 0.85);
    const gidp = s.GIDP != null && pa > 50 ? clamp((s.GIDP + 3) / (pa * 0.018 + 3), 0.45, 1.8) : 1;
    const obp = pa ? (h + (s.BB || 0) + (s.HBP || 0)) / pa : 0;
    const slg = ab ? (h + d + 2 * t + 3 * hr) / ab : 0;
    return {
      id: row.id, n: row.n, ln: row.ln, b: row.b, t: row.t, pos: row.pos, isPitcher, rel, speed, sbPct, gidp,
      pa, line: s, avg: ab ? h / ab : 0, obp, slg, ops: obp + slg, hrN: hr, sbN: sb, attRate: att / onBase,
    };
  }

  function makePitcher(row, lg, batRow) {
    const s = ps(row);
    const outs = s.IPOuts || 0;
    const bf = s.BFP || (outs + (s.H || 0) + (s.BB || 0) + (s.HBP || 0));
    const hits = (s.H || 0) - (s.HR || 0);
    const nonHr = lg.sg + lg.db + lg.tr;
    const counts = {
      so: s.SO, bb: s.BB, hbp: s.HBP, hr: s.HR,
      sg: hits * lg.sg / nonHr, db: hits * lg.db / nonHr, tr: hits * lg.tr / nonHr,
    };
    const rel = relFrom(counts, bf, lg, 80);
    const g = s.G || 1, gs = s.GS || 0;
    const starter = gs >= Math.max(3, g * 0.45);
    const outsPerApp = outs / g;
    const cgRate = gs ? (s.CG || 0) / gs : 0;
    const stamina = starter ? clamp(outsPerApp * 1.15 * (1 + 0.35 * cgRate) * (bf / Math.max(outs, 1)), 12, 44) : clamp(outsPerApp * 1.3 * (bf / Math.max(outs, 1)), 3, 14);
    const era = outs ? (s.ER || 0) * 27 / outs : 9;
    // quality: lower is better; regressed run-value per BF
    const q = qOf(rel);
    const bat = batRow ? makeBatter(Object.assign({}, batRow, { p: 1, pos: [99, 0, 0, 0, 0, 0, 0, 0, 0, 0] }), lg) : null;
    const ace = 0.5 * q + 0.5 * (outs >= 30 ? era / (lg.rpg * 0.9) : 1.2);
    return {
      id: row.id, n: row.n, ln: row.ln, t: row.t, b: row.b, rel, starter, stamina, era, q, ace, line: s,
      ip: outs / 3, so: s.SO || 0, sv: s.SV || 0, w: s.W || 0, l: s.L || 0, gs, g, bat,
    };
  }

  /* ---------- team building ---------- */
  function assignPositions(batters) {
    // greedy: highest games-at-position first, each player once
    const slots = [1, 2, 3, 4, 5, 6, 7, 8];
    const cands = [];
    batters.forEach((b) => { if (b.isPitcher) return; slots.forEach((p) => { if (b.pos[p] > 0) cands.push([b.pos[p] + b.pa / 1000, b, p]); }); });
    cands.sort((a, b) => b[0] - a[0]);
    const used = new Set(); const filled = {};
    cands.forEach(([, b, p]) => { if (filled[p] || used.has(b.id)) return; filled[p] = b; used.add(b.id); });
    slots.forEach((p) => {
      if (!filled[p]) {
        const alt = batters.filter((b) => !used.has(b.id) && !b.isPitcher).sort((a, c) => c.pa - a.pa)[0];
        if (alt) { filled[p] = alt; used.add(alt.id); }
      }
    });
    return { filled, used };
  }

  function battingOrder(players) {
    // classic order: speed/on-base leadoff, on-base 2nd, best hitter 3rd, power cleanup
    const nonP = players.filter((x) => !x.b.isPitcher);
    const pit = players.filter((x) => x.b.isPitcher);
    const ops = (x) => x.b.ops + Math.min(x.b.pa, 600) / 6000;
    const pow = (x) => x.b.slg + x.b.hrN / 600 + Math.min(x.b.pa, 600) / 6000;
    const lead = (x) => x.b.obp + 0.3 * Math.min(x.b.attRate || 0, 0.35) + 0.02 * x.b.speed - 0.2 * Math.max(0, x.b.slg - 0.5) + Math.min(x.b.pa, 500) / 10000;
    const pool = nonP.slice();
    const take = (f) => { pool.sort((a, b) => f(b) - f(a)); return pool.shift(); };
    const cleanup = take(pow);
    // the team's best all-around power bats hit in the middle, not leadoff
    const middle = pool.slice().sort((a, b) => ops(b) - ops(a)).slice(0, 2).filter((x) => x.b.slg > 0.45);
    const leadPool = pool.filter((x) => !middle.includes(x));
    leadPool.sort((a, b) => lead(b) - lead(a));
    const leadoff = leadPool[0] || take(lead);
    if (leadoff) pool.splice(pool.indexOf(leadoff), 1);
    const third = take(ops);
    const top5 = pool.slice().sort((a, b) => ops(b) - ops(a)).slice(0, 5);
    const second = top5.sort((a, b) => (b.b.obp + 0.1 * b.b.speed) - (a.b.obp + 0.1 * a.b.speed))[0];
    const rest = pool.filter((x) => x !== second).sort((a, b) => ops(b) - ops(a));
    return [leadoff, second, third, cleanup].concat(rest).filter(Boolean).concat(pit);
  }

  function buildTeam(ts, lgTable, opts) {
    opts = opts || {};
    const lgKey = ts.y + ts.lg;
    const L = lgTable[lgKey] || lgTable[Object.keys(lgTable).find((k) => k.startsWith(String(ts.y)))];
    const lg = leagueRates(L);
    const batRows = {};
    ts.bat.forEach((r) => { batRows[r.id] = r; });
    const batters = ts.bat.filter((r) => !(r.p === 1 && r.pos[0] >= r.pos.slice(1).reduce((a, b) => a + b, 0))).map((r) => makeBatter(r, lg));
    const pitchers = ts.pit.map((r) => makePitcher(r, lg, batRows[r.id]));
    const errPerBip = clamp(((ts.E || lg.errPg * (ts.G || 150)) / Math.max(ts.G || 150, 1)) / 26 * 0.55, 0.004, 0.06);
    return {
      key: ts.id, y: ts.y, lg: ts.lg, tm: ts.tm, fr: ts.fr, name: ts.name, short: shortName(ts.name), park: ts.park,
      W: ts.W, L: ts.L, R: ts.R, RA: ts.RA, G: ts.G, WS: ts.WS, LgW: ts.LgW,
      pf: ts.BPF || 100, env: lg, batters, pitchers, errPerBip, dhLeague: hasDH(ts.y, ts.lg),
      custom: !!opts.custom, label: opts.label || (ts.y + ' ' + ts.name),
    };
  }

  function shortName(name) {
    const parts = name.split(' ');
    return parts.length > 1 ? parts.slice(-1)[0] : name;
  }
  function hasDH(y, lg) { return (lg === 'AL' && y >= 1973) || (lg === 'NL' && (y >= 2022 || y === 2020)); }

  function prepareSide(team, useDH, starterId, lineupIds) {
    let filled, used;
    if (team.fixed) {
      filled = {}; used = new Set();
      Object.keys(team.fixed).forEach((p) => { const b = team.batters.find((x) => x.id === team.fixed[p]); if (b) { filled[p] = b; used.add(b.id); } });
      const rest = assignPositions(team.batters.filter((b) => !used.has(b.id)));
      [1, 2, 3, 4, 5, 6, 7, 8].forEach((p) => { if (!filled[p] && rest.filled[p]) { filled[p] = rest.filled[p]; used.add(rest.filled[p].id); } });
    } else ({ filled, used } = assignPositions(team.batters));
    const order = [];
    [1, 2, 3, 4, 5, 6, 7, 8].forEach((p) => { if (filled[p]) order.push({ b: filled[p], pos: p }); });
    const rotation = team.rotationIds ? team.rotationIds.map((id) => team.pitchers.find((p) => p.id === id)).filter(Boolean)
      : team.pitchers.filter((p) => p.starter).sort((a, b) => b.gs * 2 + b.ip / 10 - (a.gs * 2 + a.ip / 10)).slice(0, 5);
    if (!rotation.length) rotation.push(team.pitchers.slice().sort((a, b) => b.ip - a.ip)[0]);
    let sp = null;
    if (starterId === 'auto') { const tot = rotation.reduce((a, p) => a + p.gs, 0); let r = R() * tot; sp = rotation.find((p) => (r -= p.gs) <= 0) || rotation[0]; }
    else if (starterId) sp = team.pitchers.find((p) => p.id === starterId);
    else sp = rotation.slice().sort((a, b) => (a.ace - b.ace))[0];
    if (!sp) sp = rotation[0];
    if (useDH && team.fixed && team.fixed.dh && team.batters.find((x) => x.id === team.fixed.dh) && !used.has(team.fixed.dh)) {
      const dh = team.batters.find((x) => x.id === team.fixed.dh); order.push({ b: dh, pos: 9 }); used.add(dh.id);
    } else if (useDH) {
      const dh = team.batters.filter((b) => !used.has(b.id) && !b.isPitcher).sort((a, b) => (b.ops * Math.min(b.pa, 500) + b.pos[9] * 3) - (a.ops * Math.min(a.pa, 500) + a.pos[9] * 3))[0];
      if (dh) { order.push({ b: dh, pos: 9 }); used.add(dh.id); }
    } else {
      order.push({ b: sp.bat || pitcherAsBatter(sp, team.env), pos: 0 });
    }
    let lineup = battingOrder(order);
    if (lineupIds && lineupIds.length === 9) {
      const custom = []; const okDH = useDH ? lineupIds.some((x) => x.pos === 9) && !lineupIds.some((x) => x.pos === 0) : lineupIds.some((x) => x.pos === 0) && !lineupIds.some((x) => x.pos === 9);
      lineupIds.forEach((x) => {
        if (x.pos === 0) custom.push({ b: sp.bat || pitcherAsBatter(sp, team.env), pos: 0 });
        else { const b = team.batters.find((y) => y.id === x.id); if (b) custom.push({ b, pos: x.pos }); }
      });
      const posSet = new Set(custom.map((x) => x.pos)); const idSet = new Set(custom.map((x) => x.b.id));
      if (okDH && custom.length === 9 && posSet.size === 9 && idSet.size === 9) {
        lineup = custom; used.clear(); custom.forEach((x) => used.add(x.b.id));
      }
    }
    const bench = team.batters.filter((b) => !used.has(b.id) && !b.isPitcher && b.pa > 15).sort((a, b) => b.pa - a.pa).slice(0, 8);
    const bullpen = team.pitchers.filter((p) => p !== sp && !rotation.slice(0, 4).includes(p)).sort((a, b) => a.q - b.q);
    const closer = bullpen.slice().sort((a, b) => b.sv - a.sv || a.q - b.q)[0] || null;
    return {
      team, lineup: lineup.map((x) => ({ b: x.b, pos: x.pos })), bench, bullpen, rotation, closer, useDH,
      pitcher: sp, pstate: freshP(sp), used: new Set(lineup.map((x) => x.b.id).concat([sp.id])), idx: 0,
      tricks: 3, hidden: 1, visits: 5, challenges: 1, mvInning: -1,
    };
  }
  function pitcherAsBatter(p, env) {
    return makeBatter({ id: p.id, n: p.n, ln: p.ln, b: p.b, t: p.t, p: 1, pos: [99, 0, 0, 0, 0, 0, 0, 0, 0, 0], s: BK.map(() => null) }, env);
  }
  function freshP(p) { return { p, bf: 0, pitches: 0, r: 0, er: 0, h: 0, bb: 0, so: 0, hr: 0, outs: 0, start: true }; }

  /* ---------- game ---------- */
  function newGame(away, home, opts) {
    opts = opts || {};
    const useDH = opts.dh != null ? opts.dh : home.dhLeague;
    const env = blendEnv(away.env, home.env);
    const g = {
      away: prepareSide(away, useDH, opts.awaySP, opts.awayLineup), home: prepareSide(home, useDH, opts.homeSP, opts.homeLineup), env,
      inning: 1, half: 0, outs: 0, bases: [null, null, null], score: [0, 0], line: [[], []], hits: [0, 0], errs: [0, 0],
      over: false, log: [], userSide: opts.userSide || null, diff: opts.difficulty || 'pro', ghost: home.y >= 2020 && away.y >= 2020,
      box: {}, pbox: {}, lastPlay: null, rulesYear: home.y, maxInn: 25,
      oldEra: 1 + 0.065 * clamp((1945 - (away.y + home.y) / 2) / 20, 0, 1),
    };
    g.line[0][0] = 0;
    [g.away, g.home].forEach((side, si) => {
      side.si = si;
      side.lineup.forEach((x) => bx(g, x.b, si));
      px(g, side.pitcher, si);
    });
    return g;
  }
  function bx(g, b, si) { if (!g.box[b.id]) g.box[b.id] = { n: b.n, ln: b.ln, si, ab: 0, r: 0, h: 0, rbi: 0, bb: 0, so: 0, hr: 0, d: 0, t: 0, sb: 0 }; return g.box[b.id]; }
  function px(g, p, si) { if (!g.pbox[p.id]) g.pbox[p.id] = { n: p.n, ln: p.ln, si, outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, pc: 0, order: Object.keys(g.pbox).length }; return g.pbox[p.id]; }

  const off = (g) => (g.half === 0 ? g.away : g.home);
  const def = (g) => (g.half === 0 ? g.home : g.away);
  const batter = (g) => off(g).lineup[off(g).idx % 9];

  /* fatigue: over stamina -> worse */
  function spd(r) { return clamp(r.speed / 0.58, 0.55, 1.7); }
  function fatigue(ps) {
    const over = ps.bf - ps.p.stamina;
    if (over <= 0) return 1 + Math.max(0, ps.bf - ps.p.stamina * 0.75) * 0.004;
    return 1 + 0.03 + over * 0.035;
  }
  function fatiguePct(ps) { return clamp(ps.bf / Math.max(ps.p.stamina, 1), 0, 1.6); }

  function paProbs(g, b, ps, mods) {
    const P = ps.p; const env = g.env; const F = fatigue(ps);
    // players' stats already include their own home park (half their games): neutralize, then apply this park
    const offT = off(g).team, defT = def(g).team;
    const own = Math.sqrt(((1 + offT.pf / 100) / 2) * ((1 + defT.pf / 100) / 2));
    const homePark = (g.home.team.pf / 100) / own;
    const sameHand = b.b !== 'B' && b.b === P.t;
    const plat = sameHand ? 0.975 : 1.03;
    const out = {};
    let tot = 0;
    EV.forEach((e) => {
      let o = b.rel[e] * P.rel[e] * odds(env[e]);
      if (e === 'so') { o /= F; o *= sameHand ? 1.03 : 0.965; } else if (e !== 'hbp') { o *= F; o *= plat; }
      if (e === 'hr') o *= homePark; else if (e === 'sg' || e === 'db' || e === 'tr') o *= 1 + (homePark - 1) * 0.5;
      o *= CAL[e];
      if (g.oldEra && (e === 'sg' || e === 'db' || e === 'tr')) o *= g.oldEra;
      if (mods && mods[e]) o *= mods[e];
      out[e] = prob(o); tot += out[e];
    });
    if (tot > 0.82) EV.forEach((e) => { out[e] *= 0.82 / tot; });
    return out;
  }

  /* ---------- AI coach ---------- */
  function lateClose(g) { const diff = Math.abs(g.score[0] - g.score[1]); return g.inning >= 7 && diff <= 2; }
  function sideDiff(g, si) { return si === 0 ? g.score[0] - g.score[1] : g.score[1] - g.score[0]; }

  function aiOffense(g) {
    const o = off(g); const si = o.si; const b = batter(g).b; const bases = g.bases; const smart = g.diff === 'hof' ? 1.25 : g.diff === 'rookie' ? 0.6 : 1;
    const era = g.rulesYear;
    const close = Math.abs(sideDiff(g, si)) <= 2;
    if (g.diff === 'rookie' && R() < 0.04) return pick(['steal2', 'bunt', 'hitrun']);
    if (bases[0] && !bases[1] && g.outs < 2 && Math.abs(sideDiff(g, si)) <= 5) {
      const r = bases[0];
      const want = r.attRate * 2.4 * (r.sbPct > 0.6 ? 1 : 0.4) * (close ? 1 : 0.6) * smart;
      if (R() < clamp(want, 0, 0.5)) return 'steal2';
    }
    if (bases[1] && !bases[2] && g.outs < 2 && bases[1].sbPct > 0.65 && R() < bases[1].attRate * 0.12 * smart) return 'steal3';
    const bunter = b.isPitcher || (b.ops < 0.62 && era < 1995);
    if ((bases[0] || bases[1]) && !bases[2] && g.outs === 0 && (b.isPitcher || (close && g.inning >= 7)) && bunter && R() < (era < 1990 ? 0.75 : 0.45)) return 'bunt';
    if (bases[2] && g.outs < 2 && b.isPitcher && close && g.inning >= 6 && o.tricks > 0 && R() < 0.15 * smart) return 'squeeze';
    if (bases[0] && !bases[1] && g.outs < 2 && b.rel.so < 0.9 && R() < 0.06) return 'hitrun';
    return 'swing';
  }

  function aiDefense(g) {
    const d = def(g); const b = batter(g).b; const bases = g.bases; const smart = g.diff === 'hof' ? 1.3 : g.diff === 'rookie' ? 0.5 : 1;
    const diffNow = sideDiff(g, d.si);
    if (!bases[0] && (bases[1] || bases[2]) && g.inning >= 7 && diffNow >= -1 && diffNow <= 1 && b.ops > 0.92 && g.outs < 2 && R() < 0.55 * smart) return 'ibb';
    if (bases[2] && g.outs < 2 && g.inning >= 7 && Math.abs(diffNow) <= 1) return 'infieldin';
    if (bases[0] && !bases[1] && bases[0].speed > 1.1 && R() < 0.08 * smart) return 'pitchout';
    if (b.b === 'L' && b.slg > 0.5 && g.rulesYear >= 2010 && g.rulesYear < 2023 && R() < 0.6) return 'shift';
    return 'normal';
  }

  function aiPitchingMove(g) {
    const d = def(g); const ps = d.pstate; const diff = sideDiff(g, d.si);
    const hof = g.diff === 'hof', rook = g.diff === 'rookie';
    const tired = ps.bf > ps.p.stamina + (rook ? 4 : hof ? -1 : 1);
    const shelled = ps.r >= (hof ? 4 : 5) && g.inning <= 6 && ps.start;
    const save = g.inning >= 9 && diff > 0 && diff <= 3 && d.closer && ps.p !== d.closer && !d.used.has(d.closer.id) && g.outs === 0 && !g.bases.some(Boolean);
    if (save && (ps.start || ps.bf > 3) && g.rulesYear >= 1960) return d.closer;
    if (tired || shelled) {
      const avail = d.bullpen.filter((p) => !d.used.has(p.id));
      if (!avail.length) return null;
      const late = g.inning >= 7 && Math.abs(diff) <= 3;
      let pool = late ? avail.slice(0, Math.max(1, Math.ceil(avail.length / (hof ? 3 : 2)))) : avail;
      const cand = pool.filter((p) => p !== d.closer || g.inning >= 9);
      pool = cand.length ? cand : pool;
      const w = pool.map((p) => Math.max(1, (p.g - p.gs)) * (late ? 1 : 1));
      let r = R() * w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i]; }
      return pool[0];
    }
    return null;
  }

  /* ---------- substitutions ---------- */
  function changePitcher(g, side, pid) {
    const s = side === 0 ? g.away : g.home;
    const p = s.team.pitchers.find((x) => x.id === pid);
    if (!p || s.used.has(pid) && p !== s.pitcher) return false;
    s.pitcher = p; s.pstate = freshP(p); s.pstate.start = false; s.used.add(pid);
    px(g, p, side);
    const slot = s.lineup.find((x) => x.pos === 0);
    if (slot) { slot.b = p.bat || pitcherAsBatter(p, s.team.env); bx(g, slot.b, side); }
    return p;
  }
  function pinchHit(g, side, bid) {
    const s = side === 0 ? g.away : g.home;
    const nb = s.bench.find((x) => x.id === bid);
    if (!nb || s.used.has(bid)) return false;
    const slot = s.lineup[s.idx % 9];
    const old = slot.b;
    slot.b = nb; s.used.add(bid); bx(g, nb, side);
    if (slot.pos === 0) slot.pos = 9; // pitcher's spot -> new pitcher will bat later via changePitcher
    s.bench = s.bench.filter((x) => x.id !== bid);
    return { old, nb };
  }
  function pinchRun(g, side, base, bid) {
    const s = side === 0 ? g.away : g.home;
    const nb = s.bench.find((x) => x.id === bid);
    const r = g.bases[base];
    if (!nb || !r) return false;
    const slot = s.lineup.find((x) => x.b.id === r.id);
    if (slot) slot.b = nb;
    nb.reached = r.reached;
    g.bases[base] = nb; s.used.add(bid); bx(g, nb, side);
    s.bench = s.bench.filter((x) => x.id !== bid);
    return nb;
  }
  function moundVisit(g, side) {
    const s = side === 0 ? g.away : g.home;
    if (g.rulesYear >= 2018 && s.visits <= 0) return false;
    if (s.mvInning === g.inning) return false;
    s.visits--; s.mvInning = g.inning;
    s.pstate.bf = Math.max(0, s.pstate.bf - 2);
    return true;
  }

  /* ---------- play resolution ---------- */
  function scoreRun(g, runner, rbiTo, res) {
    const si = g.half;
    g.score[si]++; g.line[si][g.inning - 1] = (g.line[si][g.inning - 1] || 0) + 1;
    if (runner) { bx(g, runner, si).r++; }
    const d = def(g); d.pstate.r++; px(g, d.pstate.p, d.si).r++;
    const unearned = runner && runner.reached === 'E';
    if (!unearned) { d.pstate.er++; px(g, d.pstate.p, d.si).er++; }
    if (rbiTo) bx(g, rbiTo, si).rbi++;
    res.runs++;
  }
  function addOut(g, n, res) {
    n = n || 1;
    g.outs += n; const d = def(g); d.pstate.outs += n; px(g, d.pstate.p, d.si).outs += n; res.outs += n;
  }

  function advance(g, n, b, res, opts) {
    // move every runner n bases; batter to base n (if n>0)
    opts = opts || {};
    for (let i = 2; i >= 0; i--) {
      const r = g.bases[i]; if (!r) continue;
      let to = i + n;
      if (opts.extra && to < 3 && g.outs < 3) {
        const chance = Math.min(0.95, opts.extra[i] * spd(r) * (g.outs === 2 ? 1.45 : 1));
        if (R() < chance) {
          if (R() < 0.035) {
            // outfield assist: thrown out taking the extra base
            g.bases[i] = null; addOut(g, 1, res);
            res.note = (res.note || '') + ` ${r.ln} tries for ${to + 1 >= 3 ? 'home' : 'third'} — thrown out!`;
            continue;
          }
          to++;
        }
      }
      g.bases[i] = null;
      if (to >= 3) scoreRun(g, r, opts.noRbi ? null : b, res); else g.bases[to] = r;
    }
    if (n > 0 && b) { if (n >= 4) scoreRun(g, b, b, res); else g.bases[n - 1] = b; }
  }
  function forceAdvance(g, b, res) {
    // walk / HBP
    if (g.bases[0]) {
      if (g.bases[1]) {
        if (g.bases[2]) { scoreRun(g, g.bases[2], b, res); }
        g.bases[2] = g.bases[1];
      }
      g.bases[1] = g.bases[0];
    }
    g.bases[0] = b;
  }

  const LINES = {
    hr: ['{b} crushes one deep — gone!', '{b} turns on it... that ball is OUTTA here!', 'A towering shot by {b}! Home run!', '{b} launches it into the seats!'],
    tr: ['{b} rips one into the gap — he\'s going for three... triple!', '{b} legs out a triple!'],
    db: ['{b} lines a double into the corner.', '{b} drives one off the wall for a double.', 'Two-base hit for {b}.'],
    sg: ['{b} singles through the middle.', '{b} bloops one in for a base hit.', '{b} lines a single to left.', 'Base hit, {b}.', '{b} grounds one through the hole — single.'],
    bb: ['{b} works a walk.', 'Ball four to {b}.', '{b} draws a base on balls.'],
    hbp: ['{b} is hit by the pitch.'],
    so: ['{p} strikes out {b}.', '{b} goes down swinging.', '{b} caught looking — strike three!', '{p} gets {b} on strikes.'],
    go: ['{b} grounds out to {f}.', '{b} bounces one to {f}, thrown out.', 'Routine grounder to {f}. One away... {b} retired.'],
    fo: ['{b} flies out to {f}.', '{b} lifts a fly ball to {f}.', 'Can of corn to {f}, {b} is out.'],
    lo: ['{b} lines out to {f}.', '{b} hits a liner right at {f}.'],
    po: ['{b} pops up to {f}.'],
    dp: ['{b} grounds into a double play!', 'Two for the price of one — {b} hits into a double play.'],
    err: ['{b} reaches on an error by {f}!', 'Booted! {f} misplays it and {b} is aboard.'],
  };
  function say(key, vars) { return pick(LINES[key]).replace(/\{(\w)\}/g, (m, k) => vars[k] || ''); }
  const FIELDER = { go: ['short', 'second', 'third', 'first', 'the pitcher'], fo: ['left', 'center', 'right'], lo: ['short', 'second', 'third', 'first', 'center'], po: ['the catcher', 'second', 'short', 'first'] };

  function step(g, calls) {
    if (g.over) return null;
    const o = off(g), d = def(g);
    const res = { runs: 0, outs: 0, text: '', type: '', crowd: null, big: false, batterId: null, close: null, events: [] };
    const ai = calls || {};
    // pitching move first
    if (!isUser(g, d.si)) {
      const np = aiPitchingMove(g);
      if (np) { changePitcher(g, d.si, np.id); res.events.push(coachLine(g, d.si, 'pitch', np)); }
    }
    const offCall = isUser(g, o.si) && ai.off ? ai.off : aiOffense(g);
    const defCall = isUser(g, d.si) && ai.def ? ai.def : aiDefense(g);
    const slot = batter(g); const b = slot.b; const ps = d.pstate; const P = ps.p;
    res.batterId = b.id; res.offCall = offCall; res.defCall = defCall; res.offSide = o.si;
    const vars = { b: b.n, p: P.n };
    const before = g.score.slice();

    // ---- stolen bases & running plays (do not use the PA) ----
    if (['steal2', 'steal3', 'doublesteal', 'delayedsteal'].includes(offCall)) {
      if (offCall !== 'steal2' && offCall !== 'steal3') o.tricks--;
      const ok = runPlay(g, offCall, defCall, res);
      finish(g, res, before);
      return res;
    }
    if (defCall === 'hiddenball') {
      d.hidden--;
      const lead = [2, 1, 0].find((i) => g.bases[i]);
      if (lead != null && R() < 0.12) {
        const r = g.bases[lead]; g.bases[lead] = null; addOut(g, 1, res);
        res.text = 'The hidden-ball trick! ' + r.n + ' steps off the bag and he\'s tagged out!'; res.type = 'trick'; res.crowd = 'cheerDef'; res.big = true;
      } else { res.text = 'Hidden-ball trick attempt... the runner doesn\'t bite.'; res.type = 'trickfail'; }
      finish(g, res, before); return res;
    }

    if (defCall === 'ibb') {
      ps.bf++; ps.pitches += 4; px(g, P, d.si).pc += 4; px(g, P, d.si).bb++;
      bx(g, b, o.si).bb++; b.reached = 'BB';
      forceAdvance(g, b, res);
      res.text = 'Intentional walk to ' + b.n + '.'; res.type = 'ibb'; res.crowd = 'boo';
      o.idx++; finish(g, res, before); return res;
    }

    if (offCall === 'bunt' || offCall === 'squeeze') {
      if (offCall === 'squeeze') o.tricks--;
      buntPlay(g, offCall, b, res, vars);
      ps.bf++; const pc = 2 + Math.floor(R() * 3); ps.pitches += pc; px(g, P, d.si).pc += pc;
      o.idx++; finish(g, res, before); return res;
    }

    // ---- wild pitch / passed ball with runners on ----
    let pre = '';
    if (g.bases.some(Boolean)) {
      const wp = P.line && P.line.WP != null && P.line.BFP ? (P.line.WP * 1.4 + 1) / (P.line.BFP + 150) : 0.009;
      if (R() < clamp(wp, 0.003, 0.03)) {
        const wpRes = { runs: 0, outs: 0 };
        for (let i = 2; i >= 0; i--) { const rr = g.bases[i]; if (!rr) continue; g.bases[i] = null; if (i === 2) scoreRun(g, rr, null, wpRes); else g.bases[i + 1] = rr; }
        res.runs += wpRes.runs;
        pre = (R() < 0.7 ? 'Wild pitch' : 'Passed ball') + ' — ' + (wpRes.runs ? 'a run scores!' : 'the runners move up.') + ' ';
      }
    }
    // ---- regular plate appearance ----
    const mods = {};
    if (offCall === 'take') { mods.bb = 1.35; mods.so = 1.2; mods.sg = 0.92; mods.hr = 0.85; mods.db = 0.92; }
    if (offCall === 'hitrun') { mods.so = 0.85; mods.sg = 1.08; mods.hr = 0.8; }
    if (defCall === 'infieldin') { mods.sg = 1.18; }
    if (defCall === 'shift') { if (b.b === 'L') { mods.sg = 0.9; mods.db = 1.03; } }
    if (defCall === 'pitchout') { mods.bb = 1.15; }
    const pr = paProbs(g, b, ps, mods);
    let pitchesThisPA = (g.rulesYear < 1950 ? 2.75 : g.rulesYear < 1990 ? 3.0 : 3.25) + R() * 1.1;
    // hit & run runner break
    let hrBreak = offCall === 'hitrun' && g.bases[0] && !g.bases[1];
    const roll = R();
    let acc = 0, ev = 'out';
    for (const e of EV) { acc += pr[e]; if (roll < acc) { ev = e; break; } }
    ps.bf++; const bxb = bx(g, b, o.si); const pb = px(g, P, d.si);
    if (ev === 'so') { pitchesThisPA += 0.9; }
    if (ev === 'bb') { pitchesThisPA += 1.4; }
    const pc = Math.round(pitchesThisPA); ps.pitches += pc; pb.pc += pc;

    if (hrBreak && ev === 'so') {
      // runner hung out
      const r = g.bases[0];
      const safe = R() < r.sbPct * (defCall === 'pitchout' ? 0.55 : 0.85);
      bxb.ab++; bxb.so++; ps.so++; pb.so++; addOut(g, 1, res);
      g.bases[0] = null;
      if (safe) { g.bases[1] = r; bx(g, r, o.si).sb++; res.text = say('so', vars) + ' ' + r.n + ' was running — safe at second.'; }
      else { addOut(g, 1, res); res.text = 'Strike \'em out, throw \'em out! ' + b.n + ' fans and ' + r.n + ' is cut down at second.'; res.crowd = 'cheerDef'; }
      if (pre) res.text = pre + res.text;
      res.type = 'so'; o.idx++; finish(g, res, before); return res;
    }
    if (hrBreak && (ev === 'sg')) { /* runner goes first to third more often */ }

    switch (ev) {
      case 'hr':
        bxb.ab++; bxb.h++; bxb.hr++; ps.h++; ps.hr++; pb.h++; pb.hr++; g.hits[o.si]++;
        { const onb = g.bases.filter(Boolean).length; advance(g, 4, b, res, {}); res.text = onb === 3 ? 'GRAND SLAM! ' + say('hr', vars) : say('hr', vars) + (onb ? ' (' + (onb + 1) + ' runs score)' : ''); }
        res.type = 'hr'; res.big = true; break;
      case 'tr':
        bxb.ab++; bxb.h++; bxb.t++; ps.h++; pb.h++; g.hits[o.si]++; b.reached = 'H';
        advance(g, 3, b, res, {}); res.text = say('tr', vars); res.type = 'hit'; break;
      case 'db':
        bxb.ab++; bxb.h++; bxb.d++; ps.h++; pb.h++; g.hits[o.si]++; b.reached = 'H';
        advance(g, 2, b, res, { extra: [hrBreak ? 0.65 : 0.4, 0, 0] }); res.text = say('db', vars); res.type = 'hit'; break;
      case 'sg':
        bxb.ab++; bxb.h++; ps.h++; pb.h++; g.hits[o.si]++; b.reached = 'H';
        advance(g, 1, b, res, { extra: [hrBreak ? 0.55 : 0.26, 0.6, 0] }); res.text = say('sg', vars); res.type = 'hit'; break;
      case 'bb':
        bxb.bb++; ps.bb++; pb.bb++; b.reached = 'BB'; forceAdvance(g, b, res); res.text = say('bb', vars); res.type = 'bb'; break;
      case 'hbp':
        b.reached = 'BB'; forceAdvance(g, b, res); res.text = say('hbp', vars); res.type = 'bb'; break;
      case 'so':
        bxb.ab++; bxb.so++; ps.so++; pb.so++; addOut(g, 1, res); res.text = say('so', vars); res.type = 'so';
        if (g.outs >= 3 && g.bases.some(Boolean) && lateClose(g)) res.big = true;
        break;
      default:
        bipOut(g, b, res, vars, defCall, hrBreak);
    }
    if (res.note) res.text += res.note;
    if (pre) res.text = pre + res.text;
    o.idx++;
    finish(g, res, before);
    return res;
  }

  const POSWORD = ['the mound', 'catcher', 'first', 'second', 'third', 'short', 'left', 'center', 'right'];
  const POSNUM = { 0: '1', 1: '2', 2: '3', 3: '4', 4: '5', 5: '6' };
  function fielderName(g, pos) {
    const d = def(g);
    if (pos === 0) return d.pstate.p.ln;
    const x = d.lineup.find((y) => y.pos === pos);
    return x ? x.b.ln : POSWORD[pos];
  }
  function pickPos(kind, b) {
    const lefty = b.b === 'L' || (b.b === 'B' && R() < 0.7);
    // spray: right-handed hitters pull to the left side, lefties to the right side
    const go = lefty ? [[0, 0.06], [2, 0.22], [3, 0.3], [5, 0.26], [4, 0.16]] : [[0, 0.06], [2, 0.12], [3, 0.24], [5, 0.31], [4, 0.27]];
    const fo = lefty ? [[6, 0.25], [7, 0.35], [8, 0.4]] : [[6, 0.4], [7, 0.35], [8, 0.25]];
    const lo = lefty ? [[3, 0.2], [5, 0.12], [2, 0.12], [4, 0.06], [6, 0.12], [7, 0.18], [8, 0.2]] : [[3, 0.12], [5, 0.2], [2, 0.06], [4, 0.12], [6, 0.2], [7, 0.18], [8, 0.12]];
    const po = [[1, 0.15], [2, 0.2], [3, 0.2], [4, 0.2], [5, 0.25]];
    const list = { go, fo, lo, po }[kind];
    let r = R(); for (const [p, w] of list) { r -= w; if (r <= 0) return p; }
    return list[0][0];
  }
  function bipOut(g, b, res, vars, defCall, running) {
    const o = off(g), d = def(g); const bxb = bx(g, b, o.si);
    const r = R();
    const kind = r < 0.47 ? 'go' : r < 0.8 ? 'fo' : r < 0.93 ? 'lo' : 'po';
    const pos = pickPos(kind, b); const fn = fielderName(g, pos);
    vars.f = fn + (pos === 0 ? ' on the mound' : ' at ' + POSWORD[pos]);
    // error (most errors happen on ground balls)
    if (R() < d.team.errPerBip * (kind === 'go' ? 1.45 : kind === 'po' ? 0.3 : 0.6)) {
      bxb.ab++; g.errs[d.si]++; b.reached = 'E';
      vars.f = fn;
      advance(g, 1, b, res, { extra: [0.3, 0.5, 0], noRbi: true }); res.text = say('err', vars); res.type = 'err'; res.crowd = 'boo';
      return;
    }
    bxb.ab++;
    if (kind === 'go') {
      // double play / fielder's choice with a force at second
      if (g.bases[0] && g.outs < 2 && !running) {
        const base = ({ 5: 0.56, 3: 0.56, 4: 0.47, 0: 0.5, 2: 0.36 }[pos] || 0.45) * 0.8;
        const dpP = clamp(base * b.gidp / Math.sqrt(spd(b)), 0.08, 0.8) * (defCall === 'infieldin' ? 0.85 : 1);
        if (R() < dpP) {
          const notation = { 5: '6-4-3', 3: '4-6-3', 4: '5-4-3', 0: '1-6-3', 2: '3-6-3' }[pos] || '6-4-3';
          const r1 = g.bases[0]; g.bases[0] = null; addOut(g, 2, res);
          let scored = false;
          if (g.outs < 3) {
            if (g.bases[2]) { const r3 = g.bases[2]; g.bases[2] = null; scoreRun(g, r3, null, res); scored = true; }
            if (g.bases[1]) { g.bases[2] = g.bases[1]; g.bases[1] = null; }
          }
          res.text = `${b.n} grounds to ${vars.f} — ${notation} double play!` + (scored ? ' A run scores on the play.' : '');
          res.type = 'dp'; res.crowd = 'cheerDef'; void r1;
          return;
        }
        if (R() < 0.25) {
          // fielder's choice: lead forced runner is out, batter reaches first
          let k = 0; while (k < 3 && g.bases[k]) k++;
          const outRunner = g.bases[k - 1];
          const where = ['second', 'third', 'the plate'][k - 1];
          g.bases[k - 1] = null; addOut(g, 1, res);
          if (g.outs < 3) {
            if (k < 3 && g.bases[2] && R() < 0.5) { const r3 = g.bases[2]; g.bases[2] = null; scoreRun(g, r3, b, res); }
            for (let i = k - 2; i >= 0; i--) { g.bases[i + 1] = g.bases[i]; g.bases[i] = null; }
          }
          g.bases[0] = b; b.reached = 'FC';
          res.text = `${b.n} grounds to ${vars.f}. Fielder's choice — ${outRunner.n} is forced at ${where}, ${b.ln} safe at first.`;
          res.type = 'out';
          return;
        }
      }
      addOut(g, 1, res);
      res.type = 'out'; res.text = say('go', vars);
      if (R() < 0.1) res.close = 'first';
      if (g.outs >= 3) return;
      const holdThird = defCall === 'infieldin';
      if (g.bases[2] && !holdThird && R() < 0.55) { const r3 = g.bases[2]; g.bases[2] = null; scoreRun(g, r3, b, res); res.text += ' Run scores.'; }
      else if (g.bases[2] && holdThird && R() < 0.2) { const r3 = g.bases[2]; g.bases[2] = null; scoreRun(g, r3, b, res); res.text += ' He beats the throw home!'; }
      const rightSide = pos === 2 || pos === 3;
      if (g.bases[1] && !g.bases[2] && R() < (rightSide ? 0.85 : 0.45)) { g.bases[2] = g.bases[1]; g.bases[1] = null; if (rightSide) res.text += ' The runner moves to third.'; }
      if (g.bases[0] && !g.bases[1]) { g.bases[1] = g.bases[0]; g.bases[0] = null; }
      return;
    }
    addOut(g, 1, res);
    res.type = 'out'; res.text = say(kind, vars);
    if (g.outs >= 3) return;
    if (kind === 'fo') {
      if (g.bases[2]) {
        const depth = { 7: 0.72, 8: 0.66, 6: 0.6 }[pos] || 0.62;
        if (R() < clamp(depth * Math.sqrt(spd(g.bases[2])), 0.35, 0.92)) {
          const r3 = g.bases[2]; g.bases[2] = null;
          if (R() < 0.05) { addOut(g, 1, res); res.text += ` ${r3.ln} tags and tries to score — ${fn} throws him out at the plate! Double play!`; res.type = 'dp'; res.crowd = 'cheerDef'; return; }
          scoreRun(g, r3, b, res); bxb.ab--; res.text += ' Sacrifice fly — the run scores!';
        }
      }
      if (g.bases[1] && !g.bases[2] && R() < ({ 8: 0.45, 7: 0.3, 6: 0.15 }[pos] || 0.25) * Math.sqrt(spd(g.bases[1]))) { g.bases[2] = g.bases[1]; g.bases[1] = null; res.text += ' The runner tags up and takes third.'; }
    } else if (kind === 'lo') {
      const lead = [2, 1, 0].find((i) => g.bases[i]);
      const dblP = running && g.bases[0] ? 0.6 : 0.05;
      if (lead != null && R() < dblP) {
        const i = running && g.bases[0] ? 0 : lead; const rr = g.bases[i]; g.bases[i] = null; addOut(g, 1, res);
        res.text += ` ${rr.ln} is doubled off ${['first', 'second', 'third'][i]}!`; res.type = 'dp'; res.crowd = 'cheerDef';
      } else if (running && g.bases[0] && !g.bases[1]) { g.bases[1] = g.bases[0]; g.bases[0] = null; }
    }
  }

  function buntPlay(g, call, b, res, vars) {
    const o = off(g); const bxb = bx(g, b, o.si);
    const skill = b.isPitcher ? 0.9 : 1.05;
    if (call === 'squeeze' && g.bases[2]) {
      const r3 = g.bases[2];
      if (R() < 0.62 * skill) {
        g.bases[2] = null; scoreRun(g, r3, b, res); bxb.ab += 0; addOut(g, 1, res);
        if (g.bases[1]) { g.bases[2] = g.bases[1]; g.bases[1] = null; } if (g.bases[0]) { g.bases[1] = g.bases[0]; g.bases[0] = null; }
        res.text = 'Suicide squeeze! ' + b.n + ' lays it down and ' + r3.n + ' scores!'; res.type = 'trick'; res.big = true; res.crowd = 'cheer';
      } else {
        g.bases[2] = null; addOut(g, 1, res); res.close = 'home';
        res.text = 'Squeeze is on — ' + b.n + ' misses it! ' + r3.n + ' is hung out and tagged at the plate.'; res.type = 'trickfail'; res.crowd = 'cheerDef';
      }
      return;
    }
    const r = R();
    if (r < 0.68 * skill) {
      addOut(g, 1, res);
      for (let i = 2; i >= 0; i--) { const rr = g.bases[i]; if (!rr) continue; g.bases[i] = null; if (i === 2) scoreRun(g, rr, b, res); else g.bases[i + 1] = rr; }
      res.text = b.n + ' lays down a sacrifice bunt. Runners move up.'; res.type = 'sac';
    } else if (r < 0.76) {
      bxb.ab++; bxb.h++; g.hits[o.si]++; b.reached = 'H';
      advance(g, 1, b, res, {}); res.text = b.n + ' bunts... and beats it out! Bunt single.'; res.type = 'hit';
    } else if (r < 0.92) {
      bxb.ab++; const lead = [2, 1, 0].find((i) => g.bases[i]);
      if (lead != null) { const lr = g.bases[lead]; g.bases[lead] = null; addOut(g, 1, res); forceAdvance(g, b, { runs: 0 }); res.text = 'Bad bunt — the lead runner ' + lr.n + ' is forced out.'; }
      else { addOut(g, 1, res); res.text = b.n + ' bunts it right back to the pitcher. Out.'; }
      res.type = 'out';
    } else {
      bxb.ab++; addOut(g, 1, res); res.text = b.n + ' pops up the bunt attempt. Out.'; res.type = 'out';
    }
  }

  function runPlay(g, call, defCall, res) {
    const o = off(g);
    const pitchout = defCall === 'pitchout' ? 0.6 : 1;
    const steal = (from, mod) => {
      const r = g.bases[from]; if (!r) return null;
      const p = clamp(r.sbPct * mod * pitchout, 0.05, 0.97);
      g.bases[from] = null;
      if (R() < p) { if (from + 1 >= 3) scoreRun(g, r, null, res); else g.bases[from + 1] = r; bx(g, r, o.si).sb++; return { r, safe: true }; }
      addOut(g, 1, res); return { r, safe: false };
    };
    if (call === 'steal2' && g.bases[0] && !g.bases[1]) {
      const s = steal(0, 1);
      res.text = s.safe ? s.r.n + ' takes off... SAFE! Stolen base.' : s.r.n + ' is running... caught stealing!';
      res.type = s.safe ? 'sb' : 'cs'; if (!s.safe) { res.close = 'steal'; res.closeRunner = s.r; res.closeBase = 1; res.crowd = 'cheerDef'; }
    } else if (call === 'steal3' && g.bases[1] && !g.bases[2]) {
      const s = steal(1, 0.9);
      res.text = s.safe ? s.r.n + ' steals third!' : s.r.n + ' tries for third — thrown out!';
      res.type = s.safe ? 'sb' : 'cs'; if (!s.safe) { res.close = 'steal'; res.closeRunner = s.r; res.closeBase = 2; res.crowd = 'cheerDef'; }
    } else if (call === 'doublesteal' && g.bases[0] && g.bases[1] && !g.bases[2]) {
      const lead = steal(1, 0.88);
      if (lead.safe) { const r1 = g.bases[0]; g.bases[0] = null; g.bases[1] = r1; bx(g, r1, o.si).sb++; res.text = 'Double steal! ' + lead.r.n + ' and ' + r1.n + ' both move up!'; res.type = 'sb'; res.big = true; }
      else { const r1 = g.bases[0]; g.bases[0] = null; g.bases[1] = r1; res.text = 'Double steal — ' + lead.r.n + ' is thrown out at third, but ' + r1.n + ' takes second.'; res.type = 'cs'; }
    } else if (call === 'doublesteal' && g.bases[0] && g.bases[2]) {
      // first-and-third delayed: runner from first draws throw, runner from third breaks home
      const r3 = g.bases[2]; g.bases[2] = null;
      if (R() < 0.55) { scoreRun(g, r3, null, res); const r1 = g.bases[0]; g.bases[0] = null; g.bases[1] = r1; res.text = 'First-and-third double steal! ' + r3.n + ' scores while they chase ' + r1.n + '!'; res.type = 'trick'; res.big = true; res.crowd = 'cheer'; }
      else { addOut(g, 1, res); res.text = 'Double steal backfires — ' + r3.n + ' is out at the plate.'; res.type = 'trickfail'; res.close = 'home'; }
    } else if (call === 'delayedsteal' && g.bases[0] && !g.bases[1]) {
      const s = steal(0, 1.06);
      res.text = s.safe ? 'Delayed steal! ' + s.r.n + ' catches them napping — safe at second.' : 'Delayed steal attempt — ' + s.r.n + ' is tagged out.';
      res.type = s.safe ? 'sb' : 'cs';
    } else {
      res.text = 'No steal possible right now.'; res.type = 'none';
    }
  }

  function finish(g, res, before) {
    const o = off(g);
    if (res.runs > 0) {
      res.crowd = res.crowd || (o.si === 1 ? 'cheer' : 'groan');
      if (res.type === 'hr') res.crowd = o.si === 1 ? 'roar' : 'groan';
    } else if (res.type === 'so' && res.big) res.crowd = 'cheerDef';
    if (lateClose(g) && (res.runs || res.type === 'hr')) res.big = true;
    g.log.push({ inn: g.inning, half: g.half, text: res.text, score: g.score.slice(), type: res.type });
    g.lastPlay = res;
    // walk-off
    if (g.half === 1 && g.inning >= 9 && g.score[1] > g.score[0]) {
      g.over = true; res.text += ' WALK-OFF! Ballgame!'; res.crowd = 'roar'; res.big = true; res.walkoff = true; endPitchers(g); return;
    }
    if (g.outs >= 3) endHalf(g, res);
  }

  function endHalf(g, res) {
    g.outs = 0; g.bases = [null, null, null];
    const si = g.half;
    g.line[si][g.inning - 1] = g.line[si][g.inning - 1] || 0;
    if (g.half === 0) {
      if (g.inning >= 9 && g.score[1] > g.score[0]) { g.over = true; res.endGame = true; endPitchers(g); return; }
      g.half = 1;
    } else {
      if (g.inning >= 9 && g.score[0] !== g.score[1]) { g.over = true; res.endGame = true; endPitchers(g); return; }
      if (g.inning >= g.maxInn) { g.over = true; res.endGame = true; g.tie = true; endPitchers(g); return; }
      g.half = 0; g.inning++;
    }
    res.halfOver = true;
    g.line[g.half][g.inning - 1] = g.line[g.half][g.inning - 1] || 0;
    if (g.ghost && g.inning >= 10) {
      const o = off(g); const prev = o.lineup[(o.idx + 8) % 9].b; prev.reached = 'E'; g.bases[1] = prev;
    }
  }
  function endPitchers(g) {
    // decisions: W/L/S
    const winner = g.score[1] > g.score[0] ? 1 : g.score[0] > g.score[1] ? 0 : -1;
    g.winner = winner;
  }

  function isUser(g, si) { return g.userSide === si || g.userSide === 'both'; }

  /* replay challenge (2014+ rules): 40% of close calls are overturned */
  function canChallenge(g, si) {
    const lp = g.lastPlay; const s = si === 0 ? g.away : g.home;
    return !!(lp && lp.close && !lp.halfOver && !g.over && g.rulesYear >= 2014 && s.challenges > 0 && lp.offSide === si && !lp.challenged && (lp.close === 'steal' || lp.close === 'first'));
  }
  function challenge(g, si) {
    const lp = g.lastPlay; const s = si === 0 ? g.away : g.home;
    if (!canChallenge(g, si)) return null;
    lp.challenged = true;
    const win = R() < 0.4;
    if (!win) { s.challenges--; return { overturned: false, text: 'After review, the call on the field stands.' }; }
    const d = def(g);
    g.outs--; d.pstate.outs--; px(g, d.pstate.p, d.si).outs--;
    if (lp.close === 'steal') { g.bases[lp.closeBase] = lp.closeRunner; bx(g, lp.closeRunner, si).sb++; }
    if (lp.close === 'first') { const b = s.lineup.find((x) => x.b.id === lp.batterId); if (b && !g.bases[0]) g.bases[0] = b.b; }
    return { overturned: true, text: 'After review, the call is OVERTURNED — he\'s safe!' };
  }

  /* ---------- dream rosters ---------- */
  function qOf(rel) { const ones = {}; EV.forEach((e) => { ones[e] = 1; }); return woba(rel, QENV) / woba(ones, QENV); }
  function woba(rel, env) {
    const pr = {}; EV.forEach((e) => { pr[e] = prob(rel[e] * odds(env[e])); });
    return 0.69 * pr.bb + 0.72 * pr.hbp + 0.89 * pr.sg + 1.27 * pr.db + 1.62 * pr.tr + 2.1 * pr.hr;
  }
  function geoRel(list, wkey) {
    const rel = {}; let tw = 0; list.forEach((x) => { tw += x[wkey] || 0; });
    EV.forEach((e) => { let s = 0; list.forEach((x) => { s += Math.log(x.rel[e]) * (x[wkey] || 0); }); rel[e] = Math.exp(s / Math.max(tw, 1)); });
    return rel;
  }
  function buildDreamPool(seasons, lgTable, opts) {
    opts = opts || {};
    const mode = opts.mode || 'avg';
    const envs = []; const bats = {}; const pits = {}; let errSum = 0, lgCount = {};
    seasons.forEach((ts) => {
      const L = lgTable[ts.y + ts.lg]; if (!L) return;
      const lg = leagueRates(L); envs.push(lg);
      lgCount[ts.lg] = (lgCount[ts.lg] || 0) + 1;
      errSum += clamp(((ts.E || lg.errPg * (ts.G || 150)) / Math.max(ts.G || 150, 1)) / 26 * 0.55, 0.004, 0.06);
      const batRows = {}; ts.bat.forEach((r) => { batRows[r.id] = r; });
      ts.bat.forEach((r) => {
        if (r.p === 1 && r.pos[0] >= r.pos.slice(1).reduce((a, b) => a + b, 0)) return;
        const b = makeBatter(r, lg); b.y = ts.y; b.tm = ts.name; b.value = woba(b.rel, lg) ;
        (bats[r.id] = bats[r.id] || []).push(b);
      });
      ts.pit.forEach((r) => { const p = makePitcher(r, lg, null); p.y = ts.y; p.tm = ts.name; p.bf = r.s[9] || ((r.s[2] || 0) + (r.s[3] || 0) + (r.s[6] || 0)); (pits[r.id] = pits[r.id] || []).push(p); });
    });
    const env = {}; Object.keys(envs[0] || {}).forEach((k) => { env[k] = envs.reduce((a, e) => a + e[k], 0) / envs.length; });
    const batters = Object.values(bats).map((list) => combineBatter(list, mode, env)).filter(Boolean);
    const pitchers = Object.values(pits).map((list) => combinePitcher(list, mode, env)).filter(Boolean);
    const years = seasons.map((s) => s.y);
    const mid = Math.round((Math.min(...years) + Math.max(...years)) / 2);
    const lg = Object.keys(lgCount).sort((a, b) => lgCount[b] - lgCount[a])[0] || 'NL';
    return { batters, pitchers, env, errPerBip: errSum / Math.max(seasons.length, 1), y: mid, lg, y0: Math.min(...years), y1: Math.max(...years) };
  }
  function combineBatter(list, mode, env) {
    let pick = list;
    if (mode === 'peak') {
      const q = list.filter((b) => b.pa >= 300); const pool = q.length ? q : list;
      pick = [pool.slice().sort((a, b) => b.value - a.value || b.pa - a.pa)[0]];
    }
    const pa = pick.reduce((a, b) => a + b.pa, 0); if (pa < 30) return null;
    const f = pick[0];
    const rel = geoRel(pick, 'pa');
    const wavg = (k) => pick.reduce((a, b) => a + b[k] * b.pa, 0) / pa;
    const pos = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; pick.forEach((b) => b.pos.forEach((g, i) => { pos[i] += g; }));
    const sum = (k) => pick.reduce((a, b) => a + (b.line[k] || 0), 0);
    const ab = sum('AB'), h = sum('H'), hr = sum('HR'), d = sum('2B'), t = sum('3B'), bb = sum('BB'), hbp = sum('HBP'), sb = sum('SB');
    const ys = pick.map((b) => b.y);
    const yrs = Math.min(...ys) === Math.max(...ys) ? String(ys[0]) : Math.min(...ys) + '–' + Math.max(...ys);
    const obp = (h + bb + hbp) / Math.max(1, ab + bb + hbp); const slg = (h + d + 2 * t + 3 * hr) / Math.max(1, ab);
    return {
      id: f.id, n: f.n, ln: f.ln, b: f.b, t: f.t, pos, isPitcher: false, rel, speed: wavg('speed'), sbPct: wavg('sbPct'), gidp: wavg('gidp'),
      pa, avg: ab ? h / ab : 0, obp, slg, ops: obp + slg, hrN: hr, sbN: sb, attRate: wavg('attRate'), seasons: pick.length, yrs,
      line: { AB: ab, H: h, HR: hr, '2B': d, '3B': t, BB: bb, HBP: hbp, SB: sb, SO: sum('SO'), G: sum('G') },
      value: woba(rel, env), perSeason: { hr: hr / pick.length, sb: sb / pick.length },
    };
  }
  function combinePitcher(list, mode, env) {
    let pick = list;
    if (mode === 'peak') {
      const q = list.filter((p) => p.ip >= (p.starter ? 120 : 40)); const pool = q.length ? q : list;
      pick = [pool.slice().sort((a, b) => a.q - b.q || b.ip - a.ip)[0]];
    }
    const bf = pick.reduce((a, p) => a + p.bf, 0); if (bf < 40) return null;
    const f = pick[0]; const rel = geoRel(pick, 'bf');
    const outs = pick.reduce((a, p) => a + (p.line.IPOuts || 0), 0), er = pick.reduce((a, p) => a + (p.line.ER || 0), 0);
    const g = pick.reduce((a, p) => a + p.g, 0), gs = pick.reduce((a, p) => a + p.gs, 0);
    const starter = gs >= Math.max(3, g * 0.45);
    const stam = pick.reduce((a, p) => a + p.stamina * p.bf, 0) / bf;
    const q = qOf(rel);
    const ys = pick.map((p) => p.y);
    const yrs = Math.min(...ys) === Math.max(...ys) ? String(ys[0]) : Math.min(...ys) + '–' + Math.max(...ys);
    const sum = (k) => pick.reduce((a, p) => a + (p.line[k] || 0), 0);
    const eraC = outs ? er * 27 / outs : 9;
    return {
      ace: 0.5 * q + 0.5 * (outs >= 30 ? eraC / (env.rpg * 0.9) : 1.2),
      id: f.id, n: f.n, ln: f.ln, t: f.t, b: f.b, rel, starter, stamina: starter ? clamp(stam, 18, 44) : clamp(stam, 3, 14), era: outs ? er * 27 / outs : 9, q,
      line: { IPOuts: outs, ER: er, SO: sum('SO'), BB: sum('BB'), W: sum('W'), L: sum('L'), SV: sum('SV'), G: g, GS: gs },
      ip: outs / 3, so: sum('SO'), sv: sum('SV'), w: sum('W'), l: sum('L'), gs: gs / pick.length, g: g / pick.length, bat: null, seasons: pick.length, yrs, value: -q, bf,
    };
  }
  const SLOT_POS = { C: 1, '1B': 2, '2B': 3, '3B': 4, SS: 5, LF: 6, CF: 7, RF: 8 };
  function posShare(b, p) { const tot = b.pos.slice(1, 9).reduce((a, x) => a + x, 0); return tot ? b.pos[p] / tot : 0; }
  function posScore(b, p) { if (b.pos[p] <= 0) return -1; const sh = posShare(b, p); return b.value * 100 * (sh >= 0.3 ? 1 : 0.55 + sh) + Math.min(b.pos[p], 1200) / 400 + longBonus(b.pa, 300) * 2; }
  function longBonus(x, base) { return clamp(Math.log10(Math.max(x, 1) / base), -1, 1.2); }
  function pRank(p) { return (p.ace != null ? p.ace : p.q) - 0.035 * longBonus(p.ip, p.starter ? 180 : 60); }
  function bRank(b) { return b.value * 100 + longBonus(b.pa, 300) * 2; }
  function dreamPicks(pool, useDH, hitters) {
    const benchN = Math.max(3, Math.min(7, (hitters || 13) - 9)); const rpN = 25 - 5 - 9 - benchN;
    const taken = new Set(); const slots = {};
    const order = ['SS', 'C', 'CF', '2B', '3B', 'RF', 'LF', '1B'];
    const minPa = Math.min(400, Math.max(80, (pool.batters.slice().sort((a, b) => b.pa - a.pa)[25] || { pa: 100 }).pa));
    order.forEach((k) => {
      const p = SLOT_POS[k];
      const c = pool.batters.filter((b) => !taken.has(b.id) && b.pos[p] >= 10 && b.pa >= minPa).sort((a, b) => posScore(b, p) - posScore(a, p))[0]
        || pool.batters.filter((b) => !taken.has(b.id) && b.pos[p] > 0).sort((a, b) => posScore(b, p) - posScore(a, p))[0];
      if (c) { slots[k] = c.id; taken.add(c.id); }
    });
    const backupC = pool.batters.filter((b) => !taken.has(b.id) && b.pos[1] >= 10).sort((a, b) => posScore(b, 1) - posScore(a, 1))[0];
    const benchList = [];
    if (backupC) { benchList.push(backupC.id); taken.add(backupC.id); }
    const rest = pool.batters.filter((b) => !taken.has(b.id) && b.pa >= minPa * 0.6).sort((a, b) => bRank(b) - bRank(a));
    let dh = null;
    if (rest.length) { dh = rest[0].id; taken.add(dh); }
    pool.batters.filter((b) => !taken.has(b.id) && b.pa >= minPa * 0.5).sort((a, b) => bRank(b) - bRank(a)).slice(0, benchN - benchList.length).forEach((b) => { benchList.push(b.id); taken.add(b.id); });
    const ipMin = (p) => p.ip >= (p.starter ? 150 : 40);
    const sp = pool.pitchers.filter((p) => p.starter && ipMin(p)).sort((a, b) => pRank(a) - pRank(b)).slice(0, 5);
    const spIds = new Set(sp.map((p) => p.id));
    let rp = pool.pitchers.filter((p) => !p.starter && !spIds.has(p.id) && ipMin(p)).sort((a, b) => pRank(a) - pRank(b)).slice(0, rpN);
    if (rp.length < rpN) rp = rp.concat(pool.pitchers.filter((p) => !spIds.has(p.id) && !rp.includes(p)).sort((a, b) => a.q - b.q).slice(0, rpN - rp.length));
    return { slots, dh, bench: benchList, sp: sp.map((p) => p.id), rp: rp.map((p) => p.id) };
  }
  function teamFromDream(pool, picks, meta) {
    const ids = new Set(Object.values(picks.slots).concat(picks.bench, picks.dh ? [picks.dh] : []));
    const batters = pool.batters.filter((b) => ids.has(b.id));
    const pids = new Set(picks.sp.concat(picks.rp));
    const pitchers = pool.pitchers.filter((p) => pids.has(p.id)).map((p) => Object.assign({}, p, { starter: picks.sp.includes(p.id) ? true : p.starter && false }));
    pitchers.forEach((p) => { if (picks.sp.includes(p.id)) { p.starter = true; p.stamina = Math.max(p.stamina, 18); p.gs = Math.max(p.gs, 20); } else { p.starter = false; p.stamina = Math.min(p.stamina, 14); } });
    const fixed = {}; Object.keys(picks.slots).forEach((k) => { fixed[SLOT_POS[k]] = picks.slots[k]; }); if (picks.dh) fixed.dh = picks.dh;
    return {
      key: 'dream-' + meta.label, y: pool.y, lg: pool.lg, tm: 'DRM', fr: meta.fr, name: meta.label, short: meta.short || meta.label, park: 'Neutral park',
      W: null, L: null, R: null, RA: null, G: null, pf: 100, env: pool.env, batters, pitchers, errPerBip: pool.errPerBip,
      dhLeague: hasDH(pool.y, pool.lg), custom: true, label: meta.label, fixed, rotationIds: picks.sp, y0: pool.y0, y1: pool.y1, mode: meta.mode,
    };
  }

  /* coach chatter */
  const CHATTER = {
    pitch: ['Going to the bullpen — {n} is coming in. Good luck with this one.', 'Bringing in {n}. Your hitters can\'t touch him.', 'That\'s enough. {n}, you\'re up.'],
    steal: ['Let\'s see if your catcher has an arm.', 'Running on you. Try and stop it.'],
    ibb: ['Not letting {n} beat me. Put him on.', 'I\'ll take my chances with the next guy.'],
    bunt: ['Small ball. Old school.', 'Move the runner — fundamentals.'],
    taunt: ['You really want to pitch to {n}?', 'Bold move, coach.', 'My guys have seen this before.', 'That\'s the best you\'ve got?', 'I\'ve been managing longer than you\'ve been alive. Probably.'],
  };
  function coachLine(g, si, kind, p) {
    const t = pick(CHATTER[kind] || CHATTER.taunt).replace('{n}', p ? p.n : '');
    return { coach: true, si, text: t };
  }

  /* simulate helpers */
  function keyMoment(g) {
    const risp = g.bases[1] || g.bases[2];
    return (g.inning >= 7 && Math.abs(g.score[0] - g.score[1]) <= 3) || (risp && Math.abs(g.score[0] - g.score[1]) <= 4);
  }
  function simHalf(g, calls) { const h = g.half, i = g.inning; const out = []; while (!g.over && g.half === h && g.inning === i) out.push(step(g, calls)); return out; }
  function simGame(g) { const out = []; let n = 0; while (!g.over && n++ < 600) out.push(step(g, {})); return out; }

  function boxIP(outs) { return Math.floor(outs / 3) + '.' + (outs % 3); }

  /* --- scouting --- */
  function teamProfile(team) {
    const bats = team.batters.filter((b) => b.pa > 100);
    const tot = team.batters.reduce((a, b) => { const s = b.line; a.ab += s.AB || 0; a.h += s.H || 0; a.hr += s.HR || 0; a.bb += s.BB || 0; a.sb += s.SB || 0; a.d += s['2B'] || 0; a.t += s['3B'] || 0; a.hbp += s.HBP || 0; return a; }, { ab: 0, h: 0, hr: 0, bb: 0, sb: 0, d: 0, t: 0, hbp: 0 });
    const pt = team.pitchers.reduce((a, p) => { a.outs += p.line.IPOuts || 0; a.er += p.line.ER || 0; a.so += p.line.SO || 0; a.bb += p.line.BB || 0; return a; }, { outs: 0, er: 0, so: 0, bb: 0 });
    const avg = tot.ab ? tot.h / tot.ab : 0;
    const obp = (tot.h + tot.bb + tot.hbp) / Math.max(1, tot.ab + tot.bb + tot.hbp);
    const slg = (tot.h + tot.d + 2 * tot.t + 3 * tot.hr) / Math.max(1, tot.ab);
    const era = pt.outs ? pt.er * 27 / pt.outs : 0;
    const best = bats.slice().sort((a, b) => b.ops - a.ops)[0];
    const power = bats.slice().sort((a, b) => b.hrN - a.hrN)[0];
    const speed = team.batters.slice().sort((a, b) => b.sbN - a.sbN)[0];
    const ace = team.pitchers.filter((p) => p.starter && p.ip > 60).sort((a, b) => a.ace - b.ace)[0] || team.pitchers.slice().sort((a, b) => b.ip - a.ip)[0];
    const closer = team.pitchers.filter((p) => !p.starter).sort((a, b) => b.sv - a.sv || a.q - b.q)[0];
    // relative strength vs league (rel odds averaged)
    const offRel = weighted(team.batters.filter((b) => !b.isPitcher), (b) => b.pa, (b) => b.rel.hr * 0.4 + b.rel.sg * 0.3 + b.rel.db * 0.15 + b.rel.bb * 0.15);
    const powRel = weighted(team.batters.filter((b) => !b.isPitcher), (b) => b.pa, (b) => b.rel.hr);
    const conRel = weighted(team.batters.filter((b) => !b.isPitcher), (b) => b.pa, (b) => 1 / b.rel.so);
    const pitRel = weighted(team.pitchers, (p) => p.ip, (p) => p.q);
    const kRel = weighted(team.pitchers, (p) => p.ip, (p) => p.rel.so);
    const ctrlRel = weighted(team.pitchers, (p) => p.ip, (p) => 1 / p.rel.bb);
    const spd = weighted(team.batters.filter((b) => !b.isPitcher), (b) => b.pa, (b) => b.speed);
    const strengths = [], weaknesses = [];
    if (powRel > 1.25) strengths.push('Big power lineup'); else if (powRel < 0.8) weaknesses.push('Little home-run power');
    if (conRel > 1.15) strengths.push('Tough to strike out'); else if (conRel < 0.88) weaknesses.push('Strikes out a lot');
    if (offRel > 1.1) strengths.push('Deep, dangerous offense'); else if (offRel < 0.92) weaknesses.push('Light-hitting offense');
    if (pitRel < 0.93) strengths.push('Excellent pitching staff'); else if (pitRel > 1.05) weaknesses.push('Shaky pitching');
    if (kRel > 1.18) strengths.push('Strikeout arms');
    if (ctrlRel < 0.88) weaknesses.push('Pitchers walk too many');
    if (spd > 0.75) strengths.push('Speed on the bases'); else if (spd < 0.45) weaknesses.push('Slow on the bases');
    if ((team.errPerBip) > 0.03 && team.y > 1920) weaknesses.push('Error-prone defense');
    if (!strengths.length) strengths.push('Balanced club');
    if (!weaknesses.length) weaknesses.push('Few holes to exploit');
    return { avg, obp, slg, hr: tot.hr, sb: tot.sb, era, so: pt.so, best, power, speed, ace, closer, strengths, weaknesses, offRel, pitRel };
  }
  function weighted(arr, w, f) { let s = 0, t = 0; arr.forEach((x) => { const ww = w(x) || 0; s += f(x) * ww; t += ww; }); return t ? s / t : 1; }

  function project(away, home, n, opts) {
    const saveR = rng; setSeed(Date.now() & 0xffff);
    let aw = 0, hw = 0, ar = 0, hr = 0;
    for (let i = 0; i < n; i++) {
      const g = newGame(away, home, Object.assign({}, opts, { userSide: null, awaySP: 'auto', homeSP: 'auto' }));
      simGame(g); ar += g.score[0]; hr += g.score[1]; if (g.score[0] > g.score[1]) aw++; else if (g.score[1] > g.score[0]) hw++;
    }
    rng = saveR;
    return { aw, hw, ar: ar / n, hr: hr / n };
  }

  root.Arena = root.Arena || {};
  root.Arena.baseball = {
    POS, buildTeam, newGame, step, simHalf, simGame, keyMoment, changePitcher, pinchHit, pinchRun, moundVisit,
    off, def, batter, isUser, aiOffense, aiDefense, fatiguePct, boxIP, teamProfile, project, setSeed, hasDH, coachLine, leagueRates,
    makeBatter, makePitcher, paProbs, canChallenge, challenge, buildDreamPool, dreamPicks, teamFromDream, SLOT_POS, woba, bRank, pRank, posShare,
  };
  if (typeof module !== 'undefined') module.exports = root.Arena.baseball;
})(typeof window !== 'undefined' ? window : globalThis);
