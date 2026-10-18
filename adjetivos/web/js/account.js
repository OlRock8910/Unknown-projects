// Optional sign-in with an emailed one-time code, and progress saved to the
// account so it follows you to another phone. Talks to Supabase's REST API
// directly (no SDK): /auth/v1 for the code and session, /rest/v1/progress for
// the save. Hidden unless CLOUD (js/config.js) is filled in.

const Account = {
  KEY: 'adjetivos.session',
  session: null, // { access_token, refresh_token, expires_at (ms), user: { id, email } }
  lastSync: null,
  syncing: false,
  syncTimer: null,

  enabled: () => !!(CLOUD.url && CLOUD.anonKey),
  signedIn() { return !!(this.session && this.session.user); },
  email() { return this.signedIn() ? this.session.user.email : ''; },

  init() {
    try { this.session = JSON.parse(localStorage.getItem(this.KEY)) || null; } catch (e) { this.session = null; }
    if (this.enabled() && this.signedIn()) this.sync();
  },
  keep(session) {
    this.session = session;
    try {
      if (session) localStorage.setItem(this.KEY, JSON.stringify(session));
      else localStorage.removeItem(this.KEY);
    } catch (e) { /* storage blocked */ }
  },

  // ---------------------------------------------------------------- talking to Supabase
  async call(path, { method = 'POST', body, token, headers = {} } = {}) {
    let res;
    try {
      res = await fetch(CLOUD.url.replace(/\/$/, '') + path, {
        method,
        headers: {
          apikey: CLOUD.anonKey,
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw Object.assign(new Error('offline'), { friendly: 'Can’t reach the internet. Check your connection and try again.' });
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

  // A token that is good for at least another minute, refreshing if needed.
  async token() {
    const s = this.session;
    if (!s) throw new Error('signed out');
    if (s.expires_at - Date.now() > 60000) return s.access_token;
    try {
      const fresh = await this.call('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token } });
      this.keep(this.fromAuth(fresh));
      return this.session.access_token;
    } catch (e) {
      if (e.status === 400 || e.status === 401 || e.status === 403) this.keep(null); // refresh token no longer valid
      throw e;
    }
  },
  fromAuth(a) {
    const expiresAt = a.expires_at ? a.expires_at * 1000 : Date.now() + (a.expires_in || 3600) * 1000;
    return { access_token: a.access_token, refresh_token: a.refresh_token, expires_at: expiresAt, user: { id: a.user.id, email: a.user.email } };
  },

  // ---------------------------------------------------------------- signing in
  async sendCode(email) {
    try {
      await this.call('/auth/v1/otp', { body: { email, create_user: true } });
    } catch (e) {
      if (e.friendly) throw e;
      if (e.status === 429) e.friendly = 'Too many codes sent. Wait a few minutes, then try again.';
      else if (e.status === 400 || e.status === 422) e.friendly = 'That email address doesn’t look right.';
      else e.friendly = 'Couldn’t send the code. Try again in a moment.';
      throw e;
    }
  },
  async verify(email, code) {
    let a;
    try {
      a = await this.call('/auth/v1/verify', { body: { type: 'email', email, token: code } });
    } catch (e) {
      if (e.friendly) throw e;
      e.friendly = e.status === 429 ? 'Too many tries. Wait a few minutes, then try again.' : 'That code is wrong or has expired. Check the email, or send a new code.';
      throw e;
    }
    this.keep(this.fromAuth(a));
    await this.sync();
  },
  async signOut() {
    const s = this.session;
    this.keep(null);
    this.lastSync = null;
    if (s) { try { await this.call('/auth/v1/logout', { token: s.access_token }); } catch (e) { /* signed out here anyway */ } }
  },

  // ---------------------------------------------------------------- saving progress
  // Pulls the saved progress, merges it with this phone's, and saves the result
  // both here and to the account. Merging keeps the best of both, so playing on
  // two phones never loses anything.
  async sync() {
    if (!this.enabled() || !this.signedIn() || this.syncing) return;
    this.syncing = true;
    try {
      const token = await this.token();
      const uid = this.session.user.id;
      const rows = await this.call(`/rest/v1/progress?select=data&user_id=eq.${encodeURIComponent(uid)}`, { method: 'GET', token });
      if (rows && rows[0] && rows[0].data) {
        Store.data = mergeProgress(Store.data, rows[0].data);
        Store.save({ quiet: true });
      }
      await this.call('/rest/v1/progress?on_conflict=user_id', {
        token,
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: { user_id: uid, data: Store.data, updated_at: new Date().toISOString() },
      });
      this.lastSync = Date.now();
    } catch (e) {
      // Offline or signed out elsewhere: try again on the next save.
    } finally {
      this.syncing = false;
      if (window.onAccountChanged) window.onAccountChanged();
    }
  },
  // Called after every save; batches a burst of saves into one upload.
  queueSync() {
    if (!this.enabled() || !this.signedIn()) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.sync(), 3000);
  },
};

// The best of two saves: highest XP, scores, stars and word mastery, the
// most recent streak, and this phone's own settings.
function mergeProgress(local, cloud) {
  const max = (a, b) => Math.max(Number(a) || 0, Number(b) || 0);
  const maxEach = (a = {}, b = {}) => {
    const out = { ...a };
    for (const [k, v] of Object.entries(b || {})) out[k] = max(out[k], v);
    return out;
  };
  const out = { ...cloud, ...local };
  out.xp = max(local.xp, cloud.xp);
  out.played = max(local.played, cloud.played);
  out.best = maxEach(local.best, cloud.best);
  out.stars = maxEach(local.stars, cloud.stars);
  out.mastery = maxEach(local.mastery, cloud.mastery);
  const ls = local.streak || {}, cs = cloud.streak || {};
  out.streak = (cs.last || '') > (ls.last || '') ? cs : (ls.last || '') > (cs.last || '') ? ls : { last: ls.last || cs.last || null, n: max(ls.n, cs.n) };
  const ld = local.daily || {}, cd = cloud.daily || {};
  out.daily = ld.date === cd.date ? { date: ld.date, xp: max(ld.xp, cd.xp) } : ((cd.date || '') > (ld.date || '') ? cd : ld);
  out.settings = { ...(cloud.settings || {}), ...(local.settings || {}) };
  if (!out.settings.playerName && cloud.settings && cloud.settings.playerName) out.settings.playerName = cloud.settings.playerName;
  return out;
}

// The "Save your progress" card on the Me tab.
function accountCard() {
  if (!Account.enabled()) return null;
  const card = h('div', { class: 'card account' });
  const draw = (stage = Account.signedIn() ? 'in' : 'email', email = '', msg = '') => {
    if (stage === 'in') {
      const when = Account.lastSync ? `Saved ${Math.max(0, Math.round((Date.now() - Account.lastSync) / 60000))} min ago` : Account.syncing ? 'Saving…' : 'Not saved yet';
      card.replaceChildren(
        h('div', { class: 'acc-head' }, h('span', { class: 'acc-emoji' }, '☁️'), h('div', {}, h('b', {}, 'Progress saved to your account'), h('span', {}, Account.email()))),
        h('div', { class: 'acc-status' }, '✅ ' + when.replace('0 min ago', 'just now')),
        h('div', { class: 'row-btns wrap' },
          h('button', { class: 'btn ghost small', onclick: async () => { await Account.sync(); draw('in'); toast(Account.lastSync ? '☁️ Saved' : 'Couldn’t save — check your internet'); } }, '↻ Save now'),
          h('button', { class: 'btn ghost small', onclick: async () => { await Account.signOut(); draw('email'); toast('Signed out — your progress stays on this phone too'); } }, 'Sign out')));
      return;
    }
    const busyBtn = (btn, text) => { btn.disabled = true; btn.textContent = text; };
    if (stage === 'email') {
      const input = h('input', { class: 'search', type: 'email', placeholder: 'you@gmail.com', autocomplete: 'email', value: email });
      const err = h('div', { class: 'acc-error' }, msg);
      const btn = h('button', { class: 'btn primary' }, 'Send me a code');
      const send = async () => {
        const e = input.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { err.textContent = 'Type your whole email address, like you@gmail.com'; return; }
        busyBtn(btn, 'Sending…');
        try { await Account.sendCode(e); draw('code', e); } catch (x) { draw('email', e, x.friendly || 'Couldn’t send the code.'); }
      };
      btn.addEventListener('click', send);
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') send(); });
      card.replaceChildren(
        h('div', { class: 'acc-head' }, h('span', { class: 'acc-emoji' }, '☁️'), h('div', {}, h('b', {}, 'Save your progress'), h('span', {}, 'Sign in with your email and your XP, stars and words follow you to any phone. No password — we email you a code.'))),
        input, err, btn);
      return;
    }
    // stage === 'code'
    const input = h('input', { class: 'search code-input otp', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '10', placeholder: '••••••' });
    const err = h('div', { class: 'acc-error' }, msg);
    const btn = h('button', { class: 'btn primary' }, 'Sign in');
    const check = async () => {
      const code = input.value.replace(/\D/g, '');
      if (code.length < 6) { err.textContent = 'The code is 6 numbers — check your email.'; return; }
      busyBtn(btn, 'Checking…');
      try { await Account.verify(email, code); draw('in'); toast('☁️ Signed in — your progress is saved'); App.refresh(); } catch (x) { draw('code', email, x.friendly || 'That code didn’t work.'); }
    };
    btn.addEventListener('click', check);
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') check(); });
    input.addEventListener('input', () => { if (input.value.replace(/\D/g, '').length === 6) check(); });
    const resend = h('button', { class: 'btn ghost small' }, 'Send a new code');
    resend.addEventListener('click', async () => {
      busyBtn(resend, 'Sending…');
      try { await Account.sendCode(email); draw('code', email, ''); toast('📧 New code sent'); } catch (x) { draw('code', email, x.friendly); }
    });
    card.replaceChildren(
      h('div', { class: 'acc-head' }, h('span', { class: 'acc-emoji' }, '📧'), h('div', {}, h('b', {}, 'Check your email'), h('span', {}, `We sent a code to ${email}. Type it here. (Can’t see it? Look in Spam.)`))),
      input, err, btn,
      h('div', { class: 'row-btns wrap' }, resend, h('button', { class: 'btn ghost small', onclick: () => draw('email', email) }, 'Use a different email')));
    setTimeout(() => input.focus(), 50);
  };
  draw();
  return card;
}
