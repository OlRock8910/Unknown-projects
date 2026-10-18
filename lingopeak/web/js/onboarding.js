// First launch: pick your languages and make your climber. Also used to
// switch the language you're learning (starting at step 1).

const NATIVE_NAMES = { en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch', pt: 'Português' };

const Onboarding = {
  active: false,
  step: 0,
  draft: null,
  changing: false,

  start(step = 0) {
    this.active = true;
    this.changing = step > 0 && !!Store.data.profile;
    this.draft = { native: Store.data.native || guessLang(), target: Store.data.target, name: Store.data.profile?.name || '', avatar: Store.data.profile?.avatar || 'banana' };
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
        h('div', { class: 'onb-dots' }, ...[1, 2, 3, 4].map((k) => h('i', { class: k <= this.step ? 'on' : '' })))),
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
        h('button', { class: 'btn ghost wide', onclick: () => toast(t('onb.emailLater'), 3000) }, t('onb.haveAccount'))));
  },

  step1() {
    const list = h('div', { class: 'lang-list' }, ...LANGS.map((l) => h('button', {
      class: 'lang-opt' + (this.draft.native === l ? ' on' : ''),
      onclick: () => { this.draft.native = l; if (this.draft.target === l) this.draft.target = null; this.go(1); },
    }, h('span', { class: 'lang-code' }, l.toUpperCase()), h('b', {}, NATIVE_NAMES[l]))));
    return this.shell(t('onb.speak'), t('onb.speakSub'), list,
      h('button', { class: 'btn primary wide', onclick: () => this.go(2) }, t('onb.next')));
  },

  step2() {
    const list = h('div', { class: 'lang-list' }, ...LANGS.filter((l) => l !== this.draft.native).map((l) => {
      const started = Store.data.courses[`${this.draft.native}>${l}`];
      return h('button', {
        class: 'lang-opt' + (this.draft.target === l ? ' on' : ''),
        onclick: () => { this.draft.target = l; this.go(2); },
      }, h('span', { class: 'lang-code' }, l.toUpperCase()), h('b', {}, t('lang.' + l)), started ? h('small', {}, t('onb.started')) : null);
    }));
    const next = h('button', { class: 'btn primary wide', disabled: !this.draft.target || null, onclick: () => (this.changing ? this.finish() : this.go(3)) }, this.changing ? t('onb.switch') : t('onb.next'));
    return this.shell(t('onb.learn'), t('onb.learnSub'), list, next);
  },

  step3() {
    const name = h('input', { class: 'field', maxlength: '16', placeholder: t('onb.namePh'), value: this.draft.name, autocomplete: 'nickname' });
    const err = h('div', { class: 'err' });
    const next = h('button', { class: 'btn primary wide' }, t('onb.next'));
    const ok = () => /^[\p{L}\p{N}_ .-]{3,16}$/u.test(name.value.trim());
    name.addEventListener('input', () => { this.draft.name = name.value; err.textContent = ''; });
    next.addEventListener('click', () => {
      if (!ok()) { err.textContent = t('onb.nameErr'); return; }
      this.draft.name = name.value.trim();
      this.go(4);
    });
    const avatars = h('div', { class: 'avatar-pick' }, ...AVATARS.filter((a) => !a.cost).map((a) => h('button', {
      class: 'avatar-item' + (this.draft.avatar === a.id ? ' on' : ''),
      onclick: (e) => {
        this.draft.avatar = a.id;
        e.currentTarget.parentNode.querySelectorAll('.avatar-item').forEach((x) => x.classList.toggle('on', x === e.currentTarget));
        Sfx.tap();
      },
    }, avatarArt(a.id), h('span', {}, a.cast.name))));
    return this.shell(t('onb.profile'), t('onb.profileSub'), h('div', {}, name, err, h('h2', { class: 'section' }, t('onb.pickAvatar')), avatars,
      h('div', { class: 'card email-later' }, icon('lock'), h('div', {}, h('b', {}, t('onb.emailTitle')), h('span', {}, t('onb.emailLater'))))), next);
  },

  step4() {
    return this.shell(t('onb.goal'), null,
      h('div', { class: 'goal-explain' },
        h('div', { class: 'card week' }, ring(0.35, '20<small>min</small>'),
          h('div', { class: 'week-text' }, h('b', {}, t('onb.goalTitle')), h('span', {}, t('onb.goalSub')))),
        h('ul', { class: 'how' },
          h('li', {}, icon('calendar'), t('onb.how1')),
          h('li', {}, icon('refresh'), t('onb.how2')),
          h('li', {}, icon('mountain'), t('onb.how3')),
          h('li', {}, icon('coin'), t('onb.how4')))),
      h('button', { class: 'btn primary wide', onclick: () => this.finish() }, t('onb.go')),
      { cast: castArt(this.draft.avatar, 'happy', 'onb-cast') });
  },

  finish() {
    const d = Store.data;
    d.native = this.draft.native;
    d.target = this.draft.target;
    if (!d.profile) {
      d.profile = { name: this.draft.name, avatar: this.draft.avatar, banner: 'blue', joined: today() };
      if (!d.owned.includes(this.draft.avatar)) d.owned.push(this.draft.avatar);
    }
    Store.save();
    this.active = false;
    App.enter();
  },
};
