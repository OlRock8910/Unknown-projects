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

  // A finished mountain: show it for the first time, with its badge.
  revealMountain(m) {
    const host = this.openOverlay('reveal');
    const i = LP_COURSE.indexOf(m);
    const art = mountainArt(m, 'reveal-art');
    host.replaceChildren(h('div', { class: 'reveal' },
      h('div', { class: 'eyebrow' }, t('mtn.number', { n: i + 1 })),
      h('h1', {}, t('mtn.complete')),
      h('div', { class: 'reveal-frame' }, art, h('div', { class: 'reveal-cover' }, '?')),
      h('div', { class: 'reveal-name' }, m.name),
      h('div', { class: 'muted' }, `${fmtNum(m.height)} m`),
      h('div', { class: 'reveal-badge' }, badgeArt(m, 'big'), h('div', {}, h('b', {}, t('mtn.badge')), h('span', {}, t('mtn.badgeSub')))),
      h('div', { class: 'res-stats' }, stat('gem', '+20', t('res.gems'))),
      h('button', { class: 'btn primary wide', onclick: () => this.closeOverlay() }, t('ex.continue'))));
    const frame = host.querySelector('.reveal-frame');
    setTimeout(() => frame.classList.add('open'), 500);
    setTimeout(() => { if (frame.isConnected) { Sfx.win(); confetti(host); } }, 900);
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
    h('button', { class: 'tb-me', onclick: () => App.show('me') }, avatarArt(d.profile.avatar, 'sm'), h('span', { class: 'flag-chip' }, d.target.toUpperCase())),
    h('div', { class: 'tb-chips' },
      h('div', { class: 'chip streak' + (Store.weekStreakNow() ? ' on' : '') }, icon('calendar'), Store.weekStreakNow()),
      h('div', { class: 'chip coins' }, icon('coin'), fmtNum(d.coins)),
      h('div', { class: 'chip gems' }, icon('gem'), fmtNum(d.gems))));
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
function renderLearn() {
  const stats = courseStats();
  const next = nextLesson();
  const cur = currentMountain();
  const page = h('div', { class: 'page' }, topBar(), weekCard());

  page.append(h('div', { class: 'card course-strip' },
    h('div', { class: 'cs-top' }, h('b', {}, t('home.course', { lang: t('lang.' + Store.data.target) })), h('span', { class: 'cs-pct' }, stats.pct + '%')),
    h('div', { class: 'bar' }, h('i', { style: { width: stats.pct + '%' } })),
    h('div', { class: 'cs-nums' },
      h('span', {}, h('b', {}, fmtNum(stats.words)), ' ', t('home.words')),
      h('span', {}, h('b', {}, fmtNum(stats.mastered)), ' ', t('home.mastered')),
      h('span', {}, h('b', {}, `${stats.mountains}/${LP_COURSE.length}`), ' ', t('home.mountains')))));

  if (next) {
    const c = hostOf(next.unit);
    page.append(h('button', { class: 'continue', onclick: () => openLesson(next) },
      castArt(c.id, '', 'cont-cast'),
      h('div', { class: 'cont-text' },
        h('small', {}, stats.lessons ? t('home.continue') : t('home.start')),
        h('b', {}, next.unit.title),
        h('span', {}, next.kind === 'story' ? t('path.storyWith', { name: c.name }) : t('path.lesson', { n: next.n }) + ' · ' + t('path.newWords', { n: next.words.length }))),
      h('span', { class: 'cont-go' }, icon('play'))));
  }

  LP_COURSE.forEach((m, i) => {
    const done = mountainDone(m);
    if (done) {
      const units = mountainUnits(m);
      const card = h('div', { class: 'card mtn done' },
        h('div', { class: 'mtn-head' },
          mountainArt(m, 'mtn-thumb'),
          h('div', { class: 'mtn-title' }, h('small', {}, t('mtn.number', { n: i + 1 })), h('b', {}, m.name), h('span', {}, `${fmtNum(m.height)} m · ${t('mtn.climbed')}`)),
          badgeArt(m)),
        h('div', { class: 'units' }, ...units.map(unitRow)));
      card.querySelector('.mtn-head').addEventListener('click', () => card.classList.toggle('open'));
      page.append(card);
    } else if (m === cur) {
      page.append(h('div', { class: 'card mtn current' },
        h('div', { class: 'mtn-head' },
          h('div', { class: 'mtn-mystery' }, '?'),
          h('div', { class: 'mtn-title' }, h('small', {}, t('mtn.number', { n: i + 1 })), h('b', {}, t('mtn.hidden')), h('span', {}, t('mtn.hiddenSub')))),
        h('div', { class: 'units' }, ...mountainUnits(m).map(unitRow))));
    } else {
      page.append(h('div', { class: 'card mtn locked' },
        h('div', { class: 'mtn-head' }, h('div', { class: 'mtn-mystery' }, icon('lock')),
          h('div', { class: 'mtn-title' }, h('small', {}, t('mtn.number', { n: i + 1 })), h('b', {}, t('mtn.hidden')),
            h('span', {}, mountainUnits(m).map((u) => u.title).join(' · '))))));
    }
  });
  return page;
}

function unitRow(u) {
  const open = lessonOpen(u.lessons[0]);
  const next = nextLesson();
  const row = h('div', { class: 'unit' + (open ? '' : ' locked') + (unitDone(u) ? ' done' : '') },
    h('div', { class: 'unit-info' }, h('b', {}, u.title), h('small', {}, u.titleT && u.titleT !== u.title ? u.titleT : '')),
    h('div', { class: 'dots' }, ...u.lessons.map((l) => {
      const isDone = lessonDone(l.id), can = lessonOpen(l), isNext = next && next.id === l.id;
      const b = h('button', { class: 'dot' + (isDone ? ' done' : '') + (isNext ? ' next' : '') + (can ? '' : ' locked') + (l.kind === 'story' ? ' story' : ''), 'aria-label': l.kind === 'story' ? t('path.story') : t('path.lesson', { n: l.n }) },
        isDone ? icon('check') : !can ? icon('lock') : l.kind === 'story' ? icon('book') : String(l.n));
      b.addEventListener('click', () => { if (!can) { Sfx.bad(); toast(t('path.lockedMsg')); return; } openLesson(l); });
      return b;
    })));
  return row;
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
  { id: 'boost', ic: 'bolt', gems: 10, apply: () => { Store.data.boostUntil = Math.max(Date.now(), Store.data.boostUntil || 0) + 15 * 60e3; } },
  { id: 'freeze', ic: 'snowflake', gems: 20, max: () => (Store.data.freezes || 0) >= 2, apply: () => { Store.data.freezes = (Store.data.freezes || 0) + 1; } },
  { id: 'coinpack', ic: 'coin', gems: 5, apply: () => { Store.data.coins += 100; } },
];
const BANNERS = [['blue', 0], ['yellow', 200], ['coral', 200], ['ink', 400]];

function renderShop() {
  const d = Store.data;
  const wallet = h('div', { class: 'card wallet' },
    h('div', {}, icon('coin', 'big coin-c'), h('b', {}, fmtNum(d.coins)), h('small', {}, t('shop.coins'))),
    h('div', {}, icon('gem', 'big gem-c'), h('b', {}, fmtNum(d.gems)), h('small', {}, t('shop.gems'))));
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
        h('button', { class: 'btn small price', disabled: maxed || null, onclick: () => buy(it.gems, 'gems', it.apply) }, icon('gem'), it.gems));
    }),
    h('h2', { class: 'section' }, t('shop.avatars')),
    h('div', { class: 'avatar-grid' }, ...AVATARS.map((a) => {
      const owned = d.owned.includes(a.id), on = d.profile.avatar === a.id;
      const b = h('button', { class: 'avatar-item' + (on ? ' on' : '') }, avatarArt(a.id), h('span', {}, on ? t('shop.wearing') : owned ? t('shop.use') : h('span', { class: 'price-in' }, icon('coin'), fmtNum(a.cost))));
      b.addEventListener('click', () => {
        if (owned) { d.profile.avatar = a.id; Store.save(); App.refresh(); return; }
        buy(a.cost, 'coins', () => { d.owned.push(a.id); d.profile.avatar = a.id; });
      });
      return b;
    })),
    h('h2', { class: 'section' }, t('shop.banners')),
    h('div', { class: 'banner-grid' }, ...BANNERS.map(([id, cost]) => {
      const owned = !cost || d.owned.includes('banner-' + id), on = (d.profile.banner || 'blue') === id;
      const b = h('button', { class: 'banner-item b-' + id + (on ? ' on' : '') }, on ? t('shop.wearing') : owned ? t('shop.use') : h('span', { class: 'price-in' }, icon('coin'), fmtNum(cost)));
      b.addEventListener('click', () => {
        if (owned) { d.profile.banner = id; Store.save(); App.refresh(); return; }
        buy(cost, 'coins', () => { d.owned.push('banner-' + id); d.profile.banner = id; });
      });
      return b;
    })));
}

// ------------------------------------------------------------------ Me tab
function profileBanner(p, opts = {}) {
  const badges = (opts.badges || LP_COURSE.filter((m) => Object.values(Store.data.courses).some((c) => c.mountains && c.mountains[m.id])));
  return h('div', { class: 'banner b-' + (p.banner || 'blue') },
    avatarArt(p.avatar, 'lg'),
    h('div', { class: 'banner-text' },
      h('b', { class: 'banner-name' }, p.name),
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
  const rate = h('input', { type: 'range', min: '0.5', max: '1.2', step: '0.1', value: String(Store.s.rate) });
  rate.addEventListener('change', () => { Store.s.rate = parseFloat(rate.value); Store.save(); Voice.say(C.units[0].sentences[0].t, { force: true }); });
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
      h('label', { class: 'setting col' }, h('span', {}, t('me.speed')), rate),
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
