import { create } from 'zustand';
import type { Layer, Question } from '@/types/schema';

export type Tool = 'select' | 'hand' | 'text' | 'rect' | 'ellipse' | 'pen' | 'emoji';

type EditorState = {
  draft: Question | null;
  baseVersion: number;
  dirty: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
  saveError: string | null;
  lastSavedAt: number | null;
  past: Question[];
  future: Question[];
  coalesce: { key: string; at: number } | null;
  selection: string[];
  tool: Tool;
  previewAnswer: boolean;
  previewStep: number;
  ghostHidden: boolean;
  clipboard: Layer[];
  load: (q: Question) => void;
  unload: () => void;
  /** Applies a mutation to a cloned draft. `coalesce` merges rapid updates with the same key into one undo step. */
  update: (fn: (d: Question) => void, opts?: { coalesce?: string; history?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[]) => void;
  setTool: (t: Tool) => void;
  set: (p: Partial<EditorState>) => void;
  markSaved: (version: number) => void;
};

const HISTORY_LIMIT = 150;
const COALESCE_MS = 900;

export const useEditor = create<EditorState>((set, get) => ({
  draft: null,
  baseVersion: 0,
  dirty: false,
  saveState: 'idle',
  saveError: null,
  lastSavedAt: null,
  past: [],
  future: [],
  coalesce: null,
  selection: [],
  tool: 'select',
  previewAnswer: false,
  previewStep: Infinity,
  ghostHidden: true,
  clipboard: [],
  load: (q) => set({ draft: q, baseVersion: q.version, dirty: false, saveState: 'saved', saveError: null, past: [], future: [], coalesce: null, selection: [], previewAnswer: false, previewStep: Infinity, lastSavedAt: q.updatedAt }),
  unload: () => set({ draft: null, past: [], future: [], selection: [] }),
  update: (fn, opts = {}) => {
    const { draft, past, coalesce } = get();
    if (!draft) return;
    const next = structuredClone(draft);
    fn(next);
    const now = Date.now();
    const merge = opts.coalesce && coalesce && coalesce.key === opts.coalesce && now - coalesce.at < COALESCE_MS;
    const pushHistory = opts.history !== false && !merge;
    set({
      draft: next,
      dirty: true,
      past: pushHistory ? [...past.slice(-HISTORY_LIMIT + 1), draft] : past,
      future: opts.history === false ? get().future : [],
      coalesce: opts.coalesce ? { key: opts.coalesce, at: now } : null,
    });
  },
  undo: () => {
    const { past, draft, future } = get();
    if (!past.length || !draft) return;
    const prev = { ...past[past.length - 1], version: draft.version };
    const sel = get().selection.filter((id) => prev.scene.layers.some((l) => l.id === id));
    set({ draft: prev, past: past.slice(0, -1), future: [draft, ...future], dirty: true, coalesce: null, selection: sel });
  },
  redo: () => {
    const { past, draft, future } = get();
    if (!future.length || !draft) return;
    const next = { ...future[0], version: draft.version };
    set({ draft: next, future: future.slice(1), past: [...past, draft], dirty: true, coalesce: null });
  },
  select: (ids) => set({ selection: ids }),
  setTool: (tool) => set({ tool }),
  set: (p) => set(p),
  markSaved: (version) => {
    const d = get().draft;
    if (!d) return;
    set({ draft: { ...d, version }, baseVersion: version, lastSavedAt: Date.now() });
  },
}));

export function selectedLayers(): Layer[] {
  const { draft, selection } = useEditor.getState();
  return draft ? draft.scene.layers.filter((l) => selection.includes(l.id)) : [];
}
