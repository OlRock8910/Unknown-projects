// Screens, navigation and the Android back button.

const App = {
  tab: 'play',
  session: null,
  overlayKind: null, // 'game' | 'results' | 'cards' | null
  lastGame: null,

  init() {
    Store.load();
    Voice.init();
    document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => this.show(b.dataset.tab)));
    // Browsers only allow audio after a user gesture.
    document.addEventListener('pointerdown', () => Sfx.ensure(), { once: true });
    window.appBack = () => this.back();
    this.show('play');
  },

  show(tab) {
    Sfx.tap();
    this.tab = tab;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const view = $('#view');
    view.scrollTop = 0;
    const render = { play: renderPlay, learn: renderLearn, words: renderWords, me: renderMe }[tab];
    view.replaceChildren(render());
  },

  refresh() { this.show(this.tab); },

  openOverlay(kind) {
    this.overlayKind = kind;
    const o = $('#overlay');
    o.classList.add('open');
    return o;
  },
  closeOverlay() {
    this.overlayKind = null;
    const o = $('#overlay');
    o.classList.remove('open');
    o.replaceChildren();
    this.refresh();
  },

  startGame(game) {
    this.lastGame = game;
    const levelBefore = Store.level().lvl;
    const host = this.openOverlay('game');
    this.session = new Session(game, host, (result) => {
      this.session = null;
      if (!result) return this.closeOverlay();
      result.levelUp = Store.level().lvl > levelBefore ? Store.level().lvl : null;
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
    if (this.overlayKind) { this.closeOverlay(); return true; }
    if (this.tab !== 'play') { this.show('play'); return true; }
    return false;
  },
};

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

function renderPlay() {
  const d = Store.data;
  const lv = Store.level();
  const streak = Store.streakNow();
  const goalPct = Math.min(1, d.daily.xp / DAILY_GOAL);
  const wotd = wordOfTheDay();
  const sample = makeSentence(wotd, { subject: SUBJECTS[1], plain: true });

  const ring = h('div', { class: 'ring', style: { '--p': goalPct } }, h('span', {}, goalPct >= 1 ? '✓' : Math.round(goalPct * 100) + '%'));

  const packs = h('div', { class: 'chips-scroll' }, ...PACKS.map((p) => {
    const b = h('button', { class: 'pack' + (Store.s.pack === p.id ? ' active' : '') }, `${p.emoji} ${p.name}`);
    b.addEventListener('click', () => { Store.s.pack = p.id; Store.save(); App.refresh(); });
    return b;
  }));

  const groups = GAME_GROUPS.map((g) => h('section', { class: 'game-group' },
    h('h2', {}, `${g.emoji} ${g.name}`),
    h('div', { class: 'game-grid' }, ...GAMES.filter((x) => x.group === g.id).map((game) => {
      const card = h('button', { class: 'game-card', style: { '--g1': game.colors[0], '--g2': game.colors[1] } },
        h('div', { class: 'gc-emoji' }, game.emoji),
        h('div', { class: 'gc-name' }, game.name),
        h('div', { class: 'gc-desc' }, game.desc),
        h('div', { class: 'gc-foot' }, starsRow(d.stars[game.id] || 0), d.best[game.id] ? h('span', { class: 'gc-best' }, '🏅 ' + d.best[game.id]) : null));
      card.addEventListener('click', () => App.startGame(game));
      return card;
    }))));

  return h('div', { class: 'page' },
    h('header', { class: 'top' },
      h('div', {}, h('div', { class: 'hello' }, '¡Hola! 👋'), h('div', { class: 'brand' }, 'Adjetivos')),
      h('div', { class: 'top-pills' },
        h('div', { class: 'pill fire' + (streak ? ' lit' : '') }, '🔥 ' + streak),
        h('div', { class: 'pill' }, '⭐ Lv ' + lv.lvl))),
    h('div', { class: 'card goal-card' }, ring,
      h('div', { class: 'goal-text' }, h('b', {}, 'Daily goal'), h('span', {}, `${Math.min(d.daily.xp, DAILY_GOAL)} / ${DAILY_GOAL} XP today`),
        h('div', { class: 'xp-bar' }, h('i', { style: { width: (lv.into / lv.need) * 100 + '%' } })),
        h('small', {}, `${lv.need - lv.into} XP to level ${lv.lvl + 1}`))),
    h('div', { class: 'card wotd' },
      h('div', { class: 'wotd-label' }, 'Word of the day'),
      h('div', { class: 'wotd-main' },
        h('div', { class: 'wotd-emoji' }, wotd.e),
        h('div', {}, h('div', { class: 'wotd-word' }, wotd.inv ? wotd.m : `${wotd.m} · ${wotd.f}`), h('div', { class: 'wotd-en' }, wotd.en)),
        h('button', { class: 'icon-btn speak', onclick: () => Voice.say(`${wotd.m}. ${sample.es}`, true) }, '🔊')),
      h('div', { class: 'wotd-ex' }, h('b', {}, sample.es), ' ', h('span', {}, sample.en)),
      wotd.tip ? h('div', { class: 'wotd-tip' }, '💡 ' + wotd.tip) : null),
    h('div', { class: 'section-title' }, 'Word pack'),
    packs,
    h('button', { class: 'btn primary wide shuffle', onclick: () => App.startGame(pickOne(GAMES)) }, '🎲 Surprise me — random game'),
    ...groups,
    h('div', { class: 'foot-note' }, `${GAMES.length} mini games · ${WORDS.length} adjectives`),
  );
}

// ------------------------------------------------------------------ Learn tab
function renderLearn() {
  const pool = currentPool();
  const tips = GRAMMAR_TIPS.map((t) => {
    const card = h('div', { class: 'card tip' },
      h('div', { class: 'tip-head' }, h('span', { class: 'tip-emoji' }, t.emoji), h('b', {}, t.title), h('span', { class: 'chev' }, '›')),
      h('div', { class: 'tip-body' }, h('p', { html: t.body }),
        ...t.examples.map(([es, en]) => h('button', { class: 'tip-ex', onclick: (e) => { e.stopPropagation(); Voice.say(es, true); } },
          h('span', {}, '🔊'), h('div', {}, h('b', {}, es), h('small', {}, en))))));
    card.addEventListener('click', () => card.classList.toggle('open'));
    return card;
  });
  return h('div', { class: 'page' },
    h('header', { class: 'top' }, h('div', {}, h('div', { class: 'hello' }, 'Aprende'), h('div', { class: 'brand' }, 'Learn'))),
    h('button', { class: 'card flash-start', onclick: () => openFlashcards() },
      h('div', { class: 'fs-emoji' }, '🃏'),
      h('div', {}, h('b', {}, 'Flashcards'), h('span', {}, `Flip through ${Math.min(20, pool.length)} words from “${(PACKS.find((p) => p.id === Store.s.pack) || PACKS[0]).name}”`)),
      h('span', { class: 'chev' }, '›')),
    h('div', { class: 'section-title' }, 'Grammar in 30 seconds'),
    ...tips,
  );
}

function openFlashcards() {
  const host = App.openOverlay('cards');
  const deck = pickWords(Math.min(20, currentPool().length));
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
          h('button', { class: 'btn primary', onclick: () => openFlashcards() }, '↻ New deck'))));
      Sfx.win();
      return;
    }
    const w = deck[i];
    const g = w.inv ? 'm' : pickOne(['m', 'f']);
    const s = makeSentence(w, { subject: pickOne(SUBJECTS.filter((x) => x.g === g)) });
    const card = h('div', { class: 'fc' },
      h('div', { class: 'fc-inner' },
        h('div', { class: 'fc-face fc-front' },
          h('div', { class: 'fc-emoji' }, w.e),
          h('div', { class: 'fc-word' }, w.m), !w.inv ? h('div', { class: 'fc-fem' }, w.f) : h('div', { class: 'fc-fem' }, 'él & ella'),
          h('div', { class: 'fc-hint' }, 'Tap to flip')),
        h('div', { class: 'fc-face fc-back' },
          h('div', { class: 'fc-en' }, w.en),
          h('div', { class: 'fc-verb' }, w.v === 'ser' ? 'ser → es' : w.v === 'estar' ? 'estar → está' : 'ser or estar'),
          h('div', { class: 'fc-ex' }, h('b', {}, s.es), h('span', {}, s.en)),
          w.tip ? h('div', { class: 'fc-tip' }, '💡 ' + w.tip) : null)));
    card.addEventListener('click', () => {
      card.classList.toggle('flipped');
      Sfx.flip();
      if (card.classList.contains('flipped')) Voice.say(s.es);
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
        h('div', { class: 'flash-count' }, `${i + 1} / ${deck.length}`),
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
    const shown = WORDS.filter((w) => (wordFilter.c === 'all' || w.c === wordFilter.c) &&
      (!q || stripAccents(w.m).includes(q) || stripAccents(w.f).includes(q) || w.en.toLowerCase().includes(q)));
    list.replaceChildren(...shown.map((w) => {
      const m = Store.mastery(w.id);
      const s = makeSentence(w, { plain: true, subject: SUBJECTS[w.inv ? 0 : 1] });
      const row = h('div', { class: 'word-row' },
        h('div', { class: 'wr-main' },
          h('span', { class: 'wr-e' }, w.e),
          h('div', { class: 'wr-text' }, h('b', {}, w.inv ? w.m : `${w.m} / ${w.f}`), h('small', {}, w.en)),
          h('div', { class: 'mastery' }, ...[1, 2, 3, 4, 5].map((k) => h('i', { class: k <= m ? 'on' : '' })))),
        h('div', { class: 'wr-more' },
          h('div', { class: 'wr-ex' }, h('b', {}, s.es), ' ', h('span', {}, s.en)),
          w.tip ? h('div', { class: 'wr-tip' }, '💡 ' + w.tip) : null,
          h('div', { class: 'wr-say' },
            h('button', { class: 'btn ghost small', onclick: (e) => { e.stopPropagation(); Voice.say(w.m, true); } }, '🔊 ' + w.m),
            !w.inv ? h('button', { class: 'btn ghost small', onclick: (e) => { e.stopPropagation(); Voice.say(w.f, true); } }, '🔊 ' + w.f) : null,
            h('button', { class: 'btn ghost small', onclick: (e) => { e.stopPropagation(); Voice.say(s.es, true); } }, '🔊 sentence'))));
      row.addEventListener('click', () => row.classList.toggle('open'));
      return row;
    }));
    if (!shown.length) list.append(h('div', { class: 'empty' }, 'No words match “' + wordFilter.q + '”'));
  };
  const search = h('input', { class: 'search', type: 'search', placeholder: 'Search Spanish or English…', value: wordFilter.q });
  search.addEventListener('input', () => { wordFilter.q = search.value; draw(); });
  const cats = [['all', '🌍 All'], ['neg', '😤 Annoying'], ['pos', '😇 Good'], ['look', '👀 Looks'], ['feel', '💭 Feelings']];
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
    search, chips, list);
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
  rate.addEventListener('change', () => { Store.s.rate = parseFloat(rate.value); Store.save(); Voice.say('¡Hola! Mi hermano es muy molesto.', true); });
  const stat = (v, l) => h('div', { class: 'stat' }, h('b', {}, v), h('small', {}, l));
  return h('div', { class: 'page' },
    h('header', { class: 'top' }, h('div', {}, h('div', { class: 'hello' }, 'Tu perfil'), h('div', { class: 'brand' }, 'Me'))),
    h('div', { class: 'card profile' },
      h('div', { class: 'big-level' }, h('small', {}, 'Level'), h('b', {}, lv.lvl)),
      h('div', { class: 'grow' }, h('b', {}, `${d.xp} XP`), h('div', { class: 'xp-bar' }, h('i', { style: { width: (lv.into / lv.need) * 100 + '%' } })),
        h('small', {}, `${lv.need - lv.into} XP to level ${lv.lvl + 1}`))),
    h('div', { class: 'stats' },
      stat('🔥 ' + Store.streakNow(), 'day streak'),
      stat(d.played, 'games played'),
      stat(`${mastered}/${WORDS.length}`, 'words mastered'),
      stat(`${starTotal}/${GAMES.length * 3}`, 'stars')),
    h('div', { class: 'section-title' }, 'Settings'),
    h('div', { class: 'card settings' },
      toggle('sound', 'Sound effects', '🔔'),
      toggle('vibrate', 'Vibration', '📳'),
      toggle('voice', 'Speak Spanish aloud', '🗣️'),
      h('label', { class: 'setting col' }, h('span', {}, '🐢 Speech speed 🐇'), rate),
      h('button', { class: 'btn ghost small', onclick: () => Voice.say('¡Hola! Mi hermano es muy molesto.', true) }, '🔊 Test voice')),
    h('button', {
      class: 'btn danger wide',
      onclick: () => {
        if (confirm('Reset all progress, XP and scores?')) { localStorage.removeItem(Store.KEY); Store.load(); App.refresh(); toast('Progress reset'); }
      },
    }, 'Reset progress'),
    h('div', { class: 'foot-note' }, 'Adjetivos · learn Spanish describing words'),
  );
}

window.addEventListener('DOMContentLoaded', () => App.init());
