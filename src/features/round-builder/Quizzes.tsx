import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Presentation, ListOrdered } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/app/AppLayout';
import { Button } from '@/components/ui/primitives';
import { quizzesRepo } from '@/db/repositories/other';
import { confirmDialog, promptDialog } from '@/components/ui/overlays';

export default function Quizzes() {
  const navigate = useNavigate();
  const quizzes = useLiveQuery(() => db.quizzes.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const rounds = useLiveQuery(() => db.rounds.toArray(), []) ?? [];
  const refs = useLiveQuery(() => db.quizQuestionRefs.toArray(), []) ?? [];
  const create = async () => {
    const t = await promptDialog({ title: 'New quiz', defaultValue: 'Friday Pub Quiz' });
    if (t) { const q = await quizzesRepo.create(t); navigate(`/quizzes/${q.id}`); }
  };
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Round Builder" subtitle="Quizzes are ordered rounds of question references — no media is duplicated." actions={<Button variant="primary" onClick={create} data-testid="new-quiz"><Plus size={14} />New quiz</Button>} />
      <div className="flex-1 overflow-auto p-6">
        {quizzes.length === 0 && <div className="py-16 text-center text-sm text-muted">No quizzes yet. Create one, then add rounds and questions.</div>}
        <div className="mx-auto grid max-w-5xl grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {quizzes.map((q) => {
            const rs = rounds.filter((r) => r.quizId === q.id), n = refs.filter((r) => r.quizId === q.id).length;
            return (
              <div key={q.id} className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-4">
                <button className="text-left" onClick={() => navigate(`/quizzes/${q.id}`)}><div className="text-sm font-semibold">{q.title}</div><div className="text-xs text-muted">{rs.length} rounds · {n} questions · edited {new Date(q.updatedAt).toLocaleDateString()}</div></button>
                <div className="mt-auto flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => navigate(`/quizzes/${q.id}`)}><ListOrdered size={13} />Edit rounds</Button>
                  <Button size="sm" variant="primary" disabled={!n} onClick={() => window.open(`/present/${q.id}`, '_blank')}><Presentation size={13} />Present</Button>
                  <Button size="icon-sm" variant="ghost" className="ml-auto text-danger" tooltip="Delete quiz" onClick={async () => { if (await confirmDialog({ title: `Delete quiz “${q.title}”?`, message: 'Rounds are deleted; the questions themselves stay in the bank.', danger: true, confirmLabel: 'Delete' })) await quizzesRepo.remove(q.id); }}><Trash2 size={13} /></Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
