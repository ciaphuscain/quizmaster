import Dexie, { type Table } from 'dexie';
import type {
  Asset, Collection, Question, QuestionSummary, Quiz, QuizQuestionRef, Revision, Round, Template,
} from '@/types/schema';

export type AssetBlob = { id: string; blob: Blob };
export type Thumbnail = { id: string; blob: Blob; updatedAt: number };
export type SettingRow = { key: string; value: unknown };

export const DB_NAME = 'quizmaster-studio';

export class QuizmasterDB extends Dexie {
  questions!: Table<Question, string>;
  summaries!: Table<QuestionSummary, string>;
  assets!: Table<Asset, string>;
  assetBlobs!: Table<AssetBlob, string>;
  assetThumbs!: Table<Thumbnail, string>;
  thumbnails!: Table<Thumbnail, string>;
  templates!: Table<Template, string>;
  collections!: Table<Collection, string>;
  quizzes!: Table<Quiz, string>;
  rounds!: Table<Round, string>;
  quizQuestionRefs!: Table<QuizQuestionRef, string>;
  revisions!: Table<Revision, string>;
  settings!: Table<SettingRow, string>;

  constructor(name = DB_NAME) {
    super(name);
    // v1: initial schema. Add new versions below; never edit a shipped version.
    this.version(1).stores({
      questions: 'id, gameType, status, updatedAt, *mediaReferences, *collectionIds',
      summaries: 'id, gameType, status, difficulty, updatedAt, createdAt, title, *tags, *collectionIds',
      assets: 'id, &hash, type, name, createdAt, *tags',
      assetBlobs: 'id',
      assetThumbs: 'id',
      thumbnails: 'id',
      templates: 'id, gameType, name, updatedAt, lastUsedAt',
      collections: 'id, name',
      quizzes: 'id, title, updatedAt',
      rounds: 'id, quizId, order',
      quizQuestionRefs: 'id, quizId, roundId, questionId, order',
      revisions: 'id, questionId, createdAt, [questionId+createdAt]',
      settings: 'key',
    });
    // v2: adds templateId index on questions for "recently used templates" + upgrade backfill.
    this.version(2)
      .stores({ questions: 'id, gameType, status, updatedAt, templateId, *mediaReferences, *collectionIds' })
      .upgrade(async (tx) => {
        await tx.table('questions').toCollection().modify((q: Partial<Question>) => {
          if (q.templateId === undefined) q.templateId = null;
          if (q.notes === undefined) q.notes = '';
        });
      });
  }
}

export let db = new QuizmasterDB();

/** For tests: swap the database instance (e.g. to a fresh name). */
export function useDatabase(name: string) {
  db.close();
  db = new QuizmasterDB(name);
  return db;
}
