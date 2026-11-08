import { describe, expect, it } from 'vitest';
import { createRaster, getPixel, type Raster } from '../raster';
import { applyEffect, applyEffects, blurRaster, cropRaster, mirrorRaster, pixelateRaster, rotate180, rotateRaster, zoomRaster, perspectiveRaster, homography } from '../effects';
import { createEffect } from '@/engines/scene/factories';
import { rasterizeMask } from '../mask';
import { autoForeground, applySilhouette, applyCutout } from '../cutout';
import { EFFECT_DEFS } from '../effectDefs';
import type { EffectType } from '@/types/schema';

/** 4x4 quadrant fixture: red TL, green TR, blue BL, white BR */
function quadrants(n = 4): Raster {
  const r = createRaster(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const c = x < n / 2 ? (y < n / 2 ? [255, 0, 0] : [0, 0, 255]) : y < n / 2 ? [0, 255, 0] : [255, 255, 255];
      r.data.set([...c, 255], i);
    }
  return r;
}
const checker = (n: number) => {
  const r = createRaster(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = (x + y) % 2 ? 255 : 0; r.data.set([v, v, v, 255], (y * n + x) * 4); }
  return r;
};
const variance = (r: Raster) => { let s = 0, s2 = 0; const n = r.width * r.height; for (let i = 0; i < n; i++) { const v = r.data[i * 4]; s += v; s2 += v * v; } return s2 / n - (s / n) ** 2; };

describe('geometric effects', () => {
  it('mirrors horizontally and vertically', () => {
    const q = quadrants();
    expect(getPixel(mirrorRaster(q, true), 0, 0)).toEqual([0, 255, 0, 255]);
    expect(getPixel(mirrorRaster(q, false), 0, 0)).toEqual([0, 0, 255, 255]);
  });
  it('upside-down rotates 180°', () => {
    expect(getPixel(rotate180(quadrants()), 0, 0)).toEqual([255, 255, 255, 255]);
  });
  it('rotates 90° with canvas expansion', () => {
    const src = createRaster(10, 4, [255, 0, 0, 255]);
    const out = rotateRaster(src, 90, true);
    expect(out.width).toBe(4);
    expect(out.height).toBe(10);
  });
  it('crops normalized rectangles', () => {
    const out = cropRaster(quadrants(), 0.5, 0.5, 0.5, 0.5);
    expect(out.width).toBe(2);
    expect(getPixel(out, 0, 0)).toEqual([255, 255, 255, 255]);
  });
  it('zoom keeps size and magnifies the chosen region', () => {
    const out = zoomRaster(quadrants(8), 4, 0, 0);
    expect(out.width).toBe(8);
    const p = getPixel(out, 4, 4);
    expect(p[0]).toBeGreaterThan(200); expect(p[1]).toBeLessThan(40);
  });
  it('homography maps corners exactly', () => {
    const H = homography([[0, 0], [1, 0], [1, 1], [0, 1]], [[0, 0], [2, 0], [2, 2], [0, 2]]);
    const map = (x: number, y: number) => { const d = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d]; };
    expect(map(1, 1)[0]).toBeCloseTo(2); expect(map(0.5, 0)[0]).toBeCloseTo(1);
  });
  it('perspective leaves transparent corners when tilted', () => {
    const out = perspectiveRaster(createRaster(20, 20, [255, 0, 0, 255]), 1, 0);
    expect(getPixel(out, 0, 0)[3]).toBe(0);
    expect(getPixel(out, 10, 18)[3]).toBe(255);
  });
});

describe('obscuring effects', () => {
  it('blur reduces variance of a checkerboard', () => {
    const c = checker(32);
    expect(variance(blurRaster(c, 3))).toBeLessThan(variance(c) * 0.2);
  });
  it('pixelate produces uniform blocks', () => {
    const out = pixelateRaster(quadrants(8), 4);
    expect(getPixel(out, 0, 0)).toEqual(getPixel(out, 3, 3));
  });
  it('blur slider value changes output', () => {
    const a = applyEffect(checker(32), { ...createEffect('blur'), params: { radius: 1 } });
    const b = applyEffect(checker(32), { ...createEffect('blur'), params: { radius: 6 } });
    expect(variance(b)).toBeLessThan(variance(a));
  });
});

describe('colour effects', () => {
  const red = () => createRaster(2, 2, [200, 50, 50, 255]);
  it('grayscale equalizes channels', () => { const p = getPixel(applyEffect(red(), createEffect('grayscale')), 0, 0); expect(p[0]).toBe(p[1]); expect(p[1]).toBe(p[2]); });
  it('invert', () => expect(getPixel(applyEffect(red(), createEffect('invert')), 0, 0)).toEqual([55, 205, 205, 255]));
  it('brightness', () => expect(getPixel(applyEffect(red(), { ...createEffect('brightness'), params: { amount: -1 } }), 0, 0).slice(0, 3)).toEqual([0, 0, 0]));
  it('hue shift changes dominant channel', () => { const p = getPixel(applyEffect(red(), { ...createEffect('hueShift'), params: { degrees: 120 } }), 0, 0); expect(p[1]).toBeGreaterThan(p[0]); });
  it('transparency scales alpha', () => expect(getPixel(applyEffect(red(), { ...createEffect('transparency'), params: { opacity: 0.5 } }), 0, 0)[3]).toBe(128));
  it('colour replace swaps matched colour', () => {
    const p = getPixel(applyEffect(red(), { ...createEffect('colorReplace'), params: { from: '#c83232', to: '#0000ff', tolerance: 40 } }), 0, 0);
    expect(p[2]).toBeGreaterThan(200); expect(p[0]).toBeLessThan(30);
  });
});

describe('masks and selective effects', () => {
  it('rasterizes polygons and brush strokes', () => {
    const m = rasterizeMask({ ops: [{ kind: 'polygon', mode: 'add', points: [0, 0, 0.5, 0, 0.5, 1, 0, 1] }], invert: false }, 10, 10);
    expect(m[0]).toBe(1); expect(m[9]).toBe(0);
    const s = rasterizeMask({ ops: [{ kind: 'stroke', mode: 'add', size: 0.2, hardness: 1, points: [0.5, 0.5] }], invert: false }, 20, 20);
    expect(s[10 * 20 + 10]).toBe(1); expect(s[0]).toBe(0);
  });
  it('subtract and invert', () => {
    const m = rasterizeMask({ ops: [{ kind: 'polygon', mode: 'add', points: [0, 0, 1, 0, 1, 1, 0, 1] }, { kind: 'polygon', mode: 'subtract', points: [0, 0, 0.5, 0, 0.5, 1, 0, 1] }], invert: true }, 10, 10);
    expect(m[0]).toBe(1); expect(m[9]).toBe(0);
  });
  it('selective pixelate with empty mask has no effect; with mask only affects masked region', () => {
    const c = checker(16);
    const e = createEffect('selectivePixelate');
    expect(applyEffect(c, e).data).toEqual(c.data);
    e.mask = { ops: [{ kind: 'polygon', mode: 'add', points: [0, 0, 0.5, 0, 0.5, 1, 0, 1] }], invert: false };
    e.params.size = 25;
    const out = applyEffect(c, e);
    expect(getPixel(out, 15, 0)).toEqual(getPixel(c, 15, 0));
    expect(getPixel(out, 0, 0)).not.toEqual(getPixel(c, 0, 0));
  });
  it('hide areas covers masked pixels', () => {
    const e = createEffect('hideAreas');
    e.params.color = '#000000';
    e.mask = { ops: [{ kind: 'polygon', mode: 'add', points: [0, 0, 1, 0, 1, 1, 0, 1] }], invert: false };
    expect(getPixel(applyEffect(createRaster(4, 4, [255, 255, 255, 255]), e), 1, 1)).toEqual([0, 0, 0, 255]);
  });
  it('erase makes masked pixels transparent', () => {
    const e = createEffect('erase');
    e.mask = { ops: [{ kind: 'polygon', mode: 'add', points: [0, 0, 1, 0, 1, 1, 0, 1] }], invert: false };
    expect(getPixel(applyEffect(createRaster(4, 4, [255, 255, 255, 255]), e), 1, 1)[3]).toBe(0);
  });
});

describe('effect pipeline', () => {
  it('order matters: crop then mirror differs from mirror then crop', () => {
    const crop = { ...createEffect('crop'), params: { x: 0, y: 0, w: 0.5, h: 0.5 } };
    const mirror = createEffect('mirrorH');
    const a = applyEffects(quadrants(), [crop, mirror]);
    const b = applyEffects(quadrants(), [mirror, crop]);
    expect(getPixel(a, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(getPixel(b, 0, 0)).toEqual([0, 255, 0, 255]);
  });
  it('disabled effects are skipped and original is untouched', () => {
    const src = quadrants();
    const before = new Uint8ClampedArray(src.data);
    const out = applyEffects(src, [{ ...createEffect('invert'), enabled: false }, createEffect('mirrorH')]);
    expect(getPixel(out, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(src.data).toEqual(before);
  });
  it('every one of the 25 effect types runs and produces a raster', () => {
    const types = Object.keys(EFFECT_DEFS) as EffectType[];
    expect(types).toHaveLength(25);
    for (const t of types) {
      const e = createEffect(t);
      if (e.mask) e.mask = { ops: [{ kind: 'polygon', mode: 'add', points: [0, 0, 1, 0, 1, 1, 0, 1] }], invert: false };
      const out = applyEffect(quadrants(16), e);
      expect(out.width).toBeGreaterThan(0);
    }
  });
});

describe('cutout & silhouette', () => {
  const subject = () => {
    const r = createRaster(20, 20, [255, 255, 255, 255]);
    for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) r.data.set([200, 30, 30, 255], (y * 20 + x) * 4);
    return r;
  };
  it('auto foreground removes a plain background', () => {
    const fg = autoForeground(subject(), 30);
    expect(fg[0]).toBe(0); expect(fg[10 * 20 + 10]).toBe(1);
  });
  it('cutout + silhouette yields solid colour subject on transparency', () => {
    const cut = applyCutout(subject(), { enabled: true, auto: true, tolerance: 30, feather: 0, mask: { ops: [], invert: false } });
    const sil = applySilhouette(cut, { enabled: true, color: '#000000', outlineWidth: 0, outlineColor: '#fff', smoothing: 0, shadow: 0 });
    expect(getPixel(sil, 0, 0)[3]).toBe(0);
    expect(getPixel(sil, 10, 10)).toEqual([0, 0, 0, 255]);
  });
  it('manual mask subtract removes part of the subject', () => {
    const cut = applyCutout(subject(), { enabled: true, auto: true, tolerance: 30, feather: 0, mask: { ops: [{ kind: 'polygon', mode: 'subtract', points: [0, 0, 0.5, 0, 0.5, 1, 0, 1] }], invert: false } });
    expect(getPixel(cut, 7, 10)[3]).toBe(0);
    expect(getPixel(cut, 12, 10)[3]).toBe(255);
  });
  it('silhouette outline adds coloured border', () => {
    const cut = applyCutout(subject(), { enabled: true, auto: true, tolerance: 30, feather: 0, mask: { ops: [], invert: false } });
    const sil = applySilhouette(cut, { enabled: true, color: '#000000', outlineWidth: 100, outlineColor: '#ffffff', smoothing: 0, shadow: 0 });
    expect(getPixel(sil, 4, 10)).toEqual([255, 255, 255, 255]);
  });
});
