import { useState } from 'react';
import { AlignLeft, AlignCenter, AlignRight, AlignStartVertical, AlignCenterVertical, AlignEndVertical, ArrowUpToLine, ArrowDownToLine, ChevronUp, ChevronDown, FlipHorizontal, FlipVertical, Wand2, ImagePlus, Trash2, Copy } from 'lucide-react';
import { useEditor } from '@/stores/editor';
import type { ImageLayer, Layer, ShapeLayer, TextLayer, EmojiLayer } from '@/types/schema';
import { ANIMATIONS } from '@/types/schema';
import { Button, ColorField, Field, Input, Section, Select, SliderField, Toggle } from '@/components/ui/primitives';
import { RichTextEditor } from '@/components/editors/RichTextEditor';
import { AssetPickerDialog } from '@/components/common/AssetPicker';
import { EmojiPicker } from '@/components/common/EmojiPicker';
import { alignSelected, deleteSelected, duplicateSelected, reorder, updateLayer } from '../layerOps';
import { EFFECT_DEFS } from '@/engines/image/effectDefs';
import { CountryStyleControls } from '@/games/shared/CountryStyleControls';

export const FONTS = [
  'Inter, system-ui, sans-serif', 'Georgia, serif', '"Times New Roman", serif', 'Arial, Helvetica, sans-serif', '"Trebuchet MS", sans-serif',
  'Verdana, sans-serif', '"Courier New", monospace', 'Impact, "Arial Black", sans-serif', '"Comic Sans MS", cursive', '"Segoe UI", sans-serif', 'system-ui, sans-serif',
];

function NumberInput({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted">
      <span className="w-4">{label}</span>
      <input type="number" aria-label={label} step={step} value={Math.round(value * 100) / 100} onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v); }}
        className="h-7 w-full rounded border border-line bg-panel-2 px-1.5 text-[12px] text-fg" />
    </label>
  );
}

export function LayerInspector({ onOpenImageStudio }: { onOpenImageStudio: (layerId: string) => void }) {
  const draft = useEditor((s) => s.draft);
  const selection = useEditor((s) => s.selection);
  const layers = draft?.scene.layers.filter((l) => selection.includes(l.id)) ?? [];
  if (!draft) return null;
  if (!layers.length) return <BackgroundInspector />;
  if (layers.length > 1) {
    return (
      <div>
        <Section title={`${layers.length} elements selected`}>
          <ArrangeButtons ids={selection} />
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={duplicateSelected}><Copy size={12} />Duplicate</Button>
            <Button size="sm" variant="outline" className="text-danger" onClick={deleteSelected}><Trash2 size={12} />Delete</Button>
          </div>
        </Section>
      </div>
    );
  }
  const l = layers[0];
  return (
    <div>
      <Section title="Element">
        <Field label="Name"><Input value={l.name} onChange={(e) => updateLayer(l.id, (x) => { x.name = e.target.value; }, 'name')} /></Field>
        <TransformControls layer={l} />
        <ArrangeButtons ids={[l.id]} />
      </Section>
      {l.kind === 'image' && <ImageControls layer={l} onOpenImageStudio={onOpenImageStudio} />}
      {l.kind === 'text' && <TextControls layer={l} />}
      {l.kind === 'emoji' && <EmojiControls layer={l} />}
      {l.kind === 'shape' && <ShapeControls layer={l} />}
      {l.kind === 'country' && <Section title="Map / flag style"><CountryStyleControls layer={l} /></Section>}
      {(l.kind === 'search' || l.kind === 'dialogue') && <Section title="Content"><p className="text-[11px] text-muted">Edit entries in the <b>Game</b> tab.</p></Section>}
      <Section title="Reveal & effects">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Reveal at step"><Input type="number" min={0} value={l.revealStep} onChange={(e) => updateLayer(l.id, (x) => { x.revealStep = Math.max(0, Math.round(Number(e.target.value) || 0)); })} data-testid="reveal-step" /></Field>
          <div className="flex items-end pb-1"><Toggle label="Only after answer" checked={l.answerOnly} onChange={(v) => updateLayer(l.id, (x) => { x.answerOnly = v; })} /></div>
        </div>
        <p className="text-[11px] text-muted">Step 0 shows immediately. Higher steps appear one at a time when presenting.</p>
        <Field label="Reveal animation (presentation)">
          <Select value={l.animation ?? 'fade'} data-testid="layer-animation" onChange={(e) => updateLayer(l.id, (x) => { x.animation = e.target.value as NonNullable<Layer['animation']>; })}>
            {ANIMATIONS.map((a) => <option key={a} value={a}>{a === 'none' ? 'None (instant)' : a.replace('-', ' ')}</option>)}
          </Select>
        </Field>
        <SliderField label="Shadow blur" value={l.shadow?.blur ?? 0} min={0} max={80} step={1} onChange={(v) => updateLayer(l.id, (x) => { x.shadow = { blur: v, color: x.shadow?.color ?? 'rgba(0,0,0,0.6)', x: x.shadow?.x ?? 0, y: x.shadow?.y ?? 8 }; }, 'shadow')} />
        {l.shadow && l.shadow.blur > 0 && <ColorField label="Shadow colour" value={l.shadow.color} onChange={(v) => updateLayer(l.id, (x) => { if (x.shadow) x.shadow.color = v; }, 'shadowc')} />}
      </Section>
    </div>
  );
}

function TransformControls({ layer: l }: { layer: Layer }) {
  const t = l.transform;
  const set = (patch: Partial<typeof t>) => updateLayer(l.id, (x) => { x.transform = { ...x.transform, ...patch }; }, 'transform');
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberInput label="X" value={t.x} onChange={(v) => set({ x: v })} />
        <NumberInput label="Y" value={t.y} onChange={(v) => set({ y: v })} />
        <NumberInput label="W" value={t.w} onChange={(v) => set({ w: Math.max(1, v) })} />
        <NumberInput label="H" value={t.h} onChange={(v) => set({ h: Math.max(1, v) })} />
        <NumberInput label="∠" value={t.rotation} onChange={(v) => set({ rotation: v })} />
        <div className="flex gap-1">
          <Button size="icon-sm" variant="ghost" tooltip="Flip horizontally" active={t.flipX} onClick={() => set({ flipX: !t.flipX })}><FlipHorizontal size={13} /></Button>
          <Button size="icon-sm" variant="ghost" tooltip="Flip vertically" active={t.flipY} onClick={() => set({ flipY: !t.flipY })}><FlipVertical size={13} /></Button>
        </div>
      </div>
      <SliderField label="Opacity" value={t.opacity} min={0} max={1} step={0.01} onChange={(v) => set({ opacity: v })} />
      <div className="flex gap-3">
        <Toggle label="Visible" checked={l.visible} onChange={(v) => updateLayer(l.id, (x) => { x.visible = v; })} />
        <Toggle label="Locked" checked={l.locked} onChange={(v) => updateLayer(l.id, (x) => { x.locked = v; })} />
      </div>
    </>
  );
}

function ArrangeButtons({ ids }: { ids: string[] }) {
  return (
    <div className="flex flex-wrap gap-0.5">
      <Button size="icon-sm" variant="ghost" tooltip="Align left" onClick={() => alignSelected('left')}><AlignStartVertical size={13} /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Centre horizontally" onClick={() => alignSelected('hcenter')}><AlignCenterVertical size={13} /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Align right" onClick={() => alignSelected('right')}><AlignEndVertical size={13} /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Align top" onClick={() => alignSelected('top')}><AlignStartVertical size={13} className="rotate-90" /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Centre vertically" onClick={() => alignSelected('vcenter')}><AlignCenterVertical size={13} className="rotate-90" /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Align bottom" onClick={() => alignSelected('bottom')}><AlignEndVertical size={13} className="rotate-90" /></Button>
      <span className="mx-1 w-px bg-line" />
      <Button size="icon-sm" variant="ghost" tooltip="Bring to front" onClick={() => reorder(ids, 'top')}><ArrowUpToLine size={13} /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Bring forward ( ] )" onClick={() => reorder(ids, 'up')}><ChevronUp size={13} /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Send backward ( [ )" onClick={() => reorder(ids, 'down')}><ChevronDown size={13} /></Button>
      <Button size="icon-sm" variant="ghost" tooltip="Send to back" onClick={() => reorder(ids, 'bottom')}><ArrowDownToLine size={13} /></Button>
    </div>
  );
}

export function ImageControls({ layer: l, onOpenImageStudio }: { layer: ImageLayer; onOpenImageStudio: (id: string) => void }) {
  const [pick, setPick] = useState(false);
  const fx = l.effects.filter((e) => e.enabled);
  return (
    <Section title="Image">
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={() => setPick(true)} data-testid="choose-image"><ImagePlus size={13} />{l.assetId ? 'Replace image' : 'Choose image'}</Button>
        <Button size="sm" variant="primary" onClick={() => onOpenImageStudio(l.id)} disabled={!l.assetId} data-testid="open-image-studio"><Wand2 size={13} />Image Studio</Button>
      </div>
      {fx.length > 0 && <div className="text-[11px] text-muted">Effects: {fx.map((e) => EFFECT_DEFS[e.type].label).join(' → ')}</div>}
      {l.cutout?.enabled && <div className="text-[11px] text-muted">Cutout active{l.silhouette?.enabled ? ' · silhouette' : ''}</div>}
      <Field label="Fit">
        <Select value={l.fit} onChange={(e) => updateLayer<'image'>(l.id, (x) => { x.fit = e.target.value as ImageLayer['fit']; })}>
          <option value="contain">Contain (whole image)</option><option value="cover">Cover (fill & crop)</option><option value="fill">Stretch</option>
        </Select>
      </Field>
      <SliderField label="Padding" value={l.padding} min={0} max={300} step={1} onChange={(v) => updateLayer<'image'>(l.id, (x) => { x.padding = v; }, 'pad')} />
      <ColorField label="Card background" value={l.background} allowTransparent onChange={(v) => updateLayer<'image'>(l.id, (x) => { x.background = v; }, 'bg')} />
      <SliderField label="Border width" value={l.border.width} min={0} max={40} step={1} onChange={(v) => updateLayer<'image'>(l.id, (x) => { x.border.width = v; }, 'bw')} />
      <ColorField label="Border colour" value={l.border.color} onChange={(v) => updateLayer<'image'>(l.id, (x) => { x.border.color = v; }, 'bc')} />
      <SliderField label="Corner radius" value={l.border.radius} min={0} max={300} step={1} onChange={(v) => updateLayer<'image'>(l.id, (x) => { x.border.radius = v; }, 'br')} />
      <Toggle label="Show original when answer is revealed" checked={l.revealOriginalOnAnswer} onChange={(v) => updateLayer<'image'>(l.id, (x) => { x.revealOriginalOnAnswer = v; })} />
      <AssetPickerDialog open={pick} onOpenChange={setPick} type="image" onPick={([a]) => updateLayer<'image'>(l.id, (x) => { x.assetId = a.id; })} />
    </Section>
  );
}

export function TextControls({ layer: l }: { layer: TextLayer }) {
  const s = l.style;
  const set = (patch: Partial<typeof s>, key = 'style') => updateLayer<'text'>(l.id, (x) => { x.style = { ...x.style, ...patch }; }, key);
  return (
    <Section title="Text">
      <RichTextEditor value={l.doc} onChange={(doc) => updateLayer<'text'>(l.id, (x) => { x.doc = doc; }, 'doc')} testId="text-editor" autoFocusEvent="qm-focus-inspector" />
      <EmojiInsert onPick={(e) => updateLayer<'text'>(l.id, (x) => { const last = x.doc.content?.[x.doc.content.length - 1]; if (last) { last.content = [...(last.content ?? []), { type: 'text', text: e }]; } })} />
      <Field label="Font"><Select value={s.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>{FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0].replace(/"/g, '')}</option>)}</Select></Field>
      <SliderField label="Font size" value={s.fontSize} min={8} max={300} step={1} onChange={(v) => set({ fontSize: v }, 'fs')} />
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" active={s.bold} onClick={() => set({ bold: !s.bold })}><b>B</b></Button>
        <Button size="sm" variant="ghost" active={s.italic} onClick={() => set({ italic: !s.italic })}><i>I</i></Button>
        <Button size="sm" variant="ghost" active={s.underline} onClick={() => set({ underline: !s.underline })}><u>U</u></Button>
        <span className="mx-1 w-px bg-line" />
        <Button size="icon-sm" variant="ghost" tooltip="Align left" active={s.align === 'left'} onClick={() => set({ align: 'left' })}><AlignLeft size={13} /></Button>
        <Button size="icon-sm" variant="ghost" tooltip="Align centre" active={s.align === 'center'} onClick={() => set({ align: 'center' })}><AlignCenter size={13} /></Button>
        <Button size="icon-sm" variant="ghost" tooltip="Align right" active={s.align === 'right'} onClick={() => set({ align: 'right' })}><AlignRight size={13} /></Button>
      </div>
      <Field label="Vertical alignment"><Select value={s.vAlign} onChange={(e) => set({ vAlign: e.target.value as typeof s.vAlign })}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></Select></Field>
      <ColorField label="Text colour" value={s.color} onChange={(v) => set({ color: v }, 'color')} />
      <ColorField label="Background fill" value={s.background} allowTransparent onChange={(v) => set({ background: v }, 'tbg')} />
      <SliderField label="Line spacing" value={s.lineHeight} min={0.8} max={3} step={0.05} onChange={(v) => set({ lineHeight: v }, 'lh')} />
      <SliderField label="Letter spacing" value={s.letterSpacing} min={-5} max={40} step={0.5} onChange={(v) => set({ letterSpacing: v }, 'ls')} />
      <SliderField label="Padding" value={s.padding} min={0} max={200} step={1} onChange={(v) => set({ padding: v }, 'tp')} />
      <SliderField label="Corner radius" value={s.radius} min={0} max={200} step={1} onChange={(v) => set({ radius: v }, 'tr')} />
      <Field label="Overflow"><Select value={s.overflow} onChange={(e) => set({ overflow: e.target.value as typeof s.overflow })}><option value="shrink">Shrink text to fit</option><option value="clip">Clip</option><option value="visible">Overflow visible</option></Select></Field>
    </Section>
  );
}

function EmojiInsert({ onPick }: { onPick: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>😀 Insert emoji</Button>
      {open && <div className="mt-1 rounded border border-line p-2"><EmojiPicker onPick={(e) => { onPick(e); setOpen(false); }} /></div>}
    </div>
  );
}

function EmojiControls({ layer: l }: { layer: EmojiLayer }) {
  return (
    <Section title="Emoji">
      <Field label="Emoji"><Input value={l.emoji} onChange={(e) => updateLayer<'emoji'>(l.id, (x) => { x.emoji = e.target.value; x.name = `Emoji ${e.target.value}`; }, 'emoji')} className="text-xl" /></Field>
      <EmojiPicker onPick={(e) => updateLayer<'emoji'>(l.id, (x) => { x.emoji = e; x.name = `Emoji ${e}`; })} />
    </Section>
  );
}

function ShapeControls({ layer: l }: { layer: ShapeLayer }) {
  return (
    <Section title="Shape">
      <Field label="Shape"><Select value={l.shape} onChange={(e) => updateLayer<'shape'>(l.id, (x) => { x.shape = e.target.value as ShapeLayer['shape']; })}>
        {['rect', 'ellipse', 'star', 'line', 'arrow', 'path'].map((s) => <option key={s} value={s}>{s}</option>)}
      </Select></Field>
      <ColorField label="Fill" value={l.fill} allowTransparent onChange={(v) => updateLayer<'shape'>(l.id, (x) => { x.fill = v; }, 'fill')} />
      <ColorField label="Stroke" value={l.stroke} allowTransparent onChange={(v) => updateLayer<'shape'>(l.id, (x) => { x.stroke = v; }, 'stroke')} />
      <SliderField label="Stroke width" value={l.strokeWidth} min={0} max={60} step={1} onChange={(v) => updateLayer<'shape'>(l.id, (x) => { x.strokeWidth = v; }, 'sw')} />
      {l.shape === 'rect' && <SliderField label="Corner radius" value={l.radius} min={0} max={400} step={1} onChange={(v) => updateLayer<'shape'>(l.id, (x) => { x.radius = v; }, 'sr')} />}
    </Section>
  );
}

export function BackgroundInspector() {
  const draft = useEditor((s) => s.draft)!;
  const update = useEditor((s) => s.update);
  const bg = draft.scene.background;
  const [pick, setPick] = useState(false);
  const set = (patch: Partial<typeof bg>, key = 'bg') => update((d) => { d.scene.background = { ...d.scene.background, ...patch }; }, { coalesce: key });
  return (
    <Section title="Slide background">
      <Field label="Type"><Select value={bg.type} onChange={(e) => set({ type: e.target.value as typeof bg.type })} data-testid="bg-type">
        <option value="solid">Solid colour</option><option value="gradient">Gradient</option><option value="pattern">Pattern</option><option value="image">Image</option>
      </Select></Field>
      <ColorField label={bg.type === 'gradient' ? 'Start colour' : 'Colour'} value={bg.color} onChange={(v) => set({ color: v }, 'bgc')} />
      {(bg.type === 'gradient' || bg.type === 'pattern') && <ColorField label={bg.type === 'gradient' ? 'End colour' : 'Pattern colour'} value={bg.color2} onChange={(v) => set({ color2: v }, 'bgc2')} />}
      {bg.type === 'gradient' && <SliderField label="Angle" value={bg.angle} min={0} max={360} step={1} onChange={(v) => set({ angle: v }, 'bga')} />}
      {bg.type === 'pattern' && <Field label="Pattern"><Select value={bg.pattern} onChange={(e) => set({ pattern: e.target.value as typeof bg.pattern })}>{['dots', 'grid', 'stripes', 'checker', 'diagonal'].map((p) => <option key={p}>{p}</option>)}</Select></Field>}
      {bg.type === 'image' && <Button size="sm" variant="outline" onClick={() => setPick(true)}><ImagePlus size={13} />{bg.assetId ? 'Replace background image' : 'Choose background image'}</Button>}
      <p className="text-[11px] text-muted">Select an element on the canvas to edit its properties.</p>
      <AssetPickerDialog open={pick} onOpenChange={setPick} type="image" onPick={([a]) => set({ assetId: a.id, type: 'image' })} />
    </Section>
  );
}
