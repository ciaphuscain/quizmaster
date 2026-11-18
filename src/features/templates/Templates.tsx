import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Copy, Pencil, Trash2, Download, Upload, Plus } from 'lucide-react';
import { z } from 'zod';
import { PageHeader } from '@/app/AppLayout';
import { Button, Select, Badge } from '@/components/ui/primitives';
import { templatesRepo } from '@/db/repositories/other';
import { GAME_LIST, GAMES } from '@/games/registry';
import { GameIcon } from '@/components/common/GameIcon';
import { TemplatePreview } from './TemplatePreview';
import { confirmDialog, promptDialog, toast, errorMessage } from '@/components/ui/overlays';
import { createAndSave, downloadBlob, pickFiles, safeFilename } from '@/features/questions/actions';
import { TemplateSchema, type GameType, type Template } from '@/types/schema';
import { uid } from '@/utils/id';
import { db } from '@/db/database';

export default function Templates() {
  const navigate = useNavigate();
  const [game, setGame] = useState<GameType | 'all'>('all');
  const templates = useLiveQuery(() => templatesRepo.list(game === 'all' ? undefined : game), [game]) ?? [];
  const exportT = (t: Template) => downloadBlob(new Blob([JSON.stringify({ format: 'quizmaster-template', formatVersion: 1, template: t }, null, 2)], { type: 'application/json' }), `${safeFilename(t.name)}.template.json`);
  const importT = async () => {
    const [f] = await pickFiles('application/json,.json');
    if (!f) return;
    try {
      const parsed = z.object({ template: TemplateSchema }).parse(JSON.parse(await f.text()));
      const t = { ...parsed.template, id: uid('t'), builtIn: false, createdAt: Date.now(), updatedAt: Date.now() };
      await templatesRepo.save(t);
      toast.success(`Imported template ${t.name}`, 'Media referenced by the template must exist in this library (use ZIP packages to move media).');
    } catch (e) { toast.error('Not a valid template file', errorMessage(e)); }
  };
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Templates" subtitle="Reusable layouts, styles, effects and defaults. Applying a template never modifies the template."
        actions={<><Button variant="outline" onClick={importT}><Upload size={14} />Import</Button></>} />
      <div className="flex items-center gap-2 border-b border-line bg-panel px-6 py-2">
        <Select className="w-72" value={game} onChange={(e) => setGame(e.target.value as GameType | 'all')} aria-label="Game filter">
          <option value="all">All game types</option>{GAME_LIST.map((g) => <option key={g.type} value={g.type}>{g.name}</option>)}
        </Select>
        <span className="text-xs text-muted">Create your own from any question: Editor → Templates → “Save current as template”.</span>
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
          {templates.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3">
              <TemplatePreview template={t} width={224} />
              <div className="flex items-center gap-1.5"><GameIcon type={t.gameType} size={13} /><span className="flex-1 truncate text-[13px] font-medium">{t.name}</span>{t.builtIn ? <Badge>built-in</Badge> : <Badge color="#22c55e">mine</Badge>}</div>
              <div className="text-[11px] text-muted">{GAMES[t.gameType].short} · {t.description || '—'}</div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="primary" onClick={async () => { const q = await createAndSave(t.gameType, t.id); navigate(`/edit/${q.id}`); }}><Plus size={12} />Use</Button>
                <Button size="sm" variant="ghost" onClick={async () => { await templatesRepo.duplicate(t.id); toast.success('Duplicated'); }}><Copy size={12} />Duplicate</Button>
                <Button size="sm" variant="ghost" onClick={() => exportT(t)}><Download size={12} />Export</Button>
                {!t.builtIn && <>
                  <Button size="sm" variant="ghost" onClick={async () => { const n = await promptDialog({ title: 'Rename template', defaultValue: t.name }); if (n) await templatesRepo.rename(t.id, n); }}><Pencil size={12} />Rename</Button>
                  <Button size="sm" variant="ghost" className="text-danger" onClick={async () => { if (await confirmDialog({ title: `Delete template “${t.name}”?`, message: 'Questions created from it are not affected.', danger: true, confirmLabel: 'Delete' })) { await templatesRepo.remove(t.id); void db; } }}><Trash2 size={12} />Delete</Button>
                </>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
