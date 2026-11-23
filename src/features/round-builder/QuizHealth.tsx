import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, AlertCircle } from 'lucide-react';
import { db } from '@/db/database';
import type { Question } from '@/types/schema';
import { checkQuestion, checkQuiz } from '@/games/health';
import { GameIcon } from '@/components/common/GameIcon';

/** Pre-show checklist: lists every problem in the quiz with a one-click jump to fix it. */
export function QuizHealth({ refs }: { refs: { questionId: string; roundTitle: string }[] }) {
  const navigate = useNavigate();
  const data = useLiveQuery(async () => {
    const qs = (await db.questions.bulkGet(refs.map((r) => r.questionId))).filter((q): q is Question => !!q);
    const assets = new Set(await db.assets.toCollection().primaryKeys());
    const quiz = checkQuiz(qs);
    return qs.map((q, i) => ({ q, round: refs[i]?.roundTitle ?? '', issues: [...checkQuestion(q, assets), ...(quiz.get(q.id) ?? [])] }));
  }, [refs.map((r) => r.questionId).join()]);
  if (!data || !refs.length) return null;
  const withIssues = data.filter((d) => d.issues.length);
  const errors = data.reduce((s, d) => s + d.issues.filter((i) => i.level === 'error').length, 0);
  const warnings = data.reduce((s, d) => s + d.issues.filter((i) => i.level === 'warning').length, 0);
  return (
    <section className="rounded-lg border border-line bg-panel" data-testid="quiz-health">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs">
        {errors ? <AlertCircle size={15} className="text-danger" /> : warnings ? <AlertTriangle size={15} className="text-amber-500" /> : <ShieldCheck size={15} className="text-success" />}
        <span className="font-semibold">Quiz check</span>
        <span className="text-muted" data-testid="health-summary">{errors ? `${errors} problem${errors > 1 ? 's' : ''} to fix` : 'Ready to present'}{warnings ? ` · ${warnings} suggestion${warnings > 1 ? 's' : ''}` : ''}</span>
      </div>
      {withIssues.length > 0 && (
        <ul className="max-h-64 overflow-auto p-1">
          {withIssues.map(({ q, round, issues }) => (
            <li key={q.id}>
              <button onClick={() => navigate(`/edit/${q.id}`)} className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-panel-2">
                <GameIcon type={q.gameType} size={13} />
                <span className="w-40 shrink-0 truncate font-medium">{q.title || q.correctAnswer || 'Untitled'}<span className="block text-[10px] font-normal text-muted">{round}</span></span>
                <span className="flex flex-wrap gap-1">{issues.map((i, k) => <span key={k} className={`rounded px-1.5 py-0.5 text-[11px] ${i.level === 'error' ? 'bg-danger/15 text-danger' : 'bg-amber-500/15 text-amber-500'}`}>{i.message}</span>)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
