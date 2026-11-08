import { describe, expect, it } from 'vitest';
import { COUNTRIES, getCountry, getLandNeighbors, hasLandBorders, nearbyCountries, searchCountries, countryStatus } from '../countries';
import { buildGeoData, filterIslands, partCount } from '../geo';
import topo from 'world-atlas/countries-50m.json';
import type { Topology } from 'topojson-specification';

describe('country dataset', () => {
  it('covers ~250 countries/territories with unique ISO codes', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(240);
    expect(new Set(COUNTRIES.map((c) => c.iso3)).size).toBe(COUNTRIES.length);
  });
  it('search finds by name, alias and code', () => {
    expect(searchCountries('germ')[0].iso3).toBe('DEU');
    expect(searchCountries('FRA')[0].iso3).toBe('FRA');
    expect(searchCountries('Holland').map((c) => c.iso3)).toContain('NLD');
  });
  it('land neighbours are real and symmetric', () => {
    const fr = getLandNeighbors('FRA').map((c) => c.iso3);
    expect(fr).toEqual(expect.arrayContaining(['BEL', 'DEU', 'ESP', 'ITA', 'CHE', 'LUX', 'AND', 'MCO']));
    for (const c of COUNTRIES) for (const b of c.borders) expect(getCountry(b)?.borders).toContain(c.iso3);
  });
  it('handles countries with no land borders explicitly', () => {
    expect(hasLandBorders('ISL')).toBe(false);
    expect(hasLandBorders('AUS')).toBe(false);
    expect(hasLandBorders('LKA')).toBe(false); // corrected: maritime boundary only with India
    expect(getLandNeighbors('JPN')).toEqual([]);
    const near = nearbyCountries('ISL', 3);
    expect(near).toHaveLength(3);
    expect(near.map((c) => c.iso3)).not.toContain('ISL');
  });
  it('classifies status', () => {
    expect(countryStatus(getCountry('GRL')!)).toBe('dependent');
    expect(countryStatus(getCountry('UNK')!)).toBe('disputed');
    expect(countryStatus(getCountry('FRA')!)).toBe('sovereign');
  });
});

describe('geometry', () => {
  const geo = buildGeoData(topo as unknown as Topology);
  it('links metadata to Natural Earth geometry', () => {
    const missing = COUNTRIES.filter((c) => c.geometryId && !geo.byId.has(c.geometryId));
    expect(missing).toEqual([]);
    expect(geo.byId.get(getCountry('UNK')!.geometryId!)).toBeTruthy();
  });
  it('filters disjoint islands of multipolygon countries', () => {
    const fr = geo.byId.get(getCountry('FRA')!.geometryId!)!;
    expect(partCount(fr)).toBeGreaterThan(1);
    expect(partCount(filterIslands(fr, 'mainland'))).toBe(1);
    const near = partCount(filterIslands(fr, 'near'));
    expect(near).toBeLessThan(partCount(fr)); // French Guiana etc. dropped
    expect(near).toBeGreaterThanOrEqual(2); // Corsica kept
  });
});
