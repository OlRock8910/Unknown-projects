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

// Back button behaviour the Android wrapper relies on.
const back = await page.evaluate(() => {
  App.show('words');
  const a = appBack();
  const b = appBack();
  return [a, b, App.tab];
});
if (back[0] !== true || back[1] !== false || back[2] !== 'play') errors.push('appBack misbehaves: ' + JSON.stringify(back));

await browser.close();
if (errors.length) {
  console.error('Errors:\n  ' + [...new Set(errors)].join('\n  '));
  process.exit(1);
}
console.log('Smoke test passed');
