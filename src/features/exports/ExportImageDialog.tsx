import { useState } from 'react';
import type { Question } from '@/types/schema';
import { Button, Field, Input, Select, Toggle } from '@/components/ui/primitives';
import { Dialog, toast, errorMessage } from '@/components/ui/overlays';
import { renderSceneToCanvas, canvasToBlob } from '@/engines/rendering/renderScene';
import { maxRevealStep } from '@/engines/scene/factories';
import { downloadBlob, safeFilename } from '@/features/questions/actions';
import { questionDisplayTitle } from '@/games/registry';

type Format = 'png' | 'png-transparent' | 'jpeg';
const WIDTHS = [640, 1280, 1920, 2560, 3840];

/** Exports the rendered question (never the unmodified source) at a chosen size and format. */
export function ExportImageDialog({ question, open, onOpenChange }: { question: Question; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [format, setFormat] = useState<Format>('png');
  const [width, setWidth] = useState(1920);
  const [answer, setAnswer] = useState(false);
  const [banner, setBanner] = useState(true);
  const [step, setStep] = useState<number>(Infinity);
  const [busy, setBusy] = useState(false);
  const steps = maxRevealStep(question.scene);
  const height = Math.round((width * question.scene.height) / question.scene.width);
  const run = async () => {
    setBusy(true);
    try {
      const c = await renderSceneToCanvas(question.scene, {
        revealStep: step, answerRevealed: answer, answerBanner: answer && banner ? question.correctAnswer : null, transparentBackground: format === 'png-transparent',
      }, width);
      const blob = await canvasToBlob(c, format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
      downloadBlob(blob, `${safeFilename(questionDisplayTitle(question))}${answer ? '-answer' : ''}-${width}w.${format === 'jpeg' ? 'jpg' : 'png'}`);
      onOpenChange(false);
    } catch (e) { toast.error('Export failed', errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Export question image" description={`Canvas ${question.scene.width}×${question.scene.height} — the rendered result with all edits and effects.`}
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={busy} onClick={run} data-testid="export-image-go">Export</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="Format"><Select value={format} onChange={(e) => setFormat(e.target.value as Format)} data-testid="export-format">
          <option value="png">PNG</option><option value="png-transparent">PNG — transparent background</option><option value="jpeg">JPEG</option>
        </Select></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Width (px)"><Select value={WIDTHS.includes(width) ? String(width) : 'custom'} onChange={(e) => e.target.value !== 'custom' && setWidth(Number(e.target.value))}>
            {WIDTHS.map((w) => <option key={w} value={w}>{w}{w === 3840 ? ' (4K)' : ''}</option>)}<option value="custom">Custom</option>
          </Select></Field>
          <Field label="Custom width"><Input type="number" min={64} max={8192} value={width} data-testid="export-width" onChange={(e) => setWidth(Math.max(64, Math.min(8192, Math.round(Number(e.target.value) || 0))))} /></Field>
        </div>
        <p className="text-[11px] text-muted">Output: {width}×{height}px (aspect ratio follows the canvas; change it from the canvas toolbar).</p>
        <Field label="Reveal state"><Select value={String(step)} onChange={(e) => setStep(Number(e.target.value))}>
          <option value="Infinity">All reveal steps</option>{Array.from({ length: steps + 1 }, (_, i) => <option key={i} value={i}>Step {i}</option>)}
        </Select></Field>
        <Toggle label="Answer revealed" checked={answer} onChange={setAnswer} />
        {answer && <Toggle label="Draw answer banner" checked={banner} onChange={setBanner} />}
      </div>
    </Dialog>
  );
}
