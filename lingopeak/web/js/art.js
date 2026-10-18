// The cast, avatars, badges and mountain pictures. Drawn pictures live in
// img/ and are listed in ART_FILES (js/art-files.js, made by
// tools/list-art.py); anything not drawn yet gets a simple placeholder.

// The costume crew who talk to you in lessons.
// face: how far down the full-body picture the face is (0 = top), for avatars.
const CAST = [
  { id: 'banana', name: 'Benny', face: 0.27, suit: '#FFC531', trim: '#E0A800', skin: '#F2C29B', top: 'stem' },
  { id: 'shark', name: 'Shelly', face: 0.25, suit: '#5B7FF0', trim: '#2F5BEA', skin: '#8D5A3B', top: 'fin' },
  { id: 'dino', name: 'Rex', face: 0.31, suit: '#2F5BEA', trim: '#1F3FB0', skin: '#F6D2B4', top: 'spikes' },
  { id: 'astro', name: 'Nova', face: 0.18, suit: '#F2F1EC', trim: '#9A9DAB', skin: '#C68B62', top: 'antenna' },
  { id: 'penguin', name: 'Pip', face: 0.19, suit: '#1B1D2A', trim: '#3A3E52', skin: '#EBC3A0', top: 'none' },
  { id: 'bee', name: 'Bea', face: 0.27, suit: '#FFC531', trim: '#1B1D2A', skin: '#6E4128', top: 'antenna' },
  { id: 'pizza', name: 'Tony', face: 0.24, suit: '#FF5A4E', trim: '#FFC531', skin: '#F1C7A5', top: 'none' },
  { id: 'knight', name: 'Max', face: 0.24, suit: '#9A9DAB', trim: '#6B6F80', skin: '#D9A07A', top: 'plume' },
  { id: 'avocado', name: 'Ava', face: 0.27, suit: '#7BA05B', trim: '#4E7238', skin: '#A86B47', top: 'none' },
  { id: 'croissant', name: 'Coco', face: 0.24, suit: '#E8A85A', trim: '#B9772F', skin: '#F5CFAE', top: 'horns' },
];
const CAST_BY_ID = Object.fromEntries(CAST.map((c) => [c.id, c]));

// Avatars: the four starters are cast members; more can be bought.
const AVATARS = [
  ...CAST.map((c) => ({ id: c.id, cost: ['banana', 'shark', 'dino', 'astro'].includes(c.id) ? 0 : 300, cast: c })),
  ...[['cat', '#FF5A4E'], ['robot', '#9A9DAB'], ['wizard', '#2F5BEA'], ['pirate', '#1B1D2A'], ['frog', '#7BA05B'],
    ['viking', '#B9772F'], ['cactus', '#4E7238'], ['ghost', '#F2F1EC'], ['strawberry', '#FF5A4E'], ['alien', '#7BA05B']]
    .map(([id, suit], i) => ({ id, cost: 500 + i * 100, cast: { id, suit, trim: '#1B1D2A', skin: '#E8B996', top: i % 2 ? 'antenna' : 'none' } })),
];
const AVATAR_BY_ID = Object.fromEntries(AVATARS.map((a) => [a.id, a]));

// A picture from img/, or null when it hasn't been drawn yet.
function artImg(path, cls = '') {
  if (!ART_FILES.has(path)) return null;
  return h('img', { src: 'img/' + path, class: cls, alt: '', draggable: 'false' });
}

// A placeholder costume character drawn with shapes. mood: '', 'happy', 'sad'.
function castSvg(c, mood = '', viewBox = '0 0 100 120') {
  const tops = {
    stem: `<path d="M50 6c4 0 6 3 5 8l-4 6h-4l-2-6c-1-5 1-8 5-8z" fill="${c.trim}"/>`,
    fin: `<path d="M44 20 56 2l4 20z" fill="${c.trim}"/>`,
    spikes: `<path d="M30 24l6-12 6 10 8-14 8 14 6-10 6 12z" fill="${c.trim}"/>`,
    antenna: `<path d="M40 22 34 8M60 22l6-14" stroke="${c.trim}" stroke-width="3" stroke-linecap="round"/><circle cx="34" cy="7" r="4" fill="${c.trim}"/><circle cx="66" cy="7" r="4" fill="${c.trim}"/>`,
    plume: `<path d="M50 20c-2-10 4-16 12-16-4 4-4 10-6 16z" fill="#FF5A4E"/>`,
    horns: `<path d="M26 34c-6-6-4-14 2-16l6 12zM74 34c6-6 4-14-2-16l-6 12z" fill="${c.trim}"/>`,
    none: '',
  };
  const mouth = mood === 'happy' ? '<path d="M41 62q9 10 18 0" fill="#1B1D2A"/>' : mood === 'sad' ? '<path d="M42 66q8-6 16 0" stroke="#1B1D2A" stroke-width="3" fill="none" stroke-linecap="round"/>' : '<path d="M42 62q8 6 16 0" stroke="#1B1D2A" stroke-width="3" fill="none" stroke-linecap="round"/>';
  const arms = mood === 'happy' ? `<path d="M22 82 8 58M78 82l14-24" stroke="${c.suit}" stroke-width="10" stroke-linecap="round"/>` : `<path d="M22 84 14 104M78 84l8 20" stroke="${c.suit}" stroke-width="10" stroke-linecap="round"/>`;
  const svg = `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">
    ${tops[c.top] || ''}
    ${arms}
    <rect x="20" y="18" width="60" height="98" rx="30" fill="${c.suit}" stroke="#1B1D2A" stroke-width="3"/>
    <rect x="34" y="84" width="32" height="22" rx="10" fill="${c.trim}" opacity=".55"/>
    <circle cx="50" cy="54" r="19" fill="${c.skin}" stroke="#1B1D2A" stroke-width="3"/>
    <circle cx="43" cy="51" r="2.6" fill="#1B1D2A"/><circle cx="57" cy="51" r="2.6" fill="#1B1D2A"/>
    ${mood === 'sad' ? '<path d="M37 44l8 3M63 44l-8 3" stroke="#1B1D2A" stroke-width="2.5" stroke-linecap="round"/>' : ''}
    ${mouth}
  </svg>`;
  return h('div', { class: 'cast-svg', html: svg });
}

// A cast member, as a picture when there is one.
function castArt(id, mood = '', cls = '') {
  const c = CAST_BY_ID[id] || AVATAR_BY_ID[id]?.cast || CAST[0];
  const file = `cast/${c.id}${mood ? '-' + mood : ''}.webp`;
  return h('div', { class: 'cast ' + cls }, artImg(file) || artImg(`cast/${c.id}.webp`) || castSvg(c, mood));
}

// A round avatar (the head of a costume character).
function avatarArt(id, cls = '') {
  const a = AVATAR_BY_ID[id] || AVATARS[0];
  let pic = artImg(`avatars/${a.id}.webp`);
  if (!pic && ART_FILES.has(`cast/${a.id}.webp`)) {
    // Zoom a full-body cast picture in on the face.
    const [w, ht] = ART_SIZES[`cast/${a.id}.webp`];
    const zoom = 1.9, imgH = zoom * (ht / w);
    pic = artImg(`cast/${a.id}.webp`, 'from-cast');
    pic.style.width = zoom * 100 + '%';
    pic.style.marginTop = (0.5 - (a.cast.face || 0.25) * imgH) * 100 + '%';
  }
  return h('div', { class: 'avatar ' + cls, style: { '--suit': a.cast.suit } }, pic || castSvg(a.cast, '', '14 8 72 72'));
}

// A mountain's badge, earned when the mountain is complete.
function badgeArt(m, cls = '') {
  const i = LP_COURSE.indexOf(m);
  const pic = artImg(`badges/${m.id}.webp`);
  if (pic) return h('div', { class: 'badge pic ' + cls }, pic);
  const colours = ['var(--blue)', 'var(--yellow)', 'var(--coral)'];
  return h('div', { class: 'badge ' + cls, style: { '--b': colours[i % 3] } },
    h('div', { class: 'badge-peak', html: '<svg viewBox="0 0 40 40"><path d="M4 32 16 12l6 9 4-6 10 17z" fill="currentColor"/><path d="m16 12 3 4.5-3-1-3 1z" fill="#fff"/></svg>' }),
    h('span', {}, String(i + 1)));
}

// A mountain revealed after it's climbed.
function mountainArt(m, cls = '') {
  const pic = artImg(`mountains/${m.id}.webp`);
  if (pic) return h('div', { class: 'mtn-art ' + cls }, pic);
  const i = LP_COURSE.indexOf(m);
  const peak = 20 + (i % 4) * 4;
  return h('div', { class: 'mtn-art ' + cls, html: `<svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMax slice">
    <rect width="160" height="100" fill="var(--sky)"/>
    <circle cx="128" cy="24" r="10" fill="var(--yellow)"/>
    <path d="M-5 100 50 ${peak} 80 52 100 34 165 100z" fill="var(--blue)"/>
    <path d="M50 ${peak} 62 ${peak + 16} 55 ${peak + 13} 47 ${peak + 19} 41 ${peak + 14}z M100 34 108 44 101 42 95 46z" fill="#fff"/>
    <path d="M-5 100 30 70 60 100z" fill="var(--blue-d)"/>
    <path d="M50 ${peak} v-12 l10 4 -10 4" stroke="var(--ink)" stroke-width="1.5" fill="var(--coral)"/>
  </svg>` });
}
