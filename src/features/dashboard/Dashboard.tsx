import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, Plus, FileText, CheckCircle2, ListOrdered, Images, Library } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/app/AppLayout';
import { Button, Input } from '@/components/ui/primitives';
import { GAME_LIST, GAMES } from '@/games/registry';
import { GameIcon } from '@/components/common/GameIcon';
import { templatesRepo } from '@/db/repositories/other';
import { createAndSave } from '@/features/questions/actions';
import { toast, errorMessage } from '@/components/ui/overlays';
import { filterSummaries } from '@/db/repositories/questions';
import { useSettings } from '@/stores/settings';

function Stat({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
      <div className="text-muted">{icon}</div>
      <div><div className="text-xl font-semibold tabular-nums" data-testid={`stat-${label}`}>{value}</div><div className="text-[11px] text-muted">{label}</div></div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const summaries = useLiveQuery(() => db.summaries.toArray(), []);
  const quizCount = useLiveQuery(() => db.quizzes.count(), []);
  const assetCount = useLiveQuery(() => db.assets.count(), []);
  const recentTemplates = useLiveQuery(() => templatesRepo.recentlyUsed(6), []);
  const lastBackup = useSettings((s) => s.settings.lastBackupAt);
  const [search, setSearch] = useState('');
  const stats = useMemo(() => {
    const s = summaries ?? [];
    const byGame: Record<string, number> = {};
    for (const r of s) byGame[r.gameType] = (byGame[r.gameType] ?? 0) + 1;
    return { total: s.length, drafts: s.filter((r) => r.status === 'draft').length, published: s.filter((r) => r.status === 'published').length, byGame };
  }, [summaries]);
  const recent = useMemo(() => [...(summaries ?? [])].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8), [summaries]);
  const results = useMemo(() => (search ? filterSummaries(summaries ?? [], { search, includeArchived: true }).slice(0, 8) : []), [summaries, search]);
  const max = Math.max(1, ...Object.values(stats.byGame));

  const quick = async (g: typeof GAME_LIST[number]['type'], templateId?: string) => {
    try { const q = await createAndSave(g, templateId); navigate(`/edit/${q.id}`); } catch (e) { toast.error('Could not create question', errorMessage(e)); }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Dashboard" subtitle="Your quiz authoring overview" actions={<Button variant="primary" onClick={() => navigate('/create')}><Plus size={14} />New question</Button>} />
      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          {stats.total > 50 && (!lastBackup || Date.now() - lastBackup > 7 * 86400000) && (
            <div className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
              Your work is stored only in this browser. <Link to="/import-export" className="font-semibold text-accent underline">Create a backup</Link> regularly ({lastBackup ? `last ${new Date(lastBackup).toLocaleDateString()}` : 'never backed up'}).
            </div>
          )}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-muted" />
            <Input className="h-9 pl-9" placeholder="Search the question bank…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search questions" />
            {search && (
              <div className="absolute z-10 mt-1 w-full rounded-md border border-line bg-panel shadow-xl">
                {results.length === 0 && <div className="p-3 text-xs text-muted">No matches</div>}
                {results.map((r) => (
                  <button key={r.id} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-panel-2" onClick={() => navigate(`/edit/${r.id}`)}>
                    <GameIcon type={r.gameType} size={13} /><span className="flex-1 truncate">{r.title}</span><span className="text-muted">{r.correctAnswer}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Total questions" value={stats.total} icon={<Library size={18} />} />
            <Stat label="Drafts" value={stats.drafts} icon={<FileText size={18} />} />
            <Stat label="Published" value={stats.published} icon={<CheckCircle2 size={18} />} />
            <Stat label="Quizzes" value={quizCount ?? 0} icon={<ListOrdered size={18} />} />
            <Stat label="Media assets" value={assetCount ?? 0} icon={<Images size={18} />} />
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <section className="rounded-lg border border-line bg-panel lg:col-span-2">
              <h2 className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Quick create</h2>
              <div className="grid grid-cols-2 gap-1.5 p-3 md:grid-cols-3">
                {GAME_LIST.map((g) => (
                  <button key={g.type} onClick={() => quick(g.type)} data-testid={`quick-${g.type}`}
                    className="flex items-center gap-2 rounded-md border border-line bg-panel-2 px-2.5 py-2 text-left text-xs hover:border-accent/60 hover:bg-panel-3">
                    <GameIcon type={g.type} size={15} /><span className="flex-1 truncate">{g.name.replace('Guess the ', '')}</span>
                    <span className="tabular-nums text-muted">{stats.byGame[g.type] ?? 0}</span>
                  </button>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-line bg-panel">
              <h2 className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Questions by game</h2>
              <div className="flex flex-col gap-1.5 p-3">
                {GAME_LIST.map((g) => (
                  <div key={g.type} className="flex items-center gap-2 text-[11px]">
                    <span className="w-24 truncate text-muted">{g.short}</span>
                    <div className="h-2 flex-1 rounded bg-panel-3"><div className="h-2 rounded" style={{ width: `${((stats.byGame[g.type] ?? 0) / max) * 100}%`, background: g.color }} /></div>
                    <span className="w-6 text-right tabular-nums">{stats.byGame[g.type] ?? 0}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <section className="rounded-lg border border-line bg-panel lg:col-span-2">
              <h2 className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Recently modified<Link to="/questions" className="normal-case text-accent">View all</Link></h2>
              {recent.length === 0 ? <div className="p-6 text-center text-xs text-muted">No questions yet — use Quick create to start.</div> : (
                <ul>
                  {recent.map((r) => (
                    <li key={r.id}>
                      <button className="flex w-full items-center gap-3 border-b border-line/60 px-4 py-2 text-left text-xs hover:bg-panel-2" onClick={() => navigate(`/edit/${r.id}`)}>
                        <GameIcon type={r.gameType} size={14} />
                        <span className="flex-1 truncate font-medium">{r.title}</span>
                        <span className="text-muted">{GAMES[r.gameType].short}</span>
                        <span className="w-16 text-right text-muted capitalize">{r.status}</span>
                        <span className="w-28 text-right text-muted">{new Date(r.updatedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="rounded-lg border border-line bg-panel">
              <h2 className="border-b border-line px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted">Recently used templates</h2>
              <div className="flex flex-col p-2">
                {!recentTemplates?.length && <div className="p-4 text-center text-xs text-muted">Templates you use appear here.</div>}
                {recentTemplates?.map((t) => (
                  <button key={t.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-panel-2" onClick={() => quick(t.gameType, t.id)}>
                    <GameIcon type={t.gameType} size={13} /><span className="flex-1 truncate">{t.name}</span><span className="text-muted">{GAMES[t.gameType].short}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
