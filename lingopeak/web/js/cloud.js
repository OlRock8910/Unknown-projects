// Leaderboards, friends and an online backup of your progress, through
// Supabase's REST API (no SDK). You get an anonymous account automatically —
// no email needed — the first time the phone is online. Setting up the
// database: docs/CLOUD.md. Without it, everything else still works.

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
    return { access_token: a.access_token, refresh_token: a.refresh_token, expires_at: a.expires_at ? a.expires_at * 1000 : Date.now() + (a.expires_in || 3600) * 1000, user: { id: a.user.id } };
  },
  // A token good for at least a minute: signs up anonymously the first time.
  async token() {
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
      name: d.profile.name, avatar: d.profile.avatar, banner: d.profile.banner || 'blue', badges,
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
    const cols = 'user_id,name,avatar,banner,badges,learning,xp,week_xp,week_streak,words';
    if (kind === 'friends') {
      const fr = await this.call(`/rest/v1/lp_friends?select=friend_id&user_id=eq.${this.session.user.id}`, { method: 'GET', token });
      const ids = [this.session.user.id, ...(fr || []).map((f) => f.friend_id)];
      const rows = await this.call(`/rest/v1/lp_profiles?select=${cols},week&user_id=in.(${ids.join(',')})`, { method: 'GET', token });
      return (rows || []).map((r) => ({ ...r, week_xp: r.week === weekId() ? r.week_xp : 0 })).sort((a, b) => b.week_xp - a.week_xp || b.xp - a.xp);
    }
    const q = kind === 'all' ? 'order=xp.desc' : `week=eq.${weekId()}&order=week_xp.desc${kind === 'lang' ? '&learning=eq.' + Store.data.target : ''}`;
    return this.call(`/rest/v1/lp_profiles?select=${cols}&${q}&limit=50`, { method: 'GET', token });
  },
  async addFriend(code) {
    return this.call('/rest/v1/rpc/lp_add_friend', { token: await this.token(), body: { friend_code: code } });
  },
  async removeFriend(id) {
    return this.call('/rest/v1/rpc/lp_remove_friend', { token: await this.token(), body: { friend: id } });
  },
};

// The best of two saves of your progress: most XP, coins, gems and words
// learned, every lesson finished on either phone, and this phone's settings.
function mergeProgress(local, cloud) {
  const max = (a, b) => Math.max(Number(a) || 0, Number(b) || 0);
  const out = { ...cloud, ...local };
  for (const k of ['xp', 'coins', 'gems', 'totalSecs', 'sessions', 'freezes', 'boostUntil']) out[k] = max(local[k], cloud[k]);
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
        avatarArt(r.avatar, 'sm'),
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

// The account card on the Me tab: email sign-in comes later.
function accountCard() {
  const st = Cloud.state;
  return h('div', { class: 'card account' },
    h('div', { class: 'pc-icon' }, icon(st === 'ok' ? 'check' : 'globe')),
    h('div', { class: 'pc-text' },
      h('b', {}, st === 'ok' ? t('acc.online') : t('acc.local')),
      h('span', {}, st === 'ok' ? t('acc.onlineSub') : t('acc.localSub')),
      h('em', {}, t('onb.emailLater'))));
}
