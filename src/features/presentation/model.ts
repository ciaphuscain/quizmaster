import type { Animation, AnswerReveal, Question, Quiz, Round } from '@/types/schema';
import { maxRevealStep } from '@/engines/scene/factories';

/**
 * phase 'ask'    — the question is asked; its answer may only be revealed if `answerable` (reveal mode "each").
 * phase 'review' — the answer run-through after a round or the whole quiz: full question shown, answer revealable.
 */
export type Slide =
  | { kind: 'transition'; round: Round; roundIndex: number; review?: boolean }
  | { kind: 'question'; questionId: string; round: Round | null; roundIndex: number; number: number; numberInRound: number; totalInRound: number; phase: 'ask' | 'review'; answerable: boolean };

export type HostState = {
  slideIndex: number;
  step: number;
  answerRevealed: boolean;
  hintsRevealed: number;
  timer: { duration: number; remaining: number; endsAt: number | null };
  audioPlaying: boolean;
  ended: boolean;
  showLeaderboard: boolean;
};

export const initialHostState = (): HostState => ({ slideIndex: 0, step: 0, answerRevealed: false, hintsRevealed: 0, timer: { duration: 0, remaining: 0, endsAt: null }, audioPlaying: false, ended: false, showLeaderboard: false });

/** What the audience is allowed to know. Built only from revealed information. */
export type PublicState = {
  kind: 'question' | 'transition' | 'end' | 'waiting' | 'leaderboard';
  /** 'review' while running through answers at the end of a round / the quiz */
  phase: 'ask' | 'review';
  quizTitle: string;
  accent: string;
  background: string;
  roundTitle: string;
  roundSubtitle: string;
  questionNumber: number | null;
  questionTotal: number | null;
  prompt: string;
  slideKey: string;
  hints: string[];
  answer: string | null;
  acceptedAnswers: string[];
  timer: { duration: number; remaining: number; endsAt: number | null };
  audioPlaying: boolean;
  showNumbers: boolean;
  /** how the new slide image enters (from the animation of the layers just revealed) */
  transition: Animation;
  /** team standings — only names, colours and scores */
  leaderboard: { name: string; color: string; score: number; rank: number }[] | null;
  final: boolean;
};

export function buildSlides(rounds: (Round & { refs: { questionId: string }[] })[], showTransitions: boolean, reveal: AnswerReveal = 'each'): Slide[] {
  const slides: Slide[] = [];
  const asked: { r: Round; ri: number; refs: { questionId: string; number: number }[] }[] = [];
  let n = 0;
  const answers = (r: Round, ri: number, refs: { questionId: string; number: number }[]) => {
    slides.push({ kind: 'transition', round: r, roundIndex: ri, review: true });
    refs.forEach((ref, i) => slides.push({ kind: 'question', questionId: ref.questionId, round: r, roundIndex: ri, number: ref.number, numberInRound: i + 1, totalInRound: refs.length, phase: 'review', answerable: true }));
  };
  rounds.forEach((r, ri) => {
    if (!r.refs.length) return;
    if (showTransitions && r.transition.show) slides.push({ kind: 'transition', round: r, roundIndex: ri });
    const refs = r.refs.map((ref) => ({ questionId: ref.questionId, number: ++n }));
    refs.forEach((ref, i) => slides.push({ kind: 'question', questionId: ref.questionId, round: r, roundIndex: ri, number: ref.number, numberInRound: i + 1, totalInRound: refs.length, phase: 'ask', answerable: reveal === 'each' }));
    if (reveal === 'round') answers(r, ri, refs);
    else asked.push({ r, ri, refs });
  });
  if (reveal === 'quiz') for (const a of asked) answers(a.r, a.ri, a.refs);
  return slides;
}

/** Review slides show every reveal step at once (the question was already asked). */
export function effectiveStep(slide: Slide | undefined, s: HostState): number {
  return slide?.kind === 'question' && slide.phase === 'review' ? Infinity : s.step;
}

/** Whether the answer for the current slide may be revealed now. */
export function canRevealAnswer(slide: Slide | undefined): boolean {
  return slide?.kind === 'question' && slide.answerable;
}

export function effectiveTimeLimit(q: Question | undefined, round: Round | null): number {
  if (!q) return 0;
  return q.timeLimit || round?.defaultTimeLimit || 0;
}

export function stepsFor(q: Question | undefined): number { return q ? maxRevealStep(q.scene) : 0; }

/**
 * Builds the audience-facing state. The correct answer, accepted answers, notes and unrevealed hints are
 * never included unless revealed — this object is the only thing sent to the audience window.
 */
export function buildPublicState(quiz: Pick<Quiz, 'title' | 'theme' | 'settings'> | null, slide: Slide | undefined, q: Question | undefined, s: HostState, board: { name: string; color: string; score: number; rank: number }[] = []): PublicState {
  const base: PublicState = {
    kind: 'waiting', quizTitle: quiz?.title ?? '', accent: quiz?.theme.accent ?? '#f59e0b', background: quiz?.theme.background ?? '#0f172a',
    roundTitle: '', roundSubtitle: '', questionNumber: null, questionTotal: null, prompt: '', slideKey: '', hints: [], answer: null, acceptedAnswers: [],
    timer: s.timer, audioPlaying: s.audioPlaying, showNumbers: quiz?.settings.showQuestionNumbers ?? true, transition: 'fade', leaderboard: null, final: false, phase: 'ask',
  };
  const lb = board.map(({ name, color, score, rank }) => ({ name, color, score, rank }));
  if (s.ended) return lb.length ? { ...base, kind: 'leaderboard', leaderboard: lb, final: true, slideKey: 'final' } : { ...base, kind: 'end' };
  if (s.showLeaderboard && lb.length) return { ...base, kind: 'leaderboard', leaderboard: lb, slideKey: `lb-${lb.map((x) => x.score).join(',')}` };
  if (!slide) return base;
  if (slide.kind === 'transition') {
    if (slide.review) return { ...base, kind: 'transition', phase: 'review', roundTitle: `${slide.round.title} — Answers`, roundSubtitle: 'Swap papers and get ready to mark!', slideKey: `ta-${slide.round.id}` };
    return { ...base, kind: 'transition', roundTitle: slide.round.title, roundSubtitle: slide.round.transition.subtitle || slide.round.description, slideKey: `t-${slide.round.id}` };
  }
  if (!q) return base;
  // Answers are withheld on "ask" slides when the quiz reveals answers later — even if the host state says otherwise.
  const revealed = s.answerRevealed && slide.answerable;
  const step = effectiveStep(slide, s);
  return {
    ...base,
    kind: 'question',
    phase: slide.phase,
    roundTitle: slide.round?.title ?? '',
    questionNumber: slide.numberInRound,
    questionTotal: slide.totalInRound,
    prompt: q.prompt,
    slideKey: `${slide.phase}:${q.id}:${q.version}:${step}:${revealed}`,
    hints: q.hints.slice(0, s.hintsRevealed).map((h) => h.text),
    answer: revealed ? q.correctAnswer : null,
    acceptedAnswers: revealed ? q.acceptedAnswers : [],
    transition: slide.phase === 'review' && !revealed ? 'fade' : revealTransition(q, { ...s, answerRevealed: revealed }),
  };
}

/** "Space" behaviour: next reveal step → reveal answer → next slide. */
export function nextAction(s: HostState, slide: Slide | undefined, q: Question | undefined, slideCount: number): HostState {
  if (slide?.kind === 'question' && q) {
    if (slide.phase === 'ask' && s.step < stepsFor(q)) return { ...s, step: s.step + 1 };
    if (slide.answerable && !s.answerRevealed) return { ...s, answerRevealed: true, timer: { ...s.timer, endsAt: null } };
  }
  return gotoSlide(s, s.slideIndex + 1, slideCount);
}

export function gotoSlide(s: HostState, index: number, slideCount: number): HostState {
  if (index >= slideCount) return { ...s, ended: true };
  return { ...initialHostState(), slideIndex: Math.max(0, index) };
}

export function remainingSeconds(t: HostState['timer'], now = Date.now()): number {
  return t.endsAt ? Math.max(0, (t.endsAt - now) / 1000) : t.remaining;
}

export const CHANNEL = 'quizmaster-presentation';
export type ChannelMsg =
  | { type: 'state'; state: PublicState; slide: Blob | null }
  | { type: 'hello'; id: string }
  | { type: 'ping' }
  | { type: 'pong'; id: string }
  | { type: 'bye' };

/** Animation of the layers revealed by the current step (or answer reveal); defaults to fade. */
export function revealTransition(q: Question, s: HostState): Animation {
  const layers = q.scene.layers.filter((l) => l.visible && (s.answerRevealed ? l.answerOnly : !l.answerOnly && s.step > 0 && l.revealStep === s.step));
  return layers.find((l) => l.animation)?.animation ?? 'fade';
}
