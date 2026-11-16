/* The All-Time Sports Arena — app screens */
(function () {
  'use strict';
  const E = window.Arena.baseball;
  const SND = window.ArenaSound;
  const $ = (s, r) => (r || document).querySelector(s);
  const app = $('#app'), dock = $('#dock'), modal = $('#modal');
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f3 = (x) => (x == null || isNaN(x) ? '—' : x.toFixed(3).replace(/^0/, ''));
  const f2 = (x) => (x == null || isNaN(x) ? '—' : x.toFixed(2));

  const S = {
    idx: null, cache: {}, screen: 'home',
    setup: {
      mode: 'play', userSide: 1, diff: 'pro', dh: 'auto',
      sides: [
        { type: 'real', year: 1927, tm: 'NYA', sp: '' },
        { type: 'real', year: 1980, tm: 'PHI', sp: '' },
      ],
    },
    dream: [null, null], teams: [null, null], game: null, lineup: [null, null],
    calls: { off: 'swing', def: 'normal' }, tab: 'call', auto: null, speed: 1, lastRes: null, chatter: null,
  };

  /* ---------------- data ---------------- */
  async function loadIndex() {
    const r = await fetch('baseball-index.json');
    S.idx = await r.json();
  }
  async function loadDecade(d) {
    if (S.cache[d]) return S.cache[d];
    const r = await fetch('baseball-' + d + 's.json');
    S.cache[d] = await r.json();
    return S.cache[d];
  }
  async function teamSeason(y, tm) { const d = await loadDecade(Math.floor(y / 10) * 10); return d[y + tm]; }
  function badgeFor(y) { return y >= 1901 ? ['b-gold', 'Gold'] : ['b-silver', 'Silver']; }
  function franchises() {
    const m = {};
    Object.keys(S.idx.index).forEach((y) => S.idx.index[y].forEach((r) => {
      const fr = r[5]; const yy = +y;
      if (!m[fr]) m[fr] = { fr, name: r[6], y0: yy, y1: yy, lastName: r[1] };
      m[fr].y0 = Math.min(m[fr].y0, yy); if (yy >= m[fr].y1) { m[fr].y1 = yy; m[fr].lastName = r[1]; }
    }));
    return Object.values(m).sort((a, b) => a.lastName.localeCompare(b.lastName));
  }

  /* ---------------- sound ---------------- */
  $('#soundBtn').addEventListener('click', () => {
    const b = $('#soundBtn');
    if (SND.isOn()) { SND.disable(); b.textContent = 'Crowd: Off'; b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); $('#vol').classList.add('hide'); }
    else if (SND.enable()) { b.textContent = 'Crowd: On'; b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); $('#vol').classList.remove('hide'); SND.play('cheerDef'); }
  });
  $('#vol').addEventListener('input', (e) => SND.setVolume(+e.target.value));
  $('#homeBtn').addEventListener('click', () => { stopAuto(); if (window.ArenaFootball) window.ArenaFootball.stop(); if (window.__arenaSport === 'football') { window.ArenaFootball.open(); return; } S.screen = 'setup'; render(); });
  $('#sportsBtn').addEventListener('click', () => document.querySelector('.brand').click());
  document.querySelector('.brand').style.cursor = 'pointer';
  document.querySelector('.brand').addEventListener('click', () => { stopAuto(); if (window.ArenaFootball) window.ArenaFootball.stop(); window.__arenaSport = null; S.screen = 'home'; render(); });

  /* ---------------- home ---------------- */
  function renderHome() {
    dock.classList.add('hide'); $('#homeBtn').classList.add('hide');
    app.innerHTML = `
      <h1>Baseball and football.<br>Any team, any year.</h1>
      <p class="lede">Coach against the AI, or sit back and watch. Real rosters and real stats decide every play, so the 1927 Yankees hit like the 1927 Yankees.</p>
      <div class="grid sports">
        <button class="card sport ready" data-go="setup">
          <span class="name">Baseball</span>
          <span class="note">Every MLB team and player, 1871–2025. 3,614 team-seasons, plus dream rosters.</span>
        </button>
        <button class="card sport ready" data-go="football">
          <span class="name">Football</span>
          <span class="note">Every NFL and AFL team, 1960–2025. 1,901 team-seasons playing to their real points scored and allowed, with named players for every team, plus dream teams.</span>
        </button>
      </div>
      <section class="card guide">
        <h2>How accurate is this?</h2>
        <p style="margin-top:8px"><b>Baseball:</b> full real stats for every player, 1901–2025. From 1871 to 1900 the early records are incomplete and the rules differed, so those seasons are a little rougher.</p>
        <p style="margin-top:6px"><b>Football:</b> every team plays to its real points scored and allowed. 24 iconic teams have their whole hand-checked lineup. Every other team has its key players named: QBs, backs, receivers, tight ends, six key defenders, kicker and punter.</p>
        <p class="note" style="margin-top:12px">Cross-era games are balanced: each player is measured against his own league, then the game is played in a neutral environment. Season replays of real teams land within normal luck of their real records.</p>
      </section>`;
    app.querySelector('[data-go=setup]').onclick = () => { window.__arenaSport = 'baseball'; S.screen = 'setup'; render(); };
    app.querySelector('[data-go=football]').onclick = () => { window.__arenaSport = 'football'; window.ArenaFootball.open(); };
  }

  /* ---------------- setup ---------------- */
  function yearOptions(sel) {
    const [a, b] = S.idx.meta.years; let h = '';
    for (let y = b; y >= a; y--) h += `<option value="${y}"${y === sel ? ' selected' : ''}>${y}</option>`;
    return h;
  }
  function teamOptions(y, sel) {
    return (S.idx.index[y] || []).map((r) => {
      const tags = (r[7] ? ' · World Series champs' : r[8] ? ' · Pennant' : '');
      return `<option value="${r[0]}"${r[0] === sel ? ' selected' : ''}>${esc(r[1])} (${r[2]}–${r[3]}, ${r[4]})${tags}</option>`;
    }).join('');
  }
  function sideCard(i) {
    const sd = S.setup.sides[i]; const label = i === 0 ? 'Away' : 'Home'; const cls = i === 0 ? 'a' : 'h';
    const yours = S.setup.mode === 'play' && S.setup.userSide === i ? ' · You coach' : (S.setup.mode === 'play' ? ' · AI coach' : '');
    let body = '';
    if (sd.type === 'real') {
      if (!(S.idx.index[sd.year] || []).some((r) => r[0] === sd.tm)) sd.tm = (S.idx.index[sd.year] || [])[0][0];
      body = `
        <div class="row">
          <label class="f" for="yr${i}">Year<select id="yr${i}" data-side="${i}" data-k="year">${yearOptions(sd.year)}</select></label>
          <label class="f" for="tm${i}" style="flex:2 1 220px">Team<select id="tm${i}" data-side="${i}" data-k="tm">${teamOptions(sd.year, sd.tm)}</select></label>
        </div>
        <div class="teamline">${sd.year < 1901 ? '<span class="note">Early era: records are incomplete</span>' : ''}<span id="spwrap${i}"></span></div>`;
    } else {
      const d = S.dream[i];
      body = d ? `<p><b>${esc(d.team.label)}</b></p><p class="note">${d.team.batters.length} hitters, ${d.team.pitchers.length} pitchers · ${d.mode === 'peak' ? 'Peak-season ratings' : 'Average ratings across the range'}</p>
        <div class="actions" style="margin-top:8px"><button class="btn small" data-dream="${i}">Edit roster</button></div>`
        : `<p class="note">Build an all-star team from one franchise over any range of years, or the best players from every team in an era.</p>
        <div class="actions" style="margin-top:8px"><button class="btn" data-dream="${i}">Build dream roster</button></div>`;
    }
    return `<section class="card side">
      <h2><span class="dot ${cls}"></span>${label}<span class="note" style="text-transform:none;letter-spacing:0;font-family:var(--body);font-weight:500">${yours}</span></h2>
      <div class="seg" style="margin:10px 0 12px" role="group" aria-label="${label} team type">
        <button data-side="${i}" data-type="real" class="${sd.type === 'real' ? 'sel' : ''}">Real team</button>
        <button data-side="${i}" data-type="dream" class="${sd.type === 'dream' ? 'sel' : ''}">Dream roster</button>
      </div>
      ${body}
    </section>`;
  }
  function renderSetup() {
    dock.classList.add('hide'); $('#homeBtn').classList.add('hide');
    const st = S.setup;
    app.innerHTML = `
      <h2>Set up the matchup</h2>
      <div class="card" style="margin-top:12px">
        <div class="row">
          <div><h3>Mode</h3><div class="seg" role="group" aria-label="Mode">
            <button data-set="mode" data-v="play" class="${st.mode === 'play' ? 'sel' : ''}">Play as coach</button>
            <button data-set="mode" data-v="watch" class="${st.mode === 'watch' ? 'sel' : ''}">Watch</button></div></div>
          <div class="${st.mode === 'play' ? '' : 'hide'}"><h3>You coach</h3><div class="seg" role="group" aria-label="Your team">
            <button data-set="userSide" data-v="0" class="${st.userSide === 0 ? 'sel' : ''}">Away</button>
            <button data-set="userSide" data-v="1" class="${st.userSide === 1 ? 'sel' : ''}">Home</button></div></div>
          <div class="${st.mode === 'play' ? '' : 'hide'}"><h3>AI coach</h3><div class="seg" role="group" aria-label="AI difficulty">
            <button data-set="diff" data-v="rookie" class="${st.diff === 'rookie' ? 'sel' : ''}">Rookie</button>
            <button data-set="diff" data-v="pro" class="${st.diff === 'pro' ? 'sel' : ''}">Pro</button>
            <button data-set="diff" data-v="hof" class="${st.diff === 'hof' ? 'sel' : ''}">Hall of Fame</button></div></div>
          <div><h3>Designated hitter</h3><div class="seg" role="group" aria-label="DH rule">
            <button data-set="dh" data-v="auto" class="${st.dh === 'auto' ? 'sel' : ''}">Home team's rules</button>
            <button data-set="dh" data-v="on" class="${st.dh === 'on' ? 'sel' : ''}">On</button>
            <button data-set="dh" data-v="off" class="${st.dh === 'off' ? 'sel' : ''}">Off</button></div></div>
        </div>
      </div>
      <div class="grid sides" style="margin-top:14px">${sideCard(0)}${sideCard(1)}</div>
      <div class="actions">
        <button class="btn primary" id="toPre">See the matchup</button>
        <span class="note" id="setupMsg">The home park, and the home team's era rules, are used for the game.</span>
      </div>`;
    app.querySelectorAll('[data-set]').forEach((b) => b.onclick = () => {
      const k = b.dataset.set; let v = b.dataset.v; if (k === 'userSide') v = +v; st[k] = v; renderSetup();
    });
    app.querySelectorAll('[data-type]').forEach((b) => b.onclick = () => { st.sides[+b.dataset.side].type = b.dataset.type; renderSetup(); });
    app.querySelectorAll('select[data-k]').forEach((s) => s.onchange = () => {
      const sd = st.sides[+s.dataset.side];
      if (s.dataset.k === 'year') { sd.year = +s.value; sd.sp = ''; } else { sd.tm = s.value; sd.sp = ''; }
      renderSetup();
    });
    app.querySelectorAll('[data-dream]').forEach((b) => b.onclick = () => openDream(+b.dataset.dream));
    [0, 1].forEach((i) => { if (st.sides[i].type === 'real') fillStarter(i); });
    $('#toPre').onclick = goPregame;
  }
  async function fillStarter(i) {
    const sd = S.setup.sides[i];
    const wrap = $('#spwrap' + i); if (!wrap) return;
    wrap.innerHTML = '<span class="spin"></span>';
    const ts = await teamSeason(sd.year, sd.tm);
    if (!ts || !$('#spwrap' + i)) return;
    const t = E.buildTeam(ts, S.idx.lg);
    const starters = t.pitchers.filter((p) => p.starter).sort((a, b) => b.gs - a.gs).slice(0, 6);
    const list = starters.length ? starters : t.pitchers.slice().sort((a, b) => b.ip - a.ip).slice(0, 4);
    $('#spwrap' + i).innerHTML = `<label class="f" for="sp${i}" style="min-width:230px">Starting pitcher
      <select id="sp${i}"><option value="">Ace (best starter)</option>${list.map((p) => `<option value="${p.id}"${sd.sp === p.id ? ' selected' : ''}>${esc(p.n)} · ${f2(p.era)} ERA, ${p.w}–${p.l}</option>`).join('')}</select></label>`;
    $('#sp' + i).onchange = (e) => { sd.sp = e.target.value; };
  }

  /* ---------------- dream roster builder ---------------- */
  function openDream(i) {
    const frs = franchises();
    const cur = S.dream[i] && S.dream[i].cfg || { fr: 'PHI', y0: 1970, y1: 1979, mode: 'avg', hitters: 13 };
    if (!cur.hitters) cur.hitters = 13;
    const show = () => {
      const f = cur.fr === 'ANY' ? { y0: S.idx.meta.years[0], y1: S.idx.meta.years[1] } : frs.find((x) => x.fr === cur.fr) || frs[0];
      cur.y0 = Math.max(f.y0, Math.min(cur.y0, f.y1)); cur.y1 = Math.min(f.y1, Math.max(cur.y1, cur.y0));
      if (cur.fr === 'ANY' && cur.y1 - cur.y0 > 9) cur.y1 = cur.y0 + 9;
      const yo = (sel, a, b) => { let h = ''; for (let y = a; y <= b; y++) h += `<option value="${y}"${y === sel ? ' selected' : ''}>${y}</option>`; return h; };
      modal.innerHTML = `<div class="card">
        <h2>Dream roster · ${i === 0 ? 'Away' : 'Home'}</h2>
        <p class="note" style="margin-top:6px">Pick a franchise and a range of years. The AI picks the best 25, position by position, and you can swap anyone.</p>
        <div class="row" style="margin-top:14px">
          <label class="f" for="dfr" style="flex:2 1 240px">Franchise<select id="dfr"><option value="ANY"${cur.fr === 'ANY' ? ' selected' : ''}>Any team (era all-stars, up to 10 years)</option>${frs.map((x) => `<option value="${x.fr}"${x.fr === cur.fr ? ' selected' : ''}>${esc(x.lastName)} (${x.y0}–${x.y1})</option>`).join('')}</select></label>
          <label class="f" for="dy0">From<select id="dy0">${yo(cur.y0, f.y0, f.y1)}</select></label>
          <label class="f" for="dy1">To<select id="dy1">${yo(cur.y1, f.y0, f.y1)}</select></label>
        </div>
        <div style="margin-top:12px"><h3>Rate each player by</h3><div class="seg" role="group" aria-label="Rating method">
          <button data-m="avg" class="${cur.mode === 'avg' ? 'sel' : ''}">Average over the range</button>
          <button data-m="peak" class="${cur.mode === 'peak' ? 'sel' : ''}">Best single season</button></div>
          <p class="note" style="margin-top:6px">Average is more realistic. Best season puts every player at his peak, like Schmidt's 1980 MVP year.</p></div>
        <div style="margin-top:12px"><h3>25-man roster split</h3><div class="seg" role="group" aria-label="Hitters and pitchers">
          ${[13, 14, 15].map((h) => `<button data-h="${h}" class="${cur.hitters === h ? 'sel' : ''}">${h} hitters · ${25 - h} pitchers</button>`).join('')}</div>
          <p class="note" style="margin-top:6px">Every split has 5 starting pitchers. More hitters means a deeper bench and a shorter bullpen.</p></div>
        <div class="actions"><button class="btn primary" id="dGo">Pick my team</button><button class="btn" id="dCancel">Cancel</button><span id="dMsg" class="note"></span></div>
      </div>`;
      modal.classList.remove('hide');
      $('#dfr').onchange = (e) => { cur.fr = e.target.value; const nf = cur.fr === 'ANY' ? null : frs.find((x) => x.fr === cur.fr); if (nf) { cur.y0 = Math.max(nf.y0, nf.y1 - 9); cur.y1 = nf.y1; } show(); };
      $('#dy0').onchange = (e) => { cur.y0 = +e.target.value; if (cur.y1 < cur.y0) cur.y1 = cur.y0; show(); };
      $('#dy1').onchange = (e) => { cur.y1 = +e.target.value; if (cur.y0 > cur.y1) cur.y0 = cur.y1; show(); };
      modal.querySelectorAll('[data-m]').forEach((b) => b.onclick = () => { cur.mode = b.dataset.m; show(); });
      modal.querySelectorAll('[data-h]').forEach((b) => b.onclick = () => { cur.hitters = +b.dataset.h; show(); });
      $('#dCancel').onclick = closeModal;
      $('#dGo').onclick = async () => {
        $('#dGo').disabled = true; $('#dMsg').innerHTML = '<span class="spin"></span> Scouting every player…';
        const decs = []; for (let d = Math.floor(cur.y0 / 10) * 10; d <= cur.y1; d += 10) decs.push(d);
        const files = await Promise.all(decs.map(loadDecade));
        let seasons = [];
        files.forEach((fd) => { Object.values(fd).forEach((ts) => { if (ts.y >= cur.y0 && ts.y <= cur.y1 && (cur.fr === 'ANY' || ts.fr === cur.fr)) seasons.push(ts); }); });
        if (!seasons.length) { $('#dMsg').textContent = 'No seasons found in that range.'; $('#dGo').disabled = false; return; }
        const pool = E.buildDreamPool(seasons, S.idx.lg, { mode: cur.mode });
        const picks = E.dreamPicks(pool, true, cur.hitters);
        const fname = cur.fr === 'ANY' ? 'All-Stars' : (frs.find((x) => x.fr === cur.fr) || {}).lastName;
        const label = (cur.y0 === cur.y1 ? cur.y0 : cur.y0 + '–' + String(cur.y1).slice(-2)) + ' ' + fname + (cur.fr === 'ANY' ? '' : ' Dream Team');
        editRoster(i, { cfg: Object.assign({}, cur), pool, picks, label, mode: cur.mode });
      };
    };
    show();
  }
  function closeModal() { modal.classList.add('hide'); modal.innerHTML = ''; }

  function editRoster(i, d) {
    const P = d.pool, pk = d.picks;
    const byId = (id) => P.batters.find((b) => b.id === id) || P.pitchers.find((p) => p.id === id);
    const bLine = (b) => `${esc(b.n)} — ${f3(b.avg)}, ${b.seasons > 1 ? Math.round(b.perSeason.hr) + ' HR/yr' : b.hrN + ' HR'} (${b.yrs})`;
    const pLine = (p) => `${esc(p.n)} — ${f2(p.era)} ERA${p.sv > 20 ? ', ' + p.sv + ' SV' : ''} (${p.yrs})`;
    const allIds = () => new Set(Object.values(pk.slots).concat(pk.bench, pk.dh ? [pk.dh] : [], pk.sp, pk.rp));
    const opts = (list, sel, fmt) => list.map((x) => `<option value="${x.id}"${x.id === sel ? ' selected' : ''}>${fmt(x)}</option>`).join('');
    const posList = (k) => { const p = E.SLOT_POS[k]; return P.batters.filter((b) => b.pos[p] > 0).sort((a, b) => b.pos[p] / 3 + E.bRank(b) * 8 - (a.pos[p] / 3 + E.bRank(a) * 8)).slice(0, 40); };
    const anyBat = () => P.batters.slice().sort((a, b) => E.bRank(b) - E.bRank(a)).slice(0, 60);
    const spList = () => P.pitchers.filter((p) => p.starter).sort((a, b) => E.pRank(a) - E.pRank(b)).slice(0, 40);
    const anyP = () => P.pitchers.slice().sort((a, b) => E.pRank(a) - E.pRank(b)).slice(0, 60);
    const ensure = (list, id) => (list.some((x) => x.id === id) || !byId(id) ? list : [byId(id)].concat(list));
    const row = (lab, key, list, sel, fmt) => `<div class="rosterrow"><b>${lab}</b><select data-slot="${key}" aria-label="${lab}">${opts(ensure(list, sel), sel, fmt)}</select></div>`;
    const draw = () => {
      let h = `<div class="card"><h2>${esc(d.label)}</h2>
        <label class="f" for="dname" style="margin-top:10px">Team name<input id="dname" type="text" value="${esc(d.label)}"></label>
        <p class="note" style="margin-top:6px">Every slot is a dropdown. If you pick someone already on the roster, the two players swap.</p>
        <div style="margin-top:10px"><h3>25-man roster split</h3><div class="seg" role="group" aria-label="Hitters and pitchers">
          ${[13, 14, 15].map((h) => `<button data-split="${h}" class="${9 + pk.bench.length === h ? 'sel' : ''}">${h} hitters · ${25 - h} pitchers</button>`).join('')}</div></div>
        <h3 style="margin-top:14px">Lineup</h3>`;
      ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'].forEach((k) => { h += row(k, 'slot:' + k, posList(k), pk.slots[k], bLine); });
      h += row('DH', 'dh', anyBat(), pk.dh, bLine);
      h += '<h3 style="margin-top:14px">Bench</h3>';
      pk.bench.forEach((id, j) => { h += row('B' + (j + 1), 'bench:' + j, anyBat(), id, bLine); });
      h += '<h3 style="margin-top:14px">Rotation</h3>';
      pk.sp.forEach((id, j) => { h += row('SP' + (j + 1), 'sp:' + j, spList(), id, pLine); });
      h += '<h3 style="margin-top:14px">Bullpen</h3>';
      pk.rp.forEach((id, j) => { h += row('RP' + (j + 1), 'rp:' + j, anyP(), id, pLine); });
      h += `<div class="actions"><button class="btn primary" id="rSave">Use this team</button><button class="btn" id="rBack">Back</button></div></div>`;
      modal.innerHTML = h; modal.classList.remove('hide'); modal.scrollTop = 0;
      modal.querySelectorAll('[data-slot]').forEach((s) => s.onchange = () => { setSlot(s.dataset.slot, s.value); draw(); });
      modal.querySelectorAll('[data-split]').forEach((b) => b.onclick = () => { setSplit(+b.dataset.split); draw(); });
      $('#rBack').onclick = () => openDream(i);
      $('#rSave').onclick = () => {
        d.label = ($('#dname').value || d.label).trim().slice(0, 40);
        const yrs = d.cfg.y0 === d.cfg.y1 ? String(d.cfg.y0) : d.cfg.y0 + '–' + String(d.cfg.y1).slice(-2);
        const nick = d.cfg.fr === 'ANY' ? 'All-Stars' : ((franchises().find((x) => x.fr === d.cfg.fr) || {}).lastName || 'Dream').split(' ').slice(-1)[0];
        const team = E.teamFromDream(P, pk, { label: d.label, short: yrs + ' ' + nick, fr: d.cfg.fr, mode: d.mode });
        S.dream[i] = { cfg: d.cfg, pool: P, picks: pk, label: d.label, mode: d.mode, team };
        closeModal(); renderSetup();
      };
    };
    const getSlot = (key) => { const [t, k] = key.split(':'); if (t === 'slot') return pk.slots[k]; if (t === 'dh') return pk.dh; return pk[t][+k]; };
    const putSlot = (key, v) => { const [t, k] = key.split(':'); if (t === 'slot') pk.slots[k] = v; else if (t === 'dh') pk.dh = v; else pk[t][+k] = v; };
    const findKey = (id) => {
      for (const k of Object.keys(pk.slots)) if (pk.slots[k] === id) return 'slot:' + k;
      if (pk.dh === id) return 'dh';
      for (const t of ['bench', 'sp', 'rp']) { const j = pk[t].indexOf(id); if (j >= 0) return t + ':' + j; }
      return null;
    };
    function setSplit(hitters) {
      const benchN = hitters - 9, rpN = 25 - hitters - 5;
      while (pk.bench.length > benchN) pk.bench.pop();
      while (pk.rp.length > rpN) pk.rp.pop();
      const ids = allIds();
      if (pk.bench.length < benchN) anyBat().filter((b) => !ids.has(b.id)).slice(0, benchN - pk.bench.length).forEach((b) => { pk.bench.push(b.id); ids.add(b.id); });
      if (pk.rp.length < rpN) anyP().filter((p) => !ids.has(p.id)).slice(0, rpN - pk.rp.length).forEach((p) => { pk.rp.push(p.id); ids.add(p.id); });
      d.cfg.hitters = 9 + pk.bench.length;
    }
    function setSlot(key, id) { const old = getSlot(key); const other = findKey(id); putSlot(key, id); if (other && other !== key) putSlot(other, old); }
    allIds();
    draw();
  }

  /* ---------------- pregame ---------------- */
  async function buildSides() {
    const out = [];
    for (let i = 0; i < 2; i++) {
      const sd = S.setup.sides[i];
      if (sd.type === 'dream') {
        if (!S.dream[i]) throw new Error((i === 0 ? 'Away' : 'Home') + ' dream roster is not built yet. Tap "Build dream roster".');
        out.push(S.dream[i].team);
      } else {
        const ts = await teamSeason(sd.year, sd.tm); out.push(E.buildTeam(ts, S.idx.lg));
      }
    }
    return out;
  }
  async function goPregame() {
    const btn = $('#toPre'); btn.disabled = true; $('#setupMsg').innerHTML = '<span class="spin"></span> Scouting both teams…';
    S.lineup = [null, null];
    try { S.teams = await buildSides(); } catch (e) { $('#setupMsg').textContent = e.message; btn.disabled = false; return; }
    S.screen = 'pregame'; render();
  }
  function useDH() { const st = S.setup; return st.dh === 'on' ? true : st.dh === 'off' ? false : S.teams[1].dhLeague; }
  function teamTitle(t) { return t.custom ? esc(t.label) : `${t.y} ${esc(t.name)}`; }
  function recordLine(t) {
    if (t.custom) return `Dream roster · ${t.y0 === t.y1 ? t.y0 : t.y0 + '–' + t.y1}`;
    return `${t.W}–${t.L}${t.WS ? ' · World Series champions' : t.LgW ? ' · Pennant winners' : ''}`;
  }
  function renderPregame() {
    dock.classList.add('hide'); $('#homeBtn').classList.remove('hide');
    const [A, H] = S.teams; const pa = E.teamProfile(A), ph = E.teamProfile(H);
    const rpg = (t) => (t.R && t.G ? t.R / t.G : null), rapg = (t) => (t.RA && t.G ? t.RA / t.G : null);
    const tr = (lbl, a, b, hi, fmt) => { const wa = a != null && b != null && (hi ? a > b : a < b), wb = a != null && b != null && (hi ? b > a : b < a); return `<div class="l${wa ? ' win' : ''}">${fmt(a)}</div><div class="lbl">${lbl}</div><div class="r${wb ? ' win' : ''}">${fmt(b)}</div>`; };
    const key = (p, role) => p ? `<li><b>${role}:</b> ${esc(p.n)}${p.ops != null ? ` (${f3(p.avg)}, ${p.hrN} HR${p.sbN > 15 ? ', ' + p.sbN + ' SB' : ''})` : p.era != null ? ` (${f2(p.era)} ERA, ${p.so} K${p.sv > 10 ? ', ' + p.sv + ' SV' : ''})` : ''}</li>` : '';
    const sw = (pr) => pr.strengths.map((s) => `<li class="plus">+ ${esc(s)}</li>`).join('') + pr.weaknesses.map((s) => s === 'Few holes to exploit' ? `<li class="note">${esc(s)}</li>` : `<li class="minus">− ${esc(s)}</li>`).join('');
    const dh = useDH();
    const rules = `${dh ? 'Designated hitter in use' : 'Pitchers bat'} · ${H.custom ? 'Neutral park' : esc(H.park)}${A.y >= 2020 && H.y >= 2020 ? ' · Extra innings start with a runner on second' : ''}${Math.abs(A.y - H.y) >= 15 ? ' · Ratings adjusted for era so the matchup is fair' : ''}`;
    app.innerHTML = `
      <h2>Tale of the tape</h2>
      <p class="note" style="margin-top:4px">${rules}</p>
      <div class="card" style="margin-top:12px">
        <div class="tape">
          <div class="l"><div class="tape-head" style="color:var(--away)">${teamTitle(A)}</div><div class="note">${recordLine(A)}</div></div><div class="lbl">vs</div>
          <div class="r"><div class="tape-head" style="color:var(--home)">${teamTitle(H)}</div><div class="note">${recordLine(H)}</div></div>
          ${tr('Runs / game', rpg(A), rpg(H), true, f2)}
          ${tr('Allowed / game', rapg(A), rapg(H), false, f2)}
          ${tr('Batting avg', pa.avg, ph.avg, true, f3)}
          ${tr('On-base', pa.obp, ph.obp, true, f3)}
          ${tr('Slugging', pa.slg, ph.slg, true, f3)}
          ${tr('Home runs', pa.hr, ph.hr, true, (x) => x)}
          ${tr('Stolen bases', pa.sb, ph.sb, true, (x) => x)}
          ${tr('Team ERA', pa.era, ph.era, false, f2)}
          ${tr('Strikeouts', pa.so, ph.so, true, (x) => x)}
        </div>
        <p class="note" style="margin-top:8px">${A.custom || H.custom ? 'Dream roster totals add up every chosen player\'s seasons in the range.' : 'Season totals. Different eras played in different environments, so compare with care; the game itself adjusts for era.'}</p>
      </div>
      <div class="grid cols2" style="margin-top:14px">
        <section class="card"><h3 style="color:var(--away)">${teamTitle(A)}</h3>
          <ul class="list">${key(pa.best, 'Best hitter')}${key(pa.power, 'Power')}${key(pa.speed && pa.speed.sbN > 5 ? pa.speed : null, 'Speed')}${key(pa.ace, 'Ace')}${key(pa.closer && pa.closer.sv > 0 ? pa.closer : null, 'Closer')}</ul>
          <ul class="list" style="margin-top:10px">${sw(pa)}</ul></section>
        <section class="card"><h3 style="color:var(--home)">${teamTitle(H)}</h3>
          <ul class="list">${key(ph.best, 'Best hitter')}${key(ph.power, 'Power')}${key(ph.speed && ph.speed.sbN > 5 ? ph.speed : null, 'Speed')}${key(ph.ace, 'Ace')}${key(ph.closer && ph.closer.sv > 0 ? ph.closer : null, 'Closer')}</ul>
          <ul class="list" style="margin-top:10px">${sw(ph)}</ul></section>
      </div>
      <section class="card proj" id="proj"><h3>Prediction</h3><p class="note" style="margin-top:6px"><span class="spin"></span> Simulating 300 games…</p></section>
      <div class="grid cols2" style="margin-top:14px" id="lineups"></div>
      <div class="actions"><button class="btn primary" id="playBall">Play ball</button><button class="btn" id="back">Change teams</button></div>`;
    $('#back').onclick = () => { S.screen = 'setup'; render(); };
    $('#playBall').onclick = startGame;
    drawLineups();
    setTimeout(() => {
      if (!$('#proj')) return;
      const pr = E.project(A, H, 300, { dh });
      if (!$('#proj')) return;
      const n = pr.aw + pr.hw; const aPct = Math.round(pr.aw / n * 100);
      const fav = pr.aw >= pr.hw ? teamTitle(A) : teamTitle(H);
      $('#proj').innerHTML = `<h3>Prediction</h3>
        <p style="margin-top:6px"><b>${fav}</b> win ${Math.max(pr.aw, pr.hw)} of ${n} simulated games. Typical score: ${f2(pr.ar).slice(0, -1)} to ${f2(pr.hr).slice(0, -1)}.</p>
        <div class="bar" style="margin-top:10px" aria-label="Win share"><span style="width:${aPct}%;background:var(--away)"></span><span style="width:${100 - aPct}%;background:var(--home)"></span></div>
        <div class="row note" style="margin-top:6px;justify-content:space-between"><span style="flex:0 0 auto">${aPct}%</span><span style="flex:0 0 auto;text-align:right">${100 - aPct}%</span></div>`;
    }, 60);
  }

  /* --- starting lineup editor (pregame) --- */
  function spOpts() {
    return { awaySP: S.setup.sides[0].type === 'real' ? S.setup.sides[0].sp || undefined : undefined, homeSP: S.setup.sides[1].type === 'real' ? S.setup.sides[1].sp || undefined : undefined };
  }
  function previewGame() {
    const [A, H] = S.teams;
    return E.newGame(A, H, Object.assign({ dh: useDH(), awayLineup: S.lineup[0] || undefined, homeLineup: S.lineup[1] || undefined }, spOpts()));
  }
  function canEdit() { return true; }
  function isMine(i) { return S.setup.mode === 'play' && S.setup.userSide === i; }
  function drawLineups() {
    const g = previewGame(); const wrap = $('#lineups'); if (!wrap) return;
    wrap.innerHTML = [g.away, g.home].map((s, i) => {
      const t = S.teams[i]; const edit = canEdit(i);
      const posChoices = useDH() ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1, 2, 3, 4, 5, 6, 7, 8];
      const pool = t.batters.filter((b) => !b.isPitcher && (b.pa > 15 || s.lineup.some((x) => x.b.id === b.id))).sort((a, b) => b.pa - a.pa);
      const rows = s.lineup.map((x, j) => {
        if (!edit) return `<tr><td>${j + 1}. ${esc(x.b.n)}</td><td>${E.POS[x.pos]}</td><td>${f3(x.b.avg)}</td><td>${x.b.hrN}</td><td>${f3(x.b.ops)}</td></tr>`;
        const posSel = x.pos === 0 ? '<span class="note">P</span>' : `<select data-lu="pos" data-side="${i}" data-row="${j}" aria-label="Position for batter ${j + 1}" style="padding:5px;width:auto">${posChoices.map((p) => `<option value="${p}"${p === x.pos ? ' selected' : ''}>${E.POS[p]}</option>`).join('')}</select>`;
        const plSel = x.pos === 0 ? `<span>${esc(x.b.n)}</span>` : `<select data-lu="player" data-side="${i}" data-row="${j}" aria-label="Batter ${j + 1}" style="padding:5px">${pool.map((b) => `<option value="${b.id}"${b.id === x.b.id ? ' selected' : ''}>${esc(b.n)} · ${f3(b.avg)}, ${b.hrN} HR</option>`).join('')}</select>`;
        return `<tr><td style="white-space:nowrap">${j + 1}.</td><td style="width:62%">${plSel}</td><td>${posSel}</td><td style="white-space:nowrap">
          <button class="btn small lu-btn" data-lu="up" data-side="${i}" data-row="${j}" aria-label="Move up" ${j === 0 ? 'disabled' : ''}>▲</button>
          <button class="btn small lu-btn" data-lu="down" data-side="${i}" data-row="${j}" aria-label="Move down" ${j === 8 ? 'disabled' : ''}>▼</button></td></tr>`;
      }).join('');
      const head = edit ? '<tr><th>#</th><th>Batter</th><th>Pos</th><th>Order</th></tr>' : '<tr><th>#</th><th>Pos</th><th>AVG</th><th>HR</th><th>OPS</th></tr>';
      const ttl = isMine(i) ? 'Your starting lineup' : S.setup.mode === 'play' ? 'AI coach\'s lineup' : 'Starting lineup';
      const tip = isMine(i) ? 'Change any batter or position, and use the arrows to set the batting order. Pick a player who is already in the lineup and the two swap.'
        : 'The AI set this lineup from who played each spot most. Review it and fix anything that doesn\'t match how the real team played. The AI coach will use your version.';
      return `<section class="card"><h3 style="color:var(${i ? '--home' : '--away'})">${ttl}</h3>
        <p class="note" style="margin-top:4px">${tip}</p>
        <table class="box"><thead>${head}</thead><tbody>${rows}</tbody></table>
        <p class="note" style="margin-top:8px">Starting pitcher: <b>${esc(s.pitcher.n)}</b> (${f2(s.pitcher.era)} ERA, ${s.pitcher.w}–${s.pitcher.l})</p>
        ${edit && S.lineup[i] ? `<div class="actions" style="margin-top:8px"><button class="btn small" data-lu="reset" data-side="${i}">Reset to AI lineup</button></div>` : ''}</section>`;
    }).join('');
    wrap.querySelectorAll('[data-lu]').forEach((el) => {
      const ev = el.tagName === 'SELECT' ? 'onchange' : 'onclick';
      el[ev] = () => editLineup(+el.dataset.side, el.dataset.lu, +el.dataset.row, el.value, g);
    });
  }
  function editLineup(i, kind, row, value, g) {
    if (kind === 'reset') { S.lineup[i] = null; drawLineups(); return; }
    const side = i === 0 ? g.away : g.home;
    const lu = S.lineup[i] ? S.lineup[i].map((x) => Object.assign({}, x)) : side.lineup.map((x) => ({ id: x.b.id, pos: x.pos }));
    if (kind === 'up' && row > 0) [lu[row - 1], lu[row]] = [lu[row], lu[row - 1]];
    if (kind === 'down' && row < 8) [lu[row + 1], lu[row]] = [lu[row], lu[row + 1]];
    if (kind === 'pos') { const p = +value; const other = lu.findIndex((x) => x.pos === p); if (other >= 0) lu[other].pos = lu[row].pos; lu[row].pos = p; }
    if (kind === 'player') { const other = lu.findIndex((x) => x.id === value); if (other >= 0) lu[other].id = lu[row].id; lu[row].id = value; }
    S.lineup[i] = lu;
    drawLineups();
  }

  /* ---------------- game ---------------- */
  function startGame() {
    const st = S.setup; const [A, H] = S.teams;
    S.game = E.newGame(A, H, {
      dh: useDH(), userSide: st.mode === 'play' ? st.userSide : null, difficulty: st.diff,
      awayLineup: canEdit(0) && S.lineup[0] ? S.lineup[0] : undefined, homeLineup: canEdit(1) && S.lineup[1] ? S.lineup[1] : undefined,
      awaySP: st.sides[0].type === 'real' ? st.sides[0].sp || undefined : undefined, homeSP: st.sides[1].type === 'real' ? st.sides[1].sp || undefined : undefined,
    });
    S.calls = { off: 'swing', def: 'normal' }; S.tab = 'call'; S.lastRes = null; S.chatter = null; S.speed = 1;
    S.screen = 'game'; render();
    if (st.mode === 'watch') startAuto();
  }
  const userSide = () => (S.setup.mode === 'play' ? S.setup.userSide : null);
  const userBatting = () => userSide() !== null && S.game.half === userSide();
  const userFielding = () => userSide() !== null && S.game.half !== userSide();

  function renderGame() {
    $('#homeBtn').classList.remove('hide');
    const g = S.game; const [A, H] = S.teams;
    app.innerHTML = `
      <div class="board" id="board"></div>
      <div class="game">
        <div>
          <div class="card" style="padding:12px">
            <div class="sit" id="sit"></div>
            <div id="fieldWrap" style="margin-top:10px"></div>
            <div class="matchup" id="matchup" style="margin-top:10px"></div>
          </div>
        </div>
        <div>
          <div class="call" id="call" aria-live="polite"></div>
          <div class="tabs" role="tablist" id="tabs"></div>
          <div class="panel" id="panel"></div>
        </div>
      </div>`;
    buildField();
    void A; void H; void g;
    updateGame();
  }

  function updateGame() {
    const g = S.game; if (!g) return;
    renderBoard(); renderSit(); renderMatchup(); renderCall(); renderTabs(); renderPanel(); renderDock(); updateField();
  }

  function renderBoard() {
    const g = S.game; const n = Math.max(9, g.inning);
    const name = (t) => (t.custom ? t.short : t.y + ' ' + t.short);
    let h = '<table class="lines"><thead><tr><th></th>';
    for (let i = 1; i <= n; i++) h += `<th>${i}</th>`;
    h += '<th>R</th><th>H</th><th>E</th></tr></thead><tbody>';
    [0, 1].forEach((si) => {
      const t = S.teams[si];
      h += `<tr><td class="team"><span class="dot ${si ? 'h' : 'a'}"></span> ${esc(name(t))}</td>`;
      for (let i = 1; i <= n; i++) {
        const v = g.line[si][i - 1]; const cur = !g.over && g.inning === i && g.half === si;
        const reached = i < g.inning || (i === g.inning && si <= g.half);
        let shown = reached ? (v == null ? 0 : v) : '';
        if (g.over && si === 1 && i === g.inning && v == null) shown = 'X';
        if (g.over && si === 1 && i === g.inning && g.half === 1 && v != null) shown = v;
        h += `<td class="${cur ? 'cur' : ''}">${shown}</td>`;
      }
      h += `<td class="rhe">${g.score[si]}</td><td class="rhe">${g.hits[si]}</td><td class="rhe">${g.errs[1 - si]}</td></tr>`;
    });
    $('#board').innerHTML = h + '</tbody></table>';
  }
  function renderSit() {
    const g = S.game;
    if (g.over) { $('#sit').innerHTML = `<span>Final${g.inning > 9 ? ' / ' + g.inning : ''}</span>`; return; }
    const o = E.off(g); const tn = S.teams[o.si];
    $('#sit').innerHTML = `<span>${g.half ? 'Bottom' : 'Top'} ${g.inning}${['th', 'st', 'nd', 'rd'][(g.inning % 100 > 10 && g.inning % 100 < 14) ? 0 : Math.min(g.inning % 10, 4) % 4] || 'th'}</span>
      <span class="outs" aria-label="${g.outs} outs">${[0, 1, 2].map((i) => `<i class="${i < g.outs ? 'on' : ''}"></i>`).join('')} <span class="note" style="font-family:var(--body);text-transform:none;margin-left:4px">${g.outs} out${g.outs === 1 ? '' : 's'}</span></span>
      <span class="note" style="font-family:var(--body);text-transform:none;letter-spacing:0">${esc(tn.custom ? tn.label : tn.name)} batting${userSide() !== null ? (userBatting() ? ' · your call' : ' · you\'re in the field') : ''}</span>`;
  }
  function seasonBat(b) {
    if (b.isPitcher && (!b.line || b.line.AB == null)) return 'Pitcher';
    return `${f3(b.avg)} · ${b.hrN} HR · ${f3(b.ops)} OPS${b.yrs ? ' (' + b.yrs + ')' : ''}`;
  }
  function todayBat(g, b) { const x = g.box[b.id]; if (!x) return ''; const bits = [`${x.h}-for-${x.ab}`]; if (x.hr) bits.push(x.hr + ' HR'); if (x.rbi) bits.push(x.rbi + ' RBI'); if (x.bb) bits.push(x.bb + ' BB'); return 'Today: ' + bits.join(', '); }
  function fatigueInfo(ps) {
    const f = E.fatiguePct(ps);
    const lab = f < 0.7 ? 'Fresh' : f < 0.95 ? 'Tiring' : f < 1.15 ? 'Tired' : 'Gassed';
    const col = f < 0.7 ? 'var(--good)' : f < 0.95 ? 'var(--bulb)' : 'var(--bad)';
    return { f, lab, col };
  }
  function renderMatchup() {
    const g = S.game; if (g.over) { $('#matchup').innerHTML = ''; return; }
    const slot = E.batter(g); const b = slot.b; const d = E.def(g); const ps = d.pstate; const P = ps.p; const pb = g.pbox[P.id] || {};
    const fi = fatigueInfo(ps);
    $('#matchup').innerHTML = `
      <div><div class="note">At bat · ${E.POS[slot.pos]} · bats ${b.b}</div><div class="mu-name" style="color:var(${g.half ? '--home' : '--away'})">${esc(b.n)}</div>
        <div class="mu-sub">${seasonBat(b)}</div><div class="mu-sub">${todayBat(g, b)}</div></div>
      <div class="vs">VS</div>
      <div style="text-align:right"><div class="note">Pitching · throws ${P.t}</div><div class="mu-name" style="color:var(${g.half ? '--away' : '--home'})">${esc(P.n)}</div>
        <div class="mu-sub">${f2(P.era)} ERA · ${P.so} K${P.yrs ? ' (' + P.yrs + ')' : ''}</div>
        <div class="mu-sub">Today: ${E.boxIP(pb.outs || 0)} IP, ${pb.h || 0} H, ${pb.er || 0} ER, ${pb.so || 0} K · ${pb.pc || 0} pitches</div>
        <div class="mu-sub" style="color:${fi.col}">${fi.lab}</div><div class="fat"><span style="width:${Math.min(100, fi.f * 70)}%;background:${fi.col}"></span></div></div>`;
  }
  function renderCall() {
    const el = $('#call'); const r = S.lastRes; const g = S.game;
    if (!r) { el.className = 'call'; el.innerHTML = `<div class="big">${g.log.length ? '' : 'Here we go. ' + esc(E.batter(g).b.n) + ' leads off.'}</div>${S.chatter ? `<div class="coach"><b>Opposing coach:</b> ${esc(S.chatter)}</div>` : ''}`; return; }
    el.className = 'call' + (r.type === 'hr' || r.walkoff ? ' hr' : '');
    el.innerHTML = `<div class="big">${esc(r.text)}</div>${r.sum ? `<div class="note" style="margin-top:4px">${esc(r.sum)}</div>` : ''}${S.chatter ? `<div class="coach"><b>Opposing coach:</b> ${esc(S.chatter)}</div>` : ''}`;
  }

  const OFF = [
    ['swing', 'Swing away', 'Normal at-bat'], ['take', 'Take pitches', 'Work the count'], ['bunt', 'Bunt', 'Move the runners'],
    ['hitrun', 'Hit and run', 'Runner goes on contact'], ['steal2', 'Steal 2nd', 'Runner on first'], ['steal3', 'Steal 3rd', 'Runner on second'],
  ];
  const DEF = [
    ['normal', 'Normal', 'Standard defense'], ['infieldin', 'Infield in', 'Cut off the run at home'], ['shift', 'Shift', 'Overload the pull side'],
    ['ibb', 'Intentional walk', 'Put him on'], ['pitchout', 'Pitchout', 'Expecting a steal'],
  ];
  function offAllowed(k) {
    const g = S.game, b = g.bases;
    if (k === 'bunt') return g.outs < 2 || true;
    if (k === 'hitrun') return !!b[0] && !b[1];
    if (k === 'steal2') return !!b[0] && !b[1];
    if (k === 'steal3') return !!b[1] && !b[2];
    return true;
  }
  function defAllowed(k) {
    const g = S.game, b = g.bases;
    if (k === 'shift') return g.rulesYear < 2023;
    if (k === 'pitchout') return !!(b[0] || b[1]);
    return true;
  }
  function renderTabs() {
    const g = S.game; const us = userSide();
    const tabs = [];
    if (us !== null && !g.over) { tabs.push(['call', userBatting() ? 'Offense' : 'Defense']); tabs.push(['coach', "Coach's board"]); }
    if (us === null && !g.over) tabs.push(['call', 'Watch']);
    if (g.over) tabs.push(['final', 'Final']);
    tabs.push(['roster', 'Roster']); tabs.push(['box', 'Box score']); tabs.push(['log', 'Play-by-play']);
    if (!tabs.some((t) => t[0] === S.tab)) S.tab = tabs[0][0];
    $('#tabs').innerHTML = tabs.map(([k, l]) => `<button role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? 'sel' : ''}" data-tab="${k}">${l}</button>`).join('');
    $('#tabs').querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { S.tab = b.dataset.tab; renderTabs(); renderPanel(); });
  }
  function renderPanel() {
    const g = S.game; const p = $('#panel');
    if (S.tab === 'call') {
      if (userSide() === null) {
        p.innerHTML = `<p class="note">Both teams are coached by the AI. Use the controls below to play, pause or jump ahead.</p>
          <div class="seg" style="margin-top:10px" role="group" aria-label="Speed">${[[0.5, 'Slow'], [1, 'Normal'], [2.5, 'Fast']].map(([v, l]) => `<button data-speed="${v}" class="${S.speed === v ? 'sel' : ''}">${l}</button>`).join('')}</div>`;
        p.querySelectorAll('[data-speed]').forEach((b) => b.onclick = () => { S.speed = +b.dataset.speed; if (S.auto) { stopAuto(); startAuto(); } renderPanel(); });
        return;
      }
      if (userBatting()) {
        p.innerHTML = `<div class="opts">${OFF.map(([k, l, s]) => `<button class="opt${S.calls.off === k ? ' sel' : ''}" data-off="${k}" ${offAllowed(k) ? '' : 'disabled'}>${l}<small>${s}</small></button>`).join('')}</div>
          <p class="note" style="margin-top:10px">Pick a call, then tap Execute. Your call plus the real stats decide the result.</p>`;
        p.querySelectorAll('[data-off]').forEach((b) => b.onclick = () => { S.calls.off = b.dataset.off; renderPanel(); renderDock(); });
      } else {
        p.innerHTML = `<div class="opts">${DEF.map(([k, l, s]) => `<button class="opt${S.calls.def === k ? ' sel' : ''}" data-def="${k}" ${defAllowed(k) ? '' : 'disabled'}>${l}<small>${s}</small></button>`).join('')}</div>
          ${pitcherWarning()}`;
        p.querySelectorAll('[data-def]').forEach((b) => b.onclick = () => { S.calls.def = b.dataset.def; renderPanel(); renderDock(); });
      }
      return;
    }
    if (S.tab === 'coach') { renderCoach(p); return; }
    if (S.tab === 'roster') { renderRoster(p); return; }
    if (S.tab === 'box') { p.innerHTML = boxHTML(); return; }
    if (S.tab === 'log') {
      p.innerHTML = `<div class="log">${g.log.slice().reverse().map((l) => `<div><span class="inn">${l.half ? '▼' : '▲'}${l.inn}</span>${esc(l.text)} <span class="note">(${l.score[0]}–${l.score[1]})</span></div>`).join('') || '<p class="note">No plays yet.</p>'}</div>`;
      return;
    }
    if (S.tab === 'final') { p.innerHTML = finalHTML(); bindFinal(); }
  }
  function pitcherWarning() {
    const d = E.def(S.game); const fi = fatigueInfo(d.pstate);
    if (fi.f >= 0.95) return `<p class="note" style="margin-top:10px;color:var(--bad)">${esc(d.pstate.p.n)} is ${fi.lab.toLowerCase()} (${d.pstate.pitches} pitches). Think about a pitching change on the Coach's board.</p>`;
    return '<p class="note" style="margin-top:10px">Pick a defense, then tap Execute.</p>';
  }
  function renderCoach(p) {
    const g = S.game; const si = userSide(); const s = si === 0 ? g.away : g.home;
    let h = '<div class="coachbox">';
    if (userBatting()) {
      const bench = s.bench.filter((b) => !s.used.has(b.id));
      h += `<div class="card"><h3>Pinch hitter</h3><div class="inline" style="margin-top:8px"><select id="phSel" aria-label="Pinch hitter">${bench.map((b) => `<option value="${b.id}">${esc(b.n)} · ${f3(b.avg)}, ${b.hrN} HR</option>`).join('')}</select><button class="btn small" id="phGo" ${bench.length ? '' : 'disabled'}>Send him up</button></div>
        <p class="note" style="margin-top:6px">Replaces ${esc(E.batter(g).b.n)}. He can't come back in.</p></div>`;
      const runners = [0, 1, 2].filter((i) => g.bases[i]);
      h += `<div class="card"><h3>Pinch runner</h3><div class="inline" style="margin-top:8px"><select id="prBase" aria-label="Runner to replace">${runners.map((i) => `<option value="${i}">${['1st', '2nd', '3rd'][i]}: ${esc(g.bases[i].n)}</option>`).join('')}</select>
        <select id="prSel" aria-label="Pinch runner">${bench.slice().sort((a, b) => b.speed - a.speed).map((b) => `<option value="${b.id}">${esc(b.n)} · ${b.sbN} SB</option>`).join('')}</select><button class="btn small" id="prGo" ${runners.length && bench.length ? '' : 'disabled'}>Put him in</button></div></div>`;
      const tr = s.tricks; const b = g.bases;
      h += `<div class="card"><h3>Trick plays · ${tr} left</h3><div class="opts" style="margin-top:8px">
        <button class="opt" data-trick="squeeze" ${tr > 0 && b[2] && g.outs < 2 ? '' : 'disabled'}>Suicide squeeze<small>Runner on third breaks for home</small></button>
        <button class="opt" data-trick="doublesteal" ${tr > 0 && b[0] && (b[1] && !b[2] || b[2]) ? '' : 'disabled'}>Double steal<small>Two runners go at once</small></button>
        <button class="opt" data-trick="delayedsteal" ${tr > 0 && b[0] && !b[1] ? '' : 'disabled'}>Delayed steal<small>Catch them napping</small></button></div></div>`;
    } else {
      const pen = s.bullpen.filter((x) => !s.used.has(x.id));
      const fi = fatigueInfo(s.pstate);
      h += `<div class="card"><h3>Pitching change</h3><p class="note" style="margin-top:6px">${esc(s.pstate.p.n)}: ${s.pstate.pitches} pitches, <span style="color:${fi.col}">${fi.lab}</span></p>
        <div class="inline" style="margin-top:8px"><select id="pcSel" aria-label="Relief pitcher">${pen.map((x) => `<option value="${x.id}">${esc(x.n)} · ${f2(x.era)} ERA${x === s.closer ? ' · closer' : ''}${x.sv > 10 ? ', ' + x.sv + ' SV' : ''}</option>`).join('')}</select><button class="btn small" id="pcGo" ${pen.length ? '' : 'disabled'}>Bring him in</button></div></div>`;
      const visitsOk = (g.rulesYear < 2018 || s.visits > 0) && s.mvInning !== g.inning;
      h += `<div class="card"><h3>Mound visit${g.rulesYear >= 2018 ? ' · ' + s.visits + ' left' : ''}</h3><div class="inline" style="margin-top:8px"><button class="btn small" id="mvGo" ${visitsOk ? '' : 'disabled'}>Visit the mound</button><span class="note">Settles him down a little. Once per inning.</span></div></div>`;
      h += `<div class="card"><h3>Trick play · ${s.hidden} left</h3><div class="opts" style="margin-top:8px"><button class="opt" data-trick="hiddenball" ${s.hidden > 0 && g.bases.some(Boolean) ? '' : 'disabled'}>Hidden-ball trick<small>Rarely works. When it does…</small></button></div></div>`;
    }
    if (E.canChallenge(g, si)) h += `<div class="card"><h3>Replay challenge</h3><div class="inline" style="margin-top:8px"><button class="btn small" id="chGo">Challenge the last call</button><span class="note">${s.challenges} left</span></div></div>`;
    else if (g.rulesYear >= 2014) h += `<p class="note">Replay challenge: available right after a close call goes against you (${s.challenges} left).</p>`;
    h += '</div>';
    p.innerHTML = h;
    const bind = (id, fn) => { const el = $('#' + id); if (el) el.onclick = fn; };
    bind('phGo', () => { const r = E.pinchHit(g, si, $('#phSel').value); if (r) { S.lastRes = { text: `Pinch hitter: ${r.nb.n} bats for ${r.old.n}.`, type: 'sub' }; S.chatter = taunt(); updateGame(); } });
    bind('prGo', () => { const r = E.pinchRun(g, si, +$('#prBase').value, $('#prSel').value); if (r) { S.lastRes = { text: `Pinch runner: ${r.n} is in.`, type: 'sub' }; updateGame(); } });
    bind('pcGo', () => { const np = E.changePitcher(g, si, $('#pcSel').value); if (np) { S.lastRes = { text: `Pitching change: ${np.n} comes in.`, type: 'sub' }; S.chatter = taunt(); updateGame(); } });
    bind('mvGo', () => { if (E.moundVisit(g, si)) { S.lastRes = { text: 'Mound visit. The coach has a word with his pitcher.', type: 'sub' }; updateGame(); } });
    bind('chGo', () => { const r = E.challenge(g, si); if (r) { S.lastRes = { text: r.text, type: 'review' }; if (r.overturned) SND.play('cheer'); else SND.play('boo'); updateGame(); } });
    p.querySelectorAll('[data-trick]').forEach((b) => b.onclick = () => {
      const k = b.dataset.trick;
      if (k === 'hiddenball') doStep({ def: 'hiddenball' }); else doStep({ off: k });
    });
  }
  function taunt() {
    if (Math.random() < 0.55) return null;
    const g = S.game; const ai = userSide() === 0 ? 1 : 0;
    return E.coachLine(g, ai, 'taunt', E.batter(g).b).text;
  }
  function renderRoster(p) {
    const g = S.game;
    p.innerHTML = [g.away, g.home].map((s, si) => {
      const t = S.teams[si];
      return `<h3 style="color:var(${si ? '--home' : '--away'});margin-top:${si ? 16 : 0}px">${esc(t.custom ? t.label : t.y + ' ' + t.name)}</h3>
      <table class="box"><thead><tr><th>Batting order</th><th>Pos</th><th>Today</th><th>Season</th></tr></thead><tbody>
      ${s.lineup.map((x, j) => { const bx = g.box[x.b.id] || {}; return `<tr><td>${j + 1}. ${esc(x.b.n)}</td><td>${E.POS[x.pos]}</td><td>${bx.h || 0}-${bx.ab || 0}</td><td>${x.b.isPitcher ? '—' : f3(x.b.avg) + ', ' + x.b.hrN + ' HR'}</td></tr>`; }).join('')}
      </tbody></table>
      <p class="note" style="margin-top:6px"><b>Bench:</b> ${s.bench.filter((b) => !s.used.has(b.id)).map((b) => esc(b.n)).join(', ') || 'none left'}</p>
      <p class="note"><b>Bullpen:</b> ${s.bullpen.filter((b) => !s.used.has(b.id)).map((b) => esc(b.n) + (b === s.closer ? ' (CL)' : '')).join(', ') || 'none left'}</p>`;
    }).join('');
  }
  function boxHTML() {
    const g = S.game;
    return [0, 1].map((si) => {
      const t = S.teams[si];
      const bats = Object.entries(g.box).filter(([, b]) => b.si === si);
      const pits = Object.values(g.pbox).filter((p) => p.si === si).sort((a, b) => a.order - b.order);
      return `<h3 style="color:var(${si ? '--home' : '--away'});margin-top:${si ? 16 : 0}px">${esc(t.custom ? t.label : t.y + ' ' + t.name)}</h3>
      <table class="box"><thead><tr><th>Batter</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>SO</th><th>HR</th></tr></thead><tbody>
      ${bats.map(([, b]) => `<tr><td>${esc(b.n)}</td><td>${b.ab}</td><td>${b.r}</td><td>${b.h}</td><td>${b.rbi}</td><td>${b.bb}</td><td>${b.so}</td><td>${b.hr}</td></tr>`).join('')}</tbody></table>
      <table class="box" style="margin-top:8px"><thead><tr><th>Pitcher</th><th>IP</th><th>H</th><th>R</th><th>ER</th><th>BB</th><th>SO</th><th>PC</th></tr></thead><tbody>
      ${pits.map((p) => `<tr><td>${esc(p.n)}</td><td>${E.boxIP(p.outs)}</td><td>${p.h}</td><td>${p.r}</td><td>${p.er}</td><td>${p.bb}</td><td>${p.so}</td><td>${p.pc}</td></tr>`).join('')}</tbody></table>`;
    }).join('');
  }

  function renderDock() {
    const g = S.game;
    dock.classList.remove('hide');
    if (g.over) {
      dock.innerHTML = `<div class="in"><button class="btn primary exec" id="rematch">Rematch</button><button class="btn" id="newm">New matchup</button></div>`;
      $('#rematch').onclick = () => { stopAuto(); startGame(); };
      $('#newm').onclick = () => { stopAuto(); S.screen = 'setup'; render(); };
      return;
    }
    if (userSide() === null) {
      dock.innerHTML = `<div class="in"><button class="btn primary exec" id="autoBtn">${S.auto ? 'Pause' : 'Play'}</button>
        <div class="sims"><button class="btn small" id="stepBtn">Next at-bat</button><button class="btn small" id="simInn">Sim inning</button><button class="btn small" id="simEnd">Sim to final</button></div></div>`;
      $('#autoBtn').onclick = () => { if (S.auto) stopAuto(); else startAuto(); renderDock(); };
      $('#stepBtn').onclick = () => { stopAuto(); doStep({}); };
      $('#simInn').onclick = () => { stopAuto(); simHalf(); };
      $('#simEnd').onclick = () => { stopAuto(); simEnd(); };
      return;
    }
    const lab = userBatting() ? (OFF.find((o) => o[0] === S.calls.off) || OFF[0])[1] : (DEF.find((o) => o[0] === S.calls.def) || DEF[0])[1];
    dock.innerHTML = `<div class="in"><button class="btn primary exec" id="execBtn">Execute: ${esc(lab)}</button>
      <div class="sims"><button class="btn small" id="simKey">Sim to key moment</button><button class="btn small" id="simInn">Sim inning</button><button class="btn small" id="simEnd">Sim to final</button></div></div>`;
    $('#execBtn').onclick = () => doStep(userBatting() ? { off: S.calls.off } : { def: S.calls.def });
    $('#simKey').onclick = simKey; $('#simInn').onclick = simHalf; $('#simEnd').onclick = simEnd;
  }

  /* --- running the game --- */
  function crowdFor(res) {
    if (!res) return;
    if (res.crowd) SND.play(res.crowd);
    else if (res.type === 'hit') SND.play('crack');
    if (res.type === 'hr' && res.big) setTimeout(() => SND.play('organ'), 1400);
    if (res.halfOver && S.game.inning >= 7 && Math.abs(S.game.score[0] - S.game.score[1]) <= 1 && Math.random() < 0.5) setTimeout(() => SND.play('organ'), 600);
  }
  function doStep(calls, quiet) {
    const g = S.game; if (!g || g.over) return null;
    const res = E.step(g, calls);
    if (!res) return null;
    if (!quiet) {
      S.lastRes = res;
      const ev = (res.events || []).find((e) => e.coach && e.si !== userSide());
      S.chatter = ev ? ev.text : (userSide() !== null && res.big && Math.random() < 0.35 ? taunt() : (userSide() !== null && Math.random() < 0.06 ? taunt() : null));
      if (res.offCall && res.offSide !== userSide() && userSide() !== null && ['steal2', 'bunt', 'squeeze'].includes(res.offCall) && !S.chatter) S.chatter = E.coachLine(g, res.offSide, res.offCall === 'steal2' ? 'steal' : 'bunt').text;
      if (res.defCall === 'ibb' && userSide() !== null && E.def(g) && res.offSide === userSide() && !S.chatter) S.chatter = E.coachLine(g, 1 - userSide(), 'ibb', { n: (g.log.slice(-1)[0] || {}).text ? res.text.replace('Intentional walk to ', '').replace('.', '') : '' }).text;
      S.calls = { off: 'swing', def: 'normal' };
      animateBall(res);
      crowdFor(res);
      updateGame();
      if (g.over) finishGame();
    }
    return res;
  }
  function sum(before, label) {
    const g = S.game; const runs = [g.score[0] - before[0], g.score[1] - before[1]];
    const parts = [];
    [0, 1].forEach((i) => { if (runs[i]) parts.push(`${S.teams[i].custom ? S.teams[i].short : S.teams[i].short} +${runs[i]}`); });
    return label + (parts.length ? ' · ' + parts.join(', ') : ' · no runs scored');
  }
  function withAI(fn) { const g = S.game; const keep = g.userSide; g.userSide = null; try { fn(); } finally { g.userSide = keep; } }
  function simKey() {
    const g = S.game; const before = g.score.slice(); let n = 0; let last = null;
    withAI(() => { do { last = E.step(g, {}); n++; } while (!g.over && n < 400 && !(n > 0 && E.keyMoment(g) && !last.halfOver ? true : false)); });
    S.lastRes = { text: g.over ? last.text : 'Key moment: ' + (g.bases[1] || g.bases[2] ? 'runners in scoring position' : 'late and close') + '.', sum: sum(before, `Simmed ${n} plays`) };
    S.chatter = null; crowdFor(last); updateGame(); if (g.over) finishGame();
  }
  function simHalf() {
    const g = S.game; const before = g.score.slice(); let out = [];
    withAI(() => { out = E.simHalf(g, {}); });
    const last = out[out.length - 1];
    S.lastRes = { text: last ? last.text : '', sum: sum(before, 'Half-inning simmed') }; S.chatter = null; crowdFor(last); updateGame(); if (g.over) finishGame();
  }
  function simEnd() {
    const g = S.game; const before = g.score.slice(); let last = null;
    withAI(() => { let n = 0; while (!g.over && n++ < 900) last = E.step(g, {}); });
    S.lastRes = { text: last ? last.text : '', sum: sum(before, 'Simmed to the final') }; S.chatter = null; crowdFor(last); updateGame(); finishGame();
  }
  function startAuto() {
    stopAuto();
    const tick = () => { if (!S.game || S.game.over) { stopAuto(); return; } doStep({}); };
    S.auto = setInterval(tick, Math.round(1700 / S.speed));
    if (dock && S.screen === 'game') renderDock();
  }
  function stopAuto() { if (S.auto) { clearInterval(S.auto); S.auto = null; } }
  function finishGame() { stopAuto(); S.tab = 'final'; updateGame(); }

  /* --- final + how real --- */
  function pog(g) {
    let best = null, bv = -99;
    Object.entries(g.box).forEach(([id, b]) => { const tb = b.h + b.d + 2 * b.t + 3 * b.hr; const v = tb + b.r + b.rbi * 1.2 + b.bb * 0.5 + (b.si === g.winner ? 1 : 0); if (v > bv) { bv = v; best = { id, b, kind: 'bat' }; } });
    Object.entries(g.pbox).forEach(([id, p]) => { const v = p.outs / 3 * 0.9 - p.er * 1.5 + p.so * 0.35 + (p.si === g.winner ? 1 : 0) - 2; if (v > bv) { bv = v; best = { id, p, kind: 'pit' }; } });
    return best;
  }
  function findPlayer(id) {
    for (const t of S.teams) { const b = t.batters.find((x) => x.id === id); if (b) return { b, t }; const p = t.pitchers.find((x) => x.id === id); if (p) return { p, t }; }
    return null;
  }
  function howReal(g) {
    const lines = [];
    [0, 1].forEach((si) => {
      const t = S.teams[si];
      const bats = Object.entries(g.box).filter(([, b]) => b.si === si && b.ab + b.bb >= 3).sort((a, b) => (b[1].h + b[1].hr * 2 + b[1].rbi) - (a[1].h + a[1].hr * 2 + a[1].rbi)).slice(0, 2);
      bats.forEach(([id, b]) => {
        const fp = findPlayer(id); if (!fp || !fp.b) return; const pl = fp.b;
        const pa = pl.pa || 1; const hrEvery = pl.hrN ? (pa / pl.hrN).toFixed(1) : null;
        lines.push(`<li><b>${esc(b.n)}</b>: ${b.h}-for-${b.ab}${b.hr ? ', ' + b.hr + ' HR' : ''}${b.rbi ? ', ' + b.rbi + ' RBI' : ''}. ${t.custom ? 'Across ' + pl.yrs : 'In ' + t.y} he hit ${f3(pl.avg)}${hrEvery ? ' with a homer every ' + hrEvery + ' plate appearances' : ''}.</li>`);
      });
      const sp = Object.entries(g.pbox).filter(([, p]) => p.si === si).sort((a, b) => a[1].order - b[1].order)[0];
      if (sp) {
        const fp = findPlayer(sp[0]); const p = sp[1];
        if (fp && fp.p) { const pl = fp.p; const k9 = pl.ip ? (pl.so / pl.ip * 9).toFixed(1) : '—'; lines.push(`<li><b>${esc(p.n)}</b>: ${E.boxIP(p.outs)} IP, ${p.er} ER, ${p.so} K. ${t.custom ? 'Across ' + pl.yrs : 'In ' + t.y}: ${f2(pl.era)} ERA, ${k9} strikeouts per 9 innings.</li>`); }
      }
      if (!t.custom && t.R && t.G) lines.push(`<li>The ${esc(t.short)} scored ${g.score[si]}. They averaged ${(t.R / t.G).toFixed(1)} runs a game in ${t.y}.</li>`);
    });
    return lines.join('');
  }
  function finalHTML() {
    const g = S.game; const [A, H] = S.teams; const w = g.winner;
    const p = pog(g);
    const head = g.tie ? 'Called after 25 innings — a tie.' : `${esc(teamTitle(S.teams[w]))} win${userSide() !== null ? (w === userSide() ? ' — you outcoached the AI.' : ' — the AI coach takes this one.') : '.'}`;
    let pogLine = '';
    if (p) {
      if (p.kind === 'bat') { const b = p.b; pogLine = `${esc(b.n)}: ${b.h}-for-${b.ab}${b.hr ? ', ' + b.hr + ' HR' : ''}${b.rbi ? ', ' + b.rbi + ' RBI' : ''}${b.r ? ', ' + b.r + ' R' : ''}`; }
      else { const q = p.p; pogLine = `${esc(q.n)}: ${E.boxIP(q.outs)} IP, ${q.h} H, ${q.er} ER, ${q.so} K`; }
    }
    return `<section class="card final">
      <div class="score"><span style="color:var(--away)">${g.score[0]}</span> – <span style="color:var(--home)">${g.score[1]}</span></div>
      <p style="margin-top:6px"><b>${head}</b></p>
      <p class="note">${teamTitle(A)} at ${teamTitle(H)}${g.inning > 9 ? ' · ' + g.inning + ' innings' : ''}</p>
      ${pogLine ? `<p style="margin-top:10px"><span class="badge b-gold">Player of the game</span> ${pogLine}</p>` : ''}
    </section>
    <section class="card" style="margin-top:12px"><h3>How real was that?</h3><ul class="list">${howReal(g)}</ul>
      <p class="note" style="margin-top:8px">One game is a small sample. Over many games, each player's numbers line up with his real season.</p></section>`;
  }
  function bindFinal() { /* actions live in the dock */ }

  /* --- field drawing --- */
  const SPOT = { 0: [150, 166], 1: [150, 229], 2: [207, 150], 3: [181, 117], 4: [93, 150], 5: [119, 117], 6: [68, 74], 7: [150, 44], 8: [232, 74] };
  const BASE = [[205, 160], [150, 106], [95, 160]];
  const HOME = [150, 214];
  function buildField() {
    $('#fieldWrap').innerHTML = `<svg class="field" viewBox="0 0 300 240" role="img" aria-label="Baseball field showing fielders and runners">
      <defs><radialGradient id="grass" cx="50%" cy="85%" r="85%"><stop offset="0" stop-color="#1f6b3d"/><stop offset="1" stop-color="#11402a"/></radialGradient></defs>
      <path d="M150 226 L 10 86 A 198 198 0 0 1 290 86 Z" fill="url(#grass)" stroke="#e9e3cf" stroke-opacity="0.5" stroke-width="1.2"/>
      <path d="M10 86 A 198 198 0 0 1 290 86" fill="none" stroke="#6b4a2e" stroke-width="5"/>
      <path d="M150 214 L 214 152 A 92 92 0 0 0 86 152 Z" fill="#b9814f" opacity="0.92"/>
      <path d="M150 196 L 194 160 L 150 118 L 106 160 Z" fill="#2b7a47"/>
      <circle cx="150" cy="163" r="9" fill="#b9814f"/>
      <line x1="150" y1="214" x2="10" y2="86" stroke="#f2eee1" stroke-width="1" opacity="0.8"/><line x1="150" y1="214" x2="290" y2="86" stroke="#f2eee1" stroke-width="1" opacity="0.8"/>
      ${BASE.map(([x, y], i) => `<rect id="base${i}" x="${x - 4}" y="${y - 4}" width="8" height="8" transform="rotate(45 ${x} ${y})" fill="#f2eee1"/>`).join('')}
      <path d="M146 212 h8 v3 l-4 3 l-4 -3 Z" fill="#f2eee1"/>
      <g id="fielders"></g><g id="runners"></g><g id="batterG"></g>
      <circle id="ball" cx="150" cy="212" r="2.6" fill="#ffffff" opacity="0"/>
    </svg>`;
  }
  function updateField() {
    const g = S.game; if (!$('#fielders')) return;
    const d = E.def(g); const o = E.off(g);
    const dcol = d.si ? 'var(--home)' : 'var(--away)'; const ocol = o.si ? 'var(--home)' : 'var(--away)';
    let fh = '';
    if (!g.over) {
      d.lineup.forEach((x) => { if (x.pos >= 1 && x.pos <= 8) { const [cx, cy] = SPOT[x.pos]; const ty = x.pos === 1 ? cy + 3 : cy - 8; const tx = x.pos === 1 ? cx + 9 : cx; fh += `<g class="fielder"><circle cx="${cx}" cy="${cy}" r="5" fill="${dcol}" stroke="#08130d" stroke-width="1.2"/><text x="${tx}" y="${ty}" text-anchor="${x.pos === 1 ? 'start' : 'middle'}" fill="#f2eee1">${esc(x.b.ln)}</text></g>`; } });
      const [px, py] = SPOT[0]; fh += `<g class="fielder"><circle cx="${px}" cy="${py}" r="5" fill="${dcol}" stroke="#08130d" stroke-width="1.2"/><text x="${px}" y="${py - 8}" text-anchor="middle" fill="#f2eee1">${esc(d.pstate.p.ln)}</text></g>`;
    }
    $('#fielders').innerHTML = fh;
    // runners as persistent elements so they animate between bases
    const rg = $('#runners'); const present = new Set();
    g.bases.forEach((r, i) => {
      if (!r) return; present.add(r.id);
      let el = rg.querySelector(`[data-id="${CSS.escape(r.id)}"]`);
      const [x, y] = BASE[i];
      if (!el) {
        el = document.createElementNS('http://www.w3.org/2000/svg', 'g'); el.setAttribute('class', 'runner'); el.dataset.id = r.id;
        el.innerHTML = `<circle r="5.5" fill="${ocol}" stroke="#f2eee1" stroke-width="1.4"/><text y="-8" text-anchor="middle" fill="#f2eee1">${esc(r.ln)}</text>`;
        el.style.transform = `translate(${HOME[0]}px, ${HOME[1]}px)`;
        rg.appendChild(el);
        requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transform = `translate(${x}px, ${y}px)`; }));
      } else el.style.transform = `translate(${x}px, ${y}px)`;
    });
    rg.querySelectorAll('.runner').forEach((el) => {
      if (!present.has(el.dataset.id)) {
        el.style.transform = `translate(${HOME[0]}px, ${HOME[1]}px)`; el.style.opacity = '0';
        setTimeout(() => el.remove(), 1000);
      }
    });
    BASE.forEach((_, i) => { const b = $('#base' + i); if (b) b.setAttribute('fill', g.bases[i] ? '#f4b63e' : '#f2eee1'); });
    const bg = $('#batterG');
    if (!g.over) { const b = E.batter(g).b; const left = b.b === 'L'; const bx = left ? 160 : 140; bg.innerHTML = `<circle cx="${bx}" cy="213" r="5" fill="${ocol}" stroke="#f2eee1" stroke-width="1.4"/><text x="${left ? bx + 8 : bx - 8}" y="216" text-anchor="${left ? 'start' : 'end'}" fill="#f2eee1" style="font-size:8.5px;font-weight:700;paint-order:stroke;stroke:rgba(0,0,0,.75);stroke-width:2.4px">${esc(b.ln)}</text>`; }
    else bg.innerHTML = '';
  }
  function animateBall(res) {
    const ball = $('#ball'); if (!ball || !ball.animate) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = res.type; let to = null;
    const rnd = (a, b) => a + Math.random() * (b - a);
    if (t === 'hr') to = [rnd(40, 260), rnd(4, 20)];
    else if (t === 'hit') { const deep = /double|triple|wall|gap|corner/i.test(res.text); to = deep ? [rnd(30, 270), rnd(50, 80)] : [rnd(70, 230), rnd(90, 140)]; }
    else if (t === 'out' || t === 'dp' || t === 'sac' || t === 'err') {
      if (/flies|fly|corn|lifts|Sacrifice fly/i.test(res.text)) { const s = SPOT[[6, 7, 8][Math.floor(Math.random() * 3)]]; to = [s[0], s[1]]; }
      else { const s = SPOT[[2, 3, 4, 5, 0][Math.floor(Math.random() * 5)]]; to = [s[0], s[1]]; }
    }
    if (!to) return;
    const dx = to[0] - 150, dy = to[1] - 212;
    ball.animate([{ transform: 'translate(0px,0px)', opacity: 1 }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - (t === 'hr' ? 40 : 18)}px)`, opacity: 1, offset: 0.5 }, { transform: `translate(${dx}px, ${dy}px)`, opacity: t === 'hr' ? 0 : 1 }], { duration: t === 'hr' ? 1100 : 700, easing: 'ease-out' });
  }

  /* ---------------- router ---------------- */
  function render() {
    const hero = document.getElementById('hero'); if (hero) hero.classList.toggle('off', !(S.screen === 'home' || S.screen === 'setup'));
    if (S.screen === 'home') renderHome();
    else if (S.screen === 'setup') renderSetup();
    else if (S.screen === 'pregame') renderPregame();
    else if (S.screen === 'game') renderGame();
    window.scrollTo(0, 0);
  }

  loadIndex().then(() => render()).catch(() => { app.innerHTML = '<p>Could not load the stats files. Refresh to try again.</p>'; });
})();
