import { db } from '@/db/database';
import type { Asset } from '@/types/schema';
import { sha256Hex, blobToArrayBuffer } from '@/utils/hash';
import { uid } from '@/utils/id';

export const MAX_ASSET_BYTES = 200 * 1024 * 1024;
export const IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/bmp', 'image/avif'];
export const AUDIO_MIME_PREFIX = 'audio/';

export function assetTypeFor(mime: string, name = ''): Asset['type'] | null {
  if (IMAGE_MIME.includes(mime) || /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(name)) return 'image';
  if (mime.startsWith(AUDIO_MIME_PREFIX) || /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm|opus)$/i.test(name)) return 'audio';
  return null;
}

export type ImportMeta = { width?: number; height?: number; duration?: number };
export type MetaProbe = (blob: Blob, type: Asset['type']) => Promise<ImportMeta>;

/** Default metadata probe (browser only). */
export const browserProbe: MetaProbe = async (blob, type) => {
  try {
    if (type === 'image') {
      const url = URL.createObjectURL(blob);
      try {
        const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        return { width: img.naturalWidth, height: img.naturalHeight };
      } finally { URL.revokeObjectURL(url); }
    }
    const url = URL.createObjectURL(blob);
    try {
      const a = new Audio();
      const d = await new Promise<number>((res) => { a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(0); a.src = url; });
      return { duration: isFinite(d) ? d : undefined };
    } finally { URL.revokeObjectURL(url); }
  } catch { return {}; }
};

export const assetsRepo = {
  /**
   * Stores a file as an asset. Content-hash deduplication: importing identical bytes returns the existing asset.
   * Original bytes are stored unchanged and never modified by editing.
   */
  async importBlob(blob: Blob, name: string, opts: { tags?: string[]; probe?: MetaProbe; mime?: string } = {}): Promise<{ asset: Asset; deduplicated: boolean }> {
    const mime = opts.mime || blob.type || '';
    const type = assetTypeFor(mime, name);
    if (!type) throw new Error(`Unsupported file type: ${mime || name}`);
    if (blob.size > MAX_ASSET_BYTES) throw new Error(`File is too large (${Math.round(blob.size / 1e6)} MB, max ${MAX_ASSET_BYTES / 1e6} MB)`);
    const buf = await blobToArrayBuffer(blob);
    const hash = await sha256Hex(buf);
    const existing = await db.assets.where('hash').equals(hash).first();
    if (existing) return { asset: existing, deduplicated: true };
    const meta = await (opts.probe ?? browserProbe)(blob, type);
    const asset: Asset = {
      id: uid('a'), hash, name, type, mime: mime || (type === 'image' ? 'image/png' : 'audio/wav'), size: blob.size,
      ...meta, tags: opts.tags ?? [], createdAt: Date.now(),
    };
    const stored = new Blob([buf], { type: asset.mime });
    await db.transaction('rw', db.assets, db.assetBlobs, async () => {
      await db.assets.add(asset);
      await db.assetBlobs.put({ id: asset.id, blob: stored });
    });
    return { asset, deduplicated: false };
  },
  async get(id: string) { return db.assets.get(id); },
  async getBlob(id: string) { return (await db.assetBlobs.get(id))?.blob; },
  async list() { return db.assets.orderBy('createdAt').reverse().toArray(); },
  async update(id: string, patch: Partial<Pick<Asset, 'name' | 'tags'>>) { await db.assets.update(id, patch); },
  /** Question ids that reference the asset (via the multi-entry mediaReferences index). */
  async references(id: string): Promise<string[]> {
    const qs = await db.questions.where('mediaReferences').equals(id).primaryKeys();
    const tpl = (await db.templates.toArray()).filter((t) => JSON.stringify(t.scene).includes(`"${id}"`)).map((t) => `template:${t.id}`);
    return [...qs, ...tpl];
  },
  async remove(id: string, opts: { force?: boolean } = {}) {
    const refs = await this.references(id);
    if (refs.length && !opts.force) throw new Error(`Asset is referenced by ${refs.length} item(s)`);
    await db.transaction('rw', db.assets, db.assetBlobs, db.assetThumbs, async () => {
      await db.assets.delete(id); await db.assetBlobs.delete(id); await db.assetThumbs.delete(id);
    });
  },
  async setThumb(id: string, blob: Blob) { await db.assetThumbs.put({ id, blob, updatedAt: Date.now() }); },
  async getThumb(id: string) { return (await db.assetThumbs.get(id))?.blob; },
};
