import { describe, expect, it } from 'vitest';
import { buildPublicState, buildSlides, canRevealAnswer, effectiveStep, initialHostState, nextAction, type Slide } from './model';
import { createQuestion } from '@/games/registry';
import type { Round } from '@/types/schema';

const round = (id: string, refs: string[]): Round & { refs: { questionId: string }[] } => ({
  id, quizId: 'qz', order: 0, title: `Round ${id}`, description: '', scoring: { pointsMultiplier: 1, negativeMarking: false, bonusFirstCorrect: 0 },
  defaultTimeLimit: 30, transition: { show: true, subtitle: '' }, refs: refs.map((questionId) => ({ questionId })),
});
const describeSlides = (s: Slide[]) => s.map((x) => (x.kind === 'transition' ? `${x.review ? 'A' : 'T'}:${x.round.id}` : `${x.phase === 'review' ? 'a' : 'q'}:${x.questionId}`));
const rounds = [round('1', ['x', 'y']), round('2', ['z'])];

describe('answer reveal timing', () => {
  it('after each question (default) keeps the original order', () => {
    expect(describeSlides(buildSlides(rounds, true))).toEqual(['T:1', 'q:x', 'q:y', 'T:2', 'q:z']);
  });
  it('end of each round: an answer run-through follows every round', () => {
    expect(describeSlides(buildSlides(rounds, true, 'round'))).toEqual(['T:1', 'q:x', 'q:y', 'A:1', 'a:x', 'a:y', 'T:2', 'q:z', 'A:2', 'a:z']);
  });
  it('end of quiz: every question first, then every answer', () => {
    const s = buildSlides(rounds, true, 'quiz');
    expect(describeSlides(s)).toEqual(['T:1', 'q:x', 'q:y', 'T:2', 'q:z', 'A:1', 'a:x', 'a:y', 'A:2', 'a:z']);
    // numbering is kept in the answer run-through
    expect(s.filter((x) => x.kind === 'question').map((x) => (x.kind === 'question' ? x.number : 0))).toEqual([1, 2, 3, 1, 2, 3]);
  });
  it('the answer can never reach the audience on an "ask" slide in deferred modes', () => {
    const q = createQuestion('movie-emojis', { correctAnswer: 'Top Secret Answer', acceptedAnswers: ['TSA'] });
    const s = buildSlides([round('1', [q.id])], false, 'quiz');
    const ask = s[0], review = s[2];
    expect(canRevealAnswer(ask)).toBe(false);
    // even a forced host state cannot leak it
    const forced = buildPublicState(null, ask, q, { ...initialHostState(), answerRevealed: true });
    expect(forced.answer).toBeNull();
    expect(JSON.stringify(forced)).not.toContain('Top Secret');
    expect(JSON.stringify(forced)).not.toContain('TSA');
    // Space on an ask slide moves on instead of revealing
    const after = nextAction({ ...initialHostState(), slideIndex: 0 }, ask, q, s.length);
    expect(after.answerRevealed).toBe(false);
    expect(after.slideIndex).toBe(1);
    // review slide: full question shown, Space reveals, then moves on
    expect(effectiveStep(review, initialHostState())).toBe(Infinity);
    const r1 = nextAction({ ...initialHostState(), slideIndex: 2 }, review, q, s.length);
    expect(r1.answerRevealed).toBe(true);
    const pub = buildPublicState(null, review, q, r1);
    expect(pub).toMatchObject({ answer: 'Top Secret Answer', phase: 'review' });
  });
});
