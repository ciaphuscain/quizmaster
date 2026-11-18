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
