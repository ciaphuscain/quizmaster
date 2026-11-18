import { useCallback, useEffect, useRef } from 'react';
import { useEditor } from '@/stores/editor';
import { useSettings } from '@/stores/settings';
import { questionsRepo, ConflictError } from '@/db/repositories/questions';
import { renderSceneToCanvas, canvasToBlob } from '@/engines/rendering/renderScene';

const MAX_RETRIES = 3;

/** Debounced autosave with retry, conflict detection and thumbnail refresh. Returns a flush function. */
export function useAutosave() {
  const delay = useSettings((s) => s.settings.autosaveDelayMs);
  const draft = useEditor((s) => s.draft);
  const dirty = useEditor((s) => s.dirty);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const thumbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void> | null>(null);

  const saveNow = useCallback(async (reason?: string): Promise<void> => {
    if (saving.current) { await saving.current; }
    const st = useEditor.getState();
    if (!st.draft || (!st.dirty && !reason) || st.saveState === 'conflict') return;
    const snapshot = st.draft;
    const run = async () => {
      useEditor.setState({ saveState: 'saving', saveError: null });
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const saved = await questionsRepo.save(snapshot, { expectedVersion: useEditor.getState().baseVersion, revisionReason: reason });
          const cur = useEditor.getState();
          const changedMeanwhile = cur.draft !== snapshot;
          cur.markSaved(saved.version);
          useEditor.setState({ dirty: changedMeanwhile, saveState: 'saved' });
          scheduleThumb();
          return;
        } catch (e) {
          if (e instanceof ConflictError) { useEditor.setState({ saveState: 'conflict', saveError: e.message }); return; }
          if (attempt === MAX_RETRIES) { useEditor.setState({ saveState: 'error', saveError: (e as Error).message }); return; }
          await new Promise((r) => setTimeout(r, 300 * 2 ** attempt));
        }
      }
    };
    saving.current = run().finally(() => { saving.current = null; });
    await saving.current;
    if (useEditor.getState().dirty && useEditor.getState().saveState === 'saved') schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scheduleThumb = () => {
    if (thumbTimer.current) clearTimeout(thumbTimer.current);
    thumbTimer.current = setTimeout(async () => {
      const d = useEditor.getState().draft;
      if (!d) return;
      try {
        const c = await renderSceneToCanvas(d.scene, { revealStep: Infinity, answerRevealed: false }, 384);
        await questionsRepo.setThumbnail(d.id, await canvasToBlob(c, 'image/jpeg', 0.8));
      } catch { /* thumbnails are best effort */ }
    }, 1500);
  };

  const schedule = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveNow(), delay);
  };

  useEffect(() => {
    if (dirty) schedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, dirty, delay]);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) { void saveNow(); e.preventDefault(); }
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      if (timer.current) clearTimeout(timer.current);
      void saveNow();
    };
  }, [saveNow]);

  return saveNow;
}
