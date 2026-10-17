// Opens the app in a real browser, checks the word data, then plays every
// mini game for a few seconds with random taps and fails on any page error.
//
//   node spanish-adjectives/tests/smoke.mjs [--shots]
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, '..', 'web', 'index.html')).href;
const shots = process.argv.includes('--shots');
const PLAY_URL_FOR_TEST = 'https://olrock8910.github.io/Unknown-projects/adjetivos/';
const shotDir = path.join(here, '..', 'screenshots');
if (shots) fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForSelector('.game-card');

// ---- data integrity
const problems = await page.evaluate(() => {
  const out = [];
  const ids = new Set();
  for (const w of WORDS) {
    if (ids.has(w.id)) out.push('duplicate ' + w.id);
    ids.add(w.id);
    if (w.o && !WORD_BY_ID[w.o]) out.push(`${w.id}: opposite ${w.o} missing`);
    if (w.o && WORD_BY_ID[w.o] && WORD_BY_ID[w.o].o !== w.id) out.push(`${w.id}: opposite ${w.o} is not mutual`);
    if (!['pos', 'neg', 'look', 'feel'].includes(w.c)) out.push(`${w.id}: bad category`);
  }
  const emojis = new Map();
  for (const w of WORDS) {
    if (emojis.has(w.e)) out.push(`emoji ${w.e} used by ${emojis.get(w.e)} and ${w.id}`);
    emojis.set(w.e, w.id);
  }
  for (const d of DUAL_MEANINGS) if (!WORD_BY_ID[d.id]) out.push('dual ' + d.id + ' missing');
  for (const p of PACKS) if (WORDS.filter(p.test).length < 12) out.push('pack ' + p.id + ' too small');
  return out;
});
if (problems.length) { console.error('Data problems:\n  ' + problems.join('\n  ')); process.exit(1); }

if (shots) await page.screenshot({ path: path.join(shotDir, 'home.png') });
for (const tab of ['learn', 'words', 'me']) {
  await page.click(`#tabs button[data-tab=${tab}]`);
  await page.waitForTimeout(400);
  if (shots) await page.screenshot({ path: path.join(shotDir, `tab-${tab}.png`) });
}
await page.click('#tabs button[data-tab=learn]');
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

// Back button behaviour the Android wrapper relies on.
const back = await page.evaluate(() => {
  App.show('words');
  const a = appBack();
  const b = appBack();
  return [a, b, App.tab];
});
if (back[0] !== true || back[1] !== false || back[2] !== 'play') errors.push('appBack misbehaves: ' + JSON.stringify(back));

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
  await p.waitForSelector('.game-card');
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
    await p.evaluate(() => App.startGame(GAMES.find((g) => g.id === 'bubble')));
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
    await p.click('.prompt .replay-btn');
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
    if (!shared || !shared.includes(PLAY_URL_FOR_TEST) || !/scored/.test(shared)) errors.push('sharing a score failed: ' + shared);
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
