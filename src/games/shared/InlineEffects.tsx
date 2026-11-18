import { ArrowDown, ArrowUp, Trash2, Eye, EyeOff } from 'lucide-react';
import type { EffectType, ImageLayer } from '@/types/schema';
import { EFFECT_DEFS, EFFECT_ORDER } from '@/engines/image/effectDefs';
import { EFFECT_PRESETS } from '@/games/presets';
import { createEffect } from '@/engines/scene/factories';
import { Button, ColorField, Select, SliderField, Toggle } from '@/components/ui/primitives';
import { updateLayer } from '@/features/questions/layerOps';

/** Compact, fully functional effect-pipeline editor used inside game panels. */
export function InlineEffects({ layer }: { layer: ImageLayer }) {
  const set = (fn: (l: ImageLayer) => void, key?: string) => updateLayer<'image'>(layer.id, fn, key);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {EFFECT_PRESETS.map((p) => (
          <button key={p.id} onClick={(e) => set((l) => { l.effects = e.shiftKey ? [...l.effects, ...p.build()] : p.build(); })} title={`${p.description} — Shift-click to append`} className="rounded border border-line px-1.5 py-0.5 text-[11px] hover:border-accent" data-testid={`inline-preset-${p.id}`}>{p.name}</button>
        ))}
      </div>
      <Select aria-label="Add effect" value="" data-testid="add-effect" onChange={(e) => { const t = e.target.value as EffectType; if (t) set((l) => { l.effects.push(createEffect(t)); }); }}>
        <option value="">+ Add effect…</option>
        {EFFECT_ORDER.map((t) => <option key={t} value={t}>{EFFECT_DEFS[t].category} · {EFFECT_DEFS[t].label}</option>)}
      </Select>
      {layer.effects.length === 0 && <p className="text-[11px] text-muted">No effects yet. Choose a preset or add effects; they run top to bottom.</p>}
      {layer.effects.map((fx, i) => {
        const def = EFFECT_DEFS[fx.type];
        return (
          <div key={fx.id} className="rounded border border-line bg-panel-2 p-2" data-testid={`inline-fx-${fx.type}`}>
            <div className="mb-1 flex items-center gap-1 text-xs font-medium">
              <button aria-label={fx.enabled ? 'Disable effect' : 'Enable effect'} onClick={() => set((l) => { l.effects[i].enabled = !l.effects[i].enabled; })} className="text-muted">{fx.enabled ? <Eye size={12} /> : <EyeOff size={12} />}</button>
              <span className="flex-1">{i + 1}. {def.label}</span>
              <button aria-label="Move up" disabled={i === 0} className="text-muted disabled:opacity-30" onClick={() => set((l) => { [l.effects[i - 1], l.effects[i]] = [l.effects[i], l.effects[i - 1]]; })}><ArrowUp size={12} /></button>
              <button aria-label="Move down" disabled={i === layer.effects.length - 1} className="text-muted disabled:opacity-30" onClick={() => set((l) => { [l.effects[i + 1], l.effects[i]] = [l.effects[i], l.effects[i + 1]]; })}><ArrowDown size={12} /></button>
              <button aria-label="Reset effect" className="px-1 text-[10px] text-muted hover:text-fg" onClick={() => set((l) => { l.effects[i].params = createEffect(fx.type).params; })}>reset</button>
              <button aria-label="Remove effect" className="text-muted hover:text-danger" onClick={() => set((l) => { l.effects.splice(i, 1); })}><Trash2 size={12} /></button>
            </div>
            <div className="flex flex-col gap-1.5">
              {def.params.map((p) => {
                const v = fx.params[p.key];
                const upd = (val: number | string | boolean) => set((l) => { l.effects[i].params[p.key] = val; }, `ifx-${fx.id}-${p.key}`);
                if (p.type === 'number') return <SliderField key={p.key} label={p.label} value={typeof v === 'number' ? v : p.default} min={p.min} max={p.max} step={p.step} unit={p.unit} onChange={upd} />;
                if (p.type === 'color') return <ColorField key={p.key} label={p.label} value={String(v ?? p.default)} onChange={upd} />;
                if (p.type === 'boolean') return <Toggle key={p.key} label={p.label} checked={Boolean(v ?? p.default)} onChange={upd} />;
                return <Select key={p.key} aria-label={p.label} value={String(v ?? p.default)} onChange={(e) => upd(e.target.value)}>{p.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
              })}
              {def.maskRequired && !fx.mask?.ops.length && <p className="text-[11px] text-accent">Paint the area in Image Studio to apply this effect.</p>}
            </div>
          </div>
        );
      })}
      {layer.effects.length > 0 && <Button size="sm" variant="ghost" className="self-start text-danger" onClick={() => set((l) => { l.effects = []; })}>Reset all effects</Button>}
    </div>
  );
}
