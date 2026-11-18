import { useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import type { Question } from '@/types/schema';
import { Button, Textarea } from '@/components/ui/primitives';
import { Dialog, errorMessage } from '@/components/ui/overlays';
import { useSettings } from '@/stores/settings';
import { runAi, type AiTask } from './ai';

/**
 * Opens a review dialog with AI suggestions. Nothing is applied until the user selects and accepts.
 * Hidden entirely when AI is disabled.
 */
export function AiSuggest({ task, question, label, onAccept, extra, single }: { task: AiTask; question: Question; label: string; onAccept: (lines: string[]) => void; extra?: string; single?: boolean }) {
  const provider = useSettings((s) => s.settings.ai.provider);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<{ text: string; on: boolean }[]>([]);
  const abort = useRef<AbortController | null>(null);
  if (provider === 'none') return null;
  const go = async () => {
    setOpen(true); setBusy(true); setError(null); setItems([]);
    abort.current = new AbortController();
    try { const lines = await runAi(task, question, extra, abort.current.signal); setItems(lines.map((text) => ({ text, on: !single }))); }
    catch (e) { if ((e as Error).name !== 'AbortError') setError(errorMessage(e)); }
    finally { setBusy(false); }
  };
  const accepted = items.filter((i) => i.on && i.text.trim()).map((i) => i.text.trim());
  return (
    <>
      <Button size="sm" variant="ghost" className="h-6 text-[11px] text-accent" onClick={go}><Sparkles size={12} />{label}</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!o) abort.current?.abort(); setOpen(o); }} title="AI suggestions" description="Review, edit and choose suggestions. Nothing is saved unless you accept." wide
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>Reject all</Button>
          <Button variant="outline" onClick={go} disabled={busy}>Regenerate</Button>
          <Button variant="primary" disabled={!accepted.length} onClick={() => { onAccept(accepted); setOpen(false); }}>Accept {accepted.length || ''}</Button>
        </>}>
        {busy && <div className="flex items-center gap-2 text-xs text-muted"><Loader2 size={14} className="animate-spin" />Generating…</div>}
        {error && <div className="rounded border border-danger/40 bg-danger/10 p-2 text-xs text-danger">{error}</div>}
        <div className="flex flex-col gap-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-start gap-2">
              <input type={single ? 'radio' : 'checkbox'} name="ai-pick" className="mt-2" checked={it.on} aria-label={`Use suggestion ${i + 1}`}
                onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, on: e.target.checked } : single ? { ...x, on: false } : x)))} />
              <Textarea rows={2} value={it.text} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-muted">AI-generated suggestion — verify facts before use.</p>
      </Dialog>
    </>
  );
}
