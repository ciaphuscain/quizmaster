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

/** Levenshtein edit distance (iterative, O(n·m) time, O(m) memory). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export type AnswerMatch = { verdict: 'exact' | 'close' | 'wrong'; matched: string | null; distance: number };

/**
 * Grades a guess against the correct answer and alternatives.
 * exact = equal after normalisation; close = small typo (≤1 edit for short answers, ≤2 for 8+ chars, ≤3 for 16+).
 */
export function matchAnswer(guess: string, correct: string, accepted: string[] = []): AnswerMatch {
  const g = normalizeAnswer(guess);
  if (!g) return { verdict: 'wrong', matched: null, distance: Infinity };
  let best: AnswerMatch = { verdict: 'wrong', matched: null, distance: Infinity };
  for (const cand of [correct, ...accepted]) {
    const c = normalizeAnswer(cand);
    if (!c) continue;
    if (c === g) return { verdict: 'exact', matched: cand, distance: 0 };
    const d = editDistance(g, c);
    const allowed = c.length >= 16 ? 3 : c.length >= 8 ? 2 : c.length >= 4 ? 1 : 0;
    if (d <= allowed && d < best.distance) best = { verdict: 'close', matched: cand, distance: d };
  }
  return best;
}
