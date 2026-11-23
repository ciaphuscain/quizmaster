import { describe, expect, it } from 'vitest';
import { addTeam, clearMarks, emptyScoreboard, markCorrect, markWrong, standings, adjust, teamResult } from './scoring';
import type { Round } from '@/types/schema';

const round = (patch: Partial<Round['scoring']> = {}): Round => ({ id: 'r', quizId: 'q', order: 0, title: 'R', description: '', defaultTimeLimit: 30, transition: { show: true, subtitle: '' }, scoring: { pointsMultiplier: 2, negativeMarking: true, bonusFirstCorrect: 5, ...patch } });

describe('scoring', () => {
  let sb = addTeam(addTeam(addTeam(emptyScoreboard(), 'Owls'), 'Foxes'), 'Bears');
  const [owls, foxes, bears] = sb.teams;
  const q = { id: 'q1', points: 10 };
  it('applies multiplier, first-correct bonus and negative marking', () => {
    sb = markCorrect(sb, foxes.id, q, round());
    sb = markCorrect(sb, owls.id, q, round());
    sb = markWrong(sb, bears.id, q, round());
    const s = standings(sb);
    expect(s.map((x) => [x.name, x.score])).toEqual([['Foxes', 25], ['Owls', 20], ['Bears', -20]]);
  });
  it('is idempotent and undoable', () => {
    const again = markCorrect(sb, foxes.id, q, round());
    expect(again).toBe(sb);
    const undone = clearMarks(sb, bears.id, 'q1');
    expect(standings(undone).find((x) => x.name === 'Bears')!.score).toBe(0);
    expect(teamResult(sb, owls.id, 'q1')).toBe('correct');
  });
  it('ranks ties with competition ranking', () => {
    let t = addTeam(addTeam(addTeam(emptyScoreboard(), 'A'), 'B'), 'C');
    t = adjust(t, t.teams[0].id, 'x', 5); t = adjust(t, t.teams[1].id, 'x', 5);
    expect(standings(t).map((s) => s.rank)).toEqual([1, 1, 3]);
  });
  it('no negative marking records a zero-point wrong answer', () => {
    const t = markWrong(addTeam(emptyScoreboard(), 'A'), 'nope', q, round({ negativeMarking: false }));
    expect(t.awards[0].points).toBe(0);
  });
});
