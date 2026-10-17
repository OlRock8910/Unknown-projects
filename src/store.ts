/**
 * What the user chose to keep and how far they got, saved on the device.
 * Videos are referenced by id only; the gallery stays the source of truth.
 */

const LIST_KEY = 'reelbox.myList';
const PROGRESS_KEY = 'reelbox.progress';
/** The single playlist from version 1.1, moved into the playlists below. */
const OLD_PLAYLIST_KEY = 'reelbox.playlist';
const PLAYLISTS_KEY = 'reelbox.playlists';
const LIKED_KEY = 'reelbox.liked';
const MUSIC_KEY = 'reelbox.music';
const HIDE_DUPES_KEY = 'reelbox.hideDuplicates';
const HIDDEN_KEY = 'reelbox.hidden';
const BLOCKED_KEY = 'reelbox.blockedApps';
const EXCLUDED_KEY = 'reelbox.excludedFolders';
const VIDEO_MODE_KEY = 'reelbox.videoMode';
const PICKED_KEY = 'reelbox.pickedVideos';
const FOLDER_NAMES_KEY = 'reelbox.folderNames';

export type Kind = 'video' | 'music';
/** Whole gallery, or only the videos the user added from the picker. */
export type VideoMode = 'all' | 'picked';
type PerKind = Record<Kind, string[]>;

export interface Progress {
  /** Seconds watched. */
  pos: number;
  /** Seconds total, as the player measured it. */
  dur: number;
  /** When it was last watched, epoch ms. */
  at: number;
}

/** A playlist the user made. Folder playlists are worked out from the songs instead. */
export interface Playlist {
  id: string;
  name: string;
  /** Song ids in play order. */
  songs: string[];
  createdAt: number;
}

export type Repeat = 'off' | 'all' | 'one';

/** Where the music player was, so the mini player comes back after a restart. */
export interface MusicState {
  queue: string[];
  index: number;
  pos: number;
  shuffle: boolean;
  repeat: Repeat;
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the session still works, it just will not persist.
  }
}

/** Newest first. */
let myList: string[] = load<string[]>(LIST_KEY, []);
let progress: Record<string, Progress> = load(PROGRESS_KEY, {});
let playlists: Playlist[] = load<Playlist[] | null>(PLAYLISTS_KEY, null) ?? migratePlaylist();
/** Liked songs, most recently liked first. */
let liked: string[] = load<string[]>(LIKED_KEY, []);

function migratePlaylist(): Playlist[] {
  const old = load<string[]>(OLD_PLAYLIST_KEY, []);
  const lists = old.length ? [{ id: newPlaylistId(), name: 'My Playlist', songs: old, createdAt: Date.now() }] : [];
  save(PLAYLISTS_KEY, lists);
  return lists;
}

function newPlaylistId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function savePlaylists() {
  save(PLAYLISTS_KEY, playlists);
}

export const store = {
  myList(): readonly string[] {
    return myList;
  },

  inList(id: string) {
    return myList.includes(id);
  },

  /** Adds to the front so the newest picks show first. Returns how many were new. */
  add(ids: string[]) {
    const fresh = ids.filter((id) => !myList.includes(id));
    myList = [...fresh.reverse(), ...myList];
    save(LIST_KEY, myList);
    return fresh.length;
  },

  remove(ids: string[]) {
    myList = myList.filter((id) => !ids.includes(id));
    save(LIST_KEY, myList);
  },

  /** Replace the whole list (Clear all, and its Undo). */
  setMyList(ids: string[]) {
    myList = [...ids];
    save(LIST_KEY, myList);
  },

  toggle(id: string) {
    if (store.inList(id)) store.remove([id]);
    else store.add([id]);
    return store.inList(id);
  },

  progress(id: string): Progress | undefined {
    return progress[id];
  },

  setProgress(id: string, pos: number, dur: number) {
    progress[id] = { pos, dur, at: Date.now() };
    save(PROGRESS_KEY, progress);
  },

  clearProgress(id: string) {
    delete progress[id];
    save(PROGRESS_KEY, progress);
  },

  /** Every video with saved progress. */
  watchedIds(): string[] {
    return Object.keys(progress);
  },

  /** Videos and songs the user hid one by one. */
  hidden(): string[] {
    return load<string[]>(HIDDEN_KEY, []);
  },

  hide(ids: string[]) {
    save(HIDDEN_KEY, [...new Set([...ids, ...store.hidden()])]);
  },

  unhide(ids: string[]) {
    save(HIDDEN_KEY, store.hidden().filter((id) => !ids.includes(id)));
  },

  /** Apps switched off in Settings (keys from APP_FILTERS), per videos and music. */
  blockedApps(): PerKind {
    return load<PerKind>(BLOCKED_KEY, { video: [], music: [] });
  },

  setBlockedApp(kind: Kind, key: string, blocked: boolean) {
    const all = store.blockedApps();
    all[kind] = blocked ? [...new Set([...all[kind], key])] : all[kind].filter((k) => k !== key);
    save(BLOCKED_KEY, all);
  },

  /** Folder paths switched off in Settings. */
  excludedFolders(): PerKind {
    return load<PerKind>(EXCLUDED_KEY, { video: [], music: [] });
  },

  setExcludedFolder(kind: Kind, path: string, excluded: boolean) {
    const all = store.excludedFolders();
    all[kind] = excluded ? [...new Set([...all[kind], path])] : all[kind].filter((p) => p !== path);
    save(EXCLUDED_KEY, all);
  },

  /** All of a kind's folders on (empty list) or off at once. */
  setExcludedFolders(kind: Kind, paths: string[]) {
    const all = store.excludedFolders();
    all[kind] = [...new Set(paths)];
    save(EXCLUDED_KEY, all);
  },

  /** Undo every Settings switch: all apps and folders on, whole gallery. Hidden items stay hidden. */
  showEverything() {
    save(BLOCKED_KEY, { video: [], music: [] });
    save(EXCLUDED_KEY, { video: [], music: [] });
    save(VIDEO_MODE_KEY, 'all');
  },

  /** Is any Settings switch hiding things? */
  anythingSwitchedOff(): boolean {
    const b = store.blockedApps();
    const e = store.excludedFolders();
    return b.video.length + b.music.length + e.video.length + e.music.length > 0 || store.videoMode() === 'picked';
  },

  videoMode(): VideoMode {
    return load<VideoMode>(VIDEO_MODE_KEY, 'all');
  },

  setVideoMode(mode: VideoMode) {
    save(VIDEO_MODE_KEY, mode);
  },

  /** Videos added with Settings → Add videos. */
  picked(): string[] {
    return load<string[]>(PICKED_KEY, []);
  },

  addPicked(ids: string[]) {
    save(PICKED_KEY, [...new Set([...store.picked(), ...ids])]);
  },

  clearPicked() {
    save(PICKED_KEY, []);
  },

  /** Names given to folder playlists in the app (folder key → name); the folders keep theirs. */
  folderNames(): Record<string, string> {
    return load<Record<string, string>>(FOLDER_NAMES_KEY, {});
  },

  /** Pass null to go back to the folder's own name. */
  setFolderName(key: string, name: string | null) {
    const all = store.folderNames();
    if (name && name.trim()) all[key] = name.trim();
    else delete all[key];
    save(FOLDER_NAMES_KEY, all);
  },

  /** Forget everything ReelBox saved: lists, playlists, likes, progress, settings. */
  resetAll() {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('reelbox.'))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      // Storage blocked: nothing was saved anyway.
    }
  },

  /** On unless the user asked to see copies. */
  hideDuplicates(): boolean {
    return load<boolean>(HIDE_DUPES_KEY, true);
  },

  setHideDuplicates(on: boolean) {
    save(HIDE_DUPES_KEY, on);
  },

  /** Started but not finished, most recent first. */
  continueWatching(): string[] {
    return Object.entries(progress)
      .filter(([, p]) => isResumable(p))
      .sort((a, b) => b[1].at - a[1].at)
      .map(([id]) => id);
  },

  playlists(): readonly Playlist[] {
    return playlists;
  },

  playlist(id: string): Playlist | undefined {
    return playlists.find((p) => p.id === id);
  },

  createPlaylist(name: string, songs: string[] = []): Playlist {
    const p = { id: newPlaylistId(), name: name.trim() || 'New playlist', songs: [...new Set(songs)], createdAt: Date.now() };
    playlists = [p, ...playlists];
    savePlaylists();
    return p;
  },

  renamePlaylist(id: string, name: string) {
    const p = store.playlist(id);
    if (!p || !name.trim()) return;
    p.name = name.trim();
    savePlaylists();
  },

  /** Returns what is needed to put it back (Undo). */
  deletePlaylist(id: string): { playlist: Playlist; index: number } | null {
    const index = playlists.findIndex((p) => p.id === id);
    if (index < 0) return null;
    const [playlist] = playlists.splice(index, 1);
    savePlaylists();
    return { playlist, index };
  },

  restorePlaylist(playlist: Playlist, index: number) {
    playlists.splice(Math.min(index, playlists.length), 0, playlist);
    savePlaylists();
  },

  /** Appends songs not already there; returns how many were added. */
  addToPlaylist(id: string, songs: string[]) {
    const p = store.playlist(id);
    if (!p) return 0;
    const fresh = [...new Set(songs)].filter((s) => !p.songs.includes(s));
    p.songs.push(...fresh);
    savePlaylists();
    return fresh.length;
  },

  removeFromPlaylist(id: string, songs: string[]) {
    const p = store.playlist(id);
    if (!p) return;
    p.songs = p.songs.filter((s) => !songs.includes(s));
    savePlaylists();
  },

  setPlaylistSongs(id: string, songs: string[]) {
    const p = store.playlist(id);
    if (!p) return;
    p.songs = [...songs];
    savePlaylists();
  },

  liked(): readonly string[] {
    return liked;
  },

  isLiked(id: string) {
    return liked.includes(id);
  },

  /** Returns how many were newly liked. */
  like(ids: string[]) {
    const fresh = [...new Set(ids)].filter((id) => !liked.includes(id));
    liked = [...fresh.reverse(), ...liked];
    save(LIKED_KEY, liked);
    return fresh.length;
  },

  unlike(ids: string[]) {
    liked = liked.filter((id) => !ids.includes(id));
    save(LIKED_KEY, liked);
  },

  setLiked(ids: string[]) {
    liked = [...ids];
    save(LIKED_KEY, liked);
  },

  toggleLike(id: string) {
    if (liked.includes(id)) store.unlike([id]);
    else store.like([id]);
    return liked.includes(id);
  },

  music(): MusicState | null {
    return load<MusicState | null>(MUSIC_KEY, null);
  },

  saveMusic(state: MusicState | null) {
    save(MUSIC_KEY, state);
  },

  /** Forget songs that are no longer on the phone. */
  pruneSongs(known: Set<string>) {
    let changed = false;
    for (const p of playlists) {
      const kept = p.songs.filter((id) => known.has(id));
      if (kept.length !== p.songs.length) {
        p.songs = kept;
        changed = true;
      }
    }
    if (changed) savePlaylists();
    const keptLiked = liked.filter((id) => known.has(id));
    if (keptLiked.length !== liked.length) {
      liked = keptLiked;
      save(LIKED_KEY, liked);
    }
  },

  /** Forget ids that are no longer in the gallery. */
  prune(known: Set<string>) {
    const list = myList.filter((id) => known.has(id));
    if (list.length !== myList.length) {
      myList = list;
      save(LIST_KEY, myList);
    }
    const kept = Object.fromEntries(Object.entries(progress).filter(([id]) => known.has(id)));
    if (Object.keys(kept).length !== Object.keys(progress).length) {
      progress = kept;
      save(PROGRESS_KEY, progress);
    }
  },
};

/** Far enough in to be worth resuming, not so far that it is basically done. */
export function isResumable(p: Progress | undefined): p is Progress {
  if (!p || !(p.dur > 0)) return false;
  // Scaled so short phone clips can be resumed too, not only long videos.
  const head = Math.min(5, p.dur * 0.1);
  const tail = Math.min(Math.max(10, p.dur * 0.05), p.dur * 0.25);
  return p.pos > head && p.pos < p.dur - tail;
}
