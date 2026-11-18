import type { Layer, Transform } from '@/types/schema';

export type Pt = { x: number; y: number };
export const rad = (d: number) => (d * Math.PI) / 180;

export function center(t: Transform): Pt { return { x: t.x + t.w / 2, y: t.y + t.h / 2 }; }
export function toLocal(t: Transform, p: Pt): Pt {
  const c = center(t), a = -rad(t.rotation);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
}
export function fromLocal(t: Transform, l: Pt, c = center(t)): Pt {
  const a = rad(t.rotation);
  return { x: c.x + l.x * Math.cos(a) - l.y * Math.sin(a), y: c.y + l.x * Math.sin(a) + l.y * Math.cos(a) };
}
export function hitLayer(l: Layer, p: Pt, pad = 0): boolean {
  const q = toLocal(l.transform, p);
  return Math.abs(q.x) <= l.transform.w / 2 + pad && Math.abs(q.y) <= l.transform.h / 2 + pad;
}

export type Handle = { hx: -1 | 0 | 1; hy: -1 | 0 | 1 } | 'rotate';
export const HANDLES: { hx: -1 | 0 | 1; hy: -1 | 0 | 1 }[] = [
  { hx: -1, hy: -1 }, { hx: 0, hy: -1 }, { hx: 1, hy: -1 }, { hx: 1, hy: 0 }, { hx: 1, hy: 1 }, { hx: 0, hy: 1 }, { hx: -1, hy: 1 }, { hx: -1, hy: 0 },
];

export function hitHandle(t: Transform, p: Pt, scale: number): Handle | null {
  const q = toLocal(t, p);
  const r = 9 / scale;
  if (Math.hypot(q.x, q.y - (-t.h / 2 - 32 / scale)) <= r * 1.3) return 'rotate';
  for (const h of HANDLES) if (Math.abs(q.x - (h.hx * t.w) / 2) <= r && Math.abs(q.y - (h.hy * t.h) / 2) <= r) return h;
  return null;
}

/** Resize a (possibly rotated) box by dragging a handle; pointer p in scene coords. */
export function resizeTransform(t0: Transform, h: { hx: number; hy: number }, p: Pt, keepAspect: boolean, minSize = 8): Transform {
  const L = toLocal(t0, p);
  let left = -t0.w / 2, right = t0.w / 2, top = -t0.h / 2, bottom = t0.h / 2;
  if (h.hx === 1) right = Math.max(left + minSize, L.x);
  if (h.hx === -1) left = Math.min(right - minSize, L.x);
  if (h.hy === 1) bottom = Math.max(top + minSize, L.y);
  if (h.hy === -1) top = Math.min(bottom - minSize, L.y);
  if (keepAspect && h.hx !== 0 && h.hy !== 0) {
    const s = Math.max((right - left) / t0.w, (bottom - top) / t0.h);
    const nw = t0.w * s, nh = t0.h * s;
    if (h.hx === 1) right = left + nw; else left = right - nw;
    if (h.hy === 1) bottom = top + nh; else top = bottom - nh;
  }
  const w = right - left, hh = bottom - top;
  const c = fromLocal(t0, { x: (left + right) / 2, y: (top + bottom) / 2 });
  return { ...t0, x: c.x - w / 2, y: c.y - hh / 2, w, h: hh };
}

export function rotationFromPointer(t: Transform, p: Pt, snap: boolean): number {
  const c = center(t);
  let a = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
  if (snap) a = Math.round(a / 15) * 15;
  a = ((a + 180) % 360 + 360) % 360 - 180;
  return Math.round(a * 10) / 10;
}

export type Guide = { axis: 'x' | 'y'; pos: number };

/** Snap a moving axis-aligned bbox to targets; returns delta adjustments and guides. */
export function snapBox(box: { x: number; y: number; w: number; h: number }, targetsX: number[], targetsY: number[], threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const cand = (vals: number[], targets: number[]) => {
    let best: { d: number; pos: number } | null = null;
    for (const v of vals) for (const t of targets) { const d = t - v; if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, pos: t }; }
    return best;
  };
  const bx = cand([box.x, box.x + box.w / 2, box.x + box.w], targetsX);
  const by = cand([box.y, box.y + box.h / 2, box.y + box.h], targetsY);
  const guides: Guide[] = [];
  if (bx) guides.push({ axis: 'x', pos: bx.pos });
  if (by) guides.push({ axis: 'y', pos: by.pos });
  return { dx: bx?.d ?? 0, dy: by?.d ?? 0, guides };
}

export function bbox(ts: Transform[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of ts) {
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => fromLocal(t, { x: (a * t.w) / 2, y: (b * t.h) / 2 }));
    for (const c of corners) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
