import { create } from 'zustand';
import { settingsRepo } from '@/db/repositories/other';

export type ShortcutAction = 'nextAction' | 'nextQuestion' | 'prevQuestion' | 'revealAnswer' | 'revealHint' | 'toggleTimer' | 'fullscreen' | 'playAudio';
export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  nextAction: ' ',
  nextQuestion: 'ArrowRight',
  prevQuestion: 'ArrowLeft',
  revealAnswer: 'a',
  revealHint: 'h',
  toggleTimer: 't',
  fullscreen: 'f',
  playAudio: 'p',
};

export type AiProvider = 'none' | 'ollama' | 'claude-proxy' | 'openai-compatible';
export type Settings = {
  theme: 'dark' | 'light';
  reducedMotion: boolean;
  autosaveDelayMs: number;
  defaultAspect: '16:9' | '4:3' | '1:1';
  defaultPoints: number;
  defaultTimeLimit: number;
  gridSize: number;
  snapToGrid: boolean;
  showSafeArea: boolean;
  shortcuts: Record<ShortcutAction, string>;
  ai: { provider: AiProvider; ollamaUrl: string; ollamaModel: string; proxyUrl: string; compatibleUrl: string; compatibleModel: string };
  lastBackupAt: number | null;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  reducedMotion: false,
  autosaveDelayMs: 800,
  defaultAspect: '16:9',
  defaultPoints: 10,
  defaultTimeLimit: 30,
  gridSize: 40,
  snapToGrid: true,
  showSafeArea: false,
  shortcuts: DEFAULT_SHORTCUTS,
  ai: { provider: 'none', ollamaUrl: 'http://localhost:11434', ollamaModel: 'llama3.1', proxyUrl: 'http://localhost:8787', compatibleUrl: 'http://localhost:1234/v1', compatibleModel: 'local-model' },
  lastBackupAt: null,
};

type S = { settings: Settings; loaded: boolean; load: () => Promise<void>; update: (p: Partial<Settings>) => void };

export const useSettings = create<S>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  load: async () => {
    const s = await settingsRepo.get<Partial<Settings>>('app', {});
    set({ settings: { ...DEFAULT_SETTINGS, ...s, shortcuts: { ...DEFAULT_SHORTCUTS, ...(s.shortcuts ?? {}) }, ai: { ...DEFAULT_SETTINGS.ai, ...(s.ai ?? {}) } }, loaded: true });
  },
  update: (p) => {
    const next = { ...get().settings, ...p };
    set({ settings: next });
    void settingsRepo.set('app', next);
  },
}));
