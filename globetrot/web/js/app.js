// Globetrot: colour in the world map as you travel. Plain JS, no libraries;
// the map itself is pre-projected in world.js. Everything is stored on the
// phone (localStorage), and the Android shell adds window.Native for
// sharing, the clipboard and vibration.
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const Native = window.Native || null;

const COUNTRIES = WORLD.countries;
const BY_ID = Object.fromEntries(COUNTRIES.map((c) => [c.id, c]));
const UN_TOTAL = COUNTRIES.filter((c) => c.u).length;
const WORLD_AREA = COUNTRIES.reduce((s, c) => s + c.a, 0);
const CONTINENTS = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania', 'Antarctica'];
const CONT_EMOJI = { Europe: '🏰', Asia: '🏯', Africa: '🦁', 'North America': '🗽', 'South America': '🦜', Oceania: '🏝️', Antarctica: '🐧' };
const STATUS = {
  been: { label: 'Been', icon: '✓' },
  lived: { label: 'Lived', icon: '⌂' },
  want: { label: 'Want to go', icon: '♡' },
};
const RANKS = [
  [0, 'Homebody', '🏠'], [1, 'Day-tripper', '🎒'], [5, 'Explorer', '🧭'], [10, 'Adventurer', '🗺️'],
  [20, 'Voyager', '⛵'], [35, 'Globetrotter', '✈️'], [55, 'Jet-setter', '🌍'], [80, 'Nomad', '🐪'],
  [120, 'Legend', '🏆'], [195, 'Completionist', '👑'],
];
// Projected y of the equator and x of the prime meridian (see build-map.mjs).
const EQUATOR_Y = WORLD.h / 2;
const MERIDIAN_X = WORLD.w / 2;
const ACHIEVEMENTS = [
  { e: '🛂', t: 'First stamp', d: 'Your first country', test: (s) => s.un >= 1 },
  { e: '🔟', t: 'Double digits', d: '10 countries', test: (s) => s.un >= 10 },
  { e: '🧳', t: 'Seasoned', d: '25 countries', test: (s) => s.un >= 25 },
  { e: '🌟', t: 'Half century', d: '50 countries', test: (s) => s.un >= 50 },
  { e: '💯', t: 'Centurion', d: '100 countries', test: (s) => s.un >= 100 },
  { e: '🧭', t: 'Four corners', d: 'Both sides of the equator and of Greenwich', test: (s) => s.corners === 4 },
  { e: '🌐', t: 'All seven', d: 'Every continent', test: (s) => s.contCount === 7 },
  { e: '🐧', t: 'Polar explorer', d: 'Antarctica', test: () => visited('AQ') },
  { e: '🐘', t: 'Big five', d: 'The five biggest countries', test: () => all('RU CA CN US BR') },
  { e: '🏛️', t: 'Summit', d: 'All of the G7', test: () => all('US CA GB FR DE IT JP') },
  { e: '🦌', t: 'Nordic set', d: 'All five Nordic countries', test: () => all('DK NO SE FI IS') },
  { e: '🏰', t: 'Tiny states', d: '3 of Europe’s micro-states', test: () => some('VA MC SM LI AD MT') >= 3 },
  { e: '🦘', t: 'Down under', d: 'Australia and New Zealand', test: () => all('AU NZ') },
  { e: '🏡', t: 'Expat', d: 'Lived in 2 countries', test: (s) => s.lived >= 2 },
  { e: '📌', t: 'Pinpointer', d: 'Pinned 10 places', test: () => state.pins.length >= 10 },
  { e: '💭', t: 'Dreamer', d: '10 places on your wish list', test: (s) => s.want >= 10 },
];
const all = (ids) => ids.split(' ').every(visited);
const some = (ids) => ids.split(' ').filter(visited).length;

function flag(id) {
  if (id === 'AQ' || !/^[A-Z]{2}$/.test(id)) return id === 'AQ' ? '🇦🇶' : '🏳️';
  return String.fromCodePoint(...[...id].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

// ---------------------------------------------------------------- storage

const KEY = 'globetrot';
let state = load();

function blank() {
  return { v: 1, c: {}, pins: [], cam: null, hint: false };
}
function normalize(s) {
  const out = blank();
  if (!s || typeof s !== 'object') return out;
  for (const [id, e] of Object.entries(s.c || {})) {
    if (!BY_ID[id] || !e || typeof e !== 'object') continue;
    const clean = {};
    if (STATUS[e.s]) clean.s = e.s;
    if (Array.isArray(e.y)) clean.y = [...new Set(e.y.map(Number).filter((y) => y >= 1900 && y <= 2100))].sort();
    if (!clean.y?.length) delete clean.y;
    if (typeof e.n === 'string' && e.n.trim()) clean.n = e.n.slice(0, 4000);
    if (e.f) clean.f = 1;
    if (typeof e.t === 'number') clean.t = e.t;
    if (Object.keys(clean).some((k) => k !== 't')) out.c[id] = clean;
  }
  for (const p of Array.isArray(s.pins) ? s.pins : []) {
    if (!p || !isFinite(p.x) || !isFinite(p.y)) continue;
    out.pins.push({ id: String(p.id || Math.random().toString(36).slice(2)), x: +p.x, y: +p.y, name: String(p.name || 'Pinned place').slice(0, 80), cc: BY_ID[p.cc] ? p.cc : '', t: +p.t || 0 });
  }
  if (s.cam && isFinite(s.cam.cx) && isFinite(s.cam.cy) && isFinite(s.cam.z)) out.cam = { cx: +s.cam.cx, cy: +s.cam.cy, z: +s.cam.z };
  out.hint = !!s.hint;
  return out;
}
function load() {
  try {
    return normalize(JSON.parse(localStorage.getItem(KEY)));
  } catch (e) {
    return blank();
  }
}
let saveTimer = 0;
function save(now) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage full or blocked */ }
  };
  if (now) write(); else saveTimer = setTimeout(write, 250);
}
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

const status = (id) => state.c[id]?.s || '';
function visited(id) {
  const s = status(id);
  return s === 'been' || s === 'lived';
}
function entry(id) {
  return state.c[id] || (state.c[id] = {});
}
function tidy(id) {
  const e = state.c[id];
  if (e && !e.s && !e.y?.length && !e.n && !e.f) delete state.c[id];
}

let undoSnap = null;
function snapshot(id) {
  undoSnap = { id, e: state.c[id] ? JSON.parse(JSON.stringify(state.c[id])) : null };
}
function undo() {
  if (!undoSnap) return;
  const { id, e } = undoSnap;
  if (e) state.c[id] = e; else delete state.c[id];
  undoSnap = null;
  changed(id);
}

function setStatus(id, s, { toastIt = true } = {}) {
  const before = status(id);
  if (before === s) return;
  snapshot(id);
  const e = entry(id);
  if (s) e.s = s; else delete e.s;
  e.t = Date.now();
  tidy(id);
  changed(id, true);
  vibrate(s ? 18 : 8);
  if (toastIt) {
    const c = BY_ID[id];
    const msg = s === 'been' ? `${flag(id)} ${c.n} ✓` : s === 'lived' ? `${flag(id)} Lived in ${c.n}` : s === 'want' ? `${flag(id)} ${c.n} added to your wish list` : `${flag(id)} ${c.n} cleared`;
    toast(msg, undo);
  }
}

// One place to repaint after any change.
function changed(id, flash) {
  paintCountry(id, flash);
  updateCounter();
  if (sheetId === id) renderSheet();
  dirty.list = dirty.stats = true;
  if (currentTab === 'list') renderList();
  if (currentTab === 'stats') renderStats();
  save();
}

function stats() {
  const s = { un: 0, terr: 0, lived: 0, want: 0, fav: 0, area: 0, cont: {}, contCount: 0, corners: 0 };
  for (const name of CONTINENTS) s.cont[name] = { un: 0, been: 0, all: 0, seen: 0 };
  const sides = new Set();
  for (const c of COUNTRIES) {
    const k = s.cont[c.c];
    k.all++;
    if (c.u) k.un++;
    const st = status(c.id);
    if (state.c[c.id]?.f) s.fav++;
    if (st === 'want') s.want++;
    if (st !== 'been' && st !== 'lived') continue;
    s.area += c.a;
    k.seen++;
    if (c.u) { s.un++; k.been++; } else s.terr++;
    if (st === 'lived') s.lived++;
    sides.add(c.b[1] < EQUATOR_Y ? 'N' : 'x').add(c.b[3] > EQUATOR_Y ? 'S' : 'x');
    sides.add(c.b[0] < MERIDIAN_X ? 'W' : 'x').add(c.b[2] > MERIDIAN_X ? 'E' : 'x');
  }
  sides.delete('x');
  s.corners = sides.size;
  s.contCount = CONTINENTS.filter((n) => s.cont[n].seen > 0).length;
  s.pct = s.un / UN_TOTAL;
  return s;
}
const pctText = (p) => (p > 0 && p < 0.01 ? '<1' : String(Math.round(p * 100))) + '%';

function rankFor(n) {
  let i = 0;
  while (i + 1 < RANKS.length && n >= RANKS[i + 1][0]) i++;
  return { cur: RANKS[i], next: RANKS[i + 1] || null };
}

// ---------------------------------------------------------------- map

const svg = $('#map');
const SVGNS = 'http://www.w3.org/2000/svg';
const cam = { x: 0, y: 0, k: 1 };
let vw = 0, vh = 0, kMin = 0.1, kMax = 40;
let camG, dotsG, pinsG, selPath;
const pathEl = {};
const dotEl = {};
// Countries too small to tap at world zoom get a dot until they grow.
const DOT_IDS = COUNTRIES.filter((c) => Math.max(c.b[2] - c.b[0], c.b[3] - c.b[1]) < 26).map((c) => c.id);
const INSET_TOP = 64, INSET_BOTTOM = 64;

function buildMap() {
  const parts = [
    '<g id="cam">',
    `<path class="sphere" d="${WORLD.sphere}"/>`,
    `<path class="grid" d="${WORLD.grid}"/>`,
    `<path class="land" d="${WORLD.land}"/>`,
  ];
  for (const c of COUNTRIES) parts.push(`<path class="country" data-id="${c.id}" d="${c.d}"/>`);
  parts.push('<path class="sel-outline" d=""/>', '</g><g id="dots"></g><g id="pins"></g>');
  svg.innerHTML = parts.join('');
  camG = $('#cam', svg);
  dotsG = $('#dots', svg);
  pinsG = $('#pins', svg);
  selPath = $('.sel-outline', svg);
  for (const p of $$('.country', svg)) pathEl[p.dataset.id] = p;
  for (const id of DOT_IDS) {
    const d = document.createElementNS(SVGNS, 'circle');
    d.setAttribute('class', 'dot');
    d.dataset.id = id;
    dotsG.appendChild(d);
    dotEl[id] = d;
  }
  for (const c of COUNTRIES) paintCountry(c.id);
  buildPins();
}

function paintCountry(id, flash) {
  const s = status(id);
  const p = pathEl[id];
  if (!p) return;
  p.setAttribute('class', 'country' + (s ? ' ' + s : '') + (flash ? ' flash' : ''));
  if (flash) setTimeout(() => p.classList.remove('flash'), 650);
  const d = dotEl[id];
  if (d) {
    d.setAttribute('class', 'dot' + (s ? ' ' + s : '') + (sheetId === id ? ' sel' : ''));
    d.setAttribute('r', s || sheetId === id ? '5' : '3.5');
  }
}

function measure() {
  const r = svg.getBoundingClientRect();
  const oldW = vw, oldH = vh;
  vw = r.width || window.innerWidth;
  vh = r.height || window.innerHeight;
  svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  kMin = Math.min(vw / WORLD.w, (vh - INSET_TOP - INSET_BOTTOM) / WORLD.h) * 0.92;
  kMax = Math.max(vw, vh) / 30; // about 30 map units across the screen
  if (oldW && (oldW !== vw || oldH !== vh)) {
    cam.x += (vw - oldW) / 2;
    cam.y += (vh - oldH) / 2;
    clampCam();
    draw();
  }
}

// Keep some of the map on screen whatever happens.
function clampCam() {
  cam.k = clampN(cam.k, kMin, kMax);
  const mw = WORLD.w * cam.k, mh = WORLD.h * cam.k;
  const top = INSET_TOP, bottom = vh - INSET_BOTTOM;
  if (mw <= vw) cam.x = (vw - mw) / 2;
  else cam.x = clampN(cam.x, vw - mw - vw * 0.25, vw * 0.25);
  if (mh <= bottom - top) cam.y = top + (bottom - top - mh) / 2;
  else cam.y = clampN(cam.y, bottom - mh - vh * 0.2, top + vh * 0.2);
}

let rafId = 0;
function draw() {
  if (!rafId) rafId = requestAnimationFrame(render);
}
function render() {
  rafId = 0;
  camG.setAttribute('transform', `translate(${cam.x.toFixed(2)} ${cam.y.toFixed(2)}) scale(${cam.k.toFixed(5)})`);
  for (const id of DOT_IDS) {
    const c = BY_ID[id];
    const size = Math.max(c.b[2] - c.b[0], c.b[3] - c.b[1]) * cam.k;
    const d = dotEl[id];
    if (size > 14) { d.style.display = 'none'; continue; }
    d.style.display = '';
    d.setAttribute('cx', (c.l[0] * cam.k + cam.x).toFixed(1));
    d.setAttribute('cy', (c.l[1] * cam.k + cam.y).toFixed(1));
  }
  for (const g of pinsG.children) {
    const p = pinById(g.dataset.pin);
    if (p) g.setAttribute('transform', `translate(${(p.x * cam.k + cam.x).toFixed(1)} ${(p.y * cam.k + cam.y).toFixed(1)})`);
  }
  scheduleLabels();
  saveCam();
}

let camTimer = 0;
function saveCam() {
  clearTimeout(camTimer);
  camTimer = setTimeout(() => {
    state.cam = { cx: (vw / 2 - cam.x) / cam.k, cy: (vh / 2 - cam.y) / cam.k, z: cam.k / kMin };
    save();
  }, 400);
}

function initialView() {
  if (state.cam) {
    cam.k = state.cam.z * kMin;
    cam.x = vw / 2 - state.cam.cx * cam.k;
    cam.y = vh / 2 - state.cam.cy * cam.k;
  } else {
    // A phone held upright sees Europe, Africa and a bit either side.
    cam.k = Math.max(kMin, (vh - INSET_TOP - INSET_BOTTOM) * 0.72 / WORLD.h);
    cam.x = vw / 2 - 1060 * cam.k;
    cam.y = INSET_TOP + (vh - INSET_TOP - INSET_BOTTOM) / 2 - WORLD.h * 0.42 * cam.k;
  }
  clampCam();
  draw();
}

function zoomAt(f, sx, sy) {
  const k = clampN(cam.k * f, kMin, kMax);
  const mx = (sx - cam.x) / cam.k, my = (sy - cam.y) / cam.k;
  cam.k = k;
  cam.x = sx - mx * k;
  cam.y = sy - my * k;
  clampCam();
  draw();
}

let anim = 0;
function animateTo(target, ms = 650) {
  cancelAnimationFrame(anim);
  const from = { ...cam };
  const t0 = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - t0) / ms);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    // Zoom moves on a log scale and the centre follows it, so the flight feels even.
    const k = Math.exp(Math.log(from.k) + (Math.log(target.k) - Math.log(from.k)) * e);
    const fc = { x: (vw / 2 - from.x) / from.k, y: (vh / 2 - from.y) / from.k };
    const tc = { x: (vw / 2 - target.x) / target.k, y: (vh / 2 - target.y) / target.k };
    cam.k = k;
    cam.x = vw / 2 - (fc.x + (tc.x - fc.x) * e) * k;
    cam.y = vh / 2 - (fc.y + (tc.y - fc.y) * e) * k;
    draw();
    if (t < 1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}

// Camera that frames a country in the part of the screen the sheet leaves free.
function frameCountry(c) {
  const free = { top: INSET_TOP + 10, bottom: vh - sheetHeight() - 16 };
  const bw = Math.max(c.b[2] - c.b[0], 4), bh = Math.max(c.b[3] - c.b[1], 4);
  const k = clampN(Math.min(vw * 0.7 / bw, (free.bottom - free.top) * 0.7 / bh), kMin, kMax);
  const cx = (c.b[0] + c.b[2]) / 2, cy = (c.b[1] + c.b[3]) / 2;
  const t = { k, x: vw / 2 - cx * k, y: (free.top + free.bottom) / 2 - cy * k };
  const was = { ...cam };
  Object.assign(cam, t);
  clampCam();
  const out = { ...cam };
  Object.assign(cam, was);
  return out;
}
function flyTo(id) {
  animateTo(frameCountry(BY_ID[id]));
}
// Nudge the map up if the open sheet is covering the country.
function revealCountry(c) {
  const sy = ((c.b[1] + c.b[3]) / 2) * cam.k + cam.y;
  const limit = vh - sheetHeight() - 24;
  if (sy <= limit) return;
  const target = { ...cam, y: cam.y - (sy - limit) - 20 };
  const was = { ...cam };
  Object.assign(cam, target);
  clampCam();
  const out = { ...cam };
  Object.assign(cam, was);
  animateTo(out, 350);
}
function sheetHeight() {
  return sheet.classList.contains('open') && sheet.classList.contains('on-map') ? sheet.offsetHeight : 0;
}

// ---- labels: drawn as HTML once the map is still
let labelTimer = 0;
const labelsEl = $('#labels');
function scheduleLabels() {
  labelsEl.classList.add('hide');
  clearTimeout(labelTimer);
  labelTimer = setTimeout(drawLabels, gesture.active ? 400 : 140);
}
function drawLabels() {
  if (gesture.active) { scheduleLabels(); return; }
  const placed = [];
  const html = [];
  const fits = (x, y, w, h) => {
    for (const r of placed) if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return false;
    placed.push({ x, y, w, h });
    return true;
  };
  for (const p of state.pins) {
    const x = p.x * cam.k + cam.x, y = p.y * cam.k + cam.y;
    if (x < -40 || x > vw + 40 || y < 0 || y > vh) continue;
    const w = p.name.length * 6 + 8;
    if (cam.k > kMin * 3 && fits(x - w / 2, y + 6, w, 14)) html.push(`<div class="lbl pin" style="left:${x}px;top:${y}px">${esc(p.name)}</div>`);
  }
  const order = COUNTRIES.slice().sort((a, b) => b.a - a.a);
  for (const c of order) {
    const bw = (c.b[2] - c.b[0]) * cam.k;
    if (bw < 46) continue;
    const x = c.l[0] * cam.k + cam.x, y = c.l[1] * cam.k + cam.y;
    if (x < -50 || x > vw + 50 || y < 40 || y > vh - 20) continue;
    const w = c.n.length * 6.3 + 6;
    if (w > bw * 0.95 || (c.b[3] - c.b[1]) * cam.k < 14) continue;
    if (!fits(x - w / 2, y - 8, w, 16)) continue;
    html.push(`<div class="lbl${visited(c.id) ? ' on' : ''}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">${esc(c.n)}</div>`);
    if (placed.length > 80) break;
  }
  labelsEl.innerHTML = html.join('');
  labelsEl.classList.remove('hide');
}

// ---- gestures: one finger pans (with a fling), two pinch, a tap selects,
// a long press drops a pin; mouse wheel and double tap zoom.
const gesture = { active: false };
const pointers = new Map();
let tap = null, pinch = null, longTimer = 0, lastTap = null, fling = 0;
const TAP_SLOP = 9;

svg.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  cancelAnimationFrame(anim);
  cancelAnimationFrame(fling);
  svg.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  gesture.active = true;
  if (pointers.size === 1) {
    const t = e.target.closest('[data-id],[data-pin]');
    tap = { x: e.clientX, y: e.clientY, t: performance.now(), id: t?.dataset.id || '', pin: t?.dataset.pin || '', moved: false, track: [{ x: e.clientX, y: e.clientY, t: performance.now() }] };
    clearTimeout(longTimer);
    longTimer = setTimeout(() => { if (tap && !tap.moved && pointers.size === 1) longPress(tap); }, 520);
  } else if (pointers.size === 2) {
    clearTimeout(longTimer);
    tap = null;
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, k: cam.k, x: cam.x, y: cam.y };
  }
});

svg.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size >= 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const k = clampN(pinch.k * d / pinch.d, kMin, kMax);
    const ux = (pinch.mx - pinch.x) / pinch.k, uy = (pinch.my - pinch.y) / pinch.k;
    cam.k = k;
    cam.x = mx - ux * k;
    cam.y = my - uy * k;
    clampCam();
    draw();
    return;
  }
  if (!tap) {
    // The finger left over after a pinch keeps panning.
    cam.x += dx;
    cam.y += dy;
    clampCam();
    draw();
    return;
  }
  if (!tap.moved && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP) {
    tap.moved = true;
    clearTimeout(longTimer);
  }
  if (tap.moved) {
    cam.x += dx;
    cam.y += dy;
    clampCam();
    draw();
    const now = performance.now();
    tap.track.push({ x: e.clientX, y: e.clientY, t: now });
    while (tap.track.length > 2 && now - tap.track[0].t > 90) tap.track.shift();
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  clearTimeout(longTimer);
  if (pointers.size === 1) {
    pinch = null;
    tap = null;
    return;
  }
  if (pointers.size > 0) return;
  gesture.active = false;
  pinch = null;
  const t = tap;
  tap = null;
  if (!t) { scheduleLabels(); return; }
  if (t.longDone) return;
  if (!t.moved && e.type === 'pointerup') {
    const now = performance.now();
    if (lastTap && now - lastTap.t < 300 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = null;
      zoomAt(2, e.clientX - svg.getBoundingClientRect().left, e.clientY - svg.getBoundingClientRect().top);
      return;
    }
    lastTap = { x: e.clientX, y: e.clientY, t: now };
    onMapTap(t);
    return;
  }
  // Fling.
  const tr = t.track;
  if (tr.length >= 2) {
    const a = tr[0], b = tr[tr.length - 1];
    const dt = Math.max(16, b.t - a.t);
    let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
    if (performance.now() - b.t < 60 && Math.hypot(vx, vy) > 0.25) {
      let last = performance.now();
      const step = (now) => {
        const ms = now - last;
        last = now;
        cam.x += vx * ms;
        cam.y += vy * ms;
        const decay = Math.pow(0.94, ms / 16);
        vx *= decay;
        vy *= decay;
        clampCam();
        draw();
        if (Math.hypot(vx, vy) > 0.02) fling = requestAnimationFrame(step);
      };
      fling = requestAnimationFrame(step);
      return;
    }
  }
  scheduleLabels();
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);

svg.addEventListener('wheel', (e) => {
  e.preventDefault();
  const r = svg.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });

function onMapTap(t) {
  if (t.pin) { openPin(t.pin); return; }
  if (!t.id) { closeSheet(); return; }
  if (quickMark) {
    setStatus(t.id, visited(t.id) ? '' : 'been');
    if (sheetId) closeSheet();
    return;
  }
  openSheet(t.id);
}

function longPress(t) {
  t.longDone = true;
  const r = svg.getBoundingClientRect();
  const x = (t.x - r.left - cam.x) / cam.k, y = (t.y - r.top - cam.y) / cam.k;
  if (x < 0 || y < 0 || x > WORLD.w || y > WORLD.h) return;
  vibrate(30);
  askPinName({ x, y, cc: t.id });
}

$('#view-map').addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  if (a === 'zoom-in') zoomAt(1.8, vw / 2, vh / 2);
  else if (a === 'zoom-out') zoomAt(1 / 1.8, vw / 2, vh / 2);
  else if (a === 'quick') setQuick(!quickMark);
  else if (a === 'hint-ok') { state.hint = true; save(); $('#hint').hidden = true; }
  else if (a === 'search') openSearch();
});

let quickMark = false;
function setQuick(on) {
  quickMark = on;
  $('#quick').setAttribute('aria-pressed', String(on));
  if (on) { closeSheet(); toast('Quick mark: tap countries you’ve been to'); }
}

// ---------------------------------------------------------------- pins

const pinById = (id) => state.pins.find((p) => p.id === id);

function buildPins() {
  pinsG.innerHTML = state.pins.map((p) =>
    `<g data-pin="${esc(p.id)}"><circle class="pin-hit" r="16" cy="-10"/><line class="pin-stem" x1="0" y1="0" x2="0" y2="-9"/><circle class="pin-head" r="6" cy="-13"/></g>`).join('');
  draw();
}

function askPinName(spot) {
  const c = BY_ID[spot.cc];
  modal(`<div class="dialog">
    <h2>📍 Pin a place</h2>
    <p>${c ? `${flag(c.id)} In ${esc(c.n)}` : 'Somewhere at sea'}${c && !visited(c.id) ? '. Pinning marks it as visited.' : ''}</p>
    <input type="text" id="pin-name" maxlength="60" placeholder="City, beach, mountain…" autocomplete="off">
    <div class="row-btns"><button class="btn" data-m="cancel">Cancel</button><button class="btn primary" data-m="ok">Pin it</button></div>
  </div>`, {
    ok: () => {
      const name = $('#pin-name').value.trim() || (c ? `Place in ${c.n}` : 'Pinned place');
      state.pins.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), x: +spot.x.toFixed(2), y: +spot.y.toFixed(2), name, cc: spot.cc || '', t: Date.now() });
      if (c && !visited(c.id)) setStatus(c.id, 'been', { toastIt: false });
      buildPins();
      changed(spot.cc || '');
      toast(`📍 ${name} pinned`);
      return true;
    },
  });
  setTimeout(() => $('#pin-name')?.focus(), 50);
}

function openPin(pid) {
  const p = pinById(pid);
  if (!p) return;
  const c = BY_ID[p.cc];
  modal(`<div class="dialog">
    <h2>📍 ${esc(p.name)}</h2>
    <p>${c ? `${flag(c.id)} ${esc(c.n)}` : 'At sea'}${p.t ? ' · pinned ' + new Date(p.t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
    <input type="text" id="pin-name" maxlength="60" value="${esc(p.name)}" autocomplete="off">
    <div class="row-btns">
      <button class="btn danger" data-m="del">Remove</button>
      ${c ? '<button class="btn" data-m="country">Country</button>' : ''}
      <button class="btn primary" data-m="ok">Save</button>
    </div>
  </div>`, {
    ok: () => {
      p.name = $('#pin-name').value.trim() || p.name;
      buildPins();
      changed(p.cc);
      return true;
    },
    del: () => removePin(pid),
    country: () => { openSheet(p.cc); return true; },
  });
}
function removePin(pid) {
  const i = state.pins.findIndex((p) => p.id === pid);
  if (i < 0) return true;
  const [p] = state.pins.splice(i, 1);
  buildPins();
  changed(p.cc);
  toast(`Removed ${p.name}`, () => {
    state.pins.splice(i, 0, p);
    buildPins();
    changed(p.cc);
  });
  return true;
}
function goToPin(pid) {
  const p = pinById(pid);
  if (!p) return;
  closeSheet();
  showTab('map');
  const k = clampN(kMin * 10, kMin, kMax);
  animateTo({ k, x: vw / 2 - p.x * k, y: vh / 2 - p.y * k });
}

// ---------------------------------------------------------------- country sheet

const sheet = $('#sheet');
const scrim = $('#scrim');
let sheetId = null;
let sheetExpanded = false;

function openSheet(id, { expand } = {}) {
  const prev = sheetId;
  sheetId = id;
  if (prev && prev !== id) paintCountry(prev);
  paintCountry(id);
  const onMap = currentTab === 'map';
  sheetExpanded = expand ?? !onMap;
  sheet.classList.toggle('on-map', onMap);
  scrim.hidden = onMap;
  renderSheet();
  selPath.setAttribute('d', BY_ID[id].d);
  sheet.classList.add('open');
  if (onMap) requestAnimationFrame(() => revealCountry(BY_ID[id]));
}

function closeSheet() {
  if (!sheetId) return false;
  const id = sheetId;
  sheetId = null;
  paintCountry(id);
  selPath.setAttribute('d', '');
  sheet.classList.remove('open');
  scrim.hidden = true;
  document.activeElement?.blur?.();
  return true;
}

const ICON = {
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6L12 16.7 6.6 19.6l1.1-6L3.2 9.4l6.1-.8z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
  up: '<svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg>',
  map: '<svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>',
  tick: '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  share: '<svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
  image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  down2: '<svg viewBox="0 0 24 24"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/></svg>',
  up2: '<svg viewBox="0 0 24 24"><path d="M12 20V9m-5 5 5-5 5 5M5 4h14"/></svg>',
};

function renderSheet() {
  const id = sheetId;
  if (!id) return;
  const c = BY_ID[id];
  const e = state.c[id] || {};
  const s = e.s || '';
  const sub = [c.c, c.s ? `Part of ${c.s}` : c.u ? '' : 'Territory', c.a >= 1 ? `${fmt(c.a)} km²` : ''].filter(Boolean).join(' · ');
  const pins = state.pins.filter((p) => p.cc === id);
  const st = (k) => `<button class="st ${k}${s === k ? ' on' : ''}" data-s="${k}" aria-pressed="${s === k}"><i>${STATUS[k].icon}</i>${STATUS[k].label}</button>`;
  let html = `<div class="grip"></div>
    <div class="sh-head">
      <div class="sh-flag">${flag(id)}</div>
      <div class="sh-title"><h2>${esc(c.n)}</h2><p>${esc(sub)}</p></div>
      <button class="icon-btn fav" data-a="fav" aria-pressed="${!!e.f}" aria-label="Favourite">${ICON.star}</button>
      <button class="icon-btn" data-a="close" aria-label="Close">${ICON.close}</button>
    </div>
    <div class="status-row">${st('been')}${st('lived')}${st('want')}</div>`;
  if (!sheetExpanded) {
    const extra = [e.y?.length ? e.y.join(', ') : '', pins.length ? `${pins.length} place${pins.length > 1 ? 's' : ''}` : '', e.n ? 'notes' : ''].filter(Boolean).join(' · ');
    html += `<button class="more-btn" data-a="expand">${extra ? esc(extra) + ' · ' : ''}Years, places & notes ${ICON.down}</button>`;
  } else {
    html += `<div class="sh-sec"><h3>${s === 'want' ? 'Hoping to go in' : 'Years visited'}</h3><div class="years">
        ${(e.y || []).map((y) => `<span class="year">${y}<button data-a="rm-year" data-y="${y}" aria-label="Remove ${y}">${ICON.close}</button></span>`).join('')}
        <span class="year-add"><input id="year-in" inputmode="numeric" maxlength="4" placeholder="${new Date().getFullYear()}" aria-label="Year"><button data-a="add-year">Add</button></span>
      </div></div>
      <div class="sh-sec"><h3>Places</h3><div class="places">
        ${pins.length ? pins.map((p) => `<div class="place"><span>📍 ${esc(p.name)}</span><button class="go" data-a="go-pin" data-pin="${esc(p.id)}">Show</button><button class="icon-btn" data-a="rm-pin" data-pin="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">${ICON.close}</button></div>`).join('')
          : '<p class="muted">Long-press the map to pin a city or spot you loved.</p>'}
      </div></div>
      <div class="sh-sec"><h3>Notes</h3><textarea class="note" id="note-in" placeholder="Best meal, who you went with, what to see next time…">${esc(e.n || '')}</textarea></div>
      ${currentTab !== 'map' ? `<div class="sh-sec"><button class="btn" data-a="show-map" style="width:100%">${ICON.map} Show on map</button></div>` : ''}`;
  }
  const keepScroll = sheet.scrollTop;
  sheet.innerHTML = html;
  sheet.scrollTop = keepScroll;
}

sheet.addEventListener('click', (ev) => {
  const id = sheetId;
  if (!id) return;
  const sb = ev.target.closest('[data-s]');
  if (sb) {
    const k = sb.dataset.s;
    setStatus(id, status(id) === k ? '' : k);
    return;
  }
  const b = ev.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  if (a === 'close') closeSheet();
  else if (a === 'expand') {
    sheetExpanded = true;
    renderSheet();
    if (currentTab === 'map') requestAnimationFrame(() => revealCountry(BY_ID[id]));
  } else if (a === 'fav') {
    const e = entry(id);
    if (e.f) delete e.f; else e.f = 1;
    tidy(id);
    vibrate(10);
    changed(id);
  } else if (a === 'add-year') addYear();
  else if (a === 'rm-year') {
    const e = entry(id);
    e.y = (e.y || []).filter((y) => y !== +b.dataset.y);
    if (!e.y.length) delete e.y;
    tidy(id);
    changed(id);
  } else if (a === 'rm-pin') removePin(b.dataset.pin);
  else if (a === 'go-pin') goToPin(b.dataset.pin);
  else if (a === 'show-map') {
    closeSheet();
    showTab('map');
    openSheet(id);
    flyTo(id);
  }
});
sheet.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.id === 'year-in') addYear();
});
sheet.addEventListener('input', (ev) => {
  if (ev.target.id !== 'note-in' || !sheetId) return;
  const e = entry(sheetId);
  const v = ev.target.value;
  if (v.trim()) e.n = v; else delete e.n;
  tidy(sheetId);
  dirty.list = dirty.stats = true;
  save();
});
scrim.addEventListener('click', closeSheet);

function addYear() {
  const inp = $('#year-in');
  const y = parseInt(inp.value || inp.placeholder, 10);
  if (!(y >= 1900 && y <= 2100)) { toast('Type a year like 2019'); return; }
  const e = entry(sheetId);
  e.y = [...new Set([...(e.y || []), y])].sort();
  // A year you went means you've been, unless it's a plan.
  if (!e.s) { snapshot(sheetId); e.s = 'been'; }
  changed(sheetId, true);
  setTimeout(() => $('#year-in')?.focus(), 0);
}

// ---------------------------------------------------------------- tabs

let currentTab = 'map';
const dirty = { list: true, stats: true };
function showTab(tab) {
  if (tab === currentTab) {
    if (tab !== 'map') $(`#view-${tab} .panel-body`).scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  closeSheet();
  currentTab = tab;
  for (const b of $$('.tabbar button')) b.classList.toggle('on', b.dataset.tab === tab);
  $('#view-list').classList.toggle('active', tab === 'list');
  $('#view-stats').classList.toggle('active', tab === 'stats');
  if (tab === 'list' && dirty.list) renderList();
  if (tab === 'stats' && dirty.stats) renderStats();
  if (tab === 'map') { measure(); draw(); }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-a="tab"]');
  if (b) showTab(b.dataset.tab);
});

function updateCounter() {
  const s = stats();
  $('#top-count').textContent = s.un;
  $('#top-label').textContent = s.un === 1 ? 'country' : 'countries';
  $('#top-pct').textContent = pctText(s.pct);
}

// ---------------------------------------------------------------- countries list

let listFilter = 'all';
const FILTERS = [
  ['all', 'All', () => true],
  ['been', 'Been', (id) => visited(id)],
  ['want', 'Want to go', (id) => status(id) === 'want'],
  ['lived', 'Lived', (id) => status(id) === 'lived'],
  ['fav', '★ Favourites', (id) => !!state.c[id]?.f],
  ['not', 'Not yet', (id) => !status(id)],
];
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SEARCH_KEY = Object.fromEntries(COUNTRIES.map((c) => [c.id, norm(`${c.n} ${c.id} ${c.s || ''}`)]));

function matches(q) {
  const n = norm(q.trim());
  if (!n) return COUNTRIES;
  const starts = [], within = [];
  for (const c of COUNTRIES) {
    const nm = norm(c.n);
    if (nm.startsWith(n) || c.id.toLowerCase() === n) starts.push(c);
    else if (SEARCH_KEY[c.id].includes(n)) within.push(c);
  }
  return starts.concat(within);
}

function rowHtml(c) {
  const s = status(c.id);
  const sub = c.s ? `Part of ${c.s}` : c.u ? '' : 'Territory';
  const e = state.c[c.id];
  const extra = [sub, e?.y?.length ? e.y.join(', ') : ''].filter(Boolean).join(' · ');
  return `<div class="row" data-open="${c.id}" role="button" tabindex="0">
    <span class="flag">${flag(c.id)}</span>
    <span class="nm"><div>${esc(c.n)}${e?.f ? ' <span style="color:var(--gold)">★</span>' : ''}</div>${extra ? `<small>${esc(extra)}</small>` : ''}</span>
    ${s && s !== 'been' ? `<span class="tag ${s}">${STATUS[s].label}</span>` : ''}
    <button class="tick${visited(c.id) ? ' on' : ''}${s === 'lived' ? ' lived' : ''}" data-tick="${c.id}" aria-label="${visited(c.id) ? 'Been to' : 'Mark as been to'} ${esc(c.n)}">${ICON.tick}</button>
  </div>`;
}

function renderList() {
  dirty.list = false;
  const q = $('#list-q').value;
  $('#list-filters').innerHTML = FILTERS.map(([k, label, test]) => {
    const n = k === 'all' ? COUNTRIES.length : COUNTRIES.filter((c) => test(c.id)).length;
    return `<button class="chip${listFilter === k ? ' on' : ''}" data-f="${k}">${label}<b>${n}</b></button>`;
  }).join('');
  const test = FILTERS.find((f) => f[0] === listFilter)[2];
  const found = matches(q).filter((c) => test(c.id));
  const body = $('#list-body');
  if (!found.length) {
    const msg = q ? `Nothing called “${esc(q)}”` : listFilter === 'want' ? 'Your wish list is empty. Tap ♡ Want to go on any country.' : listFilter === 'fav' ? 'Tap the ★ on a country to make it a favourite.' : 'Nothing here yet.';
    body.innerHTML = `<div class="empty"><div>${q ? '🔎' : '🧭'}</div>${msg}</div>`;
    return;
  }
  if (q.trim()) {
    body.innerHTML = found.map(rowHtml).join('');
    return;
  }
  const html = [];
  for (const cont of CONTINENTS) {
    const rows = found.filter((c) => c.c === cont);
    if (!rows.length) continue;
    const un = COUNTRIES.filter((c) => c.c === cont && c.u);
    const been = un.filter((c) => visited(c.id)).length;
    const count = un.length ? `${been}/${un.length}` : COUNTRIES.some((c) => c.c === cont && visited(c.id)) ? '✓' : '';
    const pct = un.length ? been / un.length : 0;
    html.push(`<div class="cont-head"><h2>${CONT_EMOJI[cont]} ${cont}</h2><span>${count}</span>${un.length ? `<div class="bar"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>` : ''}</div>`);
    html.push(rows.map(rowHtml).join(''));
  }
  body.innerHTML = html.join('');
}

$('#list-q').addEventListener('input', renderList);
$('#list-filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  listFilter = b.dataset.f;
  renderList();
  $('#list-body').scrollTop = 0;
});
$('#list-body').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tick]');
  if (t) {
    const id = t.dataset.tick;
    setStatus(id, visited(id) ? '' : 'been');
    return;
  }
  const r = e.target.closest('[data-open]');
  if (r) openSheet(r.dataset.open);
});

// ---------------------------------------------------------------- stats

function renderStats() {
  dirty.stats = false;
  const s = stats();
  const { cur, next } = rankFor(s.un);
  const R = 50, C = 2 * Math.PI * R;
  const toNext = next ? (s.un - cur[0]) / (next[0] - cur[0]) : 1;
  const tiles = [
    [`${s.contCount}<small style="font-size:14px;color:var(--muted)">/7</small>`, 'continents'],
    [pctText(s.area / WORLD_AREA), 'of the land'],
    [s.terr, s.terr === 1 ? 'territory' : 'territories'],
    [s.lived, 'lived in'],
    [s.want, 'on wish list'],
    [state.pins.length, state.pins.length === 1 ? 'place pinned' : 'places pinned'],
  ];
  const conts = CONTINENTS.map((name) => {
    const k = s.cont[name];
    const total = k.un || 1;
    const done = k.un ? k.been : Math.min(1, k.seen);
    return `<div class="cont-row"><span class="ce">${CONT_EMOJI[name]}</span><span class="cn">${name}</span>
      <span class="cc">${k.un ? `${k.been} of ${k.un}` : k.seen ? 'Been ✓' : 'Not yet'}</span>
      <div class="bar"><i style="width:${(done / total * 100).toFixed(1)}%"></i></div></div>`;
  }).join('');
  const badges = ACHIEVEMENTS.map((a) => {
    const got = a.test(s);
    return `<div class="badge${got ? '' : ' locked'}"><div class="be">${a.e}</div><b>${a.t}</b><small>${a.d}</small></div>`;
  });
  const gotCount = ACHIEVEMENTS.filter((a) => a.test(s)).length;
  const years = {};
  for (const [id, e] of Object.entries(state.c)) {
    if (e.s === 'want') continue;
    for (const y of e.y || []) (years[y] ||= []).push(id);
  }
  const yearRows = Object.keys(years).sort((a, b) => b - a).map((y) =>
    `<div class="yr"><b>${y}</b><span>${years[y].map(flag).join(' ')}</span></div>`).join('');
  const recent = Object.entries(state.c).filter(([, e]) => e.s === 'been' || e.s === 'lived').sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).slice(0, 24);

  $('#stats-body').innerHTML = `
    <div class="card hero">
      <div class="ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="${R}"/><circle class="fg" cx="60" cy="60" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - s.pct)}"/></svg><div>${pctText(s.pct)}</div></div>
      <div><h2>${s.un} <small>of ${UN_TOTAL} countries</small></h2>
      <p>${s.un ? `You've seen ${pctText(s.pct)} of the world's countries${s.terr ? ` and ${s.terr} ${s.terr === 1 ? 'territory' : 'territories'}` : ''}.` : 'Tap countries on the map to start colouring in your world.'}</p></div>
    </div>
    <div class="card rank">
      <span class="em">${cur[2]}</span>
      <div class="rk"><b>${cur[1]}</b>
        <p>${next ? `${next[0] - s.un} more to reach ${next[1]} ${next[2]}` : 'You have been everywhere. Incredible.'}</p>
        <div class="bar"><i style="width:${(toNext * 100).toFixed(1)}%"></i></div></div>
    </div>
    <div class="tiles">${tiles.map(([v, l]) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
    <div class="card"><h3>Continents</h3>${conts}</div>
    <div class="card"><h3>Badges · ${gotCount} of ${ACHIEVEMENTS.length}</h3><div class="badges">${badges.join('')}</div></div>
    ${yearRows ? `<div class="card"><h3>Year by year</h3>${yearRows}</div>` : ''}
    ${recent.length ? `<div class="card"><h3>Latest stamps</h3><div style="font-size:26px;letter-spacing:3px;line-height:1.4">${recent.map(([id]) => flag(id)).join(' ')}</div></div>` : ''}
    <div class="card"><h3>Share & backup</h3>
      <div class="actions">
        <button class="btn primary" data-a="share-img">${ICON.image} Share my map</button>
        <button class="btn" data-a="share-text">${ICON.share} Share as text</button>
        <button class="btn" data-a="export">${ICON.down2} Back up</button>
        <button class="btn" data-a="import">${ICON.up2} Restore</button>
        <button class="btn danger" data-a="reset">Start over</button>
      </div>
    </div>
    <p class="foot">Globetrot · map data from Natural Earth · everything stays on your phone</p>`;
}

$('#stats-body').addEventListener('click', (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  if (a === 'share-img') shareImage();
  else if (a === 'share-text') shareText();
  else if (a === 'export') exportBackup();
  else if (a === 'import') importBackup();
  else if (a === 'reset') resetAll();
});

// ---------------------------------------------------------------- sharing & backup

function summaryText() {
  const s = stats();
  const flags = COUNTRIES.filter((c) => visited(c.id)).map((c) => flag(c.id)).join('');
  const lines = [
    `🌍 I've been to ${s.un} ${s.un === 1 ? 'country' : 'countries'} (${pctText(s.pct)} of the world) across ${s.contCount} ${s.contCount === 1 ? 'continent' : 'continents'}!`,
  ];
  if (flags) lines.push(flags);
  const want = COUNTRIES.filter((c) => status(c.id) === 'want');
  if (want.length) lines.push(`Next up: ${want.slice(0, 12).map((c) => flag(c.id)).join('')}${want.length > 12 ? '…' : ''}`);
  lines.push('Made with Globetrot');
  return lines.join('\n');
}

function shareText() {
  const text = summaryText();
  if (Native?.share) Native.share(text);
  else if (navigator.share) navigator.share({ text }).catch(() => {});
  else copy(text, 'Copied. Paste it anywhere');
}

function copy(text, msg) {
  if (Native?.copy) { Native.copy(text); toast(msg); return; }
  navigator.clipboard?.writeText(text).then(() => toast(msg), () => toast('Could not copy'));
}

function drawShareImage() {
  const W = 1600, top = 190, mapH = Math.round(WORLD.h * W / WORLD.w * 0.94), H = top + mapH + 110;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const css = getComputedStyle(document.documentElement);
  const col = (n) => css.getPropertyValue(n).trim();
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#13213f');
  bg.addColorStop(1, '#0a0f1e');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const s = stats();
  const font = getComputedStyle(document.body).fontFamily;
  g.fillStyle = '#e9edf7';
  g.font = `800 64px ${font}`;
  g.fillText(`${s.un} ${s.un === 1 ? 'country' : 'countries'}`, 70, 110);
  g.fillStyle = col('--muted');
  g.font = `600 30px ${font}`;
  g.fillText(`${pctText(s.pct)} of the world · ${s.contCount} of 7 continents${s.terr ? ` · ${s.terr} ${s.terr === 1 ? 'territory' : 'territories'}` : ''}`, 72, 156);
  const rk = rankFor(s.un).cur;
  g.textAlign = 'right';
  g.font = `64px ${font}`;
  g.fillText(rk[2], W - 70, 112);
  g.font = `700 28px ${font}`;
  g.fillStyle = col('--gold');
  g.fillText(rk[1], W - 70, 156);
  g.textAlign = 'left';

  const k = (W * 0.94) / WORLD.w;
  g.save();
  g.translate(W * 0.03, top);
  g.scale(k, k);
  g.fillStyle = col('--ocean');
  g.fill(new Path2D(WORLD.sphere));
  g.strokeStyle = 'rgba(160,190,255,0.08)';
  g.lineWidth = 1 / k;
  g.stroke(new Path2D(WORLD.grid));
  g.fillStyle = col('--land');
  g.fill(new Path2D(WORLD.land));
  const fills = { been: col('--been'), lived: col('--lived'), want: col('--want') };
  g.strokeStyle = col('--border');
  g.lineWidth = 0.9 / k;
  for (const c of COUNTRIES) {
    const p = new Path2D(c.d);
    const st = status(c.id);
    g.globalAlpha = st === 'want' ? 0.6 : 1;
    g.fillStyle = fills[st] || col('--land');
    g.fill(p);
    g.globalAlpha = 1;
    g.stroke(p);
    // Tiny countries get a dot so they show up at all.
    if (st && DOT_IDS.includes(c.id)) {
      g.beginPath();
      g.arc(c.l[0], c.l[1], 5 / k, 0, Math.PI * 2);
      g.fillStyle = fills[st];
      g.fill();
    }
  }
  g.restore();

  let x = 72;
  const y = H - 50;
  g.font = `600 28px ${font}`;
  for (const [key, label] of [['been', 'Been'], ['lived', 'Lived'], ['want', 'Want to go']]) {
    g.fillStyle = fills[key];
    g.beginPath();
    g.roundRect ? g.roundRect(x, y - 22, 26, 26, 6) : g.rect(x, y - 22, 26, 26);
    g.fill();
    g.fillStyle = '#c9d0e4';
    g.fillText(label, x + 38, y);
    x += 38 + g.measureText(label).width + 44;
  }
  g.textAlign = 'right';
  g.fillStyle = col('--muted');
  g.fillText('🌍 Globetrot', W - 70, y);
  return cv;
}

function shareImage() {
  const cv = drawShareImage();
  const name = 'globetrot-map.png';
  const dataUrl = cv.toDataURL('image/png');
  if (Native?.shareFile) {
    Native.shareFile(name, 'image/png', dataUrl.split(',')[1], summaryText());
    return;
  }
  cv.toBlob((blob) => {
    const file = blob && typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], text: summaryText() }).catch(() => {});
    } else download(dataUrl, name);
  }, 'image/png');
}

function download(href, name) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function backupJson() {
  return JSON.stringify({ app: 'globetrot', v: 1, saved: new Date().toISOString(), c: state.c, pins: state.pins }, null, 1);
}

function exportBackup() {
  const json = backupJson();
  const name = `globetrot-backup-${new Date().toISOString().slice(0, 10)}.json`;
  modal(`<div class="dialog">
    <h2>Back up your map</h2>
    <p>Save the backup file somewhere safe (Drive, email it to yourself…). Restore it on any phone to get everything back.</p>
    <div class="row-btns">
      <button class="btn" data-m="copy">Copy text</button>
      <button class="btn primary" data-m="save">Save file</button>
    </div>
  </div>`, {
    save: () => {
      if (Native?.shareFile) Native.shareFile(name, 'application/json', btoa(unescape(encodeURIComponent(json))), 'Globetrot backup');
      else download(URL.createObjectURL(new Blob([json], { type: 'application/json' })), name);
      return true;
    },
    copy: () => { copy(json, 'Backup copied'); return true; },
  });
}

function importBackup() {
  modal(`<div class="dialog">
    <h2>Restore a backup</h2>
    <p>Pick a Globetrot backup file, or paste its text. This replaces what's on this phone.</p>
    <textarea id="import-text" placeholder='{"app":"globetrot", …}'></textarea>
    <div class="row-btns">
      <button class="btn" data-m="file">Choose file</button>
      <button class="btn primary" data-m="ok">Restore</button>
    </div>
  </div>`, {
    file: () => { $('#file-in').click(); return false; },
    ok: () => restoreFrom($('#import-text').value),
  });
}

$('#file-in').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const text = await f.text();
  const box = $('#import-text');
  if (box) box.value = text;
  if (restoreFrom(text)) closeModal();
});

function restoreFrom(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { data = null; }
  if (!data || typeof data !== 'object' || (!data.c && !data.pins)) {
    toast('That isn’t a Globetrot backup');
    return false;
  }
  const fresh = normalize({ ...data, cam: state.cam, hint: true });
  state = fresh;
  save(true);
  buildPins();
  for (const c of COUNTRIES) paintCountry(c.id);
  changed('');
  const n = stats().un;
  toast(`Restored: ${n} ${n === 1 ? 'country' : 'countries'}, ${state.pins.length} ${state.pins.length === 1 ? 'place' : 'places'}`);
  return true;
}

function resetAll() {
  modal(`<div class="dialog">
    <h2>Start over?</h2>
    <p>This clears every country, place, year and note on this phone. Back up first if you might want them again.</p>
    <div class="row-btns"><button class="btn" data-m="cancel">Keep them</button><button class="btn primary" style="background:#ff6b6b;color:#2a0505" data-m="ok">Clear everything</button></div>
  </div>`, {
    ok: () => {
      const cam0 = state.cam;
      state = blank();
      state.cam = cam0;
      state.hint = true;
      save(true);
      buildPins();
      for (const c of COUNTRIES) paintCountry(c.id);
      changed('');
      toast('A clean map. Where to first?');
      return true;
    },
  });
}

// ---------------------------------------------------------------- search

const searchEl = $('#search');
function openSearch() {
  closeSheet();
  searchEl.hidden = false;
  $('#search-q').value = '';
  renderSearch();
  setTimeout(() => $('#search-q').focus(), 30);
}
function closeSearch() {
  if (searchEl.hidden) return false;
  searchEl.hidden = true;
  $('#search-q').blur();
  return true;
}
function renderSearch() {
  const q = $('#search-q').value;
  const list = q.trim() ? matches(q).slice(0, 30) : COUNTRIES.filter((c) => status(c.id)).slice(0, 30);
  $('#search-results').innerHTML = list.length
    ? list.map(rowHtml).join('')
    : `<div class="empty"><div>🔎</div>${q.trim() ? `Nothing called “${esc(q)}”` : 'Type a country or territory'}</div>`;
}
$('#search-q').addEventListener('input', renderSearch);
$('#search-q').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = matches(e.target.value)[0];
    if (first && e.target.value.trim()) pickSearch(first.id);
  }
});
$('#search-results').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tick]');
  if (t) {
    const id = t.dataset.tick;
    setStatus(id, visited(id) ? '' : 'been');
    renderSearch();
    return;
  }
  const r = e.target.closest('[data-open]');
  if (r) pickSearch(r.dataset.open);
});
searchEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-a="search-close"]')) closeSearch();
});
function pickSearch(id) {
  closeSearch();
  if (currentTab !== 'map') showTab('map');
  openSheet(id);
  requestAnimationFrame(() => flyTo(id));
}

// ---------------------------------------------------------------- modal, toast, misc

const modalEl = $('#modal');
let modalActions = {};
function modal(html, actions) {
  modalEl.innerHTML = html;
  modalActions = actions || {};
  modalEl.hidden = false;
}
function closeModal() {
  if (modalEl.hidden) return false;
  modalEl.hidden = true;
  modalEl.innerHTML = '';
  modalActions = {};
  return true;
}
modalEl.addEventListener('click', (e) => {
  if (e.target === modalEl) { closeModal(); return; }
  const b = e.target.closest('[data-m]');
  if (!b) return;
  const fn = modalActions[b.dataset.m];
  if (!fn || fn() !== false) closeModal();
});
modalEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT' && modalActions.ok) {
    if (modalActions.ok() !== false) closeModal();
  }
});

const toastEl = $('#toast');
let toastTimer = 0;
function toast(msg, onUndo) {
  toastEl.innerHTML = `<span>${esc(msg)}</span>${onUndo ? '<button>Undo</button>' : ''}`;
  toastEl.classList.toggle('undo', !!onUndo);
  toastEl.classList.add('show');
  const b = $('button', toastEl);
  if (b) b.onclick = () => { onUndo(); hideToast(); vibrate(8); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, onUndo ? 3800 : 2200);
}
function hideToast() {
  toastEl.classList.remove('show');
}

function vibrate(ms) {
  try {
    if (Native?.vibrate) Native.vibrate(ms);
    else navigator.vibrate?.(ms);
  } catch (e) { /* not supported */ }
}

// Android back button: close whatever is open, then go back to the map.
window.appBack = () => {
  if (closeModal() || closeSearch() || closeSheet()) return true;
  if (quickMark) { setQuick(false); return true; }
  if (currentTab !== 'map') { showTab('map'); return true; }
  return false;
};
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.appBack();
});

window.addEventListener('resize', () => { measure(); draw(); });

// ---------------------------------------------------------------- start

buildMap();
measure();
initialView();
updateCounter();
if (!state.hint) $('#hint').hidden = false;
