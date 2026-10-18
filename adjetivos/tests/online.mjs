// Plays an online match between two "phones" (separate browser contexts)
// through a PeerJS server on this machine, and fails on anything wrong.
//
//   node tests/online.mjs
import { chromium } from 'playwright';
import { PeerServer } from 'peer';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, '..', 'web', 'index.html')).href;
const PORT = 9123;
const server = PeerServer({ port: PORT, path: '/', host: '127.0.0.1' });

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  // Let the two pages reach each other directly on this machine.
  args: ['--disable-features=WebRtcHideLocalIpsWithMdns'],
});
const errors = [];
const logs = [];
const fail = (m) => { errors.push(m); };

async function phone(name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`[${name}] ${e.message}`));
  page.on('console', (m) => logs.push(`[${name}] ${m.text()}`));
  if (process.env.ONLINE_DEBUG) await page.addInitScript(() => { window.__ONLINE_DEBUG = true; });
  await page.addInitScript(([port, who]) => {
    window.ONLINE_SERVER = { host: '127.0.0.1', port, path: '/', secure: false, config: { iceServers: [] }, debug: window.__ONLINE_DEBUG ? 3 : 0 };
    window.ONLINE_TARGET = 2;
    localStorage.setItem('adjetivos.v1', JSON.stringify({ settings: { playerName: who, sound: false, vibrate: false, voice: false } }));
  }, [PORT, name]);
  await page.goto(url);
  await page.waitForSelector('.path-node');
  return page;
}

const until = async (page, fn, arg, what, ms = 15000) => {
  try { await page.waitForFunction(fn, arg, { timeout: ms }); } catch (e) { throw new Error('timed out waiting for ' + what); }
};
// The right answer on this phone's screen, or a wrong one.
const tap = (page, right) => page.evaluate((r) => {
  const shown = document.querySelector('.duel-prompt span:last-child').textContent;
  const btns = [...document.querySelectorAll('.duel-opt')];
  // Several words can share an English meaning; the right one is on screen.
  const word = WORDS.find((w) => w.short === shown && btns.some((b) => b.textContent === w.m));
  const btn = btns.find((b) => (b.textContent === word.m) === r);
  btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
}, right);
const scores = (page) => page.evaluate(() => [...document.querySelectorAll('.online-scores b')].map((b) => +b.textContent));
const roundShown = (page, n) => until(page, (k) => document.querySelectorAll('.duel-opt').length === 4 && document.querySelector('.online-status').textContent.startsWith('Tap') && window.__seen !== document.querySelector('.duel-prompt').textContent && (window.__seen = document.querySelector('.duel-prompt').textContent), n, 'round ' + n);

try {
  const ana = await phone('Ana');
  const ben = await phone('Ben');

  // Both open the Friends tab and get a code; Ben types Ana's.
  const myCode = async (page) => {
    await page.evaluate(() => App.show('friends'));
    await until(page, () => /^[A-Z0-9]{5}$/.test(document.querySelector('.online-hero .room-code')?.textContent || ''), null, 'a code');
    return page.textContent('.online-hero .room-code');
  };
  const typeCode = async (page, code) => {
    await page.fill('input[placeholder="Friend’s code"]', code.toLowerCase());
    await page.click('.oh-join button');
  };
  const anaCode = await myCode(ana);
  const benCode = await myCode(ben);
  if (anaCode === benCode) fail('both phones got the same code');
  await typeCode(ben, anaCode);

  // Both see each other's names, a countdown, then the same first word.
  await until(ana, () => /Ben/.test(document.querySelector('.online-scores')?.textContent || ''), null, 'Ana to see Ben');
  await until(ben, () => /Ana/.test(document.querySelector('.online-scores')?.textContent || ''), null, 'Ben to see Ana');
  await roundShown(ana, 1);
  await roundShown(ben, 1);
  const wordA = await ana.textContent('.duel-prompt');
  const wordB = await ben.textContent('.duel-prompt');
  if (wordA !== wordB) fail(`phones show different words: ${wordA} / ${wordB}`);

  // Round 1: Ben is right, Ana is wrong → point to Ben on both phones.
  await tap(ana, false);
  await tap(ben, true);
  await until(ben, () => /Point to you/.test(document.querySelector('.online-status').textContent), null, 'Ben scoring');
  if ((await scores(ben)).join() !== '1,0') fail('Ben sees ' + await scores(ben));
  await until(ana, () => /Point to Ben/.test(document.querySelector('.online-status').textContent), null, 'Ana seeing Ben score');
  if ((await scores(ana)).join() !== '0,1') fail('Ana sees ' + await scores(ana));

  // Round 2: both wrong → nobody scores.
  await roundShown(ana, 2);
  await roundShown(ben, 2);
  await tap(ana, false);
  await tap(ben, false);
  await until(ana, () => /Nobody/.test(document.querySelector('.online-status').textContent), null, 'nobody scoring');

  // Round 3: Ben right again → Ben wins (first to 2 in this test).
  await roundShown(ana, 3);
  await roundShown(ben, 3);
  await tap(ben, true);
  await until(ben, () => /You win/.test(document.querySelector('.duel-prompt').textContent), null, 'Ben winning');
  await until(ana, () => /Ben wins/.test(document.querySelector('.duel-prompt').textContent), null, 'Ana seeing Ben win');

  // Rematch: both ask, a new countdown starts with 0–0.
  await ana.click('button:has-text("Rematch")');
  await ben.click('button:has-text("Rematch")');
  await until(ana, () => [...document.querySelectorAll('.online-scores b')].every((b) => b.textContent === '0') && document.querySelector('.countdown'), null, 'rematch on Ana');
  await until(ben, () => [...document.querySelectorAll('.online-scores b')].every((b) => b.textContent === '0'), null, 'rematch on Ben');

  // Ben leaves → Ana is told; both are back with the same codes.
  await ben.evaluate(() => appBack());
  await until(ana, () => /Ben left the game/.test(document.querySelector('#overlay').textContent), null, 'Ana being told Ben left');
  await ana.click('button:has-text("Back")');
  if ((await myCode(ana)) !== anaCode) fail('Ana’s code changed after a game');

  // Both type each other's code at the same moment → still one game.
  await Promise.all([ana.evaluate((c) => Online.join(c), benCode), ben.evaluate((c) => Online.join(c), anaCode)]);
  await until(ana, () => /Ben/.test(document.querySelector('.online-scores')?.textContent || '') && document.querySelector('.countdown, .duel-opt'), null, 'crossed codes connecting Ana');
  await until(ben, () => /Ana/.test(document.querySelector('.online-scores')?.textContent || '') && document.querySelector('.countdown, .duel-opt'), null, 'crossed codes connecting Ben');
  await ana.evaluate(() => appBack());
  await until(ben, () => /Ana left the game/.test(document.querySelector('#overlay').textContent), null, 'Ben being told Ana left');
  await ben.click('button:has-text("Back")');

  // Ana is in a solo game: Ben is told she's busy.
  await ana.evaluate(() => App.startGame(GAMES.find((g) => g.id === 'quiz')));
  await typeCode(ben, anaCode);
  await until(ben, () => /Ana is busy/.test(document.querySelector('#overlay').textContent), null, 'busy message');
  if (await ana.evaluate(() => App.overlayKind) !== 'game') fail('Ana’s game was interrupted');
  await ben.click('button:has-text("Back")');

  // A code nobody is using.
  await typeCode(ben, 'ZZZZZ');
  await until(ben, () => /Nobody is using that code/.test(document.querySelector('#overlay').textContent), null, 'unknown code message');
} catch (e) {
  fail(e.message);
}

await browser.close();
server.close?.();
if (errors.length) {
  console.error('Online test failed:\n  ' + errors.join('\n  '));
  if (process.env.ONLINE_DEBUG) console.error(logs.slice(-60).join('\n'));
  process.exit(1);
}
console.log('Online test passed');
process.exit(0);
