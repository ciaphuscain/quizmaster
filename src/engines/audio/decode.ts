import type { Pcm } from './pcm';
import { decodeWav } from './wav';

let ctx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/** Decodes any browser-supported audio file (MP3, WAV, OGG, M4A…) to PCM at its native sample rate. */
export async function decodeAudio(data: ArrayBuffer): Promise<Pcm> {
  try {
    const OfflineCtx = window.OfflineAudioContext;
    // decodeAudioData resamples to the context rate; WAV is decoded natively to keep the original rate exactly.
    const head = new Uint8Array(data.slice(0, 12));
    const isWav = String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'WAVE';
    if (isWav) return decodeWav(data);
    const buf = await getCtx().decodeAudioData(data.slice(0));
    void OfflineCtx;
    return { sampleRate: buf.sampleRate, channels: Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice()) };
  } catch (e) {
    throw new Error(`Could not decode audio: ${(e as Error).message}`);
  }
}

export function pcmToAudioBuffer(p: Pcm): AudioBuffer {
  const c = getCtx();
  const len = Math.max(1, p.channels[0]?.length ?? 1);
  const b = c.createBuffer(p.channels.length, len, p.sampleRate);
  p.channels.forEach((ch, i) => b.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
  return b;
}

export function audioContext() { return getCtx(); }
