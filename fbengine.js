/* The All-Time Sports Arena — football engine
   Team units (rushing, passing, protection vs run defense, pass defense, pass rush) decide each play.
   Units are anchored to each team's real points scored and allowed; stars get the credit and the big plays. */
(function (root) {
  'use strict';
  let rng = Math.random;
  function setSeed(seed) { let s = seed >>> 0; rng = function () { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const R = () => rng();
  const pick = (a) => a[Math.floor(R() * a.length)];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const norm = () => { let u = 0, v = 0; while (u === 0) u = R(); while (v === 0) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  /* ---------- era rule sets ---------- */
  const RULES = {
    classic: { label: 'Classic (1960–77)', comp: 0.52, ypc: 13.2, int: 0.046, sack: 0.07, ypr: 3.95, fum: 0.011, pen: 0.12, twoPt: false, pat: 0.965, fg50: 45, ko: 31, punt: 36.5, ot: 'sudden', runShare: 0.56, onside: 0.18 },
    passing: { label: 'Passing era (1978–93)', comp: 0.565, ypc: 12.5, int: 0.036, sack: 0.066, ypr: 4.0, fum: 0.0095, pen: 0.125, twoPt: false, pat: 0.975, fg50: 49, ko: 29, punt: 37.5, ot: 'sudden', runShare: 0.5, onside: 0.16 },
    twopoint: { label: 'Two-point era (1994–2011)', comp: 0.595, ypc: 11.8, int: 0.027, sack: 0.058, ypr: 4.1, fum: 0.0075, pen: 0.125, twoPt: true, pat: 0.985, fg50: 53, ko: 28, punt: 38.5, ot: 'sudden', runShare: 0.45, onside: 0.14 },
    modern: { label: 'Modern (2012–today)', comp: 0.645, ypc: 11.2, int: 0.021, sack: 0.055, ypr: 4.35, fum: 0.006, pen: 0.13, twoPt: true, pat: 0.94, fg50: 57, ko: 28, punt: 41, ot: 'modified', runShare: 0.42, onside: 0.07 },
  };
  function rulesForYear(y) { return y <= 1977 ? 'classic' : y <= 1993 ? 'passing' : y <= 2011 ? 'twopoint' : 'modern'; }
  // overall scoring calibration by rule set (team-quality-neutral)
  const CALV = (+(typeof process !== 'undefined' && process.env && process.env.CALV) || 0.96);
  const CAL = { classic: CALV, passing: CALV, twopoint: CALV, modern: CALV };
  const TUNE = { runCore: (+(typeof process !== 'undefined' && process.env && process.env.RC) || 0.93), bigRun: (+(typeof process !== 'undefined' && process.env && process.env.BR) || 0.025), bigRunLen: (+(typeof process !== 'undefined' && process.env && process.env.BL) || 40), catchRun: (+(typeof process !== 'undefined' && process.env && process.env.CR) || 0.03), passCore: (+(typeof process !== 'undefined' && process.env && process.env.PC) || 1) };
  const ERA_PPG = { classic: 19.0, passing: 20.3, twopoint: 20.8, modern: 22.6 };
  const KERA = { classic: 0.95, passing: 1.0, twopoint: 1.08, modern: 1.16 };
  let K = 0.62;
  let PT = +(typeof process !== 'undefined' && process.env && process.env.PT) || 33;
  let LIGHT_NORM = +(typeof process !== 'undefined' && process.env && process.env.LN) || 1;
  let LIGHT_TRUST = +(typeof process !== 'undefined' && process.env && process.env.LT) || 0.5; // strength of team-quality effects (set by calibration)

  /* ---------- roster / team ---------- */
  const SLOTS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
  const GENERIC = { QB: ['Starting QB', 'Backup QB'], RB: ['Lead RB', 'Fullback', 'Backup RB'], WR: ['WR1', 'WR2', 'WR3'], TE: ['Tight end', 'Backup TE'], OL: ['LT', 'LG', 'C', 'RG', 'RT'], DL: ['DE', 'DT', 'DT', 'DE'], LB: ['OLB', 'MLB', 'OLB'], CB: ['CB1', 'CB2', 'Nickel CB'], S: ['FS', 'SS'], K: ['Kicker'], P: ['Punter'] };

  function genericRoster() {
    const out = [];
    Object.keys(GENERIC).forEach((pos) => GENERIC[pos].forEach((n, i) => out.push({ pos, n, ln: n, r: i === 0 || ['OL', 'DL', 'S'].includes(pos) ? 70 : 62, star: false, generic: true })));
    return out;
  }

  // split a team's real offense/defense strength into units using its roster (stars count extra)
  function unitsFromRoster(roster) {
    roster = roster.filter((p) => !p.generic);
    const val = (p) => p.r + (p.star ? 4 : 0);
    const top = (pos, n) => roster.filter((p) => p.pos === pos).map(val).sort((a, b) => b - a).slice(0, n);
    const mean = (a, d) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : d);
    // light rosters name only key players: a missing unit plays at that side's average, so it neither helps nor hurts
    const offMean = mean(roster.filter((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.pos)).map(val), 72);
    const defMean = mean(roster.filter((p) => ['DL', 'LB', 'CB', 'S'].includes(p.pos)).map(val), 72);
    const QB = mean(top('QB', 1), offMean), RB = mean(top('RB', 1), offMean), WR = top('WR', 3), TE = mean(top('TE', 1), offMean), OL = mean(top('OL', 5), offMean);
    const DLs = top('DL', 4), LBs = top('LB', 4), CB = mean(top('CB', 2), defMean), S = mean(top('S', 2), defMean);
    const wr = WR.length ? WR[0] * 0.5 + (WR[1] || offMean - 2) * 0.3 + (WR[2] || offMean - 4) * 0.2 : offMean;
    const fr = DLs.concat(LBs).sort((a, b) => b - a);
    const front = fr.length >= 4 ? mean(fr.slice(0, 7), defMean) : mean(fr.concat(Array(4 - fr.length).fill(defMean)), defMean);
    const rushers = mean(fr.slice(0, 2), defMean);
    const LBm = mean(LBs, defMean);
    const raw = {
      pass: QB * 0.5 + wr * 0.3 + TE * 0.08 + OL * 0.12, run: RB * 0.5 + OL * 0.38 + TE * 0.12, prot: OL * 0.85 + QB * 0.15, sec: QB * 0.4 + RB * 0.3 + OL * 0.3,
      pdef: CB * 0.5 + S * 0.32 + LBm * 0.18, rdef: front * 0.75 + S * 0.25, rush: rushers * 0.7 + front * 0.3, take: CB * 0.35 + S * 0.35 + rushers * 0.3,
    };
    const spread = 18; const out = {};
    const om = (raw.pass + raw.run + raw.prot + raw.sec) / 4, dm = (raw.pdef + raw.rdef + raw.rush + raw.take) / 4;
    ['pass', 'run', 'prot', 'sec'].forEach((k) => { out[k] = Math.exp((raw[k] - om) / spread); });
    ['pdef', 'rdef', 'rush', 'take'].forEach((k) => { out[k] = Math.exp((raw[k] - dm) / spread); });
    const kick = roster.find((p) => p.pos === 'K'), punter = roster.find((p) => p.pos === 'P');
    out.k = kick ? 1 + (val(kick) - 80) / 100 : 1; out.p = punter ? 1 + (val(punter) - 80) / 100 : 1; out.ret = 1;
    return out;
  }
  // light rosters: unnamed spots get position labels so every play still has a player to credit
  const NEED = { QB: 1, RB: 2, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, CB: 3, S: 2, K: 1, P: 1 };
  function fillRoster(roster, nick) {
    const out = roster.slice();
    Object.keys(NEED).forEach((pos) => {
      const have = out.filter((p) => p.pos === pos).length;
      for (let i = have; i < NEED[pos]; i++) {
        const lbl = GENERIC[pos][i] || pos;
        out.push({ pos, n: (nick ? nick + ' ' : '') + lbl, ln: lbl, r: 66, star: false, generic: true });
      }
    });
    return out;
  }
  // unit grades: 1.0 = league average; built from points, split by roster when named
  function buildTeam(ts, opts) {
    opts = opts || {};
    const named = !!(ts.roster && ts.roster.length);
    let roster = named ? ts.roster.map((p) => Object.assign({}, p)) : genericRoster();
    let u = ts.units || (named ? unitsFromRoster(roster) : {});
    // key-player rosters are a partial picture: trust their unit split less
    if (named && ts.light && !ts.units) { const a = LIGHT_TRUST; u = Object.assign({}, u); ['pass', 'run', 'prot', 'sec', 'pdef', 'rdef', 'rush', 'take'].forEach((k) => { u[k] = Math.pow(u[k], a); });
      // a coach leans on his best unit and attacks the other side's weakest, so even a balanced split adds points: take that back out
      const am = (ks) => ks.reduce((x, k) => x + u[k], 0) / ks.length, hm = (ks) => ks.length / ks.reduce((x, k) => x + 1 / u[k], 0);
      const oa = am(['pass', 'run', 'prot', 'sec']), dh = hm(['pdef', 'rdef', 'rush', 'take']);
      ['pass', 'run', 'prot', 'sec'].forEach((k) => { u[k] /= Math.pow(oa, LIGHT_NORM); }); ['pdef', 'rdef', 'rush', 'take'].forEach((k) => { u[k] /= Math.pow(dh, LIGHT_NORM); }); }
    if (named && (ts.light || ts.fill)) roster = fillRoster(roster, ts.nick);
    const O = ts.O || 1, D = ts.D || 1; // points scored / allowed vs league (D < 1 = good defense)
    // offense units multiply to O, defense units multiply to 1/D
    const off = { pass: O * (u.pass || 1), run: O * (u.run || 1), prot: O * (u.prot || 1), sec: O * (u.sec || 1) };
    const def = { pass: (1 / D) * (u.pdef || 1), run: (1 / D) * (u.rdef || 1), rush: (1 / D) * (u.rush || 1), take: (1 / D) * (u.take || 1) };
    const st = { k: u.k || 1, p: u.p || 1, ret: u.ret || 1 };
    const by = (pos) => roster.filter((p) => p.pos === pos).sort((a, b) => b.r - a.r);
    return {
      key: ts.key || (ts.y + ts.fr), y: ts.y, fr: ts.fr, name: ts.name, short: ts.nick || ts.name, city: ts.city,
      W: ts.W, L: ts.L, T: ts.T, PF: ts.PF, PA: ts.PA, G: ts.G, O, D, off, def, st, roster, named, by,
      badge: ts.badge || (named ? 'silver' : 'bronze'), light: !!ts.light, dream: !!ts.dream, lgppg: ts.lgppg, custom: !!opts.custom, label: opts.label || (ts.y + ' ' + ts.name),
      notes: ts.notes || '',
    };
  }

  /* ---------- game state ---------- */
  function newGame(away, home, opts) {
    opts = opts || {};
    const rules = opts.rules || rulesForYear(home.y);
    const g = {
      teams: [away, home], rules, R: RULES[rules], q: 1, clock: 900, poss: 0, ball: 25, down: 1, togo: 10,
      score: [0, 0], qs: [[0], [0]], to: [3, 3], over: false, log: [], userSide: opts.userSide != null ? opts.userSide : null, diff: opts.difficulty || 'pro',
      box: [newBox(), newBox()], tricks: [3, 3], challenges: [rules === 'twopoint' || rules === 'modern' ? 2 : 0, rules === 'twopoint' || rules === 'modern' ? 2 : 0],
      kickoffNext: true, kicking: 1, twoMin: [false, false], otPoss: null, lastPlay: null, starters: [startersOf(away), startersOf(home)], tendency: [{ pass: 0, run: 0 }, { pass: 0, run: 0 }],
      firstHalfReceiver: 0, drive: { plays: 0, yds: 0, start: 25 },
      env: opts.lgppg ? Math.pow(opts.lgppg / ERA_PPG[rules], 0.7) : 1,
    };
    // away receives the opening kickoff
    g.kicking = 1; g.poss = 0;
    return g;
  }
  function startersOf(t) {
    const pickN = (pos, n) => t.by(pos).slice(0, n);
    return { QB: pickN('QB', 1)[0], RB: pickN('RB', 2), WR: pickN('WR', 3), TE: pickN('TE', 1)[0], OL: pickN('OL', 5), DL: pickN('DL', 4), LB: pickN('LB', 3), CB: pickN('CB', 3), S: pickN('S', 2), K: pickN('K', 1)[0], P: pickN('P', 1)[0] };
  }
  function newBox() { return { pass: {}, rush: {}, rec: {}, def: {}, kick: { fgm: 0, fga: 0, xpm: 0, xpa: 0, long: 0 }, punt: { n: 0, yds: 0 }, team: { yds: 0, ry: 0, py: 0, fd: 0, to: 0, pen: 0, peny: 0, sacks: 0, plays: 0, top: 0 } }; }
  function st(g, side, kind, name) { const b = g.box[side][kind]; if (!b[name]) b[name] = { att: 0, cmp: 0, yds: 0, td: 0, int: 0, car: 0, rec: 0, sk: 0, ff: 0, tk: 0, pd: 0 }; return b[name]; }

  /* ---------- helpers ---------- */
  const offT = (g) => g.teams[g.poss];
  const defT = (g) => g.teams[1 - g.poss];
  const lead = (g, side) => g.score[side] - g.score[1 - side];
  const timeLeftGame = (g) => (g.q >= 5 ? g.clock : (4 - g.q) * 900 + g.clock);
  function spotText(g) { const b = g.ball; if (b === 50) return 'midfield'; const t = b < 50 ? offT(g) : defT(g); return `${t.short} ${b < 50 ? b : 100 - b}`; }
  function fmtClock(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function qLabel(q) { return q <= 4 ? ['1st', '2nd', '3rd', '4th'][q - 1] : 'OT'; }

  /* ---------- AI coach ---------- */
  function hurry(g) {
    const side = g.poss; const l = lead(g, side); const left = timeLeftGame(g);
    return (g.q === 2 && g.clock <= 120) || (g.q >= 4 && l < 0 && left <= 300) || (g.q >= 4 && l < -8 && left <= 600);
  }
  function aiOffense(g) {
    const R0 = g.R; const side = g.poss; const l = lead(g, side); const left = timeLeftGame(g); const ytg = 100 - g.ball;
    const smart = g.diff === 'hof' ? 1.15 : g.diff === 'rookie' ? 0.8 : 1;
    if (g.down === 4) return fourthDown(g);
    // sudden death: take the points as soon as the kick is makeable
    if (g.q >= 5 && (g.rules !== 'modern' || (g.otPoss && g.otPoss.firstDone)) && g.down >= 2 && fgProb(g, 117 - g.ball, side) >= 0.6) return 'fg';
    if (g.q >= 5 && g.clock <= 40 && fgProb(g, 117 - g.ball, side) >= 0.3) return 'fg';
    if (g.q === 2 && g.clock <= 8 && fgProb(g, 117 - g.ball, side) >= 0.35) return 'fg';
    if (g.q === 4 && g.clock <= 8 && l >= -3 && l <= 0 && fgProb(g, 117 - g.ball, side) >= 0.2) return 'fg';
    // kill the clock
    if (g.q >= 4 && l > 0 && left <= 120 && g.to[1 - side] === 0 || (g.q >= 4 && l > 0 && left <= 40)) return 'kneel';
    const h = hurry(g);
    let passP = 1 - R0.runShare;
    if (g.down === 3 && g.togo >= 7) passP = 0.88; else if (g.down === 3 && g.togo >= 4) passP = 0.7; else if (g.togo <= 2) passP = 0.3;
    if (g.down === 1) passP -= 0.05;
    if (h) passP = 0.85;
    if (g.q >= 4 && l > 0 && left <= 360) passP = 0.25;
    if (ytg <= 3) passP *= 0.6;
    // lean on the team's strength
    const t = offT(g); passP += clamp((t.off.pass - t.off.run) * 0.25, -0.12, 0.12);
    if (R() < passP) {
      if (g.togo <= 2 && g.down >= 3 && R() < 0.3) return 'short';
      const r = R();
      if (h) return r < 0.6 ? 'short' : r < 0.9 ? 'deep' : 'screen';
      if (g.togo >= 15) return r < 0.45 ? 'deep' : r < 0.85 ? 'short' : 'screen';
      if (g.down <= 2 && r < 0.2) return 'pa';
      return r < 0.62 ? 'short' : r < 0.82 ? 'deep' : 'screen';
    }
    if (g.togo <= 1 && R() < 0.35 * smart) return 'sneak';
    const r = R();
    return r < 0.5 ? 'inside' : r < 0.85 ? 'outside' : 'draw';
  }
  function fgProb(g, dist, side) {
    const k = g.teams[side].st.k; const d50 = g.R.fg50 + (k - 1) * 20;
    return clamp(1 / (1 + Math.exp((dist - d50) / 5.5)), 0.02, 0.995);
  }
  function fourthDown(g) {
    const side = g.poss; const l = lead(g, side); const left = timeLeftGame(g); const ytg = 100 - g.ball; const dist = ytg + 17;
    const modern = g.rules === 'modern'; const fgp = fgProb(g, dist, side);
    const desperate = g.q >= 4 && ((l < 0 && left <= 240) || (l < -8 && left <= 480));
    if (desperate) { if (l >= -3 && fgp > 0.35 && left <= 30) return 'fg'; return g.togo >= 8 ? 'deep' : 'short'; }
    if (g.q >= 4 && l >= -3 && l <= 0 && left <= 10 && fgp > 0.2) return 'fg';
    if (fgp >= 0.5 && dist <= 60 && !(g.togo <= 1 && ytg <= 5 && modern)) return 'fg';
    const goLine = modern ? (g.togo <= 1 && g.ball >= 40) || (g.togo <= 2 && g.ball >= 55) || (g.togo <= 4 && g.ball >= 62 && fgp < 0.5) : (g.togo <= 1 && g.ball >= 55) || (g.togo <= 1 && ytg <= 3);
    if (goLine) return g.togo <= 1 ? (R() < 0.5 ? 'sneak' : 'inside') : 'short';
    return 'punt';
  }
  function aiDefense(g, offCall) {
    const smart = g.diff === 'hof' ? 1 : g.diff === 'rookie' ? 0.2 : 0.55;
    const side = g.poss; const l = lead(g, side); const left = timeLeftGame(g); const ytg = 100 - g.ball;
    // read the situation; the better the AI, the more it reads the offense's tendencies
    let pass = g.down === 3 && g.togo >= 6 ? 0.85 : g.togo <= 2 ? 0.3 : 0.55;
    if (hurry(g)) pass = 0.85; if (g.q >= 4 && l > 0 && left <= 360) pass = 0.25;
    const tend = g.tendency[side]; const n = tend.pass + tend.run;
    if (n > 6 && g.userSide === side) pass = pass * 0.6 + (tend.pass / n) * 0.4;
    if (offCall && R() < smart * 0.25) pass = ['short', 'deep', 'screen', 'pa'].includes(offCall) ? 0.85 : 0.2;
    if (ytg <= 3) return R() < 0.7 ? 'goal' : 'blitz';
    if (g.q >= 4 && l > 0 && l <= 8 && left <= 120 && g.togo > 5) return 'prevent';
    if (g.togo <= 2 && R() < 0.65) return 'runstuff';
    if (pass > 0.7) { const r = R(); return r < 0.3 ? 'blitz' : r < 0.7 ? 'zone' : 'man'; }
    if (pass < 0.35) return R() < 0.6 ? 'runstuff' : 'base';
    const r = R(); return r < 0.45 ? 'base' : r < 0.65 ? 'man' : r < 0.85 ? 'zone' : 'blitz';
  }

  /* ---------- the play ---------- */
  const PASS = ['short', 'deep', 'screen', 'pa', 'flea', 'hbpass'];
  const RUN = ['inside', 'outside', 'draw', 'sneak'];
  function step(g, calls) {
    if (g.over) return null;
    calls = calls || {};
    curRules = g.rules;
    if (g.kickoffNext) return kickoff(g, calls);
    const side = g.poss; const userOff = g.userSide === side; const userDef = g.userSide === 1 - side;
    let oc = userOff && calls.off ? calls.off : aiOffense(g);
    const dc = userDef && calls.def ? calls.def : aiDefense(g, oc);
    if (['flea', 'hbpass', 'fakepunt'].includes(oc)) { if (g.tricks[side] <= 0) oc = 'short'; else g.tricks[side]--; }
    const res = { off: oc, def: dc, text: '', yds: 0, type: '', score: null, turnover: false, big: false, crowd: null, side, events: [], spot0: g.ball, down0: g.down, togo0: g.togo };
    if (PASS.includes(oc) || RUN.includes(oc)) g.tendency[side][PASS.includes(oc) ? 'pass' : 'run']++;
    if (oc === 'punt') return punt(g, res);
    if (oc === 'fg') return fieldGoal(g, res);
    if (oc === 'kneel') return kneel(g, res);
    if (oc === 'fakepunt') return fakePunt(g, res, dc);
    // penalty before / during the play
    const pen = R() < g.R.pen;
    if (pen && R() < 0.35) return prePenalty(g, res);
    let out = PASS.includes(oc) ? passPlay(g, oc, dc, res) : runPlay(g, oc, dc, res);
    if (pen && !res.turnover && !res.score) out = livePenalty(g, res, oc);
    return out;
  }

  function q_(a, b) { const q = K * (KERA[curRules] || 1) * (Math.log(a) - Math.log(b)); return q / (1 + 0.55 * Math.abs(q)); }
  let curRules = 'modern';
  function starBoost(list) { return list.reduce((s, p) => s + (p && p.star ? 1 : 0), 0); }

  function runPlay(g, oc, dc, res) {
    g.box[g.poss].team.plays++;
    const o = offT(g), d = defT(g), so = g.starters[g.poss], sd = g.starters[1 - g.poss];
    const q = q_(o.off.run, d.def.run);
    let mean = g.R.ypr * TUNE.runCore * Math.exp(0.85 * q) * CAL[g.rules] * g.env;
    let sd0 = 3.2, big = TUNE.bigRun * Math.exp(0.9 * q);
    if (oc === 'outside') { mean += 0.3; sd0 = 4.4; big *= 1.25; }
    if (oc === 'draw') { mean -= 0.2; if (dc === 'blitz') mean += 2.6; if (dc === 'prevent' || dc === 'zone') mean += 1.2; }
    if (oc === 'sneak') { mean = 1.6 + q; sd0 = 1.3; big = 0.005; }
    if (dc === 'runstuff') { mean -= 1.1; big *= 0.6; }
    if (dc === 'goal') { mean -= 0.9; big *= 0.4; }
    if (dc === 'blitz' && oc !== 'draw') { big *= 1.5; mean -= 0.3; }
    if (dc === 'prevent') { mean += 1.4; }
    const rb = oc === 'sneak' ? so.QB : (R() < 0.68 ? so.RB[0] : so.RB[1] || so.RB[0]);
    // team strength already counts its stars (it comes from real points), so a star changes who makes the play, not how many points
    let yds;
    if (R() < big) yds = Math.round(10 + Math.pow(R(), 1.7) * TUNE.bigRunLen);
    else yds = Math.round(mean + norm() * sd0);
    yds = clamp(yds, -6, 100 - g.ball);
    const name = rb ? rb.n : 'RB';
    const s = st(g, g.poss, 'rush', name); s.car++;
    // fumble
    if (R() < g.R.fum * Math.exp(-0.9 * q_(o.off.sec, d.def.take))) {
      const tackler = pickDef(sd, ['LB', 'DL', 'S']);
      s.yds += yds; g.box[g.poss].team.ry += yds; g.box[g.poss].team.yds += yds;
      st(g, 1 - g.poss, 'def', tackler).ff++;
      res.text = `${name} runs for ${yds >= 0 ? yds : 'a loss of ' + -yds}… FUMBLE! ${d.short} recover${tackler ? ', forced by ' + tackler : ''}.`;
      res.type = 'fumble'; res.turnover = true; res.crowd = crowdFor(g, 1 - g.poss);
      advanceClock(g, 6); g.box[g.poss].team.to++;
      turnover(g, g.ball + yds); return finish(g, res);
    }
    s.yds += yds; g.box[g.poss].team.ry += yds; g.box[g.poss].team.yds += yds;
    const tackler = pickDef(sd, ['LB', 'LB', 'S', 'DL', 'CB']); if (tackler) st(g, 1 - g.poss, 'def', tackler).tk++;
    const verb = { inside: 'up the middle', outside: 'around the end', draw: 'on the draw', sneak: 'on the sneak' }[oc];
    res.text = yds > 0 ? `${name} ${pick(['runs', 'carries', 'rumbles', 'slashes'])} ${verb} for ${yds} yard${yds === 1 ? '' : 's'}.` : yds === 0 ? `${name} is stopped at the line ${verb}.` : `${name} is dropped for a loss of ${-yds}${tackler ? ' by ' + tackler : ''}.`;
    res.type = 'run'; res.yds = yds; if (yds >= 20) { res.big = true; res.crowd = crowdFor(g, g.poss); }
    gain(g, res, yds, rb, 'rush');
    advanceClock(g, playTime(g, false));
    return finish(g, res);
  }

  function pickDef(sd, posList) {
    const pool = [];
    posList.forEach((pos) => { (Array.isArray(sd[pos]) ? sd[pos] : [sd[pos]]).forEach((p) => { if (p) pool.push(p); }); });
    if (!pool.length) return null;
    const w = pool.map((p) => (p.star ? 3 : 1) * (p.r / 70));
    let r = R() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i].n; }
    return pool[0].n;
  }
  function pickTarget(so, oc) {
    const opts = [];
    so.WR.forEach((p, i) => opts.push([p, [0.3, 0.22, 0.13][i] || 0.1]));
    if (so.TE) opts.push([so.TE, 0.17]);
    so.RB.forEach((p, i) => opts.push([p, i === 0 ? (oc === 'screen' ? 0.7 : 0.11) : 0.05]));
    if (oc === 'deep') opts.forEach((o) => { if (o[0] && o[0].pos !== 'WR') o[1] *= 0.25; });
    opts.forEach((o) => { if (o[0] && o[0].star) o[1] *= 1.45; });
    let r = R() * opts.reduce((a, o) => a + o[1], 0);
    for (const [p, w] of opts) { r -= w; if (r <= 0) return p; }
    return opts[0][0];
  }

  function passPlay(g, oc, dc, res) {
    g.box[g.poss].team.plays++;
    const o = offT(g), d = defT(g), so = g.starters[g.poss], sd = g.starters[1 - g.poss];
    const qb = oc === 'hbpass' ? so.RB[0] : so.QB; const qbn = qb ? qb.n : 'QB';
    const qp = q_(o.off.pass, d.def.pass), qs = q_(o.off.prot, d.def.rush);
    let comp = g.R.comp + 0.11 * qp; let yMult = Math.exp(0.55 * qp) * CAL[g.rules] * TUNE.passCore * g.env; let intR = g.R.int * Math.exp(-1.4 * qp) * Math.exp(-0.5 * q_(o.off.sec, d.def.take)); let sack = g.R.sack * Math.exp(-1.4 * qs);
    const typ = { short: [0.11, 0.62, 1.0, 1.0], deep: [-0.23, 2.05, 1.7, 1.15], screen: [0.17, 0.5, 0.5, 0.35], pa: [-0.02, 1.3, 1.0, 1.15], flea: [-0.1, 2.3, 1.2, 0.8], hbpass: [-0.15, 2.0, 2.0, 0.6] }[oc];
    comp += typ[0]; let yards = g.R.ycomp != null ? g.R.ycomp : g.R.ypc; yards *= typ[1] * yMult; intR *= typ[2]; sack *= typ[3];
    if (oc === 'pa') { const runCred = o.off.run; comp += 0.04 * (runCred - 1); yards *= 1 + 0.15 * (runCred - 1); if (dc === 'runstuff') { comp += 0.06; yards *= 1.3; } }
    if (oc === 'flea' && (dc === 'blitz')) sack *= 2.2; else if (oc === 'flea' && dc !== 'prevent') comp += 0.08;
    const dm = { base: [0, 1, 1, 1], blitz: [-0.04, 1.12, 1.0, 1.65], man: [-0.035, 0.98, 1.1, 1], zone: [-0.01, 0.95, 1.2, 0.95], prevent: [oc === 'deep' ? -0.18 : 0.08, oc === 'deep' ? 0.7 : 0.9, 0.9, 0.6], goal: [oc === 'deep' ? 0.12 : -0.05, 0.8, 1.1, 1], runstuff: [0.05, 1.08, 0.9, 0.9] }[dc] || [0, 1, 1, 1];
    comp += dm[0]; yards *= dm[1]; intR *= dm[2]; sack *= dm[3];
    if (dc === 'blitz' && oc === 'screen') { comp += 0.05; yards *= 1.6; }
    if (dc === 'blitz' && oc === 'deep') { yards *= 1.15; }
    const rusher = () => pickDef(sd, ['DL', 'DL', 'LB']);
    const ps = st(g, g.poss, 'pass', qbn);
    // sack
    if (R() < sack) {
      const who = rusher(); const loss = Math.round(5 + R() * 6);
      const lossy = Math.min(loss, g.ball - 1);
      st(g, 1 - g.poss, 'def', who).sk++; g.box[1 - g.poss].team.sacks++;
      g.box[g.poss].team.yds -= lossy;
      // strip sack
      if (R() < 0.1 * Math.exp(0.6 * q_(d.def.take, o.off.sec))) {
        res.text = `${qbn} is sacked by ${who} — and the ball comes loose! ${d.short} recover!`; res.type = 'fumble'; res.turnover = true; res.crowd = crowdFor(g, 1 - g.poss); res.big = true;
        g.box[g.poss].team.to++; st(g, 1 - g.poss, 'def', who).ff++; advanceClock(g, 6); turnover(g, g.ball - lossy); return finish(g, res);
      }
      res.text = `${qbn} is sacked by ${who} for a loss of ${lossy}.`; res.type = 'sack'; res.yds = -lossy; res.crowd = res.crowd || crowdFor(g, 1 - g.poss, true);
      gain(g, res, -lossy, null, 'sack'); advanceClock(g, playTime(g, false)); return finish(g, res);
    }
    ps.att++;
    const tgt = pickTarget(so, oc); const tn = tgt ? tgt.n : 'receiver';
    comp = clamp(comp, 0.05, 0.9);
    if (R() < comp) {
      let y = Math.round(yards * (0.55 + R() * 0.9) + norm() * 2);
      if (R() < TUNE.catchRun * Math.exp(0.7 * qp) * (oc === 'deep' ? 1.7 : 1)) y += Math.round(15 + R() * 40); // broken tackle / catch-and-run
      y = clamp(y, oc === 'screen' ? -4 : -2, 100 - g.ball);
      ps.cmp++; ps.yds += y; const rs = st(g, g.poss, 'rec', tn); rs.rec++; rs.yds += y; g.box[g.poss].team.py += y; g.box[g.poss].team.yds += y;
      // fumble after catch
      if (R() < g.R.fum * 0.6) {
        const who = pickDef(sd, ['CB', 'S', 'LB']); res.text = `${qbn} completes to ${tn} for ${y}… but he fumbles! ${d.short} recover${who ? ' — ' + who + ' punched it out' : ''}.`;
        res.type = 'fumble'; res.turnover = true; res.crowd = crowdFor(g, 1 - g.poss); g.box[g.poss].team.to++; advanceClock(g, 6); turnover(g, g.ball + y); return finish(g, res);
      }
      const desc = oc === 'deep' || oc === 'flea' ? pick(['goes deep to', 'launches it downfield to', 'airs it out for']) : oc === 'screen' ? 'dumps a screen to' : pick(['hits', 'finds', 'completes to', 'connects with']);
      res.text = `${oc === 'flea' ? 'Flea flicker! ' : oc === 'hbpass' ? 'Halfback pass! ' : oc === 'pa' ? 'Play action — ' : ''}${qbn} ${desc} ${tn} for ${y >= 0 ? y : 'a loss of ' + -y} yard${Math.abs(y) === 1 ? '' : 's'}.`;
      res.type = 'pass'; res.yds = y; if (y >= 25) { res.big = true; res.crowd = crowdFor(g, g.poss); }
      res.close = R() < 0.06 ? 'catch' : null;
      const oob = hurry(g) && R() < 0.45;
      gain(g, res, y, tgt, 'rec', qb);
      advanceClock(g, oob ? 7 : playTime(g, false));
      if (oob && !res.score) res.text += ' He gets out of bounds.';
      return finish(g, res);
    }
    // incomplete or interception
    if (R() < intR / Math.max(0.1, 1 - comp)) {
      const who = pickDef(sd, ['CB', 'CB', 'S', 'S', 'LB']);
      ps.int++; st(g, 1 - g.poss, 'def', who).int++; g.box[g.poss].team.to++;
      const ret = Math.round(R() < 0.06 ? 100 : Math.max(0, norm() * 8 + 9));
      res.text = `${qbn} throws for ${tn}… INTERCEPTED by ${who}!`; res.type = 'int'; res.turnover = true; res.big = true; res.crowd = crowdFor(g, 1 - g.poss);
      advanceClock(g, 7);
      const air = Math.round(clamp(yards * 0.8, 5, 40));
      const spot = clamp(g.ball + air, 1, 99);
      // return
      const newBall = (100 - spot) + ret;
      if (newBall >= 100) { res.text += ` ${who} takes it all the way back — pick six!`; turnover(g, spot); score(g, g.poss, 'td', res, who); return finish(g, res); }
      if (ret > 15) res.text += ` Returned ${ret} yards.`;
      turnover(g, spot - ret, true); return finish(g, res);
    }
    const pd = pickDef(sd, ['CB', 'S', 'LB']); if (pd && R() < 0.4) st(g, 1 - g.poss, 'def', pd).pd++;
    res.text = `${qbn}'s pass for ${tn} is ${pick(['incomplete', 'off the mark', 'broken up' + (pd ? ' by ' + pd : ''), 'dropped', 'overthrown'])}.`;
    res.type = 'inc'; res.close = R() < 0.07 ? 'inc' : null;
    advanceClock(g, 6);
    nextDown(g, res, 0);
    return finish(g, res);
  }

  function crowdFor(g, sideGood, mild) { return sideGood === 1 ? (mild ? 'cheerDef' : 'cheer') : (mild ? 'groan' : 'groan'); }

  function gain(g, res, yds, player, kind, qb) {
    const side = g.poss;
    g.drive.plays++; g.drive.yds += yds;
    const newBall = g.ball + yds;
    if (newBall >= 100) {
      const pn = player ? player.n : 'He';
      res.text += ` TOUCHDOWN${player ? ', ' + pn : ''}!`;
      if (kind === 'rush') st(g, side, 'rush', pn).td++;
      if (kind === 'rec') { st(g, side, 'rec', pn).td++; if (qb) st(g, side, 'pass', qb.n).td++; }
      g.ball = 100; score(g, side, 'td', res, pn); return;
    }
    if (newBall <= 0) { // safety
      res.text += ' Tackled in the end zone — SAFETY!'; score(g, 1 - side, 'safety', res); return;
    }
    g.ball = newBall;
    nextDown(g, res, yds);
  }
  function nextDown(g, res, yds) {
    if (yds >= g.togo) { g.down = 1; g.togo = Math.min(10, 100 - g.ball); g.box[g.poss].team.fd++; if (res.type !== 'pen') res.text += ' First down.'; return; }
    g.togo -= yds; g.down++;
    if (g.down > 4) { res.text += ` Turnover on downs.`; res.type = res.type || 'downs'; res.turnover = true; res.crowd = crowdFor(g, 1 - g.poss); turnover(g, g.ball); }
  }
  function turnover(g, spot, noFlip) {
    // spot is in the offense's frame; flip to the new offense
    spot = clamp(spot, 1, 99);
    g.poss = 1 - g.poss; g.ball = noFlip ? clamp(100 - spot, 1, 99) : clamp(100 - spot, 1, 99);
    if (noFlip === true) g.ball = clamp(100 - spot, 1, 99);
    g.down = 1; g.togo = Math.min(10, 100 - g.ball); g.drive = { plays: 0, yds: 0, start: g.ball };
    otCheck(g, 'turnover');
  }

  function score(g, side, kind, res, who) {
    const pts = { td: 6, fg: 3, safety: 2 }[kind];
    g.score[side] += pts; addQ(g, side, pts);
    res.score = { side, kind, pts };
    res.crowd = side === 1 ? 'roar' : 'groan'; res.big = true;
    if (kind === 'td') {
      const t = g.teams[side];
      // extra point or two
      const userChoice = g.userSide === side && res.twoPt != null ? res.twoPt : null;
      const tryTwo = g.R.twoPt && (userChoice != null ? userChoice : aiTwo(g, side));
      if (tryTwo) {
        if (R() < 0.47 + 0.05 * (t.off.pass - 1)) { g.score[side] += 2; addQ(g, side, 2); res.text += ' The two-point try is GOOD!'; }
        else res.text += ' The two-point try fails.';
      } else {
        const p = g.R.pat * (0.97 + 0.03 * t.st.k);
        g.box[side].kick.xpa++;
        if (R() < p) { g.score[side] += 1; addQ(g, side, 1); g.box[side].kick.xpm++; } else res.text += ' The extra point is no good!';
      }
      g.kicking = side; g.kickoffNext = true;
      if (otCheck(g, 'td', side)) return;
    } else if (kind === 'fg') { g.kicking = side; g.kickoffNext = true; if (otCheck(g, 'fg', side)) return; }
    else if (kind === 'safety') { g.kicking = 1 - side; g.kickoffNext = true; g.safetyKick = true; if (g.q >= 5) endGame(g); }
  }
  function aiTwo(g, side) {
    if (g.q < 4) return false;
    const l = lead(g, side); // after the 6
    return l === -2 || l === -5 || l === -10 || l === 1 || l === 5 || l === -9;
  }
  function addQ(g, side, pts) { const qi = Math.min(g.q, 5) - 1; while (g.qs[side].length <= qi) g.qs[side].push(0); g.qs[side][qi] += pts; }

  function playTime(g, stopped) {
    if (stopped) return 6;
    if (hurry(g)) return 11 + R() * 6;
    const side = g.poss; const l = lead(g, side);
    if (g.q >= 4 && l > 0) return PT + 9 + R() * 4; // milk it
    return PT + R() * 8;
  }
  function advanceClock(g, secs) {
    const before = g.clock; g.clock -= secs;
    const side = g.poss; g.box[side].team.top += Math.min(secs, before);
    if ((g.q === 2 || g.q === 4) && before > 120 && g.clock <= 120) { g.clock = 120; g.twoMinPending = true; }
    // defensive timeouts when trailing late
    const defSide = 1 - side;
    if (g.userSide !== defSide && g.q >= 4 && g.clock < 240 && g.clock > 0 && lead(g, defSide) < 0 && lead(g, defSide) >= -16 && g.to[defSide] > 0 && secs > 20) {
      g.clock = before - 7; g.to[defSide]--; g.pendingNote = (g.pendingNote || '') + ` ${g.teams[defSide].short} call timeout.`;
    }
    if (g.clock <= 0) { g.clock = 0; g.endQuarterPending = true; }
  }

  function finish(g, res) {
    if (g.pendingNote) { res.text += g.pendingNote; g.pendingNote = null; }
    if (g.twoMinPending) { res.text += ' Two-minute warning.'; g.twoMinPending = false; }
    res.down = g.down; res.togo = g.togo; res.ball = g.ball; res.poss = g.poss;
    g.log.push({ q: g.q, clock: g.clock, text: res.text, score: g.score.slice(), type: res.type, side: res.side });
    g.lastPlay = res;
    if (g.endQuarterPending && !g.over) { g.endQuarterPending = false; endQuarter(g, res); }
    return res;
  }
  function endQuarter(g, res) {
    if (g.q === 2) { // halftime
      g.q = 3; g.clock = 900; g.to = [3, 3]; g.kickoffNext = true; g.kicking = 0; // away kicked? second half: home receives
      g.kicking = 0; res.text += ' That\'s halftime.'; res.half = true; return;
    }
    if (g.q === 4) {
      if (g.score[0] !== g.score[1]) { endGame(g); res.text += ' FINAL.'; return; }
      // overtime
      g.q = 5; g.clock = g.rules === 'modern' ? 600 : 900; g.to = [2, 2]; g.kickoffNext = true; g.kicking = R() < 0.5 ? 0 : 1; g.otPoss = { first: 1 - g.kicking, firstDone: false, firstPts: 0 };
      res.text += ' We\'re going to OVERTIME!'; res.ot = true; return;
    }
    if (g.q >= 5) { endGame(g); g.tie = g.score[0] === g.score[1]; res.text += g.tie ? ' Overtime ends in a TIE.' : ' FINAL.'; return; }
    g.q++; g.clock = 900; res.text += ` End of the ${qLabel(g.q - 1)} quarter.`;
  }
  function endGame(g) { g.over = true; g.winner = g.score[0] > g.score[1] ? 0 : g.score[1] > g.score[0] ? 1 : -1; }
  function otCheck(g, what, side) {
    if (g.q < 5 || g.over) return false;
    if (g.rules !== 'modern') { if (what === 'td' || what === 'fg') { endGame(g); return true; } return false; }
    const ot = g.otPoss;
    if (what === 'td') { endGame(g); return true; }
    if (!ot.firstDone) {
      if (what === 'fg' && side === ot.first) { ot.firstDone = true; ot.firstPts = 3; return false; }
      if (what === 'turnover' || what === 'punt') { ot.firstDone = true; return false; }
      if (what === 'fg') { endGame(g); return true; }
      return false;
    }
    if (what === 'fg') { if (g.score[0] !== g.score[1]) { endGame(g); return true; } }
    if ((what === 'turnover' || what === 'punt') && ot.firstPts && g.score[0] !== g.score[1]) { endGame(g); return true; }
    return false;
  }

  /* ---------- kicks ---------- */
  function kickoff(g, calls) {
    const kick = g.kicking; const recv = 1 - kick; const res = { text: '', type: 'kickoff', side: recv, score: null, turnover: false, big: false, spot0: 35 };
    g.kickoffNext = false;
    const userKick = g.userSide === kick; const onside = userKick ? calls.onside : aiOnside(g, kick);
    g.poss = recv;
    if (g.safetyKick) { g.safetyKick = false; g.ball = clamp(Math.round(g.R.ko + 8 + norm() * 6), 15, 60); g.down = 1; g.togo = 10; res.text = `Free kick after the safety. ${g.teams[recv].short} start at ${spotText(g)}.`; return finish(g, res); }
    if (onside) {
      const surprise = userKick && !aiExpectsOnside(g, kick);
      const p = g.R.onside * (surprise ? 2 : 1);
      if (R() < p) { g.poss = kick; g.ball = 47; g.down = 1; g.togo = 10; res.text = `ONSIDE KICK — ${g.teams[kick].short} recover!`; res.big = true; res.crowd = kick === 1 ? 'roar' : 'groan'; res.type = 'onside'; g.drive = { plays: 0, yds: 0, start: g.ball }; advanceClock(g, 4); return finish(g, res); }
      g.ball = 53; g.down = 1; g.togo = 10; res.text = `Onside kick… ${g.teams[recv].short} recover at the ${100 - 53}.`; advanceClock(g, 4); g.drive = { plays: 0, yds: 0, start: g.ball }; return finish(g, res);
    }
    const ret = g.teams[recv].st.ret;
    if (R() < 0.005 * ret) { res.text = `${g.teams[recv].short} take the kickoff… and he's GONE! Kickoff return touchdown!`; g.ball = 100; advanceClock(g, 12); score(g, recv, 'td', res, 'Returner'); return finish(g, res); }
    const spot = clamp(Math.round(g.R.ko + (ret - 1) * 8 + norm() * 6), 8, 60);
    g.ball = spot; g.down = 1; g.togo = 10; g.drive = { plays: 0, yds: 0, start: g.ball };
    res.text = spot === 25 || spot === 30 ? `Touchback. ${g.teams[recv].short} start at their ${spot}.` : `${g.teams[kick].short} kick off. ${g.teams[recv].short} return it to their ${spot}.`;
    advanceClock(g, spot === 25 ? 0 : 6);
    return finish(g, res);
  }
  function aiOnside(g, kick) { return g.q >= 4 && lead(g, kick) < 0 && lead(g, kick) >= -16 && timeLeftGame(g) <= 150; }
  function aiExpectsOnside(g, kick) { return g.q >= 4 && lead(g, kick) < 0 && timeLeftGame(g) <= 300; }

  function punt(g, res) {
    const side = g.poss; const t = g.teams[side]; const rec = 1 - side;
    if (R() < 0.006) { res.text = `The punt is BLOCKED! ${g.teams[rec].short} take over.`; res.turnover = true; res.big = true; res.crowd = crowdFor(g, rec); advanceClock(g, 6); turnover(g, g.ball - 8); return finish(g, res); }
    const gross = Math.round((g.R.punt + 5) * (0.95 + 0.1 * t.st.p) + norm() * 6);
    let land = g.ball + gross;
    g.box[side].punt.n++;
    if (land >= 100) { res.text = `${t.short} punt into the end zone. Touchback.`; g.box[side].punt.yds += 100 - g.ball - 20; advanceClock(g, 7); turnover(g, 80); res.type = 'punt'; otCheck(g, 'punt'); return finish(g, res); }
    if (R() < 0.005 * g.teams[rec].st.ret) { res.text = `${t.short} punt… returned ALL THE WAY for a touchdown!`; g.box[side].punt.yds += gross; advanceClock(g, 12); turnover(g, land); g.ball = 100; score(g, g.poss, 'td', res, 'Returner'); res.type = 'punt'; return finish(g, res); }
    const retY = land >= 90 ? 0 : clamp(Math.round(norm() * 5 + 7 * g.teams[rec].st.ret), 0, 40);
    const net = gross - retY; land = g.ball + net;
    g.box[side].punt.yds += net;
    res.text = `${t.short} punt ${gross} yards${retY > 0 ? `, returned ${retY}` : land >= 90 ? ', downed deep' : ', fair catch'}.`; res.type = 'punt';
    advanceClock(g, 9); turnover(g, land); otCheck(g, 'punt');
    return finish(g, res);
  }
  function fieldGoal(g, res) {
    const side = g.poss; const dist = 100 - g.ball + 17; const p = fgProb(g, dist, side);
    g.box[side].kick.fga++;
    advanceClock(g, 5);
    res.type = 'fg';
    if (R() < p) {
      g.box[side].kick.fgm++; g.box[side].kick.long = Math.max(g.box[side].kick.long, dist);
      res.text = `${dist}-yard field goal attempt… it's GOOD!`; g.ball = 100; score(g, side, 'fg', res);
    } else {
      res.text = `${dist}-yard field goal attempt… NO GOOD! ${R() < 0.5 ? 'Wide right.' : 'Wide left.'}`; res.crowd = crowdFor(g, 1 - side); res.turnover = true;
      turnover(g, Math.min(g.ball - 7, 80));
      if (g.q >= 5 && g.rules === 'modern' && g.otPoss && !g.otPoss.firstDone) g.otPoss.firstDone = true;
    }
    return finish(g, res);
  }
  function kneel(g, res) { res.text = `${g.starters[g.poss].QB ? g.starters[g.poss].QB.n : 'The QB'} takes a knee.`; res.type = 'kneel'; g.ball = Math.max(1, g.ball - 1); g.down++; g.togo++; advanceClock(g, 41); if (g.down > 4) { res.text += ' Turnover on downs.'; turnover(g, g.ball); } return finish(g, res); }
  function fakePunt(g, res, dc) {
    const ok = R() < (g.togo <= 5 ? 0.55 : 0.35);
    if (ok) { const y = g.togo + Math.round(R() * 8); res.text = `FAKE PUNT! The punter takes off and picks up ${y}!`; res.big = true; res.crowd = crowdFor(g, g.poss); gain(g, res, y, null, 'rush'); advanceClock(g, 7); return finish(g, res); }
    res.text = 'Fake punt… stuffed! Turnover on downs.'; res.turnover = true; res.crowd = crowdFor(g, 1 - g.poss); advanceClock(g, 7); turnover(g, g.ball + 1); return finish(g, res);
  }

  /* ---------- penalties ---------- */
  function prePenalty(g, res) {
    const offPen = R() < 0.55;
    const side = offPen ? g.poss : 1 - g.poss;
    if (offPen) {
      const y = 5; g.ball = Math.max(1, g.ball - y); g.togo += y; g.box[g.poss].team.pen++; g.box[g.poss].team.peny += y;
      res.text = `FLAG — false start on ${offT(g).short}. 5-yard penalty.`;
    } else {
      const y = Math.min(5, 99 - g.ball); g.ball += y; g.togo -= y; g.box[1 - g.poss].team.pen++; g.box[1 - g.poss].team.peny += y;
      res.text = `FLAG — offside, ${defT(g).short}. 5 yards.`;
      if (g.togo <= 0) { g.down = 1; g.togo = Math.min(10, 100 - g.ball); res.text += ' First down.'; }
    }
    void side; res.type = 'pen'; res.crowd = offPen ? null : null;
    return finish(g, res);
  }
  function livePenalty(g, res, oc) {
    // holding wipes out a gain; pass interference / roughing add yards
    const passing = PASS.includes(oc);
    if (R() < 0.5 && res.yds > 0) {
      // offensive holding: undo the play, back 10
      const back = Math.min(10, Math.floor((res.spot0 - 1) / 2) || 1);
      g.ball = clamp(res.spot0 - back, 1, 99); g.down = res.down0; g.togo = res.togo0 + back;
      res.text = `FLAG — holding on ${offT(g).short} wipes out the play. ${back}-yard penalty, replay the down.`;
      g.box[g.poss].team.pen++; g.box[g.poss].team.peny += back; res.type = 'pen';
      return finish(g, res);
    }
    if (passing && res.type === 'inc') {
      const y = clamp(Math.round(10 + R() * 25), 5, 99 - g.ball);
      g.ball += y; g.down = 1; g.togo = Math.min(10, 100 - g.ball); g.box[1 - g.poss].team.pen++; g.box[1 - g.poss].team.peny += y;
      res.text += ` But there's a FLAG — pass interference on ${defT(g).short}! ${y} yards and a first down.`; res.type = 'pen';
      return finish(g, res);
    }
    if (R() < 0.5) {
      const y = Math.min(15, 99 - g.ball); g.ball += y; g.down = 1; g.togo = Math.min(10, 100 - g.ball); g.box[1 - g.poss].team.pen++; g.box[1 - g.poss].team.peny += y;
      res.text += ` FLAG — ${pick(['personal foul', 'roughing the passer', 'facemask', 'unnecessary roughness'])} on ${defT(g).short}, 15 more yards and a first down.`;
      return finish(g, res);
    }
    return res;
  }

  /* ---------- user helpers ---------- */
  function timeout(g, side) {
    if (g.to[side] <= 0 || g.over) return false;
    g.to[side]--; g.clock = Math.min(900, g.clock + 0); g.timeoutStop = true;
    // stop the clock: give back the runoff from the last play
    if (g.lastPlay && ['run', 'pass', 'sack', 'kneel'].includes(g.lastPlay.type) && g.lastPlay.poss === g.poss) g.clock = Math.min(g.clock + 30, 900);
    return true;
  }
  function challenge(g, side) {
    const lp = g.lastPlay; if (!lp || !lp.close || g.challenges[side] <= 0 || lp.challenged) return null;
    lp.challenged = true; g.challenges[side]--;
    if (R() < 0.38) { g.challenges[side]++; return { overturned: true, text: lp.close === 'catch' ? 'After review, it\'s ruled INCOMPLETE. The catch is overturned.' : 'After review, the pass is ruled COMPLETE! Call overturned.' }; }
    return { overturned: false, text: 'After review, the ruling on the field stands.' };
  }
  // in-game substitution: the new man takes the slot's carries, targets and credit; his rating nudges the unit
  const SUBW = { QB: { pass: 1.2 }, RB1: { run: 0.8, pass: 0.06 }, RB2: { run: 0.15 }, WR1: { pass: 0.45 }, WR2: { pass: 0.28 }, WR3: { pass: 0.16 }, TE: { pass: 0.15, run: 0.1 } };
  function slotGet(st, slot) { if (slot === 'QB' || slot === 'TE') return st[slot]; if (slot[0] === 'R') return st.RB[+slot[2] - 1]; return st.WR[+slot[2] - 1]; }
  function slotSet(st, slot, p) { if (slot === 'QB' || slot === 'TE') st[slot] = p; else if (slot[0] === 'R') st.RB[+slot[2] - 1] = p; else st.WR[+slot[2] - 1] = p; }
  function subPlayer(g, side, slot, name) {
    const t = g.teams[side]; const st = g.starters[side];
    const inP = t.roster.find((p) => p.n === name && !p.generic); if (!inP) return null;
    const outP = slotGet(st, slot); if (outP === inP) return null;
    // if the incoming player already holds another skill slot, the two trade places
    const other = Object.keys(SUBW).find((k) => k !== slot && slotGet(st, k) === inP);
    if (other) slotSet(st, other, outP);
    slotSet(st, slot, inP);
    const nudge = (sl, a, b) => { const w = SUBW[sl]; const gap = ((b ? b.r : 70) - (a ? a.r : 70)) / 100; if (w.pass) t.off.pass *= Math.exp(gap * w.pass); if (w.run) t.off.run *= Math.exp(gap * w.run); };
    nudge(slot, outP, inP); if (other) nudge(other, inP, outP);
    return { inP, outP, slot };
  }
  function changeQB(g, side) {
    const t = g.teams[side]; const cur = g.starters[side].QB;
    const nxt = t.by('QB').find((q) => q !== cur && !q.generic); if (!nxt) return null;
    subPlayer(g, side, 'QB', nxt.n); return nxt;
  }

  /* ---------- sims ---------- */
  function simGame(g) { let n = 0; while (!g.over && n++ < 400) step(g, {}); return g; }
  function simDrive(g) { const p = g.poss; let n = 0; const out = []; do { out.push(step(g, {})); n++; } while (!g.over && g.poss === p && n < 40 && !g.kickoffNext); if (g.kickoffNext && !g.over) out.push(step(g, {})); return out; }
  function simTo(g, cond) { let n = 0; const out = []; while (!g.over && n++ < 400 && !cond(g)) out.push(step(g, {})); return out; }

  root.Arena = root.Arena || {};
  root.Arena.football = { RULES, rulesForYear, buildTeam, unitsFromRoster, newGame, step, simGame, simDrive, simTo, setSeed, setK(k) { K = k; }, CAL, timeout, challenge, changeQB, subPlayer, fillRoster, fmtClock, qLabel, spotText, lead, timeLeftGame, aiOffense, aiDefense, fgProb, genericRoster };
  if (typeof module !== 'undefined') module.exports = root.Arena.football;
})(typeof window !== 'undefined' ? window : globalThis);
