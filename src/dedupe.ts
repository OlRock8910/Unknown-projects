import type { Song, Video } from './types';

/**
 * Finds copies of the same video or song, so the app can show each once.
 * Nothing is deleted; the copies are just left out of the lists.
 */

/** "Beach day (1)", "beach_day - Copy" and "Beach Day" all compare equal. */
export function normTitle(t: string) {
  return t
    .toLowerCase()
    .replace(/\.(mp3|m4a|aac|flac|ogg|oga|opus|wav|wma|mp4|mkv|webm|mov|3gp)$/, '')
    .replace(/\s*[([](\d{1,3}|copy)[)\]]\s*$/, '')
    .replace(/\s*-\s*copy(\s*\d+)?$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Names like "Song (1)" or "Video - Copy" are the copy, not the original. */
function looksLikeCopy(t: string) {
  return /[([](\d{1,3}|copy)[)\]]\s*(\.\w+)?$|-\s*copy(\s*\d+)?(\.\w+)?$/i.test(t) ? 1 : 0;
}

export interface Deduped<T> {
  /** One of each, in the original order. */
  kept: T[];
  /** Hidden copy's id → the id of the one that is shown. */
  hidden: Map<string, string>;
}

/**
 * Walks items in order of preference; each one is hidden if `same` matches
 * something already kept in its group.
 */
function dedupe<T extends { id: string }>(
  items: T[],
  group: (x: T) => string,
  same: (a: T, b: T) => boolean,
  better: (a: T, b: T) => number,
): Deduped<T> {
  const keptByGroup = new Map<string, T[]>();
  const hidden = new Map<string, string>();
  for (const item of [...items].sort(better)) {
    const g = group(item);
    const kept = keptByGroup.get(g) ?? [];
    const twin = kept.find((k) => same(k, item));
    if (twin) hidden.set(item.id, twin.id);
    else keptByGroup.set(g, [...kept, item]);
  }
  return { kept: items.filter((x) => !hidden.has(x.id)), hidden };
}

/**
 * Same song: same title and artist (ignoring "(1)", case and punctuation)
 * and the same length to within 2 seconds, so a remix or live version with
 * the same name stays.
 *
 * `pinned` (liked, in a playlist, playing) are kept in preference; then the
 * bigger file, which is usually the better quality; then the older one.
 */
export function dedupeSongs(songs: Song[], pinned: Set<string>): Deduped<Song> {
  return dedupe(
    songs,
    (s) => `${normTitle(s.title)}|${normTitle(s.artist)}`,
    (a, b) => (a.duration && b.duration ? Math.abs(a.duration - b.duration) <= 2 : a.size === b.size),
    (a, b) =>
      Number(pinned.has(b.id)) - Number(pinned.has(a.id)) ||
      looksLikeCopy(a.title) - looksLikeCopy(b.title) ||
      b.size - a.size ||
      a.addedAt - b.addedAt,
  );
}

/**
 * Same video: same picture size and length (to within a second), and either
 * the identical file size (a straight copy) or the same name.
 *
 * Pinned ones (in My List, partly watched) are kept first, then the oldest,
 * which is the original rather than the copy.
 */
export function dedupeVideos(videos: Video[], pinned: Set<string>): Deduped<Video> {
  return dedupe(
    videos,
    (v) => `${v.width}x${v.height}`,
    (a, b) =>
      Math.abs(a.duration - b.duration) <= 1 && (a.size === b.size || normTitle(a.title) === normTitle(b.title)),
    (a, b) =>
      Number(pinned.has(b.id)) - Number(pinned.has(a.id)) ||
      looksLikeCopy(a.title) - looksLikeCopy(b.title) ||
      a.addedAt - b.addedAt,
  );
}
