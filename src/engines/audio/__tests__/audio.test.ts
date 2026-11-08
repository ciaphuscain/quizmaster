import { describe, expect, it } from 'vitest';
import { applyAudioOps, deleteRange, fade, gain, loop, pcmDuration, reverse, speed, trim, type Pcm } from '../pcm';
import { decodeWav, encodeWav } from '../wav';
import type { AudioOp } from '@/types/schema';

const ramp = (n: number, rate = 10): Pcm => ({ sampleRate: rate, channels: [Float32Array.from({ length: n }, (_, i) => i / n), Float32Array.from({ length: n }, (_, i) => -i / n)] });

describe('audio operations', () => {
  it('reverses each channel independently without swapping channels', () => {
    const p = ramp(10);
    const r = reverse(p);
    expect(r.channels[0][0]).toBeCloseTo(0.9);
    expect(r.channels[1][0]).toBeCloseTo(-0.9);
    expect(r.channels[0][9]).toBe(0);
    expect(r.sampleRate).toBe(10);
    expect(p.channels[0][0]).toBe(0); // original untouched
  });
  it('reverses only a selected range', () => {
    const r = reverse(ramp(10), { start: 0.2, end: 0.5 });
    expect(Array.from(r.channels[0].slice(0, 6)).map((v) => +v.toFixed(1))).toEqual([0, 0.1, 0.4, 0.3, 0.2, 0.5]);
  });
  it('trims to a range', () => {
    const t = trim(ramp(100), 2, 5);
    expect(pcmDuration(t)).toBeCloseTo(3);
    expect(t.channels[0][0]).toBeCloseTo(0.2);
  });
  it('deletes a range', () => { expect(deleteRange(ramp(100), 2, 5).channels[0].length).toBe(70); });
  it('gain in dB', () => { expect(gain(ramp(10), -6.0206).channels[0][8]).toBeCloseTo(0.4, 3); });
  it('fades in and out', () => {
    const p: Pcm = { sampleRate: 10, channels: [new Float32Array(20).fill(1)] };
    expect(fade(p, 1, 'in').channels[0][0]).toBe(0);
    expect(fade(p, 1, 'in').channels[0][15]).toBe(1);
    expect(fade(p, 1, 'out').channels[0][19]).toBeCloseTo(0);
  });
  it('speed changes duration', () => { expect(speed(ramp(100), 2).channels[0].length).toBe(50); });
  it('loop repeats', () => { expect(loop(ramp(10), 3).channels[0].length).toBe(30); });
  it('applies ordered ops: trim → reverse → fade → gain', () => {
    const ops: AudioOp[] = [
      { id: '1', type: 'trim', enabled: true, range: { start: 2, end: 4 }, params: {} },
      { id: '2', type: 'reverse', enabled: true, range: null, params: {} },
      { id: '3', type: 'fadeIn', enabled: true, range: null, params: { duration: 0.5 } },
      { id: '4', type: 'gain', enabled: false, range: null, params: { db: -60 } },
    ];
    const out = applyAudioOps(ramp(100), ops);
    expect(out.channels[0].length).toBe(20);
    expect(out.channels[0][0]).toBe(0); // faded
    expect(out.channels[0][10]).toBeCloseTo(0.29, 2); // reversed: 0.39 - 0.1
  });
});

describe('WAV encoding', () => {
  it('writes a valid RIFF header and round-trips samples', () => {
    const p: Pcm = { sampleRate: 22050, channels: [Float32Array.from([0, 0.5, -0.5, 1]), Float32Array.from([0.25, -0.25, 0, -1])] };
    const buf = encodeWav(p);
    const v = new DataView(buf);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(buf.byteLength - 8);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint16(34, true)).toBe(16);
    expect(buf.byteLength).toBe(44 + 4 * 2 * 2);
    const d = decodeWav(buf);
    expect(d.sampleRate).toBe(22050);
    expect(d.channels[0][1]).toBeCloseTo(0.5, 3);
    expect(d.channels[1][1]).toBeCloseTo(-0.25, 3);
    expect(d.channels[1][3]).toBeCloseTo(-1, 3);
  });
});
