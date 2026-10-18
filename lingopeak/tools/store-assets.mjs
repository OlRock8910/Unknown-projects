// Google Play listing pictures: node tools/store-assets.mjs [out dir]
// → feature-graphic.png (1024×500) and phone screenshots (1080×1920, a
// headline above a real screen of the app). The 512×512 icon comes from
// make-icon.py (--play).
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(root, 'docs', 'play'));
const url = pathToFileURL(path.join(root, 'web', 'index.html')).href;
const img = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
const webp = (p) => 'data:image/webp;base64,' + fs.readFileSync(path.join(root, 'web', 'img', p)).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The app's own font, embedded so the pages need no internet.
const FONT = `<style>@font-face{font-family:Nunito;font-weight:200 1000;src:url(data:font/woff2;base64,${fs.readFileSync(path.join(root, 'web', 'fonts', 'nunito-latin-wght-normal.woff2')).toString('base64')}) format('woff2')}</style>`;
fs.mkdirSync(OUT, { recursive: true });

const SEED = {
  epoch: 2, profile: { name: 'Mia', joined: '2026-09-01', banner: 'blue', look: { skin: 1, hair: 1, hairColor: 2, hat: 'cap', top: 'star', pants: 'jeans' } },
  native: 'en', target: 'es', coins: 640, xp: 1520,
  weekStreak: { n: 4, last: null, best: 4 },
  settings: { theme: 'light', sound: false, vibrate: false, voice: false },
};

// Each screen: a headline, and how to get the app to show it.
const SHOTS = [
  ['01-mountain', 'Climb a mountain.<br>Learn a language.', async (p) => {
    await p.evaluate(() => { C.lessons.slice(0, 11).forEach((l) => { Store.course.lessons[l.id] = { n: 1 }; l.words.forEach((w) => { seeWord(w); gradeWord(w, true); }); }); Store.data.week.secs = 13 * 60; markActive(); Store.save({ quiet: true }); App.show('learn'); });
    await sleep(900);
  }],
  ['02-decode', 'Costumed characters talk.<br>You decode them.', async (p) => {
    await p.evaluate(() => { const s = C.units[0].sentences.find((x) => x.t.split(' ').length <= 4); openSession([{ kind: 'decode', sentence: s, gen: () => EX.decode(s) }], { lesson: C.lessons[0] }); });
    await sleep(700);
    await p.click('.bubble-text .tw >> nth=0');
    await sleep(500);
  }],
  ['03-correct', 'Right answers ring out<br>in gold.', async (p) => {
    await p.evaluate(() => { const u = C.units[0], w = u.words[2]; window.__w = w; openSession([{ kind: 'meaning', word: w, gen: () => EX.meaning(w, { words: u.words }) }], { lesson: C.lessons[0] }); });
    await sleep(700);
    await p.evaluate(() => { [...document.querySelectorAll('.opt')].find((b) => b.opt === window.__w).click(); document.querySelector('.ses-foot .btn.primary').click(); });
    await sleep(700);
  }],
  ['04-speak', 'Say it out loud.<br>The app listens.', async (p) => {
    await p.evaluate(() => { window.__fakeMic = () => new Promise(() => {}); const s = C.units[0].sentences[0]; openSession([{ kind: 'speak', sentence: s, gen: () => EX.speak(s) }], { lesson: C.lessons[0] }); });
    await sleep(600);
    await p.click('.mic-btn');
    await p.evaluate(() => { document.querySelector('.heard').textContent = 'Hola, soy…'; });
    await sleep(500);
  }],
  ['05-badge', 'Finish a mountain,<br>earn its badge.', async (p) => {
    await p.evaluate(() => { Store.course.mountains.snowdon = today(); Store.save({ quiet: true }); App.revealMountain(LP_COURSE[0], { prize: { coins: 300, xp: 500 } }); });
    await sleep(3150);
  }],
  ['06-wardrobe', 'Dress up your climber.', async (p) => {
    await p.evaluate(() => { Store.data.wardrobe = ['hat:crown', 'top:gold', 'pants:check']; Store.data.profile.look = { ...Store.data.profile.look, hat: 'crown', top: 'gold', pants: 'check' }; Store.save({ quiet: true }); App.show('shop'); const b = document.querySelector('.builder-wrap'); document.querySelector('#view').scrollTop = b.offsetTop - 70; });
    await sleep(900);
  }],
  ['07-rewards', 'Daily chests, streaks<br>and achievements.', async (p) => {
    await p.evaluate(() => { C.lessons.slice(0, 11).forEach((l) => { Store.course.lessons[l.id] = { n: 1, perfect: true }; l.words.forEach((w) => { seeWord(w); gradeWord(w, true); }); }); Store.data.weekStreak = { n: 4, last: weekId(), best: 4 }; Store.save({ quiet: true }); Achievements.check(); Achievements.queue = []; App.show('awards'); });
    await sleep(900);
  }],
  ['08-goal', 'Just 20 minutes a week.', async (p) => {
    await p.evaluate(() => { Onboarding.start(); Onboarding.draft.target = 'es'; Onboarding.go(4); });
    await sleep(900);
  }],
];

const browser = await chromium.launch();
// 1. The real screens, at phone size.
const screens = {};
for (const [name, , run] of SHOTS) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  ${name}: ${e.message}`));
  await page.addInitScript((seed) => { window.CLOUD_OVERRIDE = { url: '', anonKey: '' }; seed.weekStreak.last = null; localStorage.setItem('lingopeak.v1', JSON.stringify(seed)); }, SEED);
  await page.goto(url);
  await page.waitForSelector('#tabs:not([hidden])');
  await page.addStyleTag({ content: '.ach-banner, .toast { display: none !important; }' });
  await run(page);
  const file = path.join(OUT, `.screen-${name}.png`);
  await page.screenshot({ path: file });
  screens[name] = file;
  await ctx.close();
}

// 2. Each screen in a frame with its headline.
const frame = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
const colours = ['#2F5BEA', '#FFC531', '#FF5A4E'];
for (const [i, [name, headline]] of SHOTS.entries()) {
  const bg = colours[i % 3], ink = bg === '#FFC531' ? '#1B1D2A' : '#FFFFFF';
  await frame.setContent(`<html><head>${FONT}</head>
    <body style="margin:0;width:1080px;height:1920px;background:${bg};font-family:Nunito,sans-serif;overflow:hidden;position:relative">
      <div style="position:absolute;top:110px;left:70px;right:70px;text-align:center;color:${ink};font-size:68px;font-weight:900;line-height:1.14">${headline}</div>
      <img src="${img(screens[name])}" style="position:absolute;left:150px;top:440px;width:780px;border-radius:56px;box-shadow:0 30px 80px rgba(0,0,0,.28);border:14px solid #1B1D2A">
    </body></html>`);
  await frame.waitForTimeout(600);
  await frame.screenshot({ path: path.join(OUT, `screenshot-${name}.png`) });
  fs.rmSync(screens[name]);
}

// 3. The feature graphic.
const fg = await browser.newPage({ viewport: { width: 1024, height: 500 } });
await fg.setContent(`<html><head>${FONT}</head>
  <body style="margin:0;width:1024px;height:500px;background:linear-gradient(160deg,#3a68f0,#2F5BEA 55%,#2449c8);font-family:Nunito,sans-serif;overflow:hidden;position:relative">
    <svg style="position:absolute;right:-40px;bottom:-10px" width="620" height="330" viewBox="0 0 620 330"><path d="M0 330 L250 60 L340 170 L410 100 L620 330Z" fill="#ffffff" opacity=".14"/></svg>
    <div style="position:absolute;left:64px;top:118px;color:#fff">
      <div style="display:flex;align-items:center;gap:16px;font-size:74px;font-weight:900;letter-spacing:.5px">
        <svg width="74" height="74" viewBox="0 0 40 40"><path d="M3 34 16 10l6 10 5-7 10 21z" fill="#fff"/><path d="m16 10 4 7.5-4-1.5-4 2z" fill="#DCE6FF"/><path d="M16 10V2l7 3-7 3" fill="#FF5A4E"/></svg>Lingo Peak</div>
      <div style="margin-top:14px;font-size:34px;font-weight:800;line-height:1.25;max-width:470px">Climb ten mountains.<br>Learn a language<br>on the way up.</div>
      <div style="margin-top:22px;display:flex;gap:10px;font-size:20px;font-weight:900">${['EN', 'ES', 'FR', 'DE', 'PT'].map((l) => `<span style="background:#fff;color:#2F5BEA;border-radius:10px;padding:5px 11px">${l}</span>`).join('')}</div>
    </div>
    <img src="${webp('cast/banana-happy.webp')}" style="position:absolute;right:300px;bottom:24px;height:300px">
    <img src="${webp('cast/shark.webp')}" style="position:absolute;right:160px;bottom:18px;height:330px">
    <img src="${webp('cast/dino-happy.webp')}" style="position:absolute;right:20px;bottom:24px;height:300px">
  </body></html>`);
await fg.waitForTimeout(800);
await fg.screenshot({ path: path.join(OUT, 'feature-graphic.png') });
await browser.close();
console.log('  pictures in ' + OUT);
