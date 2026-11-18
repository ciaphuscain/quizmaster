import { useState } from 'react';
import type { QuestionSummary } from '@/types/schema';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, FolderKanban } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/app/AppLayout';
import { Button, Input, Textarea } from '@/components/ui/primitives';
import { collectionsRepo } from '@/db/repositories/other';
import { confirmDialog, promptDialog, toast } from '@/components/ui/overlays';
import { GameIcon } from '@/components/common/GameIcon';

const COLORS = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#eab308'];

export default function Collections() {
  const navigate = useNavigate();
  const cols = useLiveQuery(() => db.collections.orderBy('name').toArray(), []) ?? [];
  const counts = useLiveQuery(() => collectionsRepo.counts(), []) ?? {};
  const [sel, setSel] = useState<string | null>(null);
  const qs = useLiveQuery(() => (sel ? db.summaries.where('collectionIds').equals(sel).toArray() : Promise.resolve([] as QuestionSummary[])), [sel]) ?? [];
  const cur = cols.find((c) => c.id === sel);
  const create = async () => {
    const name = await promptDialog({ title: 'New collection', message: 'e.g. Movie Night, World Geography, Difficult Questions' });
    if (!name) return;
    const c = await collectionsRepo.create(name, '', COLORS[cols.length % COLORS.length]);
    setSel(c.id); toast.success('Collection created');
  };
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Quiz Collections" subtitle="Organise questions into themed groups. A question can belong to many collections." actions={<Button variant="primary" onClick={create} data-testid="new-collection"><Plus size={14} />New collection</Button>} />
      <div className="flex min-h-0 flex-1">
        <ul className="w-72 shrink-0 overflow-auto border-r border-line bg-panel p-2">
          {cols.length === 0 && <li className="p-4 text-center text-xs text-muted">No collections yet.</li>}
          {cols.map((c) => (
            <li key={c.id}><button onClick={() => setSel(c.id)} className={`flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs hover:bg-panel-2 ${sel === c.id ? 'bg-panel-3' : ''}`}>
              <span className="h-3 w-3 rounded-full" style={{ background: c.color }} /><span className="flex-1 truncate font-medium">{c.name}</span><span className="text-muted">{counts[c.id] ?? 0}</span>
            </button></li>
          ))}
        </ul>
        <div className="flex-1 overflow-auto p-6">
          {!cur ? <div className="flex h-full flex-col items-center justify-center gap-2 text-muted"><FolderKanban size={28} />Select a collection</div> : (
            <div className="mx-auto max-w-3xl">
              <div className="mb-4 flex items-center gap-2">
                <Input className="text-base font-semibold" defaultValue={cur.name} key={cur.id} onBlur={(e) => collectionsRepo.update(cur.id, { name: e.target.value || cur.name })} aria-label="Collection name" />
                <div className="flex gap-1">{COLORS.map((c) => <button key={c} aria-label={`Colour ${c}`} onClick={() => collectionsRepo.update(cur.id, { color: c })} className={`h-5 w-5 rounded-full ${cur.color === c ? 'ring-2 ring-fg' : ''}`} style={{ background: c }} />)}</div>
                <Button variant="ghost" className="text-danger" onClick={async () => { if (await confirmDialog({ title: `Delete collection “${cur.name}”?`, message: 'Questions are not deleted; they are only removed from this collection.', danger: true, confirmLabel: 'Delete' })) { await collectionsRepo.remove(cur.id); setSel(null); } }}><Trash2 size={14} /></Button>
              </div>
              <Textarea rows={2} placeholder="Description" defaultValue={cur.description} key={`d${cur.id}`} onBlur={(e) => collectionsRepo.update(cur.id, { description: e.target.value })} />
              <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">{qs.length} questions</h2>
              <p className="mb-2 text-[11px] text-muted">Add questions from the Question Bank (bulk “Collection” action) or the editor's Question tab.</p>
              <ul className="rounded border border-line">
                {qs.map((q) => (
                  <li key={q.id} className="flex items-center gap-2 border-b border-line/50 px-3 py-2 text-xs last:border-0">
                    <GameIcon type={q.gameType} size={13} /><button className="flex-1 truncate text-left hover:underline" onClick={() => navigate(`/edit/${q.id}`)}>{q.title}</button>
                    <Button size="sm" variant="ghost" onClick={async () => { const full = await db.questions.get(q.id); if (full) { const { questionsRepo } = await import('@/db/repositories/questions'); await questionsRepo.bulkUpdate([q.id], (x) => ({ ...x, collectionIds: x.collectionIds.filter((c) => c !== cur.id) })); } }}>Remove</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
