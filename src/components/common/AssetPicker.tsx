import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Upload, Music } from 'lucide-react';
import { db } from '@/db/database';
import type { Asset } from '@/types/schema';
import { Button, Input } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/overlays';
import { useAssetUrl } from '@/hooks/useAssetUrl';
import { importFiles, pickFiles } from '@/features/questions/actions';
import { formatBytes } from '@/utils/misc';

export function AssetThumb({ asset, size = 96 }: { asset: Asset; size?: number }) {
  const url = useAssetUrl(asset.type === 'image' ? asset.id : null);
  return (
    <div className="checkerboard flex items-center justify-center overflow-hidden rounded" style={{ width: size, height: size }}>
      {asset.type === 'image' ? (url ? <img src={url} alt={asset.name} className="max-h-full max-w-full object-contain" draggable={false} /> : null) : <Music size={size / 3} className="text-zinc-500" />}
    </div>
  );
}

export function AssetPickerDialog({ open, onOpenChange, type, onPick, multiple }: { open: boolean; onOpenChange: (o: boolean) => void; type: Asset['type']; onPick: (assets: Asset[]) => void; multiple?: boolean }) {
  const assets = useLiveQuery(() => db.assets.where('type').equals(type).reverse().sortBy('createdAt'), [type]) ?? [];
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const list = useMemo(() => assets.filter((a) => !q || a.name.toLowerCase().includes(q.toLowerCase()) || a.tags.some((t) => t.includes(q.toLowerCase()))), [assets, q]);
  const upload = async () => {
    const files = await pickFiles(type === 'image' ? 'image/*' : 'audio/*', !!multiple);
    const added = await importFiles(files, type);
    if (added.length) { onPick(added); onOpenChange(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Choose ${type === 'image' ? 'image' : 'audio'}`} wide
      footer={<>
        <Button variant="outline" onClick={upload} data-testid="picker-upload"><Upload size={14} />Upload from computer</Button>
        {multiple && <Button variant="primary" disabled={!sel.length} onClick={() => { onPick(assets.filter((a) => sel.includes(a.id))); onOpenChange(false); setSel([]); }}>Use {sel.length} selected</Button>}
      </>}>
      <Input placeholder="Search media…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" aria-label="Search media" />
      {list.length === 0 && <div className="py-8 text-center text-xs text-muted">No {type} assets yet. Upload one.</div>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
        {list.map((a) => (
          <button key={a.id} className={`flex flex-col items-center gap-1 rounded border p-1.5 text-[11px] hover:border-accent ${sel.includes(a.id) ? 'border-accent bg-accent/10' : 'border-line'}`}
            onClick={() => { if (multiple) setSel(sel.includes(a.id) ? sel.filter((x) => x !== a.id) : [...sel, a.id]); else { onPick([a]); onOpenChange(false); } }}>
            <AssetThumb asset={a} />
            <span className="w-full truncate">{a.name}</span>
            <span className="text-muted">{a.width ? `${a.width}×${a.height}` : a.duration ? `${a.duration.toFixed(1)}s` : ''} · {formatBytes(a.size)}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}
