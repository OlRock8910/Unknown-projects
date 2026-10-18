// Signs in with an emailed code on two "phones" against a stand-in for
// Supabase (its /auth/v1 code and session endpoints and the /rest/v1
// progress table, with each user only able to see their own row), and checks
// progress follows the account.
//
//   node tests/account.mjs
import { chromium } from 'playwright';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, '..', 'web', 'index.html')).href;
const PORT = 9131;
const ANON = 'test-anon-key';

// ---------------------------------------------------------------- the stand-in
const codes = new Map();   // email → code
const tokens = new Map();  // access token → { userId, expires }
const refresh = new Map(); // refresh token → userId
const users = new Map();   // email → id
const rows = new Map();    // userId → { data, updated_at }
const sent = [];
let rateLimited = false;
let tokenLife = 3600;
const rand = () => Math.random().toString(36).slice(2);

const server = http.createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, prefer',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  const send = (status, body) => {
    res.writeHead(status, { ...cors, 'Content-Type': 'application/json' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.headers.apikey !== ANON) return send(401, { message: 'Invalid API key' });
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const u = new URL(req.url, 'http://x');
  const session = (userId) => {
    const access = 'at_' + rand(), rt = 'rt_' + rand();
    tokens.set(access, { userId, expires: Date.now() + tokenLife * 1000 });
    refresh.set(rt, userId);
    const email = [...users].find(([, id]) => id === userId)[0];
    return { access_token: access, token_type: 'bearer', expires_in: tokenLife, refresh_token: rt, user: { id: userId, email } };
  };
  const authUser = () => {
    const t = tokens.get((req.headers.authorization || '').replace('Bearer ', ''));
    return t && t.expires > Date.now() ? t.userId : null;
  };

  if (u.pathname === '/auth/v1/otp' && req.method === 'POST') {
    if (rateLimited) return send(429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' });
    if (!/^[^@\s]+@[^@\s]+$/.test(body.email || '')) return send(400, { code: 400, msg: 'Unable to validate email address: invalid format' });
    if (!users.has(body.email)) users.set(body.email, 'u_' + rand());
    const code = String(Math.floor(100000 + Math.random() * 900000));
    codes.set(body.email, code);
    sent.push({ email: body.email, code });
    return send(200, {});
  }
  if (u.pathname === '/auth/v1/verify' && req.method === 'POST') {
    if (body.type !== 'email' || codes.get(body.email) !== body.token) return send(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
    codes.delete(body.email);
    return send(200, session(users.get(body.email)));
  }
  if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'refresh_token') {
    const userId = refresh.get(body.refresh_token);
    if (!userId) return send(400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    refresh.delete(body.refresh_token);
    return send(200, session(userId));
  }
  if (u.pathname === '/auth/v1/logout') { tokens.delete((req.headers.authorization || '').replace('Bearer ', '')); res.writeHead(204, cors); return res.end(); }

  if (u.pathname === '/rest/v1/progress') {
    const userId = authUser();
    if (!userId) return send(401, { code: 'PGRST301', message: 'JWT expired' });
    if (req.method === 'GET') {
      const want = (u.searchParams.get('user_id') || '').replace(/^eq\./, '');
      // Row-level security: you only ever see your own row.
      return send(200, want === userId && rows.has(userId) ? [rows.get(userId)] : []);
    }
    if (req.method === 'POST') {
      if (body.user_id !== userId) return send(403, { code: '42501', message: 'new row violates row-level security policy' });
      rows.set(userId, { data: body.data, updated_at: body.updated_at });
      res.writeHead(201, cors); return res.end();
    }
  }
  send(404, { message: 'not found' });
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

// ---------------------------------------------------------------- the phones
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const fail = (m) => errors.push(m);

async function phone(name, progress) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`[${name}] ${e.message}`));
  await page.addInitScript(([port, anon, prog]) => {
    window.CLOUD_OVERRIDE = { url: `http://127.0.0.1:${port}`, anonKey: anon };
    if (prog && !localStorage.getItem('adjetivos.v1')) localStorage.setItem('adjetivos.v1', JSON.stringify(prog));
  }, [PORT, ANON, progress]);
  await page.goto(url);
  await page.waitForSelector('.game-card');
  await page.evaluate(() => App.show('me'));
  return page;
}
const until = async (page, fn, what, ms = 10000) => {
  try { await page.waitForFunction(fn, null, { timeout: ms }); } catch (e) { throw new Error('timed out waiting for ' + what); }
};
const cardText = (page) => page.textContent('.account');
const today = new Date().toISOString().slice(0, 10);

try {
  // Phone 1 has some progress and signs in.
  const one = await phone('one', { xp: 420, played: 9, best: { quiz: 150 }, stars: { quiz: 2 }, mastery: { molesto: 4 }, settings: { playerName: 'Ana' } });
  if (!/Save your progress/.test(await cardText(one))) fail('no sign-in card on the Me tab');

  await one.fill('.account input[type=email]', 'nope');
  await one.click('.account .btn.primary');
  if (!/whole email/.test(await cardText(one))) fail('bad email accepted');

  rateLimited = true;
  await one.fill('.account input[type=email]', 'Ana@Gmail.com');
  await one.click('.account .btn.primary');
  await until(one, () => /Too many codes/.test(document.querySelector('.account').textContent), 'rate-limit message');
  rateLimited = false;

  await one.click('.account .btn.primary');
  await until(one, () => /Check your email/.test(document.querySelector('.account').textContent), 'code screen');
  if (sent.at(-1).email !== 'ana@gmail.com') fail('email not lower-cased: ' + sent.at(-1).email);

  await one.fill('.account .otp', '000000');
  await until(one, () => /wrong or has expired/.test(document.querySelector('.account').textContent), 'wrong-code message');

  await one.fill('.account .otp', sent.at(-1).code); // typing all 6 digits signs in by itself
  await until(one, () => /Progress saved to your account/.test(document.querySelector('.account')?.textContent || ''), 'signed in');
  await until(one, () => /just now|min ago/.test(document.querySelector('.account').textContent), 'first save');
  const anaId = users.get('ana@gmail.com');
  if (!rows.has(anaId) || rows.get(anaId).data.xp !== 420) fail('progress not uploaded: ' + JSON.stringify(rows.get(anaId)?.data?.xp));

  // Playing more uploads by itself a few seconds later.
  await one.evaluate(() => { Store.data.best.quiz = 210; Store.addXp(30); });
  await new Promise((r) => setTimeout(r, 4000));
  if (rows.get(anaId).data.xp !== 450 || rows.get(anaId).data.best.quiz !== 210) fail('new progress not uploaded: ' + JSON.stringify({ xp: rows.get(anaId).data.xp, best: rows.get(anaId).data.best }));

  // An expired token is refreshed without bothering the player.
  await one.evaluate(() => { Account.session.expires_at = Date.now() - 1000; });
  await one.click('text=Save now');
  await until(one, () => /Saved/.test(document.body.textContent), 'save after refresh');
  if (!(await one.evaluate(() => Account.signedIn()))) fail('signed out by an expired token');

  // Phone 2 has its own, smaller progress; signing in merges the two.
  const two = await phone('two', { xp: 50, played: 2, best: { quiz: 90, bubble: 300 }, stars: { bubble: 3 }, mastery: { molesto: 1, tonto: 2 }, streak: { last: today, n: 1 }, settings: {} });
  await two.fill('.account input[type=email]', 'ana@gmail.com');
  await two.click('.account .btn.primary');
  await until(two, () => /Check your email/.test(document.querySelector('.account').textContent), 'code screen on phone two');
  await two.fill('.account .otp', sent.at(-1).code);
  await until(two, () => /Progress saved to your account/.test(document.querySelector('.account')?.textContent || ''), 'phone two signed in');
  const merged = await two.evaluate(() => ({ xp: Store.data.xp, best: Store.data.best, stars: Store.data.stars, molesto: Store.data.mastery.molesto, tonto: Store.data.mastery.tonto, name: Store.s.playerName }));
  const want = { xp: 450, best: { quiz: 210, bubble: 300 }, stars: { quiz: 2, bubble: 3 }, molesto: 4, tonto: 2, name: 'Ana' };
  const canon = (o) => JSON.stringify(o, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort()) : v));
  if (canon(merged) !== canon(want)) fail('merge wrong: ' + JSON.stringify(merged));

  // Someone else's account can't see Ana's progress.
  const three = await phone('three', { xp: 5 });
  await three.fill('.account input[type=email]', 'ben@example.com');
  await three.click('.account .btn.primary');
  await until(three, () => /Check your email/.test(document.querySelector('.account').textContent), 'code screen on phone three');
  await three.fill('.account .otp', sent.at(-1).code);
  await until(three, () => /Progress saved/.test(document.querySelector('.account')?.textContent || ''), 'phone three signed in');
  if (await three.evaluate(() => Store.data.xp) !== 5) fail('another account got Ana’s progress');

  // Signing out keeps this phone's progress and forgets the session.
  await two.click('text=Sign out');
  await until(two, () => /Save your progress/.test(document.querySelector('.account').textContent), 'signed out');
  if (await two.evaluate(() => Store.data.xp) !== 450 || await two.evaluate(() => localStorage.getItem('adjetivos.session'))) fail('sign out lost progress or kept the session');

  // Reopening the app stays signed in (phone one).
  await one.reload();
  await one.waitForSelector('.game-card');
  await one.evaluate(() => App.show('me'));
  if (!/ana@gmail.com/.test(await cardText(one))) fail('not signed in after reopening the app');
} catch (e) {
  fail(e.message);
}

// Without a project set up, there is no sign-in at all.
const plain = await browser.newPage();
await plain.goto(url);
await plain.waitForSelector('.game-card');
await plain.evaluate(() => App.show('me'));
if (await plain.$('.account')) fail('sign-in shown without a Supabase project');

await browser.close();
server.close();
if (errors.length) { console.error('Account test failed:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('Account test passed');
process.exit(0);
