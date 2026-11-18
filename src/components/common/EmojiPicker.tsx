import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/primitives';
import { cn } from '@/utils/misc';

type E = { unicode: string; label: string; group?: number; tags?: string[] };
const GROUPS = ['Smileys', 'People', 'Components', 'Animals & nature', 'Food', 'Travel & places', 'Activities', 'Objects', 'Symbols', 'Flags'];
let cache: Promise<E[]> | null = null;
/** Emoji dataset from emojibase-data (MIT), bundled locally. */
function loadEmojis(): Promise<E[]> {
  if (!cache) cache = import('emojibase-data/en/compact.json').then((m) => ((m.default ?? m) as unknown as E[]).filter((e) => e.group !== undefined && e.group !== 2));
  return cache;
}

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [all, setAll] = useState<E[]>([]);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState(0);
  useEffect(() => { void loadEmojis().then(setAll); }, []);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) return all.filter((e) => e.label.includes(s) || e.tags?.some((t) => t.includes(s))).slice(0, 240);
    return all.filter((e) => e.group === group);
  }, [all, q, group]);
  return (
    <div className="flex flex-col gap-2">
      <Input placeholder="Search emoji (e.g. lion, ship, ring)…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search emoji" data-testid="emoji-search" />
      {!q && (
        <div className="flex flex-wrap gap-1">
          {GROUPS.map((g, i) => i === 2 ? null : (
            <button key={g} onClick={() => setGroup(i)} className={cn('rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-panel-3', group === i && 'bg-panel-3 text-fg')}>{g}</button>
          ))}
        </div>
      )}
      <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-auto" role="listbox" aria-label="Emoji">
        {list.map((e) => (
          <button key={e.unicode} title={e.label} aria-label={e.label} onClick={() => onPick(e.unicode)} className="rounded p-1 text-xl hover:bg-panel-3" data-testid={`emoji-${e.label}`}>{e.unicode}</button>
        ))}
      </div>
    </div>
  );
}
