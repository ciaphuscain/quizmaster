import data from '@/data/countries.json';
import { normalizeAnswer } from '@/utils/answers';

export type CountryMeta = {
  iso2: string; iso3: string; numeric: string | null; name: string; official: string; altSpellings: string[];
  region: string; subregion: string; capital: string[]; borders: string[]; landlocked: boolean;
  independent: boolean; unMember: boolean; disputed: boolean; latlng: [number, number]; area: number;
  emoji: string; geometryId: string | null;
};

export const COUNTRIES: CountryMeta[] = data as CountryMeta[];
const BY_ISO3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));
const BY_GEOM = new Map(COUNTRIES.filter((c) => c.geometryId).map((c) => [c.geometryId as string, c]));

export const getCountry = (iso3: string | null | undefined) => (iso3 ? BY_ISO3.get(iso3) : undefined);
export const countryByGeometryId = (id: string) => BY_GEOM.get(id);

export type CountryStatus = 'sovereign' | 'dependent' | 'disputed';
export function countryStatus(c: CountryMeta): CountryStatus {
  if (c.disputed) return 'disputed';
  return c.independent ? 'sovereign' : 'dependent';
}

export function searchCountries(query: string, opts: { requireGeometry?: boolean; limit?: number } = {}): CountryMeta[] {
  const q = normalizeAnswer(query);
  const list = opts.requireGeometry ? COUNTRIES.filter((c) => c.geometryId) : COUNTRIES;
  if (!q) return list.slice(0, opts.limit ?? list.length);
  const scored: [number, CountryMeta][] = [];
  for (const c of list) {
    const name = normalizeAnswer(c.name);
    let score = -1;
    if (name === q || c.iso3.toLowerCase() === q || c.iso2.toLowerCase() === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (c.altSpellings.some((a) => normalizeAnswer(a).includes(q))) score = 40;
    if (score >= 0) scored.push([score, c]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
  return scored.slice(0, opts.limit ?? scored.length).map((s) => s[1]);
}

/** Land-border neighbours from the validated adjacency dataset. Never fabricated. */
export function getLandNeighbors(iso3: string): CountryMeta[] {
  const c = BY_ISO3.get(iso3);
  if (!c) return [];
  return c.borders.map((b) => BY_ISO3.get(b)).filter((x): x is CountryMeta => !!x);
}

export function hasLandBorders(iso3: string): boolean {
  return (BY_ISO3.get(iso3)?.borders.length ?? 0) > 0;
}

/** Great-circle distance in km between country reference points. */
export function distanceKm(a: CountryMeta, b: CountryMeta): number {
  const R = 6371, rad = Math.PI / 180;
  const [la1, lo1] = a.latlng, [la2, lo2] = b.latlng;
  const dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * For countries without land borders: nearest countries by reference-point distance.
 * These are explicitly labelled "nearby" — they are NOT neighbours.
 */
export function nearbyCountries(iso3: string, count = 5): CountryMeta[] {
  const c = BY_ISO3.get(iso3);
  if (!c) return [];
  return COUNTRIES.filter((o) => o.iso3 !== iso3 && o.geometryId)
    .map((o) => [distanceKm(c, o), o] as const)
    .sort((a, b) => a[0] - b[0])
    .slice(0, count)
    .map((x) => x[1]);
}

export function countryAliases(c: CountryMeta): string[] {
  return [c.official, ...c.altSpellings].filter((a, i, arr) => a && a !== c.name && arr.indexOf(a) === i).slice(0, 8);
}

/** Flag SVGs from the MIT-licensed flag-icons package, bundled locally for offline use. */
const flagUrls4x3 = import.meta.glob('/node_modules/flag-icons/flags/4x3/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
const flagUrls1x1 = import.meta.glob('/node_modules/flag-icons/flags/1x1/*.svg', { query: '?url', import: 'default', eager: true }) as Record<string, string>;
export function flagUrl(iso2: string, aspect: '4x3' | '1x1' = '4x3'): string | undefined {
  const k = iso2.toLowerCase();
  return aspect === '4x3' ? flagUrls4x3[`/node_modules/flag-icons/flags/4x3/${k}.svg`] : flagUrls1x1[`/node_modules/flag-icons/flags/1x1/${k}.svg`];
}
