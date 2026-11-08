/// <reference lib="webworker" />
import { processImageLayer } from '@/engines/image/pipeline';
import type { Raster } from '@/engines/image/raster';
import type { ImageLayer } from '@/types/schema';

type Msg = { id: number; raster: Raster; cfg: Pick<ImageLayer, 'cutout' | 'effects' | 'silhouette'>; stopBeforeEffect?: number };

self.onmessage = (e: MessageEvent<Msg>) => {
  const { id, raster, cfg, stopBeforeEffect } = e.data;
  try {
    const out = processImageLayer(raster, cfg, { stopBeforeEffect });
    const data = out.data === raster.data ? new Uint8ClampedArray(out.data) : out.data;
    (self as unknown as Worker).postMessage({ id, raster: { width: out.width, height: out.height, data } }, [data.buffer]);
  } catch {
    (self as unknown as Worker).postMessage({ id, raster: null });
  }
};
