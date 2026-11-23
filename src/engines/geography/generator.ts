import type { Difficulty, GameType, Question } from '@/types/schema';
import { COUNTRIES, countryAliases, getLandNeighbors, type CountryMeta } from './countries';
import { createQuestion } from '@/games/registry';
import { dedupeAliases } from '@/utils/answers';
import { uid } from '@/utils/id';

export type GeoMode = 'country-flag' | 'country-border' | 'country-neighbors' | 'mixed';
export type GeoRegion = 'all' | 'Africa' | 'Americas' | 'Asia' | 'Europe' | 'Oceania';
export type GenOptions = { mode: GeoMode; region: GeoRegion; difficulty: Difficulty | 'mixed'; count: number; sovereignOnly: boolean; seed: number; exclude?: string[] };

/** Small deterministic PRNG so the same options + seed always produce the same round. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function eligible(c: CountryMeta, mode: Exclude<GeoMode, 'mixed'>, o: GenOptions): boolean {
  if (o.region !== 'all' && c.region !== o.region) return false;
  if (o.sovereignOnly && (!c.unMember || c.disputed)) return false;
  if (mode !== 'country-flag' && !c.geometryId) return false;
  if (mode === 'country-neighbors' && getLandNeighbors(c.iso3).filter((n) => n.geometryId).length < 1) return false;
  return true;
}

/**
 * Difficulty heuristic (documented): within the eligible pool, countries are ranked by land area — larger, more
 * familiar shapes and flags rank easier. Top third = easy, middle = medium, bottom third = hard; expert = smallest 15%.
 * For neighbour maps, more neighbours also make a country easier.
 */
export function difficultyOf(c: CountryMeta, pool: CountryMeta[], mode: Exclude<GeoMode, 'mixed'>): Difficulty {
  const key = (x: CountryMeta) => Math.log10(Math.max(1, x.area)) + (mode === 'country-neighbors' ? getLandNeighbors(x.iso3).length * 0.08 : 0);
  const sorted = [...pool].sort((a, b) => key(b) - key(a));
  const p = sorted.findIndex((x) => x.iso3 === c.iso3) / Math.max(1, sorted.length - 1);
  return p < 0.34 ? 'easy' : p < 0.67 ? 'medium' : p < 0.85 ? 'hard' : 'expert';
}

export function pickCountries(o: GenOptions): { country: CountryMeta; mode: Exclude<GeoMode, 'mixed'>; difficulty: Difficulty }[] {
  const rnd = mulberry32(o.seed);
  const modes: Exclude<GeoMode, 'mixed'>[] = o.mode === 'mixed' ? ['country-flag', 'country-border', 'country-neighbors'] : [o.mode];
  const used = new Set(o.exclude ?? []);
  const out: { country: CountryMeta; mode: Exclude<GeoMode, 'mixed'>; difficulty: Difficulty }[] = [];
  for (let i = 0; i < o.count; i++) {
    const mode = modes[i % modes.length];
    const pool = COUNTRIES.filter((c) => eligible(c, mode, o));
    const cands = pool.filter((c) => !used.has(c.iso3) && (o.difficulty === 'mixed' || difficultyOf(c, pool, mode) === o.difficulty));
    if (!cands.length) break;
    const c = cands[Math.floor(rnd() * cands.length)];
    used.add(c.iso3);
    out.push({ country: c, mode, difficulty: difficultyOf(c, pool, mode) });
  }
  return out;
}

const POINTS: Record<Difficulty, number> = { easy: 5, medium: 10, hard: 15, expert: 20 };

/** Builds a complete, valid question for a country from real data (answer, aliases, factual hints). */
export function buildCountryQuestion(c: CountryMeta, gameType: Exclude<GeoMode, 'mixed'>, difficulty: Difficulty): Question {
  const q = createQuestion(gameType as GameType);
  for (const l of q.scene.layers) if (l.kind === 'country') l.iso3 = c.iso3;
  if ('iso3' in q.content) (q.content as { iso3: string | null }).iso3 = c.iso3;
  const hints = [`Region: ${c.subregion || c.region}`];
  if (c.capital[0]) hints.push(`Capital begins with “${c.capital[0][0]}”`);
  if (gameType === 'country-neighbors') hints.unshift(`It has ${getLandNeighbors(c.iso3).length} land neighbour${getLandNeighbors(c.iso3).length === 1 ? '' : 's'}`);
  if (c.landlocked) hints.push('It is landlocked');
  return {
    ...q,
    title: `Country: ${c.name}`,
    correctAnswer: c.name,
    acceptedAnswers: dedupeAliases(c.name, countryAliases(c)),
    hints: hints.map((text) => ({ id: uid('h'), text })),
    difficulty,
    points: POINTS[difficulty],
    tags: ['geography', c.region.toLowerCase(), 'generated'],
  };
}

export const MODE_LABEL: Record<GeoMode, string> = { 'country-flag': 'Flags', 'country-border': 'Outlines', 'country-neighbors': 'Neighbours', mixed: 'Geography mix' };
export function roundTitle(o: Pick<GenOptions, 'mode' | 'region' | 'difficulty'>): string {
  return `${MODE_LABEL[o.mode]}${o.region === 'all' ? ' of the World' : ` of ${o.region}`}${o.difficulty === 'mixed' ? '' : ` (${o.difficulty})`}`;
}
