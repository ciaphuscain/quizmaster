import { useMemo, useState } from 'react';
import { Input, Badge } from '@/components/ui/primitives';
import { searchCountries, countryStatus, getCountry, type CountryMeta } from '@/engines/geography/countries';
import { cn } from '@/utils/misc';

export function CountryPicker({ value, onChange, requireGeometry, testId = 'country-search' }: { value: string | null; onChange: (c: CountryMeta) => void; requireGeometry?: boolean; testId?: string }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => searchCountries(q, { requireGeometry, limit: 60 }), [q, requireGeometry]);
  const cur = getCountry(value);
  return (
    <div className="flex flex-col gap-1.5">
      {cur && (
        <div className="flex items-center gap-2 rounded border border-accent/50 bg-accent/10 px-2 py-1.5 text-xs">
          <span className="text-lg">{cur.emoji}</span><span className="font-medium">{cur.name}</span><span className="text-muted">{cur.iso3}</span>
          <StatusBadge c={cur} />
        </div>
      )}
      <Input placeholder="Search countries & territories…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search countries" data-testid={testId} />
      <div className="max-h-52 overflow-auto rounded border border-line" role="listbox" aria-label="Countries">
        {list.map((c) => (
          <button key={c.iso3} role="option" aria-selected={c.iso3 === value} onClick={() => onChange(c)}
            className={cn('flex w-full items-center gap-2 px-2 py-1 text-left text-xs hover:bg-panel-3', c.iso3 === value && 'bg-accent/15')} data-testid={`country-${c.iso3}`}>
            <span className="text-base">{c.emoji}</span><span className="flex-1 truncate">{c.name}</span>
            <StatusBadge c={c} />
            <span className="w-8 text-muted">{c.iso3}</span>
          </button>
        ))}
        {list.length === 0 && <div className="p-2 text-xs text-muted">No match</div>}
      </div>
    </div>
  );
}

export function StatusBadge({ c }: { c: CountryMeta }) {
  const s = countryStatus(c);
  if (s === 'sovereign') return null;
  return <Badge color={s === 'disputed' ? '#f97316' : '#38bdf8'}>{s === 'disputed' ? 'disputed' : 'territory'}</Badge>;
}
