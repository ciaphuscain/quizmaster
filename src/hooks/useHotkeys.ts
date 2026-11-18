import { useEffect, useRef } from 'react';
import { isTypingTarget } from '@/utils/misc';

export type HotkeyMap = Record<string, (e: KeyboardEvent) => void>;

/** Normalizes an event to e.g. "mod+shift+z", "delete", "arrowleft", " ". */
export function keyCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('mod');
  if (e.shiftKey && e.key.length > 1) parts.push('shift');
  if (e.shiftKey && e.key.length === 1 && /[a-z]/i.test(e.key)) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase());
  return parts.join('+');
}

/** Global hotkeys that are ignored while typing in text inputs (except those in `allowInInputs`). */
export function useHotkeys(map: HotkeyMap, opts: { enabled?: boolean; allowInInputs?: string[] } = {}) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (opts.enabled === false) return;
    const h = (e: KeyboardEvent) => {
      const combo = keyCombo(e);
      const fn = ref.current[combo];
      if (!fn) return;
      if (isTypingTarget(e.target) && !opts.allowInInputs?.includes(combo)) return;
      e.preventDefault();
      fn(e);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [opts.enabled, opts.allowInInputs]);
}
