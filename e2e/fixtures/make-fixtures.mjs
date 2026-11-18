// Generates deterministic fixtures for E2E tests (no external assets).
import fs from 'node:fs';
import zlib from 'node:zlib';
const dir = new URL('.', import.meta.url);

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) { const p = pixel(x, y); raw.set(p, y * (w * 4 + 1) + 1 + x * 4); } }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// logo: white background, blue square top-left, red circle centre
fs.writeFileSync(new URL('logo.png', dir), png(240, 240, (x, y) => {
  if (Math.hypot(x - 140, y - 140) < 60) return [220, 30, 40, 255];
  if (x > 20 && x < 100 && y > 20 && y < 100) return [30, 80, 220, 255];
  return [255, 255, 255, 255];
}));
// subject: dark figure (circle head + body) on plain light background
fs.writeFileSync(new URL('subject.png', dir), png(200, 240, (x, y) => {
  const head = Math.hypot(x - 100, y - 60) < 32;
  const body = Math.abs(x - 100) < 45 - (y - 100) * 0.05 && y > 95 && y < 220;
  return head || body ? [120, 60, 30, 255] : [235, 240, 245, 255];
}));
// prop: green triangle on white
fs.writeFileSync(new URL('prop.png', dir), png(160, 160, (x, y) => (y > 20 && Math.abs(x - 80) < (y - 20) * 0.5 ? [20, 160, 60, 255] : [255, 255, 255, 255])));
// audio: 2 s stereo 16-bit 22050 Hz; left channel fades in, right channel fades out (so reversal is detectable)
const rate = 22050, n = rate * 2;
const data = Buffer.alloc(n * 4);
for (let i = 0; i < n; i++) {
  const t = i / rate;
  data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * t) * (i / n) * 30000), i * 4);
  data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 660 * t) * (1 - i / n) * 30000), i * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8); hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(rate, 24); hdr.writeUInt32LE(rate * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
fs.writeFileSync(new URL('tone.wav', dir), Buffer.concat([hdr, data]));
console.log('fixtures written');
