import type { Question, Quiz, Round } from '@/types/schema';
import { maxRevealStep } from '@/engines/scene/factories';

export type Slide =
  | { kind: 'transition'; round: Round; roundIndex: number }
  | { kind: 'question'; questionId: string; round: Round | null; roundIndex: number; number: number; numberInRound: number; totalInRound: number };

export type HostState = {
  slideIndex: number;
  step: number;
  answerRevealed: boolean;
  hintsRevealed: number;
  timer: { duration: number; remaining: number; endsAt: number | null };
  audioPlaying: boolean;
  ended: boolean;
};

export const initialHostState = (): HostState => ({ slideIndex: 0, step: 0, answerRevealed: false, hintsRevealed: 0, timer: { duration: 0, remaining: 0, endsAt: null }, audioPlaying: false, ended: false });

/** What the audience is allowed to know. Built only from revealed information. */
export type PublicState = {
  kind: 'question' | 'transition' | 'end' | 'waiting';
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
};

export function buildSlides(rounds: (Round & { refs: { questionId: string }[] })[], showTransitions: boolean): Slide[] {
  const slides: Slide[] = [];
  let n = 0;
  rounds.forEach((r, ri) => {
    if (!r.refs.length) return;
    if (showTransitions && r.transition.show) slides.push({ kind: 'transition', round: r, roundIndex: ri });
    r.refs.forEach((ref, i) => slides.push({ kind: 'question', questionId: ref.questionId, round: r, roundIndex: ri, number: ++n, numberInRound: i + 1, totalInRound: r.refs.length }));
  });
  return slides;
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
export function buildPublicState(quiz: Pick<Quiz, 'title' | 'theme' | 'settings'> | null, slide: Slide | undefined, q: Question | undefined, s: HostState): PublicState {
  const base: PublicState = {
    kind: 'waiting', quizTitle: quiz?.title ?? '', accent: quiz?.theme.accent ?? '#f59e0b', background: quiz?.theme.background ?? '#0f172a',
    roundTitle: '', roundSubtitle: '', questionNumber: null, questionTotal: null, prompt: '', slideKey: '', hints: [], answer: null, acceptedAnswers: [],
    timer: s.timer, audioPlaying: s.audioPlaying, showNumbers: quiz?.settings.showQuestionNumbers ?? true,
  };
  if (s.ended) return { ...base, kind: 'end' };
  if (!slide) return base;
  if (slide.kind === 'transition') return { ...base, kind: 'transition', roundTitle: slide.round.title, roundSubtitle: slide.round.transition.subtitle || slide.round.description, slideKey: `t-${slide.round.id}` };
  if (!q) return base;
  return {
    ...base,
    kind: 'question',
    roundTitle: slide.round?.title ?? '',
    questionNumber: slide.numberInRound,
    questionTotal: slide.totalInRound,
    prompt: q.prompt,
    slideKey: `${q.id}:${q.version}:${s.step}:${s.answerRevealed}`,
    hints: q.hints.slice(0, s.hintsRevealed).map((h) => h.text),
    answer: s.answerRevealed ? q.correctAnswer : null,
    acceptedAnswers: s.answerRevealed ? q.acceptedAnswers : [],
  };
}

/** "Space" behaviour: next reveal step → reveal answer → next slide. */
export function nextAction(s: HostState, slide: Slide | undefined, q: Question | undefined, slideCount: number): HostState {
  if (slide?.kind === 'question' && q) {
    if (s.step < stepsFor(q)) return { ...s, step: s.step + 1 };
    if (!s.answerRevealed) return { ...s, answerRevealed: true, timer: { ...s.timer, endsAt: null } };
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
