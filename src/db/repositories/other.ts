import { db } from '@/db/database';
import type { Collection, Quiz, QuizQuestionRef, Round, Template } from '@/types/schema';
import { TemplateSchema } from '@/types/schema';
import { uid } from '@/utils/id';
import { BUILTIN_TEMPLATES } from '@/games/builtinTemplates';
import type { GameType } from '@/types/schema';

export const templatesRepo = {
  async list(gameType?: GameType): Promise<Template[]> {
    const user = gameType ? await db.templates.where('gameType').equals(gameType).toArray() : await db.templates.toArray();
    const builtIn = BUILTIN_TEMPLATES.filter((t) => !gameType || t.gameType === gameType);
    const usage = new Map((await db.settings.get('templateUsage'))?.value as [string, number][] ?? []);
    return [...builtIn.map((t) => ({ ...t, lastUsedAt: usage.get(t.id) ?? null })), ...user.sort((a, b) => a.name.localeCompare(b.name))];
  },
  async get(id: string): Promise<Template | undefined> {
    return BUILTIN_TEMPLATES.find((t) => t.id === id) ?? db.templates.get(id);
  },
  async save(t: Template) {
    if (t.builtIn) throw new Error('Built-in templates cannot be modified; duplicate it first.');
    const v = TemplateSchema.parse({ ...t, updatedAt: Date.now() });
    await db.templates.put(v);
    return v;
  },
  async duplicate(id: string) {
    const t = await this.get(id);
    if (!t) throw new Error('Template not found');
    const now = Date.now();
    const copy: Template = { ...structuredClone(t), id: uid('t'), name: `${t.name} (copy)`, builtIn: false, createdAt: now, updatedAt: now, lastUsedAt: null };
    await db.templates.put(copy);
    return copy;
  },
  async rename(id: string, name: string) { await db.templates.where('id').equals(id).modify((t) => { t.name = name; t.updatedAt = Date.now(); }); },
  async remove(id: string) {
    if (id.startsWith('builtin:')) throw new Error('Built-in templates cannot be deleted');
    await db.templates.delete(id);
  },
  async markUsed(id: string) {
    const row = await db.settings.get('templateUsage');
    const m = new Map((row?.value as [string, number][]) ?? []);
    m.set(id, Date.now());
    await db.settings.put({ key: 'templateUsage', value: [...m] });
    if (!id.startsWith('builtin:')) await db.templates.where('id').equals(id).modify((t) => { t.lastUsedAt = Date.now(); });
  },
  async recentlyUsed(limit = 5): Promise<Template[]> {
    const all = await this.list();
    return all.filter((t) => t.lastUsedAt).sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)).slice(0, limit);
  },
};

export const collectionsRepo = {
  async list() { return db.collections.orderBy('name').toArray(); },
  async create(name: string, description = '', color = '#f59e0b'): Promise<Collection> {
    const now = Date.now();
    const c: Collection = { id: uid('c'), name, description, color, createdAt: now, updatedAt: now };
    await db.collections.add(c);
    return c;
  },
  async update(id: string, patch: Partial<Collection>) { await db.collections.update(id, { ...patch, updatedAt: Date.now() }); },
  async remove(id: string) {
    await db.transaction('rw', db.collections, db.questions, db.summaries, async () => {
      await db.collections.delete(id);
      const qs = await db.questions.where('collectionIds').equals(id).toArray();
      for (const q of qs) {
        const next = { ...q, collectionIds: q.collectionIds.filter((c) => c !== id) };
        await db.questions.put(next);
        await db.summaries.update(q.id, { collectionIds: next.collectionIds });
      }
    });
  },
  async counts(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    await db.summaries.each((s) => s.collectionIds.forEach((c) => { out[c] = (out[c] ?? 0) + 1; }));
    return out;
  },
};

export type QuizTree = { quiz: Quiz; rounds: (Round & { refs: QuizQuestionRef[] })[] };

export const quizzesRepo = {
  async list() { return db.quizzes.orderBy('updatedAt').reverse().toArray(); },
  async get(id: string) { return db.quizzes.get(id); },
  async create(title: string): Promise<Quiz> {
    const now = Date.now();
    const q: Quiz = {
      id: uid('quiz'), title, description: '',
      theme: { accent: '#f59e0b', background: '#0f172a', font: 'Inter' },
      settings: { showQuestionNumbers: true, autoStartTimer: false, showRoundTransitions: true },
      createdAt: now, updatedAt: now,
    };
    await db.quizzes.add(q);
    await this.addRound(q.id, 'Round 1');
    return q;
  },
  async update(id: string, patch: Partial<Quiz>) { await db.quizzes.update(id, { ...patch, updatedAt: Date.now() }); },
  async remove(id: string) {
    await db.transaction('rw', db.quizzes, db.rounds, db.quizQuestionRefs, async () => {
      await db.quizzes.delete(id);
      await db.rounds.where('quizId').equals(id).delete();
      await db.quizQuestionRefs.where('quizId').equals(id).delete();
    });
  },
  async tree(id: string): Promise<QuizTree | undefined> {
    const quiz = await db.quizzes.get(id);
    if (!quiz) return undefined;
    const rounds = await db.rounds.where('quizId').equals(id).sortBy('order');
    const refs = await db.quizQuestionRefs.where('quizId').equals(id).toArray();
    return { quiz, rounds: rounds.map((r) => ({ ...r, refs: refs.filter((x) => x.roundId === r.id).sort((a, b) => a.order - b.order) })) };
  },
  async addRound(quizId: string, title: string): Promise<Round> {
    const count = await db.rounds.where('quizId').equals(quizId).count();
    const r: Round = {
      id: uid('rnd'), quizId, order: count, title, description: '',
      scoring: { pointsMultiplier: 1, negativeMarking: false, bonusFirstCorrect: 0 },
      defaultTimeLimit: 30, transition: { show: true, subtitle: '' },
    };
    await db.rounds.add(r);
    await this.touch(quizId);
    return r;
  },
  async updateRound(id: string, patch: Partial<Round>) {
    await db.rounds.update(id, patch);
    const r = await db.rounds.get(id);
    if (r) await this.touch(r.quizId);
  },
  async removeRound(id: string) {
    const r = await db.rounds.get(id);
    await db.transaction('rw', db.rounds, db.quizQuestionRefs, async () => {
      await db.rounds.delete(id);
      await db.quizQuestionRefs.where('roundId').equals(id).delete();
    });
    if (r) await this.normalizeRoundOrder(r.quizId);
  },
  async duplicateRound(id: string) {
    const r = await db.rounds.get(id);
    if (!r) return;
    const refs = await db.quizQuestionRefs.where('roundId').equals(id).toArray();
    const copy: Round = { ...structuredClone(r), id: uid('rnd'), title: `${r.title} (copy)`, order: r.order + 0.5 };
    await db.transaction('rw', db.rounds, db.quizQuestionRefs, async () => {
      await db.rounds.add(copy);
      await db.quizQuestionRefs.bulkAdd(refs.map((x) => ({ ...x, id: uid('ref'), roundId: copy.id })));
    });
    await this.normalizeRoundOrder(r.quizId);
  },
  async reorderRounds(quizId: string, orderedIds: string[]) {
    await db.transaction('rw', db.rounds, async () => { for (const [i, id] of orderedIds.entries()) await db.rounds.update(id, { order: i }); });
    await this.touch(quizId);
  },
  async normalizeRoundOrder(quizId: string) {
    const rs = await db.rounds.where('quizId').equals(quizId).sortBy('order');
    await this.reorderRounds(quizId, rs.map((r) => r.id));
  },
  /** Adds question references (no media is duplicated — questions are referenced, not copied). */
  async addQuestions(roundId: string, questionIds: string[], atIndex?: number) {
    const r = await db.rounds.get(roundId);
    if (!r) throw new Error('Round not found');
    const refs = await db.quizQuestionRefs.where('roundId').equals(roundId).sortBy('order');
    const ids = refs.map((x) => x.questionId);
    const newRefs: QuizQuestionRef[] = questionIds.map((qid) => ({ id: uid('ref'), quizId: r.quizId, roundId, questionId: qid, order: 0 }));
    const all = [...refs];
    all.splice(atIndex ?? all.length, 0, ...newRefs);
    void ids;
    await db.transaction('rw', db.quizQuestionRefs, async () => {
      await db.quizQuestionRefs.bulkPut(all.map((x, i) => ({ ...x, order: i })));
    });
    await this.touch(r.quizId);
  },
  async removeRef(refId: string) {
    const ref = await db.quizQuestionRefs.get(refId);
    await db.quizQuestionRefs.delete(refId);
    if (ref) await this.reorderRefs(ref.roundId, (await db.quizQuestionRefs.where('roundId').equals(ref.roundId).sortBy('order')).map((x) => x.id));
  },
  /** Moves a reference to a (possibly different) round at a given index. */
  async moveRef(refId: string, toRoundId: string, toIndex: number) {
    const ref = await db.quizQuestionRefs.get(refId);
    if (!ref) return;
    const fromRound = ref.roundId;
    const target = (await db.quizQuestionRefs.where('roundId').equals(toRoundId).sortBy('order')).filter((x) => x.id !== refId);
    target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, { ...ref, roundId: toRoundId });
    await db.transaction('rw', db.quizQuestionRefs, async () => {
      await db.quizQuestionRefs.bulkPut(target.map((x, i) => ({ ...x, order: i })));
    });
    if (fromRound !== toRoundId) {
      const src = await db.quizQuestionRefs.where('roundId').equals(fromRound).sortBy('order');
      await this.reorderRefs(fromRound, src.map((x) => x.id));
    }
    await this.touch(ref.quizId);
  },
  async reorderRefs(roundId: string, orderedRefIds: string[]) {
    void roundId;
    await db.transaction('rw', db.quizQuestionRefs, async () => { for (const [i, id] of orderedRefIds.entries()) await db.quizQuestionRefs.update(id, { order: i }); });
  },
  async touch(quizId: string) { await db.quizzes.update(quizId, { updatedAt: Date.now() }); },
  async quizzesForQuestion(questionId: string) {
    const refs = await db.quizQuestionRefs.where('questionId').equals(questionId).toArray();
    return [...new Set(refs.map((r) => r.quizId))];
  },
};

export const settingsRepo = {
  async get<T>(key: string, fallback: T): Promise<T> { return ((await db.settings.get(key))?.value as T) ?? fallback; },
  async set(key: string, value: unknown) { await db.settings.put({ key, value }); },
};
