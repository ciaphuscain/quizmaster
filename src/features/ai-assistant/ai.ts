import type { Question } from '@/types/schema';
import { useSettings, type Settings } from '@/stores/settings';
import { GAMES } from '@/games/registry';
import { docToPlainText } from '@/engines/scene/factories';

/** Provider abstraction. AI is optional: every feature works with provider 'none'. */
export interface AiProvider {
  id: string;
  generate(prompt: string, system: string, signal?: AbortSignal): Promise<string>;
}

class OllamaProvider implements AiProvider {
  id = 'ollama';
  constructor(private url: string, private model: string) {}
  async generate(prompt: string, system: string, signal?: AbortSignal) {
    const r = await fetch(`${this.url.replace(/\/$/, '')}/api/generate`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.model, prompt, system, stream: false }) });
    if (!r.ok) throw new Error(`Ollama error ${r.status}. Is Ollama running and is OLLAMA_ORIGINS set to allow this site?`);
    return ((await r.json()) as { response: string }).response;
  }
}
class ClaudeProxyProvider implements AiProvider {
  id = 'claude-proxy';
  constructor(private url: string) {}
  async generate(prompt: string, system: string, signal?: AbortSignal) {
    const r = await fetch(`${this.url.replace(/\/$/, '')}/generate`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, system }) });
    const j = (await r.json().catch(() => ({}))) as { text?: string; error?: string };
    if (!r.ok) throw new Error(j.error ?? `Proxy error ${r.status}. Start it with "npm run ai-proxy".`);
    return j.text ?? '';
  }
}
class OpenAiCompatibleProvider implements AiProvider {
  id = 'openai-compatible';
  constructor(private url: string, private model: string) {}
  async generate(prompt: string, system: string, signal?: AbortSignal) {
    const r = await fetch(`${this.url.replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.model, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }) });
    if (!r.ok) throw new Error(`Local server error ${r.status}`);
    const j = (await r.json()) as { choices: { message: { content: string } }[] };
    return j.choices[0]?.message.content ?? '';
  }
}

export function getProvider(s: Settings['ai'] = useSettings.getState().settings.ai): AiProvider | null {
  switch (s.provider) {
    case 'ollama': return new OllamaProvider(s.ollamaUrl, s.ollamaModel);
    case 'claude-proxy': return new ClaudeProxyProvider(s.proxyUrl);
    case 'openai-compatible': return new OpenAiCompatibleProvider(s.compatibleUrl, s.compatibleModel);
    default: return null;
  }
}

export type AiTask = 'aliases' | 'hints' | 'bad-plot' | 'perspective' | 'emojis' | 'search-history' | 'rewrite' | 'difficulty' | 'variations';

const SYSTEM = 'You help a quizmaster write quiz questions. Output ONLY the requested items, one per line, with no numbering, bullets, quotes or commentary. Never invent quotations and present them as real dialogue.';

function context(q: Question): string {
  const clues: string[] = [];
  for (const l of q.scene.layers) {
    if (l.kind === 'text') clues.push(docToPlainText(l.doc));
    if (l.kind === 'search') clues.push(...l.entries.map((e) => e.text));
    if (l.kind === 'emoji') clues.push(l.emoji);
  }
  return `Game: ${GAMES[q.gameType].name}\nAnswer: ${q.correctAnswer || '(not set)'}\nExisting clues: ${clues.filter(Boolean).join(' | ') || '(none)'}`;
}

export function buildPrompt(task: AiTask, q: Question, extra = ''): string {
  const c = context(q);
  switch (task) {
    case 'aliases': return `${c}\nList up to 6 alternative spellings, abbreviations or accepted alternative answers for "${q.correctAnswer}".`;
    case 'hints': return `${c}\nWrite 3 progressively more helpful hints that do not contain the answer. Hardest first.`;
    case 'bad-plot': return `${c}\nWrite 4 different "bad plot descriptions" of the movie "${q.correctAnswer}": technically accurate but ridiculously literal, misleading-but-fair, or comedic. Style: ${extra || 'mixed'}. One per line, 1-2 sentences each, never naming the title or characters.`;
    case 'perspective': return `${c}\nRetell the movie "${q.correctAnswer}" in first person from this perspective: ${extra || 'a minor character'}. Write 3 short clue paragraphs, vaguest first, one per line. Never name the movie.`;
    case 'emojis': return `${c}\nSuggest 4 different emoji sequences (3-6 emojis each, emojis only) that depict "${q.correctAnswer}". One sequence per line.`;
    case 'search-history': return `${c}\nWrite 8 fictional, funny search queries that a character from "${q.correctAnswer}" might type, in story order. Do not name the movie. One per line.`;
    case 'rewrite': return `${c}\nRewrite this clue in 3 different ways (${extra || 'funnier, vaguer, shorter'}):\n${extra ? '' : ''}`;
    case 'difficulty': return `${c}\nIn 2 short lines, estimate how hard this is for a general pub-quiz audience (easy/medium/hard/expert) and why.`;
    case 'variations': return `${c}\nSuggest 4 variations of this question idea (different movies/brands/countries of similar difficulty). One per line.`;
  }
}

export async function runAi(task: AiTask, q: Question, extra = '', signal?: AbortSignal): Promise<string[]> {
  const p = getProvider();
  if (!p) throw new Error('AI assistant is disabled. Configure a provider in Settings (optional).');
  const text = await p.generate(buildPrompt(task, q, extra), SYSTEM, signal);
  return parseLines(text);
}

export function parseLines(text: string): string[] {
  return text.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["“]|["”]$/g, '').trim()).filter((l) => l.length > 0).slice(0, 20);
}
