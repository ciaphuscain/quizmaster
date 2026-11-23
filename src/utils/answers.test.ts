import { describe, expect, it } from 'vitest';
import { dedupeAliases, isAnswerAccepted, normalizeAnswer } from './answers';

describe('answer normalization', () => {
  it('ignores case, accents, punctuation and leading articles', () => {
    expect(normalizeAnswer('  The Lion King! ')).toBe('lion king');
    expect(normalizeAnswer('Amélie')).toBe('amelie');
    expect(normalizeAnswer("Schindler's List")).toBe('schindlers list');
    expect(normalizeAnswer('Fast & Furious')).toBe('fast and furious');
  });
  it('accepts alternatives', () => {
    expect(isAnswerAccepted('star wars', 'Star Wars: A New Hope', ['Star Wars'])).toBe(true);
    expect(isAnswerAccepted('star trek', 'Star Wars', [])).toBe(false);
    expect(isAnswerAccepted('', 'X', [])).toBe(false);
  });
  it('dedupes aliases', () => {
    expect(dedupeAliases('Coca-Cola', ['coca cola', 'Coke', 'COKE', ' '])).toEqual(['Coke']);
  });
});

import { editDistance, matchAnswer } from './answers';
describe('fuzzy answer matching', () => {
  it('computes edit distance', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
  });
  it('grades exact, close and wrong guesses', () => {
    expect(matchAnswer('the lion king', 'The Lion King').verdict).toBe('exact');
    expect(matchAnswer('Lion Kingg', 'The Lion King').verdict).toBe('close');
    expect(matchAnswer('Shrek', 'The Lion King').verdict).toBe('wrong');
    expect(matchAnswer('coke', 'Coca-Cola', ['Coke'])).toMatchObject({ verdict: 'exact', matched: 'Coke' });
    expect(matchAnswer('Chilee', 'Chile').verdict).toBe('close');
    expect(matchAnswer('UK', 'UAE').verdict).toBe('wrong'); // short answers need exact matches
  });
});
