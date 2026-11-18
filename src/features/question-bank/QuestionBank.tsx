import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useVirtualizer } from '@tanstack/react-virtual';
import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Search, Plus, Copy, Trash2, Archive, ArchiveRestore, Tag, FolderPlus, ListPlus, ChevronDown, Pencil, Download } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/app/AppLayout';
import { Badge, Button, Input, Select } from '@/components/ui/primitives';
import { GAME_LIST, GAMES } from '@/games/registry';
import { GameIcon } from '@/components/common/GameIcon';
import { filterSummaries, questionsRepo, type QuestionFilter } from '@/db/repositories/questions';
import { confirmDialog, promptDialog, toast, errorMessage, Dialog } from '@/components/ui/overlays';
import { useQuestionThumb } from '@/hooks/useAssetUrl';
import { quizzesRepo } from '@/db/repositories/other';
import { DIFFICULTIES, STATUSES, type GameType, type QuestionSummary } from '@/types/schema';
import { cn } from '@/utils/misc';
import { buildPackage } from '@/engines/export/package';
import { downloadBlob } from '@/features/questions/actions';

function Thumb({ s }: { s: QuestionSummary }) {
  const url = useQuestionThumb(s.id, s.updatedAt);
  return (
    <div className="flex h-10 w-[71px] shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-panel-3">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <GameIcon type={s.gameType} size={16} />}
    </div>
  );
}

const DIFF_COLOR = { easy: '#22c55e', medium: '#eab308', hard: '#f97316', expert: '#ef4444' };

export default function QuestionBank() {
  const navigate = useNavigate();
  const rows = useLiveQuery(() => db.summaries.toArray(), []) ?? [];
  const collections = useLiveQuery(() => db.collections.orderBy('name').toArray(), []) ?? [];
  const [filter, setFilter] = useState<QuestionFilter>({ sort: 'updated', sortDir: 'desc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClicked, setLastClicked] = useState<number | null>(null);
  const [addToQuiz, setAddToQuiz] = useState(false);
  const filtered = useMemo(() => filterSummaries(rows, filter), [rows, filter]);
  const allTags = useMemo(() => [...new Set(rows.flatMap((r) => r.tags))].sort(), [rows]);
  const parentRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: filtered.length, getScrollElement: () => parentRef.current, estimateSize: () => 52, overscan: 12 });
  const sel = [...selected].filter((id) => filtered.some((r) => r.id === id));

  const toggle = (id: string, idx: number, e: React.MouseEvent | React.ChangeEvent) => {
    const next = new Set(selected);
    if ('shiftKey' in e && (e as React.MouseEvent).shiftKey && lastClicked !== null) {
      const [a, b] = [Math.min(lastClicked, idx), Math.max(lastClicked, idx)];
      for (let i = a; i <= b; i++) next.add(filtered[i].id);
    } else if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next); setLastClicked(idx);
  };
  const run = async (label: string, fn: () => Promise<unknown>) => {
    try { await fn(); toast.success(label); } catch (e) { toast.error(`${label} failed`, errorMessage(e)); }
  };
  const bulkDelete = async () => {
    if (!(await confirmDialog({ title: `Delete ${sel.length} question(s)?`, message: 'This cannot be undone. Shared media assets are kept in the Media Library.', confirmLabel: 'Delete', danger: true }))) return;
    await run(`Deleted ${sel.length} question(s)`, () => questionsRepo.remove(sel)); setSelected(new Set());
  };
  const bulkTag = async () => {
    const t = await promptDialog({ title: 'Add tags', message: 'Comma-separated tags to add to the selected questions' });
    if (!t) return;
    const tags = t.split(',').map((x) => x.trim()).filter(Boolean);
    await run('Tags added', () => questionsRepo.bulkUpdate(sel, (q) => ({ ...q, tags: [...new Set([...q.tags, ...tags])] })));
  };
  const setField = (patch: Record<string, unknown>, label: string) => run(label, () => questionsRepo.bulkUpdate(sel, (q) => ({ ...q, ...patch })));
  const addToCollection = (cid: string) => run('Added to collection', () => questionsRepo.bulkUpdate(sel, (q) => ({ ...q, collectionIds: [...new Set([...q.collectionIds, cid])] })));
  const removeFromCollection = (cid: string) => run('Removed from collection', () => questionsRepo.bulkUpdate(sel, (q) => ({ ...q, collectionIds: q.collectionIds.filter((c) => c !== cid) })));

  const toggleIn = <T,>(arr: T[] | undefined, v: T) => { const s = new Set(arr ?? []); if (s.has(v)) s.delete(v); else s.add(v); return [...s]; };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Question Bank" subtitle={`${filtered.length} of ${rows.length} questions`} actions={<Button variant="primary" onClick={() => navigate('/create')}><Plus size={14} />New question</Button>} />
      <div className="flex min-h-0 flex-1">
        <aside className="w-56 shrink-0 overflow-auto border-r border-line bg-panel p-3 text-xs" aria-label="Filters">
          <div className="mb-1 font-semibold uppercase tracking-wide text-muted text-[11px]">Game type</div>
          {GAME_LIST.map((g) => (
            <label key={g.type} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-panel-2">
              <input type="checkbox" checked={filter.gameTypes?.includes(g.type) ?? false} onChange={() => setFilter({ ...filter, gameTypes: toggleIn(filter.gameTypes, g.type as GameType) })} />
              <GameIcon type={g.type} size={12} /><span className="truncate">{g.short}</span>
            </label>
          ))}
          <div className="mb-1 mt-3 font-semibold uppercase tracking-wide text-muted text-[11px]">Difficulty</div>
          {DIFFICULTIES.map((d) => (
            <label key={d} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 capitalize hover:bg-panel-2">
              <input type="checkbox" checked={filter.difficulty?.includes(d) ?? false} onChange={() => setFilter({ ...filter, difficulty: toggleIn(filter.difficulty, d) })} />{d}
            </label>
          ))}
          <div className="mb-1 mt-3 font-semibold uppercase tracking-wide text-muted text-[11px]">Status</div>
          {STATUSES.map((d) => (
            <label key={d} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 capitalize hover:bg-panel-2">
              <input type="checkbox" checked={filter.status?.includes(d) ?? false} onChange={() => setFilter({ ...filter, status: toggleIn(filter.status, d) })} />{d}
            </label>
          ))}
          <div className="mb-1 mt-3 font-semibold uppercase tracking-wide text-muted text-[11px]">Collection</div>
          <Select value={filter.collectionId ?? ''} onChange={(e) => setFilter({ ...filter, collectionId: e.target.value || null })} aria-label="Collection filter">
            <option value="">All</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          {allTags.length > 0 && <>
            <div className="mb-1 mt-3 font-semibold uppercase tracking-wide text-muted text-[11px]">Tags</div>
            <div className="flex flex-wrap gap-1">
              {allTags.map((t) => (
                <button key={t} onClick={() => setFilter({ ...filter, tags: toggleIn(filter.tags, t) })} className={cn('rounded border border-line px-1.5 py-0.5', filter.tags?.includes(t) && 'border-accent bg-accent/15 text-accent')}>{t}</button>
              ))}
            </div>
          </>}
          <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setFilter({ sort: filter.sort, sortDir: filter.sortDir })}>Clear filters</Button>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-line bg-panel px-4 py-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-2 text-muted" />
              <Input className="pl-8" placeholder="Search titles, answers, tags, clue text…" value={filter.search ?? ''} onChange={(e) => setFilter({ ...filter, search: e.target.value })} aria-label="Search" />
            </div>
            <Select className="w-36" value={filter.sort} onChange={(e) => setFilter({ ...filter, sort: e.target.value as QuestionFilter['sort'] })} aria-label="Sort by">
              <option value="updated">Last modified</option><option value="created">Created</option><option value="title">Title</option><option value="difficulty">Difficulty</option><option value="points">Points</option>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setFilter({ ...filter, sortDir: filter.sortDir === 'asc' ? 'desc' : 'asc' })}>{filter.sortDir === 'asc' ? 'Asc ↑' : 'Desc ↓'}</Button>
          </div>
          {sel.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-accent/10 px-4 py-1.5 text-xs" role="toolbar" aria-label="Bulk actions">
              <span className="mr-2 font-medium">{sel.length} selected</span>
              <Button size="sm" variant="ghost" onClick={() => run('Duplicated', () => questionsRepo.bulkDuplicate(sel))}><Copy size={13} />Duplicate</Button>
              <Button size="sm" variant="ghost" onClick={bulkTag}><Tag size={13} />Tag</Button>
              <Dropdown.Root>
                <Dropdown.Trigger asChild><Button size="sm" variant="ghost"><Pencil size={13} />Set…<ChevronDown size={12} /></Button></Dropdown.Trigger>
                <Dropdown.Portal><Dropdown.Content className="z-50 rounded-md border border-line bg-panel p-1 text-xs shadow-xl">
                  {DIFFICULTIES.map((d) => <Dropdown.Item key={d} className="cursor-pointer rounded px-2 py-1 capitalize outline-none data-[highlighted]:bg-panel-3" onSelect={() => setField({ difficulty: d }, `Difficulty set to ${d}`)}>Difficulty: {d}</Dropdown.Item>)}
                  <Dropdown.Separator className="my-1 h-px bg-line" />
                  <Dropdown.Item className="cursor-pointer rounded px-2 py-1 outline-none data-[highlighted]:bg-panel-3" onSelect={() => setField({ status: 'published' }, 'Published')}>Status: published</Dropdown.Item>
                  <Dropdown.Item className="cursor-pointer rounded px-2 py-1 outline-none data-[highlighted]:bg-panel-3" onSelect={() => setField({ status: 'draft' }, 'Marked as draft')}>Status: draft</Dropdown.Item>
                  <Dropdown.Separator className="my-1 h-px bg-line" />
                  {[5, 10, 20, 30, 60].map((t) => <Dropdown.Item key={t} className="cursor-pointer rounded px-2 py-1 outline-none data-[highlighted]:bg-panel-3" onSelect={() => setField({ timeLimit: t }, `Time limit ${t}s`)}>Time limit: {t}s</Dropdown.Item>)}
                  {[1, 5, 10, 20].map((p) => <Dropdown.Item key={p} className="cursor-pointer rounded px-2 py-1 outline-none data-[highlighted]:bg-panel-3" onSelect={() => setField({ points: p }, `Points ${p}`)}>Points: {p}</Dropdown.Item>)}
                </Dropdown.Content></Dropdown.Portal>
              </Dropdown.Root>
              <Dropdown.Root>
                <Dropdown.Trigger asChild><Button size="sm" variant="ghost"><FolderPlus size={13} />Collection<ChevronDown size={12} /></Button></Dropdown.Trigger>
                <Dropdown.Portal><Dropdown.Content className="z-50 rounded-md border border-line bg-panel p-1 text-xs shadow-xl">
                  {collections.length === 0 && <div className="px-2 py-1 text-muted">No collections yet</div>}
                  {collections.map((c) => <Dropdown.Item key={c.id} className="cursor-pointer rounded px-2 py-1 outline-none data-[highlighted]:bg-panel-3" onSelect={() => addToCollection(c.id)}>Add to {c.name}</Dropdown.Item>)}
                  {collections.map((c) => <Dropdown.Item key={`r${c.id}`} className="cursor-pointer rounded px-2 py-1 text-muted outline-none data-[highlighted]:bg-panel-3" onSelect={() => removeFromCollection(c.id)}>Remove from {c.name}</Dropdown.Item>)}
                </Dropdown.Content></Dropdown.Portal>
              </Dropdown.Root>
              <Button size="sm" variant="ghost" onClick={() => setAddToQuiz(true)}><ListPlus size={13} />Add to quiz</Button>
              <Button size="sm" variant="ghost" onClick={() => run('Archived', () => questionsRepo.archive(sel))}><Archive size={13} />Archive</Button>
              <Button size="sm" variant="ghost" onClick={() => run('Restored', () => questionsRepo.restore(sel))}><ArchiveRestore size={13} />Restore</Button>
              <Button size="sm" variant="ghost" onClick={() => run('Exported', async () => downloadBlob(await buildPackage({ kind: 'questions', questionIds: sel }), `questions-${sel.length}.quizmaster.zip`))}><Download size={13} />Export ZIP</Button>
              <Button size="sm" variant="ghost" className="text-danger" onClick={bulkDelete}><Trash2 size={13} />Delete</Button>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          )}
          <div className="flex items-center gap-3 border-b border-line bg-panel-2 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
            <input type="checkbox" aria-label="Select all" checked={filtered.length > 0 && sel.length === filtered.length} onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((r) => r.id)) : new Set())} />
            <span className="w-[71px]">Preview</span><span className="flex-1">Title / answer</span><span className="w-32">Game</span><span className="w-20">Difficulty</span><span className="w-12 text-right">Pts</span><span className="w-20">Status</span><span className="w-28 text-right">Modified</span>
          </div>
          <div ref={parentRef} className="min-h-0 flex-1 overflow-auto" data-testid="question-list">
            {filtered.length === 0 && <div className="p-10 text-center text-sm text-muted">{rows.length ? 'No questions match these filters.' : 'Your question bank is empty. Create your first question!'}</div>}
            <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
              {virt.getVirtualItems().map((vi) => {
                const r = filtered[vi.index];
                return (
                  <div key={r.id} data-testid="question-row" className={cn('absolute left-0 right-0 flex items-center gap-3 border-b border-line/60 px-4 text-xs hover:bg-panel-2', selected.has(r.id) && 'bg-accent/10')} style={{ top: vi.start, height: vi.size }}
                    onDoubleClick={() => navigate(`/edit/${r.id}`)}>
                    <input type="checkbox" aria-label={`Select ${r.title}`} checked={selected.has(r.id)} onClick={(e) => toggle(r.id, vi.index, e)} onChange={() => {}} />
                    <Thumb s={r} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => navigate(`/edit/${r.id}`)}>
                      <div className="truncate font-medium">{r.title}</div>
                      <div className="truncate text-muted">{r.correctAnswer || '—'}{r.tags.length ? ` · ${r.tags.join(', ')}` : ''}</div>
                    </button>
                    <span className="flex w-32 items-center gap-1.5 truncate"><GameIcon type={r.gameType} size={12} />{GAMES[r.gameType].short}</span>
                    <span className="w-20"><Badge color={DIFF_COLOR[r.difficulty]}>{r.difficulty}</Badge></span>
                    <span className="w-12 text-right tabular-nums">{r.points}</span>
                    <span className="w-20 capitalize text-muted">{r.status}</span>
                    <span className="w-28 text-right text-muted">{new Date(r.updatedAt).toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <AddToQuizDialog open={addToQuiz} onOpenChange={setAddToQuiz} questionIds={sel} />
    </div>
  );
}

export function AddToQuizDialog({ open, onOpenChange, questionIds }: { open: boolean; onOpenChange: (o: boolean) => void; questionIds: string[] }) {
  const quizzes = useLiveQuery(() => db.quizzes.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const rounds = useLiveQuery(() => db.rounds.orderBy('order').toArray(), []) ?? [];
  const navigate = useNavigate();
  const add = async (roundId: string) => {
    try { await quizzesRepo.addQuestions(roundId, questionIds); toast.success(`Added ${questionIds.length} question(s) to round`); onOpenChange(false); }
    catch (e) { toast.error('Could not add', errorMessage(e)); }
  };
  const newQuiz = async () => {
    const title = await promptDialog({ title: 'New quiz', defaultValue: 'New quiz' });
    if (!title) return;
    const q = await quizzesRepo.create(title);
    const t = await quizzesRepo.tree(q.id);
    await quizzesRepo.addQuestions(t!.rounds[0].id, questionIds);
    onOpenChange(false);
    navigate(`/quizzes/${q.id}`);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Add ${questionIds.length} question(s) to a quiz`} footer={<Button variant="primary" onClick={newQuiz}><Plus size={14} />Create new quiz</Button>}>
      {quizzes.length === 0 && <p className="text-xs text-muted">No quizzes yet.</p>}
      {quizzes.map((q) => (
        <div key={q.id} className="mb-3">
          <div className="text-xs font-semibold">{q.title}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {rounds.filter((r) => r.quizId === q.id).map((r) => <Button key={r.id} size="sm" variant="outline" onClick={() => add(r.id)}>{r.title}</Button>)}
          </div>
        </div>
      ))}
    </Dialog>
  );
}
