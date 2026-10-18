// Leaderboards, friends and an online backup of your progress, through
// Supabase's REST API (no SDK). You get an anonymous account automatically
// the first time the phone is online, and can save it to an email and
// password to log in on another phone. Setting up the database:
// docs/CLOUD.md. Without it, everything else still works.

const CLOUD = window.CLOUD_OVERRIDE || {
  url: 'https://sjbncalappjgwidhookp.supabase.co',
  anonKey: 'sb_publishable_VTAO_CwKgZF9J0R1hQD8VQ_JOiJErZz',
};

const Cloud = {
  KEY: 'lingopeak.session',
  session: null, // { access_token, refresh_token, expires_at, user: { id } }
  state: 'off',  // 'off' | 'connecting' | 'ok' | 'no-tables' | 'no-anon' | 'offline'
  profile: null,
  timer: null,
  syncing: false,

  enabled: () => !!(CLOUD.url && CLOUD.anonKey),
  init() {
    if (!this.enabled()) return;
    try { this.session = JSON.parse(localStorage.getItem(this.KEY)) || null; } catch (e) { this.session = null; }
    if (Store.data.profile) this.sync();
  },
  keep(s) {
    this.session = s;
    try { if (s) localStorage.setItem(this.KEY, JSON.stringify(s)); else localStorage.removeItem(this.KEY); } catch (e) { /* ignore */ }
  },

  async call(path, { method = 'POST', body, token, headers = {} } = {}) {
    let res;
    try {
      res = await fetch(CLOUD.url.replace(/\/$/, '') + path, {
        method,
        headers: { apikey: CLOUD.anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw Object.assign(new Error('offline'), { offline: true });
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && (data.msg || data.message || data.error_description)) || 'HTTP ' + res.status);
      err.status = res.status;
      err.code = data && (data.error_code || data.code);
      throw err;
    }
    return data;
  },
  fromAuth(a) {
    return { access_token: a.access_token, refresh_token: a.refresh_token, expires_at: a.expires_at ? a.expires_at * 1000 : Date.now() + (a.expires_in || 3600) * 1000, user: { id: a.user.id, email: a.user.email || null } };
  },
  email() { return (this.session && this.session.user.email) || null; },

  // ---- email accounts: no passwords, a 6-digit code is emailed instead.
  // Why an email sign-in failed, as a key for t().
  authError(e) {
    if (e.offline) return 'auth.offline';
    const m = `${e.status} ${e.code} ${e.message}`;
    if (/429|rate|too many|security purposes/i.test(m)) return 'auth.tooMany';
    if (/otp|token|expired|invalid/i.test(m)) return 'auth.badCode';
    if (/email/i.test(m)) return 'auth.badEmail';
    return 'auth.offline';
  },
  // Emails a code (making the account if the email is new).
  async sendCode(email) {
    await this.call('/auth/v1/otp', { body: { email, create_user: true, data: { app: 'lingopeak' } } });
  },
  // Checks the code; on success this phone is signed in to that email.
  async verifyCode(email, code) {
    const a = await this.call('/auth/v1/verify', { body: { type: 'email', email, token: code } });
    if (!a || !a.access_token) throw Object.assign(new Error('invalid token'), { code: 'otp_expired' });
    const old = this.session;
    this.keep(this.fromAuth(a));
    return old;
  },
  // After a code from "Save your progress": this phone's progress moves onto
  // the email account (merged with anything already saved there).
  async saveTo(email, code) {
    const old = await this.verifyCode(email, code);
    // The anonymous account this phone had before goes, so its username is free.
    if (old && !old.user.email && old.user.id !== this.session.user.id) {
      try { await this.call('/rest/v1/rpc/lp_delete_me', { token: old.access_token, body: {} }); } catch (e) { /* not set up yet */ }
    }
    this.state = 'off';
    await this.sync();
  },
  // After a code from "Log in": loads that account's progress onto this
  // phone. Returns true if it already has a profile (false: finish setting up).
  async logIn(email, code) {
    await this.verifyCode(email, code);
    const token = this.session.access_token, uid = this.session.user.id;
    let saved = null, prof = null;
    try {
      [saved, prof] = await Promise.all([
        this.call(`/rest/v1/lp_progress?select=data&user_id=eq.${uid}`, { method: 'GET', token }),
        this.call(`/rest/v1/lp_profiles?select=*&user_id=eq.${uid}`, { method: 'GET', token }),
      ]);
    } catch (e) { if (e.offline) throw e; }
    const data = saved && saved[0] && saved[0].data;
    const d = Store.defaults();
    Store.data = { ...d, ...(data || {}), epoch: DATA_EPOCH, settings: { ...d.settings, ...((data && data.settings) || {}) } };
    this.profile = prof && prof[0];
    if (!Store.data.profile && this.profile) Store.data.profile = { name: this.profile.name, look: this.profile.look, banner: 'blue', joined: today() };
    Store.rollWeek();
    Store.save({ quiet: true });
    this.state = 'ok';
    return !!(Store.data.profile && Store.data.target);
  },
  // Forgets this phone's copy (the account stays online to log back in to).
  async logOut() {
    try { await this.sync(); } catch (e) { /* keep going */ }
    this.wipePhone();
  },
  // Deletes the account online and everything on this phone.
  async deleteAccount() {
    if (this.session) {
      const token = await this.token();
      await this.call('/rest/v1/rpc/lp_delete_me', { token, body: {} });
    }
    this.wipePhone();
  },
  wipePhone() {
    this.keep(null);
    try { localStorage.removeItem(Store.KEY); } catch (e) { /* ignore */ }
    Store.data = null;
  },
  // A token good for at least a minute: signs up anonymously the first time.
  async token() {
    if (!this.enabled()) throw Object.assign(new Error('offline'), { offline: true });
    const s = this.session;
    if (s && s.expires_at - Date.now() > 60000) return s.access_token;
    if (s) {
      try {
        this.keep(this.fromAuth(await this.call('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token } })));
        return this.session.access_token;
      } catch (e) {
        if (e.offline) throw e;
        this.keep(null);
      }
    }
    try {
      this.keep(this.fromAuth(await this.call('/auth/v1/signup', { body: { data: { app: 'lingopeak' } } })));
    } catch (e) {
      if (!e.offline && (e.status === 422 || /anonymous/i.test(e.message))) this.state = 'no-anon';
      throw e;
    }
    return this.session.access_token;
  },
  noTable: (e) => e.status === 404 || /PGRST20[25]|42P01|42883|does not exist|schema cache/i.test(`${e.code} ${e.message}`),

  // What everyone else can see about you.
  publicProfile() {
    const d = Store.data;
    const badges = LP_COURSE.filter((m) => Object.values(d.courses).some((c) => c.mountains && c.mountains[m.id])).map((m) => m.id);
    const stats = typeof courseStats === 'function' && C ? courseStats() : { words: 0 };
    return {
      name: d.profile.name, look: myLook(), badges,
      learning: d.target, xp: d.xp, week: d.week.id, week_xp: d.week.xp, week_streak: Store.weekStreakNow(), words: stats.words,
    };
  },

  // Uploads your profile and progress (merging with what's saved online).
  async sync() {
    if (!this.enabled() || !Store.data.profile || this.syncing) return;
    this.syncing = true;
    if (this.state === 'off') this.state = 'connecting';
    try {
      const token = await this.token();
      const uid = this.session.user.id;
      const rows = await this.call(`/rest/v1/lp_profiles?on_conflict=user_id`, {
        token, headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: { user_id: uid, ...this.publicProfile(), updated_at: new Date().toISOString() },
      });
      this.profile = rows && rows[0];
      const saved = await this.call(`/rest/v1/lp_progress?select=data&user_id=eq.${uid}`, { method: 'GET', token });
      if (saved && saved[0] && saved[0].data) { Store.data = mergeProgress(Store.data, saved[0].data); Store.save({ quiet: true }); }
      await this.call('/rest/v1/lp_progress?on_conflict=user_id', {
        token, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: { user_id: uid, data: Store.data, updated_at: new Date().toISOString() },
      });
      this.state = 'ok';
    } catch (e) {
      if (e.offline) this.state = 'offline';
      else if (e.status === 409 || e.code === '23505') { this.state = 'name-taken'; toast(t('onb.nameTaken') + ' ' + t('me.renameHint'), 5000); }
      else if (this.noTable(e)) this.state = 'no-tables';
      else if (this.state !== 'no-anon') this.state = 'offline';
    } finally {
      this.syncing = false;
    }
  },
  queueSync() {
    if (!this.enabled() || !Store.data.profile) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), 3000);
  },

  // ---- leaderboards: 'week' | 'lang' | 'all' | 'friends'
  async board(kind) {
    const token = await this.token();
    const cols = 'user_id,name,look,badges,learning,xp,week_xp,week_streak,words';
    if (kind === 'friends') {
      const fr = await this.call(`/rest/v1/lp_friends?select=friend_id&user_id=eq.${this.session.user.id}`, { method: 'GET', token });
      const ids = [this.session.user.id, ...(fr || []).map((f) => f.friend_id)];
      const rows = await this.call(`/rest/v1/lp_profiles?select=${cols},week&user_id=in.(${ids.join(',')})`, { method: 'GET', token });
      return (rows || []).map((r) => ({ ...r, week_xp: r.week === weekId() ? r.week_xp : 0 })).sort((a, b) => b.week_xp - a.week_xp || b.xp - a.xp);
    }
    const q = kind === 'all' ? 'order=xp.desc' : `week=eq.${weekId()}&order=week_xp.desc${kind === 'lang' ? '&learning=eq.' + Store.data.target : ''}`;
    return this.call(`/rest/v1/lp_profiles?select=${cols}&${q}&limit=50`, { method: 'GET', token });
  },
  // Is a username free? true / false, or null when we can't tell (offline).
  async nameFree(name) {
    if (!this.enabled()) return null;
    try {
      const free = await this.call('/rest/v1/rpc/lp_name_free', { body: { wanted: name } });
      return free === true ? true : free === false ? false : null;
    } catch (e) { return null; }
  },
  async addFriend(code) {
    return this.call('/rest/v1/rpc/lp_add_friend', { token: await this.token(), body: { friend_code: code } });
  },
  async removeFriend(id) {
    return this.call('/rest/v1/rpc/lp_remove_friend', { token: await this.token(), body: { friend: id } });
  },
};

// The best of two saves of your progress: most XP, coins and words
// learned, every lesson finished on either phone, and this phone's settings.
function mergeProgress(local, cloud) {
  const max = (a, b) => Math.max(Number(a) || 0, Number(b) || 0);
  const out = { ...cloud, ...local };
  for (const k of ['xp', 'coins', 'totalSecs', 'sessions', 'freezes', 'boostUntil']) out[k] = max(local[k], cloud[k]);
  out.owned = [...new Set([...(cloud.owned || []), ...(local.owned || [])])];
  out.best = { ...(cloud.best || {}) };
  for (const [k, v] of Object.entries(local.best || {})) out.best[k] = max(out.best[k], v);
  out.courses = { ...(cloud.courses || {}) };
  for (const [pair, lc] of Object.entries(local.courses || {})) {
    const cc = out.courses[pair] || { lessons: {}, words: {}, mountains: {} };
    const words = { ...cc.words };
    for (const [id, w] of Object.entries(lc.words || {})) if (!words[id] || (w.last || 0) > (words[id].last || 0)) words[id] = w;
    out.courses[pair] = { lessons: { ...cc.lessons, ...lc.lessons }, words, mountains: { ...cc.mountains, ...lc.mountains } };
  }
  const lw = local.week || {}, cw = cloud.week || {};
  out.week = lw.id === cw.id ? { id: lw.id, secs: max(lw.secs, cw.secs), xp: max(lw.xp, cw.xp) } : ((cw.id || '') > (lw.id || '') ? cw : lw);
  const ls = local.weekStreak || {}, cs = cloud.weekStreak || {};
  out.weekStreak = (cs.last || '') > (ls.last || '') ? cs : ls;
  out.weekStreak.best = max(ls.best, cs.best);
  out.settings = { ...(cloud.settings || {}), ...(local.settings || {}) };
  out.profile = local.profile || cloud.profile;
  return out;
}

// ------------------------------------------------------------------ the Ranks tab
let boardKind = 'week';
function leaderboardView() {
  const wrap = h('div', { class: 'ranks' });
  const tabs = h('div', { class: 'seg wide' }, ...[['week', t('ranks.week')], ['lang', t('lang.' + Store.data.target)], ['all', t('ranks.all')], ['friends', t('ranks.friends')]].map(([k, label]) =>
    h('button', { class: boardKind === k ? 'on' : '', onclick: () => { boardKind = k; App.refresh(); } }, label)));
  const list = h('div', { class: 'card board' }, h('div', { class: 'muted center-msg' }, t('ranks.loading')));
  wrap.append(tabs, list);
  if (boardKind === 'friends') wrap.append(friendsCard());
  const msg = (text, extra) => list.replaceChildren(h('div', { class: 'center-msg' }, castArt('penguin', 'sad', 'msg-cast'), h('p', { class: 'muted' }, text), extra || null));
  if (!Cloud.enabled()) { msg(t('ranks.offline')); return wrap; }
  (async () => {
    try {
      if (Cloud.state !== 'ok') await Cloud.sync();
      if (Cloud.state === 'no-tables') return msg(t('ranks.notSetUp'));
      if (Cloud.state === 'no-anon') return msg(t('ranks.noAnon'));
      if (Cloud.state === 'offline') return msg(t('ranks.offline'), h('button', { class: 'btn ghost small', onclick: () => App.refresh() }, icon('refresh'), t('ranks.retry')));
      const rows = await Cloud.board(boardKind);
      const me = Cloud.session && Cloud.session.user.id;
      const val = (r) => (boardKind === 'all' ? `${fmtNum(r.xp)} XP` : `${fmtNum(r.week_xp)} XP`);
      if (!rows || !rows.length) return msg(t('ranks.empty'));
      list.replaceChildren(...rows.map((r, i) => h('div', { class: 'rank-row' + (r.user_id === me ? ' me' : '') },
        h('span', { class: 'rank-n' + (i < 3 ? ' top' + i : '') }, i < 3 ? icon(i === 0 ? 'crown' : 'trophy') : i + 1),
        lookAvatar(r.look, 'sm'),
        h('div', { class: 'rank-name' }, h('b', {}, r.name + (r.user_id === me ? ` (${t('ranks.you')})` : '')),
          h('small', {}, [t('lang.' + r.learning), r.week_streak ? t('ranks.wk', { n: r.week_streak }) : ''].filter(Boolean).join(' · '))),
        h('div', { class: 'rank-badges' }, ...(r.badges || []).slice(-3).map((id) => { const m = LP_COURSE.find((x) => x.id === id); return m ? badgeArt(m, 'xs') : null; })),
        h('b', { class: 'rank-val' }, val(r)))));
    } catch (e) {
      msg(t('ranks.offline'));
    }
  })();
  return wrap;
}

function friendsCard() {
  const code = Cloud.profile && Cloud.profile.code;
  const input = h('input', { class: 'field code', placeholder: t('ranks.friendCode'), maxlength: '6', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' });
  const err = h('div', { class: 'err' });
  const add = async () => {
    const c = input.value.trim().toUpperCase();
    if (c.length !== 6) { err.textContent = t('ranks.codeLen'); return; }
    try {
      const name = await Cloud.addFriend(c);
      toast(t('ranks.added', { name: name || '' }));
      Sfx.win();
      App.refresh();
    } catch (e) {
      err.textContent = /own/i.test(e.message) ? t('ranks.ownCode') : /no such/i.test(e.message) ? t('ranks.noCode') : t('ranks.offline');
    }
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
  return h('div', { class: 'card friends' },
    h('div', { class: 'fr-code' }, h('div', {}, h('small', { class: 'muted' }, t('ranks.yourCode')), h('div', { class: 'code-big' }, code || '······')),
      h('button', { class: 'btn primary small', disabled: !code || null, onclick: () => Share.send(t('ranks.shareCode', { code })) }, icon('share'), t('ranks.send'))),
    h('div', { class: 'fr-add' }, input, h('button', { class: 'btn primary', onclick: add }, icon('plus'))),
    err);
}

// Email first; Continue emails a 6-digit code, then the code is typed in.
// onCode(email, code, setErr) finishes (log in, or save progress).
function emailCodeForm(onCode, extra = null) {
  const wrap = h('div', { class: 'auth-form' });
  let email = '';
  let wait = null;

  const emailStage = () => {
    const input = h('input', { class: 'field', type: 'email', placeholder: t('auth.email'), value: email, autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', inputmode: 'email' });
    const err = h('div', { class: 'err' });
    const go = h('button', { class: 'btn primary wide' }, t('auth.continue'));
    const send = async () => {
      const e = input.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { err.textContent = t('auth.badEmail'); Sfx.oops(); return; }
      err.textContent = '';
      go.disabled = true; go.classList.add('busy');
      try {
        await Cloud.sendCode(e);
        email = e;
        codeStage();
      } catch (x) { err.textContent = t(Cloud.authError(x)); Sfx.oops(); } finally { go.disabled = false; go.classList.remove('busy'); }
    };
    go.addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    input.addEventListener('input', () => { err.textContent = ''; });
    wrap.replaceChildren(input, err, go, extra || '');
    wrap.classList.remove('code-stage');
  };

  const codeStage = () => {
    const input = h('input', { class: 'field code-field', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', placeholder: '······', 'aria-label': t('auth.code') });
    const err = h('div', { class: 'err' });
    const verify = h('button', { class: 'btn primary wide' }, t('auth.verify'));
    const resend = h('button', { class: 'link-btn' });
    let left = 0;
    clearInterval(wait);
    const tick = () => {
      if (!resend.isConnected && left < 60) { clearInterval(wait); return; }
      resend.disabled = left > 0;
      resend.textContent = left > 0 ? t('auth.resendIn', { n: left }) : t('auth.resend');
      left--;
    };
    const startWait = () => { left = 60; tick(); clearInterval(wait); wait = setInterval(tick, 1000); };
    const check = async () => {
      const code = input.value.replace(/\D/g, '');
      if (code.length !== 6) { err.textContent = t('auth.badCode'); Sfx.oops(); return; }
      err.textContent = '';
      verify.disabled = true; verify.classList.add('busy');
      try { await onCode(email, code, (k) => { err.textContent = t(k); Sfx.oops(); }); clearInterval(wait); }
      catch (x) { err.textContent = t(Cloud.authError(x)); Sfx.oops(); input.select(); }
      finally { verify.disabled = false; verify.classList.remove('busy'); }
    };
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      err.textContent = '';
      if (input.value.length === 6) check();
    });
    verify.addEventListener('click', check);
    resend.addEventListener('click', async () => {
      if (left > 0) return;
      try { await Cloud.sendCode(email); toast(t('auth.newCode')); startWait(); } catch (x) { err.textContent = t(Cloud.authError(x)); }
    });
    wrap.replaceChildren(
      h('div', { class: 'code-sent' }, icon('check', 'big', 'check'), h('b', {}, t('auth.codeTitle')), h('span', {}, t('auth.codeSent', { email }))),
      input, err, verify,
      h('div', { class: 'code-links' }, resend, h('button', { class: 'link-btn', onclick: () => { clearInterval(wait); emailStage(); } }, t('auth.otherEmail'))));
    wrap.classList.add('code-stage');
    startWait();
    setTimeout(() => input.focus(), 50);
  };

  emailStage();
  return wrap;
}

// "Save your progress": add an email and password to this phone's account.
function openSaveAccount() {
  const host = App.openOverlay('account');
  host.replaceChildren(h('div', { class: 'sheet-page' },
    h('div', { class: 'sheet-top' }, h('button', { class: 'icon-btn', onclick: () => App.closeOverlay() }, icon('x'))),
    h('div', { class: 'auth-art' }, icon('cloud', 'big')),
    h('h1', {}, t('auth.saveTitle')),
    h('p', { class: 'muted' }, t('auth.saveSub')),
    emailCodeForm(async (email, code) => {
      await Cloud.saveTo(email, code);
      Sfx.win();
      toast(t('auth.saved', { email }), 4000);
      App.closeOverlay();
    })));
}
