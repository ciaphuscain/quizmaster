// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { useDatabase, db } from '@/db/database';
import { questionsRepo, ConflictError, filterSummaries, ValidationError } from '@/db/repositories/questions';
import { assetsRepo } from '@/db/repositories/assets';
import { collectionsRepo, quizzesRepo, templatesRepo } from '@/db/repositories/other';
import { createQuestion } from '@/games/registry';
import { applyTemplate, questionFromTemplate, templateFromQuestion } from '@/games/applyTemplate';
import { BUILTIN_TEMPLATES } from '@/games/builtinTemplates';
import { GAME_TYPES } from '@/types/schema';
import { buildPackage, importPackage, parsePackage, PackageError } from '@/engines/export/package';
import JSZip from 'jszip';

const probe = async () => ({ width: 10, height: 10 });
const png = (seed: number) => new Blob([new Uint8Array([137, 80, 78, 71, seed, 1, 2, 3])], { type: 'image/png' });

let n = 0;
beforeEach(async () => { useDatabase(`test-${Date.now()}-${n++}`); await db.open(); });

describe('questions repository', () => {
  it('creates valid default questions for all 13 game types and persists them', async () => {
    for (const g of GAME_TYPES) await questionsRepo.create(createQuestion(g, { correctAnswer: `Answer ${g}` }));
    expect(await questionsRepo.count()).toBe(13);
    const sums = await questionsRepo.listSummaries();
    expect(new Set(sums.map((s) => s.gameType)).size).toBe(13);
  });
  it('rejects invalid questions', async () => {
    const q = createQuestion('logo-normal');
    await expect(questionsRepo.create({ ...q, content: { gameType: 'country-flag', iso3: null, hideName: true } })).rejects.toBeInstanceOf(ValidationError);
  });
  it('saves with version increments and detects conflicting writes', async () => {
    const q = await questionsRepo.create(createQuestion('logo-normal', { correctAnswer: 'Apple' }));
    const s1 = await questionsRepo.save({ ...q, correctAnswer: 'Apple Inc' }, { expectedVersion: 1 });
    expect(s1.version).toBe(2);
    await expect(questionsRepo.save({ ...q, correctAnswer: 'Stale' }, { expectedVersion: 1 })).rejects.toBeInstanceOf(ConflictError);
    expect((await questionsRepo.get(q.id))?.correctAnswer).toBe('Apple Inc');
  });
  it('records revisions and restores them', async () => {
    const q = await questionsRepo.create(createQuestion('movie-emojis', { correctAnswer: 'Jaws' }));
    await questionsRepo.save({ ...q, correctAnswer: 'Jaws' }, { revisionReason: 'Manual save' });
    const cur = (await questionsRepo.get(q.id))!;
    await questionsRepo.save({ ...cur, correctAnswer: 'Jaws 2' }, { revisionReason: 'Manual save' });
    const revs = await questionsRepo.revisions(q.id);
    expect(revs.length).toBe(2);
    const restored = await questionsRepo.restoreRevision(revs[1].id);
    expect(restored.correctAnswer).toBe('Jaws');
  });
  it('duplicates, archives, restores and bulk-deletes', async () => {
    const q = await questionsRepo.create(createQuestion('logo-normal', { title: 'Nike', status: 'published' }));
    const d = await questionsRepo.duplicate(q.id);
    expect(d.id).not.toBe(q.id); expect(d.title).toBe('Nike (copy)'); expect(d.status).toBe('draft');
    await questionsRepo.archive([q.id]);
    expect((await questionsRepo.get(q.id))?.status).toBe('archived');
    await questionsRepo.restore([q.id]);
    expect((await questionsRepo.get(q.id))?.status).toBe('published');
    await questionsRepo.remove([q.id, d.id]);
    expect(await questionsRepo.count()).toBe(0);
  });
  it('filters and searches summaries', async () => {
    await questionsRepo.create(createQuestion('logo-normal', { correctAnswer: 'Nike', tags: ['sport'], difficulty: 'easy' }));
    await questionsRepo.create(createQuestion('movie-emojis', { correctAnswer: 'Titanic', difficulty: 'hard' }));
    const rows = await questionsRepo.listSummaries();
    expect(filterSummaries(rows, { search: 'nik' }).map((r) => r.correctAnswer)).toEqual(['Nike']);
    expect(filterSummaries(rows, { gameTypes: ['movie-emojis'] })).toHaveLength(1);
    expect(filterSummaries(rows, { difficulty: ['hard'] })[0].correctAnswer).toBe('Titanic');
    expect(filterSummaries(rows, { tags: ['sport'] })).toHaveLength(1);
    expect(filterSummaries(rows, { sort: 'title', sortDir: 'asc' }).map((r) => r.title)).toEqual(['Nike', 'Titanic']);
  });
});

describe('assets', () => {
  it('deduplicates by content hash and tracks references', async () => {
    const a = await assetsRepo.importBlob(png(1), 'logo.png', { probe });
    const b = await assetsRepo.importBlob(png(1), 'logo-again.png', { probe });
    expect(b.deduplicated).toBe(true); expect(b.asset.id).toBe(a.asset.id);
    const q = createQuestion('logo-normal');
    const l = q.scene.layers.find((x) => x.kind === 'image');
    if (l?.kind === 'image') l.assetId = a.asset.id;
    const saved = await questionsRepo.create(q);
    expect(saved.mediaReferences).toEqual([a.asset.id]);
    expect(await assetsRepo.references(a.asset.id)).toEqual([q.id]);
    await expect(assetsRepo.remove(a.asset.id)).rejects.toThrow(/referenced/);
    // deleting the question keeps the shared asset
    await questionsRepo.remove([q.id]);
    expect(await assetsRepo.get(a.asset.id)).toBeTruthy();
  });
  it('rejects unsupported types', async () => {
    await expect(assetsRepo.importBlob(new Blob(['x'], { type: 'text/plain' }), 'x.txt', { probe })).rejects.toThrow(/Unsupported/);
  });
});

describe('templates', () => {
  it('provides built-in templates for all 13 games', () => {
    for (const g of GAME_TYPES) expect(BUILTIN_TEMPLATES.some((t) => t.gameType === g)).toBe(true);
  });
  it('applies a template without mutating the template and keeps question media/identity', () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === 'builtin:alt-heavy-blur')!;
    const before = JSON.stringify(t);
    const q = createQuestion('logo-altered', { correctAnswer: 'Shell' });
    const img = q.scene.layers.find((l) => l.kind === 'image');
    if (img?.kind === 'image') img.assetId = 'asset1';
    if (q.content.gameType === 'logo-altered') q.content.brand = 'Shell';
    const applied = applyTemplate(q, t);
    expect(JSON.stringify(t)).toBe(before);
    const ai = applied.scene.layers.find((l) => l.kind === 'image');
    expect(ai?.kind === 'image' && ai.assetId).toBe('asset1');
    expect(ai?.kind === 'image' && ai.effects[0].type).toBe('blur');
    expect(applied.content.gameType === 'logo-altered' && applied.content.brand).toBe('Shell');
    expect(applied.scene.layers[0].id).not.toBe(t.scene.layers[0].id);
    // editing the applied question doesn't touch the template
    if (ai?.kind === 'image') ai.effects[0].params.radius = 9;
    expect(JSON.stringify(t)).toBe(before);
  });
  it('saves user templates and creates questions from them', async () => {
    const q = createQuestion('movie-search-history', { points: 25, tags: ['movies'] });
    const t = templateFromQuestion(q, 'My search');
    await templatesRepo.save(t);
    expect((await templatesRepo.list('movie-search-history')).some((x) => x.id === t.id)).toBe(true);
    const nq = questionFromTemplate(t);
    expect(nq.points).toBe(25); expect(nq.templateId).toBe(t.id);
    await expect(templatesRepo.remove('builtin:search-stack')).rejects.toThrow();
    const dup = await templatesRepo.duplicate('builtin:search-stack');
    expect(dup.builtIn).toBe(false);
  });
  it('song templates apply audio operations', () => {
    const t = BUILTIN_TEMPLATES.find((x) => x.id === 'builtin:song-rev-10')!;
    const q = createQuestion('song-backwards', { audio: { assetId: 'a', ops: [] } });
    const applied = applyTemplate(q, t);
    expect(applied.audio?.ops.map((o) => o.type)).toEqual(['trim', 'reverse']);
  });
});

describe('collections and quizzes', () => {
  it('a question can belong to multiple collections; deleting a collection unlinks it', async () => {
    const c1 = await collectionsRepo.create('Movie Night');
    const c2 = await collectionsRepo.create('Difficult');
    const q = await questionsRepo.create(createQuestion('movie-emojis', { collectionIds: [c1.id, c2.id] }));
    expect((await collectionsRepo.counts())[c1.id]).toBe(1);
    await collectionsRepo.remove(c1.id);
    expect((await questionsRepo.get(q.id))?.collectionIds).toEqual([c2.id]);
  });
  it('builds a quiz with rounds, moves questions between rounds, and duplicates rounds', async () => {
    const qs = await Promise.all([1, 2, 3].map((i) => questionsRepo.create(createQuestion('logo-normal', { correctAnswer: `Q${i}` }))));
    const quiz = await quizzesRepo.create('Pub quiz');
    let tree = (await quizzesRepo.tree(quiz.id))!;
    const r1 = tree.rounds[0];
    const r2 = await quizzesRepo.addRound(quiz.id, 'Round 2');
    await quizzesRepo.addQuestions(r1.id, qs.map((q) => q.id));
    tree = (await quizzesRepo.tree(quiz.id))!;
    expect(tree.rounds[0].refs.map((r) => r.questionId)).toEqual(qs.map((q) => q.id));
    await quizzesRepo.moveRef(tree.rounds[0].refs[0].id, r2.id, 0);
    tree = (await quizzesRepo.tree(quiz.id))!;
    expect(tree.rounds[0].refs).toHaveLength(2);
    expect(tree.rounds[1].refs[0].questionId).toBe(qs[0].id);
    expect(tree.rounds[0].refs.map((r) => r.order)).toEqual([0, 1]);
    await quizzesRepo.duplicateRound(r2.id);
    tree = (await quizzesRepo.tree(quiz.id))!;
    expect(tree.rounds).toHaveLength(3);
    // the same question can appear in multiple quizzes
    const quiz2 = await quizzesRepo.create('Second');
    const t2 = (await quizzesRepo.tree(quiz2.id))!;
    await quizzesRepo.addQuestions(t2.rounds[0].id, [qs[0].id]);
    expect((await quizzesRepo.quizzesForQuestion(qs[0].id)).sort()).toEqual([quiz.id, quiz2.id].sort());
  });
});

describe('portable ZIP package', () => {
  it('round-trips quiz, questions and media into a clean database', async () => {
    const { asset } = await assetsRepo.importBlob(png(7), 'logo.png', { probe });
    const q = createQuestion('logo-altered', { correctAnswer: 'Shell', acceptedAnswers: ['Shell plc'] });
    const img = q.scene.layers.find((l) => l.kind === 'image');
    if (img?.kind === 'image') { img.assetId = asset.id; img.effects = BUILTIN_TEMPLATES.find((t) => t.id === 'builtin:alt-pixelated')!.scene.layers.flatMap((l) => (l.kind === 'image' ? l.effects : [])); }
    await questionsRepo.create(q);
    const quiz = await quizzesRepo.create('Export me');
    const tree = (await quizzesRepo.tree(quiz.id))!;
    await quizzesRepo.addQuestions(tree.rounds[0].id, [q.id]);
    const blob = await buildPackage({ kind: 'quiz', quizIds: [quiz.id] });

    useDatabase(`clean-${Date.now()}`); await db.open();
    expect(await questionsRepo.count()).toBe(0);
    const parsed = await parsePackage(blob);
    expect(parsed.manifest.counts).toMatchObject({ questions: 1, assets: 1, quizzes: 1 });
    const res = await importPackage(parsed);
    expect(res).toMatchObject({ questions: 1, quizzes: 1, assetsAdded: 1 });
    const back = (await questionsRepo.get(q.id))!;
    expect(back.correctAnswer).toBe('Shell');
    expect(back.acceptedAnswers).toEqual(['Shell plc']);
    const bi = back.scene.layers.find((l) => l.kind === 'image');
    expect(bi?.kind === 'image' && bi.effects[0].type).toBe('pixelate');
    const blobBack = await assetsRepo.getBlob(asset.id);
    expect(new Uint8Array(await blobBack!.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71, 7, 1, 2, 3]));
    const t2 = (await quizzesRepo.tree(quiz.id))!;
    expect(t2.rounds[0].refs[0].questionId).toBe(q.id);
    // importing again creates copies rather than overwriting, and reuses media
    const res2 = await importPackage(await parsePackage(blob));
    expect(res2.assetsReused).toBe(1);
    expect(await questionsRepo.count()).toBe(2);
  });
  it('rejects tampered or malformed packages', async () => {
    await expect(parsePackage(new Blob(['not a zip']))).rejects.toBeInstanceOf(PackageError);
    const zip = new JSZip();
    zip.file('manifest.json', JSON.stringify({ format: 'quizmaster-package', formatVersion: 1, appVersion: '0', createdAt: 0, kind: 'questions', counts: { questions: 0, assets: 1, quizzes: 0, templates: 0 }, assets: [{ id: 'a1', hash: 'deadbeef', path: 'assets/x.png', name: 'x', type: 'image', mime: 'image/png', size: 3, tags: [], createdAt: 0 }] }));
    zip.file('questions.json', '[]');
    zip.file('assets/x.png', new Uint8Array([1, 2, 3]));
    await expect(parsePackage(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/validation failed/);
    const zip2 = new JSZip();
    zip2.file('manifest.json', '{"format":"other"}');
    await expect(parsePackage(await zip2.generateAsync({ type: 'blob' }))).rejects.toThrow(/manifest/);
  });
});
