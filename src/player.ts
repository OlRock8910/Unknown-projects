import { clock, esc } from './format';
import { icons } from './icons';
import type { MediaHub, Playable } from './media';
import { isResumable, store } from './store';
import type { MediaSource, NowPlaying, Video } from './types';

const SPEEDS = [1, 1.25, 1.5, 2, 0.5, 0.75];
const HIDE_AFTER_MS = 3000;
const UP_NEXT_SECONDS = 6;

export interface PlayerHooks {
  /** The user asked to leave (back button, end of the queue). */
  exit(): void;
  /** Moved on to another video in the queue; keep the URL in step. */
  changed(video: Video): void;
}

/**
 * Full-screen player with its own controls. One instance lives for the app's
 * lifetime and is shown over everything else while a video plays.
 *
 * Leaving the app (home button, screen off) hands the sound over to a hidden
 * <audio> element at the same spot. Android's WebView pauses a hidden video
 * that has a picture, but never audio-only playback, so this is what keeps
 * the sound going in the background and on the lock screen. Coming back
 * hands it back to the video.
 */
export class Player implements Playable {
  private root: HTMLElement;
  private video: HTMLVideoElement;
  private bg = document.createElement('audio');
  /** True while the sound is coming from `bg` because the app is hidden. */
  private inBg = false;
  /** Whether the user wants it playing; the system pausing a hidden video does not change this. */
  private intent = false;
  private queue: Video[] = [];
  private index = 0;
  private hideTimer = 0;
  private saveTimer = 0;
  private upNextTimer = 0;
  private scrubbing = false;
  private lastTap = { t: 0, x: 0 };
  private shown = false;

  constructor(
    private source: MediaSource,
    private hub: MediaHub,
    private hooks: PlayerHooks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'player';
    this.root.hidden = true;
    this.root.innerHTML = `
      <video playsinline preload="auto"></video>
      <div class="p-tap"></div>
      <div class="p-ripple p-ripple-l">${icons.rewind}<span>10 seconds</span></div>
      <div class="p-ripple p-ripple-r">${icons.forward}<span>10 seconds</span></div>
      <div class="p-spinner"></div>
      <div class="p-controls">
        <div class="p-top">
          <button class="p-btn" data-p="back" aria-label="Back">${icons.back}</button>
          <div class="p-title"><strong></strong><span></span></div>
          <button class="p-save" data-p="mylist"></button>
        </div>
        <div class="p-center">
          <button class="p-btn p-big" data-p="rew" aria-label="Back 10 seconds">${icons.rewind}</button>
          <button class="p-btn p-huge" data-p="toggle" aria-label="Play or pause">${icons.pause}</button>
          <button class="p-btn p-big" data-p="fwd" aria-label="Forward 10 seconds">${icons.forward}</button>
        </div>
        <div class="p-bottom">
          <div class="p-bar">
            <div class="p-track"><div class="p-buffered"></div><div class="p-played"></div><div class="p-knob"></div></div>
            <span class="p-time">0:00</span>
          </div>
          <div class="p-tools">
            <button class="p-tool" data-p="speed">${icons.speed}<span>Speed (1x)</span></button>
            <button class="p-tool" data-p="fit">${icons.fit}<span>Fill screen</span></button>
            <button class="p-tool" data-p="next">${icons.next}<span>Next video</span></button>
          </div>
        </div>
      </div>
      <div class="p-upnext" hidden>
        <img alt="">
        <div><small>Up next in <b></b></small><strong></strong></div>
        <button class="btn btn-light" data-p="next">${icons.play} Play now</button>
        <button class="btn btn-ghost" data-p="cancelnext">Cancel</button>
      </div>
      <div class="p-error" hidden>
        <p>This video can't be played on this device.</p>
        <button class="btn btn-light" data-p="back">Go back</button>
      </div>`;
    document.body.appendChild(this.root);
    this.video = this.root.querySelector('video')!;
    this.wire();
  }

  get isOpen() {
    return this.shown;
  }

  get current(): Video | undefined {
    return this.queue[this.index];
  }

  /** The element the sound is coming from right now. */
  private get media(): HTMLMediaElement {
    return this.inBg ? this.bg : this.video;
  }

  open(video: Video, queue: Video[], fromStart = false) {
    this.queue = queue.some((v) => v.id === video.id) ? queue : [video];
    this.index = this.queue.findIndex((v) => v.id === video.id);
    this.root.hidden = false;
    this.shown = true;
    document.body.classList.add('playing');
    this.load(fromStart);
  }

  close() {
    if (!this.shown) return;
    this.saveProgress();
    this.shown = false;
    this.intent = false;
    this.cancelUpNext();
    clearInterval(this.saveTimer);
    clearTimeout(this.hideTimer);
    for (const el of [this.video, this.bg]) {
      el.pause();
      el.removeAttribute('src');
      el.load();
    }
    this.inBg = false;
    this.hub.release(this);
    this.root.hidden = true;
    document.body.classList.remove('playing');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    this.source.setPlayerMode(false, false).catch(() => {});
  }

  private load(fromStart: boolean) {
    const v = this.current!;
    this.cancelUpNext();
    this.q('.p-error').hidden = true;
    this.q('.p-title strong').textContent = v.title;
    this.q('.p-title span').textContent =
      this.queue.length > 1 ? `${this.index + 1} of ${this.queue.length} · ${v.folder}` : v.folder;
    (this.q('[data-p="next"].p-tool') as HTMLButtonElement).hidden = this.index >= this.queue.length - 1;
    this.root.classList.add('loading');
    this.intent = true;
    const rate = Number(this.root.dataset.speed || 1);
    this.video.src = v.src;
    this.video.playbackRate = rate;
    const saved = store.progress(v.id);
    const resumeAt = !fromStart && isResumable(saved) ? saved.pos : 0;
    this.video.addEventListener(
      'loadedmetadata',
      () => {
        if (resumeAt && !this.inBg) this.video.currentTime = resumeAt;
        const landscape = this.video.videoWidth >= this.video.videoHeight;
        this.source.setPlayerMode(true, landscape).catch(() => {});
      },
      { once: true },
    );
    if (this.inBg) {
      // Moved on to the next video while the app is hidden: keep it audio-only.
      this.bg.src = v.src;
      this.bg.currentTime = resumeAt;
      this.bg.playbackRate = rate;
      this.bg.play().catch(() => {});
    } else {
      this.video.play().catch(() => {
        // Autoplay can be refused on the web; the big play button still works.
        this.updatePlayState();
      });
    }
    clearInterval(this.saveTimer);
    // Often, so an app that is closed or killed mid-video loses at most a moment.
    this.saveTimer = window.setInterval(() => this.saveProgress(), 3000);
    this.drawSaveButton();
    this.showControls();
  }

  private saveProgress() {
    const v = this.current;
    if (!v || !this.shown) return;
    const pos = this.media.currentTime;
    const dur = this.media.duration;
    if (Number.isFinite(dur) && dur > 0 && pos > 0) store.setProgress(v.id, pos, dur);
  }

  // ---- Playable: driven by the lock screen, notification and headphones

  nowPlaying(): NowPlaying | null {
    const v = this.current;
    if (!this.shown || !v) return null;
    const m = this.media;
    return {
      kind: 'video',
      id: v.id,
      title: v.title,
      artist: v.folder,
      duration: Number.isFinite(m.duration) ? m.duration : v.duration,
      position: m.currentTime || 0,
      playing: !m.paused,
      interrupted: m.paused && this.intent && !m.ended,
      canPrev: true,
      canNext: this.index < this.queue.length - 1,
      canLike: false,
      liked: false,
      art: v.thumb,
    };
  }

  play() {
    this.intent = true;
    this.media.play().catch(() => {});
  }

  pause() {
    this.intent = false;
    this.media.pause();
  }

  stop() {
    this.pause();
  }

  seek(seconds: number) {
    const m = this.media;
    if (Number.isFinite(m.duration)) m.currentTime = Math.min(m.duration, Math.max(0, seconds));
  }

  next() {
    if (this.index >= this.queue.length - 1) return;
    this.saveProgress();
    this.index++;
    this.hooks.changed(this.current!);
    this.load(false);
  }

  /** Back to the start, or to the previous video when already near the start. */
  prev() {
    if (this.media.currentTime > 5 || this.index === 0) {
      this.seek(0);
      return;
    }
    this.saveProgress();
    this.index--;
    this.hooks.changed(this.current!);
    this.load(true);
  }

  private toBackground() {
    if (this.inBg || !this.shown || !this.intent || !this.current) return;
    if (!this.q('.p-upnext').hidden) {
      // Its countdown would stall while hidden; just move on.
      this.cancelUpNext();
      this.inBg = true;
      this.next();
      return;
    }
    const t = this.video.currentTime;
    this.inBg = true;
    this.video.pause();
    this.bg.src = this.current.src;
    this.bg.currentTime = t;
    this.bg.playbackRate = this.video.playbackRate;
    this.bg.play().catch(() => {});
  }

  private toForeground() {
    if (!this.inBg) return;
    const t = this.bg.currentTime;
    const playing = !this.bg.paused;
    this.inBg = false;
    this.bg.pause();
    this.bg.removeAttribute('src');
    this.bg.load();
    if (!this.shown) return;
    this.video.currentTime = t;
    if (playing) this.video.play().catch(() => this.updatePlayState());
    else this.updatePlayState();
    this.hub.update(this);
  }

  private wire() {
    const v = this.video;
    for (const el of [this.video, this.bg]) {
      el.addEventListener('play', () => el === this.media && this.hub.claim(this));
      for (const ev of ['pause', 'seeked', 'loadedmetadata', 'ratechange']) {
        el.addEventListener(ev, () => el === this.media && this.shown && this.hub.update(this));
      }
    }
    this.bg.addEventListener('pause', () => this.saveProgress());
    for (const el of [this.video, this.bg]) el.addEventListener('seeked', () => el === this.media && this.saveProgress());
    // The app being closed or swiped away.
    window.addEventListener('pagehide', () => this.saveProgress());
    this.bg.addEventListener('ended', () => this.ended());
    v.addEventListener('play', () => this.updatePlayState());
    v.addEventListener('pause', () => this.updatePlayState());
    v.addEventListener('waiting', () => this.root.classList.add('loading'));
    v.addEventListener('playing', () => this.root.classList.remove('loading'));
    v.addEventListener('canplay', () => this.root.classList.remove('loading'));
    v.addEventListener('timeupdate', () => this.updateBar());
    v.addEventListener('progress', () => this.updateBar());
    v.addEventListener('durationchange', () => this.updateBar());
    v.addEventListener('pause', () => this.saveProgress());
    v.addEventListener('error', () => {
      if (!this.shown || !v.getAttribute('src')) return;
      this.root.classList.remove('loading');
      this.q('.p-error').hidden = false;
    });
    v.addEventListener('ended', () => this.ended());

    this.root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
      if (!btn) return;
      e.stopPropagation();
      switch (btn.dataset.p) {
        case 'back':
          this.hooks.exit();
          return;
        case 'toggle':
          if (v.paused) this.play();
          else this.pause();
          break;
        case 'rew':
          this.seekBy(-10);
          break;
        case 'fwd':
          this.seekBy(10);
          break;
        case 'next':
          this.next();
          break;
        case 'mylist': {
          const v2 = this.current;
          if (v2) store.toggle(v2.id);
          this.drawSaveButton();
          break;
        }
        case 'cancelnext':
          this.cancelUpNext();
          this.hooks.exit();
          return;
        case 'speed': {
          const cur = Number(this.root.dataset.speed || 1);
          const nxt = SPEEDS[(SPEEDS.indexOf(cur) + 1) % SPEEDS.length];
          this.root.dataset.speed = String(nxt);
          v.playbackRate = nxt;
          btn.querySelector('span')!.textContent = `Speed (${nxt}x)`;
          break;
        }
        case 'fit': {
          const fill = this.root.classList.toggle('fill');
          btn.querySelector('span')!.textContent = fill ? 'Fit to screen' : 'Fill screen';
          break;
        }
      }
      this.showControls();
    });

    // Single tap shows/hides the controls; double tap on either side skips.
    this.q('.p-tap').addEventListener('click', (e) => {
      const ev = e as MouseEvent;
      const now = performance.now();
      const w = this.root.clientWidth;
      const side = ev.clientX < w / 3 ? -1 : ev.clientX > (w * 2) / 3 ? 1 : 0;
      if (side && now - this.lastTap.t < 300 && Math.abs(ev.clientX - this.lastTap.x) < 80) {
        this.seekBy(side * 10);
        this.ripple(side);
        this.lastTap.t = 0;
        return;
      }
      this.lastTap = { t: now, x: ev.clientX };
      if (this.root.classList.contains('show')) this.hideControls();
      else this.showControls();
    });

    const track = this.q('.p-track');
    const at = (x: number) => {
      const r = track.getBoundingClientRect();
      return Math.min(1, Math.max(0, (x - r.left) / r.width));
    };
    track.addEventListener('pointerdown', (e) => {
      if (!Number.isFinite(v.duration)) return;
      this.scrubbing = true;
      track.setPointerCapture(e.pointerId);
      this.drawBar(at(e.clientX));
      this.showControls();
    });
    track.addEventListener('pointermove', (e) => {
      if (this.scrubbing) this.drawBar(at(e.clientX));
    });
    const end = (e: PointerEvent) => {
      if (!this.scrubbing) return;
      this.scrubbing = false;
      v.currentTime = at(e.clientX) * v.duration;
      this.showControls();
    };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);

    this.root.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') this.showControls();
    });

    document.addEventListener('keydown', (e) => {
      if (!this.shown) return;
      const keys: Record<string, () => void> = {
        ' ': () => (v.paused ? this.play() : this.pause()),
        k: () => (v.paused ? this.play() : this.pause()),
        ArrowLeft: () => this.seekBy(-10),
        ArrowRight: () => this.seekBy(10),
        Escape: () => this.hooks.exit(),
        f: () => this.toggleFullscreen(),
        n: () => this.next(),
      };
      const fn = keys[e.key];
      if (fn) {
        e.preventDefault();
        fn();
        this.showControls();
      }
    });

    // Keep the sound going when the app is hidden or the screen is locked.
    document.addEventListener('visibilitychange', () => {
      if (!this.shown) return;
      this.saveProgress();
      if (document.hidden) this.toBackground();
      else this.toForeground();
    });
  }

  private ended() {
    const cur = this.current;
    if (cur) store.clearProgress(cur.id);
    if (this.index < this.queue.length - 1) {
      if (this.inBg) this.next();
      else this.startUpNext();
    } else if (this.inBg) {
      this.intent = false;
      this.hub.update(this);
    } else {
      this.hooks.exit();
    }
  }

  /** "+ My List" / "✓ In My List" for the video that is playing. */
  private drawSaveButton() {
    const v = this.current;
    const on = !!v && store.inList(v.id);
    const b = this.q('[data-p="mylist"]');
    b.classList.toggle('on', on);
    b.innerHTML = `${on ? icons.check : icons.plus}<span>${on ? 'In My List' : 'My List'}</span>`;
    b.setAttribute('aria-label', on ? 'Remove from My List' : 'Save to My List');
  }

  private toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else this.root.requestFullscreen?.().catch(() => {});
  }

  private seekBy(sec: number) {
    this.seek(this.media.currentTime + sec);
  }

  private ripple(side: number) {
    const el = this.q(side < 0 ? '.p-ripple-l' : '.p-ripple-r');
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  private updatePlayState() {
    const paused = this.video.paused;
    this.q('[data-p="toggle"]').innerHTML = paused ? icons.play : icons.pause;
    this.root.classList.toggle('paused', paused);
    if (paused) this.showControls();
    else this.scheduleHide();
  }

  private updateBar() {
    if (this.scrubbing) return;
    const v = this.video;
    this.drawBar(v.duration ? v.currentTime / v.duration : 0);
    const b = v.buffered;
    let end = 0;
    for (let i = 0; i < b.length; i++) {
      if (b.start(i) <= v.currentTime + 0.5) end = Math.max(end, b.end(i));
    }
    (this.q('.p-buffered') as HTMLElement).style.width = `${v.duration ? (end / v.duration) * 100 : 0}%`;
  }

  private drawBar(frac: number) {
    const pct = `${frac * 100}%`;
    (this.q('.p-played') as HTMLElement).style.width = pct;
    (this.q('.p-knob') as HTMLElement).style.left = pct;
    const dur = this.video.duration || 0;
    this.q('.p-time').textContent = dur ? `-${clock(dur - frac * dur)}` : '0:00';
  }

  private showControls() {
    this.root.classList.add('show');
    this.scheduleHide();
  }

  private hideControls() {
    if (this.video.paused || this.scrubbing) return;
    this.root.classList.remove('show');
  }

  private scheduleHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => this.hideControls(), HIDE_AFTER_MS);
  }

  private startUpNext() {
    const nxt = this.queue[this.index + 1];
    const box = this.q('.p-upnext');
    (box.querySelector('img') as HTMLImageElement).src = nxt.thumb;
    box.querySelector('strong')!.innerHTML = esc(nxt.title);
    box.hidden = false;
    let left = UP_NEXT_SECONDS;
    const tick = () => {
      box.querySelector('b')!.textContent = `${left}s`;
      if (left-- <= 0) this.next();
      else this.upNextTimer = window.setTimeout(tick, 1000);
    };
    tick();
  }

  private cancelUpNext() {
    clearTimeout(this.upNextTimer);
    this.q('.p-upnext').hidden = true;
  }

  private q(sel: string) {
    return this.root.querySelector(sel) as HTMLElement;
  }
}
