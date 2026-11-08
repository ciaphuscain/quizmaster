import type { Pcm } from './pcm';

/** Encodes PCM as a valid RIFF/WAVE file (16-bit signed little-endian PCM). */
export function encodeWav(p: Pcm): ArrayBuffer {
  const numCh = p.channels.length;
  const len = p.channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const dataSize = len * numCh * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, numCh, true);
  v.setUint32(24, p.sampleRate, true); v.setUint32(28, p.sampleRate * numCh * bytesPerSample, true);
  v.setUint16(32, numCh * bytesPerSample, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, p.channels[c][i]));
      v.setInt16(o, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
      o += 2;
    }
  return buf;
}

/** Decodes 8/16/24/32-bit integer or 32-bit float PCM WAV files (used in tests and as a fallback). */
export function decodeWav(buf: ArrayBuffer): Pcm {
  const v = new DataView(buf);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  let o = 12, fmt = 1, numCh = 1, rate = 44100, bits = 16;
  while (o + 8 <= v.byteLength) {
    const id = tag(o), size = v.getUint32(o + 4, true);
    if (id === 'fmt ') {
      fmt = v.getUint16(o + 8, true); numCh = v.getUint16(o + 10, true);
      rate = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true);
    } else if (id === 'data') {
      const bps = bits / 8;
      const frames = Math.floor(Math.min(size, v.byteLength - o - 8) / (bps * numCh));
      const channels = Array.from({ length: numCh }, () => new Float32Array(frames));
      let p = o + 8;
      for (let i = 0; i < frames; i++)
        for (let c = 0; c < numCh; c++) {
          let s = 0;
          if (fmt === 3 && bits === 32) s = v.getFloat32(p, true);
          else if (bits === 16) s = v.getInt16(p, true) / 0x8000;
          else if (bits === 8) s = (v.getUint8(p) - 128) / 128;
          else if (bits === 24) { const x = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getInt8(p + 2) << 16); s = x / 0x800000; }
          else if (bits === 32) s = v.getInt32(p, true) / 0x80000000;
          channels[c][i] = s; p += bps;
        }
      return { sampleRate: rate, channels };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error('WAV file has no data chunk');
}
