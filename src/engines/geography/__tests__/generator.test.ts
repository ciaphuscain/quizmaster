import { describe, expect, it } from 'vitest';
import { buildCountryQuestion, pickCountries, roundTitle } from '../generator';
import { QuestionSchema } from '@/types/schema';
import { getCountry, getLandNeighbors } from '../countries';

describe('geography round generator', () => {
  it('is deterministic for a seed and never repeats a country', () => {
    const o = { mode: 'country-flag' as const, region: 'Europe' as const, difficulty: 'mixed' as const, count: 10, sovereignOnly: true, seed: 42 };
    const a = pickCountries(o).map((x) => x.country.iso3), b = pickCountries(o).map((x) => x.country.iso3);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(10);
    expect(a.every((iso) => getCountry(iso)!.region === 'Europe' && getCountry(iso)!.unMember)).toBe(true);
    expect(pickCountries({ ...o, seed: 7 }).map((x) => x.country.iso3)).not.toEqual(a);
  });
  it('respects difficulty (easy flags are larger countries than hard ones)', () => {
    const base = { mode: 'country-border' as const, region: 'all' as const, count: 15, sovereignOnly: true, seed: 1 };
    const easy = pickCountries({ ...base, difficulty: 'easy' }), hard = pickCountries({ ...base, difficulty: 'hard' });
    const avg = (xs: typeof easy) => xs.reduce((s, x) => s + x.country.area, 0) / xs.length;
    expect(avg(easy)).toBeGreaterThan(avg(hard) * 5);
    expect(easy.every((x) => x.difficulty === 'easy')).toBe(true);
  });
  it('neighbour rounds only pick countries with real land neighbours', () => {
    const picks = pickCountries({ mode: 'country-neighbors', region: 'Africa', difficulty: 'mixed', count: 12, sovereignOnly: true, seed: 3 });
    expect(picks.every((p) => getLandNeighbors(p.country.iso3).length > 0)).toBe(true);
  });
  it('mixed rounds cycle modes and build valid questions with factual hints', () => {
    const picks = pickCountries({ mode: 'mixed', region: 'Asia', difficulty: 'mixed', count: 6, sovereignOnly: true, seed: 9 });
    expect(picks.map((p) => p.mode)).toEqual(['country-flag', 'country-border', 'country-neighbors', 'country-flag', 'country-border', 'country-neighbors']);
    for (const p of picks) {
      const q = buildCountryQuestion(p.country, p.mode, p.difficulty);
      expect(QuestionSchema.safeParse(q).success).toBe(true);
      expect(q.correctAnswer).toBe(p.country.name);
      expect(q.scene.layers.find((l) => l.kind === 'country')).toMatchObject({ iso3: p.country.iso3 });
      expect(q.hints.length).toBeGreaterThan(0);
      expect(q.hints.map((h) => h.text).join(' ')).not.toContain(p.country.name);
    }
    expect(roundTitle({ mode: 'country-flag', region: 'Europe', difficulty: 'easy' })).toBe('Flags of Europe (easy)');
  });
});
