import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';
import { feature } from 'topojson-client';
import { geoArea, geoBounds } from 'd3-geo';
import type { Topology, GeometryCollection } from 'topojson-specification';

export type CountryFeature = Feature<Polygon | MultiPolygon, { name: string }> & { id?: string };
export type GeoData = { byId: Map<string, CountryFeature>; all: CountryFeature[] };

let cache: Promise<GeoData> | null = null;

export function buildGeoData(topo: Topology): GeoData {
  const fc = feature(topo, topo.objects.countries as GeometryCollection) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
  const byId = new Map<string, CountryFeature>();
  const all: CountryFeature[] = [];
  for (const f of fc.features as CountryFeature[]) {
    const key = f.id != null ? String(f.id) : `name:${f.properties.name}`;
    byId.set(key, f);
    all.push(f);
  }
  return { byId, all };
}

/** Lazily loads Natural Earth 1:50m country geometry (bundled, works offline). */
export function loadGeo(): Promise<GeoData> {
  if (!cache) cache = import('world-atlas/countries-50m.json').then((m) => buildGeoData((m.default ?? m) as unknown as Topology));
  return cache;
}

function polygons(f: CountryFeature): Position[][][] {
  return f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
}

/**
 * Filters disjoint parts of a (multi)polygon country.
 * - all: every part
 * - mainland: the largest part only
 * - near: parts whose bounding boxes lie within ~8° of the largest part (drops distant overseas territories)
 */
export function filterIslands(f: CountryFeature, mode: 'all' | 'near' | 'mainland'): CountryFeature {
  const polys = polygons(f);
  if (mode === 'all' || polys.length <= 1) return f;
  const parts = polys.map((coords) => {
    const g: Feature<Polygon> = { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: coords } };
    return { coords, area: geoArea(g), bounds: geoBounds(g) };
  });
  const main = parts.reduce((a, b) => (b.area > a.area ? b : a));
  let keep = [main];
  if (mode === 'near') {
    const margin = 8;
    const [[mx0, my0], [mx1, my1]] = main.bounds;
    keep = parts.filter((p) => {
      const [[x0, y0], [x1, y1]] = p.bounds;
      return x1 >= mx0 - margin && x0 <= mx1 + margin && y1 >= my0 - margin && y0 <= my1 + margin;
    });
  }
  return {
    ...f,
    geometry: keep.length === 1 ? { type: 'Polygon', coordinates: keep[0].coords } : { type: 'MultiPolygon', coordinates: keep.map((k) => k.coords) },
  };
}

export function partCount(f: CountryFeature): number {
  return polygons(f).length;
}

/** Largest polygon of a feature (used for label placement). */
export function largestPart(f: CountryFeature): CountryFeature {
  return filterIslands(f, 'mainland');
}
