import type { AccessState, MediaAction, MediaSource, NowPlaying, Song, Video } from '../types';

/**
 * Browser fallback. A web page cannot browse the phone's gallery, so videos
 * are picked with the system file picker and copied into IndexedDB, which is
 * what lets them still be there the next time the page is opened.
 */

const DB_NAME = 'reelbox';
const META = 'videos';
const FILES = 'files';
const SONGS = 'songs';
const SONG_FILES = 'songfiles';

interface StoredVideo {
  id: string;
  title: string;
  folder: string;
  duration: number;
  size: number;
  addedAt: number;
  width: number;
  height: number;
  type: string;
  thumb: Blob | null;
}

interface StoredSong {
  id: string;
  title: string;
  artist: string;
  /** Folder path when a whole folder was added; older imports have none. */
  path?: string;
  track?: number;
  duration: number;
  size: number;
  addedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (e.oldVersion < 1) {
        db.createObjectStore(META, { keyPath: 'id' });
        db.createObjectStore(FILES);
      }
      if (e.oldVersion < 2) {
        db.createObjectStore(SONGS, { keyPath: 'id' });
        db.createObjectStore(SONG_FILES);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Resolves on `event`, or with false after `ms` or on a media error. */
function waitFor(el: HTMLMediaElement, event: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      el.removeEventListener(event, onOk);
      el.removeEventListener('error', onErr);
      resolve(ok);
    };
    const onOk = () => finish(true);
    const onErr = () => finish(false);
    const timer = setTimeout(() => finish(false), ms);
    el.addEventListener(event, onOk);
    el.addEventListener('error', onErr);
  });
}

/** Reads duration and size and grabs a frame for the poster. */
async function probe(file: Blob) {
  const url = URL.createObjectURL(file);
  const v = document.createElement('video');
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  const info = { duration: 0, width: 0, height: 0, thumb: null as Blob | null };
  try {
    if (!(await waitFor(v, 'loadedmetadata', 15000))) return info;
    info.duration = Number.isFinite(v.duration) ? v.duration : 0;
    info.width = v.videoWidth;
    info.height = v.videoHeight;
    // A frame a little way in: the very first one is often black.
    v.currentTime = info.duration ? Math.min(info.duration * 0.2, 3) : 0;
    if (!(await waitFor(v, 'seeked', 8000)) || !v.videoWidth) return info;
    const scale = Math.min(1, 480 / v.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(v.videoWidth * scale);
    canvas.height = Math.round(v.videoHeight * scale);
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height);
    info.thumb = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.75));
    return info;
  } finally {
    v.removeAttribute('src');
    v.load();
    URL.revokeObjectURL(url);
  }
}

/** Length of an audio file, or 0 if the browser can't read it. */
async function audioDuration(file: Blob) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('audio');
  a.preload = 'metadata';
  a.src = url;
  try {
    const ok = await waitFor(a, 'loadedmetadata', 10000);
    return ok && Number.isFinite(a.duration) ? a.duration : 0;
  } finally {
    a.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}

/** "Artist - Title.mp3" → both parts; anything else is just a title. */
function splitName(name: string) {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: base };
}

const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export class WebSource implements MediaSource {
  readonly kind = 'web' as const;
  private db = openDb();
  private urls: string[] = [];

  private songUrls: string[] = [];

  async access(): Promise<AccessState> {
    return { access: 'full', canAsk: true, music: true, musicCanAsk: true };
  }

  requestAccess() {
    return this.access();
  }

  async openSettings() {}

  async list(): Promise<Video[]> {
    const db = await this.db;
    const tx = db.transaction([META, FILES], 'readonly');
    const metas = await request(tx.objectStore(META).getAll() as IDBRequest<StoredVideo[]>);
    const files = await Promise.all(
      metas.map((m) => request(tx.objectStore(FILES).get(m.id) as IDBRequest<Blob | undefined>)),
    );
    // Object URLs pin their blob in memory; drop the previous batch.
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
    const out: Video[] = [];
    metas.forEach((m, i) => {
      const file = files[i];
      if (!file) return;
      const src = URL.createObjectURL(file);
      const thumb = m.thumb ? URL.createObjectURL(m.thumb) : '';
      this.urls.push(src);
      if (thumb) this.urls.push(thumb);
      out.push({
        id: m.id,
        title: m.title,
        folder: m.folder,
        path: m.folder,
        duration: m.duration,
        size: m.size,
        addedAt: m.addedAt,
        width: m.width,
        height: m.height,
        thumb,
        src,
      });
    });
    return out;
  }

  async importFiles(files: File[], onProgress: (done: number, total: number) => void) {
    // Ask the browser not to evict the library when space runs low.
    await navigator.storage?.persist?.().catch(() => false);
    const db = await this.db;
    const added: string[] = [];
    for (let i = 0; i < files.length; i++) {
      onProgress(i, files.length);
      const file = files[i];
      const info = await probe(file);
      const id = newId('w');
      const meta: StoredVideo = {
        id,
        title: file.name.replace(/\.[^.]+$/, ''),
        folder: 'Imported',
        duration: info.duration,
        size: file.size,
        addedAt: Date.now(),
        width: info.width,
        height: info.height,
        type: file.type,
        thumb: info.thumb,
      };
      const tx = db.transaction([META, FILES], 'readwrite');
      tx.objectStore(FILES).put(file, id);
      tx.objectStore(META).put(meta);
      await done(tx);
      added.push(id);
    }
    onProgress(files.length, files.length);
    const all = await this.list();
    return all.filter((v) => added.includes(v.id));
  }

  async remove(id: string) {
    const db = await this.db;
    const tx = db.transaction([META, FILES], 'readwrite');
    tx.objectStore(META).delete(id);
    tx.objectStore(FILES).delete(id);
    await done(tx);
  }

  async listMusic(): Promise<Song[]> {
    const db = await this.db;
    const tx = db.transaction([SONGS, SONG_FILES], 'readonly');
    const metas = await request(tx.objectStore(SONGS).getAll() as IDBRequest<StoredSong[]>);
    const files = await Promise.all(
      metas.map((m) => request(tx.objectStore(SONG_FILES).get(m.id) as IDBRequest<Blob | undefined>)),
    );
    for (const u of this.songUrls) URL.revokeObjectURL(u);
    this.songUrls = [];
    const out: Song[] = [];
    metas.forEach((m, i) => {
      const file = files[i];
      if (!file) return;
      const src = URL.createObjectURL(file);
      this.songUrls.push(src);
      const path = m.path || 'Imported';
      out.push({
        ...m,
        album: '',
        path,
        folder: path.split('/').pop()!,
        track: m.track ?? 0,
        art: '',
        src,
      });
    });
    return out;
  }

  async importMusic(files: File[], onProgress: (done: number, total: number) => void, folder?: string) {
    await navigator.storage?.persist?.().catch(() => false);
    const db = await this.db;
    const added: string[] = [];
    for (let i = 0; i < files.length; i++) {
      onProgress(i, files.length);
      const file = files[i];
      const id = newId('m');
      // From a folder pick, "Songs/Chill/01 Track.mp3" → folder playlist "Chill".
      const rel = file.webkitRelativePath || '';
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
      const num = file.name.match(/^(\d{1,3})[\s._-]/);
      const meta: StoredSong = {
        id,
        ...splitName(file.name.replace(/^\d{1,3}[\s._-]+/, '')),
        path: dir || folder || undefined,
        track: num ? Number(num[1]) : 0,
        duration: await audioDuration(file),
        size: file.size,
        addedAt: Date.now(),
      };
      const tx = db.transaction([SONGS, SONG_FILES], 'readwrite');
      tx.objectStore(SONG_FILES).put(file, id);
      tx.objectStore(SONGS).put(meta);
      await done(tx);
      added.push(id);
    }
    onProgress(files.length, files.length);
    const all = await this.listMusic();
    return all.filter((s) => added.includes(s.id));
  }

  async removeSong(id: string) {
    const db = await this.db;
    const tx = db.transaction([SONGS, SONG_FILES], 'readwrite');
    tx.objectStore(SONGS).delete(id);
    tx.objectStore(SONG_FILES).delete(id);
    await done(tx);
  }

  /**
   * Fetches the file and keeps it like an imported song. Many sites block
   * downloads made by other websites (CORS), which shows up as a network error.
   */
  async downloadSong(url: string, folder: string, onProgress: (received: number, total: number) => void) {
    if (!/^https:\/\//i.test(url)) throw new Error('Use a link that starts with https://');
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      throw new Error("That site doesn't allow downloads from other websites. Save the file first, then use Add music.");
    }
    if (!res.ok) throw new Error(res.status === 404 ? 'Nothing was found at that link.' : `The site answered with an error (${res.status}).`);
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    let name = decodeURIComponent(new URL(res.url || url).pathname.split('/').pop() || '') || 'Downloaded song';
    const audioName = /\.(mp3|m4a|aac|flac|ogg|oga|opus|wav)$/i.test(name);
    if (!type.startsWith('audio/') && !(audioName && !type.startsWith('text/'))) {
      throw new Error('That link opens a web page, not a song file. Use a direct link to an MP3 or other audio file.');
    }
    if (!audioName) name += type === 'audio/mp4' ? '.m4a' : '.mp3';
    const total = Number(res.headers.get('content-length')) || -1;
    const chunks: Uint8Array[] = [];
    let received = 0;
    const reader = res.body?.getReader();
    if (reader) {
      for (;;) {
        const { done: end, value } = await reader.read();
        if (end) break;
        chunks.push(value);
        received += value.length;
        onProgress(received, total);
      }
    }
    const blob = reader ? new Blob(chunks, { type: type || 'audio/mpeg' }) : await res.blob();
    if (!blob.size) throw new Error('The file was empty.');
    await this.importMusic([new File([blob], name, { type: blob.type })], () => {}, folder);
    return { name, folder };
  }

  /** The browser's own lock-screen / notification media controls. */
  nowPlaying(state: NowPlaying) {
    const ms = navigator.mediaSession;
    if (!ms || typeof MediaMetadata === 'undefined') return;
    ms.metadata = new MediaMetadata({
      title: state.title,
      artist: state.artist,
      artwork: state.art ? [{ src: new URL(state.art, location.href).href }] : [],
    });
    ms.playbackState = state.playing ? 'playing' : 'paused';
    try {
      if (state.duration > 0) {
        ms.setPositionState({
          duration: state.duration,
          position: Math.min(state.position, state.duration),
          playbackRate: 1,
        });
      }
    } catch {
      // Position out of range while a track changes; the next update fixes it.
    }
  }

  stopNowPlaying() {
    const ms = navigator.mediaSession;
    if (!ms) return;
    ms.metadata = null;
    ms.playbackState = 'none';
  }

  onMediaAction(handler: (action: MediaAction, position?: number) => void) {
    const ms = navigator.mediaSession;
    if (!ms) return;
    const set = (a: MediaSessionAction, fn: MediaSessionActionHandler) => {
      try {
        ms.setActionHandler(a, fn);
      } catch {
        // Not supported by this browser.
      }
    };
    set('play', () => handler('play'));
    set('pause', () => handler('pause'));
    set('nexttrack', () => handler('next'));
    set('previoustrack', () => handler('prev'));
    set('stop', () => handler('stop'));
    set('seekto', (d) => handler('seek', d.seekTime));
  }

  /** Deletes every imported video and song. */
  async reset() {
    const db = await this.db;
    db.close();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    });
  }

  private wakeLock: { release(): Promise<void> } | null = null;

  async setPlayerMode(on: boolean) {
    const nav = navigator as Navigator & {
      wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
    };
    if (on && !this.wakeLock && nav.wakeLock) {
      this.wakeLock = await nav.wakeLock.request('screen').catch(() => null);
    } else if (!on && this.wakeLock) {
      await this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }
}
