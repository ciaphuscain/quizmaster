import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Square, Scissors, Rewind, Trash2, Repeat, Download, ZoomIn, ZoomOut, ArrowUp, ArrowDown, Eye, EyeOff, Upload, SplitSquareHorizontal, Crop } from 'lucide-react';
import type { AudioClip, AudioOp, AudioOpType } from '@/types/schema';
import { getOriginalPcm, getProcessedPcm } from '@/engines/audio/clip';
import { computePeaks, describeOp, pcmDuration, type Pcm } from '@/engines/audio/pcm';
import { audioContext, pcmToAudioBuffer } from '@/engines/audio/decode';
import { encodeWav } from '@/engines/audio/wav';
import { Button, SliderField } from '@/components/ui/primitives';
import { AssetPickerDialog } from '@/components/common/AssetPicker';
import { toast } from '@/components/ui/overlays';
import { downloadBlob } from '@/features/questions/actions';
import { uid } from '@/utils/id';
import { formatTime, cn } from '@/utils/misc';

type Sel = { start: number; end: number } | null;

export function AudioStudio({ clip, onChange, title = 'audio' }: { clip: AudioClip | null; onChange: (c: AudioClip | null) => void; title?: string }) {
  const [pick, setPick] = useState(false);
  const [pcm, setPcm] = useState<Pcm | null>(null);
  const [orig, setOrig] = useState<Pcm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [markers, setMarkers] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState<null | 'edited' | 'original'>(null);
  const [loop, setLoop] = useState(false);
  const [rate, setRate] = useState(1);
  const [pxPerSec, setPxPerSec] = useState(0); // 0 = fit
  const [gainDb, setGainDb] = useState(-3);
  const [fadeSec, setFadeSec] = useState(0.5);
  const [speedRate, setSpeedRate] = useState(1.25);
  const src = useRef<{ node: AudioBufferSourceNode; startedAt: number; offset: number } | null>(null);
  const raf = useRef(0);

  const clipKey = clip ? JSON.stringify(clip) : '';
  useEffect(() => {
    let alive = true;
    if (!clip) { setPcm(null); setOrig(null); return; }
    setProcessing(true); setError(null);
    Promise.all([getProcessedPcm(clip), getOriginalPcm(clip.assetId)])
      .then(([p, o]) => { if (alive) { setPcm(p); setOrig(o); } })
      .catch((e) => alive && setError((e as Error).message))
      .finally(() => alive && setProcessing(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipKey]);
  useEffect(() => () => stop(), []);

  const duration = pcm ? pcmDuration(pcm) : 0;
  const stop = () => {
    cancelAnimationFrame(raf.current);
    try { src.current?.node.stop(); } catch { /* already stopped */ }
    src.current = null; setPlaying(null);
  };
  const play = (which: 'edited' | 'original') => {
    const p = which === 'edited' ? pcm : orig;
    if (!p || processing) return;
    stop();
    const ctx = audioContext();
    void ctx.resume();
    const node = ctx.createBufferSource();
    node.buffer = pcmToAudioBuffer(p);
    node.playbackRate.value = rate;
    node.connect(ctx.destination);
    const d = pcmDuration(p);
    let offset = which === 'edited' ? (sel && loop ? sel.start : pos >= d - 0.01 ? 0 : pos) : 0;
    if (which === 'edited' && loop && sel) { node.loop = true; node.loopStart = sel.start; node.loopEnd = sel.end; } else if (loop) node.loop = true;
    offset = Math.min(offset, Math.max(0, d - 0.01));
    node.start(0, offset);
    src.current = { node, startedAt: ctx.currentTime, offset };
    node.onended = () => { if (src.current?.node === node) { setPlaying(null); src.current = null; } };
    setPlaying(which);
    const tick = () => {
      if (!src.current) return;
      let t = src.current.offset + (ctx.currentTime - src.current.startedAt) * rate;
      if (node.loop) { const ls = sel && loop ? sel.start : 0, le = sel && loop ? sel.end : d; if (t > le) t = ls + ((t - ls) % Math.max(0.01, le - ls)); }
      if (which === 'edited') setPos(Math.min(d, t));
      raf.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const addOp = (type: AudioOpType, params: Record<string, number> = {}, useSel = true) => {
    if (!clip) return;
    if ((type === 'trim' || type === 'delete') && !sel) { toast.info('Select a range on the waveform first'); return; }
    stop();
    const op: AudioOp = { id: uid('ao'), type, enabled: true, range: useSel && sel ? { start: +sel.start.toFixed(3), end: +sel.end.toFixed(3) } : null, params };
    onChange({ ...clip, ops: [...clip.ops, op] });
    if (type === 'trim' || type === 'delete' || type === 'speed' || type === 'loop') { setSel(null); setMarkers([]); setPos(0); }
  };
  const split = () => { if (pos > 0 && pos < duration) setMarkers([...new Set([...markers, +pos.toFixed(3)])].sort((a, b) => a - b)); };
  const exportWav = () => { if (pcm) downloadBlob(new Blob([encodeWav(pcm)], { type: 'audio/wav' }), `${title.replace(/[^a-z0-9]+/gi, '-') || 'audio'}-edited.wav`); };

  if (!clip) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-xs text-muted">No audio yet. Upload an MP3, WAV, OGG, M4A or FLAC file.</p>
        <Button variant="primary" onClick={() => setPick(true)} data-testid="choose-audio"><Upload size={14} />Choose audio</Button>
        <AssetPickerDialog open={pick} onOpenChange={setPick} type="audio" onPick={([a]) => onChange({ assetId: a.id, ops: [] })} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-testid="audio-studio">
      {error && <div className="rounded border border-danger/40 bg-danger/10 p-2 text-xs text-danger">{error}</div>}
      <div className="flex flex-wrap items-center gap-1">
        <Button size="sm" variant={playing === 'edited' ? 'primary' : 'outline'} onClick={() => (playing === 'edited' ? stop() : play('edited'))} disabled={!pcm || processing} data-testid="play-edited">
          {playing === 'edited' ? <Pause size={13} /> : <Play size={13} />}Preview edited
        </Button>
        <Button size="sm" variant={playing === 'original' ? 'primary' : 'outline'} onClick={() => (playing === 'original' ? stop() : play('original'))} disabled={!orig}><Play size={13} />Original</Button>
        <Button size="icon-sm" variant="ghost" tooltip="Stop" onClick={() => { stop(); setPos(0); }}><Square size={13} /></Button>
        <Button size="icon-sm" variant="ghost" tooltip="Loop playback (selection if any)" active={loop} onClick={() => setLoop(!loop)}><Repeat size={13} /></Button>
        <span className="ml-1 font-mono text-[11px] tabular-nums text-muted" data-testid="audio-time">{formatTime(pos)} / {formatTime(duration)}</span>
        {sel && <span className="text-[11px] text-accent">Sel {formatTime(sel.start)}–{formatTime(sel.end)}</span>}
        {processing && <span className="text-[11px] text-muted">Processing…</span>}
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" tooltip="Zoom out" onClick={() => setPxPerSec((p) => (p ? Math.max(5, p / 1.5) : 0))}><ZoomOut size={13} /></Button>
          <Button size="icon-sm" variant="ghost" tooltip="Zoom in" onClick={() => setPxPerSec((p) => (p || 40) * 1.5)}><ZoomIn size={13} /></Button>
          <Button size="sm" variant="ghost" onClick={() => setPxPerSec(0)}>Fit</Button>
        </div>
      </div>
      <Waveform pcm={pcm} pos={pos} sel={sel} markers={markers} pxPerSec={pxPerSec}
        onSeek={(t) => { setPos(t); if (playing) { stop(); } }}
        onSelect={setSel} />
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={() => addOp('trim')} disabled={!sel} data-testid="op-trim"><Crop size={12} />Trim to selection</Button>
        <Button size="sm" variant="outline" onClick={() => addOp('delete')} disabled={!sel}><Scissors size={12} />Delete selection</Button>
        <Button size="sm" variant="outline" onClick={split} tooltip="Split at playhead: click between markers to select a region"><SplitSquareHorizontal size={12} />Split</Button>
        <Button size="sm" variant="primary" onClick={() => addOp('reverse')} data-testid="op-reverse"><Rewind size={12} />Reverse {sel ? 'selection' : 'all'}</Button>
        <Button size="sm" variant="outline" onClick={() => addOp('fadeIn', { duration: sel ? +(sel.end - sel.start).toFixed(3) : fadeSec })} tooltip="Fades across the selection, or the start of the clip">Fade in{sel ? ' (selection)' : ''}</Button>
        <Button size="sm" variant="outline" onClick={() => addOp('fadeOut', { duration: sel ? +(sel.end - sel.start).toFixed(3) : fadeSec })} tooltip="Fades across the selection, or the end of the clip">Fade out{sel ? ' (selection)' : ''}</Button>
        <Button size="sm" variant="outline" onClick={() => addOp('gain', { db: gainDb })}>Gain {gainDb > 0 ? '+' : ''}{gainDb} dB</Button>
        <Button size="sm" variant="outline" onClick={() => addOp('speed', { rate: speedRate }, false)}>Speed ×{speedRate}</Button>
        <Button size="sm" variant="outline" onClick={() => addOp('loop', { count: 2 })}>Loop ×2</Button>
        <Button size="sm" variant="ghost" onClick={exportWav} disabled={!pcm}><Download size={12} />Export WAV</Button>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <SliderField label="Gain (dB)" value={gainDb} min={-24} max={12} step={0.5} onChange={setGainDb} />
        <SliderField label="Fade (s)" value={fadeSec} min={0.05} max={10} step={0.05} onChange={setFadeSec} />
        <SliderField label="Speed op" value={speedRate} min={0.25} max={4} step={0.05} unit="×" onChange={setSpeedRate} />
        <SliderField label="Preview rate" value={rate} min={0.5} max={2} step={0.05} unit="×" onChange={setRate} />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
          <span>Operations (applied in order to the original)</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => setPick(true)}>Replace audio</Button>
            {clip.ops.length > 0 && <Button size="sm" variant="ghost" className="text-danger" onClick={() => { stop(); onChange({ ...clip, ops: [] }); }}>Reset all</Button>}
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => { stop(); onChange(null); }}>Remove audio</Button>
          </div>
        </div>
        <ol className="flex flex-col gap-0.5" data-testid="audio-ops">
          <li className="px-2 py-1 text-xs text-muted">Original {orig ? `(${formatTime(pcmDuration(orig))}, ${orig.channels.length} ch, ${orig.sampleRate} Hz)` : ''}</li>
          {clip.ops.map((o, i) => (
            <li key={o.id} className={cn('flex items-center gap-1.5 rounded bg-panel-2 px-2 py-1 text-xs', !o.enabled && 'opacity-50')}>
              <button aria-label={o.enabled ? 'Disable' : 'Enable'} onClick={() => onChange({ ...clip, ops: clip.ops.map((x) => (x.id === o.id ? { ...x, enabled: !x.enabled } : x)) })} className="text-muted">{o.enabled ? <Eye size={12} /> : <EyeOff size={12} />}</button>
              <span className="flex-1">{i + 1}. {describeOp(o)}</span>
              <button aria-label="Move up" disabled={i === 0} className="text-muted disabled:opacity-30" onClick={() => { const ops = [...clip.ops]; [ops[i - 1], ops[i]] = [ops[i], ops[i - 1]]; onChange({ ...clip, ops }); }}><ArrowUp size={12} /></button>
              <button aria-label="Move down" disabled={i === clip.ops.length - 1} className="text-muted disabled:opacity-30" onClick={() => { const ops = [...clip.ops]; [ops[i + 1], ops[i]] = [ops[i], ops[i + 1]]; onChange({ ...clip, ops }); }}><ArrowDown size={12} /></button>
              <button aria-label="Remove operation" className="text-muted hover:text-danger" onClick={() => onChange({ ...clip, ops: clip.ops.filter((x) => x.id !== o.id) })}><Trash2 size={12} /></button>
            </li>
          ))}
        </ol>
      </div>
      <AssetPickerDialog open={pick} onOpenChange={setPick} type="audio" onPick={([a]) => { stop(); onChange({ assetId: a.id, ops: clip.ops }); }} />
    </div>
  );
}

function Waveform({ pcm, pos, sel, markers, pxPerSec, onSeek, onSelect }: { pcm: Pcm | null; pos: number; sel: Sel; markers: number[]; pxPerSec: number; onSeek: (t: number) => void; onSelect: (s: Sel) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(600);
  const H = 140;
  const drag = useRef<number | null>(null);
  const scrub = useRef(false);
  const dur = pcm ? pcmDuration(pcm) : 0;
  const width = pxPerSec && dur ? Math.max(w, Math.round(dur * pxPerSec)) : w;
  useEffect(() => {
    const ro = new ResizeObserver(() => setW(wrap.current!.clientWidth));
    ro.observe(wrap.current!); return () => ro.disconnect();
  }, []);
  const peaks = pcm ? computePeaks(pcm, Math.max(1, width)) : null;
  useEffect(() => {
    const c = cv.current!; const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr; c.height = H * dpr;
    const ctx = c.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0b0e'; ctx.fillRect(0, 0, width, H);
    if (!peaks || !dur) return;
    const tx = (t: number) => (t / dur) * width;
    // ruler
    ctx.fillStyle = '#18181b'; ctx.fillRect(0, 0, width, 18);
    ctx.fillStyle = '#71717a'; ctx.font = '10px Inter, sans-serif';
    const step = [0.1, 0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((s) => (s / dur) * width > 60) ?? 300;
    for (let t = 0; t <= dur; t += step) { ctx.fillRect(tx(t), 0, 1, 6); ctx.fillText(formatTime(t), tx(t) + 2, 14); }
    if (sel) { ctx.fillStyle = 'rgba(245,158,11,0.22)'; ctx.fillRect(tx(sel.start), 18, tx(sel.end) - tx(sel.start), H - 18); }
    const mid = 18 + (H - 18) / 2, amp = (H - 22) / 2;
    ctx.fillStyle = '#22c55e';
    for (let x = 0; x < width; x++) { const mn = peaks[x * 2], mx = peaks[x * 2 + 1]; ctx.fillRect(x, mid - mx * amp, 1, Math.max(1, (mx - mn) * amp)); }
    ctx.fillStyle = '#ec4899'; for (const m of markers) ctx.fillRect(tx(m), 18, 2, H - 18);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(tx(pos), 0, 2, H);
  }, [peaks, width, sel, pos, markers, dur]);
  const tAt = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return Math.max(0, Math.min(dur, ((e.clientX - r.left) / width) * dur)); };
  return (
    <div ref={wrap} className="overflow-x-auto rounded border border-line">
      <canvas ref={cv} style={{ width, height: H, display: 'block', cursor: 'text' }} data-testid="waveform" aria-label="Waveform. Drag to select a range, click to seek, drag along the time ruler to scrub."
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          const r = cv.current!.getBoundingClientRect();
          if (e.clientY - r.top < 20) { scrub.current = true; onSeek(tAt(e)); return; }
          drag.current = tAt(e);
        }}
        onPointerMove={(e) => { if (scrub.current && e.buttons) { onSeek(tAt(e)); return; } if (drag.current === null || !e.buttons) return; const t = tAt(e); const a = Math.min(drag.current, t), b = Math.max(drag.current, t); if (b - a > 0.02) onSelect({ start: a, end: b }); }}
        onPointerUp={(e) => {
          if (scrub.current) { scrub.current = false; return; }
          const t = tAt(e);
          if (drag.current !== null && Math.abs(t - drag.current) <= 0.02 * Math.max(1, dur / 10)) {
            // click: seek; if markers exist, select the region between markers
            onSeek(t);
            if (markers.length) { const bounds = [0, ...markers, dur]; const i = bounds.findIndex((b) => b > t); if (i > 0) onSelect({ start: bounds[i - 1], end: bounds[i] }); }
            else onSelect(null);
          }
          drag.current = null;
        }} />
    </div>
  );
}
