// Shared machinery: DOM helpers, saved progress, sound, speech, haptics and
// the bridge to the Android app (window.Native) when there is one.

// ------------------------------------------------------------------ helpers
const $ = (sel, root = document) => root.querySelector(sel);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    } else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(kid));
  }
  return el;
}
const DAY = 864e5;
const today = () => new Date().toISOString().slice(0, 10);
const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// Lower case without punctuation, for comparing answers.
const normText = (s) => String(s).toLowerCase().replace(/[¿?¡!.,;:"“”«»()]/g, '').replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();
const fmtNum = (n) => Number(n || 0).toLocaleString(I18N_LOCALE[UI.lang] || 'en-GB');

// ISO week like 2026-W42 (weeks start on Monday).
function weekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - jan1) / DAY + 1) / 7)).padStart(2, '0')}`;
}
const prevWeekId = (id) => {
  const [y, w] = id.split('-W').map(Number);
  // Monday of week w, minus 7 days.
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const mon = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * DAY + (w - 1) * 7 * DAY);
  return weekId(new Date(mon.getTime() - 7 * DAY + 12 * 36e5));
};
// Days left in this week, today included (Monday = 7, Sunday = 1).
const daysLeftInWeek = () => 8 - (new Date().getDay() || 7);

// ------------------------------------------------------------------ saved progress
// The weekly goal in seconds (20 minutes unless changed in Settings).
const goalSecs = () => (Number(Store.data && Store.s.goal) || 20) * 60;
// Bumped to start everyone afresh: older saves are cleared on the next launch.
const DATA_EPOCH = 2;
const WEEK_COINS = 50, MOUNTAIN_COINS = 300, MOUNTAIN_XP = 500;
const Store = {
  KEY: 'lingopeak.v1',
  data: null,
  defaults() {
    return {
      profile: null, // { name, avatar, banner, joined }
      native: null, target: null,
      courses: {},   // 'en>es' → { lessons: {}, words: {}, mountains: {} }
      xp: 0, coins: 0, gems: 0,
      week: { id: weekId(), secs: 0, xp: 0 },
      weekStreak: { n: 0, last: null, best: 0 },
      freezes: 0, boostUntil: 0,
      owned: ['banana', 'shark', 'dino', 'astro'],
      totalSecs: 0, sessions: 0,
      epoch: DATA_EPOCH,
      settings: { theme: 'system', sound: true, vibrate: true, voice: true, rate: 0.9, voiceName: '', goal: 20, listen: true, typing: true, effects: true, text: 'normal' },
    };
  },
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { saved = {}; }
    if (saved.epoch !== DATA_EPOCH) {
      // An account from before the last fresh start: begin again.
      saved = {};
      try { localStorage.removeItem(this.KEY); localStorage.removeItem('lingopeak.session'); } catch (e) { /* ignore */ }
    }
    const d = this.defaults();
    this.data = { ...d, ...saved, settings: { ...d.settings, ...(saved.settings || {}) } };
    this.rollWeek();
  },
  save(opts = {}) {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* storage full or blocked */ }
    if (!opts.quiet && typeof Cloud !== 'undefined') Cloud.queueSync();
    if (typeof Widget !== 'undefined') Widget.update();
  },
  get s() { return this.data.settings; },
  get pair() { return `${this.data.native}>${this.data.target}`; },
  // Progress for the language pair being learned.
  get course() {
    const c = this.data.courses;
    if (!c[this.pair]) c[this.pair] = { lessons: {}, words: {}, mountains: {} };
    return c[this.pair];
  },

  // A new week: if last week's goal was missed, a streak freeze (if you
  // have one) keeps the streak alive; otherwise it ends.
  rollWeek() {
    const d = this.data;
    const now = weekId();
    if (d.week && d.week.id === now) return;
    const st = d.weekStreak;
    const prev = prevWeekId(now);
    if (st.n && st.last !== prev && st.last !== now) {
      if (d.freezes > 0 && st.last === prevWeekId(prev)) { d.freezes--; st.last = prev; st.frozen = prev; }
      else st.n = 0;
    }
    d.week = { id: now, secs: 0, xp: 0 };
  },
  // Time spent learning counts towards the weekly goal. Returns true the
  // moment this week's goal is reached.
  addTime(secs) {
    const d = this.data;
    this.rollWeek();
    const before = d.week.secs;
    d.week.secs += secs;
    d.totalSecs = (d.totalSecs || 0) + secs;
    if (before >= goalSecs() || d.week.secs < goalSecs()) return false;
    const st = d.weekStreak;
    st.n = st.last === prevWeekId(d.week.id) ? st.n + 1 : 1;
    st.last = d.week.id;
    st.best = Math.max(st.best || 0, st.n);
    d.coins += WEEK_COINS;
    return true;
  },
  weekStreakNow() {
    const st = this.data.weekStreak;
    return st.last === weekId() || st.last === prevWeekId(weekId()) ? st.n : 0;
  },
  boosted: () => Date.now() < (Store.data.boostUntil || 0),
  addXp(n) {
    const gained = this.boosted() ? n * 2 : n;
    this.rollWeek();
    this.data.xp += gained;
    this.data.week.xp += gained;
    return gained;
  },
  level() {
    let lvl = 1, need = 100, xp = this.data.xp;
    while (xp >= need) { xp -= need; lvl++; need += 50; }
    return { lvl, into: xp, need };
  },
};

// Counts time spent in lessons, practice and games towards the weekly goal.
// Time only counts while the screen is on and you've touched it recently.
const Timer = {
  running: false, last: 0, lastTouch: 0, pending: 0, id: null,
  start() {
    this.running = true;
    this.last = this.lastTouch = Date.now();
    if (!this.id) this.id = setInterval(() => this.tick(), 1000);
  },
  tick() {
    if (!this.running) return;
    const now = Date.now();
    const dt = Math.min(5, (now - this.last) / 1000);
    this.last = now;
    if (document.hidden || now - this.lastTouch > 45000) return;
    this.pending += dt;
  },
  // Stops counting and books the time. Returns whole seconds booked.
  stop() {
    this.tick();
    this.running = false;
    const secs = Math.round(this.pending);
    this.pending = 0;
    if (secs > 0) {
      const reached = Store.addTime(secs);
      Store.save();
      if (reached && typeof App !== 'undefined') App.celebrateWeek();
    }
    return secs;
  },
};
document.addEventListener('pointerdown', () => { Timer.lastTouch = Date.now(); }, true);

// ------------------------------------------------------------------ sound
// Every sound is synthesised (no audio files): bells for right answers that
// climb in pitch with your streak, a buzzy "uh-uh" for wrong ones, coin chings,
// a deep boom and a fanfare for big moments, all through a little reverb.
const Sfx = {
  ctx: null, out: null, verb: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      const ctx = this.ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      comp.connect(ctx.destination);
      this.out = ctx.createGain(); this.out.gain.value = 0.9; this.out.connect(comp);
      // A short, soft room: decaying noise as the impulse.
      const len = Math.floor(ctx.sampleRate * 1.4);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
      const conv = ctx.createConvolver(); conv.buffer = ir;
      this.verb = ctx.createGain(); this.verb.gain.value = 0.22;
      this.verb.connect(conv).connect(this.out);
      const n = Math.floor(ctx.sampleRate * 1);
      this.noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
      const nd = this.noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  on() { return Store.s.sound && this.ensure(); },
  // One note: type, frequency (and optional glide), volume envelope.
  note(freq, at, dur, { type = 'sine', vol = 0.2, attack = 0.005, to = 0, wet = true, lp = 0 } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f).connect(g); } else o.connect(g);
    g.connect(this.out); if (wet) g.connect(this.verb);
    o.start(t); o.stop(t + dur + 0.05);
  },
  // A bell: a sine with two quieter overtones.
  bell(freq, at, vol = 0.18, dur = 0.7) {
    this.note(freq, at, dur, { vol });
    this.note(freq * 2.01, at, dur * 0.6, { vol: vol * 0.32 });
    this.note(freq * 3.98, at, dur * 0.35, { vol: vol * 0.12 });
  },
  noise(at, dur, { vol = 0.2, type = 'lowpass', freq = 1200, to = 0, q = 0.7, wet = false } = {}) {
    const ctx = this.ctx, t = ctx.currentTime + at;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g); g.connect(this.out); if (wet) g.connect(this.verb);
    src.start(t); src.stop(t + dur + 0.05);
  },
  semis: (n) => Math.pow(2, n / 12),

  // A soft, low beep for taps (no clicky ticks).
  tap() { if (!this.on()) return; this.note(330, 0, 0.07, { vol: 0.09, wet: false }); },
  select() { if (!this.on()) return; this.note(740, 0, 0.09, { type: 'triangle', vol: 0.09 }); this.note(1110, 0.02, 0.07, { vol: 0.04 }); },
  // "da-DUN": two bells a fifth apart, higher with every answer in a row.
  good(streak = 0) {
    if (!this.on()) return;
    const up = this.semis(Math.min(streak, 10));
    const base = 698 * up;
    this.note(150, 0, 0.16, { vol: 0.32, to: 55, wet: false }); // a soft thump underneath for weight
    this.bell(base, 0, 0.19, 0.5);
    this.bell(base * 1.5, 0.085, 0.24, 0.9);
    [2, 2.5, 3].forEach((m, i) => this.note(base * m, 0.17 + i * 0.045, 0.18, { vol: 0.035 }));
    if (streak >= 3) this.noise(0.08, 0.35, { vol: 0.05, type: 'highpass', freq: 6000, wet: true });
  },
  // A wrong answer: a game-show "uh-uh" buzzer, two buzzy notes going down with a thud.
  bad() {
    if (!this.on()) return;
    this.note(140, 0, 0.2, { vol: 0.42, to: 55, wet: false });
    [[233, 0, 0.15, 0], [175, 0.17, 0.36, 150]].forEach(([f, at, dur, to]) => {
      this.note(f, at, dur, { type: 'sawtooth', vol: 0.26, to, lp: 1300, attack: 0.01 });
      this.note(f * 1.012, at, dur, { type: 'square', vol: 0.11, to: to && to * 1.012, lp: 1000, attack: 0.01, wet: false });
    });
    this.noise(0, 0.12, { vol: 0.08, freq: 500 });
  },
  // A small mistake typing into a form: a soft "bwom".
  oops() { if (!this.on()) return; this.note(330, 0, 0.18, { type: 'triangle', vol: 0.16, to: 262 }); this.note(220, 0.12, 0.32, { type: 'triangle', vol: 0.14, to: 165 }); },
  coin() { if (!this.on()) return; this.note(1976, 0, 0.06, { type: 'square', vol: 0.045 }); this.note(2637, 0.055, 0.32, { type: 'square', vol: 0.045 }); this.bell(2637, 0.055, 0.05, 0.4); },
  // A soft low beep (counting up rewards).
  tick() { if (!this.on()) return; this.note(392, 0, 0.05, { vol: 0.06, wet: false }); },
  // A deep thump for big moments.
  boom() {
    if (!this.on()) return;
    this.note(130, 0, 0.7, { vol: 0.55, to: 38, wet: false });
    this.noise(0, 0.45, { vol: 0.35, type: 'lowpass', freq: 900, to: 80, wet: true });
  },
  whoosh() { if (!this.on()) return; this.noise(0, 0.4, { vol: 0.16, type: 'bandpass', freq: 400, to: 4000, q: 1.2, wet: true }); },
  sparkle() { if (!this.on()) return; [0, 4, 7, 12, 16].forEach((s, i) => this.bell(1568 * this.semis(s), i * 0.05, 0.05, 0.4)); },
  // Lesson complete: boom, then a rising arpeggio into a held chord.
  fanfare() {
    if (!this.on()) return;
    this.boom();
    [523, 659, 784, 1047].forEach((f, i) => this.bell(f, 0.1 + i * 0.09, 0.15, 0.8));
    [523, 659, 784].forEach((f) => this.note(f, 0.46, 1.2, { type: 'triangle', vol: 0.06, attack: 0.03 }));
    this.sparkle && setTimeout(() => this.sparkle(), 450);
  },
  // A drum roll that lands on a boom (mountain reveal).
  drumroll(ms = 1200) {
    if (!this.on()) return;
    let t = 0, gap = 0.11;
    while (t < ms / 1000) { this.noise(t, 0.06, { vol: 0.12 + t * 0.12, type: 'bandpass', freq: 220, q: 1.5 }); t += gap; gap = Math.max(0.035, gap * 0.9); }
  },
  win() { this.fanfare(); },
  lose() { if (!this.on()) return; [392, 330, 262].forEach((f, i) => this.note(f, i * 0.16, 0.3, { type: 'triangle', vol: 0.12 })); },
  pop() { if (!this.on()) return; this.note(420, 0, 0.12, { vol: 0.25, to: 980 }); this.noise(0, 0.05, { vol: 0.1, type: 'highpass', freq: 2500 }); },
  flip() { if (!this.on()) return; this.noise(0, 0.08, { vol: 0.1, type: 'bandpass', freq: 1800, to: 3500 }); },
  whack() { if (!this.on()) return; this.note(180, 0, 0.12, { type: 'square', vol: 0.08, to: 90 }); this.noise(0, 0.08, { vol: 0.25, freq: 1500 }); },
  swoosh() { this.whoosh(); },
};

const Haptics = {
  buzz(ms) {
    if (!Store.s.vibrate) return;
    try {
      if (window.Native && window.Native.vibrate) window.Native.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) { /* ignore */ }
  },
};

// ------------------------------------------------------------------ speech
// The Android app lends the phone's text-to-speech (Google's voices when
// installed) through window.Native; in a browser we use the Web Speech API.
const VOICE_LOCALE = { en: 'en-GB', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR' };
const Voice = {
  native: () => !!(window.Native && window.Native.speakIn),
  webVoice(lang) {
    if (!window.speechSynthesis) return null;
    const all = speechSynthesis.getVoices();
    const want = VOICE_LOCALE[lang];
    return all.find((v) => v.lang.replace('_', '-') === want) || all.find((v) => v.lang.startsWith(lang)) || null;
  },
  available: () => Voice.native() || !!window.speechSynthesis,
  // 'ok' | 'missing' | 'init' | 'none' for a language.
  state(lang) {
    try {
      if (this.native()) return window.Native.ttsState(lang || Store.data.target || 'en');
      if (!window.speechSynthesis) return 'none';
      return this.webVoice(lang || Store.data.target) ? 'ok' : 'missing';
    } catch (e) { return 'none'; }
  },
  // A single word is said more slowly than a sentence, so every sound is clear.
  rateFor(text, slow) {
    const rate = Store.s.rate || 0.9;
    const r = /\s/.test(String(text).trim()) ? rate : rate * 0.8;
    return Math.max(0.35, slow ? r * 0.6 : r);
  },
  // Speaks text in a language (defaults to the one being learned).
  say(text, opts = {}) {
    const lang = opts.lang || Store.data.target;
    if (!text || (!Store.s.voice && !opts.force)) return;
    const clean = String(text).split('|')[0];
    try {
      if (this.native()) { window.Native.speakIn(clean, this.rateFor(clean, opts.slow), lang, !!opts.queue); return; }
      if (window.speechSynthesis) {
        if (!opts.queue) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = VOICE_LOCALE[lang] || lang;
        u.rate = this.rateFor(clean, opts.slow);
        const v = this.webVoice(lang);
        if (v) u.voice = v;
        speechSynthesis.speak(u);
      }
    } catch (e) { /* speech is a bonus, never fatal */ }
  },
  stop() {
    try {
      if (window.Native && window.Native.stop) window.Native.stop();
      else if (window.speechSynthesis) speechSynthesis.cancel();
    } catch (e) { /* ignore */ }
  },
  install(lang) {
    try { if (window.Native && window.Native.installVoice) window.Native.installVoice(lang || Store.data.target); } catch (e) { /* ignore */ }
  },
};

// ------------------------------------------------------------------ home-screen widget
// Hands the numbers the Android widget shows to the app, which redraws it.
const Widget = {
  last: '',
  update() {
    if (!(window.Native && window.Native.updateWidget) || !Store.data.profile) return;
    try {
      const d = Store.data;
      const stats = typeof courseStats === 'function' ? courseStats() : { words: 0, pct: 0 };
      const json = JSON.stringify({
        weekId: d.week.id, mins: Math.floor(d.week.secs / 60), goal: goalSecs() / 60, streak: Store.weekStreakNow(),
        words: stats.words, pct: stats.pct, lang: t('lang.' + d.target), days: daysLeftInWeek(),
        labels: {
          week: t('widget.week'), streak: t('widget.streak'), words: t('widget.words'), done: t('widget.done'),
          // For the square widget ({n} is filled in on the phone, so it stays right as the week goes on).
          goalTodo: t('widget.goalTodo', { n: '{n}' }), goalToGo: t('widget.goalToGo', { n: '{n}' }), goalDone: t('widget.goalDone'),
          daysLeft: t('widget.daysLeft', { n: '{n}' }), lastDay: t('widget.lastDay'),
        },
      });
      if (json === this.last) return;
      this.last = json;
      window.Native.updateWidget(json);
    } catch (e) { /* the widget is a bonus */ }
  },
};

// ------------------------------------------------------------------ sharing
const APK_URL = 'https://github.com/OlRock8910/Unknown-projects/raw/main/lingopeak/apk/LingoPeak.apk';
const Share = {
  async send(text) {
    const full = `${text}\n\n${t('share.get')} ${APK_URL}`;
    try {
      if (window.Native && window.Native.share) { window.Native.share(full); return; }
      if (navigator.share) { await navigator.share({ title: 'Lingo Peak', text: full }); return; }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    try { await navigator.clipboard.writeText(full); toast(t('share.copied')); } catch (e) { toast(full, 5000); }
  },
};

// ------------------------------------------------------------------ toast & effects
function toast(msg, ms = 2000) {
  const el = h('div', { class: 'toast' }, msg);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
}
function burst(x, y, color, n = 12, root = document.body) {
  if (Store.data && Store.s.effects === false) return;
  const rect = root.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const p = h('div', { class: 'particle' });
    const ang = (Math.PI * 2 * i) / n + rand(-0.3, 0.3);
    const dist = rand(30, 80);
    p.style.background = color;
    p.style.left = x - rect.left + 'px';
    p.style.top = y - rect.top + 'px';
    p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
    root.append(p);
    setTimeout(() => p.remove(), 650);
  }
}
// A burst of gold sparks and a shock ring at (x, y): the reward for a right answer.
function goldBurst(x, y, big = false) {
  if (Store.data && Store.s.effects === false) return;
  const layer = document.body;
  const ring = h('div', { class: 'gold-ring' + (big ? ' big' : '') });
  ring.style.left = x + 'px'; ring.style.top = y + 'px';
  layer.append(ring);
  setTimeout(() => ring.remove(), 700);
  const n = big ? 26 : 16;
  for (let i = 0; i < n; i++) {
    const p = h('div', { class: 'spark' + (i % 3 === 0 ? ' star' : '') });
    const ang = (Math.PI * 2 * i) / n + rand(-0.25, 0.25);
    const dist = rand(50, big ? 160 : 110);
    p.style.left = x + 'px'; p.style.top = y + 'px';
    p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(ang) * dist - 20 + 'px');
    p.style.setProperty('--s', rand(0.6, 1.3));
    p.style.animationDuration = rand(0.55, 0.9) + 's';
    layer.append(p);
    setTimeout(() => p.remove(), 950);
  }
}
// Gold coins that fly from (x, y) to an element (the coin counter).
function coinFly(x, y, toEl, n = 6) {
  if (Store.data && Store.s.effects === false) return;
  if (!toEl) return;
  const [tx, ty] = centerOf(toEl);
  for (let i = 0; i < n; i++) {
    const c = h('div', { class: 'fly-coin' }, artImg('icons/coin.webp') || '');
    c.style.left = x + rand(-30, 30) + 'px'; c.style.top = y + rand(-20, 20) + 'px';
    c.style.setProperty('--tx', tx - x + 'px'); c.style.setProperty('--ty', ty - y + 'px');
    c.style.animationDelay = i * 0.07 + 's';
    document.body.append(c);
    setTimeout(() => { c.remove(); if (i % 2 === 0) Sfx.coin(); toEl.classList.remove('bump'); void toEl.offsetWidth; toEl.classList.add('bump'); }, 700 + i * 70);
  }
}
// Counts a number up inside el, ticking as it goes.
function countUp(el, to, { from = 0, ms = 900, prefix = '', suffix = '' } = {}) {
  const start = performance.now();
  let lastTick = 0;
  const step = (now) => {
    const f = Math.min(1, (now - start) / ms);
    const v = Math.round(from + (to - from) * (1 - Math.pow(1 - f, 3)));
    el.textContent = prefix + fmtNum(v) + suffix;
    if (now - lastTick > 60 && f < 1) { Sfx.tick(); lastTick = now; }
    if (f < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function floatText(x, y, text, cls = 'good', root = document.body) {
  const rect = root.getBoundingClientRect();
  const el = h('div', { class: 'float-text ' + cls }, text);
  el.style.left = x - rect.left + 'px';
  el.style.top = y - rect.top + 'px';
  root.append(el);
  setTimeout(() => el.remove(), 900);
}
const centerOf = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
function confetti(host) {
  if (Store.data && Store.s.effects === false) return;
  const colors = ['var(--blue)', 'var(--gold)', 'var(--coral)', 'var(--gold)'];
  for (let i = 0; i < 50; i++) {
    const c = h('div', { class: 'confetti' });
    c.style.left = rand(0, 100) + '%';
    c.style.background = pickOne(colors);
    c.style.animationDelay = rand(0, 0.5) + 's';
    c.style.animationDuration = rand(1.8, 3) + 's';
    c.style.setProperty('--r', rand(-720, 720) + 'deg');
    c.style.setProperty('--x', rand(-60, 60) + 'px');
    host.append(c);
    setTimeout(() => c.remove(), 3800);
  }
}
