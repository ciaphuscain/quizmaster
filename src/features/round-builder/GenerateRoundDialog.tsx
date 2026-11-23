import { useMemo, useState } from 'react';
import { Wand2, Shuffle } from 'lucide-react';
import { Button, Field, Input, Select, Toggle } from '@/components/ui/primitives';
import { Dialog, toast, errorMessage } from '@/components/ui/overlays';
import { buildCountryQuestion, pickCountries, roundTitle, MODE_LABEL, type GenOptions, type GeoMode, type GeoRegion } from '@/engines/geography/generator';
import { questionsRepo } from '@/db/repositories/questions';
import { quizzesRepo } from '@/db/repositories/other';
import { renderThumbnails } from '@/features/questions/actions';
import { DIFFICULTIES, type Difficulty } from '@/types/schema';

/** Builds a complete geography round from real country data in one click. */
export function GenerateRoundDialog({ quizId, open, onOpenChange }: { quizId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [o, setO] = useState<GenOptions>({ mode: 'country-flag', region: 'all', difficulty: 'mixed', count: 10, sovereignOnly: true, seed: Math.floor(Math.random() * 1e6) });
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => pickCountries(o), [o]);
  const go = async () => {
    setBusy(true);
    try {
      const qs = preview.map((p) => buildCountryQuestion(p.country, p.mode, p.difficulty));
      for (const q of qs) await questionsRepo.create(q);
      // reuse an untouched, empty first round instead of leaving it behind
      const tree = await quizzesRepo.tree(quizId);
      const empty = tree?.rounds.length === 1 && !tree.rounds[0].refs.length ? tree.rounds[0] : null;
      const r = empty ? { ...empty, title: roundTitle(o) } : await quizzesRepo.addRound(quizId, roundTitle(o));
      if (empty) await quizzesRepo.updateRound(empty.id, { title: r.title });
      await quizzesRepo.addQuestions(r.id, qs.map((q) => q.id));
      toast.success(`Generated “${r.title}”`, `${qs.length} questions with answers, aliases and hints from real data.`);
      onOpenChange(false);
      void renderThumbnails(qs);
    } catch (e) { toast.error('Generation failed', errorMessage(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Generate a geography round" description="Creates finished, editable questions from validated country data — answers, alternative spellings and factual hints included." wide
      footer={<><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={busy || !preview.length} onClick={go} data-testid="generate-go"><Wand2 size={14} />Create {preview.length} questions</Button></>}>
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className="flex flex-col gap-3">
          <Field label="Question type"><Select value={o.mode} onChange={(e) => setO({ ...o, mode: e.target.value as GeoMode })} data-testid="gen-mode">
            {(Object.keys(MODE_LABEL) as GeoMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}{m === 'mixed' ? ' (flags → outlines → neighbours)' : ''}</option>)}
          </Select></Field>
          <Field label="Region"><Select value={o.region} onChange={(e) => setO({ ...o, region: e.target.value as GeoRegion })} data-testid="gen-region">
            {['all', 'Africa', 'Americas', 'Asia', 'Europe', 'Oceania'].map((r) => <option key={r} value={r}>{r === 'all' ? 'Whole world' : r}</option>)}
          </Select></Field>
          <Field label="Difficulty"><Select value={o.difficulty} onChange={(e) => setO({ ...o, difficulty: e.target.value as Difficulty | 'mixed' })}>
            <option value="mixed">Mixed</option>{DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select></Field>
          <Field label="Number of questions"><Input type="number" min={1} max={50} value={o.count} onChange={(e) => setO({ ...o, count: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} data-testid="gen-count" /></Field>
          <Toggle label="UN member states only" checked={o.sovereignOnly} onChange={(v) => setO({ ...o, sovereignOnly: v })} />
          <Button size="sm" variant="outline" onClick={() => setO({ ...o, seed: Math.floor(Math.random() * 1e6) })}><Shuffle size={12} />Shuffle selection</Button>
          <p className="text-[11px] text-muted">Difficulty heuristic: larger countries (and, for neighbour maps, those with more neighbours) count as easier.</p>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold">{roundTitle(o)} — {preview.length} question{preview.length === 1 ? '' : 's'}</div>
          {preview.length < o.count && <p className="mb-1 text-[11px] text-amber-500">Only {preview.length} countries match these filters.</p>}
          <ol className="grid max-h-80 grid-cols-2 gap-1 overflow-auto text-xs" data-testid="gen-preview">
            {preview.map((p, i) => (
              <li key={p.country.iso3} className="flex items-center gap-1.5 rounded bg-panel-2 px-2 py-1">
                <span className="w-5 text-right text-muted">{i + 1}.</span><span className="text-base">{p.country.emoji}</span>
                <span className="flex-1 truncate">{p.country.name}</span><span className="text-[10px] text-muted">{MODE_LABEL[p.mode].replace(/s$/, '')} · {p.difficulty}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Dialog>
  );
}
