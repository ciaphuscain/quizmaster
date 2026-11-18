// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { useDatabase, db } from '@/db/database';
import { filterSummaries, summarize } from '@/db/repositories/questions';
import { createQuestion } from '@/games/registry';
import { GAME_TYPES } from '@/types/schema';

describe('performance with 10,000 questions', () => {
  it('stores 10k questions and searches/filters summaries quickly', async () => {
    useDatabase(`perf-${Date.now()}`); await db.open();
    const qs = Array.from({ length: 10_000 }, (_, i) => createQuestion(GAME_TYPES[i % 13], { correctAnswer: `Answer ${i}`, tags: [i % 2 ? 'odd' : 'even'], difficulty: (['easy', 'medium', 'hard', 'expert'] as const)[i % 4] }));
    await db.questions.bulkPut(qs);
    await db.summaries.bulkPut(qs.map(summarize));
    const t0 = performance.now();
    const rows = await db.summaries.toArray();
    const loadMs = performance.now() - t0;
    expect(rows).toHaveLength(10_000);
    const t1 = performance.now();
    const r = filterSummaries(rows, { search: 'answer 99', gameTypes: ['logo-normal', 'movie-emojis'], tags: ['odd'], sort: 'title' });
    const filterMs = performance.now() - t1;
    expect(r.every((x) => x.tags.includes('odd'))).toBe(true);
    console.log(`10k summaries: load ${loadMs.toFixed(0)} ms, filter+sort ${filterMs.toFixed(1)} ms`);
    expect(filterMs).toBeLessThan(200);
  }, 60_000);
});
