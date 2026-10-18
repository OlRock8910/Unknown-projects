// Opens the app in a real browser, checks the course and word data, climbs
// through lessons from every unit and plays every mini game for a few
// seconds with random taps, failing on any page error.
//
//   node spanish-adjectives/tests/smoke.mjs [--shots]
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, '..', 'web', 'index.html')).href;
const shots = process.argv.includes('--shots');
const APK_URL_FOR_TEST = 'https://github.com/OlRock8910/Unknown-projects/raw/main/adjetivos/apk/Adjetivos.apk';
const shotDir = path.join(here, '..', 'screenshots');
if (shots) fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// The Friends tab tries to go online; there is no game server in this test.
const offlineNoise = (t) => /peerjs|WebSocket|ERR_(NAME|CONNECTION|INTERNET|TUNNEL|PROXY)/i.test(t);
page.on('console', (m) => { if (m.type() === 'error' && !offlineNoise(m.text())) errors.push(m.text()); });
await page.goto(url);
await page.waitForSelector('.path-node');

// ---- data integrity
const problems = await page.evaluate(() => {
  const out = [];
  const ids = new Set();
  for (const w of WORDS) {
    if (ids.has(w.id)) out.push('duplicate ' + w.id);
    ids.add(w.id);
    if (w.o && !WORD_BY_ID[w.o]) out.push(`${w.id}: opposite ${w.o} missing`);
    if (w.o && WORD_BY_ID[w.o] && WORD_BY_ID[w.o].o !== w.id) out.push(`${w.id}: opposite ${w.o} is not mutual`);
    if (w.adj && !['pos', 'neg', 'look', 'feel'].includes(w.c)) out.push(`${w.id}: bad category`);
    if (!UNIT_BY_ID[w.unit]) out.push(`${w.id}: in no unit`);
    if (!w.e || !w.short || !w.bare) out.push(`${w.id}: missing emoji, meaning or bare form`);
    if (WORD_BY_ID[w.id] !== w) out.push(`${w.id}: not in WORD_BY_ID`);
  }
  // Within a unit (and among the adjectives) emojis and meanings must differ,
  // or picture questions would have two right answers.
  for (const group of [...COURSE.map((u) => u.items), WORDS.filter((w) => w.adj)]) {
    const emojis = new Map(), meanings = new Map();
    for (const w of group) {
      if (emojis.has(w.e)) out.push(`emoji ${w.e} used by ${emojis.get(w.e)} and ${w.id}`);
      if (meanings.has(w.short) && !(w.s && WORD_BY_ID[meanings.get(w.short)].s === w.s)) out.push(`meaning ${w.short} used by ${meanings.get(w.short)} and ${w.id}`);
      emojis.set(w.e, w.id);
      meanings.set(w.short, w.id);
    }
  }
  for (const u of COURSE) {
    if (u.items.length < 8) out.push(`unit ${u.id} has only ${u.items.length} words`);
    if (!u.adjectives && (u.phrases || []).length < 4) out.push(`unit ${u.id} needs at least 4 sentences`);
    for (const k of u.grammar || []) if (!GRAMMAR_TIPS[k]) out.push(`unit ${u.id}: no grammar tip ${k}`);
    for (const l of unitLessons(u)) if (!l.words.length) out.push(`${l.id}: no words`);
  }
  const lessonIds = ALL_LESSONS().map((l) => l.id);
  if (new Set(lessonIds).size !== lessonIds.length) out.push('lesson ids repeat');
  for (const d of DUAL_MEANINGS) if (!WORD_BY_ID[d.id]) out.push('dual ' + d.id + ' missing');
  for (const p of PACKS) if (p.id !== 'mine' && WORDS.filter(p.test).length < 8) out.push('pack ' + p.id + ' too small');
  return out;
});
if (problems.length) { console.error('Data problems:\n  ' + problems.join('\n  ')); process.exit(1); }

if (shots) await page.screenshot({ path: path.join(shotDir, 'home.png') });

// ---- lessons: the first lesson and the review of every unit, answered at random
async function playLesson(start) {
  await page.evaluate(start);
  for (let step = 0; step < 400; step++) {
    const st = await page.evaluate(() => {
      if (App.overlayKind !== 'lesson' || !document.querySelector('.lesson')) return 'over';
      const opts = [...document.querySelectorAll('.ls-opt')];
      if (opts.length && !document.querySelector('.ls-opt.sel')) pickOne(opts).click();
      for (const t of [...document.querySelectorAll('.ls-bank .ls-tile:not(.used)')].slice(0, 4)) t.click();
      for (const t of document.querySelectorAll('.ls-body .tile:not(.used)')) t.click();
      const inp = document.querySelector('.ls-input');
      if (inp && !inp.value) { inp.value = pickOne(['perro', WORDS[0].m]); inp.dispatchEvent(new Event('input')); }
      const L = [...document.querySelectorAll('.match-item.es:not(.done)')], R = [...document.querySelectorAll('.match-item.en:not(.done)')];
      if (L.length) { L[0].click(); pickOne(R).click(); }
      if (/\b(null|undefined|NaN)\b/.test(document.querySelector('.lesson').innerText)) return 'stray';
      const m = document.querySelector('.ls-main');
      if (m && !m.disabled && m.offsetParent) m.click();
      return 'ok';
    });
    if (st === 'over') return true;
    if (st === 'stray') { errors.push('"null"/"undefined" shown in a lesson'); return false; }
    await page.waitForTimeout(st === 'ok' ? 40 : 0);
  }
  return false;
}
let lessonsPlayed = 0;
for (const uid of await page.evaluate(() => COURSE.map((u) => u.id))) {
  for (const which of ['first', 'review']) {
    const lid = await page.evaluate(([u, w]) => { const ls = unitLessons(UNIT_BY_ID[u]); return (w === 'first' ? ls[0] : ls.at(-1)).id; }, [uid, which]);
    await page.evaluate(() => { if (App.overlayKind) App.closeOverlay(); });
    const ok = await playLesson(`openLesson(LESSON_BY_ID()['${lid}'])`);
    // The lesson either finished on the results screen or was still going after 400 taps.
    const result = await page.evaluate((id) => [App.overlayKind, !!document.querySelector('.results'), lessonDone(id)], lid);
    if (!result[1] || !result[2]) errors.push(`lesson ${lid} did not finish: ${JSON.stringify(result)} (${ok})`);
    lessonsPlayed++;
  }
}
await page.evaluate(() => App.closeOverlay());
console.log(`  ok ${lessonsPlayed} lessons`);
if (shots) await page.screenshot({ path: path.join(shotDir, 'mountain.png') });

// The path: open lessons, locked ones, and jumping ahead.
const pathCheck = await page.evaluate(() => {
  const out = [];
  localStorage.removeItem(Store.KEY); Store.load(); App.show('learn');
  const nodes = [...document.querySelectorAll('.path-node')];
  if (nodes.length !== ALL_LESSONS().length) out.push(`${nodes.length} nodes for ${ALL_LESSONS().length} lessons`);
  if (!nodes[0].classList.contains('current') || !nodes[1].classList.contains('locked')) out.push('first lesson not current, or second not locked');
  nodes[1].click();
  if (App.overlayKind) out.push('a locked lesson opened');
  document.querySelector('.continue-hero').click();
  if (App.overlayKind !== 'lesson') out.push('Start did not open the first lesson');
  App.closeOverlay();
  return out;
});
errors.push(...pathCheck);
const jumped = await playLesson(`openJump(UNIT_BY_ID['food'])`);
const jump = await page.evaluate(() => {
  const hearts = document.querySelector('.results') && /Out of hearts/.test(document.querySelector('.results').textContent);
  return { hearts, open: lessonOpen(unitLessons(UNIT_BY_ID.food)[0]), colours: lessonDone('colours-review') };
});
// Random answers usually run out of hearts; when they pass, everything before food is done.
if (!jumped || (!jump.hearts && !(jump.open && jump.colours))) errors.push('jump test misbehaved: ' + JSON.stringify(jump));
await page.evaluate(() => {
  App.closeOverlay();
  const c = courseData();
  for (const l of ALL_LESSONS()) { if (l.unit.id === 'food') break; c[l.id] = { n: 1 }; }
  App.show('learn');
});
if (!(await page.evaluate(() => lessonOpen(unitLessons(UNIT_BY_ID.food)[0]) && /Higher than Ben Nevis/.test(document.querySelector('.mountain').textContent)))) errors.push('climbing past Ben Nevis is not shown');
await page.evaluate(() => { localStorage.removeItem(Store.KEY); Store.load(); App.show('learn'); });

for (const tab of ['play', 'friends', 'words', 'me']) {
  await page.click(`#tabs button[data-tab=${tab}]`);
  await page.waitForTimeout(400);
  if (shots) await page.screenshot({ path: path.join(shotDir, `tab-${tab}.png`) });
}
await page.click('#tabs button[data-tab=words]');
await page.click('.flash-start');
await page.waitForSelector('.fc');
await page.click('.fc');
await page.waitForTimeout(600);
if (shots) await page.screenshot({ path: path.join(shotDir, 'flashcard.png') });
for (let k = 0; k < 25 && await page.$('.fc'); k++) await page.click('.flash-btns .btn.primary').catch(() => {});
await page.evaluate(() => App.closeOverlay());
await page.click('#tabs button[data-tab=play]');

const ids = await page.evaluate(() => GAMES.map((g) => g.id));
console.log(`${ids.length} games:`, ids.join(', '));

for (const id of ids) {
  await page.evaluate((gid) => App.startGame(GAMES.find((g) => g.id === gid)), id);
  await page.waitForTimeout(700);
  const t0 = Date.now();
  let shot = false;
  while (Date.now() - t0 < 5000) {
    if (await page.evaluate(() => App.overlayKind !== 'game')) break;
    // Prefer the correct answer half the time, so games actually progress.
    await page.evaluate(() => {
      const st = document.querySelector('.stage');
      if (!st) return;
      const clickable = [...st.querySelectorAll('button, .hole, .mcard')].filter((b) => !b.disabled && b.offsetParent);
      if (!clickable.length) return;
      const el = pickOne(clickable);
      const r = el.getBoundingClientRect();
      const opts = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1 };
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.click();
    });
    await page.waitForTimeout(140);
    const stray = await page.evaluate(() => /\b(null|undefined|NaN)\b/.test(document.querySelector('.stage')?.innerText || ''));
    if (stray) errors.push(`${id}: "null"/"undefined" shown on screen`);
    if (shots && !shot && Date.now() - t0 > 1500) {
      await page.screenshot({ path: path.join(shotDir, `game-${id}.png`) });
      shot = true;
    }
  }
  // End the round through the normal results path.
  await page.evaluate(() => { if (App.session) App.session.finish(); });
  await page.waitForTimeout(300);
  const kind = await page.evaluate(() => App.overlayKind);
  if (kind !== 'results') errors.push(`${id}: expected results screen, got ${kind}`);
  if (shots && id === 'bubble') await page.screenshot({ path: path.join(shotDir, 'results.png') });
  await page.evaluate(() => App.closeOverlay());
  console.log('  ok', id);
}

// A right answer shows the word big: Spanish (in the form used) and English.
const flash = await page.evaluate(() => {
  App.startGame(GAMES.find((g) => g.id === 'quiz'));
  const w = WORD_BY_ID['amable'];
  App.session.hit(w, 10, null, { form: 'amable' });
  const el = document.querySelector('.word-flash');
  const out = el && [el.querySelector('.wf-es').textContent, el.querySelector('.wf-en').textContent];
  App.session.quit();
  return out;
});
if (!flash || flash[0] !== 'AMABLE' || flash[1] !== 'KIND') errors.push('right answer did not flash the word: ' + JSON.stringify(flash));

// ---- playing with friends
const friends = await page.evaluate(async () => {
  const out = [];
  const code = Challenge.encode('quiz', 123456, 230);
  const d = Challenge.decode(' ' + code.toLowerCase() + ' ');
  if (code !== 'QUIZ-2N9C-230' || !d || d.game.id !== 'quiz' || d.seed !== 123456 || d.target !== 230) out.push('code round trip: ' + code + ' ' + JSON.stringify(d && { g: d.game.id, s: d.seed, t: d.target }));
  if (Challenge.decode('hello') || Challenge.decode('nogame-12-3')) out.push('bad codes accepted');
  // The same code deals the same questions on every phone.
  const realRandom = Math.random;
  const deal = () => {
    App.startGame(GAMES.find((g) => g.id === 'quiz'), { seed: 99, target: 100 });
    const text = document.querySelector('.q-card').textContent + '|' + [...document.querySelectorAll('.choice')].map((c) => c.textContent).join(',');
    App.session.quit();
    return text;
  };
  Store.data.mastery = { molesto: 5 };
  const a = deal();
  Store.data.mastery = {};
  const b = deal();
  if (a !== b) out.push('same code dealt different questions');
  if (Math.random !== realRandom || Challenge.active) out.push('Math.random not restored after a challenge');
  // Friends tab → challenge code → game → results with the comparison.
  openFriends();
  if (App.tab !== 'friends' || !document.querySelector('.online-hero')) out.push('friends tab did not open');
  document.querySelector('input[placeholder^="e.g. QUIZ"]').value = 'emoji-1a2b-5';
  [...document.querySelectorAll('.page .btn.primary')].find((x) => /challenge/i.test(x.textContent)).click();
  if (App.overlayKind !== 'game' || !Challenge.active || Challenge.active.target !== 5) out.push('challenge code did not start the game');
  App.session.hit(WORDS[0], 10);
  App.session.finish();
  const v = document.querySelector('.versus');
  if (!v || !/You win/.test(v.textContent)) out.push('no win/lose comparison after a challenge: ' + (v && v.textContent));
  if (!/Send my score back/.test(document.querySelector('.results').textContent)) out.push('no "send my score back"');
  App.closeOverlay();
  // Duel: a right tap scores, the back button returns to the friends screen.
  openDuel();
  const p0 = document.querySelector('.duel-half.p0');
  const answer = WORDS.find((w) => w.short === p0.querySelector('.duel-prompt').textContent.replace(/^\S+\s*/, '').trim() || p0.querySelector('.duel-prompt span:last-child').textContent === w.short);
  const right = [...p0.querySelectorAll('.duel-opt')].find((b) => b.textContent === answer.m);
  right.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  if (p0.querySelector('.duel-score').textContent !== '1') out.push('duel point not scored');
  appBack();
  if (App.overlayKind || App.tab !== 'friends') out.push('back from duel did not return to the friends tab: ' + App.overlayKind + ' ' + App.tab);
  // The home screen has a big way in.
  App.show('play');
  document.querySelector('.friends-hero').click();
  if (App.tab !== 'friends') out.push('home "Play with friends" did not open the friends tab');
  App.show('play');
  return out;
});
errors.push(...friends);

// Back button behaviour the Android wrapper relies on.
const back = await page.evaluate(() => {
  App.show('words');
  const a = appBack();
  const b = appBack();
  return [a, b, App.tab];
});
if (back[0] !== true || back[1] !== false || back[2] !== 'learn') errors.push('appBack misbehaves: ' + JSON.stringify(back));

// The Android voice bridge, faked: first with no Spanish voice, then with Google's.
for (const state of ['missing', 'ok']) {
  const p = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2 });
  p.on('pageerror', (e) => errors.push(`[native ${state}] ${e.message}`));
  await p.addInitScript((st) => {
    window.__spoken = [];
    window.__installs = 0;
    let current = st === 'ok' ? 'es-es-x-eea-local' : '';
    window.__said = [];
    window.Native = {
      speak: (t) => window.__spoken.push(t),
      speakIn: (t, rate, lang, queue) => { window.__said.push({ text: t, rate, lang, queue }); if (lang === 'es') window.__spoken.push(t); },
      stop: () => {},
      vibrate: () => {},
      ttsState: () => st,
      setVoice: (n) => { if (st === 'ok') current = n; },
      installVoice: () => { window.__installs++; },
      openTtsSettings: () => {},
      share: (t) => { window.__shared = t; },
      voiceInfo: () => JSON.stringify({
        google: true, current,
        voices: st === 'ok' ? [
          { name: 'es-es-x-eea-local', locale: 'es-ES', quality: 400 },
          { name: 'es-es-x-eed-local', locale: 'es-ES', quality: 400 },
          { name: 'es-us-x-esc-local', locale: 'es-US', quality: 400 },
        ] : [],
      }),
    };
  }, state);
  await p.goto(url);
  await p.waitForSelector('.path-node');
  const banner = await p.$('.voice-banner');
  if (state === 'missing') {
    if (!banner) errors.push('no "get the Google voice" banner when the voice is missing');
    else {
      await banner.click();
      if (await p.evaluate(() => window.__installs) !== 1) errors.push('banner did not ask Android to install the voice');
    }
  } else {
    if (banner) errors.push('voice banner shown although a voice is installed');
    await p.click('#tabs button[data-tab=me]');
    const opts = await p.$$('.voice-opt');
    if (opts.length !== 3) errors.push(`expected 3 voice options, got ${opts.length}`);
    await opts[1].click();
    await p.waitForTimeout(300);
    const res = await p.evaluate(() => [Store.s.voiceName, window.__spoken.slice(-1)[0], document.querySelector('.voice-opt.on')?.textContent]);
    if (res[0] !== 'es-es-x-eed-local' || !res[1] || !/voice 2/.test(res[2] || '')) errors.push('voice picker misbehaves: ' + JSON.stringify(res));
    if (shots) await p.screenshot({ path: path.join(shotDir, 'voice-picker.png'), fullPage: true });
    await p.click('#tabs button[data-tab=play]');
    await p.evaluate(() => { Store.s.pack = 'neg'; App.startGame(GAMES.find((g) => g.id === 'bubble')); }); // one-word adjectives
    await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelector('.bubble') && Voice.say('molesto'));
    if (!(await p.evaluate(() => window.__spoken.includes('molesto')))) errors.push('speech did not reach the Android bridge');
    // Each target is said as one Spanish word, slowly, and 🔊 says it again.
    const said = await p.evaluate(() => window.__said);
    if (said.some((x) => x.lang !== 'es')) errors.push('something was spoken in English: ' + JSON.stringify(said));
    const first = said[0];
    if (!first || /\s/.test(first.text)) errors.push('bubble task was not a single Spanish word: ' + JSON.stringify(said));
    else if (!(first.rate < 0.9)) errors.push('single words are not spoken slowly: rate ' + first.rate);
    const before = said.length;
    await p.evaluate(() => document.querySelector('.prompt .replay-btn').click()); // the prompt can be replaced mid-click
    const after = await p.evaluate(() => window.__said);
    const last = said[said.length - 1];
    if (after.length <= before || after[after.length - 1].text !== last.text) errors.push('🔊 did not repeat the word');
    await p.evaluate(() => App.session.quit());
    // A quiz question is read out, and "hear it again" stops the auto-advance.
    await p.evaluate(() => App.startGame(GAMES.find((g) => g.id === 'quiz')));
    await p.waitForTimeout(300);
    const qSaid = await p.evaluate(() => window.__said.slice(-2).map((x) => x.lang));
    if (!qSaid.includes('es')) errors.push('quiz word was not read aloud');
    await p.click('.choice');
    await p.waitForTimeout(200);
    const hear = await p.$('.feedback button');
    if (hear) {
      await hear.click();
      await p.waitForTimeout(2800);
      if (!(await p.$('.feedback.show'))) errors.push('hearing the answer again did not pause the quiz');
    }
    await p.evaluate(() => App.session.quit());
    // "Challenge a friend" hands the score and the play link to Android's share sheet.
    const shared = await p.evaluate(() => {
      App.startGame(GAMES.find((g) => g.id === 'tf'));
      App.session.hit(WORDS[0], 10);
      App.session.finish();
      document.querySelector('.btn.share').click();
      return window.__shared;
    });
    if (!shared || !shared.includes(APK_URL_FOR_TEST) || !/scored/.test(shared) || !/Challenge code: TF-[0-9A-Z]+-\d+/.test(shared)) errors.push('sharing a score failed: ' + shared);
    await p.evaluate(() => App.closeOverlay());
  }
  if (shots && state === 'missing') await p.screenshot({ path: path.join(shotDir, 'voice-banner.png') });
  await p.close();
  console.log('  ok native voice:', state);
}

await browser.close();
if (errors.length) {
  console.error('Errors:\n  ' + [...new Set(errors)].join('\n  '));
  process.exit(1);
}
console.log('Smoke test passed');
