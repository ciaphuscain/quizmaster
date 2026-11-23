import type { Question } from '@/types/schema';
import { createQuestion } from '@/games/registry';
import { emojiLayer, plainDoc, transform, textLayer } from '@/engines/scene/factories';
import { buildCountryQuestion, pickCountries, roundTitle, type GenOptions } from '@/engines/geography/generator';
import { questionsRepo } from '@/db/repositories/questions';
import { quizzesRepo } from '@/db/repositories/other';
import { uid } from '@/utils/id';

const h = (...t: string[]) => t.map((text) => ({ id: uid('h'), text }));

/** Original clue content (written for this app). Movie titles are facts; no third-party assets are used. */
const EMOJI_MOVIES: [string, string[], string, string[]][] = [
  ['Jaws', ['🦈', '🏖️', '🚤', '😱'], '1975', ['Directed by Steven Spielberg', '“You’re gonna need a bigger…”']],
  ['Titanic', ['🚢', '🧊', '💔', '🎻'], '1997', ['Won 11 Oscars', 'An unsinkable ship']],
  ['The Lion King', ['🦁', '👑', '🌅', '🐗'], '1994', ['Animated, set in Africa', 'Hakuna matata']],
  ['Finding Nemo', ['🐠', '🔍', '🌊', '🐢'], '2003', ['A father searches the ocean']],
  ['Jurassic Park', ['🦖', '🏝️', '🧬', '🚙'], '1993', ['Life finds a way']],
];
const BAD_PLOTS: [string, string, string[]][] = [
  ['The Wizard of Oz', 'A young woman kills the first person she meets, then teams up with three strangers to kill again.', ['Somewhere over the rainbow']],
  ['Home Alone', 'A family forgets their child at home, so he spends Christmas running a one-boy home-defence programme.', ['Set at Christmas', 'Two burglars']],
  ['Up', 'A widower ties thousands of balloons to his house rather than move into a retirement home, and a boy scout is too polite to leave.', ['Pixar', 'A talking dog']],
];

function emojiQuestion([title, emojis, year, hints]: (typeof EMOJI_MOVIES)[number], i: number): Question {
  const q = createQuestion('movie-emojis', { correctAnswer: title, title: `Emoji movie: ${title}`, hints: h(...hints), difficulty: i < 2 ? 'easy' : 'medium', points: 10, tags: ['movies', 'demo'], status: 'published' });
  if (q.content.gameType === 'movie-emojis') q.content.year = year;
  const size = 260, gap = 300, x0 = 960 - (gap * (emojis.length - 1)) / 2;
  q.scene.layers.push(...emojis.map((e, k) => { const l = emojiLayer(e, transform(Math.round(x0 + k * gap - size / 2), 440, size, size)); l.revealStep = k; l.animation = 'pop'; return l; }));
  return q;
}

function plotQuestion([title, text, hints]: (typeof BAD_PLOTS)[number]): Question {
  const q = createQuestion('movie-bad-plot', { correctAnswer: title, title: `Bad plot: ${title}`, hints: h(...hints), difficulty: 'medium', points: 10, tags: ['movies', 'demo'], status: 'published' });
  for (const l of q.scene.layers) if (l.kind === 'text' && l.name === 'Plot') { l.doc = plainDoc(text); l.animation = 'fade'; }
  if (q.content.gameType === 'movie-bad-plot') q.content.variants = [{ id: uid('v'), style: 'Technically correct', tone: 'deadpan', doc: plainDoc(text), aiGenerated: false }];
  return q;
}

function searchQuestion(): Question {
  const q = createQuestion('movie-search-history', { correctAnswer: 'Jurassic Park', title: 'Search history: Jurassic Park', hints: h('Set on an island theme park', '1993'), difficulty: 'medium', points: 15, tags: ['movies', 'demo'], status: 'published' });
  const sl = q.scene.layers.find((l) => l.kind === 'search');
  const items = ['how to clone an extinct animal', 'is amber edible', 'island theme park insurance quote', 'why is the water glass vibrating', 'can raptors open doors', 'how to restart park systems manually', 'helicopter tours leaving TODAY'];
  if (sl?.kind === 'search') sl.entries = items.map((text, i) => ({ id: uid('se'), text, date: 'Fri', time: `${21 + Math.floor(i / 3)}:${String((i * 13) % 60).padStart(2, '0')}`, revealStep: i }));
  if (q.content.gameType === 'movie-search-history') q.content.persona = 'The park owner';
  return q;
}

function perspectiveQuestion(): Question {
  const q = createQuestion('movie-perspective', { correctAnswer: 'Cast Away', title: 'Perspective: Cast Away', hints: h('Tom Hanks', 'A delivery company'), difficulty: 'hard', points: 15, tags: ['movies', 'demo'], status: 'published' });
  if (q.content.gameType === 'movie-perspective') { q.content.narrator = 'A volleyball'; q.content.perspective = 'object'; q.content.tone = 'dramatic'; }
  const paras = ['I was supposed to be a gift. Instead, I washed up on a beach with a stranger who had nobody else to talk to.', 'He gave me a face — painted it with his own hand — and a name. For four years I listened to every plan, every argument.', 'Then came the raft, and the storm, and the waves. I drifted away while he shouted my name across the sea.'];
  q.scene.layers = q.scene.layers.filter((l) => !(l.kind === 'text' && l.name.startsWith('Narration')));
  paras.forEach((p, i) => { const t = textLayer(p, transform(220, 210 + i * 270, 1480, 250), { fontSize: 42, italic: true, align: 'left', background: 'rgba(255,255,255,0.06)', padding: 36, radius: 24 }, i ? `Narration ${i + 1}` : 'Narration'); t.revealStep = i; t.animation = 'slide-up'; q.scene.layers.push(t); });
  return q;
}

/** Builds a complete, presentable demo quiz with 7 rounds across 7 game modes. Returns the quiz id. */
export async function buildDemoQuiz(seed = Date.now() % 1e6): Promise<{ quizId: string; questions: Question[] }> {
  const quiz = await quizzesRepo.create('Demo Quiz Night');
  await quizzesRepo.update(quiz.id, { description: 'Generated sample quiz — edit anything, or delete it when you are done exploring.' });
  const firstRound = (await quizzesRepo.tree(quiz.id))!.rounds[0];
  const all: Question[] = [];
  const used: string[] = [];
  const geo = (o: Omit<GenOptions, 'seed' | 'sovereignOnly' | 'exclude'>, k: number) => {
    const picks = pickCountries({ ...o, sovereignOnly: true, seed: seed + k, exclude: used });
    picks.forEach((p) => used.push(p.country.iso3));
    return picks.map((p) => ({ ...buildCountryQuestion(p.country, p.mode, p.difficulty), status: 'published' as const, tags: ['geography', 'demo'] }));
  };
  const rounds: [string, string, Question[], Partial<{ multiplier: number; negative: boolean; bonus: number }>][] = [
    [roundTitle({ mode: 'country-flag', region: 'Europe', difficulty: 'easy' }), 'Warm-up: name the country from its flag.', geo({ mode: 'country-flag', region: 'Europe', difficulty: 'easy', count: 5 }, 1), {}],
    ['Outlines of the World', 'Real Natural Earth outlines. Islands count!', geo({ mode: 'country-border', region: 'all', difficulty: 'mixed', count: 4 }, 2), { bonus: 2 }],
    ['Who’s Missing?', 'Name the hidden country from its neighbours.', geo({ mode: 'country-neighbors', region: 'all', difficulty: 'mixed', count: 4 }, 3), { multiplier: 1.5 }],
    ['Emoji Cinema', 'Emojis appear one by one — guess early!', EMOJI_MOVIES.map(emojiQuestion), {}],
    ['Terrible Plot Summaries', 'Technically accurate. Deeply unfair.', BAD_PLOTS.map(plotQuestion), { negative: true }],
    ['Search History', 'Whose browser is this?', [searchQuestion()], { multiplier: 2 }],
    ['Another Perspective', 'A familiar film from an unfamiliar narrator.', [perspectiveQuestion()], { multiplier: 2 }],
  ];
  for (const [i, [title, subtitle, qs, sc]] of rounds.entries()) {
    for (const q of qs) await questionsRepo.create(q);
    all.push(...qs);
    const r = i === 0 ? firstRound : await quizzesRepo.addRound(quiz.id, title);
    await quizzesRepo.updateRound(r.id, { title, description: subtitle, transition: { show: true, subtitle }, scoring: { pointsMultiplier: sc.multiplier ?? 1, negativeMarking: !!sc.negative, bonusFirstCorrect: sc.bonus ?? 0 } });
    await quizzesRepo.addQuestions(r.id, qs.map((q) => q.id));
  }
  return { quizId: quiz.id, questions: all };
}
