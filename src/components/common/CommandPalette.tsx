import { useEffect, useMemo, useRef, useState } from 'react';
import type { Quiz, QuestionSummary } from '@/types/schema';
import { useNavigate } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, CornerDownLeft, ArrowRight, Plus, ListOrdered, Sun, Wand2 } from 'lucide-react';
import { db } from '@/db/database';
import { GAME_LIST, GAMES } from '@/games/registry';
import { GameIcon } from './GameIcon';
import { filterSummaries } from '@/db/repositories/questions';
import { createAndSave } from '@/features/questions/actions';
import { useSettings } from '@/stores/settings';
import { toast, errorMessage } from '@/components/ui/overlays';
import { cn } from '@/utils/misc';
import { normalizeAnswer } from '@/utils/answers';

type Cmd = { id: string; group: string; label: string; hint?: string; icon: React.ReactNode; run: () => void | Promise<void>; keywords?: string };

const PAGES: [string, string][] = [['/', 'Dashboard'], ['/questions', 'Question Bank'], ['/create', 'Create Question'], ['/media', 'Media Library'], ['/collections', 'Collections'], ['/quizzes', 'Round Builder'], ['/templates', 'Templates'], ['/presentation', 'Presentation Studio'], ['/import-export', 'Import / Export & backup'], ['/settings', 'Settings']];

/** Ctrl/Cmd+K: fuzzy launcher for pages, question creation, quizzes and question search. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const navigate = useNavigate();
  const listRef = useRef<HTMLUListElement>(null);
  const summaries = useLiveQuery(() => (open ? db.summaries.toArray() : Promise.resolve([] as QuestionSummary[])), [open]) ?? [];
  const quizzes = useLiveQuery(() => (open ? db.quizzes.toArray() : Promise.resolve([] as Quiz[])), [open]) ?? [];
  const { settings, update } = useSettings();

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); setQ(''); setIdx(0); }
    };
    window.addEventListener('keydown', h);
    const openEvt = () => { setOpen(true); setQ(''); setIdx(0); };
    window.addEventListener('qm-command-palette', openEvt);
    return () => { window.removeEventListener('keydown', h); window.removeEventListener('qm-command-palette', openEvt); };
  }, []);

  const commands = useMemo<Cmd[]>(() => {
    const go = (to: string) => () => navigate(to);
    const base: Cmd[] = [
      ...GAME_LIST.map((g) => ({ id: `new-${g.type}`, group: 'Create', label: `New: ${g.name}`, icon: <GameIcon type={g.type} size={14} />, keywords: `create add ${g.short} ${g.family}`,
        run: async () => { try { const x = await createAndSave(g.type); navigate(`/edit/${x.id}`); } catch (e) { toast.error('Could not create', errorMessage(e)); } } })),
      { id: 'gen-round', group: 'Create', label: 'Generate a country round…', icon: <Wand2 size={14} />, keywords: 'flags borders neighbours geography auto', run: go('/quizzes?generate=1') },
      ...PAGES.map(([to, label]) => ({ id: `page-${to}`, group: 'Go to', label, icon: <ArrowRight size={14} />, run: go(to) })),
      ...quizzes.map((z) => ({ id: `quiz-${z.id}`, group: 'Quizzes', label: z.title, hint: 'Open round builder', icon: <ListOrdered size={14} />, run: go(`/quizzes/${z.id}`) })),
      { id: 'theme', group: 'Actions', label: `Switch to ${settings.theme === 'dark' ? 'light' : 'dark'} theme`, icon: <Sun size={14} />, run: () => update({ theme: settings.theme === 'dark' ? 'light' : 'dark' }) },
      { id: 'new-quiz', group: 'Actions', label: 'New quiz', icon: <Plus size={14} />, run: go('/quizzes?new=1') },
    ];
    const term = normalizeAnswer(q);
    const scored = base.map((c) => {
      if (!term) return [1, c] as const;
      const hay = normalizeAnswer(`${c.label} ${c.keywords ?? ''} ${c.group}`);
      if (hay.startsWith(term)) return [3, c] as const;
      if (term.split(' ').every((w) => hay.includes(w))) return [2, c] as const;
      return [0, c] as const;
    }).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(([, c]) => c);
    const found = q.trim().length >= 2 ? filterSummaries(summaries, { search: q, includeArchived: true }).slice(0, 8).map((s): Cmd => ({
      id: `q-${s.id}`, group: 'Questions', label: s.title, hint: `${GAMES[s.gameType].short} · ${s.correctAnswer}`, icon: <GameIcon type={s.gameType} size={14} />, run: go(`/edit/${s.id}`),
    })) : [];
    return [...found, ...scored].slice(0, 40);
  }, [q, summaries, quizzes, navigate, settings.theme, update]);

  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: 'nearest' }); }, [idx]);
  const run = async (c: Cmd | undefined) => { if (!c) return; setOpen(false); await c.run(); };

  let lastGroup = '';
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[14%] z-[91] w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl" aria-describedby={undefined} data-testid="command-palette">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search size={16} className="text-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions, create, jump to…" aria-label="Command search" data-testid="command-input"
              className="h-12 flex-1 bg-transparent text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(commands.length - 1, i + 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
                if (e.key === 'Enter') { e.preventDefault(); void run(commands[idx]); }
              }} />
            <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">Esc</kbd>
          </div>
          <ul ref={listRef} className="max-h-[50vh] overflow-auto p-1.5" role="listbox" aria-label="Commands">
            {commands.length === 0 && <li className="p-4 text-center text-xs text-muted">No results</li>}
            {commands.map((c, i) => {
              const header = c.group !== lastGroup ? c.group : null; lastGroup = c.group;
              return (
                <li key={c.id}>
                  {header && <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{header}</div>}
                  <button data-idx={i} role="option" aria-selected={i === idx} onMouseMove={() => setIdx(i)} onClick={() => void run(c)}
                    className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px]', i === idx && 'bg-accent/15')}>
                    <span className="text-muted">{c.icon}</span><span className="flex-1 truncate">{c.label}</span>
                    {c.hint && <span className="max-w-[40%] truncate text-xs text-muted">{c.hint}</span>}
                    {i === idx && <CornerDownLeft size={12} className="text-muted" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
