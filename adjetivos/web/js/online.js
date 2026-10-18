// Online duels between two phones, using PeerJS (js/vendor/peerjs.min.js).
//
// One phone hosts a room named by a short code; the other joins with it.
// PeerJS's free public server only introduces the two phones — after that
// they talk directly (or through PeerJS's relay on networks that block it).
//
// The host runs the match: it deals each round and decides who scored. Each
// phone times its own tap from the moment the word appeared, so the faster
// right answer wins the point however slow the connection is.

const ONLINE = {
  // Tests point this at a local PeerJS server; null means PeerJS's cloud.
  server: window.ONLINE_SERVER || null,
  prefix: 'adjetivos-duel-',
  target: window.ONLINE_TARGET || 7,
  grace: 400, // ms to wait for the other phone's answer after a right one arrives
  roundTimeout: 12000,
};
const ROOM_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newRoomCode = () => Array.from({ length: 5 }, () => ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)]).join('');

function makePeer(id) {
  const opts = { debug: 0, ...(ONLINE.server || {}) };
  return id ? new Peer(id, opts) : new Peer(opts);
}

function openOnline() {
  if (!window.Peer) { toast('Online play isn’t available here'); return; }
  const host = App.openOverlay('online');
  const screen = h('div', { class: 'flash online' });
  host.replaceChildren(screen);

  let peer = null, conn = null, match = null;
  const timers = new Set();
  const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const stopTimers = () => { timers.forEach(clearTimeout); timers.clear(); };
  const hangUp = () => {
    stopTimers();
    match = null;
    try { if (conn) conn.close(); } catch (e) { /* already closed */ }
    try { if (peer) peer.destroy(); } catch (e) { /* already gone */ }
    conn = peer = null;
  };
  App.overlayCleanup = hangUp;

  const myName = () => (Store.s.playerName || '').trim() || 'Player';
  const top = (title) => h('div', { class: 'flash-top' },
    h('button', { class: 'icon-btn', onclick: () => openFriends() }, '✕'),
    h('div', { class: 'flash-count' }, title),
    h('span', {}));
  const show = (...kids) => screen.replaceChildren(...kids.filter(Boolean));

  // ---------------------------------------------------------------- lobby
  const lobby = () => {
    hangUp();
    App.overlayCleanup = hangUp;
    const name = h('input', { class: 'search', placeholder: 'Your name', maxlength: '14', value: Store.s.playerName || '' });
    name.addEventListener('change', () => { Store.s.playerName = name.value.trim(); Store.save(); });
    const code = h('input', { class: 'search code-input', placeholder: 'Room code', maxlength: '5', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' });
    const join = () => {
      Store.s.playerName = name.value.trim();
      Store.save();
      const c = code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c.length !== 5) { toast('Room codes have 5 letters and numbers'); return; }
      joinRoom(c);
    };
    code.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
    show(top('🌐 Play online'),
      h('div', { class: 'card friends-option' }, h('div', { class: 'fo-emoji' }, '🙂'),
        h('div', {}, h('b', {}, 'Your name'), h('span', {}, 'So your friend knows who they’re playing.'), name)),
      h('div', { class: 'card friends-option' }, h('div', { class: 'fo-emoji' }, '🏠'),
        h('div', {}, h('b', {}, 'Make a room'), h('span', {}, 'You get a code. Send it to your friend.'),
          h('button', { class: 'btn primary', onclick: () => { Store.s.playerName = name.value.trim(); Store.save(); hostRoom(); } }, 'Make a room'))),
      h('div', { class: 'card friends-option' }, h('div', { class: 'fo-emoji' }, '🔑'),
        h('div', {}, h('b', {}, 'Join a room'), h('span', {}, 'Type the code from your friend’s screen.'), code,
          h('button', { class: 'btn primary', onclick: join }, 'Join'))),
      h('div', { class: 'online-note' }, 'Needs internet on both phones. First to tap the right Spanish word wins the point — first to 7 wins.'));
  };

  const problem = (msg) => {
    hangUp();
    show(top('🌐 Play online'),
      h('div', { class: 'online-wait' }, h('div', { class: 'ow-emoji' }, '😕'), h('b', {}, msg)),
      h('button', { class: 'btn primary', onclick: lobby }, 'Back'));
  };
  const peerError = (err) => {
    const type = err && err.type;
    if (type === 'peer-unavailable') return problem('No room with that code. Check it, and that your friend’s room screen is still open.');
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') return problem('Can’t reach the game server. Check your internet and try again.');
    if (type === 'browser-incompatible') return problem('This phone can’t play online.');
    return problem('Something went wrong connecting. Try again.');
  };

  // ---------------------------------------------------------------- connecting
  const hostRoom = (tries = 0) => {
    hangUp();
    App.overlayCleanup = hangUp;
    const code = newRoomCode();
    show(top('🌐 Your room'), h('div', { class: 'online-wait' }, h('div', { class: 'ow-emoji' }, '⏳'), h('b', {}, 'Making a room…')));
    peer = makePeer(ONLINE.prefix + code);
    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && tries < 3) return hostRoom(tries + 1);
      peerError(err);
    });
    peer.on('open', () => {
      show(top('🌐 Your room'),
        h('div', { class: 'online-wait' },
          h('span', {}, 'Your room code'),
          h('div', { class: 'room-code' }, code),
          h('button', { class: 'btn share', onclick: () => Share.send(`⚔️ Play Adjetivos with me online! Room code: ${code}\nOpen Adjetivos → 👥 Play with friends → 🌐 Play online → Join.`) }, '📤 Send the code'),
          h('div', { class: 'ow-emoji pulse' }, '📡'),
          h('span', {}, 'Waiting for your friend to join…')));
    });
    peer.on('connection', (c) => {
      if (conn) { c.on('open', () => c.close()); return; } // room is full
      conn = c;
      wire(c, true);
    });
  };

  const joinRoom = (code) => {
    hangUp();
    App.overlayCleanup = hangUp;
    show(top('🌐 Joining'), h('div', { class: 'online-wait' }, h('div', { class: 'ow-emoji pulse' }, '📡'), h('b', {}, `Joining room ${code}…`)));
    peer = makePeer();
    peer.on('error', peerError);
    peer.on('open', () => {
      conn = peer.connect(ONLINE.prefix + code, { reliable: true });
      wire(conn, false);
      later(20000, () => { if (match && !match.connected) problem('Couldn’t connect to that room. Try again, or make your own room.'); });
    });
  };

  // Both phones: hook a data connection up to a new match. The match exists
  // before the connection opens, so a message that beats our own "open"
  // event is still handled.
  const wire = (c, isHost) => {
    match = newMatch(isHost, (msg) => { try { c.send(msg); } catch (e) { /* closed */ } });
    // The very first message on a new connection can go missing, so keep
    // saying hello until the other phone confirms it has heard us.
    c.on('open', () => {
      const m = match;
      const greet = () => {
        if (!m || match !== m || (m.connected && m.heard)) return;
        m.send({ t: 'hello', name: myName(), heard: m.connected });
        later(700, greet);
      };
      greet();
    });
    c.on('data', (msg) => { if (match && msg && typeof msg === 'object') match.receive(msg); });
    c.on('close', () => { if (match) match.left(); });
    c.on('error', () => { if (match) match.left(); });
  };

  // ---------------------------------------------------------------- the match
  const newMatch = (isHost, send) => {
    const m = {
      send,
      them: 'Friend',
      scores: { me: 0, them: 0 },
      round: null, // { n, word, options, shownAt, picked }
      n: 0,
      over: false,
      rematch: { me: false, them: false },
      answers: null, graceId: null, timeoutId: null, resolved: true,
    };
    const scoreBar = h('div', { class: 'online-scores' });
    const prompt = h('div', { class: 'duel-prompt' });
    const opts = h('div', { class: 'duel-opts' });
    const status = h('div', { class: 'online-status' });
    const drawScores = () => scoreBar.replaceChildren(
      h('div', { class: 'os-me' }, h('small', {}, myName()), h('b', {}, m.scores.me)),
      h('span', { class: 'vs-mid' }, 'VS'),
      h('div', { class: 'os-them' }, h('small', {}, m.them), h('b', {}, m.scores.them)));
    const gameScreen = () => {
      drawScores();
      show(top(`🌐 vs ${m.them}`), scoreBar, h('div', { class: 'online-round' }, prompt, opts, status));
    };

    // -- shared rendering
    const startCountdown = () => {
      m.started = true;
      m.over = false;
      m.scores = { me: 0, them: 0 };
      m.rematch = { me: false, them: false };
      gameScreen();
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
      [m.graceId, m.timeoutId].forEach((id) => { if (id != null) { clearTimeout(id); timers.delete(id); } });
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
      if (champ) {
        later(1400, () => { m.send({ t: 'end', winner: flip[champ] }); showEnd(champ); });
      } else later(1700, hostNextRound);
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
          m.send({ t: 'hello', name: myName(), heard: true });
          if (isHost) hostStart();
          else if (!m.started) { gameScreen(); status.textContent = 'Connected! Get ready…'; }
          else drawScores();
          break;
        }
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
      if (!match) return;
      problem(m.connected ? `${m.them} left the game.` : 'Couldn’t connect to that room. Try again, or make your own room.');
    };
    return m;
  };

  lobby();
}
