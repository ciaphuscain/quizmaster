import { describe, expect, it } from 'vitest';
import { checkQuestion, checkQuiz } from './health';
import { createQuestion } from './registry';
import { plainDoc } from '@/engines/scene/factories';

describe('quiz health check', () => {
  it('flags unfinished questions', () => {
    const q = createQuestion('logo-normal');
    const msgs = checkQuestion(q, new Set()).map((i) => i.message);
    expect(msgs).toEqual(expect.arrayContaining(['No correct answer', '“Logo” has no image', 'No hints']));
  });
  it('detects missing media, answer giveaways and unreversed songs', () => {
    const q = createQuestion('movie-bad-plot', { correctAnswer: 'Titanic' });
    const t = q.scene.layers.find((l) => l.kind === 'text' && l.name === 'Plot');
    if (t?.kind === 'text') t.doc = plainDoc('A ship called Titanic sinks.');
    expect(checkQuestion(q, new Set()).map((i) => i.message)).toContain('“Plot” gives away the answer');
    const s = createQuestion('song-backwards', { correctAnswer: 'X', audio: { assetId: 'gone', ops: [] } });
    const m = checkQuestion(s, new Set()).map((i) => i.message);
    expect(m).toEqual(expect.arrayContaining(['References media that no longer exists', 'Audio is not reversed']));
  });
  it('a finished country question has no errors', () => {
    const q = createQuestion('country-flag', { correctAnswer: 'Japan', hints: [{ id: 'h', text: 'Asia' }] });
    for (const l of q.scene.layers) if (l.kind === 'country') l.iso3 = 'JPN';
    expect(checkQuestion(q, new Set()).filter((i) => i.level === 'error')).toEqual([]);
  });
  it('finds duplicate answers within a quiz', () => {
    const a = createQuestion('country-flag', { correctAnswer: 'Japan' }), b = createQuestion('country-flag', { correctAnswer: 'japan' });
    expect(checkQuiz([a, b]).get(b.id)?.[0].message).toContain('Same answer');
  });
});
