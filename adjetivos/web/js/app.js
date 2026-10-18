// Screens, navigation and the Android back button.

const App = {
  tab: 'learn',
  session: null,
  overlayKind: null, // 'game' | 'results' | 'cards' | 'duel' | 'online' | 'lesson' | 'tips' | null
  overlayCleanup: null,
  lastGame: null,

  init() {
    Store.load();
    Voice.init();
    Account.init();
    // A sync in the background can bring in progress from another phone.
    window.onAccountChanged = () => { if (!this.overlayKind && ['me', 'play', 'learn'].includes(this.tab)) this.refresh(); };
    document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => this.show(b.dataset.tab)));
    // Browsers only allow audio after a user gesture.
    document.addEventListener('pointerdown', () => Sfx.ensure(), { once: true });
    window.appBack = () => this.back();
    // The Android side calls this after the player comes back from installing a voice.
    window.onVoicesChanged = () => { if (!this.overlayKind) this.refresh(); };
    this.show('learn');
    // The speech engine starts up asynchronously; redraw once it has answered.
    if (Voice.state() === 'init') {
      let tries = 0;
      const wait = setInterval(() => {
        if (Voice.state() !== 'init' || ++tries > 20) {
          clearInterval(wait);
          if (!this.overlayKind && ['learn', 'play', 'me'].includes(this.tab)) this.refresh();
        }
      }, 500);
    }
  },

  show(tab) {
    Sfx.tap();
    this.tab = tab;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const view = $('#view');
    view.scrollTop = 0;
    const render = { learn: renderPath, play: renderPlay, friends: renderFriends, words: renderWords, me: renderMe }[tab];
    view.replaceChildren(render());
    if (tab === 'learn') scrollToCurrent(view);
  },

  refresh() { this.show(this.tab); },

  openOverlay(kind) {
    if (this.overlayCleanup) { this.overlayCleanup(); this.overlayCleanup = null; }
    this.overlayKind = kind;
    const o = $('#overlay');
    o.classList.add('open');
    return o;
  },
  closeOverlay() {
    if (this.overlayCleanup) { this.overlayCleanup(); this.overlayCleanup = null; }
    this.overlayKind = null;
    const o = $('#overlay');
    o.classList.remove('open');
    o.replaceChildren();
    this.refresh();
  },

  // challenge: { seed, target } to play a friend's challenge code.
  startGame(game, challenge = null) {
    this.lastGame = game;
    const levelBefore = Store.level().lvl;
    const host = this.openOverlay('game');
    if (challenge) Challenge.begin({ game, ...challenge });
    this.session = new Session(game, host, (result) => {
      this.session = null;
      Challenge.end();
      if (!result) return this.closeOverlay();
      result.levelUp = Store.level().lvl > levelBefore ? Store.level().lvl : null;
      result.challenge = challenge;
      this.showResults(result);
    });
    try {
      game.play(this.session);
    } catch (e) {
      console.error(e);
      this.session.quit();
      toast('Something went wrong starting that game');
    }
  },

  showResults(r) {
    const host = this.openOverlay('results');
    const total = r.right + r.wrong;
    const face = r.stars >= 3 ? '🏆' : r.stars === 2 ? '🎉' : r.stars === 1 ? '👍' : '💪';
    const head = r.stars >= 3 ? '¡Increíble!' : r.stars === 2 ? '¡Muy bien!' : r.stars === 1 ? '¡Bien hecho!' : '¡Sigue practicando!';
    const stars = h('div', { class: 'res-stars' }, ...[0, 1, 2].map((k) => h('span', { class: 'star' + (k < r.stars ? ' on' : ''), style: { animationDelay: 0.3 + k * 0.25 + 's' } }, '★')));
    const missed = r.missed.length
      ? h('div', { class: 'res-missed' }, h('h3', {}, 'Words to review'),
        ...r.missed.slice(0, 8).map((w) => h('button', { class: 'res-word', onclick: () => Voice.say(w.m, true) },
          h('span', { class: 'rw-e' }, w.e), h('span', { class: 'rw-es' }, w.inv ? w.m : `${w.m} / ${w.f}`), h('span', { class: 'rw-en' }, w.short), h('span', { class: 'rw-say' }, '🔊'))))
      : h('div', { class: 'res-perfect' }, '✨ No mistakes — perfecto!');
    host.replaceChildren(h('div', { class: 'results', style: { '--g1': r.game.colors[0], '--g2': r.game.colors[1] } },
      h('div', { class: 'res-face' }, face),
      h('div', { class: 'res-head' }, head),
      h('div', { class: 'res-game' }, `${r.game.emoji} ${r.game.name}`),
      stars,
      h('div', { class: 'res-score' }, h('small', {}, 'Score'), h('b', {}, r.score)),
      r.newBest && r.prevBest ? h('div', { class: 'badge-new' }, '🎖 New best!') : null,
      r.levelUp ? h('div', { class: 'badge-new level' }, `⬆️ Level ${r.levelUp}!`) : null,
      h('div', { class: 'res-chips' },
        h('div', { class: 'chip' }, h('b', {}, '+' + r.xp), ' XP'),
        h('div', { class: 'chip' }, h('b', {}, total ? Math.round(r.acc * 100) + '%' : '—'), ' accuracy'),
        h('div', { class: 'chip' }, h('b', {}, '×' + r.bestCombo), ' best streak')),
      missed,
      r.challenge ? versusBox(r) : null,
      r.challenge
        ? h('button', { class: 'btn share', onclick: () => Share.send(challengeText(r, r.challenge.seed, true)) }, '📤 Send my score back')
        : h('button', { class: 'btn share', onclick: () => Share.send(challengeText(r, Challenge.newSeed(), false)) }, '📤 Challenge a friend'),
      h('div', { class: 'res-btns' },
        h('button', { class: 'btn ghost', onclick: () => this.closeOverlay() }, 'Menu'),
        h('button', { class: 'btn primary', onclick: () => this.startGame(r.game) }, '↻ Play again')),
    ));
    if (r.stars >= 2) { Sfx.win(); this.confetti(host); } else Sfx.lose();
  },

  confetti(host) {
    const colors = ['#f472b6', '#facc15', '#34d399', '#60a5fa', '#a78bfa', '#fb923c'];
    for (let i = 0; i < 60; i++) {
      const c = h('div', { class: 'confetti' });
      c.style.left = rand(0, 100) + '%';
      c.style.background = pickOne(colors);
      c.style.animationDelay = rand(0, 0.6) + 's';
      c.style.animationDuration = rand(1.8, 3.2) + 's';
      c.style.setProperty('--r', rand(-720, 720) + 'deg');
      c.style.setProperty('--x', rand(-60, 60) + 'px');
      host.append(c);
      setTimeout(() => c.remove(), 4000);
    }
  },

  // Android back button. Returns true when handled, false to leave the app.
  back() {
    if (this.overlayKind === 'game' && this.session) { this.session.quit(); return true; }
    if (this.overlayKind === 'duel' || this.overlayKind === 'online') { openFriends(); return true; }
    if (this.overlayKind) { this.closeOverlay(); return true; }
    if (this.tab !== 'learn') { this.show('learn'); return true; }
    return false;
  },
};

// ------------------------------------------------------------------ sharing
const SHARE_LINES = [
  'Mi hermano es muy molesto 😤', 'Mi jefa es un poco mandona 👑', 'Mi primo es demasiado dormilón 🛌',
  'Mi vecino es muy chismoso 🗣️', 'Mi amiga es súper graciosa 😂', 'Mi gato es bastante perezoso 🦥',
];
// The message sent with a challenge code. reply: answering a friend's challenge.
function challengeText(r, seed, reply) {
  const code = Challenge.encode(r.game.id, seed, r.score);
  const stars = r.stars ? '⭐'.repeat(r.stars) + ' ' : '';
  const head = reply
    ? `${stars}I played your challenge and got ${r.score} in ${r.game.emoji} ${r.game.name}! Same words, your turn 😏`
    : `${stars}I scored ${r.score} in ${r.game.emoji} ${r.game.name} on Hablamos 🇪🇸\n“${pickOne(SHARE_LINES)}”\nBet you can't beat me 👀`;
  return `${head}\n\n🎯 Challenge code: ${code}\nOpen Hablamos → 👥 Friends → type the code.`;
}

// Who won a challenge, shown on the results screen.
function versusBox(r) {
  const them = r.challenge.target;
  if (them == null) return h('div', { class: 'versus' }, h('b', {}, 'Challenge played!'), h('span', {}, 'Send your score back so they can try to beat it.'));
  const verdict = r.score > them ? '🏆 You win!' : r.score < them ? '😅 They win this time' : '🤝 It\'s a draw!';
  return h('div', { class: 'versus' },
    h('div', { class: 'vs-row' },
      h('div', {}, h('small', {}, 'Friend'), h('b', {}, them)),
      h('span', { class: 'vs-mid' }, 'VS'),
      h('div', {}, h('small', {}, 'You'), h('b', {}, r.score))),
    h('div', { class: 'vs-verdict' }, verdict));
}
const INVITE_TEXT = '🇪🇸 Learning Spanish with Hablamos — a full course plus 21 mini games (bubble popping, word ninja, whack-a-word…). Free, no ads. Try it:';

// ------------------------------------------------------------------ Play tab
function starsRow(n) {
  return h('div', { class: 'stars-row' }, ...[0, 1, 2].map((k) => h('span', { class: k < n ? 'on' : '' }, '★')));
}

function wordOfTheDay() {
  const d = today();
  let seed = 0;
  for (const ch of d) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return WORDS[seed % WORDS.length];
}

// "Lesson 2" / "Review" for a lesson.
const lessonName = (l) => (l.kind === 'review' ? 'Unit review' : `Lesson ${l.n}`);

// ------------------------------------------------------------------ Learn tab: the course path
function goalCard() {
  const d = Store.data;
  const lv = Store.level();
  const goalPct = Math.min(1, d.daily.xp / DAILY_GOAL);
  return h('div', { class: 'card goal-card' },
    h('div', { class: 'ring', style: { '--p': goalPct } }, h('span', {}, goalPct >= 1 ? '✓' : Math.round(goalPct * 100) + '%')),
    h('div', { class: 'goal-text' }, h('b', {}, 'Daily goal'), h('span', {}, `${Math.min(d.daily.xp, DAILY_GOAL)} / ${DAILY_GOAL} XP today`),
      h('div', { class: 'xp-bar' }, h('i', { style: { width: (lv.into / lv.need) * 100 + '%' } })),
      h('small', {}, `${lv.need - lv.into} XP to level ${lv.lvl + 1}`)));
}

function topBar(hello, brand) {
  const lv = Store.level();
  const streak = Store.streakNow();
  return h('header', { class: 'top' },
    h('div', {}, h('div', { class: 'hello' }, hello), h('div', { class: 'brand' }, brand)),
    h('div', { class: 'top-pills' },
      h('div', { class: 'pill fire' + (streak ? ' lit' : '') }, '🔥 ' + streak),
      h('div', { class: 'pill' }, '⭐ Lv ' + lv.lvl)));
}

// Plays the games with one unit's words.
function playUnit(unit) {
  Store.s.pack = unit.id;
  Store.save();
  App.show('play');
}

// What the mountain looks like at height t (0 = bottom, 1 = top).
function zoneFor(t) {
  if (t < 0.3) return { name: 'meadow', edge: '#7c4a21', body: ['#3f7d2a', '#245c1d'], strata: '#173d12', sky: ['#1e3a8a', '#312e81'], decor: ['🌲', '🌳', '🌲', '🌼', '🍄', '🌲'], sky2: ['☁️', '🐦', '☁️'] };
  if (t < 0.58) return { name: 'rock', edge: '#6b5a4a', body: ['#6b6460', '#4a4542'], strata: '#2f2b29', sky: ['#312e81', '#3b0764'], decor: ['🪨', '🌲', '🛖', '🐐', '🪨', '🌲'], sky2: ['☁️', '🦅', '☁️'] };
  if (t < 0.84) return { name: 'cliffs', edge: '#cbd5e1', body: ['#57534e', '#3a3633'], strata: '#1c1917', sky: ['#1e1b4b', '#0f0a2e'], decor: ['🪨', '❄️', '🐐', '🪨', '⛺', '❄️'], sky2: ['🦅', '☁️', '✨'] };
  return { name: 'snow', edge: '#ffffff', body: ['#cbd5e1', '#94a3b8'], strata: '#64748b', sky: ['#0f0a2e', '#020617'], decor: ['❄️', '🐻‍❄️', '❄️', '🐧', '❄️', '⛄'], sky2: ['✨', '⭐', '✨'] };
}

// The ridge of one camp's slope: x across and y down, in % of its scene.
const ridgeX = (f) => 4 + 92 * f;
const ridgeY = (f) => 97 - 90 * f;

// One camp: the side of the mountain with its lessons along the edge,
// climbing north-east, and the camp sign below.
function campScene(unit, ui, next, height, firstIndex, all) {
  const lessons = unitLessons(unit);
  const n = lessons.length;
  const t = firstIndex / all.length;
  const z = zoneFor(t);
  const fAt = (k) => 0.1 + (0.8 * k) / Math.max(1, n - 1);
  const H = 128 * n + 60;

  // The mountain in an SVG stretched to the scene: body, rock layers, edge.
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
  const steps = 18;
  const ridge = Array.from({ length: steps + 1 }, (_, k) => {
    const f = k / steps;
    const jag = k % 3 === 1 ? 1.6 : k % 3 === 2 ? -1.1 : 0;
    return [ridgeX(f), ridgeY(f) + (k && k < steps ? jag : 0)];
  });
  const pts = (ps) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const shifted = (dy) => ridge.map(([x, y]) => [x, Math.min(100, y + dy)]);
  const svg = el('svg', { class: 'scene-svg', viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
  const gid = 'g' + unit.id;
  const defs = el('defs', {});
  const grad = el('linearGradient', { id: gid, x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.append(el('stop', { offset: '0', 'stop-color': z.body[0] }), el('stop', { offset: '1', 'stop-color': z.body[1] }));
  defs.append(grad);
  svg.append(defs,
    el('polygon', { points: pts([[0, 100], ...ridge, [100, 0], [100, 100]]), fill: `url(#${gid})` }),
    // Rock layers in the cliff face, so you see its edges.
    el('polygon', { points: pts([...shifted(16), ...shifted(19).reverse()]), fill: z.strata, opacity: '0.35' }),
    el('polygon', { points: pts([...shifted(34), ...shifted(36).reverse()]), fill: z.strata, opacity: '0.3' }),
    el('polygon', { points: pts([...shifted(55), ...shifted(58).reverse()]), fill: z.strata, opacity: '0.25' }),
    // The surface you walk on: dirt low down, snow up high.
    el('polygon', { points: pts([...ridge, ...shifted(z.name === 'snow' || z.name === 'cliffs' ? 4.5 : 3).reverse()]), fill: z.edge }));

  const items = [];
  const place = (f, cls, child, dy = 0, dx = 0) => items.push(h('div', { class: cls, style: { left: `calc(${ridgeX(f)}% + ${dx}px)`, top: `calc(${ridgeY(f)}% + ${dy}px)` } }, child));

  // Scenery in the mountain, clouds and birds in the sky.
  for (let k = 0; k < 6; k++) {
    const f = 0.12 + k * 0.15;
    const depth = 40 + ((k * 37 + ui * 13) % 4) * 26;
    if (ridgeY(f) + depth / (H / 100) < 96 && ridgeX(f) < 92) place(f, 'scene-decor', z.decor[(k + ui) % z.decor.length], depth, 18);
  }
  z.sky2.forEach((e, k) => items.push(h('div', { class: 'scene-sky', style: { left: 8 + k * 20 + '%', top: 8 + ((k * 23 + ui * 7) % 30) + '%' } }, e)));

  // Lessons on the edge.
  const heights = lessons.map((l) => lessonHeight(firstIndex + lessons.indexOf(l), all.length));
  lessons.forEach((l, k) => {
    const isDone = lessonDone(l.id);
    const open = lessonOpen(l);
    const current = next && next.id === l.id;
    const icon = !open ? '🔒' : l.kind === 'review' ? '🚩' : isDone ? '✓' : '★';
    const node = h('button', {
      class: 'path-node' + (isDone ? ' done' : '') + (current ? ' current' : '') + (!open ? ' locked' : '') + (l.kind === 'review' ? ' review' : ''),
      style: { '--u1': unit.color[0], '--u2': unit.color[1] },
      'data-lesson': l.id,
    },
    current ? h('span', { class: 'pn-start' }, lessonsDoneCount() ? 'CLIMB' : 'START HERE') : null,
    current ? h('span', { class: 'pn-climber' }, myClimber()) : null,
    h('span', { class: 'pn-icon' }, icon),
    h('span', { class: 'pn-label' }, `${lessonName(l)} · ${metres(heights[k])}`));
    node.addEventListener('click', () => {
      if (!open) { Sfx.bad(); toast('🔒 Climb the lessons below this one first — or tap “Jump here”'); return; }
      openLesson(l);
    });
    place(fAt(k), 'node-spot', node);
  });

  // Coins every 100 m and a chest at every real mountain, between the lessons.
  const fromH = firstIndex ? lessonHeight(firstIndex - 1, all.length) : 0;
  const hs = [fromH, ...heights], fs = [0.02, ...lessons.map((_, k) => fAt(k))];
  const fOf = (m) => { let k = 1; while (k < hs.length - 1 && hs[k] < m) k++; return fs[k - 1] + ((fs[k] - fs[k - 1]) * (m - hs[k - 1])) / Math.max(1, hs[k] - hs[k - 1]); };
  const climbed = Store.data.climbed || 0;
  for (let m = Math.floor(fromH / 100) * 100 + 100; m <= hs.at(-1); m += 100) {
    const lm = LANDMARKS.find(([, x]) => Math.floor(x / 100) * 100 === m);
    if (lm) continue;
    let f = fOf(m);
    if (fs.slice(1).some((x) => Math.abs(x - f) < 0.035)) f -= 0.04; // keep clear of a lesson
    place(f, 'trail-coin' + (m <= climbed ? ' got' : ''), '🪙', -16);
  }
  for (const [name, m, flag] of LANDMARKS.filter(([, x]) => x > fromH && x <= hs.at(-1))) {
    const got = m <= height;
    place(fOf(m), 'landmark' + (got ? ' reached' : ''), [h('span', { class: 'lm-pin' }, got ? '💰' : '🚩'),
      h('span', { class: 'lm-tag' }, got ? `Higher than ${name}! ${flag}` : `${name} ${flag} ${metres(m)} · 💰 ${CHEST_COINS} 🪙`)]);
  }

  const [done, total] = unitProgress(unit);
  const locked = !lessonOpen(lessons[0]);
  return h('section', { class: 'camp-stage' + (locked ? ' locked' : ''), style: { '--u1': unit.color[0], '--u2': unit.color[1], '--s1': z.sky[0], '--s2': z.sky[1] } },
    h('div', { class: 'scene', style: { height: H + 'px' } }, svg, ...items),
    h('div', { class: 'unit-head camp' },
      h('div', { class: 'uh-top' },
        h('div', { class: 'uh-text' }, h('small', {}, `Camp ${ui + 1} · ${metres(fromH)}`), h('b', {}, unit.title), h('span', {}, unit.sub)),
        h('div', { class: 'uh-emoji' }, unit.emoji)),
      h('div', { class: 'uh-bar' }, h('i', { style: { width: (done / total) * 100 + '%' } })),
      h('div', { class: 'uh-btns' },
        unitTips(unit).length ? h('button', { class: 'uh-btn', onclick: () => openTips(unit) }, '📖 Tips') : null,
        h('button', { class: 'uh-btn', onclick: () => openFlashcards(unit.items, unit.title) }, '🃏 Cards'),
        h('button', { class: 'uh-btn', onclick: () => playUnit(unit) }, '🎮 Games'),
        locked ? h('button', { class: 'uh-btn jump', onclick: () => openJump(unit) }, '⏩ Jump here') : null)));
}

function renderPath() {
  const next = nextLesson();
  const all = ALL_LESSONS();
  const height = myHeight();
  const d = Store.data;
  const goalPct = Math.min(1, d.daily.xp / DAILY_GOAL);
  const passed = LANDMARKS.filter(([, m]) => m <= height).at(-1);

  const cont = next
    ? h('button', { class: 'continue-hero', style: { '--u1': next.unit.color[0], '--u2': next.unit.color[1] }, onclick: () => openLesson(next) },
      h('span', { class: 'ch-emoji' }, next.unit.emoji),
      h('div', {}, h('small', {}, lessonsDoneCount() ? 'Keep climbing' : 'Start the climb'), h('b', {}, `${next.unit.title} · ${lessonName(next)}`)),
      h('span', { class: 'ch-go' }, '▶'))
    : h('div', { class: 'card done-all' }, '🏔️ You reached the summit of Monte Español! Keep practising with the games.');

  // From the bottom up: base camp, one scene per camp, the summit.
  const climb = [h('div', { class: 'base-camp' }, '⛺', h('b', {}, 'Base camp'), h('span', {}, '0 m'))];
  COURSE.forEach((unit, ui) => climb.push(campScene(unit, ui, next, height, all.indexOf(unitLessons(unit)[0]), all)));
  climb.push(h('div', { class: 'summit' + (next ? '' : ' reached') },
    h('div', { class: 'sm-flag' }, next ? '🏔️' : myClimber() + '🚩'),
    h('b', {}, 'Cumbre del Español'),
    h('span', {}, `${metres(SUMMIT)} — higher than Everest`)));

  return h('div', { class: 'page path' },
    h('div', { class: 'path-sticky' },
      h('header', { class: 'top' },
        h('div', {}, h('div', { class: 'hello' }, 'Monte Español'), h('div', { class: 'brand' }, 'Hablamos')),
        h('div', { class: 'top-pills' },
          h('div', { class: 'pill fire' + (Store.streakNow() ? ' lit' : '') }, '🔥 ' + Store.streakNow()),
          h('button', { class: 'pill coins', onclick: () => openShop() }, '🪙 ' + (d.coins || 0)),
          h('div', { class: 'pill goal', style: { '--p': goalPct } }, goalPct >= 1 ? '🎯 ✓' : `🎯 ${Math.min(d.daily.xp, DAILY_GOAL)}/${DAILY_GOAL}`))),
      h('div', { class: 'alt-row' },
        h('span', { class: 'alt-now' }, `⛰ ${metres(height)}`),
        h('div', { class: 'alt-bar' }, h('i', { style: { width: (height / SUMMIT) * 100 + '%' } })),
        h('span', { class: 'alt-top' }, passed ? `past ${passed[0]}` : 'to the top')),
      cont),
    voiceBanner(),
    h('div', { class: 'mountain' }, ...climb),
    h('div', { class: 'foot-note' }, `${COURSE.length} camps · ${all.length} lessons · ${WORDS.length} words`));
}

// Brings the next lesson into view when the mountain opens.
function scrollToCurrent(view) {
  requestAnimationFrame(() => {
    const cur = view.querySelector('.path-node.current') || view.querySelector('.summit');
    if (!cur) return;
    const r = cur.getBoundingClientRect();
    view.scrollTop += r.top - view.clientHeight * 0.55;
  });
}

// Shown on the home screen when the phone can't speak Spanish yet.
function voiceBanner() {
  const st = Voice.state();
  if (!Voice.native() || (st !== 'missing' && st !== 'error')) return null;
  const google = Voice.info().google;
  return h('button', { class: 'card voice-banner', onclick: () => Voice.install() },
    h('span', { class: 'vb-emoji' }, '🔇'),
    h('div', {},
      h('b', {}, 'Get the Google voice'),
      h('span', {}, google
        ? 'Your phone needs the Spanish voice pack — the same voice as Google Translate. Tap to download it (free).'
        : 'Install “Speech Services by Google” to hear every word spoken — the same voice as Google Translate.')),
    h('span', { class: 'chev' }, '›'));
}

const SAMPLE_PHRASE = '¡Hola! Mi hermano es muy molesto.';

function voicePicker() {
  const info = Voice.info();
  const st = Voice.state();
  const status = st === 'ok'
    ? (Voice.native() ? (info.google ? '🟢 Google voice ready' : '🟢 Phone voice ready') : '🟢 Browser voice ready')
    : st === 'init' ? '⏳ Starting the voice…' : '🔇 No Spanish voice installed yet';
  const list = h('div', { class: 'voice-list' }, ...info.voices.map((v) => {
    const on = v.name === info.current || (!info.current && v.name === Store.s.voiceName);
    const b = h('button', { class: 'voice-opt' + (on ? ' on' : '') }, h('span', {}, v.label), h('span', { class: 'vo-play' }, on ? '✓' : '▶'));
    b.addEventListener('click', () => {
      Voice.select(v.name);
      setTimeout(() => { Voice.say(SAMPLE_PHRASE, true); App.refresh(); }, 150);
    });
    return b;
  }));
  return h('div', { class: 'card settings' },
    h('div', { class: 'voice-status' }, status),
    info.voices.length > 1 ? h('small', { class: 'muted' }, 'Tap a voice to hear it and use it:') : null,
    info.voices.length ? list : null,
    Voice.native() ? h('div', { class: 'row-btns wrap' },
      h('button', { class: 'btn ghost small', onclick: () => Voice.install() }, info.google ? '⬇️ Get more Google voices' : '⬇️ Get the Google voice'),
      h('button', { class: 'btn ghost small', onclick: () => window.Native.openTtsSettings() }, '⚙️ Speech settings')) : null);
}

function renderPlay() {
  const d = Store.data;
  const wotd = wordOfTheDay();
  const sample = exampleFor(wotd, SUBJECTS[1]);
  const mine = learnedIds().size;

  const packs = h('div', { class: 'chips-scroll' }, ...PACKS.map((p) => {
    const b = h('button', { class: 'pack' + (Store.s.pack === p.id ? ' active' : '') }, `${p.emoji} ${p.name}${p.id === 'mine' ? ` (${mine})` : ''}`);
    b.addEventListener('click', () => {
      if (p.id === 'mine' && mine < 8) { toast('Finish a couple of lessons first — then play with just your words'); return; }
      Store.s.pack = p.id; Store.save(); App.refresh();
    });
    return b;
  }));
  const pack = PACKS.find((p) => p.id === Store.s.pack) || PACKS[0];
  const packHasAdj = currentPool().some((w) => w.adj);

  const groups = GAME_GROUPS.map((g) => h('section', { class: 'game-group' },
    h('h2', {}, `${g.emoji} ${g.name}`),
    h('div', { class: 'game-grid' }, ...GAMES.filter((x) => x.group === g.id).map((game) => {
      const card = h('button', { class: 'game-card', style: { '--g1': game.colors[0], '--g2': game.colors[1] } },
        h('div', { class: 'gc-emoji' }, game.emoji),
        h('div', { class: 'gc-name' }, game.name),
        h('div', { class: 'gc-desc' }, game.desc),
        game.adj && !packHasAdj ? h('div', { class: 'gc-tag' }, 'uses describing words') : null,
        h('div', { class: 'gc-foot' }, starsRow(d.stars[game.id] || 0), d.best[game.id] ? h('span', { class: 'gc-best' }, '🏅 ' + d.best[game.id]) : null));
      card.addEventListener('click', () => App.startGame(game));
      return card;
    }))));

  return h('div', { class: 'page' },
    topBar('Juegos', 'Games'),
    goalCard(),
    h('button', { class: 'friends-hero', onclick: () => openFriends() },
      h('span', { class: 'fh-emoji' }, '⚔️'),
      h('div', {}, h('b', {}, 'Play with friends'), h('span', {}, 'Battle online, duel on one phone, or beat your friends on the leaderboard')),
      h('span', { class: 'fh-go' }, '›')),
    h('div', { class: 'card wotd' },
      h('div', { class: 'wotd-label' }, 'Word of the day'),
      h('div', { class: 'wotd-main' },
        h('div', { class: 'wotd-emoji' }, wotd.e),
        h('div', {}, h('div', { class: 'wotd-word' }, wotd.inv ? wotd.m : `${wotd.m} · ${wotd.f}`), h('div', { class: 'wotd-en' }, wotd.en)),
        h('button', { class: 'icon-btn speak', onclick: () => Voice.say(sample ? `${wotd.m}. ${sample.es}` : wotd.m, true) }, '🔊')),
      sample ? h('div', { class: 'wotd-ex' }, h('b', {}, sample.es), ' ', h('span', {}, sample.en)) : null,
      wotd.tip ? h('div', { class: 'wotd-tip' }, '💡 ' + wotd.tip) : null),
    h('div', { class: 'section-title' }, `Words from: ${pack.emoji} ${pack.name}`),
    packs,
    h('button', { class: 'btn primary wide shuffle', onclick: () => App.startGame(pickOne(GAMES)) }, '🎲 Surprise me — random game'),
    ...groups,
    h('button', { class: 'card invite', onclick: () => Share.send(INVITE_TEXT) },
      h('span', { class: 'inv-emoji' }, '📤'),
      h('div', {}, h('b', {}, 'Share with friends'), h('span', {}, 'Send Hablamos to someone learning Spanish')),
      h('span', { class: 'chev' }, '›')),
    Voice.native() ? null : h('a', { class: 'card invite get-app', href: APK_URL },
      h('span', { class: 'inv-emoji' }, '📱'),
      h('div', {}, h('b', {}, 'Get the Android app'), h('span', {}, 'Works offline, with the Google voice')),
      h('span', { class: 'chev' }, '›')),
    h('div', { class: 'foot-note' }, `${GAMES.length} mini games · ${WORDS.length} words`),
  );
}

// ------------------------------------------------------------------ Friends tab
// Shows the Friends tab, closing whatever game or duel is on top of it.
function openFriends() {
  if (App.overlayKind) App.closeOverlay();
  App.show('friends');
}

function renderFriends() {
  Online.start();

  // Your name, so your friend knows who they're playing.
  const name = h('input', { class: 'search name-input', placeholder: 'Your name', maxlength: '14', value: Store.s.playerName || '' });
  name.addEventListener('input', () => { Store.s.playerName = name.value.trim(); Store.save(); });

  // Your code: kept up to date as the phone comes online.
  const codeBox = h('div', { class: 'my-code' });
  const sendBtn = h('button', { class: 'btn share' }, '📤 Send my code');
  const drawCode = () => {
    if (!codeBox.isConnected && Online.ui === drawCode && App.tab !== 'friends') { Online.ui = null; return; }
    const st = Online.state;
    sendBtn.disabled = st !== 'ready';
    if (st === 'ready') codeBox.replaceChildren(h('div', { class: 'room-code' }, Online.code));
    else if (st === 'error') codeBox.replaceChildren(h('div', { class: 'code-msg' }, '📵 You’re offline. Online play needs internet.'), h('button', { class: 'btn ghost small', onclick: () => Online.start() }, '↻ Try again'));
    else if (st === 'unsupported') codeBox.replaceChildren(h('div', { class: 'code-msg' }, 'This phone can’t play online — try a duel on one phone instead.'));
    else codeBox.replaceChildren(h('div', { class: 'room-code loading' }, '• • • • •'));
  };
  Online.ui = drawCode;
  drawCode();
  sendBtn.addEventListener('click', () => {
    if (Online.state !== 'ready') return;
    Share.send(`⚔️ Play Hablamos with me! My code: ${Online.code}\nOpen Hablamos → 👥 Friends → type my code → Play.`);
  });

  // Their code.
  const theirs = h('input', { class: 'search code-input', placeholder: 'Friend’s code', maxlength: '5', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' });
  const go = () => Online.join(theirs.value);
  theirs.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });

  // Offline challenge codes (from "Challenge a friend" after a game).
  const chal = h('input', { class: 'search code-input', placeholder: 'e.g. QUIZ-4F7K2-230', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' });
  const playChal = () => {
    const c = Challenge.decode(chal.value);
    if (!c) { toast('That code doesn\'t look right — check it and try again'); return; }
    App.startGame(c.game, { seed: c.seed, target: c.target });
  };
  chal.addEventListener('keydown', (e) => { if (e.key === 'Enter') playChal(); });

  return h('div', { class: 'page' },
    h('header', { class: 'top' }, h('div', {}, h('div', { class: 'hello' }, 'Amigos'), h('div', { class: 'brand' }, 'Friends'))),
    h('div', { class: 'card online-hero' },
      h('div', { class: 'oh-title' }, '🌐 Play a friend online'),
      h('div', { class: 'oh-steps' }, '1. Send your friend your code  ·  2. They type it in  ·  3. Race to tap the right Spanish word!'),
      h('div', { class: 'oh-label' }, 'Your code'),
      codeBox,
      sendBtn,
      h('div', { class: 'oh-or' }, h('span', {}, 'or type your friend’s code')),
      h('div', { class: 'oh-join' }, theirs, h('button', { class: 'btn primary', onclick: go }, '▶ Play')),
      h('div', { class: 'oh-name' }, h('span', {}, 'Your name'), name),
      h('div', { class: 'online-note' }, 'Both phones need internet, with Hablamos open on this tab. First to 7 points wins.')),
    h('button', { class: 'card friends-option duel-option', onclick: () => openDuel() },
      h('div', { class: 'fo-emoji' }, '⚔️'),
      h('div', {}, h('b', {}, 'Duel on one phone'), h('span', {}, 'Same room? Put the phone flat between you — each gets half the screen. No internet needed.'))),
    h('div', { class: 'card friends-option' },
      h('div', { class: 'fo-emoji' }, '🎯'),
      h('div', { class: 'fo-body' },
        h('b', {}, 'Challenge codes'),
        h('span', {}, 'Finish any game and tap “Challenge a friend” to send your score. Got a challenge code? Type it here to play the same words and see who wins.'),
        chal,
        h('button', { class: 'btn primary', onclick: playChal }, '▶ Play challenge'))),
  );
}

// Two players, one phone: the top half is turned round to face the other player.
function openDuel() {
  const host = App.openOverlay('duel');
  const TARGET = 7;
  const timers = new Set();
  const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  App.overlayCleanup = () => { timers.forEach(clearTimeout); timers.clear(); };
  const players = [0, 1].map((i) => {
    const score = h('div', { class: 'duel-score' }, '0');
    const prompt = h('div', { class: 'duel-prompt' });
    const opts = h('div', { class: 'duel-opts' });
    const half = h('div', { class: 'duel-half p' + i }, h('div', { class: 'duel-head' }, h('span', {}, i ? '🩷 Player 2' : '🩵 Player 1'), score), prompt, opts);
    return { i, half, score, prompt, opts, points: 0, locked: false };
  });
  const mid = h('div', { class: 'duel-mid' }, h('button', { class: 'icon-btn', onclick: () => App.closeOverlay() }, '✕'), h('b', {}, 'VS'), h('span', { class: 'duel-goal' }, `first to ${TARGET}`));
  host.replaceChildren(h('div', { class: 'duel' }, players[1].half, mid, players[0].half));

  let word = null, open = false, last = null;
  const round = () => {
    let w;
    do { w = pickWords(1)[0]; } while (last && w.id === last.id);
    last = word = w;
    const options = [w, ...distractors(w, 3)];
    open = true;
    players.forEach((p) => {
      p.locked = false;
      p.half.classList.remove('won-round', 'lost-round');
      p.prompt.replaceChildren(h('span', { class: 'dp-emoji' }, w.e), h('span', {}, w.short));
      p.opts.replaceChildren(...shuffle(options).map((o) => {
        const b = h('button', { class: 'duel-opt' }, o.m);
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(p, o, b); });
        return b;
      }));
    });
  };
  const tap = (p, o, b) => {
    if (!open || p.locked) return;
    if (o.id === word.id) {
      open = false;
      p.points++;
      p.score.textContent = p.points;
      b.classList.add('right');
      p.half.classList.add('won-round');
      players[1 - p.i].half.classList.add('lost-round');
      Sfx.good(p.points);
      Haptics.buzz(30);
      Voice.say(word.m);
      if (p.points >= TARGET) return later(900, () => finish(p));
      later(1300, round);
    } else {
      p.locked = true;
      b.classList.add('wrong');
      Sfx.bad();
      Haptics.buzz([40, 30, 40]);
      if (players.every((x) => x.locked)) {
        open = false;
        players.forEach((x) => [...x.opts.children].forEach((c) => { if (c.textContent === word.m) c.classList.add('right'); }));
        Voice.say(word.m);
        later(1600, round);
      }
    }
  };
  const finish = (winner) => {
    Sfx.win();
    players.forEach((p) => {
      const won = p === winner;
      p.prompt.replaceChildren(h('span', { class: 'dp-emoji' }, won ? '🏆' : '😅'), h('span', {}, won ? '¡Ganaste! You win!' : 'So close!'));
      p.opts.replaceChildren(
        h('button', { class: 'btn primary', onclick: () => openDuel() }, '↻ Rematch'),
        h('button', { class: 'btn ghost', onclick: () => App.closeOverlay() }, 'Done'));
    });
    App.confetti(host);
  };
  round();
}

// ------------------------------------------------------------------ coins & climbers
function openShop() {
  const host = App.openOverlay('shop');
  const d = Store.data;
  if (!d.owned) d.owned = ['🧗'];
  const draw = () => host.replaceChildren(h('div', { class: 'page tips-page' },
    h('header', { class: 'top' },
      h('div', {}, h('div', { class: 'hello' }, 'La tienda'), h('div', { class: 'brand' }, 'Climbers')),
      h('button', { class: 'icon-btn', onclick: () => App.closeOverlay() }, '✕')),
    h('div', { class: 'card shop-wallet' }, h('span', { class: 'sw-coin' }, '🪙'), h('div', {}, h('b', {}, `${d.coins || 0} coins`),
      h('span', {}, `Climb Monte Español to earn more: ${COINS_PER_100M} 🪙 every 100 m, and a chest of ${CHEST_COINS} 🪙 for every real mountain you pass.`))),
    h('div', { class: 'section-title' }, 'Who climbs for you?'),
    h('div', { class: 'shop-grid' }, ...CLIMBERS.map((c) => {
      const owned = d.owned.includes(c.e);
      const on = myClimber() === c.e;
      const b = h('button', { class: 'shop-item' + (on ? ' on' : '') + (owned ? ' owned' : '') },
        h('span', { class: 'si-e' }, c.e), h('b', {}, c.name),
        h('span', { class: 'si-cost' }, on ? '✓ Climbing' : owned ? 'Use' : `🪙 ${c.cost}`));
      b.addEventListener('click', () => {
        if (!owned) {
          if ((d.coins || 0) < c.cost) { Sfx.bad(); toast(`You need ${c.cost - (d.coins || 0)} more 🪙 — keep climbing!`); return; }
          d.coins -= c.cost;
          d.owned.push(c.e);
          Sfx.win();
          toast(`${c.e} ${c.name} joined your climb!`);
        } else Sfx.tap();
        d.climber = c.e;
        Store.save();
        draw();
      });
      return b;
    }))));
  draw();
}

// ------------------------------------------------------------------ flashcards
// A deck of up to 20 of `words`, the ones you know least first.
function openFlashcards(words, title) {
  const host = App.openOverlay('cards');
  const deck = pickWords(Math.min(20, words.length), () => true, words);
  let i = 0, known = 0;
  const wrap = h('div', { class: 'flash' });
  host.replaceChildren(wrap);
  const show = () => {
    if (i >= deck.length) {
      const xp = known * 2 + 5;
      Store.addXp(xp);
      wrap.replaceChildren(h('div', { class: 'results' },
        h('div', { class: 'res-face' }, '🧠'), h('div', { class: 'res-head' }, '¡Hecho!'),
        h('div', { class: 'res-game' }, `You knew ${known} of ${deck.length}`),
        h('div', { class: 'res-chips' }, h('div', { class: 'chip' }, h('b', {}, '+' + xp), ' XP')),
        h('div', { class: 'res-btns' },
          h('button', { class: 'btn ghost', onclick: () => App.closeOverlay() }, 'Done'),
          h('button', { class: 'btn primary', onclick: () => openFlashcards(words, title) }, '↻ New deck'))));
      Sfx.win();
      return;
    }
    const w = deck[i];
    const g = w.inv ? 'm' : pickOne(['m', 'f']);
    const s = exampleFor(w, pickOne(SUBJECTS.filter((x) => x.g === g)));
    const side = w.adj ? (w.v === 'ser' ? 'ser → es' : w.v === 'estar' ? 'estar → está' : 'ser or estar')
      : w.art ? (/^la/.test(w.art) || w.id === 'el agua' ? 'feminine' : 'masculine') + (w.plural ? ' · plural' : '') : unitOf(w).title;
    const card = h('div', { class: 'fc' },
      h('div', { class: 'fc-inner' },
        h('div', { class: 'fc-face fc-front' },
          h('div', { class: 'fc-emoji' }, w.e),
          h('div', { class: 'fc-word' }, w.m), w.adj ? h('div', { class: 'fc-fem' }, !w.inv ? w.f : 'él & ella') : null,
          h('div', { class: 'fc-hint' }, 'Tap to flip')),
        h('div', { class: 'fc-face fc-back' },
          h('div', { class: 'fc-en' }, w.en),
          h('div', { class: 'fc-verb' }, side),
          s ? h('div', { class: 'fc-ex' }, h('b', {}, s.es), h('span', {}, s.en)) : null,
          w.tip ? h('div', { class: 'fc-tip' }, '💡 ' + w.tip) : null)));
    card.addEventListener('click', () => {
      card.classList.toggle('flipped');
      Sfx.flip();
      if (card.classList.contains('flipped') && s) Voice.say(s.es);
    });
    const judge = (ok) => {
      if (ok) { known++; Store.bump(w.id, 1); } else Store.bump(w.id, -1);
      Store.save();
      card.classList.add(ok ? 'fly-right' : 'fly-left');
      setTimeout(() => { i++; show(); }, 260);
    };
    swipeable(card, (dir) => judge(dir > 0));
    wrap.replaceChildren(
      h('div', { class: 'flash-top' },
        h('button', { class: 'icon-btn', onclick: () => App.closeOverlay() }, '✕'),
        h('div', { class: 'flash-count' }, `${title ? title + ' · ' : ''}${i + 1} / ${deck.length}`),
        h('button', { class: 'icon-btn', onclick: () => Voice.say(w.inv ? w.m : `${w.m}, ${w.f}`, true) }, '🔊')),
      h('div', { class: 'hud-bar' }, h('i', { style: { width: (i / deck.length) * 100 + '%' } })),
      h('div', { class: 'fc-host' }, card),
      h('div', { class: 'flash-btns' },
        h('button', { class: 'btn ghost', onclick: () => judge(false) }, '😕 Still learning'),
        h('button', { class: 'btn primary', onclick: () => judge(true) }, '😎 I know it')));
    Voice.say(w.m);
  };
  show();
}

// ------------------------------------------------------------------ Words tab
let wordFilter = { q: '', c: 'all' };
function renderWords() {
  const list = h('div', { class: 'word-list' });
  const draw = () => {
    const q = stripAccents(wordFilter.q.toLowerCase().trim());
    const shown = WORDS.filter((w) => (wordFilter.c === 'all' || w.unit === wordFilter.c) &&
      (!q || stripAccents(w.m.toLowerCase()).includes(q) || stripAccents(w.f.toLowerCase()).includes(q) || w.en.toLowerCase().includes(q)));
    list.replaceChildren(...shown.slice(0, 150).map((w) => {
      const m = Store.mastery(w.id);
      const s = exampleFor(w);
      const row = h('div', { class: 'word-row' },
        h('div', { class: 'wr-main' },
          h('span', { class: 'wr-e' }, w.e),
          h('div', { class: 'wr-text' }, h('b', {}, w.inv ? w.m : `${w.m} / ${w.f}`), h('small', {}, w.en)),
          h('div', { class: 'mastery' }, ...[1, 2, 3, 4, 5].map((k) => h('i', { class: k <= m ? 'on' : '' })))),
        h('div', { class: 'wr-more' },
          s ? h('div', { class: 'wr-ex' }, h('b', {}, s.es), ' ', h('span', {}, s.en)) : null,
          w.tip ? h('div', { class: 'wr-tip' }, '💡 ' + w.tip) : null,
          h('div', { class: 'wr-say' },
            h('button', { class: 'btn ghost small', onclick: (e) => { e.stopPropagation(); Voice.say(w.m, true); } }, '🔊 ' + w.m),
            !w.inv ? h('button', { class: 'btn ghost small', onclick: (e) => { e.stopPropagation(); Voice.say(w.f, true); } }, '🔊 ' + w.f) : null,
            s ? h('button', { class: 'btn ghost small', onclick: (e) => { e.stopPropagation(); Voice.say(s.es, true); } }, '🔊 sentence') : null)));
      row.addEventListener('click', () => row.classList.toggle('open'));
      return row;
    }));
    if (!shown.length) list.append(h('div', { class: 'empty' }, 'No words match “' + wordFilter.q + '”'));
    if (shown.length > 150) list.append(h('div', { class: 'empty' }, `…and ${shown.length - 150} more. Pick a topic or search.`));
    cardsBtn.lastChild.textContent = `${Math.min(20, shown.length)} words from ${wordFilter.c === 'all' ? 'everything' : UNIT_BY_ID[wordFilter.c].title}`;
    cardsWords = shown;
  };
  let cardsWords = WORDS;
  const cardsBtn = h('button', { class: 'card flash-start', onclick: () => cardsWords.length && openFlashcards(cardsWords, wordFilter.c === 'all' ? '' : UNIT_BY_ID[wordFilter.c].title) },
    h('div', { class: 'fs-emoji' }, '🃏'), h('div', {}, h('b', {}, 'Flashcards'), h('span', {})));
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Search Spanish or English…', value: wordFilter.q });
  search.addEventListener('input', () => { wordFilter.q = search.value; draw(); });
  if (wordFilter.c !== 'all' && !UNIT_BY_ID[wordFilter.c]) wordFilter.c = 'all';
  const cats = [['all', '🌍 All'], ...COURSE.map((u) => [u.id, `${u.emoji} ${u.title}`])];
  const chips = h('div', { class: 'chips-scroll' }, ...cats.map(([id, label]) => {
    const b = h('button', { class: 'pack' + (wordFilter.c === id ? ' active' : '') }, label);
    b.addEventListener('click', () => {
      wordFilter.c = id;
      chips.querySelectorAll('.pack').forEach((x) => x.classList.toggle('active', x === b));
      draw();
    });
    return b;
  }));
  draw();
  const mastered = WORDS.filter((w) => Store.mastery(w.id) >= 4).length;
  return h('div', { class: 'page' },
    h('header', { class: 'top' }, h('div', {}, h('div', { class: 'hello' }, 'Palabras'), h('div', { class: 'brand' }, 'Words')),
      h('div', { class: 'pill' }, `✅ ${mastered}/${WORDS.length}`)),
    search, chips, cardsBtn, list);
}

// ------------------------------------------------------------------ Me tab
function renderMe() {
  const d = Store.data;
  const lv = Store.level();
  const mastered = WORDS.filter((w) => Store.mastery(w.id) >= 4).length;
  const starTotal = Object.values(d.stars).reduce((a, b) => a + b, 0);
  const toggle = (key, label, emoji) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!Store.s[key];
    input.addEventListener('change', () => { Store.s[key] = input.checked; Store.save(); Sfx.tap(); });
    return h('label', { class: 'setting' }, h('span', {}, `${emoji} ${label}`), h('span', { class: 'switch' }, input, h('i')));
  };
  const rate = h('input', { type: 'range', min: '0.5', max: '1.3', step: '0.1', value: String(Store.s.rate) });
  rate.addEventListener('change', () => { Store.s.rate = parseFloat(rate.value); Store.save(); Voice.say(SAMPLE_PHRASE, true); });
  const stat = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('small', {}, l));
  return h('div', { class: 'page' },
    h('header', { class: 'top' }, h('div', {}, h('div', { class: 'hello' }, 'Tu perfil'), h('div', { class: 'brand' }, 'Me'))),
    h('div', { class: 'card profile' },
      h('div', { class: 'big-level' }, h('small', {}, 'Level'), h('b', {}, lv.lvl)),
      h('div', { class: 'grow' }, h('b', {}, `${d.xp} XP`), h('div', { class: 'xp-bar' }, h('i', { style: { width: (lv.into / lv.need) * 100 + '%' } })),
        h('small', {}, `${lv.need - lv.into} XP to level ${lv.lvl + 1}`))),
    accountCard(),
    h('button', { class: 'card invite', onclick: () => openShop() },
      h('span', { class: 'inv-emoji' }, myClimber()),
      h('div', {}, h('b', {}, `🪙 ${d.coins || 0} coins · ⛰ ${metres(myHeight())}`), h('span', {}, 'Spend your coins on a new climber')),
      h('span', { class: 'chev' }, '›')),
    h('div', { class: 'stats' },
      stat('🔥 ' + Store.streakNow(), 'day streak'),
      stat(d.played, 'games played'),
      stat(`${mastered}/${WORDS.length}`, 'words mastered'),
      stat(`${starTotal}/${GAMES.length * 3}`, 'stars'),
      stat(`${lessonsDoneCount()}/${ALL_LESSONS().length}`, 'lessons done'),
      stat(`${COURSE.filter((u) => lessonDone(unitLessons(u).at(-1).id)).length}/${COURSE.length}`, 'units finished')),
    h('div', { class: 'section-title' }, 'Settings'),
    h('div', { class: 'card settings' },
      toggle('sound', 'Sound effects', '🔔'),
      toggle('vibrate', 'Vibration', '📳'),
      toggle('voice', 'Speak Spanish aloud', '🗣️'),
      h('label', { class: 'setting col' }, h('span', {}, '🐢 Speech speed 🐇'), rate),
      h('button', { class: 'btn ghost small', onclick: () => Voice.say(SAMPLE_PHRASE, true) }, '🔊 Test voice')),
    h('div', { class: 'section-title' }, 'Spanish voice'),
    voicePicker(),
    h('button', {
      class: 'btn danger wide',
      onclick: () => {
        if (confirm('Reset all progress, XP and scores?')) { localStorage.removeItem(Store.KEY); Store.load(); App.refresh(); toast('Progress reset'); }
      },
    }, 'Reset progress'),
    h('div', { class: 'foot-note' }, 'Hablamos · learn Spanish, one game at a time'),
  );
}

window.addEventListener('DOMContentLoaded', () => App.init());
