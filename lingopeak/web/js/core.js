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
const WEEKLY_GOAL_SECS = 20 * 60;
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
      settings: { theme: 'system', sound: true, vibrate: true, voice: true, rate: 0.9, voiceName: '' },
    };
  },
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { saved = {}; }
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
    if (before >= WEEKLY_GOAL_SECS || d.week.secs < WEEKLY_GOAL_SECS) return false;
    const st = d.weekStreak;
    st.n = st.last === prevWeekId(d.week.id) ? st.n + 1 : 1;
    st.last = d.week.id;
    st.best = Math.max(st.best || 0, st.n);
    d.gems += 5;
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
const Sfx = {
  ctx: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, dur, { type = 'sine', vol = 0.16, slide = 0, delay = 0 } = {}) {
    if (!Store.s.sound) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  tap() { this.tone(880, 0.04, { type: 'triangle', vol: 0.06 }); },
  pop() { this.tone(520, 0.12, { slide: 700, vol: 0.2 }); },
  good(n = 0) {
    const base = 660 * Math.pow(2, Math.min(n, 8) / 12);
    this.tone(base, 0.1, { type: 'triangle' });
    this.tone(base * 1.5, 0.14, { type: 'triangle', delay: 0.07 });
  },
  bad() { this.tone(200, 0.2, { type: 'sawtooth', vol: 0.07, slide: -60 }); },
  coin() { this.tone(1320, 0.07, { type: 'square', vol: 0.05 }); this.tone(1760, 0.12, { type: 'square', vol: 0.05, delay: 0.06 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', delay: i * 0.1 })); },
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', delay: i * 0.14 })); },
  flip() { this.tone(400, 0.06, { type: 'triangle', vol: 0.1, slide: 300 }); },
  whack() { this.tone(220, 0.08, { type: 'square', vol: 0.1, slide: -100 }); },
  tick() { this.tone(1200, 0.03, { type: 'square', vol: 0.04 }); },
  swoosh() { this.tone(300, 0.15, { vol: 0.1, slide: 900 }); },
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
        weekId: d.week.id, mins: Math.floor(d.week.secs / 60), goal: WEEKLY_GOAL_SECS / 60, streak: Store.weekStreakNow(),
        words: stats.words, pct: stats.pct, lang: t('lang.' + d.target), days: daysLeftInWeek(),
        labels: { week: t('widget.week'), streak: t('widget.streak'), words: t('widget.words'), done: t('widget.done') },
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
  const colors = ['var(--blue)', 'var(--yellow)', 'var(--coral)'];
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
