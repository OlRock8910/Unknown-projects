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

// ---- photos: the map projection puts places in the right countries
const places = await page.evaluate(() => [[2.35, 48.86], [-74.0, 40.71], [151.21, -33.87], [135.77, 35.01], [-43.21, -22.95], [37.62, 55.75], [103.85, 1.29], [-160, -30]]
  .map(([lon, lat]) => countryAt(...project(lon, lat))));
check(places.join(' ') === 'FR US AU JP BR RU SG ', `photo locations land in the right country (${places.join(' ')})`);

// ---- photos added by hand: ones with GPS go where they were taken
const fx = (n) => path.join(here, 'fixtures', n);
await page.evaluate(() => { closeSheet(); showTab('map'); });
await page.setInputFiles('#photo-in', [fx('kyoto.jpg'), fx('rio.jpg'), fx('no-location.jpg')]);
await page.waitForFunction(() => photoDb.a.length === 2, null, { timeout: 10000 });
const added = await page.evaluate(() => allPhotos().map((p) => [p.cc, new Date(p.t).getFullYear(), p.gps]));
check(JSON.stringify(added) === JSON.stringify([['JP', 2024, true], ['BR', 2022, true]]), `GPS photos placed in Japan and Brazil, newest first (${JSON.stringify(added)})`);
check(await page.evaluate(() => /no location/.test(document.querySelector('#toast').textContent)), 'the photo without a location is skipped with a note');
// From a country, a photo without GPS joins that country.
await page.evaluate(() => openSheet('PE', { expand: true }));
await page.click('#sheet [data-a="add-photos"]').catch(() => {});
await page.setInputFiles('#photo-in', [fx('no-location.jpg')]);
await page.waitForFunction(() => photoDb.a.length === 3, null, { timeout: 10000 });
check(await page.evaluate(() => photosIn('PE').length === 1 && !photosIn('PE')[0].gps), 'a photo with no location goes in the country it was added to');
check(await page.locator('#sheet .ph-strip .ph').count() === 1, 'the country card shows its photo');
await page.click('#sheet .ph-strip .ph');
await page.waitForSelector('#viewer .vw-img');
check(await page.evaluate(() => document.querySelector('#viewer .vw-img').src.startsWith('blob:')), 'the viewer opens the photo');
await page.click('#viewer [data-v="close"]');
await page.evaluate(() => closeSheet());
// Markers on the map, and tapping one opens it.
await page.evaluate(() => { flyTo('JP'); });
await page.waitForTimeout(900);
const pm = await page.evaluate(() => { const el = [...document.querySelectorAll('.pm')].find((m) => m._cluster.photos[0].cc === 'JP'); return el && { x: el._sx, y: el._sy }; });
check(!!pm, 'a photo marker sits on Japan');
if (pm) {
  await page.touchscreen.tap(pm.x, pm.y);
  await page.waitForTimeout(350);
  check(await page.evaluate(() => !viewerEl.hidden && viewList[viewIndex].cc === 'JP'), 'tapping the marker opens the photo');
  await shot('6-photo');
  check(await page.evaluate(() => window.appBack() && viewerEl.hidden), 'back closes the photo');
}
// Added photos survive a reload (IndexedDB).
await page.reload();
await page.waitForSelector('.country');
await page.waitForFunction(() => Object.keys(blobUrls).length === 6, null, { timeout: 5000 }).catch(() => {});
check(await page.evaluate(() => allPhotos().length === 3 && allPhotos().every((p) => photoUrl(p).startsWith('blob:'))), 'added photos survive a reload');
// Removing one, then undo.
await page.evaluate(() => openViewer(photosIn('BR'), 0));
await page.click('#viewer [data-v="hide"]');
check(await page.evaluate(() => photosIn('BR').length === 0), 'remove a photo');
await page.click('#toast button');
check(await page.evaluate(() => photosIn('BR').length === 1), 'undo brings it back');
await page.evaluate(() => closeViewer());

// ---- the Android app: scanning the phone's gallery (Native stand-in)
const phone = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, hasTouch: true });
phone.on('pageerror', (e) => errors.push('phone: ' + e.message));
const jpg = fs.readFileSync(fx('kyoto.jpg'));
await phone.route('https://globetrot.local/**', (r) => r.fulfill({ status: 200, contentType: 'image/jpeg', body: jpg }));
await phone.addInitScript(() => {
  const t = Date.UTC(2023, 6, 1);
  window.__granted = false;
  window.Native = {
    share() {}, copy() {}, vibrate() {}, shareFile() {},
    savePhoto(name) { (window.__saved ||= []).push(name); },
    deletePhoto() {},
    hasPhotoAccess: () => (window.__granted ? 'yes' : 'no'),
    scanPhotos(ask) {
      if (!ask && !window.__granted) return;
      window.__granted = true;
      setTimeout(() => window.onPhotoScan(JSON.stringify({ state: 'progress', done: 50, total: 120 })), 10);
      setTimeout(() => window.onPhotoScan(JSON.stringify({ state: 'done', total: 120, location: true })), 60);
    },
    // Kyoto ×3, the Eiffel Tower, Machu Picchu, mid-Pacific.
    photoScanResult: () => JSON.stringify([[11, 35.0116, 135.7681, t], [12, 35.0, 135.77, t - 1], [13, 34.99, 135.78, t - 2], [21, 48.8584, 2.2945, t], [31, -13.1631, -72.545, t], [41, -30, -160, t]]),
  };
});
await phone.goto(url);
await phone.waitForSelector('.country');
await phone.evaluate(() => { state.hint = true; save(true); });
await phone.click('[data-a="photos"]');
await phone.click('#modal [data-m="scan"]');
await phone.waitForSelector('#modal .flag-row', { timeout: 5000 });
check(await phone.evaluate(() => document.querySelector('#modal .flag-row').textContent === ['JP', 'FR', 'PE'].map(flag).join('')), 'the scan offers Japan, France and Peru');
await phone.click('#modal [data-m="ok"]');
check(await phone.evaluate(() => ['JP', 'FR', 'PE'].every(visited) && photoDb.g.length === 6), 'scan marks them and keeps 6 photos');
check(await phone.evaluate(() => photoDb.g.find((r) => r[0] === 41)[4] === ''), 'a photo at sea belongs to no country');
check(await phone.evaluate(() => photoUrl(allPhotos()[0]).startsWith('https://globetrot.local/g/')), 'gallery photos load from the app');
await phone.evaluate(() => { cam.k = kMin * 1.3; cam.x = vw / 2 - 1700 * cam.k; clampCam(); render(); });
await phone.waitForTimeout(400);
const cluster = await phone.evaluate(() => [...document.querySelectorAll('.pm')].map((m) => m._cluster.photos.length).sort().join(','));
check(cluster.includes('3'), `the three Kyoto photos group into one marker (${cluster})`);
await phone.waitForTimeout(300);
if (shots) await phone.screenshot({ path: path.join(shotDir, '7-photos-map.png') });
await phone.evaluate(() => openSheet('JP'));
await phone.waitForTimeout(400);
check(await phone.locator('#sheet .ph-strip .ph').count() === 3, 'Japan’s card shows its three photos');
if (shots) await phone.screenshot({ path: path.join(shotDir, '8-photos-sheet.png') });
// Hiding a gallery photo keeps it hidden after the next scan.
await phone.evaluate(() => { closeSheet(); openViewer(photosIn('FR'), 0); });
await phone.click('#viewer [data-v="hide"]');
await phone.evaluate(() => scanPhone(true));
await phone.waitForTimeout(200);
check(await phone.evaluate(() => photoDb.g.length === 5 && !photosIn('FR').length), 'hidden photos stay hidden after a rescan');
// A big gallery opens a screenful at a time.
const counts = await phone.evaluate(async () => {
  const keep = photoDb.g;
  photoDb.g = Array.from({ length: 500 }, (_, i) => [1000 + i, 1500, 400, i, 'JP']);
  photoList = null;
  openGallery(allPhotos(), 'All');
  const first = document.querySelectorAll('.gal-grid .ph').length;
  const grid = document.querySelector('.gal-grid');
  grid.scrollTop = grid.scrollHeight;
  grid.dispatchEvent(new Event('scroll'));
  const second = document.querySelectorAll('.gal-grid .ph').length;
  closeGallery();
  photoDb.g = keep;
  photoList = null;
  return [first, second];
});
check(counts[0] === 180 && counts[1] === 360, `big galleries load in pages (${counts})`);
await phone.click('.tabbar [data-tab="stats"]');
check(await phone.locator('.photo-card .ph').count() > 0, 'stats show the photos');
if (shots) { await phone.waitForTimeout(300); await phone.screenshot({ path: path.join(shotDir, '9-photos-stats.png') }); }

if (errors.length) fail('page errors:\n  ' + errors.join('\n  '));
await browser.close();
if (!process.exitCode) console.log('all good');
