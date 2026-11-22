import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { remainingSeconds, type PublicState } from './model';

/** Renders ONLY the public state. Used by the audience window and the host's "audience preview". */
export function AudienceDisplay({ state, slideUrl, connected = true, compact }: { state: PublicState | null; slideUrl: string | null; connected?: boolean; compact?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 200); return () => clearInterval(t); }, []);
  if (!state || state.kind === 'waiting') {
    return <div className="flex h-full w-full items-center justify-center bg-black text-zinc-400" data-testid="audience-waiting">{connected ? 'Waiting for the quiz to start…' : 'Waiting for the host window… (keep the host tab open)'}</div>;
  }
  if (state.kind === 'end') {
    return <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black text-white"><div className="text-5xl font-bold">Thanks for playing!</div><div className="text-xl text-zinc-400">{state.quizTitle}</div></div>;
  }
  if (state.kind === 'transition') {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 reveal-in" style={{ background: state.background }} data-testid="audience-transition">
        <div className="text-xl uppercase tracking-[0.3em] text-white/60">{state.quizTitle}</div>
        <div className={`${compact ? 'text-3xl' : 'text-7xl'} font-bold`} style={{ color: state.accent }}>{state.roundTitle}</div>
        {state.roundSubtitle && <div className="max-w-3xl text-center text-2xl text-white/80">{state.roundSubtitle}</div>}
      </div>
    );
  }
  const rem = remainingSeconds(state.timer, now);
  const showTimer = state.timer.duration > 0;
  return (
    <div className="relative flex h-full w-full flex-col bg-black text-white" data-testid="audience-question">
      <div className={`flex items-center gap-4 px-6 ${compact ? 'py-1 text-xs' : 'py-3 text-xl'}`}>
        <span className="font-semibold" style={{ color: state.accent }}>{state.roundTitle}</span>
        {state.showNumbers && state.questionNumber && <span className="text-white/70">Question {state.questionNumber}{state.questionTotal ? ` / ${state.questionTotal}` : ''}</span>}
        {state.audioPlaying && <span className="flex items-center gap-1 text-white/80"><Volume2 size={compact ? 12 : 22} />Playing</span>}
        {showTimer && (
          <span className={`ml-auto rounded-md px-3 font-mono tabular-nums ${rem <= 5 && state.timer.endsAt ? 'bg-red-600' : 'bg-white/10'}`} data-testid="audience-timer">
            {rem <= 0 ? "Time's up!" : `${Math.floor(rem / 60)}:${String(Math.ceil(rem % 60) === 60 ? 0 : Math.ceil(rem) % 60).padStart(2, '0')}`}
          </span>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        <SlideWithTransition url={slideUrl} alt={state.prompt} slideKey={state.slideKey} transition={state.transition} />
      </div>
      {(state.hints.length > 0 || state.answer) && (
        <div className={`flex flex-col items-center gap-2 px-6 ${compact ? 'py-1' : 'py-4'}`}>
          {state.hints.length > 0 && !state.answer && (
            <div className={`flex flex-wrap justify-center gap-2 ${compact ? 'text-xs' : 'text-2xl'}`} data-testid="audience-hints">
              {state.hints.map((h, i) => <span key={i} className="reveal-in rounded-md bg-white/10 px-3 py-1">💡 {h}</span>)}
            </div>
          )}
          {state.answer && (
            <div className={`reveal-in rounded-lg bg-emerald-600 px-8 py-2 font-bold ${compact ? 'text-base' : 'text-5xl'}`} data-testid="audience-answer">{state.answer}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Keeps the previous slide underneath while the new one animates in, so reveals look like the new layer entering. */
function SlideWithTransition({ url, alt, slideKey, transition }: { url: string | null; alt: string; slideKey: string; transition: PublicState['transition'] }) {
  const [prev, setPrev] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current && last.current !== url) setPrev(last.current);
    last.current = url;
    const t = setTimeout(() => setPrev(null), 700);
    return () => clearTimeout(t);
  }, [url]);
  if (!url) return null;
  return (
    <>
      {prev && <img src={prev} alt="" aria-hidden className="absolute inset-0 h-full w-full object-contain" />}
      <img src={url} alt={alt} key={slideKey} className={`absolute inset-0 h-full w-full object-contain qm-anim-${transition}`} data-testid="audience-slide" data-transition={transition} />
    </>
  );
}
