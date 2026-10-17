// Takes the README screenshots (docs/screenshots/) from the real app, then
// builds the link-preview image web/og-image.png from them.
//
//   node promo/screenshots.mjs && python3 promo/og-image.py
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'screenshots');
fs.mkdirSync(out, { recursive: true });
const url = pathToFileURL(path.join(root, 'web', 'index.html')).href;

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 });
// A player with some progress, so the screens look lived-in.
await page.addInitScript(() => {
  localStorage.setItem('adjetivos.v1', JSON.stringify({
    xp: 740, played: 23, best: { bubble: 310, balloon: 240, whack: 280, quiz: 190, ninja: 260, memory: 220 },
    stars: { bubble: 3, balloon: 2, whack: 3, quiz: 2, ninja: 2, memory: 3, rain: 1, tf: 2 },
    mastery: {}, daily: { date: new Date().toISOString().slice(0, 10), xp: 42 },
    streak: { last: new Date().toISOString().slice(0, 10), n: 6 },
  }));
  Math.random = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
});
await page.goto(url);
await page.waitForSelector('.game-card');
const shot = (name) => page.screenshot({ path: path.join(out, name + '.jpg'), type: 'jpeg', quality: 86 });

await shot('home');

// Bubble Pop, caught just after a right answer so the big word shows.
await page.evaluate(() => App.startGame(GAMES.find((g) => g.id === 'bubble')));
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const target = document.querySelector('.prompt b').textContent;
  const w = WORDS.find((x) => x.short === target);
  const b = [...document.querySelectorAll('.bubble')].find((el) => el.textContent === w.m);
  if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
});
await page.waitForTimeout(420);
await shot('bubble-pop');
await page.evaluate(() => App.session.quit());

for (const [id, wait] of [['balloon', 2600], ['whack', 2200], ['ninja', 1900]]) {
  await page.evaluate((g) => App.startGame(GAMES.find((x) => x.id === g)), id);
  await page.waitForTimeout(wait);
  await shot(id);
  await page.evaluate(() => App.session.quit());
}

await page.evaluate(() => App.startGame(GAMES.find((g) => g.id === 'describe')));
await page.waitForTimeout(600);
await shot('describe');
await page.evaluate(() => App.session.quit());

await page.evaluate(() => App.startGame(GAMES.find((g) => g.id === 'builder')));
await page.waitForTimeout(600);
await shot('builder');
await page.evaluate(() => App.session.quit());

// Results with three stars.
await page.evaluate(() => {
  App.startGame(GAMES.find((g) => g.id === 'bubble'));
  const s = App.session;
  for (let i = 0; i < 20; i++) s.hit(WORDS[i], 10);
  s.flashWord = () => {};
  s.finish();
});
await page.waitForTimeout(1600);
await shot('results');

await browser.close();
console.log('screenshots written to', out);
