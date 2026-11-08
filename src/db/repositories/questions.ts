import { db } from '@/db/database';
import type { GameType, Question, QuestionSummary, Revision } from '@/types/schema';
import { QuestionSchema } from '@/types/schema';
import { collectAssetIds } from '@/engines/scene/factories';
import { uid } from '@/utils/id';
import { questionDisplayTitle } from '@/games/registry';
import { docToPlainText } from '@/engines/scene/factories';

export class ConflictError extends Error {
  constructor(public current: Question) { super('This question was modified elsewhere (newer version in the database).'); }
}
export class ValidationError extends Error {}

export function summarize(q: Question): QuestionSummary {
  const texts: string[] = [q.title, q.correctAnswer, ...q.acceptedAnswers, ...q.tags, q.prompt, q.notes, ...q.hints.map((h) => h.text)];
  for (const l of q.scene.layers) {
    if (l.kind === 'text') texts.push(docToPlainText(l.doc));
    if (l.kind === 'search') texts.push(...l.entries.map((e) => e.text));
    if (l.kind === 'dialogue') texts.push(...l.lines.map((e) => e.text));
    if (l.kind === 'emoji') texts.push(l.emoji);
  }
  return {
    id: q.id, gameType: q.gameType, title: questionDisplayTitle(q), correctAnswer: q.correctAnswer,
    status: q.status, difficulty: q.difficulty, points: q.points, tags: q.tags, collectionIds: q.collectionIds,
    searchText: texts.join(' ').toLowerCase(), createdAt: q.createdAt, updatedAt: q.updatedAt,
  };
}

function prepare(q: Question): Question {
  return { ...q, mediaReferences: collectAssetIds(q.scene, q.audio?.assetId) };
}

export function validateQuestion(q: unknown): Question {
  const r = QuestionSchema.safeParse(q);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

const REVISION_INTERVAL = 5 * 60 * 1000;
const MAX_REVISIONS = 50;

export const questionsRepo = {
  async get(id: string) { return db.questions.get(id); },
  async getMany(ids: string[]) { return (await db.questions.bulkGet(ids)).filter((q): q is Question => !!q); },
  async count() { return db.questions.count(); },

  async create(q: Question): Promise<Question> {
    const v = prepare(validateQuestion(q));
    await db.transaction('rw', db.questions, db.summaries, async () => {
      await db.questions.add(v);
      await db.summaries.put(summarize(v));
    });
    return v;
  },

  /**
   * Saves with optimistic concurrency: `expectedVersion` must match the stored version, otherwise a
   * ConflictError is thrown so newer changes are never silently overwritten.
   */
  async save(q: Question, opts: { expectedVersion?: number; force?: boolean; revisionReason?: string } = {}): Promise<Question> {
    const v = prepare(validateQuestion(q));
    return db.transaction('rw', db.questions, db.summaries, db.revisions, async () => {
      const cur = await db.questions.get(v.id);
      if (cur && !opts.force && opts.expectedVersion !== undefined && cur.version !== opts.expectedVersion) throw new ConflictError(cur);
      const next: Question = { ...v, version: (cur?.version ?? 0) + 1, updatedAt: Date.now(), createdAt: cur?.createdAt ?? v.createdAt };
      await db.questions.put(next);
      await db.summaries.put(summarize(next));
      // persistent revision history (separate from undo/redo)
      const last = await db.revisions.where('[questionId+createdAt]').between([v.id, 0], [v.id, Infinity]).last();
      if (opts.revisionReason || !last || Date.now() - last.createdAt > REVISION_INTERVAL) {
        await db.revisions.add({ id: uid('r'), questionId: v.id, version: next.version, createdAt: Date.now(), reason: opts.revisionReason ?? 'Autosave checkpoint', snapshot: next });
        const all = await db.revisions.where('questionId').equals(v.id).sortBy('createdAt');
        if (all.length > MAX_REVISIONS) await db.revisions.bulkDelete(all.slice(0, all.length - MAX_REVISIONS).map((r) => r.id));
      }
      return next;
    });
  },

  async duplicate(id: string): Promise<Question> {
    const q = await db.questions.get(id);
    if (!q) throw new Error('Question not found');
    const now = Date.now();
    const copy: Question = { ...structuredClone(q), id: uid('q'), title: q.title ? `${q.title} (copy)` : '', status: 'draft', statusBeforeArchive: null, createdAt: now, updatedAt: now, version: 1 };
    return this.create(copy);
  },

  /** Deletes questions. Media assets are shared and are NOT deleted. Quiz references are removed. */
  async remove(ids: string[]) {
    await db.transaction('rw', [db.questions, db.summaries, db.thumbnails, db.revisions, db.quizQuestionRefs], async () => {
      await db.questions.bulkDelete(ids);
      await db.summaries.bulkDelete(ids);
      await db.thumbnails.bulkDelete(ids);
      await db.revisions.where('questionId').anyOf(ids).delete();
      await db.quizQuestionRefs.where('questionId').anyOf(ids).delete();
    });
  },

  async archive(ids: string[]) {
    await this.bulkUpdate(ids, (q) => (q.status === 'archived' ? q : { ...q, statusBeforeArchive: q.status, status: 'archived' }));
  },
  async restore(ids: string[]) {
    await this.bulkUpdate(ids, (q) => (q.status !== 'archived' ? q : { ...q, status: q.statusBeforeArchive ?? 'draft', statusBeforeArchive: null }));
  },

  async bulkUpdate(ids: string[], fn: (q: Question) => Question) {
    await db.transaction('rw', db.questions, db.summaries, async () => {
      const qs = (await db.questions.bulkGet(ids)).filter((q): q is Question => !!q);
      const now = Date.now();
      const next = qs.map((q) => prepare({ ...fn(q), version: q.version + 1, updatedAt: now }));
      await db.questions.bulkPut(next);
      await db.summaries.bulkPut(next.map(summarize));
    });
  },

  async bulkDuplicate(ids: string[]) {
    const out: Question[] = [];
    for (const id of ids) out.push(await this.duplicate(id));
    return out;
  },

  async listSummaries(): Promise<QuestionSummary[]> {
    return db.summaries.orderBy('updatedAt').reverse().toArray();
  },
  async recent(limit = 10): Promise<QuestionSummary[]> {
    return db.summaries.orderBy('updatedAt').reverse().limit(limit).toArray();
  },
  async countByGame(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    await db.summaries.each((s) => { out[s.gameType] = (out[s.gameType] ?? 0) + 1; });
    return out;
  },

  async revisions(id: string): Promise<Revision[]> {
    return (await db.revisions.where('questionId').equals(id).sortBy('createdAt')).reverse();
  },
  async restoreRevision(revisionId: string): Promise<Question> {
    const r = await db.revisions.get(revisionId);
    if (!r) throw new Error('Revision not found');
    return this.save(r.snapshot, { force: true, revisionReason: `Restored revision v${r.version}` });
  },

  async setThumbnail(id: string, blob: Blob) {
    await db.thumbnails.put({ id, blob, updatedAt: Date.now() });
  },
  async getThumbnail(id: string) { return db.thumbnails.get(id); },
};

export type QuestionFilter = {
  search?: string;
  gameTypes?: GameType[];
  difficulty?: string[];
  status?: string[];
  tags?: string[];
  collectionId?: string | null;
  includeArchived?: boolean;
  sort?: 'updated' | 'created' | 'title' | 'difficulty' | 'points';
  sortDir?: 'asc' | 'desc';
};

const DIFF_ORDER = { easy: 0, medium: 1, hard: 2, expert: 3 } as const;

/** Pure in-memory filter over summaries; fast for 10k+ rows. */
export function filterSummaries(rows: QuestionSummary[], f: QuestionFilter): QuestionSummary[] {
  const terms = (f.search ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  let out = rows.filter((r) => {
    if (!f.includeArchived && r.status === 'archived' && !(f.status?.includes('archived'))) return false;
    if (f.gameTypes?.length && !f.gameTypes.includes(r.gameType)) return false;
    if (f.difficulty?.length && !f.difficulty.includes(r.difficulty)) return false;
    if (f.status?.length && !f.status.includes(r.status)) return false;
    if (f.tags?.length && !f.tags.every((t) => r.tags.includes(t))) return false;
    if (f.collectionId && !r.collectionIds.includes(f.collectionId)) return false;
    for (const t of terms) if (!r.searchText.includes(t)) return false;
    return true;
  });
  const dir = f.sortDir === 'asc' ? 1 : -1;
  const s = f.sort ?? 'updated';
  out = out.sort((a, b) => {
    switch (s) {
      case 'title': return a.title.localeCompare(b.title) * dir;
      case 'created': return (a.createdAt - b.createdAt) * dir;
      case 'difficulty': return (DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty]) * dir;
      case 'points': return (a.points - b.points) * dir;
      default: return (a.updatedAt - b.updatedAt) * dir;
    }
  });
  return out;
}
