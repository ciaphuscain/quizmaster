import { useDraft } from '../shared/hooks';
import { LogoAlteredPanel, LogoNormalPanel, SilhouettePanel } from './ImagePanels';
import { CountryBorderPanel, CountryFlagPanel, CountryNeighborsPanel } from './CountryPanels';
import { BadPlotPanel, DialoguePanel, EmojisPanel, PerspectivePanel, PropsPanel, SearchHistoryPanel } from './MoviePanels';
import { SongPanel } from './SongPanel';
import { Section } from '@/components/ui/primitives';
import { AudioStudio } from '@/features/audio-editor/AudioStudio';
import { setQuestion } from '../shared/hooks';

export function GamePanel({ onOpenImageStudio }: { onOpenImageStudio: (id: string) => void }) {
  const q = useDraft();
  switch (q.gameType) {
    case 'logo-normal': return <LogoNormalPanel />;
    case 'logo-altered': return <LogoAlteredPanel onOpenImageStudio={onOpenImageStudio} />;
    case 'country-flag': return <CountryFlagPanel />;
    case 'country-border': return <CountryBorderPanel />;
    case 'country-neighbors': return <CountryNeighborsPanel />;
    case 'silhouette': return <SilhouettePanel onOpenImageStudio={onOpenImageStudio} />;
    case 'movie-emojis': return <EmojisPanel />;
    case 'movie-bad-plot': return <BadPlotPanel />;
    case 'movie-dialogue': return <><DialoguePanel /><Section title="Optional voice / audio clip" defaultOpen={!!q.audio}><AudioStudio clip={q.audio} title="dialogue" onChange={(clip) => setQuestion((d) => { d.audio = clip; })} /></Section></>;
    case 'movie-props': return <PropsPanel onOpenImageStudio={onOpenImageStudio} />;
    case 'movie-search-history': return <SearchHistoryPanel />;
    case 'movie-perspective': return <PerspectivePanel />;
    case 'song-backwards': return <SongPanel />;
  }
}
