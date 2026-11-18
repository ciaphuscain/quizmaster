import { useLiveQuery } from 'dexie-react-hooks';
import { questionsRepo } from '@/db/repositories/questions';
import { Button } from '@/components/ui/primitives';
import { confirmDialog, toast, errorMessage } from '@/components/ui/overlays';
import { useEditor } from '@/stores/editor';
import { db } from '@/db/database';

export function RevisionHistory({ questionId }: { questionId: string }) {
  const revs = useLiveQuery(() => db.revisions.where('questionId').equals(questionId).reverse().sortBy('createdAt'), [questionId]) ?? [];
  const restore = async (id: string, v: number) => {
    if (!(await confirmDialog({ title: `Restore revision v${v}?`, message: 'The current state is kept as a revision too, so this can be undone.' }))) return;
    try {
      const cur = useEditor.getState().draft;
      if (cur) await questionsRepo.save(cur, { force: true, revisionReason: 'Before restoring older revision' });
      const q = await questionsRepo.restoreRevision(id);
      useEditor.getState().load(q);
      toast.success(`Restored revision v${v}`);
    } catch (e) { toast.error('Restore failed', errorMessage(e)); }
  };
  if (!revs.length) return <div className="text-[11px] text-muted">Revisions are recorded every few minutes while editing and on manual save (Ctrl+S).</div>;
  return (
    <ul className="flex flex-col gap-1">
      {revs.map((r) => (
        <li key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
          <span><span className="font-medium">v{r.version}</span> · {new Date(r.createdAt).toLocaleString()}<br /><span className="text-muted">{r.reason}</span></span>
          <Button size="sm" variant="outline" onClick={() => restore(r.id, r.version)}>Restore</Button>
        </li>
      ))}
    </ul>
  );
}
