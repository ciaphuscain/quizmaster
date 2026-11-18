import { useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, Wand2, ListOrdered, CalendarClock } from 'lucide-react';
import type { DialogueLayer, ImageLayer, Layer, Question, SearchLayer, TextLayer } from '@/types/schema';
import { Button, ColorField, Field, Input, Section, Select, SliderField, Textarea, Toggle, Badge } from '@/components/ui/primitives';
import { EmojiPicker } from '@/components/common/EmojiPicker';
import { RichTextEditor } from '@/components/editors/RichTextEditor';
import { emojiLayer, imageLayer, plainDoc, docToPlainText, textLayer, transform, searchLayer, dialogueLayer } from '@/engines/scene/factories';
import { firstLayer, setContent, setQuestion, useDraft } from '../shared/hooks';
import { updateLayer } from '@/features/questions/layerOps';
import { ImageSlot, BackgroundPresets } from './ImagePanels';
import { AiSuggest } from '@/features/ai-assistant/AiSuggest';
import { FONTS } from '@/features/questions/panels/LayerInspector';
import { uid } from '@/utils/id';
import { useEditor } from '@/stores/editor';

function MovieAnswer() {
  const q = useDraft();
  return (
    <Field label="Movie title (correct answer)">
      <Input value={q.correctAnswer} data-testid="movie-answer" placeholder="e.g. Jurassic Park" onChange={(e) => setQuestion((d) => { d.correctAnswer = e.target.value; }, 'movie')} />
    </Field>
  );
}

/** Splits an emoji string into grapheme clusters. */
function splitEmoji(s: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  const parts = Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(s)].map((x) => x.segment) : [...s];
  return parts.filter((p) => p.trim() && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(p));
}

type EmojiLayout = 'row' | 'two-rows' | 'grid' | 'staircase' | 'circle';
function arrangeEmojis(q: Question, layout: EmojiLayout, size: number) {
  const em = q.scene.layers.filter((l) => l.kind === 'emoji');
  const W = q.scene.width, H = q.scene.height, n = em.length;
  em.forEach((l, i) => {
    let x = 0, y = 0;
    if (layout === 'row') { const gap = Math.min(size * 1.15, (W - 200) / Math.max(1, n)); x = W / 2 - (gap * (n - 1)) / 2 + i * gap; y = H / 2 + 40; }
    if (layout === 'two-rows') { const per = Math.ceil(n / 2); const row = Math.floor(i / per), col = i % per; const cnt = row === 0 ? per : n - per; const gap = size * 1.15; x = W / 2 - (gap * (cnt - 1)) / 2 + col * gap; y = H / 2 - size * 0.55 + row * size * 1.15 + 40; }
    if (layout === 'grid') { const cols = Math.ceil(Math.sqrt(n)); const rows = Math.ceil(n / cols); const gap = size * 1.15; x = W / 2 - (gap * (cols - 1)) / 2 + (i % cols) * gap; y = H / 2 + 40 - (gap * (rows - 1)) / 2 + Math.floor(i / cols) * gap; }
    if (layout === 'staircase') { const gap = Math.min(size, (W - 200) / Math.max(1, n)); x = W / 2 - (gap * (n - 1)) / 2 + i * gap; y = H / 2 - (size * 0.4 * (n - 1)) / 2 + i * size * 0.4 + 40; }
    if (layout === 'circle') { const r = Math.min(W, H) * 0.3; const a = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2; x = W / 2 + Math.cos(a) * r; y = H / 2 + 40 + Math.sin(a) * r; }
    l.transform = { ...l.transform, w: size, h: size, x: Math.round(x - size / 2), y: Math.round(y - size / 2), rotation: 0 };
  });
}

export function EmojisPanel() {
  const q = useDraft();
  const [size, setSize] = useState(260);
  const [layout, setLayout] = useState<EmojiLayout>('row');
  if (q.content.gameType !== 'movie-emojis') return null;
  const emojis = q.scene.layers.filter((l) => l.kind === 'emoji');
  const add = (e: string) => setQuestion((d) => {
    const l = emojiLayer(e, transform(0, 0, size, size));
    l.revealStep = d.scene.layers.filter((x) => x.kind === 'emoji').length && d.scene.layers.some((x) => x.kind === 'emoji' && x.revealStep > 0) ? d.scene.layers.filter((x) => x.kind === 'emoji').length : 0;
    d.scene.layers.push(l); arrangeEmojis(d, layout, size);
  });
  const progressive = emojis.some((l) => l.revealStep > 0);
  return (
    <>
      <Section title="Answer"><MovieAnswer />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Year"><Input value={q.content.year} onChange={(e) => setContent<'movie-emojis'>((c) => { c.year = e.target.value; }, 'year')} /></Field>
        </div>
        <Field label="Explanation hint (optional)"><Textarea rows={2} value={q.content.explanation} placeholder="🦁 = Simba, 👑 = king…" onChange={(e) => setContent<'movie-emojis'>((c) => { c.explanation = e.target.value; }, 'expl')} /></Field>
      </Section>
      <Section title={`Emoji clues (${emojis.length})`} actions={<AiSuggest task="emojis" question={q} label="Suggest" single onAccept={([line]) => splitEmoji(line).forEach(add)} />}>
        <Field label="Type or paste emojis"><Input placeholder="🦁👑🌅" data-testid="emoji-paste" onKeyDown={(e) => { if (e.key === 'Enter') { splitEmoji((e.target as HTMLInputElement).value).forEach(add); (e.target as HTMLInputElement).value = ''; } }} /></Field>
        <EmojiPicker onPick={add} />
        <div className="flex flex-wrap gap-1">
          {emojis.map((l, i) => (
            <div key={l.id} className="flex items-center gap-0.5 rounded border border-line bg-panel-2 px-1">
              <button className="text-xl" onClick={() => useEditor.getState().select([l.id])} title="Select on canvas">{l.kind === 'emoji' ? l.emoji : ''}</button>
              <span className="text-[10px] text-muted">{l.revealStep > 0 ? `#${l.revealStep}` : ''}</span>
              <button aria-label="Move earlier" disabled={i === 0} className="text-muted disabled:opacity-30" onClick={() => setQuestion((d) => { const em = d.scene.layers.filter((x) => x.kind === 'emoji'); const a = d.scene.layers.indexOf(em[i]), b = d.scene.layers.indexOf(em[i - 1]); [d.scene.layers[a], d.scene.layers[b]] = [d.scene.layers[b], d.scene.layers[a]]; arrangeEmojis(d, layout, size); })}><ArrowUp size={10} className="-rotate-90" /></button>
              <button aria-label="Remove emoji" className="text-muted hover:text-danger" onClick={() => setQuestion((d) => { d.scene.layers = d.scene.layers.filter((x) => x.id !== l.id); })}><Trash2 size={10} /></button>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Layout">
        <div className="flex flex-wrap gap-1">
          {(['row', 'two-rows', 'grid', 'staircase', 'circle'] as EmojiLayout[]).map((lt) => <Button key={lt} size="sm" variant="outline" active={layout === lt} onClick={() => { setLayout(lt); setQuestion((d) => arrangeEmojis(d, lt, size)); }}>{lt}</Button>)}
        </div>
        <SliderField label="Emoji size" value={size} min={80} max={500} step={10} onChange={(v) => { setSize(v); setQuestion((d) => arrangeEmojis(d, layout, v), 'emoji-size'); }} />
        <Toggle label="Progressive reveal (one emoji at a time)" checked={progressive} onChange={(v) => setQuestion((d) => { d.scene.layers.filter((x) => x.kind === 'emoji').forEach((x, i) => { x.revealStep = v ? i : 0; }); })} />
        <p className="text-[11px] text-muted">Drag, resize and rotate emojis directly on the canvas. Emojis stay editable text, never flattened images.</p>
      </Section>
      <Section title="Background" defaultOpen={false}><BackgroundPresets /></Section>
    </>
  );
}

const PLOT_STYLES = ['Ridiculously literal', 'Technically correct', 'Misleading but fair', 'Comedic', 'Extremely vague', 'One sentence', 'Two sentences', 'Extended paragraph'];
const TONES = ['deadpan', 'sarcastic', 'dramatic', 'childlike', 'corporate', 'noir'];

export function BadPlotPanel() {
  const q = useDraft();
  const [style, setStyle] = useState(PLOT_STYLES[0]);
  if (q.content.gameType !== 'movie-bad-plot') return null;
  const c = q.content;
  const plot = firstLayer(q, 'text', 'Plot');
  const clueCards = q.scene.layers.filter((l): l is TextLayer => l.kind === 'text' && l.name.startsWith('Clue'));
  const addVariant = (text = '', ai = false) => setContent<'movie-bad-plot'>((x) => { const id = uid('v'); x.variants.push({ id, style, tone: TONES[0], doc: plainDoc(text), aiGenerated: ai }); x.activeVariantId ??= id; });
  const useVariant = (id: string) => setQuestion((d) => {
    if (d.content.gameType !== 'movie-bad-plot') return;
    const v = d.content.variants.find((x) => x.id === id); if (!v) return;
    d.content.activeVariantId = id;
    let l = d.scene.layers.find((x) => x.kind === 'text' && x.name === 'Plot');
    if (!l) { l = textLayer('', transform(260, 220, 1400, 700), { fontSize: 64, background: 'rgba(255,255,255,0.06)', padding: 48, radius: 28 }, 'Plot'); d.scene.layers.push(l); }
    if (l.kind === 'text') l.doc = structuredClone(v.doc);
  });
  return (
    <>
      <Section title="Answer (hidden from audience)"><MovieAnswer /></Section>
      {plot && (
        <Section title="On-slide description">
          <RichTextEditor value={plot.doc} onChange={(doc) => updateLayer<'text'>(plot.id, (l) => { l.doc = doc; }, 'plotdoc')} testId="plot-editor" />
          <CharCount text={docToPlainText(plot.doc)} max={c.maxLength} />
        </Section>
      )}
      <Section title={`Variants (${c.variants.length})`} actions={<AiSuggest task="bad-plot" question={q} extra={style} label="Draft with AI" onAccept={(lines) => lines.forEach((t) => addVariant(t, true))} />}>
        <div className="flex gap-1">
          <Select aria-label="Style" value={style} onChange={(e) => setStyle(e.target.value)}>{PLOT_STYLES.map((s) => <option key={s}>{s}</option>)}</Select>
          <Button size="sm" variant="outline" onClick={() => addVariant(plot ? docToPlainText(plot.doc) : '')}><Plus size={12} />Add</Button>
        </div>
        {c.variants.map((v) => (
          <div key={v.id} className={`rounded border p-2 ${c.activeVariantId === v.id ? 'border-accent' : 'border-line'}`}>
            <div className="mb-1 flex items-center gap-1">
              <Select aria-label="Variant style" className="h-7 text-xs" value={v.style} onChange={(e) => setContent<'movie-bad-plot'>((x) => { const t = x.variants.find((y) => y.id === v.id); if (t) t.style = e.target.value; })}>{PLOT_STYLES.map((s) => <option key={s}>{s}</option>)}</Select>
              <Select aria-label="Tone" className="h-7 w-28 text-xs" value={v.tone} onChange={(e) => setContent<'movie-bad-plot'>((x) => { const t = x.variants.find((y) => y.id === v.id); if (t) t.tone = e.target.value; })}>{TONES.map((s) => <option key={s}>{s}</option>)}</Select>
              {v.aiGenerated && <Badge color="#a855f7">AI</Badge>}
            </div>
            <RichTextEditor value={v.doc} minHeight={50} onChange={(doc) => setContent<'movie-bad-plot'>((x) => { const t = x.variants.find((y) => y.id === v.id); if (t) t.doc = doc; }, `var-${v.id}`)} />
            <div className="mt-1 flex items-center gap-1">
              <CharCount text={docToPlainText(v.doc)} max={c.maxLength} />
              <Button size="sm" variant={c.activeVariantId === v.id ? 'primary' : 'outline'} className="ml-auto" onClick={() => useVariant(v.id)}>Use on slide</Button>
              <Button size="icon-sm" variant="ghost" tooltip="Delete variant" onClick={() => setContent<'movie-bad-plot'>((x) => { x.variants = x.variants.filter((y) => y.id !== v.id); if (x.activeVariantId === v.id) x.activeVariantId = null; })}><Trash2 size={12} /></Button>
            </div>
          </div>
        ))}
        <SliderField label="Length limit (characters, 0 = none)" value={c.maxLength} min={0} max={1000} step={10} onChange={(v) => setContent<'movie-bad-plot'>((x) => { x.maxLength = v; }, 'maxlen')} />
      </Section>
      <Section title={`Progressive clue cards (${clueCards.length})`}>
        {clueCards.map((l, i) => (
          <div key={l.id} className="flex items-start gap-1">
            <span className="mt-1.5 text-[11px] text-muted">#{l.revealStep}</span>
            <Textarea rows={2} value={docToPlainText(l.doc)} onChange={(e) => updateLayer<'text'>(l.id, (x) => { x.doc = plainDoc(e.target.value); }, 'clue')} aria-label={`Clue ${i + 1}`} />
            <Button size="icon-sm" variant="ghost" tooltip="Remove card" onClick={() => setQuestion((d) => { d.scene.layers = d.scene.layers.filter((x) => x.id !== l.id); })}><Trash2 size={12} /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={() => setQuestion((d) => {
          const n = d.scene.layers.filter((l) => l.kind === 'text' && l.name.startsWith('Clue')).length;
          const t = textLayer(`Clue ${n + 1}`, transform(260, 200 + (n % 3) * 280, 1400, 240), { fontSize: 48, background: 'rgba(255,255,255,0.08)', padding: 32, radius: 24 }, `Clue ${n + 1}`);
          t.revealStep = n + 1; d.scene.layers.push(t);
          const p = d.scene.layers.find((x) => x.kind === 'text' && x.name === 'Plot'); if (p && n === 0) p.visible = false;
        })}><Plus size={12} />Add clue card</Button>
        <p className="text-[11px] text-muted">Clue cards appear one by one when presenting (reveal steps). The main description is hidden when you add the first card; re-enable it in Layers.</p>
      </Section>
    </>
  );
}

function CharCount({ text, max }: { text: string; max: number }) {
  const over = max > 0 && text.length > max;
  return <span className={`text-[11px] ${over ? 'text-danger' : 'text-muted'}`}>{text.length}{max > 0 ? ` / ${max}` : ''} characters{over ? ' — over limit' : ''}</span>;
}

export function DialoguePanel() {
  const q = useDraft();
  const dl = firstLayer(q, 'dialogue');
  if (q.content.gameType !== 'movie-dialogue') return null;
  const set = (fn: (l: DialogueLayer) => void, k?: string) => dl && updateLayer<'dialogue'>(dl.id, fn, k);
  return (
    <>
      <Section title="Answer"><MovieAnswer />
        <Field label="Attribution (who says it, scene)"><Input value={q.content.attribution} onChange={(e) => setContent<'movie-dialogue'>((c) => { c.attribution = e.target.value; }, 'attr')} placeholder="e.g. Roy Scheider as Chief Brody" /></Field>
        <Field label="Source notes (verify the exact wording)"><Textarea rows={2} value={q.content.sourceNotes} onChange={(e) => setContent<'movie-dialogue'>((c) => { c.sourceNotes = e.target.value; }, 'src')} placeholder="Script page, timestamp or reference used to verify the quote" /></Field>
        <p className="text-[11px] text-muted">Only use real quotations you have verified. The app never generates dialogue.</p>
      </Section>
      {!dl && <Section title="Dialogue"><Button size="sm" onClick={() => setQuestion((d) => { d.scene.layers.push(dialogueLayer(transform(200, 220, 1520, 760))); })}><Plus size={12} />Add dialogue block</Button></Section>}
      {dl && (
        <Section title={`Lines (${dl.lines.length})`}>
          {dl.lines.map((ln, i) => (
            <div key={ln.id} className="flex flex-col gap-1 rounded border border-line bg-panel-2 p-2">
              <div className="flex items-center gap-1">
                <Input className="h-7" placeholder="Speaker" value={ln.speaker} aria-label={`Speaker ${i + 1}`} onChange={(e) => set((l) => { l.lines[i].speaker = e.target.value; }, 'spk')} />
                <label className="flex items-center gap-1 text-[11px] text-muted">step<input type="number" min={0} value={ln.revealStep} className="w-10 rounded border border-line bg-panel px-1 text-fg" onChange={(e) => set((l) => { l.lines[i].revealStep = Math.max(0, Number(e.target.value) || 0); })} /></label>
                <button aria-label="Move up" disabled={i === 0} className="text-muted disabled:opacity-30" onClick={() => set((l) => { [l.lines[i - 1], l.lines[i]] = [l.lines[i], l.lines[i - 1]]; })}><ArrowUp size={12} /></button>
                <button aria-label="Move down" disabled={i === dl.lines.length - 1} className="text-muted disabled:opacity-30" onClick={() => set((l) => { [l.lines[i + 1], l.lines[i]] = [l.lines[i], l.lines[i + 1]]; })}><ArrowDown size={12} /></button>
                <button aria-label="Remove line" className="text-muted hover:text-danger" onClick={() => set((l) => { l.lines.splice(i, 1); })}><Trash2 size={12} /></button>
              </div>
              <Textarea rows={2} placeholder="Line of dialogue" value={ln.text} aria-label={`Line ${i + 1}`} data-testid={`dialogue-line-${i}`} onChange={(e) => set((l) => { l.lines[i].text = e.target.value; }, 'line')} />
            </div>
          ))}
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => set((l) => { l.lines.push({ id: uid('dl'), speaker: '', text: '', revealStep: 0 }); })} data-testid="add-line"><Plus size={12} />Add line</Button>
            <Button size="sm" variant="ghost" onClick={() => set((l) => { l.lines.forEach((x, i) => { x.revealStep = i; }); })}><ListOrdered size={12} />Reveal line by line</Button>
          </div>
        </Section>
      )}
      {dl && (
        <Section title="Typography">
          <Field label="Style"><Select value={dl.style} onChange={(e) => set((l) => { l.style = e.target.value as DialogueLayer['style']; })}><option value="quote">Quotation</option><option value="script">Screenplay</option><option value="subtitle">Subtitles</option><option value="bubble">Speech bubbles</option></Select></Field>
          <Toggle label="Show speaker labels" checked={dl.showSpeakers} onChange={(v) => set((l) => { l.showSpeakers = v; })} />
          <Field label="Font"><Select value={dl.fontFamily} onChange={(e) => set((l) => { l.fontFamily = e.target.value; })}>{FONTS.map((f) => <option key={f} value={f}>{f.split(',')[0].replace(/"/g, '')}</option>)}</Select></Field>
          <SliderField label="Font size" value={dl.fontSize} min={20} max={140} step={1} onChange={(v) => set((l) => { l.fontSize = v; }, 'dfs')} />
          <ColorField label="Text colour" value={dl.color} onChange={(v) => set((l) => { l.color = v; }, 'dcol')} />
          <ColorField label="Accent colour" value={dl.accent} onChange={(v) => set((l) => { l.accent = v; }, 'dacc')} />
        </Section>
      )}
    </>
  );
}

type PropLayout = 'row' | 'grid' | 'freeform';
function arrangeProps(q: Question, layout: PropLayout, spacing: number) {
  const props = q.scene.layers.filter((l): l is ImageLayer => l.kind === 'image' && l.name.startsWith('Prop'));
  const n = props.length; if (!n || layout === 'freeform') return;
  const W = q.scene.width, H = q.scene.height, top = 190, availH = H - top - 60;
  if (layout === 'row') {
    const w = Math.min(560, (W - 120 - spacing * (n - 1)) / n);
    props.forEach((p, i) => { p.transform = { ...p.transform, w: Math.round(w), h: Math.round(Math.min(w, availH)), x: Math.round((W - (w * n + spacing * (n - 1))) / 2 + i * (w + spacing)), y: Math.round(top + (availH - Math.min(w, availH)) / 2), rotation: 0 }; });
  } else {
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    const cw = (W - 160 - spacing * (cols - 1)) / cols, ch = (availH - spacing * (rows - 1)) / rows, s = Math.min(cw, ch);
    props.forEach((p, i) => { const c = i % cols, r = Math.floor(i / cols); p.transform = { ...p.transform, w: Math.round(s), h: Math.round(s), x: Math.round((W - (s * cols + spacing * (cols - 1))) / 2 + c * (s + spacing)), y: Math.round(top + r * (s + spacing)), rotation: 0 }; });
  }
}

export function PropsPanel({ onOpenImageStudio }: { onOpenImageStudio: (id: string) => void }) {
  const q = useDraft();
  if (q.content.gameType !== 'movie-props') return null;
  const c = q.content;
  const props = q.scene.layers.filter((l): l is ImageLayer => l.kind === 'image' && l.name.startsWith('Prop'));
  const relayout = (layout = c.layout, spacing = c.spacing) => setQuestion((d) => { if (d.content.gameType === 'movie-props') { d.content.layout = layout; d.content.spacing = spacing; } arrangeProps(d, layout, spacing); }, 'props-layout');
  return (
    <>
      <Section title="Answer"><MovieAnswer /></Section>
      <Section title={`Props (${props.length})`}>
        {props.map((p, i) => (
          <div key={p.id} className="flex flex-col gap-1 rounded border border-line bg-panel-2 p-2" data-testid={`prop-${i}`}>
            <div className="flex items-center gap-1 text-xs font-medium"><span className="flex-1">{p.name}</span>
              <span className="text-[10px] text-muted">step {p.revealStep}</span>
              <Button size="icon-sm" variant="ghost" tooltip="Image Studio: crop, rotate, background removal, masks" disabled={!p.assetId} onClick={() => onOpenImageStudio(p.id)}><Wand2 size={12} /></Button>
              <Button size="icon-sm" variant="ghost" tooltip="Remove prop" onClick={() => setQuestion((d) => { d.scene.layers = d.scene.layers.filter((x) => x.id !== p.id && !(x.kind === 'text' && x.name === `${p.name} label`)); })}><Trash2 size={12} /></Button>
            </div>
            <ImageSlot layer={p} label="prop" testId={`upload-prop-${i}`} />
            <div className="flex flex-wrap gap-2">
              <Toggle label="Remove background" checked={!!p.cutout?.enabled} onChange={(v) => updateLayer<'image'>(p.id, (l) => { l.cutout = { ...(l.cutout ?? { auto: true, tolerance: 40, feather: 1, mask: { ops: [], invert: false } }), enabled: v }; })} />
              <Toggle label="Shadow" checked={(p.shadow?.blur ?? 0) > 0} onChange={(v) => updateLayer<'image'>(p.id, (l) => { l.shadow = v ? { blur: 40, color: 'rgba(0,0,0,0.6)', x: 0, y: 16 } : undefined; })} />
            </div>
            <Input className="h-7" placeholder="Optional annotation shown under the prop" value={(q.scene.layers.find((x) => x.kind === 'text' && x.name === `${p.name} label`) as TextLayer | undefined) ? docToPlainText((q.scene.layers.find((x) => x.kind === 'text' && x.name === `${p.name} label`) as TextLayer).doc) : ''}
              onChange={(e) => setQuestion((d) => {
                const name = `${p.name} label`;
                let t = d.scene.layers.find((x) => x.kind === 'text' && x.name === name) as TextLayer | undefined;
                if (!e.target.value) { d.scene.layers = d.scene.layers.filter((x) => x !== t); return; }
                if (!t) { const pt = p.transform; t = textLayer('', transform(pt.x, pt.y + pt.h + 10, pt.w, 70), { fontSize: 36, padding: 4 }, name); t.revealStep = p.revealStep; d.scene.layers.push(t); }
                t.doc = plainDoc(e.target.value);
              }, `ann-${p.id}`)} />
          </div>
        ))}
        <Button size="sm" variant="outline" data-testid="add-prop" onClick={() => setQuestion((d) => {
          const n = d.scene.layers.filter((l) => l.kind === 'image' && l.name.startsWith('Prop')).length;
          d.scene.layers.push(imageLayer(null, transform(100, 300, 400, 400), { name: `Prop ${n + 1}` }));
          if (d.content.gameType === 'movie-props') arrangeProps(d, d.content.layout, d.content.spacing);
        })}><Plus size={12} />Add prop</Button>
      </Section>
      <Section title="Layout">
        <div className="flex gap-1">{(['row', 'grid', 'freeform'] as PropLayout[]).map((lt) => <Button key={lt} size="sm" variant="outline" active={c.layout === lt} onClick={() => relayout(lt)}>{lt}</Button>)}</div>
        <SliderField label="Spacing" value={c.spacing} min={0} max={200} step={2} onChange={(v) => relayout(c.layout, v)} />
        <Toggle label="Progressive reveal (one prop at a time)" checked={props.some((p) => p.revealStep > 0)} onChange={(v) => setQuestion((d) => { d.scene.layers.filter((l) => l.kind === 'image' && l.name.startsWith('Prop')).forEach((l, i) => { l.revealStep = v ? i : 0; }); })} />
        <p className="text-[11px] text-muted">Freeform: move, scale and rotate each prop directly on the canvas.</p>
      </Section>
      <Section title="Background theme" defaultOpen={false}><BackgroundPresets /></Section>
    </>
  );
}

function shiftDate(base: Date, i: number) { const d = new Date(base); d.setMinutes(d.getMinutes() + i * 37); return d; }

export function SearchHistoryPanel() {
  const q = useDraft();
  let sl = firstLayer(q, 'search');
  if (q.content.gameType !== 'movie-search-history') return null;
  const set = (fn: (l: SearchLayer) => void, k?: string) => sl && updateLayer<'search'>(sl.id, fn, k);
  const addEntries = (texts: string[]) => set((l) => {
    for (const text of texts) { if (l.entries.length >= 20) break; l.entries.push({ id: uid('se'), text, date: '', time: '', revealStep: l.entries.some((e) => e.revealStep > 0) ? l.entries.length : 0 }); }
  });
  if (!sl) {
    return <Section title="Search card"><Button size="sm" onClick={() => setQuestion((d) => { d.scene.layers.push(searchLayer(transform(260, 190, 1400, 840))); })}><Plus size={12} />Add search card</Button></Section>;
  }
  sl = sl as SearchLayer;
  return (
    <>
      <Section title="Answer"><MovieAnswer />
        <Field label="Whose history? (persona, for your reference)"><Input value={q.content.persona} onChange={(e) => setContent<'movie-search-history'>((c) => { c.persona = e.target.value; }, 'persona')} placeholder="e.g. the shark" /></Field>
      </Section>
      <Section title={`Searches (${sl.entries.length}/20)`} actions={<AiSuggest task="search-history" question={q} label="Generate" onAccept={addEntries} />}>
        {sl.entries.map((e, i) => (
          <div key={e.id} className="flex flex-col gap-1 rounded border border-line bg-panel-2 p-1.5">
            <div className="flex items-center gap-1">
              <Input className="h-7" value={e.text} placeholder="Search text" aria-label={`Search ${i + 1}`} data-testid={`search-entry-${i}`} onChange={(ev) => set((l) => { l.entries[i].text = ev.target.value; }, 'stext')} />
              <button aria-label="Move up" disabled={i === 0} className="text-muted disabled:opacity-30" onClick={() => set((l) => { [l.entries[i - 1], l.entries[i]] = [l.entries[i], l.entries[i - 1]]; })}><ArrowUp size={12} /></button>
              <button aria-label="Move down" disabled={i === sl!.entries.length - 1} className="text-muted disabled:opacity-30" onClick={() => set((l) => { [l.entries[i + 1], l.entries[i]] = [l.entries[i], l.entries[i + 1]]; })}><ArrowDown size={12} /></button>
              <button aria-label="Delete search" className="text-muted hover:text-danger" onClick={() => set((l) => { l.entries.splice(i, 1); })}><Trash2 size={12} /></button>
            </div>
            <div className="flex items-center gap-1">
              <Input className="h-6 text-[11px]" placeholder="Date" value={e.date} aria-label={`Date ${i + 1}`} onChange={(ev) => set((l) => { l.entries[i].date = ev.target.value; }, 'sdate')} />
              <Input className="h-6 text-[11px]" placeholder="Time" value={e.time} aria-label={`Time ${i + 1}`} onChange={(ev) => set((l) => { l.entries[i].time = ev.target.value; }, 'stime')} />
              <label className="flex items-center gap-1 text-[10px] text-muted">step<input type="number" min={0} value={e.revealStep} className="w-9 rounded border border-line bg-panel px-1 text-fg" onChange={(ev) => set((l) => { l.entries[i].revealStep = Math.max(0, Number(ev.target.value) || 0); })} /></label>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" disabled={sl.entries.length >= 20} onClick={() => addEntries([''])} data-testid="add-search"><Plus size={12} />Add search</Button>
          <Button size="sm" variant="ghost" onClick={() => set((l) => { const base = new Date(); base.setHours(21, 4, 0, 0); l.entries.forEach((e, i) => { const d = shiftDate(base, i); e.date = d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); e.time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }); })}><CalendarClock size={12} />Simulate dates & times</Button>
          <Button size="sm" variant="ghost" onClick={() => set((l) => { const prog = l.entries.some((e) => e.revealStep > 0); l.entries.forEach((e, i) => { e.revealStep = prog ? 0 : i; }); })}><ListOrdered size={12} />Toggle progressive reveal</Button>
        </div>
      </Section>
      <Section title="Card style">
        <Field label="Theme"><Select value={sl.theme} onChange={(e) => set((l) => { l.theme = e.target.value as SearchLayer['theme']; })}><option value="light">Light</option><option value="dark">Dark</option><option value="retro">Retro desktop</option><option value="mobile">Mobile</option></Select></Field>
        <Field label="Search engine name (fictional)"><Input value={sl.engineName} onChange={(e) => set((l) => { l.engineName = e.target.value; }, 'eng')} /></Field>
        <Field label="Card title"><Input value={sl.title} onChange={(e) => set((l) => { l.title = e.target.value; }, 'stitle')} /></Field>
        <Toggle label="Show dates/times" checked={sl.showDates} onChange={(v) => set((l) => { l.showDates = v; })} />
        <Toggle label="Show suggestion chips" checked={sl.showSuggestions} onChange={(v) => set((l) => { l.showSuggestions = v; })} />
        {sl.showSuggestions && <Textarea rows={2} placeholder="One suggestion per line" value={sl.suggestions.join('\n')} onChange={(e) => set((l) => { l.suggestions = e.target.value.split('\n'); }, 'sugg')} />}
        <p className="text-[11px] text-muted">Uses a generic, fictional search interface — no third-party logos or branding.</p>
      </Section>
      <Section title="Background" defaultOpen={false}><BackgroundPresets /></Section>
    </>
  );
}

const PERSPECTIVES = [['villain', 'Villain'], ['minor', 'Minor character'], ['background', 'Background character'], ['bystander', 'Bystander'], ['parent', 'Parent'], ['child', 'Child'], ['supporting', 'Supporting character'], ['object', 'Object perspective'], ['custom', 'Custom narrator']] as const;
const PTONES = ['humorous', 'serious', 'mysterious', 'dramatic', 'misleading'] as const;

export function PerspectivePanel() {
  const q = useDraft();
  if (q.content.gameType !== 'movie-perspective') return null;
  const c = q.content;
  const narration = q.scene.layers.filter((l): l is TextLayer => l.kind === 'text' && l.name.startsWith('Narration'));
  const applyParagraphs = (paras: string[], sequence: boolean) => setQuestion((d) => {
    d.scene.layers = d.scene.layers.filter((l) => !(l.kind === 'text' && l.name.startsWith('Narration')));
    const n = Math.max(1, paras.length);
    const h = Math.floor(760 / n) - 20;
    paras.forEach((p, i) => {
      const t = textLayer(p, transform(220, 210 + i * (h + 20), 1480, h), { fontSize: n > 2 ? 40 : 52, italic: true, align: 'left', background: 'rgba(255,255,255,0.06)', padding: 40, radius: 24 }, i ? `Narration ${i + 1}` : 'Narration');
      t.revealStep = sequence ? i : 0;
      d.scene.layers.push(t);
    });
  });
  const narrLabel = PERSPECTIVES.find((p) => p[0] === c.perspective)?.[1];
  return (
    <>
      <Section title="Answer"><MovieAnswer /></Section>
      <Section title="Narrator">
        <Field label="Narrator identity"><Input value={c.narrator} placeholder="e.g. The volleyball" onChange={(e) => setContent<'movie-perspective'>((x) => { x.narrator = e.target.value; }, 'narr')} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Perspective"><Select value={c.perspective} onChange={(e) => setContent<'movie-perspective'>((x) => { x.perspective = e.target.value as typeof c.perspective; })}>{PERSPECTIVES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
          <Field label="Tone"><Select value={c.tone} onChange={(e) => setContent<'movie-perspective'>((x) => { x.tone = e.target.value as typeof c.tone; })}>{PTONES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        </div>
      </Section>
      <Section title={`Narrative on slide (${narration.length} paragraph${narration.length === 1 ? '' : 's'})`} actions={<AiSuggest task="perspective" question={q} extra={`${narrLabel}: ${c.narrator || 'unnamed'}, tone ${c.tone}`} label="Draft with AI"
        onAccept={(lines) => setContent<'movie-perspective'>((x) => { x.variants.push({ id: uid('pv'), label: `AI · ${c.tone}`, paragraphs: lines }); })} />}>
        {narration.map((l, i) => (
          <div key={l.id} className="flex flex-col gap-1">
            <span className="text-[11px] text-muted">Paragraph {i + 1} · reveal step {l.revealStep}</span>
            <RichTextEditor value={l.doc} minHeight={60} onChange={(doc) => updateLayer<'text'>(l.id, (x) => { x.doc = doc; }, 'narr-doc')} testId={i === 0 ? 'narration-editor' : undefined} />
          </div>
        ))}
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => applyParagraphs([...narration.map((l) => docToPlainText(l.doc)), ''], narration.some((l) => l.revealStep > 0))}><Plus size={12} />Add paragraph</Button>
          <Button size="sm" variant="ghost" onClick={() => applyParagraphs(narration.map((l) => docToPlainText(l.doc)), !narration.some((l) => l.revealStep > 0))}><ListOrdered size={12} />Toggle reveal sequence</Button>
          <Button size="sm" variant="ghost" onClick={() => setContent<'movie-perspective'>((x) => { x.variants.push({ id: uid('pv'), label: `Saved ${new Date().toLocaleTimeString()}`, paragraphs: narration.map((l) => docToPlainText(l.doc)) }); })}>Save as variant</Button>
        </div>
      </Section>
      <Section title={`Saved variants (${c.variants.length})`} defaultOpen={c.variants.length > 0}>
        {c.variants.map((v) => (
          <div key={v.id} className="rounded border border-line p-2 text-xs">
            <div className="mb-1 flex items-center gap-1"><Input className="h-6 text-xs" value={v.label} onChange={(e) => setContent<'movie-perspective'>((x) => { const t = x.variants.find((y) => y.id === v.id); if (t) t.label = e.target.value; }, 'vlabel')} />
              <Button size="sm" variant="outline" onClick={() => applyParagraphs(v.paragraphs, v.paragraphs.length > 1)}>Use</Button>
              <Button size="icon-sm" variant="ghost" tooltip="Delete variant" onClick={() => setContent<'movie-perspective'>((x) => { x.variants = x.variants.filter((y) => y.id !== v.id); })}><Trash2 size={12} /></Button>
            </div>
            <Textarea rows={3} value={v.paragraphs.join('\n\n')} onChange={(e) => setContent<'movie-perspective'>((x) => { const t = x.variants.find((y) => y.id === v.id); if (t) t.paragraphs = e.target.value.split(/\n\s*\n/); }, 'vparas')} />
          </div>
        ))}
        {!c.variants.length && <p className="text-[11px] text-muted">Save alternative versions of the narrative and switch between them.</p>}
      </Section>
    </>
  );
}

export type { Layer };
