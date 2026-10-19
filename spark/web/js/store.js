// Saving on the device. Settings and the chat list are small; each chat is
// its own key so typing in one chat never rewrites the others.
//
// A chat keeps its messages exactly as the Claude API returned them
// (thinking blocks and their signatures included), so they can be sent back
// unchanged on the next turn.

const SETTINGS = 'spark.settings';
const INDEX = 'spark.chats';
const MEMORIES = 'spark.memories';
const CHAT = (id) => `spark.chat.${id}`;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Returns false when the phone's storage for this app is full.
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

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

// [{ id, title, updated }], newest first.
export function listChats() {
  return read(INDEX, []);
}

export function loadChat(id) {
  return read(CHAT(id), null);
}

export function saveChat(chat) {
  chat.updated = Date.now();
  const ok = write(CHAT(chat.id), chat);
  const index = listChats().filter((c) => c.id !== chat.id);
  index.unshift({ id: chat.id, title: chat.title, updated: chat.updated });
  write(INDEX, index);
  return ok;
}

export function deleteChat(id) {
  try { localStorage.removeItem(CHAT(id)); } catch { /* nothing to remove */ }
  write(INDEX, listChats().filter((c) => c.id !== id));
}

// What Spark has learned: [{ id, note, kind: 'about_them' | 'how_to_help', created }].
export function loadMemories() {
  return read(MEMORIES, []);
}

export function saveMemories(memories) {
  return write(MEMORIES, memories);
}

export function deleteAllChats() {
  for (const c of listChats()) deleteChat(c.id);
  write(INDEX, []);
}
