// Online duels between two phones, using PeerJS (js/vendor/peerjs.min.js).
//
// Opening the Friends tab gives this phone a 5-letter code. A friend types it
// into their Friends tab and the two phones are connected: PeerJS's free
// public server only introduces them, then they talk directly (or through
// PeerJS's relay on networks that block that).
//
// The phone whose code was typed in (the host) runs the match: it deals each
// round and decides who scored. Each phone times its own tap from the moment
// the word appeared, so the faster right answer wins the point however slow
// the connection is.

const ONLINE = {
  // Tests point this at a local PeerJS server; null means PeerJS's cloud.
  server: window.ONLINE_SERVER || null,
  prefix: 'adjetivos-duel-',
  target: window.ONLINE_TARGET || 7,
  grace: 400, // ms to wait for the other phone's answer after a right one arrives
  roundTimeout: 12000,
  joinTimeout: 20000,
};
const ROOM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newRoomCode = () => Array.from({ length: 5 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join('');
const myName = () => (Store.s.playerName || '').trim() || 'Player';

const Online = {
  state: 'off', // off | starting | ready | error | unsupported
  code: null,
  peer: null,
  conn: null,
  match: null,
  timers: new Set(),
  ui: null, // the Friends tab's code box, while it is on screen

  later(ms, fn) {
    const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms);
    this.timers.add(id);
    return id;
  },
  clearLater(id) { if (id != null) { clearTimeout(id); this.timers.delete(id); } },

  // ---------------------------------------------------------------- this phone's code
  // Called whenever the Friends tab is shown; does nothing if already online.
  start(tries = 0) {
    if (!window.Peer) { this.set('unsupported'); return; }
    if (this.peer && !this.peer.destroyed && (this.state === 'ready' || this.state === 'starting')) return;
    if (this.peer) { try { this.peer.destroy(); } catch (e) { /* gone */ } }
    const code = newRoomCode();
    this.code = null;
    this.set('starting');
    const peer = new Peer(ONLINE.prefix + code, { debug: 0, ...(ONLINE.server || {}) });
    this.peer = peer;
    peer.on('open', () => { if (this.peer === peer) { this.code = code; this.set('ready'); } });
    peer.on('connection', (c) => { if (this.peer === peer) this.incoming(c); });
    peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) { try { peer.reconnect(); } catch (e) { /* retried on next visit */ } } });
    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      const type = err && err.type;
      if (type === 'unavailable-id' && tries < 3) return this.start(tries + 1);
      if (type === 'peer-unavailable') return this.problem('Nobody is using that code right now. Ask your friend to open their 👥 Friends tab and check the code.');
      if (type === 'browser-incompatible') return this.set('unsupported');
      if (this.match && this.match.connected) return; // the game carries on; a dropped call shows up as "left"
      this.set('error');
      if (this.match) this.problem('Can’t reach the game server. Check your internet and try again.');
    });
  },
  set(state) {
    this.state = state;
    if (this.ui) this.ui();
  },

  // ---------------------------------------------------------------- connecting
  join(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { toast('Codes have 5 letters and numbers'); return; }
    if (code === this.code) { toast('That’s your own code — send it to your friend instead'); return; }
    if (this.conn) return; // already connecting or playing
    if (this.state !== 'ready') { toast(this.state === 'error' ? 'You’re offline — check your internet' : 'Getting online… try again in a second'); this.start(); return; }
    const c = this.peer.connect(ONLINE.prefix + code, { reliable: true });
    this.begin(c, false, code);
    this.joinTimer = this.later(ONLINE.joinTimeout, () => {
      if (this.conn === c && !(this.match && this.match.connected)) this.problem('Couldn’t reach your friend. Make sure their 👥 Friends tab is open, then try again.');
    });
  },
  incoming(c) {
    // Busy in a game here (or already playing someone): turn them away politely.
    const free = !this.conn && !App.overlayKind && App.tab === 'friends';
    // Both typed each other's code at once: keep the call started by the lower code.
    const crossed = this.conn && this.conn.peer === c.peer && !(this.match && this.match.connected);
    if (crossed && this.peer.id > c.peer) {
      const mine = this.conn;
      this.conn = null;
      this.match = null;
      try { mine.close(); } catch (e) { /* closed */ }
      this.begin(c, true);
      return;
    }
    if (!free) {
      // The first message on a new connection can go missing, so say it a few times.
      c.on('open', () => {
        const say = () => { try { c.send({ t: 'busy', name: myName() }); } catch (e) { /* closed */ } };
        [0, 300, 700].forEach((ms) => setTimeout(say, ms));
        setTimeout(() => c.close(), 1500);
      });
      return;
    }
    this.begin(c, true);
  },

  // Opens the game screen and hooks the connection up to a new match. The
  // match exists before the connection opens, so a message that beats our own
  // "open" event is still handled.
  begin(c, isHost, code) {
    // Opening the game screen hangs up whatever was on screen before, so
    // only adopt the new connection after that.
    const host = App.openOverlay('online');
    this.conn = c;
    App.overlayCleanup = () => this.hangUp();
    const match = newMatch(isHost, host, (msg) => { try { c.send(msg); } catch (e) { /* closed */ } });
    this.match = match;
    match.waiting(isHost ? 'Your friend is joining…' : `Connecting to ${code}…`);
    c.on('open', () => {
      // The very first message on a new connection can go missing, so keep
      // saying hello until the other phone confirms it has heard us.
      const greet = () => {
        if (this.match !== match || (match.connected && match.heard)) return;
        match.send({ t: 'hello', name: myName(), heard: !!match.connected });
        this.later(700, greet);
      };
      greet();
    });
    c.on('data', (msg) => { if (this.conn === c && this.match === match && msg && typeof msg === 'object') match.receive(msg); });
    c.on('close', () => { if (this.conn === c && this.match === match) match.left(); });
    c.on('error', () => { if (this.conn === c && this.match === match) match.left(); });
  },

  // Ends the current game but stays online with the same code.
  hangUp() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    const c = this.conn;
    this.conn = null;
    this.match = null;
    try { if (c) c.close(); } catch (e) { /* closed */ }
  },

  // A message in place of the game, with a way back to the Friends tab.
  problem(msg) {
    this.hangUp();
    if (App.overlayKind !== 'online') { toast(msg, 4000); return; }
    const host = $('#overlay');
    host.replaceChildren(h('div', { class: 'flash online' },
      h('div', { class: 'online-wait' }, h('div', { class: 'ow-emoji' }, '😕'), h('b', {}, msg)),
      h('button', { class: 'btn primary', onclick: () => openFriends() }, 'Back')));
  },
};

// ---------------------------------------------------------------- the match
function newMatch(isHost, host, send) {
  const later = (ms, fn) => Online.later(ms, () => { if (Online.match === m) fn(); });
  const m = {
    send,
    them: 'Friend',
    scores: { me: 0, them: 0 },
    round: null, // { n, word, shownAt, picked }
    n: 0,
    over: false,
    rematch: { me: false, them: false },
    answers: null, graceId: null, timeoutId: null, resolved: true,
  };
  const scoreBar = h('div', { class: 'online-scores' });
  const prompt = h('div', { class: 'duel-prompt' });
  const opts = h('div', { class: 'duel-opts' });
  const status = h('div', { class: 'online-status' });
  const title = h('div', { class: 'flash-count' }, '🌐 Online');
  host.replaceChildren(h('div', { class: 'flash online' },
    h('div', { class: 'flash-top' }, h('button', { class: 'icon-btn', onclick: () => openFriends() }, '✕'), title, h('span', {})),
    scoreBar, h('div', { class: 'online-round' }, prompt, opts, status)));
  const drawScores = () => {
    title.textContent = `🌐 vs ${m.them}`;
    scoreBar.replaceChildren(
      h('div', { class: 'os-me' }, h('small', {}, myName()), h('b', {}, m.scores.me)),
      h('span', { class: 'vs-mid' }, 'VS'),
      h('div', { class: 'os-them' }, h('small', {}, m.them), h('b', {}, m.scores.them)));
  };
  m.waiting = (text) => {
    drawScores();
    prompt.replaceChildren(h('span', { class: 'dp-emoji pulse' }, '📡'));
    status.textContent = text;
  };

  // -- shared rendering
  const startCountdown = () => {
    m.started = true;
    m.over = false;
    m.scores = { me: 0, them: 0 };
    m.rematch = { me: false, them: false };
    drawScores();
    opts.replaceChildren();
    let k = 3;
    const tick = () => {
      prompt.replaceChildren(h('span', { class: 'countdown' }, k > 0 ? String(k) : '¡Ya!'));
      status.textContent = `First to ${ONLINE.target} wins`;
      Sfx.tick();
      if (k-- > 0) later(800, tick);
      else if (isHost) later(500, hostNextRound);
    };
    tick();
  };
  const showRound = (n, wordId, optionIds) => {
    const word = WORD_BY_ID[wordId];
    m.round = { n, word, picked: null, shownAt: performance.now() };
    prompt.replaceChildren(h('span', { class: 'dp-emoji' }, word.e), h('span', {}, word.short));
    status.textContent = 'Tap the Spanish word!';
    opts.replaceChildren(...shuffle(optionIds.map((id) => WORD_BY_ID[id])).map((o) => {
      const b = h('button', { class: 'duel-opt' }, o.m);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); pick(o, b); });
      return b;
    }));
  };
  const pick = (o, b) => {
    const r = m.round;
    if (!r || r.picked || m.over) return;
    r.picked = o.id;
    const ms = Math.round(performance.now() - r.shownAt);
    b.classList.add('chosen');
    status.textContent = 'Waiting…';
    Sfx.tap();
    if (isHost) hostAnswer('me', r.n, o.id, ms);
    else m.send({ t: 'answer', n: r.n, id: o.id, ms });
  };
  const showResult = (wordId, winner) => {
    const word = WORD_BY_ID[wordId];
    [...opts.children].forEach((b) => {
      if (b.textContent === word.m) b.classList.add('right');
      else if (b.classList.contains('chosen')) b.classList.add('wrong');
    });
    drawScores();
    if (winner === 'me') { status.textContent = '¡Punto! Point to you 🎉'; Sfx.good(m.scores.me); Haptics.buzz(30); }
    else if (winner === 'them') { status.textContent = `Point to ${m.them}`; Sfx.bad(); }
    else { status.textContent = 'Nobody got it'; }
    Voice.say(word.m);
  };
  const showEnd = (winner) => {
    m.over = true;
    const won = winner === 'me';
    if (won) { Sfx.win(); App.confetti(host); } else Sfx.lose();
    prompt.replaceChildren(h('span', { class: 'dp-emoji' }, won ? '🏆' : '😅'), h('span', {}, won ? '¡Ganaste! You win!' : `${m.them} wins!`));
    status.textContent = '';
    opts.replaceChildren(
      h('button', { class: 'btn primary', onclick: (e) => askRematch(e.currentTarget) }, '↻ Rematch'),
      h('button', { class: 'btn ghost', onclick: () => openFriends() }, 'Leave'));
  };
  const askRematch = (btn) => {
    m.rematch.me = true;
    btn.disabled = true;
    btn.textContent = `Waiting for ${m.them}…`;
    m.send({ t: 'rematch' });
    if (isHost && m.rematch.them) hostStart();
  };

  // -- host only: deal rounds and decide who scored
  const hostStart = () => { m.send({ t: 'start' }); startCountdown(); };
  const hostNextRound = () => {
    if (m.over) return;
    const last = m.round && m.round.word;
    let w;
    do { w = pickWords(1)[0]; } while (last && w.id === last.id);
    const options = [w, ...distractors(w, 3)].map((x) => x.id);
    m.n++;
    m.answers = {};
    m.resolved = false;
    m.send({ t: 'round', n: m.n, word: w.id, options });
    showRound(m.n, w.id, options);
    m.timeoutId = later(ONLINE.roundTimeout, hostResolve);
  };
  const hostAnswer = (who, n, id, ms) => {
    if (m.resolved || n !== m.n || m.answers[who]) return;
    m.answers[who] = { ok: id === m.round.word.id, ms: Number(ms) || 0 };
    if (m.answers.me && m.answers.them) return hostResolve();
    if (m.answers[who].ok && m.graceId == null) m.graceId = later(ONLINE.grace, hostResolve);
  };
  const hostResolve = () => {
    if (m.resolved) return;
    m.resolved = true;
    Online.clearLater(m.graceId);
    Online.clearLater(m.timeoutId);
    m.graceId = m.timeoutId = null;
    const right = ['me', 'them'].filter((who) => m.answers[who] && m.answers[who].ok);
    right.sort((a, b) => m.answers[a].ms - m.answers[b].ms);
    const winner = right[0] || null;
    if (winner) m.scores[winner]++;
    // To the guest, "me" and "them" are the other way round.
    const flip = { me: 'them', them: 'me' };
    m.send({ t: 'result', n: m.n, word: m.round.word.id, winner: winner && flip[winner], scores: { me: m.scores.them, them: m.scores.me } });
    showResult(m.round.word.id, winner);
    const champ = ['me', 'them'].find((who) => m.scores[who] >= ONLINE.target);
    if (champ) later(1400, () => { m.send({ t: 'end', winner: flip[champ] }); showEnd(champ); });
    else later(1700, hostNextRound);
  };

  // -- messages from the other phone
  m.receive = (msg) => {
    switch (msg.t) {
      case 'hello': {
        if (msg.heard) m.heard = true;
        const first = !m.connected;
        m.connected = true;
        m.them = String(msg.name || 'Friend').slice(0, 14);
        if (!first) { if (!msg.heard) m.send({ t: 'hello', name: myName(), heard: true }); break; }
        Online.clearLater(Online.joinTimer);
        m.send({ t: 'hello', name: myName(), heard: true });
        if (isHost) hostStart();
        else if (!m.started) { drawScores(); status.textContent = 'Connected! Get ready…'; }
        else drawScores();
        break;
      }
      case 'busy':
        Online.problem(`${String(msg.name || 'Your friend').slice(0, 14)} is busy right now. Ask them to open their 👥 Friends tab, then try again.`);
        break;
      case 'start': if (!isHost) startCountdown(); break;
      case 'round': if (!isHost && WORD_BY_ID[msg.word]) showRound(msg.n, msg.word, msg.options.filter((id) => WORD_BY_ID[id])); break;
      case 'answer': if (isHost) hostAnswer('them', msg.n, msg.id, msg.ms); break;
      case 'result':
        if (!isHost && msg.scores && WORD_BY_ID[msg.word]) { m.scores = { me: msg.scores.me | 0, them: msg.scores.them | 0 }; showResult(msg.word, msg.winner); }
        break;
      case 'end': if (!isHost) showEnd(msg.winner); break;
      case 'rematch':
        m.rematch.them = true;
        if (isHost && m.rematch.me) hostStart();
        else if (m.over) status.textContent = `${m.them} wants a rematch!`;
        break;
      default: break;
    }
  };
  m.left = () => {
    Online.problem(m.connected ? `${m.them} left the game.` : 'Couldn’t reach your friend. Make sure their 👥 Friends tab is open, then try again.');
  };
  return m;
}
