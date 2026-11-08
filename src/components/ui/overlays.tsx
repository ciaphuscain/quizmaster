import { useEffect, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { create } from 'zustand';
import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { Button, Input } from './primitives';
import { cn } from '@/utils/misc';

export function Dialog({ open, onOpenChange, title, description, children, footer, wide }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children?: ReactNode; footer?: ReactNode; wide?: boolean | 'xl';
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <DialogPrimitive.Content
          className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[95vw] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-panel shadow-2xl',
            wide === 'xl' ? 'max-w-6xl' : wide ? 'max-w-3xl' : 'max-w-md')}
          aria-describedby={description ? undefined : undefined}
        >
          <div className="flex items-start justify-between border-b border-line px-4 py-3">
            <div>
              <DialogPrimitive.Title className="text-sm font-semibold">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="mt-0.5 text-xs text-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close asChild><Button variant="ghost" size="icon-sm" aria-label="Close"><X size={14} /></Button></DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ---------------------------------- toasts ---------------------------------- */
type Toast = { id: number; kind: 'success' | 'error' | 'info'; message: string; detail?: string };
type ToastState = { toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; dismiss: (id: number) => void };
let tid = 0;
export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = ++tid;
    set((s) => ({ toasts: [...s.toasts.slice(-4), { ...t, id }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), t.kind === 'error' ? 9000 : 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));
export const toast = {
  success: (message: string, detail?: string) => useToasts.getState().push({ kind: 'success', message, detail }),
  error: (message: string, detail?: string) => useToasts.getState().push({ kind: 'error', message, detail }),
  info: (message: string, detail?: string) => useToasts.getState().push({ kind: 'info', message, detail }),
};
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-80 flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto flex gap-2 rounded-md border border-line bg-panel p-3 shadow-xl reveal-in">
          {t.kind === 'success' ? <CheckCircle2 size={16} className="text-success shrink-0" /> : t.kind === 'error' ? <AlertTriangle size={16} className="text-danger shrink-0" /> : <Info size={16} className="text-accent shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="text-[13px]">{t.message}</div>
            {t.detail && <div className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted">{t.detail}</div>}
          </div>
          <button className="text-muted hover:text-fg" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ confirm / prompt ----------------------------- */
type Ask = { kind: 'confirm' | 'prompt'; title: string; message?: string; confirmLabel?: string; danger?: boolean; defaultValue?: string; resolve: (v: string | boolean | null) => void };
const useAsk = create<{ ask: Ask | null; set: (a: Ask | null) => void }>((set) => ({ ask: null, set: (ask) => set({ ask }) }));

export function confirmDialog(opts: { title: string; message?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => useAsk.getState().set({ kind: 'confirm', ...opts, resolve: (v) => resolve(!!v) }));
}
export function promptDialog(opts: { title: string; message?: string; defaultValue?: string; confirmLabel?: string }): Promise<string | null> {
  return new Promise((resolve) => useAsk.getState().set({ kind: 'prompt', ...opts, resolve: (v) => resolve(typeof v === 'string' ? v : null) }));
}

export function AskHost() {
  const { ask, set } = useAsk();
  const [value, setValue] = useState('');
  useEffect(() => { if (ask?.kind === 'prompt') setValue(ask.defaultValue ?? ''); }, [ask]);
  if (!ask) return null;
  const close = (v: string | boolean | null) => { ask.resolve(v); set(null); };
  return (
    <Dialog open onOpenChange={(o) => !o && close(ask.kind === 'confirm' ? false : null)} title={ask.title} description={ask.message}
      footer={<>
        <Button variant="ghost" onClick={() => close(ask.kind === 'confirm' ? false : null)}>Cancel</Button>
        <Button variant={ask.danger ? 'danger' : 'primary'} onClick={() => close(ask.kind === 'confirm' ? true : value.trim())} disabled={ask.kind === 'prompt' && !value.trim()} data-testid="confirm-ok">
          {ask.confirmLabel ?? 'OK'}
        </Button>
      </>}>
      {ask.kind === 'prompt' ? (
        <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) close(value.trim()); }}>
          <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label={ask.title} />
        </form>
      ) : null}
    </Dialog>
  );
}
