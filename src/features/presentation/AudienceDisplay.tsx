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
  if (state.kind === 'leaderboard' && state.leaderboard) {
    return state.final ? <Podium state={state} compact={compact} /> : <Leaderboard state={state} compact={compact} />;
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
        {showTimer && <CountdownRing remaining={rem} duration={state.timer.duration} running={!!state.timer.endsAt} accent={state.accent} size={compact ? 28 : 64} />}
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

function fmt(rem: number) {
  const c = Math.ceil(rem);
  return c >= 60 ? `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}` : String(c);
}

/** Circular countdown: the ring drains smoothly, turns amber at 25% and red/pulsing for the last 5 seconds. */
export function CountdownRing({ remaining, duration, running, accent, size }: { remaining: number; duration: number; running: boolean; accent: string; size: number }) {
  const frac = duration ? Math.max(0, Math.min(1, remaining / duration)) : 0;
  const r = 44, c = 2 * Math.PI * r;
  const urgent = remaining <= 5 && remaining > 0 && running;
  const color = remaining <= 0 ? '#ef4444' : urgent ? '#ef4444' : frac <= 0.25 ? '#f59e0b' : accent;
  return (
    <div className={`relative ml-auto flex items-center justify-center ${urgent ? 'animate-pulse' : ''}`} style={{ width: size, height: size }} data-testid="audience-timer" role="timer" aria-label={remaining <= 0 ? "Time's up" : `${Math.ceil(remaining)} seconds left`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
        <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset 200ms linear, stroke 300ms' }} />
      </svg>
      <span className="relative font-mono font-bold tabular-nums" style={{ fontSize: size * (remaining <= 0 ? 0.2 : 0.34) }}>{remaining <= 0 ? "Time's up!" : fmt(remaining)}</span>
    </div>
  );
}

function Leaderboard({ state, compact }: { state: PublicState; compact?: boolean }) {
  const rows = state.leaderboard ?? [];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.score)));
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-[8%]" style={{ background: state.background }} data-testid="audience-leaderboard">
      <div className={`${compact ? 'text-lg' : 'text-5xl'} font-bold`} style={{ color: state.accent }}>Leaderboard</div>
      <ol className="flex w-full max-w-5xl flex-col gap-2">
        {rows.slice(0, 10).map((r, i) => (
          <li key={r.name} className="flex items-center gap-3 reveal-in" style={{ animationDelay: `${i * 80}ms` }}>
            <span className={`${compact ? 'w-5 text-xs' : 'w-12 text-3xl'} text-right font-bold text-white/60`}>{r.rank}</span>
            <div className={`relative flex-1 overflow-hidden rounded-lg bg-white/5 ${compact ? 'h-5' : 'h-14'}`}>
              <div className="absolute inset-y-0 left-0 rounded-lg transition-[width] duration-700 ease-out" style={{ width: `${Math.max(4, (Math.max(0, r.score) / max) * 100)}%`, background: r.color }} />
              <span className={`relative flex h-full items-center px-4 font-semibold text-white drop-shadow ${compact ? 'text-xs' : 'text-2xl'}`}>{r.name}</span>
            </div>
            <span className={`${compact ? 'w-10 text-xs' : 'w-24 text-3xl'} text-right font-bold tabular-nums text-white`}>{r.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Podium({ state, compact }: { state: PublicState; compact?: boolean }) {
  const rows = state.leaderboard ?? [];
  const top = [rows.find((r) => r.rank === 2) ?? rows[1], rows[0], rows.find((r) => r.rank === 3) ?? rows[2]];
  const heightFor = (rank: number) => (rank === 1 ? '82%' : rank === 2 ? '62%' : '46%');
  const medal = (rank: number) => ['🥇', '🥈', '🥉'][rank - 1] ?? '🏅';
  const winners = rows.filter((r) => r.rank === 1);
  const headline = !rows.length ? 'Final scores' : winners.length > 1 ? `${winners.map((w) => w.name).join(' & ')} tie for first!` : `${winners[0].name} wins!`;
  return (
    <div className="relative flex h-full w-full flex-col items-center overflow-hidden" style={{ background: state.background }} data-testid="audience-podium">
      {!compact && <Confetti />}
      <div className={`${compact ? 'mt-2 text-lg' : 'mt-8 text-6xl'} relative z-10 font-bold`} style={{ color: state.accent }}>{headline}</div>
      <div className="relative z-10 flex w-full max-w-4xl flex-1 items-end justify-center gap-[3%] px-[6%] pb-[4%]">
        {top.map((r, i) => r && (
          <div key={r.name} className="flex w-1/3 flex-col items-center justify-end qm-anim-slide-up" style={{ height: heightFor(r.rank), animationDelay: `${[400, 900, 0][i]}ms` }}>
            <div className={compact ? 'text-base' : 'text-6xl'}>{medal(r.rank)}</div>
            <div className={`${compact ? 'text-xs' : 'text-3xl'} truncate font-bold text-white`}>{r.name}</div>
            <div className={`${compact ? 'text-xs' : 'text-2xl'} mb-1 tabular-nums text-white/80`}>{r.score} pts</div>
            <div className="w-full flex-1 rounded-t-xl" style={{ background: `linear-gradient(to bottom, ${r.color}, ${r.color}88)` }} />
          </div>
        ))}
      </div>
      {rows.length > 3 && !compact && <div className="relative z-10 mb-4 text-lg text-white/70">{rows.slice(3, 10).map((r) => `${r.rank}. ${r.name} (${r.score})`).join('   ·   ')}</div>}
    </div>
  );
}

/** Lightweight canvas confetti (respects reduced motion). */
function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion')) return;
    const c = ref.current!; const ctx = c.getContext('2d')!;
    const resize = () => { c.width = c.clientWidth; c.height = c.clientHeight; };
    resize();
    const colors = ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#ffffff'];
    const parts = Array.from({ length: 220 }, () => ({ x: Math.random() * c.width, y: -Math.random() * c.height, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, color: colors[Math.floor(Math.random() * colors.length)] }));
    let raf = 0; const start = performance.now();
    const tick = (t: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      const fade = Math.max(0, 1 - (t - start - 6000) / 2000);
      ctx.globalAlpha = fade;
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vx += Math.sin(t / 600 + p.y / 80) * 0.02;
        if (p.y > c.height + 20 && t - start < 5000) { p.y = -20; p.x = Math.random() * c.width; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      }
      if (fade > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}
