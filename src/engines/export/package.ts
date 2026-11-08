import JSZip from 'jszip';
import { z } from 'zod';
import { db } from '@/db/database';
import type { Asset, Collection, Question, Quiz, QuizQuestionRef, Round, Template } from '@/types/schema';
import { AssetSchema, CollectionSchema, QuestionSchema, QuizQuestionRefSchema, QuizSchema, RoundSchema, TemplateSchema } from '@/types/schema';
import { sha256Hex, blobToArrayBuffer } from '@/utils/hash';
import { uid } from '@/utils/id';
import { summarize } from '@/db/repositories/questions';
import { collectAssetIds } from '@/engines/scene/factories';

/**
 * Quizmaster package format (documented in README / DECISIONS):
 *   manifest.json      { format, formatVersion, appVersion, createdAt, kind, counts, assets:[{id,hash,path,mime,size,...}] }
 *   questions.json     Question[]
 *   quiz.json          { quizzes: Quiz[], rounds: Round[], refs: QuizQuestionRef[] }   (optional)
 *   collections.json   Collection[]                                                       (optional)
 *   templates/templates.json Template[]                                                   (optional)
 *   assets/<sha256>.<ext>   original media bytes
 */
export const PACKAGE_FORMAT = 'quizmaster-package';
export const PACKAGE_VERSION = 1;
export const APP_VERSION = '0.1.0';
export const LIMITS = { maxFiles: 20000, maxTotalBytes: 2 * 1024 * 1024 * 1024, maxJsonBytes: 200 * 1024 * 1024, maxAssetBytes: 200 * 1024 * 1024 };

const ManifestAsset = AssetSchema.extend({ path: z.string() });
export const ManifestSchema = z.object({
  format: z.literal(PACKAGE_FORMAT),
  formatVersion: z.number().int(),
  appVersion: z.string(),
  createdAt: z.number(),
  kind: z.enum(['quiz', 'questions', 'backup']),
  counts: z.object({ questions: z.number(), assets: z.number(), quizzes: z.number(), templates: z.number() }),
  assets: z.array(ManifestAsset),
});
export type Manifest = z.infer<typeof ManifestSchema>;

const QuizFileSchema = z.object({ quizzes: z.array(QuizSchema), rounds: z.array(RoundSchema), refs: z.array(QuizQuestionRefSchema) });

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/avif': 'avif',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/flac': 'flac', 'audio/webm': 'webm',
};
const ALLOWED_EXT = new Set(Object.values(EXT).concat(['bin']));

export type ExportScope =
  | { kind: 'quiz'; quizIds: string[] }
  | { kind: 'questions'; questionIds: string[] }
  | { kind: 'backup' };

export async function buildPackage(scope: ExportScope, onProgress?: (msg: string) => void): Promise<Blob> {
  const zip = new JSZip();
  let questions: Question[] = [];
  let quizzes: Quiz[] = [], rounds: Round[] = [], refs: QuizQuestionRef[] = [];
  let templates: Template[] = [];
  let collections: Collection[] = [];
  if (scope.kind === 'backup') {
    questions = await db.questions.toArray();
    quizzes = await db.quizzes.toArray(); rounds = await db.rounds.toArray(); refs = await db.quizQuestionRefs.toArray();
    templates = await db.templates.toArray(); collections = await db.collections.toArray();
  } else if (scope.kind === 'quiz') {
    quizzes = (await db.quizzes.bulkGet(scope.quizIds)).filter((q): q is Quiz => !!q);
    rounds = await db.rounds.where('quizId').anyOf(scope.quizIds).toArray();
    refs = await db.quizQuestionRefs.where('quizId').anyOf(scope.quizIds).toArray();
    questions = (await db.questions.bulkGet([...new Set(refs.map((r) => r.questionId))])).filter((q): q is Question => !!q);
  } else {
    questions = (await db.questions.bulkGet(scope.questionIds)).filter((q): q is Question => !!q);
  }
  if (scope.kind !== 'backup') {
    const tplIds = [...new Set(questions.map((q) => q.templateId).filter((x): x is string => !!x && !x.startsWith('builtin:')))];
    templates = (await db.templates.bulkGet(tplIds)).filter((t): t is Template => !!t);
    const colIds = [...new Set(questions.flatMap((q) => q.collectionIds))];
    collections = (await db.collections.bulkGet(colIds)).filter((c): c is Collection => !!c);
  }
  const assetIds = new Set<string>();
  for (const q of questions) collectAssetIds(q.scene, q.audio?.assetId).forEach((a) => assetIds.add(a));
  for (const t of templates) collectAssetIds(t.scene).forEach((a) => assetIds.add(a));
  if (scope.kind === 'backup') (await db.assets.toCollection().primaryKeys()).forEach((a) => assetIds.add(a));
  const assets = (await db.assets.bulkGet([...assetIds])).filter((a): a is Asset => !!a);
  const manifestAssets: Manifest['assets'] = [];
  for (const [i, a] of assets.entries()) {
    onProgress?.(`Packing media ${i + 1}/${assets.length}`);
    const blob = (await db.assetBlobs.get(a.id))?.blob;
    if (!blob) continue;
    const path = `assets/${a.hash}.${EXT[a.mime] ?? 'bin'}`;
    zip.file(path, new Uint8Array(await blobToArrayBuffer(blob)));
    manifestAssets.push({ ...a, path });
  }
  const manifest: Manifest = {
    format: PACKAGE_FORMAT, formatVersion: PACKAGE_VERSION, appVersion: APP_VERSION, createdAt: Date.now(), kind: scope.kind,
    counts: { questions: questions.length, assets: manifestAssets.length, quizzes: quizzes.length, templates: templates.length },
    assets: manifestAssets,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('questions.json', JSON.stringify(questions));
  if (quizzes.length) zip.file('quiz.json', JSON.stringify({ quizzes, rounds, refs }));
  if (collections.length) zip.file('collections.json', JSON.stringify(collections));
  if (templates.length) zip.file('templates/templates.json', JSON.stringify(templates));
  onProgress?.('Compressing…');
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export class PackageError extends Error {
  constructor(message: string, public details: string[] = []) { super(message); }
}

export type ParsedPackage = {
  manifest: Manifest;
  questions: Question[];
  quizzes: Quiz[]; rounds: Round[]; refs: QuizQuestionRef[];
  collections: Collection[]; templates: Template[];
  assetBlobs: Map<string, Blob>;
  warnings: string[];
};

async function readJson<T>(zip: JSZip, path: string, schema: z.ZodType<T>, required: boolean): Promise<T | undefined> {
  const f = zip.file(path);
  if (!f) { if (required) throw new PackageError(`Missing ${path}`); return undefined; }
  const text = await f.async('string');
  if (text.length > LIMITS.maxJsonBytes) throw new PackageError(`${path} is too large`);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new PackageError(`${path} is not valid JSON`); }
  const r = schema.safeParse(raw);
  if (!r.success) throw new PackageError(`${path} failed validation`, r.error.issues.slice(0, 20).map((i) => `${i.path.join('.')}: ${i.message}`));
  return r.data;
}

/** Validates a package: structure, version, schemas, size limits, media existence & hashes, references, duplicate ids. */
export async function parsePackage(file: Blob): Promise<ParsedPackage> {
  if (file.size > LIMITS.maxTotalBytes) throw new PackageError('Archive exceeds the 2 GB size limit');
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(file); } catch { throw new PackageError('File is not a valid ZIP archive'); }
  const entries = Object.values(zip.files);
  if (entries.length > LIMITS.maxFiles) throw new PackageError(`Archive contains too many files (${entries.length})`);
  for (const e of entries) if (e.name.includes('..') || e.name.startsWith('/')) throw new PackageError(`Unsafe path in archive: ${e.name}`);
  const manifest = await readJson(zip, 'manifest.json', ManifestSchema, true) as Manifest;
  if (manifest.formatVersion > PACKAGE_VERSION) throw new PackageError(`Package format v${manifest.formatVersion} is newer than supported (v${PACKAGE_VERSION}). Update the app.`);
  const questions = (await readJson(zip, 'questions.json', z.array(QuestionSchema), true)) as Question[];
  const quizFile = await readJson(zip, 'quiz.json', QuizFileSchema, false);
  const collections = (await readJson(zip, 'collections.json', z.array(CollectionSchema), false)) ?? [];
  const templates = (await readJson(zip, 'templates/templates.json', z.array(TemplateSchema), false)) ?? [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const dup = (ids: string[], label: string) => { const s = new Set<string>(); for (const id of ids) { if (s.has(id)) errors.push(`Duplicate ${label} id ${id}`); s.add(id); } };
  dup(questions.map((q) => q.id), 'question'); dup(manifest.assets.map((a) => a.id), 'asset');
  if (quizFile) { dup(quizFile.quizzes.map((q) => q.id), 'quiz'); dup(quizFile.rounds.map((q) => q.id), 'round'); }

  const assetBlobs = new Map<string, Blob>();
  let total = 0;
  for (const a of manifest.assets) {
    const ext = a.path.split('.').pop() ?? '';
    if (!a.path.startsWith('assets/') || !ALLOWED_EXT.has(ext)) { errors.push(`Unexpected media path ${a.path}`); continue; }
    if (!/^(image|audio)\//.test(a.mime)) { errors.push(`Unsupported media type ${a.mime}`); continue; }
    const f = zip.file(a.path);
    if (!f) { errors.push(`Missing media file ${a.path}`); continue; }
    const bytes = await f.async('uint8array');
    total += bytes.length;
    if (bytes.length > LIMITS.maxAssetBytes || total > LIMITS.maxTotalBytes) throw new PackageError('Media files exceed size limits');
    const h = await sha256Hex(bytes);
    if (h !== a.hash) { errors.push(`Hash mismatch for ${a.path} (file corrupted or modified)`); continue; }
    assetBlobs.set(a.id, new Blob([bytes as BlobPart], { type: a.mime }));
  }
  const assetIds = new Set(manifest.assets.map((a) => a.id));
  for (const q of questions)
    for (const ref of collectAssetIds(q.scene, q.audio?.assetId))
      if (!assetIds.has(ref)) warnings.push(`Question "${q.title || q.correctAnswer || q.id}" references missing media ${ref}`);
  if (quizFile) {
    const qids = new Set(questions.map((q) => q.id)), rids = new Set(quizFile.rounds.map((r) => r.id)), quizIds = new Set(quizFile.quizzes.map((q) => q.id));
    for (const r of quizFile.rounds) if (!quizIds.has(r.quizId)) errors.push(`Round ${r.title} references unknown quiz`);
    for (const ref of quizFile.refs) if (!qids.has(ref.questionId) || !rids.has(ref.roundId)) errors.push(`Quiz reference ${ref.id} points to a missing question or round`);
  }
  if (errors.length) throw new PackageError(`Package validation failed with ${errors.length} problem(s)`, errors);
  return { manifest, questions, quizzes: quizFile?.quizzes ?? [], rounds: quizFile?.rounds ?? [], refs: quizFile?.refs ?? [], collections, templates, assetBlobs, warnings };
}

export type ImportResult = { questions: number; quizzes: number; assetsAdded: number; assetsReused: number; templates: number; collections: number; warnings: string[] };

/**
 * Imports a parsed package. Records whose ids already exist are imported as copies with new ids
 * (nothing existing is overwritten). Media is deduplicated by content hash.
 */
export async function importPackage(p: ParsedPackage): Promise<ImportResult> {
  const result: ImportResult = { questions: 0, quizzes: 0, assetsAdded: 0, assetsReused: 0, templates: 0, collections: 0, warnings: [...p.warnings] };
  const assetMap = new Map<string, string>();
  const qMap = new Map<string, string>(), quizMap = new Map<string, string>(), roundMap = new Map<string, string>(), colMap = new Map<string, string>(), tplMap = new Map<string, string>();
  await db.transaction('rw', [db.assets, db.assetBlobs, db.questions, db.summaries, db.quizzes, db.rounds, db.quizQuestionRefs, db.collections, db.templates], async () => {
    for (const a of p.manifest.assets) {
      const blob = p.assetBlobs.get(a.id);
      if (!blob) continue;
      const existing = await db.assets.where('hash').equals(a.hash).first();
      if (existing) { assetMap.set(a.id, existing.id); result.assetsReused++; continue; }
      const id = (await db.assets.get(a.id)) ? uid('a') : a.id;
      const { path: _path, ...asset } = a; void _path;
      await db.assets.add({ ...asset, id });
      await db.assetBlobs.put({ id, blob });
      assetMap.set(a.id, id); result.assetsAdded++;
    }
    for (const c of p.collections) {
      const exists = await db.collections.get(c.id);
      const sameName = await db.collections.where('name').equals(c.name).first();
      if (sameName) { colMap.set(c.id, sameName.id); continue; }
      const id = exists ? uid('c') : c.id;
      await db.collections.add({ ...c, id }); colMap.set(c.id, id); result.collections++;
    }
    const remapScene = <T extends { scene: Question['scene'] }>(x: T): T => {
      const s = structuredClone(x.scene);
      if (s.background.assetId) s.background.assetId = assetMap.get(s.background.assetId) ?? s.background.assetId;
      for (const l of s.layers) if (l.kind === 'image' && l.assetId) l.assetId = assetMap.get(l.assetId) ?? l.assetId;
      return { ...x, scene: s };
    };
    for (const t of p.templates) {
      const id = (await db.templates.get(t.id)) ? uid('t') : t.id;
      await db.templates.put(remapScene({ ...t, id, builtIn: false })); tplMap.set(t.id, id); result.templates++;
    }
    for (const q of p.questions) {
      const id = (await db.questions.get(q.id)) ? uid('q') : q.id;
      qMap.set(q.id, id);
      const next = remapScene({
        ...q, id,
        audio: q.audio ? { ...q.audio, assetId: assetMap.get(q.audio.assetId) ?? q.audio.assetId } : null,
        collectionIds: q.collectionIds.map((c) => colMap.get(c)).filter((c): c is string => !!c),
        templateId: q.templateId ? tplMap.get(q.templateId) ?? q.templateId : null,
      });
      next.mediaReferences = collectAssetIds(next.scene, next.audio?.assetId);
      await db.questions.put(next);
      await db.summaries.put(summarize(next));
      result.questions++;
    }
    for (const qz of p.quizzes) {
      const id = (await db.quizzes.get(qz.id)) ? uid('quiz') : qz.id;
      quizMap.set(qz.id, id);
      await db.quizzes.put({ ...qz, id, updatedAt: Date.now() }); result.quizzes++;
    }
    for (const r of p.rounds) {
      const id = (await db.rounds.get(r.id)) ? uid('rnd') : r.id;
      roundMap.set(r.id, id);
      await db.rounds.put({ ...r, id, quizId: quizMap.get(r.quizId) ?? r.quizId });
    }
    for (const ref of p.refs) {
      await db.quizQuestionRefs.put({ ...ref, id: uid('ref'), quizId: quizMap.get(ref.quizId) ?? ref.quizId, roundId: roundMap.get(ref.roundId) ?? ref.roundId, questionId: qMap.get(ref.questionId) ?? ref.questionId });
    }
  });
  return result;
}

/** Data-only JSON export (no media bytes). */
export async function exportQuestionsJson(ids: string[]): Promise<Blob> {
  const qs = (await db.questions.bulkGet(ids)).filter(Boolean);
  return new Blob([JSON.stringify({ format: 'quizmaster-questions', formatVersion: 1, exportedAt: Date.now(), note: 'Media files are not included; use ZIP export for portable packages.', questions: qs }, null, 2)], { type: 'application/json' });
}

/** Imports a data-only JSON export. */
export async function importQuestionsJson(text: string): Promise<number> {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new PackageError('Not valid JSON'); }
  const r = z.object({ questions: z.array(QuestionSchema) }).safeParse(raw);
  if (!r.success) throw new PackageError('JSON does not contain valid questions', r.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`));
  let n = 0;
  await db.transaction('rw', db.questions, db.summaries, async () => {
    for (const q of r.data.questions) {
      const id = (await db.questions.get(q.id)) ? uid('q') : q.id;
      const next = { ...q, id };
      await db.questions.put(next); await db.summaries.put(summarize(next)); n++;
    }
  });
  return n;
}
