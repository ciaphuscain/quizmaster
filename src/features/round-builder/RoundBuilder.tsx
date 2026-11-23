import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { GenerateRoundDialog } from './GenerateRoundDialog';
import { QuizHealth } from './QuizHealth';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Trash2, Copy, Presentation, GripVertical, ArrowUp, ArrowDown, Download, Eye, Search, X, Wand2 } from 'lucide-react';
import { db } from '@/db/database';
import { quizzesRepo } from '@/db/repositories/other';
import { filterSummaries } from '@/db/repositories/questions';
import { PageHeader } from '@/app/AppLayout';
import { Button, Field, Input, Textarea, Toggle, Section, ColorField } from '@/components/ui/primitives';
import { GameIcon } from '@/components/common/GameIcon';
import { Dialog, confirmDialog, toast, errorMessage } from '@/components/ui/overlays';
import { ScenePreview } from '@/features/templates/TemplatePreview';
import { GAMES } from '@/games/registry';
import { buildPackage } from '@/engines/export/package';
import { downloadBlob, safeFilename } from '@/features/questions/actions';
import type { Round } from '@/types/schema';
import { cn } from '@/utils/misc';

type DragData = { kind: 'ref'; refId: string } | { kind: 'question'; questionId: string };

export default function RoundBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tree = useLiveQuery(() => quizzesRepo.tree(id!), [id]);
  const summaries = useLiveQuery(() => db.summaries.toArray(), []) ?? [];
  const byId = useMemo(() => new Map(summaries.map((s) => [s.id, s])), [summaries]);
  const [search, setSearch] = useState('');
  const [drag, setDrag] = useState<DragData | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [genOpen, setGenOpen] = useState(params.get('generate') === '1');
  const results = useMemo(() => filterSummaries(summaries, { search, sort: 'updated' }).slice(0, 100), [summaries, search]);
  if (tree === undefined) return <div className="p-8 text-muted">Loading…</div>;
  if (!tree) return <div className="p-8 text-muted">Quiz not found.</div>;
  const { quiz, rounds } = tree;
  const total = rounds.reduce((s, r) => s + r.refs.length, 0);

  const dropOn = async (roundId: string, index: number) => {
    if (!drag) return;
    try {
      if (drag.kind === 'ref') await quizzesRepo.moveRef(drag.refId, roundId, index);
      else await quizzesRepo.addQuestions(roundId, [drag.questionId], index);
    } catch (e) { toast.error('Could not move question', errorMessage(e)); }
    setDrag(null);
  };
  const exportZip = async () => {
    try { downloadBlob(await buildPackage({ kind: 'quiz', quizIds: [quiz.id] }), `${safeFilename(quiz.title)}.quizmaster.zip`); toast.success('Quiz package exported'); }
    catch (e) { toast.error('Export failed', errorMessage(e)); }
  };
  const previewRound = rounds.find((r) => r.id === preview);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={quiz.title} subtitle={`${rounds.length} rounds · ${total} questions`}
        actions={<>
          <Button variant="outline" onClick={() => setGenOpen(true)} data-testid="generate-round"><Wand2 size={14} />Generate round</Button>
          <Button variant="outline" onClick={exportZip} data-testid="export-quiz-zip"><Download size={14} />Export ZIP</Button>
          <Button variant="primary" disabled={!total} onClick={() => window.open(`/present/${quiz.id}`, '_blank')} data-testid="start-presentation"><Presentation size={14} />Start presentation</Button>
        </>} />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto p-5">
          <div className="mx-auto flex max-w-4xl flex-col gap-4">
            {rounds.map((r, ri) => (
              <section key={r.id} className="rounded-lg border border-line bg-panel" data-testid={`round-${ri}`}
                onDragOver={(e) => e.preventDefault()} onDrop={() => dropOn(r.id, r.refs.length)}>
                <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <span className="text-xs font-semibold text-muted">Round {ri + 1}</span>
                  <Input className="h-7 max-w-xs font-medium" defaultValue={r.title} key={`${r.id}-t`} aria-label="Round title" onBlur={(e) => quizzesRepo.updateRound(r.id, { title: e.target.value || r.title })} />
                  <span className="text-[11px] text-muted">{r.refs.length} questions</span>
                  <div className="ml-auto flex gap-0.5">
                    <Button size="icon-sm" variant="ghost" tooltip="Preview round" onClick={() => setPreview(r.id)}><Eye size={13} /></Button>
                    <Button size="icon-sm" variant="ghost" tooltip="Move round up" disabled={ri === 0} onClick={() => { const ids = rounds.map((x) => x.id); [ids[ri - 1], ids[ri]] = [ids[ri], ids[ri - 1]]; void quizzesRepo.reorderRounds(quiz.id, ids); }}><ArrowUp size={13} /></Button>
                    <Button size="icon-sm" variant="ghost" tooltip="Move round down" disabled={ri === rounds.length - 1} onClick={() => { const ids = rounds.map((x) => x.id); [ids[ri + 1], ids[ri]] = [ids[ri], ids[ri + 1]]; void quizzesRepo.reorderRounds(quiz.id, ids); }}><ArrowDown size={13} /></Button>
                    <Button size="icon-sm" variant="ghost" tooltip="Duplicate round" onClick={() => quizzesRepo.duplicateRound(r.id)}><Copy size={13} /></Button>
                    <Button size="icon-sm" variant="ghost" tooltip="Delete round" className="text-danger" onClick={async () => { if (await confirmDialog({ title: `Delete ${r.title}?`, message: 'Questions stay in the bank.', danger: true, confirmLabel: 'Delete' })) await quizzesRepo.removeRound(r.id); }}><Trash2 size={13} /></Button>
                  </div>
                </div>
                <RoundSettings round={r} />
                <ol className="min-h-12 p-2">
                  {r.refs.length === 0 && <li className="rounded border border-dashed border-line p-3 text-center text-xs text-muted">Drag questions here from the panel on the right</li>}
                  {r.refs.map((ref, i) => {
                    const s = byId.get(ref.questionId);
                    return (
                      <li key={ref.id} draggable onDragStart={() => setDrag({ kind: 'ref', refId: ref.id })} onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.stopPropagation(); void dropOn(r.id, i); }}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-panel-2" data-testid="round-question">
                        <GripVertical size={12} className="cursor-grab text-muted" />
                        <span className="w-5 text-right tabular-nums text-muted">{i + 1}</span>
                        {s ? <><GameIcon type={s.gameType} size={13} /><button className="flex-1 truncate text-left hover:underline" onClick={() => navigate(`/edit/${s.id}`)}>{s.title}</button><span className="text-muted">{GAMES[s.gameType].short}</span><span className="w-14 text-right text-muted">{Math.round(s.points * r.scoring.pointsMultiplier)} pts</span></> : <span className="flex-1 text-danger">Missing question</span>}
                        <button aria-label="Move up" disabled={i === 0} className="text-muted disabled:opacity-30" onClick={() => quizzesRepo.moveRef(ref.id, r.id, i - 1)}><ArrowUp size={12} /></button>
                        <button aria-label="Move down" disabled={i === r.refs.length - 1} className="text-muted disabled:opacity-30" onClick={() => quizzesRepo.moveRef(ref.id, r.id, i + 1)}><ArrowDown size={12} /></button>
                        {rounds.length > 1 && (
                          <select aria-label="Move to round" className="h-6 rounded border border-line bg-panel-2 text-[11px]" value="" onChange={(e) => e.target.value && quizzesRepo.moveRef(ref.id, e.target.value, 9999)}>
                            <option value="">Move to…</option>{rounds.filter((x) => x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
                          </select>
                        )}
                        <button aria-label="Remove from round" className="text-muted hover:text-danger" onClick={() => quizzesRepo.removeRef(ref.id)}><X size={12} /></button>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
            <Button variant="outline" onClick={() => quizzesRepo.addRound(quiz.id, `Round ${rounds.length + 1}`)} data-testid="add-round"><Plus size={14} />Add round</Button>
            <QuizHealth refs={rounds.flatMap((r) => r.refs.map((x) => ({ ...x, roundTitle: r.title })))} />
            <QuizSettings quiz={quiz} />
          </div>
        </div>
        <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel">
          <div className="border-b border-line p-2">
            <div className="relative"><Search size={13} className="absolute left-2 top-2.5 text-muted" /><Input className="pl-7" placeholder="Find questions to add…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Find questions" /></div>
            <p className="mt-1 text-[11px] text-muted">Drag into a round, or click + to append to the last round.</p>
          </div>
          <ul className="flex-1 overflow-auto p-1">
            {results.map((s) => (
              <li key={s.id} draggable onDragStart={() => setDrag({ kind: 'question', questionId: s.id })} className="flex cursor-grab items-center gap-1.5 rounded px-2 py-1.5 text-xs hover:bg-panel-2" data-testid="bank-item">
                <GameIcon type={s.gameType} size={12} /><span className="flex-1 truncate">{s.title}</span>
                <Button size="icon-sm" variant="ghost" tooltip="Add to last round" disabled={!rounds.length} onClick={() => quizzesRepo.addQuestions(rounds[rounds.length - 1].id, [s.id])}><Plus size={12} /></Button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <GenerateRoundDialog quizId={quiz.id} open={genOpen} onOpenChange={(o) => { setGenOpen(o); if (!o && params.get('generate')) setParams({}, { replace: true }); }} />
      <Dialog open={!!previewRound} onOpenChange={(o) => !o && setPreview(null)} title={`Preview — ${previewRound?.title ?? ''}`} wide="xl">
        <RoundPreview refs={previewRound?.refs.map((r) => r.questionId) ?? []} />
      </Dialog>
    </div>
  );
}

function RoundSettings({ round: r }: { round: Round }) {
  return (
    <details className="border-b border-line px-3 py-1 text-xs">
      <summary className="cursor-pointer py-1 text-muted">Scoring, time limit & transition — ×{r.scoring.pointsMultiplier}{r.scoring.negativeMarking ? ', negative marking' : ''}, {r.defaultTimeLimit}s default</summary>
      <div className="grid grid-cols-2 gap-3 py-2">
        <Field label="Description"><Textarea rows={2} defaultValue={r.description} onBlur={(e) => quizzesRepo.updateRound(r.id, { description: e.target.value })} /></Field>
        <div className="flex flex-col gap-2">
          <Field label="Points multiplier"><Input type="number" step={0.5} min={0} defaultValue={r.scoring.pointsMultiplier} onBlur={(e) => quizzesRepo.updateRound(r.id, { scoring: { ...r.scoring, pointsMultiplier: Math.max(0, Number(e.target.value) || 1) } })} /></Field>
          <Field label="Default time limit (s) — used when a question has none"><Input type="number" min={0} defaultValue={r.defaultTimeLimit} onBlur={(e) => quizzesRepo.updateRound(r.id, { defaultTimeLimit: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></Field>
        </div>
        <Toggle label="Negative marking for wrong answers" checked={r.scoring.negativeMarking} onChange={(v) => quizzesRepo.updateRound(r.id, { scoring: { ...r.scoring, negativeMarking: v } })} />
        <Field label="Bonus for first correct team"><Input type="number" min={0} defaultValue={r.scoring.bonusFirstCorrect} onBlur={(e) => quizzesRepo.updateRound(r.id, { scoring: { ...r.scoring, bonusFirstCorrect: Math.max(0, Number(e.target.value) || 0) } })} /></Field>
        <Toggle label="Show transition slide" checked={r.transition.show} onChange={(v) => quizzesRepo.updateRound(r.id, { transition: { ...r.transition, show: v } })} />
        <Field label="Transition subtitle"><Input defaultValue={r.transition.subtitle} onBlur={(e) => quizzesRepo.updateRound(r.id, { transition: { ...r.transition, subtitle: e.target.value } })} /></Field>
      </div>
    </details>
  );
}

function QuizSettings({ quiz }: { quiz: NonNullable<Awaited<ReturnType<typeof quizzesRepo.tree>>>['quiz'] }) {
  return (
    <Section title="Quiz settings & theme" defaultOpen={false}>
      <Field label="Title"><Input defaultValue={quiz.title} onBlur={(e) => quizzesRepo.update(quiz.id, { title: e.target.value || quiz.title })} /></Field>
      <Field label="Description"><Textarea rows={2} defaultValue={quiz.description} onBlur={(e) => quizzesRepo.update(quiz.id, { description: e.target.value })} /></Field>
      <ColorField label="Accent colour" value={quiz.theme.accent} onChange={(v) => quizzesRepo.update(quiz.id, { theme: { ...quiz.theme, accent: v } })} />
      <ColorField label="Transition background" value={quiz.theme.background} onChange={(v) => quizzesRepo.update(quiz.id, { theme: { ...quiz.theme, background: v } })} />
      <Toggle label="Show question numbers" checked={quiz.settings.showQuestionNumbers} onChange={(v) => quizzesRepo.update(quiz.id, { settings: { ...quiz.settings, showQuestionNumbers: v } })} />
      <Toggle label="Auto-start timer on each question" checked={quiz.settings.autoStartTimer} onChange={(v) => quizzesRepo.update(quiz.id, { settings: { ...quiz.settings, autoStartTimer: v } })} />
      <Toggle label="Round transition slides" checked={quiz.settings.showRoundTransitions} onChange={(v) => quizzesRepo.update(quiz.id, { settings: { ...quiz.settings, showRoundTransitions: v } })} />
    </Section>
  );
}

function RoundPreview({ refs }: { refs: string[] }) {
  const qs = useLiveQuery(() => db.questions.bulkGet(refs), [refs.join()]) ?? [];
  return (
    <div className="grid grid-cols-3 gap-3">
      {qs.map((q, i) => q && (
        <div key={`${q.id}-${i}`} className={cn('flex flex-col gap-1 text-xs')}>
          <ScenePreview scene={q.scene} width={300} revealStep={0} />
          <span className="font-medium">{i + 1}. {q.prompt}</span>
          <span className="text-success">Answer: {q.correctAnswer || '—'}</span>
        </div>
      ))}
    </div>
  );
}
