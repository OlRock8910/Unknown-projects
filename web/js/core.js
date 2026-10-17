// Shared machinery: helpers, saved progress, sound, speech, haptics, and the
// game session every mini game runs inside.

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
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, val);
        else el.style[prop] = val;
      }
    }
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(kid));
  }
  return el;
}
const today = () => new Date().toISOString().slice(0, 10);
const stripAccents = (s) => s.normalize('NFD').replace(/[̀-́̈]/g, '');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ------------------------------------------------------------------ saved progress
const Store = {
  KEY: 'adjetivos.v1',
  data: null,
  defaults() {
    return {
      xp: 0, played: 0, best: {}, stars: {}, mastery: {},
      daily: { date: today(), xp: 0 }, streak: { last: null, n: 0 },
      settings: { sound: true, vibrate: true, voice: true, readTasks: true, rate: 0.9, pack: 'all', voiceName: '' },
    };
  },
  load() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(this.KEY)) || {}; } catch (e) { saved = {}; }
    const d = this.defaults();
    this.data = { ...d, ...saved, settings: { ...d.settings, ...(saved.settings || {}) } };
    if (this.data.daily.date !== today()) this.data.daily = { date: today(), xp: 0 };
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* storage full or blocked */ }
  },
  get s() { return this.data.settings; },
  mastery(id) { return this.data.mastery[id] || 0; },
  bump(id, delta) {
    const m = Math.max(0, Math.min(5, this.mastery(id) + delta));
    this.data.mastery[id] = m;
  },
  addXp(n) {
    this.data.xp += n;
    if (this.data.daily.date !== today()) this.data.daily = { date: today(), xp: 0 };
    this.data.daily.xp += n;
    const st = this.data.streak;
    if (st.last !== today()) {
      const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      st.n = st.last === y ? st.n + 1 : 1;
      st.last = today();
    }
    this.save();
  },
  level() {
    // Each level needs 100 XP more than the one before: 100, 200, 300…
    let lvl = 1, need = 100, xp = this.data.xp;
    while (xp >= need) { xp -= need; lvl++; need += 100; }
    return { lvl, into: xp, need };
  },
  streakNow() {
    const st = this.data.streak;
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    return st.last === today() || st.last === y ? st.n : 0;
  },
};
const DAILY_GOAL = 60;

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
  tone(freq, dur, { type = 'sine', vol = 0.18, slide = 0, delay = 0 } = {}) {
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
  pop() { this.tone(520, 0.12, { slide: 700, vol: 0.22 }); this.tone(1400, 0.05, { type: 'triangle', vol: 0.08 }); },
  good(combo = 0) {
    const base = 660 * Math.pow(2, Math.min(combo, 8) / 12);
    this.tone(base, 0.1, { type: 'triangle' });
    this.tone(base * 1.5, 0.14, { type: 'triangle', delay: 0.07 });
  },
  bad() { this.tone(180, 0.22, { type: 'sawtooth', vol: 0.09, slide: -60 }); },
  tap() { this.tone(900, 0.04, { type: 'square', vol: 0.05 }); },
  flip() { this.tone(400, 0.06, { type: 'triangle', vol: 0.1, slide: 300 }); },
  whack() { this.tone(220, 0.08, { type: 'square', vol: 0.12, slide: -100 }); },
  tick() { this.tone(1200, 0.03, { type: 'square', vol: 0.04 }); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', delay: i * 0.1 })); },
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.22, { type: 'triangle', delay: i * 0.14 })); },
  swoosh() { this.tone(300, 0.15, { type: 'sine', vol: 0.1, slide: 900 }); },
};

// ------------------------------------------------------------------ speech
// In the APK the phone's text-to-speech engine (Google's when installed, the
// same voices as Google Translate) is exposed as window.Native; in a browser
// fall back to the Web Speech API.
const REGION_NAMES = { ES: '🇪🇸 Spain', MX: '🇲🇽 Mexico', US: '🇺🇸 US Spanish', AR: '🇦🇷 Argentina', CO: '🇨🇴 Colombia', 419: '🌎 Latin America' };
const Voice = {
  esVoice: null,
  native: () => !!(window.Native && window.Native.speak),
  init() {
    if (this.native()) {
      if (Store.s.voiceName && window.Native.setVoice) window.Native.setVoice(Store.s.voiceName);
    } else if (window.speechSynthesis) {
      const pick = () => {
        const vs = speechSynthesis.getVoices().filter((v) => /^es/i.test(v.lang));
        this.esVoice = vs.find((v) => v.name === Store.s.voiceName) || vs.find((v) => /^es[-_]ES/i.test(v.lang)) || vs[0] || null;
      };
      pick();
      speechSynthesis.onvoiceschanged = pick;
    }
  },
  available() {
    return this.native() || !!window.speechSynthesis;
  },
  // 'init' | 'ok' | 'missing' | 'error' | 'none'
  state() {
    try {
      if (this.native()) return window.Native.ttsState();
      if (!window.speechSynthesis) return 'none';
      return this.esVoice ? 'ok' : 'missing';
    } catch (e) { return 'error'; }
  },
  // { google, current, voices: [{ name, locale, label }] } with friendly labels.
  info() {
    let raw = { google: false, current: '', voices: [] };
    try {
      if (this.native() && window.Native.voiceInfo) raw = { ...raw, ...JSON.parse(window.Native.voiceInfo()) };
      else if (window.speechSynthesis) {
        raw.voices = speechSynthesis.getVoices().filter((v) => /^es/i.test(v.lang)).map((v) => ({ name: v.name, locale: v.lang }));
        raw.current = this.esVoice ? this.esVoice.name : '';
      }
    } catch (e) { /* keep defaults */ }
    const counts = {};
    raw.voices = (raw.voices || []).map((v) => {
      const region = (v.locale || '').split(/[-_]/)[1] || '';
      const place = REGION_NAMES[region.toUpperCase()] || '🌎 ' + (v.locale || 'Spanish');
      counts[place] = (counts[place] || 0) + 1;
      return { ...v, label: `${place} · voice ${counts[place]}` };
    });
    return raw;
  },
  select(name) {
    Store.s.voiceName = name;
    Store.save();
    try {
      if (this.native()) window.Native.setVoice(name);
      else if (window.speechSynthesis) this.esVoice = speechSynthesis.getVoices().find((v) => v.name === name) || this.esVoice;
    } catch (e) { /* ignore */ }
  },
  install() {
    try { if (this.native() && window.Native.installVoice) window.Native.installVoice(); } catch (e) { /* ignore */ }
  },
  say(text, force = false) {
    if (!Store.s.voice && !force) return;
    const rate = Store.s.rate || 0.9;
    try {
      if (this.native()) {
        const state = window.Native.ttsState();
        if ((state === 'missing' || state === 'error') && !this.warned) {
          this.warned = true;
          toast('No Spanish voice yet — tap “Get the Google voice” on the home screen', 4000);
        }
        window.Native.speak(text, rate);
        return;
      }
      if (window.speechSynthesis) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'es-ES';
        u.rate = rate;
        if (this.esVoice) u.voice = this.esVoice;
        speechSynthesis.speak(u);
      }
    } catch (e) { /* speech is a bonus, never fatal */ }
  },
  // Speaks a mix of English and Spanish in order: [{ text, lang: 'en'|'es', force }].
  // English parts follow the "read tasks aloud" setting, Spanish ones the voice
  // setting; force (or opts.force) ignores both. opts.queue waits for current speech.
  play(parts, opts = {}) {
    const rate = Store.s.rate || 0.9;
    const keep = parts.filter((p) => p && p.text && (opts.force || p.force || (p.lang === 'en' ? Store.s.readTasks : Store.s.voice)));
    if (!keep.length) return;
    try {
      if (this.native() && window.Native.speakIn) {
        keep.forEach((p, i) => window.Native.speakIn(p.text, p.lang === 'en' ? Math.max(rate, 1) : rate, p.lang, !!opts.queue || i > 0));
        return;
      }
      if (this.native()) { // older bridge: Spanish only
        const es = keep.filter((p) => p.lang !== 'en').map((p) => p.text).join('. ');
        if (es) window.Native.speak(es, rate);
        return;
      }
      if (window.speechSynthesis) {
        if (!opts.queue) speechSynthesis.cancel();
        const all = speechSynthesis.getVoices();
        const en = all.find((v) => /^en[-_]GB/i.test(v.lang)) || all.find((v) => /^en/i.test(v.lang));
        keep.forEach((p) => {
          const u = new SpeechSynthesisUtterance(p.text);
          u.lang = p.lang === 'en' ? 'en-GB' : 'es-ES';
          u.rate = p.lang === 'en' ? Math.max(rate, 1) : rate;
          const v = p.lang === 'en' ? en : this.esVoice;
          if (v) u.voice = v;
          speechSynthesis.speak(u);
        });
      }
    } catch (e) { /* speech is a bonus, never fatal */ }
  },
  stop() {
    try {
      if (window.Native && window.Native.stop) window.Native.stop();
      else if (window.speechSynthesis) speechSynthesis.cancel();
    } catch (e) { /* ignore */ }
  },
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

// ------------------------------------------------------------------ word choice
function currentPool(min = 8) {
  const pack = PACKS.find((p) => p.id === Store.s.pack) || PACKS[0];
  const words = WORDS.filter(pack.test);
  return words.length >= min ? words : WORDS;
}

// Picks n distinct words, favouring the ones you know least.
function pickWords(n, filter = () => true, pool = currentPool()) {
  let cands = pool.filter(filter);
  if (cands.length < n) cands = WORDS.filter(filter);
  const out = [];
  const bag = cands.slice();
  while (out.length < n && bag.length) {
    const weights = bag.map((w) => 6 - Store.mastery(w.id));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    let i = 0;
    while (r > weights[i]) { r -= weights[i]; i++; }
    out.push(bag.splice(Math.min(i, bag.length - 1), 1)[0]);
  }
  return out;
}

// Two words could be confused with each other as answers.
const clash = (a, b) => a.id === b.id || a.short === b.short || (a.s && a.s === b.s) || a.e === b.e;

// Wrong answers for w that can't be mistaken for a right one.
function distractors(w, n, filter = () => true) {
  const avoid = (d) => !clash(d, w) && filter(d);
  let cands = shuffle(currentPool().filter(avoid));
  if (cands.length < n) cands = shuffle(WORDS.filter(avoid));
  const out = [];
  for (const d of cands) {
    if (out.length >= n) break;
    if (out.every((o) => !clash(o, d))) out.push(d);
  }
  return out;
}

const form = (w, g) => (g === 'f' ? w.f : w.m);
const verbFor = (w) => (w.v === 'ser' ? 'es' : 'está');

// A Spanish/English sentence pair describing someone with w.
function makeSentence(w, opts = {}) {
  const subj = opts.subject || pickOne(SUBJECTS);
  const int = opts.plain ? INTENSIFIERS[0] : pickOne(INTENSIFIERS);
  const verb = verbFor(w);
  const adj = form(w, subj.g);
  const es = `${subj.es} ${verb}${int.es ? ' ' + int.es : ''} ${adj}.`;
  const en = `${subj.en} is${int.en ? ' ' + int.en : ''} ${w.short}.`;
  return { es, en, subj, int, verb, adj };
}

// ------------------------------------------------------------------ toast & bursts
function toast(msg, ms = 1800) {
  const t = h('div', { class: 'toast' }, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

function burst(x, y, color = '#fff', n = 12, root = document.body) {
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

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

// ------------------------------------------------------------------ session
// One playthrough of one mini game. Owns the HUD, timers, animation loop,
// scoring and the hand-off to the results screen.
class Session {
  constructor(game, host, onExit) {
    this.game = game;
    this.onExit = onExit;
    this.score = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.right = 0;
    this.wrong = 0;
    this.missed = new Map();
    this.learned = new Set();
    this.timers = new Set();
    this.cleanups = [];
    this.over = false;
    this.lives = null;
    this.raf = null;

    this.scoreEl = h('div', { class: 'hud-score' }, '0');
    this.comboEl = h('div', { class: 'hud-combo' });
    this.extraEl = h('div', { class: 'hud-extra' });
    this.barEl = h('div', { class: 'hud-bar' }, h('i'));
    this.hud = h('div', { class: 'hud' },
      h('button', { class: 'icon-btn', 'aria-label': 'Quit', onclick: () => this.quit() }, '✕'),
      h('div', { class: 'hud-title' }, h('span', {}, game.emoji), ' ', game.name),
      h('div', { class: 'hud-right' }, this.comboEl, this.scoreEl, this.extraEl),
    );
    this.stage = h('div', { class: 'stage' });
    this.root = h('div', { class: 'game-screen', style: { '--g1': game.colors[0], '--g2': game.colors[1] } },
      this.hud, this.barEl, this.stage);
    host.replaceChildren(this.root);
  }

  // ---- timing
  after(ms, fn) {
    const id = setTimeout(() => { this.timers.delete(id); if (!this.over) fn(); }, ms);
    this.timers.add(id);
    return id;
  }
  every(ms, fn) {
    const id = setInterval(() => { if (!this.over) fn(); }, ms);
    this.timers.add(id);
    return id;
  }
  loop(fn) {
    let last = performance.now();
    const step = (now) => {
      if (this.over) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      fn(dt);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }
  countdown(sec, onEnd = () => this.finish()) {
    this.timeLeft = sec;
    this.timeTotal = sec;
    const show = () => {
      this.extraEl.textContent = '⏱ ' + Math.ceil(this.timeLeft);
      this.extraEl.classList.toggle('warn', this.timeLeft <= 5);
      this.setProgress(this.timeLeft / this.timeTotal);
    };
    show();
    this.every(100, () => {
      this.timeLeft = Math.max(0, this.timeLeft - 0.1);
      if (this.timeLeft <= 5 && Math.abs(this.timeLeft - Math.round(this.timeLeft)) < 0.05 && this.timeLeft > 0) Sfx.tick();
      show();
      if (this.timeLeft <= 0) onEnd();
    });
  }
  addTime(sec) { if (this.timeLeft != null) this.timeLeft = Math.min(this.timeTotal, this.timeLeft + sec); }
  onCleanup(fn) { this.cleanups.push(fn); }

  // ---- reading tasks aloud
  // Says a new task (see Voice.play for parts) and remembers it for the 🔊
  // button. Later tasks wait for whatever is still being said, e.g. the
  // Spanish answer to the previous one. opts.replay: what 🔊 says, if different.
  task(parts, opts = {}) {
    this.lastTask = opts.replay || parts;
    const queue = opts.queue ?? this.taskCount > 0;
    this.taskCount = (this.taskCount || 0) + 1;
    Voice.play(parts, { queue });
  }
  replay() {
    if (this.lastTask) Voice.play(this.lastTask, { force: true });
  }
  replayButton(cls = '') {
    const b = h('button', { class: 'replay-btn ' + cls, 'aria-label': 'Hear it again' }, '🔊');
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); this.replay(); });
    return b;
  }

  // ---- HUD
  setProgress(f) { this.barEl.firstChild.style.width = Math.max(0, Math.min(1, f)) * 100 + '%'; }
  setLives(n) {
    this.lives = n;
    this.extraEl.textContent = n > 0 ? '❤️'.repeat(n) : '💔';
  }
  setExtra(text) { this.extraEl.textContent = text; }
  updateScore() {
    this.scoreEl.textContent = this.score;
    this.scoreEl.classList.remove('bump');
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add('bump');
    const mult = this.mult();
    this.comboEl.textContent = mult > 1 ? '×' + mult : '';
    this.comboEl.classList.toggle('on', mult > 1);
  }
  mult() { return 1 + Math.min(4, Math.floor(this.combo / 3)); }

  // ---- results of a single answer
  hit(word, pts = 10, at = null) {
    this.right++;
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const gained = pts * this.mult();
    this.score += gained;
    if (word) { Store.bump(word.id, 1); this.learned.add(word.id); }
    Sfx.good(this.combo);
    Haptics.buzz(15);
    if (at) floatText(at[0], at[1], '+' + gained, 'good', this.stage);
    this.updateScore();
    return gained;
  }
  miss(word, at = null, penalty = 0) {
    this.wrong++;
    this.combo = 0;
    if (penalty) this.score = Math.max(0, this.score - penalty);
    if (word) { Store.bump(word.id, -1); this.missed.set(word.id, word); }
    Sfx.bad();
    Haptics.buzz([40, 30, 40]);
    if (at) floatText(at[0], at[1], penalty ? '−' + penalty : '✗', 'bad', this.stage);
    this.updateScore();
    this.root.classList.remove('shake');
    void this.root.offsetWidth;
    this.root.classList.add('shake');
  }
  loseLife() {
    if (this.lives == null) return false;
    this.setLives(this.lives - 1);
    if (this.lives <= 0) { this.after(400, () => this.finish()); return true; }
    return false;
  }

  // ---- lifecycle
  stop() {
    this.over = true;
    this.timers.forEach((id) => { clearTimeout(id); clearInterval(id); });
    this.timers.clear();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.cleanups.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } });
    Voice.stop();
  }
  quit() {
    if (this.over) return;
    this.stop();
    this.onExit(null);
  }
  finish(extra = {}) {
    if (this.over) return;
    this.stop();
    const total = this.right + this.wrong;
    const acc = total ? this.right / total : 0;
    let stars = 0;
    if (this.right > 0) stars = 1;
    if (this.right >= (this.game.goal || 8) && acc >= 0.7) stars = 2;
    if (this.right >= (this.game.goal || 8) * 1.5 && acc >= 0.9) stars = 3;
    if (extra.stars != null) stars = extra.stars;
    const xp = Math.round(this.score / 10) + this.right + stars * 5;
    const id = this.game.id;
    const d = Store.data;
    const prevBest = d.best[id] || 0;
    const newBest = this.score > prevBest;
    if (newBest) d.best[id] = this.score;
    d.stars[id] = Math.max(d.stars[id] || 0, stars);
    d.played++;
    Store.addXp(xp);
    this.onExit({
      game: this.game, score: this.score, stars, xp, acc, right: this.right, wrong: this.wrong,
      bestCombo: this.bestCombo, newBest, prevBest, missed: [...this.missed.values()], title: extra.title,
    });
  }
}

// Shuffled multiple-choice buttons. onPick(option, button, correct).
function choiceGrid(options, isRight, onPick, render = (o) => o) {
  const grid = h('div', { class: 'choices' });
  let locked = false;
  options.forEach((o) => {
    const b = h('button', { class: 'choice' }, render(o));
    b.addEventListener('click', () => {
      if (locked) return;
      locked = true;
      const ok = isRight(o);
      b.classList.add(ok ? 'right' : 'wrong');
      if (!ok) [...grid.children].forEach((c, i) => { if (isRight(options[i])) c.classList.add('right'); });
      onPick(o, b, ok);
    });
    grid.append(b);
  });
  return grid;
}
