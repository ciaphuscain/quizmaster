import { Field, Input, Section, Button } from '@/components/ui/primitives';
import { AudioStudio } from '@/features/audio-editor/AudioStudio';
import { setQuestion, useDraft } from '../shared/hooks';
import { BUILTIN_TEMPLATES } from '../builtinTemplates';
import { uid } from '@/utils/id';
import { dedupeAliases } from '@/utils/answers';

export function SongPanel() {
  const q = useDraft();
  if (q.content.gameType !== 'song-backwards') return null;
  const c = q.content;
  const setSong = (title: string, artist: string) => setQuestion((d) => {
    if (d.content.gameType !== 'song-backwards') return;
    d.content.songTitle = title; d.content.artist = artist;
    d.correctAnswer = title;
    const auto = artist ? [`${title} by ${artist}`, `${artist} - ${title}`] : [];
    d.acceptedAnswers = dedupeAliases(title, [...d.acceptedAnswers.filter((a) => !/ by | - /.test(a)), ...auto]);
    if (!d.title || d.title.startsWith('Song: ')) d.title = `Song: ${title}${artist ? ` — ${artist}` : ''}`;
  }, 'song');
  const audioTemplates = BUILTIN_TEMPLATES.filter((t) => t.gameType === 'song-backwards' && t.audioOps);
  return (
    <>
      <Section title="Song">
        <Field label="Song title (correct answer)"><Input value={c.songTitle} data-testid="song-title" onChange={(e) => setSong(e.target.value, c.artist)} placeholder="e.g. Bohemian Rhapsody" /></Field>
        <Field label="Artist"><Input value={c.artist} data-testid="song-artist" onChange={(e) => setSong(c.songTitle, e.target.value)} placeholder="e.g. Queen" /></Field>
      </Section>
      <Section title="Audio editor">
        <AudioStudio clip={q.audio} title={c.songTitle || 'song'} onChange={(clip) => setQuestion((d) => { d.audio = clip; })} />
        {q.audio && (
          <div className="flex flex-wrap gap-1">
            <span className="text-[11px] text-muted">Quick recipes (replace operations):</span>
            {audioTemplates.map((t) => (
              <Button key={t.id} size="sm" variant="ghost" onClick={() => setQuestion((d) => { if (d.audio) d.audio.ops = t.audioOps!.map((o) => ({ ...structuredClone(o), id: uid('ao') })); })}>{t.name}</Button>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted">Reversal decodes the file to PCM and reverses samples per channel at the original sample rate. Exports are WAV (no MP3 encoder is bundled).</p>
      </Section>
    </>
  );
}
