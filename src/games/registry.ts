import type { Content, GameType, Question, Scene } from '@/types/schema';
import {
  countryLayer, dialogueLayer, emojiLayer, emptyScene, imageLayer, searchLayer, shapeLayer, textLayer, transform,
} from '@/engines/scene/factories';
import { uid } from '@/utils/id';

export type GameMeta = {
  type: GameType;
  name: string;
  short: string;
  family: 'Logos' | 'Countries' | 'Silhouettes' | 'Movies' | 'Music';
  icon: string;
  description: string;
  defaultPrompt: string;
  color: string;
};

export const GAMES: Record<GameType, GameMeta> = {
  'logo-normal': { type: 'logo-normal', name: 'Guess the Logo — Normal', short: 'Logo', family: 'Logos', icon: 'BadgeCheck', description: 'Show an unaltered logo and name the brand.', defaultPrompt: 'Name the brand', color: '#3b82f6' },
  'logo-altered': { type: 'logo-altered', name: 'Guess the Logo — Altered', short: 'Altered logo', family: 'Logos', icon: 'Wand2', description: 'Blur, pixelate, crop, rotate and distort a logo through an effect pipeline.', defaultPrompt: 'Name the brand behind this altered logo', color: '#8b5cf6' },
  'country-flag': { type: 'country-flag', name: 'Guess the Country — Flag', short: 'Flag', family: 'Countries', icon: 'Flag', description: 'Identify a country from its flag.', defaultPrompt: 'Which country does this flag belong to?', color: '#ef4444' },
  'country-border': { type: 'country-border', name: 'Guess the Country — Border', short: 'Border', family: 'Countries', icon: 'MapPinned', description: 'Identify a country from its outline.', defaultPrompt: 'Which country has this shape?', color: '#f97316' },
  'country-neighbors': { type: 'country-neighbors', name: 'Guess the Country — Neighbours', short: 'Neighbours', family: 'Countries', icon: 'Map', description: 'Identify a hidden country from the countries around it.', defaultPrompt: 'Which country is hidden here?', color: '#eab308' },
  silhouette: { type: 'silhouette', name: 'Guess the Thing/Person — Silhouette', short: 'Silhouette', family: 'Silhouettes', icon: 'UserRound', description: 'Recognise a person, character, animal or object by its silhouette.', defaultPrompt: 'Who or what is this?', color: '#14b8a6' },
  'movie-emojis': { type: 'movie-emojis', name: 'Guess the Movie — Emojis', short: 'Emojis', family: 'Movies', icon: 'Smile', description: 'Compose emoji clues for a film.', defaultPrompt: 'Which movie do these emojis describe?', color: '#f59e0b' },
  'movie-bad-plot': { type: 'movie-bad-plot', name: 'Guess the Movie — Bad Plot Description', short: 'Bad plot', family: 'Movies', icon: 'ScrollText', description: 'Describe a film’s plot badly but fairly.', defaultPrompt: 'Which movie is this (badly) described?', color: '#ec4899' },
  'movie-dialogue': { type: 'movie-dialogue', name: 'Guess the Movie — Famous Dialogue', short: 'Dialogue', family: 'Movies', icon: 'Quote', description: 'Identify a film from a famous line.', defaultPrompt: 'Which movie is this line from?', color: '#a855f7' },
  'movie-props': { type: 'movie-props', name: 'Guess the Movie — Props Only', short: 'Props', family: 'Movies', icon: 'Shapes', description: 'Identify a film from a set of its props.', defaultPrompt: 'Which movie do these props belong to?', color: '#06b6d4' },
  'movie-search-history': { type: 'movie-search-history', name: 'Guess the Movie — Search History', short: 'Search history', family: 'Movies', icon: 'Search', description: 'A character’s fictional search history as clues.', defaultPrompt: 'Whose search history is this? Name the movie.', color: '#10b981' },
  'movie-perspective': { type: 'movie-perspective', name: 'Guess the Movie — Another Perspective', short: 'Perspective', family: 'Movies', icon: 'Eye', description: 'Retell a film from an unexpected character’s point of view.', defaultPrompt: 'Which movie is being described from this perspective?', color: '#6366f1' },
  'song-backwards': { type: 'song-backwards', name: 'Guess the Song — Backwards', short: 'Backwards song', family: 'Music', icon: 'AudioLines', description: 'Play a reversed clip of a song.', defaultPrompt: 'Name the song played backwards', color: '#22c55e' },
};

export const GAME_LIST = Object.values(GAMES);

export function defaultContent(g: GameType): Content {
  switch (g) {
    case 'logo-normal': return { gameType: g, brand: '', category: '' };
    case 'logo-altered': return { gameType: g, brand: '', preset: '' };
    case 'country-flag': return { gameType: g, iso3: null, hideName: true };
    case 'country-border': return { gameType: g, iso3: null };
    case 'country-neighbors': return { gameType: g, iso3: null };
    case 'silhouette': return { gameType: g, subjectCategory: 'person' };
    case 'movie-emojis': return { gameType: g, year: '', explanation: '' };
    case 'movie-bad-plot': return { gameType: g, variants: [], activeVariantId: null, maxLength: 280 };
    case 'movie-dialogue': return { gameType: g, attribution: '', sourceNotes: '' };
    case 'movie-props': return { gameType: g, layout: 'row', spacing: 60 };
    case 'movie-search-history': return { gameType: g, persona: '' };
    case 'movie-perspective': return { gameType: g, narrator: '', perspective: 'villain', tone: 'humorous', variants: [] };
    case 'song-backwards': return { gameType: g, songTitle: '', artist: '' };
  }
}

const promptLayer = (text: string) => textLayer(text, transform(160, 40, 1600, 120), { fontSize: 56, bold: true, color: '#f8fafc', padding: 8 }, 'Prompt');

/** Default editable scene per game. */
export function defaultScene(g: GameType): Scene {
  const prompt = promptLayer(GAMES[g].defaultPrompt);
  const s = emptyScene();
  switch (g) {
    case 'logo-normal': {
      const img = imageLayer(null, transform(560, 200, 800, 760), { background: '#ffffff', padding: 60, border: { width: 0, color: '#ffffff', radius: 32 }, name: 'Logo' });
      s.layers = [prompt, img];
      break;
    }
    case 'logo-altered': {
      const img = imageLayer(null, transform(560, 200, 800, 760), { background: '#ffffff', padding: 60, border: { width: 0, color: '#ffffff', radius: 32 }, revealOriginalOnAnswer: true, name: 'Logo' });
      s.layers = [prompt, img];
      break;
    }
    case 'country-flag': s.layers = [prompt, countryLayer('flag', transform(460, 220, 1000, 750))]; break;
    case 'country-border': s.layers = [prompt, countryLayer('outline', transform(360, 190, 1200, 840))]; break;
    case 'country-neighbors': s.layers = [prompt, countryLayer('neighbors', transform(160, 180, 1600, 860))]; break;
    case 'silhouette': {
      const img = imageLayer(null, transform(510, 190, 900, 840), {
        name: 'Subject', revealOriginalOnAnswer: true,
        cutout: { enabled: true, auto: true, tolerance: 40, mask: { ops: [], invert: false }, feather: 1 },
        silhouette: { enabled: true, color: '#0b0b0b', outlineWidth: 0, outlineColor: '#ffffff', smoothing: 2, shadow: 0 },
      });
      s.background = { ...s.background, type: 'gradient', color: '#fde68a', color2: '#f59e0b' };
      prompt.style.color = '#111827';
      s.layers = [prompt, img];
      break;
    }
    case 'movie-emojis': s.layers = [prompt]; break;
    case 'movie-bad-plot': s.layers = [prompt, textLayer('Write a terrible but accurate plot description…', transform(260, 220, 1400, 700), { fontSize: 64, background: 'rgba(255,255,255,0.06)', padding: 48, radius: 28 }, 'Plot')]; break;
    case 'movie-dialogue': s.layers = [prompt, dialogueLayer(transform(200, 220, 1520, 760))]; break;
    case 'movie-props': {
      const slots = [0, 1, 2].map((i) => imageLayer(null, transform(150 + i * 560, 300, 500, 500), { name: `Prop ${i + 1}`, revealStep: 0 }));
      s.layers = [prompt, ...slots];
      break;
    }
    case 'movie-search-history': s.background = { ...s.background, color: '#e2e8f0' }; prompt.style.color = '#0f172a'; s.layers = [prompt, searchLayer(transform(260, 190, 1400, 840))]; break;
    case 'movie-perspective': s.layers = [prompt, textLayer('', transform(260, 220, 1400, 700), { fontSize: 56, italic: true, align: 'left', background: 'rgba(255,255,255,0.06)', padding: 56, radius: 28 }, 'Narration')]; break;
    case 'song-backwards': {
      s.background = { ...s.background, type: 'gradient', color: '#052e16', color2: '#14532d' };
      s.layers = [prompt, textLayer('🎵 ⏪', transform(560, 320, 800, 360), { fontSize: 220, padding: 0 }, 'Icon'), shapeLayer('rect', transform(460, 760, 1000, 12), { fill: '#22c55e', radius: 6, name: 'Bar' })];
      break;
    }
  }
  return s;
}

export function createQuestion(g: GameType, overrides: Partial<Question> = {}): Question {
  const now = Date.now();
  return {
    id: uid('q'),
    gameType: g,
    title: '',
    prompt: GAMES[g].defaultPrompt,
    content: defaultContent(g),
    scene: defaultScene(g),
    audio: null,
    correctAnswer: '',
    acceptedAnswers: [],
    hints: [],
    difficulty: 'medium',
    points: 10,
    timeLimit: 30,
    tags: [],
    collectionIds: [],
    mediaReferences: [],
    notes: '',
    templateId: null,
    status: 'draft',
    statusBeforeArchive: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
    ...overrides,
  };
}

export function questionDisplayTitle(q: Pick<Question, 'title' | 'correctAnswer' | 'gameType'>): string {
  return q.title || q.correctAnswer || `Untitled ${GAMES[q.gameType].short}`;
}

export { emojiLayer, uid };
