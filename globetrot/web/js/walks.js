// Walks: the places you've actually been, to the nearest kilometre. The
// world is cut into squares about 1 km across; every square you pass through
// lights up. Squares come from following where you go in the background
// (Android's TrackService, or the browser's geolocation while the page is
// open), from where your photos were taken, and from imported location
// history (Google Maps Timeline, Google Takeout, GPX, KML).
//
// The Walks tab shows them on a Web Mercator map under a "fog" that clears
// where you've been, with street map pictures underneath if you switch them
// on. The world map shows them as small white squares.
// Loaded after app.js and photos.js and uses their globals.
'use strict';

const WALK_KEY = 'globetrot.walks';
const KM_LAT = 1 / 111.32; // degrees of latitude in 1 km
const WALK_KMH = 25; // faster than this is a car or a train, not a walk
const JOIN_KM = 1.5; // fill in the squares between points closer than this…
const JOIN_GAP_H = 1 / 3; // …and less than 20 minutes apart
const DEG = Math.PI / 180;
const TILE_URL = (z, x, y, retina) => `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}${retina ? '@2x' : ''}.png`;

// ---------------------------------------------------------------- the 1 km grid

// Rows are 1 km of latitude; each row is cut into columns 1 km wide at its
// middle, so squares stay square from the equator to the Arctic.
function cellOf(lat, lon) {
  lat = clampN(lat, -89.99, 89.99);
  const r = Math.floor(lat / KM_LAT);
  const w = KM_LAT / Math.max(0.01, Math.cos((r + 0.5) * KM_LAT * DEG));
  const c = Math.floor(lon / w);
  return (r + 10100) * 50000 + (c + 25000);
}
// [south, west, north, east] in degrees.
function cellBounds(key) {
  const r = Math.floor(key / 50000) - 10100, c = (key % 50000) - 25000;
  const s = r * KM_LAT;
  const w = KM_LAT / Math.max(0.01, Math.cos((s + KM_LAT / 2) * DEG));
  return [s, c * w, s + KM_LAT, (c + 1) * w];
}
function kmBetween(a, b) {
  const dLat = (b.lat - a.lat) * DEG, dLon = (b.lon - a.lon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * DEG) * Math.cos(b.lat * DEG) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}
// Web Mercator, in "world pixels": the whole world is 256 across at zoom 0.
function merc(lat, lon) {
  const s = Math.sin(clampN(lat, -85.05, 85.05) * DEG);
  return [(lon + 180) / 360 * 256, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256];
}
function unmerc(x, y) {
  return [Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 256))) / DEG, (x / 256) * 360 - 180];
}

// ---------------------------------------------------------------- storage

let walkDb = loadWalks();
let walkVersion = 0;

function encodeCells(set) {
  let prev = 0;
  return [...set].sort((a, b) => a - b).map((v) => { const d = v - prev; prev = v; return d.toString(36); }).join(',');
}
function decodeCells(str) {
  const set = new Set();
  let v = 0;
  for (const part of String(str || '').split(',')) {
    if (!part) continue;
    v += parseInt(part, 36);
    if (isFinite(v)) set.add(v);
  }
  return set;
}
function loadWalks() {
  // track: the person wants their whereabouts followed. walkOnly: leave out
  // driving and trains. autoMark: mark countries as been when you're seen there.
  const out = { cells: new Set(), last: null, day: '', dayKm: 0, totalKm: 0, streets: false, photos: true, cam: null, intro: false, track: false, walkOnly: true, autoMark: true, setup: false };
  try {
    const s = JSON.parse(localStorage.getItem(WALK_KEY));
    if (s && typeof s === 'object') {
      out.cells = decodeCells(s.cells);
      for (const k of ['day', 'intro', 'streets', 'setup']) if (s[k] != null) out[k] = s[k];
      out.track = !!(s.track ?? s.rec);
      out.photos = s.photos !== false;
      out.walkOnly = s.walkOnly !== false;
      out.autoMark = s.autoMark !== false;
      out.dayKm = +s.dayKm || 0;
      out.totalKm = +s.totalKm || 0;
      if (s.last && isFinite(s.last.lat)) out.last = s.last;
      if (s.cam && isFinite(s.cam.x)) out.cam = s.cam;
    }
  } catch (e) { /* first run */ }
  return out;
}
let walkSaveTimer = 0;
let walkDirty = false;
function saveWalks(now) {
  clearTimeout(walkSaveTimer);
  walkDirty = true;
  const write = () => {
    walkDirty = false;
    try {
      localStorage.setItem(WALK_KEY, JSON.stringify({ ...walkDb, cells: encodeCells(walkDb.cells) }));
    } catch (e) { toast('Not enough room to save your walks'); }
  };
  if (now) write(); else walkSaveTimer = setTimeout(write, 300);
}
// Points taken from the service exist nowhere else, so never lose a pending save.
window.addEventListener('pagehide', () => { if (walkDirty) saveWalks(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && walkDirty) saveWalks(true); });
function walkChanged() {
  walkVersion++;
  saveWalks();
  draw();
  if (currentTab === 'walks') wkDraw();
  dirty.stats = true;
  if (currentTab === 'stats') renderStats();
  if (sheetId) renderSheet();
}

// Everything explored: walked squares plus photo locations, worked out once per change.
let exploredMemo = null;
function explored() {
  const pl = walkDb.photos ? allPhotos() : null;
  if (exploredMemo && exploredMemo.v === walkVersion && exploredMemo.pl === pl) return exploredMemo;
  const set = new Set(walkDb.cells);
  if (pl) {
    for (const p of pl) {
      if (!p.gps) continue;
      const [lon, lat] = p.lat != null ? [p.lon, p.lat] : unproject(p.x, p.y);
      set.add(cellOf(lat, lon));
    }
  }
  exploredMemo = { v: walkVersion, pl, keys: [...set], merc: null, ne: null, countries: null };
  return exploredMemo;
}
const exploredCount = () => explored().keys.length;

// Squares as Mercator rectangles [x0, y0, x1, y1], for the Walks map.
function exploredMerc() {
  const e = explored();
  if (!e.merc) {
    const m = new Float64Array(e.keys.length * 4);
    e.keys.forEach((k, i) => {
      const [s, w, n, east] = cellBounds(k);
      const [x0, y0] = merc(n, w), [x1, y1] = merc(s, east);
      m[i * 4] = x0; m[i * 4 + 1] = y0; m[i * 4 + 2] = x1; m[i * 4 + 3] = y1;
    });
    e.merc = m;
  }
  return e.merc;
}
// Square centres in world-map units, for the specks on the main map.
function exploredNe() {
  const e = explored();
  if (!e.ne) {
    const a = new Float32Array(e.keys.length * 2);
    e.keys.forEach((k, i) => {
      const [s, w, n, east] = cellBounds(k);
      const [x, y] = project((w + east) / 2, (s + n) / 2);
      a[i * 2] = x; a[i * 2 + 1] = y;
    });
    e.ne = a;
  }
  return e.ne;
}
// km² explored in each country.
function exploredByCountry() {
  const e = explored();
  if (!e.countries) {
    const by = new Map();
    const ne = exploredNe();
    for (let i = 0; i < e.keys.length; i++) {
      const cc = countryAt(ne[i * 2], ne[i * 2 + 1]);
      if (cc) by.set(cc, (by.get(cc) || 0) + 1);
    }
    e.countries = by;
  }
  return e.countries;
}

// ---------------------------------------------------------------- adding tracks

// Lights up the squares along a track. Points close together are joined, so a
// walk with a fix every few hundred metres becomes a continuous trail. With
// walkingOnly, stretches faster than walking pace (driving, trains, planes)
// are left out. ctx.last carries the previous point between batches; with
// ctx.added set to an array, the keys of newly lit squares are pushed to it.
function addTrack(pts, walkingOnly, ctx = {}) {
  const cells = walkDb.cells;
  const added = ctx.added;
  const light = (key) => {
    if (cells.has(key)) return;
    cells.add(key);
    if (added) added.push(key);
  };
  let prev = ctx.last || null, km = 0;
  for (const p of pts) {
    if (!(Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180) || (!p.lat && !p.lon)) continue;
    let d = 0, fast = false, gap = false;
    if (prev) {
      d = kmBetween(prev, p);
      const hours = prev.t && p.t && p.t > prev.t ? (p.t - prev.t) / 3.6e6 : 0;
      fast = hours > 0 && d / hours > WALK_KMH;
      gap = hours > JOIN_GAP_H;
    }
    if (walkingOnly && fast) { prev = p; continue; }
    if (prev && d > 0 && d <= JOIN_KM && !fast && !gap) {
      const steps = Math.ceil(d / 0.25);
      for (let i = 1; i < steps; i++) {
        const f = i / steps;
        light(cellOf(prev.lat + (p.lat - prev.lat) * f, prev.lon + (p.lon - prev.lon) * f));
      }
      km += d;
    }
    light(cellOf(p.lat, p.lon));
    prev = p;
  }
  ctx.last = prev;
  ctx.km = (ctx.km || 0) + km;
  return ctx;
}

// ---------------------------------------------------------------- importing location history

// One pass over the file finds coordinates in any of the formats below, and
// the time that follows each one.
const LOC_RE = new RegExp([
  /"latitudeE7"\s*:\s*(-?\d+)\s*,\s*"longitudeE7"\s*:\s*(-?\d+)/.source, // 1,2 Google Takeout
  /"latE7"\s*:\s*(-?\d+)\s*,\s*"lngE7"\s*:\s*(-?\d+)/.source, // 3,4 Takeout waypoints
  /"(?:point|latLng|LatLng)"\s*:\s*"(-?\d+(?:\.\d+)?)°?,\s*(-?\d+(?:\.\d+)?)°?"/.source, // 5,6 Timeline export from a phone
  /"geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)"/.source, // 7,8 Timeline export from an iPhone
  /<(?:trkpt|rtept|wpt)\b([^>]*)>/.source, // 9 GPX
  /<coordinates>([^<]*)<\/coordinates>/.source, // 10 KML
  /<gx:coord>([^<]*)<\/gx:coord>/.source, // 11 KML track
  /"(?:time|timestamp)"\s*:\s*"(\d{4}-\d\d-\d\dT[^"]+)"/.source, // 12
  /"timestampMs"\s*:\s*"(\d+)"/.source, // 13
  /<time>([^<]+)<\/time>/.source, // 14 GPX
].join('|'), 'g');

// Returns the unread end of the text (a point may be cut off at the end of a chunk).
function readPoints(text, out, final) {
  const limit = final ? text.length : text.length - 600;
  let cut = Math.max(0, limit);
  LOC_RE.lastIndex = 0;
  let m;
  const push = (lat, lon) => { if (isFinite(lat) && isFinite(lon)) out.push({ lat, lon, t: 0 }); };
  const setTime = (t) => { const p = out[out.length - 1]; if (p && !p.t && isFinite(t)) p.t = t; };
  while ((m = LOC_RE.exec(text))) {
    if (m.index + m[0].length > limit && !final) { cut = m.index; break; }
    if (m[1] !== undefined) push(+m[1] / 1e7, +m[2] / 1e7);
    else if (m[3] !== undefined) push(+m[3] / 1e7, +m[4] / 1e7);
    else if (m[5] !== undefined) push(+m[5], +m[6]);
    else if (m[7] !== undefined) push(+m[7], +m[8]);
    else if (m[9] !== undefined) {
      const lat = /\blat\s*=\s*["']([^"']+)/.exec(m[9]), lon = /\blon\s*=\s*["']([^"']+)/.exec(m[9]);
      if (lat && lon) push(+lat[1], +lon[1]);
    } else if (m[10] !== undefined) {
      for (const tuple of m[10].trim().split(/\s+/)) {
        const [lo, la] = tuple.split(',');
        push(+la, +lo);
      }
    } else if (m[11] !== undefined) {
      const [lo, la] = m[11].trim().split(/\s+/);
      push(+la, +lo);
    } else if (m[12] !== undefined) setTime(Date.parse(m[12]));
    else if (m[13] !== undefined) setTime(+m[13]);
    else if (m[14] !== undefined) setTime(Date.parse(m[14]));
  }
  return final ? '' : text.slice(cut);
}

async function importHistory(file, walkingOnly) {
  const before = walkDb.cells.size;
  const ctx = {};
  let count = 0;
  const progress = (done) => {
    const body = `<div class="dialog scan"><h2>🥾 Reading ${esc(file.name)}</h2>
      <p>${fmt(count)} places found so far.</p><div class="bar"><i style="width:${Math.round(done * 100)}%"></i></div></div>`;
    if (modalEl.hidden || !$('.dialog.scan', modalEl)) modal(body, {}); else modalEl.innerHTML = body;
  };
  progress(0);
  try {
    if (file.size < 40e6 || !file.stream) {
      // Small enough to read at once, and sort by time (Timeline files list
      // their raw signals after the day-by-day segments).
      const pts = [];
      readPoints(await file.text(), pts, true);
      count = pts.length;
      if (pts.length && pts.every((p) => p.t)) pts.sort((a, b) => a.t - b.t);
      addTrack(pts, walkingOnly, ctx);
    } else {
      // Big Takeout files (hundreds of MB) are read a piece at a time.
      const reader = file.stream().getReader();
      const dec = new TextDecoder();
      let rest = '', read = 0, lastShown = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        read += value.length;
        const pts = [];
        rest = readPoints(rest + dec.decode(value, { stream: true }), pts, false);
        count += pts.length;
        addTrack(pts, walkingOnly, ctx);
        if (read - lastShown > 4e6) { lastShown = read; progress(read / file.size); await new Promise((r) => setTimeout(r)); }
      }
      const pts = [];
      readPoints(rest + dec.decode(), pts, true);
      count += pts.length;
      addTrack(pts, walkingOnly, ctx);
    }
  } catch (e) {
    closeModal();
    toast('Couldn’t read that file');
    return;
  }
  walkChanged();
  closeModal();
  const added = walkDb.cells.size - before;
  if (!count) {
    modal(`<div class="dialog"><h2>No places in that file</h2>
      <p>Globetrot reads Google Maps Timeline exports (Timeline.json), Google Takeout location history (Records.json and the monthly files), GPX and KML.</p>
      <div class="row-btns"><button class="btn primary" data-m="ok">OK</button></div></div>`, {});
    return;
  }
  const now = exploredByCountry();
  const fresh = [...now.keys()].filter((cc) => !visited(cc));
  modal(`<div class="dialog">
    <h2>🥾 ${fmt(added)} new km² explored</h2>
    <p>${fmt(count)} places read${walkingOnly ? ', keeping only walking pace' : ''}. You've now explored ${fmt(exploredCount())} km² in ${now.size} ${now.size === 1 ? 'country' : 'countries'}.${fresh.length ? ` ${fresh.length} of them ${fresh.length === 1 ? 'isn’t' : 'aren’t'} on your map yet:` : ''}</p>
    ${fresh.length ? `<div class="flag-row">${fresh.map((id) => `<span title="${esc(BY_ID[id].n)}">${flag(id)}</span>`).join('')}</div>` : ''}
    <div class="row-btns">
      ${fresh.length ? `<button class="btn" data-m="close">Not now</button><button class="btn primary" data-m="ok">Mark ${fresh.length === 1 ? 'it' : 'all ' + fresh.length} as been</button>` : '<button class="btn primary" data-m="show">Show me</button>'}
    </div></div>`, {
    ok: () => { markBeen(fresh); wkFit(); return true; },
    show: () => { wkFit(); return true; },
  });
}

function importDialog() {
  modal(`<div class="dialog">
    <h2>Import where you've been</h2>
    <p>Light up years of walks at once from your location history:</p>
    <ul class="howto">
      <li><b>Google Maps Timeline</b>: on your phone, Settings → Location → Location services → Timeline → <i>Export Timeline data</i>.</li>
      <li><b>Google Takeout</b> location history (Records.json or the monthly files).</li>
      <li><b>GPX or KML</b> from Strava, Garmin, Komoot and other trackers.</li>
    </ul>
    <label class="check"><input type="checkbox" id="walk-only" checked> Only places I walked or cycled (skip driving, trains and flights)</label>
    <div class="row-btns"><button class="btn" data-m="cancel">Cancel</button><button class="btn primary" data-m="pick">Choose file</button></div>
  </div>`, {
    pick: () => {
      importWalkingOnly = $('#walk-only').checked;
      $('#history-in').click();
      return true;
    },
  });
}
let importWalkingOnly = true;
$('#history-in').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) importHistory(f, importWalkingOnly);
});

// ---------------------------------------------------------------- following where you go

// On Android a foreground service (TrackService) follows you all the time,
// using the phone's low-power location, and restarts itself after a reboot.
// It writes fixes to a file; the page collects them whenever it's open. In a
// browser, the page can only follow you while it's open.
let geoWatch = null;
let trackPoll = 0;
let here = null; // {lat, lon, acc, t}
let photosAfterTracking = false;

// {enabled, running, precise, background, notifications, battery, highAccuracy, todayKm}
function trackState() {
  if (Native?.trackState) {
    try { return JSON.parse(Native.trackState()) || {}; } catch (e) { return {}; }
  }
  return { enabled: walkDb.track, running: geoWatch !== null, precise: true, background: true, notifications: true, battery: true, browser: true };
}

function startTracking() {
  walkDb.track = true;
  saveWalks();
  if (Native?.trackStart) {
    Native.trackStart(!!walkDb.highAccuracy);
    return;
  }
  if (!navigator.geolocation) {
    toast('This browser can’t follow where you go');
    return;
  }
  watchInBrowser();
  trackOn(true);
}
function watchInBrowser() {
  if (geoWatch !== null) return;
  geoWatch = navigator.geolocation.watchPosition(
    (pos) => {
      const p = { lat: pos.coords.latitude, lon: pos.coords.longitude, t: pos.timestamp || Date.now() };
      here = { ...p, acc: pos.coords.accuracy };
      if (!(pos.coords.accuracy > 150)) addLive([p]);
      else wkDraw();
    },
    () => { stopTracking(); toast('Globetrot needs your location to map where you go'); },
    { enableHighAccuracy: true, maximumAge: 10000 },
  );
}
// Tracking is running: collect points every few seconds while the page is open.
function trackOn(announce) {
  clearInterval(trackPoll);
  trackPoll = setInterval(() => { if (!document.hidden) collectPoints(); }, 5000);
  updateTrackButton();
  if (announce) toast('Globetrot is mapping where you go. Squares light up as you move');
  if (photosAfterTracking) {
    photosAfterTracking = false;
    scanPhone(false);
    showScanProgress(0, 0);
  }
}
function stopTracking() {
  walkDb.track = false;
  saveWalks();
  if (Native?.trackStop) Native.trackStop();
  if (geoWatch !== null) { navigator.geolocation.clearWatch(geoWatch); geoWatch = null; }
  collectPoints();
  clearInterval(trackPoll);
  updateTrackButton();
}

window.onWalkEvent = (json) => {
  let ev;
  try { ev = JSON.parse(json); } catch (e) { return; }
  const afterRefusal = () => {
    walkDb.track = false;
    saveWalks();
    updateTrackButton();
    if (photosAfterTracking) { photosAfterTracking = false; scanPhone(false); showScanProgress(0, 0); }
  };
  if (ev.state === 'on') trackOn(true);
  else if (ev.state === 'off') { clearInterval(trackPoll); updateTrackButton(); }
  else if (ev.state === 'denied') { afterRefusal(); toast('Globetrot needs your location to map where you go'); }
  else if (ev.state === 'coarse') {
    afterRefusal();
    modal(`<div class="dialog"><h2>Precise location needed</h2>
      <p>With approximate location Android only says roughly where you are (a few km), which isn't enough to light up the right squares. Allow <b>precise</b> location for Globetrot in its app settings.</p>
      <div class="row-btns"><button class="btn" data-m="cancel">Not now</button><button class="btn primary" data-m="ok">Open settings</button></div></div>`, {
      ok: () => { Native?.openAppSettings?.(); return true; },
    });
  } else if (ev.state === 'background') {
    toast(ev.granted ? 'Globetrot will keep mapping, even after a restart' : 'Mapping works while Globetrot was opened since the last restart');
    updateTrackButton();
  } else if (ev.state === 'error') { afterRefusal(); toast('Couldn’t start following your location'); }
  else if (ev.state === 'here') {
    here = { lat: ev.lat, lon: ev.lon, acc: ev.acc, t: Date.now() };
    if (locating) { locating = false; wkGoTo(here.lat, here.lon, Math.max(wcam.z, 14)); }
    wkDraw();
  } else if (ev.state === 'nofix') toast('Couldn’t find where you are. Is location on?');
};

// Points the Android service recorded since we last looked.
function collectPoints() {
  if (!Native?.walkTake) return;
  const text = Native.walkTake();
  if (!text) return;
  const pts = [];
  for (const line of text.split('\n')) {
    const [t, lat, lon, acc] = line.split(',').map(Number);
    if (!isFinite(lat) || !isFinite(lon)) continue;
    pts.push({ lat, lon, t });
    here = { lat, lon, acc, t };
  }
  addLive(pts);
}

// Today's distance only counts points from today; the trail itself is kept whatever the date.
function addLive(pts) {
  if (!pts.length) return;
  const ctx = addTrack(pts, walkDb.walkOnly, { last: walkDb.last, added: [] });
  walkDb.last = ctx.last && { lat: ctx.last.lat, lon: ctx.last.lon, t: ctx.last.t };
  const today = new Date().toDateString();
  if (walkDb.day !== today) { walkDb.day = today; walkDb.dayKm = 0; }
  const lastT = ctx.last?.t;
  if (!lastT || new Date(lastT).toDateString() === today) walkDb.dayKm += ctx.km;
  walkDb.totalKm += ctx.km;
  walkChanged();
  updateTrackButton();
  if (walkDb.autoMark && ctx.added.length) autoMarkFrom(ctx.added);
}

// Being seen somewhere marks that country as been, with a way back.
function autoMarkFrom(keys) {
  const fresh = new Set();
  for (const k of keys) {
    const [s, w, n, e] = cellBounds(k);
    const cc = countryAt(...project((w + e) / 2, (s + n) / 2));
    if (cc && !visited(cc)) fresh.add(cc);
  }
  if (fresh.size) markBeen([...fresh], true);
}

window.onAppResume = () => {
  collectPoints();
  const st = trackState();
  // Paused from the notification, or stopped by Android, while the page was away.
  if (!Native) return;
  if (st.running) trackOn(false); else clearInterval(trackPoll);
  if (!st.enabled && walkDb.track) { walkDb.track = false; saveWalks(); }
  updateTrackButton();
  photosOnResume();
};

function updateTrackButton() {
  const b = $('#track-btn');
  if (!b) return;
  const st = trackState();
  const today = walkDb.day === new Date().toDateString() ? walkDb.dayKm : 0;
  const mode = st.running ? 'on' : walkDb.track ? 'paused' : 'off';
  b.dataset.mode = mode;
  $('span', b).textContent = mode === 'on' ? `Mapping where you go · ${today.toFixed(1)} km today`
    : mode === 'paused' ? 'Mapping paused · tap to resume' : 'Map where I go, automatically';
  // The one thing most worth fixing, if any.
  const warn = $('#track-warn');
  if (warn) {
    let msg = '';
    if (mode === 'on' && st.background === false) msg = '⚠️ Allow location <b>all the time</b> so mapping carries on after a restart';
    else if (mode === 'on' && st.battery === false) msg = '🔋 Let Globetrot run in the background so your phone doesn’t stop it';
    warn.innerHTML = msg;
    warn.hidden = !msg || currentTab !== 'walks';
    warn.dataset.fix = st.background === false ? 'background' : 'battery';
  }
}

function trackSheet() {
  const st = trackState();
  const row = (ok, text, fix) => `<div class="perm${ok ? ' ok' : ''}"><span>${ok ? '✓' : '!'}</span><p>${text}</p>${!ok && fix ? `<button class="chip-btn" data-m="${fix}">Fix</button>` : ''}</div>`;
  modal(`<div class="dialog">
    <h2>📍 Mapping where you go</h2>
    <p>Globetrot follows your location in the background with the phone's low-power location, and lights up every 1 km square you pass through. It never leaves your phone.</p>
    ${Native ? `<div class="perms">
      ${row(st.precise !== false, 'Precise location', 'settings')}
      ${row(st.background !== false, 'Allowed all the time (keeps going after a restart)', 'background')}
      ${row(st.battery !== false, 'Not stopped to save battery', 'battery')}
    </div>` : '<p class="fine">In a browser Globetrot can only follow you while this page is open.</p>'}
    <label class="check"><input type="checkbox" id="opt-walk" ${walkDb.walkOnly ? 'checked' : ''}> Only walking and cycling (leave out cars, trains and flights)</label>
    <label class="check"><input type="checkbox" id="opt-auto" ${walkDb.autoMark ? 'checked' : ''}> Add countries to my map when I'm there</label>
    ${Native ? `<label class="check"><input type="checkbox" id="opt-gps" ${st.highAccuracy ? 'checked' : ''}> Use GPS for sharper trails (uses more battery)</label>` : ''}
    <div class="row-btns"><button class="btn danger" data-m="pause">Turn off</button><button class="btn primary" data-m="ok">Done</button></div>
  </div>`, {
    ok: () => { saveTrackOptions(); return true; },
    pause: () => { saveTrackOptions(); stopTracking(); toast('Mapping turned off'); return true; },
    background: () => { Native.askBackground?.(); return true; },
    battery: () => { Native.askBattery?.(); return true; },
    settings: () => { Native.openAppSettings?.(); return true; },
  });
}
function saveTrackOptions() {
  walkDb.walkOnly = $('#opt-walk').checked;
  walkDb.autoMark = $('#opt-auto').checked;
  const gps = $('#opt-gps');
  if (gps && gps.checked !== !!walkDb.highAccuracy) {
    walkDb.highAccuracy = gps.checked;
    Native?.setHighAccuracy?.(gps.checked);
  }
  saveWalks();
}

// First run: offer to fill the map in by itself.
function setupDialog() {
  modal(`<div class="dialog setup">
    <h2>🌍 Let Globetrot fill in your map</h2>
    <p>It can work out where you've been by itself. Everything stays on your phone.</p>
    <label class="check"><input type="checkbox" id="su-track" checked> <span><b>Map where I go.</b> Follows you in the background and lights up every street you walk, 1 km at a time. Uses the phone's low-power location.</span></label>
    ${canScan() ? `<label class="check"><input type="checkbox" id="su-photos" checked> <span><b>Look at my photos.</b> Puts every photo with a location on the map and lights up where it was taken.</span></label>` : ''}
    <label class="check"><input type="checkbox" id="su-auto" checked> <span><b>Add countries automatically</b> when you're seen there.</span></label>
    <div class="row-btns"><button class="btn" data-m="later">Not now</button><button class="btn primary" data-m="ok">Turn on</button></div>
  </div>`, {
    ok: () => {
      const track = $('#su-track').checked, photos = !!$('#su-photos')?.checked;
      walkDb.autoMark = $('#su-auto').checked;
      walkDb.setup = true;
      saveWalks();
      if (track) {
        photosAfterTracking = photos;
        startTracking();
      } else if (photos) {
        scanPhone(false);
        showScanProgress(0, 0);
        return false;
      }
      return true;
    },
    later: () => { walkDb.setup = true; saveWalks(); return true; },
  });
}

// Photos are looked at again whenever the app comes back, at most every 15 minutes.
let lastPhotoLook = Date.now();
function photosOnResume() {
  if (!canScan() || !photoDb.scanned || Date.now() - lastPhotoLook < 15 * 60000) return;
  if (Native.hasPhotoAccess?.() !== 'yes') return;
  lastPhotoLook = Date.now();
  scanPhone(true);
}

let locating = false;
function locateMe() {
  locating = true;
  if (here && Date.now() - here.t < 60000) { locating = false; wkGoTo(here.lat, here.lon, Math.max(wcam.z, 14)); }
  if (Native?.locate) { Native.locate(); return; }
  navigator.geolocation?.getCurrentPosition((pos) => {
    window.onWalkEvent(JSON.stringify({ state: 'here', lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy }));
  }, () => { locating = false; toast('Couldn’t find where you are'); }, { enableHighAccuracy: true, timeout: 15000 });
}

// ---------------------------------------------------------------- the Walks map

const wkView = $('#view-walks');
const wkBase = $('#wk-base');
const wkFog = $('#wk-fog');
const wcam = { x: 128, y: 128, z: 2 };
let wvw = 0, wvh = 0, dpr = 1, wkRaf = 0;

function wkMeasure() {
  const r = wkView.getBoundingClientRect();
  wvw = r.width || window.innerWidth;
  wvh = r.height || window.innerHeight;
  dpr = Math.min(3, window.devicePixelRatio || 1);
  for (const c of [wkBase, wkFog]) {
    c.width = Math.round(wvw * dpr);
    c.height = Math.round(wvh * dpr);
  }
}
const wkMinZoom = () => Math.log2(Math.max(wvw, wvh * 0.6) / 256);
function wkClamp() {
  wcam.z = clampN(wcam.z, wkMinZoom(), 19);
  const S = 2 ** wcam.z, halfW = wvw / 2 / S, halfH = wvh / 2 / S;
  wcam.x = 256 <= halfW * 2 ? 128 : clampN(wcam.x, halfW, 256 - halfW);
  wcam.y = 256 <= halfH * 2 ? 128 : clampN(wcam.y, halfH, 256 - halfH);
}
function wkDraw() {
  if (currentTab !== 'walks' || wkRaf) return;
  wkRaf = requestAnimationFrame(wkRender);
}
let camSaveTimer = 0;
function wkRender() {
  wkRaf = 0;
  const S = 2 ** wcam.z;
  const b = wkBase.getContext('2d');
  b.setTransform(dpr, 0, 0, dpr, 0, 0);
  b.fillStyle = '#0b1328';
  b.fillRect(0, 0, wvw, wvh);
  if (walkDb.streets) drawTiles(b, S); else drawOutlines(b, S);
  drawFog(S);
  $('#wk-attr').hidden = !walkDb.streets;
  // The offline outlines are far too rough for a city, so offer the streets up close.
  $('#wk-streets').hidden = walkDb.streets || wcam.z < 9 || !$('#wk-intro').hidden;
  clearTimeout(camSaveTimer);
  camSaveTimer = setTimeout(() => { walkDb.cam = { ...wcam }; saveWalks(); }, 500);
}

// Offline: the country outlines from world.js, turned into Mercator once.
let outlines = null;
function buildOutlines() {
  outlines = COUNTRIES.map((c) => {
    const p = new Path2D();
    for (const ring of c.d.split('M')) {
      if (!ring) continue;
      let first = true;
      for (const pt of ring.replace(/Z/g, '').split('L')) {
        const [x, y] = pt.split(',').map(Number);
        if (!isFinite(x)) continue;
        const [lon, lat] = unproject(x, y);
        const [mx, my] = merc(lat, lon);
        if (first) { p.moveTo(mx, my); first = false; } else p.lineTo(mx, my);
      }
      p.closePath();
    }
    return { id: c.id, p };
  });
}
function drawOutlines(b, S) {
  if (!outlines) buildOutlines();
  b.setTransform(dpr * S, 0, 0, dpr * S, dpr * (wvw / 2 - wcam.x * S), dpr * (wvh / 2 - wcam.y * S));
  b.lineWidth = 1 / S;
  b.strokeStyle = '#33426d';
  for (const o of outlines) {
    b.fillStyle = visited(o.id) ? '#1d4a4a' : '#1f2a4a';
    b.fill(o.p);
    b.stroke(o.p);
  }
  b.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Online: street map pictures, with a blurry parent standing in while a tile loads.
const tiles = new Map();
function tile(z, x, y) {
  const key = z + '/' + x + '/' + y;
  let t = tiles.get(key);
  if (t) { tiles.delete(key); tiles.set(key, t); return t; } // most recently used last
  t = { img: new Image(), ok: false };
  t.img.onload = () => { t.ok = true; wkDraw(); };
  t.img.src = TILE_URL(z, x, y, dpr > 1.4);
  tiles.set(key, t);
  if (tiles.size > 400) tiles.delete(tiles.keys().next().value);
  return t;
}
function drawTiles(b, S) {
  const tz = clampN(Math.round(wcam.z), 1, 19);
  const n = 2 ** tz, span = 256 / n, size = span * S;
  const left = wcam.x - wvw / 2 / S, top = wcam.y - wvh / 2 / S;
  const x0 = Math.max(0, Math.floor(left / span)), x1 = Math.min(n - 1, Math.floor((left + wvw / S) / span));
  const y0 = Math.max(0, Math.floor(top / span)), y1 = Math.min(n - 1, Math.floor((top + wvh / S) / span));
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const sx = (x * span - left) * S, sy = (y * span - top) * S;
      const t = tile(tz, x, y);
      if (t.ok) { b.drawImage(t.img, sx, sy, size + 0.5, size + 0.5); continue; }
      for (let up = 1; up <= 4 && tz - up >= 0; up++) {
        const px = x >> up, py = y >> up, k = tiles.get((tz - up) + '/' + px + '/' + py);
        if (k?.ok) {
          const part = k.img.naturalWidth / (1 << up);
          b.drawImage(k.img, (x - (px << up)) * part, (y - (py << up)) * part, part, part, sx, sy, size + 0.5, size + 0.5);
          break;
        }
      }
    }
  }
}

// The fog, with a hole for every square you've been in. Squares too small to
// see as holes are drawn as bright specks instead.
function drawFog(S) {
  const f = wkFog.getContext('2d');
  f.setTransform(dpr, 0, 0, dpr, 0, 0);
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, wvw, wvh);
  f.fillStyle = walkDb.streets ? 'rgba(6, 10, 22, 0.8)' : 'rgba(6, 10, 22, 0.6)';
  f.fillRect(0, 0, wvw, wvh);
  const r = exploredMerc();
  const holes = new Path2D(), specks = new Path2D();
  let anyHole = false, anySpeck = false;
  const seen = new Set();
  const ox = wvw / 2 - wcam.x * S, oy = wvh / 2 - wcam.y * S;
  for (let i = 0; i < r.length; i += 4) {
    const sx0 = r[i] * S + ox, sx1 = r[i + 2] * S + ox;
    if (sx1 < -4 || sx0 > wvw + 4) continue;
    const sy0 = r[i + 1] * S + oy, sy1 = r[i + 3] * S + oy;
    if (sy1 < -4 || sy0 > wvh + 4) continue;
    const w = sx1 - sx0;
    if (w >= 4) {
      holes.rect(sx0 - 0.5, sy0 - 0.5, w + 1, sy1 - sy0 + 1);
      anyHole = true;
    } else {
      const cx = (sx0 + sx1) / 2, cy = (sy0 + sy1) / 2, k = (Math.round(cx / 2) << 13) + Math.round(cy / 2);
      if (seen.has(k)) continue;
      seen.add(k);
      specks.rect(cx - 1.75, cy - 1.75, 3.5, 3.5);
      anySpeck = true;
    }
  }
  if (anyHole) {
    f.globalCompositeOperation = 'destination-out';
    f.fillStyle = '#000'; // only the alpha matters, and it must be solid to clear completely
    f.fill(holes);
    f.globalCompositeOperation = 'source-over';
    f.fillStyle = walkDb.streets ? 'rgba(46, 211, 167, 0.1)' : 'rgba(46, 211, 167, 0.22)';
    f.fill(holes);
    f.strokeStyle = 'rgba(46, 211, 167, 0.35)';
    f.lineWidth = 1;
    f.stroke(holes);
  }
  if (anySpeck) {
    f.fillStyle = '#5ff0c9';
    f.fill(specks);
  }
  if (here) {
    const [hx, hy] = merc(here.lat, here.lon);
    const sx = hx * S + ox, sy = hy * S + oy;
    const accPx = Math.min(200, (here.acc || 0) / (40075016 * Math.cos(here.lat * DEG) / 256) * S);
    f.fillStyle = 'rgba(77, 163, 255, 0.18)';
    f.beginPath(); f.arc(sx, sy, Math.max(accPx, 12), 0, Math.PI * 2); f.fill();
    f.fillStyle = '#4da3ff'; f.strokeStyle = '#fff'; f.lineWidth = 2.5;
    f.beginPath(); f.arc(sx, sy, 7, 0, Math.PI * 2); f.fill(); f.stroke();
  }
}

function wkZoom(factor, sx, sy) {
  const S = 2 ** wcam.z;
  const wx = wcam.x + (sx - wvw / 2) / S, wy = wcam.y + (sy - wvh / 2) / S;
  wcam.z = clampN(wcam.z + Math.log2(factor), wkMinZoom(), 19);
  const S2 = 2 ** wcam.z;
  wcam.x = wx - (sx - wvw / 2) / S2;
  wcam.y = wy - (sy - wvh / 2) / S2;
  wkClamp();
  wkDraw();
}
let wkAnim = 0;
function wkAnimate(to, ms = 700) {
  cancelAnimationFrame(wkAnim);
  const from = { ...wcam }, t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    wcam.z = from.z + (to.z - from.z) * e;
    wcam.x = from.x + (to.x - from.x) * e;
    wcam.y = from.y + (to.y - from.y) * e;
    wkClamp();
    wkRender();
    if (t < 1) wkAnim = requestAnimationFrame(step);
  };
  wkAnim = requestAnimationFrame(step);
}
function wkGoTo(lat, lon, z) {
  const [x, y] = merc(lat, lon);
  wkAnimate({ x, y, z });
}
// Frame some Mercator rectangles (all the squares, or one country's).
function wkFitRects(r) {
  if (!r.length) return false;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < r.length; i += 4) {
    x0 = Math.min(x0, r[i]); y0 = Math.min(y0, r[i + 1]); x1 = Math.max(x1, r[i + 2]); y1 = Math.max(y1, r[i + 3]);
  }
  const z = Math.min(15, Math.log2(Math.min(wvw * 0.8 / (x1 - x0), (wvh - 200) * 0.8 / (y1 - y0))));
  wkAnimate({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z });
  return true;
}
function wkFit(cc) {
  if (currentTab !== 'walks') showTab('walks');
  if (!wvw) wkMeasure();
  let r = exploredMerc();
  if (cc) {
    const e = explored(), ne = exploredNe(), keep = [];
    for (let i = 0; i < e.keys.length; i++) if (countryAt(ne[i * 2], ne[i * 2 + 1]) === cc) keep.push(...r.slice(i * 4, i * 4 + 4));
    r = keep;
    if (!r.length) {
      const c = BY_ID[cc];
      const [w, n] = unproject(c.b[0], c.b[1]), [e2, s] = unproject(c.b[2], c.b[3]);
      r = [...merc(n, w), ...merc(s, e2)];
    }
  }
  wkFitRects(r);
}

// Touch: one finger pans, two pinch, double tap zooms, mouse wheel zooms.
function attachPanZoom(el, h) {
  const pts = new Map();
  let pinch = null, tap = null, lastTap = null, fling = 0;
  const local = (e) => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    cancelAnimationFrame(fling);
    h.stop();
    const p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size === 1) tap = { ...p, moved: false, track: [{ ...p, t: performance.now() }] };
    else if (pts.size === 2) {
      tap = null;
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  });
  el.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId), p = local(e);
    pts.set(e.pointerId, p);
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      h.pan(x - pinch.x, y - pinch.y);
      h.zoom(d / pinch.d, x, y);
      pinch = { d, x, y };
      return;
    }
    if (tap && !tap.moved && Math.hypot(p.x - tap.x, p.y - tap.y) > 9) tap.moved = true;
    if (!tap || tap.moved) {
      h.pan(p.x - prev.x, p.y - prev.y);
      if (tap) {
        const now = performance.now();
        tap.track.push({ ...p, t: now });
        while (tap.track.length > 2 && now - tap.track[0].t > 90) tap.track.shift();
      }
    }
  });
  const end = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size) { pinch = null; tap = null; return; }
    const t = tap;
    tap = null;
    pinch = null;
    if (!t) return;
    const p = local(e);
    if (!t.moved && e.type === 'pointerup') {
      const now = performance.now();
      if (lastTap && now - lastTap.t < 300 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 30) { lastTap = null; h.zoom(2, p.x, p.y); }
      else lastTap = { ...p, t: now };
      return;
    }
    const a = t.track[0], b = t.track[t.track.length - 1];
    if (!a || !b || performance.now() - b.t > 60) return;
    let vx = (b.x - a.x) / Math.max(16, b.t - a.t), vy = (b.y - a.y) / Math.max(16, b.t - a.t);
    if (Math.hypot(vx, vy) < 0.25) return;
    let last = performance.now();
    const step = (now) => {
      const ms = now - last;
      last = now;
      h.pan(vx * ms, vy * ms);
      const decay = Math.pow(0.94, ms / 16);
      vx *= decay; vy *= decay;
      if (Math.hypot(vx, vy) > 0.02) fling = requestAnimationFrame(step);
    };
    fling = requestAnimationFrame(step);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    h.zoom(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018)), p.x, p.y);
  }, { passive: false });
}
attachPanZoom(wkFog, {
  stop: () => cancelAnimationFrame(wkAnim),
  pan: (dx, dy) => { const S = 2 ** wcam.z; wcam.x -= dx / S; wcam.y -= dy / S; wkClamp(); wkDraw(); },
  zoom: wkZoom,
});

function wkOpen() {
  wkMeasure();
  if (walkDb.cam) Object.assign(wcam, walkDb.cam);
  else if (!wkFitRects(exploredMerc())) Object.assign(wcam, { x: 128, y: 100, z: wkMinZoom() });
  wkClamp();
  $('#wk-km').textContent = fmt(exploredCount());
  $('#wk-intro').hidden = walkDb.intro;
  collectPoints();
  updateTrackButton();
  wkRender();
}
window.addEventListener('resize', () => { if (currentTab === 'walks') { wkMeasure(); wkClamp(); wkDraw(); } });

wkView.addEventListener('click', (e) => {
  const b = e.target.closest('[data-w]');
  if (!b) return;
  const a = b.dataset.w;
  if (a === 'track') {
    const mode = $('#track-btn').dataset.mode;
    if (mode === 'on') trackSheet(); else startTracking();
  } else if (a === 'fix') {
    if ($('#track-warn').dataset.fix === 'background') Native?.askBackground?.(); else Native?.askBattery?.();
  }
  else if (a === 'locate') locateMe();
  else if (a === 'streets-on') {
    modal(`<div class="dialog"><h2>🗺️ Show streets?</h2>
      <p>The street map is downloaded from OpenStreetMap (drawn by CARTO) as you look around, so it needs the internet. Only map pictures are downloaded; where you've walked never leaves your phone.</p>
      <div class="row-btns"><button class="btn" data-m="cancel">Not now</button><button class="btn primary" data-m="ok">Show streets</button></div></div>`, {
      ok: () => { walkDb.streets = true; saveWalks(); wkDraw(); return true; },
    });
  }
  else if (a === 'menu') walkMenu();
  else if (a === 'fit') { if (!wkFitRects(exploredMerc())) toast('Nothing explored yet. Turn on mapping or import your history'); }
  else if (a === 'intro-ok' || a === 'intro-track' || a === 'intro-import' || a === 'intro-streets') {
    walkDb.intro = true;
    saveWalks();
    $('#wk-intro').hidden = true;
    if (a === 'intro-track') startTracking();
    if (a === 'intro-import') importDialog();
    if (a === 'intro-streets') { walkDb.streets = true; saveWalks(); wkDraw(); }
  }
});

function walkMenu() {
  modal(`<div class="dialog">
    <h2>🥾 Walks</h2>
    <p>${fmt(exploredCount())} km² explored${walkDb.totalKm ? ` · ${walkDb.totalKm.toFixed(1)} km travelled on foot` : ''}.</p>
    <div class="menu">
      <button class="btn" data-m="track">${trackState().running ? 'Mapping settings' : 'Map where I go, automatically'}</button>
      <button class="btn" data-m="import">Import location history</button>
      <button class="btn" data-m="streets">${walkDb.streets ? 'Hide street map' : 'Show street map (uses the internet)'}</button>
      <button class="btn" data-m="photos">${walkDb.photos ? 'Don’t count photo locations' : 'Count photo locations'}</button>
      <button class="btn danger" data-m="clear">Clear explored areas</button>
    </div>
    <p class="fine">The street map is drawn from OpenStreetMap by CARTO and downloaded only while it's switched on. Where you've walked never leaves your phone.</p>
  </div>`, {
    import: () => { importDialog(); return false; },
    track: () => { if (trackState().running) trackSheet(); else { closeModal(); startTracking(); } return false; },
    streets: () => { walkDb.streets = !walkDb.streets; saveWalks(); wkDraw(); return true; },
    photos: () => { walkDb.photos = !walkDb.photos; saveWalks(); walkChanged(); return true; },
    clear: () => {
      modal(`<div class="dialog"><h2>Clear explored areas?</h2>
        <p>This forgets every square from where you’ve been followed and from imports. Squares from your photos come back while photo locations are counted.</p>
        <div class="row-btns"><button class="btn" data-m="cancel">Keep them</button><button class="btn primary" style="background:#ff6b6b;color:#2a0505" data-m="ok">Clear</button></div></div>`, {
        ok: () => { walkDb.cells = new Set(); walkDb.last = null; walkDb.totalKm = 0; walkDb.dayKm = 0; walkChanged(); return true; },
      });
      return false;
    },
  });
}

// ---------------------------------------------------------------- the world map's specks

const speckCanvas = $('#walk-specks');
let speckShown = false;
function drawSpecks() {
  const e = explored();
  const g = speckCanvas.getContext('2d');
  const sd = Math.min(3, window.devicePixelRatio || 1);
  const w = Math.round(vw * sd), h = Math.round(vh * sd);
  if (speckCanvas.width !== w || speckCanvas.height !== h) { speckCanvas.width = w; speckCanvas.height = h; }
  else if (speckShown) g.clearRect(0, 0, w, h);
  speckShown = false;
  if (!e.keys.length) return;
  const ne = exploredNe();
  g.setTransform(sd, 0, 0, sd, 0, 0);
  const size = Math.max(2.2, 0.06 * cam.k);
  const half = size / 2;
  const p = new Path2D();
  const seen = new Set();
  for (let i = 0; i < ne.length; i += 2) {
    const x = ne[i] * cam.k + cam.x, y = ne[i + 1] * cam.k + cam.y;
    if (x < -size || y < -size || x > vw + size || y > vh + size) continue;
    if (size < 4) {
      const k = (Math.round(x / 1.5) << 13) + Math.round(y / 1.5);
      if (seen.has(k)) continue;
      seen.add(k);
    }
    p.rect(x - half, y - half, size, size);
  }
  g.fillStyle = 'rgba(255, 255, 255, 0.92)';
  g.shadowColor = 'rgba(0, 0, 0, 0.6)';
  g.shadowBlur = size < 4 ? 0 : 3;
  g.fill(p);
  speckShown = true;
}

// ---------------------------------------------------------------- bits for the other screens

function walkSheetHtml(id) {
  const km2 = exploredByCountry().get(id) || 0;
  const c = BY_ID[id];
  const pct = km2 / Math.max(1, c.a) * 100;
  return `<div class="sh-sec"><h3>Explored</h3>
    <div class="walk-line"><span>🥾 <b>${fmt(km2)} km²</b> walked through${km2 ? ` · ${pct < 0.01 ? '<0.01' : pct < 1 ? pct.toFixed(2) : pct.toFixed(1)}% of ${esc(c.n)}` : ''}</span>
    <button class="chip-btn" data-a="walk-map">Show</button></div></div>`;
}

function walkCard() {
  const n = exploredCount();
  if (!n) {
    return `<div class="card"><h3>Walks</h3>
      <p class="muted">Light up the places you've actually been, 1 km square by square: let Globetrot map where you go, or import your Google Maps Timeline.</p>
      <div class="actions" style="margin-top:12px">${walkDb.track ? '' : '<button class="btn primary" data-a="track-on">📍 Map where I go</button>'}<button class="btn${walkDb.track ? ' primary' : ''}" data-a="walks"${walkDb.track ? '' : ' style="grid-column:span 2"'}>🥾 Open the Walks map</button></div></div>`;
  }
  const by = [...exploredByCountry().entries()].sort((a, b) => b[1] - a[1]);
  const top = by.slice(0, 5);
  const max = top[0]?.[1] || 1;
  return `<div class="card"><h3>Walks · ${fmt(n)} km² explored</h3>
    ${top.map(([cc, k]) => `<div class="cont-row"><span class="ce">${flag(cc)}</span><span class="cn">${esc(BY_ID[cc].n)}</span>
      <span class="cc">${fmt(k)} km²</span><div class="bar"><i style="width:${(k / max * 100).toFixed(1)}%"></i></div></div>`).join('')}
    ${by.length > 5 ? `<p class="muted">and ${by.length - 5} more ${by.length - 5 === 1 ? 'country' : 'countries'}</p>` : ''}
    <p class="muted" style="margin-top:8px">${walkDb.track ? '<span style="color:var(--been)">●</span> Globetrot is mapping where you go.' : 'Mapping where you go is off.'}</p>
    <div class="actions" style="margin-top:10px">${walkDb.track ? '' : '<button class="btn" data-a="track-on">📍 Map where I go</button>'}<button class="btn primary" data-a="walks">🥾 Open the Walks map</button></div></div>`;
}

function walkBackup() {
  return encodeCells(walkDb.cells);
}
function walkRestore(str) {
  walkDb.cells = decodeCells(str);
  walkChanged();
}

function startWalks() {
  collectPoints();
  const st = trackState();
  if (st.running) trackOn(false);
  else if (walkDb.track && Native) {
    // Wanted but not running (stopped by Android, or after a restart without
    // "all the time" permission): starting it again from the open app is allowed.
    if (st.enabled !== false) startTracking();
    else { walkDb.track = false; saveWalks(); }
  } else if (walkDb.track && !Native && navigator.permissions) {
    // A browser that already allowed location can carry on following without asking.
    navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') { watchInBrowser(); trackOn(false); } }).catch(() => {});
  }
  updateTrackButton();
  draw();
  if (!walkDb.setup) setTimeout(() => { if (modalEl.hidden) setupDialog(); }, 600);
}
document.addEventListener('DOMContentLoaded', startWalks);
