// Hearts and Lingo Peak Pro.
//
// Free: 5 hearts a day (back to 5 every morning). A wrong answer in a lesson
// costs a heart; practice and mini games never do, and finishing a practice
// earns one back. Out of hearts: practise, refill with coins, or go Pro.
// Pro: unlimited hearts, no "Go Pro" screens, a PRO tag and gold frame, a
// double daily chest, and coins plus a streak freeze every month.
//
// Pro isn't on sale until Google Play Billing is connected (see COIN_PACKS);
// until then "Start Pro" says it's coming soon.
const MAX_HEARTS = 5, REFILL_COINS = 300, PRO_MONTHLY_COINS = 300;
const PRO_PLANS = [
  { id: 'pro_yearly', price: '£30', per: 'year', monthly: '£2.50', save: 32 },
  { id: 'pro_monthly', price: '£3.70', per: 'month' },
];

const Pro = {
  // Pro preview: lets the app's owner try Pro before it's on sale (tap the
  // version in Settings 7 times). Take it out when Pro goes on sale.
  is() {
    const p = Store.data.pro;
    return !!Store.data.proPreview || !!(p && p.until > Date.now());
  },
  // Pro's monthly bonus: coins and a streak freeze, once a month.
  monthly() {
    if (!this.is()) return;
    const d = Store.data, month = today().slice(0, 7);
    if (d.proMonth === month) return;
    d.proMonth = month;
    d.coins += PRO_MONTHLY_COINS;
    d.freezes = Math.min(2, (d.freezes || 0) + 1);
    Store.save();
    setTimeout(() => toast(t('pro.monthly', { n: PRO_MONTHLY_COINS }), 4000), 800);
  },
  tag: () => h('span', { class: 'pro-tag' }, 'PRO'),
};

const Hearts = {
  left() {
    if (Pro.is()) return Infinity;
    const d = Store.data;
    if (!d.hearts || d.hearts.day !== today()) d.hearts = { n: MAX_HEARTS, day: today() };
    return d.hearts.n;
  },
  lose() {
    if (Pro.is()) return Infinity;
    this.left();
    Store.data.hearts.n = Math.max(0, Store.data.hearts.n - 1);
    return Store.data.hearts.n;
  },
  earn(n = 1) {
    if (Pro.is() || this.left() >= MAX_HEARTS) return 0;
    const before = Store.data.hearts.n;
    Store.data.hearts.n = Math.min(MAX_HEARTS, before + n);
    return Store.data.hearts.n - before;
  },
  label() { const n = this.left(); return n === Infinity ? '∞' : String(n); },
  chip() {
    return h('button', { class: 'chip hearts' + (Pro.is() ? ' pro' : this.left() ? '' : ' empty'), onclick: () => this.sheet() }, icon('heart'), this.label());
  },
  // What hearts are, and ways to get more. opts.inLesson: you've just run out
  // mid-lesson (onRefill carries on; otherwise the lesson ends).
  sheet(opts = {}) {
    const n = this.left();
    const host = App.openOverlay('ask');
    const d = Store.data;
    const keepGoing = () => { if (opts.onRefill) opts.onRefill(); else App.closeOverlay(); };
    const refill = h('button', { class: 'btn wide ghost refill' + (d.coins < REFILL_COINS ? ' poor' : '') }, icon('coin'), t('hearts.refill', { n: REFILL_COINS }));
    refill.addEventListener('click', () => {
      if (d.coins < REFILL_COINS) { Sfx.oops(); toast(t('shop.short', { n: REFILL_COINS - d.coins, cur: t('shop.coins') })); return; }
      d.coins -= REFILL_COINS;
      d.hearts = { n: MAX_HEARTS, day: today() };
      Store.save();
      Sfx.coin();
      toast(t('hearts.refilled'));
      keepGoing();
    });
    const pro = Pro.is();
    host.replaceChildren(h('div', { class: 'ask-wrap', onclick: (e) => { if (e.target === e.currentTarget && !opts.inLesson) App.closeOverlay(); } },
      h('div', { class: 'ask-sheet hearts-sheet' },
        h('div', { class: 'hearts-row' }, ...Array.from({ length: MAX_HEARTS }, (_, i) => icon('heart', pro || i < n ? 'full' : 'gone'))),
        h('h2', {}, pro ? t('hearts.unlimited') : n ? t('hearts.left', { n }) : t('hearts.out')),
        h('p', { class: 'muted' }, pro ? t('hearts.proSub') : t('hearts.how', { n: MAX_HEARTS })),
        pro ? null : h('button', { class: 'btn wide gold', onclick: () => openPro() }, icon('crown'), t('hearts.getPro')),
        pro || n >= MAX_HEARTS ? null : refill,
        pro ? null : h('button', { class: 'btn wide ghost', onclick: () => { App.closeOverlay(); openPractice('review'); } }, icon('refresh'), t('hearts.practise')),
        h('button', { class: 'btn wide ghost', onclick: () => (opts.inLesson ? App.closeOverlay() : keepGoing()) }, opts.inLesson ? t('hearts.quit') : t('set.cancel')))));
  },
};

// ------------------------------------------------------------------ the Pro page
const PRO_PERKS = [['heart', 'perk.hearts'], ['sparkle', 'perk.noAds'], ['crown', 'perk.badge'], ['chest', 'perk.chest'], ['coin', 'perk.monthly'], ['snowflake', 'perk.freeze']];
function openPro() {
  const host = App.openOverlay('pro');
  let plan = PRO_PLANS[0].id;
  const plans = h('div', { class: 'pro-plans' });
  const drawPlans = () => plans.replaceChildren(...PRO_PLANS.map((p) => h('button', { class: 'pro-plan' + (plan === p.id ? ' on' : ''), onclick: () => { plan = p.id; Sfx.select(); drawPlans(); } },
    p.save ? h('span', { class: 'pack-tag' }, t('pro.save', { n: p.save })) : null,
    h('b', {}, t(p.per === 'year' ? 'pro.yearly' : 'pro.monthlyPlan')),
    h('div', { class: 'pro-price' }, p.price, h('small', {}, ' / ' + t('pro.' + p.per))),
    p.monthly ? h('small', { class: 'muted' }, t('pro.perMonth', { p: p.monthly })) : h('small', { class: 'muted' }, t('pro.cancel')))));
  drawPlans();
  const on = Pro.is();
  host.replaceChildren(h('div', { class: 'pro-page' },
    h('div', { class: 'sheet-top' }, h('button', { class: 'icon-btn', onclick: () => App.closeOverlay() }, icon('x'))),
    h('div', { class: 'pro-hero' }, icon('crown', 'big'), h('h1', {}, 'Lingo Peak ', Pro.tag()), h('p', {}, t('pro.tagline'))),
    h('ul', { class: 'pro-perks' }, ...PRO_PERKS.map(([ic, k]) => h('li', {}, h('div', { class: 'coach-ic' }, icon(ic, '', 'star')), h('span', {}, t(k, { n: PRO_MONTHLY_COINS }))))),
    on ? h('div', { class: 'card pro-on' }, icon('check'), h('b', {}, t('pro.youArePro'))) : plans,
    on ? null : h('button', { class: 'btn wide big gold', onclick: () => askSheet({ icon: 'crown', title: t('shop.soonTitle'), sub: t('pro.soonSub'), yes: t('ex.continue'), noCancel: true, onYes: () => openPro() }) }, t('pro.start')),
    h('p', { class: 'pro-small' }, t('pro.small'))));
}

// "Go Pro" between sessions for free players (instead of adverts). Skippable
// after a few seconds; then next() carries on.
function proBreak(next) {
  const d = Store.data;
  if (Pro.is() || (d.sessions || 0) < 2) return next();
  const host = App.openOverlay('promo');
  let left = 3;
  const skip = h('button', { class: 'btn ghost', disabled: '' }, t('promo.skipIn', { n: left }));
  const timer = setInterval(() => {
    left--;
    if (left > 0) { skip.textContent = t('promo.skipIn', { n: left }); return; }
    clearInterval(timer);
    skip.disabled = false;
    skip.textContent = t('promo.skip');
  }, 1000);
  App.overlayCleanup = () => clearInterval(timer);
  skip.addEventListener('click', () => { App.overlayCleanup = null; clearInterval(timer); next(); });
  host.replaceChildren(h('div', { class: 'promo' },
    h('div', { class: 'eyebrow' }, t('promo.ad')),
    h('div', { class: 'promo-art' }, castArt('astro', 'happy', 'promo-cast'), icon('crown', 'promo-crown')),
    h('h1', {}, t('promo.title')),
    h('ul', { class: 'pro-perks small' }, ...PRO_PERKS.slice(0, 4).map(([ic, k]) => h('li', {}, icon(ic, '', 'star'), h('span', {}, t(k, { n: PRO_MONTHLY_COINS }))))),
    h('button', { class: 'btn wide big gold', onclick: () => { clearInterval(timer); openPro(); } }, t('promo.try')),
    skip));
}
