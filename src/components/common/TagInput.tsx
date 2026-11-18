import { useState } from 'react';
import { X } from 'lucide-react';

export function TagInput({ value, onChange, placeholder, label }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; label: string }) {
  const [text, setText] = useState('');
  const add = () => {
    const parts = text.split(',').map((t) => t.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...value, ...parts])]);
    setText('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-line bg-panel-2 p-1 focus-within:border-accent">
      {value.map((t) => (
        <span key={t} className="flex items-center gap-1 rounded bg-panel-3 px-1.5 py-0.5 text-[11px]">
          {t}
          <button aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="text-muted hover:text-fg"><X size={10} /></button>
        </span>
      ))}
      <input aria-label={label} value={text} placeholder={value.length ? '' : placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1)); }}
        onBlur={add}
        className="min-w-16 flex-1 bg-transparent px-1 text-[12px] outline-none" />
    </div>
  );
}
