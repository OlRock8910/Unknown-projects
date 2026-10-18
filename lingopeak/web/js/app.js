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

  // keep: redraw in place, staying where you've scrolled to.
  show(tab, keep = false) {
    if (!keep) Sfx.tap();
    this.tab = tab;
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === (tab === 'settings' ? 'me' : tab)));
    const view = $('#view');
    const top = view.scrollTop;
    view.replaceChildren({ learn: renderLearn, practice: renderPractice, ranks: renderRanks, shop: renderShop, me: renderMe, settings: renderSettings }[tab]());
    view.firstChild.classList.toggle('still', keep);
    if (keep) { view.scrollTop = top; return; }
    view.scrollTop = 0;
    if (tab === 'learn') requestAnimationFrame(() => {
      const stop = view.querySelector('.stop.next');
      if (stop) view.scrollTop += stop.getBoundingClientRect().top - view.clientHeight * 0.55;
    });
  },
  refresh() { if (Store.data.profile && C) this.show(this.tab, true); },

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
    if (this.tab === 'settings') { this.show('me'); return true; }
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
    document.documentElement.dataset.text = Store.s.text || 'normal';
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
  const mins = Math.floor(d.week.secs / 60), goal = goalSecs() / 60;
  const done = d.week.secs >= goalSecs();
  const streak = Store.weekStreakNow();
  return h('div', { class: 'card week' },
    ring(d.week.secs / goalSecs(), done ? '' : `${mins}<small>/${goal}</small>`),
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
  const mins = Math.floor(d.week.secs / 60), goal = goalSecs() / 60;
  page.append(
    h('div', { class: 'mtn-heading' },
      h('div', { class: 'eyebrow' }, t('mtn.numberOf', { n: mi + 1, of: LP_COURSE.length })),
      h('h1', {}, m.name),
      h('div', { class: 'alt' }, h('b', {}, `${fmtNum(altitude)} m`), h('span', {}, t('mtn.climbedPct', { n: Math.floor((done / lessons.length) * 100) })))),
    h('button', { class: 'week-strip', onclick: () => toast(t('onb.goalSub'), 3500) },
      ring(d.week.secs / goalSecs(), d.week.secs >= goalSecs() ? '' : String(mins), 46),
      h('div', {}, h('b', {}, d.week.secs >= goalSecs() ? t('home.weekDone') : t('home.minsOf', { n: mins, goal })),
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

// One mountain, seen from the side: a single ridge climbing north-east from
// the bottom of the screen to the summit, with every lesson on it. The
// scenery changes as you climb (grass, forest, rock, snow), birds fly low
// down, planes higher up and a rocket near the top, and the summit has a
// flag with the mountain's name.
const DECOR = {
  tree: '<svg viewBox="0 0 40 52"><rect x="17" y="38" width="6" height="12" fill="#6B4423" stroke="#1B1D2A" stroke-width="2"/><path d="M20 2 L36 40 H4Z" fill="#3E7D3A" stroke="#1B1D2A" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 12 L30 36 H10Z" fill="#4E9446"/></svg>',
  pine: '<svg viewBox="0 0 34 56"><rect x="14" y="44" width="6" height="10" fill="#6B4423" stroke="#1B1D2A" stroke-width="2"/><path d="M17 2 L29 22 H23 L32 36 H24 L33 46 H1 L10 36 H2 L11 22 H5Z" fill="#2F6B34" stroke="#1B1D2A" stroke-width="2.2" stroke-linejoin="round"/></svg>',
  bush: '<svg viewBox="0 0 44 26"><path d="M4 24 Q2 10 14 10 Q18 2 26 6 Q38 4 40 24Z" fill="#4E9446" stroke="#1B1D2A" stroke-width="2.4" stroke-linejoin="round"/></svg>',
  rock: '<svg viewBox="0 0 44 30"><path d="M3 28 L10 12 L20 6 L32 9 L41 28Z" fill="#8F8A86" stroke="#1B1D2A" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 6 L24 18 L32 9" fill="none" stroke="#6F6A66" stroke-width="2"/></svg>',
  cabin: '<svg viewBox="0 0 46 40"><path d="M6 18 L23 4 L40 18 V38 H6Z" fill="#B9772F" stroke="#1B1D2A" stroke-width="2.4" stroke-linejoin="round"/><path d="M2 20 L23 2 L44 20" fill="none" stroke="#FF5A4E" stroke-width="5" stroke-linecap="round"/><rect x="18" y="24" width="10" height="14" fill="#1B1D2A"/></svg>',
  tent: '<svg viewBox="0 0 46 34"><path d="M3 32 L23 3 L43 32Z" fill="#FFC531" stroke="#1B1D2A" stroke-width="2.4" stroke-linejoin="round"/><path d="M23 3 L18 32 H28Z" fill="#1B1D2A"/></svg>',
  snow: '<svg viewBox="0 0 44 22"><path d="M2 20 Q8 6 18 10 Q26 2 34 8 Q42 8 42 20Z" fill="#FFFFFF" stroke="#8FA0B8" stroke-width="2"/></svg>',
  cloud: '<svg viewBox="0 0 80 36"><path d="M10 32 Q0 32 4 22 Q6 14 16 16 Q20 4 34 6 Q46 0 52 12 Q66 8 70 20 Q80 22 74 32Z" fill="#FFFFFF"/></svg>',
  bird: '<svg viewBox="0 0 24 12"><path class="wing" d="M2 9 Q7 1 12 8 Q17 1 22 9" fill="none" stroke="#1B1D2A" stroke-width="2.2" stroke-linecap="round"/></svg>',
  plane: '<svg viewBox="0 0 64 24"><path d="M6 13 H50 Q60 13 60 9 Q58 6 50 7 H14 L8 2 H3 L7 9Z" fill="#F2F1EC" stroke="#1B1D2A" stroke-width="2" stroke-linejoin="round"/><path d="M24 9 L34 9 L26 20 H20Z" fill="#2F5BEA" stroke="#1B1D2A" stroke-width="2" stroke-linejoin="round"/><circle cx="44" cy="10" r="1.6" fill="#1B1D2A"/><circle cx="38" cy="10" r="1.6" fill="#1B1D2A"/></svg>',
  balloon: '<svg viewBox="0 0 36 52"><path d="M18 2 Q34 2 33 18 Q32 30 20 36 H16 Q4 30 3 18 Q2 2 18 2Z" fill="#FF5A4E" stroke="#1B1D2A" stroke-width="2.2"/><path d="M18 2 Q10 18 16 36 M18 2 Q26 18 20 36" fill="none" stroke="#FFC531" stroke-width="3"/><rect x="13" y="42" width="10" height="8" rx="2" fill="#B9772F" stroke="#1B1D2A" stroke-width="2"/><path d="M15 36 L14 42 M21 36 L22 42" stroke="#1B1D2A" stroke-width="1.5"/></svg>',
  rocket: '<svg viewBox="0 0 30 64"><path class="flame" d="M10 48 Q15 64 20 48Z" fill="#FFC531"/><path d="M15 2 Q26 14 24 40 L20 48 H10 L6 40 Q4 14 15 2Z" fill="#F2F1EC" stroke="#1B1D2A" stroke-width="2.2" stroke-linejoin="round"/><circle cx="15" cy="22" r="4.5" fill="#2F5BEA" stroke="#1B1D2A" stroke-width="2"/><path d="M6 34 L1 46 L7 44 M24 34 L29 46 L23 44" fill="#FF5A4E" stroke="#1B1D2A" stroke-width="2" stroke-linejoin="round"/></svg>',
  flag: '<svg viewBox="0 0 30 44"><path d="M5 42 V4" stroke="#1B1D2A" stroke-width="3" stroke-linecap="round"/><path d="M6 5 L27 11 L6 18Z" fill="#FF5A4E" stroke="#1B1D2A" stroke-width="2" stroke-linejoin="round"/></svg>',
};

function mountainView(m, lessons, next) {
  const W = 360, n = lessons.length;
  const summitY = 300, H = n * 118 + summitY + 260;
  const summitX = 252;
  // Where the ridge is at height y: from the bottom left up to the summit,
  // with shoulders and bumps along the way.
  const edge = (y) => {
    const p = clamp((H - y) / (H - summitY), 0, 1);
    return 24 + (summitX - 24) * Math.pow(p, 1.15) + (1 - p) * (24 * Math.sin(y / 160) + 9 * Math.sin(y / 47));
  };
  const ys = [];
  for (let y = H; y > summitY; y -= 10) ys.push(y);
  const ridge = [...ys.map((y) => [edge(y), y]), [summitX, summitY]];
  const pts = (ps) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const offset = (dx) => ridge.map(([x, y]) => [x + dx * (0.5 + 0.5 * (y - summitY) / (H - summitY)), y]);
  const far = [[summitX + 40, summitY + 70], [summitX + 70, summitY + 60], [W + 10, summitY + 150], [W + 10, H + 10]];
  const body = [[-10, H + 10], ...ridge, ...far];
  const svg = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <defs>
      <linearGradient id="mBody" gradientUnits="userSpaceOnUse" x1="0" y1="${H}" x2="0" y2="${summitY}">
        <stop offset="0" stop-color="#7CB85A"/><stop offset=".22" stop-color="#4F8A3A"/><stop offset=".42" stop-color="#3F6E35"/>
        <stop offset=".55" stop-color="#6E6863"/><stop offset=".75" stop-color="#8B8681"/><stop offset=".9" stop-color="#C5CFDC"/><stop offset="1" stop-color="#FFFFFF"/>
      </linearGradient>
      <linearGradient id="mEdge" gradientUnits="userSpaceOnUse" x1="0" y1="${H}" x2="0" y2="${summitY}">
        <stop offset="0" stop-color="#8B5A2B"/><stop offset=".45" stop-color="#6B4A30"/><stop offset=".6" stop-color="#5A5550"/><stop offset=".8" stop-color="#E9EEF5"/><stop offset="1" stop-color="#FFFFFF"/>
      </linearGradient>
    </defs>
    <polygon points="${pts(body)}" fill="url(#mBody)"/>
    ${[40, 95, 170, 260].map((dx, k) => `<polyline points="${pts(offset(dx))}" fill="none" stroke="#1B1D2A" stroke-opacity="${0.12 - k * 0.02}" stroke-width="${9 - k * 1.5}" stroke-linejoin="round"/>`).join('')}
    <polyline points="${pts(ridge)}" fill="none" stroke="url(#mEdge)" stroke-width="10" stroke-linejoin="round"/>
  </svg>`;
  const wrap = h('div', { class: 'big-mountain', style: { aspectRatio: `${W} / ${H}` } }, h('div', { class: 'bm-sky' }), h('div', { class: 'bm-art', html: svg }));
  const pct = (v, of) => (v / of) * 100 + '%';
  const at = (x, y, cls, child, extra = {}) => {
    const el = h('div', { class: cls, style: { left: pct(x, W), top: pct(y, H), ...extra } }, child);
    wrap.append(el);
    return el;
  };
  // In the sky: stars near the top, a rocket, planes, a balloon, clouds and birds lower down.
  for (let k = 0; k < 14; k++) at((k * 53) % 230 + 10, (k * 37) % 260 + 10, 'bm-star', '');
  at(70, 90, 'bm-rocket', h('div', { html: DECOR.rocket }));
  at(-60, H * 0.22, 'bm-plane', h('div', { html: DECOR.plane }), { '--dur': '16s' });
  at(-60, H * 0.38, 'bm-plane rev', h('div', { html: DECOR.plane }), { '--dur': '21s', animationDelay: '-8s' });
  at(40, H * 0.5, 'bm-balloon', h('div', { html: DECOR.balloon }));
  [0.3, 0.46, 0.6, 0.74, 0.88].forEach((f, k) => at(10 + (k * 61) % 120, H * f, 'bm-cloud', h('div', { html: DECOR.cloud }), { '--dur': 26 + k * 6 + 's', animationDelay: -k * 5 + 's' }));
  [0.7, 0.78, 0.86, 0.93].forEach((f, k) => at(20 + (k * 47) % 110, H * f, 'bm-bird', h('div', { html: DECOR.bird }), { '--dur': 9 + k * 2 + 's', animationDelay: -k * 2 + 's' }));
  // Altitude marks along the left.
  const done = lessons.filter((l) => lessonDone(l.id)).length;
  for (let k = 1; k <= 4; k++) {
    const y = H - (H - summitY) * (k / 5);
    at(4, y, 'bm-alt', `${fmtNum(Math.round((m.height * k) / 5))} m`);
  }
  // Scenery on the mountain, changing with height.
  for (let y = H - 60, k = 0; y > summitY + 60; y -= 70, k++) {
    const p = (H - y) / (H - summitY);
    const kind = p < 0.25 ? ['tree', 'bush', 'tree', 'pine'][k % 4] : p < 0.45 ? ['pine', 'tree', 'cabin', 'pine'][k % 4] : p < 0.7 ? ['rock', 'tent', 'rock', 'pine'][k % 4] : ['rock', 'snow', 'snow', 'rock'][k % 4];
    const x = edge(y) + 50 + ((k * 47) % 120);
    if (x < W - 20) at(x, y, 'bm-decor', h('div', { html: DECOR[kind] }));
  }
  // The summit: a flag with the mountain's name.
  at(summitX, summitY, 'bm-summit', [h('div', { class: 'bm-flag', html: DECOR.flag }), h('div', { class: 'bm-name' }, h('b', {}, m.name), h('span', {}, `${fmtNum(m.height)} m`))]);
  // The lessons, evenly up the ridge.
  let lastUnit = null;
  lessons.forEach((l, i) => {
    const y = H - 110 - (i * (H - 110 - (summitY + 120))) / (n - 1);
    const x = edge(y) + 16;
    const isDone = lessonDone(l.id), open = lessonOpen(l), isNext = next && next.id === l.id;
    const btn = h('button', {
      class: 'stop' + (isDone ? ' done' : '') + (isNext ? ' next' : '') + (open ? '' : ' locked') + (l.kind === 'story' ? ' story' : ''),
      'data-lesson': l.id, 'aria-label': `${l.unit.title} ${l.kind === 'story' ? t('path.story') : t('path.lesson', { n: l.n })}`,
    }, isDone ? icon('check') : !open ? icon('lock') : l.kind === 'story' ? icon('book') : String(l.n));
    btn.addEventListener('click', () => {
      if (!open) { Sfx.bad(); toast(t('path.lockedMsg')); return; }
      Sfx.select();
      openLesson(l);
    });
    at(x, y, 'stop-spot', btn);
    if (isNext) at(x, y, 'you', lookAvatar(myLook(), 'sm'));
    if (l.unit !== lastUnit) {
      lastUnit = l.unit;
      const ud = l.unit.lessons.filter((x2) => lessonDone(x2.id)).length;
      at(x, y, 'bm-unit' + (x > 150 ? ' left' : '') + (open ? '' : ' locked'),
        [h('small', {}, t('path.unit', { n: l.unit.n + 1 })), h('b', {}, l.unit.title), h('span', {}, `${ud}/4`)]);
    }
  });
  at(edge(H - 30) + 30, H - 26, 'base-camp', t('mtn.base'));
  return wrap;
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
    canListen() ? card('listen', 'headphones', t('practice.listen'), t('practice.listenSub'), learned >= 4) : null,
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
  { id: 'boost', ic: 'potion', fb: 'bolt', cost: 150, apply: () => { Store.data.boostUntil = Math.max(Date.now(), Store.data.boostUntil || 0) + 15 * 60e3; } },
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
      // Faded when you can't buy it yet (not enough coins, or you have the most you can hold).
      return h('div', { class: 'card shop-row' + (maxed || d.coins < it.cost ? ' poor' : '') },
        h('div', { class: 'pc-icon' }, icon(it.ic, '', it.fb)),
        h('div', { class: 'pc-text' }, h('b', {}, t('shop.' + it.id)), h('span', {}, t('shop.' + it.id + 'Sub')), extra ? h('em', {}, extra) : null),
        h('button', { class: 'btn small price', disabled: maxed || null, onclick: () => buy(it.cost, 'coins', it.apply) }, icon('coin'), fmtNum(it.cost)));
    }),
    h('h2', { class: 'section' }, t('look.wardrobe')),
    h('p', { class: 'muted' }, t('look.wardrobeSub')),
    lookBuilder(myLook(), (look) => { d.profile.look = look; Store.save(); wallet.querySelector('b').textContent = fmtNum(d.coins); }, { shop: true }));
}

// ------------------------------------------------------------------ Me tab
const APP_VERSION = '2.1';
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
      p.joined ? h('small', { class: 'banner-since' }, t('me.since', { date: fmtDate(p.joined) })) : null,
      h('div', { class: 'banner-badges' }, badges.length ? badges.map((m) => badgeArt(m, 'xs')) : h('small', {}, t('me.noBadges')))),
    opts.gear ? h('button', { class: 'banner-gear', 'aria-label': t('set.title'), onclick: () => App.show('settings') }, icon('gear')) : null);
}
const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(I18N_LOCALE[UI.lang], { month: 'long', year: 'numeric' }); } catch (e) { return iso; } };

function renderMe() {
  const d = Store.data;
  const s = courseStats();
  const lv = Store.level();
  const mins = Math.round((d.totalSecs || 0) / 60);
  const unsaved = Cloud.enabled() && !Cloud.email();
  return h('div', { class: 'page' },
    profileBanner(d.profile, { gear: true }),
    h('div', { class: 'stat-grid' },
      stat('mountain', s.pct + '%', t('me.course', { lang: t('lang.' + d.target) })),
      stat('book', fmtNum(s.words), t('home.words')),
      stat('star', fmtNum(s.mastered), t('home.mastered')),
      stat('calendar', Store.weekStreakNow(), t('me.weekStreak')),
      stat('bolt', fmtNum(d.xp), t('me.level', { n: lv.lvl })),
      stat('clock', t('res.mins', { n: mins }), t('me.time'))),
    unsaved ? h('button', { class: 'card save-card', onclick: () => openSaveAccount() },
      h('div', { class: 'pc-icon' }, icon('cloud', '', 'globe')),
      h('div', { class: 'pc-text' }, h('b', {}, t('auth.saveTitle')), h('span', {}, t('auth.saveShort'))),
      icon('right')) : null,
    h('h2', { class: 'section' }, t('me.languages')),
    h('div', { class: 'card lang-card' },
      h('div', { class: 'lang-pair' }, h('span', {}, t('lang.' + d.native)), icon('right'), h('b', {}, t('lang.' + d.target))),
      h('button', { class: 'btn ghost small', onclick: () => Onboarding.start(1) }, t('me.change'))),
    h('button', { class: 'btn ghost wide', onclick: () => Share.send(t('share.invite')) }, icon('share'), t('me.invite')),
    h('button', { class: 'btn ghost wide', onclick: () => App.show('settings') }, icon('gear'), t('set.title')),
    h('div', { class: 'foot-note' }, 'Lingo Peak'));
}

// A yes/no question in a sheet that slides up. opts: { title, sub, yes, danger, onYes }
function askSheet(opts) {
  const host = App.openOverlay('ask');
  const yes = h('button', { class: 'btn wide ' + (opts.danger ? 'danger solid' : 'primary') }, opts.yes);
  yes.addEventListener('click', async () => { yes.disabled = true; try { await opts.onYes(); } finally { yes.disabled = false; } });
  host.replaceChildren(h('div', { class: 'ask-wrap', onclick: (e) => { if (e.target === e.currentTarget) App.closeOverlay(); } },
    h('div', { class: 'ask-sheet' },
      opts.icon ? h('div', { class: 'ask-icon' }, icon(opts.icon, 'big')) : null,
      h('h2', {}, opts.title),
      opts.sub ? h('p', { class: 'muted' }, opts.sub) : null,
      yes,
      h('button', { class: 'btn ghost wide', onclick: () => App.closeOverlay() }, t('set.cancel')))));
}

// ------------------------------------------------------------------ Settings
function renderSettings() {
  const d = Store.data;
  const toggle = (key, label, sub, onChange) => {
    const input = h('input', { type: 'checkbox' });
    input.checked = Store.s[key] !== false;
    input.addEventListener('change', () => { Store.s[key] = input.checked; Store.save(); Sfx.tap(); if (onChange) onChange(); });
    return h('label', { class: 'setting' }, h('span', {}, label, sub ? h('small', {}, sub) : null), h('span', { class: 'switch' }, input, h('i')));
  };
  // A row of choices that just moves its highlight (nothing reloads).
  const seg = (key, opts, onChange) => {
    const row = h('div', { class: 'seg' });
    opts.forEach(([v, label]) => {
      const b = h('button', { class: Store.s[key] === v ? 'on' : '' }, label);
      b.addEventListener('click', () => {
        Store.s[key] = v; Store.save();
        row.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        Sfx.tap();
        if (onChange) onChange();
      });
      row.append(b);
    });
    return row;
  };
  const row = (label, value, btn) => h('div', { class: 'setting' }, h('span', {}, label, value ? h('small', {}, value) : null), btn || null);
  const email = Cloud.email();
  const code = Cloud.profile && Cloud.profile.code;
  const colours = h('div', { class: 'colour-row' });
  ['blue', 'coral', 'yellow', 'ink'].forEach((c) => {
    const b = h('button', { class: 'colour-dot b-' + c + ((d.profile.banner || 'blue') === c ? ' on' : ''), 'aria-label': c });
    b.addEventListener('click', () => { d.profile.banner = c; Store.save(); Sfx.select(); colours.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
    colours.append(b);
  });

  return h('div', { class: 'page settings-page' },
    h('div', { class: 'settings-head' },
      h('button', { class: 'icon-btn', 'aria-label': t('set.back'), onclick: () => App.show('me') }, icon('left')),
      h('h1', { class: 'page-title' }, t('set.title'))),

    h('h2', { class: 'section' }, t('set.account')),
    h('div', { class: 'card settings' },
      row(t('set.username'), d.profile.name, h('button', { class: 'btn ghost small', onclick: () => renameMe() }, t('me.change'))),
      Cloud.enabled() ? row(t('auth.email'), email || t('set.noEmail'),
        email ? h('span', { class: 'ok-tag' }, icon('check'), t('set.saved')) : h('button', { class: 'btn primary small', onclick: () => openSaveAccount() }, t('set.addEmail'))) : null,
      code ? row(t('set.friendCode'), code, h('button', { class: 'btn ghost small', onclick: () => Share.send(t('ranks.shareCode', { code })) }, icon('share'))) : null,
      h('div', { class: 'setting' }, h('span', {}, t('set.colour')), colours)),

    h('h2', { class: 'section' }, t('set.learning')),
    h('div', { class: 'card settings' },
      row(t('me.languages'), `${t('lang.' + d.native)} → ${t('lang.' + d.target)}`, h('button', { class: 'btn ghost small', onclick: () => Onboarding.start(1) }, t('me.change'))),
      h('div', { class: 'setting col' }, h('span', {}, t('set.goal'), h('small', {}, t('set.goalSub'))),
        seg('goal', [10, 20, 30, 45].map((n) => [n, t('set.goalMins', { n })]), () => Widget.update())),
      toggle('listen', t('set.listen'), t('set.listenSub')),
      toggle('typing', t('set.typing'), t('set.typingSub'))),

    h('h2', { class: 'section' }, t('set.soundVoice')),
    h('div', { class: 'card settings' },
      toggle('sound', t('me.sound')),
      toggle('vibrate', t('me.vibrate')),
      toggle('voice', t('me.voice')),
      h('div', { class: 'setting' }, h('span', {}, t('me.speed')), seg('rate', [[0.65, t('me.slow')], [0.9, t('me.normal')], [1.15, t('me.fast')]], () => setTimeout(() => Voice.say(C.units[0].sentences[0].t, { force: true }), 100))),
      Voice.native() && Voice.state() !== 'ok' ? h('button', { class: 'btn ghost small', onclick: () => Voice.install() }, t('me.getVoice')) : null),

    h('h2', { class: 'section' }, t('set.look')),
    h('div', { class: 'card settings' },
      h('div', { class: 'setting' }, h('span', {}, t('me.theme')), seg('theme', [['light', t('me.light')], ['dark', t('me.dark')], ['system', t('me.auto')]], () => Theme.apply())),
      h('div', { class: 'setting' }, h('span', {}, t('set.textSize')), seg('text', [['normal', t('me.normal')], ['big', t('set.textBig')]], () => Theme.apply())),
      toggle('effects', t('set.effects'), t('set.effectsSub'))),

    h('h2', { class: 'section' }, t('set.about')),
    h('div', { class: 'card settings' },
      h('details', { class: 'setting how-details' }, h('summary', {}, t('set.how')),
        h('ul', { class: 'how' },
          h('li', {}, icon('refresh'), t('set.how1')),
          h('li', {}, icon('target'), t('set.how2')),
          h('li', {}, icon('speaker'), t('set.how3')),
          h('li', {}, icon('cards'), t('set.how4')))),
      row(t('me.invite'), null, h('button', { class: 'btn ghost small', onclick: () => Share.send(t('share.invite')) }, icon('share'))),
      row('Lingo Peak', t('set.version', { v: APP_VERSION }))),

    h('h2', { class: 'section danger-head' }, t('set.danger')),
    h('div', { class: 'card settings danger-card' },
      email ? row(t('set.logout'), t('set.logoutSub', { email }), h('button', { class: 'btn ghost small', onclick: () => askSheet({
        icon: 'user', title: t('set.logoutQ'), sub: t('set.logoutSub', { email }), yes: t('set.logout'),
        onYes: async () => { await Cloud.logOut(); location.reload(); },
      }) }, t('set.logout'))) : null,
      row(t('set.delete'), t('set.deleteHint'), h('button', { class: 'btn danger small', onclick: () => askSheet({
        icon: 'lock', danger: true, title: t('set.deleteQ'), sub: t('set.deleteSub'), yes: t('set.deleteYes'),
        onYes: async () => {
          try { await Cloud.deleteAccount(); } catch (e) {
            if (e.offline) { toast(t('set.needNet'), 3500); return; }
            Cloud.wipePhone();
          }
          location.reload();
        },
      }) }, t('set.deleteBtn')))),
    h('div', { class: 'foot-note' }, `Lingo Peak ${APP_VERSION}`));
}

// ------------------------------------------------------------------ Ranks tab
function renderRanks() {
  return h('div', { class: 'page' }, topBar(),
    h('h1', { class: 'page-title' }, t('tab.ranks')),
    typeof leaderboardView === 'function' ? leaderboardView() : h('div', { class: 'card muted' }, t('ranks.offline')));
}

window.addEventListener('DOMContentLoaded', () => App.init());
