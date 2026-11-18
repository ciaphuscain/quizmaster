import { useState } from 'react';
import { ImagePlus, Wand2, Upload } from 'lucide-react';
import type { ImageLayer } from '@/types/schema';
import { Button, ColorField, Field, Input, Section, Select, SliderField, Toggle } from '@/components/ui/primitives';
import { AssetPickerDialog } from '@/components/common/AssetPicker';
import { useAssetUrl } from '@/hooks/useAssetUrl';
import { updateLayer } from '@/features/questions/layerOps';
import { importFiles, pickFiles } from '@/features/questions/actions';
import { firstLayer, setContent, setQuestion, useDraft } from '../shared/hooks';
import { InlineEffects } from '../shared/InlineEffects';
import { useEditor } from '@/stores/editor';

const BG_PRESETS = [
  { label: 'White', bg: { type: 'solid', color: '#ffffff' } }, { label: 'Charcoal', bg: { type: 'solid', color: '#111827' } },
  { label: 'Dots', bg: { type: 'pattern', pattern: 'dots', color: '#0f172a', color2: '#1e293b' } }, { label: 'Grid', bg: { type: 'pattern', pattern: 'grid', color: '#18181b', color2: '#27272a' } },
  { label: 'Sunset', bg: { type: 'gradient', color: '#f59e0b', color2: '#db2777', angle: 135 } }, { label: 'Ocean', bg: { type: 'gradient', color: '#0ea5e9', color2: '#1e3a8a', angle: 160 } },
  { label: 'Stripes', bg: { type: 'pattern', pattern: 'diagonal', color: '#1f2937', color2: '#374151' } }, { label: 'Checker', bg: { type: 'pattern', pattern: 'checker', color: '#e5e7eb', color2: '#d1d5db' } },
] as const;

export function BackgroundPresets() {
  return (
    <div className="flex flex-wrap gap-1">
      {BG_PRESETS.map((p) => (
        <button key={p.label} className="rounded border border-line px-1.5 py-0.5 text-[11px] hover:border-accent"
          onClick={() => setQuestion((q) => { q.scene.background = { ...q.scene.background, ...(p.bg as object) } as typeof q.scene.background; })}>{p.label}</button>
      ))}
    </div>
  );
}

/** One-click image slot: upload / library / replace, with original preview. */
export function ImageSlot({ layer, label = 'image', testId = 'upload-image' }: { layer: ImageLayer; label?: string; testId?: string }) {
  const [pick, setPick] = useState(false);
  const url = useAssetUrl(layer.assetId);
  const upload = async () => {
    const files = await pickFiles('image/*');
    const [a] = await importFiles(files, 'image');
    if (a) updateLayer<'image'>(layer.id, (l) => { l.assetId = a.id; });
  };
  return (
    <div className="flex items-center gap-2">
      <div className="checkerboard flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-line">
        {url ? <img src={url} alt="Original" className="max-h-full max-w-full object-contain" /> : <ImagePlus size={18} className="text-zinc-400" />}
      </div>
      <div className="flex flex-col gap-1">
        <Button size="sm" variant="primary" onClick={upload} data-testid={testId}><Upload size={12} />Upload {label}</Button>
        <Button size="sm" variant="outline" onClick={() => setPick(true)}><ImagePlus size={12} />From library</Button>
      </div>
      <AssetPickerDialog open={pick} onOpenChange={setPick} type="image" onPick={([a]) => updateLayer<'image'>(layer.id, (l) => { l.assetId = a.id; })} />
    </div>
  );
}

function LogoCardControls({ layer }: { layer: ImageLayer }) {
  const set = (fn: (l: ImageLayer) => void, k?: string) => updateLayer<'image'>(layer.id, fn, k);
  return (
    <>
      <Field label="Fit"><Select value={layer.fit} onChange={(e) => set((l) => { l.fit = e.target.value as ImageLayer['fit']; })}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Stretch</option></Select></Field>
      <SliderField label="Logo padding" value={layer.padding} min={0} max={300} step={1} onChange={(v) => set((l) => { l.padding = v; }, 'lp')} />
      <ColorField label="Card colour" value={layer.background} allowTransparent onChange={(v) => set((l) => { l.background = v; }, 'lbg')} />
      <SliderField label="Border" value={layer.border.width} min={0} max={30} step={1} onChange={(v) => set((l) => { l.border.width = v; }, 'lbw')} />
      {layer.border.width > 0 && <ColorField label="Border colour" value={layer.border.color} onChange={(v) => set((l) => { l.border.color = v; }, 'lbc')} />}
      <SliderField label="Corner radius" value={layer.border.radius} min={0} max={200} step={1} onChange={(v) => set((l) => { l.border.radius = v; }, 'lbr')} />
      <SliderField label="Card size" value={layer.transform.w} min={200} max={1800} step={10} onChange={(v) => set((l) => { const k = v / l.transform.w; const cx = l.transform.x + l.transform.w / 2, cy = l.transform.y + l.transform.h / 2; l.transform.w = v; l.transform.h = Math.round(l.transform.h * k); l.transform.x = Math.round(cx - v / 2); l.transform.y = Math.round(cy - l.transform.h / 2); }, 'lsz')} />
    </>
  );
}

export function LogoNormalPanel() {
  const q = useDraft();
  const img = firstLayer(q, 'image');
  if (q.content.gameType !== 'logo-normal') return null;
  const c = q.content;
  return (
    <>
      <Section title="Logo">
        {img ? <ImageSlot layer={img} label="logo" testId="upload-logo" /> : <p className="text-xs text-muted">The logo layer was removed. Add an image layer from the toolbar.</p>}
        <Field label="Brand (correct answer)"><Input value={q.correctAnswer} data-testid="brand-answer" onChange={(e) => setQuestion((d) => { d.correctAnswer = e.target.value; if (d.content.gameType === 'logo-normal') d.content.brand = e.target.value; }, 'brand')} placeholder="e.g. Nike" /></Field>
        <Field label="Category (optional)"><Input value={c.category} onChange={(e) => setContent<'logo-normal'>((x) => { x.category = e.target.value; }, 'cat')} placeholder="Sportswear, tech, food…" /></Field>
      </Section>
      {img && <Section title="Logo card"><LogoCardControls layer={img} /></Section>}
      <Section title="Background"><BackgroundPresets /></Section>
    </>
  );
}

export function LogoAlteredPanel({ onOpenImageStudio }: { onOpenImageStudio: (id: string) => void }) {
  const q = useDraft();
  const img = firstLayer(q, 'image');
  if (q.content.gameType !== 'logo-altered') return null;
  return (
    <>
      <Section title="Logo">
        {img && <ImageSlot layer={img} label="logo" testId="upload-logo" />}
        <Field label="Brand (correct answer)"><Input value={q.correctAnswer} data-testid="brand-answer" onChange={(e) => setQuestion((d) => { d.correctAnswer = e.target.value; if (d.content.gameType === 'logo-altered') d.content.brand = e.target.value; }, 'brand')} placeholder="e.g. Shell" /></Field>
        {img && <Toggle label="Reveal original logo with the answer" checked={img.revealOriginalOnAnswer} onChange={(v) => updateLayer<'image'>(img.id, (l) => { l.revealOriginalOnAnswer = v; })} />}
        <Button size="sm" variant="outline" onClick={() => useEditor.setState({ previewAnswer: !useEditor.getState().previewAnswer })}>Toggle original / altered preview</Button>
      </Section>
      {img && (
        <Section title="Alteration pipeline" actions={<Button size="sm" variant="ghost" className="h-6 text-[11px]" disabled={!img.assetId} onClick={() => onOpenImageStudio(img.id)}><Wand2 size={12} />Full studio</Button>}>
          <InlineEffects layer={img} />
          <p className="text-[11px] text-muted">Brush-based selective blur / pixelate / hide / reveal / erase are painted in the full Image Studio.</p>
        </Section>
      )}
      {img && <Section title="Logo card" defaultOpen={false}><LogoCardControls layer={img} /></Section>}
      <Section title="Background" defaultOpen={false}><BackgroundPresets /></Section>
    </>
  );
}

const SUBJECTS = ['person', 'fictional character', 'animal', 'object', 'vehicle', 'building', 'historical figure', 'pop culture character', 'other'];

export function SilhouettePanel({ onOpenImageStudio }: { onOpenImageStudio: (id: string) => void }) {
  const q = useDraft();
  const img = firstLayer(q, 'image');
  if (q.content.gameType !== 'silhouette') return null;
  const set = (fn: (l: ImageLayer) => void, k?: string) => img && updateLayer<'image'>(img.id, fn, k);
  const cut = img?.cutout, sil = img?.silhouette;
  return (
    <>
      <Section title="Subject">
        {img && <ImageSlot layer={img} label="photo" testId="upload-subject" />}
        <Field label="Subject type"><Select value={q.content.subjectCategory} onChange={(e) => setContent<'silhouette'>((c) => { c.subjectCategory = e.target.value; })}>{SUBJECTS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
        {img && <Button size="sm" variant="primary" disabled={!img.assetId} onClick={() => onOpenImageStudio(img.id)} data-testid="open-mask-studio"><Wand2 size={12} />Mask, polygon cutout & brush</Button>}
      </Section>
      {img && cut && (
        <Section title="Cutout">
          <Toggle label="Cutout enabled" checked={cut.enabled} onChange={(v) => set((l) => { if (l.cutout) l.cutout.enabled = v; })} />
          <Toggle label="Automatic background removal" checked={cut.auto} onChange={(v) => set((l) => { if (l.cutout) l.cutout.auto = v; })} />
          <SliderField label="Background tolerance" value={cut.tolerance} min={0} max={160} step={1} onChange={(v) => set((l) => { if (l.cutout) l.cutout.tolerance = v; }, 'stol')} />
          <SliderField label="Edge feather" value={cut.feather} min={0} max={20} step={0.5} onChange={(v) => set((l) => { if (l.cutout) l.cutout.feather = v; }, 'sfe')} />
          <p className="text-[11px] text-muted">Automatic removal runs locally (no cloud service) by detecting the background connected to the image edges. For busy backgrounds, turn it off and paint the subject manually in the studio. {cut.mask.ops.length} manual mask operation(s).</p>
        </Section>
      )}
      {img && sil && (
        <Section title="Silhouette">
          <Toggle label="Silhouette enabled" checked={sil.enabled} onChange={(v) => set((l) => { if (l.silhouette) l.silhouette.enabled = v; })} />
          <ColorField label="Silhouette colour" value={sil.color} onChange={(v) => set((l) => { if (l.silhouette) l.silhouette.color = v; }, 'sc')} />
          <SliderField label="Edge smoothing" value={sil.smoothing} min={0} max={10} step={0.5} onChange={(v) => set((l) => { if (l.silhouette) l.silhouette.smoothing = v; }, 'ssm')} />
          <SliderField label="Outline thickness" value={sil.outlineWidth} min={0} max={40} step={0.5} onChange={(v) => set((l) => { if (l.silhouette) l.silhouette.outlineWidth = v; }, 'sow')} />
          <ColorField label="Outline colour" value={sil.outlineColor} onChange={(v) => set((l) => { if (l.silhouette) l.silhouette.outlineColor = v; }, 'soc')} />
          <SliderField label="Shadow intensity" value={sil.shadow} min={0} max={1} step={0.05} onChange={(v) => set((l) => { if (l.silhouette) l.silhouette.shadow = v; l.shadow = { blur: 60 * v, color: `rgba(0,0,0,${0.8 * v})`, x: 0, y: 20 * v }; }, 'ssh')} />
          <Toggle label="Show original photo on answer reveal" checked={img.revealOriginalOnAnswer} onChange={(v) => set((l) => { l.revealOriginalOnAnswer = v; })} />
          <Button size="sm" variant="outline" onClick={() => useEditor.setState({ previewAnswer: !useEditor.getState().previewAnswer })}>Compare with source image</Button>
        </Section>
      )}
      <Section title="Background" defaultOpen={false}><BackgroundPresets /></Section>
    </>
  );
}
