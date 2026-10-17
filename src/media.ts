import type { MediaAction, MediaSource, NowPlaying } from './types';

/** Something that can be driven from the lock screen: the video player or the music player. */
export interface Playable {
  nowPlaying(): NowPlaying | null;
  play(): void;
  pause(): void;
  next(): void;
  prev(): void;
  seek(seconds: number): void;
  /** Lock screen "stop" or the notification being dismissed. */
  stop(): void;
  /** The heart on the notification. */
  like?(): void;
}

/**
 * Only one thing plays at a time. Whichever player last started owns the
 * lock-screen controls; starting the other one pauses it.
 */
export class MediaHub {
  private active: Playable | null = null;

  constructor(private source: MediaSource) {
    source.onMediaAction((action, position) => this.dispatch(action, position));
  }

  /** Call when a player starts playing. */
  claim(p: Playable) {
    if (this.active && this.active !== p) this.active.pause();
    this.active = p;
    this.update(p);
  }

  /** Call whenever a player's state changes (play, pause, seek, new track). */
  update(p: Playable) {
    if (this.active !== p) return;
    const state = p.nowPlaying();
    if (state) this.source.nowPlaying(state);
    else this.release(p);
  }

  /** Call when a player is closed for good. */
  release(p: Playable) {
    if (this.active !== p) return;
    this.active = null;
    this.source.stopNowPlaying();
  }

  private dispatch(action: MediaAction, position?: number) {
    const p = this.active;
    if (!p) return;
    switch (action) {
      case 'play':
        p.play();
        break;
      case 'pause':
        p.pause();
        break;
      case 'next':
        p.next();
        break;
      case 'prev':
        p.prev();
        break;
      case 'seek':
        if (position !== undefined) p.seek(position);
        break;
      case 'stop':
        p.stop();
        break;
      case 'like':
        p.like?.();
        break;
    }
  }
}
