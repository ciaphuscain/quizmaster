import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Eye, EyeOff, Lock, Unlock, Plus, Type, Image as ImageIcon, Square, Smile, Copy, Trash2, Group, Ungroup, Upload, ArrowUp, ArrowDown, Save } from 'lucide-react';
import { db } from '@/db/database';
import { useEditor } from '@/stores/editor';
import type { Layer, QuizQuestionRef } from '@/types/schema';
import { Button, Select, Input } from '@/components/ui/primitives';
import { GameIcon } from '@/components/common/GameIcon';
import { AssetThumb } from '@/components/common/AssetPicker';
import { addLayers, deleteSelected, duplicateSelected, groupSelected, moveLayerTo, ungroupSelected } from '../layerOps';
import { emojiLayer, imageLayer, shapeLayer, textLayer, transform } from '@/engines/scene/factories';
import { importFiles, pickFiles, createAndSave } from '../actions';
import { quizzesRepo, templatesRepo } from '@/db/repositories/other';
import { questionsRepo } from '@/db/repositories/questions';
import { applyTemplate, templateFromQuestion } from '@/games/applyTemplate';
import { TemplatePreview } from '@/features/templates/TemplatePreview';
import { confirmDialog, promptDialog, toast, errorMessage } from '@/components/ui/overlays';
import { cn } from '@/utils/misc';
import { expandGroup } from '@/components/editors/CanvasStage';

const KIND_ICON: Record<Layer['kind'], React.ReactNode> = {
  image: <ImageIcon size={12} />, text: <Type size={12} />, emoji: <Smile size={12} />, shape: <Square size={12} />,
  country: <span className="text-[10px]">🌍</span>, search: <span className="text-[10px]">🔎</span>, dialogue: <span className="text-[10px]">❝</span>,
};

export function LayersPanel() {
  const layers = useEditor((s) => s.draft?.scene.layers) ?? [];
  const selection = useEditor((s) => s.selection);
  const { select, update } = useEditor.getState();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const reversed = [...layers].reverse();
  const toggle = (id: string, key: 'visible' | 'locked') => update((d) => { const l = d.scene.layers.find((x) => x.id === id); if (l) l[key] = !l[key]; });
  const W = useEditor.getState().draft?.scene.width ?? 1920, H = useEditor.getState().draft?.scene.height ?? 1080;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap gap-0.5 border-b border-line p-1.5">
        <Button size="icon-sm" variant="ghost" tooltip="Add text" onClick={() => addLayers([textLayer('New text', transform(W / 2 - 400, H / 2 - 75, 800, 150))])}><Type size={13} /></Button>
        <Button size="icon-sm" variant="ghost" tooltip="Add image" onClick={() => addLayers([imageLayer(null, transform(W / 2 - 250, H / 2 - 250, 500, 500))])}><ImageIcon size={13} /></Button>
        <Button size="icon-sm" variant="ghost" tooltip="Add rectangle" onClick={() => addLayers([shapeLayer('rect', transform(W / 2 - 200, H / 2 - 100, 400, 200), { radius: 16 })])}><Square size={13} /></Button>
        <Button size="icon-sm" variant="ghost" tooltip="Add emoji" onClick={() => addLayers([emojiLayer('⭐', transform(W / 2 - 120, H / 2 - 120, 240, 240))])}><Smile size={13} /></Button>
        <span className="mx-0.5 w-px bg-line" />
        <Button size="icon-sm" variant="ghost" tooltip="Duplicate (Ctrl+D)" disabled={!selection.length} onClick={duplicateSelected}><Copy size={13} /></Button>
        <Button size="icon-sm" variant="ghost" tooltip="Group (Ctrl+G)" disabled={selection.length < 2} onClick={groupSelected}><Group size={13} /></Button>
        <Button size="icon-sm" variant="ghost" tooltip="Ungroup (Ctrl+Shift+G)" disabled={!selection.length} onClick={ungroupSelected}><Ungroup size={13} /></Button>
        <Button size="icon-sm" variant="ghost" tooltip="Delete (Del)" disabled={!selection.length} onClick={deleteSelected}><Trash2 size={13} /></Button>
      </div>
      <ul className="flex-1 overflow-auto p-1" aria-label="Layers" data-testid="layers">
        {reversed.map((l) => {
          const idx = layers.indexOf(l);
          return (
            <li key={l.id} draggable onDragStart={() => setDragId(l.id)} onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId && dragId !== l.id) moveLayerTo(dragId, idx); setDragId(null); }}
              className={cn('group flex items-center gap-1.5 rounded px-1.5 py-1 text-xs', selection.includes(l.id) ? 'bg-accent/15 text-fg' : 'hover:bg-panel-2', !l.visible && 'opacity-50')}
              onClick={(e) => select(expandGroup(layers, e.shiftKey ? (selection.includes(l.id) ? selection.filter((x) => x !== l.id) : [...selection, l.id]) : [l.id]))}>
              <span className="text-muted">{KIND_ICON[l.kind]}</span>
              {renaming === l.id ? (
                <Input autoFocus className="h-6" defaultValue={l.name} onBlur={(e) => { update((d) => { const x = d.scene.layers.find((y) => y.id === l.id); if (x) x.name = e.target.value || x.name; }); setRenaming(null); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(null); }} />
              ) : (
                <span className="flex-1 truncate" onDoubleClick={() => setRenaming(l.id)} title="Double-click to rename">
                  {l.name}{l.groupId ? <span className="text-muted"> ⧉</span> : null}
                  {l.revealStep > 0 && <span className="ml-1 rounded bg-panel-3 px-1 text-[10px] text-muted">#{l.revealStep}</span>}
                  {l.answerOnly && <span className="ml-1 rounded bg-success/20 px-1 text-[10px] text-success">answer</span>}
                </span>
              )}
              <button aria-label="Move layer up" className="hidden text-muted hover:text-fg group-hover:block" onClick={(e) => { e.stopPropagation(); moveLayerTo(l.id, idx + 1); }}><ArrowUp size={11} /></button>
              <button aria-label="Move layer down" className="hidden text-muted hover:text-fg group-hover:block" onClick={(e) => { e.stopPropagation(); moveLayerTo(l.id, idx - 1); }}><ArrowDown size={11} /></button>
              <button aria-label={l.locked ? 'Unlock' : 'Lock'} className="text-muted hover:text-fg" onClick={(e) => { e.stopPropagation(); toggle(l.id, 'locked'); }}>{l.locked ? <Lock size={11} /> : <Unlock size={11} className="opacity-40" />}</button>
              <button aria-label={l.visible ? 'Hide' : 'Show'} className="text-muted hover:text-fg" onClick={(e) => { e.stopPropagation(); toggle(l.id, 'visible'); }}>{l.visible ? <Eye size={11} /> : <EyeOff size={11} />}</button>
            </li>
          );
        })}
        <li className="px-1.5 py-1 text-[11px] text-muted">Background (select nothing to edit)</li>
      </ul>
    </div>
  );
}

export function QuestionNavigator() {
  const navigate = useNavigate();
  const draft = useEditor((s) => s.draft)!;
  const [scope, setScope] = useState<string>('game');
  const summaries = useLiveQuery(() => db.summaries.orderBy('updatedAt').reverse().limit(500).toArray(), []) ?? [];
  const refs = useLiveQuery(() => db.quizQuestionRefs.where('questionId').equals(draft.id).toArray(), [draft.id]) ?? [];
  const rounds = useLiveQuery(async () => (await db.rounds.bulkGet([...new Set(refs.map((r) => r.roundId))])).filter(Boolean), [refs]) ?? [];
  const roundRefs = useLiveQuery(() => (scope.startsWith('round:') ? db.quizQuestionRefs.where('roundId').equals(scope.slice(6)).sortBy('order') : Promise.resolve([] as QuizQuestionRef[])), [scope]) ?? [];
  const byId = useMemo(() => new Map(summaries.map((s) => [s.id, s])), [summaries]);
  const list = scope.startsWith('round:') ? roundRefs.map((r) => byId.get(r.questionId)).filter((x): x is NonNullable<typeof x> => !!x)
    : summaries.filter((s) => scope === 'all' || s.gameType === draft.gameType).slice(0, 200);
  const move = async (i: number, d: -1 | 1) => {
    const ids = roundRefs.map((r) => r.id); const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await quizzesRepo.reorderRefs(scope.slice(6), ids);
  };
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b border-line p-1.5">
        <Select className="h-7 text-xs" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Navigator scope">
          <option value="game">Same game type</option><option value="all">All recent</option>
          {rounds.map((r) => r && <option key={r.id} value={`round:${r.id}`}>Round: {r.title}</option>)}
        </Select>
        <Button size="icon-sm" variant="ghost" tooltip="New question of this type" onClick={async () => { const q = await createAndSave(draft.gameType); navigate(`/edit/${q.id}`); }}><Plus size={13} /></Button>
        <Button size="icon-sm" variant="ghost" tooltip="Duplicate this question" onClick={async () => { const q = await questionsRepo.duplicate(draft.id); navigate(`/edit/${q.id}`); toast.success('Duplicated'); }}><Copy size={13} /></Button>
      </div>
      <ul className="flex-1 overflow-auto p-1" aria-label="Questions">
        {list.map((s, i) => (
          <li key={s.id} className={cn('flex items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-panel-2', s.id === draft.id && 'bg-accent/15')}>
            <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => navigate(`/edit/${s.id}`)}>
              {scope.startsWith('round:') && <span className="w-4 text-right text-muted">{i + 1}</span>}
              <GameIcon type={s.gameType} size={12} /><span className="truncate">{s.title}</span>
            </button>
            {scope.startsWith('round:') && <>
              <button aria-label="Move earlier" onClick={() => move(i, -1)} className="text-muted hover:text-fg"><ArrowUp size={11} /></button>
              <button aria-label="Move later" onClick={() => move(i, 1)} className="text-muted hover:text-fg"><ArrowDown size={11} /></button>
            </>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AssetsTab() {
  const assets = useLiveQuery(() => db.assets.where('type').equals('image').reverse().sortBy('createdAt'), []) ?? [];
  const W = useEditor.getState().draft?.scene.width ?? 1920, H = useEditor.getState().draft?.scene.height ?? 1080;
  const addImage = (id: string) => {
    const st = useEditor.getState();
    const sel = st.draft?.scene.layers.find((l) => st.selection.includes(l.id) && l.kind === 'image');
    if (sel) { st.update((d) => { const l = d.scene.layers.find((x) => x.id === sel.id); if (l?.kind === 'image') l.assetId = id; }); return; }
    addLayers([imageLayer(id, transform(W / 2 - 250, H / 2 - 250, 500, 500))]);
  };
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-1.5"><Button size="sm" variant="outline" className="w-full" onClick={async () => { const a = await importFiles(await pickFiles('image/*', true), 'image'); a.forEach((x) => addImage(x.id)); }}><Upload size={12} />Upload images</Button></div>
      <p className="px-2 pt-1 text-[11px] text-muted">Click to place (or replace the selected image); drag onto the canvas.</p>
      <div className="grid flex-1 auto-rows-min grid-cols-3 gap-1 overflow-auto p-1.5">
        {assets.map((a) => (
          <button key={a.id} draggable onDragStart={(e) => e.dataTransfer.setData('application/x-qm-asset', a.id)} onClick={() => addImage(a.id)} title={a.name} className="rounded border border-line p-0.5 hover:border-accent">
            <AssetThumb asset={a} size={64} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function TemplatesTab() {
  const draft = useEditor((s) => s.draft)!;
  const templates = useLiveQuery(() => templatesRepo.list(draft.gameType), [draft.gameType]) ?? [];
  const apply = async (id: string) => {
    const t = templates.find((x) => x.id === id); if (!t) return;
    if (!(await confirmDialog({ title: `Apply template “${t.name}”?`, message: 'The layout is replaced. Your answer, media and country are kept. You can undo this.' }))) return;
    const cur = useEditor.getState().draft!;
    const next = applyTemplate(cur, t);
    useEditor.getState().update((d) => { Object.assign(d, { ...next, version: d.version }); });
    await templatesRepo.markUsed(t.id);
    toast.success(`Applied ${t.name}`);
  };
  const saveAs = async () => {
    const name = await promptDialog({ title: 'Save as template', message: 'Saves this layout, styling, effects and defaults. Media is referenced, not copied.', defaultValue: `${draft.title || 'My'} template` });
    if (!name) return;
    try { await templatesRepo.save(templateFromQuestion(useEditor.getState().draft!, name)); toast.success('Template saved'); } catch (e) { toast.error('Could not save template', errorMessage(e)); }
  };
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-1.5"><Button size="sm" variant="outline" className="w-full" onClick={saveAs} data-testid="save-template"><Save size={12} />Save current as template</Button></div>
      <div className="flex flex-1 flex-col gap-2 overflow-auto p-2">
        {templates.map((t) => (
          <button key={t.id} onClick={() => apply(t.id)} className="flex flex-col gap-1 rounded border border-line p-1.5 text-left hover:border-accent">
            <TemplatePreview template={t} width={196} />
            <span className="text-[11px] font-medium">{t.name}{t.builtIn ? '' : ' · mine'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
