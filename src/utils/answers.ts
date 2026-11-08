/** Normalizes an answer for comparison: case, accents, punctuation, articles, whitespace. */
export function normalizeAnswer(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '')
    .replace(/\s+/g, ' ');
}

/** Returns true if `guess` matches the correct answer or one of the accepted alternatives. */
export function isAnswerAccepted(guess: string, correct: string, accepted: string[] = []): boolean {
  const g = normalizeAnswer(guess);
  if (!g) return false;
  return [correct, ...accepted].some((a) => normalizeAnswer(a) === g);
}

/** Deduplicates aliases by normalized form, removing ones equal to the correct answer. */
export function dedupeAliases(correct: string, aliases: string[]): string[] {
  const seen = new Set([normalizeAnswer(correct)]);
  const out: string[] = [];
  for (const a of aliases) {
    const n = normalizeAnswer(a);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(a.trim());
  }
  return out;
}
