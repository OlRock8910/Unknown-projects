// The coach: notices what you get wrong, shows your weak spots, leans
// practice towards them and suggests what to do next.
//
// Every answer counts towards a skill. Each skill keeps your last 30
// answers, so "lately" really means lately.
const SKILLS = {
  words: { ic: 'cards', kinds: ['meaning', 'recall', 'match'], games: ['bubble', 'rain', 'whack', 'memory', 'truefalse', 'quiz', 'survival', 'oddone'], game: 'memory', practice: 'weak' },
  listening: { ic: 'headphones', kinds: ['listen', 'dictation'], games: ['listen'], game: 'listen', practice: 'listen', ok: () => canListen() },
  spelling: { ic: 'scramble', kinds: ['spell', 'type'], games: ['scramble', 'hangman'], game: 'scramble', practice: 'spelling', ok: () => canType() },
  gender: { ic: 'users', kinds: ['article'], games: [], practice: 'gender', ok: () => !!ARTICLES[Store.data.target] },
  speaking: { ic: 'speaker', kinds: ['speak'], games: ['read'], game: 'read', practice: 'speaking', ok: () => canSpeak() },
  sentences: { ic: 'book', kinds: ['decode', 'gap', 'build'], games: [], practice: 'sentences' },
};
const skillOfKind = (kind) => Object.keys(SKILLS).find((k) => SKILLS[k].kinds.includes(kind)) || null;
const skillOfGame = (id) => Object.keys(SKILLS).find((k) => SKILLS[k].games.includes(id)) || null;

const Coach = {
  record(skill, ok) {
    if (!skill) return;
    const d = Store.data;
    d.skills = d.skills || {};
    const pair = Store.pair;
    const all = (d.skills[pair] = d.skills[pair] || {});
    const a = (all[skill] = all[skill] || []);
    a.push(ok ? 1 : 0);
    if (a.length > 30) a.splice(0, a.length - 30);
  },
  history: (skill) => (((Store.data.skills || {})[Store.pair] || {})[skill]) || [],
  usable: (skill) => !SKILLS[skill].ok || SKILLS[skill].ok(),
  // Skills you get wrong most lately (needs 6 answers to judge), weakest first.
  weakSpots() {
    return Object.keys(SKILLS).map((skill) => {
      const a = this.history(skill);
      const right = a.reduce((x, y) => x + y, 0);
      return { skill, n: a.length, right, acc: a.length ? right / a.length : 1 };
    }).filter((s) => s.n >= 6 && s.acc < 0.8 && this.usable(s.skill)).sort((x, y) => x.acc - y.acc);
  },
  // Words you keep getting wrong.
  trickyWords() {
    return learnedWords().map((w) => ({ w, s: wordState(w.id) })).filter(({ s }) => s.wrong >= 1 && s.wrong >= s.right / 2 && s.box <= 2)
      .sort((a, b) => (b.s.wrong - b.s.right) - (a.s.wrong - a.s.right)).map(({ w }) => w).slice(0, 8);
  },
  // The one thing to suggest right now, or null.
  tip() {
    const spot = this.weakSpots()[0];
    if (spot) return { ...spot, key: spot.skill };
    const tricky = this.trickyWords();
    if (tricky.length >= 3) return { skill: 'words', key: 'words', words: tricky };
    return null;
  },
  // Exercise kinds to give a little more of in reviews.
  focusKinds() {
    const spot = this.weakSpots()[0];
    return spot ? SKILLS[spot.skill].kinds : [];
  },
  // Do it: the skill's mini game if there is one, else a practice session.
  start(skill, viaGame = true) {
    const g = viaGame && SKILLS[skill].game && GAMES.find((x) => x.id === SKILLS[skill].game);
    if (g && (!g.needsVoice || speakable()) && (!g.needsMic || Mic.available())) return Games.start(g);
    openPractice(SKILLS[skill].practice);
  },
};

// ------------------------------------------------------------------ on the Practice tab
// "Your weak spots": each weak skill with how it's going, and the tricky words.
function weakSpotsCard() {
  const spots = Coach.weakSpots();
  const tricky = Coach.trickyWords();
  const card = h('div', { class: 'card coach-card' }, h('div', { class: 'coach-head' }, icon('target'), h('b', {}, t('coach.title'))));
  if (!spots.length && !tricky.length) {
    card.append(h('p', { class: 'muted coach-empty' }, learnedWords().length ? t('coach.allGood') : t('coach.empty')));
    return card;
  }
  spots.slice(0, 3).forEach((s) => card.append(h('div', { class: 'coach-row' },
    h('div', { class: 'coach-ic' }, icon(SKILLS[s.skill].ic, '', 'star')),
    h('div', { class: 'coach-mid' }, h('b', {}, t('skill.' + s.skill)),
      h('div', { class: 'coach-bar' }, h('i', { style: { width: Math.round(s.acc * 100) + '%' } })),
      h('small', {}, t('coach.lately', { right: s.right, n: s.n }))),
    h('button', { class: 'btn small primary', onclick: () => Coach.start(s.skill, false) }, t('coach.practise')))));
  if (tricky.length) {
    card.append(h('div', { class: 'coach-words' },
      h('small', { class: 'muted' }, t('coach.words')),
      h('div', { class: 'coach-chips' }, ...tricky.map((w) => h('button', { class: 'chip word-chip', onclick: () => { Voice.say(w.t, { force: true }); toast(`${w.t} = ${w.n}`, 2200); } }, w.t))),
      h('button', { class: 'btn small ghost', onclick: () => openPractice('weak') }, t('coach.practiseWords'))));
  }
  return card;
}

// The pop-up in the corner: one suggestion, at most once a day each.
function coachPopup() {
  const tip = Coach.tip();
  const d = Store.data;
  if (!tip || (d.coachSeen || {})[tip.key] === today()) return null;
  const sk = SKILLS[tip.skill];
  const game = sk.game && GAMES.find((g) => g.id === sk.game) && (!GAMES.find((g) => g.id === sk.game).needsMic || Mic.available()) ? sk.game : null;
  const sub = tip.words
    ? t('coach.tipWords', { w: tip.words.slice(0, 2).map((w) => w.t).join(', ') })
    : t(game ? 'coach.tipGame' : 'coach.tipPractice', { right: tip.right, n: tip.n, game: game ? t('game.' + game) : '' });
  const close = () => { d.coachSeen = { ...(d.coachSeen || {}), [tip.key]: today() }; Store.save({ quiet: true }); pop.classList.add('out'); setTimeout(() => pop.remove(), 300); };
  const pop = h('div', { class: 'coach-pop' },
    h('div', { class: 'coach-ic' }, icon(sk.ic, '', 'star')),
    h('div', { class: 'coach-mid' }, h('b', {}, t('coach.tip.' + tip.skill)), h('small', {}, sub),
      h('button', { class: 'btn small primary', onclick: () => { close(); Coach.start(tip.skill, true); } }, game ? t('coach.play') : t('coach.practise'))),
    h('button', { class: 'coach-x', 'aria-label': t('set.cancel'), onclick: close }, icon('x')));
  return pop;
}
