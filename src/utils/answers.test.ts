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
