import type { Question } from '@/types/schema';
import { collectAssetIds, docToPlainText } from '@/engines/scene/factories';
import { normalizeAnswer } from '@/utils/answers';
import { getCountry } from '@/engines/geography/countries';

export type Issue = { level: 'error' | 'warning'; message: string };

/** Static checks that catch broken or unfinished questions before they are presented. */
export function checkQuestion(q: Question, existingAssets: Set<string>): Issue[] {
  const out: Issue[] = [];
  const err = (message: string) => out.push({ level: 'error', message });
  const warn = (message: string) => out.push({ level: 'warning', message });
  if (!q.correctAnswer.trim()) err('No correct answer');
  for (const id of collectAssetIds(q.scene, q.audio?.assetId)) if (!existingAssets.has(id)) err('References media that no longer exists');
  const layers = q.scene.layers.filter((l) => l.visible);
  if (!layers.length) err('Slide is empty');
  for (const l of layers) {
    if (l.kind === 'image' && !l.assetId) err(`“${l.name}” has no image`);
    if (l.kind === 'country' && !l.iso3) err('No country selected');
    if (l.kind === 'country' && l.iso3 && l.display !== 'flag' && !getCountry(l.iso3)?.geometryId) err('Selected territory has no outline data');
    if (l.kind === 'search' && !l.entries.some((e) => e.text.trim())) err('Search history has no entries');
    if (l.kind === 'dialogue' && !l.lines.some((e) => e.text.trim())) err('No dialogue lines');
    if (l.kind === 'text' && !l.answerOnly && q.correctAnswer.trim().length > 3 && normalizeAnswer(docToPlainText(l.doc)).includes(normalizeAnswer(q.correctAnswer)) && l.name !== 'Country name')
      err(`“${l.name}” gives away the answer`);
    if (l.kind === 'image' && !l.answerOnly && l.revealStep === 0 && !l.effects.some((e) => e.enabled) && !l.silhouette?.enabled && q.gameType === 'logo-altered') warn('Altered logo has no active effects');
  }
  if (q.gameType === 'movie-emojis' && !q.scene.layers.some((l) => l.kind === 'emoji')) err('No emoji clues');
  if (q.gameType === 'song-backwards') {
    if (!q.audio) err('No audio clip');
    else if (!q.audio.ops.some((o) => o.enabled && o.type === 'reverse')) warn('Audio is not reversed');
  }
  if (q.gameType === 'movie-dialogue' && q.content.gameType === 'movie-dialogue' && !q.content.sourceNotes.trim()) warn('Quote source not recorded (verify the exact wording)');
  if (!q.hints.length) warn('No hints');
  if (!q.timeLimit) warn('No time limit (round default applies)');
  return out;
}

/** Quiz-level checks: duplicate answers across the quiz. */
export function checkQuiz(questions: Question[]): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>();
  const seen = new Map<string, string>();
  for (const q of questions) {
    const k = `${q.gameType}:${normalizeAnswer(q.correctAnswer)}`;
    if (q.correctAnswer.trim() && seen.has(k) && seen.get(k) !== q.id) out.set(q.id, [{ level: 'warning', message: `Same answer as another question in this quiz (${q.correctAnswer})` }]);
    seen.set(k, q.id);
  }
  return out;
}
