import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { Save, Undo2, Redo2, Copy, ClipboardPaste, Download, Presentation, Keyboard, MousePointer2, Hand, Type, Square, Circle, PenLine, ZoomIn, ZoomOut, Maximize, Eye, Grid3x3, CheckCircle2, AlertTriangle, Loader2, CopyPlus, Shield } from 'lucide-react';
import { questionsRepo } from '@/db/repositories/questions';
import { useEditor, type Tool } from '@/stores/editor';
import { useSettings } from '@/stores/settings';
import { useAutosave } from '@/hooks/useAutosave';
import { useHotkeys } from '@/hooks/useHotkeys';
import { CanvasStage } from '@/components/editors/CanvasStage';
import { Button, Kbd, Select } from '@/components/ui/primitives';
import { Dialog, toast, errorMessage } from '@/components/ui/overlays';
import { GAMES, questionDisplayTitle } from '@/games/registry';
import { GameIcon } from '@/components/common/GameIcon';
import { GamePanel } from '@/games/panels/GamePanel';
import { QuestionPanel } from './panels/QuestionPanel';
import { LayerInspector } from './panels/LayerInspector';
import { AssetsTab, LayersPanel, QuestionNavigator, TemplatesTab } from './panels/LeftPanels';
import { ImageStudio } from '@/features/image-editor/ImageStudio';
import { copySelected, deleteSelected, duplicateSelected, groupSelected, nudge, pasteClipboard, reorder, setAspect, ungroupSelected } from './layerOps';
import { maxRevealStep, ASPECTS } from '@/engines/scene/factories';
import { ExportImageDialog } from '@/features/exports/ExportImageDialog';
import { cn, formatTime } from '@/utils/misc';
import type { Question } from '@/types/schema';

const zoom = (d: string) => window.dispatchEvent(new CustomEvent('qm-zoom', { detail: d }));

function SaveStatus() {
  const { saveState, saveError, dirty, lastSavedAt } = useEditor();
  if (saveState === 'saving') return <span className="flex items-center gap-1 text-[11px] text-muted" data-testid="save-status"><Loader2 size={12} className="animate-spin" />Saving…</span>;
  if (saveState === 'error') return <span className="flex items-center gap-1 text-[11px] text-danger" data-testid="save-status" title={saveError ?? ''}><AlertTriangle size={12} />Save failed — retrying on next change</span>;
  if (saveState === 'conflict') return <span className="flex items-center gap-1 text-[11px] text-danger" data-testid="save-status"><AlertTriangle size={12} />Conflict</span>;
  if (dirty) return <span className="text-[11px] text-muted" data-testid="save-status">Unsaved changes</span>;
  return <span className="flex items-center gap-1 text-[11px] text-success" data-testid="save-status"><CheckCircle2 size={12} />Saved{lastSavedAt ? ` ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span>;
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl+S', 'Save now (records a revision)'], ['Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+C / Ctrl+V', 'Copy / paste elements'], ['Ctrl+D', 'Duplicate elements'],
  ['Delete / Backspace', 'Delete elements'], ['Arrow keys (+Shift)', 'Nudge 1px (10px)'], ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup'], ['[ / ]', 'Send backward / bring forward'],
  ['V H T R O P', 'Select, hand, text, rectangle, ellipse, pen tools'], ['Space + drag, middle mouse', 'Pan canvas'], ['Ctrl + wheel, + / -, 0', 'Zoom, fit'], ['A', 'Toggle answer preview'],
  ['Alt while dragging', 'Disable snapping'], ['Shift while resizing / rotating', 'Toggle aspect lock / snap 15°'], ['Esc', 'Deselect'], ['?', 'This help'],
];

export default function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const draft = useEditor((s) => s.draft);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [studioLayer, setStudioLayer] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [rightTab, setRightTab] = useState('game');
  const [leftTab, setLeftTab] = useState('layers');

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    questionsRepo.get(id!).then((q) => {
      if (!alive) return;
      if (!q) setLoadError('Question not found. It may have been deleted.');
      else useEditor.getState().load(q);
    }).catch((e) => setLoadError(errorMessage(e)));
    return () => { alive = false; };
  }, [id]);
  useEffect(() => () => useEditor.getState().unload(), []);
  useEffect(() => {
    const h = () => setRightTab('element');
    window.addEventListener('qm-focus-inspector', h);
    return () => window.removeEventListener('qm-focus-inspector', h);
  }, []);
  const save = useAutosave();
  const ed = useEditor;

  useHotkeys({
    'mod+s': () => void save('Manual save').then(() => toast.success('Saved')),
    'mod+z': () => ed.getState().undo(),
    'mod+shift+z': () => ed.getState().redo(),
    'mod+y': () => ed.getState().redo(),
    'mod+c': copySelected, 'mod+v': pasteClipboard, 'mod+d': duplicateSelected,
    'mod+g': groupSelected, 'mod+shift+g': ungroupSelected,
    delete: deleteSelected, backspace: deleteSelected,
    arrowleft: () => nudge(-1, 0), arrowright: () => nudge(1, 0), arrowup: () => nudge(0, -1), arrowdown: () => nudge(0, 1),
    'shift+arrowleft': () => nudge(-10, 0), 'shift+arrowright': () => nudge(10, 0), 'shift+arrowup': () => nudge(0, -10), 'shift+arrowdown': () => nudge(0, 10),
    '[': () => reorder(ed.getState().selection, 'down'), ']': () => reorder(ed.getState().selection, 'up'),
    v: () => ed.getState().setTool('select'), h: () => ed.getState().setTool('hand'), t: () => ed.getState().setTool('text'),
    r: () => ed.getState().setTool('rect'), o: () => ed.getState().setTool('ellipse'), p: () => ed.getState().setTool('pen'),
    a: () => ed.setState({ previewAnswer: !ed.getState().previewAnswer }),
    '=': () => zoom('in'), '+': () => zoom('in'), '-': () => zoom('out'), '0': () => zoom('fit'),
    escape: () => ed.getState().select([]), '?': () => setHelp(true), 'shift+?': () => setHelp(true),
  }, { enabled: !studioLayer, allowInInputs: ['mod+s'] });

  if (loadError) return <div className="flex h-full flex-col items-center justify-center gap-3 text-muted"><p>{loadError}</p><Button onClick={() => navigate('/questions')}>Back to Question Bank</Button></div>;
  if (!draft || draft.id !== id) return <div className="flex h-full items-center justify-center text-muted">Loading question…</div>;

  return (
    <div className="flex h-full flex-col">
      <Toolbar onSave={() => void save('Manual save').then(() => toast.success('Saved'))} onHelp={() => setHelp(true)} />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel" aria-label="Left sidebar">
          <Tabs.Root value={leftTab} onValueChange={setLeftTab} className="flex min-h-0 flex-1 flex-col">
            <Tabs.List className="flex border-b border-line text-[11px]">
              {[['layers', 'Layers'], ['questions', 'Questions'], ['assets', 'Assets'], ['templates', 'Templates']].map(([v, l]) => (
                <Tabs.Trigger key={v} value={v} className="flex-1 py-2 text-muted data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-fg">{l}</Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value="layers" className="min-h-0 flex-1"><LayersPanel /></Tabs.Content>
            <Tabs.Content value="questions" className="min-h-0 flex-1"><QuestionNavigator /></Tabs.Content>
            <Tabs.Content value="assets" className="min-h-0 flex-1"><AssetsTab /></Tabs.Content>
            <Tabs.Content value="templates" className="min-h-0 flex-1"><TemplatesTab /></Tabs.Content>
          </Tabs.Root>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col" aria-label="Canvas">
          <ToolStrip />
          <div className="min-h-0 flex-1"><CanvasStage /></div>
          <PreviewBar />
        </section>
        <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-panel" aria-label="Properties">
          <Tabs.Root value={rightTab} onValueChange={setRightTab} className="flex min-h-0 flex-1 flex-col">
            <Tabs.List className="flex border-b border-line text-[11px]">
              {[['game', GAMES[draft.gameType].short], ['question', 'Question'], ['element', 'Element']].map(([v, l]) => (
                <Tabs.Trigger key={v} value={v} data-testid={`tab-${v}`} className="flex-1 truncate px-1 py-2 text-muted data-[state=active]:border-b-2 data-[state=active]:border-accent data-[state=active]:text-fg">{l}</Tabs.Trigger>
              ))}
            </Tabs.List>
            <Tabs.Content value="game" className="min-h-0 flex-1 overflow-auto" forceMount hidden={rightTab !== 'game'}><GamePanel onOpenImageStudio={setStudioLayer} /></Tabs.Content>
            <Tabs.Content value="question" className="min-h-0 flex-1 overflow-auto"><QuestionPanel /></Tabs.Content>
            <Tabs.Content value="element" className="min-h-0 flex-1 overflow-auto"><LayerInspector onOpenImageStudio={setStudioLayer} /></Tabs.Content>
          </Tabs.Root>
        </aside>
      </div>
      {studioLayer && <ImageStudio layerId={studioLayer} onClose={() => setStudioLayer(null)} />}
      <ConflictDialog />
      <Dialog open={help} onOpenChange={setHelp} title="Keyboard shortcuts" wide>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
          {SHORTCUTS.map(([k, d]) => <div key={k} className="flex items-center justify-between gap-2 border-b border-line/50 py-1"><span>{d}</span><Kbd>{k}</Kbd></div>)}
        </div>
        <p className="mt-3 text-[11px] text-muted">Shortcuts are ignored while typing in text fields.</p>
      </Dialog>
    </div>
  );
}

function Toolbar({ onSave, onHelp }: { onSave: () => void; onHelp: () => void }) {
  const navigate = useNavigate();
  const draft = useEditor((s) => s.draft) as Question;
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const sel = useEditor((s) => s.selection.length);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="flex items-center gap-1 border-b border-line bg-panel px-2 py-1.5" role="toolbar" aria-label="Editor toolbar">
      <GameIcon type={draft.gameType} size={16} />
      <div className="mr-2 min-w-0 max-w-64">
        <div className="truncate text-[13px] font-semibold" data-testid="editor-title">{questionDisplayTitle(draft)}</div>
        <div className="text-[10px] text-muted">{GAMES[draft.gameType].name}</div>
      </div>
      <Button size="icon-sm" variant="ghost" tooltip="Save (Ctrl+S)" onClick={onSave} data-testid="save"><Save size={14} /></Button>
      <SaveStatus />
      <span className="mx-1 h-5 w-px bg-line" />
      <Button size="icon-sm" variant="ghost" tooltip="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => useEditor.getState().undo()} data-testid="undo"><Undo2 size={14} /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => useEditor.getState().redo()} data-testid="redo"><Redo2 size={14} /></Button>
      <span className="mx-1 h-5 w-px bg-line" />
      <Button size="icon-sm" variant="ghost" tooltip="Copy (Ctrl+C)" disabled={!sel} onClick={copySelected}><Copy size={14} /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Paste (Ctrl+V)" onClick={pasteClipboard}><ClipboardPaste size={14} /></Button>
      <Button size="sm" variant="ghost" tooltip="Duplicate this question" onClick={async () => { await useEditor.getState(); const q = await questionsRepo.duplicate(draft.id); navigate(`/edit/${q.id}`); toast.success('Question duplicated'); }}><CopyPlus size={14} />Duplicate</Button>
      <div className="ml-auto flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => setExportOpen(true)} data-testid="export-image"><Download size={14} />Export image</Button>
        <ExportImageDialog question={draft} open={exportOpen} onOpenChange={setExportOpen} />
        <Button size="sm" variant="primary" onClick={() => { onSave(); window.open(`/present/single?question=${draft.id}`, '_blank'); }} data-testid="present-question"><Presentation size={14} />Present</Button>
        <Button size="icon-sm" variant="ghost" tooltip="Keyboard shortcuts (?)" onClick={onHelp}><Keyboard size={14} /></Button>
      </div>
    </div>
  );
}

function ToolStrip() {
  const tool = useEditor((s) => s.tool);
  const draft = useEditor((s) => s.draft) as Question;
  const { settings, update } = useSettings();
  const T = ({ t, icon, label }: { t: Tool; icon: React.ReactNode; label: string }) => <Button size="icon-sm" variant="ghost" tooltip={label} active={tool === t} onClick={() => useEditor.getState().setTool(t)}>{icon}</Button>;
  const aspect = Object.entries(ASPECTS).find(([, [w, h]]) => w === draft.scene.width && h === draft.scene.height)?.[0] ?? 'custom';
  return (
    <div className="flex items-center gap-0.5 border-b border-line bg-panel-2 px-2 py-1">
      <T t="select" icon={<MousePointer2 size={14} />} label="Select / move (V)" />
      <T t="hand" icon={<Hand size={14} />} label="Pan (H, or hold Space)" />
      <T t="text" icon={<Type size={14} />} label="Text (T)" />
      <T t="rect" icon={<Square size={14} />} label="Rectangle (R)" />
      <T t="ellipse" icon={<Circle size={14} />} label="Ellipse (O)" />
      <T t="pen" icon={<PenLine size={14} />} label="Pen (P)" />
      <span className="mx-1 h-5 w-px bg-line" />
      <Button size="icon-sm" variant="ghost" tooltip="Zoom out (-)" onClick={() => zoom('out')}><ZoomOut size={14} /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Zoom in (+)" onClick={() => zoom('in')}><ZoomIn size={14} /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Fit (0)" onClick={() => zoom('fit')}><Maximize size={14} /></Button>
      <Button size="sm" variant="ghost" onClick={() => zoom('100')}>100%</Button>
      <Button size="icon-sm" variant="ghost" tooltip="Grid & snap to grid" onClick={() => { zoom('grid'); update({ snapToGrid: true }); }}><Grid3x3 size={14} /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Safe-area guides" active={settings.showSafeArea} onClick={() => update({ showSafeArea: !settings.showSafeArea })}><Shield size={14} /></Button>
      <div className="ml-auto flex items-center gap-1 text-[11px] text-muted">
        Canvas
        <Select className="h-7 w-28 text-xs" value={aspect} aria-label="Aspect ratio" onChange={(e) => {
          const v = e.target.value;
          if (v === 'custom') {
            const w = Number(prompt('Width (px)', String(draft.scene.width))), h = Number(prompt('Height (px)', String(draft.scene.height)));
            if (w >= 100 && h >= 100 && w <= 7680 && h <= 7680) useEditor.getState().update((d) => setAspect(d, Math.round(w), Math.round(h)));
            return;
          }
          const [w, h] = ASPECTS[v as keyof typeof ASPECTS];
          useEditor.getState().update((d) => setAspect(d, w, h));
        }}>
          <option value="16:9">16:9</option><option value="4:3">4:3</option><option value="1:1">Square</option><option value="custom">{aspect === 'custom' ? `${draft.scene.width}×${draft.scene.height}` : 'Custom…'}</option>
        </Select>
      </div>
    </div>
  );
}

function PreviewBar() {
  const { previewAnswer, previewStep, ghostHidden, draft } = useEditor();
  const max = draft ? maxRevealStep(draft.scene) : 0;
  return (
    <div className="flex items-center gap-2 border-t border-line bg-panel-2 px-3 py-1 text-[11px]">
      <Eye size={13} className="text-muted" />
      <span className="text-muted">Preview:</span>
      <Button size="sm" variant="ghost" active={previewStep === Infinity} onClick={() => useEditor.setState({ previewStep: Infinity })}>Editing (all)</Button>
      {Array.from({ length: max + 1 }, (_, i) => (
        <Button key={i} size="sm" variant="ghost" active={previewStep === i} onClick={() => useEditor.setState({ previewStep: i })}>Step {i}</Button>
      ))}
      <Button size="sm" variant="ghost" active={previewAnswer} onClick={() => useEditor.setState({ previewAnswer: !previewAnswer })} data-testid="preview-answer">Answer revealed (A)</Button>
      <label className="ml-2 flex items-center gap-1 text-muted"><input type="checkbox" checked={ghostHidden} onChange={(e) => useEditor.setState({ ghostHidden: e.target.checked })} />Ghost hidden layers</label>
      {draft?.audio && <span className="ml-auto text-muted">🔊 Audio attached</span>}
      {draft && <span className={cn('text-muted', !draft.audio && 'ml-auto')}>{draft.timeLimit ? `⏱ ${formatTime(draft.timeLimit).replace('.0', '')}` : 'No timer'} · {draft.points} pts</span>}
    </div>
  );
}

function ConflictDialog() {
  const saveState = useEditor((s) => s.saveState);
  const open = saveState === 'conflict';
  const keepMine = async () => {
    const d = useEditor.getState().draft!;
    const saved = await questionsRepo.save(d, { force: true, revisionReason: 'Overwrote newer version after conflict' });
    useEditor.getState().markSaved(saved.version);
    useEditor.setState({ saveState: 'saved', dirty: false });
  };
  const loadTheirs = async () => {
    const q = await questionsRepo.get(useEditor.getState().draft!.id);
    if (q) useEditor.getState().load(q);
  };
  return (
    <Dialog open={open} onOpenChange={() => {}} title="This question changed elsewhere" description="A newer version was saved (another tab or an import). Choose which version to keep — nothing is overwritten silently."
      footer={<><Button variant="outline" onClick={loadTheirs}>Load newer version</Button><Button variant="danger" onClick={keepMine}>Keep my version</Button></>}>
      <p className="text-xs text-muted">If you keep yours, the other version remains available in revision history.</p>
    </Dialog>
  );
}
