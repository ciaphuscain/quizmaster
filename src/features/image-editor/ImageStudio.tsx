import { useEffect, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X, Plus, ArrowUp, ArrowDown, Trash2, RotateCcw, Eye, EyeOff, Brush, Eraser, Pentagon, Square, Circle, Undo2, Download, SplitSquareHorizontal, Wand2 } from 'lucide-react';
import type { Effect, EffectType, ImageLayer, MaskData, MaskOp } from '@/types/schema';
import { useEditor } from '@/stores/editor';
import { EFFECT_DEFS, EFFECT_ORDER, type ParamDef } from '@/engines/image/effectDefs';
import { EFFECT_PRESETS } from '@/games/presets';
import { createEffect } from '@/engines/scene/factories';
import { getProcessedImage, imageSize } from '@/engines/rendering/assets';
import { rasterizeMask } from '@/engines/image/mask';
import { Button, ColorField, Field, Select, SliderField, Toggle, Input } from '@/components/ui/primitives';
import { toast } from '@/components/ui/overlays';
import { downloadBlob, safeFilename } from '@/features/questions/actions';
import { canvasToBlob } from '@/engines/rendering/renderScene';
import { cn } from '@/utils/misc';
import { updateLayer } from '@/features/questions/layerOps';

type Target = { kind: 'effect'; id: string } | { kind: 'cutout' } | { kind: 'silhouette' } | null;
type MaskTool = 'brush' | 'erase' | 'polygon' | 'rect' | 'ellipse';
type View = 'result' | 'original' | 'split';

const CATS = ['Geometry', 'Color', 'Obscure', 'Masking', 'Overlay'] as const;

export function ImageStudio({ layerId, onClose }: { layerId: string; onClose: () => void }) {
  const layer = useEditor((s) => s.draft?.scene.layers.find((l) => l.id === layerId)) as ImageLayer | undefined;
  const [target, setTarget] = useState<Target>(null);
  const [view, setView] = useState<View>('result');
  const [split, setSplit] = useState(0.5);
  const [maskTool, setMaskTool] = useState<MaskTool>('brush');
  const [brush, setBrush] = useState({ size: 0.06, hardness: 0.7 });
  const [busy, setBusy] = useState(false);
  if (!layer) return null;

  const set = (fn: (l: ImageLayer) => void, key?: string) => updateLayer<'image'>(layerId, fn, key);
  const selEffect = target?.kind === 'effect' ? layer.effects.find((e) => e.id === target.id) : undefined;
  const selIndex = selEffect ? layer.effects.indexOf(selEffect) : -1;
  const maskTarget: { mask: MaskData; stage: number | 'source' } | null =
    selEffect && EFFECT_DEFS[selEffect.type].usesMask ? { mask: selEffect.mask ?? { ops: [], invert: false }, stage: selIndex } :
    target?.kind === 'cutout' && layer.cutout ? { mask: layer.cutout.mask, stage: 'source' } : null;

  const setMask = (fn: (m: MaskData) => void) => set((l) => {
    if (target?.kind === 'cutout' && l.cutout) fn(l.cutout.mask);
    else if (target?.kind === 'effect') { const e = l.effects.find((x) => x.id === target.id); if (e) { e.mask ??= { ops: [], invert: false }; fn(e.mask); } }
  });

  const addEffect = (type: EffectType) => {
    const e = createEffect(type);
    set((l) => { l.effects.push(e); });
    setTarget({ kind: 'effect', id: e.id });
  };
  const applyPreset = (id: string, replace: boolean) => {
    const fx = EFFECT_PRESETS.find((p) => p.id === id)!.build();
    set((l) => { l.effects = replace ? fx : [...l.effects, ...fx]; });
    setTarget(fx[0] ? { kind: 'effect', id: fx[0].id } : null);
  };
  const moveEffect = (i: number, d: -1 | 1) => set((l) => { const j = i + d; if (j < 0 || j >= l.effects.length) return; [l.effects[i], l.effects[j]] = [l.effects[j], l.effects[i]]; });

  const exportImage = async (format: 'png' | 'jpeg', scale: number) => {
    setBusy(true);
    try {
      const img = await getProcessedImage(layer);
      if (!img) throw new Error('Nothing to export');
      const [w, h] = imageSize(img);
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      const ctx = c.getContext('2d')!;
      if (format === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      downloadBlob(await canvasToBlob(c, `image/${format}`), `${safeFilename(layer.name)}.${format === 'jpeg' ? 'jpg' : 'png'}`);
    } catch (e) { toast.error('Export failed', (e as Error).message); } finally { setBusy(false); }
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <DialogPrimitive.Content className="fixed inset-3 z-50 flex flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-2xl" aria-describedby={undefined} data-testid="image-studio">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Wand2 size={15} className="text-accent" />
            <DialogPrimitive.Title className="text-sm font-semibold">Image Studio — {layer.name}</DialogPrimitive.Title>
            <span className="text-[11px] text-muted">Non-destructive: the original file is never modified.</span>
            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant="ghost" active={view === 'original'} onClick={() => setView('original')}>Original</Button>
              <Button size="sm" variant="ghost" active={view === 'result'} onClick={() => setView('result')}>Altered</Button>
              <Button size="sm" variant="ghost" active={view === 'split'} onClick={() => setView('split')} data-testid="compare-split"><SplitSquareHorizontal size={13} />Compare</Button>
              <span className="mx-1 h-5 w-px bg-line" />
              <Button size="sm" variant="outline" disabled={busy} onClick={() => exportImage('png', 1)}><Download size={13} />PNG</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => exportImage('jpeg', 1)}>JPEG</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => exportImage('png', 2)}>PNG 2×</Button>
              <Button size="sm" variant="primary" onClick={onClose} data-testid="image-studio-done">Done</Button>
              <DialogPrimitive.Close asChild><Button size="icon-sm" variant="ghost" aria-label="Close"><X size={14} /></Button></DialogPrimitive.Close>
            </div>
          </div>
          <div className="flex min-h-0 flex-1">
            {/* pipeline */}
            <aside className="flex w-64 shrink-0 flex-col overflow-auto border-r border-line">
              <div className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Pipeline</div>
              <div className="flex flex-col gap-0.5 p-2">
                <div className="rounded px-2 py-1 text-xs text-muted">Original image</div>
                <PipelineRow label={`Cutout / background removal${layer.cutout?.enabled ? '' : ' (off)'}`} selected={target?.kind === 'cutout'} onClick={() => { if (!layer.cutout) set((l) => { l.cutout = { enabled: true, auto: true, tolerance: 40, feather: 1, mask: { ops: [], invert: false } }; }); setTarget({ kind: 'cutout' }); }} enabled={!!layer.cutout?.enabled}
                  onToggle={() => set((l) => { if (l.cutout) l.cutout.enabled = !l.cutout.enabled; else l.cutout = { enabled: true, auto: true, tolerance: 40, feather: 1, mask: { ops: [], invert: false } }; })} />
                {layer.effects.map((e, i) => (
                  <PipelineRow key={e.id} testId={`fx-row-${e.type}`} label={`${i + 1}. ${EFFECT_DEFS[e.type].label}`} enabled={e.enabled} selected={target?.kind === 'effect' && target.id === e.id}
                    onClick={() => setTarget({ kind: 'effect', id: e.id })}
                    onToggle={() => set((l) => { const x = l.effects.find((y) => y.id === e.id); if (x) x.enabled = !x.enabled; })}
                    extra={<>
                      <button aria-label="Move up" className="text-muted hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={(ev) => { ev.stopPropagation(); moveEffect(i, -1); }}><ArrowUp size={12} /></button>
                      <button aria-label="Move down" className="text-muted hover:text-fg disabled:opacity-30" disabled={i === layer.effects.length - 1} onClick={(ev) => { ev.stopPropagation(); moveEffect(i, 1); }}><ArrowDown size={12} /></button>
                      <button aria-label="Remove effect" className="text-muted hover:text-danger" onClick={(ev) => { ev.stopPropagation(); set((l) => { l.effects = l.effects.filter((y) => y.id !== e.id); }); if (target?.kind === 'effect' && target.id === e.id) setTarget(null); }}><Trash2 size={12} /></button>
                    </>} />
                ))}
                <PipelineRow label={`Silhouette${layer.silhouette?.enabled ? '' : ' (off)'}`} selected={target?.kind === 'silhouette'} enabled={!!layer.silhouette?.enabled}
                  onClick={() => { if (!layer.silhouette) set((l) => { l.silhouette = { enabled: false, color: '#000000', outlineWidth: 0, outlineColor: '#ffffff', smoothing: 2, shadow: 0 }; }); setTarget({ kind: 'silhouette' }); }}
                  onToggle={() => set((l) => { if (l.silhouette) l.silhouette.enabled = !l.silhouette.enabled; else l.silhouette = { enabled: true, color: '#000000', outlineWidth: 0, outlineColor: '#ffffff', smoothing: 2, shadow: 0 }; })} />
                <div className="rounded px-2 py-1 text-xs text-muted">→ Final presentation image</div>
                {layer.effects.length > 0 && <Button size="sm" variant="ghost" className="mt-1 self-start text-danger" onClick={() => { set((l) => { l.effects = []; }); setTarget(null); }}><RotateCcw size={12} />Reset all effects</Button>}
              </div>
              <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Presets</div>
              <div className="flex flex-wrap gap-1 p-2">
                {EFFECT_PRESETS.map((p) => (
                  <button key={p.id} title={`${p.description} (Shift-click to append)`} onClick={(e) => applyPreset(p.id, !e.shiftKey)} className="rounded border border-line px-1.5 py-0.5 text-[11px] hover:border-accent" data-testid={`preset-${p.id}`}>{p.name}</button>
                ))}
              </div>
              <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Add effect</div>
              <div className="flex flex-col gap-2 p-2">
                {CATS.map((c) => (
                  <div key={c}>
                    <div className="mb-1 text-[10px] uppercase text-muted">{c}</div>
                    <div className="flex flex-wrap gap-1">
                      {EFFECT_ORDER.filter((t) => EFFECT_DEFS[t].category === c).map((t) => (
                        <button key={t} onClick={() => addEffect(t)} title={EFFECT_DEFS[t].description} className="flex items-center gap-0.5 rounded bg-panel-2 px-1.5 py-0.5 text-[11px] hover:bg-panel-3" data-testid={`add-fx-${t}`}><Plus size={10} />{EFFECT_DEFS[t].label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </aside>
            {/* preview */}
            <div className="relative min-w-0 flex-1 bg-canvas">
              <StudioPreview layer={layer} view={view} split={split} maskTarget={maskTarget} maskTool={maskTool} brush={brush}
                onMaskOp={(op) => setMask((m) => { m.ops.push(op); })} />
              {view === 'split' && (
                <input type="range" min={0} max={1} step={0.01} value={split} onChange={(e) => setSplit(parseFloat(e.target.value))} aria-label="Compare split position"
                  className="absolute bottom-4 left-1/2 w-1/2 -translate-x-1/2" />
              )}
              {maskTarget && (
                <div className="absolute left-3 top-3 flex items-center gap-1 rounded-md border border-line bg-panel/95 p-1 shadow-lg">
                  <Button size="icon-sm" variant="ghost" tooltip={target?.kind === 'cutout' ? 'Brush: keep (add to subject)' : 'Brush: add to mask'} active={maskTool === 'brush'} onClick={() => setMaskTool('brush')}><Brush size={14} /></Button>
                  <Button size="icon-sm" variant="ghost" tooltip={target?.kind === 'cutout' ? 'Brush: remove from subject' : 'Brush: subtract from mask'} active={maskTool === 'erase'} onClick={() => setMaskTool('erase')}><Eraser size={14} /></Button>
                  <Button size="icon-sm" variant="ghost" tooltip="Polygon selection (click points, double-click to close; Alt = subtract)" active={maskTool === 'polygon'} onClick={() => setMaskTool('polygon')}><Pentagon size={14} /></Button>
                  <Button size="icon-sm" variant="ghost" tooltip="Rectangular selection (Alt = subtract)" active={maskTool === 'rect'} onClick={() => setMaskTool('rect')}><Square size={14} /></Button>
                  <Button size="icon-sm" variant="ghost" tooltip="Elliptical selection (Alt = subtract)" active={maskTool === 'ellipse'} onClick={() => setMaskTool('ellipse')}><Circle size={14} /></Button>
                  <span className="mx-1 h-5 w-px bg-line" />
                  <div className="w-28"><SliderField label="Size" value={Math.round(brush.size * 100)} min={1} max={40} step={1} onChange={(v) => setBrush({ ...brush, size: v / 100 })} /></div>
                  <div className="w-28"><SliderField label="Hardness" value={brush.hardness} min={0} max={1} step={0.05} onChange={(v) => setBrush({ ...brush, hardness: v })} /></div>
                  <span className="mx-1 h-5 w-px bg-line" />
                  <Button size="icon-sm" variant="ghost" tooltip="Undo last mask operation" disabled={!maskTarget.mask.ops.length} onClick={() => setMask((m) => { m.ops.pop(); })}><Undo2 size={14} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setMask((m) => { m.invert = !m.invert; })} active={maskTarget.mask.invert}>Invert</Button>
                  <Button size="sm" variant="ghost" onClick={() => setMask((m) => { m.ops = []; m.invert = false; })}>Clear</Button>
                </div>
              )}
            </div>
            {/* params */}
            <aside className="w-72 shrink-0 overflow-auto border-l border-line p-3">
              {!target && <p className="text-xs text-muted">Add an effect or choose a preset. Select a pipeline step to adjust its parameters. Effects run top-to-bottom; drag order with the arrows.</p>}
              {selEffect && <EffectParams effect={selEffect} onChange={(fn, key) => set((l) => { const e = l.effects.find((x) => x.id === selEffect.id); if (e) fn(e); }, key)} />}
              {target?.kind === 'cutout' && layer.cutout && (
                <div className="flex flex-col gap-3">
                  <div className="text-sm font-semibold">Cutout / background removal</div>
                  <Toggle label="Enabled" checked={layer.cutout.enabled} onChange={(v) => set((l) => { if (l.cutout) l.cutout.enabled = v; })} />
                  <Toggle label="Automatic background detection" checked={layer.cutout.auto} onChange={(v) => set((l) => { if (l.cutout) l.cutout.auto = v; })} />
                  <SliderField label="Background tolerance" value={layer.cutout.tolerance} min={0} max={160} step={1} onChange={(v) => set((l) => { if (l.cutout) l.cutout.tolerance = v; }, 'ctol')} />
                  <SliderField label="Edge feather" value={layer.cutout.feather} min={0} max={20} step={0.5} onChange={(v) => set((l) => { if (l.cutout) l.cutout.feather = v; }, 'cfe')} />
                  <p className="text-[11px] text-muted">Automatic detection removes the area connected to the image border whose colour is within the tolerance — ideal for subjects on plain or studio backgrounds. Refine with the brush (keep) and eraser (remove), or draw polygon / rectangle / ellipse selections. Turn automatic detection off for fully manual masking: brush strokes then define the subject.</p>
                </div>
              )}
              {target?.kind === 'silhouette' && layer.silhouette && (
                <div className="flex flex-col gap-3">
                  <div className="text-sm font-semibold">Silhouette</div>
                  <Toggle label="Enabled" checked={layer.silhouette.enabled} onChange={(v) => set((l) => { if (l.silhouette) l.silhouette.enabled = v; })} />
                  <ColorField label="Silhouette colour" value={layer.silhouette.color} onChange={(v) => set((l) => { if (l.silhouette) l.silhouette.color = v; }, 'sc')} />
                  <SliderField label="Edge smoothing" value={layer.silhouette.smoothing} min={0} max={10} step={0.5} onChange={(v) => set((l) => { if (l.silhouette) l.silhouette.smoothing = v; }, 'ss')} />
                  <SliderField label="Outline thickness" value={layer.silhouette.outlineWidth} min={0} max={40} step={0.5} onChange={(v) => set((l) => { if (l.silhouette) l.silhouette.outlineWidth = v; }, 'sow')} />
                  <ColorField label="Outline colour" value={layer.silhouette.outlineColor} onChange={(v) => set((l) => { if (l.silhouette) l.silhouette.outlineColor = v; }, 'soc')} />
                  <SliderField label="Shadow intensity" value={layer.silhouette.shadow} min={0} max={1} step={0.05} onChange={(v) => set((l) => { if (l.silhouette) l.silhouette.shadow = v; l.shadow = { blur: 60 * v, color: `rgba(0,0,0,${0.8 * v})`, x: 0, y: 20 * v }; }, 'ssh')} />
                  <p className="text-[11px] text-muted">The silhouette uses the cutout's alpha shape. Make sure the cutout isolates the subject first.</p>
                </div>
              )}
            </aside>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PipelineRow({ label, enabled, selected, onClick, onToggle, extra, testId }: { label: string; enabled: boolean; selected: boolean; onClick: () => void; onToggle: () => void; extra?: React.ReactNode; testId?: string }) {
  return (
    <div role="button" tabIndex={0} data-testid={testId} onClick={onClick} onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={cn('flex cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-xs hover:bg-panel-2', selected && 'bg-accent/15 ring-1 ring-accent/50', !enabled && 'opacity-60')}>
      <button aria-label={enabled ? 'Disable' : 'Enable'} onClick={(e) => { e.stopPropagation(); onToggle(); }} className="text-muted hover:text-fg">{enabled ? <Eye size={12} /> : <EyeOff size={12} />}</button>
      <span className="flex-1 truncate">{label}</span>
      {extra}
    </div>
  );
}

function EffectParams({ effect, onChange }: { effect: Effect; onChange: (fn: (e: Effect) => void, key?: string) => void }) {
  const def = EFFECT_DEFS[effect.type];
  const P = (p: ParamDef) => {
    const v = effect.params[p.key];
    const set = (val: number | string | boolean) => onChange((e) => { e.params[p.key] = val; }, `fx-${effect.id}-${p.key}`);
    if (p.type === 'number') return <SliderField key={p.key} label={p.label} value={typeof v === 'number' ? v : p.default} min={p.min} max={p.max} step={p.step} unit={p.unit} onChange={set} />;
    if (p.type === 'color') return <ColorField key={p.key} label={p.label} value={typeof v === 'string' ? v : p.default} onChange={set} />;
    if (p.type === 'boolean') return <Toggle key={p.key} label={p.label} checked={typeof v === 'boolean' ? v : p.default} onChange={set} />;
    return <Field key={p.key} label={p.label}><Select value={String(v ?? p.default)} onChange={(e) => set(e.target.value)}>{p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>;
  };
  return (
    <div className="flex flex-col gap-3" data-testid="effect-params">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{def.label}</div>
        <Button size="sm" variant="ghost" onClick={() => onChange((e) => { const fresh = createEffect(e.type); e.params = fresh.params; if (fresh.mask) e.mask = fresh.mask; })}><RotateCcw size={12} />Reset</Button>
      </div>
      <p className="text-[11px] text-muted">{def.description}</p>
      {def.params.map(P)}
      {def.usesMask && <p className="rounded bg-panel-2 p-2 text-[11px] text-muted">{def.maskRequired ? 'Paint on the image to choose where this applies.' : 'Optional: paint a mask to restrict this effect to part of the image. Without a mask it applies everywhere.'} {effect.mask?.ops.length ? `${effect.mask.ops.length} mask operation(s).` : ''}</p>}
    </div>
  );
}

/** Preview canvas with compare modes and interactive mask painting. */
function StudioPreview({ layer, view, split, maskTarget, maskTool, brush, onMaskOp }: {
  layer: ImageLayer; view: View; split: number; maskTarget: { mask: MaskData; stage: number | 'source' } | null;
  maskTool: MaskTool; brush: { size: number; hardness: number }; onMaskOp: (op: MaskOp) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [imgs, setImgs] = useState<{ result: CanvasImageSource | null; original: CanvasImageSource | null; stage: CanvasImageSource | null }>({ result: null, original: null, stage: null });
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [live, setLive] = useState<MaskOp | null>(null);
  const [poly, setPoly] = useState<number[]>([]);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; alt: boolean } | null>(null);
  const cfgKey = JSON.stringify([layer.assetId, layer.cutout, layer.effects, layer.silhouette]);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  useEffect(() => {
    let alive = true;
    const stageP = maskTarget ? (maskTarget.stage === 'source' ? getProcessedImage({ assetId: layer.assetId, effects: [] }) : getProcessedImage(layer, maskTarget.stage)) : Promise.resolve(null);
    void Promise.all([getProcessedImage(layer), getProcessedImage({ assetId: layer.assetId, effects: [] }), stageP]).then(([result, original, stage]) => {
      if (alive) setImgs({ result, original, stage });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgKey, maskTarget?.stage]);

  // when painting, show the stage input (image as it enters the masked step) with mask overlay
  const base = maskTarget ? imgs.stage : view === 'original' ? imgs.original : imgs.result;
  const [bw, bh] = base ? imageSize(base) : [1, 1];
  const k = Math.min((size.w - 40) / bw, (size.h - 40) / bh);
  const dw = bw * k, dh = bh * k, ox = (size.w - dw) / 2, oy = (size.h - dh) / 2;
  const maskOverlay = useMemo(() => {
    if (!maskTarget || !base) return null;
    const mw = Math.max(1, Math.round(Math.min(dw, 600))), mh = Math.max(1, Math.round((mw * bh) / bw));
    const ops = live ? [...maskTarget.mask.ops, live] : maskTarget.mask.ops;
    const isCut = maskTarget.stage === 'source';
    const m = rasterizeMask({ ops, invert: maskTarget.mask.invert }, mw, mh, isCut && !ops.some((o) => o.mode === 'add') && !layer.cutout?.auto ? 0 : 0);
    const c = document.createElement('canvas'); c.width = mw; c.height = mh;
    const ctx = c.getContext('2d')!; const id = ctx.createImageData(mw, mh);
    for (let i = 0; i < m.length; i++) { id.data[i * 4] = 239; id.data[i * 4 + 1] = 68; id.data[i * 4 + 2] = 68; id.data[i * 4 + 3] = m[i] * 120; }
    ctx.putImageData(id, 0, 0);
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maskTarget?.mask, live, base, dw]);

  useEffect(() => {
    const c = canvas.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr; c.height = size.h * dpr;
    const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    // checkerboard behind for transparency
    const s = 12;
    for (let y = 0; y < dh; y += s) for (let x = 0; x < dw; x += s) { ctx.fillStyle = ((x + y) / s) % 2 ? '#d4d4d8' : '#fafafa'; ctx.fillRect(ox + x, oy + y, Math.min(s, dw - x), Math.min(s, dh - y)); }
    if (!base) return;
    if (view === 'split' && !maskTarget && imgs.original && imgs.result) {
      const [w1, h1] = imageSize(imgs.original);
      const k1 = Math.min(dw / w1, dh / h1);
      ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, dw * split, dh); ctx.clip();
      ctx.drawImage(imgs.original, ox + (dw - w1 * k1) / 2, oy + (dh - h1 * k1) / 2, w1 * k1, h1 * k1); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.rect(ox + dw * split, oy, dw * (1 - split), dh); ctx.clip();
      ctx.drawImage(imgs.result, ox, oy, dw, dh); ctx.restore();
      ctx.fillStyle = '#f59e0b'; ctx.fillRect(ox + dw * split - 1, oy, 2, dh);
      ctx.font = '600 12px Inter'; ctx.fillStyle = '#fff'; ctx.fillText('Original', ox + 8, oy + 18); ctx.fillText('Altered', ox + dw - 60, oy + 18);
    } else ctx.drawImage(base, ox, oy, dw, dh);
    if (maskOverlay) ctx.drawImage(maskOverlay, ox, oy, dw, dh);
    if (poly.length) {
      ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < poly.length; i += 2) { const x = ox + poly[i] * dw, y = oy + poly[i + 1] * dh; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
      if (cursor) ctx.lineTo(ox + cursor.x * dw, oy + cursor.y * dh);
      ctx.stroke();
    }
    if (maskTarget && cursor && (maskTool === 'brush' || maskTool === 'erase')) {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(ox + cursor.x * dw, oy + cursor.y * dh, (brush.size * dw) / 2, 0, Math.PI * 2); ctx.stroke();
    }
  }, [base, size, view, split, imgs, maskOverlay, poly, cursor, brush, maskTool, maskTarget, dw, dh, ox, oy]);

  const norm = (e: React.PointerEvent | React.MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left - ox) / dw)), y: Math.min(1, Math.max(0, (e.clientY - r.top - oy) / dh)) };
  };
  const shapeOp = (a: { x: number; y: number }, b: { x: number; y: number }, mode: 'add' | 'subtract'): MaskOp => {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    if (maskTool === 'rect') return { kind: 'polygon', mode, points: [x0, y0, x1, y0, x1, y1, x0, y1] };
    const pts: number[] = [];
    for (let i = 0; i < 48; i++) { const t = (i / 48) * Math.PI * 2; pts.push((x0 + x1) / 2 + Math.cos(t) * (x1 - x0) / 2, (y0 + y1) / 2 + Math.sin(t) * (y1 - y0) / 2); }
    return { kind: 'polygon', mode, points: pts };
  };

  const down = (e: React.PointerEvent) => {
    if (!maskTarget) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = norm(e);
    if (maskTool === 'polygon') { setPoly([...poly, p.x, p.y]); return; }
    if (maskTool === 'rect' || maskTool === 'ellipse') { dragStart.current = { ...p, alt: e.altKey }; return; }
    setLive({ kind: 'stroke', mode: maskTool === 'erase' ? 'subtract' : 'add', size: brush.size, hardness: brush.hardness, points: [p.x, p.y] });
  };
  const move = (e: React.PointerEvent) => {
    const p = norm(e); setCursor(p);
    if (!maskTarget) return;
    if (live && live.kind === 'stroke' && e.buttons) setLive({ ...live, points: [...live.points, p.x, p.y] });
    if (dragStart.current && e.buttons) setLive(shapeOp(dragStart.current, p, dragStart.current.alt ? 'subtract' : 'add'));
  };
  const up = () => {
    if (live) onMaskOp(live);
    setLive(null); dragStart.current = null;
  };
  const dbl = (e: React.MouseEvent) => {
    if (maskTool !== 'polygon' || poly.length < 6) return;
    onMaskOp({ kind: 'polygon', mode: e.altKey ? 'subtract' : 'add', points: poly });
    setPoly([]);
  };

  return (
    <div ref={wrap} className="h-full w-full" onKeyDown={(e) => { if (e.key === 'Escape') setPoly([]); }} tabIndex={-1}>
      <canvas ref={canvas} data-testid="studio-canvas" style={{ width: size.w, height: size.h, cursor: maskTarget ? 'crosshair' : 'default' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => setCursor(null)} onDoubleClick={dbl} />
      {!layer.assetId && <div className="absolute inset-0 flex items-center justify-center text-muted">Choose an image first.</div>}
      {maskTarget && <div className="absolute bottom-3 right-3 rounded bg-black/60 px-2 py-1 text-[11px] text-white/80">Painting mask{maskTarget.stage === 'source' ? ' (subject cutout)' : ''} — red shows the masked area</div>}
    </div>
  );
}

export { Input };
