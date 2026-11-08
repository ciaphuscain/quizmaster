import type { AudioOp } from '@/types/schema';

/** Plain PCM audio: one Float32Array per channel, all equal length. */
export type Pcm = { sampleRate: number; channels: Float32Array[] };

export const pcmLength = (p: Pcm) => (p.channels[0]?.length ?? 0);
export const pcmDuration = (p: Pcm) => pcmLength(p) / p.sampleRate;

function rangeToSamples(p: Pcm, range: AudioOp['range']): [number, number] {
  const len = pcmLength(p);
  if (!range) return [0, len];
  let a = Math.round(range.start * p.sampleRate), b = Math.round(range.end * p.sampleRate);
  if (a > b) [a, b] = [b, a];
  return [Math.max(0, Math.min(len, a)), Math.max(0, Math.min(len, b))];
}

export function trim(p: Pcm, start: number, end: number): Pcm {
  const [a, b] = rangeToSamples(p, { start, end });
  return { sampleRate: p.sampleRate, channels: p.channels.map((c) => c.slice(a, b)) };
}

export function deleteRange(p: Pcm, start: number, end: number): Pcm {
  const [a, b] = rangeToSamples(p, { start, end });
  return {
    sampleRate: p.sampleRate,
    channels: p.channels.map((c) => {
      const out = new Float32Array(c.length - (b - a));
      out.set(c.subarray(0, a), 0);
      out.set(c.subarray(b), a);
      return out;
    }),
  };
}

/** Reverses sample order independently for every channel (channels never swap). */
export function reverse(p: Pcm, range: AudioOp['range'] = null): Pcm {
  const [a, b] = rangeToSamples(p, range);
  return {
    sampleRate: p.sampleRate,
    channels: p.channels.map((c) => {
      const out = c.slice();
      for (let i = a, j = b - 1; i < b; i++, j--) out[i] = c[j];
      return out;
    }),
  };
}

export function gain(p: Pcm, db: number, range: AudioOp['range'] = null): Pcm {
  const [a, b] = rangeToSamples(p, range);
  const g = Math.pow(10, db / 20);
  return {
    sampleRate: p.sampleRate,
    channels: p.channels.map((c) => {
      const out = c.slice();
      for (let i = a; i < b; i++) out[i] = Math.max(-1, Math.min(1, c[i] * g));
      return out;
    }),
  };
}

export function fade(p: Pcm, duration: number, kind: 'in' | 'out', range: AudioOp['range'] = null): Pcm {
  const [ra, rb] = rangeToSamples(p, range);
  const n = Math.min(rb - ra, Math.round(duration * p.sampleRate));
  return {
    sampleRate: p.sampleRate,
    channels: p.channels.map((c) => {
      const out = c.slice();
      for (let k = 0; k < n; k++) {
        const g = k / n;
        if (kind === 'in') out[ra + k] = c[ra + k] * g;
        else out[rb - 1 - k] = c[rb - 1 - k] * g;
      }
      return out;
    }),
  };
}

/** Tape-style speed change (pitch follows speed); linear interpolation resampling. */
export function speed(p: Pcm, rate: number): Pcm {
  const r = Math.max(0.1, Math.min(8, rate));
  const len = pcmLength(p);
  const outLen = Math.max(1, Math.floor(len / r));
  return {
    sampleRate: p.sampleRate,
    channels: p.channels.map((c) => {
      const out = new Float32Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const pos = i * r, i0 = Math.floor(pos), f = pos - i0;
        const s0 = c[Math.min(len - 1, i0)] ?? 0, s1 = c[Math.min(len - 1, i0 + 1)] ?? 0;
        out[i] = s0 + (s1 - s0) * f;
      }
      return out;
    }),
  };
}

export function loop(p: Pcm, count: number, range: AudioOp['range'] = null): Pcm {
  const n = Math.max(1, Math.min(20, Math.round(count)));
  const [a, b] = rangeToSamples(p, range);
  return {
    sampleRate: p.sampleRate,
    channels: p.channels.map((c) => {
      const seg = c.subarray(a, b);
      const out = new Float32Array(c.length + seg.length * (n - 1));
      out.set(c.subarray(0, b), 0);
      for (let k = 1; k < n; k++) out.set(seg, b + seg.length * (k - 1));
      out.set(c.subarray(b), b + seg.length * (n - 1));
      return out;
    }),
  };
}

export function applyAudioOp(p: Pcm, op: AudioOp): Pcm {
  const prm = op.params;
  switch (op.type) {
    case 'trim': return op.range ? trim(p, op.range.start, op.range.end) : p;
    case 'delete': return op.range ? deleteRange(p, op.range.start, op.range.end) : p;
    case 'reverse': return reverse(p, op.range);
    case 'gain': return gain(p, prm.db ?? 0, op.range);
    case 'fadeIn': return fade(p, prm.duration ?? 0.5, 'in', op.range);
    case 'fadeOut': return fade(p, prm.duration ?? 0.5, 'out', op.range);
    case 'speed': return speed(p, prm.rate ?? 1);
    case 'loop': return loop(p, prm.count ?? 2, op.range);
  }
}

/** Applies enabled operations in order to the original PCM (which is never mutated). */
export function applyAudioOps(original: Pcm, ops: AudioOp[]): Pcm {
  return ops.reduce((acc, op) => (op.enabled ? applyAudioOp(acc, op) : acc), original);
}

/** Duration after applying the first `upTo` ops (for timeline display). */
export function describeOp(op: AudioOp): string {
  const r = op.range ? ` ${op.range.start.toFixed(2)}s–${op.range.end.toFixed(2)}s` : ' (whole clip)';
  switch (op.type) {
    case 'trim': return `Trim to${r}`;
    case 'delete': return `Delete${r}`;
    case 'reverse': return `Reverse${r}`;
    case 'gain': return `Gain ${(op.params.db ?? 0) > 0 ? '+' : ''}${op.params.db ?? 0} dB${r}`;
    case 'fadeIn': return `Fade in ${op.params.duration ?? 0.5}s${op.range ? r : ''}`;
    case 'fadeOut': return `Fade out ${op.params.duration ?? 0.5}s${op.range ? r : ''}`;
    case 'speed': return `Speed ×${op.params.rate ?? 1}`;
    case 'loop': return `Loop ×${op.params.count ?? 2}${r}`;
  }
}

/** Min/max peaks for waveform drawing. */
export function computePeaks(p: Pcm, buckets: number): Float32Array {
  const len = pcmLength(p);
  const out = new Float32Array(buckets * 2);
  if (!len) return out;
  const step = len / buckets;
  for (let b = 0; b < buckets; b++) {
    let mn = 0, mx = 0;
    const s = Math.floor(b * step), e = Math.min(len, Math.floor((b + 1) * step) + 1);
    for (const c of p.channels)
      for (let i = s; i < e; i++) { const v = c[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    out[b * 2] = mn; out[b * 2 + 1] = mx;
  }
  return out;
}
