import type { CountryLayer } from '@/types/schema';
import { PROJECTIONS } from '@/types/schema';
import { ColorField, Field, Select, SliderField, Toggle, Button } from '@/components/ui/primitives';
import { updateLayer } from '@/features/questions/layerOps';

const PROJ_LABEL: Record<string, string> = { equalEarth: 'Equal Earth (equal-area)', mercator: 'Mercator', naturalEarth: 'Natural Earth', orthographic: 'Orthographic (globe)', azimuthalEqualArea: 'Azimuthal equal-area', conicEqualArea: 'Conic equal-area' };

export function CountryStyleControls({ layer: l }: { layer: CountryLayer }) {
  const set = (fn: (x: CountryLayer) => void, key?: string) => updateLayer<'country'>(l.id, fn, key);
  if (l.display === 'flag') {
    return (
      <>
        <Field label="Flag shape"><Select value={l.flag.aspect} onChange={(e) => set((x) => { x.flag.aspect = e.target.value as '4x3' | '1x1'; })}><option value="4x3">4:3 rectangle</option><option value="1x1">Square</option></Select></Field>
        <Toggle label="Thin border" checked={l.flag.border} onChange={(v) => set((x) => { x.flag.border = v; })} />
      </>
    );
  }
  return (
    <>
      <Field label="Projection"><Select value={l.projection} onChange={(e) => set((x) => { x.projection = e.target.value as CountryLayer['projection']; })} data-testid="projection">
        {PROJECTIONS.map((p) => <option key={p} value={p}>{PROJ_LABEL[p]}</option>)}
      </Select></Field>
      <Field label="Disjoint parts / islands"><Select value={l.islands} onChange={(e) => set((x) => { x.islands = e.target.value as CountryLayer['islands']; })} data-testid="islands">
        <option value="all">Show all parts (incl. overseas)</option><option value="near">Nearby parts only</option><option value="mainland">Largest part only</option>
      </Select></Field>
      {l.display === 'outline' && <>
        <Toggle label="Filled silhouette" checked={l.filled} onChange={(v) => set((x) => { x.filled = v; })} />
        <ColorField label="Fill colour" value={l.fill} onChange={(v) => set((x) => { x.fill = v; }, 'cfill')} />
      </>}
      <ColorField label={l.display === 'neighbors' ? 'Border / accent colour' : 'Border colour'} value={l.stroke} onChange={(v) => set((x) => { x.stroke = v; }, 'cstroke')} />
      <SliderField label="Line thickness" value={l.strokeWidth} min={0} max={30} step={0.5} onChange={(v) => set((x) => { x.strokeWidth = v; }, 'csw')} />
      <SliderField label="Map rotation" value={l.mapRotation} min={-180} max={180} step={1} unit="°" onChange={(v) => set((x) => { x.mapRotation = v; }, 'crot')} />
      <SliderField label="Zoom" value={l.zoom} min={0.2} max={8} step={0.05} unit="×" onChange={(v) => set((x) => { x.zoom = v; }, 'czoom')} />
      <SliderField label="Pan X" value={l.panX} min={-1} max={1} step={0.01} onChange={(v) => set((x) => { x.panX = v; }, 'cpx')} />
      <SliderField label="Pan Y" value={l.panY} min={-1} max={1} step={0.01} onChange={(v) => set((x) => { x.panY = v; }, 'cpy')} />
      <Button size="sm" variant="outline" onClick={() => set((x) => { x.zoom = 1; x.panX = 0; x.panY = 0; x.mapRotation = 0; })}>Recenter</Button>
      {l.display === 'neighbors' && <>
        <ColorField label="Hidden country fill" value={l.neighbors.targetFill} onChange={(v) => set((x) => { x.neighbors.targetFill = v; }, 'ntf')} />
        <ColorField label="Neighbour fill" value={l.neighbors.neighborFill} onChange={(v) => set((x) => { x.neighbors.neighborFill = v; }, 'nnf')} />
        <ColorField label="Other countries" value={l.neighbors.otherFill} onChange={(v) => set((x) => { x.neighbors.otherFill = v; }, 'nof')} />
        <ColorField label="Sea / background" value={l.neighbors.sea} onChange={(v) => set((x) => { x.neighbors.sea = v; }, 'nsea')} />
        <ColorField label="Label colour" value={l.neighbors.labelColor} onChange={(v) => set((x) => { x.neighbors.labelColor = v; }, 'nlc')} />
        <Toggle label="Highlight neighbours" checked={l.neighbors.highlightNeighbors} onChange={(v) => set((x) => { x.neighbors.highlightNeighbors = v; })} />
        <Toggle label="Show neighbour labels" checked={l.neighbors.showLabels} onChange={(v) => set((x) => { x.neighbors.showLabels = v; })} />
        <Toggle label="Show other countries" checked={l.neighbors.showOthers} onChange={(v) => set((x) => { x.neighbors.showOthers = v; })} />
        <Toggle label="Name hidden country on reveal" checked={l.neighbors.revealTargetName} onChange={(v) => set((x) => { x.neighbors.revealTargetName = v; })} />
        <Toggle label="Label nearby countries (no-border cases)" checked={l.neighbors.showNearbyForIslands} onChange={(v) => set((x) => { x.neighbors.showNearbyForIslands = v; })} />
      </>}
    </>
  );
}
