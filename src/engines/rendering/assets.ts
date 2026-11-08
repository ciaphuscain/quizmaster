import type { ImageLayer } from '@/types/schema';
import type { Raster } from '@/engines/image/raster';
import { fitWorkingSize, needsProcessing, processImageLayer } from '@/engines/image/pipeline';

/** Pluggable blob source so the renderer is decoupled from the database. */
export type BlobSource = (assetId: string) => Promise<Blob | undefined>;
let blobSource: BlobSource = async () => undefined;
export function setBlobSource(fn: BlobSource) { blobSource = fn; }

const bitmapCache = new Map<string, Promise<ImageBitmap | HTMLImageElement | null>>();
const rasterCache = new Map<string, Promise<Raster | null>>();
const processedCache = new Map<string, Promise<HTMLCanvasElement | null>>();
const MAX_PROCESSED = 60;

export function invalidateAsset(assetId: string) {
  bitmapCache.delete(assetId);
  rasterCache.delete(assetId);
  for (const k of [...processedCache.keys()]) if (k.startsWith(assetId + '|')) processedCache.delete(k);
}

async function blobToImage(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function' && blob.type !== 'image/svg+xml') {
    try { return await createImageBitmap(blob); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(blob);
  try { return await loadImageUrl(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 30000); }
}

export function loadImageUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image ${url.slice(0, 60)}`));
    img.src = url;
  });
}

export function getAssetImage(assetId: string): Promise<ImageBitmap | HTMLImageElement | null> {
  let p = bitmapCache.get(assetId);
  if (!p) {
    p = blobSource(assetId).then((b) => (b ? blobToImage(b) : null)).catch(() => null);
    bitmapCache.set(assetId, p);
  }
  return p;
}

export function imageSize(img: CanvasImageSource): [number, number] {
  const anyImg = img as { naturalWidth?: number; naturalHeight?: number; width: number; height: number };
  return [anyImg.naturalWidth || anyImg.width || 1, anyImg.naturalHeight || anyImg.height || 1];
}

export function imageToRaster(img: CanvasImageSource): Raster {
  const [w, h] = imageSize(img);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h);
  return fitWorkingSize({ width: w, height: h, data: d.data });
}

export function rasterToCanvas(r: Raster): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = r.width; c.height = r.height;
  const ctx = c.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  return c;
}

export function getAssetRaster(assetId: string): Promise<Raster | null> {
  let p = rasterCache.get(assetId);
  if (!p) {
    p = getAssetImage(assetId).then((img) => (img ? imageToRaster(img) : null));
    rasterCache.set(assetId, p);
  }
  return p;
}

/* ------------------------- worker-backed processing ------------------------ */
let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: Raster | null) => void>();
function getWorker(): Worker | null {
  if (worker || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('../../workers/imageWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; raster: Raster | null }>) => {
      pending.get(e.data.id)?.(e.data.raster);
      pending.delete(e.data.id);
    };
    worker.onerror = () => { worker = null; };
  } catch { worker = null; }
  return worker;
}

export function processRaster(src: Raster, cfg: Pick<ImageLayer, 'cutout' | 'effects' | 'silhouette'>, stopBeforeEffect?: number): Promise<Raster | null> {
  const w = getWorker();
  if (!w) return Promise.resolve(processImageLayer(src, cfg, { stopBeforeEffect }));
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    const copy = new Uint8ClampedArray(src.data);
    w.postMessage({ id, raster: { width: src.width, height: src.height, data: copy }, cfg, stopBeforeEffect }, [copy.buffer]);
  });
}

export function processedKey(layer: Pick<ImageLayer, 'assetId' | 'cutout' | 'effects' | 'silhouette'>, stop?: number) {
  return `${layer.assetId}|${stop ?? 'all'}|${JSON.stringify([layer.cutout, layer.effects, layer.silhouette])}`;
}

/** Returns a canvas with the processed image for an image layer (cached by parameters). */
export function getProcessedImage(layer: Pick<ImageLayer, 'assetId' | 'cutout' | 'effects' | 'silhouette'>, stopBeforeEffect?: number): Promise<HTMLCanvasElement | CanvasImageSource | null> {
  if (!layer.assetId) return Promise.resolve(null);
  if (stopBeforeEffect === undefined && !needsProcessing(layer)) return getAssetImage(layer.assetId);
  const key = processedKey(layer, stopBeforeEffect);
  let p = processedCache.get(key);
  if (!p) {
    p = getAssetRaster(layer.assetId).then(async (r) => {
      if (!r) return null;
      const out = await processRaster(r, layer, stopBeforeEffect);
      return out ? rasterToCanvas(out) : null;
    });
    processedCache.set(key, p);
    if (processedCache.size > MAX_PROCESSED) processedCache.delete(processedCache.keys().next().value as string);
  }
  return p;
}

/** Synchronous peek used during drawing; returns undefined if not yet resolved. */
const resolved = new WeakMap<Promise<unknown>, unknown>();
export function track<T>(p: Promise<T>): Promise<T> {
  p.then((v) => resolved.set(p, v ?? null));
  return p;
}
export function peek<T>(p: Promise<T>): T | undefined {
  return resolved.has(p) ? (resolved.get(p) as T) : undefined;
}
