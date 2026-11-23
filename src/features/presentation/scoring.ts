import type { Question, Round } from '@/types/schema';
import { uid } from '@/utils/id';

export type Team = { id: string; name: string; color: string };
export type Award = { id: string; questionId: string; teamId: string; points: number; kind: 'correct' | 'wrong' | 'bonus' | 'adjust'; at: number };
export type Scoreboard = { teams: Team[]; awards: Award[] };
export type Standing = Team & { score: number; rank: number; correct: number };

export const TEAM_COLORS = ['#f59e0b', '#3b82f6', '#22c55e', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#f97316', '#6366f1'];

export const emptyScoreboard = (): Scoreboard => ({ teams: [], awards: [] });

export function addTeam(sb: Scoreboard, name: string): Scoreboard {
  return { ...sb, teams: [...sb.teams, { id: uid('team'), name: name.trim() || `Team ${sb.teams.length + 1}`, color: TEAM_COLORS[sb.teams.length % TEAM_COLORS.length] }] };
}
export function removeTeam(sb: Scoreboard, teamId: string): Scoreboard {
  return { teams: sb.teams.filter((t) => t.id !== teamId), awards: sb.awards.filter((a) => a.teamId !== teamId) };
}
export function renameTeam(sb: Scoreboard, teamId: string, name: string): Scoreboard {
  return { ...sb, teams: sb.teams.map((t) => (t.id === teamId ? { ...t, name } : t)) };
}

export function questionPoints(q: Pick<Question, 'points'>, round: Round | null): number {
  return Math.round(q.points * (round?.scoring.pointsMultiplier ?? 1) * 100) / 100;
}

/** Awards a correct answer: question points × round multiplier, plus the round's bonus for the first correct team. */
export function markCorrect(sb: Scoreboard, teamId: string, q: Pick<Question, 'id' | 'points'>, round: Round | null): Scoreboard {
  if (sb.awards.some((a) => a.questionId === q.id && a.teamId === teamId && a.kind === 'correct')) return sb; // idempotent
  const first = !sb.awards.some((a) => a.questionId === q.id && a.kind === 'correct');
  const now = Date.now();
  const awards: Award[] = [...sb.awards, { id: uid('aw'), questionId: q.id, teamId, points: questionPoints(q, round), kind: 'correct', at: now }];
  const bonus = round?.scoring.bonusFirstCorrect ?? 0;
  if (first && bonus > 0) awards.push({ id: uid('aw'), questionId: q.id, teamId, points: bonus, kind: 'bonus', at: now });
  return { ...sb, awards };
}

/** Marks a wrong answer: deducts the question's points if the round uses negative marking, otherwise records 0. */
export function markWrong(sb: Scoreboard, teamId: string, q: Pick<Question, 'id' | 'points'>, round: Round | null): Scoreboard {
  if (sb.awards.some((a) => a.questionId === q.id && a.teamId === teamId && (a.kind === 'wrong' || a.kind === 'correct'))) return sb;
  const pts = round?.scoring.negativeMarking ? -questionPoints(q, round) : 0;
  return { ...sb, awards: [...sb.awards, { id: uid('aw'), questionId: q.id, teamId, points: pts, kind: 'wrong', at: Date.now() }] };
}

export function adjust(sb: Scoreboard, teamId: string, questionId: string, points: number): Scoreboard {
  return { ...sb, awards: [...sb.awards, { id: uid('aw'), questionId, teamId, points, kind: 'adjust', at: Date.now() }] };
}

/** Removes every award a team received for a question (undo marking). */
export function clearMarks(sb: Scoreboard, teamId: string, questionId: string): Scoreboard {
  return { ...sb, awards: sb.awards.filter((a) => !(a.teamId === teamId && a.questionId === questionId)) };
}

export function teamResult(sb: Scoreboard, teamId: string, questionId: string): 'correct' | 'wrong' | null {
  const a = sb.awards.filter((x) => x.teamId === teamId && x.questionId === questionId);
  if (a.some((x) => x.kind === 'correct')) return 'correct';
  if (a.some((x) => x.kind === 'wrong')) return 'wrong';
  return null;
}

/** Standings with competition ranking (1, 2, 2, 4). */
export function standings(sb: Scoreboard): Standing[] {
  const rows = sb.teams.map((t) => {
    const mine = sb.awards.filter((a) => a.teamId === t.id);
    return { ...t, score: Math.round(mine.reduce((s, a) => s + a.points, 0) * 100) / 100, correct: mine.filter((a) => a.kind === 'correct').length, rank: 0 };
  }).sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name));
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1; });
  return rows;
}
