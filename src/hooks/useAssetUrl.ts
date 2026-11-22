import { useEffect, useState } from 'react';
import { assetsRepo } from '@/db/repositories/assets';
import { db } from '@/db/database';

const urlCache = new Map<string, string>();

/** Object URL for an asset blob (cached for the session). */
export function useAssetUrl(assetId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(assetId ? urlCache.get(assetId) ?? null : null);
  useEffect(() => {
    let alive = true;
    if (!assetId) { setUrl(null); return; }
    const c = urlCache.get(assetId);
    if (c) { setUrl(c); return; }
    assetsRepo.getBlob(assetId).then((b) => {
      if (!b || !alive) return;
      const u = URL.createObjectURL(b);
      urlCache.set(assetId, u);
      setUrl(u);
    });
    return () => { alive = false; };
  }, [assetId]);
  return url;
}

/** Thumbnail object URL for a question (falls back to null). */
export function useQuestionThumb(id: string, updatedAt: number): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let u: string | null = null;
    db.thumbnails.get(id).then((t) => {
      if (!t || !alive) return;
      u = URL.createObjectURL(t.blob);
      setUrl(u);
    });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [id, updatedAt]);
  return url;
}

const thumbCache = new Map<string, Promise<string | null>>();
export const THUMB_SIZE = 256;

/** Creates (once) and caches a small PNG thumbnail for an image asset; lists never load full originals. */
export async function ensureAssetThumb(assetId: string): Promise<Blob | null> {
  const existing = await assetsRepo.getThumb(assetId);
  if (existing) return existing;
  const blob = await assetsRepo.getBlob(assetId);
  if (!blob) return null;
  try {
    const url = URL.createObjectURL(blob);
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    URL.revokeObjectURL(url);
    const k = Math.min(1, THUMB_SIZE / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((img.naturalWidth || THUMB_SIZE) * k)); c.height = Math.max(1, Math.round((img.naturalHeight || THUMB_SIZE) * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const thumb = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    if (thumb) await assetsRepo.setThumb(assetId, thumb);
    return thumb;
  } catch { return null; }
}

export function useAssetThumbUrl(assetId: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!assetId) { setUrl(null); return; }
    let p = thumbCache.get(assetId);
    if (!p) { p = ensureAssetThumb(assetId).then((b) => (b ? URL.createObjectURL(b) : null)); thumbCache.set(assetId, p); }
    void p.then((u) => alive && setUrl(u));
    return () => { alive = false; };
  }, [assetId]);
  return url;
}
