import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Layer, Question, Transform } from '@/types/schema';
import { useEditor } from '@/stores/editor';
import { useSettings } from '@/stores/settings';
import { drawScene, prepareScene, type RenderState } from '@/engines/rendering/renderScene';
import { bbox, center, hitHandle, hitLayer, HANDLES, resizeTransform, rotationFromPointer, snapBox, fromLocal, type Guide, type Handle, type Pt } from './geometry';
import { shapeLayer, textLayer, transform, imageLayer } from '@/engines/scene/factories';
import { importFiles } from '@/features/questions/actions';

type Drag =
  | { kind: 'move'; start: Pt; originals: Map<string, Transform> }
  | { kind: 'resize'; id: string; handle: { hx: -1 | 0 | 1; hy: -1 | 0 | 1 }; t0: Transform }
  | { kind: 'rotate'; id: string; t0: Transform }
  | { kind: 'pan'; start: Pt; pan0: Pt }
  | { kind: 'create'; shape: 'rect' | 'ellipse'; start: Pt; id: string }
  | { kind: 'pen'; points: Pt[]; id: string };

export function expandGroup(layers: Layer[], ids: string[]): string[] {
  const groups = new Set(layers.filter((l) => ids.includes(l.id) && l.groupId).map((l) => l.groupId));
  return layers.filter((l) => ids.includes(l.id) || (l.groupId && groups.has(l.groupId))).map((l) => l.id);
}

export function CanvasStage() {
  const draft = useEditor((s) => s.draft) as Question;
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const previewAnswer = useEditor((s) => s.previewAnswer);
  const previewStep = useEditor((s) => s.previewStep);
  const ghostHidden = useEditor((s) => s.ghostHidden);
  const { snapToGrid, gridSize, showSafeArea } = useSettings((s) => s.settings);
  const [showGrid, setShowGrid] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 450 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const drag = useRef<Drag | null>(null);
  const spaceDown = useRef(false);
  const [hover, setHover] = useState<string | null>(null);

  const scene = draft.scene;
  const fit = Math.min((size.w - 48) / scene.width, (size.h - 48) / scene.height);
  const scale = Math.max(0.02, fit * zoom);
  const ox = (size.w - scene.width * scale) / 2 + pan.x;
  const oy = (size.h - scene.height * scale) / 2 + pan.y;
  const toScene = useCallback((e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left - ox) / scale, y: (e.clientY - r.top - oy) / scale };
  }, [ox, oy, scale]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // expose zoom controls
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<string>).detail;
      if (d === 'in') setZoom((z) => Math.min(8, z * 1.25));
      if (d === 'out') setZoom((z) => Math.max(0.1, z / 1.25));
      if (d === 'fit') { setZoom(1); setPan({ x: 0, y: 0 }); }
      if (d === '100') { setZoom(1 / fit); setPan({ x: 0, y: 0 }); }
      if (d === 'grid') setShowGrid((g) => !g);
    };
    window.addEventListener('qm-zoom', h);
    return () => window.removeEventListener('qm-zoom', h);
  }, [fit]);

  // render
  const renderId = useRef(0);
  useEffect(() => {
    const id = ++renderId.current;
    const state: RenderState = { revealStep: previewStep, answerRevealed: previewAnswer, ghostHidden };
    void prepareScene(scene, state).then((res) => {
      if (id !== renderId.current) return;
      const c = canvasRef.current;
      if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) { c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr); }
      const ctx = c.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.save();
      ctx.translate(ox, oy); ctx.scale(scale, scale);
      ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 30;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, scene.width, scene.height);
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, scene.width, scene.height); ctx.clip();
      drawScene(ctx, scene, res, state);
      ctx.restore();
      const px = 1 / scale;
      if (showGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = px;
        ctx.beginPath();
        for (let x = 0; x <= scene.width; x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, scene.height); }
        for (let y = 0; y <= scene.height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(scene.width, y); }
        ctx.stroke();
      }
      if (showSafeArea) {
        ctx.strokeStyle = 'rgba(56,189,248,0.6)'; ctx.setLineDash([8 * px, 6 * px]); ctx.lineWidth = px;
        ctx.strokeRect(scene.width * 0.05, scene.height * 0.05, scene.width * 0.9, scene.height * 0.9);
        ctx.strokeRect(scene.width * 0.1, scene.height * 0.1, scene.width * 0.8, scene.height * 0.8);
        ctx.setLineDash([]);
      }
      // hover outline
      const hl = hover && !selection.includes(hover) ? scene.layers.find((l) => l.id === hover) : null;
      if (hl) outline(ctx, hl.transform, px, 'rgba(245,158,11,0.5)');
      // selection
      const sel = scene.layers.filter((l) => selection.includes(l.id));
      for (const l of sel) {
        outline(ctx, l.transform, px, l.locked ? '#a1a1aa' : '#f59e0b');
        if (sel.length === 1 && !l.locked) {
          const t = l.transform;
          const top = fromLocal(t, { x: 0, y: -t.h / 2 }), rot = fromLocal(t, { x: 0, y: -t.h / 2 - 32 * px });
          ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = px; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(rot.x, rot.y); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(rot.x, rot.y, 6 * px, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          for (const h of HANDLES) {
            const p = fromLocal(t, { x: (h.hx * t.w) / 2, y: (h.hy * t.h) / 2 });
            ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 5 * px, p.y - 5 * px, 10 * px, 10 * px);
            ctx.strokeRect(p.x - 5 * px, p.y - 5 * px, 10 * px, 10 * px);
          }
        }
      }
      if (sel.length > 1) {
        const b = bbox(sel.map((l) => l.transform));
        ctx.strokeStyle = 'rgba(245,158,11,0.7)'; ctx.setLineDash([6 * px, 4 * px]); ctx.lineWidth = px; ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]);
      }
      ctx.strokeStyle = '#ec4899'; ctx.lineWidth = px;
      for (const g of guides) { ctx.beginPath(); if (g.axis === 'x') { ctx.moveTo(g.pos, -2000); ctx.lineTo(g.pos, scene.height + 2000); } else { ctx.moveTo(-4000, g.pos); ctx.lineTo(scene.width + 4000, g.pos); } ctx.stroke(); }
      ctx.restore();
    });
  }, [scene, selection, size, ox, oy, scale, previewAnswer, previewStep, ghostHidden, guides, showGrid, showSafeArea, gridSize, hover]);

  const update = useEditor.getState().update;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toScene(e);
    const st = useEditor.getState();
    if (tool === 'hand' || spaceDown.current || e.button === 1) { drag.current = { kind: 'pan', start: { x: e.clientX, y: e.clientY }, pan0: pan }; return; }
    if (tool === 'text') {
      const l = textLayer('Double-click to edit text', transform(p.x - 300, p.y - 60, 600, 120), { fontSize: 48 });
      update((d) => { d.scene.layers.push(l); });
      st.select([l.id]); st.setTool('select');
      return;
    }
    if (tool === 'rect' || tool === 'ellipse') {
      const l = shapeLayer(tool, transform(p.x, p.y, 1, 1));
      update((d) => { d.scene.layers.push(l); });
      st.select([l.id]);
      drag.current = { kind: 'create', shape: tool, start: p, id: l.id };
      return;
    }
    if (tool === 'pen') {
      const l = shapeLayer('path', transform(p.x, p.y, 1, 1), { stroke: '#f59e0b', strokeWidth: 8, fill: 'transparent', points: [] });
      update((d) => { d.scene.layers.push(l); });
      drag.current = { kind: 'pen', points: [p], id: l.id };
      return;
    }
    // select tool
    const single = st.selection.length === 1 ? scene.layers.find((l) => l.id === st.selection[0]) : null;
    if (single && !single.locked) {
      const h: Handle | null = hitHandle(single.transform, p, scale);
      if (h === 'rotate') { drag.current = { kind: 'rotate', id: single.id, t0: single.transform }; return; }
      if (h) { drag.current = { kind: 'resize', id: single.id, handle: h, t0: single.transform }; return; }
    }
    const hit = [...scene.layers].reverse().find((l) => l.visible && hitLayer(l, p, 2 / scale));
    if (!hit) { st.select([]); return; }
    let ids = st.selection;
    if (e.shiftKey) ids = ids.includes(hit.id) ? ids.filter((i) => i !== hit.id) : [...ids, hit.id];
    else if (!ids.includes(hit.id)) ids = [hit.id];
    ids = expandGroup(scene.layers, ids);
    st.select(ids);
    const movable = scene.layers.filter((l) => ids.includes(l.id) && !l.locked);
    if (movable.length) drag.current = { kind: 'move', start: p, originals: new Map(movable.map((l) => [l.id, l.transform])) };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toScene(e);
    const d = drag.current;
    if (!d) {
      if (tool === 'select') { const h = [...scene.layers].reverse().find((l) => l.visible && hitLayer(l, p)); setHover(h?.id ?? null); }
      return;
    }
    if (d.kind === 'pan') { setPan({ x: d.pan0.x + e.clientX - d.start.x, y: d.pan0.y + e.clientY - d.start.y }); return; }
    if (d.kind === 'move') {
      let dx = p.x - d.start.x, dy = p.y - d.start.y;
      const moved = [...d.originals.values()].map((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
      const b = bbox(moved);
      let g: Guide[] = [];
      if (!e.altKey) {
        const others = scene.layers.filter((l) => !d.originals.has(l.id) && l.visible);
        const tx = [0, scene.width / 2, scene.width, ...others.flatMap((l) => { const ob = bbox([l.transform]); return [ob.x, ob.x + ob.w / 2, ob.x + ob.w]; })];
        const ty = [0, scene.height / 2, scene.height, ...others.flatMap((l) => { const ob = bbox([l.transform]); return [ob.y, ob.y + ob.h / 2, ob.y + ob.h]; })];
        const s = snapBox(b, tx, ty, 8 / scale);
        if (s.guides.length) { dx += s.dx; dy += s.dy; g = s.guides; }
        else if (snapToGrid && showGrid) { dx += Math.round(b.x / gridSize) * gridSize - b.x; dy += Math.round(b.y / gridSize) * gridSize - b.y; }
      }
      setGuides(g);
      update((q) => { for (const l of q.scene.layers) { const t0 = d.originals.get(l.id); if (t0) l.transform = { ...t0, x: Math.round(t0.x + dx), y: Math.round(t0.y + dy) }; } }, { coalesce: 'drag-move' });
      return;
    }
    if (d.kind === 'resize') {
      const lay = scene.layers.find((l) => l.id === d.id);
      const keep = e.shiftKey !== (lay?.kind === 'emoji' || lay?.kind === 'image');
      const t = resizeTransform(d.t0, d.handle, p, keep);
      update((q) => { const l = q.scene.layers.find((x) => x.id === d.id); if (l) l.transform = roundT(t); }, { coalesce: 'drag-resize' });
      return;
    }
    if (d.kind === 'rotate') {
      const r = rotationFromPointer(d.t0, p, e.shiftKey);
      update((q) => { const l = q.scene.layers.find((x) => x.id === d.id); if (l) l.transform = { ...l.transform, rotation: r }; }, { coalesce: 'drag-rotate' });
      return;
    }
    if (d.kind === 'create') {
      const x0 = Math.min(d.start.x, p.x), y0 = Math.min(d.start.y, p.y);
      update((q) => { const l = q.scene.layers.find((x) => x.id === d.id); if (l) l.transform = roundT({ ...l.transform, x: x0, y: y0, w: Math.max(4, Math.abs(p.x - d.start.x)), h: Math.max(4, Math.abs(p.y - d.start.y)) }); }, { coalesce: 'drag-create' });
      return;
    }
    if (d.kind === 'pen') {
      d.points.push(p);
      const xs = d.points.map((q) => q.x), ys = d.points.map((q) => q.y);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(1, Math.max(...xs) - x0), h = Math.max(1, Math.max(...ys) - y0);
      update((q) => {
        const l = q.scene.layers.find((x) => x.id === d.id);
        if (l?.kind === 'shape') { l.transform = { ...l.transform, x: x0, y: y0, w, h }; l.points = d.points.flatMap((pt) => [(pt.x - x0) / w, (pt.y - y0) / h]); }
      }, { coalesce: 'drag-pen' });
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setGuides([]);
    useEditor.setState({ coalesce: null });
    if (d?.kind === 'create' || d?.kind === 'pen') { useEditor.getState().setTool('select'); if (d.kind === 'pen') useEditor.getState().select([d.id]); }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const r = canvasRef.current!.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const nz = Math.min(8, Math.max(0.1, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
      const k = nz / zoom;
      // keep point under cursor fixed
      const cx = size.w / 2, cy = size.h / 2;
      setPan({ x: (pan.x - (mx - cx)) * k + (mx - cx), y: (pan.y - (my - cy)) * k + (my - cy) });
      setZoom(nz);
    } else setPan({ x: pan.x - e.deltaX, y: pan.y - e.deltaY });
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable)) spaceDown.current = true; };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const p = toScene(e);
    const assetId = e.dataTransfer.getData('application/x-qm-asset');
    let ids: string[] = [];
    if (assetId) ids = [assetId];
    else if (e.dataTransfer.files.length) ids = (await importFiles(e.dataTransfer.files, 'image')).map((a) => a.id);
    if (!ids.length) return;
    const st = useEditor.getState();
    const target = [...scene.layers].reverse().find((l) => l.kind === 'image' && hitLayer(l, p));
    if (target && ids.length === 1) { st.update((q) => { const l = q.scene.layers.find((x) => x.id === target.id); if (l?.kind === 'image') l.assetId = ids[0]; }); st.select([target.id]); return; }
    const empty = scene.layers.find((l) => l.kind === 'image' && !l.assetId);
    if (empty && ids.length === 1) { st.update((q) => { const l = q.scene.layers.find((x) => x.id === empty.id); if (l?.kind === 'image') l.assetId = ids[0]; }); st.select([empty.id]); return; }
    const created = ids.map((id, i) => imageLayer(id, transform(p.x - 200 + i * 40, p.y - 200 + i * 40, 400, 400)));
    st.update((q) => { q.scene.layers.push(...created); });
    st.select(created.map((l) => l.id));
  };

  const cursor = tool === 'hand' ? 'grab' : tool === 'select' ? (hover ? 'move' : 'default') : 'crosshair';
  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-canvas" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <canvas ref={canvasRef} data-testid="editor-canvas" aria-label="Question canvas. Use the Layers panel and inspector for keyboard editing." role="img"
        style={{ width: size.w, height: size.h, cursor, touchAction: 'none' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}
        onDoubleClick={() => window.dispatchEvent(new CustomEvent('qm-focus-inspector'))} />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-0.5 text-[11px] text-white/80">{Math.round(scale * 100)}% · {scene.width}×{scene.height}</div>
    </div>
  );
}

function roundT(t: Transform): Transform { return { ...t, x: Math.round(t.x), y: Math.round(t.y), w: Math.round(t.w), h: Math.round(t.h) }; }

function outline(ctx: CanvasRenderingContext2D, t: Transform, px: number, color: string) {
  const c = center(t);
  ctx.save();
  ctx.translate(c.x, c.y); ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.strokeStyle = color; ctx.lineWidth = 1.5 * px;
  ctx.strokeRect(-t.w / 2, -t.h / 2, t.w, t.h);
  ctx.restore();
}
