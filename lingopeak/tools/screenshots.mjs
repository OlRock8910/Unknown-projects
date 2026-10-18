import { chromium } from 'playwright';
// Takes the README screenshots: node tools/screenshots.mjs [light|dark]
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = path.join(root, 'docs', 'screenshots') + '/';
const theme = process.argv[2] || 'light';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 400, height: 860 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript((th) => { window.CLOUD_OVERRIDE = { url: '', anonKey: '' }; if (!localStorage.getItem('lingopeak.v1')) localStorage.setItem('lingopeak.v1', JSON.stringify({ profile: { name: 'Oli', look: { skin: 2, hair: 2, hairColor: 0, hat: 'cap', top: 'tee-coral', pants: 'jeans' } }, native: 'en', target: 'es', settings: { theme: th, sound: false, voice: true, vibrate: true, rate: 0.9 } })); }, theme);
await p.goto(pathToFileURL(path.join(root, 'web', 'index.html')).href);
await p.evaluate(() => {
  const c = Store.course;
  C.lessons.slice(0, 22).forEach((l) => { c.lessons[l.id] = { n: 1 }; l.words.forEach((w) => { seeWord(w); gradeWord(w, Math.random() < 0.8); }); });
  c.mountains.snowdon = today();
  Store.data.coins = 640; Store.data.gems = 34; Store.data.xp = 520; Store.data.week.secs = 13 * 60;
  Store.data.weekStreak = { n: 3, last: weekId(), best: 3 };
  Store.save(); App.refresh();
});
await p.waitForTimeout(400);
for (const tab of ['learn', 'practice', 'ranks', 'shop', 'me']) {
  await p.evaluate((t) => App.show(t), tab);
  await p.waitForTimeout(450);
  await p.screenshot({ path: S + theme + '-' + tab + '.png' });
}
await p.evaluate(() => App.revealMountain(LP_COURSE[0]));
await p.waitForTimeout(1800);
await p.screenshot({ path: S + theme + '-reveal.png' });
await p.evaluate(() => App.closeOverlay());
for (const g of ['whack', 'bubble']) {
  await p.evaluate((id) => Games.start(GAMES.find((x) => x.id === id)), g);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: S + theme + '-' + g + '.png' });
  await p.evaluate(() => Games.session && Games.session.quit());
}
await p.evaluate(() => openLesson(C.lessons.find((l) => l.kind === 'story' && l.unit.key === 'food')));
await p.waitForTimeout(700);
await p.evaluate(() => { [...document.querySelectorAll('.tile-bank .wtile')].slice(0, 2).forEach((x) => x.click()); });
await p.waitForTimeout(300);
await p.screenshot({ path: S + theme + '-lesson.png' });
console.log(errs);
await b.close();
