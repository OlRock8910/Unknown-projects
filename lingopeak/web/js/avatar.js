// Your own character: skin, hair, a hat, a top and trousers. Five of each
// to start with, and five more of each to buy in the shop.
//
// A look is { skin, hair, hairColor, hat, top, pants } and is drawn as one
// SVG (flat colours, navy outlines, like the cast).

const INK = '#1B1D2A';
const SKINS = ['#F6D2B4', '#E8B48F', '#C68B62', '#8D5A3B', '#5E3A24'];
const HAIR_COLORS = ['#1B1D2A', '#5A3825', '#E3B04B', '#C4622D', '#2F5BEA'];
const HAIR_STYLES = ['short', 'long', 'curly', 'bun', 'spiky'];

// Wardrobe: the first five of each are free.
const WARDROBE = {
  hat: [
    { id: 'none' }, { id: 'cap', c: '#2F5BEA' }, { id: 'beanie', c: '#FF5A4E' }, { id: 'bucket', c: '#FFC531' }, { id: 'headphones', c: '#1B1D2A' },
    { id: 'crown', c: '#FFC531', cost: 400 }, { id: 'cowboy', c: '#B9772F', cost: 250 }, { id: 'party', c: '#FF5A4E', cost: 150 }, { id: 'chef', c: '#FFFFFF', cost: 200 }, { id: 'viking', c: '#9A9DAB', cost: 350 },
  ],
  top: [
    { id: 'tee-blue', c: '#2F5BEA' }, { id: 'tee-coral', c: '#FF5A4E' }, { id: 'tee-yellow', c: '#FFC531' }, { id: 'tee-white', c: '#F2F1EC', stripe: '#2F5BEA' }, { id: 'hoodie', c: '#2A2E44', hood: true },
    { id: 'stripes', c: '#F2F1EC', stripes: '#2F5BEA', cost: 150 }, { id: 'star', c: '#2F5BEA', star: '#FFC531', cost: 200 }, { id: 'football', c: '#FF5A4E', collar: '#F2F1EC', cost: 250 },
    { id: 'bolt', c: '#1B1D2A', bolt: '#FFC531', cost: 300 }, { id: 'gold', c: '#FFC531', collar: '#D99A00', shine: true, cost: 500 },
  ],
  pants: [
    { id: 'jeans', c: '#3B5BB5' }, { id: 'navy', c: '#2A2E44' }, { id: 'khaki', c: '#C8B08A' }, { id: 'shorts', c: '#FF5A4E', short: true }, { id: 'joggers', c: '#9A9DAB' },
    { id: 'yellow', c: '#FFC531', cost: 150 }, { id: 'check', c: '#2F5BEA', check: '#5B7FF0', cost: 200 }, { id: 'track', c: '#1B1D2A', side: '#F2F1EC', cost: 250 },
    { id: 'green', c: '#4E7238', cost: 150 }, { id: 'goldpants', c: '#FFC531', shine: true, cost: 450 },
  ],
};
const DEFAULT_LOOK = { skin: 1, hair: 0, hairColor: 1, hat: 'none', top: 'tee-blue', pants: 'jeans' };
const itemOf = (slot, id) => WARDROBE[slot].find((x) => x.id === id) || WARDROBE[slot][0];
const ownsItem = (slot, it) => !it.cost || (Store.data.wardrobe || []).includes(`${slot}:${it.id}`);
const myLook = () => ({ ...DEFAULT_LOOK, ...((Store.data.profile && Store.data.profile.look) || {}) });

let avatarSeq = 0;
// The character as SVG markup. crop: 'full' | 'head'.
function lookSvg(look, crop = 'full') {
  const L = { ...DEFAULT_LOOK, ...(look || {}) };
  const id = 'av' + avatarSeq++;
  const skin = SKINS[L.skin] || SKINS[1];
  const hairC = HAIR_COLORS[L.hairColor] || HAIR_COLORS[1];
  const top = itemOf('top', L.top), pants = itemOf('pants', L.pants), hat = itemOf('hat', L.hat);
  const o = `stroke="${INK}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;
  const style = HAIR_STYLES[L.hair] || 'short';

  // Hair that goes behind the head.
  const hairBack = style === 'long' ? `<path d="M36 40 Q36 18 60 18 Q84 18 84 40 L86 76 Q72 82 60 78 Q48 82 34 76Z" fill="${hairC}" ${o}/>`
    : style === 'curly' ? [[40, 30], [50, 22], [62, 19], [74, 24], [82, 34], [38, 44], [84, 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="${hairC}" ${o}/>`).join('') : '';
  // Hair on top of the head.
  const hairTop = {
    short: `<path d="M37 42 Q36 18 60 18 Q84 18 83 42 Q78 30 64 29 Q56 33 46 31 Q40 34 37 42Z" fill="${hairC}" ${o}/>`,
    long: `<path d="M38 44 Q38 20 60 20 Q82 20 82 44 Q76 30 60 31 Q44 30 38 44Z" fill="${hairC}" ${o}/>`,
    curly: `<path d="M40 38 Q48 26 60 30 Q72 26 80 38 Q74 31 60 34 Q46 31 40 38Z" fill="${hairC}" ${o}/>`,
    bun: `<circle cx="60" cy="14" r="8" fill="${hairC}" ${o}/><path d="M37 42 Q36 20 60 20 Q84 20 83 42 Q76 31 60 31 Q44 31 37 42Z" fill="${hairC}" ${o}/>`,
    spiky: `<path d="M37 42 L36 26 L44 30 L46 16 L54 26 L60 12 L66 26 L74 16 L76 30 L84 26 L83 42 Q76 32 60 32 Q44 32 37 42Z" fill="${hairC}" ${o}/>`,
  }[style];

  // Hats.
  const hats = {
    none: '',
    cap: `<path d="M37 34 Q38 14 60 14 Q82 14 83 34Z" fill="${hat.c}" ${o}/><path d="M60 34 L96 34 Q96 40 88 40 L60 38Z" fill="${hat.c}" ${o}/><circle cx="60" cy="14" r="3" fill="${INK}"/>`,
    beanie: `<path d="M36 36 Q36 12 60 12 Q84 12 84 36Z" fill="${hat.c}" ${o}/><rect x="34" y="31" width="52" height="9" rx="4" fill="${hat.c}" ${o}/><circle cx="60" cy="10" r="6" fill="#F2F1EC" ${o}/>`,
    bucket: `<path d="M42 32 L46 14 Q60 10 74 14 L78 32Z" fill="${hat.c}" ${o}/><path d="M30 34 Q60 26 90 34 L86 38 Q60 32 34 38Z" fill="${hat.c}" ${o}/>`,
    headphones: `<path d="M36 44 Q34 14 60 14 Q86 14 84 44" fill="none" stroke="${INK}" stroke-width="5"/><rect x="30" y="38" width="10" height="16" rx="4" fill="#FF5A4E" ${o}/><rect x="80" y="38" width="10" height="16" rx="4" fill="#FF5A4E" ${o}/>`,
    crown: `<path d="M40 30 L40 12 L50 22 L60 8 L70 22 L80 12 L80 30Z" fill="${hat.c}" ${o}/><circle cx="60" cy="22" r="3" fill="#FF5A4E"/>`,
    cowboy: `<path d="M44 30 L46 12 Q60 6 74 12 L76 30Z" fill="${hat.c}" ${o}/><path d="M24 30 Q30 38 60 34 Q90 38 96 30 Q88 26 60 28 Q32 26 24 30Z" fill="${hat.c}" ${o}/><rect x="45" y="24" width="30" height="5" fill="${INK}"/>`,
    party: `<path d="M46 30 L60 0 L74 30Z" fill="${hat.c}" ${o}/><path d="M50 22 L70 22 M54 13 L66 13" stroke="#FFC531" stroke-width="3"/><circle cx="60" cy="1" r="4" fill="#FFC531" ${o}/>`,
    chef: `<rect x="44" y="20" width="32" height="14" fill="#FFFFFF" ${o}/><circle cx="48" cy="16" r="9" fill="#FFFFFF" ${o}/><circle cx="60" cy="11" r="11" fill="#FFFFFF" ${o}/><circle cx="72" cy="16" r="9" fill="#FFFFFF" ${o}/><rect x="45" y="18" width="30" height="10" fill="#FFFFFF"/>`,
    viking: `<path d="M38 34 Q38 12 60 12 Q82 12 82 34Z" fill="${hat.c}" ${o}/><path d="M38 28 Q24 24 26 8 Q32 20 42 22Z M82 28 Q96 24 94 8 Q88 20 78 22Z" fill="#F2F1EC" ${o}/><rect x="36" y="30" width="48" height="6" rx="3" fill="#B9772F" ${o}/>`,
  }[hat.id] || '';

  // Clothes.
  const tf = top.c;
  const topExtra = (top.stripes ? [80, 90, 100, 110].map((y) => `<rect x="30" y="${y}" width="60" height="5" fill="${top.stripes}"/>`).join('') : '')
    + (top.stripe ? `<rect x="30" y="92" width="60" height="7" fill="${top.stripe}"/>` : '')
    + (top.star ? `<path d="M60 84 l4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1z" fill="${top.star}" ${o}/>` : '')
    + (top.bolt ? `<path d="M64 82 L52 100 H60 L56 114 L70 94 H62Z" fill="${top.bolt}" ${o}/>` : '')
    + (top.collar ? `<path d="M50 72 L60 84 L70 72" fill="none" stroke="${top.collar}" stroke-width="5"/>` : '')
    + (top.hood ? `<path d="M46 72 Q60 84 74 72" fill="none" stroke="${INK}" stroke-width="2.6"/><path d="M56 80 L56 92 M64 80 L64 92" stroke="#F2F1EC" stroke-width="2.5"/>` : '')
    + (top.shine ? `<path d="M40 82 L46 78 M40 90 L52 80" stroke="#FFF3D1" stroke-width="3"/>` : '');
  const pf = pants.c;
  const legBottom = pants.short ? 134 : 150;
  const pantsExtra = (pants.side ? `<path d="M42 118 L42 150 M78 118 L78 150" stroke="${pants.side}" stroke-width="3"/>` : '')
    + (pants.check ? [124, 136].map((y) => `<path d="M40 ${y} H80" stroke="${pants.check}" stroke-width="3"/>`).join('') + `<path d="M49 118 V150 M71 118 V150" stroke="${pants.check}" stroke-width="3"/>` : '')
    + (pants.shine ? `<path d="M44 124 L48 120" stroke="#FFF3D1" stroke-width="3"/>` : '');

  const clip = `<clipPath id="${id}t"><path d="M36 72 Q60 66 84 72 L86 118 L34 118Z"/></clipPath><clipPath id="${id}p"><path d="M38 114 H82 L82 ${legBottom} H62 L60 124 L58 ${legBottom} H38Z"/></clipPath>`;
  const vb = crop === 'head' ? '22 2 76 76' : '0 0 120 170';
  return `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg"><defs>${clip}</defs>
    ${hairBack}
    <!-- legs and shoes -->
    ${pants.short ? `<rect x="42" y="128" width="12" height="22" fill="${skin}" ${o}/><rect x="66" y="128" width="12" height="22" fill="${skin}" ${o}/>` : ''}
    <path d="M38 114 H82 L82 ${legBottom} H62 L60 124 L58 ${legBottom} H38Z" fill="${pf}" ${o}/>
    <g clip-path="url(#${id}p)">${pantsExtra}</g>
    <ellipse cx="48" cy="155" rx="12" ry="6" fill="${INK}"/><ellipse cx="72" cy="155" rx="12" ry="6" fill="${INK}"/>
    <!-- arms -->
    <path d="M38 76 L28 108" stroke="${INK}" stroke-width="14" stroke-linecap="round"/><path d="M38 76 L28 108" stroke="${tf}" stroke-width="9" stroke-linecap="round"/>
    <path d="M82 76 L92 108" stroke="${INK}" stroke-width="14" stroke-linecap="round"/><path d="M82 76 L92 108" stroke="${tf}" stroke-width="9" stroke-linecap="round"/>
    <circle cx="27" cy="112" r="6" fill="${skin}" ${o}/><circle cx="93" cy="112" r="6" fill="${skin}" ${o}/>
    <!-- body -->
    <path d="M36 72 Q60 66 84 72 L86 118 L34 118Z" fill="${tf}" ${o}/>
    <g clip-path="url(#${id}t)">${topExtra}</g>
    <path d="M36 72 Q60 66 84 72 L86 118 L34 118Z" fill="none" ${o}/>
    <!-- head -->
    <rect x="54" y="60" width="12" height="10" fill="${skin}" ${o}/>
    <circle cx="60" cy="44" r="22" fill="${skin}" ${o}/>
    <circle cx="51" cy="45" r="2.8" fill="${INK}"/><circle cx="69" cy="45" r="2.8" fill="${INK}"/>
    <circle cx="46" cy="52" r="3.5" fill="#FF8A80" opacity=".45"/><circle cx="74" cy="52" r="3.5" fill="#FF8A80" opacity=".45"/>
    <path d="M53 53 Q60 59 67 53" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
    ${hairTop}
    ${hats}
  </svg>`;
}

// A round avatar of someone's character (just the head and shoulders).
function lookAvatar(look, cls = '') {
  return h('div', { class: 'avatar look ' + cls, html: lookSvg(look, 'head') });
}

// The character builder: pick skin, hair and clothes. onChange(look).
// In the shop, items you don't own show a price and can be bought.
function lookBuilder(look, onChange, { shop = false } = {}) {
  const L = { ...DEFAULT_LOOK, ...look };
  const wrap = h('div', { class: 'builder-wrap' });
  const preview = h('div', { class: 'look-preview' });
  const tabsEl = h('div', { class: 'seg wide' });
  const grid = h('div', { class: 'look-grid' });
  let tab = 'top';
  const draw = () => {
    preview.innerHTML = lookSvg(L);
    tabsEl.replaceChildren(...[['top', t('look.top')], ['pants', t('look.pants')], ['hat', t('look.hat')], ['hair', t('look.hair')], ['skin', t('look.skin')]].map(([k, label]) =>
      h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; Sfx.tap(); draw(); } }, label)));
    let items;
    if (tab === 'skin') items = SKINS.map((c, i) => ({ sel: L.skin === i, swatch: c, pick: () => { L.skin = i; } }));
    else if (tab === 'hair') {
      items = [
        ...HAIR_STYLES.map((s, i) => ({ sel: L.hair === i, svg: lookSvg({ ...L, hair: i, hat: 'none' }, 'head'), pick: () => { L.hair = i; } })),
        ...HAIR_COLORS.map((c, i) => ({ sel: L.hairColor === i, swatch: c, pick: () => { L.hairColor = i; } })),
      ];
    } else {
      items = WARDROBE[tab].map((it) => {
        const owned = ownsItem(tab, it);
        return {
          sel: L[tab] === it.id, owned, cost: it.cost,
          svg: lookSvg({ ...L, [tab]: it.id }, tab === 'hat' ? 'head' : 'full'),
          pick: () => {
            if (!owned) {
              if (!shop) { toast(t('look.inShop')); return false; }
              if (Store.data.coins < it.cost) { Sfx.bad(); toast(t('shop.short', { n: it.cost - Store.data.coins, cur: t('shop.coins') })); return false; }
              Store.data.coins -= it.cost;
              Store.data.wardrobe = [...(Store.data.wardrobe || []), `${tab}:${it.id}`];
              Sfx.coin();
              toast(t('look.bought'));
            }
            L[tab] = it.id;
          },
        };
      });
    }
    grid.replaceChildren(...items.map((it) => {
      const b = h('button', { class: 'look-item' + (it.sel ? ' on' : '') + (it.owned === false ? ' locked' + (Store.data.coins < it.cost ? ' poor' : ' can-buy') : '') },
        it.swatch ? h('span', { class: 'swatch', style: { background: it.swatch } }) : h('span', { class: 'look-thumb', html: it.svg }),
        it.owned === false ? h('span', { class: 'look-price' }, icon('coin'), fmtNum(it.cost)) : null);
      b.addEventListener('click', () => {
        if (it.pick() === false) return;
        Sfx.select();
        onChange({ ...L });
        draw();
        preview.classList.remove('bounce'); void preview.offsetWidth; preview.classList.add('bounce');
      });
      return b;
    }));
  };
  draw();
  wrap.append(preview, tabsEl, grid);
  return wrap;
}
