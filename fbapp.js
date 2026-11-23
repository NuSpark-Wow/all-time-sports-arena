/* The All-Time Sports Arena — football screens */
(function () {
  'use strict';
  const F = window.Arena.football;
  const SND = window.ArenaSound;
  const $ = (s, r) => (r || document).querySelector(s);
  const app = $('#app'), dock = $('#dock');
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = (x) => (x == null || isNaN(x) ? '—' : x.toFixed(1));
  const DR = window.Arena.fbDream;
  const T = (t) => (t.dream ? t.name : t.y + ' ' + t.name);
  const TS = (t) => (t.dream ? t.nick : t.y + ' ' + t.short);

  const S = {
    idx: null, rosters: null, screen: 'setup',
    setup: { mode: 'play', userSide: 1, diff: 'pro', rules: 'auto', sides: [{ y: 1972, fr: 'MIA' }, { y: 2024, fr: 'NE' }] },
    teams: [null, null], game: null, calls: { off: 'inside', def: 'base', twoPt: false, onside: false }, tab: 'call', auto: null, speed: 1, lastRes: null, chatter: null, starters: [{}, {}],
  };

  async function load() {
    if (S.idx) return;
    const [a, b, c, d] = await Promise.all(['football-index.json', 'football-rosters.json', 'football-light.json', 'football-dream.json'].map((f) => fetch(f).then((r) => r.json())));
    S.idx = a; S.rosters = b; S.light = c; DR.setPool(d);
    // franchise names: each franchise's most recent name
    S.frName = {}; Object.keys(a.teams).map(Number).sort((x, y) => x - y).forEach((y) => a.teams[y].forEach((t) => { S.frName[t.fr] = { name: t.name, nick: t.nick }; }));
  }
  function tsFor(y, fr) {
    const t = (S.idx.teams[y] || []).find((x) => x.fr === fr); if (!t) return null;
    const key = y + fr; const full = S.rosters[key]; const lt = S.light && S.light[key];
    if (full) return Object.assign({ y, key, roster: full, badge: 'gold' }, t);
    if (lt) return Object.assign({ y, key, light: true, badge: 'silver', units: lt.u, roster: lt.r.map(([pos, n, r, star]) => ({ pos, n, ln: n.split(' ').filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w)).pop(), r, star: !!star })) }, t);
    return Object.assign({ y, key, roster: null, badge: 'bronze' }, t);
  }
  function rec(t) { return t.dream ? 'Dream team' : `${t.W}–${t.L}${t.T ? '–' + t.T : ''}`; }
  function sideYear(i) { const sd = S.setup.sides[i]; if (sd.kind !== 'dream') return sd.y; const t = dreamTeam(i); return t ? t.y : sd.to; }
  function rulesFor() { const r = S.setup.rules; return r === 'auto' ? F.rulesForYear(sideYear(1)) : r; }

  /* ---------------- dream teams ---------------- */
  const FIRST = 1960, LAST = 2025;
  function dreamLabel(sd) {
    const who = sd.fr === 'ANY' ? '' : S.frName[sd.fr].nick;
    if (sd.fr !== 'ANY' && sd.from === FIRST && sd.to === LAST) return `All-time ${who}`;
    const yrs = sd.from === sd.to ? String(sd.from) : (sd.from % 10 === 0 && sd.to === sd.from + 9 ? sd.from + 's' : `${sd.from}–${String(sd.to).slice(sd.from < 2000 && sd.to >= 2000 ? 0 : 2)}`);
    return sd.fr === 'ANY' ? `${yrs} All-Stars` : `${yrs} ${who}`;
  }
  function dreamPick(i) {
    const sd = S.setup.sides[i]; const key = `${sd.fr}|${sd.from}|${sd.to}`;
    if (!sd.pick || sd.pickKey !== key) { sd.cands = DR.candidates(sd.fr, sd.from, sd.to); sd.pick = DR.autoPick(sd.cands); sd.pickKey = key; sd.edited = false; }
    return sd.pick;
  }
  function dreamTeam(i) {
    const sd = S.setup.sides[i]; if (sd.kind !== 'dream') return null;
    const label = dreamLabel(sd);
    const ts = DR.teamFrom(dreamPick(i), S.idx, { fr: sd.fr, label, nick: sd.fr === 'ANY' ? label.replace(' All-Stars', ' Stars') : label });
    // unit split from the named lineup, trusted a little less than a real season
    const u = F.unitsFromRoster(ts.roster); ['pass', 'run', 'prot', 'sec', 'pdef', 'rdef', 'rush', 'take'].forEach((k) => { u[k] = Math.pow(u[k], 0.6); });
    ts.units = u; ts.fill = true;
    return ts;
  }
  function frOpts(sel) {
    const list = Object.keys(S.frName).map((f) => [f, S.frName[f].name]).sort((a, b) => a[1].localeCompare(b[1]));
    return `<option value="ANY"${sel === 'ANY' ? ' selected' : ''}>Any team (era all-stars)</option>` + list.map(([f, n]) => `<option value="${f}"${f === sel ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }
  function yrOpts(sel, lo, hi) { let h = ''; for (let y = hi; y >= lo; y--) h += `<option value="${y}"${y === sel ? ' selected' : ''}>${y}</option>`; return h; }

  function headerButtons() { $('#homeBtn').classList.remove('hide'); }

  /* ---------------- setup ---------------- */
  function yearOpts(sel) { let h = ''; const ys = Object.keys(S.idx.teams).map(Number).sort((a, b) => b - a); ys.forEach((y) => { h += `<option value="${y}"${y === sel ? ' selected' : ''}>${y}</option>`; }); return h; }
  function teamOpts(y, sel) {
    return (S.idx.teams[y] || []).map((t) => { const full = !!S.rosters[y + t.fr]; return `<option value="${t.fr}"${t.fr === sel ? ' selected' : ''}>${esc(t.name)} (${rec(t)})${full ? ' · full roster' : ''}</option>`; }).join('');
  }
  function sideCard(i) {
    const sd = S.setup.sides[i]; const st = S.setup;
    const kind = `<div class="seg" role="group" aria-label="Team type" style="margin-top:8px"><button data-kind="real" data-side="${i}" class="${sd.kind !== 'dream' ? 'sel' : ''}">Real season</button><button data-kind="dream" data-side="${i}" class="${sd.kind === 'dream' ? 'sel' : ''}">Dream team</button></div>`;
    const who0 = st.mode === 'play' ? (st.userSide === i ? ' · You coach' : ' · AI coach') : '';
    if (sd.kind === 'dream') {
      const t = dreamTeam(i); const pick = dreamPick(i);
      const n = DR.ORDER.reduce((s, g) => s + (pick[g] || []).length, 0);
      const stars = t.roster.filter((p) => p.star).sort((a, b) => b.r - a.r).slice(0, 6).map((p) => `${p.pos} ${esc(p.n)}`).join(', ');
      return `<section class="card side"><h2><span class="dot ${i ? 'h' : 'a'}"></span>${i ? 'Home' : 'Away'}<span class="note" style="text-transform:none;letter-spacing:0;font-family:var(--body);font-weight:500">${who0}</span></h2>${kind}
        <div class="row" style="margin-top:10px">
          <label class="f" for="dfr${i}" style="flex:2 1 220px">Franchise<select id="dfr${i}" data-side="${i}" data-dk="fr">${frOpts(sd.fr)}</select></label>
        </div>
        <div class="row" style="margin-top:8px">
          <label class="f" for="dfa${i}">From<select id="dfa${i}" data-side="${i}" data-dk="from">${yrOpts(sd.from, FIRST, LAST)}</select></label>
          <label class="f" for="dto${i}">To<select id="dto${i}" data-side="${i}" data-dk="to">${yrOpts(sd.to, FIRST, LAST)}</select></label>
          <button class="btn small" data-alltime="${i}" style="align-self:flex-end">All-time</button>
        </div>
        <div class="teamline"><b>${esc(t.name)}</b><span>${n} players${sd.edited ? ' · your edits' : ''}</span></div>
        <p class="note" style="margin-top:6px">${stars}</p>
        <div class="inline" style="margin-top:8px"><button class="btn small" data-editroster="${i}">See and edit the roster</button></div></section>`;
    }
    if (!(S.idx.teams[sd.y] || []).some((t) => t.fr === sd.fr)) sd.fr = S.idx.teams[sd.y][0].fr;
    const t = tsFor(sd.y, sd.fr);
    const badge = `<span class="note">${t.badge === 'gold' ? 'Full roster' : 'Key players named'}</span>`;
    const who = st.mode === 'play' ? (st.userSide === i ? ' · You coach' : ' · AI coach') : '';
    return `<section class="card side"><h2><span class="dot ${i ? 'h' : 'a'}"></span>${i ? 'Home' : 'Away'}<span class="note" style="text-transform:none;letter-spacing:0;font-family:var(--body);font-weight:500">${who}</span></h2>${kind}
      <div class="row" style="margin-top:10px">
        <label class="f" for="fy${i}">Year<select id="fy${i}" data-side="${i}" data-k="y">${yearOpts(sd.y)}</select></label>
        <label class="f" for="ft${i}" style="flex:2 1 220px">Team<select id="ft${i}" data-side="${i}" data-k="fr">${teamOpts(sd.y, sd.fr)}</select></label>
      </div>
      <div class="teamline">${badge}<span>${t.PF} points scored, ${t.PA} allowed</span></div></section>`;
  }
  function renderSetup() {
    dock.classList.add('hide'); headerButtons();
    const st = S.setup;
    const seg = (key, opts) => opts.map(([v, l]) => `<button data-set="${key}" data-v="${v}" class="${String(st[key]) === String(v) ? 'sel' : ''}">${l}</button>`).join('');
    const named = Object.keys(S.rosters).sort().map((k) => { const t = tsFor(+k.slice(0, 4), k.slice(4)); return t ? `${k.slice(0, 4)} ${t.nick}` : ''; }).filter(Boolean);
    app.innerHTML = `
      <h2>Football · set up the matchup</h2>
      <div class="card" style="margin-top:12px"><div class="row">
        <div><h3>Mode</h3><div class="seg" role="group" aria-label="Mode">${seg('mode', [['play', 'Play as coach'], ['watch', 'Watch']])}</div></div>
        <div class="${st.mode === 'play' ? '' : 'hide'}"><h3>You coach</h3><div class="seg" role="group" aria-label="Your team">${seg('userSide', [[0, 'Away'], [1, 'Home']])}</div></div>
        <div class="${st.mode === 'play' ? '' : 'hide'}"><h3>AI coach</h3><div class="seg" role="group" aria-label="AI difficulty">${seg('diff', [['rookie', 'Rookie'], ['pro', 'Pro'], ['hof', 'Hall of Fame']])}</div></div>
      </div>
      <div style="margin-top:12px"><h3>Era rules</h3><div class="seg" role="group" aria-label="Era rules">${seg('rules', [['auto', "Home team's era"], ['classic', 'Classic 1960–77'], ['passing', 'Passing era 1978–93'], ['twopoint', 'Two-point era 1994–2011'], ['modern', 'Modern 2012–today']])}</div>
        <p class="note" style="margin-top:6px">${rulesNote(rulesFor())}</p></div></div>
      <div class="grid sides" style="margin-top:14px">${sideCard(0)}${sideCard(1)}</div>
      <section class="card" style="margin-top:14px"><h3>How accurate is this?</h3>
        <p class="note" style="margin-top:6px">Every team from 1960 to 2025 plays to its real points scored and allowed, so the final scores and win odds rest on real results. In the 1960s the AFL was a separate league and a step below the NFL at first (the NFL won the first two Super Bowls), so early AFL teams are scaled down a little, less each year until they match by 1969.</p>
        <p class="note" style="margin-top:6px"><b>Full roster:</b> the whole lineup, offensive line included, hand-checked. ${named.join(' · ')}</p>
        <p class="note" style="margin-top:6px"><b>Dream teams:</b> pick a franchise and a span of years (or any team for era all-stars) and get the best 45 players from those seasons, picked by Pro Bowl and All-Pro selections, Hall of Fame careers and each season's stats. Their strength blends how good the players were with how good their real teams were.</p>
        <p class="note" style="margin-top:6px"><b>Key players (every other team):</b> the starting QB and backup, two running backs, three receivers, two tight ends, six key defenders, the kicker and punter. Starting QBs come from each team's season records. From 1999 on, the other names are picked from that season's stats. Before 1999 they are picked from Pro Bowl and All-Pro selections, Hall of Fame careers and years as a starter, so the stars are right but a depth name can be off. The offensive line plays as a unit.</p></section>
      <div class="actions"><button class="btn primary" id="fbPre">See the matchup</button><span class="note" id="fbMsg"></span></div>`;
    app.querySelectorAll('[data-set]').forEach((b) => b.onclick = () => { const k = b.dataset.set; let v = b.dataset.v; if (k === 'userSide') v = +v; st[k] = v; renderSetup(); });
    app.querySelectorAll('select[data-k]').forEach((s) => s.onchange = () => { const sd = st.sides[+s.dataset.side]; if (s.dataset.k === 'y') sd.y = +s.value; else sd.fr = s.value; renderSetup(); });
    app.querySelectorAll('[data-kind]').forEach((b) => b.onclick = () => {
      const sd = st.sides[+b.dataset.side]; sd.kind = b.dataset.kind;
      if (sd.kind === 'dream' && !sd.from) { sd.fr = sd.fr || 'PIT'; if (!S.frName[sd.fr]) sd.fr = 'PIT'; sd.from = FIRST; sd.to = LAST; }
      renderSetup();
    });
    app.querySelectorAll('select[data-dk]').forEach((s) => s.onchange = () => {
      const sd = st.sides[+s.dataset.side]; const k = s.dataset.dk;
      if (k === 'fr') sd.fr = s.value; else sd[k] = +s.value;
      if (sd.from > sd.to) { if (k === 'from') sd.to = sd.from; else sd.from = sd.to; }
      renderSetup();
    });
    app.querySelectorAll('[data-alltime]').forEach((b) => b.onclick = () => { const sd = st.sides[+b.dataset.alltime]; sd.from = FIRST; sd.to = LAST; renderSetup(); });
    app.querySelectorAll('[data-editroster]').forEach((b) => b.onclick = () => { S.editSide = +b.dataset.editroster; S.screen = 'dreamEdit'; render(); });
    $('#fbPre').onclick = goPregame;
  }
  function rulesNote(r) {
    return {
      classic: 'Defenders can hit receivers downfield, so passing is harder and the run rules. No two-point try. Sudden-death overtime.',
      passing: 'The 1978 contact rule opens up the passing game. No two-point try. Sudden-death overtime.',
      twopoint: 'Two-point conversions are allowed. Coaches can challenge close calls. Sudden-death overtime.',
      modern: 'Today\'s game: high completion rates, the longer extra point, two-point tries, challenges, 10-minute overtime where both teams get the ball unless the first drive scores a touchdown.',
    }[r];
  }

  /* ---------------- pregame ---------------- */
  function goPregame() {
    S.teams = S.setup.sides.map((sd, i) => F.buildTeam(sd.kind === 'dream' ? dreamTeam(i) : tsFor(sd.y, sd.fr)));
    S.starters = [{}, {}];
    S.screen = 'pregame'; render();
  }
  function grade(x) { return Math.round(Math.max(1, Math.min(99, 50 + 30 * Math.log(x) / Math.log(1.6)))); }
  function renderPregame() {
    dock.classList.add('hide'); headerButtons();
    const [A, H] = S.teams; const rules = rulesFor();
    const row = (lbl, a, b, hi, fmt) => { const wa = hi ? a > b : a < b, wb = hi ? b > a : b < a; return `<div class="l${wa ? ' win' : ''}">${fmt(a)}</div><div class="lbl">${lbl}</div><div class="r${wb ? ' win' : ''}">${fmt(b)}</div>`; };
    const g = (x) => String(grade(x)); const id = (x) => x;
    const stars = (t) => t.roster.filter((p) => p.star && !p.generic).sort((a, b) => b.r - a.r).slice(0, 7).map((p) => `${p.pos} ${esc(p.n)}`).join(', ') || 'No Pro Bowl-level stars this season. The team plays to its real points scored and allowed.';
    app.innerHTML = `
      <h2>Tale of the tape</h2><p class="note" style="margin-top:4px">${F.RULES[rules].label} rules${Math.abs(A.y - H.y) >= 10 || A.dream || H.dream ? ' · each team rated against its own era' : ''}</p>
      <div class="card" style="margin-top:12px"><div class="tape">
        <div class="l"><div class="tape-head" style="color:var(--away)">${esc(T(A))}</div><div class="note">${rec(A)}</div></div><div class="lbl">vs</div>
        <div class="r"><div class="tape-head" style="color:var(--home)">${esc(T(H))}</div><div class="note">${rec(H)}</div></div>
        ${row('Points / game', A.PF / A.G, H.PF / H.G, true, f1)}
        ${row('Allowed / game', A.PA / A.G, H.PA / H.G, false, f1)}
        ${row('Passing', grade(A.off.pass), grade(H.off.pass), true, id)}
        ${row('Rushing', grade(A.off.run), grade(H.off.run), true, id)}
        ${row('Pass protection', grade(A.off.prot), grade(H.off.prot), true, id)}
        ${row('Pass defense', grade(A.def.pass), grade(H.def.pass), true, id)}
        ${row('Run defense', grade(A.def.run), grade(H.def.run), true, id)}
        ${row('Pass rush', grade(A.def.rush), grade(H.def.rush), true, id)}
        ${row('Takeaways', grade(A.def.take), grade(H.def.take), true, id)}
      </div><p class="note" style="margin-top:8px">Unit grades run 1–99, with 50 as league average for that season. ${A.light || H.light ? 'Key-player teams rate their offensive line as a unit.' : ''}</p></div>
      <div class="grid cols2" style="margin-top:14px">
        <section class="card"><h3 style="color:var(--away)">Stars</h3><p style="margin-top:6px">${stars(A)}</p></section>
        <section class="card"><h3 style="color:var(--home)">Stars</h3><p style="margin-top:6px">${stars(H)}</p></section>
      </div>
      <section class="card proj" id="fbProj"><h3>Prediction</h3><p class="note"><span class="spin"></span> Simulating 200 games…</p></section>
      <div class="grid cols2" style="margin-top:14px" id="fbLineups"></div>
      <div class="actions"><button class="btn primary" id="fbPlay">Kick off</button><button class="btn" id="fbBack">Change teams</button></div>`;
    $('#fbBack').onclick = () => { S.screen = 'setup'; render(); };
    $('#fbPlay').onclick = startGame;
    drawLineups();
    setTimeout(() => {
      if (!$('#fbProj')) return;
      let aw = 0, hw = 0, as = 0, hs = 0; const n = 200;
      for (let i = 0; i < n; i++) { const gg = F.newGame(A, H, { rules, lgppg: lgppg() }); F.simGame(gg); as += gg.score[0]; hs += gg.score[1]; if (gg.winner === 0) aw++; else if (gg.winner === 1) hw++; }
      if (!$('#fbProj')) return;
      const pct = Math.round(aw / (aw + hw || 1) * 100); const fav = aw >= hw ? T(A) : T(H);
      $('#fbProj').innerHTML = `<h3>Prediction</h3><p style="margin-top:6px"><b>${esc(fav)}</b> win ${Math.max(aw, hw)} of ${n} simulated games. Typical score: ${Math.round(as / n)} to ${Math.round(hs / n)}.</p>
        <div class="bar" style="margin-top:10px"><span style="width:${pct}%;background:var(--away)"></span><span style="width:${100 - pct}%;background:var(--home)"></span></div>
        <div class="row note" style="margin-top:6px;justify-content:space-between"><span style="flex:0 0 auto">${pct}%</span><span style="flex:0 0 auto">${100 - pct}%</span></div>`;
    }, 60);
  }
  function lgppg() { const l = (t) => t.lgppg || S.idx.lgppg[t.y]; return (l(S.teams[0]) + l(S.teams[1])) / 2; }
  const SKILL = [['QB', 'QB', 0], ['RB', 'RB', 0], ['WR1', 'WR', 0], ['WR2', 'WR', 1], ['WR3', 'WR', 2], ['TE', 'TE', 0]];
  function drawLineups() {
    const wrap = $('#fbLineups'); if (!wrap) return;
    wrap.innerHTML = S.teams.map((t, i) => {
      const by = (pos) => t.roster.filter((p) => p.pos === pos && !p.generic).sort((a, b) => b.r - a.r);
      const mine = S.setup.mode === 'play' && S.setup.userSide === i;
      const rows = SKILL.map(([slot, pos, k]) => {
        const list = pos === 'WR' ? by('WR').concat(by('TE'), by('RB')) : by(pos);
        const def = S.starters[i][slot] || (by(pos)[k] || {}).n;
        if (!t.named) return `<tr><td>${slot}</td><td>${esc(def || slot)}</td></tr>`;
        return `<tr><td>${slot}</td><td><select data-fbst="${i}" data-slot="${slot}" aria-label="${slot}" style="padding:5px">${list.map((p) => `<option value="${esc(p.n)}"${p.n === def ? ' selected' : ''}>${esc(p.n)} · ${p.pos} ${p.r}${p.star ? ' ★' : ''}</option>`).join('')}</select></td></tr>`;
      }).join('');
      const defense = ['DL', 'LB', 'CB', 'S'].map((pos) => by(pos).filter((p) => !p.generic).slice(0, pos === 'DL' || pos === 'LB' ? 4 : 2).map((p) => esc(p.n) + (p.star ? ' ★' : '')).join(', ')).filter(Boolean).join(' · ');
      return `<section class="card"><h3 style="color:var(${i ? '--home' : '--away'})">${mine ? 'Your starters' : S.setup.mode === 'play' ? 'AI coach\'s starters' : 'Starters'}</h3>
        ${t.named ? '<p class="note" style="margin-top:4px">Review the skill-position starters and change any of them. The coach uses your version.</p>' : ''}
        <table class="box"><tbody>${rows}</tbody></table>
        <p class="note" style="margin-top:8px"><b>Offensive line:</b> ${t.light ? 'rated as a unit' : by('OL').map((p) => esc(p.n) + (p.star ? ' ★' : '')).join(', ')}</p>
        <p class="note"><b>${t.light ? 'Key defenders' : 'Defense'}:</b> ${defense}</p></section>`;
    }).join('');
    wrap.querySelectorAll('[data-fbst]').forEach((s) => s.onchange = () => { S.starters[+s.dataset.fbst][s.dataset.slot] = s.value; });
  }
  function applyStarters(g) {
    [0, 1].forEach((i) => {
      const t = S.teams[i]; const st = g.starters[i]; const pick = (n) => t.roster.find((p) => p.n === n);
      const o = S.starters[i];
      if (o.QB && pick(o.QB)) st.QB = pick(o.QB);
      if (o.RB && pick(o.RB)) { const r = pick(o.RB); st.RB = [r].concat(st.RB.filter((x) => x !== r)).slice(0, 2); }
      ['WR1', 'WR2', 'WR3'].forEach((k, j) => { if (o[k] && pick(o[k])) st.WR[j] = pick(o[k]); });
      if (o.TE && pick(o.TE)) st.TE = pick(o.TE);
    });
  }

  /* ---------------- game ---------------- */
  function startGame() {
    const st = S.setup;
    S.game = F.newGame(S.teams[0], S.teams[1], { rules: rulesFor(), userSide: st.mode === 'play' ? st.userSide : null, difficulty: st.diff, lgppg: lgppg() });
    applyStarters(S.game);
    S.calls = { off: 'inside', def: 'base', twoPt: false, onside: false }; S.subSlot = 'QB'; S.tab = 'call'; S.lastRes = null; S.chatter = null;
    S.screen = 'game'; render();
    if (st.mode === 'watch') startAuto();
  }
  const user = () => (S.setup.mode === 'play' ? S.setup.userSide : null);
  const userOff = () => user() !== null && S.game.poss === user() && !S.game.kickoffNext;
  const userDef = () => user() !== null && S.game.poss !== user() && !S.game.kickoffNext;

  function renderGame() {
    headerButtons();
    app.innerHTML = `<div class="board" id="fbBoard"></div>
      <div class="game fb"><div><div class="card" style="padding:12px"><div class="sit" id="fbSit"></div><div id="fbField" style="margin-top:10px"></div><div id="fbDrive" class="note" style="margin-top:8px"></div></div></div>
      <div><div class="call" id="fbCall" aria-live="polite"></div><div class="tabs" id="fbTabs" role="tablist"></div><div class="panel" id="fbPanel"></div></div></div>`;
    update();
  }
  function update() { board(); sit(); field(); call(); tabs(); panel(); dockBar(); }
  function board() {
    const g = S.game; const nq = Math.max(4, g.qs[0].length, g.qs[1].length);
    let h = '<table class="lines"><thead><tr><th></th>'; for (let i = 1; i <= nq; i++) h += `<th>${i <= 4 ? i : 'OT'}</th>`; h += '<th>T</th><th>TO</th></tr></thead><tbody>';
    [0, 1].forEach((si) => {
      const t = g.teams[si];
      h += `<tr><td class="team"><span class="dot ${si ? 'h' : 'a'}"></span> ${esc(TS(t))}${g.poss === si && !g.over ? ' ◂' : ''}</td>`;
      for (let i = 0; i < nq; i++) { const v = g.qs[si][i]; const cur = !g.over && g.q - 1 === i; h += `<td class="${cur ? 'cur' : ''}">${v == null ? (i < g.q - 1 ? 0 : (cur ? 0 : '')) : v}</td>`; }
      h += `<td class="rhe">${g.score[si]}</td><td class="rhe">${'●'.repeat(g.to[si])}</td></tr>`;
    });
    $('#fbBoard').innerHTML = h + '</tbody></table>';
  }
  function sit() {
    const g = S.game;
    if (g.over) { $('#fbSit').innerHTML = `<span>Final${g.q >= 5 ? ' / OT' : ''}</span>`; return; }
    const t = g.teams[g.poss];
    const dd = g.kickoffNext ? 'Kickoff' : `${['1st', '2nd', '3rd', '4th'][g.down - 1]} & ${g.ball + g.togo >= 100 ? 'Goal' : g.togo}`;
    $('#fbSit').innerHTML = `<span>${F.qLabel(g.q)} · ${F.fmtClock(g.clock)}</span><span style="color:var(--bulb)">${dd}</span>${g.kickoffNext ? '' : `<span class="note" style="font-family:var(--body);text-transform:none;letter-spacing:0">${esc(t.short)} ball at ${esc(F.spotText(g))}${user() !== null ? (userOff() ? ' · your call' : ' · you\'re on defense') : ''}</span>`}`;
  }
  function field() {
    const g = S.game; const off = g.teams[g.poss], def = g.teams[1 - g.poss];
    const oc = g.poss ? 'var(--home)' : 'var(--away)', dc = g.poss ? 'var(--away)' : 'var(--home)';
    const X = (yd) => 50 + yd * 5;
    let lines = '';
    for (let y = 10; y < 100; y += 10) lines += `<line x1="${X(y)}" y1="8" x2="${X(y)}" y2="132" stroke="#f2eee1" stroke-opacity="0.35"/><text x="${X(y)}" y="128" text-anchor="middle" fill="#f2eee1" fill-opacity="0.55" style="font:700 11px var(--display)">${y <= 50 ? y : 100 - y}</text>`;
    for (let y = 5; y < 100; y += 10) lines += `<line x1="${X(y)}" y1="8" x2="${X(y)}" y2="132" stroke="#f2eee1" stroke-opacity="0.15"/>`;
    const ball = Math.max(0, Math.min(100, g.ball)); const fd = Math.min(100, ball + g.togo);
    $('#fbField').innerHTML = `<svg class="field" viewBox="0 0 600 140" role="img" aria-label="Football field">
      <rect x="0" y="0" width="600" height="140" fill="#1d5e36"/>
      <rect x="0" y="0" width="50" height="140" fill="${oc}" fill-opacity="0.45"/><rect x="550" y="0" width="50" height="140" fill="${dc}" fill-opacity="0.45"/>
      <text x="25" y="74" text-anchor="middle" fill="#fff" transform="rotate(-90 25 70)" style="font:800 13px var(--display);letter-spacing:2px">${esc(off.short.toUpperCase())}</text>
      <text x="575" y="74" text-anchor="middle" fill="#fff" transform="rotate(90 575 70)" style="font:800 13px var(--display);letter-spacing:2px">${esc(def.short.toUpperCase())}</text>
      ${lines}
      ${g.kickoffNext || g.over ? '' : `<line x1="${X(fd)}" y1="8" x2="${X(fd)}" y2="132" stroke="#f4b63e" stroke-width="3"/><line x1="${X(ball)}" y1="8" x2="${X(ball)}" y2="132" stroke="#6cb4ff" stroke-width="2" stroke-dasharray="4 3"/>`}
      <g style="transition: transform 0.6s ease" transform="translate(${X(ball)},70)"><ellipse rx="7" ry="4.5" fill="#8a4b22" stroke="#fff" stroke-width="1"/><line x1="-3" y1="0" x2="3" y2="0" stroke="#fff" stroke-width="1"/></g>
      <text x="300" y="20" text-anchor="middle" fill="#f2eee1" fill-opacity="0.8" style="font:600 10px var(--body)">${esc(off.short)} driving →</text>
    </svg>`;
    const d = g.drive; $('#fbDrive').textContent = g.kickoffNext || g.over ? '' : `This drive: ${d.plays} play${d.plays === 1 ? '' : 's'}, ${d.yds} yards`;
  }
  function call() {
    const r = S.lastRes; const el = $('#fbCall');
    if (!r) { el.className = 'call'; el.innerHTML = `<div class="big">Welcome to the game. ${esc(S.game.teams[1].short)} kick off to ${esc(S.game.teams[0].short)}.</div>`; return; }
    el.className = 'call' + (r.score && r.score.kind === 'td' ? ' hr' : '');
    el.innerHTML = `<div class="big">${esc(r.text)}</div>${r.sum ? `<div class="note" style="margin-top:4px">${esc(r.sum)}</div>` : ''}${S.chatter ? `<div class="coach"><b>Opposing coach:</b> ${esc(S.chatter)}</div>` : ''}`;
  }
  const OFF = [['inside', 'Run inside', 'Power up the middle'], ['outside', 'Run outside', 'Stretch to the edge'], ['draw', 'Draw', 'Beats the blitz'], ['sneak', 'QB sneak', 'Short yardage'],
    ['short', 'Short pass', 'Quick and safe'], ['deep', 'Deep pass', 'Big play, big risk'], ['screen', 'Screen', 'Beats the blitz'], ['pa', 'Play action', 'Best when the run works'],
    ['punt', 'Punt', 'Flip the field'], ['fg', 'Field goal', ''], ['kneel', 'Kneel', 'Run out the clock']];
  const DEF = [['base', 'Base', 'Balanced'], ['blitz', 'Blitz', 'Pressure, but risky'], ['man', 'Man coverage', 'Tight on receivers'], ['zone', 'Zone', 'Keep it in front'],
    ['prevent', 'Prevent', 'No deep balls'], ['goal', 'Goal line', 'Stack the box'], ['runstuff', 'Run stuff', 'Expecting a run']];
  function tabs() {
    const g = S.game; const t = [];
    if (!g.over) t.push(['call', user() === null ? 'Watch' : (g.kickoffNext ? 'Kickoff' : userOff() ? 'Offense' : 'Defense')]);
    if (!g.over && user() !== null) t.push(['coach', "Coach's board"]);
    if (g.over) t.push(['final', 'Final']);
    t.push(['box', 'Box score'], ['log', 'Play-by-play'], ['roster', 'Rosters']);
    if (!t.some((x) => x[0] === S.tab)) S.tab = t[0][0];
    $('#fbTabs').innerHTML = t.map(([k, l]) => `<button role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? 'sel' : ''}" data-tab="${k}">${l}</button>`).join('');
    $('#fbTabs').querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { S.tab = b.dataset.tab; tabs(); panel(); });
  }
  function fgText() { const g = S.game; const d = 117 - g.ball; return `${d} yards · ${Math.round(F.fgProb(g, d, g.poss) * 100)}%`; }
  function panel() {
    const g = S.game; const p = $('#fbPanel');
    if (S.tab === 'call') {
      if (user() === null) {
        p.innerHTML = `<p class="note">Both teams are coached by the AI.</p><div class="seg" style="margin-top:10px" role="group" aria-label="Speed">${[[0.5, 'Slow'], [1, 'Normal'], [2.5, 'Fast']].map(([v, l]) => `<button data-speed="${v}" class="${S.speed === v ? 'sel' : ''}">${l}</button>`).join('')}</div>`;
        p.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => { S.speed = +b.dataset.speed; if (S.auto) { stopAuto(); startAuto(); } panel(); });
        return;
      }
      if (g.kickoffNext) {
        const kicking = g.kicking === user();
        p.innerHTML = kicking ? `<label class="inline" style="gap:10px"><input type="checkbox" id="onside" ${S.calls.onside ? 'checked' : ''}> Try an onside kick</label><p class="note" style="margin-top:8px">Onside kicks work about ${Math.round(F.RULES[g.rules].onside * 100)}% of the time under these rules, more often as a surprise.</p>` : '<p class="note">You receive the kickoff. Tap Execute.</p>';
        const cb = $('#onside'); if (cb) cb.onchange = () => { S.calls.onside = cb.checked; };
        return;
      }
      if (userOff()) {
        const ok = (k) => (k === 'sneak' ? g.togo <= 3 : k === 'fg' ? 117 - g.ball <= 66 : k === 'kneel' ? true : true);
        p.innerHTML = `<div class="opts">${OFF.map(([k, l, s]) => `<button class="opt${S.calls.off === k ? ' sel' : ''}" data-off="${k}" ${ok(k) ? '' : 'disabled'}>${l}<small>${k === 'fg' ? fgText() : s}</small></button>`).join('')}</div>`;
        p.querySelectorAll('[data-off]').forEach((b) => b.onclick = () => { S.calls.off = b.dataset.off; panel(); dockBar(); });
      } else {
        p.innerHTML = `<div class="opts">${DEF.map(([k, l, s]) => `<button class="opt${S.calls.def === k ? ' sel' : ''}" data-def="${k}">${l}<small>${s}</small></button>`).join('')}</div>`;
        p.querySelectorAll('[data-def]').forEach((b) => b.onclick = () => { S.calls.def = b.dataset.def; panel(); dockBar(); });
      }
      return;
    }
    if (S.tab === 'coach') { coach(p); return; }
    if (S.tab === 'box') { p.innerHTML = boxHTML(); return; }
    if (S.tab === 'log') { p.innerHTML = `<div class="log">${g.log.slice().reverse().map((l) => `<div><span class="inn">${F.qLabel(l.q)} ${F.fmtClock(l.clock)}</span>${esc(l.text)} <span class="note">(${l.score[0]}–${l.score[1]})</span></div>`).join('')}</div>`; return; }
    if (S.tab === 'roster') { p.innerHTML = rosterHTML(); return; }
    if (S.tab === 'final') { p.innerHTML = finalHTML(); }
  }
  function coach(p) {
    const g = S.game; const u = user(); const r = g.R;
    let h = '<div class="coachbox">';
    h += `<div class="card"><h3>Timeouts · ${g.to[u]} left this half</h3><div class="inline" style="margin-top:8px"><button class="btn small" id="toGo" ${g.to[u] > 0 ? '' : 'disabled'}>Call timeout</button><span class="note">Stops the clock and saves about 30 seconds.</span></div></div>`;
    if (userOff()) {
      h += `<div class="card"><h3>Trick plays · ${g.tricks[u]} left</h3><div class="opts" style="margin-top:8px">
        <button class="opt" data-trick="flea" ${g.tricks[u] > 0 ? '' : 'disabled'}>Flea flicker<small>Deep shot. Dangerous against a blitz.</small></button>
        <button class="opt" data-trick="hbpass" ${g.tricks[u] > 0 ? '' : 'disabled'}>Halfback pass<small>The running back throws it</small></button>
        <button class="opt" data-trick="fakepunt" ${g.tricks[u] > 0 && g.down === 4 ? '' : 'disabled'}>Fake punt<small>4th down only</small></button></div></div>`;
      if (r.twoPt) h += `<div class="card"><label class="inline" style="gap:10px"><input type="checkbox" id="twoPt" ${S.calls.twoPt ? 'checked' : ''}> Go for two after your next touchdown</label><p class="note" style="margin-top:6px">Two-point tries succeed about 47% of the time.</p></div>`;
    }
    h += subsCard(g, u);
    const lp = g.lastPlay;
    if ((g.rules === 'twopoint' || g.rules === 'modern') && lp && lp.close && !lp.challenged && g.challenges[u] > 0) h += `<div class="card"><h3>Replay challenge · ${g.challenges[u]} left</h3><div class="inline" style="margin-top:8px"><button class="btn small" id="chGo">Challenge the last call</button></div></div>`;
    else if (g.rules === 'twopoint' || g.rules === 'modern') h += `<p class="note">Challenges: available right after a close call (${g.challenges[u]} left).</p>`;
    h += '</div>'; p.innerHTML = h;
    const bind = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
    bind('toGo', () => { if (F.timeout(g, u)) { S.lastRes = { text: `Timeout, ${g.teams[u].short}.` }; update(); } });
    const sg = $('#subGo'); if (sg) sg.onclick = () => {
      const slot = $('#subSlot').value; const nm = $('#subIn').value; const r = F.subPlayer(g, u, slot, nm);
      if (r) { S.lastRes = { text: `Substitution: ${r.inP.n} in${r.outP ? ' for ' + r.outP.n : ''} (${SLOTNAME[slot]}).` }; update(); }
    };
    const ss = $('#subSlot'); if (ss) ss.onchange = () => { S.subSlot = ss.value; coach(p); };
    bind('chGo', () => { const c = F.challenge(g, u); if (c) { S.lastRes = { text: c.text }; SND.play(c.overturned ? 'cheer' : 'boo'); update(); } });
    const tp = $('#twoPt'); if (tp) tp.onchange = () => { S.calls.twoPt = tp.checked; };
    p.querySelectorAll('[data-trick]').forEach((b) => b.onclick = () => doStep({ off: b.dataset.trick }));
  }
  const SLOTNAME = { QB: 'quarterback', RB1: 'lead back', RB2: 'second back', WR1: 'WR1', WR2: 'WR2', WR3: 'WR3', TE: 'tight end' };
  function subsCard(g, u) {
    const t = g.teams[u]; if (!t.named) return '';
    const st = g.starters[u]; const slot = S.subSlot || 'QB';
    const cur = { QB: st.QB, RB1: st.RB[0], RB2: st.RB[1], WR1: st.WR[0], WR2: st.WR[1], WR3: st.WR[2], TE: st.TE };
    const pool = slot === 'QB' ? ['QB'] : slot[0] === 'R' ? ['RB'] : slot === 'TE' ? ['TE'] : ['WR', 'TE', 'RB'];
    const bench = t.roster.filter((p) => !p.generic && pool.includes(p.pos) && p !== cur[slot]).sort((a, b) => pool.indexOf(a.pos) - pool.indexOf(b.pos) || b.r - a.r);
    const slotOpts = Object.keys(SLOTNAME).map((k) => `<option value="${k}"${k === slot ? ' selected' : ''}>${SLOTNAME[k]}: ${esc(cur[k] ? cur[k].n : '—')}</option>`).join('');
    const inOpts = bench.map((p) => `<option value="${esc(p.n)}">${esc(p.n)} · ${p.pos} ${p.r}${p.star ? ' ★' : ''}</option>`).join('');
    return `<div class="card"><h3>Substitutions</h3>
      <div class="row" style="margin-top:8px"><label class="f" for="subSlot">Take out<select id="subSlot">${slotOpts}</select></label>
      <label class="f" for="subIn">Put in<select id="subIn">${inOpts || '<option value="">Nobody on the bench</option>'}</select></label></div>
      <div class="inline" style="margin-top:8px"><button class="btn small" id="subGo" ${inOpts ? '' : 'disabled'}>Make the change</button><span class="note">The new player gets the carries, targets and credit. His rating moves the unit up or down.</span></div></div>`;
  }
  function boxHTML() {
    const g = S.game;
    const tm = (k, f) => `<tr><td>${k}</td><td>${f(g.box[0].team)}</td><td>${f(g.box[1].team)}</td></tr>`;
    let h = `<table class="box"><thead><tr><th>Team</th><th>${esc(g.teams[0].short)}</th><th>${esc(g.teams[1].short)}</th></tr></thead><tbody>
      ${tm('First downs', (t) => t.fd)}${tm('Total yards', (t) => t.yds)}${tm('Rushing', (t) => t.ry)}${tm('Passing', (t) => t.py)}${tm('Turnovers', (t) => t.to)}${tm('Sacks', (t) => t.sacks)}${tm('Penalties', (t) => t.pen + '–' + t.peny)}${tm('Possession', (t) => F.fmtClock(t.top))}</tbody></table>`;
    [0, 1].forEach((si) => {
      const b = g.box[si]; const col = si ? '--home' : '--away';
      const rows = (o, cols, f) => Object.entries(o).filter(([, v]) => f(v)).map(([n, v]) => `<tr><td>${esc(n)}</td>${cols.map((c) => `<td>${typeof c === 'function' ? c(v) : v[c]}</td>`).join('')}</tr>`).join('');
      h += `<h3 style="color:var(${col});margin-top:14px">${esc(T(g.teams[si]))}</h3>
        <table class="box"><thead><tr><th>Passing</th><th>C/Att</th><th>Yds</th><th>TD</th><th>Int</th></tr></thead><tbody>${rows(b.pass, [(v) => v.cmp + '/' + v.att, 'yds', 'td', 'int'], (v) => v.att)}</tbody></table>
        <table class="box"><thead><tr><th>Rushing</th><th>Car</th><th>Yds</th><th>Avg</th><th>TD</th></tr></thead><tbody>${rows(b.rush, ['car', 'yds', (v) => (v.car ? (v.yds / v.car).toFixed(1) : '0'), 'td'], (v) => v.car)}</tbody></table>
        <table class="box"><thead><tr><th>Receiving</th><th>Rec</th><th>Yds</th><th>TD</th></tr></thead><tbody>${rows(b.rec, ['rec', 'yds', 'td'], (v) => v.rec)}</tbody></table>
        <table class="box"><thead><tr><th>Defense</th><th>Tkl</th><th>Sacks</th><th>Int</th><th>FF</th></tr></thead><tbody>${rows(b.def, ['tk', 'sk', 'int', 'ff'], (v) => v.sk || v.int || v.ff || v.tk >= 3)}</tbody></table>
        <p class="note" style="margin-top:6px">Kicking: ${b.kick.fgm}/${b.kick.fga} FG${b.kick.long ? ' (long ' + b.kick.long + ')' : ''}, ${b.kick.xpm}/${b.kick.xpa} XP · Punting: ${b.punt.n} for ${b.punt.n ? (b.punt.yds / b.punt.n).toFixed(1) : 0} net</p>`;
    });
    return h;
  }
  function rosterHTML() {
    return S.teams.map((t, i) => `<h3 style="color:var(${i ? '--home' : '--away'});margin-top:${i ? 14 : 0}px">${esc(T(t))} ${t.dream ? '· dream team' : t.named ? (t.light ? '· key players' : '· full roster') : '· real results only'}</h3>
      <table class="box"><thead><tr><th>Player</th><th>Pos</th><th>Rating</th></tr></thead><tbody>${t.roster.filter((p) => !(t.light && p.generic)).map((p) => `<tr><td>${esc(p.n)}${p.star ? ' ★' : ''}</td><td>${p.pos}</td><td>${p.generic ? '—' : p.r}</td></tr>`).join('')}</tbody></table>`).join('');
  }
  function finalHTML() {
    const g = S.game; const [A, H] = g.teams; const w = g.winner;
    const head = w === -1 ? 'It ends in a tie.' : `${esc(T(g.teams[w]))} win${user() !== null ? (w === user() ? ' — you outcoached the AI.' : ' — the AI coach takes this one.') : '.'}`;
    // player of the game
    let best = null, bv = -1;
    [0, 1].forEach((si) => {
      const b = g.box[si]; const bonus = si === w ? 4 : 0;
      Object.entries(b.pass).forEach(([n, v]) => { const s = v.yds / 25 + v.td * 4 - v.int * 3 + bonus; if (s > bv) { bv = s; best = `${n}: ${v.cmp}/${v.att}, ${v.yds} yards, ${v.td} TD${v.int ? ', ' + v.int + ' INT' : ''}`; } });
      Object.entries(b.rush).forEach(([n, v]) => { const s = v.yds / 10 + v.td * 6 + bonus; if (s > bv) { bv = s; best = `${n}: ${v.car} carries, ${v.yds} yards, ${v.td} TD`; } });
      Object.entries(b.rec).forEach(([n, v]) => { const s = v.yds / 10 + v.td * 6 + bonus; if (s > bv) { bv = s; best = `${n}: ${v.rec} catches, ${v.yds} yards, ${v.td} TD`; } });
      Object.entries(b.def).forEach(([n, v]) => { const s = v.sk * 4 + v.int * 6 + v.ff * 4 + bonus; if (s > bv) { bv = s; best = `${n}: ${v.sk} sacks, ${v.int} INT, ${v.ff} forced fumbles`; } });
    });
    const real = [A, H].map((t, i) => t.dream ? `<li>The ${esc(t.name)} scored ${g.score[i]}. Built from their players' real seasons, they project to about ${t.PF.toFixed(0)} points a game and allow about ${t.PA.toFixed(0)}.</li>` : `<li>The ${t.y} ${esc(t.short)} scored ${g.score[i]}. That season they averaged ${(t.PF / t.G).toFixed(1)} points and allowed ${(t.PA / t.G).toFixed(1)}.</li>`).join('');
    const wi = g.score[0] === g.score[1] ? -1 : (g.score[0] > g.score[1] ? 0 : 1), TT = [A, H];
    window.__gz = { sport: 'Football', headline: wi < 0 ? `${T(A)} and ${T(H)} Battle to a Tie` : `${T(TT[wi])} Beat ${T(TT[1 - wi])}, ${Math.max(g.score[0], g.score[1])}–${Math.min(g.score[0], g.score[1])}`,
      sub: `${T(A)} at ${T(H)} · ${F.RULES[g.rules].label} rules`, score: `${A.short || T(A)} ${g.score[0]}  ·  ${H.short || T(H)} ${g.score[1]}`,
      pog: best || '', real: real + `<li>Turnovers: ${g.box[0].team.to}–${g.box[1].team.to}. Penalties: ${g.box[0].team.pen}–${g.box[1].team.pen}.</li>`,
      plays: g.log.filter(l => /touchdown|intercept|fumble|field goal is good|safety/i.test(l.text)).slice(-6).map(l => F.qLabel(l.q) + ' ' + F.fmtClock(l.clock) + ': ' + l.text) };
    return `<section class="card final"><div class="score"><span style="color:var(--away)">${g.score[0]}</span> – <span style="color:var(--home)">${g.score[1]}</span></div>
      <p style="margin-top:6px"><b>${head}</b></p>
      <p style="margin-top:8px"><button class="btn small" type="button" onclick="arenaGazette()">🗞 Print the newspaper recap</button></p><p class="note">${esc(T(A))} at ${esc(T(H))} · ${F.RULES[g.rules].label} rules</p>
      ${best ? `<p style="margin-top:10px"><span class="badge b-gold">Player of the game</span> ${esc(best)}</p>` : ''}</section>
      <section class="card" style="margin-top:12px"><h3>How real was that?</h3><ul class="list">${real}<li>Turnovers: ${g.box[0].team.to}–${g.box[1].team.to}. Penalties: ${g.box[0].team.pen}–${g.box[1].team.pen}.</li></ul>
      <p class="note" style="margin-top:8px">One game is a small sample. Over many games, each team scores and allows close to what it really did.</p></section>`;
  }
  function dockBar() {
    const g = S.game; dock.classList.remove('hide');
    if (g.over) {
      dock.innerHTML = '<div class="in"><button class="btn primary exec" id="fbRe">Rematch</button><button class="btn" id="fbNew">New matchup</button></div>';
      $('#fbRe').onclick = () => { stopAuto(); startGame(); }; $('#fbNew').onclick = () => { stopAuto(); S.screen = 'setup'; render(); }; return;
    }
    if (user() === null) {
      dock.innerHTML = `<div class="in"><button class="btn primary exec" id="fbAuto">${S.auto ? 'Pause' : 'Play'}</button><div class="sims"><button class="btn small" id="fbStep">Next play</button><button class="btn small" id="fbDriveBtn">Sim drive</button><button class="btn small" id="fbEnd">Sim to final</button></div></div>`;
      $('#fbAuto').onclick = () => { if (S.auto) stopAuto(); else startAuto(); dockBar(); };
      $('#fbStep').onclick = () => { stopAuto(); doStep({}); }; $('#fbDriveBtn').onclick = () => { stopAuto(); simDrive(); }; $('#fbEnd').onclick = () => { stopAuto(); simEnd(); };
      return;
    }
    let lab;
    if (g.kickoffNext) lab = g.kicking === user() ? (S.calls.onside ? 'Onside kick' : 'Kick off') : 'Receive the kick';
    else if (userOff()) lab = (OFF.find((o) => o[0] === S.calls.off) || OFF[0])[1];
    else lab = (DEF.find((o) => o[0] === S.calls.def) || DEF[0])[1];
    dock.innerHTML = `<div class="in"><button class="btn primary exec" id="fbExec">Execute: ${esc(lab)}</button><div class="sims"><button class="btn small" id="fbDriveBtn">Sim drive</button><button class="btn small" id="fbHalf">Sim to ${g.q <= 2 ? 'halftime' : '2-minute'}</button><button class="btn small" id="fbEnd">Sim to final</button></div></div>`;
    $('#fbExec').onclick = () => doStep({ off: S.calls.off, def: S.calls.def, onside: S.calls.onside });
    $('#fbDriveBtn').onclick = simDrive; $('#fbEnd').onclick = simEnd;
    $('#fbHalf').onclick = () => { const target = g.q <= 2 ? 3 : 4; withAI(() => F.simTo(g, (gg) => gg.q >= target && (target === 3 || gg.clock <= 120))); S.lastRes = { text: g.log.length ? g.log[g.log.length - 1].text : '', sum: 'Simmed ahead.' }; after(); };
  }
  function withAI(fn) { const g = S.game; const keep = g.userSide; g.userSide = null; try { fn(); } finally { g.userSide = keep; } }
  function crowd(res) { if (!res) return; if (res.crowd) SND.play(res.crowd); if (res.score && res.score.kind === 'td' && res.side === 1) setTimeout(() => SND.play('organ'), 1500); }
  function doStep(calls) {
    const g = S.game; if (!g || g.over) return;
    const res = F.step(g, Object.assign({}, calls, { twoPt: S.calls.twoPt }));
    if (!res) return;
    if (res.score && res.score.kind === 'td' && res.side === user()) S.calls.twoPt = false;
    S.lastRes = res;
    S.chatter = null;
    if (user() !== null && res.side !== user() && (res.big || res.turnover) && Math.random() < 0.35) S.chatter = pickLine(res);
    if (calls.onside) S.calls.onside = false;
    crowd(res); after();
  }
  const LINES = { score: ['That\'s how you finish a drive.', 'Put that on the board.', 'You might want to adjust, coach.'], take: ['Thanks for the ball.', 'My defense has seen that one before.', 'Bad read.'], big: ['Didn\'t see that coming, did you?', 'We call that one every week.'] };
  function pickLine(res) { const l = res.score ? LINES.score : res.turnover ? LINES.take : LINES.big; return l[Math.floor(Math.random() * l.length)]; }
  function after() { update(); if (S.game.over) { stopAuto(); S.tab = 'final'; update(); } }
  function simDrive() { const g = S.game; const b = g.score.slice(); let out = []; withAI(() => { out = F.simDrive(g); }); const last = out.filter(Boolean).pop(); S.lastRes = { text: last ? last.text : '', sum: `Simmed ${out.length} plays · ${g.score[0] - b[0] || g.score[1] - b[1] ? 'points scored' : 'no points'}` }; crowd(last); after(); }
  function simEnd() { const g = S.game; withAI(() => F.simGame(g)); S.lastRes = { text: g.log[g.log.length - 1].text, sum: 'Simmed to the final.' }; after(); }
  function startAuto() { stopAuto(); S.auto = setInterval(() => { if (!S.game || S.game.over) { stopAuto(); return; } doStep({}); }, Math.round(1600 / S.speed)); if (S.screen === 'game') dockBar(); }
  function stopAuto() { if (S.auto) { clearInterval(S.auto); S.auto = null; } }

  const POSNAME = { QB: 'Quarterbacks', RB: 'Running backs', WR: 'Wide receivers', TE: 'Tight ends', OL: 'Offensive line', DL: 'Defensive line', LB: 'Linebackers', CB: 'Cornerbacks', S: 'Safeties', K: 'Kicker', P: 'Punter' };
  const ALT = { S: ['CB'], CB: ['S'], TE: ['WR'], RB: ['WR'], WR: ['TE', 'RB'], K: ['P'], P: ['K'] };
  function renderDreamEdit() {
    dock.classList.add('hide'); headerButtons();
    const i = S.editSide; const sd = S.setup.sides[i]; const pick = dreamPick(i); const t = dreamTeam(i);
    const inUse = new Set(); DR.ORDER.forEach((g) => (pick[g] || []).forEach((c) => inUse.add(c)));
    const grade = (x) => Math.round(Math.max(1, Math.min(99, 50 + 30 * Math.log(x) / Math.log(1.6))));
    const sec = DR.ORDER.map((g) => {
      const list = pick[g] || [];
      const pool = sd.cands.filter((c) => c.g === g || (ALT[g] || []).includes(c.g));
      const rows = [];
      for (let k = 0; k < DR.SIZE[g]; k++) {
        const cur = list[k];
        const opts = [`<option value="">— empty —</option>`].concat(pool.filter((c) => c === cur || !inUse.has(c)).slice(0, 60).map((c) => `<option value="${c.pid}|${c.g}"${c === cur ? ' selected' : ''}>${esc(c.n)} · ${c.g} ${Math.round(c.peak)} · ${DR.span(c)}${c.hof ? ' · HOF' : ''}</option>`));
        rows.push(`<tr><td>${g}${k + 1}</td><td><select data-slot="${g}|${k}" aria-label="${g} ${k + 1}" style="padding:5px;width:100%">${opts.join('')}</select></td></tr>`);
      }
      return `<section class="card"><h3>${POSNAME[g]}</h3><table class="box"><tbody>${rows.join('')}</tbody></table></section>`;
    }).join('');
    app.innerHTML = `<h2>${esc(t.name)} · roster</h2>
      <p class="note" style="margin-top:4px">45 players: the best from ${sd.fr === 'ANY' ? 'every team' : esc(S.frName[sd.fr].name)}, ${sd.from}–${sd.to}, picked by their best seasons. Swap anyone you like. Each list shows that player's rating at his peak and the years he counts for.</p>
      <div class="card" style="margin-top:12px"><p>Offense grade <b>${grade(t.O)}</b> · Defense grade <b>${grade(1 / t.D)}</b> <span class="note">(50 = an average team of its era)</span></p>
        <p class="note" style="margin-top:4px">Team strength blends how good these players were with how good their real teams were in those seasons.</p></div>
      <div class="grid cols2" style="margin-top:12px">${sec}</div>
      <div class="actions"><button class="btn primary" id="deDone">Done</button><button class="btn" id="deReset">Reset to best picks</button></div>`;
    app.querySelectorAll('select[data-slot]').forEach((s) => s.onchange = () => {
      const [g, k] = s.dataset.slot.split('|'); const list = pick[g] || (pick[g] = []);
      const c = s.value ? sd.cands.find((x) => `${x.pid}|${x.g}` === s.value) : null;
      if (c) list[+k] = c; else list.splice(+k, 1);
      pick[g] = list.filter(Boolean); sd.edited = true; renderDreamEdit();
    });
    $('#deDone').onclick = () => { S.screen = 'setup'; render(); };
    $('#deReset').onclick = () => { sd.pick = null; dreamPick(i); renderDreamEdit(); };
  }
  function render() {
    const hero = document.getElementById('hero'); if (hero) hero.classList.toggle('off', !(S.screen === 'setup' || S.screen === 'dreamEdit'));
    if (S.screen === 'setup') renderSetup(); else if (S.screen === 'dreamEdit') renderDreamEdit(); else if (S.screen === 'pregame') renderPregame(); else renderGame();
    window.scrollTo(0, 0);
  }
  window.ArenaFootball = {
    async open() { stopAuto(); app.innerHTML = '<p class="note"><span class="spin"></span> Loading the stadium…</p>'; await load(); S.screen = 'setup'; render(); },
    isActive() { return ['game', 'pregame', 'setup', 'dreamEdit'].includes(S.screen); },
    stop: stopAuto,
  };
})();
