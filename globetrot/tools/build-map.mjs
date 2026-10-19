// Turns Natural Earth's 1:50m country shapes (public domain) into the
// ready-projected SVG paths in web/js/world.js, so the app needs no map
// library and no internet. The output is committed; re-run this only to
// change the map.
//
//   cd globetrot
//   npm install --no-save mapshaper@0.6 d3-geo@3
//   node tools/build-map.mjs [ne_50m_admin_0_countries.geojson]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mapshaper from 'mapshaper';
import { geoNaturalEarth1, geoPath, geoGraticule10, geoArea } from 'd3-geo';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'web', 'js', 'world.js');
const SRC_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
const W = 2000; // map units across; the app scales this to the screen
const R_KM2 = 6371 ** 2; // geoArea gives steradians

// The 193 UN members plus the two observer states. Everything else on the
// map (Greenland, Puerto Rico, Taiwan, Kosovo…) counts as a territory.
const UN = `AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN
BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ
ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT
JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX
FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA
RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ
TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW VA PS`.split(/\s+/);

// Shapes Natural Earth splits off that a traveller would count as part of a country.
const MERGE = { Somaliland: 'SO', 'N. Cyprus': 'CY', 'Indian Ocean Ter.': 'AU', 'Ashmore and Cartier Is.': 'AU' };
// Drawn as land but not tappable.
const NO_ID = new Set(['Siachen Glacier']);

const NAMES = {
  CN: 'China', US: 'United States', CI: "Côte d'Ivoire", TL: 'Timor-Leste', VA: 'Vatican City',
  GS: 'South Georgia', HM: 'Heard & McDonald Islands', TF: 'French Southern Lands', IO: 'British Indian Ocean Territory',
  BA: 'Bosnia and Herzegovina', CF: 'Central African Republic', DO: 'Dominican Republic', GQ: 'Equatorial Guinea',
  KN: 'Saint Kitts and Nevis', VC: 'Saint Vincent and the Grenadines', AG: 'Antigua and Barbuda', ST: 'São Tomé and Príncipe',
  SZ: 'Eswatini', MK: 'North Macedonia', PS: 'Palestine', EH: 'Western Sahara', CZ: 'Czechia', CV: 'Cape Verde',
};
const CONTINENT_FIX = { CY: 'Europe' }; // an EU member; most travellers file it under Europe
const OCEAN_TO = { Africa: 'Africa', Asia: 'Asia', Americas: 'South America', Oceania: 'Oceania', Europe: 'Europe' };

async function source() {
  const arg = process.argv[2];
  if (arg) return fs.readFileSync(arg, 'utf8');
  const cached = path.join(os.tmpdir(), 'ne_50m_admin_0_countries.geojson');
  if (!fs.existsSync(cached)) {
    console.log('downloading Natural Earth countries…');
    const res = await fetch(SRC_URL);
    if (!res.ok) throw new Error(`download failed: ${res.status}`);
    fs.writeFileSync(cached, await res.text());
  }
  return fs.readFileSync(cached, 'utf8');
}

const raw = JSON.parse(await source());
const meta = new Map();
for (const f of raw.features) {
  const p = f.properties;
  let id = MERGE[p.NAME] || (NO_ID.has(p.NAME) ? 'ZZ' : p.ISO_A2_EH);
  if (!/^[A-Z]{2}$/.test(id)) throw new Error(`no code for ${p.NAME}`);
  f.properties = { id };
  if (id === 'ZZ' || MERGE[p.NAME]) continue;
  if (meta.has(id)) throw new Error(`duplicate ${id}: ${p.NAME}`);
  let continent = CONTINENT_FIX[id] || p.CONTINENT;
  if (continent.startsWith('Seven seas')) continent = OCEAN_TO[p.REGION_UN];
  const sovereign = p.SOVEREIGNT !== p.ADMIN && !UN.includes(id) ? p.SOVEREIGNT : '';
  meta.set(id, {
    id,
    name: NAMES[id] || p.NAME_EN,
    continent,
    sovereign: sovereign === 'United States of America' ? 'United States' : sovereign,
    label: [p.LABEL_X, p.LABEL_Y],
  });
}
for (const id of UN) if (!meta.has(id)) throw new Error(`UN member ${id} missing from the map`);
if (new Set(UN).size !== 195) throw new Error(`UN list has ${new Set(UN).size} codes`);

// Merge split shapes, then thin the outlines. "weighted" Visvalingam keeps
// coastlines natural-looking; keep-shapes stops small islands vanishing.
const out = await mapshaper.applyCommands(
  '-i in.json -dissolve2 id -simplify 12% weighted keep-shapes -clean -o out.json format=geojson precision=0.0001',
  { 'in.json': JSON.stringify(raw) },
);
const geo = JSON.parse(out['out.json']);

// d3-geo works on the sphere, where a ring wound the "wrong" way means
// everything except the shape. Flip any polygon that claims over half the globe.
for (const f of geo.features) {
  const g = f.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const rings of polys) {
    if (geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI) for (const r of rings) r.reverse();
  }
}

const projection = geoNaturalEarth1().fitWidth(W, { type: 'Sphere' });
const pathFn = geoPath(projection).digits(1);
const sphereBounds = pathFn.bounds({ type: 'Sphere' });
const H = Math.ceil(sphereBounds[1][1]);
const r1 = (n) => Math.round(n * 10) / 10;

const countries = [];
let land = '';
for (const f of geo.features) {
  const id = f.properties.id;
  const d = pathFn(f);
  if (id === 'ZZ') { land += d; continue; }
  const m = meta.get(id);
  const [[x0, y0], [x1, y1]] = pathFn.bounds(f);
  const [lx, ly] = projection(m.label);
  countries.push({
    id,
    n: m.name,
    c: m.continent,
    ...(m.sovereign ? { s: m.sovereign } : {}),
    ...(UN.includes(id) ? { u: 1 } : {}),
    a: Math.round(geoArea(f) * R_KM2),
    l: [r1(lx), r1(ly)],
    b: [r1(x0), r1(y0), r1(x1), r1(y1)],
    d,
  });
}
countries.sort((a, b) => a.n.localeCompare(b.n));

const world = {
  w: W,
  h: H,
  sphere: pathFn({ type: 'Sphere' }),
  grid: pathFn(geoGraticule10()),
  land,
  countries,
};
const js = `// Generated by tools/build-map.mjs from Natural Earth 1:50m (public domain). Do not edit.
// Natural Earth projection, ${W}×${H} map units. id: ISO 3166 code, n: name, c: continent,
// s: governed by, u: UN member or observer, a: area km², l: label point, b: bounds, d: SVG path.
const WORLD = ${JSON.stringify(world)};
`;
fs.writeFileSync(OUT, js);
console.log(`${countries.length} countries and territories, ${countries.filter((c) => c.u).length} UN → ${path.relative(process.cwd(), OUT)} (${(js.length / 1024).toFixed(0)} KB)`);
