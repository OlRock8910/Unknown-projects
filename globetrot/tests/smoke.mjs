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

// ---- walks: the 1 km grid
const grid = await page.evaluate(() => {
  const [s, w, n, e] = cellBounds(cellOf(40.758, -73.9855));
  return {
    ns: kmBetween({ lat: s, lon: w }, { lat: n, lon: w }),
    ew: kmBetween({ lat: s, lon: w }, { lat: s, lon: e }),
    inside: s <= 40.758 && n > 40.758 && w <= -73.9855 && e > -73.9855,
    roundTrip: [[0.1, 0.1], [-33.9, 18.4], [64.1, -21.9], [-77.8, 166.7]].every(([la, lo]) => { const b = cellBounds(cellOf(la, lo)); return b[0] <= la && la < b[2] && b[1] <= lo && lo < b[3]; }),
    codec: (() => { const set = new Set([cellOf(1, 2), cellOf(-40, 170), cellOf(51.5, -0.1)]); const back = decodeCells(encodeCells(set)); return back.size === 3 && [...set].every((k) => back.has(k)); })(),
  };
});
check(Math.abs(grid.ns - 1) < 0.02 && Math.abs(grid.ew - 1) < 0.02 && grid.inside, `squares are 1 km across (${grid.ns.toFixed(3)} × ${grid.ew.toFixed(3)})`);
check(grid.roundTrip && grid.codec, 'squares work everywhere and save and load');

// ---- importing location history
const os = await import('node:os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'globetrot-'));
const t0 = Date.UTC(2023, 4, 1, 9);
const line = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
// A 4 km walk up Central Park at walking pace, as GPX.
const park = line([40.7680, -73.9819], [40.7968, -73.9580], 80);
fs.writeFileSync(path.join(tmp, 'park.gpx'), `<?xml version="1.0"?><gpx version="1.1"><metadata><time>2023-05-01T08:00:00Z</time></metadata><trk><trkseg>
${park.map(([la, lo], i) => `<trkpt lat="${la.toFixed(6)}" lon="${lo.toFixed(6)}"><ele>20</ele><time>${new Date(t0 + i * 36000).toISOString()}</time></trkpt>`).join('\n')}
</trkseg></trk></gpx>`);
// Timeline export from a phone: a walk in Paris, then a drive out to Versailles.
const parisWalk = line([48.8584, 2.2945], [48.8738, 2.2950], 10);
const drive = line([48.8738, 2.2950], [48.8049, 2.1204], 6).slice(1);
fs.writeFileSync(path.join(tmp, 'Timeline.json'), JSON.stringify({ semanticSegments: [
  { startTime: '2023-05-02T10:00:00.000+02:00', endTime: '2023-05-02T10:30:00.000+02:00', timelinePath: parisWalk.map(([la, lo], i) => ({ point: `${la.toFixed(7)}°, ${lo.toFixed(7)}°`, time: new Date(t0 + 86400000 + i * 180000).toISOString() })) },
  { startTime: '2023-05-02T10:30:00.000+02:00', timelinePath: drive.map(([la, lo], i) => ({ point: `${la.toFixed(7)}°, ${lo.toFixed(7)}°`, time: new Date(t0 + 86400000 + 1800000 + (i + 1) * 180000).toISOString() })) },
  { visit: { topCandidate: { placeLocation: { latLng: '48.8049°, 2.1204°' } } } },
] }));
// Google Takeout Records.json: a stroll in London.
const london = line([51.5007, -0.1246], [51.5081, -0.0759], 30);
fs.writeFileSync(path.join(tmp, 'Records.json'), JSON.stringify({ locations: london.map(([la, lo], i) => ({ latitudeE7: Math.round(la * 1e7), longitudeE7: Math.round(lo * 1e7), accuracy: 10, source: 'GPS', timestamp: new Date(t0 + 2 * 86400000 + i * 60000).toISOString() })) }, null, 2));
// KML from a tracker: a walk in Rome, no times.
const rome = line([41.8902, 12.4922], [41.9009, 12.4833], 12);
fs.writeFileSync(path.join(tmp, 'rome.kml'), `<kml><Document><Placemark><LineString><coordinates>${rome.map(([la, lo]) => `${lo},${la},0`).join(' ')}</coordinates></LineString></Placemark></Document></kml>`);

await page.evaluate(() => { closeModal(); closeSheet(); walkDb.photos = false; walkChanged(); });
const cellsIn = (box) => page.evaluate((b) => explored().keys.filter((k) => { const [s, w] = cellBounds(k); return s > b[0] && s < b[2] && w > b[1] && w < b[3]; }).length, box);
async function importFile(name) {
  await page.setInputFiles('#history-in', path.join(tmp, name));
  await page.waitForSelector('#modal .dialog:not(.scan)', { timeout: 10000 });
  const title = await page.locator('#modal h2').innerText();
  await page.evaluate(() => closeModal());
  return title;
}
const t1 = await importFile('park.gpx');
const nyc = await cellsIn([40.70, -74.05, 40.85, -73.90]);
check(nyc >= 4 && nyc <= 12, `a 4 km GPX walk lights up a trail of squares, not all of New York (${nyc}: “${t1}”)`);
check(await page.evaluate(() => exploredCount()) === nyc, 'and nothing anywhere else');
await importFile('Timeline.json');
const paris = await cellsIn([48.84, 2.27, 48.89, 2.32]);
const road = await cellsIn([48.815, 2.13, 48.865, 2.28]);
const versailles = await cellsIn([48.79, 2.10, 48.815, 2.14]);
check(paris >= 2 && road === 0 && versailles === 1, `Timeline: the Paris walk and the stop at Versailles count, the drive between doesn't (${paris}, ${road}, ${versailles})`);
await importFile('Records.json');
check(await cellsIn([51.49, -0.14, 51.52, -0.06]) >= 3, 'Google Takeout Records.json');
await importFile('rome.kml');
check(await cellsIn([41.88, 12.47, 41.91, 12.50]) >= 2, 'KML');
// The same file again adds nothing.
check((await importFile('park.gpx')).startsWith('🥾 0 new'), 'importing twice adds nothing');
// Big files are read in pieces: the streaming reader finds every point.
const streamed = await page.evaluate(async (text) => {
  const all = [], parts = [];
  readPoints(text, all, true);
  let rest = '';
  for (let i = 0; i < text.length; i += 997) rest = readPoints(rest + text.slice(i, i + 997), parts, false);
  readPoints(rest, parts, true);
  return [all.length, parts.length, parts.filter((p) => p.t).length];
}, fs.readFileSync(path.join(tmp, 'Records.json'), 'utf8'));
check(streamed[0] === 31 && streamed[1] === 31 && streamed[2] === 31, `chunked reading finds the same points (${streamed})`);
const byCountry = await page.evaluate(() => Object.fromEntries(exploredByCountry()));
check(byCountry.US > 0 && byCountry.FR > 0 && byCountry.GB > 0 && byCountry.IT > 0, `explored squares know their country (${JSON.stringify(byCountry)})`);

// ---- the Walks map: fog with holes where you've been
await page.click('.tabbar [data-tab="walks"]');
await page.waitForTimeout(300);
check(await page.evaluate(() => !$('#wk-intro').hidden), 'the Walks map explains itself the first time');
await page.click('[data-w="intro-ok"]');
await page.evaluate(() => wkGoTo(40.782, -73.97, 13.5));
await page.waitForTimeout(900);
const fog = await page.evaluate(() => {
  const g = wkFog.getContext('2d'), S = 2 ** wcam.z;
  const at = (lat, lon) => { const [s, w, n, e] = cellBounds(cellOf(lat, lon)); const [x, y] = merc((s + n) / 2, (w + e) / 2); const sx = (x - wcam.x) * S + wvw / 2, sy = (y - wcam.y) * S + wvh / 2; return g.getImageData(Math.round(sx * dpr), Math.round(sy * dpr), 1, 1).data[3]; };
  return { walked: at(40.7824, -73.9700), elsewhere: at(40.7824, -73.9500) };
});
check(fog.walked < fog.elsewhere - 60, `the fog clears over the walk and stays elsewhere (alpha ${fog.walked} vs ${fog.elsewhere})`);
check(await page.evaluate(() => !$('#wk-streets').hidden), 'zoomed into a city, the map offers the streets');
await shot('10-walks');
// Street map pictures only when switched on.
let tileHits = 0;
const png = fs.readFileSync(path.join(here, '..', 'web', 'icons', 'icon-192.png'));
await page.route('https://*.basemaps.cartocdn.com/**', (r) => { tileHits++; r.fulfill({ contentType: 'image/png', body: png }); });
await page.evaluate(() => { wkZoom(1.01, 200, 300); });
await page.waitForTimeout(300);
check(tileHits === 0, 'no street map downloads unless switched on');
await page.click('[data-w="menu"]');
await page.click('#modal [data-m="streets"]');
await page.waitForTimeout(800);
check(tileHits > 0 && await page.evaluate(() => !$('#wk-attr').hidden), `street map tiles load with credit (${tileHits})`);
await page.evaluate(() => { walkDb.streets = false; saveWalks(); });

// ---- the world map shows walked squares, and countries know their km²
await page.click('.tabbar [data-tab="map"]');
await page.evaluate(() => { const [x, y] = project(-73.97, 40.78); const k = kMin * 40; cam.k = k; cam.x = vw / 2 - x * k; cam.y = vh / 2 - y * k; clampCam(); render(); });
await page.waitForTimeout(200);
const speck = await page.evaluate(() => {
  const [x, y] = project(-73.9700, 40.7824), sd = Math.min(3, devicePixelRatio);
  const px = $('#walk-specks').getContext('2d').getImageData(Math.round((x * cam.k + cam.x) * sd), Math.round((y * cam.k + cam.y) * sd), 1, 1).data;
  return px[3];
});
check(speck > 200, 'walked squares show on the world map');
await page.evaluate(() => openSheet('US', { expand: true }));
check(/km²/.test(await page.locator('#sheet .walk-line').innerText()), 'the country card says how much you walked there');
await page.evaluate(() => closeSheet());

// ---- walks are in the backup
const withWalks = await page.evaluate(() => JSON.parse(backupJson()).walks);
const walkedBefore = await page.evaluate(() => exploredCount());
await page.evaluate(() => { walkDb.cells = new Set(); walkChanged(); });
await page.evaluate((w) => restoreFrom(JSON.stringify({ app: 'globetrot', c: state.c, pins: state.pins, walks: w })), withWalks);
check(walkedBefore > 10 && await page.evaluate(() => exploredCount()) === walkedBefore, `restoring a backup brings walks back (${walkedBefore})`);

// ---- recording a walk (Android stand-in)
const walker = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, hasTouch: true });
walker.on('pageerror', (e) => errors.push('walker: ' + e.message));
await walker.addInitScript(() => {
  let on = false, queue = [];
  window.__walk = { push: (lines) => queue.push(...lines) };
  window.Native = {
    share() {}, copy() {}, vibrate() {}, shareFile() {}, savePhoto() {}, deletePhoto() {},
    hasPhotoAccess: () => 'no', scanPhotos() {}, photoScanResult: () => '[]',
    walkStart() { on = true; setTimeout(() => window.onWalkEvent('{"state":"on"}'), 10); },
    walkStop() { on = false; },
    walkState: () => (on ? 'on' : 'off'),
    walkTake() { const t = queue.join('\n'); queue = []; return t; },
    locate() { setTimeout(() => window.onWalkEvent('{"state":"here","lat":38.7139,"lon":-9.1394,"acc":8}'), 10); },
  };
});
await walker.goto(url);
await walker.waitForSelector('.country');
await walker.click('.tabbar [data-tab="walks"]');
await walker.click('[data-w="intro-rec"]');
await walker.waitForFunction(() => walkDb.rec);
check(await walker.evaluate(() => $('#rec-btn').classList.contains('on')), 'Record turns on');
// 2 km across Lisbon at walking pace, one fix every 20 s, then a 30 km jump in five minutes (a car).
const now = Date.now();
const lisbon = line([38.7139, -9.1394], [38.7223, -9.1180], 40).map(([la, lo], i) => `${now + i * 20000},${la},${lo},6`);
await walker.evaluate((l) => window.__walk.push(l), [...lisbon, `${now + 41 * 20000 + 300000},38.98,-9.42,6`]);
await walker.evaluate(() => window.onAppResume());
const rec = await walker.evaluate(() => ({ km: walkDb.dayKm, n: exploredCount(), btn: $('#rec-btn').textContent }));
check(rec.km > 1.8 && rec.km < 2.4 && rec.n >= 3 && rec.n <= 8, `a recorded 2 km walk lights up its squares (${rec.km.toFixed(2)} km, ${rec.n} km²)`);
check(/2\.\d km today/.test(rec.btn), `the button shows today's distance (${rec.btn})`);
await walker.click('[data-w="locate"]');
await walker.waitForTimeout(900);
check(await walker.evaluate(() => here && here.lat === 38.7139 && wcam.z >= 13.9), 'find me centres the map on you');
await walker.click('#rec-btn');
check(await walker.evaluate(() => !walkDb.rec && !recording()), 'Stop ends recording');
// Stopped from the notification while the app was in the background.
await walker.click('#rec-btn');
await walker.waitForFunction(() => walkDb.rec);
await walker.evaluate(() => { Native.walkStop(); window.onAppResume(); });
check(await walker.evaluate(() => !walkDb.rec && !$('#rec-btn').classList.contains('on')), 'stopping from the notification is noticed');
if (shots) { await walker.waitForTimeout(300); await walker.screenshot({ path: path.join(shotDir, '11-recording.png') }); }

if (errors.length) fail('page errors:\n  ' + errors.join('\n  '));
await browser.close();
if (!process.exitCode) console.log('all good');
