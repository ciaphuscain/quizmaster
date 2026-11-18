import { useEditor } from '@/stores/editor';
import type { ContentOf, GameType, Layer, Question } from '@/types/schema';

export function useDraft(): Question { return useEditor((s) => s.draft) as Question; }

export function setContent<G extends GameType>(fn: (c: ContentOf<G>) => void, coalesce?: string) {
  useEditor.getState().update((d) => { fn(d.content as ContentOf<G>); }, { coalesce });
}
export function setQuestion(fn: (q: Question) => void, coalesce?: string) {
  useEditor.getState().update(fn, { coalesce });
}
export function firstLayer<K extends Layer['kind']>(q: Question, kind: K, name?: string): Extract<Layer, { kind: K }> | undefined {
  return q.scene.layers.find((l) => l.kind === kind && (!name || l.name === name)) as Extract<Layer, { kind: K }> | undefined;
}
