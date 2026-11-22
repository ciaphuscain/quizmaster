import { describe, expect, it } from 'vitest';
import { buildPublicState, buildSlides, initialHostState, nextAction } from './model';
import { createQuestion } from '@/games/registry';
import type { Round } from '@/types/schema';

const round = (id: string, refs: string[]): Round & { refs: { questionId: string }[] } => ({
  id, quizId: 'qz', order: 0, title: `Round ${id}`, description: '', scoring: { pointsMultiplier: 1, negativeMarking: false, bonusFirstCorrect: 0 },
  defaultTimeLimit: 30, transition: { show: true, subtitle: '' }, refs: refs.map((questionId) => ({ questionId })),
});

describe('presentation model', () => {
  const q = createQuestion('movie-emojis', { correctAnswer: 'The Lion King', acceptedAnswers: ['Lion King'], hints: [{ id: 'h1', text: 'Disney' }, { id: 'h2', text: '1994' }], notes: 'secret host note' });
  const slides = buildSlides([round('a', [q.id]), round('b', [])], true);
  it('builds transition + question slides and skips empty rounds', () => {
    expect(slides.map((s) => s.kind)).toEqual(['transition', 'question']);
  });
  it('never exposes the answer, aliases, notes or unrevealed hints before reveal', () => {
    const s = { ...initialHostState(), slideIndex: 1, hintsRevealed: 1 };
    const pub = buildPublicState(null, slides[1], q, s);
    const json = JSON.stringify(pub);
    expect(pub.answer).toBeNull();
    expect(json).not.toContain('Lion King');
    expect(json).not.toContain('secret host note');
    expect(json).not.toContain('1994');
    expect(pub.hints).toEqual(['Disney']);
  });
  it('includes the answer after reveal', () => {
    const pub = buildPublicState(null, slides[1], q, { ...initialHostState(), slideIndex: 1, answerRevealed: true });
    expect(pub.answer).toBe('The Lion King');
    expect(pub.acceptedAnswers).toEqual(['Lion King']);
  });
  it('reports the reveal animation of newly revealed layers', () => {
    const q3 = createQuestion('movie-emojis');
    q3.scene.layers.push({ ...q3.scene.layers[0], id: 'y', revealStep: 1, animation: 'zoom' });
    expect(buildPublicState(null, slides[1], q3, { ...initialHostState(), slideIndex: 1, step: 0 }).transition).toBe('fade');
    expect(buildPublicState(null, slides[1], q3, { ...initialHostState(), slideIndex: 1, step: 1 }).transition).toBe('zoom');
  });
  it('space advances reveal steps, then answer, then slide', () => {
    const q2 = createQuestion('movie-emojis');
    q2.scene.layers.push({ ...q2.scene.layers[0], id: 'x', revealStep: 1 });
    let s = { ...initialHostState(), slideIndex: 1 };
    s = nextAction(s, slides[1], q2, slides.length); expect(s.step).toBe(1);
    s = nextAction(s, slides[1], q2, slides.length); expect(s.answerRevealed).toBe(true);
    s = nextAction(s, slides[1], q2, slides.length); expect(s.ended).toBe(true);
  });
});
