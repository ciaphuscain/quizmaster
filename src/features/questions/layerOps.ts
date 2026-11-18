import type { Layer, Question } from '@/types/schema';
import { useEditor } from '@/stores/editor';
import { cloneLayer } from '@/engines/scene/factories';
import { uid } from '@/utils/id';

export function updateLayer<K extends Layer['kind']>(id: string, fn: (l: Extract<Layer, { kind: K }>) => void, coalesce?: string) {
  useEditor.getState().update((d) => {
    const l = d.scene.layers.find((x) => x.id === id);
    if (l) fn(l as Extract<Layer, { kind: K }>);
  }, { coalesce: coalesce ? `${coalesce}-${id}` : undefined });
}

export function addLayers(layers: Layer[], select = true) {
  useEditor.getState().update((d) => { d.scene.layers.push(...layers); });
  if (select) useEditor.getState().select(layers.map((l) => l.id));
}

export function deleteSelected() {
  const { selection, update, select } = useEditor.getState();
  if (!selection.length) return;
  update((d) => { d.scene.layers = d.scene.layers.filter((l) => !selection.includes(l.id) || l.locked); });
  select([]);
}

export function duplicateSelected() {
  const { selection, update, select, draft } = useEditor.getState();
  if (!draft || !selection.length) return;
  const copies = draft.scene.layers.filter((l) => selection.includes(l.id)).map((l) => cloneLayer(l, 30));
  const g = new Map<string, string>();
  for (const c of copies) if (c.groupId) { if (!g.has(c.groupId)) g.set(c.groupId, uid('g')); c.groupId = g.get(c.groupId); }
  update((d) => { d.scene.layers.push(...copies); });
  select(copies.map((c) => c.id));
}

export function copySelected() {
  const { selection, draft } = useEditor.getState();
  if (!draft) return;
  useEditor.setState({ clipboard: structuredClone(draft.scene.layers.filter((l) => selection.includes(l.id))) });
}
export function pasteClipboard() {
  const { clipboard } = useEditor.getState();
  if (!clipboard.length) return;
  addLayers(clipboard.map((l) => cloneLayer(l, 40)));
}

export function reorder(ids: string[], dir: 'up' | 'down' | 'top' | 'bottom') {
  useEditor.getState().update((d) => {
    const layers = d.scene.layers;
    if (dir === 'top' || dir === 'bottom') {
      const moving = layers.filter((l) => ids.includes(l.id));
      const rest = layers.filter((l) => !ids.includes(l.id));
      d.scene.layers = dir === 'top' ? [...rest, ...moving] : [...moving, ...rest];
      return;
    }
    const idxs = layers.map((l, i) => (ids.includes(l.id) ? i : -1)).filter((i) => i >= 0);
    if (dir === 'up') for (const i of idxs.reverse()) { if (i < layers.length - 1 && !ids.includes(layers[i + 1].id)) [layers[i], layers[i + 1]] = [layers[i + 1], layers[i]]; }
    else for (const i of idxs) { if (i > 0 && !ids.includes(layers[i - 1].id)) [layers[i], layers[i - 1]] = [layers[i - 1], layers[i]]; }
  });
}

export function moveLayerTo(id: string, toIndex: number) {
  useEditor.getState().update((d) => {
    const i = d.scene.layers.findIndex((l) => l.id === id);
    if (i < 0) return;
    const [l] = d.scene.layers.splice(i, 1);
    d.scene.layers.splice(Math.max(0, Math.min(toIndex, d.scene.layers.length)), 0, l);
  });
}

export function nudge(dx: number, dy: number) {
  const { selection } = useEditor.getState();
  useEditor.getState().update((d) => { for (const l of d.scene.layers) if (selection.includes(l.id) && !l.locked) { l.transform.x += dx; l.transform.y += dy; } }, { coalesce: 'nudge' });
}

export function groupSelected() {
  const { selection } = useEditor.getState();
  if (selection.length < 2) return;
  const g = uid('g');
  useEditor.getState().update((d) => { for (const l of d.scene.layers) if (selection.includes(l.id)) l.groupId = g; });
}
export function ungroupSelected() {
  const { selection } = useEditor.getState();
  useEditor.getState().update((d) => { for (const l of d.scene.layers) if (selection.includes(l.id)) delete l.groupId; });
}

export function alignSelected(mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
  const { selection } = useEditor.getState();
  useEditor.getState().update((d) => {
    const W = d.scene.width, H = d.scene.height;
    for (const l of d.scene.layers) {
      if (!selection.includes(l.id) || l.locked) continue;
      const t = l.transform;
      if (mode === 'left') t.x = 0; if (mode === 'right') t.x = W - t.w; if (mode === 'hcenter') t.x = Math.round((W - t.w) / 2);
      if (mode === 'top') t.y = 0; if (mode === 'bottom') t.y = H - t.h; if (mode === 'vcenter') t.y = Math.round((H - t.h) / 2);
    }
  });
}

export function setAspect(q: Question, w: number, h: number): void {
  const kx = w / q.scene.width, ky = h / q.scene.height;
  const k = Math.min(kx, ky);
  for (const l of q.scene.layers) {
    const cx = (l.transform.x + l.transform.w / 2) * kx, cy = (l.transform.y + l.transform.h / 2) * ky;
    l.transform.w = Math.round(l.transform.w * k); l.transform.h = Math.round(l.transform.h * k);
    l.transform.x = Math.round(cx - l.transform.w / 2); l.transform.y = Math.round(cy - l.transform.h / 2);
  }
  q.scene.width = w; q.scene.height = h;
}
