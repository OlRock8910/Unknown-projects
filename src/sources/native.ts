import { registerPlugin } from '@capacitor/core';
import type { AccessState, MediaAction, MediaSource, NowPlaying, SaveResult, SharedItems, Song, Video } from '../types';

interface NativeVideo {
  id: number;
  title: string;
  folder: string;
  duration: number;
  size: number;
  dateAdded: number;
  width: number;
  height: number;
  modified: number;
  path: string;
}

interface NativeSong {
  id: number;
  title: string;
  artist: string;
  album: string;
  albumId: number;
  folder: string;
  path: string;
  track: number;
  duration: number;
  size: number;
  dateAdded: number;
  modified: number;
}

interface GalleryPlugin {
  access(): Promise<AccessState>;
  requestAccess(): Promise<AccessState>;
  openSettings(): Promise<void>;
  list(): Promise<{ videos: NativeVideo[] }>;
  listMusic(): Promise<{ songs: NativeSong[] }>;
  setPlayerMode(options: { on: boolean; landscape: boolean }): Promise<void>;
  nowPlaying(options: NowPlaying): Promise<void>;
  stopNowPlaying(): Promise<void>;
  downloadSong(options: { url: string; folder: string }): Promise<{ name: string; folder: string }>;
  saveShared(options: { ids: string[]; folder: string }): Promise<SaveResult>;
  pickVideos(): Promise<{ ids: string[]; missing: number }>;
  addListener(
    event: 'mediaAction',
    fn: (e: { action: MediaAction; position?: number }) => void,
  ): Promise<{ remove(): Promise<void> }>;
  addListener(
    event: 'downloadProgress',
    fn: (e: { url: string; received: number; total: number }) => void,
  ): Promise<{ remove(): Promise<void> }>;
  addListener(event: 'shared', fn: (e: SharedItems) => void): Promise<{ remove(): Promise<void> }>;
}

const Gallery = registerPlugin<GalleryPlugin>('Gallery');

/**
 * Reads the phone's gallery through MediaStore. The bytes never pass through
 * the JS bridge: MainActivity serves /_media/... straight from the content
 * resolver, so <video> and <audio> can stream and seek.
 */
export class NativeSource implements MediaSource {
  readonly kind = 'native' as const;

  access() {
    return Gallery.access();
  }

  requestAccess() {
    return Gallery.requestAccess();
  }

  openSettings() {
    return Gallery.openSettings();
  }

  async list(): Promise<Video[]> {
    const { videos } = await Gallery.list();
    return videos.map((v) => ({
      id: String(v.id),
      title: v.title,
      folder: v.folder || 'Videos',
      path: v.path || v.folder || 'Videos',
      duration: v.duration / 1000,
      size: v.size,
      addedAt: v.dateAdded * 1000,
      width: v.width,
      height: v.height,
      // The modified time busts the thumbnail cache when a video is edited.
      thumb: `/_media/thumb/${v.id}?m=${v.modified}`,
      src: `/_media/video/${v.id}`,
    }));
  }

  async listMusic(): Promise<Song[]> {
    const { songs } = await Gallery.listMusic();
    return songs.map((s) => ({
      id: `a${s.id}`,
      title: s.title,
      artist: s.artist,
      album: s.album,
      folder: s.folder || 'Music',
      path: s.path || s.folder || 'Music',
      // Tags store disc and track together (2003 = disc 2, track 3).
      track: s.track % 1000,
      duration: s.duration / 1000,
      size: s.size,
      addedAt: s.dateAdded * 1000,
      art: `/_media/art/${s.id}?m=${s.modified}&album=${s.albumId}`,
      src: `/_media/audio/${s.id}`,
    }));
  }

  setPlayerMode(on: boolean, landscape: boolean) {
    return Gallery.setPlayerMode({ on, landscape });
  }

  nowPlaying(state: NowPlaying) {
    Gallery.nowPlaying(state).catch(() => {});
  }

  stopNowPlaying() {
    Gallery.stopNowPlaying().catch(() => {});
  }

  onMediaAction(handler: (action: MediaAction, position?: number) => void) {
    Gallery.addListener('mediaAction', (e) => handler(e.action, e.position));
  }

  async downloadSong(url: string, folder: string, onProgress: (received: number, total: number) => void) {
    const sub = await Gallery.addListener('downloadProgress', (e) => {
      if (e.url === url) onProgress(e.received, e.total);
    });
    try {
      return await Gallery.downloadSong({ url, folder });
    } catch (err) {
      // The plugin's message is already written for the user.
      throw new Error((err as { message?: string })?.message || 'The download failed.');
    } finally {
      sub.remove();
    }
  }

  pickVideos() {
    return Gallery.pickVideos();
  }

  onShared(handler: (items: SharedItems) => void) {
    Gallery.addListener('shared', handler);
  }

  saveShared(ids: string[], folder: string) {
    return Gallery.saveShared({ ids, folder });
  }
}
