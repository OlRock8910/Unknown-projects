import { dedupeSongs, dedupeVideos } from './dedupe';
import { APP_FILTERS, isFiltered } from './filters';
import { bytes, clock, date, esc, length, quality } from './format';
import { icons } from './icons';
import { MediaHub } from './media';
import { artHtml, MusicPlayer } from './music';
import { Player } from './player';
import { isResumable, store } from './store';
import type { AccessState, MediaSource, SharedItems, Song, Video } from './types';

type Tab = 'home' | 'library' | 'list' | 'music' | 'settings';
/** info: a video's detail sheet. np: the music Now Playing screen. */
/** pl: an open playlist on the Music tab ('liked', a made playlist's id, or 'f:<folder path>'). */
type Route = { view: 'tab'; tab: Tab; info?: string; np?: boolean; pl?: string } | { view: 'watch'; id: string };
type Sort = 'new' | 'old' | 'long' | 'short' | 'name';
type SongSort = 'new' | 'title' | 'artist' | 'album';
/** songs: pick songs to like or add somewhere. plsongs: pick songs to take out of a playlist. */
type Selecting = 'library' | 'list' | 'songs' | 'plsongs';

/** A playlist as shown: Liked Songs, one the user made, or one per folder. */
interface PlaylistView {
  id: string;
  kind: 'liked' | 'made' | 'folder';
  name: string;
  /** Second line: "Playlist", the folder's location... */
  sub: string;
  /** Folder playlists only: the folder's own name, when it was renamed in the app. */
  folderName?: string;
  songs: Song[];
}

const LIKED = 'liked';
/** Where downloads go unless the user picks a folder. */
const DEFAULT_FOLDER = 'Music/ReelBox Downloads';
const LAST_FOLDER_KEY = 'reelbox.saveFolder';
const AUDIO_FILE = /\.(mp3|m4a|aac|flac|ogg|oga|opus|wav|wma|amr|3gp)$/i;

const ROW_LIMIT = 30;
const LONG_PRESS_MS = 450;

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const [head, arg] = path.split('/');
  if (head === 'watch' && arg) return { view: 'watch', id: decodeURIComponent(arg) };
  const tab: Tab =
    head === 'library' || head === 'list' || head === 'music' || head === 'settings' ? head : 'home';
  const q = new URLSearchParams(query);
  return {
    view: 'tab',
    tab,
    info: q.get('info') ?? undefined,
    np: q.get('np') === '1',
    pl: (tab === 'music' && q.get('pl')) || undefined,
  };
}

export class App {
  private videos: Video[] = [];
  private byId = new Map<string, Video>();
  private songs: Song[] = [];
  private songById = new Map<string, Song>();
  /** Everything on the phone, before anything is hidden or switched off in Settings. */
  private rawVideos: Video[] = [];
  private rawSongs: Song[] = [];
  private rawVideoById = new Map<string, Video>();
  private rawSongById = new Map<string, Song>();
  /** After Settings (hidden items, apps, folders); copies included. `videos`/`songs` may leave copies out. */
  private allVideos: Video[] = [];
  private allSongs: Song[] = [];
  private hiddenVideos = new Map<string, string>();
  private hiddenSongs = new Map<string, string>();
  private access: AccessState = { access: 'none', canAsk: true, music: false, musicCanAsk: true };
  private loaded = false;
  private route: Route = { view: 'tab', tab: 'home' };
  private renderedTab: Tab | null = null;
  private player: Player;
  private music: MusicPlayer;
  private hub: MediaHub;

  /** Ids behind each row/grid on screen, so Play queues up its neighbours. */
  private contexts = new Map<string, string[]>();
  private sheetQueue: string[] = [];
  private pendingQueue: Video[] | null = null;
  /** True when the current watch/info entry was pushed by us and Back can pop it. */
  private pushed = false;

  private lib = { folder: 'All', sort: 'new' as Sort, query: '' };
  private mus = { view: 'playlists' as 'songs' | 'playlists', sort: 'new' as SongSort, query: '' };
  /** Which playlist the Music tab last drew, so opening another one redraws it. */
  private renderedPl = '';
  private modal = document.createElement('div');
  /** What the open modal does when its form is submitted; return false to keep it open. */
  private onModalSubmit: ((form: HTMLFormElement) => boolean | void) | null = null;
  /** Shared from another app before the library had loaded. */
  private pendingShare: SharedItems | null = null;
  /** Songs waiting in the "Add to playlist" picker. */
  private picking: string[] = [];
  private selecting: Selecting | null = null;
  private selected = new Set<string>();
  private scroll = new Map<string, number>();
  private suppressClick = false;

  private el = {
    main: document.querySelector<HTMLElement>('#screen')!,
    tabs: document.querySelector<HTMLElement>('.tabbar')!,
    sheet: document.querySelector<HTMLElement>('.sheet-wrap')!,
    selbar: document.querySelector<HTMLElement>('.selbar')!,
    toast: document.querySelector<HTMLElement>('.toast')!,
    file: document.querySelector<HTMLInputElement>('#file-input')!,
    musicFile: document.querySelector<HTMLInputElement>('#music-input')!,
    musicFolder: document.querySelector<HTMLInputElement>('#music-folder-input')!,
    add: document.querySelector<HTMLElement>('[data-a="import"]')!,
  };

  constructor(private source: MediaSource) {
    this.hub = new MediaHub(source);
    this.player = new Player(source, this.hub, {
      exit: () => this.back('#/home'),
      changed: (v) => history.replaceState(null, '', `#/watch/${encodeURIComponent(v.id)}`),
    });
    this.music = new MusicPlayer(this.hub, {
      expand: () => this.go(this.withParam('np', '1')),
      collapse: () => {
        if (this.route.view === 'tab' && this.route.np) this.back(this.tabHash());
      },
      changed: () => this.markNowPlaying(),
      isLiked: (id) => store.isLiked(id),
      toggleLike: (id) => {
        const on = store.toggleLike(id);
        this.toast(on ? 'Added to Liked Songs' : 'Removed from Liked Songs');
        this.markLikes();
        if (this.currentPlaylist()?.kind === 'liked') this.renderTab(true);
        return on;
      },
      addTo: (id) => this.openPicker([id]),
      library: () => this.songs,
    });
    this.modal.className = 'modal-wrap';
    this.modal.hidden = true;
    document.body.appendChild(this.modal);
    this.el.add.hidden = source.kind !== 'web';
    document.querySelector('.gear')!.innerHTML = icons.gear;
    document.body.classList.add(`src-${source.kind}`);
    this.wire();
  }

  async start() {
    this.route = parse(location.hash);
    this.renderShell();
    this.el.main.innerHTML = `<div class="loading-screen"><div class="spinner"></div></div>`;
    this.access = await this.source
      .access()
      .catch(() => ({ access: 'none', canAsk: true, music: false, musicCanAsk: true }) as AccessState);
    if (this.access.access !== 'none') await this.reload();
    if (this.access.music) {
      await this.reloadMusic();
      this.music.restore(this.songById);
    }
    this.loaded = true;
    if (this.pendingShare) {
      const items = this.pendingShare;
      this.pendingShare = null;
      queueMicrotask(() => this.handleShare(items));
    }
    // A link straight to a video has nothing to go back to; land on Home under it.
    if (this.route.view === 'watch') {
      const target = location.hash;
      history.replaceState(null, '', '#/home');
      history.pushState(null, '', target);
      this.pushed = true;
    }
    this.onRoute(true);
  }

  // ---------------------------------------------------------------- data

  private async reload() {
    try {
      const list = await this.source.list();
      list.sort((a, b) => b.addedAt - a.addedAt);
      this.rawVideos = list;
      this.rawVideoById = new Map(list.map((v) => [v.id, v]));
      store.prune(new Set(this.rawVideoById.keys()));
      this.applyVideoDupes();
    } catch (err) {
      console.error(err);
      this.toast("Couldn't read your videos");
    }
  }

  private async reloadMusic() {
    try {
      const list = await this.source.listMusic();
      list.sort((a, b) => b.addedAt - a.addedAt);
      this.rawSongs = list;
      this.rawSongById = new Map(list.map((s) => [s.id, s]));
      store.pruneSongs(new Set(this.rawSongById.keys()));
      this.applySongDupes();
    } catch (err) {
      console.error(err);
      this.toast("Couldn't read your music");
    }
  }

  // ---- duplicates: copies are kept on the phone but shown once

  /** Settings first (hidden, apps and folders switched off, only-added mode), then copies. */
  private applyVideoDupes() {
    const hidden = new Set(store.hidden());
    const apps = store.blockedApps().video;
    const folders = store.excludedFolders().video;
    const onlyPicked = this.source.kind === 'native' && store.videoMode() === 'picked';
    const picked = new Set(store.picked());
    this.allVideos = this.rawVideos.filter(
      (v) => !hidden.has(v.id) && !isFiltered(v.path, v.folder, apps, folders) && (!onlyPicked || picked.has(v.id)),
    );
    this.byId = new Map(this.allVideos.map((v) => [v.id, v]));
    const pinned = new Set([...store.myList(), ...store.watchedIds()]);
    const d = dedupeVideos(this.allVideos, pinned);
    this.hiddenVideos = d.hidden;
    this.videos = store.hideDuplicates() ? d.kept : this.allVideos;
  }

  /** Songs you liked, put in a playlist or are playing win over their copies. */
  private songPins() {
    return new Set([
      ...store.liked(),
      ...store.playlists().flatMap((p) => p.songs),
      ...(this.music.current ? [this.music.current.id] : []),
    ]);
  }

  private applySongDupes() {
    const hidden = new Set(store.hidden());
    const apps = store.blockedApps().music;
    const folders = store.excludedFolders().music;
    this.allSongs = this.rawSongs.filter((s) => !hidden.has(s.id) && !isFiltered(s.path, s.folder, apps, folders));
    this.songById = new Map(this.allSongs.map((s) => [s.id, s]));
    this.music.forget(new Set(this.songById.keys()));
    const d = dedupeSongs(this.allSongs, this.songPins());
    this.hiddenSongs = d.hidden;
    this.songs = store.hideDuplicates() ? d.kept : this.allSongs;
  }

  /** After any Settings change: rebuild both libraries and redraw. */
  private applyFilters() {
    this.applyVideoDupes();
    this.applySongDupes();
    this.renderTab(true);
  }

  /** Hide videos or songs everywhere, with Undo. */
  private hideItems(ids: string[]) {
    if (!ids.length) return;
    store.hide(ids);
    this.stopSelect();
    this.applyFilters();
    this.toast(`Hidden ${ids.length === 1 ? '' : `${ids.length} `}· unhide in Settings`, 6000, {
      label: 'Undo',
      run: () => {
        store.unhide(ids);
        this.applyFilters();
      },
    });
  }

  /** Settings → Add videos: the phone's own picker (or the file picker in a browser). */
  private async pickVideos() {
    if (!this.source.pickVideos) {
      this.el.file.click();
      return;
    }
    if (this.access.access === 'none') {
      await this.askAccess();
      if (this.access.access === 'none') return;
    }
    try {
      const r = await this.source.pickVideos();
      if (!r.ids.length) {
        if (r.missing) this.toast("Those videos aren't in your gallery, so they can't be added.", 5000);
        return;
      }
      store.addPicked(r.ids);
      store.add(r.ids);
      // A video recorded since the last load would not be known yet.
      if (r.ids.some((id) => !this.rawVideoById.has(id))) await this.reload();
      this.applyFilters();
      const n = r.ids.length;
      this.toast(
        `Added ${n === 1 ? '1 video' : `${n} videos`} to My List` + (r.missing ? ` (${r.missing} couldn't be added)` : ''),
      );
    } catch (err) {
      console.error(err);
      this.toast("Couldn't open the gallery picker");
    }
  }

  private confirmReset() {
    const web = this.source.kind === 'web';
    this.openModal(`
      <h3>Reset ReelBox?</h3>
      <p class="modal-note">This clears My List, your playlists, liked songs, where you got to in videos, hidden items and all settings.
      ${web ? 'Videos and songs you added in this browser are deleted too.' : 'The videos and songs on your phone are not touched.'}</p>
      <form>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-a="modal-close">Cancel</button>
          <button type="submit" class="btn btn-red">${icons.trash} Reset</button>
        </div>
      </form>`);
    this.onModalSubmit = () => {
      this.closeModal();
      this.music.stop();
      this.player.close();
      store.resetAll();
      const done = () => {
        history.replaceState(null, '', '#/home');
        location.reload();
      };
      if (this.source.reset) this.source.reset().then(done, done);
      else done();
    };
  }

  /** Every folder with something in it, for Settings. */
  private folderRows(items: { path: string; folder: string }[]) {
    const map = new Map<string, number>();
    for (const x of items) map.set(x.path, (map.get(x.path) ?? 0) + 1);
    return [...map.entries()]
      .map(([path, n]) => {
        const parts = path.split('/').filter(Boolean);
        const name = parts.pop() || path;
        return { path, name, where: parts.join(' › '), n };
      })
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  }

  private settingsHtml() {
    const native = this.source.kind === 'native';
    const blocked = store.blockedApps();
    const excluded = store.excludedFolders();
    const mode = store.videoMode();
    const picked = store.picked().filter((id) => this.rawVideoById.has(id)).length;
    const hits = (list: { path: string; folder: string }[], re: RegExp) =>
      list.filter((x) => re.test(`${x.path}/${x.folder}`)).length;
    const toggle = (attrs: string, on: boolean, label: string) =>
      `<label class="switch" aria-label="${esc(label)}"><input type="checkbox" ${attrs} ${on ? 'checked' : ''}><i></i></label>`;

    const apps = APP_FILTERS.map((a) => {
      const nv = hits(this.rawVideos, a.match);
      const nm = hits(this.rawSongs, a.match);
      return `
        <div class="set-row">
          <span class="set-text"><strong>${esc(a.label)}</strong><small>${nv} ${nv === 1 ? 'video' : 'videos'} · ${nm} audio</small></span>
          ${toggle(`data-f="app" data-kind="video" data-key="${a.key}"`, !blocked.video.includes(a.key), `${a.label} videos`)}
          ${toggle(`data-f="app" data-kind="music" data-key="${a.key}"`, !blocked.music.includes(a.key), `${a.label} audio`)}
        </div>`;
    }).join('');

    const folderList = (kind: 'video' | 'music', items: { path: string; folder: string }[]) =>
      this.folderRows(items)
        .map(
          (f) => `
        <div class="set-row">
          <span class="set-text"><strong>${esc(f.name)}</strong><small>${f.where ? `${esc(f.where)} · ` : ''}${f.n}</small></span>
          ${toggle(`data-f="folder" data-kind="${kind}" data-path="${esc(f.path)}"`, !excluded[kind].includes(f.path), `Show ${f.name}`)}
        </div>`,
        )
        .join('') || '<p class="set-empty">No folders yet.</p>';

    const allButtons = (kind: 'video' | 'music') => `
      <div class="set-all">
        <button class="btn btn-glass btn-sm" data-a="folders-all" data-kind="${kind}" data-on="1">${icons.eye} All on</button>
        <button class="btn btn-glass btn-sm" data-a="folders-all" data-kind="${kind}" data-on="0">${icons.eyeOff} All off</button>
      </div>`;

    const hiddenIds = store.hidden();
    const hiddenRows = hiddenIds
      .map((id) => {
        const v = this.rawVideoById.get(id);
        const s = this.rawSongById.get(id);
        if (!v && !s) return '';
        const pic = v
          ? `<span class="set-thumb">${v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy">` : icons.film}</span>`
          : artHtml(s!);
        return `
          <div class="set-row">
            ${pic}
            <span class="set-text"><strong>${esc((v ?? s)!.title)}</strong><small>${v ? 'Video' : 'Song'} · ${esc((v ?? s)!.folder)}</small></span>
            <button class="btn btn-glass btn-sm" data-a="unhide" data-id="${esc(id)}">${icons.eye} Unhide</button>
          </div>`;
      })
      .join('');

    return `
      <section class="page settings">
        <header class="page-head"><div><h1>Settings</h1></div></header>
        ${
          store.anythingSwitchedOff()
            ? `<div class="set-card set-warn">
                <p><strong>Some videos or songs are switched off below.</strong> Showing ${this.videos.length} of ${this.rawVideos.length} videos and ${this.songs.length} of ${this.rawSongs.length} songs.</p>
                <button class="btn btn-red btn-lg btn-block" data-a="show-everything">${icons.eye} Show everything</button>
              </div>`
            : ''
        }

        <div class="set-card">
          <h2>Videos</h2>
          ${
            native
              ? `<label class="set-choice"><input type="radio" name="vmode" data-f="vmode" value="all" ${mode === 'all' ? 'checked' : ''}>
                  <span class="set-text"><strong>My whole gallery</strong><small>Every video on the phone shows up by itself.</small></span></label>
                 <label class="set-choice"><input type="radio" name="vmode" data-f="vmode" value="picked" ${mode === 'picked' ? 'checked' : ''}>
                  <span class="set-text"><strong>Only videos I add</strong><small>Just the ones you pick with Add videos below.</small></span></label>`
              : ''
          }
          <div class="set-row">
            <button class="btn btn-light" data-a="pick-videos">${icons.plus} Add videos</button>
            <span class="set-text"><small>${
              native
                ? `Pick from your gallery; they go into My List.${picked ? ` ${picked} added.` : ''}`
                : 'Pick videos from your device; they go into My List.'
            }</small></span>
            ${native && picked ? `<button class="link" data-a="clear-picked">Clear</button>` : ''}
          </div>
        </div>

        <div class="set-card">
          <h2>Music</h2>
          <p class="set-note">Every song on the phone shows up by itself, and each folder is a playlist.</p>
        </div>

        <div class="set-card">
          <h2>Apps</h2>
          <p class="set-note"><b>Red = shown.</b> Tap a switch to hide that app's videos or audio (grey = hidden). Leave everything red to see it all.</p>
          <div class="set-cols"><span></span><b>Show videos</b><b>Show audio</b></div>
          ${apps}
        </div>

        <details class="set-card" data-key="video-folders">
          <summary><h2>Video folders</h2><small>${this.folderRows(this.rawVideos).length}</small></summary>
          ${allButtons('video')}
          ${folderList('video', this.rawVideos)}
        </details>

        <details class="set-card" data-key="music-folders">
          <summary><h2>Music folders</h2><small>${this.folderRows(this.rawSongs).length}</small></summary>
          ${allButtons('music')}
          ${folderList('music', this.rawSongs)}
        </details>

        <div class="set-card">
          <h2>Hidden <small>${hiddenRows ? hiddenIds.length : 0}</small></h2>
          ${
            hiddenRows
              ? `${hiddenRows}<div class="set-row"><button class="link" data-a="unhide-all">Unhide all</button></div>`
              : `<p class="set-note">Nothing hidden. To hide a video, open it and tap Hide; or Select several in Library or Songs and tap ${icons.eyeOff}.</p>`
          }
        </div>

        <div class="set-card">
          <div class="set-row">
            <span class="set-text"><strong>Hide duplicates</strong><small>Show copies of the same video or song once.</small></span>
            ${toggle('data-f="dupes"', store.hideDuplicates(), 'Hide duplicates')}
          </div>
        </div>

        <div class="set-card">
          <h2>Start again</h2>
          <p class="set-note">Clears your lists, playlists, likes, progress and settings.</p>
          <button class="btn btn-red" data-a="reset">${icons.trash} Reset ReelBox</button>
        </div>

        <p class="set-version">ReelBox ${esc(__APP_VERSION__)}</p>
      </section>`;
  }

  /** Shown instead of an empty list when Settings are what is hiding everything. */
  private switchedOffHtml(what: string) {
    return `
      <section class="empty">
        <div class="empty-icon">${icons.eyeOff}</div>
        <h2>Your settings are hiding everything</h2>
        <p>You have ${what}, but switches in Settings are hiding all of them.</p>
        <button class="btn btn-red btn-lg" data-a="show-everything">${icons.eye} Show everything</button>
        <p class="fine">Then, if you want, switch off just what you don't want in Settings.</p>
      </section>`;
  }

  /** "2 duplicates hidden · Show" under a list's title. */
  private dupeNote(hidden: number) {
    if (!hidden) return '';
    return store.hideDuplicates()
      ? `<p class="dupe-note">${hidden} ${hidden === 1 ? 'duplicate' : 'duplicates'} hidden · <button class="link" data-a="toggle-dupes">Show</button></p>`
      : `<p class="dupe-note">Showing ${hidden} ${hidden === 1 ? 'duplicate' : 'duplicates'} · <button class="link" data-a="toggle-dupes">Hide</button></p>`;
  }

  private pickSongs(ids: readonly string[]) {
    return ids.map((id) => this.songById.get(id)).filter((s): s is Song => !!s);
  }

  private pick(ids: readonly string[]) {
    return ids.map((id) => this.byId.get(id)).filter((v): v is Video => !!v);
  }

  /** One request covers videos and music; Android shows a prompt for each. */
  private async askAccess(forMusic = false) {
    if (forMusic ? !this.access.musicCanAsk : !this.access.canAsk) {
      await this.source.openSettings();
      return;
    }
    this.access = await this.source.requestAccess();
    if (this.access.access !== 'none') await this.reload();
    if (this.access.music) await this.reloadMusic();
    this.renderTab(true);
  }

  private async importMusic(picked: File[]) {
    // A folder pick brings everything in it; keep the songs.
    const files = picked.filter((f) => f.type.startsWith('audio/') || AUDIO_FILE.test(f.name));
    if (picked.length && !files.length) this.toast('No songs in that folder');
    if (!files.length || !this.source.importMusic) return;
    try {
      const added = await this.source.importMusic(files, (done, total) => {
        if (done < total) this.toast(`Adding song ${done + 1} of ${total}…`, 0);
      });
      await this.reloadMusic();
      const folders = new Set(added.map((s) => s.path)).size;
      this.toast(
        `Added ${added.length} ${added.length === 1 ? 'song' : 'songs'}` +
          (folders > 1 ? ` in ${folders} folder playlists` : ''),
      );
    } catch (err) {
      console.error(err);
      this.toast(
        (err as DOMException)?.name === 'QuotaExceededError' ? 'Not enough storage space' : "Couldn't add that song",
      );
    }
    this.renderTab(true);
  }

  private async importFiles(files: File[]) {
    if (!files.length || !this.source.importFiles) return;
    try {
      const added = await this.source.importFiles(files, (done, total) => {
        if (done < total) this.toast(`Adding video ${done + 1} of ${total}…`, 0);
      });
      await this.reload();
      // A copy of something already here goes in quietly, without a second My List entry.
      const fresh = added.filter((v) => !this.hiddenVideos.has(v.id) || !store.hideDuplicates());
      store.add(fresh.map((v) => v.id));
      const copies = added.length - fresh.length;
      const note = copies ? ` (${copies} ${copies === 1 ? 'duplicate' : 'duplicates'} skipped)` : '';
      this.toast(fresh.length === 1 ? `Added to My List${note}` : `Added ${fresh.length} videos to My List${note}`);
    } catch (err) {
      console.error(err);
      this.toast(
        (err as DOMException)?.name === 'QuotaExceededError'
          ? 'Not enough storage space for that video'
          : "Couldn't add that video",
      );
    }
    this.renderTab(true);
  }

  // ---------------------------------------------------------------- routing

  private go(hash: string) {
    if (location.hash === hash) return;
    this.pushed = true;
    location.hash = hash;
  }

  /** Pops an entry we pushed, or replaces it when there is nothing of ours behind it. */
  private back(fallback: string) {
    if (this.pushed) {
      this.pushed = false;
      history.back();
    } else {
      history.replaceState(null, '', fallback);
      this.onRoute();
    }
  }

  /** The current tab (and open playlist), without any sheet or overlay on top. */
  private tabHash(): string {
    const tab = this.route.view === 'tab' ? this.route.tab : this.renderedTab ?? 'home';
    const pl = this.route.view === 'tab' ? this.route.pl : undefined;
    return pl ? `#/${tab}?pl=${encodeURIComponent(pl)}` : `#/${tab}`;
  }

  private withParam(key: string, value: string) {
    const base = this.tabHash();
    return `${base}${base.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;
  }

  private onRoute(force = false) {
    this.route = parse(location.hash);
    if (!this.loaded) return;
    const r = this.route;
    if (r.view === 'watch') {
      const v = this.byId.get(r.id);
      if (!v) {
        history.replaceState(null, '', '#/home');
        this.onRoute();
        return;
      }
      this.closeSheet();
      this.music.hideNowPlaying();
      if (!this.player.isOpen || this.player.current?.id !== v.id) {
        this.player.open(v, this.pendingQueue ?? [v]);
      }
      this.pendingQueue = null;
      return;
    }
    const wasPlaying = this.player.isOpen;
    this.player.close();
    this.closeModal();
    const moved = r.tab !== this.renderedTab || (r.pl ?? '') !== this.renderedPl;
    if (moved) this.stopSelect();
    this.renderTab(force || wasPlaying || moved);
    if (r.info && this.byId.has(r.info)) this.openSheet(this.byId.get(r.info)!);
    else this.closeSheet();
    if (r.np) this.music.showNowPlaying();
    else this.music.hideNowPlaying();
  }

  private play(v: Video, queueIds: readonly string[], fromStart = false) {
    this.pendingQueue = this.pick(queueIds.length ? queueIds : [v.id]);
    if (fromStart) store.clearProgress(v.id);
    const target = `#/watch/${encodeURIComponent(v.id)}`;
    // From the info sheet, swap the sheet's history entry so Back returns to the list.
    if (this.route.view === 'tab' && this.route.info) {
      history.replaceState(null, '', target);
      this.onRoute();
    } else {
      this.go(target);
    }
  }

  // ---------------------------------------------------------------- events

  private wire() {
    window.addEventListener('hashchange', () => this.onRoute());

    document.addEventListener('click', (e) => {
      if (this.suppressClick) {
        this.suppressClick = false;
        e.preventDefault();
        return;
      }
      const t = e.target as HTMLElement;
      const card = t.closest<HTMLElement>('[data-open]');
      const song = t.closest<HTMLElement>('[data-song]');
      const action = t.closest<HTMLElement>('[data-a]');
      if (action) this.action(action.dataset.a!, action);
      else if (card) this.cardTap(card);
      else if (song) this.songTap(song);
    });

    // Long-press a tile to start picking several at once.
    let timer = 0;
    let startX = 0;
    let startY = 0;
    this.el.main.addEventListener('pointerdown', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-a]')) return;
      const card = t.closest<HTMLElement>('.grid [data-open], .songs [data-song]');
      if (!card) return;
      startX = e.clientX;
      startY = e.clientY;
      timer = window.setTimeout(() => {
        if (!this.selecting) this.startSelect(this.selectMode());
        this.toggleSelected(card.dataset.open ?? card.dataset.song!);
        this.suppressClick = true;
        navigator.vibrate?.(15);
      }, LONG_PRESS_MS);
    });
    const cancel = () => clearTimeout(timer);
    this.el.main.addEventListener('pointerup', cancel);
    this.el.main.addEventListener('pointercancel', cancel);
    this.el.main.addEventListener('pointermove', (e) => {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel();
    });
    this.el.main.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).closest('[data-open], [data-song]')) e.preventDefault();
    });

    this.el.main.addEventListener(
      'scroll',
      () => document.body.classList.toggle('scrolled', this.el.main.scrollTop > 40),
      { passive: true },
    );

    this.el.main.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.f === 'query') {
        this.lib.query = t.value;
        this.renderGridOnly();
      } else if (t.dataset.f === 'mquery') {
        this.mus.query = t.value;
        this.renderSongsOnly();
      }
    });
    this.el.main.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.dataset.f === 'sort') {
        this.lib.sort = t.value as Sort;
        this.renderGridOnly();
      } else if (t.dataset.f === 'msort') {
        this.mus.sort = t.value as SongSort;
        this.renderSongsOnly();
      } else if (t.dataset.f) {
        this.settingChanged(t as unknown as HTMLInputElement);
      }
    });

    this.el.file.addEventListener('change', () => {
      const files = Array.from(this.el.file.files ?? []);
      this.el.file.value = '';
      this.importFiles(files);
    });
    for (const input of [this.el.musicFile, this.el.musicFolder]) {
      input.addEventListener('change', () => {
        const files = Array.from(input.files ?? []);
        input.value = '';
        this.importMusic(files);
      });
    }

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });
    this.modal.addEventListener('submit', (e) => {
      e.preventDefault();
      const done = this.onModalSubmit;
      if (!done) return;
      const form = e.target as HTMLFormElement;
      // Run first: the handler reads the form, and may refuse to close.
      if (done(form) === false) return;
      if (this.onModalSubmit === done) this.closeModal();
    });
    // "New folder…" in a Save to list reveals the name box.
    this.modal.addEventListener('change', (e) => {
      const t = e.target as HTMLSelectElement;
      if (t.name !== 'folder') return;
      const box = this.modal.querySelector<HTMLInputElement>('input[name="newfolder"]');
      if (!box) return;
      box.hidden = t.value !== '__new';
      if (!box.hidden) box.focus();
    });
    this.source.onShared?.((items) => {
      if (this.loaded) this.handleShare(items);
      else this.pendingShare = items;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.modal.hidden) this.closeModal();
    });

    this.el.sheet.addEventListener('click', (e) => {
      if (e.target === this.el.sheet) this.back(this.tabHash());
    });

    // New recordings show up when coming back to the app.
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden || this.player.isOpen || this.source.kind !== 'native' || !this.loaded) return;
      const before = this.access;
      this.access = await this.source.access();
      const counts = `${this.videos.length}/${this.songs.length}`;
      if (this.access.access !== 'none') await this.reload();
      if (this.access.music) await this.reloadMusic();
      const changed =
        counts !== `${this.videos.length}/${this.songs.length}` ||
        before.access !== this.access.access ||
        before.music !== this.access.music;
      if (changed && !(this.route.view === 'tab' && this.route.np)) this.renderTab(true);
    });
  }

  private cardTap(card: HTMLElement) {
    const id = card.dataset.open!;
    if (this.selecting) {
      this.toggleSelected(id);
      return;
    }
    const v = this.byId.get(id);
    if (!v) return;
    this.sheetQueue = this.contexts.get(card.dataset.ctx ?? '') ?? [id];
    this.go(this.withParam('info', id));
  }

  private settingChanged(t: HTMLInputElement) {
    const kind = t.dataset.kind === 'music' ? 'music' : 'video';
    switch (t.dataset.f) {
      case 'app':
        store.setBlockedApp(kind, t.dataset.key!, !t.checked);
        break;
      case 'folder':
        store.setExcludedFolder(kind, t.dataset.path!, !t.checked);
        break;
      case 'vmode':
        store.setVideoMode(t.value === 'picked' ? 'picked' : 'all');
        break;
      case 'dupes':
        store.setHideDuplicates(t.checked);
        break;
      default:
        return;
    }
    // The switch already shows its new state: just rebuild the lists, no redraw,
    // so an open folder list stays open where it was.
    this.applyVideoDupes();
    this.applySongDupes();
    if (!(this.route.view === 'tab' && this.route.tab === 'settings')) this.renderTab(true);
  }

  private songTap(row: HTMLElement) {
    const id = row.dataset.song!;
    if (this.selecting) {
      this.toggleSelected(id);
      return;
    }
    const s = this.songById.get(id);
    if (!s) return;
    if (this.music.current?.id === id) {
      this.music.toggle();
      return;
    }
    this.music.playList(this.pickSongs(this.contexts.get(row.dataset.ctx ?? '') ?? [id]), s);
  }

  /** Which kind of multi-select the current screen uses. */
  private selectMode(): Selecting {
    const tab = this.route.view === 'tab' ? this.route.tab : 'home';
    if (tab === 'list') return 'list';
    if (tab === 'music') {
      const pl = this.currentPlaylist();
      return pl && pl.kind !== 'folder' ? 'plsongs' : 'songs';
    }
    return 'library';
  }

  /** Clears a list at once, with a few seconds to take it back. */
  private clearWithUndo(what: string, before: string[], set: (ids: string[]) => void) {
    if (!before.length) return;
    set([]);
    this.stopSelect();
    this.renderTab(true);
    this.toast(`${what} cleared`, 6000, {
      label: 'Undo',
      run: () => {
        set(before);
        this.renderTab(true);
        this.toast(`${what} restored`);
      },
    });
  }

  private action(a: string, el: HTMLElement) {
    const id = el.dataset.id ?? '';
    const v = this.byId.get(id);
    switch (a) {
      case 'tab':
        this.go(`#/${el.dataset.tab}`);
        if (this.route.view === 'tab' && this.route.tab === el.dataset.tab && !this.route.info) {
          this.el.main.scrollTo({ top: 0, behavior: 'smooth' });
        }
        break;
      case 'play':
        if (v) this.play(v, this.contexts.get(el.dataset.ctx ?? '') ?? this.sheetQueue);
        break;
      case 'restart':
        if (v) this.play(v, this.sheetQueue, true);
        break;
      case 'play-all': {
        const list = this.pick(store.myList());
        if (list.length) this.play(list[0], store.myList(), true);
        break;
      }
      case 'toggle-list':
        if (!v) break;
        this.toast(store.toggle(id) ? 'Added to My List' : 'Removed from My List');
        this.refreshListState();
        break;
      case 'info':
        if (v) {
          this.sheetQueue = this.contexts.get(el.dataset.ctx ?? '') ?? [id];
          this.go(this.withParam('info', id));
        }
        break;
      case 'close-sheet':
        this.back(this.tabHash());
        break;
      case 'delete':
        if (v && this.source.remove && confirm(`Delete "${v.title}" from ReelBox?`)) {
          this.source.remove(id).then(async () => {
            store.remove([id]);
            await this.reload();
            this.back(this.tabHash());
            this.renderTab(true);
            this.toast('Deleted');
          });
        }
        break;
      case 'folder':
        this.lib.folder = el.dataset.folder ?? 'All';
        if (this.route.view === 'tab' && this.route.tab === 'library') this.renderTab(true);
        else this.go('#/library');
        break;
      case 'see-all':
        this.lib.folder = el.dataset.folder ?? 'All';
        this.lib.sort = (el.dataset.sort as Sort) ?? 'new';
        this.lib.query = '';
        this.scroll.delete('library');
        this.go('#/library');
        break;
      case 'select':
        this.startSelect(this.selectMode());
        break;
      case 'select-all': {
        const ids = this.selectableIds();
        const all = this.allSelected();
        ids.forEach((i) => (all ? this.selected.delete(i) : this.selected.add(i)));
        this.refreshSelection();
        break;
      }
      case 'select-cancel':
        this.stopSelect();
        break;
      case 'add-selected': {
        const n = store.add([...this.selected]);
        const total = this.selected.size;
        this.stopSelect();
        this.toast(
          n === 0
            ? 'Already in My List'
            : `Added ${n} ${n === 1 ? 'video' : 'videos'} to My List${n < total ? ` (${total - n} already there)` : ''}`,
        );
        this.refreshListState();
        break;
      }
      case 'remove-selected': {
        const n = this.selected.size;
        store.remove([...this.selected]);
        this.stopSelect();
        this.toast(`Removed ${n} from My List`);
        this.renderTab(true);
        break;
      }
      case 'import':
        this.el.file.click();
        break;
      case 'import-music':
        this.el.musicFile.click();
        break;
      case 'grant':
        this.askAccess();
        break;
      case 'grant-music':
        this.askAccess(true);
        break;
      case 'clear-list':
        this.clearWithUndo('My List', [...store.myList()], (ids) => store.setMyList(ids));
        break;
      case 'clear-history': {
        const ids = store.continueWatching();
        const saved = ids.map((i) => [i, store.progress(i)!] as const);
        ids.forEach((i) => store.clearProgress(i));
        this.renderTab(true);
        this.toast('Continue Watching cleared', 6000, {
          label: 'Undo',
          run: () => {
            saved.forEach(([i, p]) => store.setProgress(i, p.pos, p.dur));
            this.renderTab(true);
          },
        });
        break;
      }
      case 'music-view':
        this.mus.view = el.dataset.view === 'songs' ? 'songs' : 'playlists';
        this.stopSelect();
        if (this.route.view === 'tab' && this.route.pl) this.go('#/music');
        else this.renderTab(true);
        break;
      case 'import-music-folder':
        this.el.musicFolder.click();
        break;
      case 'open-pl':
        this.go(`#/music?pl=${encodeURIComponent(el.dataset.pl!)}`);
        break;
      case 'pl-back':
        this.back('#/music');
        break;
      case 'play-songs': {
        const pl = this.currentPlaylist();
        const list = pl ? pl.songs : this.pickSongs(this.contexts.get('songs') ?? []);
        this.music.playList(list, undefined, el.dataset.shuffle === '1');
        break;
      }
      case 'like': {
        const on = store.toggleLike(id);
        this.toast(on ? 'Added to Liked Songs' : 'Removed from Liked Songs');
        if (this.currentPlaylist()?.kind === 'liked') this.renderTab(true);
        else this.markLikes();
        if (this.music.current?.id === id) this.music.refreshLike();
        break;
      }
      case 'add-to':
        this.openPicker([id]);
        break;
      case 'add-to-selected':
        this.openPicker([...this.selected]);
        break;
      case 'like-selected': {
        const n = store.like([...this.selected]);
        this.stopSelect();
        this.toast(n ? `Liked ${n} ${n === 1 ? 'song' : 'songs'}` : 'Already liked');
        this.markLikes();
        this.music.refreshLike();
        break;
      }
      case 'remove-from-pl': {
        const pl = this.currentPlaylist();
        if (!pl) break;
        const ids = [...this.selected];
        const before = pl.songs.map((x) => x.id);
        if (pl.kind === 'liked') store.unlike(ids);
        else store.removeFromPlaylist(pl.id, ids);
        this.stopSelect();
        this.renderTab(true);
        this.toast(`Removed ${ids.length} from ${pl.name}`, 6000, {
          label: 'Undo',
          run: () => {
            if (pl.kind === 'liked') store.setLiked(before);
            else store.setPlaylistSongs(pl.id, before);
            this.renderTab(true);
          },
        });
        break;
      }
      case 'clear-pl': {
        const pl = this.currentPlaylist();
        if (!pl || pl.kind === 'folder') break;
        this.clearWithUndo(
          pl.name,
          pl.songs.map((x) => x.id),
          (ids) => (pl.kind === 'liked' ? store.setLiked(ids) : store.setPlaylistSongs(pl.id, ids)),
        );
        break;
      }
      case 'new-playlist':
        this.askName('New playlist', '', 'Create', (name) => {
          const p = store.createPlaylist(name);
          this.toast(`Created ${p.name}`);
          this.go(`#/music?pl=${encodeURIComponent(p.id)}`);
        });
        break;
      case 'rename-pl': {
        const pl = this.currentPlaylist();
        if (!pl || pl.kind === 'liked') break;
        this.askName('Rename playlist', pl.name, 'Save', (name) => {
          if (pl.kind === 'made') store.renamePlaylist(pl.id, name);
          // Folder playlists: only the name in the app changes, never the folder.
          else store.setFolderName(pl.id.slice(2), name === (pl.folderName ?? pl.name) ? null : name);
          this.renderTab(true);
          this.toast(`Renamed to ${name}`);
        });
        break;
      }
      case 'folder-name': {
        const pl = this.currentPlaylist();
        if (pl?.kind !== 'folder') break;
        store.setFolderName(pl.id.slice(2), null);
        this.renderTab(true);
        this.toast(`Back to the folder's name, ${pl.folderName ?? pl.name}`);
        break;
      }
      case 'delete-pl': {
        const pl = this.currentPlaylist();
        if (pl?.kind !== 'made') break;
        const gone = store.deletePlaylist(pl.id);
        this.back('#/music');
        if (gone) {
          this.toast(`Deleted ${pl.name}`, 6000, {
            label: 'Undo',
            run: () => {
              store.restorePlaylist(gone.playlist, gone.index);
              this.renderTab(true);
            },
          });
        }
        break;
      }
      case 'save-folder-pl': {
        const pl = this.currentPlaylist();
        if (!pl) break;
        const p = store.createPlaylist(pl.name, pl.songs.map((x) => x.id));
        this.toast(`Saved as your playlist "${p.name}"`);
        break;
      }
      case 'pick-pl': {
        const target = el.dataset.pl!;
        const ids = this.picking;
        this.closeModal();
        this.stopSelect();
        if (target === LIKED) {
          const n = store.like(ids);
          this.toast(n ? `Added ${n} to Liked Songs` : 'Already in Liked Songs');
          this.markLikes();
          this.music.refreshLike();
        } else {
          const n = store.addToPlaylist(target, ids);
          const name = store.playlist(target)?.name ?? 'playlist';
          this.toast(n ? `Added ${n} ${n === 1 ? 'song' : 'songs'} to ${name}` : `Already in ${name}`);
          if (this.currentPlaylist()?.id === target) this.renderTab(true);
        }
        break;
      }
      case 'pick-new': {
        const ids = this.picking;
        this.askName('New playlist', '', 'Create', (name) => {
          const p = store.createPlaylist(name, ids);
          this.stopSelect();
          this.toast(`Added ${ids.length} ${ids.length === 1 ? 'song' : 'songs'} to ${p.name}`);
          if (this.route.view === 'tab' && this.route.tab === 'music' && !this.route.pl) this.renderTab(true);
        });
        break;
      }
      case 'modal-close':
        this.closeModal();
        break;
      case 'download':
        this.openDownload();
        break;
      case 'hide-video': {
        if (!id) break;
        this.back(this.tabHash());
        this.hideItems([id]);
        break;
      }
      case 'hide-selected':
        this.hideItems([...this.selected]);
        break;
      case 'unhide':
        store.unhide([id]);
        this.applyFilters();
        this.toast('Back in your lists');
        break;
      case 'unhide-all':
        store.unhide(store.hidden());
        this.applyFilters();
        this.toast('Everything is showing again');
        break;
      case 'pick-videos':
        this.pickVideos();
        break;
      case 'show-everything':
        store.showEverything();
        this.applyFilters();
        this.toast('Showing everything');
        break;
      case 'folders-all': {
        const kind = el.dataset.kind === 'music' ? 'music' : 'video';
        const on = el.dataset.on === '1';
        const paths = this.folderRows(kind === 'music' ? this.rawSongs : this.rawVideos).map((f) => f.path);
        store.setExcludedFolders(kind, on ? [] : paths);
        this.applyFilters();
        this.toast(on ? 'All folders on' : 'All folders off');
        break;
      }
      case 'clear-picked':
        store.clearPicked();
        this.applyFilters();
        break;
      case 'reset':
        this.confirmReset();
        break;
      case 'toggle-dupes':
        store.setHideDuplicates(!store.hideDuplicates());
        this.applyVideoDupes();
        this.applySongDupes();
        this.renderTab(true);
        this.toast(store.hideDuplicates() ? 'Duplicates hidden' : 'Showing duplicates');
        break;
    }
  }

  // ---------------------------------------------------------------- selection

  /** Everything on screen that the current Select can pick. */
  private selectableIds(): string[] {
    const pl = this.route.view === 'tab' ? this.route.pl : undefined;
    const key = { list: 'mylist-grid', library: 'library', songs: pl ? `pl:${pl}` : 'songs', plsongs: `pl:${pl}` };
    return this.contexts.get(key[this.selecting ?? 'library']) ?? [];
  }

  private allSelected() {
    const ids = this.selectableIds();
    return ids.length > 0 && ids.every((i) => this.selected.has(i));
  }

  private startSelect(mode: Selecting) {
    this.selecting = mode;
    this.selected.clear();
    document.body.classList.add('selecting');
    this.refreshSelection();
  }

  private stopSelect() {
    this.selecting = null;
    this.selected.clear();
    document.body.classList.remove('selecting');
    this.refreshSelection();
  }

  private toggleSelected(id: string) {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    this.refreshSelection();
  }

  private refreshSelection() {
    this.el.main.querySelectorAll<HTMLElement>('.grid [data-open], .songs [data-song]').forEach((c) => {
      c.classList.toggle('picked', this.selected.has(c.dataset.open ?? c.dataset.song!));
    });
    const n = this.selected.size;
    const bar = this.el.selbar;
    bar.hidden = !this.selecting;
    if (!this.selecting) return;
    const off = n ? '' : 'disabled';
    const verb = {
      list: `<button class="btn btn-red" data-a="remove-selected" ${off}>${icons.trash} Remove</button>`,
      library: `<div class="sel-actions">
          <button class="btn btn-glass btn-icon" data-a="hide-selected" ${off} aria-label="Hide">${icons.eyeOff}</button>
          <button class="btn btn-light" data-a="add-selected" ${off}>${icons.plus} My List</button>
        </div>`,
      plsongs: `<button class="btn btn-red" data-a="remove-from-pl" ${off}>${icons.trash} Remove</button>`,
      songs: `<div class="sel-actions">
          <button class="btn btn-glass btn-icon" data-a="hide-selected" ${off} aria-label="Hide">${icons.eyeOff}</button>
          <button class="btn btn-glass btn-icon" data-a="like-selected" ${off} aria-label="Like">${icons.heart}</button>
          <button class="btn btn-light" data-a="add-to-selected" ${off}>${icons.plus} Add to</button>
        </div>`,
    }[this.selecting];
    bar.innerHTML = `
      <button class="btn btn-ghost" data-a="select-cancel">Cancel</button>
      <div class="sel-count"><strong>${n}</strong> selected<button class="sel-all" data-a="select-all">${this.allSelected() ? 'None' : 'Select all'}</button></div>
      ${verb}`;
  }

  // ---------------------------------------------------------------- rendering

  private renderShell() {
    this.el.tabs.innerHTML = (
      [
        ['home', 'Home', icons.home],
        ['library', 'Library', icons.grid],
        ['list', 'My List', icons.list],
        ['music', 'Music', icons.note],
      ] as const
    )
      .map(
        ([tab, label, icon]) =>
          `<button data-a="tab" data-tab="${tab}" class="tab">${icon}<span>${label}</span><i class="count"></i></button>`,
      )
      .join('');
  }

  /** Rebuild the current tab, keeping scroll positions. */
  private renderTab(force = false) {
    const tab = this.route.view === 'tab' ? this.route.tab : this.renderedTab ?? 'home';
    const pl = (this.route.view === 'tab' && this.route.pl) || '';
    if (!force && tab === this.renderedTab && pl === this.renderedPl) return;
    if (this.renderedTab) this.scroll.set(`${this.renderedTab}|${this.renderedPl}`, this.el.main.scrollTop);
    const rowScroll = new Map<string, number>();
    this.el.main.querySelectorAll<HTMLElement>('[data-row]').forEach((r) => rowScroll.set(r.dataset.row!, r.scrollLeft));

    // Sections the user opened stay open when the same page is redrawn.
    const openKeys =
      tab === this.renderedTab && pl === this.renderedPl
        ? [...this.el.main.querySelectorAll<HTMLElement>('details[open][data-key]')].map((d) => d.dataset.key!)
        : [];

    this.contexts.clear();
    this.el.main.dataset.tab = tab;
    document.body.dataset.tab = tab;
    this.el.main.innerHTML =
      tab === 'settings'
        ? this.settingsHtml()
        : tab === 'music'
          ? this.musicHtml()
          : this.gate() ?? (tab === 'library' ? this.libraryHtml() : tab === 'list' ? this.listHtml() : this.homeHtml());
    document.querySelector('.gear')!.classList.toggle('on', tab === 'settings');
    if (this.source.kind === 'web') {
      this.el.add.dataset.a = tab === 'music' ? 'import-music' : 'import';
      this.el.add.textContent = tab === 'music' ? '+ Add music' : '+ Add videos';
    }

    for (const key of openKeys) this.el.main.querySelector(`details[data-key="${key}"]`)?.setAttribute('open', '');
    const sameTab = tab === this.renderedTab && pl === this.renderedPl;
    this.renderedTab = tab;
    this.renderedPl = pl;
    this.el.main.scrollTop = this.scroll.get(`${tab}|${pl}`) ?? 0;
    if (sameTab) {
      this.el.main.querySelectorAll<HTMLElement>('[data-row]').forEach((r) => {
        r.scrollLeft = rowScroll.get(r.dataset.row!) ?? 0;
      });
    }
    this.el.tabs.querySelectorAll<HTMLElement>('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    this.updateCount();
    this.refreshSelection();
  }

  private renderGridOnly() {
    const grid = this.el.main.querySelector('#lib-grid');
    if (!grid) return;
    const list = this.filtered();
    this.contexts.set('library', list.map((v) => v.id));
    grid.outerHTML = this.gridHtml(list, 'library', 'lib-grid');
    const count = this.el.main.querySelector('.lib-count');
    if (count) count.textContent = this.countLabel(list.length);
    this.refreshSelection();
  }

  private updateCount() {
    const n = store.myList().filter((id) => this.byId.has(id)).length;
    const badge = this.el.tabs.querySelector<HTMLElement>('[data-tab="list"] .count')!;
    badge.textContent = n ? String(n) : '';

  }

  /** After My List changes: badges and buttons in place, rows only when visible. */
  private refreshListState() {
    this.updateCount();
    document.querySelectorAll<HTMLElement>('[data-a="toggle-list"]').forEach((b) => {
      const inList = store.inList(b.dataset.id!);
      b.classList.toggle('on', inList);
      b.innerHTML = `${inList ? icons.check : icons.plus}<span>${inList ? 'In My List' : 'My List'}</span>`;
    });
    document.querySelectorAll<HTMLElement>('[data-open]').forEach((c) => {
      c.classList.toggle('inlist', store.inList(c.dataset.open!));
    });
    const route = this.route;
    if (route.view === 'tab' && (route.tab === 'home' || route.tab === 'list') && !route.info) this.renderTab(true);
    else if (route.view === 'tab' && route.info) this.stale = true;
  }

  private stale = false;

  /** What to show instead of the tab when there is nothing to show yet. */
  private gate(): string | null {
    if (this.source.kind === 'native' && this.access.access === 'none') {
      return `
        <section class="empty">
          <div class="empty-icon">${icons.film}</div>
          <h2>Your videos, cinema style</h2>
          <p>ReelBox shows the videos already on your phone. Allow access to your videos to get started. Nothing is uploaded anywhere.</p>
          <button class="btn btn-red btn-lg" data-a="grant">${this.access.canAsk ? 'Allow access' : 'Open settings'}</button>
          ${this.access.canAsk ? '' : '<p class="fine">Access was turned off. In Settings, open Permissions → Photos and videos → Allow.</p>'}
        </section>`;
    }
    if (!this.videos.length && this.source.kind === 'native' && store.videoMode() === 'picked') {
      return `
        <section class="empty">
          <div class="empty-icon">${icons.film}</div>
          <h2>Add your videos</h2>
          <p>You chose to see only the videos you add. Pick them from your gallery.</p>
          <button class="btn btn-red btn-lg" data-a="pick-videos">${icons.plus} Add videos</button>
          <p class="fine">To see every video again, open Settings → Videos → My whole gallery.</p>
        </section>`;
    }
    if (!this.videos.length && this.rawVideos.length) {
      return this.switchedOffHtml(`${this.rawVideos.length} videos`);
    }
    if (!this.videos.length) {
      if (this.source.kind === 'web') {
        return `
          <section class="empty">
            <div class="empty-icon">${icons.film}</div>
            <h2>Add your videos</h2>
            <p>Pick videos from your gallery. They're kept in this browser on this device, so they're here whenever you come back.</p>
            <button class="btn btn-red btn-lg" data-a="import">${icons.upload} Choose videos</button>
          </section>`;
      }
      return `
        <section class="empty">
          <div class="empty-icon">${icons.film}</div>
          <h2>No videos yet</h2>
          <p>Videos you record or download will show up here.</p>
          ${this.access.access === 'partial' ? `<button class="btn btn-light" data-a="grant">Choose videos</button>` : ''}
        </section>`;
    }
    return null;
  }

  private partialBanner() {
    if (this.access.access !== 'partial') return '';
    return `<div class="banner">Showing only the videos you allowed. <button class="link" data-a="grant">Choose more</button></div>`;
  }

  private homeHtml() {
    const cont = this.pick(store.continueWatching());
    const mine = this.pick(store.myList());
    const recent = this.videos.slice(0, ROW_LIMIT);
    const featured = cont[0] ?? mine[0] ?? recent[0];

    const rows: string[] = [];
    if (cont.length) rows.push(this.rowHtml('continue', 'Continue Watching', cont, { see: 'clear-history' }));
    if (mine.length) rows.push(this.rowHtml('mylist', 'My List', mine, { see: 'tab-list' }));
    rows.push(this.rowHtml('recent', 'Recently Added', recent, { sort: 'new' }));

    const quick = this.videos.filter((v) => v.duration > 0 && v.duration < 60);
    const long = this.videos.filter((v) => v.duration >= 300).sort((a, b) => b.duration - a.duration);
    if (long.length >= 3) rows.push(this.rowHtml('long', 'Longer Watches', long.slice(0, ROW_LIMIT), { sort: 'long' }));

    const folders = this.folders();
    folders.slice(0, 12).forEach(([name, list]) => {
      if (folders.length > 1) rows.push(this.rowHtml(`f:${name}`, name, list.slice(0, ROW_LIMIT), { folder: name }));
    });
    if (quick.length >= 3) rows.push(this.rowHtml('quick', 'Quick Clips', quick.slice(0, ROW_LIMIT), { sort: 'short' }));

    return `${this.heroHtml(featured)}${this.partialBanner()}<div class="rows">${rows.join('')}</div>`;
  }

  private heroHtml(v: Video) {
    const p = store.progress(v.id);
    const resume = isResumable(p);
    const inList = store.inList(v.id);
    const queue = store.inList(v.id) ? store.myList() : this.videos.map((x) => x.id);
    this.contexts.set('hero', [...queue]);
    const meta = [v.duration ? length(v.duration) : '', v.folder, quality(v.width, v.height)].filter(Boolean);
    return `
      <section class="hero">
        <img class="hero-img" src="${esc(v.thumb)}" alt="">
        <div class="hero-shade"></div>
        <div class="hero-body">
          <div class="hero-kicker">${resume ? 'Continue watching' : inList ? 'From your list' : 'Newest video'}</div>
          <h1>${esc(v.title)}</h1>
          <div class="meta">${meta.map(esc).join('<i>•</i>')}</div>
          ${resume ? `<div class="hero-progress"><b style="width:${(p.pos / p.dur) * 100}%"></b></div>` : ''}
          <div class="hero-actions">
            <button class="btn btn-light btn-lg" data-a="play" data-id="${esc(v.id)}" data-ctx="hero">${icons.play}${resume ? 'Resume' : 'Play'}</button>
            <button class="btn btn-glass btn-lg${inList ? ' on' : ''}" data-a="toggle-list" data-id="${esc(v.id)}">${inList ? icons.check : icons.plus}<span>${inList ? 'In My List' : 'My List'}</span></button>
            <button class="btn btn-glass btn-icon" data-a="info" data-id="${esc(v.id)}" data-ctx="hero" aria-label="More info">${icons.info}</button>
          </div>
        </div>
      </section>`;
  }

  private rowHtml(key: string, title: string, list: Video[], more: { folder?: string; sort?: Sort; see?: string } = {}) {
    this.contexts.set(key, list.map((v) => v.id));
    const see =
      more.see === 'tab-list'
        ? `<button class="link" data-a="tab" data-tab="list">See all</button>`
        : more.see === 'clear-history'
          ? `<button class="link" data-a="clear-history">Clear</button>`
        : more.folder || more.sort
          ? `<button class="link" data-a="see-all" data-folder="${esc(more.folder ?? 'All')}" data-sort="${more.sort ?? 'new'}">See all</button>`
          : '';
    return `
      <section class="row">
        <header><h2>${esc(title)}</h2>${see}</header>
        <div class="row-scroll" data-row="${esc(key)}">${list.map((v) => this.cardHtml(v, key)).join('')}</div>
      </section>`;
  }

  private cardHtml(v: Video, ctx: string) {
    const p = store.progress(v.id);
    const bar = isResumable(p) ? `<div class="card-progress"><b style="width:${(p.pos / p.dur) * 100}%"></b></div>` : '';
    const cls = ['card', store.inList(v.id) ? 'inlist' : '', this.selected.has(v.id) ? 'picked' : '', v.height > v.width ? 'portrait' : '']
      .filter(Boolean)
      .join(' ');
    return `
      <button class="${cls}" data-open="${esc(v.id)}" data-ctx="${esc(ctx)}">
        <div class="thumb">
          ${v.thumb ? `<img src="${esc(v.thumb)}" loading="lazy" decoding="async" alt="">` : `<div class="noimg">${icons.film}</div>`}
          ${v.duration ? `<span class="dur">${clock(v.duration)}</span>` : ''}
          <span class="badge" aria-label="In My List">${icons.check}</span>
          <span class="tick">${icons.check}</span>
          ${bar}
        </div>
        <span class="cap">${esc(v.title)}</span>
      </button>`;
  }

  private gridHtml(list: Video[], ctx: string, id: string) {
    if (!list.length) return `<div class="grid grid-empty" id="${id}"><p>Nothing matches.</p></div>`;
    return `<div class="grid" id="${id}">${list.map((v) => this.cardHtml(v, ctx)).join('')}</div>`;
  }

  private folders(): [string, Video[]][] {
    const map = new Map<string, Video[]>();
    for (const v of this.videos) {
      if (!map.has(v.folder)) map.set(v.folder, []);
      map.get(v.folder)!.push(v);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }

  private filtered() {
    const q = this.lib.query.trim().toLowerCase();
    let list = this.videos.filter(
      (v) => (this.lib.folder === 'All' || v.folder === this.lib.folder) && (!q || v.title.toLowerCase().includes(q)),
    );
    const by: Record<Sort, (a: Video, b: Video) => number> = {
      new: (a, b) => b.addedAt - a.addedAt,
      old: (a, b) => a.addedAt - b.addedAt,
      long: (a, b) => b.duration - a.duration,
      short: (a, b) => a.duration - b.duration,
      name: (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }),
    };
    list = [...list].sort(by[this.lib.sort]);
    return list;
  }

  private countLabel(n: number) {
    return `${n} ${n === 1 ? 'video' : 'videos'}`;
  }

  private libraryHtml() {
    const folders = this.folders();
    if (this.lib.folder !== 'All' && !folders.some(([f]) => f === this.lib.folder)) this.lib.folder = 'All';
    const list = this.filtered();
    this.contexts.set('library', list.map((v) => v.id));
    const chip = (name: string, n: number) =>
      `<button class="chip${this.lib.folder === name ? ' on' : ''}" data-a="folder" data-folder="${esc(name)}">${esc(name)} <small>${n}</small></button>`;
    const sorts: [Sort, string][] = [
      ['new', 'Newest'],
      ['old', 'Oldest'],
      ['long', 'Longest'],
      ['short', 'Shortest'],
      ['name', 'Name'],
    ];
    return `
      <section class="page">
        <header class="page-head">
          <div><h1>Library</h1><p class="lib-count">${this.countLabel(list.length)}</p>${this.dupeNote(this.hiddenVideos.size)}</div>
          <button class="btn btn-glass" data-a="select">${icons.check} Select</button>
        </header>
        ${this.partialBanner()}
        <p class="hint">Tap <b>Select</b> or press and hold a video to pick several, then add them to My List.</p>
        <div class="tools">
          <label class="search">${icons.search}<input type="search" data-f="query" placeholder="Search videos" value="${esc(this.lib.query)}"></label>
          <select data-f="sort" aria-label="Sort">${sorts
            .map(([k, l]) => `<option value="${k}"${this.lib.sort === k ? ' selected' : ''}>${l}</option>`)
            .join('')}</select>
        </div>
        ${folders.length > 1 ? `<div class="chips">${chip('All', this.videos.length)}${folders.map(([f, l]) => chip(f, l.length)).join('')}</div>` : ''}
        ${this.gridHtml(list, 'library', 'lib-grid')}
      </section>`;
  }

  private listHtml() {
    const mine = this.pick(store.myList());
    this.contexts.set('mylist-grid', mine.map((v) => v.id));
    if (!mine.length) {
      return `
        <section class="empty">
          <div class="empty-icon">${icons.list}</div>
          <h2>Your list is empty</h2>
          <p>Pick the videos you want to watch and they'll wait for you here.</p>
          <button class="btn btn-red btn-lg" data-a="tab" data-tab="library">Browse your videos</button>
        </section>`;
    }
    const total = mine.reduce((s, v) => s + v.duration, 0);
    return `
      <section class="page">
        <header class="page-head">
          <div><h1>My List</h1><p>${this.countLabel(mine.length)}${total ? ` · ${length(total)}` : ''}</p></div>
          <div class="head-actions">
            <button class="btn btn-light" data-a="play-all">${icons.play} Play all</button>
            <button class="btn btn-glass" data-a="select">Edit</button>
          </div>
        </header>
        <div class="list-tools"><button class="link danger" data-a="clear-list">${icons.trash} Clear all</button></div>
        ${this.gridHtml(mine, 'mylist-grid', 'list-grid')}
      </section>`;
  }

  // ---------------------------------------------------------------- info sheet

  private openSheet(v: Video) {
    const p = store.progress(v.id);
    const resume = isResumable(p);
    const inList = store.inList(v.id);
    const more = this.videos.filter((x) => x.folder === v.folder && x.id !== v.id).slice(0, ROW_LIMIT);
    const meta = [
      date(v.addedAt),
      v.duration ? length(v.duration) : '',
      quality(v.width, v.height),
      v.size ? bytes(v.size) : '',
    ].filter(Boolean);
    if (!this.sheetQueue.includes(v.id)) this.sheetQueue = [v.id];
    this.el.sheet.innerHTML = `
      <div class="sheet" role="dialog" aria-label="${esc(v.title)}">
        <button class="sheet-close" data-a="close-sheet" aria-label="Close">${icons.close}</button>
        <button class="sheet-art" data-a="play" data-id="${esc(v.id)}">
          ${v.thumb ? `<img src="${esc(v.thumb)}" alt="">` : ''}
          <span class="sheet-play">${icons.play}</span>
          ${resume ? `<div class="card-progress"><b style="width:${(p.pos / p.dur) * 100}%"></b></div>` : ''}
        </button>
        <div class="sheet-body">
          <h2>${esc(v.title)}</h2>
          <div class="meta">${meta.map(esc).join('<i>•</i>')}</div>
          <div class="folder-tag">${icons.film}${esc(v.folder)}</div>
          <button class="btn btn-light btn-block btn-lg" data-a="play" data-id="${esc(v.id)}">${icons.play}${
            resume ? `Resume from ${clock(p.pos)}` : 'Play'
          }</button>
          <div class="sheet-actions">
            ${resume ? `<button class="act" data-a="restart" data-id="${esc(v.id)}">${icons.restart}<span>Start over</span></button>` : ''}
            <button class="act${inList ? ' on' : ''}" data-a="toggle-list" data-id="${esc(v.id)}">${inList ? icons.check : icons.plus}<span>${inList ? 'In My List' : 'My List'}</span></button>
            <button class="act" data-a="hide-video" data-id="${esc(v.id)}">${icons.eyeOff}<span>Hide</span></button>
            ${this.source.kind === 'web' ? `<button class="act" data-a="delete" data-id="${esc(v.id)}">${icons.trash}<span>Delete</span></button>` : ''}
          </div>
          ${more.length ? `<h3>More from ${esc(v.folder)}</h3><div class="row-scroll">${more.map((x) => this.cardHtml(x, `f:${v.folder}`)).join('')}</div>` : ''}
        </div>
      </div>`;
    this.contexts.set(`f:${v.folder}`, this.videos.filter((x) => x.folder === v.folder).map((x) => x.id));
    this.el.sheet.hidden = false;
    requestAnimationFrame(() => this.el.sheet.classList.add('open'));
  }

  private closeSheet() {
    if (this.el.sheet.hidden) return;
    this.el.sheet.classList.remove('open');
    this.el.sheet.hidden = true;
    this.el.sheet.innerHTML = '';
    if (this.stale) {
      this.stale = false;
      this.renderTab(true);
    }
  }

  // ---------------------------------------------------------------- toast

  private toastTimer = 0;
  private toast(msg: string, ms = 2200, action?: { label: string; run(): void }) {
    const t = this.el.toast;
    t.textContent = msg;
    t.classList.toggle('has-action', !!action);
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = (e) => {
        e.stopPropagation();
        t.classList.remove('on');
        action.run();
      };
      t.appendChild(b);
    }
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    if (ms) this.toastTimer = window.setTimeout(() => t.classList.remove('on'), ms);
  }

  // ---------------------------------------------------------------- music

  private markNowPlaying() {
    const id = this.music.current?.id;
    this.el.main.querySelectorAll<HTMLElement>('[data-song]').forEach((r) => r.classList.toggle('now', r.dataset.song === id));
  }

  /** Hearts on screen after likes change elsewhere (Now Playing, multi-select). */
  private markLikes() {
    this.el.main.querySelectorAll<HTMLElement>('[data-a="like"]').forEach((b) => {
      const on = store.isLiked(b.dataset.id!);
      b.classList.toggle('on', on);
      b.innerHTML = on ? icons.heartFill : icons.heart;
      b.setAttribute('aria-label', on ? 'Unlike' : 'Like');
    });
    const count = this.el.main.querySelector('[data-pl="liked"] .pl-sub');
    if (count) count.textContent = this.songCount(this.pickSongs(store.liked()).length);
  }

  private songCount(n: number) {
    return `${n} ${n === 1 ? 'song' : 'songs'}`;
  }

  /** Track order inside a folder: by track number, then title. */
  private byTrack(a: Song, b: Song) {
    return (a.track || 9999) - (b.track || 9999) || a.title.localeCompare(b.title, undefined, { numeric: true });
  }

  /**
   * One ready-made playlist per folder name. Folders with the same name are
   * one playlist: downloads have to live under Music/, so "Songs/Chill" and
   * "Music/Songs/Chill" are both just "Chill".
   */
  private folderPlaylists(): PlaylistView[] {
    const map = new Map<string, { name: string; parents: Set<string>; songs: Song[] }>();
    // From every song, so a song kept in two folders shows in both playlists.
    for (const s of this.allSongs) {
      const parts = s.path.split('/').filter(Boolean);
      const name = parts.pop() || s.path;
      const key = name.toLowerCase();
      if (!map.has(key)) map.set(key, { name, parents: new Set(), songs: [] });
      const g = map.get(key)!;
      g.parents.add(parts.join(' › '));
      g.songs.push(s);
    }
    const pins = this.songPins();
    const names = store.folderNames();
    return [...map.entries()]
      .map(([key, g]) => {
        const parents = [...g.parents].filter(Boolean);
        return {
          id: `f:${key}`,
          kind: 'folder' as const,
          name: names[key] ?? g.name,
          folderName: names[key] ? g.name : undefined,
          sub:
            (names[key] ? `Folder “${g.name}” · ` : '') +
            (g.parents.size > 1 ? `In ${g.parents.size} places` : parents.length ? `In ${parents[0]}` : 'Folder'),
          songs: (store.hideDuplicates() ? dedupeSongs(g.songs, pins).kept : g.songs).sort((a, b) => this.byTrack(a, b)),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  private madePlaylists(): PlaylistView[] {
    return store.playlists().map((p) => ({
      id: p.id,
      kind: 'made' as const,
      name: p.name,
      sub: 'Your playlist',
      songs: this.pickSongs(p.songs),
    }));
  }

  private likedPlaylist(): PlaylistView {
    return { id: LIKED, kind: 'liked', name: 'Liked Songs', sub: 'Songs you ♥', songs: this.pickSongs(store.liked()) };
  }

  private playlistById(id: string): PlaylistView | null {
    if (id === LIKED) return this.likedPlaylist();
    if (id.startsWith('f:')) return this.folderPlaylists().find((p) => p.id === id) ?? null;
    return this.madePlaylists().find((p) => p.id === id) ?? null;
  }

  private currentPlaylist(): PlaylistView | null {
    const id = this.route.view === 'tab' && this.route.tab === 'music' ? this.route.pl : undefined;
    return id ? this.playlistById(id) : null;
  }

  /** A playlist's picture: a heart for Liked Songs, else up to four covers. */
  private coverHtml(pl: PlaylistView, cls: string) {
    if (pl.kind === 'liked') return `<span class="cover cover-liked ${cls}">${icons.heartFill}</span>`;
    const songs = pl.songs.slice(0, 4);
    if (songs.length < 4) {
      return songs.length
        ? `<span class="cover ${cls}">${artHtml(songs[0])}</span>`
        : `<span class="cover cover-empty ${cls}">${pl.kind === 'folder' ? icons.folder : icons.note}</span>`;
    }
    return `<span class="cover cover-grid ${cls}">${songs.map((x) => artHtml(x)).join('')}</span>`;
  }

  private filteredSongs() {
    const q = this.mus.query.trim().toLowerCase();
    const list = this.songs.filter((s) => !q || `${s.title} ${s.artist} ${s.album} ${s.folder}`.toLowerCase().includes(q));
    const by: Record<SongSort, (a: Song, b: Song) => number> = {
      new: (a, b) => b.addedAt - a.addedAt,
      title: (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }),
      artist: (a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album) || this.byTrack(a, b),
      album: (a, b) => a.album.localeCompare(b.album) || this.byTrack(a, b),
    };
    return list.sort(by[this.mus.sort]);
  }

  private songRow(s: Song, ctx: string) {
    const liked = store.isLiked(s.id);
    const sub = [s.artist, s.album].filter(Boolean).join(' · ') || s.folder;
    const cls = ['song', this.music.current?.id === s.id ? 'now' : '', this.selected.has(s.id) ? 'picked' : '']
      .filter(Boolean)
      .join(' ');
    return `
      <div class="${cls}" data-song="${esc(s.id)}" data-ctx="${esc(ctx)}" role="button" tabindex="0">
        ${artHtml(s)}
        <span class="song-text"><strong>${esc(s.title)}</strong><small>${esc(sub)}</small></span>
        <span class="song-dur">${s.duration ? clock(s.duration) : ''}</span>
        <button class="song-btn like${liked ? ' on' : ''}" data-a="like" data-id="${esc(s.id)}" aria-label="${liked ? 'Unlike' : 'Like'}">${liked ? icons.heartFill : icons.heart}</button>
        <button class="song-btn" data-a="add-to" data-id="${esc(s.id)}" aria-label="Add to playlist">${icons.plus}</button>
        <span class="tick">${icons.check}</span>
      </div>`;
  }

  private songsHtml(list: Song[], ctx: string) {
    this.contexts.set(ctx, list.map((s) => s.id));
    const id = `songs-${ctx.replace(/[^\w-]/g, '_')}`;
    if (!list.length) return `<div class="songs grid-empty" id="${id}"><p>Nothing matches.</p></div>`;
    return `<div class="songs" id="${id}">${list.map((s) => this.songRow(s, ctx)).join('')}</div>`;
  }

  private renderSongsOnly() {
    const box = this.el.main.querySelector('#songs-songs');
    if (!box) return;
    const list = this.filteredSongs();
    box.outerHTML = this.songsHtml(list, 'songs');
    const count = this.el.main.querySelector('.lib-count');
    if (count) count.textContent = this.songCount(list.length);
    this.refreshSelection();
  }

  private musicHtml() {
    if (this.source.kind === 'native' && !this.access.music) {
      return `
        <section class="empty">
          <div class="empty-icon">${icons.note}</div>
          <h2>Your music, right here</h2>
          <p>Play the MP3s and other songs on your phone, even with the screen off. Allow access to music and audio to start.</p>
          <button class="btn btn-red btn-lg" data-a="grant-music">${this.access.musicCanAsk ? 'Allow access' : 'Open settings'}</button>
          ${this.access.musicCanAsk ? '' : '<p class="fine">Access was turned off. In Settings, open Permissions → Music and audio → Allow.</p>'}
        </section>`;
    }
    if (!this.songs.length && this.rawSongs.length) {
      return this.switchedOffHtml(`${this.rawSongs.length} songs`);
    }
    if (!this.songs.length) {
      return this.source.kind === 'web'
        ? `
        <section class="empty">
          <div class="empty-icon">${icons.note}</div>
          <h2>Add your music</h2>
          <p>Pick songs, or a whole folder: every folder inside it becomes a playlist. They're kept in this browser on this device.</p>
          <div class="empty-actions">
            <button class="btn btn-red btn-lg" data-a="import-music-folder">${icons.folder} Add a folder</button>
            <button class="btn btn-glass btn-lg" data-a="import-music">${icons.upload} Choose songs</button>
            <button class="btn btn-glass btn-lg" data-a="download">${icons.download} From a link</button>
          </div>
        </section>`
        : `
        <section class="empty">
          <div class="empty-icon">${icons.note}</div>
          <h2>No music yet</h2>
          <p>Songs you download or copy to your phone will show up here. Put them in folders and each folder becomes a playlist. You can also share songs to ReelBox from other apps.</p>
          <button class="btn btn-red btn-lg" data-a="download">${icons.download} Download from a link</button>
        </section>`;
    }
    const open = this.currentPlaylist();
    if (open) return this.playlistPageHtml(open);
    if (this.route.view === 'tab' && this.route.pl) {
      // A playlist that no longer exists (deleted, or its folder is gone).
      queueMicrotask(() => history.replaceState(null, '', '#/music'));
    }

    const seg = `
      <div class="seg">
        <button class="${this.mus.view === 'playlists' ? 'on' : ''}" data-a="music-view" data-view="playlists">Playlists</button>
        <button class="${this.mus.view === 'songs' ? 'on' : ''}" data-a="music-view" data-view="songs">Songs <small>${this.songs.length}</small></button>
      </div>`;

    if (this.mus.view === 'playlists') {
      const plRow = (pl: PlaylistView) => `
        <button class="pl" data-a="open-pl" data-pl="${esc(pl.id)}">
          ${this.coverHtml(pl, 'pl-cover')}
          <span class="pl-text"><strong>${esc(pl.name)}</strong><small class="pl-sub">${esc(pl.sub)} · ${this.songCount(pl.songs.length)}</small></span>
          <span class="pl-go">${icons.chevron}</span>
        </button>`;
      const made = this.madePlaylists();
      const folders = this.folderPlaylists();
      return `
        <section class="page">
          <header class="page-head">
            <div><h1>Music</h1><p>${this.songCount(this.songs.length)} · ${folders.length + made.length + 1} playlists</p></div>
            <div class="head-actions">
              <button class="btn btn-glass" data-a="download">${icons.download} Download</button>
              <button class="btn btn-light" data-a="new-playlist">${icons.plus} New</button>
            </div>
          </header>
          ${seg}
          <div class="pl-list">
            ${plRow(this.likedPlaylist())}
            ${made.map(plRow).join('')}
          </div>
          ${
            folders.length
              ? `<h2 class="pl-head">From your folders <small>Made for you from how your music is organised</small></h2>
                 <div class="pl-list">${folders.map(plRow).join('')}</div>`
              : ''
          }
          ${
            this.source.kind === 'web'
              ? `<div class="soft-empty"><button class="btn btn-glass" data-a="import-music-folder">${icons.folder} Add a folder of music</button></div>`
              : ''
          }
        </section>`;
    }

    const list = this.filteredSongs();
    const sorts: [SongSort, string][] = [
      ['new', 'Newest'],
      ['title', 'Title'],
      ['artist', 'Artist'],
      ['album', 'Album'],
    ];
    return `
      <section class="page">
        <header class="page-head">
          <div><h1>Music</h1><p class="lib-count">${this.songCount(list.length)}</p>${this.dupeNote(this.hiddenSongs.size)}</div>
          <div class="head-actions">
            <button class="btn btn-glass btn-icon" data-a="download" aria-label="Download a song">${icons.download}</button>
            <button class="btn btn-glass" data-a="select">${icons.check} Select</button>
          </div>
        </header>
        ${seg}
        <div class="play-row">
          <button class="btn btn-light" data-a="play-songs">${icons.play} Play</button>
          <button class="btn btn-glass" data-a="play-songs" data-shuffle="1">${icons.shuffle} Shuffle</button>
        </div>
        <div class="tools">
          <label class="search">${icons.search}<input type="search" data-f="mquery" placeholder="Search songs, artists, albums" value="${esc(this.mus.query)}"></label>
          <select data-f="msort" aria-label="Sort">${sorts
            .map(([k, l]) => `<option value="${k}"${this.mus.sort === k ? ' selected' : ''}>${l}</option>`)
            .join('')}</select>
        </div>
        ${this.songsHtml(list, 'songs')}
      </section>`;
  }

  private playlistPageHtml(pl: PlaylistView) {
    const total = pl.songs.reduce((t, x) => t + x.duration, 0);
    const editable = pl.kind !== 'folder';
    const tools =
      pl.kind === 'made'
        ? `<button class="act" data-a="rename-pl">${icons.edit}<span>Rename</span></button>
           <button class="act" data-a="select">${icons.check}<span>Edit</span></button>
           <button class="act" data-a="clear-pl">${icons.trash}<span>Clear all</span></button>
           <button class="act" data-a="delete-pl">${icons.close}<span>Delete</span></button>`
        : pl.kind === 'liked'
          ? `<button class="act" data-a="select">${icons.check}<span>Edit</span></button>
             <button class="act" data-a="clear-pl">${icons.trash}<span>Clear all</span></button>`
          : `<button class="act" data-a="rename-pl">${icons.edit}<span>Rename</span></button>
             ${pl.folderName ? `<button class="act" data-a="folder-name">${icons.folder}<span>Folder name</span></button>` : ''}
             <button class="act" data-a="select">${icons.check}<span>Select</span></button>
             <button class="act" data-a="save-folder-pl">${icons.plus}<span>Save as mine</span></button>`;
    const empty =
      pl.kind === 'liked'
        ? `Tap ${icons.heart} on any song to keep it here.`
        : `Add songs with ${icons.plus} next to any song, or Select several in Songs.`;
    return `
      <section class="page pl-page">
        <button class="pl-back" data-a="pl-back">${icons.back} Music</button>
        <header class="pl-hero">
          ${this.coverHtml(pl, 'pl-hero-cover')}
          <div>
            <small>${pl.kind === 'folder' ? 'Folder playlist' : pl.kind === 'liked' ? 'Playlist' : 'Your playlist'}</small>
            <h1>${esc(pl.name)}</h1>
            <p>${pl.kind === 'folder' ? `${esc(pl.sub)} · ` : ''}${this.songCount(pl.songs.length)}${total ? ` · ${length(total)}` : ''}</p>
          </div>
        </header>
        ${
          pl.songs.length
            ? `<div class="play-row">
                <button class="btn btn-light" data-a="play-songs">${icons.play} Play</button>
                <button class="btn btn-glass" data-a="play-songs" data-shuffle="1">${icons.shuffle} Shuffle</button>
              </div>`
            : ''
        }
        <div class="sheet-actions pl-tools">${tools}</div>
        ${pl.songs.length ? this.songsHtml(pl.songs, `pl:${pl.id}`) : `<div class="soft-empty"><p>${editable ? empty : 'This folder has no songs now.'}</p></div>`}
      </section>`;
  }

  // ---------------------------------------------------------------- modals

  private openModal(html: string) {
    this.modal.innerHTML = `<div class="modal" role="dialog">${html}</div>`;
    this.modal.hidden = false;
    requestAnimationFrame(() => this.modal.classList.add('open'));
  }

  private closeModal() {
    if (this.modal.hidden) return;
    this.modal.classList.remove('open');
    this.modal.hidden = true;
    this.modal.innerHTML = '';
    this.onModalSubmit = null;
  }

  private askName(title: string, value: string, verb: string, done: (name: string) => void) {
    this.openModal(`
      <h3>${esc(title)}</h3>
      <form>
        <input name="name" maxlength="60" placeholder="Playlist name" value="${esc(value)}" autocomplete="off" enterkeyhint="done">
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-a="modal-close">Cancel</button>
          <button type="submit" class="btn btn-red">${esc(verb)}</button>
        </div>
      </form>`);
    this.onModalSubmit = (form) => {
      const input = form.elements.namedItem('name') as HTMLInputElement;
      const value = input.value.trim();
      if (!value) {
        input.focus();
        return false;
      }
      this.closeModal();
      done(value);
    };
    const input = this.modal.querySelector<HTMLInputElement>('input')!;
    input.focus();
    input.select();
  }

  // ---------------------------------------------------------------- download and share

  /** Every folder with songs in it, for "Save to". */
  private folderChoices(): { path: string; label: string }[] {
    const paths = [...new Set(this.songs.map((s) => s.path))];
    if (!paths.includes(DEFAULT_FOLDER)) paths.push(DEFAULT_FOLDER);
    return paths
      .map((path) => {
        const parts = path.split('/').filter(Boolean);
        const name = parts.pop() || path;
        return { path, label: parts.length ? `${name} (in ${parts.join(' › ')})` : name };
      })
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  }

  private folderSelectHtml() {
    let last = DEFAULT_FOLDER;
    try {
      last = localStorage.getItem(LAST_FOLDER_KEY) || DEFAULT_FOLDER;
    } catch {
      // Storage blocked: fall back to the default folder.
    }
    const choices = this.folderChoices();
    if (!choices.some((c) => c.path === last)) last = DEFAULT_FOLDER;
    return `
      <label class="field"><span>Save to playlist folder</span>
        <select name="folder">
          ${choices.map((c) => `<option value="${esc(c.path)}"${c.path === last ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}
          <option value="__new">+ New folder…</option>
        </select>
      </label>
      <input name="newfolder" maxlength="60" placeholder="New folder name, e.g. Gym" autocomplete="off" hidden>`;
  }

  /** The folder picked in a Save to form, or null (and a nudge) when a new name is missing. */
  private pickedFolder(form: HTMLFormElement): string | null {
    const sel = (form.elements.namedItem('folder') as HTMLSelectElement).value;
    if (sel !== '__new') return sel;
    const box = form.elements.namedItem('newfolder') as HTMLInputElement;
    const name = box.value.trim().replace(/[\\/]+/g, ' ');
    if (!name) {
      box.focus();
      return null;
    }
    return `Music/${name}`;
  }

  private rememberFolder(path: string) {
    try {
      localStorage.setItem(LAST_FOLDER_KEY, path);
    } catch {
      // Not remembered; the default is used next time.
    }
  }

  private openDownload(link = '') {
    this.openModal(`
      <h3>Download a song</h3>
      <p class="modal-note">Paste a direct link to an audio file (one that ends in .mp3, .m4a and so on). Links to web pages or streaming sites won't work.</p>
      <form>
        <input name="url" type="url" inputmode="url" placeholder="https://…/song.mp3" value="${esc(link)}" autocomplete="off" required>
        ${this.folderSelectHtml()}
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-a="modal-close">Cancel</button>
          <button type="submit" class="btn btn-red">${icons.download} Download</button>
        </div>
      </form>`);
    this.onModalSubmit = (form) => {
      const input = form.elements.namedItem('url') as HTMLInputElement;
      const url = input.value.trim();
      if (!/^https?:\/\/\S+$/i.test(url)) {
        input.focus();
        this.toast('Paste a link that starts with https://');
        return false;
      }
      const folder = this.pickedFolder(form);
      if (!folder) return false;
      this.rememberFolder(folder);
      this.closeModal();
      this.download(url, folder);
    };
    if (!link) this.modal.querySelector<HTMLInputElement>('input[name="url"]')!.focus();
  }

  private async download(url: string, folder: string) {
    this.toast('Starting download…', 0);
    try {
      const done = await this.source.downloadSong(url, folder, (got, total) => {
        const mb = (got / 1e6).toFixed(1);
        this.toast(total > 0 ? `Downloading… ${Math.floor((got / total) * 100)}%` : `Downloading… ${mb} MB`, 0);
      });
      await this.reloadMusic();
      this.afterSave(`Saved “${done.name.replace(/\.[^.]+$/, '')}”`, done.folder);
    } catch (err) {
      this.toast((err as Error).message || 'The download failed.', 6000);
    }
  }

  /** A toast that can jump to the folder playlist the songs went into. */
  private afterSave(message: string, folder: string) {
    const name = folder.split('/').filter(Boolean).pop() ?? '';
    const id = `f:${name.toLowerCase()}`;
    if (this.route.view === 'tab' && this.route.tab === 'music') this.renderTab(true);
    this.toast(`${message} to ${name}`, 6000, {
      label: 'View',
      run: () => this.go(`#/music?pl=${encodeURIComponent(id)}`),
    });
  }

  /** From the Share menu: songs get a "Save to" screen, a link opens the download form. */
  private handleShare(items: SharedItems) {
    const show = () => {
      if (items.link) {
        this.openDownload(items.link);
        return;
      }
      if (!items.files.length || !this.source.saveShared) return;
      const n = items.files.length;
      this.openModal(`
        <h3>Save ${n === 1 ? 'song' : `${n} songs`} to ReelBox</h3>
        <ul class="share-list">${items.files
          .slice(0, 8)
          .map((f) => `<li>${icons.note}<span>${esc(f.name)}</span></li>`)
          .join('')}${n > 8 ? `<li class="more">and ${n - 8} more</li>` : ''}</ul>
        <form>
          ${this.folderSelectHtml()}
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-a="modal-close">Cancel</button>
            <button type="submit" class="btn btn-red">Save</button>
          </div>
        </form>`);
      this.onModalSubmit = (form) => {
        const folder = this.pickedFolder(form);
        if (!folder) return false;
        this.rememberFolder(folder);
        this.closeModal();
        this.saveShared(items.files.map((f) => f.id), folder);
      };
    };
    if (this.route.view === 'tab' && this.route.tab === 'music' && !this.route.np && !this.route.info) {
      show();
      return;
    }
    // Go to the Music tab first; a route change closes modals, so open it after.
    window.addEventListener('hashchange', () => setTimeout(show), { once: true });
    if (this.player.isOpen || (this.route.view === 'tab' && (this.route.np || this.route.info))) {
      history.replaceState(null, '', '#/music');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      this.go('#/music');
    }
  }

  private async saveShared(ids: string[], folder: string) {
    this.toast(`Saving ${ids.length === 1 ? 'song' : `${ids.length} songs`}…`, 0);
    try {
      const r = await this.source.saveShared!(ids, folder);
      await this.reloadMusic();
      if (!r.saved) {
        this.toast(r.error || "Couldn't save that.", 6000);
        return;
      }
      const msg = `Saved ${r.saved === 1 ? '1 song' : `${r.saved} songs`}${r.failed ? ` (${r.failed} couldn't be saved)` : ''}`;
      this.afterSave(msg, r.folder);
    } catch (err) {
      this.toast((err as Error).message || "Couldn't save that.", 6000);
    }
  }

  /** "Add to…": Liked Songs, any of your playlists, or a new one. */
  private openPicker(ids: string[]) {
    if (!ids.length) return;
    this.picking = ids;
    const lists = [this.likedPlaylist(), ...this.madePlaylists()];
    this.openModal(`
      <h3>Add ${ids.length === 1 ? esc(this.songById.get(ids[0])?.title ?? 'song') : `${ids.length} songs`} to</h3>
      <div class="pick-list">
        <button class="pick" data-a="pick-new"><span class="cover cover-new pick-cover">${icons.plus}</span><span class="pl-text"><strong>New playlist</strong></span></button>
        ${lists
          .map(
            (pl) => `
          <button class="pick" data-a="pick-pl" data-pl="${esc(pl.id)}">
            ${this.coverHtml(pl, 'pick-cover')}
            <span class="pl-text"><strong>${esc(pl.name)}</strong><small>${this.songCount(pl.songs.length)}</small></span>
          </button>`,
          )
          .join('')}
      </div>
      <div class="modal-actions"><button class="btn btn-ghost" data-a="modal-close">Cancel</button></div>`);
  }
}
