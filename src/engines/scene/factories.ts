import type {
  Background, CountryLayer, DialogueLayer, Effect, EffectType, EmojiLayer, ImageLayer, Layer, RichNode,
  Scene, SearchLayer, ShapeLayer, TextLayer, TextStyle, Transform,
} from '@/types/schema';
import { uid } from '@/utils/id';
import { EFFECT_DEFS } from '@/engines/image/effectDefs';

export const SCENE_W = 1920;
export const SCENE_H = 1080;

export const ASPECTS = {
  '16:9': [1920, 1080],
  '4:3': [1440, 1080],
  '1:1': [1080, 1080],
} as const;

export function transform(x: number, y: number, w: number, h: number, extra: Partial<Transform> = {}): Transform {
  return { x, y, w, h, rotation: 0, opacity: 1, flipX: false, flipY: false, ...extra };
}

export function defaultBackground(color = '#111827', extra: Partial<Background> = {}): Background {
  return { type: 'solid', color, color2: '#1f2937', angle: 135, pattern: 'dots', assetId: null, ...extra };
}

export function emptyScene(width = SCENE_W, height = SCENE_H, bg: Partial<Background> = {}): Scene {
  return { width, height, background: defaultBackground(bg.color, bg), layers: [] };
}

function base(name: string, t: Transform) {
  return { id: uid('l'), name, visible: true, locked: false, transform: t, revealStep: 0, answerOnly: false };
}

export function plainDoc(text: string): RichNode {
  const paras = text.split('\n');
  return {
    type: 'doc',
    content: paras.map((p) => ({ type: 'paragraph', content: p ? [{ type: 'text', text: p }] : [] })),
  };
}

export function docToPlainText(doc: RichNode): string {
  const out: string[] = [];
  const walk = (n: RichNode, depth: number) => {
    if (n.type === 'text') { out.push(n.text ?? ''); return; }
    if (n.type === 'hardBreak') { out.push('\n'); return; }
    n.content?.forEach((c) => walk(c, depth + 1));
    if (['paragraph', 'heading', 'listItem'].includes(n.type)) out.push('\n');
  };
  walk(doc, 0);
  return out.join('').replace(/\n+$/, '').replace(/\n{2,}/g, '\n');
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 64,
  color: '#ffffff',
  align: 'center',
  vAlign: 'middle',
  lineHeight: 1.25,
  letterSpacing: 0,
  bold: false,
  italic: false,
  underline: false,
  background: 'transparent',
  padding: 24,
  radius: 16,
  overflow: 'shrink',
};

export function textLayer(text: string, t: Transform, style: Partial<TextStyle> = {}, name = 'Text'): TextLayer {
  return { ...base(name, t), kind: 'text', doc: plainDoc(text), style: { ...DEFAULT_TEXT_STYLE, ...style } };
}

export function imageLayer(assetId: string | null, t: Transform, extra: Partial<ImageLayer> = {}): ImageLayer {
  return {
    ...base('Image', t),
    kind: 'image',
    assetId,
    fit: 'contain',
    padding: 0,
    background: 'transparent',
    border: { width: 0, color: '#ffffff', radius: 0 },
    effects: [],
    revealOriginalOnAnswer: false,
    ...extra,
  };
}

export function emojiLayer(emoji: string, t: Transform): EmojiLayer {
  return { ...base(`Emoji ${emoji}`, t), kind: 'emoji', emoji };
}

export function shapeLayer(shape: ShapeLayer['shape'], t: Transform, extra: Partial<ShapeLayer> = {}): ShapeLayer {
  return {
    ...base(shape[0].toUpperCase() + shape.slice(1), t),
    kind: 'shape', shape, fill: '#f59e0b', stroke: 'transparent', strokeWidth: 0, radius: 0, ...extra,
  };
}

export function countryLayer(display: CountryLayer['display'], t: Transform, iso3: string | null = null): CountryLayer {
  return {
    ...base(display === 'flag' ? 'Flag' : display === 'outline' ? 'Country outline' : 'Neighbour map', t),
    kind: 'country',
    iso3,
    display,
    projection: display === 'neighbors' ? 'mercator' : 'equalEarth',
    filled: true,
    fill: '#f8fafc',
    stroke: '#f59e0b',
    strokeWidth: 3,
    mapRotation: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    islands: 'near',
    neighbors: {
      targetFill: '#0f172a',
      neighborFill: '#f59e0b',
      otherFill: '#334155',
      sea: '#0b3b5c',
      showLabels: true,
      labelColor: '#ffffff',
      maxNeighbors: 20,
      highlightNeighbors: true,
      showOthers: true,
      showNearbyForIslands: true,
      revealTargetName: true,
    },
    flag: { aspect: '4x3', border: true },
  };
}

export function searchLayer(t: Transform): SearchLayer {
  return {
    ...base('Search history', t),
    kind: 'search',
    title: 'Search history',
    engineName: 'Searchly',
    theme: 'light',
    entries: [],
    showDates: true,
    showSuggestions: false,
    suggestions: [],
  };
}

export function dialogueLayer(t: Transform): DialogueLayer {
  return {
    ...base('Dialogue', t),
    kind: 'dialogue',
    lines: [],
    style: 'quote',
    showSpeakers: true,
    fontFamily: 'Georgia, serif',
    fontSize: 60,
    color: '#ffffff',
    accent: '#f59e0b',
  };
}

export function createEffect(type: EffectType): Effect {
  const def = EFFECT_DEFS[type];
  const params: Effect['params'] = {};
  for (const p of def.params) params[p.key] = p.default;
  return { id: uid('fx'), type, enabled: true, params, ...(def.usesMask ? { mask: { ops: [], invert: false } } : {}) };
}

/** Duplicates a layer with a fresh id. */
export function cloneLayer(l: Layer, offset = 0): Layer {
  const c: Layer = structuredClone(l);
  c.id = uid('l');
  c.name = l.name.endsWith(' copy') ? l.name : `${l.name} copy`;
  c.transform = { ...c.transform, x: c.transform.x + offset, y: c.transform.y + offset };
  if (c.kind === 'image') c.effects = c.effects.map((e) => ({ ...e, id: uid('fx') }));
  return c;
}

/** Regenerates all layer ids (used when instantiating templates). */
export function refreshSceneIds(scene: Scene): Scene {
  const s = structuredClone(scene);
  const groupMap = new Map<string, string>();
  s.layers = s.layers.map((l) => {
    const c = { ...l, id: uid('l') } as Layer;
    if (c.groupId) {
      if (!groupMap.has(c.groupId)) groupMap.set(c.groupId, uid('g'));
      c.groupId = groupMap.get(c.groupId);
    }
    if (c.kind === 'image') c.effects = c.effects.map((e) => ({ ...e, id: uid('fx') }));
    if (c.kind === 'search') c.entries = c.entries.map((e) => ({ ...e, id: uid('se') }));
    if (c.kind === 'dialogue') c.lines = c.lines.map((e) => ({ ...e, id: uid('dl') }));
    return c;
  });
  return s;
}

export function collectAssetIds(scene: Scene, audioAssetId?: string | null): string[] {
  const ids = new Set<string>();
  if (scene.background.type === 'image' && scene.background.assetId) ids.add(scene.background.assetId);
  for (const l of scene.layers) if (l.kind === 'image' && l.assetId) ids.add(l.assetId);
  if (audioAssetId) ids.add(audioAssetId);
  return [...ids];
}

/** Highest progressive reveal step present in the scene. */
export function maxRevealStep(scene: Scene): number {
  let m = 0;
  for (const l of scene.layers) {
    if (!l.visible) continue;
    m = Math.max(m, l.revealStep);
    if (l.kind === 'search') for (const e of l.entries) m = Math.max(m, e.revealStep);
    if (l.kind === 'dialogue') for (const e of l.lines) m = Math.max(m, e.revealStep);
  }
  return m;
}
