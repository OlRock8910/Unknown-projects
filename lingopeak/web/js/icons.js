// A small hand-drawn icon set (24×24, rounded strokes) so the app needs no
// emoji. icon('coin') returns an <svg>. Pictures from img/icons/<name>.png
// replace these where they exist (see art.js).
const ICON_PATHS = {
  mountain: '<path d="M2.5 19.5 9 8.5l3.2 5 2.3-3.5 7 9.5z"/><path d="m7.4 11.2 1.6 1.3 1.4-1.1"/>',
  dumbbell: '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3.5 3.5 0 0 0 3.6 4M16 6h3.5a3.5 3.5 0 0 1-3.6 4M12 13v4M8.5 20.5h7M9.5 17h5v3.5h-5z"/>',
  bag: '<path d="M5 8h14l-1 12.5H6zM9 8V6.5a3 3 0 0 1 6 0V8"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5.2a3.4 3.4 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.8c0-1.2 1.1-1.8 2.5-1.8s2.5.7 2.5 1.8-1 1.6-2.5 2.2-2.5 1-2.5 2.2 1.1 1.8 2.5 1.8 2.5-.6 2.5-1.8"/>',
  gem: '<path d="M7 4h10l4 5-9 11L3 9zM3 9h18M9.5 4 8 9l4 11 4-11-1.5-5"/>',
  flame: '<path d="M12 21c-4 0-6.5-2.6-6.5-6.2 0-3.6 3-5.6 3.5-9.3 2.6 1.4 3.8 3.6 3.8 5.6 1-.6 1.8-1.8 2-3.1 2 1.7 3.7 4.3 3.7 6.8 0 3.6-2.5 6.2-6.5 6.2z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  turtle: '<path d="M4 15.5c0-4 3.3-7 7.5-7s7.5 3 7.5 7z"/><path d="M19 13.5h1.5a1.5 1.5 0 0 0 0-3H19M6.5 15.5V18M16 15.5V18M8.5 8.8l3 6.7 3-6.7"/>',
  star: '<path d="m12 3.5 2.6 5.5 6 .7-4.4 4.1 1.1 5.9L12 16.8l-5.3 2.9 1.1-5.9-4.4-4.1 6-.7z"/>',
  crown: '<path d="M3.5 8 7.5 12 12 5.5 16.5 12l4-4-1.8 10.5H5.3z"/><path d="M5.5 21h13"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12v6.5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 2-2V12"/>',
  play: '<path d="M7.5 5v14l11-7z"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4.5H15"/>',
  book: '<path d="M4 5.5A2 2 0 0 1 6 3.5h13v15H6a2 2 0 0 0-2 2zM4 20.5a2 2 0 0 1 2-2h13v2H6"/>',
  cards: '<rect x="3.5" y="6.5" width="12" height="14" rx="2"/><path d="M8.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 20.5 5v11a1.5 1.5 0 0 1-1.5 1.5h-3.5"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14.5h8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  snowflake: '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4l2.5 2.5L14.5 4M9.5 20l2.5-2.5 2.5 2.5"/>',
  flag: '<path d="M5.5 21V3.5M5.5 4.5h11.5l-2.5 4 2.5 4H5.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
  sparkle: '<path d="M12 3c.6 4.2 2.4 6 6.5 6.5-4.1.6-5.9 2.4-6.5 6.5-.6-4.1-2.4-5.9-6.5-6.5C9.6 9 11.4 7.2 12 3zM18.5 15c.3 1.8 1 2.6 2.5 2.8-1.5.3-2.2 1-2.5 2.7-.3-1.7-1-2.4-2.5-2.7 1.5-.2 2.2-1 2.5-2.8z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5z"/>',
  swords: '<path d="M4 4l9 9M4 4h4l9 9M4 4v4l9 9M15 19l4-4M17.5 16.5l3 3M16 13.5l-2.5 2.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  hint: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
};
// The app's icon called name: the drawn picture from img/icons/ when there
// is one, otherwise the line icon (or the line icon called fallback).
function icon(name, cls = '', fallback = null) {
  if (typeof ART_FILES !== 'undefined' && ART_FILES.has(`icons/${name}.webp`)) {
    return h('img', { class: 'ic img ' + cls, src: `img/icons/${name}.webp`, alt: '', draggable: 'false' });
  }
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ic ' + cls);
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = ICON_PATHS[name] || ICON_PATHS[fallback] || ICON_PATHS.star;
  return s;
}
