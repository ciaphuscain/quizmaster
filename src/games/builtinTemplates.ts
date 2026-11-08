import type { AudioOp, GameType, Template } from '@/types/schema';
import { defaultContent, defaultScene } from './registry';
import { EFFECT_PRESETS } from './presets';
import { emojiLayer, transform, textLayer } from '@/engines/scene/factories';

const t0 = 0;
function tpl(id: string, gameType: GameType, name: string, description: string, mutate?: (t: Template) => void): Template {
  const t: Template = {
    id: `builtin:${id}`, name, gameType, description, builtIn: true,
    scene: defaultScene(gameType), content: defaultContent(gameType), defaults: {},
    createdAt: t0, updatedAt: t0, lastUsedAt: null,
  };
  mutate?.(t);
  return t;
}

const op = (type: AudioOp['type'], range: AudioOp['range'], params: Record<string, number> = {}): AudioOp => ({ id: `${type}-${range?.start ?? 'all'}`, type, enabled: true, range, params });

function withPreset(presetId: string) {
  return (t: Template) => {
    const img = t.scene.layers.find((l) => l.kind === 'image');
    if (img && img.kind === 'image') img.effects = EFFECT_PRESETS.find((p) => p.id === presetId)!.build();
    if (t.content?.gameType === 'logo-altered') t.content.preset = presetId;
  };
}

export const BUILTIN_TEMPLATES: Template[] = [
  tpl('logo-white-card', 'logo-normal', 'White card', 'Logo on a white rounded card'),
  tpl('logo-dark', 'logo-normal', 'Dark stage', 'Logo on dark background without card', (t) => {
    const img = t.scene.layers.find((l) => l.kind === 'image');
    if (img?.kind === 'image') img.background = 'transparent';
    t.scene.background = { ...t.scene.background, type: 'pattern', pattern: 'dots', color: '#0f172a', color2: '#1e293b' };
  }),
  tpl('alt-heavy-blur', 'logo-altered', 'Heavy blur', 'Strongly blurred logo', withPreset('heavy-blur')),
  tpl('alt-tiny-crop', 'logo-altered', 'Tiny crop', 'A small crop of the logo', withPreset('tiny-crop')),
  tpl('alt-pixelated', 'logo-altered', 'Pixelated', 'Blocky pixelation', withPreset('pixelated')),
  tpl('alt-hidden-centre', 'logo-altered', 'Hidden centre', 'Centre of the logo covered', withPreset('hidden-centre')),
  tpl('alt-extreme-rotation', 'logo-altered', 'Extreme rotation', 'Upside down and swirled', withPreset('extreme-rotation')),
  tpl('flag-classic', 'country-flag', 'Classic flag', 'Large centred flag'),
  tpl('flag-square', 'country-flag', 'Square flag', 'Square crop of the flag', (t) => {
    const l = t.scene.layers.find((x) => x.kind === 'country');
    if (l?.kind === 'country') { l.flag.aspect = '1x1'; l.transform = transform(560, 200, 800, 800); }
  }),
  tpl('border-filled', 'country-border', 'Filled silhouette', 'Solid white country shape'),
  tpl('border-line', 'country-border', 'Border only', 'Outline stroke without fill', (t) => {
    const l = t.scene.layers.find((x) => x.kind === 'country');
    if (l?.kind === 'country') { l.filled = false; l.strokeWidth = 6; }
  }),
  tpl('neighbors-labelled', 'country-neighbors', 'Labelled neighbours', 'Neighbours highlighted and named'),
  tpl('neighbors-unlabelled', 'country-neighbors', 'Unlabelled (hard)', 'Neighbours highlighted, no names', (t) => {
    const l = t.scene.layers.find((x) => x.kind === 'country');
    if (l?.kind === 'country') l.neighbors.showLabels = false;
  }),
  tpl('silhouette-classic', 'silhouette', 'Classic silhouette', 'Black subject on warm gradient'),
  tpl('silhouette-outline', 'silhouette', 'Outlined silhouette', 'Dark subject with white outline on dark blue', (t) => {
    const l = t.scene.layers.find((x) => x.kind === 'image');
    if (l?.kind === 'image' && l.silhouette) { l.silhouette = { ...l.silhouette, color: '#000000', outlineWidth: 6, outlineColor: '#ffffff' }; }
    t.scene.background = { ...t.scene.background, type: 'gradient', color: '#1e3a8a', color2: '#0f172a' };
  }),
  tpl('emoji-row', 'movie-emojis', 'Emoji row', 'Four emoji slots in a row revealed one by one', (t) => {
    t.scene.layers.push(...['🦁', '👑', '🌅', '🐗'].map((e, i) => { const l = emojiLayer(e, transform(260 + i * 360, 400, 320, 320)); l.revealStep = i; return l; }));
  }),
  tpl('plot-card', 'movie-bad-plot', 'Plot card', 'Single text card'),
  tpl('plot-clues', 'movie-bad-plot', 'Progressive clue cards', 'Three clue cards revealed one by one', (t) => {
    t.scene.layers = t.scene.layers.filter((l) => l.name !== 'Plot');
    t.scene.layers.push(...[0, 1, 2].map((i) => { const l = textLayer(`Clue ${i + 1}`, transform(260, 200 + i * 280, 1400, 240), { fontSize: 48, background: 'rgba(255,255,255,0.08)', padding: 32, radius: 24 }, `Clue ${i + 1}`); l.revealStep = i; return l; }));
  }),
  tpl('dialogue-quote', 'movie-dialogue', 'Dialogue card', 'Elegant quotation'),
  tpl('dialogue-script', 'movie-dialogue', 'Screenplay', 'Script-style lines', (t) => {
    const l = t.scene.layers.find((x) => x.kind === 'dialogue');
    if (l?.kind === 'dialogue') { l.style = 'script'; l.fontFamily = '"Courier New", monospace'; }
  }),
  tpl('props-three', 'movie-props', 'Three props', 'Three prop slots in a row'),
  tpl('props-four-grid', 'movie-props', 'Four-prop grid', '2×2 grid revealed progressively', (t) => {
    const imgs = t.scene.layers.filter((l) => l.kind === 'image');
    const base = imgs[0];
    t.scene.layers = t.scene.layers.filter((l) => l.kind !== 'image');
    [0, 1, 2, 3].forEach((i) => {
      const c = structuredClone(base); c.id = `prop${i}`; c.name = `Prop ${i + 1}`; c.revealStep = i;
      c.transform = transform(460 + (i % 2) * 520, 190 + Math.floor(i / 2) * 440, 480, 400);
      t.scene.layers.push(c);
    });
    if (t.content?.gameType === 'movie-props') t.content.layout = 'grid';
  }),
  tpl('search-stack', 'movie-search-history', 'Search-history stack', 'Light theme search card'),
  tpl('search-dark', 'movie-search-history', 'Dark search', 'Dark theme', (t) => {
    const l = t.scene.layers.find((x) => x.kind === 'search');
    if (l?.kind === 'search') l.theme = 'dark';
    t.scene.background = { ...t.scene.background, color: '#0b0c0e' };
    const p = t.scene.layers.find((x) => x.kind === 'text');
    if (p?.kind === 'text') p.style.color = '#f8fafc';
  }),
  tpl('perspective-monologue', 'movie-perspective', 'Character monologue', 'Narration card'),
  tpl('song-rev-10', 'song-backwards', 'Reversed 10-second clip', 'Trim 10 s then reverse', (t) => { t.audioOps = [op('trim', { start: 0, end: 10 }), op('reverse', null)]; }),
  tpl('song-rev-20', 'song-backwards', 'Reversed 20-second clip', 'Trim 20 s then reverse', (t) => { t.audioOps = [op('trim', { start: 0, end: 20 }), op('reverse', null)]; }),
  tpl('song-rev-fade', 'song-backwards', 'Reversed with fade', 'Trim 15 s, reverse, fade in/out', (t) => { t.audioOps = [op('trim', { start: 0, end: 15 }), op('reverse', null), op('fadeIn', null, { duration: 1 }), op('fadeOut', null, { duration: 1.5 })]; }),
];
