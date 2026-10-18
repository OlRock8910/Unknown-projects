// Records short tall videos of the app for TikTok/Reels: node tools/promo.mjs <out dir> [clip ...]
// Each clip drives the app like a person (with a finger dot on every tap),
// grabs 1080×1920 frames, and rebuilds the app's sound effects (which are
// synthesised live) into the audio track. Needs ffmpeg.
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || 'promo');
const ONLY = process.argv.slice(3);
const url = pathToFileURL(path.join(root, 'web', 'index.html')).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SEED = {
  epoch: 2, profile: { name: 'Mia', joined: '2026-10-01', look: { skin: 1, hair: 1, hairColor: 2, hat: 'cap', top: 'star', pants: 'jeans' } },
  native: 'en', target: 'es', coins: 240, xp: 360,
  settings: { theme: 'light', sound: true, vibrate: false, voice: false, rate: 0.9 },
};

// Runs in the page: logs every sound (not the ones a sound plays itself),
// and shows a soft finger dot wherever the screen is tapped.
function pageSetup() {
  window.__sfx = [];
  let depth = 0;
  for (const name of Object.keys(Sfx)) {
    const orig = Sfx[name];
    if (typeof orig !== 'function' || ['ensure', 'on', 'note', 'bell', 'noise', 'semis'].includes(name)) continue;
    Sfx[name] = function (...args) {
      if (depth === 0 && !window.__replaying) window.__sfx.push({ name, args, t: Date.now() });
      depth++;
      try { return orig.apply(this, args); } finally { depth--; }
    };
  }
  const st = document.createElement('style');
  st.textContent = '.finger{position:fixed;z-index:9999;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(255,255,255,.55);box-shadow:0 0 0 3px rgba(47,91,234,.55);pointer-events:none;animation:fing .55s ease-out forwards}@keyframes fing{from{transform:scale(.6);opacity:1}to{transform:scale(1.5);opacity:0}}';
  document.head.append(st);
  document.addEventListener('pointerdown', (e) => {
    const d = document.createElement('div');
    d.className = 'finger'; d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px';
    document.body.append(d); setTimeout(() => d.remove(), 600);
  }, true);
}

// Runs in the page: plays the logged sounds into one track and returns a WAV.
async function renderAudio(t0, total) {
  const rate = 44100;
  const mix = [new Float32Array(Math.ceil(total * rate)), new Float32Array(Math.ceil(total * rate))];
  window.__replaying = true;
  for (const ev of window.__sfx) {
    const dur = ev.name === 'drumroll' ? 4 : 3.5;
    const ctx = new OfflineAudioContext(2, Math.ceil(dur * rate), rate);
    const S = Object.create(Sfx);
    S.ctx = ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(ctx.destination);
    S.out = ctx.createGain(); S.out.gain.value = 0.9; S.out.connect(comp);
    const len = Math.floor(rate * 1.4), ir = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    S.verb = ctx.createGain(); S.verb.gain.value = 0.22; S.verb.connect(conv).connect(S.out);
    S.noiseBuf = ctx.createBuffer(1, rate, rate);
    const nd = S.noiseBuf.getChannelData(0); for (let i = 0; i < rate; i++) nd[i] = Math.random() * 2 - 1;
    S.on = () => true;
    S[ev.name](...ev.args);
    const buf = await ctx.startRendering();
    const at = Math.round(((ev.t - t0) / 1000) * rate);
    for (let c = 0; c < 2; c++) {
      const src = buf.getChannelData(c), dst = mix[c];
      for (let i = 0; i < src.length && at + i < dst.length; i++) if (at + i >= 0) dst[at + i] += src[i];
    }
  }
  // 16-bit stereo WAV.
  const n = mix[0].length, data = new DataView(new ArrayBuffer(44 + n * 4));
  const w = (o, s) => [...s].forEach((ch, i) => data.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); data.setUint32(4, 36 + n * 4, true); w(8, 'WAVEfmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 2, true);
  data.setUint32(24, rate, true); data.setUint32(28, rate * 4, true); data.setUint16(32, 4, true); data.setUint16(34, 16, true); w(36, 'data'); data.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) for (let c = 0; c < 2; c++) data.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, mix[c][i])) * 32767, true);
  let bin = ''; const bytes = new Uint8Array(data.buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Taps an element like a finger would (moving there first).
async function tap(page, sel, wait = 0) {
  const el = typeof sel === 'string' ? page.locator(sel).first() : sel;
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox();
  if (!box) throw new Error('nothing to tap: ' + sel);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  if (wait) await sleep(wait);
}
// Answers the multiple choice on screen: right (or wrong).
async function choose(page, right = true) {
  const i = await page.evaluate((right) => {
    const w = window.__word();
    const opts = [...document.querySelectorAll('.opt')];
    return opts.findIndex((b) => (b.opt === w) === right);
  }, right);
  await tap(page, page.locator('.opt').nth(i), 450);
  await tap(page, '.ses-foot .btn.primary', 1500);
}
const next = (page, wait = 700) => tap(page, '.ses-foot .btn.primary', wait);

const CLIPS = {
  // The banana says Spanish, you tap a word to see what it means, answer right
  // with the gold "da-dun", then get one wrong for the buzzer.
  async 'banana-lesson'(page) {
    await page.evaluate(() => {
      const u = C.units[0];
      const [a, b, c] = [u.words[0], u.words[2], u.words[5]];
      const s = u.sentences.find((x) => x.t.split(' ').length <= 4) || u.sentences[0];
      const q = [
        { kind: 'meaning', word: a, gen: () => EX.meaning(a, { words: u.words }) },
        { kind: 'decode', sentence: s, gen: () => EX.decode(s) },
        { kind: 'meaning', word: b, gen: () => EX.meaning(b, { words: u.words }) },
        { kind: 'meaning', word: c, gen: () => EX.meaning(c, { words: u.words }) },
      ];
      window.__q = q; window.__i = 0;
      window.__word = () => window.__q[window.__i].word;
      window.__sent = s;
      openSession(q, { lesson: C.lessons[0] }); // so the banana is the one cheering
    });
    await sleep(1300);
    await choose(page, true); await next(page); await page.evaluate(() => { window.__i = 1; });
    await sleep(900);
    // Tap a word in what the banana says to see what it means.
    await tap(page, '.bubble-text .tw >> nth=0', 1500);
    await tap(page, '.bubble-text .tw >> nth=1', 1400);
    const toks = await page.evaluate(() => tokens(window.__sent.n));
    for (const tk of toks) {
      const i = await page.evaluate((tk) => [...document.querySelectorAll('.tile-bank .wtile')].findIndex((x) => !x.classList.contains('used') && normText(x.textContent) === normText(tk)), tk);
      if (i >= 0) await tap(page, page.locator('.tile-bank .wtile').nth(i), 260);
    }
    await sleep(300);
    await tap(page, '.ses-foot .btn.primary', 1600);
    await next(page); await page.evaluate(() => { window.__i = 2; });
    await sleep(900);
    await choose(page, true); await next(page); await page.evaluate(() => { window.__i = 3; });
    await sleep(900);
    await choose(page, false);
    await sleep(1200);
  },

  // The end of a mountain: drum roll, clouds part, flash, badge, coins and XP.
  async 'mountain-complete'(page) {
    await sleep(300);
    await page.evaluate(() => App.revealMountain(LP_COURSE[0], { prize: { coins: 300, xp: 500 } }));
    await sleep(9800);
  },

  // The daily chest wiggles, gets tapped, shakes and bursts open.
  async 'daily-chest'(page) {
    await page.evaluate(() => { markActive(); Store.save({ quiet: true }); App.show('learn', true); });
    await sleep(1600);
    await tap(page, '.chest-btn', 900);
    await tap(page, '.chest-page .btn.primary', 2600);
  },

  // Finishing a lesson: results with the cast jumping, then an achievement.
  async 'lesson-done'(page) {
    await page.evaluate(() => {
      const u = C.units[0];
      const ws = [u.words[1], u.words[3]];
      window.__q = ws.map((w) => ({ kind: 'meaning', word: w, gen: () => EX.meaning(w, { words: u.words }) }));
      window.__i = 0;
      window.__word = () => window.__q[window.__i].word;
      openSession(window.__q, { lesson: C.lessons[0] });
    });
    await sleep(1000);
    await choose(page, true); await next(page); await page.evaluate(() => { window.__i = 1; });
    await sleep(700);
    await choose(page, true); await next(page, 300);
    await sleep(5200);
  },

  // A slow scroll down the mountain: rocket, planes, birds, the path.
  async 'mountain-scroll'(page) {
    await page.evaluate(() => { C.lessons.slice(0, 9).forEach((l) => { Store.course.lessons[l.id] = { n: 1 }; }); Store.save({ quiet: true }); App.show('learn', true); document.querySelector('.chest-btn')?.remove(); });
    await page.evaluate(() => { document.querySelector('#view').scrollTop = 0; });
    await sleep(800);
    await page.evaluate(() => new Promise((done) => {
      const v = document.querySelector('#view'), end = v.scrollHeight - v.clientHeight, t0 = performance.now(), ms = 9000;
      const step = (now) => { const k = Math.min(1, (now - t0) / ms); v.scrollTop = end * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2); if (k < 1) requestAnimationFrame(step); else done(); };
      requestAnimationFrame(step);
    }));
    await sleep(900);
  },

  // Dressing up your climber in the shop.
  async 'dress-up'(page) {
    await page.evaluate(() => {
      Store.data.wardrobe = Object.entries(WARDROBE).flatMap(([slot, items]) => items.filter((i) => i.cost).map((i) => `${slot}:${i.id}`));
      Store.save({ quiet: true });
      App.show('shop', true);
      const b = document.querySelector('.builder-wrap');
      document.querySelector('#view').scrollTop = b.offsetTop - 40;
    });
    await sleep(900);
    for (const [tab, items] of [[0, [6, 9, 7]], [2, [5, 9, 6, 1]], [1, [6, 9]]]) {
      await tap(page, page.locator('.builder-wrap .seg button').nth(tab), 500);
      for (const k of items) await tap(page, page.locator('.look-grid .look-item').nth(k), 750);
    }
    await sleep(800);
  },
};

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
for (const [name, run] of Object.entries(CLIPS)) {
  if (ONLY.length && !ONLY.includes(name)) continue;
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, hasTouch: false });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`  ${name}: page error ${e.message}`));
  await page.addInitScript((seed) => { window.CLOUD_OVERRIDE = { url: '', anonKey: '' }; localStorage.setItem('lingopeak.v1', JSON.stringify(seed)); }, SEED);
  await page.goto(url);
  await page.waitForSelector('#tabs:not([hidden])');
  await page.evaluate(pageSetup);
  await page.addScriptTag({ content: renderAudio.toString() });
  await page.evaluate(() => Sfx.ensure());
  await sleep(500);

  // Grab frames with Chrome's screencast (only sends a frame when something changes).
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp * 1000 });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  const t0 = Date.now();
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1080, maxHeight: 1920, everyNthFrame: 1 });
  await run(page);
  const t1 = Date.now();
  await cdp.send('Page.stopScreencast');
  await sleep(200);

  const dir = fs.mkdtempSync(path.join(OUT, `.${name}-`));
  const list = [];
  frames.sort((a, b) => a.t - b.t);
  frames.forEach((f, i) => {
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    const end = i + 1 < frames.length ? frames[i + 1].t : t1;
    list.push(`file '${file}'`, `duration ${Math.max(0.001, (end - Math.max(f.t, t0)) / 1000).toFixed(4)}`);
  });
  list.push(`file '${path.join(dir, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
  fs.writeFileSync(path.join(dir, 'frames.txt'), list.join('\n'));
  // The video starts at the first frame, so the sound lines up with that.
  const start = frames.length ? frames[0].t : t0;
  const total = (t1 - start) / 1000;
  const wav = await page.evaluate(([a, b]) => renderAudio(a, b), [start, total]);
  fs.writeFileSync(path.join(dir, 'audio.wav'), Buffer.from(wav, 'base64'));
  const mp4 = path.join(OUT, `lingopeak-${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'frames.txt'), '-i', path.join(dir, 'audio.wav'),
    '-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=white,fps=30,format=yuv420p',
    '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-shortest', '-movflags', '+faststart', mp4]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`  ${path.basename(mp4)}: ${total.toFixed(1)} s, ${frames.length} frames, ${(fs.statSync(mp4).size / 1e6).toFixed(1)} MB`);
  await ctx.close();
}
await browser.close();
