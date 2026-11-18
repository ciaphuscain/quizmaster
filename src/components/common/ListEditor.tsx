import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button, Input } from '@/components/ui/primitives';

/** Editable ordered list of strings (aliases, hints, clues). */
export function StringListEditor({ items, onChange, placeholder, addLabel, testId }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string; addLabel: string; testId?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input value={it} placeholder={placeholder} aria-label={`${placeholder ?? 'Item'} ${i + 1}`} data-testid={testId ? `${testId}-${i}` : undefined} onChange={(e) => { const n = [...items]; n[i] = e.target.value; onChange(n); }} />
          <Button size="icon-sm" variant="ghost" tooltip="Move up" disabled={i === 0} onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }}><ArrowUp size={12} /></Button>
          <Button size="icon-sm" variant="ghost" tooltip="Move down" disabled={i === items.length - 1} onClick={() => { const n = [...items]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; onChange(n); }}><ArrowDown size={12} /></Button>
          <Button size="icon-sm" variant="ghost" tooltip="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={12} /></Button>
        </div>
      ))}
      <Button size="sm" variant="subtle" className="self-start" onClick={() => onChange([...items, ''])} data-testid={testId ? `${testId}-add` : undefined}><Plus size={12} />{addLabel}</Button>
    </div>
  );
}
