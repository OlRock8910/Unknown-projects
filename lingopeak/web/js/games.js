// Mini games in the Practice tab. They use the words you've learned (or the
// first units' words to start with). Each game gets a GameSession and draws
// into S.stage; it reports answers with S.hit / S.miss and ends with S.finish.

// Words for the games, the ones you know least first.
function gamePool() {
  const learned = learnedWords();
  return learned.length >= 8 ? learned : [...learned, ...C.words.slice(0, 24).filter((w) => !learned.includes(w))];
}
function pickGameWords(n, filter = () => true) {
  const bag = gamePool().filter(filter);
  const out = [];
  while (out.length < n && bag.length) {
    const weights = bag.map((w) => 6 - (wordState(w.id) ? wordState(w.id).box : 0));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0), i = 0;
    while (r > weights[i]) { r -= weights[i]; i++; }
    out.push(bag.splice(Math.min(i, bag.length - 1), 1)[0]);
  }
  return out;
}
const clashW = (a, b) => a.id === b.id || normText(a.t) === normText(b.t) || normText(a.n) === normText(b.n);

// ------------------------------------------------------------------ the session
class GameSession {
  constructor(game, host, onExit) {
    Object.assign(this, { game, onExit, score: 0, combo: 0, right: 0, wrong: 0, timers: new Set(), cleanups: [], over: false, lives: null, raf: null });
    this.scoreEl = h('div', { class: 'g-score' }, '0');
    this.extraEl = h('div', { class: 'g-extra' });
    this.barEl = h('div', { class: 'progress thin' }, h('i'));
    this.stage = h('div', { class: 'g-stage' });
    this.root = h('div', { class: 'game' },
      h('div', { class: 'g-top' }, h('button', { class: 'icon-btn', onclick: () => this.quit() }, icon('x')), h('b', { class: 'g-name' }, t('game.' + game.id)), this.extraEl, this.scoreEl),
      this.barEl, this.stage);
    host.replaceChildren(this.root);
    Timer.start();
  }
  after(ms, fn) { const id = setTimeout(() => { this.timers.delete(id); if (!this.over) fn(); }, ms); this.timers.add(id); return id; }
  every(ms, fn) { const id = setInterval(() => { if (!this.over) fn(); }, ms); this.timers.add(id); return id; }
  loop(fn) {
    let last = performance.now();
    const step = (now) => { if (this.over) return; fn(Math.min(0.05, (now - last) / 1000)); last = now; this.raf = requestAnimationFrame(step); };
    this.raf = requestAnimationFrame(step);
  }
  countdown(sec) {
    this.timeLeft = sec;
    const show = () => { this.extraEl.textContent = Math.ceil(this.timeLeft) + 's'; this.extraEl.classList.toggle('warn', this.timeLeft <= 5); this.setProgress(this.timeLeft / sec); };
    show();
    this.every(100, () => { this.timeLeft = Math.max(0, this.timeLeft - 0.1); show(); if (this.timeLeft <= 0) this.finish(); });
  }
  setProgress(f) { this.barEl.firstChild.style.width = clamp(f, 0, 1) * 100 + '%'; }
  setLives(n) { this.lives = n; this.extraEl.replaceChildren(...Array.from({ length: Math.max(0, n) }, () => icon('heart', 'life'))); }
  loseLife() { if (this.lives == null) return false; this.setLives(this.lives - 1); if (this.lives <= 0) { this.after(400, () => this.finish()); return true; } return false; }
  onCleanup(fn) { this.cleanups.push(fn); }
  mult() { return 1 + Math.min(4, Math.floor(this.combo / 3)); }
  bump() { this.scoreEl.textContent = this.score; this.scoreEl.classList.remove('bump'); void this.scoreEl.offsetWidth; this.scoreEl.classList.add('bump'); }
  hit(w, pts = 10, at = null) {
    this.right++; this.combo++;
    const gained = pts * this.mult();
    this.score += gained;
    if (w) gradeWord(w, true);
    Sfx.good(this.combo);
    Haptics.buzz(15);
    if (at) floatText(at[0], at[1], '+' + gained, 'good', this.stage);
    this.bump();
  }
  miss(w, at = null, penalty = 0) {
    this.wrong++; this.combo = 0;
    if (penalty) this.score = Math.max(0, this.score - penalty);
    if (w) gradeWord(w, false);
    Sfx.bad();
    Haptics.buzz([40, 30, 40]);
    if (at) floatText(at[0], at[1], penalty ? '−' + penalty : '×', 'bad', this.stage);
    this.bump();
    this.root.classList.remove('shake'); void this.root.offsetWidth; this.root.classList.add('shake');
  }
  stop() {
    this.over = true;
    this.timers.forEach((id) => { clearTimeout(id); clearInterval(id); });
    if (this.raf) cancelAnimationFrame(this.raf);
    this.cleanups.forEach((f) => { try { f(); } catch (e) { /* ignore */ } });
    Voice.stop();
    Timer.stop();
  }
  quit() { if (this.over) return; this.stop(); this.onExit(null); }
  finish() {
    if (this.over) return;
    this.stop();
    const d = Store.data;
    d.best = d.best || {};
    const key = Store.pair + ':' + this.game.id;
    const newBest = this.score > (d.best[key] || 0);
    if (newBest) d.best[key] = this.score;
    const total = this.right + this.wrong;
    const acc = total ? this.right / total : 0;
    const xp = Store.addXp(Math.min(30, Math.round(this.score / 20) + this.right));
    const coins = Math.min(25, 2 + Math.round(this.score / 40));
    d.coins += coins;
    Store.save();
    this.onExit({ score: this.score, xp, coins, acc, newBest, right: this.right });
  }
}

// ------------------------------------------------------------------ shared pieces
// Things that float or fall: bubbles, raindrops, fruit.
function floatField(S, field, opts = {}) {
  const items = [];
  const place = (it) => { it.px = it.x + (it.wobble ? Math.sin(it.t * 1.7 + it.phase) * it.wobble : 0); it.el.style.transform = `translate(${it.px}px, ${it.y}px)${it.rot ? ` rotate(${it.rot}deg)` : ''}`; };
  const api = {
    items,
    W: () => field.clientWidth, H: () => field.clientHeight,
    add(el, props) {
      el.style.visibility = 'hidden';
      field.append(el);
      const it = { el, alive: true, x: 0, y: 0, vx: 0, vy: 0, ay: 0, t: 0, phase: rand(0, 6), wobble: 0, ...props };
      it.w = el.offsetWidth; it.h = el.offsetHeight;
      if (typeof props.x === 'function') it.x = props.x(it);
      if (typeof props.y === 'function') it.y = props.y(it);
      place(it);
      el.style.visibility = '';
      items.push(it);
      return it;
    },
    remove(it, cls) { if (!it.alive) return; it.alive = false; if (cls) { it.el.classList.add(cls); setTimeout(() => it.el.remove(), 420); } else it.el.remove(); },
    clearClashes(target) { items.forEach((it) => { if (it.alive && it.word && it.word.id !== target.id && clashW(it.word, target)) api.remove(it, 'fade'); }); },
    has: (fn) => items.some((it) => it.alive && fn(it)),
  };
  S.loop((dt) => {
    const H = field.clientHeight;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.alive) { items.splice(i, 1); continue; }
      it.t += dt; it.vy += it.ay * dt; it.x += it.vx * dt; it.y += it.vy * dt;
      if (it.spin) it.rot = (it.rot || 0) + it.spin * dt;
      place(it);
      if ((it.vy < 0 && it.y < -it.h - 40) || (it.vy > 0 && it.y > H + 10)) {
        it.alive = false; it.el.remove(); items.splice(i, 1);
        if (opts.onExit) opts.onExit(it);
      }
    }
  });
  return api;
}
const fitText = (el, text, base = 15) => { if (text.length > 8) el.style.fontSize = Math.max(10, base - (text.length - 8) * 0.9) + 'px'; return el; };
const promptPill = (label, value) => h('div', { class: 'g-prompt pop-in' }, h('small', {}, label), h('b', {}, value));

// Multiple-choice rounds with a per-question timer.
function roundsGame(S, cfg) {
  const rounds = cfg.rounds ?? 10;
  const qBar = h('div', { class: 'progress thin warnable' }, h('i'));
  const top = h('div', { class: 'r-top' });
  const choices = h('div', { class: 'opts two-col' });
  S.stage.append(h('div', { class: 'rounds' }, qBar, top, choices));
  if (cfg.lives) S.setLives(cfg.lives);
  let i = 0, q, qt = 0, qTotal = 0, answered = true;
  const next = () => {
    if (i >= rounds) return S.finish();
    if (rounds !== Infinity) { S.setProgress(i / rounds); if (!cfg.lives) S.extraEl.textContent = `${i + 1}/${rounds}`; }
    q = cfg.make(i);
    top.replaceChildren(q.top);
    choices.replaceChildren(...shuffle(q.options).map((o) => {
      const b = h('button', { class: 'opt' }, o.label);
      b.addEventListener('click', () => answer(o, b));
      o.btn = b;
      return b;
    }));
    if (q.say) Voice.say(q.say, { force: !!q.forceSay });
    qTotal = typeof cfg.time === 'function' ? cfg.time(i) : cfg.time ?? 12;
    qt = qTotal;
    answered = false;
  };
  const reveal = (picked) => {
    q.options.forEach((o) => { if (o.ok) o.btn.classList.add('right'); else if (o === picked) o.btn.classList.add('wrong'); });
    if (q.after) Voice.say(q.after);
  };
  const answer = (o, b) => {
    if (answered) return;
    answered = true;
    if (o.ok) S.hit(q.word, 10 + Math.ceil(qt), centerOf(b)); else S.miss(q.word, centerOf(b));
    reveal(o);
    if (!o.ok && S.loseLife()) return;
    S.after(o.ok ? 700 : 1500, () => { i++; next(); });
  };
  S.every(100, () => {
    if (answered) return;
    qt = Math.max(0, qt - 0.1);
    qBar.firstChild.style.width = (qt / qTotal) * 100 + '%';
    qBar.classList.toggle('warn', qt < 3);
    if (qt <= 0) {
      answered = true;
      S.miss(q.word);
      reveal(null);
      if (S.loseLife()) return;
      S.after(1500, () => { i++; next(); });
    }
  });
  next();
}
const optsFor = (w, label) => [{ label: label(w), ok: true }, ...distractorsFor(w, 3, gamePool()).map((d) => ({ label: label(d), ok: false }))];

// ------------------------------------------------------------------ the games
const GAMES = [];
const addGame = (g) => GAMES.push(g);

addGame({
  id: 'bubble', icon: 'sparkle', goal: 12,
  play(S) {
    S.countdown(60);
    const prompt = h('div', { class: 'g-prompt-holder' });
    const field = h('div', { class: 'g-field' });
    S.stage.append(prompt, field);
    const ff = floatField(S, field);
    let target;
    const newTarget = () => {
      target = pickGameWords(1)[0];
      prompt.replaceChildren(promptPill(t('game.popThe'), target.n));
      ff.clearClashes(target);
    };
    const spawn = (startY) => {
      if (ff.items.filter((i) => i.alive).length > 9) return;
      const word = !ff.has((i) => i.word.id === target.id) || Math.random() < 0.3 ? target : pickOne(distractorsFor(target, 6, gamePool()));
      const size = rand(86, 106);
      const el = fitText(h('button', { class: 'gbubble' }, word.t), word.t);
      el.style.width = el.style.height = size + 'px';
      el.style.setProperty('--c', pickOne(['var(--blue)', 'var(--yellow)', 'var(--coral)']));
      const it = ff.add(el, { word, x: (it2) => rand(0, ff.W() - it2.w), y: startY ?? ff.H() + 10, vy: -rand(55, 85), wobble: rand(8, 18) });
      el.addEventListener('pointerdown', () => tap(it));
    };
    const tap = (it) => {
      if (!it.alive) return;
      const at = centerOf(it.el);
      if (it.word.id === target.id) {
        Sfx.pop();
        burst(at[0], at[1], 'var(--blue)', 14, S.stage);
        ff.remove(it, 'popped');
        S.hit(target, 10, at);
        Voice.say(target.t);
        newTarget();
      } else {
        it.el.classList.remove('nope'); void it.el.offsetWidth; it.el.classList.add('nope');
        S.miss(target, at, 5);
      }
    };
    newTarget();
    for (let k = 0; k < 5; k++) spawn(ff.H() * (0.25 + k * 0.16));
    S.every(620, () => spawn());
  },
});

addGame({
  id: 'rain', icon: 'target', goal: 12,
  play(S) {
    S.setLives(3);
    const prompt = h('div', { class: 'g-prompt-holder' });
    const field = h('div', { class: 'g-field rain' });
    S.stage.append(prompt, field);
    let target, speed = 90, caught = 0;
    const ff = floatField(S, field, {
      onExit(it) {
        if (it.word.id === target.id && !S.over) { S.miss(target); if (!S.loseLife()) newTarget(); }
      },
    });
    const newTarget = () => {
      target = pickGameWords(1)[0];
      prompt.replaceChildren(promptPill(t('game.catch'), target.t));
      Voice.say(target.t);
      ff.clearClashes(target);
    };
    let lastLane = -1;
    const spawn = () => {
      if (ff.items.filter((i) => i.alive).length > 6) return;
      const word = !ff.has((i) => i.word.id === target.id) || Math.random() < 0.3 ? target : pickOne(distractorsFor(target, 6, gamePool()));
      const el = h('button', { class: 'drop' }, word.n);
      let lane;
      do { lane = randInt(0, 2); } while (lane === lastLane);
      lastLane = lane;
      const it = ff.add(el, { word, x: (i) => (ff.W() / 3) * lane + (ff.W() / 3 - i.w) / 2, y: (i) => -i.h, vy: speed * rand(0.85, 1.15) });
      el.addEventListener('pointerdown', () => {
        if (!it.alive) return;
        const at = centerOf(el);
        if (it.word.id === target.id) { Sfx.pop(); ff.remove(it, 'popped'); S.hit(target, 10, at); caught++; speed = Math.min(200, 90 + caught * 6); newTarget(); }
        else { ff.remove(it, 'fade'); S.miss(target, at); S.loseLife(); }
      });
    };
    newTarget();
    spawn();
    let acc = 0;
    S.every(100, () => { acc += 100; if (acc >= Math.max(650, 1500 - caught * 40)) { acc = 0; spawn(); } });
  },
});

addGame({
  id: 'whack', icon: 'star', goal: 12,
  play(S) {
    S.countdown(45);
    const prompt = h('div', { class: 'g-prompt-holder' });
    const grid = h('div', { class: 'holes' });
    S.stage.append(prompt, grid);
    const holes = [];
    for (let i = 0; i < 9; i++) {
      const label = h('div', { class: 'mole-label' });
      const mole = h('div', { class: 'mole' }, label, castArt(CAST[i % CAST.length].id, '', 'mole-art'));
      const hole = h('div', { class: 'hole' }, mole, h('div', { class: 'hole-front' }));
      const st = { mole, label, word: null, up: false };
      hole.addEventListener('pointerdown', () => whack(st));
      grid.append(hole);
      holes.push(st);
    }
    let target, hits = 0;
    const down = (st) => { st.up = false; st.mole.classList.remove('up'); st.word = null; };
    const newTarget = () => {
      target = pickGameWords(1)[0];
      prompt.replaceChildren(promptPill(t('game.whackThe'), target.n));
      holes.forEach((st) => { if (st.up && st.word && st.word.id !== target.id && clashW(st.word, target)) down(st); });
    };
    const popUp = () => {
      const free = holes.filter((st) => !st.up);
      if (!free.length) return;
      const st = pickOne(free);
      st.word = !holes.some((x) => x.up && x.word && x.word.id === target.id) || Math.random() < 0.35 ? target : pickOne(distractorsFor(target, 6, gamePool()));
      st.label.textContent = st.word.t;
      fitText(st.label, st.word.t, 14);
      st.up = true;
      st.mole.classList.add('up');
      const w = st.word;
      S.after(Math.max(1100, 2200 - hits * 60), () => { if (st.up && st.word === w) down(st); });
    };
    const whack = (st) => {
      if (!st.up || !st.word) return;
      const at = centerOf(st.mole);
      Sfx.whack();
      if (st.word.id === target.id) { S.hit(target, 10, at); hits++; Voice.say(target.t); st.word = null; S.after(200, () => down(st)); newTarget(); }
      else { S.miss(target, at, 5); down(st); }
    };
    newTarget();
    popUp();
    S.every(650, () => { if (Math.random() < 0.85) popUp(); });
  },
});

addGame({
  id: 'memory', icon: 'cards', goal: 6,
  play(S) {
    const words = [];
    for (const w of pickGameWords(14)) if (words.length < 6 && words.every((x) => !clashW(x, w))) words.push(w);
    const cards = shuffle(words.flatMap((w) => [{ w, side: 't', text: w.t }, { w, side: 'n', text: w.n }]));
    const grid = h('div', { class: 'memory' });
    S.stage.append(grid);
    let open = [], moves = 0, matched = 0, secs = 0, busy = false;
    S.every(1000, () => { secs++; S.extraEl.textContent = `${secs}s`; });
    cards.forEach((c) => {
      const el = h('button', { class: 'mcard' }, h('div', { class: 'mcard-in' }, h('div', { class: 'mcard-back' }, icon('mountain')), h('div', { class: 'mcard-front ' + c.side }, c.text)));
      c.el = el;
      el.addEventListener('click', () => {
        if (busy || c.done || open.includes(c)) return;
        Sfx.flip();
        el.classList.add('flipped');
        if (c.side === 't') Voice.say(c.w.t);
        open.push(c);
        if (open.length < 2) return;
        moves++;
        const [a, b] = open;
        if (a.w.id === b.w.id) {
          a.done = b.done = true; open = []; matched++;
          S.after(250, () => {
            a.el.classList.add('matched'); b.el.classList.add('matched');
            S.hit(a.w, 20, centerOf(b.el));
            S.setProgress(matched / words.length);
            if (matched === words.length) { S.score += Math.max(0, 150 - secs * 2 - Math.max(0, moves - words.length) * 5); S.bump(); S.after(800, () => S.finish()); }
          });
        } else {
          busy = true; S.wrong++; S.combo = 0;
          S.after(800, () => { a.el.classList.remove('flipped'); b.el.classList.remove('flipped'); open = []; busy = false; });
        }
      });
      grid.append(el);
    });
  },
});

addGame({
  id: 'truefalse', icon: 'check', goal: 15,
  play(S) {
    S.countdown(60);
    const card = h('div', { class: 'tf' });
    const no = h('button', { class: 'tf-btn no' }, icon('x'));
    const yes = h('button', { class: 'tf-btn yes' }, icon('check'));
    S.stage.append(h('div', { class: 'tf-host' }, card), h('div', { class: 'tf-btns' }, no, yes));
    let cur = null;
    const next = () => {
      const w = pickGameWords(1)[0];
      const truth = Math.random() < 0.5;
      const shown = truth ? w : distractorsFor(w, 1, gamePool())[0];
      cur = { w, truth, done: false };
      card.replaceChildren(h('div', { class: 'tf-t pop-in' }, w.t), h('div', { class: 'tf-eq' }, '='), h('div', { class: 'tf-n' }, shown.n));
      Voice.say(w.t);
    };
    const answer = (yesSaid) => {
      if (!cur || cur.done) return;
      cur.done = true;
      const ok = yesSaid === cur.truth;
      if (ok) S.hit(cur.w, 10, centerOf(card)); else { S.miss(cur.w, centerOf(card), 5); toast(`${cur.w.t} = ${cur.w.n}`, 1300); }
      card.classList.remove('ok', 'no'); void card.offsetWidth; card.classList.add(ok ? 'ok' : 'no');
      S.after(250, next);
    };
    yes.addEventListener('click', () => answer(true));
    no.addEventListener('click', () => answer(false));
    next();
  },
});

addGame({
  id: 'quiz', icon: 'hint', goal: 7,
  play(S) {
    const words = pickGameWords(10);
    roundsGame(S, {
      rounds: words.length, time: 12,
      make: (i) => {
        const w = words[i];
        return i % 2
          ? { word: w, top: h('div', { class: 'r-word' }, w.n), options: optsFor(w, (x) => x.t), after: w.t }
          : { word: w, top: h('div', { class: 'r-word' }, w.t), options: optsFor(w, (x) => x.n), say: w.t };
      },
    });
  },
});

addGame({
  id: 'survival', icon: 'heart', goal: 15,
  play(S) {
    let last = null;
    roundsGame(S, {
      rounds: Infinity, lives: 3, time: (i) => Math.max(4, 11 - i * 0.3),
      make: (i) => {
        S.setProgress(Math.min(1, i / 30));
        let w;
        do { w = pickGameWords(1)[0]; } while (last && w.id === last.id && gamePool().length > 1);
        last = w;
        return Math.random() < 0.5
          ? { word: w, top: h('div', { class: 'r-word' }, w.n), options: optsFor(w, (x) => x.t), after: w.t }
          : { word: w, top: h('div', { class: 'r-word' }, w.t), options: optsFor(w, (x) => x.n), say: w.t };
      },
    });
  },
});

addGame({
  id: 'listen', icon: 'headphones', goal: 7, needsVoice: true,
  play(S) {
    const words = pickGameWords(10);
    roundsGame(S, {
      rounds: words.length, time: 15,
      make: (i) => {
        const w = words[i];
        return { word: w, say: w.t, forceSay: true, top: h('button', { class: 'big-say', onclick: () => Voice.say(w.t, { force: true }) }, icon('speaker')), options: optsFor(w, (x) => x.n) };
      },
    });
  },
});

addGame({
  id: 'oddone', icon: 'users', goal: 7,
  play(S) {
    roundsGame(S, {
      rounds: 10, time: 12,
      make: () => {
        const base = pickGameWords(1)[0];
        const group = [base];
        for (const w of shuffle(base.unit.words)) if (group.length < 3 && group.every((g) => !clashW(g, w))) group.push(w);
        const odd = pickOne(C.words.filter((w) => w.unit.mountain !== base.unit.mountain && group.every((g) => !clashW(g, w))));
        return { word: odd, top: h('div', { class: 'r-label' }, t('game.oddQ')), options: [{ label: odd.t, ok: true }, ...group.map((g) => ({ label: g.t, ok: false }))], after: odd.t };
      },
    });
  },
});

addGame({
  id: 'scramble', icon: 'keyboard', goal: 5,
  play(S) {
    const words = pickGameWords(8, (w) => canSpell(w) && !/\s/.test(w.bare));
    let i = 0;
    const box = h('div', { class: 'g-build' });
    S.stage.append(box);
    const next = () => {
      if (i >= words.length) return S.finish();
      S.setProgress(i / words.length);
      S.extraEl.textContent = `${i + 1}/${words.length}`;
      const w = words[i];
      const letters = [...w.bare];
      let order;
      do { order = shuffle(letters.map((c, k) => k)); } while (letters.length > 1 && order.every((k, j) => letters[k] === letters[j]));
      const placed = [];
      const slots = h('div', { class: 'slots' });
      const tiles = h('div', { class: 'ltiles' });
      let solved = false, missed = false;
      const draw = () => slots.replaceChildren(...letters.map((_, k) => {
        const p = placed[k];
        const s = h('button', { class: 'slot' + (p ? ' filled' : '') }, p ? p.ch : '');
        if (p) s.addEventListener('click', () => { if (solved) return; p.btn.classList.remove('used'); placed[k] = null; draw(); });
        return s;
      }));
      order.forEach((k) => {
        const rec = { ch: letters[k] };
        const b = h('button', { class: 'ltile' }, letters[k]);
        rec.btn = b;
        b.addEventListener('click', () => {
          if (solved || b.classList.contains('used')) return;
          const at = letters.findIndex((_, j) => !placed[j]);
          if (at === -1) return;
          placed[at] = rec;
          b.classList.add('used');
          Sfx.tap();
          draw();
          if (letters.every((_, j) => placed[j])) {
            if (placed.map((p) => p.ch).join('') === w.bare) { solved = true; slots.classList.add('solved'); S.hit(w, missed ? 8 : 20, centerOf(slots)); Voice.say(w.t); S.after(900, () => { i++; next(); }); }
            else { if (!missed) { missed = true; S.miss(w); } else Sfx.bad(); slots.classList.remove('shake'); void slots.offsetWidth; slots.classList.add('shake'); }
          }
        });
        tiles.append(b);
      });
      box.replaceChildren(h('div', { class: 'card center' }, h('div', { class: 'prompt-word' }, w.n), w.art ? h('div', { class: 'chip' }, w.art + ' …') : null), slots, tiles,
        h('button', { class: 'btn ghost small', onclick: () => { if (solved) return; solved = true; if (!missed) S.miss(w); letters.forEach((ch, k) => { placed[k] = { ch }; }); draw(); S.after(1200, () => { i++; next(); }); } }, t('game.skip')));
      draw();
    };
    next();
  },
});

addGame({
  id: 'hangman', icon: 'heart', goal: 4,
  play(S) {
    const words = pickGameWords(5, (w) => canSpell(w) && w.bare.length >= 4);
    let i = 0;
    const box = h('div', { class: 'g-build' });
    S.stage.append(box);
    const ALPHA = { en: 'abcdefghijklmnopqrstuvwxyz', es: 'abcdefghijklmnñopqrstuvwxyz', fr: 'abcdefghijklmnopqrstuvwxyz', de: 'abcdefghijklmnopqrstuvwxyzäöüß', pt: 'abcdefghijklmnopqrstuvwxyzç' }[Store.data.target];
    const next = () => {
      if (i >= words.length) return S.finish();
      S.setProgress(i / words.length);
      S.extraEl.textContent = `${i + 1}/${words.length}`;
      const w = words[i];
      const answer = w.bare.toLowerCase();
      const plain = [...answer].map((ch) => (/[äöüß]/.test(ch) && Store.data.target === 'de') || ch === 'ñ' || ch === 'ç' ? ch : stripAccents(ch));
      const guessed = new Set([' ', "'", '-']);
      let lives = 6, done = false;
      const wordEl = h('div', { class: 'hm-word' });
      const livesEl = h('div', { class: 'hm-lives' });
      const keys = h('div', { class: 'keyboard' });
      const draw = () => {
        wordEl.replaceChildren(...[...answer].map((ch, k) => h('span', { class: 'hm-l' + (ch === ' ' ? ' sp' : '') }, guessed.has(plain[k]) || done ? ch : '')));
        livesEl.replaceChildren(...Array.from({ length: 6 }, (_, k) => icon('heart', k < lives ? 'life' : 'life gone')));
      };
      const end = (won) => { done = true; draw(); if (won) { S.hit(w, 10 + lives * 4, centerOf(wordEl)); Sfx.win(); } else { S.miss(w, centerOf(wordEl)); Sfx.lose(); } Voice.say(w.t); S.after(1500, () => { i++; next(); }); };
      [...ALPHA].forEach((L) => {
        const k = h('button', { class: 'key' }, L);
        k.addEventListener('click', () => {
          if (done || guessed.has(L)) return;
          guessed.add(L);
          if (plain.includes(L)) { k.classList.add('hit'); Sfx.tap(); } else { k.classList.add('miss'); lives--; Sfx.pop(); }
          draw();
          if (plain.every((ch) => guessed.has(ch))) end(true); else if (lives <= 0) end(false);
        });
        keys.append(k);
      });
      box.replaceChildren(h('div', { class: 'card center' }, livesEl, h('div', { class: 'muted' }, w.n)), wordEl, keys);
      draw();
    };
    next();
  },
});

addGame({
  id: 'duel', icon: 'swords', duel: true,
  play() { openDuel(); },
});

// Two players, one phone: the top half is turned round to face the other player.
function openDuel() {
  const host = App.openOverlay('duel');
  const TARGET = 7;
  const timers = new Set();
  const later = (ms, fn) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  App.overlayCleanup = () => { timers.forEach(clearTimeout); Timer.stop(); };
  Timer.start();
  const players = [0, 1].map((i) => {
    const score = h('div', { class: 'duel-score' }, '0');
    const prompt = h('div', { class: 'duel-prompt' });
    const opts = h('div', { class: 'duel-opts' });
    const half = h('div', { class: 'duel-half p' + i }, h('div', { class: 'duel-head' }, h('span', {}, t('game.player', { n: i + 1 })), score), prompt, opts);
    return { i, half, score, prompt, opts, points: 0, locked: false };
  });
  host.replaceChildren(h('div', { class: 'duel' }, players[1].half,
    h('div', { class: 'duel-mid' }, h('button', { class: 'icon-btn', onclick: () => App.closeOverlay() }, icon('x')), h('b', {}, 'VS'), h('span', {}, t('game.firstTo', { n: TARGET }))),
    players[0].half));
  let word = null, open = false, last = null;
  const round = () => {
    let w;
    do { w = pickGameWords(1)[0]; } while (last && w.id === last.id);
    last = word = w;
    const options = [w, ...distractorsFor(w, 3, gamePool())];
    open = true;
    players.forEach((p) => {
      p.locked = false;
      p.half.classList.remove('won', 'lost');
      p.prompt.textContent = w.n;
      p.opts.replaceChildren(...shuffle(options).map((o) => {
        const b = h('button', { class: 'opt' }, o.t);
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); tap(p, o, b); });
        return b;
      }));
    });
  };
  const tap = (p, o, b) => {
    if (!open || p.locked) return;
    if (o.id === word.id) {
      open = false;
      p.points++;
      p.score.textContent = p.points;
      b.classList.add('right');
      p.half.classList.add('won');
      players[1 - p.i].half.classList.add('lost');
      Sfx.good(p.points);
      Voice.say(word.t);
      if (p.points >= TARGET) return later(900, () => finish(p));
      later(1200, round);
    } else {
      p.locked = true;
      b.classList.add('wrong');
      Sfx.bad();
      if (players.every((x) => x.locked)) { open = false; Voice.say(word.t); later(1500, round); }
    }
  };
  const finish = (winner) => {
    Sfx.win();
    players.forEach((p) => {
      p.prompt.textContent = p === winner ? t('game.youWin') : t('game.soClose');
      p.opts.replaceChildren(h('button', { class: 'btn primary', onclick: () => openDuel() }, t('game.rematch')), h('button', { class: 'btn ghost', onclick: () => App.closeOverlay() }, t('game.done')));
    });
    confetti(host);
  };
  round();
}

const Games = {
  session: null,
  start(game) {
    if (game.duel) return game.play();
    const host = App.openOverlay('game');
    this.session = new GameSession(game, host, (r) => {
      this.session = null;
      if (!r) return App.closeOverlay();
      const res = App.openOverlay('results');
      res.replaceChildren(h('div', { class: 'results' },
        castArt(pickOne(CAST).id, r.right ? 'happy' : 'sad', 'res-cast'),
        h('h1', {}, r.newBest && r.score ? t('game.newBest') : t('game.over')),
        h('div', { class: 'muted' }, t('game.' + game.id)),
        h('div', { class: 'big-score' }, fmtNum(r.score)),
        h('div', { class: 'res-stats' }, stat('bolt', '+' + r.xp, t('res.xp')), stat('coin', '+' + r.coins, t('res.coins')), stat('target', Math.round(r.acc * 100) + '%', t('res.accuracy'))),
        h('div', { class: 'foot-btns' },
          h('button', { class: 'btn ghost', onclick: () => App.closeOverlay() }, t('game.done')),
          h('button', { class: 'btn primary', onclick: () => Games.start(game) }, t('game.again')))));
      if (r.newBest && r.score) { Sfx.win(); confetti(res); }
    });
    try { game.play(this.session); } catch (e) { console.error(e); this.session.quit(); }
  },
};

function renderGamesList() {
  const best = Store.data.best || {};
  return h('div', { class: 'games-wrap' },
    h('h2', { class: 'section' }, t('game.title')),
    h('div', { class: 'game-grid' }, ...GAMES.filter((g) => !g.needsVoice || speakable()).map((g) => {
      const b = h('button', { class: 'game-card' }, h('div', { class: 'gc-icon' }, icon(g.icon)), h('b', {}, t('game.' + g.id)), h('small', {}, t('game.' + g.id + 'Sub')),
        best[Store.pair + ':' + g.id] ? h('span', { class: 'gc-best' }, icon('trophy'), fmtNum(best[Store.pair + ':' + g.id])) : null);
      b.addEventListener('click', () => {
        if (learnedWords().length < 4) { toast(t('practice.learnFirst')); return; }
        Games.start(g);
      });
      return b;
    })));
}
