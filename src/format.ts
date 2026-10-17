const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** File names come from the user's phone, so everything shown is escaped. */
export function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** 75 → "1m", 3725 → "1h 2m", 40 → "40s". */
export function length(seconds: number) {
  const s = Math.round(seconds || 0);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function bytes(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}

export function date(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "4K", "HD"... from the short side, which is right for portrait clips too. */
export function quality(w: number, h: number) {
  const short = Math.min(w, h);
  if (short >= 2000) return '4K';
  if (short >= 1000) return 'Full HD';
  if (short >= 700) return 'HD';
  return short ? 'SD' : '';
}
