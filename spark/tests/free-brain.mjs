// Tests the free, on-phone brain in a real browser.
//
// First it checks that the real brain code and the bundled Transformers.js
// load without errors. The AI model itself (hundreds of MB from Hugging
// Face) isn't downloaded here; for the walk-through, the brain worker is
// swapped for a stand-in that speaks the same messages, and Wikipedia for a
// stand-in too. That covers everything around the model: the download bar,
// looking things up, sources, learning, going offline, stopping, settings
// and switching brains.
//
//   node spark/tests/free-brain.mjs [--shots]
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, '..', 'web');
const shots = process.argv.includes('--shots');
const shot = (name) => shots && page.screenshot({ path: path.join(here, '..', 'docs', name), quality: 85 });

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const file = path.join(web, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!file.startsWith(web) || !fs.existsSync(file)) return res.writeHead(404).end();
  // The same headers the Android app sends (see MainActivity.java).
  res.writeHead(200, {
    'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-embedder-policy': 'require-corp',
  });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const problems = [];
const expect = (cond, what) => cond || problems.push(what);
const step = (name) => console.log('›', name);

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

// ---- the real code loads
step('the real brain code and Transformers.js load');
{
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Nothing may be downloaded: block every request that leaves this machine.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => route.abort());
  await page.goto(url + 'manifest.webmanifest');
  const result = await page.evaluate(async () => {
    const m = await import('/js/vendor/transformers.js');
    const exports = ['AutoTokenizer', 'AutoModelForCausalLM', 'TextStreamer', 'InterruptableStoppingCriteria', 'env'].filter((k) => !m[k]);
    const worker = await new Promise((resolve) => {
      const w = new Worker('/js/brain-worker.js', { type: 'module' });
      w.onerror = (e) => resolve('worker failed: ' + (e.message || 'error'));
      setTimeout(() => resolve('ok'), 3000); // it only fetches once asked to load
    });
    return { missing: exports, worker };
  });
  expect(!result.missing.length, 'Transformers.js bundle is missing ' + result.missing);
  expect(result.worker === 'ok', result.worker);
  expect(!errors.length, 'errors loading the real code: ' + errors.join('; '));
  await page.close();
}

// ---- the stand-ins
const FAKE_WORKER = `
let ready = false;
let stopped = false;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { stopped = true; return; }
  if (!ready) {
    postMessage({ type: 'progress', loaded: 300e6, total: 600e6, file: 'model.onnx' });
    await wait(600);
    postMessage({ type: 'progress', loaded: 600e6, total: 600e6, file: 'model.onnx' });
    ready = true;
  }
  if (data.type === 'load') postMessage({ type: 'ready', model: 'Fake brain', device: 'wasm' });
  if (data.type !== 'generate') return;
  stopped = false;
  const system = data.messages[0].content;
  const last = data.messages.at(-1).content;
  let text = 'Here you go.';
  if (system.includes('[1] Black hole')) text += ' A black hole is where gravity stops light escaping.';
  if (/my dog is called max/i.test(system)) text += ' Your dog is called Max.';
  if (/long story/i.test(last)) text = 'Once upon a time there was a dragon. '.repeat(100);
  for (const piece of text.match(/\\S+\\s*/g)) {
    if (stopped) break;
    postMessage({ type: 'token', id: data.id, text: piece });
    await wait(/long story/i.test(last) ? 30 : 2);
  }
  postMessage({ type: 'done', id: data.id });
};`;

let wikiCalls = 0;
let wikiDown = false;
async function wikipedia(route) {
  if (wikiDown) return route.abort('internetdisconnected');
  wikiCalls++;
  const q = new URL(route.request().url()).searchParams;
  const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (q.get('origin') !== '*') return route.fulfill({ status: 403 });
  if (q.get('list') === 'search') return json({ query: { search: /black/i.test(q.get('srsearch')) ? [{ title: 'Black hole' }] : [] } });
  if (q.get('prop') === 'extracts') return json({ query: { pages: [{ title: 'Black hole', extract: 'A black hole is a region of spacetime where gravity is so strong that nothing, not even light, can escape.' }] } });
  return route.fulfill({ status: 400 });
}

// ---- the walk-through
const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) errors.push(m.text());
});
page.on('dialog', (d) => d.accept());
await page.route('**/js/brain-worker.js', (route) =>
  route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'cross-origin-embedder-policy': 'require-corp' }, body: FAKE_WORKER }),
);
await page.route('https://en.wikipedia.org/**', wikipedia);
await page.route('https://api.anthropic.com/**', (route) => {
  problems.push('the free brain should never call the Claude API');
  return route.abort();
});

const waitIdle = () => page.waitForFunction(() => !document.body.classList.contains('busy'));
const lastReply = () => page.locator('.msg-ai').last();
async function say(text) {
  await page.fill('#input', text);
  await page.click('#send');
  await waitIdle();
}
const memories = () =>
  page.evaluate(async () => {
    const db = await new Promise((ok) => (indexedDB.open('spark').onsuccess = (e) => ok(e.target.result)));
    const all = await new Promise((ok) => (db.transaction('memories').objectStore('memories').getAll().onsuccess = (e) => ok(e.target.result)));
    db.close();
    return all;
  });

step('picking the free brain downloads it');
await page.goto(url);
await page.waitForSelector('#welcome:not([hidden])');
await page.click('[data-a="go-free"]');
await page.waitForSelector('#welcome', { state: 'hidden' });
await page.waitForFunction(() => /Downloading Spark’s brain… 50% \(300 MB of 600 MB\)/.test(document.querySelector('#brain-bar').textContent));
await page.waitForSelector('#brain-bar', { state: 'hidden' });
expect(await page.evaluate(() => crossOriginIsolated), 'the page should be cross-origin isolated, so the brain can use every core');
expect(await page.locator('.attach').isHidden(), 'the photo button should be hidden for the free brain');
expect((await page.textContent('.empty p')).includes('Wikipedia'), 'home screen should mention Wikipedia');

step('it looks things up and shows its sources');
await say('What is a black hole?');
expect((await lastReply().locator('.learned').textContent()).includes('Looked up “black hole” on Wikipedia'), 'lookup not shown');
expect((await lastReply().locator('.sources a').getAttribute('href')) === 'https://en.wikipedia.org/wiki/Black_hole', 'source link wrong');
expect((await lastReply().locator('.md').textContent()).includes('gravity stops light'), 'answer did not use Wikipedia');
expect((await page.textContent('#top-title')) === 'What is a black hole?', 'chat title not set');
await page.waitForSelector('#toast:not(.show)');
await shot('7-free.jpg');

step('it learns what you teach it');
const before = wikiCalls;
await say('Remember that my dog is called Max');
expect(wikiCalls === before, '"remember" should not search Wikipedia');
expect((await lastReply().locator('.learned').textContent()).includes('Learned: my dog is called Max'), 'learned card missing');
expect((await memories()).some((m) => m.note === 'my dog is called Max'), 'note not saved');
await say('What is my dog called?');
expect((await lastReply().locator('.md').textContent()).includes('Your dog is called Max.'), 'it did not use what it learned');

step('without internet it still answers');
wikiDown = true;
await say('Who invented the telephone?');
expect((await lastReply().locator('.learned').textContent()).includes('Couldn’t go online'), 'offline note missing');
expect((await lastReply().locator('.md').textContent()).startsWith('Here you go.'), 'no answer when offline');
wikiDown = false;

step('stop');
await page.fill('#input', 'Tell me a long story about dragons');
await page.click('#send');
await lastReply().locator('.md').waitFor();
await page.click('#send');
await waitIdle();
expect((await lastReply().locator('.note').textContent()) === 'Stopped.', 'stopped note missing');
expect((await lastReply().locator('.md').textContent()).length < 3600, 'it did not stop');

step('settings');
await page.click('[data-a="drawer"]');
await page.click('#drawer [data-a="settings"]');
expect((await page.textContent('#engine .on')) === 'Free, on phone', 'brain switch wrong');
expect((await page.textContent('#local-info')).startsWith('Fake brain, running on your phone’s processor'), 'brain info wrong');
expect(await page.locator('#effort-section').isHidden(), 'thinking levels are for Claude only');
await page.fill('#teach', 'My cat is called Bob. I love maths.');
await page.click('[data-a="teach"]');
expect((await memories()).some((m) => m.note === 'My cat is called Bob. I love maths.'), 'teaching in Settings did not save');
await page.click('#research');
await page.click('[data-a="close-settings"]');
const calls = wikiCalls;
await say('What is a black hole?');
expect(wikiCalls === calls, 'turning lookups off should stop searches');

step('switching to Claude without a key asks for one');
await page.click('[data-a="drawer"]');
await page.click('#drawer [data-a="settings"]');
await page.click('[data-engine="claude"]');
await page.waitForSelector('#welcome:not([hidden])');
await page.click('#welcome-cancel');
await page.waitForSelector('#welcome', { state: 'hidden' });

step('it remembers after a restart, and the brain can be deleted');
await page.reload();
await page.waitForSelector('.chip');
expect(await page.locator('#welcome').isHidden(), 'welcome should not come back');
await page.click('[data-a="drawer"]');
await page.locator('.chat-item .open').first().click();
await page.locator('.msg-user').nth(5).waitFor({ timeout: 5000 }).catch(() => {});
expect((await page.locator('.msg-user').count()) === 6, 'chat not saved, got ' + (await page.locator('.msg-user').count()));
await page.click('[data-a="drawer"]');
await page.click('#drawer [data-a="settings"]');
await page.waitForFunction(() => /Fake brain/.test(document.querySelector('#local-info').textContent));
await page.click('[data-a="forget-brain"]');
await page.waitForFunction(() => /downloads once/.test(document.querySelector('#local-info').textContent));

await browser.close();
server.close();

const all = [...problems, ...errors];
if (all.length) {
  console.error('\n✗ ' + all.join('\n✗ '));
  process.exit(1);
}
console.log(`\n✓ all good (${wikiCalls} Wikipedia lookups)`);
