import type { EffectType } from '@/types/schema';

export type ParamDef =
  | { key: string; label: string; type: 'number'; min: number; max: number; step: number; default: number; unit?: string }
  | { key: string; label: string; type: 'color'; default: string }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; type: 'boolean'; default: boolean };

export type EffectDef = {
  type: EffectType;
  label: string;
  category: 'Geometry' | 'Color' | 'Obscure' | 'Masking' | 'Overlay';
  description: string;
  params: ParamDef[];
  /** effect is restricted by a painted mask */
  usesMask?: boolean;
  /** mask is required for the effect to have any output */
  maskRequired?: boolean;
};

const n = (key: string, label: string, min: number, max: number, step: number, def: number, unit?: string): ParamDef =>
  ({ key, label, type: 'number', min, max, step, default: def, unit });

export const EFFECT_DEFS: Record<EffectType, EffectDef> = {
  zoom: { type: 'zoom', label: 'Zoom in', category: 'Geometry', description: 'Magnify a region of the image.', params: [n('factor', 'Zoom', 1, 12, 0.1, 3, '×'), n('cx', 'Centre X', 0, 1, 0.01, 0.5), n('cy', 'Centre Y', 0, 1, 0.01, 0.5)] },
  blur: { type: 'blur', label: 'Blur', category: 'Obscure', description: 'Gaussian-like blur over the whole image.', params: [n('radius', 'Radius', 0, 10, 0.1, 2, '%')] },
  pixelate: { type: 'pixelate', label: 'Pixelate', category: 'Obscure', description: 'Replace detail with large blocks.', params: [n('size', 'Block size', 0.5, 25, 0.5, 5, '%')] },
  upsideDown: { type: 'upsideDown', label: 'Upside down', category: 'Geometry', description: 'Rotate 180°.', params: [] },
  invert: { type: 'invert', label: 'Invert colours', category: 'Color', description: 'Negative image.', params: [], usesMask: true },
  colorReplace: { type: 'colorReplace', label: 'Replace colour', category: 'Color', description: 'Swap one colour for another.', params: [{ key: 'from', label: 'From', type: 'color', default: '#ff0000' }, { key: 'to', label: 'To', type: 'color', default: '#00aaff' }, n('tolerance', 'Tolerance', 0, 255, 1, 60)], usesMask: true },
  crop: { type: 'crop', label: 'Crop', category: 'Geometry', description: 'Keep a rectangular region.', params: [n('x', 'Left', 0, 0.99, 0.01, 0.25), n('y', 'Top', 0, 0.99, 0.01, 0.25), n('w', 'Width', 0.01, 1, 0.01, 0.5), n('h', 'Height', 0.01, 1, 0.01, 0.5)] },
  hideAreas: { type: 'hideAreas', label: 'Hide areas', category: 'Masking', description: 'Cover painted areas with a solid colour (invert mask to reveal only painted areas).', params: [{ key: 'color', label: 'Cover colour', type: 'color', default: '#111827' }], usesMask: true, maskRequired: true },
  outline: { type: 'outline', label: 'Outline only', category: 'Obscure', description: 'Edge-detected line drawing.', params: [n('threshold', 'Sensitivity', 5, 200, 1, 60), n('thickness', 'Thickness', 1, 8, 1, 2, 'px'), { key: 'color', label: 'Line colour', type: 'color', default: '#ffffff' }, { key: 'transparent', label: 'Transparent background', type: 'boolean', default: true }, { key: 'background', label: 'Background', type: 'color', default: '#000000' }] },
  grayscale: { type: 'grayscale', label: 'Grayscale', category: 'Color', description: 'Remove colour.', params: [n('amount', 'Amount', 0, 1, 0.01, 1)], usesMask: true },
  distort: { type: 'distort', label: 'Distort', category: 'Geometry', description: 'Wave, swirl or bulge distortion.', params: [{ key: 'mode', label: 'Mode', type: 'select', options: [{ value: 'wave', label: 'Wave' }, { value: 'swirl', label: 'Swirl' }, { value: 'bulge', label: 'Bulge' }, { value: 'pinch', label: 'Pinch' }], default: 'wave' }, n('amount', 'Amount', 0, 1, 0.01, 0.4), n('frequency', 'Frequency', 1, 20, 0.5, 4)] },
  rotate: { type: 'rotate', label: 'Rotate', category: 'Geometry', description: 'Rotate by any angle.', params: [n('angle', 'Angle', -180, 180, 1, 45, '°'), { key: 'expand', label: 'Expand canvas', type: 'boolean', default: true }] },
  mirrorH: { type: 'mirrorH', label: 'Mirror horizontally', category: 'Geometry', description: 'Flip left-right.', params: [] },
  mirrorV: { type: 'mirrorV', label: 'Mirror vertically', category: 'Geometry', description: 'Flip top-bottom.', params: [] },
  perspective: { type: 'perspective', label: 'Perspective', category: 'Geometry', description: 'Tilt the image in 3D.', params: [n('tiltX', 'Horizontal tilt', -1, 1, 0.01, 0.4), n('tiltY', 'Vertical tilt', -1, 1, 0.01, 0)] },
  brightness: { type: 'brightness', label: 'Brightness', category: 'Color', description: 'Lighten or darken.', params: [n('amount', 'Amount', -1, 1, 0.01, 0.3)], usesMask: true },
  contrast: { type: 'contrast', label: 'Contrast', category: 'Color', description: 'Increase or reduce contrast.', params: [n('amount', 'Amount', -1, 1, 0.01, 0.3)], usesMask: true },
  saturation: { type: 'saturation', label: 'Saturation', category: 'Color', description: 'Boost or mute colour.', params: [n('amount', 'Amount', -1, 1, 0.01, 0.5)], usesMask: true },
  hueShift: { type: 'hueShift', label: 'Hue shift', category: 'Color', description: 'Rotate all hues.', params: [n('degrees', 'Degrees', -180, 180, 1, 120, '°')], usesMask: true },
  transparency: { type: 'transparency', label: 'Transparency', category: 'Color', description: 'Fade the image.', params: [n('opacity', 'Opacity', 0, 1, 0.01, 0.5)], usesMask: true },
  erase: { type: 'erase', label: 'Partial erasure', category: 'Masking', description: 'Erase painted areas to transparency.', params: [], usesMask: true, maskRequired: true },
  shapeMask: { type: 'shapeMask', label: 'Shape mask', category: 'Masking', description: 'Show only the area inside a shape.', params: [{ key: 'shape', label: 'Shape', type: 'select', options: ['circle', 'square', 'star', 'heart', 'triangle', 'hexagon', 'diamond', 'keyhole'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), default: 'circle' }, n('scale', 'Size', 0.05, 1.5, 0.01, 0.5), n('cx', 'Centre X', 0, 1, 0.01, 0.5), n('cy', 'Centre Y', 0, 1, 0.01, 0.5), { key: 'invert', label: 'Hide inside instead', type: 'boolean', default: false }] },
  selectiveBlur: { type: 'selectiveBlur', label: 'Selective blur', category: 'Masking', description: 'Blur only painted areas.', params: [n('radius', 'Radius', 0, 10, 0.1, 3, '%')], usesMask: true, maskRequired: true },
  selectivePixelate: { type: 'selectivePixelate', label: 'Selective pixelate', category: 'Masking', description: 'Pixelate only painted areas.', params: [n('size', 'Block size', 0.5, 25, 0.5, 6, '%')], usesMask: true, maskRequired: true },
  overlay: { type: 'overlay', label: 'Overlay layer', category: 'Overlay', description: 'Overlay a colour, pattern or noise.', params: [{ key: 'mode', label: 'Pattern', type: 'select', options: ['color', 'stripes', 'grid', 'noise', 'dots'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })), default: 'stripes' }, { key: 'color', label: 'Colour', type: 'color', default: '#000000' }, n('opacity', 'Opacity', 0, 1, 0.01, 0.6), n('size', 'Pattern size', 1, 20, 0.5, 4, '%'), { key: 'clip', label: 'Only over image', type: 'boolean', default: true }], usesMask: true },
};

export const EFFECT_ORDER: EffectType[] = Object.keys(EFFECT_DEFS) as EffectType[];
