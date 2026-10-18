// Lessons and practice sessions: a run of short exercises with Check /
// Continue at the bottom. Anything you get wrong comes back at the end.

// ---------------------------------------------------------------- building blocks
const speakable = () => Store.s.voice && Voice.available() && !['missing', 'none'].includes(Voice.state());
// Listening and typing exercises can each be turned off in Settings.
const canListen = () => speakable() && Store.s.listen !== false;
const canType = () => Store.s.typing !== false;
// Speaking exercises: on unless turned off, paused ("can't speak now") or there's no microphone.
const canSpeak = () => Store.s.speak !== false && Date.now() > (Store.data.speakPausedUntil || 0) && Mic.available();
const speakable_word = (w) => w.k !== 'num' && !/\d/.test(w.t);

function sayBtn(text, opts = {}) {
  const b = h('button', { class: 'say-btn ' + (opts.cls || ''), 'aria-label': t('ex.hear') }, icon('speaker'));
  b.addEventListener('click', (e) => { e.stopPropagation(); Voice.say(text, { force: true, lang: opts.lang }); });
  return b;
}
function slowBtn(text) {
  const b = h('button', { class: 'say-btn slow', 'aria-label': t('ex.slow') }, icon('turtle'));
  b.addEventListener('click', (e) => { e.stopPropagation(); Voice.say(text, { force: true, slow: true }); });
  return b;
}

// Option buttons; one can be chosen before pressing Check.
function pickList(options, render, onChoose, cls = 'opts') {
  const wrap = h('div', { class: cls });
  const btns = options.map((o) => {
    const b = h('button', { class: 'opt' }, render(o));
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
  return wrap;
}

// Word tiles for building a sentence. `lang` is the language of the tiles.
function tileBuilder(answer, extras, ctl, lang) {
  const pool = shuffle([...tokens(answer), ...extras].map((w, k) => ({ w, k })));
  const line = h('div', { class: 'tile-line' });
  const bank = h('div', { class: 'tile-bank' });
  const chosen = [];
  const draw = () => {
    line.replaceChildren(...chosen.map((c) => {
      const b = h('button', { class: 'wtile in' }, c.w);
      b.addEventListener('click', () => { if (ctl.locked()) return; chosen.splice(chosen.indexOf(c), 1); Sfx.tap(); draw(); });
      return b;
    }));
    bank.replaceChildren(...pool.map((c) => {
      const b = h('button', { class: 'wtile' + (chosen.includes(c) ? ' used' : '') }, c.w);
      b.addEventListener('click', () => {
        if (ctl.locked() || chosen.includes(c)) return;
        chosen.push(c);
        Sfx.tap();
        if (lang === Store.data.target) Voice.say(c.w);
        draw();
      });
      return b;
    }));
    ctl.ready(chosen.length > 0);
  };
  draw();
  return { node: h('div', { class: 'builder' }, line, bank), value: () => chosen.map((c) => c.w).join(' ') };
}
// Spare tiles: words from other sentences that aren't in this one.
function spareTiles(sentence, others, n) {
  const have = new Set(tokens(sentence).map(normText));
  const cands = [...new Set(others.flatMap(tokens))].filter((x) => !have.has(normText(x)));
  return shuffle(cands).slice(0, n);
}

// The host of a unit: one of the cast, the same each time.
const hostOf = (unit) => CAST[(unit.mountain.index * 5 + unit.n) % CAST.length];

// A sentence in the new language where every word can be tapped to see
// what it means (and hear it).
function tappable(text) {
  const parts = String(text).split(/(\s+)/);
  const toks = tokens(text);
  let k = -1;
  return h('span', { class: 'tappable' }, ...parts.map((p) => {
    if (/^\s+$/.test(p) || !p) return p;
    const core = p.replace(/[¿?¡!.,;:"“”«»]/g, '');
    if (!core) return p;
    const i = ++k;
    const b = h('button', { class: 'tw' }, p);
    b.addEventListener('click', (e) => { e.stopPropagation(); showGloss(b, toks, i); });
    return b;
  }));
}
function showGloss(el, toks, i) {
  document.querySelectorAll('.gloss').forEach((g) => g.remove());
  document.querySelectorAll('.tw.on').forEach((x) => x.classList.remove('on'));
  const found = lookupWord(toks, i);
  el.classList.add('on');
  Sfx.tap();
  Voice.say(found ? found.text : toks[i]);
  const pop = h('div', { class: 'gloss' }, found ? [h('b', {}, found.text), h('span', {}, found.meaning)] : h('span', {}, t('ex.noGloss')));
  document.body.append(pop);
  const r = el.getBoundingClientRect();
  const w = pop.offsetWidth;
  pop.style.left = clamp(r.left + r.width / 2 - w / 2, 8, window.innerWidth - w - 8) + 'px';
  pop.style.top = r.top - pop.offsetHeight - 10 + 'px';
  pop.style.setProperty('--ax', r.left + r.width / 2 - parseFloat(pop.style.left) + 'px');
  const close = () => { pop.remove(); el.classList.remove('on'); document.removeEventListener('pointerdown', close, true); };
  setTimeout(() => document.addEventListener('pointerdown', close, true), 0);
  setTimeout(close, 4000);
}

// A character saying something, in a speech bubble.
function speaker(c, text, opts = {}) {
  return h('div', { class: 'speaker' + (opts.big ? ' big' : '') },
    castArt(c.id, '', 'speaker-art'),
    h('div', { class: 'bubble' },
      opts.hidden ? null : h('div', { class: 'bubble-text' }, tappable(text)),
      h('div', { class: 'bubble-btns' }, sayBtn(text), slowBtn(text))));
}

// ---------------------------------------------------------------- exercises
// Each maker returns a function (ctl) → { title, node, check?, free?, auto?, onShow?, lock? }.
//   check() → { ok, right, answer, say, note }
const EX = {
  intro(w) {
    return () => {
      const st = wordState(w.id);
      return {
        title: t('ex.new'), free: true, word: w,
        node: h('div', { class: 'card intro' },
          artImg(`words/${w.raw.id}.webp`, 'intro-pic'),
          h('div', { class: 'intro-t' }, w.t, sayBtn(w.t), slowBtn(w.t)),
          h('div', { class: 'intro-n' }, w.nAll.join(' · ')),
          w.art ? h('div', { class: 'chip' }, genderNote(w)) : null,
          st ? null : h('div', { class: 'intro-tip' }, t('ex.introTip'))),
        onShow: () => Voice.say(w.t),
      };
    };
  },

  // See (and hear) the word, pick what it means.
  meaning(w, L) {
    const opts = shuffle([w, ...distractorsFor(w, 3, L.words)]);
    return (ctl) => {
      let pick = null;
      const list = pickList(opts, (o) => o.n, (o) => { pick = o; ctl.ready(true); });
      return {
        title: t('ex.meaning'), word: w, lock: list,
        node: h('div', {}, h('div', { class: 'prompt-word' }, sayBtn(w.t), w.t), list),
        onShow: () => Voice.say(w.t),
        check: () => ({ ok: pick === w, right: w, answer: w.n, say: w.t }),
      };
    };
  },

  // See the meaning, pick the word in the new language.
  recall(w, L) {
    const opts = shuffle([w, ...distractorsFor(w, 3, L.words)]);
    return (ctl) => {
      let pick = null;
      const list = pickList(opts, (o) => o.t, (o) => { pick = o; Voice.say(o.t); ctl.ready(true); });
      return {
        title: t('ex.recall', { w: w.n }), word: w, lock: list, node: list,
        check: () => ({ ok: pick === w, right: w, answer: w.t, say: w.t }),
      };
    };
  },

  // Hear it, pick what you heard.
  listen(w, L) {
    const opts = shuffle([w, ...distractorsFor(w, 3, L.words)]);
    return (ctl) => {
      let pick = null;
      const list = pickList(opts, (o) => o.t, (o) => { pick = o; ctl.ready(true); });
      return {
        title: t('ex.listen'), word: w, lock: list,
        node: h('div', {}, h('div', { class: 'listen-row' }, h('button', { class: 'big-say', onclick: () => Voice.say(w.t, { force: true }) }, icon('speaker')), slowBtn(w.t)), list),
        onShow: () => Voice.say(w.t, { force: true }),
        check: () => ({ ok: pick === w, right: w, answer: `${w.t} = ${w.n}`, say: w.t }),
      };
    };
  },

  // Nouns: which word for "the"?
  article(w) {
    const sets = { es: ['el', 'la', 'los', 'las'], fr: ['le', 'la', 'les'], de: ['der', 'die', 'das'], pt: ['o', 'a', 'os', 'as'] };
    const all = sets[Store.data.target] || [];
    const plural = /^(los|las|les|os|as)$/i.test(w.art || '');
    let opts = Store.data.target === 'de' ? all : all.filter((a) => /s$/.test(a) === plural);
    if (!opts.includes((w.art || '').toLowerCase())) opts = all;
    return (ctl) => {
      let pick = null;
      const list = pickList(opts, (o) => o, (o) => { pick = o; ctl.ready(true); }, 'opts row');
      return {
        title: t('ex.article'), word: w, lock: list,
        node: h('div', {}, h('div', { class: 'card center' }, h('div', { class: 'prompt-word' }, '___ ' + w.bare), h('div', { class: 'muted' }, w.n)), list),
        check: () => ({ ok: pick === (w.art || '').toLowerCase(), right: (w.art || '').toLowerCase(), answer: w.t, say: w.t }),
      };
    };
  },

  // Spell the word with letter tiles.
  spell(w) {
    return (ctl) => {
      const letters = [...w.bare];
      let order;
      do { order = shuffle(letters.map((c, k) => k)); } while (letters.length > 1 && order.every((k, j) => letters[k] === letters[j]));
      const placed = [];
      const slots = h('div', { class: 'slots' });
      const tiles = h('div', { class: 'ltiles' });
      const draw = () => {
        // The article (el, la, der…) sits ready-made in its own box in front.
        slots.replaceChildren(...(w.art ? [h('div', { class: 'slot art' }, w.art), h('div', { class: 'slot space' })] : []), ...letters.map((_, k) => {
          const p = placed[k];
          const s = h('button', { class: 'slot' + (p ? ' filled' : '') + (letters[k] === ' ' ? ' space' : '') }, p ? p.ch : '');
          if (p) s.addEventListener('click', () => { if (ctl.locked()) return; p.btn.classList.remove('used'); placed[k] = null; Sfx.tap(); draw(); });
          return s;
        }));
        ctl.ready(letters.every((ch, k) => placed[k] || ch === ' '));
      };
      letters.forEach((ch, k) => { if (ch === ' ') placed[k] = { ch: ' ', btn: h('i') }; });
      order.filter((k) => letters[k] !== ' ').forEach((k) => {
        const rec = { ch: letters[k] };
        const b = h('button', { class: 'ltile' }, letters[k]);
        rec.btn = b;
        b.addEventListener('click', () => {
          if (ctl.locked() || b.classList.contains('used')) return;
          const at = letters.findIndex((ch, j) => !placed[j]);
          if (at === -1) return;
          placed[at] = rec;
          b.classList.add('used');
          Sfx.tap();
          draw();
        });
        tiles.append(b);
      });
      draw();
      return {
        title: t('ex.spell'), word: w,
        node: h('div', {}, h('div', { class: 'card center' }, h('div', { class: 'prompt-word' }, w.n)), slots, tiles),
        check: () => ({ ok: placed.map((p) => p.ch).join('') === w.bare, answer: w.t, say: w.t }),
      };
    };
  },

  // Type it. Missing accents and a small typo still count, with a reminder.
  type(w, L, opts = {}) {
    return (ctl) => {
      const input = h('input', { class: 'field type-in', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: t('ex.typeHere', { lang: t('lang.' + Store.data.target) }) });
      input.addEventListener('input', () => ctl.ready(input.value.trim().length > 0));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ctl.submit(); });
      const prompt = opts.dictation
        ? h('div', { class: 'listen-row' }, h('button', { class: 'big-say', onclick: () => Voice.say(w.t, { force: true }) }, icon('speaker')), slowBtn(w.t))
        : h('div', { class: 'card center' }, h('div', { class: 'prompt-word' }, w.n));
      return {
        title: opts.dictation ? t('ex.dictation') : t('ex.type', { lang: t('lang.' + Store.data.target) }), word: w,
        node: h('div', {}, prompt, input),
        onShow: () => { if (opts.dictation) Voice.say(w.t, { force: true }); setTimeout(() => input.focus(), 250); },
        check: () => {
          input.blur();
          const m = markTyped(input.value, [...w.tAll, w.bare]);
          return { ok: m.ok, answer: w.t, say: w.t, note: m.how === 'accent' ? t('ex.accent', { w: w.t }) : m.how === 'typo' ? t('ex.typo', { w: w.t }) : null };
        },
      };
    };
  },

  // Tap the pairs; finishes when all are matched.
  match(words) {
    return (ctl) => {
      const left = h('div', { class: 'match-col' });
      const right = h('div', { class: 'match-col' });
      let sel = null, remaining = words.length, slips = 0;
      const mk = (w, side, text) => {
        const b = h('button', { class: 'match-item ' + side }, text);
        b.addEventListener('click', () => {
          if (b.classList.contains('done')) return;
          if (side === 't') Voice.say(w.t);
          if (!sel || sel.side === side) {
            if (sel) sel.b.classList.remove('sel');
            sel = { w, side, b };
            b.classList.add('sel');
            Sfx.tap();
            return;
          }
          if (sel.w.id === w.id) {
            // A match: both flash gold, sparks fly between them, then they pop away.
            const a = sel.b;
            a.classList.remove('sel');
            a.classList.add('matched'); b.classList.add('matched');
            const [x1, y1] = centerOf(a), [x2, y2] = centerOf(b);
            goldBurst((x1 + x2) / 2, (y1 + y2) / 2);
            Sfx.good(words.length - remaining);
            Haptics.buzz(20);
            setTimeout(() => { a.classList.add('done'); b.classList.add('done'); }, 380);
            sel = null;
            if (--remaining === 0) setTimeout(() => ctl.done({ ok: true, slips }), 300);
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
      shuffle(words).forEach((w) => left.append(mk(w, 't', w.t)));
      shuffle(words).forEach((w) => right.append(mk(w, 'n', w.n)));
      return { title: t('ex.match'), auto: true, node: h('div', { class: 'match' }, left, right) };
    };
  },

  // A character says a sentence; build what it means in your language.
  decode(s, opts = {}) {
    return (ctl) => {
      const others = s.unit.sentences.filter((x) => x !== s).map((x) => x.n);
      const b = tileBuilder(s.n, spareTiles(s.n, others, 3), ctl, Store.data.native);
      return {
        title: opts.listenOnly ? t('ex.decodeListen', { name: hostOf(s.unit).name }) : t('ex.decode', { name: hostOf(s.unit).name }), sentence: s,
        node: h('div', {}, speaker(hostOf(s.unit), s.t, { hidden: opts.listenOnly }), b.node),
        onShow: () => Voice.say(s.t, { force: !!opts.listenOnly }),
        check: () => ({ ok: normText(b.value()) === normText(s.n), answer: s.n, say: s.t, note: opts.listenOnly ? s.t : null }),
      };
    };
  },

  // Hear it, then say it out loud. what: a word or a sentence.
  speak(what) {
    const isWord = !!what.unit && !!what.k;
    const text = isWord ? what.t : what.t, meaning = what.n;
    return (ctl) => {
      let tries = 0;
      const heard = h('div', { class: 'heard' });
      const mic = h('button', { class: 'mic-btn', 'aria-label': t('ex.speakTap') }, icon('mic'));
      const label = h('div', { class: 'mic-label' }, t('ex.speakTap'));
      const go = async () => {
        if (ctl.locked()) return;
        if (Mic.busy) { Mic.stop(); return; }
        Voice.stop();
        mic.classList.add('on'); label.textContent = t('ex.listening'); heard.textContent = '';
        try {
          const said = await Mic.listen(I18N_LOCALE[Store.data.target], (p) => { heard.textContent = p; });
          heard.textContent = said[0] || '';
          if (markSpoken(said, isWord ? what.tAll : [text])) return ctl.done({ ok: true, answer: text, say: null });
          tries++;
          if (tries >= 2) return ctl.done({ ok: false, answer: text, say: text, note: t('ex.heard', { t: said[0] || '' }) });
          Sfx.oops();
          label.textContent = t('ex.tryAgain');
        } catch (e) {
          if (e === 'stopped') { label.textContent = t('ex.speakTap'); return; }
          if (e === 'denied') return ctl.skip('ex.micDenied');
          label.textContent = t('ex.noHear');
        } finally { mic.classList.remove('on'); }
      };
      mic.addEventListener('click', go);
      return {
        title: t('ex.speak'), word: isWord ? what : null, auto: true,
        node: h('div', { class: 'speak-ex' },
          h('div', { class: 'card speak-card' },
            h('div', { class: 'speak-row' }, sayBtn(text), slowBtn(text)),
            h('div', { class: 'speak-text' }, isWord ? text : tappable(text)),
            h('div', { class: 'speak-mean' }, meaning)),
          mic, label, heard),
        onShow: () => Voice.say(text, { force: true }),
        check: () => ({ ok: false, answer: text }),
      };
    };
  },

  // A sentence with a word (or short phrase) from the course missing: pick what fits.
  gap(s) {
    const parts = s.t.split(' ');
    const core = (p) => p.replace(/^[¿¡"“«(]+|[.,;:!?"”»)]+$/g, '');
    const lessonIds = new Set(s.unit.words.map((w) => w.id));
    // The best span: a word from this unit beats one from elsewhere, longer beats shorter.
    let best = null;
    for (let len = 3; len >= 1; len--) {
      for (let a = 0; a + len <= parts.length; a++) {
        const text = parts.slice(a, a + len).map(core).join(' ');
        const w = C.forms.get(normText(text));
        if (!w || text.length < 2 || w.k === 'num') continue;
        const score = (lessonIds.has(w.id) ? 10 : 0) + len;
        if (!best || score > best.score) best = { a, len, w, score };
      }
    }
    if (!best) return Object.assign(EX.decode(s), { fallback: true }); // nothing to blank: decode it instead
    const first = parts[best.a], last = parts[best.a + best.len - 1];
    const pre = first.slice(0, first.indexOf(core(first)));
    const post = last.slice(last.indexOf(core(last)) + core(last).length);
    const gone = parts.slice(best.a, best.a + best.len).map(core).join(' ');
    const cap = gone[0] !== gone[0].toLowerCase() && best.a === 0;
    const fit = (x) => (cap ? x[0].toUpperCase() + x.slice(1) : x);
    const inSentence = normText(s.t);
    const words = best.len > 1 ? (w) => w.bare.includes(' ') : (w) => !w.bare.includes(' ');
    const others = shuffle([...s.unit.words, ...C.words.filter((w) => w.unit.mountain === s.unit.mountain)])
      .filter((w) => words(w) && w.k !== 'num' && w.bare.length >= 2 && !inSentence.includes(normText(w.bare)))
      .sort((a, b) => (b.k === best.w.k) - (a.k === best.w.k)) // the same kind of word first
      .map((w) => fit(w.bare));
    const opts = shuffle([gone, ...[...new Set(others)].filter((o) => normText(o) !== normText(gone)).slice(0, 3)]);
    if (opts.length < 4) return Object.assign(EX.decode(s), { fallback: true });
    return (ctl) => {
      let pick = null;
      const blank = h('span', { class: 'gap-blank' }, ' ');
      const list = pickList(opts, (o) => o, (o) => { pick = o; blank.textContent = o; blank.classList.add('filled'); ctl.ready(true); });
      const before = parts.slice(0, best.a).join(' '), after = parts.slice(best.a + best.len).join(' ');
      return {
        title: t('ex.gap'), word: best.w, lock: list,
        node: h('div', {},
          h('div', { class: 'card gap-card' },
            h('div', { class: 'gap-sentence' }, before ? before + ' ' : '', pre, blank, post, after ? ' ' + after : ''),
            h('div', { class: 'gap-mean' }, s.n)),
          list),
        check: () => ({ ok: pick === gone, right: gone, answer: s.t, say: s.t }),
      };
    };
  },

  // Say it in the new language: build the sentence from tiles.
  build(s) {
    return (ctl) => {
      const others = s.unit.sentences.filter((x) => x !== s).map((x) => x.t);
      const b = tileBuilder(s.t, spareTiles(s.t, others, 3), ctl, Store.data.target);
      return {
        title: t('ex.build', { lang: t('lang.' + Store.data.target) }), sentence: s,
        node: h('div', {}, h('div', { class: 'card prompt-sentence' }, s.n), b.node),
        check: () => ({ ok: normText(b.value()) === normText(s.t), answer: s.t, say: s.t }),
      };
    };
  },
};

function genderNote(w) {
  const a = (w.art || '').toLowerCase();
  const tgt = Store.data.target;
  const fem = { es: ['la', 'las'], fr: ['la'], de: ['die'], pt: ['a', 'as'] }[tgt] || [];
  const neu = tgt === 'de' && a === 'das';
  const plural = /^(los|las|les|os|as)$/.test(a);
  const g = neu ? t('g.n') : fem.includes(a) ? t('g.f') : a === "l'" ? '' : t('g.m');
  return [w.art, g, plural ? t('g.pl') : ''].filter(Boolean).join(' · ');
}

// How many single-letter edits turn a into b.
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
// Marks a typed answer against the right ones: exact, right but for the
// accents, or right but for a small typo (one letter in a short word, two
// in a long one). Typing the article is optional.
function markTyped(typed, answers) {
  const arts = ARTICLES[Store.data.target];
  const strip = (x) => (arts ? x.replace(new RegExp(`^(${arts})\\s+`, 'i'), '').replace(/^l['’]/i, '') : x);
  const tt = normText(typed);
  const goods = [...new Set(answers.flatMap((a) => [normText(a), normText(strip(a))]))];
  if (goods.includes(tt) || goods.includes(normText(strip(tt)))) return { ok: true, how: 'exact' };
  const plain = (x) => stripAccents(x);
  if (goods.some((g) => plain(g) === plain(tt) || plain(g) === plain(normText(strip(tt))))) return { ok: true, how: 'accent' };
  const near = goods.some((g) => {
    const allowed = g.length <= 4 ? 0 : g.length <= 8 ? 1 : 2;
    return allowed && Math.min(editDistance(plain(g), plain(tt)), editDistance(plain(g), plain(normText(strip(tt))))) <= allowed;
  });
  return near ? { ok: true, how: 'typo' } : { ok: false };
}

// Did what was heard match? Recognisers drop accents and punctuation, add
// or miss an article, and mishear a sound or two, so it's marked on letters.
function markSpoken(heard, answers) {
  const flat = (x) => stripAccents(normText(x)).replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
  const arts = ARTICLES[Store.data.target];
  const strip = (x) => (arts ? x.replace(new RegExp(`^(${arts}) `), '') : x);
  const goods = answers.flatMap((a) => [flat(a), strip(flat(a))]).filter(Boolean);
  for (const h0 of heard) {
    const h = flat(h0);
    if (!h) continue;
    for (const g of goods) {
      if (h === g || strip(h) === g) return true;
      const near = 1 - editDistance(h, g) / Math.max(h.length, g.length);
      if (near >= (g.length <= 4 ? 0.75 : 0.8)) return true;
      // A word said inside a few extra words ("hola" → "hola hola") still counts.
      if (!g.includes(' ') && h.split(' ').includes(g) && h.split(' ').length <= 3) return true;
    }
  }
  return false;
}

const canSpell = (w) => /^[\p{L}' -]{2,12}$/u.test(w.bare) && w.bare.split(' ').length <= 2;

// One exercise for w that fits how well you know it.
function reviewExercise(w, L) {
  const box = wordState(w.id) ? wordState(w.id).box : 0;
  let kinds = box <= 1 ? ['meaning', 'recall', 'listen'] : box <= 3 ? ['recall', 'listen', 'spell', 'type'] : ['type', 'dictation', 'spell'];
  if (w.art && Store.data.target !== 'en' && box >= 1) kinds.push('article');
  if (box >= 1 && canSpeak() && speakable_word(w)) kinds.push('speak');
  kinds = kinds.filter((k) => (k !== 'listen' && k !== 'dictation') || canListen()).filter((k) => k !== 'spell' || canSpell(w)).filter((k) => !['spell', 'type', 'dictation'].includes(k) || canType());
  // A bit more of whatever you've been getting wrong lately.
  const focus = Coach.focusKinds().filter((k) => kinds.includes(k));
  kinds.push(...focus, ...focus);
  const kind = pickOne(kinds.length ? kinds : ['meaning']);
  return kind === 'dictation' ? { kind, word: w, gen: () => EX.type(w, L, { dictation: true }) } : { kind, word: w, gen: () => EX[kind](w, L) };
}

// ---------------------------------------------------------------- building sessions
function buildLessonQueue(lesson) {
  const L = { words: lesson.unit.words };
  const q = [];
  const add = (kind, w) => q.push({ kind, word: w, gen: () => EX[kind](w, L) });
  const ws = lesson.words;
  if (lesson.kind === 'learn') {
    const firstTime = !lessonDone(lesson.id);
    ws.forEach((w, i) => {
      if (firstTime || !wordState(w.id)) q.push({ kind: 'intro', word: w, gen: () => EX.intro(w) });
      add('meaning', w);
      if (i > 0) add(canListen() && i % 2 ? 'listen' : 'recall', ws[i - 1]);
    });
    const tail = [];
    const reviews = dueWords().filter((w) => !ws.includes(w)).slice(0, 3);
    tail.push({ kind: 'match', gen: () => EX.match([...ws, ...reviews].slice(0, 5)) });
    tail.push({ kind: 'recall', word: ws.at(-1), gen: () => EX.recall(ws.at(-1), L) });
    shuffle(ws).slice(0, 2).forEach((w) => tail.push(!canType() ? reviewExercise(w, L) : canSpell(w) && Math.random() < 0.5 ? { kind: 'spell', word: w, gen: () => EX.spell(w) } : { kind: 'type', word: w, gen: () => EX.type(w, L) }));
    reviews.forEach((w) => tail.push(reviewExercise(w, L)));
    // Say one of the new words out loud.
    const sayIt = ws.filter(speakable_word);
    if (canSpeak() && sayIt.length) { const w = pickOne(sayIt); tail.push({ kind: 'speak', word: w, gen: () => EX.speak(w) }); }
    // A sentence from the unit that uses one of these words, if there is one.
    const s = lesson.unit.sentences.find((x) => ws.some((w) => normText(x.t).includes(normText(w.bare)))) || pickOne(lesson.unit.sentences);
    tail.push({ kind: 'decode', sentence: s, gen: () => EX.decode(s) });
    if (lesson.n === 3) { const s2 = pickOne(lesson.unit.sentences.filter((x) => x !== s)); tail.push({ kind: 'build', sentence: s2, gen: () => EX.build(s2) }); }
    else { const s3 = pickOne(lesson.unit.sentences.filter((x) => x !== s)); tail.push({ kind: 'gap', sentence: s3, gen: () => EX.gap(s3) }); }
    q.push(...shuffle(tail));
    return q;
  }
  // The story: the host says each of the unit's sentences.
  lesson.unit.sentences.forEach((s, i) => {
    const kind = ['decode', 'gap', 'build'][i % 3];
    q.push({ kind, sentence: s, gen: kind === 'build' ? () => EX.build(s) : kind === 'gap' ? () => EX.gap(s) : () => EX.decode(s, { listenOnly: i === 3 && canListen() }) });
  });
  // Say the shortest sentence out loud.
  if (canSpeak()) { const s = [...lesson.unit.sentences].sort((a, b) => a.t.length - b.t.length)[0]; q.push({ kind: 'speak', sentence: s, gen: () => EX.speak(s) }); }
  q.splice(3, 0, { kind: 'match', gen: () => EX.match(shuffle(lesson.unit.words).slice(0, 5)) });
  shuffle(lesson.unit.words).slice(0, 3).forEach((w) => q.push(reviewExercise(w, L)));
  return q;
}

// Practice: due reviews first, then the weakest words. kind: 'review' | 'weak' | 'listen'.
function buildPracticeQueue(kind) {
  let pool = kind === 'weak' ? weakWords() : dueWords();
  if (pool.length < 8) pool = [...pool, ...weakWords().filter((w) => !pool.includes(w))];
  const ws = pool.slice(0, 12);
  const L = { words: ws };
  // Practice aimed at one weak skill.
  if (kind === 'spelling') return ws.slice(0, 10).map((w) => (canSpell(w) && Math.random() < 0.5 ? { kind: 'spell', word: w, gen: () => EX.spell(w) } : { kind: 'type', word: w, gen: () => EX.type(w, L) }));
  if (kind === 'gender') {
    const nouns = [...weakWords(), ...learnedWords()].filter((w, i, a) => w.art && a.indexOf(w) === i).slice(0, 10);
    if (nouns.length >= 4) return nouns.map((w) => ({ kind: 'article', word: w, gen: () => EX.article(w) }));
  }
  if (kind === 'speaking') {
    const say = ws.filter(speakable_word).slice(0, 6).map((w) => ({ kind: 'speak', word: w, gen: () => EX.speak(w) }));
    const ss = shuffle(practiceSentences()).sort((a, b) => a.t.length - b.t.length).slice(0, 3);
    return [...say, ...ss.map((s) => ({ kind: 'speak', sentence: s, gen: () => EX.speak(s) }))];
  }
  if (kind === 'sentences') return shuffle(practiceSentences()).slice(0, 8).map((s, i) => {
    const k = ['decode', 'gap', 'build'][i % 3];
    return { kind: k, sentence: s, gen: k === 'build' ? () => EX.build(s) : k === 'gap' ? () => EX.gap(s) : () => EX.decode(s) };
  });
  if (kind === 'listen') return ws.map((w, i) => (i % 2 && canType() ? { kind: 'dictation', word: w, gen: () => EX.type(w, L, { dictation: true }) } : { kind: 'listen', word: w, gen: () => EX.listen(w, L) }));
  const q = ws.map((w) => reviewExercise(w, L));
  if (ws.length >= 5) q.splice(4, 0, { kind: 'match', gen: () => EX.match(ws.slice(0, 5)) });
  return q;
}

// Sentences from the units you've started (or the first one).
function practiceSentences() {
  const started = C.units.filter((u) => u.lessons.some((l) => lessonDone(l.id)));
  return (started.length ? started : C.units.slice(0, 1)).flatMap((u) => u.sentences);
}

// ---------------------------------------------------------------- playing a session
// meta: { lesson } or { practice: kind }
function openSession(queue, meta) {
  const host = App.openOverlay('lesson');
  const unit = meta.lesson ? meta.lesson.unit : null;
  const cast = unit ? hostOf(unit) : pickOne(CAST); // reacts to your answers
  const total = queue.length;
  const started = Date.now();
  let i = 0, done = 0, right = 0, wrong = 0, streak = 0, state = 'answer', cur = null;
  const seen = new Set();
  Timer.start();
  App.overlayCleanup = () => { Timer.stop(); Voice.stop(); Mic.stop(); };

  const bar = h('div', { class: 'progress' }, h('i'));
  const streakEl = h('div', { class: 'run' });
  // Hearts: a wrong answer in a lesson costs one (not for Pro, not in practice).
  const hearty = !!meta.lesson && !Pro.is();
  const heartsEl = hearty ? h('div', { class: 'ses-hearts' }, icon('heart'), h('b', {}, Hearts.label())) : null;
  let outOfHearts = false;
  const body = h('div', { class: 'ses-body' });
  const msg = h('div', { class: 'foot-msg' });
  const main = h('button', { class: 'btn primary wide' }, t('ex.check'));
  const skip = h('button', { class: 'btn ghost' }, t('ex.cantListen'));
  const foot = h('div', { class: 'ses-foot' }, msg, h('div', { class: 'foot-btns' }, skip, main));
  host.replaceChildren(h('div', { class: 'session' },
    h('div', { class: 'ses-top' }, h('button', { class: 'icon-btn', 'aria-label': t('ex.quit'), onclick: () => App.closeOverlay() }, icon('x')), bar, streakEl, heartsEl),
    body, foot));

  const ctl = {
    ready: (on) => { if (state === 'answer') main.disabled = !on; },
    locked: () => state !== 'answer',
    submit: () => { if (state === 'answer' && !main.disabled) result(cur.check()); },
    done: (res) => { if (state === 'answer') result(res); },
    // Moves on without marking it (e.g. no microphone); msg: what to tell you.
    skip: (msg) => { if (state === 'answer') skipNow(msg); },
  };

  const show = () => {
    if (i >= queue.length) return finish();
    Mic.stop();
    const item = queue[i];
    state = 'answer';
    const made = item.gen();
    cur = typeof made === 'function' ? made(ctl) : made;
    cur.item = item;
    bar.firstChild.style.width = (done / Math.max(total, queue.length)) * 100 + '%';
    foot.className = 'ses-foot';
    msg.replaceChildren();
    body.replaceChildren(h('div', { class: 'ex pop-in' }, h('h2', { class: 'ex-title' }, cur.title), cur.node));
    body.scrollTop = 0;
    const speaking = item.kind === 'speak';
    skip.textContent = speaking ? t('ex.cantSpeak') : t('ex.cantListen');
    skip.style.display = speaking || ['listen', 'dictation'].includes(item.kind) || (item.kind === 'decode' && /listen/i.test(cur.title)) ? '' : 'none';
    main.style.display = cur.auto ? 'none' : '';
    if (cur.free) { main.disabled = false; main.textContent = t('ex.continue'); state = 'free'; }
    else { main.disabled = true; main.textContent = t('ex.check'); }
    if (cur.word) seeWord(cur.word);
    if (cur.onShow) cur.onShow();
  };

  const result = (res) => {
    state = 'result';
    if (cur.lock) {
      cur.lock.classList.add('locked');
      cur.lock.querySelectorAll('.opt').forEach((b) => {
        if (b.opt === res.right) b.classList.add('right');
        else if (b.classList.contains('sel')) b.classList.add('wrong');
      });
    }
    const item = cur.item;
    if (res.ok) {
      right++; streak++;
      Sfx.good(streak - 1);
      Haptics.buzz(15);
      // Gold sparks from what you picked, and the progress bar flashes gold.
      const from = (cur.lock && cur.lock.querySelector('.opt.sel')) || body.querySelector('.tile-line, .slots, .type-in, .match, .intro') || main;
      const [x, y] = centerOf(from);
      goldBurst(x, y, streak >= 5);
      from.classList.remove('win'); void from.offsetWidth; from.classList.add('win');
      bar.classList.remove('glow'); void bar.offsetWidth; bar.classList.add('glow');
      if ([3, 5, 10, 15, 20].includes(streak)) comboPop(streak);
    } else {
      wrong++; streak = 0;
      Sfx.bad();
      if (hearty) {
        const left = Hearts.lose();
        Store.save({ quiet: true });
        heartsEl.lastChild.textContent = left;
        heartsEl.classList.remove('hurt'); void heartsEl.offsetWidth; heartsEl.classList.add('hurt');
        if (left <= 0) outOfHearts = true;
      }
      Haptics.buzz([40, 30, 40]);
      if (!seen.has(item)) { seen.add(item); queue.push(item); } // try it again at the end, once
    }
    if (item.word && item.kind !== 'match' && item.kind !== 'intro') gradeWord(item.word, res.ok);
    Coach.record(skillOfKind(item.kind), res.ok);
    streakEl.textContent = streak >= 3 ? `×${streak}` : '';
    if (res.say) Voice.say(res.say);
    foot.className = 'ses-foot show ' + (res.ok ? 'ok' : 'no');
    msg.replaceChildren(castArt(cast.id, res.ok ? 'happy' : 'sad', 'foot-cast'), h('div', { class: 'foot-text' }, ...[
      h('b', {}, res.ok ? pickOne(t('ex.praise').split('|')) : t('ex.correctIs')),
      !res.ok && h('div', { class: 'ans' }, res.answer),
      res.note && h('div', { class: 'note' }, res.note),
    ].filter(Boolean)));
    main.style.display = '';
    main.disabled = false;
    main.textContent = t('ex.continue');
  };

  main.addEventListener('click', () => {
    if (state === 'answer') return result(cur.check());
    if (outOfHearts && state === 'result') {
      // Out of hearts: refill (and carry on), practise, go Pro or stop here.
      outOfHearts = false;
      const host2 = $('#overlay');
      const saved = [...host2.childNodes];
      Hearts.sheet({ inLesson: true, onRefill: () => { App.overlayKind = 'lesson'; host2.replaceChildren(...saved); Timer.start(); App.overlayCleanup = () => { Timer.stop(); Voice.stop(); Mic.stop(); }; heartsEl.lastChild.textContent = Hearts.label(); done++; i++; show(); } });
      return;
    }
    if (state === 'result' || state === 'free') { done++; i++; show(); }
  });
  // "Can't speak now" (or no microphone): no speaking for 15 minutes, and
  // this one doesn't count against you.
  const skipNow = (msg) => {
    Mic.stop();
    Store.data.speakPausedUntil = Date.now() + 15 * 60e3;
    Store.save();
    toast(t(msg || 'ex.speakOff'), 3500);
    queue.splice(i + 1, queue.length, ...queue.slice(i + 1).filter((x) => x.kind !== 'speak'));
    done++; i++; show();
  };
  skip.addEventListener('click', () => {
    if (cur && cur.item.kind === 'speak') return skipNow();
    Store.s.voice = false;
    Store.save();
    toast(t('ex.listenOff'), 3000);
    done++; i++; show();
  });

  const finish = () => {
    state = 'over';
    const secs = Timer.stop();
    App.overlayCleanup = () => Voice.stop();
    const acc = right + wrong ? right / (right + wrong) : 1;
    const perfect = wrong === 0;
    const d = Store.data;
    let xp = meta.lesson ? (meta.lesson.kind === 'story' ? 15 : 10) : 8;
    if (perfect) xp += 5;
    xp = Store.addXp(xp);
    const coins = ACTIVITY_COINS;
    d.coins += coins;
    markActive();
    let mountain = null;
    if (meta.lesson) {
      const c = Store.course;
      const was = c.lessons[meta.lesson.id];
      c.lessons[meta.lesson.id] = { n: (was ? was.n : 0) + 1, at: today(), perfect: perfect || !!(was && was.perfect) };
      const m = meta.lesson.unit.mountain;
      if (!c.mountains[m.id] && mountainDone(m)) { c.mountains[m.id] = today(); mountain = m; }
    }
    // A whole mountain: a big pile of coins and XP, handed out on the reveal screen.
    const prize = mountain ? { coins: MOUNTAIN_COINS, xp: Store.addXp(MOUNTAIN_XP) } : null;
    // Finishing a practice earns a heart back.
    const heartBack = meta.practice ? Hearts.earn(1) : 0;
    if (prize) d.coins += prize.coins;
    d.sessions = (d.sessions || 0) + 1;
    Store.save();
    const mins = Math.max(1, Math.round(secs / 60));
    const weekPct = Math.min(100, Math.round((d.week.secs / goalSecs()) * 100));
    const host2 = App.openOverlay('results');
    const c0 = cast;
    host2.replaceChildren(h('div', { class: 'results' },
      castArt(c0.id, 'happy', 'res-cast'),
      h('h1', {}, perfect ? t('res.perfect') : meta.lesson ? t('res.done') : t('res.practiceDone')),
      h('div', { class: 'muted' }, meta.lesson ? `${meta.lesson.unit.title} · ${meta.lesson.kind === 'story' ? t('path.story') : t('path.lesson', { n: meta.lesson.n })}` : t('practice.' + meta.practice)),
      h('div', { class: 'res-stats' },
        stat('bolt', '+' + xp, t('res.xp'), Store.boosted() ? 'boost' : '', xp),
        stat('coin', '+' + coins, t('res.coins'), '', coins),
        stat('target', Math.round(acc * 100) + '%', t('res.accuracy')),
        stat('clock', t('res.mins', { n: mins }), t('res.time')),
        heartBack ? stat('heart', '+' + heartBack, t('hearts.word'), 'gold', heartBack) : null),
      h('div', { class: 'week-mini' },
        h('div', { class: 'wm-head' }, h('span', {}, t('home.weekGoal')), h('b', {}, t('home.minsOf', { n: Math.floor(d.week.secs / 60), goal: goalSecs() / 60 }))),
        h('div', { class: 'bar' }, h('i', { style: { width: weekPct + '%' } }))),
      h('button', { class: 'btn primary wide', onclick: () => proBreak(() => (mountain ? App.revealMountain(mountain, { prize }) : App.closeOverlay())) }, t('ex.continue'))));
    Sfx.fanfare();
    countStats(host2);
    const [cx, cy] = centerOf(host2.querySelector('.res-cast'));
    goldBurst(cx, cy, true);
    if (perfect) confetti(host2);
  };

  if (!queue.length) { App.closeOverlay(); toast(t('practice.nothing')); return; }
  show();
}

// A number with a label. n: count up to this number when it appears.
function stat(ic, value, label, cls = '', n = null) {
  return h('div', { class: 'stat ' + cls }, icon(ic), h('b', n == null ? {} : { 'data-n': n, 'data-pre': String(value).startsWith('+') ? '+' : '' }, value), h('small', {}, label));
}
// Counts up every stat on a results screen, one after another, with sparkle.
function countStats(root) {
  [...root.querySelectorAll('.stat b[data-n]')].forEach((b, k) => {
    b.textContent = b.dataset.pre + '0';
    setTimeout(() => {
      countUp(b, Number(b.dataset.n), { prefix: b.dataset.pre, ms: 700 });
      setTimeout(() => { const [x, y] = centerOf(b); goldBurst(x, y); Sfx.coin(); b.parentNode.classList.add('lit'); }, 720);
    }, 500 + k * 450);
  });
}
// "5 in a row!" — streak milestones in a lesson.
function comboPop(n) {
  const el = h('div', { class: 'combo-pop' }, t('ex.combo', { n }));
  document.body.append(el);
  setTimeout(() => el.remove(), 1400);
  if (n >= 5) setTimeout(() => Sfx.boom(), 120);
  Haptics.buzz([20, 40, 20]);
}

// Lessons need a heart to start (free players get 5 a day).
const openLesson = (lesson) => (Hearts.left() > 0 ? openSession(buildLessonQueue(lesson), { lesson }) : Hearts.sheet({ onRefill: () => openLesson(lesson) }));
const openPractice = (kind) => openSession(buildPracticeQueue(kind), { practice: kind });
