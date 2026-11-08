import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Game types                                                          */
/* ------------------------------------------------------------------ */
export const GAME_TYPES = [
  'logo-normal',
  'logo-altered',
  'country-flag',
  'country-border',
  'country-neighbors',
  'silhouette',
  'movie-emojis',
  'movie-bad-plot',
  'movie-dialogue',
  'movie-props',
  'movie-search-history',
  'movie-perspective',
  'song-backwards',
] as const;
export const GameTypeSchema = z.enum(GAME_TYPES);
export type GameType = z.infer<typeof GameTypeSchema>;

/* ------------------------------------------------------------------ */
/* Masks (vector, non-destructive, normalized 0..1 coordinates)        */
/* ------------------------------------------------------------------ */
export const MaskStrokeSchema = z.object({
  mode: z.enum(['add', 'subtract']),
  /** brush diameter relative to image width */
  size: z.number().positive(),
  hardness: z.number().min(0).max(1),
  /** flattened [x0,y0,x1,y1,...] normalized */
  points: z.array(z.number()),
});
export type MaskStroke = z.infer<typeof MaskStrokeSchema>;

export const MaskPolygonSchema = z.object({
  mode: z.enum(['add', 'subtract']),
  points: z.array(z.number()),
});
export type MaskPolygon = z.infer<typeof MaskPolygonSchema>;

export const MaskDataSchema = z.object({
  /** operations are applied in order: strokes and polygons share one ordered list */
  ops: z.array(z.discriminatedUnion('kind', [
    MaskStrokeSchema.extend({ kind: z.literal('stroke') }),
    MaskPolygonSchema.extend({ kind: z.literal('polygon') }),
  ])),
  invert: z.boolean().default(false),
});
export type MaskData = z.infer<typeof MaskDataSchema>;
export type MaskOp = MaskData['ops'][number];

/* ------------------------------------------------------------------ */
/* Image effects                                                       */
/* ------------------------------------------------------------------ */
export const EFFECT_TYPES = [
  'zoom', 'blur', 'pixelate', 'upsideDown', 'invert', 'colorReplace', 'crop', 'hideAreas',
  'outline', 'grayscale', 'distort', 'rotate', 'mirrorH', 'mirrorV', 'perspective',
  'brightness', 'contrast', 'saturation', 'hueShift', 'transparency', 'erase', 'shapeMask',
  'selectiveBlur', 'selectivePixelate', 'overlay',
] as const;
export const EffectTypeSchema = z.enum(EFFECT_TYPES);
export type EffectType = z.infer<typeof EffectTypeSchema>;

export const EffectSchema = z.object({
  id: z.string(),
  type: EffectTypeSchema,
  enabled: z.boolean(),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  mask: MaskDataSchema.optional(),
});
export type Effect = z.infer<typeof EffectSchema>;

export const CutoutSchema = z.object({
  enabled: z.boolean(),
  /** automatic background removal by border flood fill */
  auto: z.boolean(),
  tolerance: z.number().min(0).max(255),
  /** manual adjustments applied after auto result */
  mask: MaskDataSchema,
  feather: z.number().min(0).max(20),
});
export type Cutout = z.infer<typeof CutoutSchema>;

export const SilhouetteSchema = z.object({
  enabled: z.boolean(),
  color: z.string(),
  outlineWidth: z.number().min(0).max(40),
  outlineColor: z.string(),
  smoothing: z.number().min(0).max(10),
  shadow: z.number().min(0).max(1),
});
export type Silhouette = z.infer<typeof SilhouetteSchema>;

/* ------------------------------------------------------------------ */
/* Rich text                                                           */
/* ------------------------------------------------------------------ */
export type RichMark = { type: string; attrs?: Record<string, unknown> };
export type RichNode = {
  type: string;
  text?: string;
  marks?: RichMark[];
  attrs?: Record<string, unknown>;
  content?: RichNode[];
};
export const RichNodeSchema: z.ZodType<RichNode> = z.lazy(() =>
  z.object({
    type: z.string(),
    text: z.string().optional(),
    marks: z.array(z.object({ type: z.string(), attrs: z.record(z.string(), z.unknown()).optional() })).optional(),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(RichNodeSchema).optional(),
  }),
);

export const TextStyleSchema = z.object({
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  color: z.string(),
  align: z.enum(['left', 'center', 'right']),
  vAlign: z.enum(['top', 'middle', 'bottom']),
  lineHeight: z.number().positive(),
  letterSpacing: z.number(),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  background: z.string(),
  padding: z.number().min(0),
  radius: z.number().min(0),
  overflow: z.enum(['shrink', 'clip', 'visible']),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

/* ------------------------------------------------------------------ */
/* Layers                                                              */
/* ------------------------------------------------------------------ */
export const TransformSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  rotation: z.number(),
  opacity: z.number().min(0).max(1),
  flipX: z.boolean(),
  flipY: z.boolean(),
});
export type Transform = z.infer<typeof TransformSchema>;

const BaseLayer = z.object({
  id: z.string(),
  name: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  transform: TransformSchema,
  /** 0 = visible from the start; n = revealed at progressive step n */
  revealStep: z.number().int().min(0),
  /** only visible once the answer has been revealed */
  answerOnly: z.boolean(),
  groupId: z.string().optional(),
  shadow: z.object({ blur: z.number(), color: z.string(), x: z.number(), y: z.number() }).optional(),
});

export const ImageLayerSchema = BaseLayer.extend({
  kind: z.literal('image'),
  assetId: z.string().nullable(),
  fit: z.enum(['contain', 'cover', 'fill']),
  padding: z.number().min(0),
  background: z.string(),
  border: z.object({ width: z.number().min(0), color: z.string(), radius: z.number().min(0) }),
  cutout: CutoutSchema.optional(),
  effects: z.array(EffectSchema),
  silhouette: SilhouetteSchema.optional(),
  /** show the unprocessed original when the answer is revealed */
  revealOriginalOnAnswer: z.boolean(),
});
export const TextLayerSchema = BaseLayer.extend({
  kind: z.literal('text'),
  doc: RichNodeSchema,
  style: TextStyleSchema,
});
export const EmojiLayerSchema = BaseLayer.extend({ kind: z.literal('emoji'), emoji: z.string() });
export const ShapeLayerSchema = BaseLayer.extend({
  kind: z.literal('shape'),
  shape: z.enum(['rect', 'ellipse', 'line', 'arrow', 'path', 'star']),
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: z.number().min(0),
  radius: z.number().min(0),
  /** normalized points (0..1 within box) for path shapes */
  points: z.array(z.number()).optional(),
});
export const PROJECTIONS = ['equalEarth', 'mercator', 'naturalEarth', 'orthographic', 'azimuthalEqualArea', 'conicEqualArea'] as const;
export const CountryLayerSchema = BaseLayer.extend({
  kind: z.literal('country'),
  iso3: z.string().nullable(),
  display: z.enum(['flag', 'outline', 'neighbors']),
  projection: z.enum(PROJECTIONS),
  filled: z.boolean(),
  fill: z.string(),
  stroke: z.string(),
  strokeWidth: z.number().min(0),
  mapRotation: z.number(),
  zoom: z.number().positive(),
  panX: z.number(),
  panY: z.number(),
  islands: z.enum(['all', 'near', 'mainland']),
  neighbors: z.object({
    targetFill: z.string(),
    neighborFill: z.string(),
    otherFill: z.string(),
    sea: z.string(),
    showLabels: z.boolean(),
    labelColor: z.string(),
    maxNeighbors: z.number().int().min(0),
    highlightNeighbors: z.boolean(),
    showOthers: z.boolean(),
    showNearbyForIslands: z.boolean(),
    revealTargetName: z.boolean(),
  }),
  flag: z.object({ aspect: z.enum(['4x3', '1x1']), border: z.boolean() }),
});
export const SearchEntrySchema = z.object({
  id: z.string(),
  text: z.string(),
  date: z.string(),
  time: z.string(),
  revealStep: z.number().int().min(0),
});
export const SearchLayerSchema = BaseLayer.extend({
  kind: z.literal('search'),
  title: z.string(),
  engineName: z.string(),
  theme: z.enum(['light', 'dark', 'retro', 'mobile']),
  entries: z.array(SearchEntrySchema).max(20),
  showDates: z.boolean(),
  showSuggestions: z.boolean(),
  suggestions: z.array(z.string()),
});
export const DialogueLineSchema = z.object({
  id: z.string(),
  speaker: z.string(),
  text: z.string(),
  revealStep: z.number().int().min(0),
});
export const DialogueLayerSchema = BaseLayer.extend({
  kind: z.literal('dialogue'),
  lines: z.array(DialogueLineSchema),
  style: z.enum(['quote', 'script', 'subtitle', 'bubble']),
  showSpeakers: z.boolean(),
  fontFamily: z.string(),
  fontSize: z.number().positive(),
  color: z.string(),
  accent: z.string(),
});

export const LayerSchema = z.discriminatedUnion('kind', [
  ImageLayerSchema, TextLayerSchema, EmojiLayerSchema, ShapeLayerSchema,
  CountryLayerSchema, SearchLayerSchema, DialogueLayerSchema,
]);
export type Layer = z.infer<typeof LayerSchema>;
export type LayerKind = Layer['kind'];
export type ImageLayer = z.infer<typeof ImageLayerSchema>;
export type TextLayer = z.infer<typeof TextLayerSchema>;
export type EmojiLayer = z.infer<typeof EmojiLayerSchema>;
export type ShapeLayer = z.infer<typeof ShapeLayerSchema>;
export type CountryLayer = z.infer<typeof CountryLayerSchema>;
export type SearchLayer = z.infer<typeof SearchLayerSchema>;
export type SearchEntry = z.infer<typeof SearchEntrySchema>;
export type DialogueLayer = z.infer<typeof DialogueLayerSchema>;
export type DialogueLine = z.infer<typeof DialogueLineSchema>;

export const BackgroundSchema = z.object({
  type: z.enum(['solid', 'gradient', 'pattern', 'image']),
  color: z.string(),
  color2: z.string(),
  angle: z.number(),
  pattern: z.enum(['dots', 'grid', 'stripes', 'checker', 'diagonal']),
  assetId: z.string().nullable(),
});
export type Background = z.infer<typeof BackgroundSchema>;

export const SceneSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  background: BackgroundSchema,
  layers: z.array(LayerSchema),
});
export type Scene = z.infer<typeof SceneSchema>;

/* ------------------------------------------------------------------ */
/* Audio                                                               */
/* ------------------------------------------------------------------ */
export const AUDIO_OP_TYPES = ['trim', 'delete', 'reverse', 'gain', 'fadeIn', 'fadeOut', 'speed', 'loop'] as const;
export const AudioOpSchema = z.object({
  id: z.string(),
  type: z.enum(AUDIO_OP_TYPES),
  enabled: z.boolean(),
  /** seconds, relative to the output of the previous operation. null = whole clip */
  range: z.object({ start: z.number().min(0), end: z.number().min(0) }).nullable(),
  params: z.record(z.string(), z.number()),
});
export type AudioOp = z.infer<typeof AudioOpSchema>;
export type AudioOpType = AudioOp['type'];
export const AudioClipSchema = z.object({
  assetId: z.string(),
  ops: z.array(AudioOpSchema),
});
export type AudioClip = z.infer<typeof AudioClipSchema>;

/* ------------------------------------------------------------------ */
/* Game-specific content (discriminated union)                         */
/* ------------------------------------------------------------------ */
const PlotVariant = z.object({ id: z.string(), style: z.string(), tone: z.string(), doc: RichNodeSchema, aiGenerated: z.boolean().default(false) });
const PerspectiveVariant = z.object({ id: z.string(), label: z.string(), paragraphs: z.array(z.string()) });

export const ContentSchema = z.discriminatedUnion('gameType', [
  z.object({ gameType: z.literal('logo-normal'), brand: z.string(), category: z.string() }),
  z.object({ gameType: z.literal('logo-altered'), brand: z.string(), preset: z.string() }),
  z.object({ gameType: z.literal('country-flag'), iso3: z.string().nullable(), hideName: z.boolean() }),
  z.object({ gameType: z.literal('country-border'), iso3: z.string().nullable() }),
  z.object({ gameType: z.literal('country-neighbors'), iso3: z.string().nullable() }),
  z.object({ gameType: z.literal('silhouette'), subjectCategory: z.string() }),
  z.object({ gameType: z.literal('movie-emojis'), year: z.string(), explanation: z.string() }),
  z.object({
    gameType: z.literal('movie-bad-plot'),
    variants: z.array(PlotVariant),
    activeVariantId: z.string().nullable(),
    maxLength: z.number().int().min(0),
  }),
  z.object({ gameType: z.literal('movie-dialogue'), attribution: z.string(), sourceNotes: z.string() }),
  z.object({ gameType: z.literal('movie-props'), layout: z.enum(['row', 'grid', 'freeform']), spacing: z.number() }),
  z.object({ gameType: z.literal('movie-search-history'), persona: z.string() }),
  z.object({
    gameType: z.literal('movie-perspective'),
    narrator: z.string(),
    perspective: z.enum(['villain', 'minor', 'background', 'bystander', 'parent', 'child', 'supporting', 'object', 'custom']),
    tone: z.enum(['humorous', 'serious', 'mysterious', 'dramatic', 'misleading']),
    variants: z.array(PerspectiveVariant),
  }),
  z.object({ gameType: z.literal('song-backwards'), songTitle: z.string(), artist: z.string() }),
]);
export type Content = z.infer<typeof ContentSchema>;
export type ContentOf<G extends GameType> = Extract<Content, { gameType: G }>;

/* ------------------------------------------------------------------ */
/* Question                                                            */
/* ------------------------------------------------------------------ */
export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const;
export const STATUSES = ['draft', 'published', 'archived'] as const;

export const QuestionSchema = z.object({
  id: z.string(),
  gameType: GameTypeSchema,
  title: z.string(),
  prompt: z.string(),
  content: ContentSchema,
  /** the editable visual document ("editorDocument") */
  scene: SceneSchema,
  audio: AudioClipSchema.nullable(),
  correctAnswer: z.string(),
  acceptedAnswers: z.array(z.string()),
  hints: z.array(z.object({ id: z.string(), text: z.string() })),
  difficulty: z.enum(DIFFICULTIES),
  points: z.number().min(0),
  timeLimit: z.number().int().min(0),
  tags: z.array(z.string()),
  collectionIds: z.array(z.string()),
  mediaReferences: z.array(z.string()),
  notes: z.string(),
  templateId: z.string().nullable(),
  status: z.enum(STATUSES),
  statusBeforeArchive: z.enum(['draft', 'published']).nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
  version: z.number().int().min(1),
}).superRefine((q, ctx) => {
  if (q.content.gameType !== q.gameType)
    ctx.addIssue({ code: 'custom', message: 'content.gameType must match gameType', path: ['content'] });
});
export type Question = z.infer<typeof QuestionSchema>;
export type Difficulty = Question['difficulty'];
export type QuestionStatus = Question['status'];

/** lightweight row for list views; kept in sync by the repository */
export type QuestionSummary = {
  id: string;
  gameType: GameType;
  title: string;
  correctAnswer: string;
  status: QuestionStatus;
  difficulty: Difficulty;
  points: number;
  tags: string[];
  collectionIds: string[];
  searchText: string;
  createdAt: number;
  updatedAt: number;
};

/* ------------------------------------------------------------------ */
/* Assets, templates, collections, quizzes                             */
/* ------------------------------------------------------------------ */
export const AssetSchema = z.object({
  id: z.string(),
  hash: z.string(),
  name: z.string(),
  type: z.enum(['image', 'audio']),
  mime: z.string(),
  size: z.number().int().min(0),
  width: z.number().optional(),
  height: z.number().optional(),
  duration: z.number().optional(),
  tags: z.array(z.string()),
  createdAt: z.number(),
});
export type Asset = z.infer<typeof AssetSchema>;

export const TemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  gameType: GameTypeSchema,
  description: z.string(),
  builtIn: z.boolean(),
  scene: SceneSchema,
  content: ContentSchema.optional(),
  audioOps: z.array(AudioOpSchema).optional(),
  defaults: z.object({
    difficulty: z.enum(DIFFICULTIES).optional(),
    points: z.number().optional(),
    timeLimit: z.number().optional(),
    tags: z.array(z.string()).optional(),
    prompt: z.string().optional(),
  }),
  createdAt: z.number(),
  updatedAt: z.number(),
  lastUsedAt: z.number().nullable(),
});
export type Template = z.infer<typeof TemplateSchema>;

export const CollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  color: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Collection = z.infer<typeof CollectionSchema>;

export const QuizSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  theme: z.object({ accent: z.string(), background: z.string(), font: z.string() }),
  settings: z.object({ showQuestionNumbers: z.boolean(), autoStartTimer: z.boolean(), showRoundTransitions: z.boolean() }),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Quiz = z.infer<typeof QuizSchema>;

export const RoundSchema = z.object({
  id: z.string(),
  quizId: z.string(),
  order: z.number(),
  title: z.string(),
  description: z.string(),
  scoring: z.object({ pointsMultiplier: z.number(), negativeMarking: z.boolean(), bonusFirstCorrect: z.number() }),
  defaultTimeLimit: z.number().int().min(0),
  transition: z.object({ show: z.boolean(), subtitle: z.string() }),
});
export type Round = z.infer<typeof RoundSchema>;

export const QuizQuestionRefSchema = z.object({
  id: z.string(),
  quizId: z.string(),
  roundId: z.string(),
  questionId: z.string(),
  order: z.number(),
});
export type QuizQuestionRef = z.infer<typeof QuizQuestionRefSchema>;

export type Revision = {
  id: string;
  questionId: string;
  version: number;
  createdAt: number;
  reason: string;
  snapshot: Question;
};
