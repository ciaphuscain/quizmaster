import type { Effect, MaskData } from '@/types/schema';
import { parseColor, rgbToHsl, hslToRgb } from '@/utils/color';
import { createRaster, cloneRaster, warp, type Raster } from './raster';
import { rasterizeMask, maskIsEmpty, shapePolygon, blurMask } from './mask';
import { EFFECT_DEFS } from './effectDefs';

type P = Effect['params'];
const num = (p: P, k: string, d = 0) => (typeof p[k] === 'number' ? (p[k] as number) : d);
const str = (p: P, k: string, d = '') => (typeof p[k] === 'string' ? (p[k] as string) : d);
const bool = (p: P, k: string, d = false) => (typeof p[k] === 'boolean' ? (p[k] as boolean) : d);
const pct = (r: Raster, v: number) => (v / 100) * Math.max(r.width, r.height);

/* -------------------------- blur / pixelate --------------------------- */
function boxBlurPass(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean) {
  const len = horizontal ? w : h, lines = horizontal ? h : w;
  const div = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    for (let c = 0; c < 4; c++) {
      const idx = (k: number) => {
        const kk = Math.min(len - 1, Math.max(0, k));
        return (horizontal ? line * w + kk : kk * w + line) * 4 + c;
      };
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[idx(k)];
      for (let k = 0; k < len; k++) {
        dst[idx(k)] = acc / div;
        acc += src[idx(k + r + 1)] - src[idx(k - r)];
      }
    }
  }
}

export function blurRaster(src: Raster, radiusPx: number): Raster {
  const r = Math.round(radiusPx);
  if (r < 1) return cloneRaster(src);
  const { width: w, height: h, data } = src;
  // premultiply alpha to avoid dark halos
  let a = new Float32Array(data.length), b = new Float32Array(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const al = data[i + 3] / 255;
    a[i] = data[i] * al; a[i + 1] = data[i + 1] * al; a[i + 2] = data[i + 2] * al; a[i + 3] = data[i + 3];
  }
  const passR = Math.max(1, Math.round(r / Math.sqrt(3)));
  for (let pass = 0; pass < 3; pass++) {
    boxBlurPass(a, b, w, h, passR, true);
    boxBlurPass(b, a, w, h, passR, false);
  }
  const out = createRaster(w, h);
  for (let i = 0; i < data.length; i += 4) {
    const al = a[i + 3] / 255;
    if (al > 0) { out.data[i] = a[i] / al; out.data[i + 1] = a[i + 1] / al; out.data[i + 2] = a[i + 2] / al; }
    out.data[i + 3] = a[i + 3];
  }
  return out;
}

export function pixelateRaster(src: Raster, blockPx: number): Raster {
  const s = Math.max(1, Math.round(blockPx));
  const { width: w, height: h, data } = src;
  const out = createRaster(w, h);
  for (let by = 0; by < h; by += s)
    for (let bx = 0; bx < w; bx += s) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const ye = Math.min(h, by + s), xe = Math.min(w, bx + s);
      for (let y = by; y < ye; y++)
        for (let x = bx; x < xe; x++) {
          const i = (y * w + x) * 4; const al = data[i + 3];
          r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al; a += al; n++;
        }
      const rr = a ? r / a : 0, gg = a ? g / a : 0, bb = a ? b / a : 0, aa = a / n;
      for (let y = by; y < ye; y++)
        for (let x = bx; x < xe; x++) {
          const i = (y * w + x) * 4;
          out.data[i] = rr; out.data[i + 1] = gg; out.data[i + 2] = bb; out.data[i + 3] = aa;
        }
    }
  return out;
}

/* ------------------------------ geometry ------------------------------ */
export function cropRaster(src: Raster, nx: number, ny: number, nw: number, nh: number): Raster {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.round(nx * src.width)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.round(ny * src.height)));
  const w = Math.max(1, Math.min(src.width - x0, Math.round(nw * src.width)));
  const h = Math.max(1, Math.min(src.height - y0, Math.round(nh * src.height)));
  const out = createRaster(w, h);
  for (let y = 0; y < h; y++) {
    const s = ((y0 + y) * src.width + x0) * 4;
    out.data.set(src.data.subarray(s, s + w * 4), y * w * 4);
  }
  return out;
}

export function mirrorRaster(src: Raster, horizontal: boolean): Raster {
  const { width: w, height: h } = src;
  const out = createRaster(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = horizontal ? w - 1 - x : x, sy = horizontal ? y : h - 1 - y;
      const si = (sy * w + sx) * 4, di = (y * w + x) * 4;
      out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1]; out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = src.data[si + 3];
    }
  return out;
}

export function rotate180(src: Raster): Raster {
  const out = createRaster(src.width, src.height);
  const n = src.width * src.height;
  for (let i = 0; i < n; i++) {
    const s = i * 4, d = (n - 1 - i) * 4;
    out.data[d] = src.data[s]; out.data[d + 1] = src.data[s + 1]; out.data[d + 2] = src.data[s + 2]; out.data[d + 3] = src.data[s + 3];
  }
  return out;
}

export function rotateRaster(src: Raster, deg: number, expand: boolean): Raster {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const { width: w, height: h } = src;
  const ow = expand ? Math.ceil(Math.abs(w * c) + Math.abs(h * s) - 1e-6) : w;
  const oh = expand ? Math.ceil(Math.abs(w * s) + Math.abs(h * c) - 1e-6) : h;
  const cx = w / 2, cy = h / 2, ocx = ow / 2, ocy = oh / 2;
  return warp(src, ow, oh, (x, y, o) => {
    const dx = x - ocx, dy = y - ocy;
    o[0] = c * dx + s * dy + cx; o[1] = -s * dx + c * dy + cy;
    return true;
  });
}

export function zoomRaster(src: Raster, factor: number, cx: number, cy: number): Raster {
  const f = Math.max(1, factor);
  const { width: w, height: h } = src;
  const vw = w / f, vh = h / f;
  const x0 = Math.min(w - vw, Math.max(0, cx * w - vw / 2));
  const y0 = Math.min(h - vh, Math.max(0, cy * h - vh / 2));
  return warp(src, w, h, (x, y, o) => { o[0] = x0 + x / f; o[1] = y0 + y / f; return true; });
}

/** Solves the 3x3 homography H mapping 4 src points to 4 dst points. */
export function homography(src: number[][], dst: number[][]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // gaussian elimination on 8x9 augmented matrix
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col] || 1e-12;
    for (let k = col; k < 9; k++) A[col][k] /= d;
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col];
      for (let k = col; k < 9; k++) A[r][k] -= f * A[col][k];
    }
  }
  return [...A.map((r) => r[8]), 1];
}

export function perspectiveRaster(src: Raster, tiltX: number, tiltY: number): Raster {
  const { width: w, height: h } = src;
  const k = 0.35;
  // tiltX narrows top (positive) or bottom (negative) edge; tiltY narrows left/right edge
  const tx = tiltX * k * w, ty = tiltY * k * h;
  const dst = [
    [Math.max(0, tx), Math.max(0, ty)],
    [w - Math.max(0, tx), Math.max(0, -ty)],
    [w - Math.max(0, -tx), h - Math.max(0, -ty)],
    [Math.max(0, -tx), h - Math.max(0, ty)],
  ];
  const srcPts = [[0, 0], [w, 0], [w, h], [0, h]];
  const H = homography(dst, srcPts); // inverse mapping dst->src
  return warp(src, w, h, (x, y, o) => {
    const d = H[6] * x + H[7] * y + H[8];
    const u = (H[0] * x + H[1] * y + H[2]) / d, v = (H[3] * x + H[4] * y + H[5]) / d;
    if (u < 0 || v < 0 || u > w || v > h) return false;
    o[0] = u; o[1] = v; return true;
  });
}

export function distortRaster(src: Raster, mode: string, amount: number, frequency: number): Raster {
  const { width: w, height: h } = src;
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2;
  return warp(src, w, h, (x, y, o) => {
    const dx = x - cx, dy = y - cy;
    if (mode === 'wave') {
      o[0] = x + Math.sin((y / h) * frequency * 2 * Math.PI) * amount * w * 0.08;
      o[1] = y + Math.sin((x / w) * frequency * 2 * Math.PI) * amount * h * 0.08;
      return true;
    }
    const r = Math.hypot(dx, dy);
    if (r >= R) { o[0] = x; o[1] = y; return true; }
    const t = r / R;
    if (mode === 'swirl') {
      const ang = amount * 4 * (1 - t) * (1 - t);
      const c = Math.cos(ang), s = Math.sin(ang);
      o[0] = cx + c * dx - s * dy; o[1] = cy + s * dx + c * dy; return true;
    }
    // bulge (magnify centre) / pinch
    const power = mode === 'bulge' ? 1 + amount * 1.5 : 1 / (1 + amount * 1.5);
    const nt = Math.pow(t, power) / (t || 1);
    o[0] = cx + dx * nt; o[1] = cy + dy * nt; return true;
  });
}

/* ------------------------------- colour ------------------------------- */
function mapPixels(src: Raster, fn: (r: number, g: number, b: number, a: number, out: number[], x: number, y: number) => void): Raster {
  const out = createRaster(src.width, src.height);
  const o = [0, 0, 0, 0];
  const d = src.data;
  for (let y = 0, i = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++, i += 4) {
      fn(d[i], d[i + 1], d[i + 2], d[i + 3], o, x, y);
      out.data[i] = o[0]; out.data[i + 1] = o[1]; out.data[i + 2] = o[2]; out.data[i + 3] = o[3];
    }
  return out;
}

export const invertRaster = (s: Raster) => mapPixels(s, (r, g, b, a, o) => { o[0] = 255 - r; o[1] = 255 - g; o[2] = 255 - b; o[3] = a; });
export const grayscaleRaster = (s: Raster, amt: number) => mapPixels(s, (r, g, b, a, o) => {
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  o[0] = r + (l - r) * amt; o[1] = g + (l - g) * amt; o[2] = b + (l - b) * amt; o[3] = a;
});
export const brightnessRaster = (s: Raster, amt: number) => mapPixels(s, (r, g, b, a, o) => {
  const f = (v: number) => (amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  o[0] = f(r); o[1] = f(g); o[2] = f(b); o[3] = a;
});
export const contrastRaster = (s: Raster, amt: number) => {
  const f = amt >= 0 ? 1 / Math.max(0.01, 1 - amt) : 1 + amt;
  return mapPixels(s, (r, g, b, a, o) => { o[0] = (r - 128) * f + 128; o[1] = (g - 128) * f + 128; o[2] = (b - 128) * f + 128; o[3] = a; });
};
export const saturationRaster = (s: Raster, amt: number) => mapPixels(s, (r, g, b, a, o) => {
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b; const f = 1 + amt;
  o[0] = l + (r - l) * f; o[1] = l + (g - l) * f; o[2] = l + (b - l) * f; o[3] = a;
});
export const hueShiftRaster = (s: Raster, deg: number) => mapPixels(s, (r, g, b, a, o) => {
  const [h, sat, l] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb((((h + deg / 360) % 1) + 1) % 1, sat, l);
  o[0] = nr; o[1] = ng; o[2] = nb; o[3] = a;
});
export const transparencyRaster = (s: Raster, opacity: number) => mapPixels(s, (r, g, b, a, o) => { o[0] = r; o[1] = g; o[2] = b; o[3] = a * opacity; });
export function colorReplaceRaster(s: Raster, from: string, to: string, tol: number): Raster {
  const [fr, fg, fb] = parseColor(from), [tr, tg, tb] = parseColor(to);
  const soft = Math.max(1, tol * 0.25);
  return mapPixels(s, (r, g, b, a, o) => {
    const d = Math.sqrt((r - fr) ** 2 + (g - fg) ** 2 + (b - fb) ** 2) / Math.sqrt(3);
    const t = d <= tol - soft ? 1 : d >= tol ? 0 : (tol - d) / soft;
    // preserve shading: offset target colour by luminance delta
    const dl = (r + g + b - fr - fg - fb) / 3;
    o[0] = r + (tr + dl - r) * t; o[1] = g + (tg + dl - g) * t; o[2] = b + (tb + dl - b) * t; o[3] = a;
  });
}

export function outlineRaster(s: Raster, threshold: number, thickness: number, color: string, transparent: boolean, background: string): Raster {
  const { width: w, height: h, data } = s;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    // composite on mid-grey so alpha edges are detected too
    lum[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) * a + (1 - a) * 127.5;
  }
  const edge = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const L = (xx: number, yy: number) => lum[yy * w + xx];
      const gx = -L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1) + L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1);
      const gy = -L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1) + L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1);
      if (Math.hypot(gx, gy) > threshold * 4) edge[y * w + x] = 1;
    }
  // dilate for thickness
  const t = Math.max(0, Math.round(thickness) - 1);
  const thick = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!edge[y * w + x]) continue;
      for (let dy = -t; dy <= t; dy++)
        for (let dx = -t; dx <= t; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) thick[yy * w + xx] = 1;
        }
    }
  const [lr, lg, lb] = parseColor(color);
  const [br, bg, bb] = parseColor(background);
  const out = createRaster(w, h);
  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    if (thick[i]) { out.data[j] = lr; out.data[j + 1] = lg; out.data[j + 2] = lb; out.data[j + 3] = 255; }
    else if (!transparent) { out.data[j] = br; out.data[j + 1] = bg; out.data[j + 2] = bb; out.data[j + 3] = 255; }
  }
  return out;
}

export function shapeMaskRaster(s: Raster, shape: string, scale: number, cx: number, cy: number, invert: boolean): Raster {
  const poly = shapePolygon(shape, cx, cy, scale, s.width / s.height);
  const m = rasterizeMask({ ops: [{ kind: 'polygon', mode: 'add', points: poly }], invert }, s.width, s.height);
  const out = cloneRaster(s);
  for (let i = 0; i < m.length; i++) out.data[i * 4 + 3] *= m[i];
  return out;
}

function hash2(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function overlayRaster(s: Raster, mode: string, color: string, opacity: number, sizePct: number, clip: boolean): Raster {
  const [cr, cg, cb] = parseColor(color);
  const size = Math.max(2, pct(s, sizePct));
  return mapPixels(s, (r, g, b, a, o, x, y) => {
    let cov = 0;
    if (mode === 'color') cov = 1;
    else if (mode === 'stripes') cov = Math.floor((x + y) / size) % 2 === 0 ? 1 : 0;
    else if (mode === 'grid') cov = x % size < size * 0.15 || y % size < size * 0.15 ? 1 : 0;
    else if (mode === 'dots') { const dx = (x % size) - size / 2, dy = (y % size) - size / 2; cov = Math.hypot(dx, dy) < size * 0.3 ? 1 : 0; }
    else if (mode === 'noise') cov = hash2(Math.floor(x / (size / 4)), Math.floor(y / (size / 4)));
    const t = cov * opacity;
    if (clip) {
      o[0] = r + (cr - r) * t; o[1] = g + (cg - g) * t; o[2] = b + (cb - b) * t; o[3] = a;
    } else {
      const sa = a / 255, ca = t;
      const outA = ca + sa * (1 - ca);
      o[0] = outA ? (cr * ca + r * sa * (1 - ca)) / outA : 0;
      o[1] = outA ? (cg * ca + g * sa * (1 - ca)) / outA : 0;
      o[2] = outA ? (cb * ca + b * sa * (1 - ca)) / outA : 0;
      o[3] = outA * 255;
    }
  });
}

/* --------------------------- mask blending ---------------------------- */
function blendByMask(original: Raster, processed: Raster, mask: Float32Array): Raster {
  const out = createRaster(original.width, original.height);
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i], j = i * 4;
    for (let c = 0; c < 4; c++) out.data[j + c] = original.data[j + c] + (processed.data[j + c] - original.data[j + c]) * m;
  }
  return out;
}

function maskFor(effect: Effect, r: Raster): Float32Array | null {
  const def = EFFECT_DEFS[effect.type];
  if (!def.usesMask) return null;
  if (maskIsEmpty(effect.mask)) return def.maskRequired ? new Float32Array(r.width * r.height) : null;
  return rasterizeMask(effect.mask as MaskData, r.width, r.height);
}

/* ------------------------------ dispatch ------------------------------ */
export function applyEffect(src: Raster, effect: Effect): Raster {
  const p = effect.params;
  switch (effect.type) {
    case 'zoom': return zoomRaster(src, num(p, 'factor', 2), num(p, 'cx', 0.5), num(p, 'cy', 0.5));
    case 'crop': return cropRaster(src, num(p, 'x'), num(p, 'y'), num(p, 'w', 1), num(p, 'h', 1));
    case 'rotate': return rotateRaster(src, num(p, 'angle'), bool(p, 'expand', true));
    case 'upsideDown': return rotate180(src);
    case 'mirrorH': return mirrorRaster(src, true);
    case 'mirrorV': return mirrorRaster(src, false);
    case 'perspective': return perspectiveRaster(src, num(p, 'tiltX'), num(p, 'tiltY'));
    case 'distort': return distortRaster(src, str(p, 'mode', 'wave'), num(p, 'amount', 0.3), num(p, 'frequency', 4));
    case 'outline': return outlineRaster(src, num(p, 'threshold', 60), num(p, 'thickness', 2), str(p, 'color', '#fff'), bool(p, 'transparent', true), str(p, 'background', '#000'));
    case 'shapeMask': return shapeMaskRaster(src, str(p, 'shape', 'circle'), num(p, 'scale', 0.5), num(p, 'cx', 0.5), num(p, 'cy', 0.5), bool(p, 'invert'));
  }
  // mask-capable effects
  const mask = maskFor(effect, src);
  let processed: Raster;
  switch (effect.type) {
    case 'blur': case 'selectiveBlur': processed = blurRaster(src, pct(src, num(p, 'radius', 2))); break;
    case 'pixelate': case 'selectivePixelate': processed = pixelateRaster(src, pct(src, num(p, 'size', 5))); break;
    case 'invert': processed = invertRaster(src); break;
    case 'grayscale': processed = grayscaleRaster(src, num(p, 'amount', 1)); break;
    case 'brightness': processed = brightnessRaster(src, num(p, 'amount')); break;
    case 'contrast': processed = contrastRaster(src, num(p, 'amount')); break;
    case 'saturation': processed = saturationRaster(src, num(p, 'amount')); break;
    case 'hueShift': processed = hueShiftRaster(src, num(p, 'degrees')); break;
    case 'transparency': processed = transparencyRaster(src, num(p, 'opacity', 1)); break;
    case 'colorReplace': processed = colorReplaceRaster(src, str(p, 'from', '#f00'), str(p, 'to', '#00f'), num(p, 'tolerance', 60)); break;
    case 'overlay': processed = overlayRaster(src, str(p, 'mode', 'stripes'), str(p, 'color', '#000'), num(p, 'opacity', 0.5), num(p, 'size', 4), bool(p, 'clip', true)); break;
    case 'hideAreas': {
      const [r, g, b] = parseColor(str(p, 'color', '#111827'));
      processed = createRaster(src.width, src.height, [r, g, b, 255]); break;
    }
    case 'erase': processed = mapPixels(src, (r, g, b, _a, o) => { o[0] = r; o[1] = g; o[2] = b; o[3] = 0; }); break;
    default: return src;
  }
  return mask ? blendByMask(src, processed, mask) : processed;
}

/** Runs an ordered effect pipeline. Disabled effects are skipped. `upTo` stops before that index. */
export function applyEffects(src: Raster, effects: Effect[], upTo = effects.length): Raster {
  let cur = src;
  for (let i = 0; i < Math.min(upTo, effects.length); i++) {
    const e = effects[i];
    if (e.enabled) cur = applyEffect(cur, e);
  }
  return cur;
}

export { blurMask };
