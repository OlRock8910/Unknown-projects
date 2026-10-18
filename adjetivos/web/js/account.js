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
      else if (/sending|smtp|email/i.test(e.message)) e.friendly = `The email couldn’t be sent (${e.message}). The app’s email settings need fixing — try again later.`;
      else e.friendly = `Couldn’t send the code (${e.message}). Try again in a moment.`;
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
      await Friends.pushProfile(token);
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

// ---------------------------------------------------------------- friends & leaderboard
// Your public profile (name, climber, height, XP) and your friends, kept in
// the profiles and friends tables. Friends are added with a 6-letter code and
// the leaderboard only ever shows you and your friends (see docs/FRIENDS.md).
const Friends = {
  profile: null,   // { code, name, ... } once uploaded
  board: null,     // rows from friends_leaderboard
  missing: false,  // the tables haven't been set up in Supabase yet
  error: null,

  mine() {
    const d = Store.data;
    const wk = d.week && d.week.id === weekId() ? d.week.xp : 0;
    return { name: (Store.s.playerName || 'Climber').slice(0, 20), climber: myClimber(), height: myHeight(), xp: d.xp, week: weekId(), week_xp: wk };
  },
  noTable: (e) => e.status === 404 || /PGRST20[25]|42P01|42883|does not exist|schema cache/i.test(`${e.code} ${e.message}`),

  async pushProfile(token) {
    try {
      token = token || await Account.token();
      const rows = await Account.call('/rest/v1/profiles?on_conflict=user_id', {
        token,
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: { user_id: Account.session.user.id, ...this.mine(), updated_at: new Date().toISOString() },
      });
      this.profile = (rows && rows[0]) || this.profile;
      this.missing = false;
    } catch (e) {
      if (this.noTable(e)) this.missing = true;
    }
  },
  async load() {
    this.error = null;
    try {
      const token = await Account.token();
      if (!this.profile) await this.pushProfile(token);
      if (this.missing) return;
      this.board = await Account.call('/rest/v1/rpc/friends_leaderboard', { token, body: { this_week: weekId() } });
    } catch (e) {
      if (this.noTable(e)) this.missing = true;
      else this.error = e.friendly || 'Couldn’t load the leaderboard. Check your internet.';
    }
  },
  async add(code) {
    const token = await Account.token();
    try {
      const name = await Account.call('/rest/v1/rpc/add_friend', { token, body: { friend_code: code } });
      return name;
    } catch (e) {
      if (this.noTable(e)) { this.missing = true; e.friendly = 'Friends aren’t switched on yet.'; }
      else if (/own code/i.test(e.message)) e.friendly = 'That’s your own code! Send it to a friend instead.';
      else if (/no such code/i.test(e.message)) e.friendly = 'No one has that code — check it and try again.';
      else e.friendly = e.friendly || 'Couldn’t add them. Check your internet.';
      throw e;
    }
  },
  async remove(id) {
    await Account.call('/rest/v1/rpc/remove_friend', { token: await Account.token(), body: { friend: id } });
  },
};

// The friends card at the top of the Friends tab: your code, add a friend,
// and who has climbed highest.
function friendsBoardCard() {
  if (!Account.enabled()) return null;
  const card = h('div', { class: 'card board' });
  const mode = { v: 'week' };
  const head = h('div', { class: 'board-head' }, h('span', { class: 'bh-emoji' }, '🏆'), h('div', {}, h('b', {}, 'Friends leaderboard'), h('span', {}, 'Who’s climbing Monte Español fastest?')));
  if (!Account.signedIn()) {
    card.append(head,
      h('p', { class: 'muted' }, 'Sign in with your email to get a friend code, add your friends and race them up the leaderboard.'),
      h('button', { class: 'btn primary wide', onclick: () => App.show('me') }, '☁️ Sign in to add friends'));
    return card;
  }
  const body = h('div', { class: 'board-body' }, h('div', { class: 'muted' }, 'Loading…'));
  card.append(head, body);

  const draw = () => {
    if (Friends.missing) {
      body.replaceChildren(h('p', { class: 'muted' }, '🛠 Friends aren’t switched on yet — the app’s database needs one more step (docs/FRIENDS.md).'));
      return;
    }
    const code = Friends.profile && Friends.profile.code;
    const input = h('input', { class: 'search code-input', placeholder: 'Friend’s code', maxlength: '6', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false' });
    const msg = h('div', { class: 'acc-error' });
    const addBtn = h('button', { class: 'btn primary' }, '➕ Add');
    const add = async () => {
      const c = input.value.trim().toUpperCase();
      if (c.length !== 6) { msg.textContent = 'Friend codes are 6 letters and numbers.'; return; }
      addBtn.disabled = true;
      try {
        const name = await Friends.add(c);
        toast(`🤝 ${name || 'Your friend'} is now your friend!`);
        Sfx.win();
        await Friends.load();
        draw();
      } catch (e) { msg.textContent = e.friendly; addBtn.disabled = false; }
    };
    addBtn.addEventListener('click', add);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });

    const rows = (Friends.board || []).slice().sort((a, b) => (mode.v === 'week' ? b.week_xp - a.week_xp || b.height - a.height : b.height - a.height || b.xp - a.xp));
    const medal = (i) => ['🥇', '🥈', '🥉'][i] || `${i + 1}.`;
    const list = h('div', { class: 'board-list' }, ...rows.map((r, i) => h('div', { class: 'board-row' + (r.me ? ' me' : '') },
      h('span', { class: 'br-rank' }, medal(i)),
      h('span', { class: 'br-climber' }, r.climber || '🧗'),
      h('div', { class: 'br-name' }, h('b', {}, r.me ? `${r.name} (you)` : r.name), h('small', {}, `⛰ ${metres(r.height || 0)}`)),
      h('span', { class: 'br-score' }, mode.v === 'week' ? `${r.week_xp || 0} XP` : metres(r.height || 0)),
      r.me ? null : h('button', {
        class: 'br-x', 'aria-label': 'Remove friend',
        onclick: async () => { if (!confirm(`Remove ${r.name} from your friends?`)) return; try { await Friends.remove(r.user_id); await Friends.load(); draw(); } catch (e) { toast('Couldn’t remove them — check your internet'); } },
      }, '✕'))));
    const tabs = h('div', { class: 'board-tabs' }, ...[['week', '📅 This week'], ['all', '⛰ Highest']].map(([v, label]) =>
      h('button', { class: 'pack' + (mode.v === v ? ' active' : ''), onclick: () => { mode.v = v; draw(); } }, label)));
    body.replaceChildren(...[
      tabs,
      Friends.error ? h('div', { class: 'acc-error' }, Friends.error) : list,
      rows.length <= 1 && !Friends.error ? h('div', { class: 'board-empty' }, 'No friends yet — send them your code 👇') : null,
      h('div', { class: 'board-code' },
        h('div', {}, h('small', {}, 'Your friend code'), h('div', { class: 'room-code small' }, code || '······')),
        h('button', {
          class: 'btn share small', disabled: !code,
          onclick: () => Share.send(`🏔️ Race me up Monte Español on Hablamos! Add me as a friend with my code: ${code}\nOpen Hablamos → 👥 Friends → type my code → Add.`),
        }, '📤 Send')),
      h('div', { class: 'oh-join' }, input, addBtn),
      msg,
      Store.s.playerName ? null : h('div', { class: 'muted small-note' }, 'Tip: set your name below so friends know it’s you.'),
    ].filter(Boolean));
  };
  Friends.load().then(() => { if (card.isConnected) draw(); });
  return card;
}

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
  const lw = local.week || {}, cw = cloud.week || {};
  out.week = lw.id === cw.id ? { id: lw.id, xp: max(lw.xp, cw.xp) } : ((cw.id || '') > (lw.id || '') ? cw : lw);
  out.coins = max(local.coins, cloud.coins);
  out.climbed = max(local.climbed, cloud.climbed);
  out.owned = [...new Set([...(cloud.owned || []), ...(local.owned || [])])];
  // Lessons finished on either phone count as finished.
  out.course = { ...(cloud.course || {}) };
  for (const [id, v] of Object.entries(local.course || {})) {
    const c = out.course[id];
    out.course[id] = !c ? v : { ...c, ...v, n: Math.max(c.n || 0, v.n || 0), perfect: !!(c.perfect || v.perfect), skipped: !!(c.skipped && v.skipped) };
  }
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
