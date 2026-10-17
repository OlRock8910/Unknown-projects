// Every mini game. Each one gets a Session (see core.js) and draws into
// S.stage; it reports answers with S.hit / S.miss and ends with S.finish.

// ------------------------------------------------------------------ shared pieces

// Things that move around a play field: bubbles, balloons, falling words.
function floatField(S, field, opts = {}) {
  const items = [];
  const place = (it) => {
    const wx = it.wobble ? Math.sin(it.t * 1.7 + it.phase) * it.wobble : 0;
    it.px = it.x + wx;
    it.el.style.transform = `translate(${it.px}px, ${it.y}px)${it.rot ? ` rotate(${it.rot}deg)` : ''}`;
  };
  const api = {
    items,
    W: () => field.clientWidth,
    H: () => field.clientHeight,
    add(el, props) {
      el.style.visibility = 'hidden';
      field.append(el);
      const it = { el, alive: true, x: 0, y: 0, vx: 0, vy: 0, ay: 0, t: 0, phase: rand(0, 6), wobble: 0, ...props };
      it.w = el.offsetWidth;
      it.h = el.offsetHeight;
      if (typeof props.x === 'function') it.x = props.x(it);
      if (typeof props.y === 'function') it.y = props.y(it);
      place(it);
      el.style.visibility = '';
      items.push(it);
      return it;
    },
    remove(it, cls) {
      if (!it.alive) return;
      it.alive = false;
      if (cls) { it.el.classList.add(cls); setTimeout(() => it.el.remove(), 450); } else it.el.remove();
    },
    // Clears anything that would also be a correct answer for a new target.
    clearClashes(target) {
      items.forEach((it) => {
        if (it.alive && it.word && it.word.id !== target.id && clash(it.word, target)) api.remove(it, 'fade');
      });
    },
    has: (fn) => items.some((it) => it.alive && fn(it)),
  };
  S.loop((dt) => {
    const H = field.clientHeight;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.alive) { items.splice(i, 1); continue; }
      if (it.frozen) continue;
      it.t += dt;
      it.vy += it.ay * dt;
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      if (it.spin) it.rot = (it.rot || 0) + it.spin * dt;
      place(it);
      if ((it.vy < 0 && it.y < -it.h - 40) || (it.vy > 0 && it.y > H + 10)) {
        it.alive = false;
        it.el.remove();
        items.splice(i, 1);
        if (opts.onExit) opts.onExit(it);
      }
    }
    if (opts.tick) opts.tick(dt);
  });
  return api;
}

// Shrinks the label of a round game object so long words fit on one line.
function fitWord(el, text, base = 15) {
  if (text.length > 8) el.style.fontSize = Math.max(11, base - (text.length - 8) * 0.9) + 'px';
  return el;
}

function promptPill(label, value, extra) {
  return h('div', { class: 'prompt pop-in' }, h('small', {}, label), h('b', {}, value), extra || null);
}

function setPrompt(holder, node) {
  holder.replaceChildren(node);
}

// Multiple-choice rounds with a per-question timer. Used by Quiz, Survival,
// Opposites, Emoji, Listen, Describe and Ser/Estar.
function roundsGame(S, cfg) {
  const rounds = cfg.rounds ?? 10;
  const qBar = h('div', { class: 'q-timer' }, h('i'));
  const top = h('div', { class: 'q-top' });
  const choicesHost = h('div', { class: 'q-choices' });
  const fb = h('div', { class: 'feedback' });
  S.stage.append(h('div', { class: 'rounds' }, qBar, top, choicesHost, fb));
  if (cfg.lives) S.setLives(cfg.lives);

  let i = 0, q, qt = 0, qTotal = 0, answered = true, waitId = null;

  const next = () => {
    if (i >= rounds) return S.finish();
    if (rounds !== Infinity) {
      S.setProgress(i / rounds);
      if (!cfg.lives) S.setExtra(`${i + 1}/${rounds}`);
    }
    q = cfg.make(i);
    fb.className = 'feedback';
    fb.replaceChildren();
    top.replaceChildren(q.top);
    top.classList.remove('pop-in');
    void top.offsetWidth;
    top.classList.add('pop-in');
    const grid = choiceGrid(shuffle(q.options), (o) => o.ok, answer, (o) => o.label);
    if (q.cols === 1) grid.classList.add('one-col');
    choicesHost.replaceChildren(grid);
    if (q.say) Voice.say(q.say);
    qTotal = typeof cfg.time === 'function' ? cfg.time(i) : cfg.time ?? 12;
    qt = qTotal;
    answered = false;
  };

  const showFeedback = (ok, headline) => {
    fb.className = 'feedback show ' + (ok ? 'ok' : 'no');
    const right = q.options.find((o) => o.ok);
    fb.replaceChildren(
      h('div', { class: 'fb-head' }, headline || (ok ? pickOne(['¡Muy bien!', '¡Genial!', '¡Perfecto!', '¡Eso es!', '¡Bravo!']) : 'Not quite')),
      !ok ? h('div', { class: 'fb-answer' }, 'Answer: ', h('b', {}, right.label)) : null,
      q.reveal ? h('div', { class: 'fb-reveal', html: q.reveal }) : null,
      h('div', { class: 'fb-next' }, 'Tap to continue ›'),
    );
  };

  const advance = (ms) => {
    const go = () => { waitId = null; i++; next(); };
    waitId = S.after(ms, go);
    fb.onclick = () => {
      if (waitId == null) return;
      clearTimeout(waitId);
      S.timers.delete(waitId);
      go();
    };
  };

  function answer(opt, btn, ok) {
    if (answered) return;
    answered = true;
    if (ok) S.hit(q.word, (cfg.base || 10) + Math.ceil(qt), centerOf(btn));
    else S.miss(q.word, centerOf(btn));
    if (q.sayAfter) Voice.say(q.sayAfter);
    showFeedback(ok);
    if (!ok && S.lives != null && S.loseLife()) return;
    advance(ok ? 1100 : 2400);
  }

  S.every(100, () => {
    if (answered) return;
    qt = Math.max(0, qt - 0.1);
    qBar.firstChild.style.width = (qt / qTotal) * 100 + '%';
    qBar.classList.toggle('warn', qt < 3);
    if (qt <= 0) {
      answered = true;
      [...choicesHost.querySelectorAll('.choice')].forEach((b) => {
        if (b.textContent === q.options.find((o) => o.ok).label) b.classList.add('right');
      });
      S.miss(q.word);
      if (q.sayAfter) Voice.say(q.sayAfter);
      showFeedback(false, '⏰ Out of time');
      if (S.lives != null && S.loseLife()) return;
      advance(2400);
    }
  });

  next();
}

// Question generators shared by Quiz and Survival.
const QUESTION_TYPES = {
  es2en(w) {
    return {
      word: w, say: w.m,
      top: h('div', { class: 'q-card' }, h('div', { class: 'q-label' }, 'What does this mean?'), h('div', { class: 'q-big' }, w.m),
        !w.inv ? h('div', { class: 'q-sub' }, 'feminine: ' + w.f) : h('div', { class: 'q-sub' }, 'same for él and ella')),
      options: [{ label: w.short, ok: true }, ...distractors(w, 3).map((d) => ({ label: d.short, ok: false }))],
      reveal: w.tip ? '💡 ' + w.tip : `${w.e} ${makeSentence(w).es}`,
    };
  },
  en2es(w) {
    return {
      word: w, sayAfter: w.m,
      top: h('div', { class: 'q-card' }, h('div', { class: 'q-label' }, 'How do you say…'), h('div', { class: 'q-emoji' }, w.e), h('div', { class: 'q-big' }, w.short)),
      options: [{ label: w.m, ok: true }, ...distractors(w, 3).map((d) => ({ label: d.m, ok: false }))],
      reveal: w.tip ? '💡 ' + w.tip : null,
    };
  },
  sentence(w) {
    const s = makeSentence(w);
    const en = (d) => `${s.subj.en} is${s.int.en ? ' ' + s.int.en : ''} ${d.short}.`;
    return {
      word: w, say: s.es, cols: 1,
      top: h('div', { class: 'q-card' }, h('div', { class: 'q-label' }, 'Translate'), h('div', { class: 'q-sentence' }, s.es)),
      options: [{ label: s.en, ok: true }, ...distractors(w, 3).map((d) => ({ label: en(d), ok: false }))],
    };
  },
  gap(w) {
    const s = makeSentence(w);
    const before = `${s.subj.es} ${s.verb}${s.int.es ? ' ' + s.int.es : ''}`;
    const opts = [{ label: s.adj, ok: true }];
    if (!w.inv) opts.push({ label: form(w, s.subj.g === 'f' ? 'm' : 'f'), ok: false });
    distractors(w, 4 - opts.length).forEach((d) => opts.push({ label: form(d, s.subj.g), ok: false }));
    return {
      word: w, sayAfter: s.es,
      top: h('div', { class: 'q-card' }, h('div', { class: 'q-label' }, 'Fill the gap'), h('div', { class: 'q-sentence' }, before, ' ', h('span', { class: 'gap' }, '____'), '.'),
        h('div', { class: 'q-sub' }, s.en)),
      options: opts,
      reveal: !w.inv ? `It must match: <b>${s.subj.es}</b> → <b>${s.adj}</b>` : `<b>${w.m}</b> is the same for él and ella.`,
    };
  },
};

function randomQuestion(w) {
  const types = Object.keys(QUESTION_TYPES);
  return QUESTION_TYPES[pickOne(types)](w);
}

// ------------------------------------------------------------------ the games
const GAMES = [];
const GAME_GROUPS = [
  { id: 'arcade', name: 'Pop & Tap Arcade', emoji: '🕹️' },
  { id: 'brain', name: 'Brain Games', emoji: '🧠' },
  { id: 'build', name: 'Word Builders', emoji: '🧩' },
  { id: 'grammar', name: 'Grammar Gym', emoji: '🏋️' },
];
const addGame = (g) => GAMES.push(g);

// ---------------------------------------------------------------- Bubble Pop
addGame({
  id: 'bubble', name: 'Bubble Pop', emoji: '🫧', group: 'arcade', colors: ['#22d3ee', '#6366f1'], goal: 12,
  desc: 'Pop the bubble with the right Spanish word',
  play(S) {
    S.countdown(60);
    const prompt = h('div', { class: 'prompt-holder' });
    const field = h('div', { class: 'field' });
    S.stage.append(prompt, field);
    const ff = floatField(S, field);
    let target;

    const newTarget = () => {
      target = pickWords(1)[0];
      setPrompt(prompt, promptPill('Pop the Spanish for', target.short, h('span', { class: 'pe' }, target.e)));
      ff.clearClashes(target);
    };
    const spawn = (startY) => {
      if (ff.items.filter((i) => i.alive).length > 9) return;
      const needTarget = !ff.has((i) => i.word.id === target.id);
      const word = needTarget || Math.random() < 0.3 ? target : pickOne(distractors(target, 6));
      const size = rand(84, 104);
      const el = fitWord(h('button', { class: 'bubble' }, word.m), word.m);
      el.style.width = el.style.height = size + 'px';
      el.style.setProperty('--hue', randInt(170, 290));
      const it = ff.add(el, { word, x: (it2) => rand(0, ff.W() - it2.w), y: startY ?? ff.H() + 10, vy: -rand(55, 85), wobble: rand(8, 18) });
      el.addEventListener('pointerdown', () => tap(it));
    };
    const tap = (it) => {
      if (!it.alive) return;
      const at = centerOf(it.el);
      if (it.word.id === target.id) {
        Sfx.pop();
        burst(at[0], at[1], `hsl(${it.el.style.getPropertyValue('--hue')} 90% 70%)`, 14, S.stage);
        ff.remove(it, 'popped');
        S.hit(target, 10, at);
        Voice.say(target.m);
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

// ---------------------------------------------------------------- Gender Pop
addGame({
  id: 'balloon', name: 'Gender Pop', emoji: '🎈', group: 'arcade', colors: ['#f472b6', '#f97316'], goal: 10,
  desc: 'Pop the balloon with the right ending: -o or -a?',
  play(S) {
    S.countdown(60);
    const prompt = h('div', { class: 'prompt-holder' });
    const field = h('div', { class: 'field' });
    S.stage.append(prompt, field);
    const ff = floatField(S, field);
    let target, subj;

    const newTarget = () => {
      target = pickWords(1, (w) => !w.inv)[0];
      subj = pickOne(SUBJECTS);
      const icon = subj.g === 'f' ? '👩' : '👨';
      setPrompt(prompt, promptPill(`${icon} ${subj.es} ${verbFor(target)}…`, `${subj.en} is ${target.short}`));
      ff.clearClashes(target);
    };
    const spawn = (startY) => {
      if (ff.items.filter((i) => i.alive).length > 8) return;
      const hasRight = ff.has((i) => i.word.id === target.id && i.g === subj.g);
      let word, g;
      const r = Math.random();
      if (!hasRight || r < 0.28) { word = target; g = subj.g; }
      else if (r < 0.5) { word = target; g = subj.g === 'f' ? 'm' : 'f'; }
      else { word = pickOne(distractors(target, 6)); g = Math.random() < 0.5 ? 'm' : 'f'; }
      const el = fitWord(h('button', { class: 'balloon' }, h('span', {}, form(word, g))), form(word, g));
      el.style.setProperty('--hue', pickOne([0, 25, 45, 140, 195, 265, 320]));
      const it = ff.add(el, { word, g, x: (i) => rand(0, ff.W() - i.w), y: startY ?? ff.H() + 10, vy: -rand(50, 78), wobble: rand(6, 14) });
      el.addEventListener('pointerdown', () => tap(it));
    };
    const tap = (it) => {
      if (!it.alive) return;
      const at = centerOf(it.el);
      if (it.word.id === target.id && (it.g === subj.g || target.inv)) {
        Sfx.pop();
        burst(at[0], at[1], `hsl(${it.el.style.getPropertyValue('--hue')} 90% 65%)`, 16, S.stage);
        ff.remove(it, 'popped');
        S.hit(target, 10, at);
        Voice.say(`${subj.es} ${verbFor(target)} ${form(target, subj.g)}`);
        newTarget();
      } else {
        it.el.classList.remove('nope'); void it.el.offsetWidth; it.el.classList.add('nope');
        S.miss(target, null, 5);
        floatText(at[0], at[1], it.word.id === target.id ? 'Wrong ending!' : '✗', 'bad', S.stage);
      }
    };
    newTarget();
    for (let k = 0; k < 4; k++) spawn(ff.H() * (0.3 + k * 0.18));
    S.every(700, () => spawn());
  },
});

// ---------------------------------------------------------------- Word Rain
addGame({
  id: 'rain', name: 'Word Rain', emoji: '☔', group: 'arcade', colors: ['#38bdf8', '#1e3a8a'], goal: 12,
  desc: 'Catch the right meaning before it hits the ground',
  play(S) {
    S.setLives(3);
    const prompt = h('div', { class: 'prompt-holder' });
    const field = h('div', { class: 'field rain-field' });
    const ground = h('div', { class: 'ground' });
    S.stage.append(prompt, field);
    field.append(ground);
    let target, speed = 90, caught = 0;
    const ff = floatField(S, field, {
      onExit(it) {
        if (it.word.id === target.id && !S.over) {
          floatText(field.getBoundingClientRect().left + it.px + it.w / 2, field.getBoundingClientRect().bottom - 30, 'Missed!', 'bad', S.stage);
          S.miss(target);
          if (!S.loseLife()) newTarget();
        }
      },
    });
    const newTarget = () => {
      target = pickWords(1)[0];
      setPrompt(prompt, promptPill('Catch the meaning of', target.m));
      ff.clearClashes(target);
    };
    const lanes = 3;
    let lastLane = -1;
    const spawn = () => {
      if (ff.items.filter((i) => i.alive).length > 6) return;
      const needTarget = !ff.has((i) => i.word.id === target.id);
      const word = needTarget || Math.random() < 0.3 ? target : pickOne(distractors(target, 6));
      const el = h('button', { class: 'drop' }, word.short);
      let lane;
      do { lane = randInt(0, lanes - 1); } while (lane === lastLane);
      lastLane = lane;
      const it = ff.add(el, { word, x: (i) => (ff.W() / lanes) * lane + (ff.W() / lanes - i.w) / 2, y: (i) => -i.h, vy: speed * rand(0.85, 1.15) });
      el.addEventListener('pointerdown', () => tap(it));
    };
    const tap = (it) => {
      if (!it.alive) return;
      const at = centerOf(it.el);
      if (it.word.id === target.id) {
        Sfx.pop();
        burst(at[0], at[1], '#7dd3fc', 12, S.stage);
        ff.remove(it, 'popped');
        S.hit(target, 10, at);
        caught++;
        speed = Math.min(200, 90 + caught * 6);
        Voice.say(target.m);
        newTarget();
      } else {
        ff.remove(it, 'fade');
        S.miss(target, at);
        if (!S.loseLife()) {/* keep going */}
      }
    };
    newTarget();
    spawn();
    let acc = 0;
    S.every(100, () => {
      acc += 100;
      if (acc >= Math.max(650, 1500 - caught * 40)) { acc = 0; spawn(); }
    });
  },
});

// ---------------------------------------------------------------- Word Ninja
addGame({
  id: 'ninja', name: 'Word Ninja', emoji: '🥷', group: 'arcade', colors: ['#a3e635', '#15803d'], goal: 12,
  desc: 'Swipe to slice the right word — avoid the wrong ones',
  play(S) {
    S.countdown(60);
    S.lives = 3;
    const livesEl = h('div', { class: 'mini-lives' }, '❤️❤️❤️');
    const prompt = h('div', { class: 'prompt-holder' });
    const field = h('div', { class: 'field ninja-field' });
    S.stage.append(prompt, livesEl, field);
    const ff = floatField(S, field);
    let target;
    const newTarget = () => {
      target = pickWords(1)[0];
      setPrompt(prompt, promptPill('Slice the Spanish for', target.short, h('span', { class: 'pe' }, target.e)));
      ff.clearClashes(target);
    };
    const launch = () => {
      const n = randInt(1, 3);
      const hasT = ff.has((i) => i.word.id === target.id);
      for (let k = 0; k < n; k++) {
        const word = (!hasT && k === 0) || Math.random() < 0.3 ? target : pickOne(distractors(target, 6));
        const el = fitWord(h('div', { class: 'fruit' }, word.m), word.m);
        el.style.setProperty('--hue', randInt(0, 360));
        const H = ff.H(), W = ff.W();
        const startX = rand(W * 0.1, W * 0.75);
        ff.add(el, { word, x: startX, y: H + 5, vy: -rand(H * 1.05, H * 1.3), vx: rand(-40, 40) + (startX < W / 2 ? 30 : -30), ay: H * 0.95, spin: rand(-40, 40) });
      }
    };
    const slice = (it) => {
      if (!it.alive) return;
      const at = centerOf(it.el);
      if (it.word.id === target.id) {
        Sfx.swoosh();
        burst(at[0], at[1], `hsl(${it.el.style.getPropertyValue('--hue')} 90% 60%)`, 18, S.stage);
        ff.remove(it, 'sliced');
        S.hit(target, 10, at);
        Voice.say(target.m);
        newTarget();
      } else {
        ff.remove(it, 'fade');
        S.miss(target, at, 5);
        S.lives--;
        livesEl.textContent = S.lives > 0 ? '❤️'.repeat(S.lives) : '💔';
        if (S.lives <= 0) S.after(400, () => S.finish());
      }
    };
    let down = false;
    const trail = (x, y) => {
      const r = field.getBoundingClientRect();
      const d = h('div', { class: 'trail' });
      d.style.left = x - r.left + 'px';
      d.style.top = y - r.top + 'px';
      field.append(d);
      setTimeout(() => d.remove(), 260);
    };
    const check = (x, y) => {
      ff.items.forEach((it) => {
        if (!it.alive) return;
        const r = it.el.getBoundingClientRect();
        if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6) slice(it);
      });
    };
    field.addEventListener('pointerdown', (e) => { down = true; check(e.clientX, e.clientY); trail(e.clientX, e.clientY); });
    field.addEventListener('pointermove', (e) => { if (down) { check(e.clientX, e.clientY); trail(e.clientX, e.clientY); } });
    const up = () => { down = false; };
    window.addEventListener('pointerup', up);
    S.onCleanup(() => window.removeEventListener('pointerup', up));
    newTarget();
    launch();
    S.every(1400, launch);
  },
});

// ---------------------------------------------------------------- Whack-a-Word
addGame({
  id: 'whack', name: 'Whack-a-Word', emoji: '🔨', group: 'arcade', colors: ['#facc15', '#b45309'], goal: 12,
  desc: 'Bonk the mole holding the right word',
  play(S) {
    S.countdown(45);
    const prompt = h('div', { class: 'prompt-holder' });
    const grid = h('div', { class: 'holes' });
    S.stage.append(prompt, grid);
    const holes = [];
    for (let i = 0; i < 9; i++) {
      const label = h('div', { class: 'mole-label' });
      const mole = h('div', { class: 'mole' }, label, h('div', { class: 'mole-face' }, '🐹'));
      const hole = h('div', { class: 'hole' }, h('div', { class: 'hole-back' }), mole, h('div', { class: 'hole-front' }));
      const st = { hole, mole, label, word: null, up: false, timer: null };
      hole.addEventListener('pointerdown', () => whack(st));
      grid.append(hole);
      holes.push(st);
    }
    let target, hits = 0;
    const down = (st) => { st.up = false; st.mole.classList.remove('up'); st.word = null; };
    const newTarget = () => {
      target = pickWords(1)[0];
      setPrompt(prompt, promptPill('Whack the Spanish for', target.short, h('span', { class: 'pe' }, target.e)));
      holes.forEach((st) => { if (st.up && st.word && st.word.id !== target.id && clash(st.word, target)) down(st); });
    };
    const popUp = () => {
      const free = holes.filter((st) => !st.up);
      if (!free.length) return;
      const st = pickOne(free);
      const hasT = holes.some((x) => x.up && x.word && x.word.id === target.id);
      st.word = !hasT || Math.random() < 0.35 ? target : pickOne(distractors(target, 6));
      st.label.textContent = st.word.m;
      st.up = true;
      st.mole.classList.remove('bonked');
      st.mole.classList.add('up');
      const stay = Math.max(1100, 2200 - hits * 60);
      const w = st.word;
      S.after(stay, () => { if (st.up && st.word === w) down(st); });
    };
    const whack = (st) => {
      if (!st.up || !st.word) return;
      const at = centerOf(st.mole);
      Sfx.whack();
      if (st.word.id === target.id) {
        st.mole.classList.add('bonked');
        burst(at[0], at[1], '#fde047', 12, S.stage);
        S.hit(target, 10, at);
        hits++;
        Voice.say(target.m);
        const s = st;
        S.after(250, () => down(s));
        st.word = null;
        newTarget();
      } else {
        S.miss(target, at, 5);
        down(st);
      }
    };
    newTarget();
    popUp();
    S.every(650, () => { if (Math.random() < 0.85) popUp(); });
  },
});

// ---------------------------------------------------------------- Memory Match
addGame({
  id: 'memory', name: 'Memory Match', emoji: '🃏', group: 'brain', colors: ['#c084fc', '#7c3aed'], goal: 6,
  desc: 'Flip cards and pair each Spanish word with its meaning',
  play(S) {
    const words = [];
    for (const w of pickWords(14)) { if (words.length < 6 && words.every((x) => !clash(x, w))) words.push(w); }
    const cards = shuffle(words.flatMap((w) => [
      { w, side: 'es', text: w.m },
      { w, side: 'en', text: w.short, emoji: w.e },
    ]));
    const grid = h('div', { class: 'memory-grid' });
    S.stage.append(h('div', { class: 'hint-line' }, 'Match each Spanish word to its English meaning'), grid);
    let open = [], moves = 0, matched = 0, secs = 0, busy = false;
    S.every(1000, () => { secs++; S.setExtra(`⏱${secs} · 🔁${moves}`); });
    S.setExtra('⏱0 · 🔁0');
    cards.forEach((c) => {
      const el = h('button', { class: 'mcard' },
        h('div', { class: 'mcard-inner' },
          h('div', { class: 'mcard-back' }, '¿?'),
          h('div', { class: 'mcard-front ' + c.side }, c.emoji ? h('span', { class: 'me' }, c.emoji) : null, h('span', {}, c.text))));
      c.el = el;
      el.addEventListener('click', () => {
        if (busy || c.done || open.includes(c)) return;
        Sfx.flip();
        el.classList.add('flipped');
        if (c.side === 'es') Voice.say(c.w.m);
        open.push(c);
        if (open.length === 2) {
          moves++;
          const [a, b] = open;
          if (a.w.id === b.w.id) {
            a.done = b.done = true;
            open = [];
            matched++;
            S.after(250, () => {
              a.el.classList.add('matched'); b.el.classList.add('matched');
              S.hit(a.w, 20, centerOf(b.el));
              S.setProgress(matched / words.length);
              if (matched === words.length) {
                const bonus = Math.max(0, 150 - secs * 2 - Math.max(0, moves - words.length) * 5);
                S.score += bonus;
                S.updateScore();
                if (bonus) toast(`⚡ Speed bonus +${bonus}`);
                const extra = moves <= words.length + 3 ? 3 : moves <= words.length + 8 ? 2 : 1;
                S.after(900, () => S.finish({ stars: extra }));
              }
            });
          } else {
            busy = true;
            S.wrong++;
            S.combo = 0;
            S.updateScore();
            S.after(800, () => {
              a.el.classList.remove('flipped'); b.el.classList.remove('flipped');
              open = [];
              busy = false;
            });
          }
        }
      });
      grid.append(el);
    });
  },
});

// ---------------------------------------------------------------- True or False
addGame({
  id: 'tf', name: 'True or False', emoji: '⚡', group: 'brain', colors: ['#fb7185', '#be123c'], goal: 15,
  desc: '60 seconds. Does the word mean that? Swipe or tap!',
  play(S) {
    S.countdown(60);
    const cardHost = h('div', { class: 'tf-host' });
    const no = h('button', { class: 'tf-btn no' }, '✗');
    const yes = h('button', { class: 'tf-btn yes' }, '✓');
    S.stage.append(h('div', { class: 'hint-line' }, 'Swipe right for true, left for false'), cardHost, h('div', { class: 'tf-btns' }, no, yes));
    let cur = null;
    const next = () => {
      const w = pickWords(1)[0];
      const truth = Math.random() < 0.5;
      const shown = truth ? w : distractors(w, 1)[0];
      const card = h('div', { class: 'tf-card pop-in' }, h('div', { class: 'tf-es' }, w.m), h('div', { class: 'tf-eq' }, '='), h('div', { class: 'tf-en' }, shown.short));
      cur = { w, truth, card, done: false };
      cardHost.replaceChildren(card);
      swipeable(card, (dir) => answer(dir > 0));
    };
    const answer = (saidTrue) => {
      if (!cur || cur.done) return;
      cur.done = true;
      const ok = saidTrue === cur.truth;
      const at = centerOf(cur.card);
      cur.card.classList.add(saidTrue ? 'fly-right' : 'fly-left', ok ? 'ok' : 'no');
      if (ok) S.hit(cur.w, 10, at);
      else { S.miss(cur.w, at, 5); toast(`${cur.w.m} = ${cur.w.short}`, 1300); }
      S.after(220, next);
    };
    yes.addEventListener('click', () => answer(true));
    no.addEventListener('click', () => answer(false));
    next();
  },
});

// Drag a card sideways; calls done(+1|-1) past a threshold.
function swipeable(el, done) {
  let sx = null, dx = 0;
  el.addEventListener('pointerdown', (e) => { sx = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.style.transition = 'none'; });
  el.addEventListener('pointermove', (e) => {
    if (sx == null) return;
    dx = e.clientX - sx;
    el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    el.classList.toggle('lean-right', dx > 40);
    el.classList.toggle('lean-left', dx < -40);
  });
  const end = () => {
    if (sx == null) return;
    sx = null;
    el.style.transition = '';
    if (Math.abs(dx) > 70) { el.style.transform = ''; done(dx > 0 ? 1 : -1); }
    else { el.style.transform = ''; el.classList.remove('lean-right', 'lean-left'); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}

// ---------------------------------------------------------------- Quick Quiz
addGame({
  id: 'quiz', name: 'Quick Quiz', emoji: '❓', group: 'brain', colors: ['#60a5fa', '#2563eb'], goal: 7,
  desc: '10 mixed questions — words, sentences and gaps',
  play(S) {
    const words = pickWords(10);
    const types = Object.keys(QUESTION_TYPES);
    roundsGame(S, { rounds: words.length, time: 15, make: (i) => QUESTION_TYPES[types[i % types.length]](words[i]) });
  },
});

// ---------------------------------------------------------------- Survival
addGame({
  id: 'survival', name: 'Survival', emoji: '🔥', group: 'brain', colors: ['#f97316', '#dc2626'], goal: 15,
  desc: 'Endless questions, less time each round. 3 lives.',
  play(S) {
    let last = null;
    roundsGame(S, {
      rounds: Infinity, lives: 3, base: 10,
      time: (i) => Math.max(4, 12 - i * 0.35),
      make: (i) => {
        S.setProgress(Math.min(1, i / 30));
        let w;
        do { w = pickWords(1)[0]; } while (last && w.id === last.id);
        last = w;
        return randomQuestion(w);
      },
    });
  },
});

// ---------------------------------------------------------------- Match Up
addGame({
  id: 'match', name: 'Match Up', emoji: '🔗', group: 'brain', colors: ['#2dd4bf', '#0f766e'], goal: 12,
  desc: 'Connect Spanish and English as fast as you can',
  play(S) {
    const ROUNDS = 3;
    let round = 0, secs = 0;
    S.every(1000, () => { secs++; S.setExtra(`⏱ ${secs}s`); });
    S.setExtra('⏱ 0s');
    const wrap = h('div', { class: 'match-wrap' });
    S.stage.append(h('div', { class: 'hint-line' }, 'Tap a word, then its meaning'), wrap);
    const play = () => {
      S.setProgress(round / ROUNDS);
      const words = [];
      for (const w of pickWords(12)) { if (words.length < 5 && words.every((x) => !clash(x, w))) words.push(w); }
      const left = h('div', { class: 'match-col' });
      const right = h('div', { class: 'match-col' });
      wrap.replaceChildren(left, right);
      let sel = null, left2 = words.length;
      const mk = (w, side, text) => {
        const b = h('button', { class: 'match-item ' + side }, text);
        b.addEventListener('click', () => {
          if (b.classList.contains('done')) return;
          if (side === 'es') Voice.say(w.m);
          if (!sel || sel.side === side) {
            if (sel) sel.b.classList.remove('sel');
            sel = { w, side, b };
            b.classList.add('sel');
            Sfx.tap();
            return;
          }
          if (sel.w.id === w.id) {
            sel.b.classList.remove('sel');
            sel.b.classList.add('done');
            b.classList.add('done');
            S.hit(w, 10, centerOf(b));
            sel = null;
            if (--left2 === 0) { round++; if (round >= ROUNDS) finish(); else S.after(500, play); }
          } else {
            const other = sel.b;
            other.classList.add('bad'); b.classList.add('bad');
            S.miss(side === 'es' ? w : sel.w);
            S.after(400, () => { other.classList.remove('bad', 'sel'); b.classList.remove('bad'); });
            sel = null;
          }
        });
        return b;
      };
      shuffle(words).forEach((w) => left.append(mk(w, 'es', w.m)));
      shuffle(words).forEach((w) => right.append(mk(w, 'en', w.short)));
    };
    const finish = () => {
      const bonus = Math.max(0, 100 - secs) * 2;
      S.score += bonus;
      S.updateScore();
      if (bonus) toast(`⚡ Speed bonus +${bonus}`);
      S.after(800, () => S.finish());
    };
    play();
  },
});

// ---------------------------------------------------------------- Opposites
addGame({
  id: 'opposites', name: 'Opposites', emoji: '☯️', group: 'brain', colors: ['#94a3b8', '#334155'], goal: 7,
  desc: 'Tall ↔ short, brave ↔ cowardly… find the opposite',
  play(S) {
    const opp = (w) => WORD_BY_ID[w.o];
    const words = pickWords(10, (w) => w.o && WORD_BY_ID[w.o], WORDS.filter((w) => w.o));
    roundsGame(S, {
      rounds: words.length, time: 12,
      make: (i) => {
        const w = words[i], o = opp(w);
        const wrong = distractors(o, 3, (d) => d.id !== w.id && !clash(d, w));
        return {
          word: w, say: w.m,
          top: h('div', { class: 'q-card' }, h('div', { class: 'q-label' }, 'What is the opposite of…'), h('div', { class: 'q-emoji' }, w.e), h('div', { class: 'q-big' }, w.m), h('div', { class: 'q-sub' }, w.short)),
          options: [{ label: o.m, ok: true }, ...wrong.map((d) => ({ label: d.m, ok: false }))],
          sayAfter: `${w.m}, ${o.m}`,
          reveal: `${w.e} <b>${w.m}</b> (${w.short}) ↔ ${o.e} <b>${o.m}</b> (${o.short})`,
        };
      },
    });
  },
});

// ---------------------------------------------------------------- Emoji Guess
addGame({
  id: 'emoji', name: 'Emoji Guess', emoji: '😜', group: 'brain', colors: ['#fde047', '#f59e0b'], goal: 7,
  desc: 'Which adjective does the emoji show?',
  play(S) {
    const words = pickWords(10);
    roundsGame(S, {
      rounds: words.length, time: 10,
      make: (i) => {
        const w = words[i];
        return {
          word: w, sayAfter: w.m,
          top: h('div', { class: 'q-card' }, h('div', { class: 'q-label' }, 'Which word fits?'), h('div', { class: 'q-emoji huge' }, w.e)),
          options: [{ label: w.m, ok: true }, ...distractors(w, 3).map((d) => ({ label: d.m, ok: false }))],
          reveal: `${w.e} <b>${w.m}</b> = ${w.en}`,
        };
      },
    });
  },
});

// ---------------------------------------------------------------- Listen Up
addGame({
  id: 'listen', name: 'Listen Up', emoji: '🎧', group: 'brain', colors: ['#818cf8', '#4338ca'], goal: 7,
  desc: 'Hear a sentence in Spanish and pick what it means',
  play(S) {
    const words = pickWords(10);
    const canSpeak = Voice.available();
    roundsGame(S, {
      rounds: words.length, time: 18,
      make: (i) => {
        const w = words[i];
        const s = makeSentence(w);
        const play = () => Voice.say(s.es, true);
        S.after(250, play);
        return {
          word: w,
          top: h('div', { class: 'q-card' }, h('div', { class: 'q-label' }, 'Listen — what is the person like?'),
            h('button', { class: 'speak-big', onclick: play }, '🔊'),
            canSpeak ? h('div', { class: 'q-sub' }, 'Tap to hear it again') : h('div', { class: 'q-sentence' }, s.es)),
          options: [{ label: w.short, ok: true }, ...distractors(w, 3).map((d) => ({ label: d.short, ok: false }))],
          reveal: `🗣️ <b>${s.es}</b><br>${s.en}`,
        };
      },
    });
  },
});

// ---------------------------------------------------------------- Describe Them
addGame({
  id: 'describe', name: 'Describe Them', emoji: '🕵️', group: 'brain', colors: ['#34d399', '#047857'], goal: 7,
  desc: 'Read what someone does and pick the word for them',
  play(S) {
    const words = pickWords(10, (w) => w.clue, WORDS.filter((w) => w.clue && currentPool().includes(w)).length >= 10 ? currentPool() : WORDS);
    roundsGame(S, {
      rounds: words.length, time: 18,
      make: (i) => {
        const w = words[i];
        const g = Math.random() < 0.5 ? 'm' : 'f';
        const name = pickOne(NAMES[g]);
        const said = `${name} es ${form(w, g)}`;
        return {
          word: w, sayAfter: said,
          top: h('div', { class: 'q-card person' },
            h('div', { class: 'avatar' }, pickOne(AVATARS[g])),
            h('div', { class: 'p-name' }, name),
            h('div', { class: 'p-clue' }, '“' + w.clue + '”'),
            h('div', { class: 'q-label' }, `${name} es…`)),
          options: [{ label: form(w, g), ok: true }, ...distractors(w, 3, (d) => d.clue).map((d) => ({ label: form(d, g), ok: false }))],
          reveal: `${w.e} <b>${said}.</b> — ${name} is ${w.short}.`,
        };
      },
    });
  },
});

// ---------------------------------------------------------------- Word Scramble
addGame({
  id: 'scramble', name: 'Word Scramble', emoji: '🔤', group: 'build', colors: ['#f0abfc', '#a21caf'], goal: 5,
  desc: 'Unscramble the letters to spell the adjective',
  play(S) {
    const words = pickWords(8, (w) => w.m.length <= 11);
    let i = 0;
    const box = h('div', { class: 'builder' });
    S.stage.append(box);
    const next = () => {
      if (i >= words.length) return S.finish();
      S.setProgress(i / words.length);
      S.setExtra(`${i + 1}/${words.length}`);
      const w = words[i];
      const g = pickOne(['m', 'f']);
      const subj = pickOne(SUBJECTS.filter((s) => s.g === g));
      const answer = form(w, g);
      const letters = [...answer];
      let order;
      do { order = shuffle(letters.map((c, k) => k)); } while (letters.length > 1 && order.every((k, j) => letters[k] === letters[j]));
      const slots = h('div', { class: 'slots' });
      const tiles = h('div', { class: 'tiles' });
      const placed = [];
      let hints = 0, missedOnce = false, solved = false;
      const render = () => {
        slots.replaceChildren(...letters.map((_, k) => {
          const t = placed[k];
          const s = h('button', { class: 'slot' + (t ? ' filled' : '') + (t && t.hint ? ' hinted' : '') }, t ? t.ch : '');
          if (t && !t.hint) s.addEventListener('click', () => { if (solved) return; t.btn.classList.remove('used'); placed[k] = null; Sfx.tap(); render(); });
          return s;
        }));
      };
      const firstEmpty = () => { for (let k = 0; k < letters.length; k++) if (!placed[k]) return k; return -1; };
      const tryCheck = () => {
        if (firstEmpty() !== -1) return;
        const guess = placed.map((t) => t.ch).join('');
        if (guess === answer) {
          solved = true;
          slots.classList.add('solved');
          S.hit(w, Math.max(5, 20 - hints * 6), centerOf(slots));
          Voice.say(`${subj.es} ${verbFor(w)} ${answer}`);
          S.after(1100, () => { i++; next(); });
        } else {
          slots.classList.remove('shake-x'); void slots.offsetWidth; slots.classList.add('shake-x');
          if (!missedOnce) { missedOnce = true; S.miss(w); } else Sfx.bad();
        }
      };
      order.forEach((k) => {
        const ch = letters[k];
        const t = h('button', { class: 'tile' }, ch);
        const rec = { ch, btn: t };
        t.addEventListener('click', () => {
          if (solved || t.classList.contains('used')) return;
          const at = firstEmpty();
          if (at === -1) return;
          placed[at] = rec;
          t.classList.add('used');
          Sfx.tap();
          render();
          tryCheck();
        });
        tiles.append(t);
      });
      const hintBtn = h('button', { class: 'btn ghost small' }, '💡 Hint');
      hintBtn.addEventListener('click', () => {
        if (solved) return;
        // Clear wrong letters, then lock in the next correct one.
        for (let k = 0; k < letters.length; k++) {
          if (placed[k] && placed[k].ch !== letters[k]) { placed[k].btn.classList.remove('used'); placed[k] = null; }
        }
        const k = firstEmpty();
        if (k === -1) return;
        const free = [...tiles.children].find((b) => !b.classList.contains('used') && b.textContent === letters[k]);
        if (!free) return;
        free.classList.add('used');
        placed[k] = { ch: letters[k], btn: free, hint: true };
        hints++;
        Sfx.flip();
        render();
        tryCheck();
      });
      const skipBtn = h('button', { class: 'btn ghost small' }, 'Skip ›');
      skipBtn.addEventListener('click', () => {
        if (solved) return;
        solved = true;
        if (!missedOnce) S.miss(w);
        placed.length = 0;
        letters.forEach((ch, k) => { placed[k] = { ch, hint: true }; });
        render();
        S.after(1300, () => { i++; next(); });
      });
      box.replaceChildren(
        h('div', { class: 'q-card pop-in' }, h('div', { class: 'q-emoji' }, w.e), h('div', { class: 'q-big small' }, w.short),
          h('div', { class: 'q-sub' }, `${g === 'f' ? '👩' : '👨'} ${subj.es} ${verbFor(w)}…`)),
        slots, tiles, h('div', { class: 'row-btns' }, hintBtn, skipBtn));
      render();
    };
    next();
  },
});

// ---------------------------------------------------------------- Save the Balloons (hangman)
addGame({
  id: 'hangman', name: 'Save the Balloons', emoji: '🎈', group: 'build', colors: ['#fca5a5', '#ef4444'], goal: 4,
  desc: 'Guess the letters before all the balloons pop',
  play(S) {
    const words = pickWords(5, (w) => w.m.length >= 4);
    let i = 0;
    const box = h('div', { class: 'builder' });
    S.stage.append(box);
    const LETTERS = 'abcdefghijklmnñopqrstuvwxyz'.split('');
    const next = () => {
      if (i >= words.length) return S.finish();
      S.setProgress(i / words.length);
      S.setExtra(`${i + 1}/${words.length}`);
      const w = words[i];
      const answer = w.m;
      const plain = stripAccents(answer);
      const guessed = new Set();
      let lives = 6, done = false;
      const balloons = h('div', { class: 'hm-balloons' });
      const wordEl = h('div', { class: 'hm-word' });
      const keys = h('div', { class: 'keyboard' });
      const renderWord = () => {
        wordEl.replaceChildren(...[...answer].map((ch, k) => h('span', { class: 'hm-letter' + (guessed.has(plain[k]) ? ' shown' : '') }, guessed.has(plain[k]) || done ? ch : '')));
        balloons.replaceChildren(...Array.from({ length: 6 }, (_, k) => h('span', { class: 'hm-b' + (k >= lives ? ' gone' : ''), style: { '--hue': k * 55 } }, k >= lives ? '💥' : '🎈')));
      };
      const end = (won) => {
        done = true;
        renderWord();
        if (won) { S.hit(w, 10 + lives * 4, centerOf(wordEl)); Sfx.win(); }
        else { S.miss(w, centerOf(wordEl)); Sfx.lose(); }
        Voice.say(answer);
        S.after(1500, () => { i++; next(); });
      };
      LETTERS.forEach((L) => {
        const k = h('button', { class: 'key' }, L);
        k.addEventListener('click', () => {
          if (done || guessed.has(L)) return;
          guessed.add(L);
          if (plain.includes(L)) { k.classList.add('hit'); Sfx.tap(); }
          else { k.classList.add('miss'); lives--; Sfx.pop(); Haptics.buzz(30); }
          renderWord();
          if ([...plain].every((ch) => guessed.has(ch))) end(true);
          else if (lives <= 0) end(false);
        });
        keys.append(k);
      });
      box.replaceChildren(
        h('div', { class: 'q-card pop-in' }, balloons, h('div', { class: 'q-sub' }, `${w.e} ${w.en}`)),
        wordEl, keys);
      renderWord();
    };
    next();
  },
});

// ---------------------------------------------------------------- Sentence Builder
addGame({
  id: 'builder', name: 'Sentence Builder', emoji: '🧱', group: 'build', colors: ['#fdba74', '#ea580c'], goal: 4,
  desc: 'Put the blocks in order to describe someone',
  play(S) {
    const words = pickWords(6);
    let i = 0;
    const box = h('div', { class: 'builder' });
    S.stage.append(box);
    const next = () => {
      if (i >= words.length) return S.finish();
      S.setProgress(i / words.length);
      S.setExtra(`${i + 1}/${words.length}`);
      const w = words[i];
      const s = makeSentence(w);
      const tokens = s.es.replace(/\.$/, '').split(' ');
      const extras = [];
      if (!w.inv) extras.push(form(w, s.subj.g === 'f' ? 'm' : 'f'));
      if (w.v !== 'both') extras.push(s.verb === 'es' ? 'está' : 'es');
      const pool = shuffle([...tokens, ...extras].map((t, k) => ({ t, k })));
      const line = h('div', { class: 'sb-line' });
      const bank = h('div', { class: 'sb-bank' });
      const chosen = [];
      let done = false;
      const render = () => {
        line.replaceChildren(...chosen.map((c) => {
          const b = h('button', { class: 'sb-tile in' }, c.t);
          b.addEventListener('click', () => { if (done) return; chosen.splice(chosen.indexOf(c), 1); Sfx.tap(); render(); });
          return b;
        }));
        if (!chosen.length) line.append(h('span', { class: 'sb-placeholder' }, 'Tap the blocks below…'));
        bank.replaceChildren(...pool.map((c) => {
          const b = h('button', { class: 'sb-tile' + (chosen.includes(c) ? ' used' : '') }, c.t);
          b.addEventListener('click', () => { if (done || chosen.includes(c)) return; chosen.push(c); Sfx.tap(); render(); });
          return b;
        }));
        check.disabled = chosen.length === 0;
      };
      const check = h('button', { class: 'btn primary' }, 'Check');
      const fb = h('div', { class: 'feedback' });
      check.addEventListener('click', () => {
        if (done) return;
        done = true;
        const ok = chosen.map((c) => c.t).join(' ') === tokens.join(' ');
        if (ok) { line.classList.add('solved'); S.hit(w, 20, centerOf(line)); }
        else { line.classList.add('wrong'); S.miss(w, centerOf(line)); }
        Voice.say(s.es);
        fb.className = 'feedback show ' + (ok ? 'ok' : 'no');
        fb.replaceChildren(h('div', { class: 'fb-head' }, ok ? '¡Perfecto!' : 'Not quite'),
          h('div', { class: 'fb-answer' }, h('b', {}, s.es)),
          w.inv ? null : h('div', { class: 'fb-reveal' }, `${s.subj.es} → ${s.adj} (${s.subj.g === 'f' ? 'feminine' : 'masculine'})`));
        S.after(ok ? 1400 : 2600, () => { i++; next(); });
      });
      box.replaceChildren(
        h('div', { class: 'q-card pop-in' }, h('div', { class: 'q-label' }, 'Say it in Spanish'), h('div', { class: 'q-sentence' }, `${w.e} ${s.en}`)),
        line, bank, h('div', { class: 'row-btns' }, check), fb);
      render();
    };
    next();
  },
});

// ---------------------------------------------------------------- Él o Ella?
addGame({
  id: 'gender', name: '¿Él o Ella?', emoji: '👫', group: 'grammar', colors: ['#67e8f9', '#db2777'], goal: 15,
  desc: '45 seconds. Is the word for him, her, or both?',
  play(S) {
    S.countdown(45);
    const card = h('div', { class: 'gender-card' });
    const fb = h('div', { class: 'g-explain' });
    const btn = (label, v) => {
      const b = h('button', { class: 'g-btn g-' + v }, label);
      b.addEventListener('click', () => answer(v, b));
      return b;
    };
    S.stage.append(h('div', { class: 'hint-line' }, 'Who could this word describe?'), card, fb,
      h('div', { class: 'g-btns' }, btn('👨 Él', 'm'), btn('👫 Both', 'both'), btn('👩 Ella', 'f')));
    let cur, last;
    const next = () => {
      let w;
      do { w = pickWords(1)[0]; } while (last && w.id === last.id);
      last = w;
      const useInv = w.inv;
      const g = pickOne(['m', 'f']);
      cur = { w, shown: useInv ? w.m : form(w, g), ans: useInv ? 'both' : g, done: false };
      card.replaceChildren(h('div', { class: 'g-word pop-in' }, cur.shown), h('div', { class: 'q-sub' }, w.short));
    };
    const why = (c) => {
      const w = c.w;
      if (c.ans === 'both') return `${w.m} never changes`;
      return c.ans === 'm' ? `${w.m} → ella ${w.f}` : `${w.f} → él ${w.m}`;
    };
    const answer = (v, b) => {
      if (!cur || cur.done) return;
      cur.done = true;
      const at = centerOf(b);
      if (v === cur.ans) S.hit(cur.w, 10, at);
      else S.miss(cur.w, at, 5);
      fb.textContent = (v === cur.ans ? '✓ ' : '✗ ') + why(cur);
      fb.className = 'g-explain ' + (v === cur.ans ? 'ok' : 'no');
      S.after(v === cur.ans ? 250 : 900, next);
    };
    next();
  },
});

// ---------------------------------------------------------------- Ser o Estar?
addGame({
  id: 'serestar', name: '¿Ser o Estar?', emoji: '⚖️', group: 'grammar', colors: ['#a78bfa', '#0ea5e9'], goal: 8,
  desc: 'Es or está? Who you are vs how you feel',
  play(S) {
    const items = [];
    const normal = pickWords(9, (w) => w.v !== 'both');
    normal.forEach((w) => items.push({ w }));
    shuffle(DUAL_MEANINGS).slice(0, 3).forEach((d) => {
      const useEstar = Math.random() < 0.5;
      items.push({ w: WORD_BY_ID[d.id], dual: d, verb: useEstar ? 'estar' : 'ser' });
    });
    const list = shuffle(items);
    roundsGame(S, {
      rounds: list.length, time: 12,
      make: (i) => {
        const it = list[i];
        const w = it.w;
        const subj = pickOne(SUBJECTS);
        const verb = it.dual ? (it.verb === 'estar' ? 'está' : 'es') : verbFor(w);
        const adj = form(w, subj.g);
        const meaning = it.dual ? it.dual[it.verb] : w.short;
        const why = it.dual
          ? `<b>${w.m}</b> + ${it.verb} = <b>${meaning}</b>. ${it.verb === 'ser' ? 'Es' : 'Está'} changes the meaning!`
          : w.v === 'estar' ? '🌡️ A feeling or state that can change → <b>estar (está)</b>' : '🪪 Personality or looks → <b>ser (es)</b>';
        return {
          word: w, sayAfter: `${subj.es} ${verb} ${adj}`,
          top: h('div', { class: 'q-card' }, h('div', { class: 'q-label' }, 'Es or está?'),
            h('div', { class: 'q-sentence' }, `${subj.es} `, h('span', { class: 'gap' }, '____'), ` ${adj}.`),
            h('div', { class: 'q-sub' }, `${subj.en} is ${meaning}.`)),
          options: [{ label: 'es', ok: verb === 'es' }, { label: 'está', ok: verb === 'está' }],
          reveal: why,
        };
      },
    });
  },
});
