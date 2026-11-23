import { useState } from 'react';
import { Check, X, Plus, Trash2, Trophy, RotateCcw, Minus } from 'lucide-react';
import type { Question, Round } from '@/types/schema';
import { Button, Input } from '@/components/ui/primitives';
import { matchAnswer } from '@/utils/answers';
import { cn } from '@/utils/misc';
import { addTeam, adjust, clearMarks, markCorrect, markWrong, removeTeam, renameTeam, standings, teamResult, questionPoints, type Scoreboard } from './scoring';

/** Host-only scoring: teams, per-question marking, fuzzy answer checker and leaderboard control. */
export function ScoringPanel({ board, setBoard, q, round, showingLeaderboard, onToggleLeaderboard }: {
  board: Scoreboard; setBoard: (b: Scoreboard) => void; q: Question | undefined; round: Round | null;
  showingLeaderboard: boolean; onToggleLeaderboard: () => void;
}) {
  const [name, setName] = useState('');
  const [guess, setGuess] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const st = standings(board);
  const verdict = q && guess.trim() ? matchAnswer(guess, q.correctAnswer, q.acceptedAnswers) : null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-3" data-testid="scoring-panel">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-muted">Teams & scoring</span>
        <Button size="sm" variant={showingLeaderboard ? 'primary' : 'outline'} disabled={!board.teams.length} onClick={onToggleLeaderboard} data-testid="toggle-leaderboard"><Trophy size={12} />{showingLeaderboard ? 'Hide' : 'Show'} leaderboard (L)</Button>
      </div>
      {q && <div className="text-[11px] text-muted">This question: {questionPoints(q, round)} pts{round?.scoring.negativeMarking ? ` · wrong −${questionPoints(q, round)}` : ''}{round?.scoring.bonusFirstCorrect ? ` · first correct +${round.scoring.bonusFirstCorrect}` : ''}</div>}
      <ul className="flex flex-col gap-1">
        {st.map((t) => {
          const res = q ? teamResult(board, t.id, q.id) : null;
          return (
            <li key={t.id} className={cn('flex items-center gap-1.5 rounded px-1.5 py-1', res === 'correct' && 'bg-success/15', res === 'wrong' && 'bg-danger/10')} data-testid="team-row">
              <span className="w-4 text-right text-muted">{t.rank}</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color }} />
              {editing === t.id ? (
                <Input autoFocus className="h-6" defaultValue={t.name} onBlur={(e) => { setBoard(renameTeam(board, t.id, e.target.value || t.name)); setEditing(null); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
              ) : <span className="flex-1 truncate" onDoubleClick={() => setEditing(t.id)} title="Double-click to rename">{t.name}</span>}
              <span className="w-10 text-right font-mono font-bold tabular-nums" data-testid="team-score">{t.score}</span>
              {q && <>
                <Button size="icon-sm" variant="ghost" tooltip="Correct" active={res === 'correct'} onClick={() => setBoard(res ? clearMarks(board, t.id, q.id) : markCorrect(board, t.id, q, round))} aria-label={`Mark ${t.name} correct`}><Check size={13} className="text-success" /></Button>
                <Button size="icon-sm" variant="ghost" tooltip="Wrong" active={res === 'wrong'} onClick={() => setBoard(res ? clearMarks(board, t.id, q.id) : markWrong(board, t.id, q, round))} aria-label={`Mark ${t.name} wrong`}><X size={13} className="text-danger" /></Button>
              </>}
              <Button size="icon-sm" variant="ghost" tooltip="+1" onClick={() => setBoard(adjust(board, t.id, q?.id ?? 'manual', 1))} aria-label={`Add a point to ${t.name}`}><Plus size={11} /></Button>
              <Button size="icon-sm" variant="ghost" tooltip="−1" onClick={() => setBoard(adjust(board, t.id, q?.id ?? 'manual', -1))} aria-label={`Remove a point from ${t.name}`}><Minus size={11} /></Button>
              <Button size="icon-sm" variant="ghost" tooltip="Remove team" onClick={() => confirm(`Remove ${t.name} and their points?`) && setBoard(removeTeam(board, t.id))}><Trash2 size={11} /></Button>
            </li>
          );
        })}
      </ul>
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); setBoard(addTeam(board, name)); setName(''); }}>
        <Input className="h-7" placeholder={`Team ${board.teams.length + 1}`} value={name} onChange={(e) => setName(e.target.value)} aria-label="New team name" data-testid="new-team" />
        <Button size="sm" variant="outline" type="submit" data-testid="add-team"><Plus size={12} />Team</Button>
      </form>
      {q && (
        <div className="flex flex-col gap-1">
          <Input className="h-7" placeholder="Check a written answer…" value={guess} onChange={(e) => setGuess(e.target.value)} aria-label="Check an answer" data-testid="answer-check" />
          {verdict && (
            <div className={cn('rounded px-2 py-1 text-[11px] font-medium', verdict.verdict === 'exact' ? 'bg-success/20 text-success' : verdict.verdict === 'close' ? 'bg-amber-500/20 text-amber-500' : 'bg-danger/15 text-danger')} data-testid="answer-verdict">
              {verdict.verdict === 'exact' ? `✓ Correct${verdict.matched !== q.correctAnswer ? ` (accepted: ${verdict.matched})` : ''}` : verdict.verdict === 'close' ? `≈ Close — ${verdict.distance} typo${verdict.distance > 1 ? 's' : ''} from “${verdict.matched}”. Your call.` : '✗ Not a match'}
            </div>
          )}
        </div>
      )}
      {board.awards.length > 0 && <Button size="sm" variant="ghost" className="self-start text-danger" onClick={() => confirm('Reset all scores (teams are kept)?') && setBoard({ ...board, awards: [] })}><RotateCcw size={12} />Reset scores</Button>}
    </div>
  );
}
