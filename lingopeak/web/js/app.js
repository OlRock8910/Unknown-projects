// Screens, navigation and the Android back button.

const App = {
  tab: 'learn',
  overlayKind: null,
  overlayCleanup: null,

  init() {
    Store.load();
    UI.lang = Store.data.native || guessLang();
    Theme.apply();
    document.addEventListener('pointerdown', () => Sfx.ensure(), { once: true });
    window.appBack = () => this.back();
    window.onVoicesChanged = () => { if (!this.overlayKind) this.refresh(); };
    if (typeof Cloud !== 'undefined') Cloud.init();
    if (!Store.data.profile || !Store.data.target) return Onboarding.start();
    this.enter();
  },
  // Into the app proper, once there's a profile.
  enter() {
    UI.lang = Store.data.native;
    buildCourse();
    document.documentElement.lang = UI.lang;
    $('#tabs').hidden = false;
    $('#tabs').replaceChildren(...[['learn', 'mountain'], ['practice', 'dumbbell'], ['ranks', 'trophy'], ['shop', 'bag'], ['me', 'user']].map(([id, ic]) => {
      const b = h('button', { 'data-tab': id }, icon(ic), h('span', {}, t('tab.' + id)));
      b.addEventListener('click', () => this.show(id));
      return b;
    }));
    this.show('learn');
    Widget.update();
  },

  show(tab) {
    Sfx.tap();
    this.tab = tab;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const view = $('#view');
    view.scrollTop = 0;
    view.replaceChildren({ learn: renderLearn, practice: renderPractice, ranks: renderRanks, shop: renderShop, me: renderMe }[tab]());
    if (tab === 'learn') requestAnimationFrame(() => {
      const stop = view.querySelector('.stop.next');
      if (stop) view.scrollTop += stop.getBoundingClientRect().top - view.clientHeight * 0.55;
    });
  },
  refresh() { if (Store.data.profile && C) this.show(this.tab); },

  openOverlay(kind) {
    if (this.overlayCleanup) { const f = this.overlayCleanup; this.overlayCleanup = null; f(); }
    this.overlayKind = kind;
    const o = $('#overlay');
    o.classList.add('open');
    o.replaceChildren();
    return o;
  },
  closeOverlay() {
    if (this.overlayCleanup) { const f = this.overlayCleanup; this.overlayCleanup = null; f(); }
    this.overlayKind = null;
    const o = $('#overlay');
    o.classList.remove('open');
    o.replaceChildren();
    this.refresh();
  },

  // Android back button. Returns true when handled, false to leave the app.
  back() {
    if (Onboarding.active) return Onboarding.back();
    if (this.overlayKind === 'game' && Games.session) { Games.session.quit(); return true; }
    if (this.overlayKind) { this.closeOverlay(); return true; }
    if (this.tab !== 'learn') { this.show('learn'); return true; }
    return false;
  },

  celebrateWeek() {
    Sfx.win();
    toast(t('week.reached', { n: Store.weekStreakNow() }), 3500);
  },

  // A finished mountain: a drum roll, the clouds part, and its name and badge.
  // opts.again: just looking at a mountain climbed before.
  revealMountain(m, opts = {}) {
    const host = this.openOverlay('reveal');
    const i = LP_COURSE.indexOf(m);
    const name = h('div', { class: 'reveal-name' }, opts.again ? m.name : '');
    const badge = h('div', { class: 'reveal-badge' + (opts.again ? ' in' : '') }, badgeArt(m, 'big'), h('div', {}, h('b', {}, t('mtn.badge')), h('span', {}, t('mtn.badgeSub'))));
    const gems = opts.again ? null : h('div', { class: 'res-stats' }, stat('coin', '+' + MOUNTAIN_COINS, t('res.coins')));
    host.replaceChildren(h('div', { class: 'reveal' },
      h('div', { class: 'eyebrow' }, t('mtn.number', { n: i + 1 })),
      h('h1', {}, t('mtn.complete')),
      h('div', { class: 'reveal-frame' + (opts.again ? ' open' : '') }, mountainArt(m, 'reveal-art'), h('div', { class: 'reveal-cover' }, artImg('icons/cloud.webp', 'cloud-img') || h('div', { class: 'cloud-shape' }), h('div', { class: 'cloud-q' }, '?'))),
      name,
      h('div', { class: 'muted' }, `${fmtNum(m.height)} m`),
      badge, gems,
      h('button', { class: 'btn primary wide big', onclick: () => this.closeOverlay() }, t('ex.continue'))));
    if (opts.again) return;
    const frame = host.querySelector('.reveal-frame');
    Sfx.drumroll(1300);
    setTimeout(() => {
      if (!frame.isConnected) return;
      frame.classList.add('open');
      Sfx.fanfare();
      const [x, y] = centerOf(frame);
      goldBurst(x, y, true);
      confetti(host);
      // The name types itself in.
      [...m.name].forEach((ch, k) => setTimeout(() => { name.textContent += ch; Sfx.tick(); }, 300 + k * 70));
      setTimeout(() => { badge.classList.add('in'); Sfx.coin(); const [bx, by] = centerOf(badge); goldBurst(bx, by); }, 600 + m.name.length * 70);
    }, 1350);
  },
};

// ------------------------------------------------------------------ theme
const Theme = {
  apply() {
    const pref = Store.s.theme;
    const dark = pref === 'dark' || (pref === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { if (window.Native && window.Native.setBars) window.Native.setBars(dark); } catch (e) { /* ignore */ }
  },
};
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => Theme.apply());

function guessLang() {
  const nav = (navigator.language || 'en').slice(0, 2);
  return LANGS.includes(nav) ? nav : 'en';
}

// ------------------------------------------------------------------ shared pieces
function topBar() {
  const d = Store.data;
  return h('header', { class: 'topbar' },
    h('button', { class: 'tb-me', onclick: () => App.show('me') }, lookAvatar(myLook(), 'sm'), h('span', { class: 'flag-chip' }, d.target.toUpperCase())),
    h('div', { class: 'tb-chips' },
      h('div', { class: 'chip streak' + (Store.weekStreakNow() ? ' on' : '') }, icon('calendar'), Store.weekStreakNow()),
      h('div', { class: 'chip coins' }, icon('coin'), fmtNum(d.coins))));
}

function ring(frac, label, size = 84) {
  const r = 34, c = 2 * Math.PI * r;
  return h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' }, html: `<svg viewBox="0 0 80 80">
    <circle cx="40" cy="40" r="${r}" class="ring-bg"/>
    <circle cx="40" cy="40" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - clamp(frac, 0, 1))}"/>
  </svg><span>${label}</span>` });
}

function weekCard() {
  const d = Store.data;
  const mins = Math.floor(d.week.secs / 60), goal = WEEKLY_GOAL_SECS / 60;
  const done = d.week.secs >= WEEKLY_GOAL_SECS;
  const streak = Store.weekStreakNow();
  return h('div', { class: 'card week' },
    ring(d.week.secs / WEEKLY_GOAL_SECS, done ? '' : `${mins}<small>/${goal}</small>`),
    done ? h('div', { class: 'ring-check' }, icon('check')) : null,
    h('div', { class: 'week-text' },
      h('b', {}, done ? t('home.weekDone') : t('home.weekGoal')),
      h('span', {}, done ? t('home.weekDoneSub') : t(daysLeftInWeek() === 1 ? 'home.minsLeftLast' : 'home.minsLeft', { n: Math.max(0, goal - mins), d: daysLeftInWeek() })),
      h('div', { class: 'week-streak' }, icon('calendar'), streak ? t('home.streak', { n: streak }) : t('home.noStreak'))));
}

// ------------------------------------------------------------------ Learn tab
// One mountain at a time: your lessons are stops on a trail up it, the top
// stays in the clouds (and the mountain unnamed) until you reach it, and the
// next mountain only appears once this one is climbed.
const STOP_GAP = 96;

function renderLearn() {
  const d = Store.data;
  const stats = courseStats();
  const m = currentMountain();
  const page = h('div', { class: 'page learn' }, topBar());
  if (!m) {
    page.append(h('div', { class: 'all-done' }, castArt('banana', 'happy', 'done-cast'), h('h1', {}, t('mtn.allDone')), h('p', { class: 'muted' }, t('mtn.allDoneSub'))), climbedRow() || '');
    return page;
  }
  const mi = LP_COURSE.indexOf(m);
  const lessons = C.lessons.filter((l) => l.unit.mountain === m);
  const done = lessons.filter((l) => lessonDone(l.id)).length;
  const next = nextLesson();
  const altitude = Math.round((m.height * done) / lessons.length);

  // Heading: which mountain, how high you are, this week.
  const mins = Math.floor(d.week.secs / 60), goal = WEEKLY_GOAL_SECS / 60;
  page.append(
    h('div', { class: 'mtn-heading' },
      h('div', { class: 'eyebrow' }, t('mtn.numberOf', { n: mi + 1, of: LP_COURSE.length })),
      h('h1', {}, t('mtn.hidden')),
      h('div', { class: 'alt' }, h('b', {}, `${fmtNum(altitude)} m`), h('span', {}, t('mtn.climbedPct', { n: Math.floor((done / lessons.length) * 100) })))),
    h('button', { class: 'week-strip', onclick: () => toast(t('onb.goalSub'), 3500) },
      ring(d.week.secs / WEEKLY_GOAL_SECS, d.week.secs >= WEEKLY_GOAL_SECS ? '' : String(mins), 46),
      h('div', {}, h('b', {}, d.week.secs >= WEEKLY_GOAL_SECS ? t('home.weekDone') : t('home.minsOf', { n: mins, goal })),
        h('span', {}, Store.weekStreakNow() ? t('home.streak', { n: Store.weekStreakNow() }) : t('home.noStreak'))),
      h('div', { class: 'ws-pct' }, h('b', {}, stats.pct + '%'), h('span', {}, t('lang.' + d.target)))));

  page.append(mountainView(m, lessons, next));
  const climbed = climbedRow();
  if (climbed) page.append(climbed);
  if (next) {
    page.append(h('div', { class: 'go-bar' }, h('button', { class: 'btn primary wide big', onclick: () => openLesson(next) },
      h('span', {}, next.kind === 'story' ? t('path.storyWith', { name: hostOf(next.unit).name }) : `${next.unit.title} · ${t('path.lesson', { n: next.n })}`),
      h('small', {}, stats.lessons ? t('home.continue') : t('home.start')))));
  }
  return page;
}

// The side of the mountain, one section per unit, climbing north-east: the
// trail runs up the ridge from bottom left to top right, and the scenery
// changes as you go up (grass and dirt, forest, rock, cliffs, snow). The
// summit stays in the clouds until you reach it.
const ZONES = [
  { body: ['#86BD5E', '#4F8A3A'], edge: '#8B5A2B', strata: '#3E6B2D', decor: ['tree', 'rock', 'tree', 'bush'] },
  { body: ['#5E9A4A', '#3D6E33'], edge: '#7A5230', strata: '#2F5226', decor: ['tree', 'cabin', 'tree', 'tree'] },
  { body: ['#928D88', '#615C58'], edge: '#6B5A4A', strata: '#3F3B38', decor: ['rock', 'tree', 'rock', 'cabin'] },
  { body: ['#77737C', '#4C4852'], edge: '#E9EEF5', strata: '#2E2B33', decor: ['rock', 'flag', 'rock', 'rock'] },
  { body: ['#E2EAF4', '#B6C4D8'], edge: '#FFFFFF', strata: '#8FA0B8', decor: ['rock', 'flag', 'snow', 'rock'] },
];
const DECOR = {
  tree: '<svg viewBox="0 0 40 52"><rect x="17" y="38" width="6" height="12" fill="#6B4423" stroke="#1B1D2A" stroke-width="2"/><path d="M20 2 L36 40 H4Z" fill="#3E7D3A" stroke="#1B1D2A" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 12 L30 36 H10Z" fill="#4E9446"/></svg>',
  bush: '<svg viewBox="0 0 44 26"><path d="M4 24 Q2 10 14 10 Q18 2 26 6 Q38 4 40 24Z" fill="#4E9446" stroke="#1B1D2A" stroke-width="2.4" stroke-linejoin="round"/></svg>',
  rock: '<svg viewBox="0 0 44 30"><path d="M3 28 L10 12 L20 6 L32 9 L41 28Z" fill="#8F8A86" stroke="#1B1D2A" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 6 L24 18 L32 9" fill="none" stroke="#6F6A66" stroke-width="2"/></svg>',
  cabin: '<svg viewBox="0 0 46 40"><path d="M6 18 L23 4 L40 18 V38 H6Z" fill="#B9772F" stroke="#1B1D2A" stroke-width="2.4" stroke-linejoin="round"/><path d="M2 20 L23 2 L44 20" fill="none" stroke="#FF5A4E" stroke-width="5" stroke-linecap="round"/><rect x="18" y="24" width="10" height="14" fill="#1B1D2A"/></svg>',
  flag: '<svg viewBox="0 0 30 44"><path d="M5 42 V4" stroke="#1B1D2A" stroke-width="3" stroke-linecap="round"/><path d="M6 5 L27 11 L6 18Z" fill="#FF5A4E" stroke="#1B1D2A" stroke-width="2" stroke-linejoin="round"/></svg>',
  snow: '<svg viewBox="0 0 44 22"><path d="M2 20 Q8 6 18 10 Q26 2 34 8 Q42 8 42 20Z" fill="#FFFFFF" stroke="#8FA0B8" stroke-width="2"/></svg>',
  cloud: '<svg viewBox="0 0 80 36"><path d="M10 32 Q0 32 4 22 Q6 14 16 16 Q20 4 34 6 Q46 0 52 12 Q66 8 70 20 Q80 22 74 32Z" fill="#FFFFFF" opacity=".9"/></svg>',
  bird: '<svg viewBox="0 0 24 10"><path d="M2 8 Q7 1 12 7 Q17 1 22 8" fill="none" stroke="#1B1D2A" stroke-width="2" stroke-linecap="round"/></svg>',
};
const ridgeX = (f) => 4 + 92 * f;
const ridgeY = (f) => 96 - 88 * f;

function mountainView(m, lessons, next) {
  const units = [...new Set(lessons.map((l) => l.unit))];
  const col = h('div', { class: 'mountain-side' });
  units.forEach((u, ui) => col.append(campSection(u, ui, units.length, next)));
  return col;
}

function campSection(u, ui, count, next) {
  const z = ZONES[Math.min(ZONES.length - 1, ui)];
  const top = ui === count - 1;
  const ls = u.lessons;
  const H = ls.length * 116 + (top ? 150 : 70);
  const fAt = (k) => (top ? 0.08 : 0.12) + ((top ? 0.62 : 0.76) * k) / (ls.length - 1);
  // The ridge, a little jagged, and the cliff face below it with rock layers.
  const steps = 18;
  const fMax = top ? 0.86 : 1;
  const ridge = Array.from({ length: steps + 1 }, (_, k) => {
    const f = (k / steps) * fMax;
    return [ridgeX(f), ridgeY(f) + (k && k < steps ? (k % 3 === 1 ? 1.4 : k % 3 === 2 ? -1 : 0) : 0)];
  });
  if (top) ridge.push([ridgeX(fMax) + 3, 2]); // the summit, hidden in cloud
  const pts = (ps) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const shifted = (dy) => ridge.map(([x, y]) => [x, Math.min(100, y + dy)]);
  const gid = 'zg' + u.id.replace(/\W/g, '');
  const svg = `<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${z.body[0]}"/><stop offset="1" stop-color="${z.body[1]}"/></linearGradient></defs>
    <polygon points="0,100 ${pts(ridge)} 100,${top ? 2 : 0} 100,100" fill="url(#${gid})"/>
    <polygon points="${pts([...shifted(15), ...shifted(18).reverse()])}" fill="${z.strata}" opacity=".3"/>
    <polygon points="${pts([...shifted(33), ...shifted(35).reverse()])}" fill="${z.strata}" opacity=".25"/>
    <polygon points="${pts([...shifted(54), ...shifted(57).reverse()])}" fill="${z.strata}" opacity=".2"/>
    <polygon points="${pts([...ridge, ...shifted(ui >= 3 ? 4.5 : 3).reverse()])}" fill="${z.edge}"/>
  </svg>`;
  const scene = h('div', { class: 'scene', style: { height: H + 'px' } }, h('div', { class: 'scene-art', html: svg }));
  const place = (f, cls, child, dx = 0, dy = 0) => {
    const el = h('div', { class: cls, style: { left: `calc(${ridgeX(f)}% + ${dx}px)`, top: `calc(${ridgeY(f)}% + ${dy}px)` } }, child);
    scene.append(el);
    return el;
  };
  // Scenery on the slope and in the sky.
  z.decor.forEach((d, k) => {
    const f = 0.18 + k * 0.2;
    const depth = 46 + ((k * 31 + ui * 17) % 3) * 30;
    const nearStop = ls.some((l, j) => Math.abs(fAt(j) - f) < 0.09) && depth < 80;
    if (!nearStop && ridgeY(f) + (depth / H) * 100 < 94 && f < (top ? 0.75 : 0.95)) place(f, 'decor', h('div', { html: DECOR[d] }), 14 + (k % 2) * 16, depth);
  });
  [[10, 12], [36, 30], [18, 48]].slice(0, 2 + (ui % 2)).forEach(([x, y], k) => {
    scene.append(h('div', { class: 'sky-bit' + (k === 2 ? ' bird' : ''), style: { left: x + (ui * 7) % 20 + '%', top: y + '%' }, html: DECOR[k === 2 ? 'bird' : 'cloud'] }));
  });
  // The lessons, on the ridge.
  ls.forEach((l, k) => {
    const isDone = lessonDone(l.id), open = lessonOpen(l), isNext = next && next.id === l.id;
    const btn = h('button', {
      class: 'stop' + (isDone ? ' done' : '') + (isNext ? ' next' : '') + (open ? '' : ' locked') + (l.kind === 'story' ? ' story' : ''),
      'data-lesson': l.id, 'aria-label': `${u.title} ${l.kind === 'story' ? t('path.story') : t('path.lesson', { n: l.n })}`,
    }, isDone ? icon('check') : !open ? icon('lock') : l.kind === 'story' ? icon('book') : String(l.n));
    btn.addEventListener('click', () => {
      if (!open) { Sfx.bad(); toast(t('path.lockedMsg')); return; }
      Sfx.select();
      openLesson(l);
    });
    place(fAt(k), 'stop-spot', btn);
    if (isNext) place(fAt(k), 'you', lookAvatar(myLook(), 'sm'), 0, -62);
  });
  if (top) {
    const peak = place(fMax, 'peak-cloud', [h('div', { class: 'cloud-shape' }), h('div', { class: 'cloud-q' }, '?')], 0, -20);
    peak.style.top = '10px';
  }
  // The camp's name, up in the sky.
  const done = ls.filter((l) => lessonDone(l.id)).length;
  scene.append(h('div', { class: 'camp-tag' + (lessonOpen(ls[0]) ? '' : ' locked') },
    h('small', {}, t('path.unit', { n: ui + 1 })), h('b', {}, u.title), h('span', {}, `${done}/${ls.length}`)));
  return h('section', { class: 'camp z' + ui }, scene);
}

// Badges for the mountains you've climbed (tap to see one again).
function climbedRow() {
  const climbed = LP_COURSE.filter(mountainDone);
  if (!climbed.length) return null;
  return h('div', { class: 'climbed' },
    h('h2', { class: 'section' }, t('mtn.climbedList')),
    h('div', { class: 'climbed-row' }, ...climbed.map((m) => {
      const b = h('button', { class: 'climbed-item' }, badgeArt(m), h('span', {}, m.name), h('small', {}, `${fmtNum(m.height)} m`));
      b.addEventListener('click', () => App.revealMountain(m, { again: true }));
      return b;
    })));
}

// ------------------------------------------------------------------ Practice tab
function renderPractice() {
  const stats = courseStats();
  const learned = stats.words;
  const card = (kind, ic, title, sub, enabled = true) => {
    const b = h('button', { class: 'card practice-card' + (enabled ? '' : ' off') }, h('div', { class: 'pc-icon' }, icon(ic)), h('div', { class: 'pc-text' }, h('b', {}, title), h('span', {}, sub)), icon('right', 'chev'));
    b.addEventListener('click', () => { if (!enabled) { toast(t('practice.learnFirst')); return; } openPractice(kind); });
    return b;
  };
  return h('div', { class: 'page' }, topBar(),
    h('h1', { class: 'page-title' }, t('tab.practice')),
    card('review', 'refresh', t('practice.review'), stats.due ? t('practice.dueN', { n: stats.due }) : t('practice.noneDue'), learned >= 4),
    card('weak', 'target', t('practice.weak'), t('practice.weakSub'), learned >= 4),
    speakable() ? card('listen', 'headphones', t('practice.listen'), t('practice.listenSub'), learned >= 4) : null,
    h('button', { class: 'card practice-card', onclick: () => openCards() }, h('div', { class: 'pc-icon' }, icon('cards')), h('div', { class: 'pc-text' }, h('b', {}, t('practice.cards')), h('span', {}, t('practice.cardsSub'))), icon('right', 'chev')),
    typeof renderGamesList === 'function' ? renderGamesList() : null);
}

// Flashcards of the words you've learned (or the first unit's, to start with).
function openCards() {
  const pool = learnedWords().length >= 4 ? weakWords() : C.units[0].words;
  const deck = pool.slice(0, 15);
  const host = App.openOverlay('cards');
  Timer.start();
  App.overlayCleanup = () => Timer.stop();
  let i = 0, known = 0;
  const show = () => {
    if (i >= deck.length) {
      const coins = 3 + known;
      Store.data.coins += coins;
      Store.addXp(5);
      Store.save();
      host.replaceChildren(h('div', { class: 'results' }, castArt('penguin', 'happy', 'res-cast'), h('h1', {}, t('cards.done')),
        h('div', { class: 'muted' }, t('cards.knew', { n: known, of: deck.length })),
        h('div', { class: 'res-stats' }, stat('coin', '+' + coins, t('res.coins'))),
        h('button', { class: 'btn primary wide', onclick: () => App.closeOverlay() }, t('ex.continue'))));
      return;
    }
    const w = deck[i];
    const cardEl = h('button', { class: 'flash' },
      h('div', { class: 'flash-inner' },
        h('div', { class: 'flash-face front' }, h('div', { class: 'prompt-word' }, w.t), h('small', { class: 'muted' }, t('cards.tap'))),
        h('div', { class: 'flash-face back' }, h('div', { class: 'prompt-word' }, w.n), w.art ? h('div', { class: 'chip' }, genderNote(w)) : null)));
    cardEl.addEventListener('click', () => { cardEl.classList.toggle('flipped'); Sfx.flip(); });
    const judge = (ok) => { gradeWord(w, ok); if (ok) known++; i++; show(); };
    host.replaceChildren(h('div', { class: 'session' },
      h('div', { class: 'ses-top' }, h('button', { class: 'icon-btn', onclick: () => App.closeOverlay() }, icon('x')),
        h('div', { class: 'progress' }, h('i', { style: { width: (i / deck.length) * 100 + '%' } })), sayBtn(w.t)),
      h('div', { class: 'ses-body center' }, cardEl),
      h('div', { class: 'ses-foot' }, h('div', { class: 'foot-btns' },
        h('button', { class: 'btn ghost', onclick: () => judge(false) }, t('cards.again')),
        h('button', { class: 'btn primary', onclick: () => judge(true) }, t('cards.know'))))));
    Voice.say(w.t);
  };
  show();
}

// ------------------------------------------------------------------ Shop tab
const SHOP_ITEMS = [
  { id: 'boost', ic: 'bolt', cost: 150, apply: () => { Store.data.boostUntil = Math.max(Date.now(), Store.data.boostUntil || 0) + 15 * 60e3; } },
  { id: 'freeze', ic: 'snowflake', cost: 300, max: () => (Store.data.freezes || 0) >= 2, apply: () => { Store.data.freezes = (Store.data.freezes || 0) + 1; } },
];

function renderShop() {
  const d = Store.data;
  const wallet = h('div', { class: 'card wallet' },
    h('div', {}, icon('coin', 'big coin-c'), h('b', {}, fmtNum(d.coins)), h('small', {}, t('shop.coins'))),
    h('div', {}, icon('bolt', 'big gem-c'), h('b', {}, fmtNum(d.xp)), h('small', {}, 'XP')));
  const buy = (cost, cur, fn) => {
    if (d[cur] < cost) { Sfx.bad(); toast(t('shop.short', { n: cost - d[cur], cur: t('shop.' + cur) })); return; }
    d[cur] -= cost;
    fn();
    Sfx.coin();
    Store.save();
    App.refresh();
  };
  return h('div', { class: 'page' }, topBar(),
    h('h1', { class: 'page-title' }, t('tab.shop')),
    h('p', { class: 'muted' }, t('shop.intro')),
    wallet,
    h('h2', { class: 'section' }, t('shop.powerups')),
    ...SHOP_ITEMS.map((it) => {
      const maxed = it.max && it.max();
      const extra = it.id === 'boost' && Store.boosted() ? t('shop.boostOn', { n: Math.ceil((d.boostUntil - Date.now()) / 60e3) }) : it.id === 'freeze' ? t('shop.have', { n: d.freezes || 0 }) : '';
      return h('div', { class: 'card shop-row' },
        h('div', { class: 'pc-icon' }, icon(it.ic)),
        h('div', { class: 'pc-text' }, h('b', {}, t('shop.' + it.id)), h('span', {}, t('shop.' + it.id + 'Sub')), extra ? h('em', {}, extra) : null),
        h('button', { class: 'btn small price', disabled: maxed || null, onclick: () => buy(it.cost, 'coins', it.apply) }, icon('coin'), fmtNum(it.cost)));
    }),
    h('h2', { class: 'section' }, t('look.wardrobe')),
    h('p', { class: 'muted' }, t('look.wardrobeSub')),
    lookBuilder(myLook(), (look) => { d.profile.look = look; Store.save(); wallet.querySelector('b').textContent = fmtNum(d.coins); }, { shop: true }));
}

// ------------------------------------------------------------------ Me tab
// Changing your username (it has to be one nobody else has).
async function renameMe() {
  const name = (prompt(t('me.rename'), Store.data.profile.name) || '').trim();
  if (!name || name === Store.data.profile.name) return;
  if (!validName(name)) { toast(t('onb.nameErr')); return; }
  if ((await Cloud.nameFree(name)) === false) { toast(t('onb.nameTaken')); return; }
  Store.data.profile.name = name;
  Store.save();
  App.refresh();
}

function profileBanner(p, opts = {}) {
  const badges = (opts.badges || LP_COURSE.filter((m) => Object.values(Store.data.courses).some((c) => c.mountains && c.mountains[m.id])));
  return h('div', { class: 'banner b-' + (p.banner || 'blue') },
    lookAvatar(p.look, 'lg'),
    h('div', { class: 'banner-text' },
      h('button', { class: 'banner-name', onclick: () => renameMe() }, p.name),
      h('div', { class: 'banner-badges' }, badges.length ? badges.map((m) => badgeArt(m, 'xs')) : h('small', {}, t('me.noBadges')))));
}

function renderMe() {
  const d = Store.data;
  const s = courseStats();
  const lv = Store.level();
  const toggle = (key, label) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = !!Store.s[key];
    input.addEventListener('change', () => { Store.s[key] = input.checked; Store.save(); Sfx.tap(); });
    return h('label', { class: 'setting' }, h('span', {}, label), h('span', { class: 'switch' }, input, h('i')));
  };
  const seg = (key, opts, onChange) => h('div', { class: 'seg' }, ...opts.map(([v, label]) => h('button', {
    class: Store.s[key] === v ? 'on' : '',
    onclick: () => { Store.s[key] = v; Store.save(); onChange && onChange(); App.refresh(); },
  }, label)));
  const mins = Math.round((d.totalSecs || 0) / 60);
  return h('div', { class: 'page' },
    profileBanner(d.profile),
    h('div', { class: 'stat-grid' },
      stat('mountain', s.pct + '%', t('me.course', { lang: t('lang.' + d.target) })),
      stat('book', fmtNum(s.words), t('home.words')),
      stat('star', fmtNum(s.mastered), t('home.mastered')),
      stat('calendar', Store.weekStreakNow(), t('me.weekStreak')),
      stat('bolt', fmtNum(d.xp), t('me.level', { n: lv.lvl })),
      stat('clock', t('res.mins', { n: mins }), t('me.time'))),
    h('h2', { class: 'section' }, t('me.languages')),
    h('div', { class: 'card lang-card' },
      h('div', { class: 'lang-pair' }, h('span', {}, t('lang.' + d.native)), icon('right'), h('b', {}, t('lang.' + d.target))),
      h('button', { class: 'btn ghost small', onclick: () => Onboarding.start(1) }, t('me.change'))),
    h('h2', { class: 'section' }, t('me.settings')),
    h('div', { class: 'card settings' },
      h('div', { class: 'setting' }, h('span', {}, t('me.theme')), seg('theme', [['light', t('me.light')], ['dark', t('me.dark')], ['system', t('me.auto')]], () => Theme.apply())),
      toggle('sound', t('me.sound')),
      toggle('vibrate', t('me.vibrate')),
      toggle('voice', t('me.voice')),
      h('div', { class: 'setting' }, h('span', {}, t('me.speed')), seg('rate', [[0.65, t('me.slow')], [0.9, t('me.normal')], [1.15, t('me.fast')]], () => setTimeout(() => Voice.say(C.units[0].sentences[0].t, { force: true }), 100))),
      Voice.native() && Voice.state() !== 'ok' ? h('button', { class: 'btn ghost small', onclick: () => Voice.install() }, t('me.getVoice')) : null),
    h('h2', { class: 'section' }, t('me.account')),
    typeof accountCard === 'function' ? accountCard() : null,
    h('button', { class: 'btn ghost wide', onclick: () => Share.send(t('share.invite')) }, icon('share'), t('me.invite')),
    h('button', {
      class: 'btn danger wide',
      onclick: () => { if (confirm(t('me.resetQ'))) { localStorage.removeItem(Store.KEY); location.reload(); } },
    }, t('me.reset')),
    h('div', { class: 'foot-note' }, 'Lingo Peak'));
}

// ------------------------------------------------------------------ Ranks tab
function renderRanks() {
  return h('div', { class: 'page' }, topBar(),
    h('h1', { class: 'page-title' }, t('tab.ranks')),
    typeof leaderboardView === 'function' ? leaderboardView() : h('div', { class: 'card muted' }, t('ranks.offline')));
}

window.addEventListener('DOMContentLoaded', () => App.init());
