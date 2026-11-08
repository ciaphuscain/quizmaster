import type { Effect, EffectType } from '@/types/schema';
import { createEffect } from '@/engines/scene/factories';

export type EffectPreset = { id: string; name: string; description: string; build: () => Effect[] };

const fx = (type: EffectType, params: Record<string, number | string | boolean> = {}, mask?: Effect['mask']): Effect => {
  const e = createEffect(type);
  e.params = { ...e.params, ...params };
  if (mask) e.mask = mask;
  return e;
};

const centreCircle = (r: number) => ({
  ops: [{ kind: 'polygon' as const, mode: 'add' as const, points: Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2; return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]; }).flat() }],
  invert: false,
});

export const EFFECT_PRESETS: EffectPreset[] = [
  { id: 'heavy-blur', name: 'Heavily blurred', description: 'Strong blur', build: () => [fx('blur', { radius: 5 })] },
  { id: 'extreme-zoom', name: 'Extreme zoom', description: '6× zoom on the centre', build: () => [fx('zoom', { factor: 6 })] },
  { id: 'pixelated', name: 'Pixelated', description: 'Large pixel blocks', build: () => [fx('pixelate', { size: 8 })] },
  { id: 'colorless', name: 'Colourless', description: 'Grayscale + contrast', build: () => [fx('grayscale', { amount: 1 }), fx('contrast', { amount: 0.2 })] },
  { id: 'hidden-centre', name: 'Hidden centre', description: 'Centre covered', build: () => [fx('hideAreas', { color: '#111827' }, centreCircle(0.22))] },
  { id: 'rotated-mirrored', name: 'Rotated and mirrored', description: 'Mirror + 135° rotation', build: () => [fx('mirrorH'), fx('rotate', { angle: 135, expand: true })] },
  { id: 'outline', name: 'Outline challenge', description: 'Edges only', build: () => [fx('outline', { threshold: 50, thickness: 3 })] },
  { id: 'partial-reveal', name: 'Partial reveal', description: 'Only a keyhole is visible', build: () => [fx('shapeMask', { shape: 'keyhole', scale: 0.35 })] },
  { id: 'tiny-crop', name: 'Tiny crop', description: 'A small corner crop', build: () => [fx('crop', { x: 0.3, y: 0.3, w: 0.25, h: 0.25 })] },
  { id: 'extreme-rotation', name: 'Extreme rotation', description: 'Upside down + swirl', build: () => [fx('upsideDown'), fx('distort', { mode: 'swirl', amount: 0.6 })] },
  { id: 'inverted-hue', name: 'Inverted & hue shifted', description: 'Wrong colours', build: () => [fx('invert'), fx('hueShift', { degrees: 90 })] },
];
