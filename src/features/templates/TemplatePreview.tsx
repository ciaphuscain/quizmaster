import { useEffect, useRef } from 'react';
import type { Scene, Template } from '@/types/schema';
import { drawScene, prepareScene } from '@/engines/rendering/renderScene';

/** Small live canvas render of a scene (templates, round previews). */
export function ScenePreview({ scene, width = 160, answerRevealed = false, revealStep = Infinity, className }: { scene: Scene; width?: number; answerRevealed?: boolean; revealStep?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const state = { revealStep, answerRevealed };
    void prepareScene(scene, state).then((res) => {
      const c = ref.current;
      if (!alive || !c) return;
      const k = (width * (window.devicePixelRatio || 1)) / scene.width;
      c.width = Math.round(scene.width * k); c.height = Math.round(scene.height * k);
      const ctx = c.getContext('2d')!;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      drawScene(ctx, scene, res, state);
    });
    return () => { alive = false; };
  }, [scene, width, answerRevealed, revealStep]);
  return <canvas ref={ref} className={className ?? 'rounded border border-line'} style={{ width, height: (width * scene.height) / scene.width }} />;
}

export function TemplatePreview({ template, width }: { template: Template; width?: number }) {
  return <ScenePreview scene={template.scene} width={width} />;
}
