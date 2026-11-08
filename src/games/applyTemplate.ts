import type { Question, Template } from '@/types/schema';
import { collectAssetIds, refreshSceneIds } from '@/engines/scene/factories';
import { uid } from '@/utils/id';
import { createQuestion } from './registry';

/**
 * Applies a template to a question without mutating either. Existing media and identifying content
 * (country, brand, answer) are carried over into the template's slots.
 */
export function applyTemplate(q: Question, t: Template): Question {
  if (t.gameType !== q.gameType) throw new Error(`Template is for ${t.gameType}, question is ${q.gameType}`);
  const scene = refreshSceneIds(t.scene);
  const existingImages = q.scene.layers.filter((l) => l.kind === 'image' && l.assetId).map((l) => (l.kind === 'image' ? l.assetId : null));
  let i = 0;
  for (const l of scene.layers) {
    if (l.kind === 'image' && !l.assetId && i < existingImages.length) l.assetId = existingImages[i++];
    if (l.kind === 'country') {
      const iso = 'iso3' in q.content ? q.content.iso3 : q.scene.layers.find((x) => x.kind === 'country')?.kind === 'country' ? (q.scene.layers.find((x) => x.kind === 'country') as { iso3: string | null }).iso3 : null;
      if (iso) l.iso3 = iso;
    }
    if (l.kind === 'search') {
      const old = q.scene.layers.find((x) => x.kind === 'search');
      if (old?.kind === 'search' && old.entries.length && !l.entries.length) l.entries = structuredClone(old.entries);
    }
    if (l.kind === 'dialogue') {
      const old = q.scene.layers.find((x) => x.kind === 'dialogue');
      if (old?.kind === 'dialogue' && old.lines.length && !l.lines.length) l.lines = structuredClone(old.lines);
    }
  }
  const content = t.content ? { ...structuredClone(t.content), ...pickIdentity(q) } as Question['content'] : q.content;
  const audio = q.audio && t.audioOps ? { ...q.audio, ops: t.audioOps.map((o) => ({ ...structuredClone(o), id: uid('ao') })) } : q.audio;
  return {
    ...q,
    scene,
    content,
    audio,
    templateId: t.id,
    mediaReferences: collectAssetIds(scene, audio?.assetId),
  };
}

function pickIdentity(q: Question): Partial<Question['content']> {
  const c = q.content as Record<string, unknown>;
  const keep: Record<string, unknown> = {};
  for (const k of ['iso3', 'brand', 'songTitle', 'artist', 'year', 'narrator', 'attribution', 'variants', 'activeVariantId', 'persona', 'subjectCategory', 'category', 'explanation', 'sourceNotes'])
    if (k in c && c[k] !== '' && c[k] !== null && !(Array.isArray(c[k]) && (c[k] as unknown[]).length === 0)) keep[k] = c[k];
  return keep as Partial<Question['content']>;
}

/** Creates a brand-new question from a template, including default properties. */
export function questionFromTemplate(t: Template): Question {
  const base = createQuestion(t.gameType);
  const q = applyTemplate(base, t);
  return {
    ...q,
    prompt: t.defaults.prompt ?? q.prompt,
    difficulty: t.defaults.difficulty ?? q.difficulty,
    points: t.defaults.points ?? q.points,
    timeLimit: t.defaults.timeLimit ?? q.timeLimit,
    tags: t.defaults.tags ? [...t.defaults.tags] : q.tags,
  };
}

/** Builds a user template from an existing question (media references are kept, not copied). */
export function templateFromQuestion(q: Question, name: string, description = ''): Template {
  const now = Date.now();
  return {
    id: uid('t'),
    name,
    description,
    gameType: q.gameType,
    builtIn: false,
    scene: structuredClone(q.scene),
    content: structuredClone(q.content),
    audioOps: q.audio ? structuredClone(q.audio.ops) : undefined,
    defaults: { difficulty: q.difficulty, points: q.points, timeLimit: q.timeLimit, tags: [...q.tags], prompt: q.prompt },
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
  };
}
