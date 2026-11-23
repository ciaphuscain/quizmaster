// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { useDatabase, db } from '@/db/database';
import { buildDemoQuiz } from './demo';
import { quizzesRepo } from '@/db/repositories/other';
import { checkQuestion } from '@/games/health';

describe('demo quiz', () => {
  it('builds 7 rounds of valid, error-free questions across 7 game modes', async () => {
    useDatabase(`demo-${Date.now()}`); await db.open();
    const { quizId, questions } = await buildDemoQuiz(123);
    const tree = (await quizzesRepo.tree(quizId))!;
    expect(tree.rounds).toHaveLength(7);
    expect(tree.rounds.every((r) => r.refs.length > 0)).toBe(true);
    expect(new Set(questions.map((q) => q.gameType)).size).toBe(7);
    const errors = questions.flatMap((q) => checkQuestion(q, new Set()).filter((i) => i.level === 'error').map((i) => `${q.title}: ${i.message}`));
    expect(errors).toEqual([]);
  });
});
