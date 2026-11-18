import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/database';
import { useEditor } from '@/stores/editor';
import { Field, Input, Section, Select, Textarea } from '@/components/ui/primitives';
import { TagInput } from '@/components/common/TagInput';
import { StringListEditor } from '@/components/common/ListEditor';
import { DIFFICULTIES, type Question } from '@/types/schema';
import { uid } from '@/utils/id';
import { AiSuggest } from '@/features/ai-assistant/AiSuggest';
import { dedupeAliases } from '@/utils/answers';
import { RevisionHistory } from './RevisionHistory';

export function QuestionPanel() {
  const q = useEditor((s) => s.draft) as Question;
  const update = useEditor((s) => s.update);
  const collections = useLiveQuery(() => db.collections.orderBy('name').toArray(), []) ?? [];
  const set = <K extends keyof Question>(k: K, v: Question[K], coalesce = true) => update((d) => { d[k] = v; }, coalesce ? { coalesce: `q-${String(k)}` } : undefined);
  return (
    <div>
      <Section title="Answer">
        <Field label="Correct answer">
          <Input data-testid="correct-answer" value={q.correctAnswer} placeholder="e.g. The Lion King" onChange={(e) => set('correctAnswer', e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1">
          <span className="flex items-center justify-between text-[11px] font-medium text-muted">Accepted alternatives
            <AiSuggest task="aliases" question={q} label="Suggest" onAccept={(lines) => set('acceptedAnswers', dedupeAliases(q.correctAnswer, [...q.acceptedAnswers, ...lines]), false)} />
          </span>
          <StringListEditor testId="alias" items={q.acceptedAnswers} onChange={(v) => set('acceptedAnswers', v)} placeholder="Alternative answer" addLabel="Add alternative" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center justify-between text-[11px] font-medium text-muted">Hints (revealed in order)
            <AiSuggest task="hints" question={q} label="Suggest" onAccept={(lines) => update((d) => { d.hints.push(...lines.map((text) => ({ id: uid('h'), text }))); })} />
          </span>
          <StringListEditor testId="hint" items={q.hints.map((h) => h.text)} onChange={(v) => update((d) => { d.hints = v.map((text, i) => ({ id: d.hints[i]?.id ?? uid('h'), text })); }, { coalesce: 'q-hints' })} placeholder="Hint" addLabel="Add hint" />
        </div>
      </Section>
      <Section title="Properties">
        <Field label="Title (internal)"><Input value={q.title} placeholder="Optional — defaults to the answer" onChange={(e) => set('title', e.target.value)} /></Field>
        <Field label="Prompt shown to audience"><Input value={q.prompt} onChange={(e) => set('prompt', e.target.value)} /></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Difficulty">
            <Select data-testid="difficulty" value={q.difficulty} onChange={(e) => set('difficulty', e.target.value as Question['difficulty'], false)}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Points"><Input type="number" min={0} value={q.points} onChange={(e) => set('points', Math.max(0, Number(e.target.value) || 0))} /></Field>
          <Field label="Time (s)"><Input type="number" min={0} value={q.timeLimit} onChange={(e) => set('timeLimit', Math.max(0, Math.round(Number(e.target.value) || 0)))} /></Field>
        </div>
        <Field label="Status">
          <Select value={q.status} onChange={(e) => set('status', e.target.value as Question['status'], false)}>
            <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
          </Select>
        </Field>
        <Field label="Tags"><TagInput label="Tags" value={q.tags} onChange={(v) => set('tags', v, false)} placeholder="Add tags…" /></Field>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-muted">Collections</span>
          {collections.length === 0 && <span className="text-[11px] text-muted">Create collections in the Collections page.</span>}
          <div className="flex flex-wrap gap-1">
            {collections.map((c) => {
              const on = q.collectionIds.includes(c.id);
              return (
                <button key={c.id} onClick={() => set('collectionIds', on ? q.collectionIds.filter((x) => x !== c.id) : [...q.collectionIds, c.id], false)}
                  className="rounded border px-1.5 py-0.5 text-[11px]" style={{ borderColor: on ? c.color : 'var(--border)', background: on ? `${c.color}22` : undefined, color: on ? c.color : undefined }} aria-pressed={on}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
        <Field label="Host notes (never shown to audience)"><Textarea rows={3} value={q.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <AiSuggest task="difficulty" question={q} label="Analyse difficulty with AI" onAccept={(lines) => set('notes', `${q.notes}${q.notes ? '\n' : ''}AI difficulty analysis: ${lines.join(' ')}`, false)} />
      </Section>
      <Section title="Revision history" defaultOpen={false}>
        <RevisionHistory questionId={q.id} />
      </Section>
    </div>
  );
}
