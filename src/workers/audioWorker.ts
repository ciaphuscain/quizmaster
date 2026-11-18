/// <reference lib="webworker" />
import { applyAudioOps, type Pcm } from '@/engines/audio/pcm';
import type { AudioOp } from '@/types/schema';

self.onmessage = (e: MessageEvent<{ id: number; pcm: Pcm; ops: AudioOp[] }>) => {
  const { id, pcm, ops } = e.data;
  try {
    const out = applyAudioOps(pcm, ops);
    const channels = out.channels.map((c) => (pcm.channels.includes(c) ? c.slice() : c));
    (self as unknown as Worker).postMessage({ id, pcm: { sampleRate: out.sampleRate, channels } }, channels.map((c) => c.buffer as ArrayBuffer));
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String((err as Error).message ?? err) });
  }
};
