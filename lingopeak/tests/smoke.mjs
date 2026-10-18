// Opens Lingo Peak in a real browser and checks: the course data in all five
// languages, every screen's text in every UI language, sign-up, lessons in
// several language pairs (answered at random), practice, every mini game,
// the shop, the weekly goal and streak, mountain reveals and the back button.
// Fails on any page error or a stray "undefined"/"null" on screen.
//
//   node tests/smoke.mjs
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.join(here, '..', 'web', 'index.html')).href;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
const fail = (m) => errors.push(m);

async function newPage(state) {
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  page.on('pageerror', (e) => fail(e.message));
  page.on('console', (m) => { if (m.type() === 'error') fail('console: ' + m.text()); });
  await page.addInitScript((s) => {
    window.CLOUD_OVERRIDE = { url: '', anonKey: '' };
    // A pretend microphone that "hears" what's on screen (or window.__say when set).
    window.__fakeMic = () => new Promise((r) => setTimeout(() => r(window.__say != null ? window.__say : (document.querySelector('.speak-text') || {}).textContent || ''), 30));
    // Seeded once per page, so a reload after deleting the account stays empty.
    // The marker is window.name, which survives reloads (a file:// page's
    // storage can come back empty after one in the test browser).
    if (s && window.name !== 'seeded' && !localStorage.getItem('lingopeak.v1')) localStorage.setItem('lingopeak.v1', JSON.stringify({ epoch: 2, ...s }));
    window.name = 'seeded';
  }, state || null);
  await page.goto(url);
  return page;
}
const stray = (page) => page.evaluate(() => {
  const txt = document.body.innerText;
  const m = txt.match(/\b(undefined|null|NaN)\b|\{[a-z]+\}|\b[a-z]+\.[a-z]+[A-Z]?[a-zA-Z]*\b(?=\s|$)/);
  // (German "null" is a real word: zero.)
  const word = m && typeof C !== 'undefined' && C && C.words.some((w) => w.tAll.concat(w.nAll).some((x) => x.toLowerCase().includes(m[0].toLowerCase())));
  return m && !word && !/lingo|\.com|\.apk/i.test(m[0]) ? m[0] : null;
});

// ---------------------------------------------------------------- data
{
  const page = await newPage();
  const problems = await page.evaluate(() => {
    const out = [];
    const ids = new Set();
    let words = 0;
    for (const m of LP_COURSE) {
      if (m.units.length !== 5) out.push(`${m.id}: ${m.units.length} units`);
      for (const u of m.units) {
        if (u.words.length !== 12) out.push(`${m.id}/${u.id}: ${u.words.length} words`);
        if (u.sentences.length !== 6) out.push(`${m.id}/${u.id}: ${u.sentences.length} sentences`);
        for (const l of LANGS) if (!u.title[l]) out.push(`${m.id}/${u.id}: no ${l} title`);
        for (const w of u.words) {
          words++;
          if (ids.has(w.id)) out.push('duplicate word id ' + w.id);
          ids.add(w.id);
          for (const l of LANGS) if (!w[l] || /\|\||^\||\|$/.test(w[l])) out.push(`${w.id}: bad ${l} "${w[l]}"`);
        }
        for (const s of u.sentences) for (const l of LANGS) if (!s[l]) out.push(`${m.id}/${u.id}: sentence missing ${l}`);
      }
    }
    if (words < 600) out.push('only ' + words + ' words');
    // Every UI string in every language, with the same placeholders.
    for (const l of LANGS) {
      if (!STRINGS[l]) { out.push('no UI strings for ' + l); continue; }
      for (const [k, v] of Object.entries(STRINGS.en)) {
        if (!(k in STRINGS[l])) out.push(`ui ${l}: missing ${k}`);
        else if ((v.match(/\{\w+\}/g) || []).sort().join() !== (STRINGS[l][k].match(/\{\w+\}/g) || []).sort().join()) out.push(`ui ${l}: placeholders differ in ${k}`);
      }
    }
    return out;
  });
  if (problems.length) fail('data:\n    ' + problems.slice(0, 30).join('\n    '));
  await page.close();
  console.log('  ok data');
}

// ---------------------------------------------------------------- sign-up
{
  const page = await newPage();
  if (!(await page.$('.welcome'))) fail('no welcome screen on first launch');
  if (await page.isVisible('#tabs')) fail('tabs shown before sign-up');
  await page.click('.welcome .btn.primary');
  await page.click('.lang-opt:has-text("Français")');
  if (!/Quelle langue|Que veux/i.test(await page.textContent('.onb h1'))) fail('choosing French did not switch the app to French: ' + await page.textContent('.onb h1'));
  await page.click('.onb-foot .btn.primary');
  await page.click('.lang-opt >> nth=1');
  await page.click('.onb-foot .btn.primary');
  await page.fill('.field', 'ab');
  await page.click('.onb-foot .btn.primary');
  if (!(await page.textContent('.err'))) fail('a 2-letter name was accepted');
  await page.fill('.field', 'Mia_8');
  await page.click('.look-grid .look-item >> nth=2');
  await page.click('.onb-foot .btn.primary');
  await page.click('.onb-foot .btn.primary');
  const st = await page.evaluate(() => [Store.data.native, Store.data.target, Store.data.profile.name, Store.data.profile.look.top, App.tab, !document.querySelector('#tabs').hidden]);
  if (st.join() !== 'fr,es,Mia_8,tee-yellow,learn,true') fail('sign-up saved the wrong things: ' + st);
  const s = await stray(page);
  if (s) fail('stray text on the home screen: ' + s);
  await page.close();
  console.log('  ok sign-up');
}

// ---------------------------------------------------------------- lessons, in several pairs
async function playSession(page, start, label) {
  // Random answers get plenty wrong: lots of hearts so lessons can finish.
  await page.evaluate(() => { if (Store.data) Store.data.hearts = { n: 99, day: today() }; });
  await page.evaluate(start);
  for (let step = 0; step < 400; step++) {
    const st = await page.evaluate(() => {
      if (App.overlayKind !== 'lesson') return 'over';
      const opts = [...document.querySelectorAll('.opt')];
      if (opts.length && !document.querySelector('.opt.sel')) pickOne(opts).click();
      for (const x of [...document.querySelectorAll('.tile-bank .wtile:not(.used)')].slice(0, 5)) x.click();
      for (const x of document.querySelectorAll('.ltiles .ltile:not(.used)')) x.click();
      const inp = document.querySelector('.type-in');
      if (inp && !inp.value) { inp.value = Math.random() < 0.5 ? 'x' : (C.words[0].t); inp.dispatchEvent(new Event('input')); }
      const L = [...document.querySelectorAll('.match-item.t:not(.done)')], R = [...document.querySelectorAll('.match-item.n:not(.done)')];
      if (L.length) { L[0].click(); pickOne(R).click(); }
      const mic = document.querySelector('.mic-btn:not(.on)');
      if (mic && !document.querySelector('.ses-foot.show')) mic.click();
      const m = document.querySelector('.ses-foot .btn.primary');
      if (m && !m.disabled && m.offsetParent) m.click();
      return 'ok';
    });
    if (st === 'over') break;
    if (step % 15 === 0) { const s = await stray(page); if (s) { fail(`${label}: stray text "${s}"`); break; } }
    await page.waitForTimeout(25);
  }
  const res = await page.evaluate(() => [App.overlayKind, !!document.querySelector('.results')]);
  if (res[0] !== 'results' || !res[1]) fail(`${label}: did not reach the results screen (${res})`);
  await page.evaluate(() => App.closeOverlay());
}
for (const [nat, tgt, idx] of [['en', 'es', [0, 1, 2, 3]], ['es', 'en', [0, 3, 40]], ['de', 'fr', [5, 103]], ['pt', 'de', [9, 77]], ['fr', 'pt', [11, 199]]]) {
  const page = await newPage({ profile: { name: 'Test', avatar: 'shark', banner: 'blue' }, native: nat, target: tgt, settings: { sound: false } });
  await page.waitForSelector('#tabs:not([hidden])');
  for (const i of idx) await playSession(page, `openLesson(C.lessons[${i}])`, `${nat}>${tgt} lesson ${i}`);
  const done = await page.evaluate((ids) => ids.map((i) => lessonDone(C.lessons[i].id)), idx);
  if (done.some((x) => !x)) fail(`${nat}>${tgt}: lessons not saved ${done}`);
  if (nat === 'en') {
    // Practice after learning, and the stats.
    await playSession(page, "openPractice('review')", 'practice review');
    await playSession(page, "openPractice('weak')", 'practice weak');
    const stats = await page.evaluate(() => courseStats());
    if (stats.words < 12 || stats.lessons !== 4) fail('course stats wrong: ' + JSON.stringify(stats));
    const tabs = ['learn', 'practice', 'ranks', 'shop', 'me', 'settings', 'awards'];
    for (const tab of tabs) {
      await page.evaluate((x) => App.show(x), tab);
      const s = await stray(page);
      if (s) fail(`${tab} tab: stray text "${s}"`);
    }
  }
  await page.close();
  console.log(`  ok lessons ${nat}>${tgt}`);
}

// ---------------------------------------------------------------- fresh start, email log-in, settings, deleting
{
  // A save from before the fresh start is cleared.
  const page = await newPage({ profile: { name: 'Old' }, native: 'en', target: 'es', epoch: 1 });
  if (!(await page.$('.welcome'))) fail('an old save was not cleared by the fresh start');
  if (!/email/i.test(await page.textContent('.welcome .btn.ghost'))) fail('no log in with email on the welcome screen');
  await page.click('.welcome .btn.ghost');
  if (await page.$('input[type=password]')) fail('log in still asks for a password');
  await page.fill('.auth-form input[type=email]', 'nope');
  await page.click('.auth-form .btn.primary');
  if (!/email/i.test(await page.textContent('.auth-form .err'))) fail('log in accepted a bad email');
  if (!(await page.evaluate(() => appBack())) || !(await page.$('.welcome'))) fail('back from log in does not go to the welcome screen');
  await page.close();
}
{
  // Logging in with a 6-digit emailed code, against a pretend server.
  const page = await browser.newPage({ viewport: { width: 400, height: 860 } });
  page.on('pageerror', (e) => fail(e.message));
  await page.addInitScript(() => {
    window.CLOUD_OVERRIDE = { url: 'https://cloud.test', anonKey: 'k' };
    window.__calls = [];
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    window.fetch = async (u, o = {}) => {
      const path = String(u).replace('https://cloud.test', '');
      const body = o.body ? JSON.parse(o.body) : null;
      window.__calls.push(path.split('?')[0]);
      if (path === '/auth/v1/otp') return body.email === 'blocked@example.com' ? json({ code: 400, error_code: 'email_address_not_authorized', msg: 'Email address "blocked@example.com" cannot be used as it is not authorized' }, 400) : json({});
      if (path === '/auth/v1/verify') return ['123456', '12345678'].includes(body.token) ? json({ access_token: 'at', refresh_token: 'rt', expires_in: 3600, user: { id: 'u1', email: body.email } }) : json({ error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403);
      if (path.startsWith('/rest/v1/lp_progress')) return json([{ data: { epoch: 2, profile: { name: 'Mia', look: {} }, native: 'en', target: 'fr', xp: 321, courses: {} } }]);
      if (path.startsWith('/rest/v1/lp_profiles')) return json([{ name: 'Mia', code: 'ABC123' }]);
      return json([]);
    };
  });
  await page.goto(url);
  await page.click('.welcome .btn.ghost');
  // When the server can't email that address, say so (not "that's not an email").
  await page.fill('.auth-form input[type=email]', 'blocked@example.com');
  await page.click('.auth-form .btn.primary');
  await page.waitForFunction(() => /send a code/i.test(document.querySelector('.auth-form .err').textContent));
  if (!/not authorized/.test(await page.textContent('.auth-form .err'))) fail('send failure does not show the reason');
  await page.fill('.auth-form input[type=email]', 'mia@example.com');
  await page.click('.auth-form .btn.primary');
  await page.waitForSelector('.code-field');
  if (!/mia@example\.com/.test(await page.textContent('.code-sent'))) fail('code screen does not say where the code went');
  await page.fill('.code-field', '111111');
  await page.waitForFunction(() => /wrong|expired/i.test(document.querySelector('.auth-form .err').textContent));
  // An 8-digit code (Supabase's default length) is accepted too.
  await page.fill('.code-field', '12345678');
  await page.waitForSelector('#tabs:not([hidden])');
  const st = await page.evaluate(() => [Store.data.xp, Store.data.target, Cloud.email(), window.__calls.includes('/auth/v1/otp')]);
  if (st.join() !== '321,fr,mia@example.com,true') fail('logging in with a code: ' + st);
  await page.evaluate(() => App.show('settings'));
  if (!/mia@example\.com/.test(await page.textContent('#view')) || !/Log out/.test(await page.textContent('#view'))) fail('settings does not show the email account');
  // Deleting an email account needs a code sent to that email first.
  await page.click('.danger-card .btn.danger');
  if (!/mia@example\.com/.test(await page.textContent('.ask-sheet'))) fail('delete does not say where the code goes');
  await page.click('.ask-sheet .btn.primary');
  await page.waitForSelector('.ask-sheet .code-field');
  await page.fill('.ask-sheet .code-field', '11111111');
  await page.waitForFunction(() => /wrong|expired/i.test(document.querySelector('.ask-sheet .err').textContent));
  if (await page.$('.welcome')) fail('a wrong code deleted the account');
  await page.fill('.ask-sheet .code-field', '12345678');
  await page.waitForSelector('.welcome');
  await page.close();
}
{
  const page = await newPage({ profile: { name: 'Sett', joined: '2026-10-01' }, native: 'en', target: 'es', settings: { sound: false } });
  await page.waitForSelector('#tabs:not([hidden])');
  await page.evaluate(() => App.show('me'));
  if (/reset/i.test(await page.textContent('#view'))) fail('"reset everything" is still on the Me tab');
  await page.click('.banner-gear');
  const txt = await page.textContent('#view');
  for (const want of ['Settings', 'Weekly goal', 'Delete account', 'Listening exercises', 'Text size']) if (!txt.includes(want)) fail('settings page has no ' + want);
  if (!(await page.$('#tabs button.active[data-tab=me]'))) fail('Me tab not highlighted on Settings');
  await page.click('.seg button:has-text("45 min")');
  await page.click('label.setting:has-text("Typing exercises") .switch');
  const learn = await page.evaluate(() => {
    const kinds = new Set();
    for (let k = 0; k < 30; k++) C.lessons.slice(0, 8).forEach((l) => buildLessonQueue(l).forEach((x) => kinds.add(x.kind)));
    return [goalSecs(), Store.s.typing, ['spell', 'type', 'dictation'].filter((x) => kinds.has(x)).join()];
  });
  if (learn.join('|') !== '2700|false|') fail('goal / typing settings: ' + learn.join('|'));
  if (!(await page.evaluate(() => appBack() && App.tab === 'me'))) fail('back from Settings does not go to Me');
  // Deleting the account asks first, then starts again from the welcome screen.
  await page.click('.banner-gear');
  await page.click('.danger-card .btn.danger');
  await page.click('.ask-sheet .btn.ghost');
  if (!(await page.evaluate(() => !!Store.data.profile))) fail('cancelling deleted the account');
  await page.click('.danger-card .btn.danger');
  // With no email on the account, you type your username to confirm.
  await page.fill('.ask-sheet .field', 'someone');
  if (!(await page.isDisabled('.ask-sheet .btn.danger'))) fail('delete allowed with the wrong username');
  await page.fill('.ask-sheet .field', 'sett');
  await page.click('.ask-sheet .btn.danger');
  await page.waitForSelector('.welcome');
  if (await page.evaluate(() => localStorage.getItem('lingopeak.v1'))) fail('deleting the account left a save behind');
  await page.close();
  console.log('  ok fresh start, log-in checks, settings, delete account');
}

// ---------------------------------------------------------------- speaking and gap fill
{
  const page = await newPage({ profile: { name: 'Talky' }, native: 'en', target: 'es', settings: { sound: false } });
  await page.waitForSelector('#tabs:not([hidden])');
  const marks = await page.evaluate(() => [
    markSpoken(['Hola'], ['hola']), markSpoken(['ola'], ['hola']), markSpoken(['adiós'], ['hola']),
    markSpoken(['creo que es una buena idea'], ['Creo que es una buena idea.']), markSpoken(['el perro'], ['perro']), markSpoken(['gato'], ['perro']),
  ]);
  if (marks.join() !== 'true,true,false,true,true,false') fail('marking what was said: ' + marks);
  // Gap fill: pick the missing word.
  const gap = await page.evaluate(() => {
    const s = C.units[0].sentences.find((x) => !EX.gap(x).fallback && x.t.split(' ').length > 2);
    openSession([{ kind: 'gap', sentence: s, gen: () => EX.gap(s) }], { practice: 'review' });
    const blank = document.querySelector('.gap-blank');
    const opts = [...document.querySelectorAll('.opt')];
    const sentence = document.querySelector('.gap-sentence').textContent;
    const right = opts.find((b) => sentence.replace(' ', b.textContent) === s.t);
    if (!right) return 'no option completes the sentence: ' + sentence;
    right.click();
    document.querySelector('.ses-foot .btn.primary').click();
    return [!!blank, opts.length, document.querySelector('.ses-foot').classList.contains('ok')].join();
  });
  if (gap !== 'true,4,true') fail('gap fill: ' + gap);
  await page.evaluate(() => App.closeOverlay());
  // Speaking: a wrong try, then the right one.
  const w = await page.evaluate(() => { const w = C.units[0].words[0]; openSession([{ kind: 'speak', word: w, gen: () => EX.speak(w) }], { practice: 'review' }); window.__say = 'zapato'; return w.t; });
  await page.click('.mic-btn');
  await page.waitForFunction(() => /another go/i.test(document.querySelector('.mic-label').textContent));
  await page.evaluate(() => { window.__say = null; });
  await page.click('.mic-btn');
  await page.waitForSelector('.ses-foot.show.ok');
  // "Can't speak now" skips it and turns speaking off for a while.
  const skipped = await page.evaluate(() => {
    App.closeOverlay();
    const w = C.units[0].words[1];
    openSession([{ kind: 'speak', word: w, gen: () => EX.speak(w) }, { kind: 'meaning', word: w, gen: () => EX.meaning(w, { words: C.units[0].words }) }], { practice: 'review' });
    document.querySelector('.ses-foot .btn.ghost').click();
    return [canSpeak(), !!document.querySelector('.opt')];
  });
  if (skipped.join() !== 'false,true') fail("can't speak now: " + skipped);
  // Read Aloud: words go green as they're said, red when skipped or wrong.
  const along = await page.evaluate(() => [
    readAlong(['hola', 'soy', 'ana'], 'hola soy ana', 'es').marks.join(''),
    readAlong(['hola', 'soy', 'ana'], 'hola ana', 'es').marks.join(''),
    readAlong(['tengo', 'tres', 'perros'], 'tengo 3 perros', 'es').marks.join(''),
    readAlong(['hola', 'soy', 'ana'], 'hola', 'es').marks.join(''),
  ]);
  if (along.join() !== '111,121,111,100') fail('read-along marking: ' + along);
  await page.evaluate(() => { App.closeOverlay(); Store.data.speakPausedUntil = 0; Games.start(GAMES.find((g) => g.id === 'read')); });
  await page.waitForSelector('.read-text');
  if (!(await page.$('.cheat-tip'))) fail('read aloud: no sounds cheat sheet');
  await page.click('.cheat-toggle');
  if (await page.isVisible('.cheat-tip')) fail('read aloud: cheat sheet does not hide');
  await page.evaluate(() => { const ws = [...document.querySelectorAll('.rw')].map((x) => x.textContent); ws[1] = 'zzzz'; window.__say = ws.join(' '); });
  await page.click('.read-game .mic-btn');
  await page.waitForFunction(() => document.querySelectorAll('.rw.ok').length > 0 && !document.querySelector('.rw:not(.ok):not(.no)'));
  const readMarks = await page.evaluate(() => [document.querySelectorAll('.rw.no').length, document.querySelectorAll('.rw').length - document.querySelectorAll('.rw.ok').length]);
  if (readMarks.join() !== '1,1') fail('read aloud marks (red, not green): ' + readMarks);
  await page.waitForFunction(() => App.overlayKind === 'results', null, { timeout: 6000 });
  await page.evaluate(() => { window.__say = null; App.closeOverlay(); });
  await page.close();
  console.log('  ok speaking and gap fill (' + w + ')');
}

// ---------------------------------------------------------------- the coach: weak spots and tips
{
  const page = await newPage({ profile: { name: 'Coachy' }, native: 'en', target: 'es', settings: { sound: false } });
  await page.waitForSelector('#tabs:not([hidden])');
  const setup = await page.evaluate(() => {
    C.lessons.slice(0, 8).forEach((l) => { Store.course.lessons[l.id] = { n: 1 }; l.words.forEach((w) => { seeWord(w); gradeWord(w, true); }); });
    C.words.filter((w) => w.art).slice(0, 6).forEach((w) => { seeWord(w); gradeWord(w, true); });
    // Spelling has been going badly; one word keeps tripping you up.
    for (let k = 0; k < 7; k++) Coach.record('spelling', k < 2);
    for (let k = 0; k < 8; k++) Coach.record('words', true);
    const w = C.units[0].words[3]; gradeWord(w, false); gradeWord(w, false);
    Store.save();
    return [Coach.weakSpots().map((x) => x.skill).join(), Coach.trickyWords().map((x) => x.t).join(), Coach.tip().skill];
  });
  if (setup[0] !== 'spelling' || !setup[1] || setup[2] !== 'spelling') fail('coach weak spots: ' + setup);
  await page.evaluate(() => App.show('practice'));
  const txt = await page.textContent('.coach-card');
  if (!/Spelling/.test(txt) || !/2 of 7/.test(txt) || !/mixing up/.test(txt)) fail('weak spots card: ' + txt);
  await page.waitForSelector('.coach-pop');
  if (!/Strengthen your spelling/.test(await page.textContent('.coach-pop'))) fail('coach pop-up text');
  await page.click('.coach-pop .btn.primary');
  if ((await page.evaluate(() => [App.overlayKind, Games.session && Games.session.game.id].join())) !== 'game,scramble') fail('coach pop-up did not start Scramble');
  await page.evaluate(() => { Games.session.quit(); App.show('practice'); });
  if (await page.$('.coach-pop')) fail('coach pop-up came back the same day');
  const queues = await page.evaluate(() => {
    const kinds = (k) => [...new Set(buildPracticeQueue(k).map((x) => x.kind))].sort().join('+');
    return [kinds('spelling'), kinds('gender'), kinds('sentences'), buildPracticeQueue('sentences').length, kinds('speaking')];
  });
  if (!/^(spell|spell\+type|type)$/.test(queues[0]) || queues[1] !== 'article' || queues[2] !== 'build+decode+gap' || queues[3] !== 8 || queues[4] !== 'speak') fail('targeted practice: ' + queues);
  await playSession(page, "openPractice('sentences')", 'sentence practice');
  await page.close();
  console.log('  ok coach: weak spots, tips, targeted practice');
}

// ---------------------------------------------------------------- hearts and Pro
{
  const page = await newPage({ profile: { name: 'Hearty' }, native: 'en', target: 'es', coins: 400, sessions: 5, settings: { sound: false } });
  await page.waitForSelector('#tabs:not([hidden])');
  if ((await page.textContent('.chip.hearts')).trim() !== '5') fail('free players should start the day with 5 hearts');
  // Five wrong answers in a lesson: out of hearts.
  await page.evaluate(() => {
    const u = C.units[0];
    const q = u.words.slice(0, 7).map((w) => ({ kind: 'meaning', word: w, gen: () => EX.meaning(w, { words: u.words }) }));
    window.__q = q; window.__i = 0;
    openSession(q, { lesson: C.lessons[0] });
  });
  for (let k = 0; k < 5; k++) {
    await page.evaluate(() => {
      const w = window.__q[Math.min(window.__i, 6)].word;
      const cur = document.querySelector('.prompt-word').textContent;
      const wrongBtn = [...document.querySelectorAll('.opt')].find((b) => !cur.includes(b.opt.t) && b.opt !== w && b.opt.t !== cur.replace(/\s/g, ''));
      wrongBtn.click();
      document.querySelector('.ses-foot .btn.primary').click();
    });
    await page.click('.ses-foot .btn.primary');
    await page.evaluate(() => { window.__i++; });
  }
  const out = await page.evaluate(() => [Hearts.left(), App.overlayKind, !!document.querySelector('.hearts-sheet')]);
  if (out.join() !== '0,ask,true') fail('running out of hearts in a lesson: ' + out);
  // Refill with coins and carry on with the lesson.
  await page.click('.hearts-sheet .refill');
  const refilled = await page.evaluate(() => [Hearts.left(), Store.data.coins, App.overlayKind, !!document.querySelector('.opt')]);
  if (refilled.join() !== '5,100,lesson,true') fail('refilling hearts: ' + refilled);
  // No hearts: a lesson won't start, but practice gives one back.
  await page.evaluate(() => { App.closeOverlay(); Store.data.hearts = { n: 0, day: today() }; openLesson(C.lessons[0]); });
  if (!(await page.$('.hearts-sheet'))) fail('a lesson started with no hearts');
  await page.evaluate(() => App.closeOverlay());
  await page.evaluate(() => { C.lessons.slice(0, 2).forEach((l) => l.words.forEach((w) => { seeWord(w); gradeWord(w, true); })); });
  await page.evaluate(() => openPractice('review'));
  for (let step = 0; step < 300 && (await page.evaluate(() => App.overlayKind)) === 'lesson'; step++) {
    await page.evaluate(() => {
      const opts = [...document.querySelectorAll('.opt')];
      if (opts.length && !document.querySelector('.opt.sel')) pickOne(opts).click();
      for (const x of [...document.querySelectorAll('.tile-bank .wtile:not(.used)')].slice(0, 5)) x.click();
      for (const x of document.querySelectorAll('.ltiles .ltile:not(.used)')) x.click();
      const inp = document.querySelector('.type-in'); if (inp && !inp.value) { inp.value = 'x'; inp.dispatchEvent(new Event('input')); }
      const L = [...document.querySelectorAll('.match-item.t:not(.done)')], R = [...document.querySelectorAll('.match-item.n:not(.done)')]; if (L.length) { L[0].click(); pickOne(R).click(); }
      const mic = document.querySelector('.mic-btn:not(.on)'); if (mic && !document.querySelector('.ses-foot.show')) mic.click();
      const m = document.querySelector('.ses-foot .btn.primary'); if (m && !m.disabled && m.offsetParent) m.click();
    });
    await page.waitForTimeout(25);
  }
  if ((await page.evaluate(() => Hearts.left())) !== 1) fail('finishing a practice should give a heart back');
  // Leaving the results: a skippable "Go Pro" break for free players.
  await page.click('.results .btn.primary');
  await page.waitForSelector('.promo');
  if (!(await page.isDisabled('.promo .btn.ghost'))) fail('the Go Pro break can be skipped straight away');
  await page.waitForTimeout(3300);
  await page.click('.promo .btn.ghost');
  if (await page.evaluate(() => App.overlayKind)) fail('skipping the Go Pro break did not carry on');
  // Mini games pay 3 coins.
  const gameCoins = await page.evaluate(() => { const before = Store.data.coins; Games.start(GAMES.find((g) => g.id === 'quiz')); Games.session.right = 6; Games.session.finish(); const c = Store.data.coins - before; App.closeOverlay(); return c; });
  if (gameCoins !== 3) fail('a mini game should give 3 coins, gave ' + gameCoins);
  // Pro: unlimited hearts, monthly bonus, PRO tag, no breaks.
  const pro = await page.evaluate(() => {
    App.show('settings');
    const v = [...document.querySelectorAll('.setting')].find((x) => /Version/.test(x.textContent));
    for (let k = 0; k < 7; k++) v.click();
    const coinsAfter = Store.data.coins;
    App.show('me');
    return [Pro.is(), Hearts.label(), !!document.querySelector('.banner .pro-tag'), Store.data.proMonth === today().slice(0, 7), coinsAfter];
  });
  if (pro.slice(0, 4).join() !== 'true,∞,true,true') fail('Pro preview: ' + pro);
  await page.evaluate(() => { Store.data.hearts = { n: 0, day: today() }; openLesson(C.lessons[0]); });
  if ((await page.evaluate(() => App.overlayKind)) !== 'lesson' || (await page.$('.ses-hearts'))) fail('Pro lessons should need no hearts');
  await page.evaluate(() => { App.closeOverlay(); openPro(); });
  if (!/You’re Pro/.test(await page.textContent('.pro-page'))) fail('Pro page should say you are Pro');
  await page.close();
  console.log('  ok hearts, Pro, Go Pro breaks, game coins');
}

// ---------------------------------------------------------------- daily chest, achievements, streak rewards
{
  const page = await newPage({ profile: { name: 'Chesty' }, native: 'en', target: 'fr', settings: { sound: false } });
  await page.waitForSelector('#tabs:not([hidden])');
  if (!(await page.$('.chest-btn.locked'))) fail('daily chest should be locked before learning anything today');
  await playSession(page, 'openLesson(C.lessons[0])', 'first lesson for the chest');
  const after = await page.evaluate(() => [Chest.state(), !!Store.data.achievements.lesson1, Store.data.coins]);
  // 20 for the lesson + 20 for the "first lesson" achievement.
  if (after.join() !== 'ready,true,40') fail('after a first lesson (chest, achievement, coins): ' + after);
  await page.evaluate(() => { App.closeOverlay(); App.show('learn'); });
  await page.click('.chest-btn.ready');
  await page.click('.chest-page .btn.primary');
  await page.waitForFunction(() => /\+\d+/.test(document.querySelector('.chest-prize')?.textContent || ''), null, { timeout: 5000 });
  const chest = await page.evaluate(() => [Chest.state(), Store.data.coins - 40]);
  if (chest[0] !== 'opened' || ![10, 15, 20, 30, 50].includes(chest[1])) fail('opening the chest: ' + chest);
  // Streak rewards: hitting the goal for a 2nd week in a row pays 50 + 50 bonus.
  const streak = await page.evaluate(() => {
    const d = Store.data;
    d.weekStreak = { n: 1, last: prevWeekId(weekId()), best: 1 };
    d.week.secs = 0;
    const before = d.coins;
    Store.addTime(goalSecs());
    return [d.weekStreak.n, d.coins - before, d.weeksHit];
  });
  if (streak.join() !== '2,100,1') fail('streak reward for 2 weeks: ' + streak);
  await page.evaluate(() => App.show('awards'));
  const txt = await page.textContent('#view');
  if (!/Finish your first lesson/.test(txt) || !/Streak rewards/.test(txt)) fail('achievements page is missing things');
  await page.close();
  console.log('  ok daily chest, achievements, streak rewards');
}

// ---------------------------------------------------------------- games, shop, weekly goal, mountains
{
  const page = await newPage({ profile: { name: 'Gamer', avatar: 'banana', banner: 'blue' }, native: 'en', target: 'de', settings: { sound: false } });
  await page.waitForSelector('#tabs:not([hidden])');
  await page.evaluate(() => { C.lessons.slice(0, 8).forEach((l) => { Store.course.lessons[l.id] = { n: 1 }; l.words.forEach((w) => gradeWord(w, true)); }); Store.save(); });
  const ids = await page.evaluate(() => GAMES.map((g) => g.id));
  for (const id of ids) {
    await page.evaluate((g) => Games.start(GAMES.find((x) => x.id === g)), id);
    await page.waitForTimeout(400);
    for (let k = 0; k < 25; k++) {
      await page.evaluate(() => {
        const root = document.querySelector('#overlay');
        const els = [...root.querySelectorAll('.g-stage button, .hole, .duel .opt')].filter((b) => !b.disabled && b.offsetParent);
        if (!els.length) return;
        const el = pickOne(els);
        const r = el.getBoundingClientRect();
        const o = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
        el.dispatchEvent(new PointerEvent('pointerdown', o));
        el.click();
      });
      await page.waitForTimeout(80);
    }
    const s = await stray(page);
    if (s) fail(`game ${id}: stray text "${s}"`);
    await page.evaluate(() => { if (Games.session) Games.session.finish(); });
    await page.waitForTimeout(150);
    const kind = await page.evaluate(() => App.overlayKind);
    if (kind !== 'results' && kind !== 'duel') fail(`game ${id}: ended on ${kind}`);
    await page.evaluate(() => App.closeOverlay());
  }
  console.log(`  ok ${ids.length} games`);

  // Shop: can't buy without enough coins; can with them.
  const shop = await page.evaluate(() => {
    const d = Store.data;
    d.coins = 100; Store.save();
    App.show('shop');
    [...document.querySelectorAll('.shop-row')][1].querySelector('button').click();
    const before = Store.data.freezes || 0;
    Store.data.coins = 1000; Store.save(); App.show('shop');
    [...document.querySelectorAll('.shop-row')][1].querySelector('button').click();
    [...document.querySelectorAll('.shop-row')][0].querySelector('button').click();
    return [before, Store.data.freezes, Store.data.coins, Store.boosted()];
  });
  if (shop.join() !== '0,1,550,true') fail('shop misbehaves: ' + shop);
  // Buying a hat in the wardrobe, and wearing it.
  const hat = await page.evaluate(() => {
    App.show('shop');
    [...document.querySelectorAll('.builder-wrap .seg button')][2].click();
    const crown = [...document.querySelectorAll('.look-grid .look-item')][5];
    crown.click();
    return [Store.data.coins, myLook().hat, (Store.data.wardrobe || []).join()];
  });
  // 150 left after the 400-coin crown, +20 for the "first clothes" achievement.
  if (hat.join('|') !== '170|crown|hat:crown') fail('wardrobe purchase wrong: ' + hat);

  // The weekly goal: 20 minutes completes it and starts a streak, with 5 gems.
  const week = await page.evaluate(() => {
    const d = Store.data;
    d.week = { id: weekId(), secs: 0, xp: 0 }; d.weekStreak = { n: 2, last: prevWeekId(weekId()), best: 2 }; d.coins = 0;
    const a = Store.addTime(19 * 60);
    const b = Store.addTime(60);
    return [a, b, Store.weekStreakNow(), d.coins];
  });
  if (week.join() !== 'false,true,3,50') fail('weekly goal/streak wrong: ' + week);
  // A missed week ends the streak unless there's a freeze.
  const roll = await page.evaluate(() => {
    const d = Store.data;
    const w = weekId(), p1 = prevWeekId(w), p2 = prevWeekId(p1);
    d.weekStreak = { n: 4, last: p2, best: 4 }; d.week = { id: p1, secs: 100, xp: 0 }; d.freezes = 1;
    Store.rollWeek();
    const kept = [d.weekStreak.n, d.freezes];
    d.weekStreak = { n: 4, last: p2, best: 4 }; d.week = { id: p1, secs: 100, xp: 0 }; d.freezes = 0;
    Store.rollWeek();
    return [...kept, d.weekStreak.n];
  });
  if (roll.join() !== '4,0,0') fail('streak freeze wrong: ' + roll);

  // Finishing a mountain reveals it, gives a badge and gems.
  const mtn = await page.evaluate(async () => {
    const m = LP_COURSE[0];
    const ls = C.lessons.filter((l) => l.unit.mountain === m);
    ls.slice(0, -1).forEach((l) => { Store.course.lessons[l.id] = { n: 1 }; });
    const hiddenBefore = !document.querySelector('.mtn.done');
    openLesson(ls.at(-1));
    return { hiddenBefore, last: ls.at(-1).id };
  });
  await playSession(page, '0', 'last lesson of Snowdon');
  const MOUNTAIN_XP_T = 500;
  const after = await page.evaluate(() => [!!Store.course.mountains.snowdon, App.tab, Store.data.xp, Store.data.coins]);
  if (!after[0]) fail('finishing Snowdon did not complete the mountain');
  if (after[2] < MOUNTAIN_XP_T || after[3] < 300) fail('a finished mountain did not give its XP and coins: ' + after);
  await page.evaluate(() => App.revealMountain(LP_COURSE[0]));
  if (/Snowdon/.test(await page.textContent('.reveal'))) fail('reveal gives the name away before the drum roll');
  await page.waitForTimeout(2600); // drum roll, then the name types itself in
  if (!/Snowdon/.test(await page.textContent('.reveal'))) fail('reveal does not name the mountain');
  await page.evaluate(() => { App.closeOverlay(); App.show('me'); });
  if (!(await page.$('.banner .badge'))) fail('no badge on the banner after a mountain');
  await page.evaluate(() => App.show('learn'));
  // Only the mountain you're on is shown (with its name at the summit), plus badges for climbed ones.
  const view = await page.textContent('#view');
  if (!/Ben Nevis/.test(view) || !/Snowdon/.test(view) || /Mulhac/.test(view) || (await page.$$('.big-mountain')).length !== 1) fail('mountain view: should show just Ben Nevis, with Snowdon climbed');

  // Tapping a word in what a character says shows what it means.
  const gloss = await page.evaluate(async () => {
    const out = [];
    for (const pair of [['en', 'es'], ['en', 'de'], ['es', 'fr'], ['de', 'pt'], ['fr', 'en']]) {
      Store.data.native = pair[0]; Store.data.target = pair[1]; UI.lang = pair[0]; buildCourse();
      let missing = 0, total = 0;
      for (const u of C.units) for (const s of u.sentences) {
        const toks = tokens(s.t);
        toks.forEach((_, i) => { total++; if (!lookupWord(toks, i)) missing++; });
      }
      out.push(`${pair.join('>')}:${missing}/${total}`);
    }
    Store.data.native = 'en'; Store.data.target = 'de'; UI.lang = 'en'; buildCourse();
    const s = C.units[0].sentences[0];
    openSession([{ kind: 'decode', sentence: s, gen: () => EX.decode(s) }], { practice: 'review' });
    document.querySelector('.bubble-text .tw').click();
    const pop = document.querySelector('.gloss');
    out.push(pop ? 'popup:' + pop.textContent : 'no popup');
    App.closeOverlay();
    return out;
  });
  if (gloss.some((x) => /:(\d+)\//.test(x) && Number(x.match(/:(\d+)\//)[1]) > 0)) fail('words with no translation when tapped: ' + gloss.join(' '));
  if (!/^popup:\S/.test(gloss.at(-1))) fail('tapping a word showed nothing: ' + gloss.at(-1));

  // Changing a setting doesn't jump back to the top of the page.
  const kept = await page.evaluate(() => {
    App.show('settings');
    const view = document.querySelector('#view');
    view.scrollTop = 300;
    const before = view.scrollTop;
    [...document.querySelectorAll('.seg button')].find((b) => b.textContent === t('me.fast')).click();
    App.refresh();
    return [before > 0, view.scrollTop === before, Store.s.rate];
  });
  if (kept.join() !== 'true,true,1.15') fail('settings jump the page: ' + kept);

  // Typing: accents and a small typo are forgiven, a different word isn't.
  const typed = await page.evaluate(() => [markTyped('por favore', ['por favor']).ok, markTyped('adios', ['adiós']).how, markTyped('favor', ['por favor']).ok, markTyped('hund', ['der Hund']).ok]);
  if (typed.join() !== 'true,accent,false,true') fail('marking typed answers: ' + typed);

  // Back button.
  const back = await page.evaluate(() => { App.show('shop'); const a = appBack(); const b = appBack(); return [a, b, App.tab]; });
  if (back.join() !== 'true,false,learn') fail('back button: ' + back);
  // Switching course keeps both courses' progress.
  await page.evaluate(() => { Onboarding.start(1); });
  await page.click('.onb-foot .btn.primary');
  await page.click('.lang-opt:has-text("French")');
  await page.click('.onb-foot .btn.primary');
  const sw = await page.evaluate(() => [Store.data.target, Object.keys(Store.data.courses).sort().join()]);
  if (sw.join('|') !== 'fr|en>de,en>fr') fail('switching course: ' + sw);
  await page.close();
  console.log('  ok shop, weekly goal, mountains, back');
}

// ---------------------------------------------------------------- dark mode and the widget bridge
{
  const page = await browser.newPage({ viewport: { width: 400, height: 860 }, colorScheme: 'dark' });
  page.on('pageerror', (e) => fail(e.message));
  await page.addInitScript(() => {
    window.CLOUD_OVERRIDE = { url: '', anonKey: '' };
    localStorage.setItem('lingopeak.v1', JSON.stringify({ epoch: 2, profile: { name: 'Night', avatar: 'astro' }, native: 'en', target: 'pt' }));
    window.__widget = [];
    window.Native = { speakIn: () => {}, stop: () => {}, ttsState: () => 'ok', vibrate: () => {}, setBars: (d) => { window.__bars = d; }, updateWidget: (j) => window.__widget.push(JSON.parse(j)) };
  });
  await page.goto(url);
  await page.waitForSelector('#tabs:not([hidden])');
  const dark = await page.evaluate(() => [document.documentElement.dataset.theme, window.__bars]);
  if (dark.join() !== 'dark,true') fail('dark mode not followed: ' + dark);
  await page.evaluate(() => { Store.addTime(300); Store.save(); });
  const w = await page.evaluate(() => window.__widget.at(-1));
  if (!w || w.mins !== 5 || w.goal !== 20 || !w.weekId || !w.labels) fail('widget data wrong: ' + JSON.stringify(w));
  await page.close();
  console.log('  ok dark mode, widget');
}

await browser.close();
if (errors.length) { console.error('Smoke test failed:\n  ' + [...new Set(errors)].join('\n  ')); process.exit(1); }
console.log('Smoke test passed');
