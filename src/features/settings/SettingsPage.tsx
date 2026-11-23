import { useState } from 'react';
import { PageHeader } from '@/app/AppLayout';
import { Button, Field, Input, Section, Select, SliderField, Toggle, Kbd } from '@/components/ui/primitives';
import { DEFAULT_SHORTCUTS, useSettings, type AiProvider, type ShortcutAction } from '@/stores/settings';
import { getProvider } from '@/features/ai-assistant/ai';
import { toast, errorMessage } from '@/components/ui/overlays';

const ACTION_LABEL: Record<ShortcutAction, string> = { nextAction: 'Next presentation action', nextQuestion: 'Next question', prevQuestion: 'Previous question', revealAnswer: 'Reveal answer', revealHint: 'Reveal hint', toggleTimer: 'Start / pause timer', fullscreen: 'Fullscreen', playAudio: 'Play / stop audio', leaderboard: 'Show / hide leaderboard' };

export default function SettingsPage() {
  const { settings: s, update } = useSettings();
  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  const [testing, setTesting] = useState(false);
  const testAi = async () => {
    const p = getProvider(); if (!p) return;
    setTesting(true);
    try { const r = await p.generate('Reply with the single word: ready', 'You are a connectivity test.'); toast.success('AI provider responded', r.slice(0, 120)); }
    catch (e) { toast.error('AI provider not reachable', errorMessage(e)); } finally { setTesting(false); }
  };
  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Settings" subtitle="Stored locally in this browser" />
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-2xl py-4">
          <Section title="Appearance & accessibility">
            <Field label="Theme"><Select value={s.theme} onChange={(e) => update({ theme: e.target.value as 'dark' | 'light' })}><option value="dark">Dark (charcoal)</option><option value="light">Light</option></Select></Field>
            <Toggle label="Reduce motion (also follows the OS setting)" checked={s.reducedMotion} onChange={(v) => update({ reducedMotion: v })} />
          </Section>
          <Section title="Editing">
            <SliderField label="Autosave delay (ms)" value={s.autosaveDelayMs} min={300} max={5000} step={100} onChange={(v) => update({ autosaveDelayMs: v })} />
            <Field label="Default canvas for new questions"><Select value={s.defaultAspect} onChange={(e) => update({ defaultAspect: e.target.value as typeof s.defaultAspect })}><option value="16:9">16:9 (1920×1080)</option><option value="4:3">4:3 (1440×1080)</option><option value="1:1">Square (1080×1080)</option></Select></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Default points"><Input type="number" min={0} value={s.defaultPoints} onChange={(e) => update({ defaultPoints: Math.max(0, Number(e.target.value) || 0) })} /></Field>
              <Field label="Default time limit (s)"><Input type="number" min={0} value={s.defaultTimeLimit} onChange={(e) => update({ defaultTimeLimit: Math.max(0, Number(e.target.value) || 0) })} /></Field>
            </div>
            <SliderField label="Grid size (px)" value={s.gridSize} min={10} max={200} step={5} onChange={(v) => update({ gridSize: v })} />
            <Toggle label="Snap to grid when grid is visible" checked={s.snapToGrid} onChange={(v) => update({ snapToGrid: v })} />
            <Toggle label="Show safe-area guides" checked={s.showSafeArea} onChange={(v) => update({ showSafeArea: v })} />
          </Section>
          <Section title="Presentation shortcuts">
            {(Object.keys(ACTION_LABEL) as ShortcutAction[]).map((a) => (
              <div key={a} className="flex items-center justify-between text-xs">
                <span>{ACTION_LABEL[a]}</span>
                <button className="rounded border border-line px-2 py-1 font-mono text-[11px] hover:border-accent" onClick={() => setCapturing(a)}
                  onKeyDown={(e) => { if (capturing !== a) return; e.preventDefault(); if (e.key === 'Escape') { setCapturing(null); return; } update({ shortcuts: { ...s.shortcuts, [a]: e.key.length === 1 ? e.key.toLowerCase() : e.key } }); setCapturing(null); }}>
                  {capturing === a ? 'Press a key…' : <Kbd>{s.shortcuts[a] === ' ' ? 'Space' : s.shortcuts[a]}</Kbd>}
                </button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => update({ shortcuts: DEFAULT_SHORTCUTS })}>Reset shortcuts</Button>
          </Section>
          <Section title="AI assistant (optional)">
            <p className="text-[11px] text-muted">Everything works without AI. Suggestions are always shown for review and never saved unless you accept them. No API keys are stored in the browser.</p>
            <Field label="Provider"><Select value={s.ai.provider} onChange={(e) => update({ ai: { ...s.ai, provider: e.target.value as AiProvider } })} data-testid="ai-provider">
              <option value="none">Disabled</option><option value="ollama">Ollama (local)</option><option value="claude-proxy">Claude via local proxy</option><option value="openai-compatible">Other local server (OpenAI-compatible API)</option>
            </Select></Field>
            {s.ai.provider === 'ollama' && <>
              <Field label="Ollama URL" hint="Start Ollama with OLLAMA_ORIGINS set to this app's origin so the browser may call it."><Input value={s.ai.ollamaUrl} onChange={(e) => update({ ai: { ...s.ai, ollamaUrl: e.target.value } })} /></Field>
              <Field label="Model"><Input value={s.ai.ollamaModel} onChange={(e) => update({ ai: { ...s.ai, ollamaModel: e.target.value } })} /></Field>
            </>}
            {s.ai.provider === 'claude-proxy' && <Field label="Proxy URL" hint="Run: ANTHROPIC_API_KEY=… npm run ai-proxy. The key stays in the proxy process on your machine."><Input value={s.ai.proxyUrl} onChange={(e) => update({ ai: { ...s.ai, proxyUrl: e.target.value } })} /></Field>}
            {s.ai.provider === 'openai-compatible' && <>
              <Field label="Base URL (e.g. LM Studio)"><Input value={s.ai.compatibleUrl} onChange={(e) => update({ ai: { ...s.ai, compatibleUrl: e.target.value } })} /></Field>
              <Field label="Model"><Input value={s.ai.compatibleModel} onChange={(e) => update({ ai: { ...s.ai, compatibleModel: e.target.value } })} /></Field>
            </>}
            {s.ai.provider !== 'none' && <Button size="sm" variant="outline" disabled={testing} onClick={testAi}>Test connection</Button>}
          </Section>
        </div>
      </div>
    </div>
  );
}
