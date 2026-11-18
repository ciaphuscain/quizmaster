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

const processed = new Map<string, Promise<Pcm>>();
/** Regenerates processed audio from the original + operations (memoized by operation list). */
export function getProcessedPcm(clip: AudioClip): Promise<Pcm> {
  const key = JSON.stringify(clip);
  let p = processed.get(key);
  if (!p) {
    p = getOriginalPcm(clip.assetId).then((pcm) => new Promise<Pcm>((res) => setTimeout(() => res(applyAudioOps(pcm, clip.ops)), 0)));
    processed.set(key, p);
    if (processed.size > 20) processed.delete(processed.keys().next().value as string);
  }
  return p;
}

export async function clipToWavBlob(clip: AudioClip): Promise<Blob> {
  return new Blob([encodeWav(await getProcessedPcm(clip))], { type: 'audio/wav' });
}
