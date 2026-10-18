// Free ways to earn coins on top of the 20 per lesson: a daily chest (open
// it once a day after learning something), streak rewards (coins for weekly
// streak milestones) and achievements.

// ------------------------------------------------------------------ daily chest
// Mostly small, now and then big: 10 (40%), 15 (30%), 20 (20%), 30 (8%), 50 (2%).
const CHEST_PRIZES = [[10, 40], [15, 30], [20, 20], [30, 8], [50, 2]];
// You earn the chest by finishing a lesson, practice, game or flashcards today.
const markActive = () => { Store.data.activeDay = today(); };
const Chest = {
  state() {
    const d = Store.data;
    if (d.chestDay === today()) return 'opened';
    return d.activeDay === today() ? 'ready' : 'locked';
  },
  roll() {
    let r = Math.random() * 100;
    for (const [coins, chance] of CHEST_PRIZES) { if ((r -= chance) < 0) return coins; }
    return CHEST_PRIZES[0][0];
  },
  // The chest floating on the Learn tab: wiggles with a dot when it's ready.
  button() {
    const st = this.state();
    return h('button', { class: 'chest-btn ' + st, 'aria-label': t('chest.title'), onclick: () => this.open() },
      icon('chest', '', 'gift'), st === 'ready' ? h('i', { class: 'chest-dot' }) : null);
  },
  open() {
    const st = this.state();
    const host = App.openOverlay('chest');
    const art = h('div', { class: 'chest-art ' + st }, icon('chest', '', 'gift'));
    const msg = h('p', { class: 'muted' }, t(st === 'ready' ? 'chest.ready' : st === 'opened' ? 'chest.opened' : 'chest.locked'));
    const big = h('div', { class: 'chest-prize' });
    const btn = h('button', { class: 'btn primary wide big' }, st === 'ready' ? t('chest.open') : t('ex.continue'));
    host.replaceChildren(h('div', { class: 'chest-page' },
      h('div', { class: 'eyebrow' }, t('chest.title')),
      art, big, msg, btn,
      st === 'ready' ? null : h('div', { class: 'chest-odds' }, t('chest.odds'))));
    if (st !== 'ready') { btn.addEventListener('click', () => App.closeOverlay()); return; }
    let opened = false;
    btn.addEventListener('click', () => {
      if (opened) { App.closeOverlay(); return; }
      opened = true;
      btn.disabled = true;
      const coins = this.roll();
      const d = Store.data;
      d.chestDay = today();
      d.coins += coins;
      Store.save();
      art.classList.add('shake');
      Sfx.drumroll(800);
      setTimeout(() => {
        if (!art.isConnected) return;
        art.classList.remove('shake');
        art.classList.add('pop');
        Sfx.boom();
        Sfx.coin();
        const [x, y] = centerOf(art);
        goldBurst(x, y, true);
        big.replaceChildren(icon('coin'), h('b', {}, '+0'));
        countUp(big.querySelector('b'), coins, { prefix: '+', ms: 700 });
        msg.textContent = t('chest.got', { n: coins });
        if (coins >= 30) confetti(host);
        btn.disabled = false;
        btn.textContent = t('ex.continue');
      }, 850);
    });
  },
};

// ------------------------------------------------------------------ streak rewards
// Coins for reaching these weekly streaks (paid each time you reach them).
const STREAK_REWARDS = [[2, 50], [4, 100], [8, 200], [12, 300], [26, 500], [52, 1000]];
const streakReward = (n) => (STREAK_REWARDS.find(([w]) => w === n) || [0, 0])[1];

// ------------------------------------------------------------------ achievements
const sumCourses = (f) => Object.values(Store.data.courses || {}).reduce((n, c) => n + f(c), 0);
const METRICS = {
  lessons: () => sumCourses((c) => Object.keys(c.lessons || {}).length),
  perfect: () => sumCourses((c) => Object.values(c.lessons || {}).filter((l) => l.perfect).length),
  words: () => sumCourses((c) => Object.keys(c.words || {}).length),
  mastered: () => sumCourses((c) => Object.values(c.words || {}).filter((w) => w.box >= MASTERED_BOX).length),
  mountains: () => sumCourses((c) => Object.keys(c.mountains || {}).length),
  weeks: () => Store.data.weeksHit || 0,
  games: () => Store.data.gamesPlayed || 0,
  hours: () => Math.floor((Store.data.totalSecs || 0) / 3600),
  languages: () => new Set(Object.entries(Store.data.courses || {}).filter(([, c]) => Object.keys(c.lessons || {}).length).map(([p]) => p.split('>')[1])).size,
  clothes: () => (Store.data.wardrobe || []).length,
};
// id, picture, what it counts, how many, the words for it, coins.
const ACHIEVEMENTS = [
  ['lesson1', 'book', 'lessons', 1, 'ach.firstLesson', 20],
  ['lesson10', 'book', 'lessons', 10, 'ach.lessons', 50],
  ['lesson50', 'book', 'lessons', 50, 'ach.lessons', 150],
  ['lesson200', 'book', 'lessons', 200, 'ach.lessons', 500],
  ['words50', 'cards', 'words', 50, 'ach.words', 50],
  ['words200', 'cards', 'words', 200, 'ach.words', 100],
  ['words600', 'cards', 'words', 600, 'ach.words', 300],
  ['master100', 'star', 'mastered', 100, 'ach.mastered', 150],
  ['perfect5', 'target', 'perfect', 5, 'ach.perfect', 50],
  ['perfect25', 'target', 'perfect', 25, 'ach.perfect', 150],
  ['mtn1', 'flag', 'mountains', 1, 'ach.firstMountain', 100],
  ['mtn5', 'mountain', 'mountains', 5, 'ach.mountains', 300],
  ['mtn10', 'crown', 'mountains', 10, 'ach.allMountains', 1000],
  ['week1', 'calendar', 'weeks', 1, 'ach.firstWeek', 30],
  ['week10', 'calendar', 'weeks', 10, 'ach.weekGoals', 150],
  ['games10', 'swords', 'games', 10, 'ach.games', 50],
  ['hours5', 'headphones', 'hours', 5, 'ach.hours', 200],
  ['lang2', 'globe', 'languages', 2, 'ach.secondLang', 50],
  ['clothes1', 'bag', 'clothes', 1, 'ach.firstClothes', 20],
].map(([id, ic, metric, n, key, coins]) => ({ id, ic, metric, n, key, coins }));

const Achievements = {
  queue: [],
  showing: false,
  done: (a) => !!(Store.data.achievements || {})[a.id],
  value: (a) => Math.min(a.n, METRICS[a.metric]()),
  title: (a) => t(a.key, { n: fmtNum(a.n) }),
  // Hands out anything newly reached (called whenever progress is saved).
  check() {
    const d = Store.data;
    if (!d || !d.profile) return;
    d.achievements = d.achievements || {};
    for (const a of ACHIEVEMENTS) {
      if (d.achievements[a.id] || METRICS[a.metric]() < a.n) continue;
      d.achievements[a.id] = today();
      d.coins += a.coins;
      this.queue.push(a);
    }
    if (this.queue.length && !this.showing) setTimeout(() => this.next(), 400);
  },
  // A banner slides down from the top for each one, one after another.
  next() {
    const a = this.queue.shift();
    if (!a) { this.showing = false; return; }
    this.showing = true;
    const el = h('div', { class: 'ach-banner' },
      h('div', { class: 'ach-ic' }, icon(a.ic, '', 'trophy')),
      h('div', { class: 'ach-text' }, h('small', {}, t('ach.unlocked')), h('b', {}, this.title(a))),
      h('div', { class: 'ach-coins' }, icon('coin'), '+' + a.coins));
    document.body.append(el);
    Sfx.coin();
    setTimeout(() => Sfx.good(4), 120);
    Haptics.buzz([20, 40, 20]);
    setTimeout(() => { el.classList.add('out'); }, 2600);
    setTimeout(() => { el.remove(); this.next(); }, 3000);
  },
};

// ------------------------------------------------------------------ the achievements page
function awardsCard() {
  const got = ACHIEVEMENTS.filter((a) => Achievements.done(a));
  return h('button', { class: 'card awards-card', onclick: () => App.show('awards') },
    h('div', { class: 'pc-icon' }, icon('trophy')),
    h('div', { class: 'pc-text' }, h('b', {}, t('ach.title')), h('span', {}, t('ach.count', { n: got.length, of: ACHIEVEMENTS.length }))),
    h('div', { class: 'awards-mini' }, ...got.slice(-3).map((a) => icon(a.ic, '', 'trophy'))),
    icon('right'));
}

function renderAwards() {
  const d = Store.data;
  const best = (d.weekStreak && d.weekStreak.best) || 0;
  const now = Store.weekStreakNow();
  const got = ACHIEVEMENTS.filter((a) => Achievements.done(a)).length;
  // Not yet done first (closest to done at the top), then the ones you have.
  const list = [...ACHIEVEMENTS].sort((a, b) => (Achievements.done(a) - Achievements.done(b)) || (Achievements.value(b) / b.n - Achievements.value(a) / a.n));
  return h('div', { class: 'page awards-page' },
    h('div', { class: 'settings-head' },
      h('button', { class: 'icon-btn', 'aria-label': t('set.back'), onclick: () => App.show('me') }, icon('left')),
      h('h1', { class: 'page-title' }, t('ach.title'))),
    h('p', { class: 'muted' }, t('ach.intro')),

    h('h2', { class: 'section' }, t('streak.rewards')),
    h('div', { class: 'card streak-card' },
      h('div', { class: 'streak-now' }, icon('calendar'), h('b', {}, t('home.streak', { n: now })), h('span', { class: 'muted' }, t('streak.sub', { n: goalSecs() / 60 }))),
      h('div', { class: 'streak-steps' }, ...STREAK_REWARDS.map(([w, coins]) =>
        h('div', { class: 'streak-step' + (best >= w ? ' got' : '') },
          h('b', {}, t('streak.weeks', { n: w })),
          h('span', {}, best >= w ? icon('check') : icon('coin'), '+' + fmtNum(coins)))))),

    h('h2', { class: 'section' }, t('ach.title') + ' · ' + t('ach.count', { n: got, of: ACHIEVEMENTS.length })),
    h('div', { class: 'ach-list' }, ...list.map((a) => {
      const done = Achievements.done(a);
      const v = Achievements.value(a);
      return h('div', { class: 'card ach-row' + (done ? ' done' : '') },
        h('div', { class: 'ach-ic' }, icon(a.ic, '', 'trophy')),
        h('div', { class: 'ach-mid' },
          h('b', {}, Achievements.title(a)),
          done ? h('small', {}, t('ach.got', { date: fmtDate(d.achievements[a.id]) }))
            : h('div', { class: 'ach-prog' }, h('div', { class: 'bar' }, h('i', { style: { width: Math.round((v / a.n) * 100) + '%' } })), h('small', {}, `${fmtNum(v)} / ${fmtNum(a.n)}`))),
        h('div', { class: 'ach-coins' }, done ? icon('check') : icon('coin'), done ? '' : '+' + fmtNum(a.coins)));
    })));
}
