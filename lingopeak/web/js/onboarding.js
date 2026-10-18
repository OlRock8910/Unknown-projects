// First launch: pick your languages and make your climber. Also used to
// switch the language you're learning (starting at step 1).

const NATIVE_NAMES = { en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português' };
const validName = (n) => /^[\p{L}\p{N}_.-]{3,16}$/u.test(n);

const Onboarding = {
  active: false,
  step: 0,
  draft: null,
  changing: false,

  start(step = 0) {
    this.active = true;
    this.changing = step > 0 && !!Store.data.profile;
    this.draft = { native: Store.data.native || guessLang(), target: Store.data.target, name: Store.data.profile?.name || '', look: Store.data.profile?.look || { ...DEFAULT_LOOK, skin: randInt(0, 4), hair: randInt(0, 4), hairColor: randInt(0, 3) } };
    if (App.overlayKind) App.closeOverlay();
    $('#tabs').hidden = true;
    this.go(step);
  },
  go(step) {
    this.step = step;
    UI.lang = this.draft.native;
    $('#view').scrollTop = 0;
    $('#view').replaceChildren(this['step' + step]());
  },
  back() {
    if (this.step === 'Login') { this.go(0); return true; }
    if (this.step === 0 || (this.changing && this.step === 1)) {
      if (this.changing) { this.active = false; App.enter(); return true; }
      return false;
    }
    this.go(this.step - 1);
    return true;
  },
  shell(title, sub, body, foot, opts = {}) {
    return h('div', { class: 'onb' },
      h('div', { class: 'onb-top' },
        this.step > 0 ? h('button', { class: 'icon-btn', onclick: () => this.back() }, icon('left')) : h('span'),
        h('div', { class: 'onb-dots' }, ...[1, 2, 3, 4, 5].map((k) => h('i', { class: k <= this.step ? 'on' : '' })))),
      opts.cast || null,
      h('h1', {}, title),
      sub ? h('p', { class: 'muted' }, sub) : null,
      h('div', { class: 'onb-body' }, body),
      h('div', { class: 'onb-foot' }, foot));
  },

  step0() {
    return h('div', { class: 'onb welcome' },
      h('div', { class: 'welcome-cast' }, castArt('banana', 'happy'), castArt('shark', ''), castArt('dino', 'happy')),
      h('div', { class: 'logo' }, h('span', { class: 'logo-mark', html: '<svg viewBox="0 0 40 40"><path d="M3 34 16 10l6 10 5-7 10 21z" fill="var(--blue)"/><path d="m16 10 4 7.5-4-1.5-4 2z" fill="#fff"/><path d="M16 10V2l7 3-7 3" fill="var(--coral)"/></svg>' }), 'Lingo Peak'),
      h('p', { class: 'tagline' }, t('onb.tagline')),
      h('div', { class: 'onb-foot' },
        h('button', { class: 'btn primary wide', onclick: () => this.go(1) }, t('onb.start')),
        h('button', { class: 'btn ghost wide', onclick: () => this.go('Login') }, icon('user'), t('onb.haveAccount'))));
  },

  // A list of languages; choosing one just moves the highlight (no reload).
  langList(langs, selected, onPick, label) {
    const list = h('div', { class: 'lang-list' });
    langs.forEach((l) => {
      const started = this.step === 2 && Store.data.courses[`${this.draft.native}>${l}`];
      const b = h('button', { class: 'lang-opt' + (selected === l ? ' on' : '') },
        h('span', { class: 'lang-code' }, l.toUpperCase()), h('b', {}, label(l)), started ? h('small', {}, t('onb.started')) : null);
      b.addEventListener('click', () => {
        list.querySelectorAll('.lang-opt').forEach((x) => x.classList.toggle('on', x === b));
        Sfx.select();
        onPick(l);
      });
      list.append(b);
    });
    return list;
  },

  step1() {
    const next = h('button', { class: 'btn primary wide' }, t('onb.next'));
    next.addEventListener('click', () => this.go(2));
    let page = null;
    const list = this.langList(LANGS, this.draft.native, (l) => {
      this.draft.native = l;
      if (this.draft.target === l) this.draft.target = null;
      // Switch the words on this screen to the new language straight away.
      UI.lang = l;
      page.querySelector('h1').textContent = t('onb.speak');
      page.querySelector('p.muted').textContent = t('onb.speakSub');
      next.textContent = t('onb.next');
    }, (l) => NATIVE_NAMES[l]);
    page = this.shell(t('onb.speak'), t('onb.speakSub'), list, next);
    return page;
  },

  step2() {
    const next = h('button', { class: 'btn primary wide', disabled: !this.draft.target || null }, this.changing ? t('onb.switch') : t('onb.next'));
    next.addEventListener('click', () => (this.changing ? this.finish() : this.go(3)));
    const list = this.langList(LANGS.filter((l) => l !== this.draft.native), this.draft.target, (l) => { this.draft.target = l; next.disabled = false; }, (l) => t('lang.' + l));
    return this.shell(t('onb.learn'), t('onb.learnSub'), list, next);
  },

  step3() {
    const name = h('input', { class: 'field', maxlength: '16', placeholder: t('onb.namePh'), value: this.draft.name, autocomplete: 'nickname' });
    const err = h('div', { class: 'err' });
    const next = h('button', { class: 'btn primary wide' }, t('onb.next'));
    name.addEventListener('input', () => { this.draft.name = name.value; err.textContent = ''; });
    next.addEventListener('click', async () => {
      const n = name.value.trim();
      if (!validName(n)) { err.textContent = t('onb.nameErr'); Sfx.bad(); return; }
      next.disabled = true;
      const free = await Cloud.nameFree(n);
      next.disabled = false;
      if (free === false) { err.textContent = t('onb.nameTaken'); Sfx.bad(); return; }
      this.draft.name = n;
      this.go(4);
    });
    const builder = lookBuilder(this.draft.look, (look) => { this.draft.look = look; });
    return this.shell(t('onb.profile'), t('onb.profileSub'), h('div', {}, name, err, h('h2', { class: 'section' }, t('onb.makeLook')), builder), next);
  },

  step4() {
    const days = t('onb.days').split(',');
    return this.shell(t('onb.goal'), null,
      h('div', { class: 'goal-explain' },
        h('div', { class: 'goal-big' }, h('b', {}, '20'), h('span', {}, t('onb.goalUnit'))),
        h('div', { class: 'goal-week' }, ...days.map((d, i) => h('div', { class: 'gw-day' + ([0, 2, 5].includes(i) ? ' on' : '') }, h('i'), h('small', {}, d)))),
        h('p', { class: 'muted center' }, t('onb.goalSub')),
        h('ul', { class: 'how' },
          h('li', {}, icon('calendar'), t('onb.how1')),
          h('li', {}, icon('refresh'), t('onb.how2')),
          h('li', {}, icon('mountain'), t('onb.how3')),
          h('li', {}, icon('coin'), t('onb.how4')))),
      h('button', { class: 'btn primary wide', onclick: () => (Cloud.enabled() && !Cloud.email() ? this.go(5) : this.finish()) }, t('onb.go')));
  },

  // Save your progress to an email (or skip for now).
  step5() {
    const form = emailCodeForm(async (email, code) => {
      this.save();
      await Cloud.saveTo(email, code);
      toast(t('auth.saved', { email }), 4000);
      this.finish();
    });
    return this.shell(t('auth.saveTitle'), t('auth.saveSub'), form,
      h('button', { class: 'btn ghost wide', onclick: () => this.finish() }, t('auth.skip')),
      { cast: h('div', { class: 'auth-art' }, icon('cloud', 'big')) });
  },

  // Log in on a new phone: loads your progress and goes straight in.
  stepLogin() {
    const form = emailCodeForm(async (email, code) => {
      const ready = await Cloud.logIn(email, code);
      Sfx.win();
      if (ready) {
        this.active = false;
        UI.lang = Store.data.native;
        Theme.apply();
        App.enter();
        toast(t('auth.welcomeBack', { name: Store.data.profile.name }), 3000);
      } else {
        // A new email: set up the rest of the profile.
        this.draft.name = (Store.data.profile && Store.data.profile.name) || '';
        this.go(1);
      }
    }, h('button', { class: 'link-btn', onclick: () => this.go(1) }, t('auth.noAccount')));
    return h('div', { class: 'onb' },
      h('div', { class: 'onb-top' }, h('button', { class: 'icon-btn', onclick: () => this.back() }, icon('left')), h('span')),
      h('div', { class: 'auth-art' }, icon('user', 'big')),
      h('h1', {}, t('auth.loginTitle')),
      h('p', { class: 'muted' }, t('auth.loginSub')),
      h('div', { class: 'onb-body' }, form));
  },

  // Keeps what was chosen (without going into the app yet).
  save() {
    const d = Store.data;
    d.native = this.draft.native;
    d.target = this.draft.target;
    if (!d.profile) {
      d.profile = { name: this.draft.name, look: this.draft.look, banner: 'blue', joined: today() };
    }
    Store.save();
  },
  finish() {
    this.save();
    this.active = false;
    App.enter();
  },
};
