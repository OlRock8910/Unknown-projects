// Opens Globetrot in a real browser on a phone-sized screen, checks the map
// data, then marks countries by tapping the map, the list and search, pins a
// place, restores a backup and checks the stats add up. Fails on any page
// error.
//
//   node globetrot/tests/smoke.mjs [--shots]
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, '..', 'web', 'index.html')).href;
const shots = process.argv.includes('--shots');
const shotDir = path.join(here, '..', 'screenshots');
if (shots) fs.mkdirSync(shotDir, { recursive: true });
const shot = async (name) => { if (shots) await page.screenshot({ path: path.join(shotDir, name + '.png') }); };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const fail = (msg) => { console.error('✗ ' + msg); process.exitCode = 1; };
const check = (ok, msg) => { if (ok) console.log('✓ ' + msg); else fail(msg); };

await page.goto(url);
await page.waitForSelector('.country');

// ---- data
const data = await page.evaluate(() => {
  const out = [];
  const ids = new Set();
  for (const c of WORLD.countries) {
    if (ids.has(c.id)) out.push('duplicate ' + c.id);
    ids.add(c.id);
    if (!/^[A-Z]{2}$/.test(c.id)) out.push('bad id ' + c.id);
    if (!c.n || !c.d || c.d.length < 10) out.push(c.id + ': missing name or shape');
    if (!CONTINENTS.includes(c.c)) out.push(c.id + ': unknown continent ' + c.c);
    if (!(c.b[0] <= c.b[2] && c.b[1] <= c.b[3])) out.push(c.id + ': bad bounds');
    if (!(c.a > 0)) out.push(c.id + ': no area');
  }
  return { out, total: WORLD.countries.length, un: UN_TOTAL, paths: document.querySelectorAll('.country').length };
});
if (data.out.length) fail('data problems:\n  ' + data.out.join('\n  '));
check(data.un === 195, `195 UN countries (got ${data.un})`);
check(data.paths === data.total, `${data.total} countries drawn`);
for (const id of ['FR', 'NO', 'SO', 'CY', 'XK', 'TW', 'SG', 'VA', 'MT', 'AQ', 'GL', 'PR']) {
  check(await page.evaluate((i) => !!BY_ID[i], id), `has ${id}`);
}
await shot('1-map');

// ---- tap a country on the map: aim at Brazil's label point
await page.click('[data-a="hint-ok"]');
async function tapCountry(id) {
  const pt = await page.evaluate((i) => {
    const c = BY_ID[i];
    return { x: c.l[0] * cam.k + cam.x, y: c.l[1] * cam.k + cam.y };
  }, id);
  await page.touchscreen.tap(pt.x, pt.y);
  await page.waitForTimeout(350); // past the double-tap window
}
await page.evaluate(() => { cam.k = kMin * 1.2; cam.x = 0; clampCam(); render(); });
await tapCountry('BR');
check(await page.evaluate(() => sheetId === 'BR'), 'tapping Brazil opens its sheet');
await page.click('#sheet .st.been');
check(await page.evaluate(() => status('BR') === 'been' && document.querySelector('[data-id="BR"].country').classList.contains('been')), 'marking Brazil colours it');
await page.click('#sheet [data-a="expand"]');
await page.fill('#year-in', '2019');
await page.click('#sheet [data-a="add-year"]');
await page.fill('#note-in', 'Carnival!');
await page.waitForTimeout(300);
check(await page.evaluate(() => state.c.BR.y[0] === 2019 && state.c.BR.n === 'Carnival!'), 'year and note saved');
await shot('2-sheet');
await page.click('#sheet [data-a="close"]');

// ---- undo
await page.evaluate(() => openSheet('AR'));
await page.click('#sheet .st.want');
check(await page.evaluate(() => status('AR') === 'want'), 'wish list');
await page.click('#toast button');
check(await page.evaluate(() => status('AR') === ''), 'undo');
await page.evaluate(() => closeSheet());

// ---- quick mark
await page.click('#quick');
await page.evaluate(() => { flyTo('FR'); });
await page.waitForTimeout(800);
await tapCountry('FR');
await tapCountry('ES');
await page.click('#quick');
check(await page.evaluate(() => visited('FR') && visited('ES') && !sheetId), 'quick mark ticks France and Spain');

// ---- tiny countries get a tappable dot
await page.evaluate(() => { cam.k = kMin; clampCam(); render(); });
await page.waitForTimeout(50);
const dot = await page.evaluate(() => {
  const d = document.querySelector('.dot[data-id="SG"]');
  return d && d.style.display !== 'none' ? { x: +d.getAttribute('cx'), y: +d.getAttribute('cy') } : null;
});
check(!!dot, 'Singapore has a dot at world zoom');
if (dot) {
  await page.touchscreen.tap(dot.x, dot.y);
  await page.waitForTimeout(350);
  check(await page.evaluate(() => sheetId === 'SG'), 'tapping the dot opens Singapore');
  await page.evaluate(() => closeSheet());
}

// ---- pinch zoom
const k0 = await page.evaluate(() => cam.k);
const cdp = await page.context().newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
await touch('touchStart', [[150, 400], [250, 400]]);
for (let i = 1; i <= 6; i++) await touch('touchMove', [[150 - i * 15, 400], [250 + i * 15, 400]]);
await touch('touchEnd', []);
await page.waitForTimeout(100);
check(await page.evaluate((k) => cam.k > k * 1.5, k0), 'pinch zooms in');

// ---- long press drops a pin
await page.evaluate(() => { flyTo('IT'); });
await page.waitForTimeout(800);
const it = await page.evaluate(() => { const c = BY_ID.IT; return { x: c.l[0] * cam.k + cam.x, y: c.l[1] * cam.k + cam.y }; });
await touch('touchStart', [[it.x, it.y]]);
await page.waitForTimeout(700);
await touch('touchEnd', []);
await page.waitForSelector('#pin-name');
await page.fill('#pin-name', 'Rome');
await page.click('#modal [data-m="ok"]');
check(await page.evaluate(() => state.pins.length === 1 && state.pins[0].cc === 'IT' && visited('IT')), 'long press pins Rome and marks Italy');
await page.waitForTimeout(400);
await shot('3-pins');

// ---- search
await page.click('[data-a="search"]');
await page.fill('#search-q', 'japan');
await page.click('#search-results [data-open="JP"]');
await page.waitForTimeout(800);
check(await page.evaluate(() => sheetId === 'JP'), 'search finds and opens Japan');
await page.click('#sheet .st.lived');
await page.evaluate(() => closeSheet());

// ---- list
await page.click('.tabbar [data-tab="list"]');
await page.fill('#list-q', 'cote');
check(await page.locator('#list-body [data-open="CI"]').count() === 1, 'search ignores accents');
await page.fill('#list-q', '');
await page.dispatchEvent('#list-q', 'input');
await page.click('#list-body [data-tick="PE"]');
check(await page.evaluate(() => visited('PE')), 'ticking Peru in the list');
await page.click('#list-filters [data-f="been"]');
const beenRows = await page.locator('#list-body .row').count();
check(beenRows === await page.evaluate(() => COUNTRIES.filter((c) => visited(c.id)).length), `Been filter shows ${beenRows}`);
await page.waitForTimeout(300);
await shot('4-list');

// ---- stats
await page.click('.tabbar [data-tab="stats"]');
const st = await page.evaluate(() => stats());
check(st.un === 6 && st.lived === 1, `6 countries, 1 lived (got ${st.un}, ${st.lived})`);
check(await page.locator('.hero h2').innerText().then((t) => t.startsWith("6")), 'stats hero');
await page.waitForTimeout(300);
await shot('5-stats');
await page.evaluate(() => drawShareImage());
check(true, 'share image draws');

// ---- persistence and backup
await page.waitForTimeout(400);
const backup = await page.evaluate(() => backupJson());
await page.reload();
await page.waitForSelector('.country');
check(await page.evaluate(() => stats().un === 6 && state.pins.length === 1), 'survives a reload');
await page.evaluate(() => { state = blank(); save(true); });
await page.reload();
await page.waitForSelector('.country');
check(await page.evaluate(() => stats().un === 0), 'cleared');
check(await page.evaluate((b) => restoreFrom(b), backup), 'restore accepts the backup');
check(await page.evaluate(() => stats().un === 6 && state.c.BR.n === 'Carnival!' && state.pins[0].name === 'Rome'), 'backup restores everything');
check(await page.evaluate(() => restoreFrom('not json') === false), 'rejects junk');

// ---- back button closes things in order
await page.evaluate(() => openSheet('JP'));
check(await page.evaluate(() => window.appBack() === true && !sheetId), 'back closes the sheet');
check(await page.evaluate(() => window.appBack() === false), 'back on the map leaves the app');

if (errors.length) fail('page errors:\n  ' + errors.join('\n  '));
await browser.close();
if (!process.exitCode) console.log('all good');
