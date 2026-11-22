import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Play, Pause, RotateCcw, Lightbulb, CheckCircle2, SkipForward, MonitorUp, Maximize, Square, Volume2, VolumeX, LogOut } from 'lucide-react';
import { db } from '@/db/database';
import { quizzesRepo, type QuizTree } from '@/db/repositories/other';
import type { Question } from '@/types/schema';
import { Button, Kbd } from '@/components/ui/primitives';
import { useSettings, type ShortcutAction } from '@/stores/settings';
import { renderSceneToCanvas, canvasToBlob } from '@/engines/rendering/renderScene';
import { clipToWavBlob } from '@/engines/audio/clip';
import { isTypingTarget, cn } from '@/utils/misc';
import { GameIcon } from '@/components/common/GameIcon';
import { ScenePreview } from '@/features/templates/TemplatePreview';
import { AudienceDisplay } from './AudienceDisplay';
import { buildPublicState, buildSlides, CHANNEL, effectiveTimeLimit, gotoSlide, initialHostState, nextAction, remainingSeconds, stepsFor, type ChannelMsg, type HostState, type Slide } from './model';

function beep() {
  try {
    const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; g.gain.setValueAtTime(0.2, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.8);
  } catch { /* audio unavailable */ }
}

export default function HostView() {
  const { quizId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const single = quizId === 'single' ? params.get('question') : null;
  const shortcuts = useSettings((s) => s.settings.shortcuts);
  const [tree, setTree] = useState<QuizTree | null | undefined>(undefined);
  const [questions, setQuestions] = useState<Map<string, Question>>(new Map());
  const [s, setS] = useState<HostState>(initialHostState);
  const [slideUrl, setSlideUrl] = useState<string | null>(null);
  const [audienceMode, setAudienceMode] = useState(false);
  const [audiences, setAudiences] = useState<Map<string, number>>(new Map());
  const [now, setNow] = useState(Date.now());
  const channel = useRef<BroadcastChannel | null>(null);
  const lastPublic = useRef<ChannelMsg | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // load data
  useEffect(() => {
    (async () => {
      if (single) {
        const q = await db.questions.get(single);
        if (!q) { setTree(null); return; }
        setQuestions(new Map([[q.id, q]]));
        setTree({ quiz: { id: 'single', title: q.title || q.correctAnswer || 'Preview', description: '', theme: { accent: '#f59e0b', background: '#0f172a', font: 'Inter' }, settings: { showQuestionNumbers: false, autoStartTimer: false, showRoundTransitions: false }, createdAt: 0, updatedAt: 0 },
          rounds: [{ id: 'r', quizId: 'single', order: 0, title: 'Preview', description: '', scoring: { pointsMultiplier: 1, negativeMarking: false, bonusFirstCorrect: 0 }, defaultTimeLimit: 0, transition: { show: false, subtitle: '' }, refs: [{ id: 'x', quizId: 'single', roundId: 'r', questionId: q.id, order: 0 }] }] });
        return;
      }
      const t = await quizzesRepo.tree(quizId!);
      setTree(t ?? null);
      if (t) {
        const ids = [...new Set(t.rounds.flatMap((r) => r.refs.map((x) => x.questionId)))];
        const qs = (await db.questions.bulkGet(ids)).filter((q): q is Question => !!q);
        setQuestions(new Map(qs.map((q) => [q.id, q])));
      }
    })();
  }, [quizId, single]);

  const slides: Slide[] = useMemo(() => (tree ? buildSlides(tree.rounds, tree.quiz.settings.showRoundTransitions) : []), [tree]);
  const slide = slides[s.slideIndex];
  const q = slide?.kind === 'question' ? questions.get(slide.questionId) : undefined;
  const publicState = useMemo(() => buildPublicState(tree?.quiz ?? null, slide, q, s), [tree, slide, q, s]);

  // timer setup when slide changes
  useEffect(() => {
    if (slide?.kind !== 'question') return;
    const d = effectiveTimeLimit(q, slide.round);
    setS((p) => ({ ...p, timer: { duration: d, remaining: d, endsAt: tree?.quiz.settings.autoStartTimer && d ? Date.now() + d * 1000 : null } }));
    stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.slideIndex, q?.id]);

  // timer tick + expiry
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      setS((p) => (p.timer.endsAt && Date.now() >= p.timer.endsAt ? (beep(), { ...p, timer: { ...p.timer, remaining: 0, endsAt: null } }) : p));
    }, 200);
    return () => clearInterval(t);
  }, []);

  // channel
  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL);
    channel.current = ch;
    ch.onmessage = (e: MessageEvent<ChannelMsg>) => {
      const m = e.data;
      if (m.type === 'hello' || m.type === 'pong') {
        setAudiences((a) => new Map(a).set(m.id, Date.now()));
        if (m.type === 'hello' && lastPublic.current) ch.postMessage(lastPublic.current);
      }
    };
    const ping = setInterval(() => {
      ch.postMessage({ type: 'ping' } satisfies ChannelMsg);
      setAudiences((a) => new Map([...a].filter(([, t]) => Date.now() - t < 7000)));
    }, 2000);
    const bye = () => ch.postMessage({ type: 'bye' } satisfies ChannelMsg);
    window.addEventListener('beforeunload', bye);
    return () => { clearInterval(ping); bye(); window.removeEventListener('beforeunload', bye); ch.close(); };
  }, []);

  // render public slide image and broadcast public state
  useEffect(() => {
    let alive = true;
    (async () => {
      let blob: Blob | null = null;
      if (publicState.kind === 'question' && q) {
        const c = await renderSceneToCanvas(q.scene, { revealStep: s.step, answerRevealed: s.answerRevealed }, 1920);
        blob = await canvasToBlob(c);
      }
      if (!alive) return;
      const msg: ChannelMsg = { type: 'state', state: publicState, slide: blob };
      lastPublic.current = msg;
      channel.current?.postMessage(msg);
      setSlideUrl((old) => { if (old) setTimeout(() => URL.revokeObjectURL(old), 2000); return blob ? URL.createObjectURL(blob) : null; });
    })();
    return () => { alive = false; };
    // re-render image only when the visual state changes; timer/audio changes are sent below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicState.slideKey, publicState.kind, publicState.hints.length, publicState.answer]);
  useEffect(() => {
    if (!lastPublic.current || lastPublic.current.type !== 'state') return;
    const msg: ChannelMsg = { ...lastPublic.current, state: { ...lastPublic.current.state, timer: s.timer, audioPlaying: s.audioPlaying } };
    lastPublic.current = msg;
    channel.current?.postMessage(msg);
  }, [s.timer, s.audioPlaying]);

  const stopAudio = () => { audio.current?.pause(); audio.current = null; setS((p) => ({ ...p, audioPlaying: false })); };
  const toggleAudio = useCallback(async () => {
    if (audio.current) { stopAudio(); return; }
    if (!q?.audio) return;
    const url = URL.createObjectURL(await clipToWavBlob(q.audio));
    const a = new Audio(url);
    a.onended = () => { audio.current = null; setS((p) => ({ ...p, audioPlaying: false })); URL.revokeObjectURL(url); };
    audio.current = a; await a.play(); setS((p) => ({ ...p, audioPlaying: true }));
  }, [q]);

  const toggleTimer = () => setS((p) => {
    const t = p.timer;
    if (!t.duration) return p;
    if (t.endsAt) return { ...p, timer: { ...t, remaining: remainingSeconds(t), endsAt: null } };
    const rem = t.remaining > 0 ? t.remaining : t.duration;
    return { ...p, timer: { ...t, remaining: rem, endsAt: Date.now() + rem * 1000 } };
  });
  const resetTimer = () => setS((p) => ({ ...p, timer: { ...p.timer, remaining: p.timer.duration, endsAt: null } }));
  const actions: Record<ShortcutAction, () => void> = {
    nextAction: () => setS((p) => nextAction(p, slide, q, slides.length)),
    nextQuestion: () => setS((p) => gotoSlide(p, p.slideIndex + 1, slides.length)),
    prevQuestion: () => setS((p) => gotoSlide(p, p.slideIndex - 1, slides.length)),
    revealAnswer: () => setS((p) => ({ ...p, answerRevealed: true, timer: { ...p.timer, remaining: remainingSeconds(p.timer), endsAt: null } })),
    revealHint: () => setS((p) => ({ ...p, hintsRevealed: Math.min(q?.hints.length ?? 0, p.hintsRevealed + 1) })),
    toggleTimer,
    fullscreen: () => { setAudienceMode(true); void stageRef.current?.requestFullscreen?.(); },
    playAudio: () => void toggleAudio(),
  };
  const actionsRef = useRef(actions); actionsRef.current = actions;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { setAudienceMode(false); return; }
      const entry = (Object.entries(shortcuts) as [ShortcutAction, string][]).find(([, k]) => k.toLowerCase() === e.key.toLowerCase());
      if (entry) { e.preventDefault(); actionsRef.current[entry[0]](); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [shortcuts]);
  useEffect(() => { const h = () => { if (!document.fullscreenElement) setAudienceMode(false); }; document.addEventListener('fullscreenchange', h); return () => document.removeEventListener('fullscreenchange', h); }, []);

  if (tree === undefined) return <div className="flex h-full items-center justify-center text-muted">Loading presentation…</div>;
  if (tree === null || !slides.length) return <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">This quiz has no questions to present.<Button onClick={() => navigate('/quizzes')}>Back</Button></div>;

  const steps = stepsFor(q);
  const rem = remainingSeconds(s.timer, now);
  const nextSlide = slides[s.slideIndex + 1];
  const nextQ = nextSlide?.kind === 'question' ? questions.get(nextSlide.questionId) : undefined;

  return (
    <div className="flex h-full flex-col bg-bg" data-testid="host-view">
      <div ref={stageRef} className={cn(audienceMode ? 'fixed inset-0 z-50 bg-black' : 'hidden')}>
        <AudienceDisplay state={publicState} slideUrl={slideUrl} />
      </div>
      <header className="flex items-center gap-2 border-b border-line bg-panel px-4 py-2">
        <div className="text-sm font-semibold">{tree.quiz.title}</div>
        <span className="text-xs text-muted">Slide {Math.min(s.slideIndex + 1, slides.length)} / {slides.length}</span>
        <span className={cn('ml-2 rounded px-2 py-0.5 text-[11px]', audiences.size ? 'bg-success/20 text-success' : 'bg-panel-3 text-muted')} data-testid="audience-count">{audiences.size ? `${audiences.size} audience window(s) connected` : 'No audience window'}</span>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="outline" onClick={() => window.open('/audience', 'quizmaster-audience', 'popup,width=1280,height=720')} data-testid="open-audience"><MonitorUp size={13} />Open audience window</Button>
          <Button size="sm" variant="outline" onClick={actions.fullscreen}><Maximize size={13} />Present here (F)</Button>
          <Button size="sm" variant="ghost" onClick={() => setS((p) => ({ ...p, ended: true }))} data-testid="end-presentation"><Square size={13} />End</Button>
          <Button size="sm" variant="ghost" onClick={() => (window.opener ? window.close() : navigate(single ? `/edit/${single}` : `/quizzes/${quizId}`))}><LogOut size={13} />Exit</Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted">Audience sees</div>
          <div className="aspect-video w-full max-w-5xl overflow-hidden rounded-lg border border-line" data-testid="host-audience-preview">
            <AudienceDisplay state={publicState} slideUrl={slideUrl} compact />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button variant="outline" onClick={actions.prevQuestion} disabled={s.slideIndex === 0}><ChevronLeft size={14} />Previous</Button>
            <Button variant="primary" onClick={actions.nextAction} data-testid="next-action"><ChevronRight size={14} />{slide?.kind === 'question' && s.step < steps ? `Reveal step ${s.step + 1}/${steps}` : slide?.kind === 'question' && !s.answerRevealed ? 'Reveal answer' : 'Next'} <Kbd>Space</Kbd></Button>
            <Button variant="outline" onClick={actions.revealHint} disabled={!q || s.hintsRevealed >= (q?.hints.length ?? 0)} data-testid="reveal-hint"><Lightbulb size={14} />Hint ({s.hintsRevealed}/{q?.hints.length ?? 0})</Button>
            <Button variant="outline" onClick={actions.revealAnswer} disabled={!q || s.answerRevealed} data-testid="reveal-answer"><CheckCircle2 size={14} />Reveal answer</Button>
            <Button variant="outline" onClick={actions.nextQuestion}><SkipForward size={14} />Skip</Button>
            {q?.audio && <Button variant="outline" onClick={actions.playAudio} data-testid="play-audio">{s.audioPlaying ? <VolumeX size={14} /> : <Volume2 size={14} />}{s.audioPlaying ? 'Stop audio' : 'Play audio'}</Button>}
            {s.timer.duration > 0 && <>
              <Button variant="outline" onClick={toggleTimer} data-testid="toggle-timer">{s.timer.endsAt ? <Pause size={14} /> : <Play size={14} />}{s.timer.endsAt ? 'Pause' : rem < s.timer.duration && rem > 0 ? 'Resume' : 'Start'} timer</Button>
              <Button variant="ghost" onClick={resetTimer}><RotateCcw size={14} />Reset</Button>
              <span className="font-mono text-lg tabular-nums" data-testid="host-timer">{Math.ceil(rem)}s</span>
            </>}
          </div>
          <div className="text-[11px] text-muted">
            Shortcuts: {(Object.entries(shortcuts) as [ShortcutAction, string][]).map(([a, k]) => <span key={a} className="mr-2"><Kbd>{k === ' ' ? 'Space' : k}</Kbd> {a.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>)} <Kbd>Esc</Kbd> exit fullscreen
          </div>
        </div>
        <aside className="flex w-96 shrink-0 flex-col gap-3 overflow-auto border-l border-line bg-panel p-4 text-xs">
          {q ? (
            <>
              <div className="rounded-md border border-success/40 bg-success/10 p-3">
                <div className="text-[10px] uppercase tracking-wide text-success">Correct answer (host only)</div>
                <div className="text-lg font-bold" data-testid="host-answer">{q.correctAnswer || '—'}</div>
                {q.acceptedAnswers.length > 0 && <div className="text-muted">Also accept: {q.acceptedAnswers.join(', ')}</div>}
                <div className="mt-1 text-muted">{Math.round(q.points * (slide?.kind === 'question' && slide.round ? slide.round.scoring.pointsMultiplier : 1))} points{slide?.kind === 'question' && slide.round?.scoring.negativeMarking ? ' · negative marking' : ''}{slide?.kind === 'question' && slide.round?.scoring.bonusFirstCorrect ? ` · +${slide.round.scoring.bonusFirstCorrect} first correct` : ''}</div>
              </div>
              {q.hints.length > 0 && <div><div className="mb-1 font-semibold text-muted">Hints</div><ol className="list-decimal pl-4">{q.hints.map((h, i) => <li key={h.id} className={i < s.hintsRevealed ? 'text-muted line-through' : ''}>{h.text}</li>)}</ol></div>}
              {q.notes && <div><div className="mb-1 font-semibold text-muted">Notes</div><p className="whitespace-pre-wrap">{q.notes}</p></div>}
              {steps > 0 && <div className="text-muted">Reveal step {s.step} of {steps}</div>}
            </>
          ) : slide?.kind === 'transition' ? <div className="text-muted">Round transition: <b className="text-fg">{slide.round.title}</b></div> : <div className="text-muted">Presentation ended.</div>}
          <div>
            <div className="mb-1 font-semibold text-muted">Up next</div>
            {nextSlide ? (nextQ ? <div className="flex flex-col gap-1"><ScenePreview scene={nextQ.scene} width={340} revealStep={0} /><span>{nextQ.prompt} — <span className="text-muted">{nextQ.correctAnswer}</span></span></div> : <span>Round: {nextSlide.kind === 'transition' ? nextSlide.round.title : ''}</span>) : <span className="text-muted">End of quiz</span>}
          </div>
          <div>
            <div className="mb-1 font-semibold text-muted">Jump to</div>
            <ol className="flex flex-col">
              {slides.map((sl, i) => {
                const sq = sl.kind === 'question' ? questions.get(sl.questionId) : undefined;
                return (
                  <li key={i}><button onClick={() => setS((p) => gotoSlide(p, i, slides.length))} className={cn('flex w-full items-center gap-1.5 rounded px-2 py-1 text-left hover:bg-panel-2', i === s.slideIndex && 'bg-accent/15')}>
                    {sl.kind === 'transition' ? <span className="font-semibold">▸ {sl.round.title}</span> : <>{sq && <GameIcon type={sq.gameType} size={11} />}<span className="w-6 text-muted">{sl.number}.</span><span className="truncate">{sq?.title || sq?.correctAnswer || 'Missing question'}</span></>}
                  </button></li>
                );
              })}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
