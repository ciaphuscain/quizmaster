import type { AudioClip } from '@/types/schema';
import { applyAudioOps, type Pcm } from './pcm';
import { decodeAudio } from './decode';
import { encodeWav } from './wav';
import { assetsRepo } from '@/db/repositories/assets';
import { blobToArrayBuffer } from '@/utils/hash';

const decoded = new Map<string, Promise<Pcm>>();

/** Decodes an audio asset once per session (original bytes stay untouched in the database). */
export function getOriginalPcm(assetId: string): Promise<Pcm> {
  let p = decoded.get(assetId);
  if (!p) {
    p = assetsRepo.getBlob(assetId).then(async (b) => {
      if (!b) throw new Error('Audio file missing from media library');
      return decodeAudio(await blobToArrayBuffer(b));
    });
    p.catch(() => decoded.delete(assetId));
    decoded.set(assetId, p);
  }
  return p;
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (p: Pcm) => void; reject: (e: Error) => void }>();
function getWorker(): Worker | null {
  if (worker || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('../../workers/audioWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; pcm?: Pcm; error?: string }>) => {
      const p = pending.get(e.data.id); pending.delete(e.data.id);
      if (e.data.pcm) p?.resolve(e.data.pcm); else p?.reject(new Error(e.data.error ?? 'Audio processing failed'));
    };
  } catch { worker = null; }
  return worker;
}

/** Runs the operation pipeline in a Web Worker (keeps the UI responsive for long files), with a main-thread fallback. */
function processOff(pcm: Pcm, ops: AudioClip['ops']): Promise<Pcm> {
  if (!ops.some((o) => o.enabled)) return Promise.resolve(pcm);
  const w = getWorker();
  if (!w) return new Promise((res) => setTimeout(() => res(applyAudioOps(pcm, ops)), 0));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, pcm: { sampleRate: pcm.sampleRate, channels: pcm.channels.map((c) => c.slice()) }, ops });
  });
}

const processed = new Map<string, Promise<Pcm>>();
/** Regenerates processed audio from the original + operations (memoized by operation list). */
export function getProcessedPcm(clip: AudioClip): Promise<Pcm> {
  const key = JSON.stringify(clip);
  let p = processed.get(key);
  if (!p) {
    p = getOriginalPcm(clip.assetId).then((pcm) => processOff(pcm, clip.ops));
    p.catch(() => processed.delete(key));
    processed.set(key, p);
    if (processed.size > 20) processed.delete(processed.keys().next().value as string);
  }
  return p;
}

export async function clipToWavBlob(clip: AudioClip): Promise<Blob> {
  return new Blob([encodeWav(await getProcessedPcm(clip))], { type: 'audio/wav' });
}
