// Lessons on the course path: a run of short exercises built from the
// lesson's words, with Check / Continue at the bottom. Anything you get wrong
// comes back again at the end.

// ---------------------------------------------------------------- choosing wrong answers
// Wrong answers for w, from the lesson first, then its unit, then anywhere.
function lessonDistractors(w, n, L) {
  const out = [];
  const ok = (d) => !clash(d, w) && !!d.adj === !!w.adj && out.every((o) => !clash(o, d));
  for (const d of [...shuffle(L.words), ...shuffle(unitOf(w).items)]) {
    if (out.length >= n) break;
    if (ok(d)) out.push(d);
  }
  if (out.length < n) for (const d of distractors(w, n * 2)) { if (out.length < n && ok(d)) out.push(d); }
  return out;
}

const speakable = () => Store.s.voice && Voice.available() && Voice.state() !== 'missing' && Voice.state() !== 'error';
const sayBtn = (text, cls = '') => h('button', { class: 'ls-say ' + cls, onclick: (e) => { e.stopPropagation(); Voice.say(text, true); } }, '🔊');

// Tappable option buttons where one can be chosen before pressing Check.
function pickList(options, render, onChoose, cls = 'ls-opts') {
  const wrap = h('div', { class: cls });
  const btns = options.map((o) => {
    const b = h('button', { class: 'ls-opt' }, render(o));
    b.opt = o;
    b.addEventListener('click', () => {
      if (wrap.classList.contains('locked')) return;
      btns.forEach((x) => x.classList.toggle('sel', x === b));
      Sfx.tap();
      onChoose(o);
    });
    return b;
  });
  wrap.append(...btns);
  return { wrap, btns };
}

// Word tiles for building a sentence; `answer` is the sentence to build.
function tileBuilder(answer, extras, ctl) {
  const tokens = answer.replace(/[.,!?¿¡]/g, '').split(/\s+/).filter(Boolean);
  const pool = shuffle([...tokens, ...extras].map((t, k) => ({ t, k })));
  const line = h('div', { class: 'ls-line' });
  const bank = h('div', { class: 'ls-bank' });
  const chosen = [];
  const draw = () => {
    line.replaceChildren(...chosen.map((c) => {
      const b = h('button', { class: 'ls-tile in' }, c.t);
      b.addEventListener('click', () => { if (ctl.locked()) return; chosen.splice(chosen.indexOf(c), 1); Sfx.tap(); draw(); });
      return b;
    }));
    bank.replaceChildren(...pool.map((c) => {
      const b = h('button', { class: 'ls-tile' + (chosen.includes(c) ? ' used' : '') }, c.t);
      b.addEventListener('click', () => {
        if (ctl.locked() || chosen.includes(c)) return;
        chosen.push(c);
        Sfx.tap();
        if (/[a-záéíóúñ]/i.test(c.t) && ctl.spanish) Voice.say(c.t);
        draw();
      });
      return b;
    }));
    ctl.ready(chosen.length > 0);
  };
  draw();
  return { node: h('div', { class: 'ls-build' }, line, bank), value: () => chosen.map((c) => c.t).join(' ') };
}

// Spare tiles for a sentence: words from other sentences that aren't in it.
function spareWords(sentence, others, n) {
  const have = new Set(normText(sentence).split(' '));
  const cands = [...new Set(others.flatMap((s) => normText(s).split(' ')))].filter((t) => t && !have.has(t));
  return shuffle(cands).slice(0, n);
}

// ---------------------------------------------------------------- the exercises
// Each one returns { title, node, check?, free?, auto?, onShow? }:
//   check() → { ok, answer, say }   when Check is pressed
//   free: no right or wrong (new-word cards), just Continue
//   auto: finishes itself through ctl.done(result)
const EXERCISES = {
  intro(w) {
    const ex = exampleFor(w);
    const tag = w.adj ? (w.inv ? 'same for él and ella' : `él ${w.m} · ella ${w.f}`)
      : w.art ? `${w.art} → ${/^l(a|as)$/.test(w.art) || w.id === 'el agua' ? 'feminine' : 'masculine'}${w.plural ? ', plural' : ''}` : null;
    return {
      title: 'New word', free: true, word: w,
      node: h('div', { class: 'ls-intro' },
        h('div', { class: 'li-emoji' }, w.e),
        h('div', { class: 'li-es' }, w.adj && !w.inv ? `${w.m} / ${w.f}` : w.m, sayBtn(w.adj && !w.inv ? `${w.m}, ${w.f}` : w.m)),
        h('div', { class: 'li-en' }, w.en),
        tag ? h('div', { class: 'li-tag' }, tag) : null,
        ex ? h('button', { class: 'li-ex', onclick: () => Voice.say(ex.es, true) }, h('b', {}, '🔊 ' + ex.es), h('span', {}, ex.en)) : null,
        w.tip ? h('div', { class: 'li-tip' }, '💡 ' + w.tip) : null),
      onShow: () => Voice.say(w.m),
    };
  },

  picture(w, L) {
    let pick = null;
    const opts = shuffle([w, ...lessonDistractors(w, 3, L)]);
    return (ctl) => {
      const { wrap } = pickList(opts, (o) => [h('span', { class: 'lp-e' }, o.e), h('span', { class: 'lp-es' }, o.m)], (o) => { pick = o; Voice.say(o.m); ctl.ready(true); }, 'ls-pics');
      return {
        title: `Which one is “${w.short}”?`, word: w, node: wrap, lock: wrap,
        check: () => ({ ok: pick === w, right: w, answer: w.m, say: w.m }),
      };
    };
  },

  meaning(w, L) {
    let pick = null;
    const opts = shuffle([w, ...lessonDistractors(w, 3, L)]);
    return (ctl) => {
      const { wrap } = pickList(opts, (o) => o.short, (o) => { pick = o; ctl.ready(true); });
      return {
        title: 'What does this mean?', word: w,
        node: h('div', {}, h('div', { class: 'ls-speech' }, h('span', { class: 'ls-bubble' }, sayBtn(w.m, 'small'), w.m)), wrap), lock: wrap,
        onShow: () => Voice.say(w.m),
        check: () => ({ ok: pick === w, right: w, answer: w.short, say: w.m }),
      };
    };
  },

  listen(w, L) {
    let pick = null;
    const opts = shuffle([w, ...lessonDistractors(w, 3, L)]);
    return (ctl) => {
      const { wrap } = pickList(opts, (o) => o.m, (o) => { pick = o; ctl.ready(true); });
      const slow = h('button', { class: 'ls-slow', onclick: () => { const r = Store.s.rate; Store.s.rate = Math.max(0.4, r * 0.65); Voice.say(w.m, true); Store.s.rate = r; } }, '🐢');
      return {
        title: 'Tap what you hear', word: w,
        node: h('div', {}, h('div', { class: 'ls-listen' }, h('button', { class: 'ls-big-say', onclick: () => Voice.say(w.m, true) }, '🔊'), slow), wrap), lock: wrap,
        onShow: () => Voice.say(w.m, true),
        check: () => ({ ok: pick === w, right: w, answer: `${w.m} = ${w.short}`, say: w.m }),
      };
    };
  },

  article(w) {
    let pick = null;
    const pair = w.plural ? ['los', 'las'] : ['el', 'la'];
    return (ctl) => {
      const { wrap } = pickList(pair, (a) => a, (a) => { pick = a; ctl.ready(true); }, 'ls-opts two');
      return {
        title: 'Which word for “the”?', word: w,
        node: h('div', {}, h('div', { class: 'ls-card' }, h('div', { class: 'li-emoji' }, w.e), h('div', { class: 'li-es' }, '___ ' + w.bare), h('div', { class: 'li-en' }, 'the ' + w.short)), wrap), lock: wrap,
        check: () => ({ ok: pick === w.art, right: w.art, answer: w.m, say: w.m, note: w.id === 'el agua' ? 'Agua is feminine, but it takes el.' : null }),
      };
    };
  },

  // Adjectives: pick the ending that matches the person.
  agree(w, L) {
    let pick = null;
    const s = makeSentence(w, { plain: true });
    const before = `${s.subj.es} ${s.verb}`;
    const opts = [s.adj, ...(w.inv ? [] : [form(w, s.subj.g === 'f' ? 'm' : 'f')])];
    lessonDistractors(w, 4 - opts.length, L).forEach((d) => opts.push(form(d, s.subj.g)));
    return (ctl) => {
      const { wrap } = pickList(shuffle(opts), (o) => o, (o) => { pick = o; ctl.ready(true); });
      return {
        title: 'Fill the gap', word: w,
        node: h('div', {}, h('div', { class: 'ls-card' }, h('div', { class: 'ls-sentence' }, before, ' ', h('span', { class: 'gap' }, '____'), '.'), h('div', { class: 'li-en' }, s.en)), wrap), lock: wrap,
        check: () => ({ ok: pick === s.adj, right: s.adj, answer: s.es, say: s.es, note: w.inv ? `${w.m} is the same for él and ella.` : `${s.subj.es} → ${s.adj}` }),
      };
    };
  },

  // Build a sentence from word tiles: into Spanish (to: 'es') or English.
  build(p, unit, to) {
    return (ctl) => {
      const target = to === 'es' ? p.es : p.en;
      const others = (unit.phrases || []).map(([es, en]) => (to === 'es' ? es : en)).filter((x) => x !== target);
      const extras = (to === 'es' ? p.spareEs : p.spareEn) || spareWords(target, others, 3);
      ctl.spanish = to === 'es';
      const b = tileBuilder(target, extras, ctl);
      return {
        title: to === 'es' ? 'Write this in Spanish' : 'Write this in English', word: p.word,
        node: h('div', {},
          h('div', { class: 'ls-speech' }, h('span', { class: 'ls-bubble' }, to === 'en' ? sayBtn(p.es, 'small') : null, to === 'es' ? p.en : p.es)),
          b.node),
        onShow: () => { if (to === 'en') Voice.say(p.es); },
        check: () => ({ ok: normText(b.value()) === normText(target), answer: target, say: p.es }),
      };
    };
  },

  // Spell the word with letter tiles.
  spell(w) {
    const answer = w.adj ? w.m : w.bare;
    return (ctl) => {
      const letters = [...answer];
      let order;
      do { order = shuffle(letters.map((c, k) => k)); } while (letters.length > 1 && order.every((k, j) => letters[k] === letters[j]));
      const placed = [];
      const slots = h('div', { class: 'slots' });
      const tiles = h('div', { class: 'tiles' });
      const draw = () => {
        slots.replaceChildren(...letters.map((_, k) => {
          const t = placed[k];
          const s = h('button', { class: 'slot' + (t ? ' filled' : '') }, t ? t.ch : '');
          if (t) s.addEventListener('click', () => { if (ctl.locked()) return; t.btn.classList.remove('used'); placed[k] = null; Sfx.tap(); draw(); });
          return s;
        }));
        ctl.ready(letters.every((_, k) => placed[k]));
      };
      order.forEach((k) => {
        const rec = { ch: letters[k] };
        const t = h('button', { class: 'tile' }, letters[k]);
        rec.btn = t;
        t.addEventListener('click', () => {
          if (ctl.locked() || t.classList.contains('used')) return;
          const at = letters.findIndex((_, j) => !placed[j]);
          if (at === -1) return;
          placed[at] = rec;
          t.classList.add('used');
          Sfx.tap();
          draw();
        });
        tiles.append(t);
      });
      draw();
      return {
        title: 'Spell it in Spanish', word: w,
        node: h('div', {}, h('div', { class: 'ls-card' }, h('div', { class: 'li-emoji' }, w.e), h('div', { class: 'li-en big' }, w.short), w.art ? h('div', { class: 'li-tag' }, w.art + ' …') : null), slots, tiles),
        check: () => ({ ok: placed.map((t) => t.ch).join('') === answer, answer: w.m, say: w.m }),
      };
    };
  },

  // Type the word, with buttons for the accented letters. A missing accent
  // still counts, with a reminder.
  type(w) {
    return (ctl) => {
      const input = h('input', { class: 'search ls-input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Type in Spanish' });
      input.addEventListener('input', () => ctl.ready(input.value.trim().length > 0));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ctl.submit(); });
      const accents = h('div', { class: 'ls-accents' }, ...'áéíóúñü'.split('').map((ch) => h('button', {
        class: 'ls-acc',
        onpointerdown: (e) => e.preventDefault(),
        onclick: () => {
          if (ctl.locked()) return;
          const a = input.selectionStart ?? input.value.length, b = input.selectionEnd ?? a;
          input.value = input.value.slice(0, a) + ch + input.value.slice(b);
          input.focus();
          input.setSelectionRange(a + 1, a + 1);
          ctl.ready(true);
        },
      }, ch)));
      const target = w.m;
      return {
        title: 'Type it in Spanish', word: w,
        node: h('div', {}, h('div', { class: 'ls-card' }, h('div', { class: 'li-emoji' }, w.e), h('div', { class: 'li-en big' }, w.short), w.art ? h('div', { class: 'li-tag' }, `with ${w.art}`) : null), input, accents),
        onShow: () => setTimeout(() => input.focus(), 250),
        check: () => {
          input.blur();
          const typed = normText(input.value);
          const goods = [target, w.bare, ...(w.adj && !w.inv ? [w.f] : [])].map(normText);
          if (goods.includes(typed)) return { ok: true, answer: w.m, say: w.m };
          const close = goods.some((g) => stripAccents(g) === stripAccents(typed));
          return { ok: close, answer: w.m, say: w.m, note: close ? `Watch the accent: ${w.m}` : null };
        },
      };
    };
  },

  // Tap Spanish–English pairs; finishes when all are matched.
  match(words) {
    return (ctl) => {
      const left = h('div', { class: 'match-col' });
      const right = h('div', { class: 'match-col' });
      let sel = null, left2 = words.length, slips = 0;
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
            Sfx.good(words.length - left2);
            Store.bump(w.id, 1);
            sel = null;
            if (--left2 === 0) setTimeout(() => ctl.done({ ok: true, slips }), 300);
          } else {
            const other = sel.b;
            other.classList.add('bad'); b.classList.add('bad');
            Sfx.bad();
            Haptics.buzz([40, 30, 40]);
            slips++;
            setTimeout(() => { other.classList.remove('bad', 'sel'); b.classList.remove('bad'); }, 400);
            sel = null;
          }
        });
        return b;
      };
      shuffle(words).forEach((w) => left.append(mk(w, 'es', w.m)));
      shuffle(words).forEach((w) => right.append(mk(w, 'en', w.short)));
      return { title: 'Tap the matching pairs', auto: true, node: h('div', { class: 'match-wrap ls-match' }, left, right) };
    };
  },
};

// ---------------------------------------------------------------- building a lesson
// One graded exercise for w, of a kind that suits it.
function exerciseFor(w, L, kinds) {
  const ok = kinds.filter((k) => (k !== 'listen' || speakable()) && (k !== 'article' || w.art) && (k !== 'agree' || w.adj) && (k !== 'spell' || (w.adj ? w.m.length <= 11 : spellable(w))) && (k !== 'type' || (w.adj || spellable(w) || w.bare.length <= 14)));
  const kind = pickOne(ok.length ? ok : ['meaning']);
  return { kind, word: w, gen: () => EXERCISES[kind](w, L) };
}

function buildLesson(lesson, opts = {}) {
  const L = { words: lesson.words, unit: lesson.unit };
  const q = [];
  const add = (kind, w) => q.push({ kind, word: w, gen: () => EXERCISES[kind](w, L) });
  if (opts.words) {
    // A jump test: a bit of everything from the units being skipped.
    const ws = shuffle(opts.words).slice(0, 14);
    ws.forEach((w, i) => q.push(exerciseFor(w, { words: ws, unit: unitOf(w) }, i % 3 === 0 ? ['type', 'spell', 'listen'] : ['meaning', 'picture', 'listen', 'article', 'agree'])));
    return q;
  }
  if (lesson.kind === 'learn') {
    const ws = lesson.words;
    const firstTime = !lessonDone(lesson.id);
    ws.forEach((w, i) => {
      if (firstTime) q.push({ kind: 'intro', word: w, gen: () => EXERCISES.intro(w) });
      add(i % 2 ? 'meaning' : 'picture', w);
      if (i > 0) q.push(exerciseFor(ws[i - 1], L, ['listen', 'meaning', 'article', 'agree']));
    });
    const tail = [];
    const five = ws.length > 5 ? shuffle(ws).slice(0, 5) : ws;
    tail.push({ kind: 'match', gen: () => EXERCISES.match(five) });
    shuffle(ws).slice(0, 2).forEach((w) => tail.push(exerciseFor(w, L, ['spell', 'listen', 'type'])));
    unitPhrases(lesson.unit, 2, ws).forEach((p, k) => tail.push({ kind: 'build', word: p.word, gen: () => EXERCISES.build(p, lesson.unit, k ? 'en' : 'es') }));
    tail.push(exerciseFor(pickOne(ws), L, ['type', 'spell', 'listen', 'agree', 'article']));
    q.push(...shuffle(tail));
    return q;
  }
  // Review: the whole unit, mixed.
  const ws = shuffle(lesson.words).slice(0, 10);
  ws.forEach((w, i) => q.push(exerciseFor(w, L, i % 2 ? ['type', 'spell', 'listen', 'agree'] : ['meaning', 'picture', 'listen', 'article'])));
  const five = shuffle(lesson.words).slice(0, 5);
  q.splice(4, 0, { kind: 'match', gen: () => EXERCISES.match(five) });
  unitPhrases(lesson.unit, 3).forEach((p, k) => q.splice(3 + k * 4, 0, { kind: 'build', word: p.word, gen: () => EXERCISES.build(p, lesson.unit, k % 2 ? 'en' : 'es') }));
  return q;
}

// ---------------------------------------------------------------- playing a lesson
// opts.jump: { unit, words } for a test that skips ahead to unit.
function openLesson(lesson, opts = {}) {
  const host = App.openOverlay('lesson');
  const jump = opts.jump || null;
  const queue = buildLesson(lesson, jump ? { words: jump.words } : {});
  const total = queue.length;
  const started = Date.now();
  let i = 0, done = 0, right = 0, wrong = 0, hearts = jump ? 3 : null, state = 'answer', cur = null;
  const seen = new Set();

  const bar = h('div', { class: 'ls-bar' }, h('i'));
  const heartsEl = h('div', { class: 'ls-hearts' });
  const body = h('div', { class: 'ls-body' });
  const footMsg = h('div', { class: 'ls-msg' });
  const mainBtn = h('button', { class: 'btn primary ls-main' }, 'Check');
  const skipBtn = h('button', { class: 'btn ghost ls-skip' }, 'Can’t listen now');
  const foot = h('div', { class: 'ls-foot' }, footMsg, h('div', { class: 'ls-foot-btns' }, skipBtn, mainBtn));
  const root = h('div', { class: 'lesson', style: { '--u1': lesson.unit.color[0], '--u2': lesson.unit.color[1] } },
    h('div', { class: 'ls-top' }, h('button', { class: 'icon-btn', 'aria-label': 'Quit', onclick: () => App.closeOverlay() }, '✕'), bar, heartsEl),
    body, foot);
  host.replaceChildren(root);
  const drawHearts = () => { heartsEl.textContent = hearts == null ? '' : hearts > 0 ? '❤️'.repeat(hearts) : '💔'; };
  drawHearts();

  const ctl = {
    ready: (on) => { if (state === 'answer') mainBtn.disabled = !on; },
    locked: () => state !== 'answer',
    submit: () => { if (state === 'answer' && !mainBtn.disabled) check(); },
    done: (res) => { if (state === 'answer') result(res); },
  };

  const show = () => {
    if (i >= queue.length) return finish();
    const item = queue[i];
    state = 'answer';
    ctl.spanish = false;
    const made = item.gen(); // made fresh each time, so a retry is shuffled again
    cur = typeof made === 'function' ? made(ctl) : made;
    cur.item = item;
    bar.firstChild.style.width = (done / Math.max(total, queue.length)) * 100 + '%';
    foot.className = 'ls-foot';
    footMsg.replaceChildren();
    body.replaceChildren(h('div', { class: 'ls-ex pop-in' }, h('h2', { class: 'ls-title' }, cur.title), cur.node));
    body.scrollTop = 0;
    skipBtn.style.display = item.kind === 'listen' ? '' : 'none';
    if (cur.free) { mainBtn.disabled = false; mainBtn.textContent = 'Continue'; state = 'free'; }
    else if (cur.auto) { mainBtn.style.display = 'none'; }
    else { mainBtn.disabled = true; mainBtn.textContent = 'Check'; }
    if (!cur.auto) mainBtn.style.display = '';
    if (cur.onShow) cur.onShow();
  };

  const check = () => result(cur.check());

  const result = (res) => {
    state = 'result';
    if (cur.lock) {
      // Show the right option in green and a wrong pick in red.
      cur.lock.classList.add('locked');
      cur.lock.querySelectorAll('.ls-opt').forEach((b) => {
        if (b.opt === res.right) b.classList.add('right');
        else if (b.classList.contains('sel')) b.classList.add('wrong');
      });
    }
    const item = cur.item;
    const w = item.word;
    if (res.ok) {
      right++;
      if (w && item.kind !== 'match') Store.bump(w.id, 1);
      Sfx.good(right);
      Haptics.buzz(15);
    } else {
      wrong++;
      if (w) Store.bump(w.id, -1);
      Sfx.bad();
      Haptics.buzz([40, 30, 40]);
      // Try it again at the end (once), as a fresh copy.
      if (!seen.has(item)) { seen.add(item); queue.push(item); }
      if (hearts != null) { hearts--; drawHearts(); }
    }
    if (res.say) Voice.say(res.say);
    foot.className = 'ls-foot show ' + (res.ok ? 'ok' : 'no');
    footMsg.replaceChildren(...[
      h('b', {}, res.ok ? pickOne(['¡Muy bien!', '¡Genial!', '¡Perfecto!', '¡Eso es!', '¡Bravo!']) : 'Correct answer:'),
      !res.ok && h('div', { class: 'ls-ans' }, res.answer),
      res.note && h('div', { class: 'ls-note' }, res.note),
    ].filter(Boolean));
    mainBtn.style.display = '';
    mainBtn.disabled = false;
    mainBtn.textContent = 'Continue';
    if (hearts === 0) mainBtn.textContent = 'See result';
  };

  mainBtn.addEventListener('click', () => {
    if (state === 'answer') return check();
    if (hearts === 0) return finish();
    if (state === 'result' || state === 'free') { done++; i++; show(); }
  });
  skipBtn.addEventListener('click', () => {
    // No sound right now: switch listening off for a while, and skip this one.
    Store.s.voice = false;
    Store.save();
    toast('🔇 Listening exercises are off. Turn speech back on from the Me tab.', 3000);
    done++; i++; show();
  });

  const finish = () => {
    state = 'over';
    const secs = Math.round((Date.now() - started) / 1000);
    const acc = right + wrong ? right / (right + wrong) : 1;
    const failed = hearts === 0;
    let xp = 0, unitDone = false, climb = { coins: 0, passed: [] };
    if (!failed) {
      const perfect = wrong === 0;
      xp = (jump ? 20 : lesson.kind === 'review' ? 15 : 10) + (perfect ? 5 : 0);
      const c = courseData();
      if (jump) {
        for (const l of ALL_LESSONS()) { if (l.unit === jump.unit) break; if (!c[l.id]) c[l.id] = { at: today(), n: 0, skipped: true }; }
      } else {
        const was = c[lesson.id];
        c[lesson.id] = { at: today(), n: (was ? was.n || 1 : 0) + 1, perfect: perfect || !!(was && was.perfect) };
        unitDone = lesson.kind === 'review' && !was;
      }
      climb = claimClimb();
      Store.data.played++;
      Store.addXp(xp);
    } else Store.save();
    const face = failed ? '💔' : jump ? '🚀' : unitDone ? '🏆' : wrong === 0 ? '🌟' : '🎉';
    const head = failed ? 'Out of hearts' : jump ? '¡Adelante!' : unitDone ? '¡Unidad completa!' : wrong === 0 ? '¡Perfecto!' : '¡Lección completa!';
    const sub = failed ? 'Keep practising, then try again.' : jump ? `You jumped to ${jump.unit.emoji} ${jump.unit.title}` : unitDone ? `You finished ${lesson.unit.emoji} ${lesson.unit.title}` : `${lesson.unit.emoji} ${lesson.unit.title} · ${lesson.kind === 'review' ? 'Review' : 'Lesson ' + lesson.n}`;
    host.replaceChildren(h('div', { class: 'results', style: { '--g1': lesson.unit.color[0], '--g2': lesson.unit.color[1] } },
      h('div', { class: 'res-face' }, face),
      h('div', { class: 'res-head' }, head),
      h('div', { class: 'res-game' }, sub),
      h('div', { class: 'res-chips' },
        h('div', { class: 'chip' }, h('b', {}, '+' + xp), ' XP'),
        climb.coins ? h('div', { class: 'chip coins' }, h('b', {}, '+' + climb.coins), ' 🪙') : null,
        h('div', { class: 'chip' }, h('b', {}, Math.round(acc * 100) + '%'), ' accuracy'),
        h('div', { class: 'chip' }, h('b', {}, `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`), ' time')),
      climb.after ? h('div', { class: 'res-climb' }, `${myClimber()} You climbed to ${metres(climb.after)}`) : null,
      ...climb.passed.map(([name, m, flag]) => h('div', { class: 'badge-new level' }, `⛰ Higher than ${name} ${flag} (${metres(m)}) · +${CHEST_COINS} 🪙`)),
      !failed && Store.streakNow() ? h('div', { class: 'badge-new' }, `🔥 ${Store.streakNow()} day streak`) : null,
      h('div', { class: 'res-btns' },
        failed ? h('button', { class: 'btn ghost', onclick: () => App.closeOverlay() }, 'Back') : null,
        failed ? h('button', { class: 'btn primary', onclick: () => openLesson(lesson, opts) }, '↻ Try again')
          : h('button', { class: 'btn primary', onclick: () => App.closeOverlay() }, 'Continue'))));
    if (failed) Sfx.lose(); else { Sfx.win(); App.confetti(host); }
  };

  show();
}

// A test that skips ahead to `unit`, using words from the lessons in between.
function openJump(unit) {
  const before = ALL_LESSONS().slice(0, ALL_LESSONS().findIndex((l) => l.unit === unit));
  const words = [...new Set(before.filter((l) => !lessonDone(l.id) && l.kind === 'learn').flatMap((l) => l.words))];
  const first = unitLessons(unit)[0];
  openLesson(first, { jump: { unit, words: words.length >= 6 ? words : before.flatMap((l) => l.words) } });
}

// ---------------------------------------------------------------- tips
function openTips(unit) {
  const host = App.openOverlay('tips');
  const tips = unitTips(unit).map((t) => h('div', { class: 'card tip open' },
    h('div', { class: 'tip-head' }, h('span', { class: 'tip-emoji' }, t.emoji), h('b', {}, t.title)),
    h('div', { class: 'tip-body' }, h('p', { html: t.body }),
      ...t.examples.map(([es, en]) => h('button', { class: 'tip-ex', onclick: () => Voice.say(es, true) },
        h('span', {}, '🔊'), h('div', {}, h('b', {}, es), h('small', {}, en)))))));
  const phrases = (unit.phrases || []).map(([es, en]) => h('button', { class: 'tip-ex', onclick: () => Voice.say(es, true) }, h('span', {}, '🔊'), h('div', {}, h('b', {}, es), h('small', {}, en))));
  host.replaceChildren(h('div', { class: 'page tips-page' },
    h('header', { class: 'top' },
      h('div', {}, h('div', { class: 'hello' }, `Unit ${unitNumber(unit)} · Tips`), h('div', { class: 'brand' }, `${unit.emoji} ${unit.title}`)),
      h('button', { class: 'icon-btn', onclick: () => App.closeOverlay() }, '✕')),
    ...tips,
    phrases.length ? h('div', { class: 'section-title' }, 'Useful sentences') : null,
    phrases.length ? h('div', { class: 'card' }, ...phrases) : null,
    h('button', { class: 'btn primary wide', onclick: () => App.closeOverlay() }, 'Got it')));
}
