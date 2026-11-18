import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Upload, Trash2, Music, Image as ImageIcon, Download, Play, Pause } from 'lucide-react';
import { db } from '@/db/database';
import { PageHeader } from '@/app/AppLayout';
import { Button, Input, Select, Badge } from '@/components/ui/primitives';
import { AssetThumb } from '@/components/common/AssetPicker';
import { TagInput } from '@/components/common/TagInput';
import { assetsRepo } from '@/db/repositories/assets';
import { importFiles, pickFiles, downloadBlob } from '@/features/questions/actions';
import { confirmDialog, toast, errorMessage } from '@/components/ui/overlays';
import { useAssetUrl } from '@/hooks/useAssetUrl';
import { formatBytes } from '@/utils/misc';
import type { Asset } from '@/types/schema';

export default function MediaLibrary() {
  const assets = useLiveQuery(() => db.assets.orderBy('createdAt').reverse().toArray(), []) ?? [];
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | 'image' | 'audio'>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const list = useMemo(() => assets.filter((a) => (type === 'all' || a.type === type) && (!q || a.name.toLowerCase().includes(q.toLowerCase()) || a.tags.some((t) => t.includes(q.toLowerCase())))), [assets, q, type]);
  const total = assets.reduce((s, a) => s + a.size, 0);
  const selected = assets.find((a) => a.id === sel);
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Media Library" subtitle={`${assets.length} assets · ${formatBytes(total)} stored locally · originals are never modified`}
        actions={<Button variant="primary" onClick={async () => { const a = await importFiles(await pickFiles('image/*,audio/*', true)); if (a.length) toast.success(`Imported ${a.length} file(s)`); }}><Upload size={14} />Upload</Button>} />
      <div className="flex items-center gap-2 border-b border-line bg-panel px-6 py-2">
        <Input className="max-w-sm" placeholder="Search by name or tag…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search media" />
        <Select className="w-32" value={type} onChange={(e) => setType(e.target.value as typeof type)} aria-label="Type filter"><option value="all">All types</option><option value="image">Images</option><option value="audio">Audio</option></Select>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className={`flex-1 overflow-auto p-6 ${dragOver ? 'bg-accent/5 ring-2 ring-inset ring-accent' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
          onDrop={async (e) => { e.preventDefault(); setDragOver(false); const a = await importFiles(e.dataTransfer.files); if (a.length) toast.success(`Imported ${a.length} file(s)`); }}>
          {list.length === 0 && <div className="py-16 text-center text-sm text-muted">Drop images or audio here, or click Upload.</div>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {list.map((a) => (
              <button key={a.id} onClick={() => setSel(a.id)} className={`flex flex-col items-center gap-1 rounded-lg border bg-panel p-2 text-left text-[11px] hover:border-accent ${sel === a.id ? 'border-accent' : 'border-line'}`}>
                <AssetThumb asset={a} size={120} />
                <span className="flex w-full items-center gap-1 truncate">{a.type === 'image' ? <ImageIcon size={11} /> : <Music size={11} />}<span className="truncate">{a.name}</span></span>
                <span className="w-full text-muted">{a.width ? `${a.width}×${a.height}` : a.duration ? `${a.duration.toFixed(1)} s` : ''} · {formatBytes(a.size)}</span>
              </button>
            ))}
          </div>
        </div>
        {selected && <AssetDetails asset={selected} onDeleted={() => setSel(null)} />}
      </div>
    </div>
  );
}

function AssetDetails({ asset, onDeleted }: { asset: Asset; onDeleted: () => void }) {
  const navigate = useNavigate();
  const url = useAssetUrl(asset.id);
  const refs = useLiveQuery(() => assetsRepo.references(asset.id), [asset.id]) ?? [];
  const refQs = useLiveQuery(() => db.summaries.bulkGet(refs.filter((r) => !r.startsWith('template:'))), [refs]) ?? [];
  const [playing, setPlaying] = useState<HTMLAudioElement | null>(null);
  const del = async () => {
    const msg = refs.length ? `This asset is used by ${refs.length} question(s)/template(s). Deleting it permanently will leave them with missing media.` : 'This permanently deletes the original file from local storage.';
    if (!(await confirmDialog({ title: `Delete ${asset.name}?`, message: msg, confirmLabel: refs.length ? 'Delete anyway' : 'Delete', danger: true }))) return;
    try { await assetsRepo.remove(asset.id, { force: true }); toast.success('Asset deleted'); onDeleted(); } catch (e) { toast.error('Delete failed', errorMessage(e)); }
  };
  return (
    <aside className="flex w-80 shrink-0 flex-col gap-3 overflow-auto border-l border-line bg-panel p-4 text-xs">
      {asset.type === 'image' ? (url && <img src={url} alt={asset.name} className="checkerboard max-h-60 w-full rounded object-contain" />) : (
        <Button variant="outline" onClick={() => { if (playing) { playing.pause(); setPlaying(null); } else if (url) { const a = new Audio(url); void a.play(); a.onended = () => setPlaying(null); setPlaying(a); } }}>{playing ? <Pause size={14} /> : <Play size={14} />}Preview audio</Button>
      )}
      <label className="flex flex-col gap-1"><span className="text-muted">Name</span><Input defaultValue={asset.name} key={asset.id} onBlur={(e) => assetsRepo.update(asset.id, { name: e.target.value || asset.name })} /></label>
      <div className="flex flex-col gap-1"><span className="text-muted">Tags</span><TagInput label="Asset tags" value={asset.tags} onChange={(tags) => assetsRepo.update(asset.id, { tags: tags.map((t) => t.toLowerCase()) })} /></div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted">
        <dt>Type</dt><dd className="text-fg">{asset.mime}</dd>
        <dt>Size</dt><dd className="text-fg">{formatBytes(asset.size)}</dd>
        {asset.width && <><dt>Dimensions</dt><dd className="text-fg">{asset.width}×{asset.height}</dd></>}
        {asset.duration && <><dt>Duration</dt><dd className="text-fg">{asset.duration.toFixed(2)} s</dd></>}
        <dt>Added</dt><dd className="text-fg">{new Date(asset.createdAt).toLocaleString()}</dd>
        <dt>SHA-256</dt><dd className="truncate font-mono text-fg" title={asset.hash}>{asset.hash.slice(0, 16)}…</dd>
      </dl>
      <div>
        <div className="mb-1 text-muted">Used by {refs.length} item(s)</div>
        <div className="flex flex-wrap gap-1">{refQs.map((s) => s && <button key={s.id} onClick={() => navigate(`/edit/${s.id}`)}><Badge>{s.title}</Badge></button>)}</div>
      </div>
      <div className="mt-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={async () => { const b = await assetsRepo.getBlob(asset.id); if (b) downloadBlob(b, asset.name); }}><Download size={13} />Original</Button>
        <Button size="sm" variant="danger" onClick={del}><Trash2 size={13} />Delete</Button>
      </div>
    </aside>
  );
}
