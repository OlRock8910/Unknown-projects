// Saving on the device.
//
// Chats and Spark's memory live in IndexedDB, which can use a large share of
// the phone's free space (gigabytes, not the few megabytes localStorage
// allows), and Spark asks the browser to keep it from ever clearing them.
// Settings and the list of chats stay in localStorage: they're small, and
// reading them straight away lets the app draw before the database opens.
//
// A chat keeps its messages exactly as the Claude API returned them
// (thinking blocks and their signatures included), so they can be sent back
// unchanged on the next turn.

const SETTINGS = 'spark.settings';
const INDEX = 'spark.chats';

let db;
let memories = []; // every note, oldest first, kept in memory for quick reads

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Wraps an IndexedDB request in a promise.
const done = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const get = (store) => db.transaction(store).objectStore(store);

// Makes a change and resolves once it's safely written. Running out of space
// only shows up at this point, as the transaction failing.
const change = (store, fn) =>
  new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    fn(t.objectStore(store));
    t.oncomplete = () => resolve();
    t.onerror = t.onabort = () => reject(t.error);
  });

// Opens the database and loads the memory. Call once before anything else.
export async function init() {
  const open = indexedDB.open('spark', 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore('chats', { keyPath: 'id' });
    open.result.createObjectStore('memories', { keyPath: 'id' });
  };
  db = await done(open);
  memories = (await done(get('memories').getAll())).sort((a, b) => a.created - b.created);
  // Ask the browser never to clear Spark's data to free up space.
  navigator.storage?.persist?.().catch(() => {});
}

// ---------------------------------------------------------------- settings

export function loadSettings() {
  return {
    key: '',
    effort: 'medium',
    about: '',
    learn: true, // let Spark save notes about you between chats
    autoUpgrade: true, // move to newer Claude models when they come out
    model: '', // the model new chats use; '' means the built-in default
    modelName: '',
    modelCreated: '', // when that model was released, to spot newer ones
    badModels: [], // newer models that didn't work with Spark
    lastCheck: 0, // when Spark last looked for a newer model
    ...read(SETTINGS, {}),
  };
}

export function saveSettings(settings) {
  write(SETTINGS, settings);
}

// ---------------------------------------------------------------- chats

// [{ id, title, updated }], newest first.
export function listChats() {
  return read(INDEX, []);
}

export async function loadChat(id) {
  return (await done(get('chats').get(id))) ?? null;
}

// Every chat, for searching through them.
export function allChats() {
  return done(get('chats').getAll());
}

// Resolves to false when the phone is out of space.
export async function saveChat(chat) {
  chat.updated = Date.now();
  write(INDEX, [{ id: chat.id, title: chat.title, updated: chat.updated }, ...listChats().filter((c) => c.id !== chat.id)]);
  try {
    // A copy, so later changes to the chat can't slip into this save.
    await change('chats', (s) => s.put(structuredClone(chat)));
    return true;
  } catch {
    return false;
  }
}

export async function deleteChat(id) {
  write(INDEX, listChats().filter((c) => c.id !== id));
  await change('chats', (s) => s.delete(id));
}

export async function deleteAllChats() {
  write(INDEX, []);
  await change('chats', (s) => s.clear());
}

// ---------------------------------------------------------------- memory

// What Spark has learned: [{ id, note, kind: 'about_them' | 'how_to_help', created }].
export function loadMemories() {
  return memories;
}

export async function addMemory(m) {
  try {
    await change('memories', (s) => s.put(m));
    memories = [...memories, m];
    return true;
  } catch {
    return false;
  }
}

export async function removeMemory(id) {
  memories = memories.filter((m) => m.id !== id);
  await change('memories', (s) => s.delete(id));
}

export async function clearMemories() {
  memories = [];
  await change('memories', (s) => s.clear());
}

// How much space Spark is using, and how much it may use, in bytes.
export async function usage() {
  try {
    const { usage = 0, quota = 0 } = (await navigator.storage?.estimate?.()) ?? {};
    return { usage, quota };
  } catch {
    return { usage: 0, quota: 0 };
  }
}
