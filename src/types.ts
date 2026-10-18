/** One video the app can show and play, wherever it came from. */
export interface Video {
  id: string;
  title: string;
  /** Gallery album it lives in (Camera, WhatsApp Video, Download...). */
  folder: string;
  /** That folder's path ("Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video"). */
  path: string;
  /** Seconds; 0 when the gallery does not know. */
  duration: number;
  /** Bytes. */
  size: number;
  /** Epoch milliseconds the video was added to the gallery. */
  addedAt: number;
  width: number;
  height: number;
  thumb: string;
  src: string;
}

/** One song (MP3 or any other audio file on the phone). */
export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** Name of the folder the file is in ("Chill"). */
  folder: string;
  /** That folder's path ("Music/Songs/Chill"); each folder is a ready-made playlist. */
  path: string;
  /** Track number from the file's tags, 0 when there is none. */
  track: number;
  /** Seconds; 0 when unknown. */
  duration: number;
  size: number;
  addedAt: number;
  /** Cover art URL, or '' when there is none. */
  art: string;
  src: string;
}

/**
 * full    – the whole gallery is readable
 * partial – Android 14+ "Select photos and videos": only what the user picked
 * none    – nothing yet; ask for permission
 */
export type Access = 'full' | 'partial' | 'none';

export interface AccessState {
  access: Access;
  /** False once Android will no longer show the prompt and only Settings can grant it. */
  canAsk: boolean;
  /** Whether music files are readable. */
  music: boolean;
  musicCanAsk: boolean;
}

/** What is playing, for the lock screen and the notification. */
export interface NowPlaying {
  kind: 'video' | 'music';
  id: string;
  title: string;
  artist: string;
  /** Seconds. */
  duration: number;
  position: number;
  playing: boolean;
  /**
   * Paused by something other than the user: another app's sound (a voice
   * note, a call, directions) took over and the WebView will play again
   * once it ends.
   */
  interrupted: boolean;
  canPrev: boolean;
  canNext: boolean;
  /** Songs get a heart on the notification, like Spotify; videos do not. */
  canLike: boolean;
  liked: boolean;
  /** Same-origin cover art URL (used by the browser's media controls). */
  art: string;
}

/** Songs (or a link) shared into the app from another app's Share menu. */
export interface SharedItems {
  files: { id: string; name: string }[];
  link?: string;
}

export interface SaveResult {
  saved: number;
  failed: number;
  /** Where they went, e.g. "Music/Songs/Chill". */
  folder: string;
  error?: string;
}

export type MediaAction = 'play' | 'pause' | 'next' | 'prev' | 'seek' | 'stop' | 'like';

export interface MediaSource {
  /** native: reads the phone gallery. web: files imported into the browser. */
  readonly kind: 'native' | 'web';
  access(): Promise<AccessState>;
  requestAccess(): Promise<AccessState>;
  openSettings(): Promise<void>;
  list(): Promise<Video[]>;
  listMusic(): Promise<Song[]>;
  /** Web only: copy picked files into the browser's storage. */
  importFiles?(files: File[], onProgress: (done: number, total: number) => void): Promise<Video[]>;
  /** `folder` is used for files that were not picked as part of a folder. */
  importMusic?(files: File[], onProgress: (done: number, total: number) => void, folder?: string): Promise<Song[]>;
  /** Save the audio file at `url` into `folder`. Resolves with the file name. */
  downloadSong(url: string, folder: string, onProgress: (received: number, total: number) => void): Promise<{ name: string; folder: string }>;
  /** Native only: choose videos with the phone's own picker; resolves with their ids. */
  pickVideos?(): Promise<{ ids: string[]; missing: number }>;
  /** Wipe anything the source itself stores (imported files in a browser). */
  reset?(): Promise<void>;
  /** Native only: songs or a link arrived from the Share menu. */
  onShared?(handler: (items: SharedItems) => void): void;
  saveShared?(ids: string[], folder: string): Promise<SaveResult>;
  /** Web only: delete an imported copy. */
  remove?(id: string): Promise<void>;
  removeSong?(id: string): Promise<void>;
  /** Fullscreen, keep the screen on and rotate to suit the video. */
  setPlayerMode(on: boolean, landscape: boolean): Promise<void>;
  /** Show (or update) the lock-screen / notification controls and keep playing in the background. */
  nowPlaying(state: NowPlaying): void;
  /** Remove those controls. */
  stopNowPlaying(): void;
  /** Buttons pressed on the lock screen, notification or headphones. */
  onMediaAction(handler: (action: MediaAction, position?: number) => void): void;
}
