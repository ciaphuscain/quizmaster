import type { CountryLayer, Question } from '@/types/schema';
import { Section, Toggle, Badge } from '@/components/ui/primitives';
import { CountryPicker, StatusBadge } from '../shared/CountryPicker';
import { CountryStyleControls } from '../shared/CountryStyleControls';
import { countryAliases, countryStatus, getCountry, getLandNeighbors, nearbyCountries, type CountryMeta } from '@/engines/geography/countries';
import { firstLayer, setQuestion, useDraft } from '../shared/hooks';
import { textLayer, transform } from '@/engines/scene/factories';
import { BackgroundPresets } from './ImagePanels';
import { dedupeAliases } from '@/utils/answers';

/** Selecting a country updates the map/flag layer, content, answer and aliases together (one undo step). */
function chooseCountry(c: CountryMeta) {
  setQuestion((q: Question) => {
    for (const l of q.scene.layers) if (l.kind === 'country') l.iso3 = c.iso3;
    if ('iso3' in q.content) (q.content as { iso3: string | null }).iso3 = c.iso3;
    q.correctAnswer = c.name;
    q.acceptedAnswers = dedupeAliases(c.name, countryAliases(c));
    if (!q.title || q.title.startsWith('Country: ')) q.title = `Country: ${c.name}`;
    // keep any answer-only name label in sync
    for (const l of q.scene.layers) if (l.kind === 'text' && l.name === 'Country name') l.doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: c.name }] }] };
  });
}

function ScopeNote({ c }: { c: CountryMeta }) {
  const s = countryStatus(c);
  return (
    <div className="rounded bg-panel-2 p-2 text-[11px] text-muted">
      <div className="flex items-center gap-1 text-fg"><span className="text-base">{c.emoji}</span><b>{c.name}</b><StatusBadge c={c} /></div>
      <div>{c.official} · {c.region}{c.subregion ? ` / ${c.subregion}` : ''}{c.capital.length ? ` · Capital: ${c.capital.join(', ')}` : ''}</div>
      {s === 'dependent' && <div className="mt-1">Dependent territory (not independent). Check your quiz rules before using it as a "country".</div>}
      {s === 'disputed' && <div className="mt-1 text-amber-400">Sovereignty is disputed; recognition varies between states.</div>}
      {!c.geometryId && <div className="mt-1 text-amber-400">No separate outline in the Natural Earth 1:50m dataset (part of another country's geometry or too small).</div>}
    </div>
  );
}

export function CountryFlagPanel() {
  const q = useDraft();
  const layer = firstLayer(q, 'country');
  if (q.content.gameType !== 'country-flag') return null;
  const c = getCountry(q.content.iso3);
  const nameLayer = q.scene.layers.find((l) => l.kind === 'text' && l.name === 'Country name');
  const setShowName = (show: boolean) => setQuestion((d) => {
    d.scene.layers = d.scene.layers.filter((l) => !(l.kind === 'text' && l.name === 'Country name'));
    if (d.content.gameType === 'country-flag') d.content.hideName = !show;
    if (show && c) { const t = textLayer(c.name, transform(360, 970, 1200, 90), { fontSize: 56, bold: true }, 'Country name'); t.answerOnly = true; d.scene.layers.push(t); }
  });
  return (
    <>
      <Section title="Country">
        <CountryPicker value={q.content.iso3} onChange={chooseCountry} />
        {c && <ScopeNote c={c} />}
        <Toggle label="Show country name under flag after answer reveal" checked={!!nameLayer} onChange={setShowName} />
        <p className="text-[11px] text-muted">The name is never shown to the audience before the answer is revealed.</p>
      </Section>
      {layer && <Section title="Flag display"><CountryStyleControls layer={layer} /><FlagSizes layer={layer} /></Section>}
      <Section title="Background"><BackgroundPresets /></Section>
      <p className="px-3 pb-3 text-[11px] text-muted">Flags: flag-icons (MIT licence), bundled for offline use.</p>
    </>
  );
}

function FlagSizes({ layer }: { layer: CountryLayer }) {
  const sizes = [['Small', 600], ['Medium', 1000], ['Large', 1400], ['Full', 1760]] as const;
  return (
    <div className="flex gap-1">
      {sizes.map(([label, w]) => (
        <button key={label} className="rounded border border-line px-1.5 py-0.5 text-[11px] hover:border-accent" onClick={() => setQuestion((d) => {
          const l = d.scene.layers.find((x) => x.id === layer.id); if (!l) return;
          const h = Math.round(w * 0.75); l.transform = { ...l.transform, w, h: Math.min(h, d.scene.height - 220), x: Math.round((d.scene.width - w) / 2), y: 180 };
        })}>{label}</button>
      ))}
    </div>
  );
}

export function CountryBorderPanel() {
  const q = useDraft();
  const layer = firstLayer(q, 'country');
  if (q.content.gameType !== 'country-border') return null;
  const c = getCountry(q.content.iso3);
  return (
    <>
      <Section title="Country">
        <CountryPicker value={q.content.iso3} onChange={chooseCountry} requireGeometry />
        {c && <ScopeNote c={c} />}
      </Section>
      {layer && <Section title="Outline style"><CountryStyleControls layer={layer} /></Section>}
      <Section title="Background"><BackgroundPresets /></Section>
      <p className="px-3 pb-3 text-[11px] text-muted">Geometry: Natural Earth 1:50m (public domain) via world-atlas. Shapes keep true proportions under the selected projection; equal-area projections avoid Mercator's size distortion.</p>
    </>
  );
}

export function CountryNeighborsPanel() {
  const q = useDraft();
  const layer = firstLayer(q, 'country');
  if (q.content.gameType !== 'country-neighbors') return null;
  const c = getCountry(q.content.iso3);
  const neighbors = c ? getLandNeighbors(c.iso3) : [];
  const nearby = c && !neighbors.length ? nearbyCountries(c.iso3, 4) : [];
  return (
    <>
      <Section title="Hidden country">
        <CountryPicker value={q.content.iso3} onChange={chooseCountry} requireGeometry />
        {c && <ScopeNote c={c} />}
      </Section>
      {c && (
        <Section title={`Land neighbours (${neighbors.length})`}>
          {neighbors.length ? (
            <div className="flex flex-wrap gap-1" data-testid="neighbor-list">
              {neighbors.map((n) => <Badge key={n.iso3}>{n.emoji} {n.name}{!n.geometryId ? ' (no outline)' : ''}</Badge>)}
            </div>
          ) : (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px]" data-testid="no-neighbors">
              <b>{c.name} has no land borders</b> ({c.landlocked ? 'landlocked' : 'island or maritime-only'}). The map zooms out to show its region; nearby countries are labelled "(nearby)" and are not neighbours: {nearby.map((n) => n.name).join(', ')}.
            </div>
          )}
          {layer && neighbors.length > layer.neighbors.maxNeighbors && <p className="text-[11px] text-muted">Showing {layer.neighbors.maxNeighbors} of {neighbors.length} neighbours.</p>}
          {layer && neighbors.length > 1 && (
            <label className="flex items-center justify-between text-[11px] text-muted">Neighbours to show
              <input type="number" min={0} max={neighbors.length} value={Math.min(layer.neighbors.maxNeighbors, neighbors.length)} className="w-16 rounded border border-line bg-panel-2 px-1 text-fg"
                onChange={(e) => setQuestion((d) => { const l = d.scene.layers.find((x) => x.id === layer.id); if (l?.kind === 'country') l.neighbors.maxNeighbors = Math.max(0, Number(e.target.value) || 0); })} />
            </label>
          )}
          <p className="text-[11px] text-muted">Source: land-border adjacency from the mledoze/countries dataset (ODbL), validated for symmetry; maritime-only boundaries are excluded.</p>
        </Section>
      )}
      {layer && <Section title="Map style"><CountryStyleControls layer={layer} /></Section>}
    </>
  );
}
