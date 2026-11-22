import type { Asset, GameType, Question } from '@/types/schema';
import { createQuestion } from '@/games/registry';
import { questionsRepo } from '@/db/repositories/questions';
import { templatesRepo } from '@/db/repositories/other';
import { questionFromTemplate } from '@/games/applyTemplate';
import { assetsRepo } from '@/db/repositories/assets';
import { useSettings } from '@/stores/settings';
import { ASPECTS } from '@/engines/scene/factories';
import { toast, errorMessage } from '@/components/ui/overlays';
import { useEditor } from '@/stores/editor';

/** Creates and persists a new question (optionally from a template) and returns it. */
export async function createAndSave(gameType: GameType, templateId?: string | null, overrides: Partial<Question> = {}): Promise<Question> {
  const s = useSettings.getState().settings;
  let q: Question;
  if (templateId) {
    const t = await templatesRepo.get(templateId);
    if (!t) throw new Error('Template not found');
    q = questionFromTemplate(t);
    await templatesRepo.markUsed(t.id);
  } else {
    q = createQuestion(gameType, { points: s.defaultPoints, timeLimit: s.defaultTimeLimit });
    const [w, h] = ASPECTS[s.defaultAspect];
    if (w !== q.scene.width) {
      const kx = w / q.scene.width;
      q.scene.width = w; q.scene.height = h;
      for (const l of q.scene.layers) { l.transform.x *= kx; l.transform.w *= kx; }
    }
  }
  return questionsRepo.create({ ...q, ...overrides });
}

/** Imports files into the media library, reporting results. */
export async function importFiles(files: FileList | File[], kind?: Asset['type']): Promise<Asset[]> {
  const out: Asset[] = [];
  for (const f of Array.from(files)) {
    try {
      const { asset, deduplicated } = await assetsRepo.importBlob(f, f.name);
      if (kind && asset.type !== kind) { toast.error(`${f.name} is not ${kind === 'image' ? 'an image' : 'an audio file'}`); continue; }
      out.push(asset);
      if (asset.type === 'image') void import('@/hooks/useAssetUrl').then((m) => m.ensureAssetThumb(asset.id));
      if (deduplicated) toast.info(`${f.name} already in library — reused existing asset`);
    } catch (e) {
      toast.error(`Could not import ${f.name}`, errorMessage(e));
    }
  }
  return out;
}

export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.click();
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function safeFilename(s: string) { return (s || 'untitled').replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'untitled'; }

export function editorUpdate(fn: (q: Question) => void, coalesce?: string) { useEditor.getState().update(fn, { coalesce }); }
