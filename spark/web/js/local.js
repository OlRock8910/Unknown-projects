// The app's side of the free brain (see brain-worker.js): starting it,
// following its download, and streaming its answers.

let worker = null;
let waiting = null; // { promise, resolve, reject } for the brain becoming ready
let job = null; // the answer being written: { id, text, onText, resolve, reject }
let state = { status: 'idle', loaded: 0, total: 0, model: '', device: '', error: '' };
const listeners = new Set();

function set(changes) {
  state = { ...state, ...changes };
  for (const fn of listeners) fn(state);
}

// Calls fn with the brain's state whenever it changes:
// { status: 'idle' | 'loading' | 'ready' | 'error', loaded, total, model, device, error }
export function onChange(fn) {
  listeners.add(fn);
}

export const status = () => state;

function fail(message) {
  set({ status: 'error', error: message });
  waiting?.reject(new Error(message));
  waiting = null;
  job?.reject(new Error(message));
  job = null;
}

function start() {
  worker = new Worker(new URL('./brain-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') set({ status: 'loading', loaded: data.loaded, total: data.total });
    else if (data.type === 'ready') {
      set({ status: 'ready', model: data.model, device: data.device, error: '' });
      waiting?.resolve();
      waiting = null;
    } else if (data.type === 'token' && job?.id === data.id) {
      job.text += data.text;
      job.onText(job.text);
    } else if (data.type === 'done' && job?.id === data.id) {
      job.resolve(job.text);
      job = null;
    } else if (data.type === 'error' && data.id && state.status === 'ready') {
      // Writing one answer failed; the brain itself is still fine.
      job?.reject(new Error(data.message));
      job = null;
    } else if (data.type === 'error') fail(data.message);
  };
  worker.onerror = (e) => {
    e.preventDefault();
    fail(e.message || 'The brain stopped working.');
    worker?.terminate();
    worker = null;
  };
}

// Downloads (the first time) and starts the brain. Resolves when it's ready.
export function load() {
  if (state.status === 'ready') return Promise.resolve();
  if (waiting) return waiting.promise;
  if (!worker) start();
  let resolve, reject;
  const promise = new Promise((ok, no) => ((resolve = ok), (reject = no)));
  waiting = { promise, resolve, reject };
  set({ status: 'loading', error: '' });
  worker.postMessage({ type: 'load' });
  return promise;
}

// Writes an answer to chat-format messages, calling onText with the text so
// far as it grows. Resolves with the whole answer (or what there is, if stopped).
export async function generate(messages, onText) {
  await load();
  return new Promise((resolve, reject) => {
    job = { id: Math.random().toString(36).slice(2), text: '', onText, resolve, reject };
    worker.postMessage({ type: 'generate', id: job.id, messages });
  });
}

export function stop() {
  worker?.postMessage({ type: 'stop' });
}

// Deletes the downloaded model to free up space. It downloads again next time.
export async function forget() {
  worker?.terminate();
  worker = null;
  waiting = null;
  job = null;
  set({ status: 'idle', loaded: 0, total: 0, model: '', device: '', error: '' });
  for (const name of await caches.keys()) if (name.includes('transformers')) await caches.delete(name);
}

// ---------------------------------------------------------------- looking things up

const STOP_WORDS = new Set(
  'a an and are as at be been but by can could did do does for from had has have how i if in into is it its me my of on or our please so tell that the their them then there these they this to us was we were what when where which who whom whose why will with would you your about explain know want like just'.split(' '),
);

// The words in a question worth searching for.
export function keywords(question) {
  return (question.toLowerCase().match(/[\p{L}\p{N}'-]+/gu) ?? []).filter((w) => !STOP_WORDS.has(w) && w.length > 1).slice(0, 8).join(' ');
}

const WIKI = 'https://en.wikipedia.org/w/api.php';

// Searches Wikipedia and returns the opening of the best few articles:
// [{ title, url, text }]. Wikipedia's API needs no key and allows apps like
// this to call it from the browser.
export async function wikipedia(query, count = 3) {
  const get = async (params) => {
    const res = await fetch(`${WIKI}?${new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params })}`);
    if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
    return res.json();
  };
  const found = await get({ action: 'query', list: 'search', srsearch: query, srlimit: String(count), srprop: '' });
  const titles = (found.query?.search ?? []).map((r) => r.title);
  if (!titles.length) return [];
  const pages = await get({ action: 'query', prop: 'extracts', exintro: '1', explaintext: '1', exlimit: String(count), redirects: '1', titles: titles.join('|') });
  const byTitle = new Map((pages.query?.pages ?? []).map((p) => [p.title, p]));
  // Searches can land on redirects; follow them back to the article's real title.
  for (const r of pages.query?.redirects ?? []) if (byTitle.has(r.to)) byTitle.set(r.from, byTitle.get(r.to));
  return [...new Set(titles.map((t) => byTitle.get(t)))]
    .filter((p) => p?.extract?.trim())
    .map((p) => ({
      title: p.title,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, '_'))}`,
      text: p.extract.trim().slice(0, 1400),
    }));
}
