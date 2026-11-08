// Generates src/data/countries.json from the `world-countries` dataset (ODbL, mledoze/countries)
// and validates it against Natural Earth geometry shipped in `world-atlas` (public domain / ISC).
// Run: node scripts/build-countries.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const countries = require('world-countries');
const topo = require('world-atlas/countries-50m.json');

// Natural Earth features that carry no ISO numeric id but map to a metadata entry.
const NAME_TO_ISO3 = { Kosovo: 'UNK' };
// Territories whose sovereignty is disputed (documented scope, see DECISIONS.md).
const DISPUTED = new Set(['UNK', 'ESH', 'TWN', 'PSE']);
// Documented corrections to the upstream adjacency data (land borders only).
// Sri Lanka and India share a maritime boundary, not a land border.
const REMOVE_BORDERS = { LKA: ['IND'] };

const geoById = new Map();
for (const g of topo.objects.countries.geometries) {
  const key = g.id ?? `name:${g.properties.name}`;
  geoById.set(key, g);
}

const out = countries
  .map((c) => {
    let geometryId = geoById.has(c.ccn3) ? c.ccn3 : null;
    for (const [name, iso3] of Object.entries(NAME_TO_ISO3)) if (iso3 === c.cca3) geometryId = `name:${name}`;
    return {
      iso2: c.cca2,
      iso3: c.cca3,
      numeric: c.ccn3 || null,
      name: c.name.common,
      official: c.name.official,
      altSpellings: [...new Set([c.name.official, ...c.altSpellings.filter((s) => s.length > 2)])].filter((s) => s !== c.name.common),
      region: c.region,
      subregion: c.subregion || '',
      capital: c.capital ?? [],
      borders: (c.borders ?? []).filter((b) => !(REMOVE_BORDERS[c.cca3] ?? []).includes(b)),
      landlocked: !!c.landlocked,
      independent: !!c.independent,
      unMember: !!c.unMember,
      disputed: DISPUTED.has(c.cca3),
      latlng: c.latlng,
      area: c.area,
      emoji: c.flag,
      geometryId,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// Validate adjacency symmetry; the dataset should be symmetric. Report anomalies.
const byIso3 = new Map(out.map((c) => [c.iso3, c]));
const problems = [];
for (const c of out)
  for (const b of c.borders) {
    const n = byIso3.get(b);
    if (!n) problems.push(`${c.iso3} borders unknown ${b}`);
    else if (!n.borders.includes(c.iso3)) problems.push(`asymmetric ${c.iso3}->${b}`);
  }
if (problems.length) console.warn('Adjacency anomalies:', problems);
fs.writeFileSync(new URL('../src/data/countries.json', import.meta.url), JSON.stringify(out));
console.log(`Wrote ${out.length} countries; ${out.filter((c) => c.geometryId).length} with geometry.`);
