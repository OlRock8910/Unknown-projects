// Opens Spark in a real browser against a stand-in for the Claude API and
// walks through it: adding a key, chatting, photos, a refusal, a backup-model
// reply, an error, reopening a saved chat and asking for a new answer.
// Fails on any page error or on a request the real API would reject.
//
//   node spark/tests/smoke.mjs [--shots]
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, '..', 'web');
const shots = process.argv.includes('--shots');
const shotDir = path.join(here, '..', 'docs');
const MODEL = 'claude-opus-5-5';

// ---- a static server for web/ (ES modules don't load from file://)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const file = path.join(web, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!file.startsWith(web) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

// ---- the stand-in Claude API
const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');

// blocks: [{ type: 'thinking', thinking } | { type: 'text', text } | { type: 'fallback', from, to }]
function reply(blocks, { model = MODEL, stop = 'end_turn' } = {}) {
  const ev = [{ type: 'message_start', message: { id: 'msg_' + Math.random().toString(36).slice(2), type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 12, output_tokens: 0 } } }];
  blocks.forEach((b, index) => {
    if (b.type === 'thinking') {
      ev.push({ type: 'content_block_start', index, content_block: { type: 'thinking', thinking: '', signature: '' } });
      ev.push({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking: b.thinking } });
      ev.push({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature: 'sig-' + index + '-' + b.thinking.length } });
    } else if (b.type === 'text') {
      ev.push({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } });
      for (const piece of b.text.match(/[\s\S]{1,12}/g)) ev.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: piece } });
    } else {
      ev.push({ type: 'content_block_start', index, content_block: b });
    }
    ev.push({ type: 'content_block_stop', index });
  });
  ev.push({ type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 40 } });
  ev.push({ type: 'message_stop' });
  return sse(ev);
}

const HELLO = 'Hi there! Here are **three** things I can do:\n\n1. Answer questions\n2. Help with homework\n   - maths\n   - writing\n3. Write code:\n\n```js\nconsole.log("hi <b>");\n```\n\n| Planet | Moons |\n|---|---|\n| Mars | 2 |';

const requests = [];
const problems = [];
let fail = null; // the next /v1/messages call returns this HTTP error

function checkRequest(req, body) {
  const h = req.headers();
  if (h['x-api-key'] !== 'sk-ant-test-key-1234567890') problems.push('wrong or missing api key header');
  if (h['anthropic-dangerous-direct-browser-access'] !== 'true') problems.push('missing direct browser access header');
  if (!(h['anthropic-beta'] || '').split(',').includes('server-side-fallback-2026-07-01')) problems.push('missing fallback beta header: ' + h['anthropic-beta']);
  if (body.model !== MODEL) problems.push('wrong model ' + body.model);
  if (body.fallbacks !== 'default') problems.push('fallbacks not "default"');
  if (body.thinking?.type !== 'adaptive') problems.push('thinking not adaptive');
  if (!['low', 'medium', 'high'].includes(body.output_config?.effort)) problems.push('bad effort');
  if (body.stream !== true) problems.push('not streaming');
  if (typeof body.system !== 'string' || !body.system.includes('Spark')) problems.push('missing system prompt');
  const m = body.messages;
  if (!m.length || m[0].role !== 'user') problems.push('first message is not from the user');
  for (const [k, msg] of m.entries()) {
    if (!msg.content.length) problems.push(`messages.${k} is empty`);
    for (const b of msg.content) if (b.type === 'fallback') problems.push(`messages.${k} replays a fallback block`);
  }
  // Append-only: everything this chat sent before must come back byte for byte.
  const prev = requests.filter((r) => r.body.system === body.system).at(-1);
  if (prev) {
    const shared = prev.body.messages.slice(0, Math.min(prev.body.messages.length, m.length - 1));
    if (JSON.stringify(shared) !== JSON.stringify(m.slice(0, shared.length))) problems.push('history changed between requests');
  }
}

async function claude(route) {
  const req = route.request();
  const u = new URL(req.url());
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  if (u.pathname === `/v1/models/${MODEL}`) {
    const ok = req.headers()['x-api-key'] === 'sk-ant-test-key-1234567890';
    return route.fulfill({
      status: ok ? 200 : 401,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(ok ? { type: 'model', id: MODEL, display_name: 'Claude', created_at: '2026-09-01T00:00:00Z' } : { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
    });
  }
  if (u.pathname !== '/v1/messages') return route.fulfill({ status: 404 });
  const body = JSON.parse(req.postData());
  checkRequest(req, body);
  requests.push({ body, headers: req.headers() });
  if (fail) {
    const status = fail;
    fail = null;
    return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
  }
  const last = body.messages.at(-1).content.filter((b) => b.type === 'text').map((b) => b.text).join(' ');
  let stream;
  if (/how do black holes/i.test(last)) stream = reply([{ type: 'thinking', thinking: 'They want a simple explanation.' }, { type: 'text', text: HELLO }]);
  else if (/forbidden/i.test(last)) stream = reply([], { stop: 'refusal' });
  else if (/backup/i.test(last))
    stream = reply(
      [
        { type: 'thinking', thinking: 'Starting on this.' },
        { type: 'text', text: 'Here is the start, ' },
        { type: 'fallback', from: { model: MODEL }, to: { model: 'claude-opus-4-8' } },
        { type: 'text', text: 'and the backup model finished it.' },
      ],
      { model: 'claude-opus-4-8' },
    );
  else if (body.messages.at(-1).content.some((b) => b.type === 'image')) stream = reply([{ type: 'text', text: 'That is a red square.' }]);
  else stream = reply([{ type: 'thinking', thinking: 'Simple question.' }, { type: 'text', text: `You said: ${last}` }]);
  return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' }, body: stream });
}

// ---- a tiny PNG to attach as a photo (a 40×40 red square)
function png(w, h) {
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (type, data) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(t));
    return Buffer.concat([len, t, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * (w * 3 + 1) + 1 + x * 3] = 255;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- the walk-through
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, hasTouch: true, colorScheme: 'dark' });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  // The 401 the test asks for shows up as a failed resource load.
  if (m.type() === 'error' && !/status of 401/.test(m.text())) errors.push(m.text());
});
await page.route('https://api.anthropic.com/**', claude);

const step = (name) => console.log('›', name);
const lastReply = () => page.locator('.msg-ai .body').last();
const waitIdle = () => page.waitForFunction(() => !document.body.classList.contains('busy'));
async function say(text) {
  await page.fill('#input', text);
  await page.click('#send');
  await waitIdle();
}
function expect(cond, what) {
  if (!cond) problems.push(what);
}

step('welcome and key');
await page.goto(url);
await page.waitForSelector('#welcome:not([hidden])');
if (shots) await page.screenshot({ path: path.join(shotDir, '1-welcome.jpg'), quality: 85 });
await page.fill('#key-input', 'sk-ant-wrong');
await page.click('#key-form button');
await page.waitForFunction(() => /didn’t work/.test(document.querySelector('#key-msg').textContent));
await page.fill('#key-input', 'sk-ant-test-key-1234567890');
await page.click('#key-form button');
await page.waitForSelector('#welcome', { state: 'hidden' });
await page.waitForSelector('.chip');
if (shots) await page.screenshot({ path: path.join(shotDir, '2-home.jpg'), quality: 85 });

step('a suggestion, with markdown and thinking');
await page.locator('.chip').first().click();
await waitIdle();
await lastReply().locator('ol li').first().waitFor();
expect((await lastReply().locator('.md > ol > li').count()) === 3, 'numbered list did not render');
expect((await lastReply().locator('ol ul li').count()) === 2, 'nested list did not render');
expect((await lastReply().locator('pre code').textContent()) === 'console.log("hi <b>");', 'code block wrong or not escaped');
expect((await lastReply().locator('table td').count()) === 2, 'table did not render');
expect((await lastReply().locator('b').first().textContent()) === 'three', 'bold did not render');
expect((await lastReply().locator('details.thought').count()) === 1, 'thinking summary missing');
expect((await page.textContent('#top-title')).startsWith('How do black holes'), 'chat title not set');
expect(requests[0].body.output_config.effort === 'medium', 'default effort should be medium');

step('second turn replays the first reply unchanged');
await say('Thanks!');
const second = requests.at(-1).body.messages;
expect(second.length === 3, 'second request should carry 3 messages');
expect(second[1].content[0].type === 'thinking' && second[1].content[0].signature?.startsWith('sig-'), 'thinking block not replayed with its signature');
expect((await lastReply().textContent()).includes('You said: Thanks!'), 'second reply missing');
if (shots) {
  await page.waitForSelector('#toast:not(.show)');
  await page.screenshot({ path: path.join(shotDir, '3-chat.jpg'), quality: 85 });
}

step('a reply a backup model finished');
await say('Use the backup');
expect((await lastReply().textContent()).includes('Here is the start, and the backup model finished it.'), 'fallback reply text wrong');
expect((await page.locator('.msg-ai .note').last().textContent()).includes('backup'), 'backup note missing');
await say('ok');
const afterFallback = requests.at(-1).body.messages.at(-2).content;
expect(JSON.stringify(afterFallback.map((b) => b.type)) === '["text","text"]', 'after a fallback only text should go back, got ' + afterFallback.map((b) => b.type));

step('a refusal puts the message back');
const before = requests.at(-1).body.messages.length;
await say('Something forbidden');
expect((await page.inputValue('#input')) === 'Something forbidden', 'refused message not put back in the box');
expect((await page.locator('.error-card').last().textContent()).includes('can’t help'), 'refusal notice missing');
await page.fill('#input', '');
await say('Something else');
expect(requests.at(-1).body.messages.length === before + 2, 'refused turn should not be in the history');

step('a photo');
await page.setInputFiles('#photo-input', { name: 'red.png', mimeType: 'image/png', buffer: png(40, 40) });
await page.waitForSelector('#attachments img');
await page.fill('#input', 'What is this?');
await page.click('#send');
await waitIdle();
const img = requests.at(-1).body.messages.at(-1).content[0];
expect(img.type === 'image' && img.source.media_type === 'image/jpeg' && img.source.data.length > 100, 'photo not sent as a JPEG image block');
expect((await page.locator('.msg-user .pics img').count()) === 1, 'photo not shown in the chat');
expect((await lastReply().textContent()).includes('red square'), 'photo reply missing');

step('an error, then try again');
fail = 401;
await say('Are you there?');
await page.waitForSelector('.error-card [data-a="change-key"]');
await page.click('[data-a="retry"]');
await waitIdle();
expect((await lastReply().textContent()).includes('You said: Are you there?'), 'retry did not answer');

step('a different answer');
const n = requests.length;
await page.locator('[data-a="regenerate"]').click();
await waitIdle();
expect(requests.length === n + 1 && requests.at(-1).body.messages.at(-1).role === 'user', 'regenerate should resend ending on the user turn');

step('settings');
await page.click('[data-a="drawer"]');
await page.click('#drawer [data-a="settings"]');
await page.click('[data-effort="high"]');
await page.fill('#about', 'I like short answers.');
await page.click('[data-a="close-settings"]');
await page.click('header [data-a="new"]');
await say('New chat here');
expect(requests.at(-1).body.output_config.effort === 'high', 'effort setting not used');
expect(requests.at(-1).body.system.includes('I like short answers.'), 'about me not in the new chat');
expect(requests.at(-1).body.messages.length === 1, 'new chat should start empty');

step('chats survive a reload');
await page.reload();
await page.waitForSelector('.chip');
await page.click('[data-a="drawer"]');
expect((await page.locator('.chat-item').count()) === 2, 'expected two saved chats');
if (shots) {
  await page.waitForTimeout(400); // let the drawer finish sliding in
  await page.screenshot({ path: path.join(shotDir, '4-chats.jpg'), quality: 85 });
}
await page.locator('.chat-item .open', { hasText: 'How do black holes' }).click();
await page.waitForSelector('.msg-user .pics img');
expect((await page.locator('.msg-user').count()) >= 6, 'saved chat did not reopen fully');
await say('One more');
// The reopened chat keeps its original system prompt (no "about me").
expect(!requests.at(-1).body.system.includes('I like short answers.'), 'old chat system prompt changed');

step('delete a chat');
await page.click('[data-a="drawer"]');
await page.locator('.chat-item .del').first().click();
expect((await page.locator('.chat-item').count()) === 1, 'chat not deleted');

if (shots) {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.locator('.chat-item .open').first().click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shotDir, '5-light.jpg'), quality: 85 });
}

await browser.close();
server.close();

const all = [...problems, ...errors];
if (all.length) {
  console.error('\n✗ ' + all.join('\n✗ '));
  process.exit(1);
}
console.log(`\n✓ all good (${requests.length} requests to the stand-in API)`);
