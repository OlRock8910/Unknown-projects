// Photos on the map. On Android the app can look through the phone's photos
// (Native.scanPhotos) and place every one that has a location where it was
// taken. Anywhere, photos can also be added by hand: ones with a location go
// where they were taken, others go in the country they were added to.
// Gallery photos stay in the phone's gallery and are only read; added photos
// are copied into the app (Native.savePhoto, or IndexedDB in a browser).
// Loaded after app.js and uses its globals ($, BY_ID, cam, modal…).
'use strict';

const PHOTO_BASE = 'https://globetrot.local/';
const PHOTO_KEY = 'globetrot.photos';

// g: gallery photos [id, x, y, taken, country, lat, lon]; a: added photos
// [id, x, y, taken, country, hasGps, lat, lon]. x/y are map units; lat/lon are
// missing on photos saved by version 1.1. hidden: gallery ids taken off the map. skip: countries the user
// said "not now" to after a scan.
let photoDb = loadPhotoDb();
let photoList = null; // every photo on the map, newest first, built on demand
const blobUrls = {}; // browser only: added photo name → object URL

function loadPhotoDb() {
  const out = { g: [], a: [], hidden: [], skip: [], show: true, scanned: false };
  try {
    const s = JSON.parse(localStorage.getItem(PHOTO_KEY));
    if (s && typeof s === 'object') {
      for (const k of ['g', 'a', 'hidden', 'skip']) if (Array.isArray(s[k])) out[k] = s[k];
      out.show = s.show !== false;
      out.scanned = !!s.scanned;
    }
  } catch (e) { /* first run */ }
  return out;
}
function savePhotoDb() {
  photoList = null;
  try { localStorage.setItem(PHOTO_KEY, JSON.stringify(photoDb)); } catch (e) { toast('Not enough room to save all your photos'); }
}

function allPhotos() {
  if (photoList) return photoList;
  const list = [];
  for (const [id, x, y, t, cc, lat, lon] of photoDb.g) list.push({ key: 'g' + id, src: 'g', id, x, y, t, cc: cc || '', gps: true, lat, lon });
  for (const [id, x, y, t, cc, gps, lat, lon] of photoDb.a) list.push({ key: 'a' + id, src: 'a', id, x, y, t, cc: cc || '', gps: !!gps, lat, lon });
  list.sort((p, q) => q.t - p.t);
  photoList = list;
  return list;
}
const photosIn = (cc) => allPhotos().filter((p) => p.cc === cc);

function photoUrl(p, big) {
  if (p.src === 'g') return `${PHOTO_BASE}g/${p.id}?s=${big ? 1600 : 320}`;
  const name = `${p.id}${big ? '' : '-t'}.jpg`;
  return Native?.savePhoto ? PHOTO_BASE + 'a/' + name : blobUrls[name] || '';
}

// ---------------------------------------------------------------- geography

// d3.geoNaturalEarth1 with the scale and offset world.js was drawn with.
function project(lon, lat) {
  const D = Math.PI / 180;
  const l = lon * D, f = lat * D, f2 = f * f, f4 = f2 * f2;
  const x = l * (0.8707 - 0.131979 * f2 + f4 * (-0.013791 + f4 * (0.003971 * f2 - 0.001529 * f4)));
  const y = f * (1.007226 + f2 * (0.015085 + f4 * (-0.044475 + 0.028874 * f2 - 0.005916 * f4)));
  const P = WORLD.proj;
  return [P.tx + P.k * x, P.ty - P.k * y];
}

// The inverse, by Newton's method on the latitude (as d3 does).
function unproject(x, y) {
  const P = WORLD.proj;
  const px = (x - P.tx) / P.k, py = (P.ty - y) / P.k;
  let f = py;
  for (let i = 0; i < 25; i++) {
    const f2 = f * f, f4 = f2 * f2;
    const delta = (f * (1.007226 + f2 * (0.015085 + f4 * (-0.044475 + 0.028874 * f2 - 0.005916 * f4))) - py) /
      (1.007226 + f2 * (0.015085 * 3 + f4 * (-0.044475 * 7 + 0.028874 * 9 * f2 - 0.005916 * 11 * f4)));
    f -= delta;
    if (Math.abs(delta) < 1e-9) break;
  }
  const f2 = f * f;
  const l = px / (0.8707 + f2 * (-0.131979 + f2 * (-0.013791 + f2 * f2 * f2 * (0.003971 - 0.001529 * f2))));
  return [l * 180 / Math.PI, f * 180 / Math.PI];
}

const hitCtx = document.createElement('canvas').getContext('2d');
const shapes = {};
const placeCache = new Map();
function inCountry(c, x, y) {
  if (x < c.b[0] || x > c.b[2] || y < c.b[1] || y > c.b[3]) return false;
  return hitCtx.isPointInPath(shapes[c.id] || (shapes[c.id] = new Path2D(c.d)), x, y);
}
// The country a map point falls in. Photos on a beach or a boat can land just
// off the simplified coastline, so look a little way around before giving up.
function countryAt(x, y) {
  const key = Math.round(x * 2) + ',' + Math.round(y * 2);
  if (placeCache.has(key)) return placeCache.get(key);
  let found = '';
  outer: for (const r of [0, 1.2, 2.5, 4.5]) {
    for (let i = 0; i < (r ? 12 : 1); i++) {
      const a = (i / 12) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      for (const c of COUNTRIES) if (inCountry(c, px, py)) { found = c.id; break outer; }
    }
  }
  placeCache.set(key, found);
  return found;
}

// ---------------------------------------------------------------- reading photos

// Pulls the date taken and GPS position out of a JPEG's EXIF block.
function readExif(buf) {
  try {
    const v = new DataView(buf);
    if (v.getUint16(0) !== 0xffd8) return {};
    let o = 2;
    while (o + 10 < v.byteLength) {
      const marker = v.getUint16(o);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
      if (marker === 0xffe1 && v.getUint32(o + 4) === 0x45786966) return parseTiff(v, o + 10);
      o += 2 + v.getUint16(o + 2);
    }
  } catch (e) { /* damaged file */ }
  return {};
}
function parseTiff(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = (p) => v.getUint16(p, le), u32 = (p) => v.getUint32(p, le);
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const ifd = (off) => {
    const out = {};
    const p = t + off;
    if (!off || p + 2 > v.byteLength) return out;
    for (let i = 0, n = u16(p); i < n; i++) {
      const e = p + 2 + i * 12;
      if (e + 12 > v.byteLength) break;
      out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
    }
    return out;
  };
  const where = (en) => ((SIZE[en.type] || 1) * en.count > 4 ? t + u32(en.at) : en.at);
  const text = (en) => {
    let s = '';
    for (let i = 0, p = where(en); i < en.count && p + i < v.byteLength; i++) {
      const ch = v.getUint8(p + i);
      if (!ch) break;
      s += String.fromCharCode(ch);
    }
    return s;
  };
  const dms = (en) => {
    const p = where(en);
    const r = (i) => { const d = u32(p + i * 8 + 4); return d ? u32(p + i * 8) / d : 0; };
    return r(0) + r(1) / 60 + r(2) / 3600;
  };
  const out = {};
  const ifd0 = ifd(u32(t + 4));
  if (ifd0[0x8769]) {
    const ex = ifd(u32(ifd0[0x8769].at));
    if (ex[0x9003]) out.date = text(ex[0x9003]);
  }
  if (!out.date && ifd0[0x0132]) out.date = text(ifd0[0x0132]);
  if (ifd0[0x8825]) {
    const g = ifd(u32(ifd0[0x8825].at));
    if (g[2] && g[4]) {
      let lat = dms(g[2]), lon = dms(g[4]);
      if (g[1] && text(g[1]).startsWith('S')) lat = -lat;
      if (g[3] && text(g[3]).startsWith('W')) lon = -lon;
      if (isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon)) {
        out.lat = lat;
        out.lon = lon;
      }
    }
  }
  return out;
}
function exifDate(s) {
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d)/.exec(s || '');
  return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime() : 0;
}

function jpeg(bmp, max, square) {
  const sw = bmp.width, sh = bmp.height;
  let sx = 0, sy = 0, cw = sw, ch = sh;
  if (square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2;
    sy = (sh - side) / 2;
    cw = ch = side;
  }
  const f = Math.min(1, max / Math.max(cw, ch));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(cw * f));
  cv.height = Math.max(1, Math.round(ch * f));
  cv.getContext('2d').drawImage(bmp, sx, sy, cw, ch, 0, 0, cv.width, cv.height);
  return new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.85));
}
const blobB64 = (blob) => new Promise((res) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.readAsDataURL(blob);
});

async function storeBlob(name, blob) {
  if (Native?.savePhoto) {
    Native.savePhoto(name, await blobB64(blob));
    return;
  }
  await idbDo('readwrite', (s) => s.put(blob, name));
  blobUrls[name] = URL.createObjectURL(blob);
}
function dropBlob(name) {
  if (Native?.deletePhoto) { Native.deletePhoto(name); return; }
  idbDo('readwrite', (s) => s.delete(name)).catch(() => {});
  if (blobUrls[name]) URL.revokeObjectURL(blobUrls[name]);
  delete blobUrls[name];
}

// Browser storage for added photos (the Android app keeps them as files instead).
let idbOpen = null;
function idbDo(mode, fn) {
  idbOpen ||= new Promise((res, rej) => {
    const r = indexedDB.open('globetrot', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return idbOpen.then((db) => new Promise((res, rej) => {
    const tx = db.transaction('photos', mode);
    const out = fn(tx.objectStore('photos'));
    tx.oncomplete = () => res(out?.result);
    tx.onerror = () => rej(tx.error);
  }));
}
async function loadBlobUrls() {
  if (Native?.savePhoto || !photoDb.a.length || !window.indexedDB) return;
  try {
    const db = await idbDo('readonly', () => null).then(() => idbOpen);
    await new Promise((res) => {
      const req = db.transaction('photos').objectStore('photos').openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) { res(); return; }
        blobUrls[c.key] = URL.createObjectURL(c.value);
        c.continue();
      };
      req.onerror = () => res();
    });
  } catch (e) { /* storage blocked */ }
  refreshPhotos();
}

let pickFor = '';
function pickPhotos(cc) {
  pickFor = cc || '';
  $('#photo-in').click();
}
$('#photo-in').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (files.length) await addPhotoFiles(files, pickFor);
});

async function addPhotoFiles(files, cc) {
  let added = 0, noPlace = 0, bad = 0;
  const touched = new Set();
  toast(`Adding ${files.length} photo${files.length > 1 ? 's' : ''}…`);
  for (const f of files) {
    let bmp;
    try { bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }); } catch (err) { bad++; continue; }
    const ex = readExif(await f.arrayBuffer());
    let x, y, where = cc;
    if (ex.lat != null) {
      [x, y] = project(ex.lon, ex.lat);
      where = countryAt(x, y) || cc;
    } else if (cc) {
      // No location: put it near the country's middle, a little scattered.
      const c = BY_ID[cc], a = Math.random() * Math.PI * 2, r = Math.random() * Math.min(6, (c.b[2] - c.b[0]) / 6);
      x = c.l[0] + Math.cos(a) * r;
      y = c.l[1] + Math.sin(a) * r;
    } else { noPlace++; bmp.close?.(); continue; }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    await storeBlob(id + '.jpg', await jpeg(bmp, 1600, false));
    await storeBlob(id + '-t.jpg', await jpeg(bmp, 320, true));
    bmp.close?.();
    const row = [id, +x.toFixed(2), +y.toFixed(2), exifDate(ex.date) || f.lastModified || Date.now(), where || '', ex.lat != null ? 1 : 0];
    if (ex.lat != null) row.push(+ex.lat.toFixed(6), +ex.lon.toFixed(6));
    photoDb.a.push(row);
    if (where) touched.add(where);
    added++;
  }
  savePhotoDb();
  refreshPhotos();
  const notes = [];
  if (noPlace) notes.push(`${noPlace} had no location. Add those from a country`);
  if (bad) notes.push(`${bad} couldn't be opened`);
  toast(`📷 Added ${added} photo${added === 1 ? '' : 's'}${notes.length ? '. ' + notes.join('; ') : ''}`);
  offerCountries([...touched], false);
}

// ---------------------------------------------------------------- scanning the phone (Android)

const canScan = () => !!Native?.scanPhotos;
let scanQuiet = false;

function scanPhone(quiet) {
  if (!canScan()) return;
  scanQuiet = quiet;
  Native.scanPhotos(!quiet);
}

window.onPhotoScan = (json) => {
  let ev;
  try { ev = JSON.parse(json); } catch (e) { return; }
  if (ev.state === 'progress') {
    if (!scanQuiet) showScanProgress(ev.done, ev.total);
  } else if (ev.state === 'denied') {
    if (!scanQuiet) {
      closeModal();
      toast('Globetrot needs to see your photos to find where they were taken');
    }
  } else if (ev.state === 'done') {
    finishScan(ev);
  }
};

function showScanProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const body = `<div class="dialog scan"><h2>📷 Looking through your photos</h2>
    <p>${fmt(done)} of ${fmt(total)} checked. The first time takes a minute; after that it's quick.</p>
    <div class="bar"><i style="width:${pct}%"></i></div></div>`;
  if (modalEl.hidden || !$('.dialog.scan', modalEl)) modal(body, {});
  else modalEl.innerHTML = body;
}

function finishScan(ev) {
  let rows = [];
  try { rows = JSON.parse(Native.photoScanResult() || '[]'); } catch (e) { rows = []; }
  const hidden = new Set(photoDb.hidden.map(String));
  const before = new Set(photoDb.g.map((r) => String(r[0])));
  photoDb.g = [];
  for (const [id, lat, lon, t] of rows) {
    if (hidden.has(String(id))) continue;
    const [x, y] = project(lon, lat);
    photoDb.g.push([id, +x.toFixed(2), +y.toFixed(2), t, countryAt(x, y), +lat.toFixed(6), +lon.toFixed(6)]);
  }
  photoDb.scanned = true;
  savePhotoDb();
  refreshPhotos();
  const places = new Set(photoDb.g.map((r) => r[4]).filter(Boolean));
  if (scanQuiet) {
    const fresh = photoDb.g.filter((r) => !before.has(String(r[0]))).map((r) => r[4]);
    offerCountries([...new Set(fresh)].filter(Boolean), true);
    return;
  }
  closeModal();
  if (!photoDb.g.length) {
    modal(`<div class="dialog"><h2>No photos with a location</h2>
      <p>${ev.total ? `Globetrot checked ${fmt(ev.total)} photos, but none of them say where they were taken.` : 'Globetrot couldn’t find any photos.'}
      ${ev.location === false ? 'Android only shares photo locations if you allow it: try again and allow access to <b>all</b> photos and their locations.' : 'Turn on location (geotags) in your camera app and new photos will show up here.'}</p>
      <div class="row-btns"><button class="btn primary" data-m="ok">OK</button></div></div>`, {});
    return;
  }
  const missing = [...places].filter((id) => !visited(id));
  photoDb.skip = photoDb.skip.filter((id) => !missing.includes(id));
  savePhotoDb();
  const n = photoDb.g.length;
  modal(`<div class="dialog">
    <h2>📷 ${fmt(n)} photo${n === 1 ? '' : 's'} on your map</h2>
    <p>Taken in ${places.size} ${places.size === 1 ? 'country' : 'countries'}.${missing.length ? ` ${missing.length} of them ${missing.length === 1 ? 'isn’t' : 'aren’t'} marked yet:` : ' They’re all on your map already.'}</p>
    ${missing.length ? `<div class="flag-row">${missing.map((id) => `<span title="${esc(BY_ID[id].n)}">${flag(id)}</span>`).join('')}</div>` : ''}
    <div class="row-btns">
      ${missing.length ? `<button class="btn" data-m="later">Not now</button><button class="btn primary" data-m="ok">Mark ${missing.length === 1 ? 'it' : 'all ' + missing.length} as been</button>`
        : '<button class="btn primary" data-m="close">Show me</button>'}
    </div></div>`, {
    ok: () => { markBeen(missing); return true; },
    later: () => { photoDb.skip.push(...missing); savePhotoDb(); return true; },
  });
}

// After photos arrive, offer to mark the countries they were taken in.
function offerCountries(ids, quiet) {
  const missing = ids.filter((id) => BY_ID[id] && !visited(id) && !(quiet && photoDb.skip.includes(id)));
  if (!missing.length) return;
  // With "add countries automatically" on, new photos just add theirs (with Undo).
  if (quiet && walkDb.autoMark) { markBeen(missing, true); return; }
  const names = missing.length === 1 ? BY_ID[missing[0]].n : `${missing.length} countries`;
  toast(`📷 Photos from ${names}. Add to your map?`, () => markBeen(missing), 'Add', 6000);
  if (quiet) { photoDb.skip.push(...missing); savePhotoDb(); }
}

// Marks countries as been. auto: found by Globetrot rather than chosen, so
// say which and offer Undo.
function markBeen(ids, auto) {
  const before = ids.map((id) => [id, state.c[id] ? { ...state.c[id] } : null]);
  for (const id of ids) {
    const e = entry(id);
    e.s = 'been';
    e.t = Date.now();
    paintCountry(id, true);
  }
  changed('');
  const names = ids.length === 1 ? `${flag(ids[0])} ${BY_ID[ids[0]].n}` : ids.map(flag).join('');
  if (!auto) { toast(`${names} added to your map`); return; }
  toast(`${names} added to your map: you were there`, () => {
    for (const [id, e] of before) {
      if (e) state.c[id] = e; else delete state.c[id];
      paintCountry(id);
    }
    changed('');
  }, 'Undo', 6000);
}

// ---------------------------------------------------------------- the map layer

const photoLayer = $('#photo-layer');
let clusters = [];
let clusterZoom = null;
const markers = new Map(); // cluster key → element
const CELL = 56; // screen pixels a marker claims

function refreshPhotos() {
  photoList = null;
  clusterZoom = null;
  draw();
  dirty.stats = true;
  if (currentTab === 'stats') renderStats();
  if (sheetId) renderSheet();
}

// Each photo joins the first group whose marker it would overlap at this zoom,
// otherwise starts its own (newest photos first, so they become the covers).
function buildClusters(z) {
  const cell = CELL / (kMin * Math.pow(2, z));
  const grid = new Map();
  const out = [];
  for (const p of allPhotos()) {
    const gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell);
    let home = null;
    for (let dx = -1; dx <= 1 && !home; dx++) {
      for (let dy = -1; dy <= 1 && !home; dy++) {
        for (const c of grid.get((gx + dx) + ':' + (gy + dy)) || []) {
          if (Math.abs(c.x - p.x) < cell && Math.abs(c.y - p.y) < cell) { home = c; break; }
        }
      }
    }
    if (home) { home.photos.push(p); continue; }
    const c = { key: `${z}/${p.key}`, x: p.x, y: p.y, photos: [p] };
    const k = gx + ':' + gy;
    if (grid.has(k)) grid.get(k).push(c); else grid.set(k, [c]);
    out.push(c);
  }
  return out;
}

// Called from render(): keeps the markers stuck to the map as it moves.
function placePhotos() {
  if (!photoDb.show || !allPhotos().length) {
    if (markers.size) { photoLayer.innerHTML = ''; markers.clear(); }
    return;
  }
  // Re-group on every half step of zoom.
  const z = Math.max(0, Math.round(Math.log2(cam.k / kMin) * 2) / 2);
  if (z !== clusterZoom) {
    clusterZoom = z;
    clusters = buildClusters(z);
    photoLayer.innerHTML = '';
    markers.clear();
  }
  const seen = new Set();
  let shown = 0;
  for (const c of clusters) {
    const sx = c.x * cam.k + cam.x, sy = c.y * cam.k + cam.y;
    if (sx < -40 || sx > vw + 40 || sy < -40 || sy > vh + 40 || shown > 150) continue;
    shown++;
    seen.add(c.key);
    let el = markers.get(c.key);
    if (!el) {
      el = document.createElement('div');
      el.className = 'pm';
      el.innerHTML = `<img src="${photoUrl(c.photos[0])}" alt="" decoding="async">${c.photos.length > 1 ? `<b>${c.photos.length > 999 ? '999+' : c.photos.length}</b>` : ''}`;
      el._cluster = c;
      photoLayer.appendChild(el);
      markers.set(c.key, el);
    }
    el._sx = sx;
    el._sy = sy;
    el.style.transform = `translate(${(sx - 23).toFixed(1)}px,${(sy - 23).toFixed(1)}px)`;
  }
  for (const [key, el] of markers) {
    if (!seen.has(key)) { el.remove(); markers.delete(key); }
  }
}

// Markers don't take touches themselves (so pinches over them still zoom);
// map taps are checked against them here.
function photoAt(sx, sy) {
  if (!photoDb.show) return null;
  const els = [...markers.values()].reverse();
  for (const el of els) if (Math.abs(sx - el._sx) <= 25 && Math.abs(sy - el._sy) <= 25) return el._cluster;
  return null;
}

function openCluster(c) {
  const list = c.photos;
  if (list.length === 1) openViewer(list, 0);
  else {
    const ccs = new Set(list.map((p) => p.cc));
    const title = ccs.size === 1 && BY_ID[list[0].cc] ? `${flag(list[0].cc)} ${BY_ID[list[0].cc].n}` : 'Photos here';
    openGallery(list, title);
  }
}

// ---------------------------------------------------------------- gallery and viewer

const galleryEl = $('#gallery');
const viewerEl = $('#viewer');
let galleryList = [];

function openGallery(list, title, cc) {
  galleryList = list;
  galleryEl.hidden = false;
  galleryEl.innerHTML = `<div class="search-top gal-top">
      <button class="round" data-g="close" aria-label="Back"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="gal-title"><b>${esc(title)}</b><span>${fmt(list.length)} photo${list.length === 1 ? '' : 's'}</span></div>
      ${cc ? `<button class="pill-btn" data-g="add">＋ Add</button>` : ''}
    </div>
    <div class="gal-grid"></div>`;
  galleryEl._cc = cc || '';
  galleryShown = 0;
  moreGallery();
}
// Thousands of photos would be a lot of page at once: add them a screenful at a time.
let galleryShown = 0;
function moreGallery() {
  const grid = $('.gal-grid', galleryEl);
  if (!grid || galleryShown >= galleryList.length) return;
  const next = galleryList.slice(galleryShown, galleryShown + 180);
  grid.insertAdjacentHTML('beforeend', next.map((p, i) => `<button class="ph" data-i="${galleryShown + i}"><img loading="lazy" decoding="async" src="${photoUrl(p)}" alt=""></button>`).join(''));
  galleryShown += next.length;
}
galleryEl.addEventListener('scroll', (e) => {
  const g = e.target;
  if (g.classList?.contains('gal-grid') && g.scrollTop + g.clientHeight > g.scrollHeight - 600) moreGallery();
}, true);
function closeGallery() {
  if (galleryEl.hidden) return false;
  galleryEl.hidden = true;
  galleryEl.innerHTML = '';
  return true;
}
galleryEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-g],[data-i]');
  if (!b) return;
  if (b.dataset.g === 'close') closeGallery();
  else if (b.dataset.g === 'add') pickPhotos(galleryEl._cc);
  else openViewer(galleryList, +b.dataset.i);
});

let viewList = [], viewIndex = 0;
function openViewer(list, i) {
  viewList = list;
  viewerEl.hidden = false;
  showPhoto(i);
}
function closeViewer() {
  if (viewerEl.hidden) return false;
  viewerEl.hidden = true;
  viewerEl.innerHTML = '';
  return true;
}
function showPhoto(i) {
  if (!viewList.length) { closeViewer(); return; }
  viewIndex = (i + viewList.length) % viewList.length;
  const p = viewList[viewIndex];
  const c = BY_ID[p.cc];
  const when = p.t ? new Date(p.t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  viewerEl.innerHTML = `<div class="vw-top">
      <button class="round" data-v="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      <span>${viewList.length > 1 ? `${viewIndex + 1} / ${viewList.length}` : ''}</span>
    </div>
    <div class="vw-stage"><img class="vw-thumb" src="${photoUrl(p)}" alt=""><img class="vw-img" src="${photoUrl(p, true)}" alt=""></div>
    ${viewList.length > 1 ? '<button class="vw-nav prev" data-v="prev" aria-label="Previous"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button><button class="vw-nav next" data-v="next" aria-label="Next"><svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg></button>' : ''}
    <div class="vw-info">
      <div><b>${c ? `${flag(c.id)} ${esc(c.n)}` : '🌊 Somewhere at sea'}</b><span>${esc(when)}${p.gps ? '' : ' · no location, added here'}</span></div>
      <div class="vw-btns">
        ${c ? '<button class="btn" data-v="country">Country</button>' : ''}
        <button class="btn" data-v="map">${ICON.map} Map</button>
        <button class="btn danger" data-v="hide">${p.src === 'g' ? 'Hide' : 'Remove'}</button>
      </div>
    </div>`;
  const big = $('.vw-img', viewerEl);
  big.onload = () => big.classList.add('in');
  // Warm up the neighbours so swiping feels instant.
  for (const d of [1, -1]) {
    const n = viewList[(viewIndex + d + viewList.length) % viewList.length];
    if (n !== p) new Image().src = photoUrl(n, true);
  }
}
viewerEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-v]');
  if (!b) return;
  const a = b.dataset.v;
  const p = viewList[viewIndex];
  if (a === 'close') closeViewer();
  else if (a === 'prev') showPhoto(viewIndex - 1);
  else if (a === 'next') showPhoto(viewIndex + 1);
  else if (a === 'map') photoOnMap(p);
  else if (a === 'country') {
    closeViewer();
    closeGallery();
    openSheet(p.cc, { expand: currentTab !== 'map' });
  } else if (a === 'hide') hidePhoto(p);
});
let swipe = null;
viewerEl.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  swipe = { x: e.clientX, y: e.clientY };
});
viewerEl.addEventListener('pointerup', (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  swipe = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) showPhoto(viewIndex + (dx < 0 ? 1 : -1));
  else if (dy > 90) closeViewer();
});
document.addEventListener('keydown', (e) => {
  if (viewerEl.hidden) return;
  if (e.key === 'ArrowRight') showPhoto(viewIndex + 1);
  if (e.key === 'ArrowLeft') showPhoto(viewIndex - 1);
});

function photoOnMap(p) {
  closeViewer();
  closeGallery();
  closeSheet();
  if (currentTab !== 'map') showTab('map');
  if (!photoDb.show) { photoDb.show = true; savePhotoDb(); }
  const k = clampN(Math.max(cam.k, kMin * 12), kMin, kMax);
  animateTo({ k, x: vw / 2 - p.x * k, y: vh / 2 - p.y * k });
}

function hidePhoto(p) {
  const restore = [];
  if (p.src === 'g') {
    const i = photoDb.g.findIndex((r) => r[0] === p.id);
    const row = photoDb.g.splice(i, 1)[0];
    photoDb.hidden.push(p.id);
    restore.push(() => { photoDb.g.push(row); photoDb.hidden = photoDb.hidden.filter((h) => h !== p.id); });
  } else {
    const i = photoDb.a.findIndex((r) => r[0] === p.id);
    const row = photoDb.a.splice(i, 1)[0];
    // Removing an added photo deletes the app's copy, a little later so Undo can still work.
    const timer = setTimeout(() => { dropBlob(p.id + '.jpg'); dropBlob(p.id + '-t.jpg'); }, 5000);
    restore.push(() => { clearTimeout(timer); photoDb.a.push(row); });
  }
  savePhotoDb();
  viewList = viewList.filter((q) => q !== p);
  galleryList = galleryList.filter((q) => q !== p);
  if (!galleryEl.hidden) {
    if (galleryList.length) openGallery(galleryList, $('.gal-title b', galleryEl).textContent, galleryEl._cc);
    else closeGallery();
  }
  showPhoto(viewIndex);
  refreshPhotos();
  toast(p.src === 'g' ? 'Hidden from the map. It’s still in your gallery' : 'Photo removed', () => {
    for (const fn of restore) fn();
    savePhotoDb();
    refreshPhotos();
  });
}

// ---------------------------------------------------------------- menus and the bits other screens show

function photoStrip(list, limit) {
  if (!list.length) return '';
  const more = list.length - limit;
  return `<div class="ph-strip">${list.slice(0, more > 0 ? limit - 1 : limit).map((p, i) =>
    `<button class="ph" data-ph="${i}"><img loading="lazy" decoding="async" src="${photoUrl(p)}" alt=""></button>`).join('')}${more > 0 ? `<button class="ph more" data-ph="all">+${fmt(more + 1)}</button>` : ''}</div>`;
}
// Strip taps: open the viewer at that photo, or the whole gallery.
function stripTap(btn, list, title, cc) {
  if (btn.dataset.ph === 'all') openGallery(list, title, cc);
  else openViewer(list, +btn.dataset.ph);
}

function photoSummary() {
  const list = allPhotos();
  const ccs = new Set(list.map((p) => p.cc).filter(Boolean));
  return { n: list.length, countries: ccs.size };
}

function photoMenu() {
  const { n, countries } = photoSummary();
  if (!n) {
    modal(`<div class="dialog">
      <h2>📷 Your photos on the map</h2>
      <p>${canScan() ? 'Globetrot can look through the photos on this phone and pin every one that has a location to the place it was taken. ' : 'Add photos and Globetrot pins each one to the place it was taken. '}They never leave your phone.</p>
      <div class="row-btns">
        <button class="btn" data-m="pick">Choose photos</button>
        ${canScan() ? '<button class="btn primary" data-m="scan">Find my photos</button>' : ''}
      </div></div>`, {
      scan: () => { scanPhone(false); showScanProgress(0, 0); return false; },
      pick: () => { pickPhotos(''); return true; },
    });
    return;
  }
  modal(`<div class="dialog">
    <h2>📷 ${fmt(n)} photo${n === 1 ? '' : 's'}</h2>
    <p>From ${countries} ${countries === 1 ? 'country' : 'countries'}.</p>
    <div class="menu">
      <button class="btn" data-m="all">See them all</button>
      <button class="btn" data-m="toggle">${photoDb.show ? 'Hide photos on the map' : 'Show photos on the map'}</button>
      ${canScan() ? '<button class="btn" data-m="scan">Look for new photos</button>' : ''}
      <button class="btn" data-m="pick">Add photos</button>
    </div></div>`, {
    all: () => { openGallery(allPhotos(), 'All photos'); return true; },
    toggle: () => { photoDb.show = !photoDb.show; savePhotoDb(); refreshPhotos(); setPhotoButton(); return true; },
    scan: () => { scanPhone(false); showScanProgress(0, 0); return false; },
    pick: () => { pickPhotos(''); return true; },
  });
}

function setPhotoButton() {
  $('#photo-btn').classList.toggle('off', !photoDb.show && allPhotos().length > 0);
}

function startPhotos() {
  setPhotoButton();
  loadBlobUrls();
  // Pick up new photos quietly if the user already let Globetrot look.
  if (canScan() && photoDb.scanned && Native.hasPhotoAccess?.() === 'yes') scanPhone(true);
}

document.addEventListener('DOMContentLoaded', startPhotos);
