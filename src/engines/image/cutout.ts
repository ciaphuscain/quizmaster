import type { Cutout, Silhouette } from '@/types/schema';
import { parseColor } from '@/utils/color';
import { cloneRaster, createRaster, type Raster } from './raster';
import { applyMaskOp, blurMask } from './mask';

/**
 * Automatic background detection: flood-fills from every border pixel, treating connected pixels
 * whose colour stays within `tolerance` of the seed colour (or that are already transparent) as background.
 * Returns foreground coverage (1 = subject).
 */
export function autoForeground(src: Raster, tolerance: number): Float32Array {
  const { width: w, height: h, data } = src;
  const bg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const tol2 = tolerance * tolerance * 3;
  const flood = (start: number) => {
    if (bg[start]) return;
    const sr = data[start * 4], sg = data[start * 4 + 1], sb = data[start * 4 + 2];
    let head = 0, tail = 0;
    queue[tail++] = start; bg[start] = 1;
    while (head < tail) {
      const p = queue[head++];
      const x = p % w, y = (p - x) / w;
      const nbs = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nbs) {
        if (q < 0 || bg[q]) continue;
        const j = q * 4;
        const transparent = data[j + 3] < 16;
        const d = (data[j] - sr) ** 2 + (data[j + 1] - sg) ** 2 + (data[j + 2] - sb) ** 2;
        if (transparent || d <= tol2) { bg[q] = 1; queue[tail++] = q; }
      }
    }
  };
  for (let x = 0; x < w; x++) { flood(x); flood((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { flood(y * w); flood(y * w + w - 1); }
  const fg = new Float32Array(w * h);
  for (let i = 0; i < fg.length; i++) fg[i] = bg[i] ? 0 : data[i * 4 + 3] / 255;
  return fg;
}

export function cutoutCoverage(src: Raster, cut: Cutout): Float32Array {
  const { width: w, height: h } = src;
  let fg: Float32Array<ArrayBufferLike>;
  const hasAdd = cut.mask.ops.some((o) => o.mode === 'add');
  if (cut.auto) fg = autoForeground(src, cut.tolerance);
  else fg = new Float32Array(w * h).fill(hasAdd ? 0 : 1);
  for (const op of cut.mask.ops) applyMaskOp(fg, w, h, op);
  if (cut.mask.invert) for (let i = 0; i < fg.length; i++) fg[i] = 1 - fg[i];
  if (cut.feather > 0) fg = blurMask(fg, w, h, (cut.feather / 1000) * Math.max(w, h));
  return fg;
}

export function applyCutout(src: Raster, cut: Cutout): Raster {
  if (!cut.enabled) return src;
  const fg = cutoutCoverage(src, cut);
  const out = cloneRaster(src);
  for (let i = 0; i < fg.length; i++) out.data[i * 4 + 3] = Math.round(out.data[i * 4 + 3] * fg[i]);
  return out;
}

/** Converts the visible subject to a flat silhouette with optional smoothing and outline. */
export function applySilhouette(src: Raster, s: Silhouette): Raster {
  if (!s.enabled) return src;
  const { width: w, height: h } = src;
  let alpha: Float32Array<ArrayBufferLike> = new Float32Array(w * h);
  for (let i = 0; i < alpha.length; i++) alpha[i] = src.data[i * 4 + 3] / 255;
  if (s.smoothing > 0) {
    alpha = blurMask(alpha, w, h, (s.smoothing / 500) * Math.max(w, h));
    // re-harden edges with a smoothstep around 0.5 so the contour stays crisp but smooth
    for (let i = 0; i < alpha.length; i++) {
      const t = Math.min(1, Math.max(0, (alpha[i] - 0.35) / 0.3));
      alpha[i] = t * t * (3 - 2 * t);
    }
  }
  const [r, g, b] = parseColor(s.color);
  const out = createRaster(w, h);
  if (s.outlineWidth > 0) {
    const rad = Math.max(1, Math.round((s.outlineWidth / 1000) * Math.max(w, h)));
    const dil = dilate(alpha, w, h, rad);
    const [or, og, ob] = parseColor(s.outlineColor);
    for (let i = 0; i < dil.length; i++) {
      const j = i * 4;
      out.data[j] = or; out.data[j + 1] = og; out.data[j + 2] = ob; out.data[j + 3] = dil[i] * 255;
    }
  }
  for (let i = 0; i < alpha.length; i++) {
    const j = i * 4, a = alpha[i];
    if (a <= 0) continue;
    const ba = out.data[j + 3] / 255;
    const oa = a + ba * (1 - a);
    out.data[j] = (r * a + out.data[j] * ba * (1 - a)) / oa;
    out.data[j + 1] = (g * a + out.data[j + 1] * ba * (1 - a)) / oa;
    out.data[j + 2] = (b * a + out.data[j + 2] * ba * (1 - a)) / oa;
    out.data[j + 3] = oa * 255;
  }
  return out;
}

function dilate(a: Float32Array, w: number, h: number, r: number): Float32Array {
  // separable max filter (square structuring element), then circularized approx via two passes
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let m = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) m = Math.max(m, a[y * w + k]);
      tmp[y * w + x] = m;
    }
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      let m = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) m = Math.max(m, tmp[k * w + x]);
      out[y * w + x] = m;
    }
  return out;
}
