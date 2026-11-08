import type { MaskData, MaskOp } from '@/types/schema';

/** Rasterizes vector mask operations to a coverage array (0..1) of size w*h. */
export function rasterizeMask(mask: MaskData | undefined, w: number, h: number, initial = 0): Float32Array {
  const m = new Float32Array(w * h).fill(initial);
  if (mask) for (const op of mask.ops) applyMaskOp(m, w, h, op);
  if (mask?.invert) for (let i = 0; i < m.length; i++) m[i] = 1 - m[i];
  return m;
}

export function maskIsEmpty(mask: MaskData | undefined): boolean {
  return !mask || (mask.ops.length === 0 && !mask.invert);
}

export function applyMaskOp(m: Float32Array, w: number, h: number, op: MaskOp): void {
  if (op.kind === 'polygon') fillPolygon(m, w, h, op.points, op.mode === 'add' ? 1 : 0);
  else strokeBrush(m, w, h, op.points, op.size * w / 2, op.hardness, op.mode);
}

function fillPolygon(m: Float32Array, w: number, h: number, pts: number[], value: number) {
  const n = pts.length / 2;
  if (n < 3) return;
  const xs: number[] = [];
  for (let y = 0; y < h; y++) {
    const sy = (y + 0.5) / h;
    xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const yi = pts[i * 2 + 1], yj = pts[j * 2 + 1];
      if ((yi > sy) !== (yj > sy)) {
        const xi = pts[i * 2], xj = pts[j * 2];
        xs.push((xi + ((sy - yi) / (yj - yi)) * (xj - xi)) * w);
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5)), x1 = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) m[y * w + x] = value;
    }
  }
}

function strokeBrush(m: Float32Array, w: number, h: number, pts: number[], radius: number, hardness: number, mode: 'add' | 'subtract') {
  if (pts.length < 2 || radius <= 0) return;
  const stamp = (cx: number, cy: number) => {
    const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(w - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(h - 1, Math.ceil(cy + radius));
    const inner = radius * hardness;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > radius) continue;
        const a = d <= inner ? 1 : 1 - (d - inner) / Math.max(1e-6, radius - inner);
        const i = y * w + x;
        m[i] = mode === 'add' ? Math.max(m[i], a) : Math.min(m[i], 1 - a);
      }
  };
  let px = pts[0] * w, py = pts[1] * h;
  stamp(px, py);
  const spacing = Math.max(1, radius * 0.25);
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const nx = pts[i] * w, ny = pts[i + 1] * h;
    const dist = Math.hypot(nx - px, ny - py);
    const steps = Math.ceil(dist / spacing);
    for (let s = 1; s <= steps; s++) stamp(px + ((nx - px) * s) / steps, py + ((ny - py) * s) / steps);
    px = nx; py = ny;
  }
}

/** Box-blurs a coverage array (used for feathering). */
export function blurMask(m: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.round(radius);
  if (r <= 0) return m;
  const tmp = new Float32Array(m.length), out = new Float32Array(m.length);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += m[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / (2 * r + 1);
      acc += m[y * w + Math.min(w - 1, x + r + 1)] - m[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Normalized polygon for named shapes, centred at (cx,cy) with radius s (relative to min side). */
export function shapePolygon(shape: string, cx: number, cy: number, s: number, aspect: number): number[] {
  // aspect = width/height; we scale x by 1/aspect so shapes stay round on non-square images
  const pts: [number, number][] = [];
  const P = (a: number, r: number) => pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  switch (shape) {
    case 'square': pts.push([-1, -1], [1, -1], [1, 1], [-1, 1]); break;
    case 'diamond': pts.push([0, -1], [1, 0], [0, 1], [-1, 0]); break;
    case 'triangle': for (let i = 0; i < 3; i++) P(-Math.PI / 2 + (i * 2 * Math.PI) / 3, 1); break;
    case 'hexagon': for (let i = 0; i < 6; i++) P((i * Math.PI) / 3, 1); break;
    case 'star': for (let i = 0; i < 10; i++) P(-Math.PI / 2 + (i * Math.PI) / 5, i % 2 ? 0.45 : 1); break;
    case 'heart':
      for (let i = 0; i < 64; i++) {
        const t = (i / 64) * 2 * Math.PI;
        pts.push([(16 * Math.sin(t) ** 3) / 17, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17]);
      }
      break;
    case 'keyhole': {
      for (let i = 0; i < 48; i++) { const a = Math.PI * 0.65 + (i / 47) * Math.PI * 1.7; pts.push([Math.cos(a) * 0.55, -0.35 + Math.sin(a) * 0.55]); }
      pts.push([0.35, 1], [-0.35, 1]);
      break;
    }
    default: for (let i = 0; i < 72; i++) P((i / 72) * 2 * Math.PI, 1);
  }
  const sx = aspect >= 1 ? s / aspect : s, sy = aspect >= 1 ? s : s * aspect;
  return pts.flatMap(([x, y]) => [cx + x * sx, cy + y * sy]);
}
