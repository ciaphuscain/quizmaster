import type { ImageLayer } from '@/types/schema';
import type { Raster } from './raster';
import { resize } from './raster';
import { applyEffects } from './effects';
import { applyCutout, applySilhouette } from './cutout';

/** Maximum working resolution for effect processing (keeps interaction responsive). */
export const MAX_WORKING_SIZE = 1400;

export function fitWorkingSize(r: Raster, max = MAX_WORKING_SIZE): Raster {
  const s = Math.max(r.width, r.height);
  if (s <= max) return r;
  const k = max / s;
  return resize(r, Math.max(1, Math.round(r.width * k)), Math.max(1, Math.round(r.height * k)));
}

export type ProcessOptions = { stopBeforeEffect?: number; skipSilhouette?: boolean };

/** Full non-destructive image pipeline: original → cutout → effects → silhouette. */
export function processImageLayer(src: Raster, layer: Pick<ImageLayer, 'cutout' | 'effects' | 'silhouette'>, opts: ProcessOptions = {}): Raster {
  let r = src;
  if (layer.cutout?.enabled) r = applyCutout(r, layer.cutout);
  r = applyEffects(r, layer.effects, opts.stopBeforeEffect ?? layer.effects.length);
  if (opts.stopBeforeEffect === undefined && !opts.skipSilhouette && layer.silhouette?.enabled) r = applySilhouette(r, layer.silhouette);
  return r;
}

export function needsProcessing(layer: Pick<ImageLayer, 'cutout' | 'effects' | 'silhouette'>): boolean {
  return !!layer.cutout?.enabled || layer.effects.some((e) => e.enabled) || !!layer.silhouette?.enabled;
}
