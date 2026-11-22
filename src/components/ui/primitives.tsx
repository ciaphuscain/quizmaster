import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/utils/misc';

type Variant = 'default' | 'primary' | 'ghost' | 'danger' | 'outline' | 'subtle';
type Size = 'sm' | 'md' | 'icon' | 'icon-sm' | 'lg';
const variants: Record<Variant, string> = {
  default: 'bg-panel-3 text-fg hover:bg-panel-3/70 border border-line',
  primary: 'bg-accent text-accent-fg hover:brightness-110 font-semibold',
  ghost: 'text-fg hover:bg-panel-3',
  danger: 'bg-danger/90 text-white hover:bg-danger',
  outline: 'border border-line text-fg hover:bg-panel-2',
  subtle: 'bg-panel-2 text-fg hover:bg-panel-3',
};
const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-8 px-3 text-[13px] gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
  icon: 'h-8 w-8 justify-center',
  'icon-sm': 'h-7 w-7 justify-center',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; active?: boolean; tooltip?: string };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = 'default', size = 'md', active, tooltip, ...p }, ref) => {
  const btn = (
    <button
      ref={ref}
      type="button"
      aria-label={p['aria-label'] ?? (size.startsWith('icon') ? tooltip : undefined)}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center rounded-md whitespace-nowrap transition-colors disabled:opacity-40 disabled:pointer-events-none select-none',
        variants[variant], sizes[size], active && 'bg-accent/20 text-accent ring-1 ring-accent/50', className,
      )}
      {...p}
    />
  );
  return tooltip ? <Tooltip content={tooltip}>{btn}</Tooltip> : btn;
});
Button.displayName = 'Button';

export function Tooltip({ content, children, side = 'bottom' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-[100] rounded-md bg-zinc-900 text-zinc-100 px-2 py-1 text-xs shadow-lg border border-zinc-700 max-w-xs">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn('h-8 w-full rounded-md border border-line bg-panel-2 px-2.5 text-[13px] text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none', className)} {...p} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn('w-full rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-[13px] text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none resize-y', className)} {...p} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn('h-8 w-full rounded-md border border-line bg-panel-2 px-2 text-[13px] text-fg focus:border-accent focus:outline-none', className)} {...p} />
));
Select.displayName = 'Select';

export function Label({ children, className, htmlFor }: { children: ReactNode; className?: string; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className={cn('text-[11px] font-medium uppercase tracking-wide text-muted', className)}>{children}</label>;
}

export function Field({ label, children, className, hint }: { label: string; children: ReactNode; className?: string; hint?: string }) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-[11px] font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-muted/80">{hint}</span>}
    </label>
  );
}

export function Badge({ children, color, className }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium bg-panel-3 text-fg', className)} style={color ? { background: `${color}26`, color } : undefined}>
      {children}
    </span>
  );
}

export function SliderField({ label, value, min, max, step, onChange, unit, onCommit, disabled }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; disabled?: boolean;
  onChange: (v: number) => void; onCommit?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>{label}</span>
        <input
          type="number" aria-label={`${label} value`} value={Number(value.toFixed(3))} min={min} max={max} step={step} disabled={disabled}
          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v))); }}
          onBlur={onCommit}
          className="w-16 rounded border border-line bg-panel-2 px-1 text-right text-[11px] text-fg"
        />
      </div>
      <div className="flex items-center gap-2">
        <input type="range" aria-label={label} className="w-full" min={min} max={max} step={step} value={value} disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))} onPointerUp={onCommit} onKeyUp={onCommit} />
        {unit && <span className="w-5 text-[11px] text-muted">{unit}</span>}
      </div>
    </div>
  );
}

export function ColorField({ label, value, onChange, allowTransparent }: { label: string; value: string; onChange: (v: string) => void; allowTransparent?: boolean }) {
  const isHex = /^#[0-9a-f]{6}$/i.test(value);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted">{label}</span>
      <div className="flex items-center gap-1.5">
        {allowTransparent && (
          <button type="button" className={cn('h-6 rounded border border-line px-1.5 text-[10px]', value === 'transparent' && 'border-accent text-accent')} onClick={() => onChange(value === 'transparent' ? '#ffffff' : 'transparent')}>
            None
          </button>
        )}
        <input type="text" aria-label={`${label} hex`} value={value} onChange={(e) => onChange(e.target.value)} className="h-6 w-20 rounded border border-line bg-panel-2 px-1 text-[11px] font-mono" />
        <input type="color" aria-label={label} value={isHex ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="h-6 w-7 cursor-pointer rounded border border-line bg-transparent p-0" />
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn('flex items-center justify-between gap-2 text-[12px] cursor-pointer', disabled && 'opacity-50')}>
      <span>{label}</span>
      <span className="relative inline-flex">
        <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span aria-hidden className="pointer-events-none h-4 w-7 rounded-full bg-panel-3 peer-checked:bg-accent transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent" />
        <span aria-hidden className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white transition-transform peer-checked:translate-x-3" />
      </span>
    </label>
  );
}

export function Section({ title, children, actions, defaultOpen = true }: { title: string; children: ReactNode; actions?: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b border-line">
      <summary className="flex cursor-pointer select-none items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-fg list-none">
        <span className="flex items-center gap-1"><span className="transition-transform group-open:rotate-90">›</span>{title}</span>
        <span onClick={(e) => e.preventDefault()}>{actions}</span>
      </summary>
      <div className="flex flex-col gap-3 px-3 pb-3">{children}</div>
    </details>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted">
      {icon}
      <div className="text-sm font-medium text-fg">{title}</div>
      {children && <div className="max-w-sm text-xs">{children}</div>}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-muted">{children}</kbd>;
}
