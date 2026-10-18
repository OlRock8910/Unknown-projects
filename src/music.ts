import { clock, esc } from './format';
import { icons } from './icons';
import type { MediaHub, Playable } from './media';
import { store, type Repeat } from './store';
import type { NowPlaying, Song } from './types';

export interface MusicHooks {
  /** Open the full Now Playing screen (pushes a history entry). */
  expand(): void;
  /** Close it (pops the history entry). */
  collapse(): void;
  /** The current song or the queue changed; the music page may want to highlight it. */
  changed(): void;
  isLiked(id: string): boolean;
  /** Returns whether it is liked now. */
  toggleLike(id: string): boolean;
  /** Open the "Add to playlist" picker for a song. */
  addTo(id: string): void;
  /** Every song on the phone, to keep the music going once the queue runs out. */
  library(): Song[];
}

/** Cover art, or a note on a gradient when the file has none. */
export function artHtml(s: Song, cls = 'art') {
  const img = s.art ? `<img src="${esc(s.art)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<span class="${cls}" style="--hue:${hue(s.id)}">${icons.note}${img}</span>`;
}

function hue(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

function shuffled<T>(list: T[]) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The MP3 player: one <audio> element, a queue, shuffle and repeat, the mini
 * player bar above the tabs and the full-screen Now Playing view. Audio-only
 * playback carries on when the app is hidden or the phone is locked.
 */
export class MusicPlayer implements Playable {
  private audio = new Audio();
  private queue: Song[] = [];
  /** The queue in the order it was started, to return to when shuffle goes off. */
  private original: Song[] = [];
  private index = 0;
  private shuffle = false;
  private repeat: Repeat = 'off';
  private lastSave = 0;
  /** The user wants it playing (pressed play), so a pause they did not ask for is an interruption. */
  private intent = false;
  private scrubbing = false;
  private mini = document.querySelector<HTMLElement>('.mini')!;
  private np: HTMLElement;

  constructor(
    private hub: MediaHub,
    private hooks: MusicHooks,
  ) {
    this.audio.preload = 'auto';
    this.np = document.createElement('div');
    this.np.className = 'np';
    this.np.hidden = true;
    document.body.appendChild(this.np);
    this.wire();
  }

  get current(): Song | undefined {
    return this.queue[this.index];
  }

  get isPlaying() {
    return !this.audio.paused;
  }

  /** Start playing `list` from `start` (or from the top). */
  playList(list: Song[], start?: Song, shuffle = false) {
    if (!list.length) return;
    this.original = [...list];
    this.shuffle = shuffle;
    const first = start ?? (shuffle ? list[Math.floor(Math.random() * list.length)] : list[0]);
    this.queue = shuffle ? [first, ...shuffled(list.filter((s) => s.id !== first.id))] : [...list];
    this.index = this.queue.findIndex((s) => s.id === first.id);
    this.load(true);
  }

  /** Bring back the last session (paused) after the app restarts. */
  restore(byId: Map<string, Song>) {
    const st = store.music();
    if (!st) return;
    const queue = st.queue.map((id) => byId.get(id)).filter((s): s is Song => !!s);
    const cur = byId.get(st.queue[st.index]);
    if (!queue.length || !cur) return;
    this.queue = queue;
    this.original = [...queue];
    this.index = queue.indexOf(cur);
    this.shuffle = st.shuffle;
    this.repeat = st.repeat;
    this.audio.src = cur.src;
    this.audio.currentTime = st.pos;
    this.render();
  }

  /** Drop songs that are gone from the phone (deleted, or Clear all on the web). */
  forget(known: Set<string>) {
    if (!this.queue.length) return;
    const cur = this.current;
    this.queue = this.queue.filter((s) => known.has(s.id));
    this.original = this.original.filter((s) => known.has(s.id));
    if (!cur || !known.has(cur.id)) {
      this.stop();
      return;
    }
    this.index = this.queue.indexOf(cur);
    this.render();
  }

  // ---- Playable

  nowPlaying(): NowPlaying | null {
    const s = this.current;
    if (!s) return null;
    return {
      kind: 'music',
      id: s.id,
      title: s.title,
      artist: [s.artist, s.album].filter(Boolean).join(' · '),
      duration: Number.isFinite(this.audio.duration) ? this.audio.duration : s.duration,
      position: this.audio.currentTime || 0,
      playing: !this.audio.paused,
      interrupted: this.audio.paused && this.intent && !this.audio.ended,
      canPrev: true,
      // Never a dead end: past the last song comes another one.
      canNext: true,
      canLike: true,
      liked: this.hooks.isLiked(s.id),
      art: s.art,
    };
  }

  play() {
    if (!this.current) return;
    this.intent = true;
    this.audio.play().catch(() => {});
  }

  pause() {
    this.intent = false;
    this.audio.pause();
  }

  toggle() {
    if (this.audio.paused) this.play();
    else this.pause();
  }

  next() {
    if (!this.queue.length) return;
    if (this.index < this.queue.length - 1) this.index++;
    else if (this.repeat === 'all') this.index = 0;
    else this.keepGoing();
    this.load(true);
  }

  like() {
    if (!this.current) return;
    this.hooks.toggleLike(this.current.id);
    this.refreshLike();
  }

  /** After a like changes anywhere: the heart here and on the notification. */
  refreshLike() {
    if (!this.np.hidden) this.renderNowPlaying();
    this.hub.update(this);
  }

  /**
   * The queue ran out with repeat off: carry on with songs from the rest of
   * the phone, in random order, like a radio. If every song was already in
   * the queue, start it again from the top.
   */
  private keepGoing() {
    const inQueue = new Set(this.queue.map((s) => s.id));
    const more = shuffled(this.hooks.library().filter((s) => !inQueue.has(s.id))).slice(0, 25);
    if (!more.length) {
      this.index = 0;
      return;
    }
    this.queue.push(...more);
    this.original.push(...more);
    this.index++;
  }

  /** Back to the start of the song, or to the previous one when already near the start. */
  prev() {
    if (this.audio.currentTime > 3 || (this.index === 0 && this.repeat !== 'all')) {
      this.seek(0);
      return;
    }
    this.index = this.index > 0 ? this.index - 1 : this.queue.length - 1;
    this.load(true);
  }

  seek(seconds: number) {
    const d = this.audio.duration;
    if (Number.isFinite(d)) this.audio.currentTime = Math.min(d, Math.max(0, seconds));
  }

  /** Close the player completely: no mini bar, nothing on the lock screen. */
  stop() {
    this.intent = false;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.queue = [];
    this.original = [];
    store.saveMusic(null);
    this.hub.release(this);
    this.hooks.collapse();
    this.render();
    this.hooks.changed();
  }

  jumpTo(id: string) {
    const i = this.queue.findIndex((s) => s.id === id);
    if (i < 0) return;
    this.index = i;
    this.load(true);
  }

  setShuffle(on: boolean) {
    const cur = this.current;
    if (!cur) return;
    this.shuffle = on;
    this.queue = on ? [cur, ...shuffled(this.original.filter((s) => s.id !== cur.id))] : [...this.original];
    this.index = this.queue.findIndex((s) => s.id === cur.id);
    this.save();
    this.renderNowPlaying();
    this.hub.update(this);
  }

  cycleRepeat() {
    this.repeat = this.repeat === 'off' ? 'all' : this.repeat === 'all' ? 'one' : 'off';
    this.save();
    this.renderNowPlaying();
    this.hub.update(this);
  }

  // ---- Now Playing screen

  showNowPlaying() {
    if (!this.current) {
      this.hooks.collapse();
      return;
    }
    this.renderNowPlaying();
    this.np.hidden = false;
    requestAnimationFrame(() => this.np.classList.add('open'));
  }

  hideNowPlaying() {
    this.np.classList.remove('open');
    this.np.hidden = true;
  }

  // ---- internals

  private load(autoplay: boolean) {
    const s = this.current;
    if (!s) return;
    this.audio.src = s.src;
    if (autoplay) this.play();
    this.save();
    this.render();
    this.hooks.changed();
  }

  private save() {
    if (!this.current) return;
    this.lastSave = Date.now();
    store.saveMusic({
      queue: this.queue.map((s) => s.id),
      index: this.index,
      pos: this.audio.currentTime || 0,
      shuffle: this.shuffle,
      repeat: this.repeat,
    });
  }

  private ended() {
    if (this.repeat === 'one') {
      this.audio.currentTime = 0;
      this.play();
    } else {
      this.next();
    }
  }

  private wire() {
    const a = this.audio;
    a.addEventListener('play', () => {
      this.hub.claim(this);
      this.updateState();
    });
    a.addEventListener('pause', () => {
      this.save();
      this.updateState();
      this.hub.update(this);
    });
    for (const ev of ['seeked', 'loadedmetadata']) a.addEventListener(ev, () => this.hub.update(this));
    a.addEventListener('ended', () => this.ended());
    a.addEventListener('timeupdate', () => {
      this.updateProgress();
      if (Date.now() - this.lastSave > 5000) this.save();
    });
    a.addEventListener('error', () => {
      // An unreadable file should not stop the whole queue.
      if (!a.getAttribute('src')) return;
      if (this.index < this.queue.length - 1) this.next();
    });

    this.mini.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]');
      if (b?.dataset.m === 'toggle') this.toggle();
      else if (b?.dataset.m === 'next') this.next();
      else this.hooks.expand();
    });

    this.np.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]');
      if (!b) return;
      switch (b.dataset.m) {
        case 'close':
          this.hooks.collapse();
          break;
        case 'toggle':
          this.toggle();
          break;
        case 'next':
          this.next();
          break;
        case 'prev':
          this.prev();
          break;
        case 'shuffle':
          this.setShuffle(!this.shuffle);
          break;
        case 'repeat':
          this.cycleRepeat();
          break;
        case 'jump':
          this.jumpTo(b.dataset.id!);
          break;
        case 'stop':
          this.stop();
          break;
        case 'like':
          this.like();
          break;
        case 'addto':
          if (this.current) this.hooks.addTo(this.current.id);
          break;
      }
    });

    // Scrubbing on the Now Playing seek bar.
    const at = (track: HTMLElement, x: number) => {
      const r = track.getBoundingClientRect();
      return Math.min(1, Math.max(0, (x - r.left) / r.width));
    };
    this.np.addEventListener('pointerdown', (e) => {
      const track = (e.target as HTMLElement).closest<HTMLElement>('.np-track');
      if (!track || !Number.isFinite(a.duration)) return;
      this.scrubbing = true;
      track.setPointerCapture(e.pointerId);
      this.drawProgress(at(track, e.clientX));
      const move = (ev: PointerEvent) => this.drawProgress(at(track, ev.clientX));
      const up = (ev: PointerEvent) => {
        this.scrubbing = false;
        a.currentTime = at(track, ev.clientX) * a.duration;
        track.removeEventListener('pointermove', move);
        track.removeEventListener('pointerup', up);
        track.removeEventListener('pointercancel', up);
      };
      track.addEventListener('pointermove', move);
      track.addEventListener('pointerup', up);
      track.addEventListener('pointercancel', up);
    });
  }

  private updateState() {
    const icon = this.audio.paused ? icons.play : icons.pause;
    this.mini.querySelectorAll('[data-m="toggle"]').forEach((b) => (b.innerHTML = icon));
    this.np.querySelectorAll('[data-m="toggle"]').forEach((b) => (b.innerHTML = icon));
    document.body.classList.toggle('music-playing', !this.audio.paused);
  }

  private updateProgress() {
    if (this.scrubbing) return;
    const d = this.audio.duration;
    this.drawProgress(d ? this.audio.currentTime / d : 0);
  }

  private drawProgress(frac: number) {
    const pct = `${frac * 100}%`;
    const bar = this.mini.querySelector<HTMLElement>('.mini-progress b');
    if (bar) bar.style.width = pct;
    if (this.np.hidden) return;
    const played = this.np.querySelector<HTMLElement>('.np-played');
    const knob = this.np.querySelector<HTMLElement>('.np-knob');
    if (played) played.style.width = pct;
    if (knob) knob.style.left = pct;
    const d = Number.isFinite(this.audio.duration) ? this.audio.duration : this.current?.duration ?? 0;
    const cur = this.np.querySelector('.np-cur');
    const left = this.np.querySelector('.np-left');
    if (cur) cur.textContent = clock(frac * d);
    if (left) left.textContent = `-${clock(d - frac * d)}`;
  }

  /** Mini bar, and the Now Playing view if it is open. */
  private render() {
    const s = this.current;
    document.body.classList.toggle('has-mini', !!s);
    if (!s) {
      this.mini.hidden = true;
      this.mini.innerHTML = '';
      this.hideNowPlaying();
      return;
    }
    this.mini.hidden = false;
    this.mini.innerHTML = `
      <div class="mini-progress"><b></b></div>
      ${artHtml(s, 'art mini-art')}
      <div class="mini-text"><strong>${esc(s.title)}</strong><span>${esc(s.artist || s.album || s.folder)}</span></div>
      <button class="mini-btn" data-m="toggle" aria-label="Play or pause">${this.audio.paused ? icons.play : icons.pause}</button>
      <button class="mini-btn" data-m="next" aria-label="Next song">${icons.next}</button>`;
    this.updateProgress();
    if (!this.np.hidden) this.renderNowPlaying();
  }

  private renderNowPlaying() {
    const s = this.current;
    if (!s) return;
    const upNext = this.queue.slice(this.index + 1).concat(this.repeat === 'all' ? this.queue.slice(0, this.index) : []);
    const repeatLabel = this.repeat === 'one' ? 'Repeat one' : this.repeat === 'all' ? 'Repeat all' : 'Repeat off';
    this.np.innerHTML = `
      <div class="np-bg" style="--hue:${hue(s.id)}"></div>
      <div class="np-inner">
        <header class="np-head">
          <button class="p-btn" data-m="close" aria-label="Close">${icons.down}</button>
          <span>Now playing${this.queue.length > 1 ? ` · ${this.index + 1} of ${this.queue.length}` : ''}</span>
          <button class="p-btn" data-m="stop" aria-label="Stop and close player">${icons.close}</button>
        </header>
        ${artHtml(s, 'art np-art')}
        <div class="np-title">
          <div><h2>${esc(s.title)}</h2><p>${esc([s.artist, s.album].filter(Boolean).join(' · ') || s.folder)}</p></div>
          <button class="p-btn np-like${this.hooks.isLiked(s.id) ? ' on' : ''}" data-m="like" aria-label="${this.hooks.isLiked(s.id) ? 'Unlike' : 'Like'}">${this.hooks.isLiked(s.id) ? icons.heartFill : icons.heart}</button>
          <button class="p-btn" data-m="addto" aria-label="Add to playlist">${icons.plus}</button>
        </div>
        <div class="np-track"><div class="np-played"></div><div class="np-knob"></div></div>
        <div class="np-times"><span class="np-cur">0:00</span><span class="np-left">-0:00</span></div>
        <div class="np-controls">
          <button class="p-btn np-mode${this.shuffle ? ' on' : ''}" data-m="shuffle" aria-label="Shuffle ${this.shuffle ? 'on' : 'off'}">${icons.shuffle}</button>
          <button class="p-btn p-big" data-m="prev" aria-label="Previous">${icons.prev}</button>
          <button class="p-btn np-play" data-m="toggle" aria-label="Play or pause">${this.audio.paused ? icons.play : icons.pause}</button>
          <button class="p-btn p-big" data-m="next" aria-label="Next">${icons.next}</button>
          <button class="p-btn np-mode${this.repeat !== 'off' ? ' on' : ''}" data-m="repeat" aria-label="${repeatLabel}">${this.repeat === 'one' ? icons.repeatOne : icons.repeat}</button>
        </div>
        ${
          upNext.length
            ? `<h3>Up next</h3><div class="np-queue">${upNext
                .slice(0, 50)
                .map(
                  (q) => `<button class="np-q" data-m="jump" data-id="${esc(q.id)}">${artHtml(q, 'art q-art')}<span><strong>${esc(q.title)}</strong><small>${esc(q.artist || q.folder)}</small></span><em>${q.duration ? clock(q.duration) : ''}</em></button>`,
                )
                .join('')}</div>`
            : ''
        }
        <p class="np-after">${
          this.repeat === 'one'
            ? 'Repeating this song.'
            : this.repeat === 'all'
              ? 'Then this list starts again from the top.'
              : 'Then the music keeps going with more songs from your phone.'
        }</p>
      </div>`;
    this.updateProgress();
  }
}
