// Spark: a chat app for Claude. Screens, the chat list, and talking to the
// Claude API with the official SDK (bundled into vendor/anthropic.js).
import Anthropic from './vendor/anthropic.js';
import { renderMarkdown } from './markdown.js';
import * as store from './store.js';

const MODEL = 'claude-opus-5-5';
const MAX_PHOTOS = 4;
const PHOTO_EDGE = 1280; // longest side, in pixels, of a photo sent to Claude

const $ = (s) => document.querySelector(s);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const ICON = {
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  retry: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
};

const SUGGESTIONS = [
  ['Explain something', 'How do black holes work, like I’m 12?'],
  ['Make a plan', 'Plan me a 3-day beginner gym routine'],
  ['Write for me', 'Write a funny poem about my cat ignoring me'],
  ['Help me learn', 'Quiz me on Spanish verbs, one question at a time'],
];

let settings = store.loadSettings();
let chat = null; // the open chat; null until the first message of a new one
let stream = null; // the reply streaming in right now
let attachments = []; // photos waiting to be sent: [{ media_type, data }]
let problem = null; // why the last reply failed: { text, key }
let notice = ''; // a one-off message shown under the chat (e.g. after a refusal)

// ---------------------------------------------------------------- talking to Claude

// Written once when a chat starts and kept with it, so every turn of a chat
// sends exactly the same system prompt.
function systemPrompt() {
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let s = `You are Spark, a friendly AI assistant in a phone app. You are powered by Claude, made by Anthropic.

Today is ${today}.

Your replies are read on a phone screen. Lead with the answer and keep a conversational tone; go into depth when the question needs it or the person asks for it. Markdown is rendered, so use it where it helps: short lists, tables for comparisons, and code blocks for code. Avoid long runs of headings.

You can see photos the person attaches. You can't browse the internet, so if a question depends on recent news, prices or events, say that your information might be out of date.`;
  const about = settings.about.trim();
  if (about) s += `\n\nWhat the person has told you about themselves and how they like answers:\n<about_me>\n${about}\n</about_me>`;
  return s;
}

// What a stored message looks like when it goes back to the API. Replies are
// replayed exactly as received, except after a backup model took over
// partway through: then only the text from before the switch goes back.
function forApi(m) {
  if (m.role === 'user') return { role: 'user', content: m.content };
  const cut = m.content.findLastIndex((b) => b.type === 'fallback');
  return { role: 'assistant', content: m.content.filter((b, k) => b.type !== 'fallback' && (k > cut || b.type === 'text')) };
}

const textOf = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('');

async function respond() {
  const c = chat;
  problem = null;
  notice = '';
  const client = new Anthropic({ apiKey: settings.key, dangerouslyAllowBrowser: true });
  stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    // If Claude's safety checks decline a message, Anthropic retries it on
    // its recommended backup model instead of failing.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort: settings.effort },
    cache_control: { type: 'ephemeral' },
    system: c.system,
    messages: c.messages.map(forApi),
  });
  setBusy(true);
  render();
  const live = document.createElement('div');
  live.className = 'msg msg-ai';
  $('#thread').append(live);
  paintLive(live, []);
  scrollDown(true);
  let frame = 0;
  stream.on('streamEvent', () => {
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      if (stream) paintLive(live, stream.currentMessage?.content ?? []);
    });
  });

  try {
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') {
      refused(c);
    } else if (!textOf(msg.content).trim()) {
      problem = { text: 'Spark ran out of room before it could answer. Try asking a simpler question, or set thinking to Quick in Settings.' };
    } else {
      c.messages.push({ role: 'assistant', content: msg.content, model: msg.model, stop: msg.stop_reason });
    }
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) {
      // Keep whatever text had arrived as an ordinary, finished reply.
      const text = textOf(stream.currentMessage?.content ?? []).trimEnd();
      if (text) c.messages.push({ role: 'assistant', content: [{ type: 'text', text }], stop: 'stopped' });
    } else {
      problem = describe(err);
    }
  } finally {
    cancelAnimationFrame(frame);
    stream = null;
  }
  if (c.messages.length) save(c);
  else store.deleteChat(c.id);
  setBusy(false);
  if (chat === c) {
    render();
    scrollDown();
  }
}

// Claude declined. Take the message back out of the chat and put it back in
// the box, so it can be reworded.
function refused(c) {
  const last = c.messages.at(-1);
  if (last?.role !== 'user') return;
  c.messages.pop();
  if (chat === c) {
    $('#input').value = textOf(last.content);
    attachments = last.content.filter((b) => b.type === 'image').map((b) => b.source);
    paintAttachments();
    grow();
  }
  notice = 'Claude can’t help with that one. Your message is back in the box if you’d like to reword it.';
}

function describe(err) {
  if (err instanceof Anthropic.APIConnectionError) return { text: 'Couldn’t reach Claude. Check your internet connection and try again.' };
  if (err instanceof Anthropic.AuthenticationError) return { text: 'Your API key didn’t work. It may have been deleted or mistyped.', key: true };
  if (err instanceof Anthropic.PermissionDeniedError) return { text: 'Your API key isn’t allowed to use Claude. Check its workspace at console.anthropic.com.', key: true };
  if (err instanceof Anthropic.RateLimitError) return { text: 'You’ve hit your account’s limit for now. Wait a minute and try again.' };
  if (err instanceof Anthropic.InternalServerError) return { text: 'Claude is very busy right now. Try again in a moment.' };
  if (err instanceof Anthropic.BadRequestError) return { text: err.error?.error?.message || err.message };
  if (err instanceof Anthropic.APIError) return { text: `Something went wrong (error ${err.status ?? '?'}). Try again.` };
  return { text: err?.message || String(err) };
}

// ---------------------------------------------------------------- sending

function send(text) {
  text = text.trim();
  if (stream || (!text && !attachments.length)) return;
  if (!chat) {
    chat = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: '', created: Date.now(), system: systemPrompt(), messages: [] };
  }
  const content = attachments.map((source) => ({ type: 'image', source }));
  if (text) content.push({ type: 'text', text });
  else content.push({ type: 'text', text: 'What’s in this photo?' });
  if (!chat.title) chat.title = text ? text.slice(0, 60) : 'Photo';
  chat.messages.push({ role: 'user', content });
  attachments = [];
  paintAttachments();
  $('#input').value = '';
  grow();
  save(chat);
  respond();
}

function save(c) {
  if (!store.saveChat(c)) toast('Your phone’s storage for Spark is full. Delete some old chats.');
}

function stop() {
  stream?.abort();
}

function regenerate() {
  if (stream || !chat) return;
  if (chat.messages.at(-1)?.role === 'assistant') chat.messages.pop();
  respond();
}

// ---------------------------------------------------------------- drawing

function render() {
  const t = $('#thread');
  $('#top-title').textContent = chat?.title || 'Spark';
  if (!chat?.messages.length) {
    t.innerHTML = `<div class="empty">
      <img src="icons/icon-192.png" alt="">
      <h2>Hi! What’s on your mind?</h2>
      <p>Ask anything, or tap an idea to start.</p>
      <div class="chips">${SUGGESTIONS.map(([b, s]) => `<button class="chip" data-a="suggest" data-text="${esc(s)}"><b>${esc(b)}</b><span>${esc(s)}</span></button>`).join('')}</div>
    </div>`;
    if (notice) t.querySelector('.empty p').textContent = notice;
    return;
  }
  const lastAi = chat.messages.findLastIndex((m) => m.role === 'assistant');
  let html = chat.messages.map((m, k) => (m.role === 'user' ? userHtml(m) : aiHtml(m, k === lastAi && k === chat.messages.length - 1))).join('');
  if (!stream && notice) html += `<div class="msg"><div class="error-card">${esc(notice)}</div></div>`;
  if (!stream && chat.messages.at(-1).role === 'user') {
    const p = problem || { text: 'This message hasn’t had a reply yet.' };
    html += `<div class="msg"><div class="error-card">${esc(p.text)}<div>
      <button class="btn btn-primary btn-sm" data-a="retry">Try again</button>
      ${p.key ? '<button class="btn btn-ghost btn-sm" data-a="change-key">Change key</button>' : ''}</div></div></div>`;
  }
  t.innerHTML = html;
}

function userHtml(m) {
  const pics = m.content.filter((b) => b.type === 'image');
  const text = textOf(m.content);
  return `<div class="msg msg-user">
    ${pics.length ? `<div class="pics">${pics.map((b) => `<img src="data:${b.source.media_type};base64,${b.source.data}" alt="Photo">`).join('')}</div>` : ''}
    <div class="bubble">${esc(text)}</div>
  </div>`;
}

function aiHtml(m, isLast) {
  const notes = [];
  if (m.model && m.model !== MODEL) notes.push('Answered by a backup Claude model.');
  if (m.stop === 'max_tokens') notes.push('This reply hit the length limit and was cut short.');
  if (m.stop === 'stopped') notes.push('Stopped.');
  return `<div class="msg msg-ai">
    <div class="body">${contentHtml(m.content, false)}</div>
    ${notes.length ? `<div class="note">${notes.join(' ')}</div>` : ''}
    <div class="actions">
      <button class="icon-btn" data-a="copy" aria-label="Copy">${ICON.copy}</button>
      ${isLast ? `<button class="icon-btn" data-a="regenerate" aria-label="Try a different answer">${ICON.retry}</button>` : ''}
    </div>
  </div>`;
}

const DOTS = '<span class="thinking-dots"><i></i><i></i><i></i></span>';

function contentHtml(content, live) {
  const thoughts = content.filter((b) => b.type === 'thinking' && b.thinking?.trim()).map((b) => b.thinking).join('\n\n');
  const text = textOf(content);
  let html = '';
  if (thoughts || (live && !text && content.some((b) => b.type === 'thinking'))) {
    const label = live && !text ? `${DOTS} Thinking…` : 'Thought process';
    html += `<details class="thought"><summary>${label}</summary><div class="thought-body md">${renderMarkdown(thoughts)}</div></details>`;
  }
  if (text) html += `<div class="md">${renderMarkdown(text)}</div>`;
  else if (live && !html) html += DOTS;
  return html;
}

function paintLive(el, content) {
  const stick = nearBottom();
  const open = el.querySelector('details')?.open;
  el.innerHTML = `<div class="body">${contentHtml(content, true)}</div>`;
  const d = el.querySelector('details');
  if (d && open) d.open = true;
  if (stick) scrollDown(true);
}

function nearBottom() {
  const t = $('#thread');
  return t.scrollHeight - t.scrollTop - t.clientHeight < 120;
}

function scrollDown(instant) {
  const t = $('#thread');
  t.scrollTo({ top: t.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
}

function setBusy(on) {
  document.body.classList.toggle('busy', on);
  $('#send').setAttribute('aria-label', on ? 'Stop' : 'Send');
  updateSend();
}

function updateSend() {
  $('#send').disabled = !stream && !$('#input').value.trim() && !attachments.length;
}

function grow() {
  const i = $('#input');
  i.style.height = 'auto';
  i.style.height = i.scrollHeight + 'px';
  updateSend();
}

// ---------------------------------------------------------------- photos

async function addPhotos(files) {
  for (const file of files) {
    if (attachments.length >= MAX_PHOTOS) {
      toast(`Up to ${MAX_PHOTOS} photos per message.`);
      break;
    }
    try {
      attachments.push(await shrink(file));
    } catch {
      toast('That photo couldn’t be opened.');
    }
  }
  paintAttachments();
}

// Scales a photo down and re-encodes it as JPEG: small enough to keep many
// in the chat history, still sharp enough for Claude to read text in it.
async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, PHOTO_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { type: 'base64', media_type: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function paintAttachments() {
  const a = $('#attachments');
  a.hidden = !attachments.length;
  a.innerHTML = attachments
    .map((p, k) => `<div class="att"><img src="data:${p.media_type};base64,${p.data}" alt="Photo"><button data-a="unattach" data-k="${k}" aria-label="Remove photo">✕</button></div>`)
    .join('');
  updateSend();
}

// ---------------------------------------------------------------- chats drawer

function openDrawer(on) {
  $('#drawer').classList.toggle('open', on);
  $('#scrim').hidden = !on;
  if (on) paintChatList();
}

function paintChatList() {
  const chats = store.listChats();
  if (!chats.length) {
    $('#chat-list').innerHTML = '<div class="none">Your chats will show up here.</div>';
    return;
  }
  const startOfDay = new Date().setHours(0, 0, 0, 0);
  const group = (t) => (t >= startOfDay ? 'Today' : t >= startOfDay - 6 * 864e5 ? 'This week' : 'Older');
  let html = '';
  let last = '';
  for (const c of chats) {
    const g = group(c.updated);
    if (g !== last) html += `<div class="day">${g}</div>`;
    last = g;
    html += `<div class="chat-item${chat?.id === c.id ? ' active' : ''}">
      <button class="open" data-a="open" data-id="${c.id}">${esc(c.title || 'New chat')}</button>
      <button class="icon-btn del" data-a="delete" data-id="${c.id}" aria-label="Delete chat">${ICON.trash}</button>
    </div>`;
  }
  $('#chat-list').innerHTML = html;
}

function openChat(id) {
  stop();
  chat = id ? store.loadChat(id) : null;
  problem = null;
  notice = '';
  attachments = [];
  paintAttachments();
  render();
  scrollDown(true);
  openDrawer(false);
}

// ---------------------------------------------------------------- settings and key

function openSettings(on) {
  $('#settings').hidden = !on;
  if (!on) return;
  openDrawer(false);
  $('#about').value = settings.about;
  $('#key-mask').textContent = settings.key ? `${settings.key.slice(0, 10)}…${settings.key.slice(-4)}` : 'None';
  paintEffort();
}

function paintEffort() {
  for (const b of $('#effort').children) b.classList.toggle('on', b.dataset.effort === settings.effort);
}

function showWelcome(on) {
  $('#welcome').hidden = !on;
  if (on) {
    $('#key-input').value = '';
    $('#key-msg').textContent = '';
  }
}

async function submitKey(e) {
  e.preventDefault();
  const key = $('#key-input').value.trim();
  const msg = $('#key-msg');
  const btn = e.target.querySelector('button');
  msg.className = 'form-msg';
  if (!key) {
    msg.textContent = 'Paste your API key first.';
    return;
  }
  btn.disabled = true;
  msg.className = 'form-msg ok';
  msg.textContent = 'Checking your key…';
  try {
    // Looking up the model is free, and fails straight away on a bad key.
    await new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 }).models.retrieve(MODEL);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.APIConnectionError) {
      msg.className = 'form-msg';
      msg.textContent = err instanceof Anthropic.AuthenticationError ? 'That key didn’t work. Check you copied all of it.' : 'Couldn’t reach Anthropic. Check your internet connection.';
      btn.disabled = false;
      return;
    }
  }
  btn.disabled = false;
  settings.key = key;
  store.saveSettings(settings);
  problem = null;
  showWelcome(false);
  openSettings(false);
  render();
  toast('You’re all set!');
}

// ---------------------------------------------------------------- little helpers

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

async function copy(text) {
  try {
    if (window.SparkAndroid) window.SparkAndroid.copy(text);
    else await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    toast('Couldn’t copy');
  }
}

// The Android back button: close whatever is open, or let the app close.
window.sparkBack = () => {
  if (!$('#settings').hidden) openSettings(false);
  else if ($('#drawer').classList.contains('open')) openDrawer(false);
  else if (!$('#welcome').hidden && settings.key) showWelcome(false);
  else return false;
  return true;
};

// ---------------------------------------------------------------- wiring

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const a = el.dataset.a;
  if (a === 'drawer') openDrawer(true);
  else if (a === 'new') openChat(null);
  else if (a === 'open') openChat(el.dataset.id);
  else if (a === 'delete') {
    store.deleteChat(el.dataset.id);
    if (chat?.id === el.dataset.id) openChat(null);
    paintChatList();
    openDrawer(true);
  } else if (a === 'settings') openSettings(true);
  else if (a === 'close-settings') openSettings(false);
  else if (a === 'suggest') send(el.dataset.text);
  else if (a === 'attach') $('#photo-input').click();
  else if (a === 'unattach') {
    attachments.splice(+el.dataset.k, 1);
    paintAttachments();
  } else if (a === 'retry') respond();
  else if (a === 'regenerate') regenerate();
  else if (a === 'copy') copy(el.closest('.msg').querySelector('.body > .md')?.innerText ?? '');
  else if (a === 'copy-code') copy(el.closest('.code').querySelector('code').textContent);
  else if (a === 'change-key') {
    openSettings(false);
    showWelcome(true);
  } else if (a === 'delete-all') {
    if (!confirm('Delete every chat? This can’t be undone.')) return;
    stop();
    store.deleteAllChats();
    openChat(null);
    openSettings(false);
    toast('All chats deleted');
  }
});

$('#scrim').addEventListener('click', () => openDrawer(false));
$('#settings').addEventListener('click', (e) => {
  if (e.target.id === 'settings') openSettings(false);
});
$('#effort').addEventListener('click', (e) => {
  const b = e.target.closest('[data-effort]');
  if (!b) return;
  settings.effort = b.dataset.effort;
  store.saveSettings(settings);
  paintEffort();
});
$('#about').addEventListener('input', (e) => {
  settings.about = e.target.value;
  store.saveSettings(settings);
});
$('#key-form').addEventListener('submit', submitKey);

$('#compose').addEventListener('submit', (e) => {
  e.preventDefault();
  if (stream) stop();
  else send($('#input').value);
});
$('#input').addEventListener('input', grow);
$('#input').addEventListener('keydown', (e) => {
  // On a keyboard, Enter sends and Shift+Enter makes a new line. On a phone,
  // Enter is a new line and the arrow button sends.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(pointer: fine)').matches) {
    e.preventDefault();
    $('#compose').requestSubmit();
  }
});
$('#photo-input').addEventListener('change', (e) => {
  addPhotos([...e.target.files]);
  e.target.value = '';
});

render();
updateSend();
showWelcome(!settings.key);
