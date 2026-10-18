// The course for the language pair being learned: words and sentences from
// LP_COURSE (course/*.js), lessons, spaced repetition and progress.
//
// How it teaches (what memory research says works best):
//  - Spaced repetition: every word has a box 0–5. Getting it right moves it up
//    and it comes back later (1, 3, 7, 16, 35 days); getting it wrong drops
//    it so it comes back soon. Reviews show up just before you'd forget.
//  - Retrieval practice: you're asked to recall words, not just re-read them,
//    starting with recognising them and moving on to producing them yourself
//    as they get easier (desirable difficulty).
//  - Dual coding: words come with sound (and pictures where there are some).
//  - Interleaving: reviews mix words from different units.
//  - Comprehensible input: the cast say whole sentences for you to decode.

const LANGS = ['en', 'es', 'fr', 'de', 'pt'];
const ARTICLES = { es: 'el|la|los|las', fr: 'le|la|les', de: 'der|die|das', pt: 'o|a|os|as' };
const BOX_DAYS = [0, 1, 3, 7, 16, 35];
const MASTERED_BOX = 4;

// The first form is the one shown; the others are accepted too.
const firstForm = (s) => String(s).split('|')[0];
const allForms = (s) => String(s).split('|');

let C = null; // the built course for the current pair

// Builds words, sentences and lessons for native → target.
function buildCourse() {
  const nat = Store.data.native, tgt = Store.data.target;
  const words = [], byId = {}, units = [], lessons = [];
  LP_COURSE.forEach((m, mi) => {
    m.index = mi;
    m.units.forEach((u, ui) => {
      const unit = { id: `${m.id}.${u.id}`, key: u.id, mountain: m, n: ui, title: u.title[nat] || u.title.en, titleT: u.title[tgt], words: [], sentences: [] };
      u.words.forEach((raw) => {
        const w = {
          id: raw.id, k: raw.k, unit,
          t: firstForm(raw[tgt]), tAll: allForms(raw[tgt]),
          n: firstForm(raw[nat]), nAll: allForms(raw[nat]),
          raw,
        };
        // Spelling and typing work on the word without its article.
        // Only the language's own articles, followed by a space (or French l'):
        // "adiós" is not "a" + "diós", and Spanish "a la derecha" keeps its "a".
        const arts = ARTICLES[tgt];
        w.bare = arts ? w.t.replace(new RegExp(`^(${arts})\\s+(?=\\S)`, 'i'), '').replace(tgt === 'fr' ? /^l['’]/i : /^$/, '') : w.t;
        w.art = w.t === w.bare ? null : w.t.slice(0, w.t.length - w.bare.length).trim();
        if (byId[w.id]) w.id = `${unit.key}.${w.id}`; // keep ids unique even if two units share a word
        byId[w.id] = w;
        words.push(w);
        unit.words.push(w);
      });
      u.sentences.forEach((s, si) => unit.sentences.push({ id: `${unit.id}.s${si}`, t: s[tgt], n: s[nat], unit }));
      // Three lessons of four new words, then a story with the unit's sentences.
      for (let k = 0; k < 3; k++) lessons.push({ id: `${unit.id}.${k + 1}`, kind: 'learn', unit, n: k + 1, words: unit.words.slice(k * 4, k * 4 + 4) });
      lessons.push({ id: `${unit.id}.story`, kind: 'story', unit, n: 4, words: unit.words });
      unit.lessons = lessons.slice(-4);
      units.push(unit);
    });
  });
  C = { nat, tgt, words, byId, units, lessons, lessonById: Object.fromEntries(lessons.map((l) => [l.id, l])) };
  return C;
}

// ------------------------------------------------------------------ progress
const lessonDone = (id) => !!Store.course.lessons[id];
function lessonOpen(lesson) {
  const i = C.lessons.indexOf(lesson);
  return i <= 0 || lessonDone(C.lessons[i - 1].id) || lessonDone(lesson.id);
}
const nextLesson = () => C.lessons.find((l) => !lessonDone(l.id)) || null;
const mountainUnits = (m) => C.units.filter((u) => u.mountain === m);
const mountainDone = (m) => mountainUnits(m).every((u) => u.lessons.every((l) => lessonDone(l.id)));
const unitDone = (u) => u.lessons.every((l) => lessonDone(l.id));
const currentMountain = () => LP_COURSE.find((m) => !mountainDone(m)) || null;

// ------------------------------------------------------------------ spaced repetition
const wordState = (id) => Store.course.words[id] || null;
function seeWord(w) {
  const ws = Store.course.words;
  if (!ws[w.id]) ws[w.id] = { box: 0, due: Date.now(), right: 0, wrong: 0, seen: Date.now() };
}
// Records an answer for w and schedules its next review.
function gradeWord(w, ok) {
  seeWord(w);
  const s = Store.course.words[w.id];
  if (ok) {
    s.right++;
    // Only move up a box once the word is due, so cramming doesn't count double.
    if (Date.now() >= s.due - 6 * 36e5 || s.box === 0) s.box = Math.min(5, s.box + 1);
    s.due = Date.now() + BOX_DAYS[s.box] * DAY;
  } else {
    s.wrong++;
    s.box = Math.max(1, s.box - 2);
    s.due = Date.now() + 10 * 60e3;
  }
  s.last = Date.now();
}
const learnedWords = () => C.words.filter((w) => wordState(w.id));
const dueWords = () => learnedWords().filter((w) => wordState(w.id).due <= Date.now()).sort((a, b) => wordState(a.id).due - wordState(b.id).due);
// The words you find hardest, for "weak words" practice.
const weakWords = () => learnedWords().sort((a, b) => {
  const sa = wordState(a.id), sb = wordState(b.id);
  return (sa.box - sb.box) || ((sb.wrong - sb.right) - (sa.wrong - sa.right));
});

// How far through the course you are.
function courseStats() {
  if (!C) return { words: 0, mastered: 0, pct: 0, lessons: 0 };
  const learned = learnedWords();
  const done = C.lessons.filter((l) => lessonDone(l.id)).length;
  return {
    words: learned.length,
    mastered: learned.filter((w) => wordState(w.id).box >= MASTERED_BOX).length,
    total: C.words.length,
    lessons: done,
    lessonsTotal: C.lessons.length,
    pct: Math.floor((done / C.lessons.length) * 100),
    due: dueWords().length,
    mountains: LP_COURSE.filter(mountainDone).length,
  };
}

// Wrong answers for w: same kind, from its unit first, never one that means the same.
function distractorsFor(w, n, pool) {
  const clash = (a, b) => a.id === b.id || normText(a.t) === normText(b.t) || normText(a.n) === normText(b.n);
  const out = [];
  const sameKind = (d) => d.k === w.k || (w.k === 'phr' && d.k !== 'n');
  const cands = [...shuffle(pool || []), ...shuffle(w.unit.words), ...shuffle(w.unit.mountain === LP_COURSE[0] ? C.words.slice(0, 60) : C.words.filter((x) => x.unit.mountain === w.unit.mountain)), ...shuffle(C.words)];
  for (const d of cands) {
    if (out.length >= n) break;
    if (!clash(d, w) && sameKind(d) && out.every((o) => !clash(o, d))) out.push(d);
  }
  for (const d of cands) {
    if (out.length >= n) break;
    if (!clash(d, w) && out.every((o) => !clash(o, d))) out.push(d);
  }
  return out;
}

// Splits a sentence into word tiles (punctuation dropped).
const tokens = (s) => String(s).replace(/[¿?¡!.,;:"“”«»]/g, ' ').split(/\s+/).filter(Boolean);
